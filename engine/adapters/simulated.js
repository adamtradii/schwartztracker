// Simulated market data — works with zero API keys, for backtesting and
// dry-run paper trading. Generates plausible intraday price paths:
//   stocks:     geometric brownian motion with regime shifts + volume
//   prediction: bounded 0-1 contract prices with drift toward resolution,
//               occasional news jumps
// Deterministic per (symbol, seed) so backtests are reproducible.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

// Box-Muller normal draw
function gaussian(rng) {
  const u = Math.max(rng(), 1e-9), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function generateStockBars(symbol, { bars = 780, startPrice, seed = 42, intervalMs = 60_000, startTime } = {}) {
  const rng = mulberry32(hashCode(symbol) ^ seed);
  let price = startPrice ?? 20 + rng() * 380;
  let vol = 0.0006 + rng() * 0.0012;   // per-bar volatility
  let drift = 0;
  const t0 = startTime ?? Date.UTC(2026, 0, 5, 14, 30); // arbitrary market open
  const out = [];
  for (let i = 0; i < bars; i++) {
    // Occasional regime shift: new drift and volatility
    if (rng() < 0.01) {
      drift = (rng() - 0.5) * 0.0008;
      vol = 0.0005 + rng() * 0.002;
    }
    const ret = drift + vol * gaussian(rng);
    const open = price;
    price = Math.max(price * Math.exp(ret), 0.5);
    const high = Math.max(open, price) * (1 + rng() * vol);
    const low = Math.min(open, price) * (1 - rng() * vol);
    out.push({
      time: t0 + i * intervalMs,
      open, high, low, close: price,
      volume: Math.floor(1000 + rng() * 20000),
    });
  }
  return out;
}

export function generatePredictionBars(symbol, { bars = 780, startPrice, seed = 42, intervalMs = 60_000, startTime } = {}) {
  const rng = mulberry32(hashCode(symbol) ^ seed ^ 0x9e3779b9);
  let p = startPrice ?? 0.15 + rng() * 0.7;      // contract price in dollars (0-1)
  const trueProb = Math.min(Math.max(p + (rng() - 0.5) * 0.3, 0.03), 0.97);
  let overshoot = 0; // transient overreaction component that decays back out
  const t0 = startTime ?? Date.UTC(2026, 0, 5, 14, 30);
  const out = [];
  for (let i = 0; i < bars; i++) {
    const open = p;
    // Slow convergence toward "true" probability + noise
    p += (trueProb - p) * 0.002 + gaussian(rng) * 0.006;
    // News jump: sharp repricing. Markets overreact — part of the move is a
    // transient overshoot that retraces over the following ~30 bars.
    if (rng() < 0.006) {
      const jump = (rng() - 0.45) * 0.2;
      p += jump;
      overshoot += jump * 0.45;
    }
    const retrace = overshoot * 0.06;
    p -= retrace;
    overshoot -= retrace;
    p = Math.min(Math.max(p, 0.01), 0.99);
    out.push({
      time: t0 + i * intervalMs,
      open, high: Math.max(open, p) + rng() * 0.005, low: Math.max(Math.min(open, p) - rng() * 0.005, 0.01),
      close: p,
      volume: Math.floor(50 + rng() * 2000),
    });
  }
  return out;
}

export class SimulatedAdapter {
  constructor({ market = "stocks", symbols, seed = 42, intervalMs = 60_000 } = {}) {
    this.market = market;
    this.symbols = symbols ?? (market === "prediction"
      ? ["FED-CUT-SEP", "CPI-ABOVE-3", "SHUTDOWN-OCT"]
      : ["AAPL", "TSLA", "NVDA", "SPY"]);
    this.seed = seed;
    this.intervalMs = intervalMs;
    this.name = `simulated-${market}`;
    this._series = new Map();
    this._cursor = 0;
  }

  async connect() {
    const gen = this.market === "prediction" ? generatePredictionBars : generateStockBars;
    for (const s of this.symbols) {
      this._series.set(s, gen(s, { bars: 100_000, seed: this.seed, intervalMs: this.intervalMs }));
    }
  }

  // Historical bars for backtesting.
  async history(symbol, bars) {
    return this._series.get(symbol).slice(0, bars);
  }

  // Streaming interface for paper mode: each call advances one bar per symbol.
  async nextBars() {
    const out = {};
    for (const s of this.symbols) out[s] = this._series.get(s)[this._cursor % 100_000];
    this._cursor++;
    return out;
  }

  // Simulated fill at close price with slippage + commission-ish fee.
  async placeOrder({ symbol, side, qty, price }) {
    const slip = this.market === "prediction" ? 0.005 : price * 0.0003;
    const fill = side === "buy" ? price + slip : price - slip;
    return { symbol, side, qty, fillPrice: fill, status: "filled" };
  }
}
