// Research lab: the continuous test-and-iterate harness.
//
//   npm run lab                    evaluate every strategy across seeds ($500 each)
//   npm run lab -- --tune <name>   also random-search that strategy's params and
//                                  keep them if they beat the current baseline
//   npm run lab -- --tune auto     tune whichever strategy is next in rotation
//
// Each run appends to lab/history.jsonl and rewrites lab/REPORT.md. Both are
// committed to git, so results persist across ephemeral sessions and the
// report doubles as the experiment log.

import fs from "node:fs";
import path from "node:path";
import { runBacktest } from "./backtest.js";
import { STRATEGIES, loadTunedParams, saveTunedParams } from "./strategies/index.js";
import { parseArgs } from "./cli-args.js";

const CASH = 500;               // simulated bankroll per strategy
const EVAL_SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 99];
const TUNE_SEEDS = [1, 3, 8, 21, 55, 99];
const BARS = 6000;

const EXPERIMENTS = [
  { market: "stocks", strategy: "sma-crossover" },
  { market: "stocks", strategy: "rsi-mean-reversion" },
  { market: "prediction", strategy: "extreme-fade" },
  { market: "prediction-arb", strategy: "venue-arb" },
];

// Search space per strategy: [values...] sampled uniformly.
const SPACES = {
  "sma-crossover": {
    fast: [5, 7, 9, 12, 15],
    slow: [18, 21, 26, 34, 50],
  },
  "rsi-mean-reversion": {
    rsiPeriod: [7, 10, 14, 21],
    oversold: [20, 25, 30, 35],
    recovered: [50, 55, 60, 70],
    stopLossPct: [0.8, 1.2, 1.8, 2.5],
    takeProfitPct: [1.5, 2.0, 3.0, 4.0],
  },
  "extreme-fade": {
    trend: [10, 15, 20, 30, 40],
    minJump: [0.04, 0.05, 0.06, 0.08],
    minStretch: [0.05, 0.08, 0.1, 0.12],
    stopDist: [0.05, 0.08, 0.1, 0.15],
  },
  "venue-arb": {
    entrySpread: [0.03, 0.04, 0.05, 0.06],
    exitSpread: [0.005, 0.01, 0.015, 0.02],
    stopSpread: [0.08, 0.12, 0.16, 0.2],
  },
};

async function evaluate(market, strategy, params, seeds, extra = {}) {
  const runs = [];
  for (const seed of seeds) {
    const state = await runBacktest({ market, strategy, params, bars: BARS, cash: CASH, seed, quiet: true, noWrite: true, ...extra });
    runs.push(state.stats);
  }
  const rets = runs.map((r) => r.totalReturnPct).sort((a, b) => a - b);
  const dds = runs.map((r) => r.maxDrawdownPct).sort((a, b) => a - b);
  const median = (xs) => xs[Math.floor(xs.length / 2)];
  return {
    seeds: seeds.length,
    medianReturnPct: median(rets),
    meanReturnPct: rets.reduce((a, b) => a + b, 0) / rets.length,
    worstReturnPct: rets[0],
    bestReturnPct: rets.at(-1),
    medianDrawdownPct: median(dds),
    totalTrades: runs.reduce((a, r) => a + r.trades, 0),
    meanWinRate: runs.reduce((a, r) => a + r.winRate, 0) / runs.length,
    // Robustness score: reward the median, punish tail risk and drawdown.
    score: median(rets) + 0.5 * rets[0] - 0.25 * median(dds),
  };
}

function sampleParams(space, rng) {
  const out = {};
  for (const [k, vals] of Object.entries(space)) out[k] = vals[Math.floor(rng() * vals.length)];
  return out;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function tune(strategyName, historyLen) {
  const exp = EXPERIMENTS.find((e) => e.strategy === strategyName);
  const space = SPACES[strategyName];
  if (!exp || !space) throw new Error(`No tuning space for "${strategyName}"`);

  const tunedAll = loadTunedParams();
  const current = tunedAll[strategyName] ?? {};
  const baseline = await evaluate(exp.market, strategyName, current, TUNE_SEEDS);
  console.log(`[tune] ${strategyName} baseline score ${baseline.score.toFixed(2)} (median ${baseline.medianReturnPct.toFixed(2)}%, worst ${baseline.worstReturnPct.toFixed(2)}%)`);

  const rng = mulberry32(historyLen * 7919 + 17); // new candidates each cycle, reproducible per cycle
  let best = { params: current, result: baseline };
  const seen = new Set([JSON.stringify(current)]);

  for (let i = 0; i < 12; i++) {
    const candidate = sampleParams(space, rng);
    if (candidate.fast != null && candidate.slow != null && candidate.fast >= candidate.slow) continue;
    if (candidate.oversold != null && candidate.recovered != null && candidate.oversold >= candidate.recovered) continue;
    if (candidate.entrySpread != null && candidate.exitSpread != null && candidate.exitSpread >= candidate.entrySpread) continue;
    const key = JSON.stringify(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await evaluate(exp.market, strategyName, candidate, TUNE_SEEDS);
    const mark = result.score > best.result.score ? " *" : "";
    console.log(`[tune]   ${key} → score ${result.score.toFixed(2)}${mark}`);
    if (result.score > best.result.score) best = { params: candidate, result };
  }

  // Require a real margin before overwriting params: guards against noise.
  if (best.result.score > baseline.score + 0.15) {
    tunedAll[strategyName] = best.params;
    saveTunedParams(tunedAll);
    console.log(`[tune] ${strategyName} improved ${baseline.score.toFixed(2)} → ${best.result.score.toFixed(2)}; params saved`);
    return { strategy: strategyName, improved: true, from: baseline.score, to: best.result.score, params: best.params };
  }
  console.log(`[tune] ${strategyName}: no candidate beat baseline by enough; keeping current params`);
  return { strategy: strategyName, improved: false, from: baseline.score, to: best.result.score };
}

// ── Real-data validation ──
// Every lab run also evaluates on REAL historical data committed under
// data/real/ (see engine/data/ingest-real.js for provenance):
//   stocks-real:     1-min S&P 500 / DAX / Nikkei / EuroStoxx windows, 2012-2018
//   prediction-real: Polymarket Yes prices at ~25-min native cadence
// Windows play the role of seeds. Params may differ from sim (the prediction
// cadence is 25x coarser), but the simulator is never adjusted to match sim
// results — real numbers are reported as they land.
const REAL_EXPERIMENTS = [
  // 15-min resample + 20/60 L/S: least-bad known config (cycle-2 finding —
  // breakeven, not an edge; 1-min bled −3.4% median).
  { market: "stocks-real", strategy: "sma-crossover", params: { fast: 20, slow: 60, allowShort: true }, resample: 15 },
  { market: "stocks-real", strategy: "rsi-mean-reversion", params: { mode: "momentum", allowShort: true, rsiPeriod: 21, breakout: 60, fade: 48, stopLossPct: 2.5, takeProfitPct: 8 } },
  // cycle-7: on UNBIASED liquid windows (prediction-fair-real) net of measured
  // 0.1c cost, the fade nets ~0% on 7-18 trades total — no bettable edge.
  { market: "prediction-fair-real", strategy: "extreme-fade", params: { trend: 6, minJump: 0.05, minStretch: 0.04 } },
];
const REAL_WINDOWS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export async function evaluateRealData() {
  const out = [];
  for (const exp of REAL_EXPERIMENTS) {
    const r = await evaluate(exp.market, exp.strategy, exp.params, REAL_WINDOWS, { bars: 4320, resample: exp.resample });
    out.push({ ...exp, ...r });
  }
  return out;
}

// ── Goal evaluation ──
// /goal: turn $500 into $1500 per system within 72 simulated trading hours.
// Judged on median final equity across seeds using the aggressive profiles in
// engine/goal-profiles.json (separate from the conservative default configs).
const GOAL_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "goal-profiles.json");

// Goal v2 ("sustainable"): median monthly return >= monthlyTargetPct AND
// median max drawdown <= maxDrawdownPct, per system, measured over ~1 month
// (real 30-day windows where real data exists, 43200 sim bars otherwise).
// stretch flag marks systems clearing stretchTargetPct.
export async function evaluateGoal() {
  const goal = JSON.parse(fs.readFileSync(GOAL_PATH, "utf8"));
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const out = [];
  for (const [strategy, prof] of Object.entries(goal.profiles)) {
    const rets = [], dds = [];
    for (const seed of prof.seeds) {
      const st = await runBacktest({
        market: prof.market, strategy, params: prof.params, risk: prof.risk,
        margin: prof.margin, symbols: prof.symbols, resample: prof.resample,
        bars: prof.bars, cash: goal.cash, seed, quiet: true, noWrite: true,
      });
      rets.push(st.stats.totalReturnPct);
      dds.push(st.stats.maxDrawdownPct);
    }
    const medRet = median(rets), medDD = median(dds);
    out.push({
      strategy, market: prof.market, kind: prof.kind,
      medianMonthlyPct: medRet, worstMonthlyPct: Math.min(...rets), bestMonthlyPct: Math.max(...rets),
      medianDrawdownPct: medDD, worstDrawdownPct: Math.max(...dds),
      pass: medRet >= goal.monthlyTargetPct && medDD <= goal.maxDrawdownPct,
      stretch: medRet >= goal.stretchTargetPct && medDD <= goal.maxDrawdownPct,
    });
  }
  return {
    mode: goal.mode, cash: goal.cash,
    monthlyTargetPct: goal.monthlyTargetPct, stretchTargetPct: goal.stretchTargetPct, maxDrawdownPct: goal.maxDrawdownPct,
    results: out, allPass: out.every((r) => r.pass),
  };
}

function writeReport(history) {
  const latest = history.at(-1);
  const lines = [
    "# Lab Report",
    "",
    `_Last run: ${latest.ts} · $${CASH} simulated bankroll per strategy · ${EVAL_SEEDS.length} seeds × ${BARS} one-minute bars each._`,
    "",
    "## Current performance",
    "",
    "| Strategy | Market | Median return | Worst seed | Best seed | Median DD | Win rate | Trades | Score |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of latest.results) {
    lines.push(`| ${r.strategy} | ${r.market} | ${r.medianReturnPct.toFixed(2)}% | ${r.worstReturnPct.toFixed(2)}% | ${r.bestReturnPct.toFixed(2)}% | ${r.medianDrawdownPct.toFixed(2)}% | ${r.meanWinRate.toFixed(1)}% | ${r.totalTrades} | ${r.score.toFixed(2)} |`);
  }
  if (latest.real) {
    lines.push("", "## Real-data validation", "");
    lines.push("_Real historical data committed under `data/real/`: 1-min index bars (S&P 500, DAX, Nikkei, EuroStoxx; 2012-2018 windows) and Polymarket Yes prices at native ~25-min cadence. Windows play the role of seeds. These numbers are reported as they land — the simulator is never adjusted to make them look better._", "");
    lines.push("| Strategy | Market | Median return | Worst window | Best window | Win rate | Trades |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const r of latest.real) {
      lines.push(`| ${r.strategy} | ${r.market} | ${r.medianReturnPct.toFixed(2)}% | ${r.worstReturnPct.toFixed(2)}% | ${r.bestReturnPct.toFixed(2)}% | ${r.meanWinRate.toFixed(1)}% | ${r.totalTrades} |`);
    }
  }
  if (latest.goal) {
    const g = latest.goal;
    lines.push("", `## Goal: ${g.monthlyTargetPct}%+/month (stretch ${g.stretchTargetPct}%+) with max drawdown ≤ ${g.maxDrawdownPct}% — ${g.allPass ? "✅ ALL SYSTEMS PASS" : "❌ NOT YET"}`, "");
    lines.push(`_$${g.cash} per system, measured over ~1 month per run. "real" = real historical windows; "sim" = simulator only (no real data available at the cadence needed). Pass needs the return target AND the drawdown cap together._`, "");
    lines.push("| Strategy | Data | Median monthly | Worst | Best | Median DD | Worst DD | Status |");
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const r of g.results) {
      const status = r.stretch ? "🚀 stretch" : r.pass ? "✅ pass" : "❌";
      lines.push(`| ${r.strategy} | ${r.kind} | ${r.medianMonthlyPct.toFixed(2)}% | ${r.worstMonthlyPct.toFixed(2)}% | ${r.bestMonthlyPct.toFixed(2)}% | ${r.medianDrawdownPct.toFixed(1)}% | ${r.worstDrawdownPct.toFixed(1)}% | ${status} |`);
    }
    lines.push("", "_The old 3x-in-72-hours goal was retired 2026-08-16: it required ruin-level risk settings. Push returns higher only while the drawdown cap holds._");
  }
  lines.push("", "## Tuned parameters", "", "```json", JSON.stringify(loadTunedParams(), null, 2), "```", "");
  lines.push("## Score history (median-return robustness score per run)", "");
  lines.push("| Run | Time | " + EXPERIMENTS.map((e) => e.strategy).join(" | ") + " | Tuned |");
  lines.push("|---|---|" + EXPERIMENTS.map(() => "---").join("|") + "|---|");
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    const cells = EXPERIMENTS.map((e) => {
      const r = h.results.find((x) => x.strategy === e.strategy);
      return r ? r.score.toFixed(2) : "—";
    });
    const tuned = h.tuned ? `${h.tuned.strategy}${h.tuned.improved ? " ✓" : ""}` : "—";
    lines.push(`| ${i + 1} | ${h.ts.slice(5, 16).replace("T", " ")} | ${cells.join(" | ")} | ${tuned} |`);
  }
  lines.push("", "_All results are simulated paper trading. A score that only improves on simulated data may not transfer to live markets._", "");
  fs.writeFileSync(path.join("lab", "REPORT.md"), lines.join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync("lab", { recursive: true });
  const histPath = path.join("lab", "history.jsonl");
  const history = fs.existsSync(histPath)
    ? fs.readFileSync(histPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];

  let tuned = null;
  if (args.tune) {
    const name = args.tune === "auto" || args.tune === true
      ? EXPERIMENTS[history.length % EXPERIMENTS.length].strategy
      : args.tune;
    tuned = await tune(name, history.length);
  }

  console.log(`\n[lab] evaluating all strategies: $${CASH} each, ${EVAL_SEEDS.length} seeds × ${BARS} bars`);
  const results = [];
  for (const exp of EXPERIMENTS) {
    const r = await evaluate(exp.market, exp.strategy, undefined, EVAL_SEEDS);
    results.push({ ...exp, ...r });
    console.log(`[lab] ${exp.strategy.padEnd(20)} median ${r.medianReturnPct.toFixed(2).padStart(7)}%  worst ${r.worstReturnPct.toFixed(2).padStart(7)}%  score ${r.score.toFixed(2)}`);
  }

  console.log(`\n[lab] real-data validation (10 historical windows each)`);
  const real = await evaluateRealData();
  for (const r of real) {
    console.log(`[lab] ${r.strategy.padEnd(20)} ${r.market.padEnd(16)} median ${r.medianReturnPct.toFixed(2).padStart(7)}%  worst ${r.worstReturnPct.toFixed(2).padStart(7)}%  trades ${r.totalTrades}`);
  }

  console.log(`\n[lab] goal check: ${""}3%+/month (stretch 5%+), max drawdown ≤ 15%, ~1 month per run`);
  const goal = await evaluateGoal();
  for (const r of goal.results) {
    const status = r.stretch ? "🚀" : r.pass ? "✅" : "❌";
    console.log(`[lab] ${r.strategy.padEnd(20)} (${r.kind})  monthly ${r.medianMonthlyPct.toFixed(2).padStart(7)}%  dd ${r.medianDrawdownPct.toFixed(1).padStart(5)}%  ${status}`);
  }
  console.log(`[lab] goal status: ${goal.allPass ? "✅ ALL SYSTEMS PASS" : "❌ not yet"}`);

  const record = { ts: new Date().toISOString(), cash: CASH, bars: BARS, results, tuned, real, goal };
  fs.appendFileSync(histPath, JSON.stringify(record) + "\n");
  history.push(record);
  writeReport(history);
  console.log(`\n[lab] run #${history.length} recorded → lab/REPORT.md`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
