// Replays REAL historical data from the committed windows in data/real/
// (see engine/data/ingest-real.js for provenance). Markets:
//   "stocks-real"      — 1-min index bars (S&P 500, DAX, Nikkei, EuroStoxx)
//   "prediction-real"  — Polymarket Yes prices at ~25-min native cadence
// The `window` option (0-9) picks which historical window to replay; it plays
// the role the RNG seed plays for the simulated adapter.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// market name -> committed file prefix under data/real/
const PREFIXES = {
  "stocks-real": "stocks-w",
  "stocks-long-real": "stocks-long-w",   // 30-day windows, 15-min bars
  "stocks-daily-real": "stocks-daily-w", // 2010-2018, daily bars
  "prediction-real": "prediction-w",
};

export function realWindowCount(market) {
  const prefix = PREFIXES[market] ?? "stocks-w";
  const dir = path.join(process.cwd(), "data", "real");
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".json.gz")).length;
}

// Aggregate consecutive 1-min bars into N-minute bars (OHLC + summed volume).
export function resampleBars(bars, n) {
  if (!n || n <= 1) return bars;
  const out = [];
  for (let i = 0; i + n <= bars.length; i += n) {
    const chunk = bars.slice(i, i + n);
    out.push({
      time: chunk.at(-1).time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk.at(-1).close,
      volume: chunk.reduce((a, b) => a + b.volume, 0),
    });
  }
  return out;
}

export class ReplayAdapter {
  constructor({ market = "stocks-real", window = 0, intervalMs, resample = 1 } = {}) {
    this.market = market;
    this.window = window;
    this.resample = resample;
    // Strategies see the same market kind as the simulated equivalents.
    this.strategyMarket = market.startsWith("prediction") ? "prediction" : "stocks";
    this.name = `replay-${market}-w${window}`;
    this.intervalMs = intervalMs ?? 60_000;
    this._series = new Map();
    this._cursor = 0;
  }

  async connect() {
    const prefix = PREFIXES[this.market] ?? "stocks-w";
    const file = path.join(process.cwd(), "data", "real", `${prefix}${this.window}.json.gz`);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing real data window ${file}. Run: node engine/data/ingest-real.js (sources must be cloned under /workspace)`);
    }
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString());
    this.source = data.source;
    for (const [sym, bars] of Object.entries(data.symbols)) this._series.set(sym, resampleBars(bars, this.resample));
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

  // Fill model = close price plus slippage. For prediction-real, slippage is
  // half of the MEASURED real Polymarket spread (cycle-6 poly-cost-model.js):
  // deep markets 0.1c, mid 0.3c median. The committed windows are the most
  // active/liquid markets, so 0.2c round trip (0.1c per side) is the honest
  // cost — the old 0.5c was ~5x too pessimistic. Stocks: 3 bps per side.
  async placeOrder({ symbol, side, qty, price }) {
    const slip = this.market === "prediction-real" ? 0.001 : price * 0.0003;
    const fill = side === "buy" ? price + slip : price - slip;
    return { symbol, side, qty, fillPrice: fill, status: "filled" };
  }
}
