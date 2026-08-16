// Assumption test #3 (arbitrage): "cross-venue convergence profits survive
// execution friction." Real cross-venue tick data isn't reachable from this
// sandbox, so this stresses the SIMULATED arb under progressively worse
// execution: higher slippage, and order rejections that leave one leg naked.
// The question is where the edge dies, not how good the best case looks.
//
// Usage: node engine/experiments/arb-stress.js

import { Engine } from "../core.js";
import { Portfolio } from "../lib/portfolio.js";
import { RiskManager } from "../lib/risk.js";
import { getStrategy } from "../strategies/index.js";
import { SimulatedAdapter } from "../adapters/simulated.js";

const SEEDS = [1, 3, 8, 21, 55, 99];
const BARS = 4320;

async function run(seed, { slippage, failRate }) {
  const adapter = new SimulatedAdapter({ market: "prediction-arb", seed, slippage, failRate });
  const strategy = getStrategy("venue-arb");
  const portfolio = new Portfolio(500, { margin: 2 });
  const risk = new RiskManager({ riskPerTradePct: 15, maxPositionPct: 100, maxPositions: 8, dailyLossLimitPct: 30 });
  const engine = new Engine({ adapter, strategy, portfolio, risk, log: () => {} });
  await adapter.connect();
  const series = {};
  for (const s of adapter.symbols) series[s] = await adapter.history(s, BARS);
  for (let i = 0; i < BARS; i++) {
    const tick = {};
    for (const s of adapter.symbols) tick[s] = series[s][i];
    await engine.onTick(tick);
  }
  for (const sym of portfolio.openSymbols) {
    await engine.executeExit(sym, engine.lastPrices[sym], Date.UTC(2026, 0, 9), "end");
  }
  return portfolio.stats().totalReturnPct;
}

const GRID = [
  { label: "baseline (0.5c slip, all fills)", slippage: 0.005, failRate: 0 },
  { label: "1c slip", slippage: 0.01, failRate: 0 },
  { label: "2c slip", slippage: 0.02, failRate: 0 },
  { label: "0.5c slip + 5% rejected legs", slippage: 0.005, failRate: 0.05 },
  { label: "0.5c slip + 15% rejected legs", slippage: 0.005, failRate: 0.15 },
  { label: "1c slip + 10% rejected legs", slippage: 0.01, failRate: 0.1 },
];

console.log(`[arb-stress] venue-arb, $500, ${BARS} bars, ${SEEDS.length} seeds per cell\n`);
for (const cell of GRID) {
  const rets = [];
  for (const seed of SEEDS) rets.push(await run(seed, cell));
  rets.sort((a, b) => a - b);
  const median = rets[Math.floor(rets.length / 2)];
  console.log(`  ${cell.label.padEnd(34)} median ${median >= 0 ? "+" : ""}${median.toFixed(2)}%  worst ${rets[0].toFixed(2)}%  best ${rets.at(-1).toFixed(2)}%`);
}
console.log("\nRejected legs leave the other side naked until the engine's normal exits fire — that's the real risk of arb, and why live arb needs atomic or immediately-hedged execution.");
