// Backtest runner: replays historical (or simulated) bars through the engine.
// Usage:
//   npm run backtest -- --market stocks --strategy sma-crossover --bars 5000
//   npm run backtest -- --market prediction --strategy extreme-fade --bars 5000 --seed 7

import fs from "node:fs";
import path from "node:path";
import { Engine } from "./core.js";
import { Portfolio } from "./lib/portfolio.js";
import { RiskManager } from "./lib/risk.js";
import { getStrategy, STRATEGIES } from "./strategies/index.js";
import { SimulatedAdapter } from "./adapters/simulated.js";
import { parseArgs, pickDefaultStrategy } from "./cli-args.js";

export async function runBacktest(opts) {
  const {
    market = "stocks",
    strategy: strategyName = pickDefaultStrategy(market),
    bars = 5000,
    cash = 25000,
    seed = 42,
    quiet = false,
  } = opts;

  const strategy = getStrategy(strategyName, opts.params);
  const adapter = new SimulatedAdapter({ market, seed });
  await adapter.connect();

  const portfolio = new Portfolio(cash);
  const risk = new RiskManager(opts.risk);
  const engine = new Engine({ adapter, strategy, portfolio, risk, log: quiet ? () => {} : console.log });

  const series = {};
  for (const s of adapter.symbols) series[s] = await adapter.history(s, bars);

  for (let i = 0; i < bars; i++) {
    const tick = {};
    for (const s of adapter.symbols) tick[s] = series[s][i];
    await engine.onTick(tick);
  }

  // Close anything still open at the end so stats reflect completed trades.
  for (const symbol of portfolio.openSymbols) {
    await engine.executeExit(symbol, engine.lastPrices[symbol], series[adapter.symbols[0]].at(-1).time, "end-of-backtest");
  }

  const stats = portfolio.stats();
  if (!quiet) {
    console.log("\n── Backtest results ──────────────────────────");
    console.log(`  market/strategy   ${market} / ${strategyName}`);
    console.log(`  symbols           ${adapter.symbols.join(", ")}`);
    console.log(`  bars              ${bars} (1-min)`);
    console.log(`  starting cash     $${stats.startingCash.toLocaleString()}`);
    console.log(`  final equity      $${stats.finalEquity.toFixed(2)}`);
    console.log(`  return            ${stats.totalReturnPct.toFixed(2)}%`);
    console.log(`  trades            ${stats.trades}  (win rate ${stats.winRate.toFixed(1)}%)`);
    console.log(`  profit factor     ${stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}`);
    console.log(`  avg win / loss    $${stats.avgWin.toFixed(2)} / $${stats.avgLoss.toFixed(2)}`);
    console.log(`  max drawdown      ${stats.maxDrawdownPct.toFixed(2)}%`);
  }

  const state = engine.state();
  if (!opts.noWrite) {
    const outPath = path.join(process.cwd(), "data", "state.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(state, null, 2));
    if (!quiet) console.log(`\nState written to data/state.json — run \`npm run dev\` to view the dashboard.`);
  }
  return state;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Strategies: ${Object.keys(STRATEGIES).join(", ")}`);
    console.log("Flags: --market stocks|prediction --strategy <name> --bars N --cash N --seed N");
    process.exit(0);
  }
  runBacktest(args).catch((e) => { console.error(e.message); process.exit(1); });
}
