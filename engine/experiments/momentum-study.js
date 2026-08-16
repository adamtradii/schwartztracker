// Assumption test #1 (stocks): "price trends persist intraday, so
// trend-following works." If this is false at every horizon, no SMA tuning
// can save the strategy.
//
// Measures on the REAL committed index windows (data/real/stocks-w*.json.gz):
//   a) autocorrelation of returns at 1/5/15/60/240-minute horizons
//   b) mean forward return after a fast/slow SMA cross, by horizon
//
// Usage: node engine/experiments/momentum-study.js

import fs from "node:fs";
import zlib from "node:zlib";
import { sma } from "../lib/indicators.js";

const HORIZONS = [1, 5, 15, 60, 240];

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

function autocorr(closes, h) {
  const rets = [];
  for (let i = h; i < closes.length; i += h) rets.push(Math.log(closes[i] / closes[i - h]));
  if (rets.length < 20) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  let num = 0, den = 0;
  for (let i = 1; i < rets.length; i++) num += (rets[i] - mean) * (rets[i - 1] - mean);
  for (const r of rets) den += (r - mean) ** 2;
  return den === 0 ? null : num / den;
}

function postCrossReturn(closes, fast, slow, horizon) {
  const rets = [];
  for (let i = slow + 1; i < closes.length - horizon; i++) {
    const now = closes.slice(0, i + 1), prev = closes.slice(0, i);
    const fN = sma(now, fast), sN = sma(now, slow), fP = sma(prev, fast), sP = sma(prev, slow);
    if (fP <= sP && fN > sN) rets.push(Math.log(closes[i + horizon] / closes[i]));        // up-cross → long
    else if (fP >= sP && fN < sN) rets.push(-Math.log(closes[i + horizon] / closes[i]));  // down-cross → short
  }
  if (!rets.length) return null;
  return { n: rets.length, meanBps: (rets.reduce((a, b) => a + b, 0) / rets.length) * 10000 };
}

const series = loadWindows();
console.log(`[momentum-study] ${series.length} real symbol-windows\n`);

console.log("Return autocorrelation by horizon (positive = trends persist, negative = mean reversion):");
for (const h of HORIZONS) {
  const acs = series.map((s) => autocorr(s.closes, h)).filter((x) => x != null);
  const mean = acs.reduce((a, b) => a + b, 0) / acs.length;
  const positive = acs.filter((a) => a > 0).length;
  console.log(`  ${String(h).padStart(3)}min: mean AC ${mean.toFixed(4)}  (positive in ${positive}/${acs.length} series)`);
}

console.log("\nMean forward return after SMA cross, gross of ~3bps round-trip cost (fast/slow @ horizon):");
for (const [fast, slow] of [[9, 21], [30, 90], [60, 180]]) {
  for (const h of [30, 120, 240]) {
    const rs = series.map((s) => postCrossReturn(s.closes, fast, slow, h)).filter(Boolean);
    const n = rs.reduce((a, r) => a + r.n, 0);
    const mean = rs.reduce((a, r) => a + r.meanBps * r.n, 0) / n;
    console.log(`  SMA ${String(fast).padStart(2)}/${String(slow).padStart(3)} @ ${String(h).padStart(3)}min: ${mean >= 0 ? "+" : ""}${mean.toFixed(2)} bps over ${n} crosses`);
  }
}
