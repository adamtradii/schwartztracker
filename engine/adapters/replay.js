// Replays REAL historical data from the committed windows in data/real/
// (see engine/data/ingest-real.js for provenance). Markets:
//   "stocks-real"      — 1-min index bars (S&P 500, DAX, Nikkei, EuroStoxx)
//   "prediction-real"  — Polymarket Yes prices at ~25-min native cadence
// The `window` option (0-9) picks which historical window to replay; it plays
// the role the RNG seed plays for the simulated adapter.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export function realWindowCount(market) {
  const prefix = market === "prediction-real" ? "prediction-w" : "stocks-w";
  const dir = path.join(process.cwd(), "data", "real");
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".json.gz")).length;
}

export class ReplayAdapter {
  constructor({ market = "stocks-real", window = 0, intervalMs } = {}) {
    this.market = market;
    this.window = window;
    // Strategies see the same market kind as the simulated equivalents.
    this.strategyMarket = market === "prediction-real" ? "prediction" : "stocks";
    this.name = `replay-${market}-w${window}`;
    this.intervalMs = intervalMs ?? 60_000;
    this._series = new Map();
    this._cursor = 0;
  }

  async connect() {
    const prefix = this.market === "prediction-real" ? "prediction-w" : "stocks-w";
    const file = path.join(process.cwd(), "data", "real", `${prefix}${this.window}.json.gz`);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing real data window ${file}. Run: node engine/data/ingest-real.js (sources must be cloned under /workspace)`);
    }
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString());
    this.source = data.source;
    for (const [sym, bars] of Object.entries(data.symbols)) this._series.set(sym, bars);
    this.symbols = [...this._series.keys()];
  }

  maxBars() {
    return Math.max(...[...this._series.values()].map((b) => b.length));
  }

  async history(symbol, bars) {
    return this._series.get(symbol).slice(0, bars);
  }

  async nextBars() {
    const out = {};
    for (const s of this.symbols) {
      const bars = this._series.get(s);
      if (this._cursor < bars.length) out[s] = bars[this._cursor];
    }
    this._cursor++;
    return out;
  }

  // Same fill model as the simulator: close price plus slippage. Real
  // prediction prices here are mids, so the 0.5c slip stands in for
  // crossing half the typical spread.
  async placeOrder({ symbol, side, qty, price }) {
    const slip = this.market === "prediction-real" ? 0.005 : price * 0.0003;
    const fill = side === "buy" ? price + slip : price - slip;
    return { symbol, side, qty, fillPrice: fill, status: "filled" };
  }
}
