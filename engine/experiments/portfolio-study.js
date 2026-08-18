// Backlog experiment (Adam's #3): does combining systems create steadiness?
// The income goal wants low drawdown + consistency, which is exactly what
// diversification is supposed to buy — IF you have multiple positive-expectancy,
// uncorrelated return streams.
//
// Honest scope: you can only claim diversification benefit from CONTEMPORANEOUS
// returns. Our real stock data (2010-2018) and the simulator are different
// worlds, so we CANNOT honestly blend real-stocks with sim-arb for a variance
// benefit. What we CAN test on real, same-period data: spreading the one
// positive real strategy (golden cross) across the 4 indices at once.
//
// Compares, on 2010-2018 daily data:
//   - golden cross (SMA 50/200 long) on each index alone
//   - equal-weight blend across all 4 indices
//   - buy-and-hold blend across all 4 (the benchmark to beat)
//
// Usage: node engine/experiments/portfolio-study.js

import fs from "node:fs";
import zlib from "node:zlib";
import { sma } from "../lib/indicators.js";

const COST = 0.0006; // 6 bps round trip

const data = JSON.parse(zlib.gunzipSync(fs.readFileSync("data/real/stocks-daily-w0.json.gz")).toString());
const symbols = Object.keys(data.symbols);

// Golden-cross daily equity curve (long-only, fully invested when long).
function goldenCurve(bars) {
  const closes = bars.map((b) => b.close);
  const eq = [1]; let inPos = false, entry = 0, cash = 1;
  for (let i = 0; i < closes.length; i++) {
    const f = sma(closes.slice(0, i + 1), 50), s = sma(closes.slice(0, i + 1), 200);
    const fp = sma(closes.slice(0, i), 50), sp = sma(closes.slice(0, i), 200);
    if (f != null && s != null && fp != null && sp != null) {
      if (!inPos && fp <= sp && f > s) { inPos = true; entry = closes[i]; cash *= (1 - COST); }
      else if (inPos && fp >= sp && f < s) { inPos = false; cash *= closes[i] / entry * (1 - COST); }
    }
    eq.push(inPos ? cash * closes[i] / entry : cash);
  }
  return eq;
}

function holdCurve(bars) {
  const c = bars.map((b) => b.close);
  return c.map((x) => x / c[0]);
}

function stats(curve) {
  const total = (curve.at(-1) / curve[0] - 1) * 100;
  const years = curve.length / 252;
  const cagr = (Math.pow(curve.at(-1) / curve[0], 1 / years) - 1) * 100;
  let peak = -Infinity, mdd = 0;
  for (const v of curve) { peak = Math.max(peak, v); mdd = Math.max(mdd, (peak - v) / peak); }
  // fraction of months (21-day blocks) that finished up
  let up = 0, n = 0;
  for (let i = 21; i < curve.length; i += 21) { n++; if (curve[i] > curve[i - 21]) up++; }
  return { total, cagr, mddPct: mdd * 100, monthsUpPct: n ? (100 * up) / n : NaN };
}

function blend(curves) {
  const len = Math.min(...curves.map((c) => c.length));
  const out = [];
  for (let i = 0; i < len; i++) out.push(curves.reduce((a, c) => a + c[i] / c[0], 0) / curves.length);
  return out;
}

console.log(`[portfolio-study] golden cross vs buy-and-hold, 2010-2018 daily, ${symbols.length} indices\n`);

const gcCurves = {}, bhCurves = {};
console.log("Single index — golden cross (GC) vs buy & hold (BH):");
for (const s of symbols) {
  const gc = goldenCurve(data.symbols[s]); gcCurves[s] = gc;
  const bh = holdCurve(data.symbols[s]); bhCurves[s] = bh;
  const g = stats(gc), b = stats(bh);
  console.log(`  ${s}:  GC ${g.cagr.toFixed(1)}%/yr, maxDD ${g.mddPct.toFixed(0)}%, months-up ${g.monthsUpPct.toFixed(0)}%   |   BH ${b.cagr.toFixed(1)}%/yr, maxDD ${b.mddPct.toFixed(0)}%, months-up ${b.monthsUpPct.toFixed(0)}%`);
}

const gcBlend = stats(blend(Object.values(gcCurves)));
const bhBlend = stats(blend(Object.values(bhCurves)));
console.log("\nEqual-weight blend across all 4 indices:");
console.log(`  Golden cross blend:  ${gcBlend.cagr.toFixed(1)}%/yr, maxDD ${gcBlend.mddPct.toFixed(1)}%, months-up ${gcBlend.monthsUpPct.toFixed(0)}%`);
console.log(`  Buy & hold blend:    ${bhBlend.cagr.toFixed(1)}%/yr, maxDD ${bhBlend.mddPct.toFixed(1)}%, months-up ${bhBlend.monthsUpPct.toFixed(0)}%`);
console.log(`\nIncome bar: ≥1%/mo (~12.7%/yr), maxDD ≤8%, ≥80% months positive.`);
