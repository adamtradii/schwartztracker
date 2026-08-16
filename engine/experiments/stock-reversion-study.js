// Backlog experiment: "Stocks mean-reversion at 1-min". The momentum study
// found 1-min index returns autocorrelate at -0.045 — this measures whether
// that reversion is TRADEABLE: fade any 1-min move larger than k×rolling
// sigma, hold H bars, count round-trip costs.
//
// Grid: k ∈ {2,3,4} sigmas, H ∈ {5,15,30} bars. Cost model: 3 bps per side
// (6 bps round trip), same as the engine's stock slippage.
//
// Usage: node engine/experiments/stock-reversion-study.js

import fs from "node:fs";
import zlib from "node:zlib";

const COST_BPS = 6; // round trip
const SIGMA_WIN = 30;

function loadWindows() {
  const out = [];
  for (let w = 0; w < 10; w++) {
    const f = `data/real/stocks-w${w}.json.gz`;
    if (!fs.existsSync(f)) continue;
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());
    for (const [sym, bars] of Object.entries(data.symbols)) {
      out.push({ window: w, sym, closes: bars.map((b) => b.close) });
    }
  }
  return out;
}

function study(closes, k, H) {
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const trades = [];
  let i = SIGMA_WIN;
  while (i < rets.length - H) {
    const slice = rets.slice(i - SIGMA_WIN, i);
    const mean = slice.reduce((a, b) => a + b, 0) / SIGMA_WIN;
    const sigma = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / SIGMA_WIN);
    if (sigma > 0 && Math.abs(rets[i]) > k * sigma) {
      // Fade: position against the move from close[i+1] to close[i+1+H]
      const dir = -Math.sign(rets[i]);
      const gross = dir * Math.log(closes[i + 1 + H] / closes[i + 1]) * 10000;
      trades.push(gross - COST_BPS);
      i += H + 1; // no overlapping trades
    } else {
      i++;
    }
  }
  return trades;
}

const series = loadWindows();
console.log(`[stock-reversion-study] ${series.length} real symbol-windows, cost ${COST_BPS} bps round trip\n`);
console.log("Net bps per trade (mean), by k-sigma threshold and holding period:");
for (const k of [2, 3, 4]) {
  for (const H of [5, 15, 30]) {
    const perWindow = new Map(); // window -> net bps list
    let all = [];
    for (const s of series) {
      const t = study(s.closes, k, H);
      all = all.concat(t);
      if (!perWindow.has(s.window)) perWindow.set(s.window, []);
      perWindow.get(s.window).push(...t);
    }
    if (all.length < 30) { console.log(`  k=${k} H=${H}: too few trades (${all.length})`); continue; }
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const winRate = (100 * all.filter((x) => x > 0).length) / all.length;
    // How many of the 10 windows are net positive?
    let posWindows = 0, nWindows = 0;
    for (const trades of perWindow.values()) {
      if (!trades.length) continue;
      nWindows++;
      if (trades.reduce((a, b) => a + b, 0) > 0) posWindows++;
    }
    console.log(`  k=${k} H=${String(H).padStart(2)}: ${mean >= 0 ? "+" : ""}${mean.toFixed(2)} bps net × ${String(all.length).padStart(5)} trades  win ${winRate.toFixed(1)}%  positive in ${posWindows}/${nWindows} windows`);
  }
}
