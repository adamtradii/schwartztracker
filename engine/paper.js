// Paper-trading loop: polls the adapter once per interval, feeds bars through
// the engine, and serves live state at http://localhost:8787/api/state for the
// dashboard.
//
// Usage:
//   npm run paper                                       (simulated stock feed, no keys)
//   npm run paper -- --market prediction                (simulated prediction feed)
//   npm run paper -- --adapter alpaca                   (Alpaca paper account)
//   npm run paper -- --adapter kalshi                   (Kalshi demo account)
//   npm run paper -- --adapter alpaca --symbols AAPL,MSFT --strategy rsi-mean-reversion

import http from "node:http";
import { Engine } from "./core.js";
import { Portfolio } from "./lib/portfolio.js";
import { RiskManager } from "./lib/risk.js";
import { getStrategy } from "./strategies/index.js";
import { SimulatedAdapter } from "./adapters/simulated.js";
import { AlpacaAdapter } from "./adapters/alpaca.js";
import { KalshiAdapter } from "./adapters/kalshi.js";
import { parseArgs, pickDefaultStrategy } from "./cli-args.js";

const PORT = 8787;

function buildAdapter(args) {
  const intervalMs = args.interval ? args.interval * 1000 : 60_000;
  switch (args.adapter ?? "simulated") {
    case "alpaca": return new AlpacaAdapter({ symbols: args.symbols, intervalMs });
    case "kalshi": return new KalshiAdapter({ symbols: args.symbols, intervalMs });
    case "simulated":
      return new SimulatedAdapter({
        market: args.market ?? "stocks",
        symbols: args.symbols,
        intervalMs: args.interval ? args.interval * 1000 : 2_000, // sim runs fast by default
        seed: args.seed ?? Math.floor(Math.random() * 1e6),
      });
    default: throw new Error(`Unknown adapter "${args.adapter}". Use simulated | alpaca | kalshi`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adapter = buildAdapter(args);
  const strategy = getStrategy(args.strategy ?? pickDefaultStrategy(adapter.market));
  const portfolio = new Portfolio(args.cash ?? 25000);
  const risk = new RiskManager();
  const engine = new Engine({ adapter, strategy, portfolio, risk });

  if (adapter.name.includes("LIVE")) {
    console.warn("\n⚠️  LIVE endpoint enabled — this will place REAL orders with REAL money.\n");
  }

  await adapter.connect();
  console.log(`[paper] ${adapter.name} | strategy=${strategy.name} | symbols=${adapter.symbols.join(",")}`);
  console.log(`[paper] dashboard state at http://localhost:${PORT}/api/state — run \`npm run dev\` in another terminal`);

  const server = http.createServer((req, res) => {
    if (req.url === "/api/state") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(engine.state()));
    } else {
      res.writeHead(404).end();
    }
  });
  server.listen(PORT);

  // Warm up strategy history where the adapter has real history.
  if (!(adapter instanceof SimulatedAdapter)) {
    for (const s of adapter.symbols) {
      try {
        const hist = await adapter.history(s, strategy.warmup ?? 50);
        for (const bar of hist) engine.pushBar(s, bar);
      } catch (e) {
        console.warn(`[paper] no history for ${s}: ${e.message}`);
      }
    }
  }

  const loop = async () => {
    try {
      const bars = await adapter.nextBars();
      await engine.onTick(bars);
    } catch (e) {
      console.error(`[paper] tick error: ${e.message}`);
    }
  };
  await loop();
  setInterval(loop, adapter.intervalMs);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
