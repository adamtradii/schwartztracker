// Assumption test #2 (prediction markets): "sharp moves overshoot and
// partially revert" — the premise of extreme-fade. Measures, on REAL
// Polymarket prices, the mean NEXT move conditional on the size of the
// current move. Negative conditional next-move = reversion (fade wins);
// positive = continuation (fade loses).
//
// Runs on committed windows by default; pass --full <prices_sample.csv>
// to use the complete 2,023-market sample when the source clone exists.
//
// Usage: node engine/experiments/reversion-study.js [--full /workspace/.../prices_sample.csv]

import fs from "node:fs";
import zlib from "node:zlib";
import { parseArgs } from "../cli-args.js";

function seriesFromWindows() {
  const out = [];
  for (let w = 0; w < 10; w++) {
    const f = `data/real/prediction-w${w}.json.gz`;
    if (!fs.existsSync(f)) continue;
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());
    for (const bars of Object.values(data.symbols)) out.push(bars.map((b) => b.close));
  }
  return out;
}

function seriesFromFull(csvPath) {
  const lines = fs.readFileSync(csvPath, "utf8").trim().split("\n").slice(1);
  const by = new Map();
  for (const l of lines) {
    const [id, outcome, price, ts] = l.split(",");
    if (outcome !== "Yes") continue;
    if (!by.has(id)) by.set(id, []);
    by.get(id).push({ t: Date.parse(ts), p: +price });
  }
  const out = [];
  for (const pts of by.values()) {
    pts.sort((a, b) => a.t - b.t);
    const closes = pts.map((x) => x.p);
    if (closes.length >= 10 && Math.min(...closes) > 0.02 && Math.max(...closes) < 0.98) out.push(closes);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const series = args.full ? seriesFromFull(args.full) : seriesFromWindows();
const label = args.full ? "full sample" : "committed windows";
console.log(`[reversion-study] ${series.length} real market series (${label})\n`);

const BUCKETS = [0.01, 0.02, 0.03, 0.05, 0.08];
console.log("Mean next move conditional on current |move| ≥ threshold (sign-adjusted:");
console.log("negative = reverts / fade profitable before costs; positive = continues):");
for (const th of BUCKETS) {
  const next = [];
  for (const closes of series) {
    for (let i = 1; i < closes.length - 1; i++) {
      const move = closes[i] - closes[i - 1];
      if (Math.abs(move) >= th) {
        next.push(Math.sign(move) * (closes[i + 1] - closes[i])); // + = continuation
      }
    }
  }
  if (next.length < 5) { console.log(`  ≥${(th * 100).toFixed(0)}c: n=${next.length} (too few)`); continue; }
  const mean = next.reduce((a, b) => a + b, 0) / next.length;
  const reverted = next.filter((x) => x < 0).length;
  console.log(`  ≥${(th * 100).toFixed(0)}c: n=${String(next.length).padStart(5)}  mean next move ${(mean * 100).toFixed(2)}c  reverted ${(100 * reverted / next.length).toFixed(1)}% of the time`);
}
console.log("\nFade round-trip cost is ~1c (0.5c slip per side on mids) — reversion must beat that to be tradeable.");
