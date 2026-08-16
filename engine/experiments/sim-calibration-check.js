// Measures the prediction SIMULATOR with the same yardstick used on real
// Polymarket data (reversion-study.js), so the sim can be calibrated to
// reality instead of flattering the strategies.
//
// Real targets (full-sample study, ~25-min snapshot cadence):
//   frequency of |move| ≥ 1c:            ~5.8% of transitions
//   after |move| ≥ 5c: mean next move    ≈ −0.33c, reverts ~36.5% of the time
//   after |move| ≥ 8c: mean next move    ≈ −0.51c, reverts ~33.8% of the time
//
// Sim bars are 1-min, so they're aggregated 25:1 before measuring.
//
// Usage: node engine/experiments/sim-calibration-check.js

import { generatePredictionBars } from "../adapters/simulated.js";

const REAL = {
  moveFreq1c: 5.8,
  next5c: -0.33, rev5c: 36.5,
  next8c: -0.51, rev8c: 33.8,
};

function aggregate(closes, n = 25) {
  const out = [];
  for (let i = n - 1; i < closes.length; i += n) out.push(closes[i]);
  return out;
}

function stats(seriesList) {
  let transitions = 0, big1 = 0;
  const next = { 5: [], 8: [] };
  for (const closes of seriesList) {
    for (let i = 1; i < closes.length - 1; i++) {
      const move = closes[i] - closes[i - 1];
      transitions++;
      if (Math.abs(move) >= 0.01) big1++;
      for (const th of [5, 8]) {
        if (Math.abs(move) >= th / 100) next[th].push(Math.sign(move) * (closes[i + 1] - closes[i]));
      }
    }
  }
  const summarize = (xs) => xs.length
    ? { n: xs.length, mean: (xs.reduce((a, b) => a + b, 0) / xs.length) * 100, revPct: (100 * xs.filter((x) => x < 0).length) / xs.length }
    : { n: 0, mean: NaN, revPct: NaN };
  return { moveFreq1c: (100 * big1) / transitions, at5: summarize(next[5]), at8: summarize(next[8]) };
}

const N_SERIES = 60, BARS = 43200; // ~1 month of 1-min bars each
const seriesList = [];
for (let s = 0; s < N_SERIES; s++) {
  const bars = generatePredictionBars(`CAL-${s}`, { bars: BARS, seed: 1000 + s });
  seriesList.push(aggregate(bars.map((b) => b.close)));
}
const sim = stats(seriesList);

console.log("[sim-calibration] sim (25-min aggregated) vs real Polymarket targets:");
console.log(`  |move|≥1c frequency:  sim ${sim.moveFreq1c.toFixed(1)}%   real ${REAL.moveFreq1c}%`);
console.log(`  after ≥5c: mean next  sim ${sim.at5.mean.toFixed(2)}c (n=${sim.at5.n}, rev ${sim.at5.revPct.toFixed(1)}%)   real ${REAL.next5c}c (rev ${REAL.rev5c}%)`);
console.log(`  after ≥8c: mean next  sim ${sim.at8.mean.toFixed(2)}c (n=${sim.at8.n}, rev ${sim.at8.revPct.toFixed(1)}%)   real ${REAL.next8c}c (rev ${REAL.rev8c}%)`);
