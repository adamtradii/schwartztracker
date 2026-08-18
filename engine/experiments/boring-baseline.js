// The honest bar everything else has to beat: what "boring" money does.
// Computes, on the same real 2010-2018 daily data plus documented risk-free
// rates, how the safe options would have performed — so every strategy in
// this project can be judged against them instead of against zero.
//
// Rates used (annual, approximate documented averages — NOT live):
//   - Money-market / T-bills 2010-2018 averaged well under 1%/yr (ZIRP era);
//     2024-2026 money-market ≈ 4.5%/yr. We show BOTH because the era matters.
//   - "60/40" = 60% index buy-hold + 40% cash-at-risk-free.
// Fixed income is up essentially 100% of months (interest never goes negative),
// which is the whole reason it — not any strategy here — fits a monthly-income goal.
//
// Usage: node engine/experiments/boring-baseline.js

import fs from "node:fs";
import zlib from "node:zlib";

const data = JSON.parse(zlib.gunzipSync(fs.readFileSync("data/real/stocks-daily-w0.json.gz")).toString());
const spx = data.symbols.SPXUSD.map((b) => b.close);
const years = spx.length / 252;

function mdd(curve) { let peak = -Infinity, m = 0; for (const v of curve) { peak = Math.max(peak, v); m = Math.max(m, (peak - v) / peak); } return m * 100; }
function monthsUp(curve) { let up = 0, n = 0; for (let i = 21; i < curve.length; i += 21) { n++; if (curve[i] > curve[i - 21]) up++; } return (100 * up) / n; }
function cagr(curve) { return (Math.pow(curve.at(-1) / curve[0], 1 / years) - 1) * 100; }

// Buy & hold S&P (real)
const bh = spx.map((x) => x / spx[0]);

// Cash at a constant annual rate → daily compounding. Up every month by construction.
function cashCurve(annualPct) {
  const daily = Math.pow(1 + annualPct / 100, 1 / 252);
  const c = [1]; for (let i = 1; i < spx.length; i++) c.push(c[i - 1] * daily); return c;
}
// 60/40: 60% in the S&P path, 40% growing at the risk-free rate, rebalanced daily (approx).
function sixtyForty(annualPct) {
  const cash = cashCurve(annualPct);
  return spx.map((_, i) => 0.6 * bh[i] + 0.4 * cash[i]);
}

const rows = [
  ["Money-market @0.3%/yr (2010-18 era)", cashCurve(0.3)],
  ["Money-market @4.5%/yr (2024-26 era)", cashCurve(4.5)],
  ["S&P buy & hold (real 2010-18)", bh],
  ["60/40 S&P+cash @4.5%", sixtyForty(4.5)],
];

console.log("[boring-baseline] the bar every strategy must beat\n");
console.log("Option                                    Return/yr   MaxDD   Months-up   Meets income goal?");
console.log("                                                                          (≥1%/mo, DD≤8%, ≥80% up)");
for (const [name, curve] of rows) {
  const r = cagr(curve), d = mdd(curve), u = monthsUp(curve);
  const monthlyEq = Math.pow(1 + r / 100, 1 / 12) * 100 - 100;
  const meets = monthlyEq >= 1 && d <= 8 && u >= 80 ? "YES" : "no";
  console.log(`${name.padEnd(42)} ${r.toFixed(1).padStart(6)}%    ${d.toFixed(1).padStart(5)}%   ${u.toFixed(0).padStart(6)}%      ${meets}`);
}
console.log("\nNote: only equities have drawdown/chop; cash-type options are up ~100% of months but");
console.log("their RETURN is the whole story — 4.5%/yr ≈ 0.37%/mo, below the 1%/mo income target.");
console.log("So even the safe options don't hit 1%/mo TODAY; the income target itself is above risk-free.");
