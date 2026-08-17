// Backlog TOP item: measure Polymarket's REAL trading costs and re-judge the
// fade idea against them. Cycle-5 found spreads far tighter than our 0.5c
// assumption; this quantifies that and asks whether the −0.33c bounce after
// big moves clears the REAL cost in the liquid tier.
//
// Joins two real datasets by market_id:
//   - snapshot (data/real/polymarket-markets-snapshot.csv.gz): real bid/ask,
//     spread, 24h volume, liquidity per market
//   - price series (prices_sample.csv): Yes price path per market
//
// Round-trip cost model = spread (cross it once entering, once exiting) — the
// taker cost of a marketable order. Half-spread each side = one full spread
// round trip, the standard microstructure estimate.
//
// Usage: node engine/experiments/poly-cost-model.js [--series /workspace/.../prices_sample.csv]

import fs from "node:fs";
import zlib from "node:zlib";
import { parseArgs } from "../cli-args.js";

function parseCsv(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') inQ = false; else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// 1. Snapshot: market_id -> liquidity info
const snapRows = parseCsv(zlib.gunzipSync(fs.readFileSync("data/real/polymarket-markets-snapshot.csv.gz")).toString());
const H = Object.fromEntries(snapRows[0].map((h, i) => [h, i]));
const info = new Map();
for (const r of snapRows.slice(1)) {
  if (r.length < snapRows[0].length) continue;
  const bid = parseFloat(r[H.best_bid]), ask = parseFloat(r[H.best_ask]);
  const spread = Number.isFinite(bid) && Number.isFinite(ask) && ask > bid ? ask - bid : parseFloat(r[H.spread]);
  info.set(r[H.market_id], { spread: Number.isFinite(spread) ? spread : null, vol24: parseFloat(r[H.volume_24h]) || 0, liquidity: parseFloat(r[H.liquidity]) || 0 });
}

// Spread distribution by liquidity tier
const tiers = [["deep (liq≥$50k)", (i) => i.liquidity >= 50000], ["mid ($5k-50k)", (i) => i.liquidity >= 5000 && i.liquidity < 50000], ["thin (<$5k)", (i) => i.liquidity < 5000]];
const pct = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * p)];
console.log(`[poly-cost-model] ${info.size} snapshot markets\n`);
console.log("Real spread (= round-trip taker cost) by liquidity tier:");
for (const [label, f] of tiers) {
  const sp = [...info.values()].filter((i) => f(i) && i.spread != null).map((i) => i.spread);
  if (sp.length < 10) { console.log(`  ${label}: too few`); continue; }
  console.log(`  ${label.padEnd(18)} n=${String(sp.length).padStart(4)}  median ${(pct(sp, 0.5) * 100).toFixed(2)}c  p75 ${(pct(sp, 0.75) * 100).toFixed(2)}c  p90 ${(pct(sp, 0.9) * 100).toFixed(2)}c`);
}

// 2. Price series joined to liquidity; re-judge fade net of each market's spread
const args = parseArgs(process.argv.slice(2));
const seriesPath = args.series ?? "/workspace/manja316/polymarket-historical-data/prices_sample.csv";
if (!fs.existsSync(seriesPath)) {
  console.log(`\n[skip] price series ${seriesPath} not present (container recycled). Spread tiers above still valid.`);
  process.exit(0);
}
const lines = fs.readFileSync(seriesPath, "utf8").trim().split("\n").slice(1);
const byMkt = new Map();
for (const l of lines) {
  const [id, outcome, price] = l.split(",");
  if (outcome !== "Yes") continue;
  if (!byMkt.has(id)) byMkt.set(id, []);
  byMkt.get(id).push(+price);
}

// For each big move (≥ threshold) in a market, the fade P&L over the next
// snapshot = sign-adjusted next move MINUS that market's real round-trip spread.
function judge(minMove, tierFilter) {
  const perTradeNet = [];
  let joined = 0;
  for (const [id, closes] of byMkt) {
    const inf = info.get(id);
    if (!inf || inf.spread == null || !tierFilter(inf)) continue;
    joined++;
    for (let i = 1; i < closes.length - 1; i++) {
      const move = closes[i] - closes[i - 1];
      if (Math.abs(move) >= minMove) {
        const bounce = -Math.sign(move) * (closes[i + 1] - closes[i]); // + = fade wins gross
        perTradeNet.push(bounce - inf.spread);                          // net of round-trip cost
      }
    }
  }
  if (perTradeNet.length < 20) return null;
  const mean = perTradeNet.reduce((a, b) => a + b, 0) / perTradeNet.length;
  const win = (100 * perTradeNet.filter((x) => x > 0).length) / perTradeNet.length;
  return { joinedMarkets: joined, trades: perTradeNet.length, meanNetC: mean * 100, winPct: win };
}

console.log("\nFade P&L NET of each market's real spread (mean cents per trade):");
console.log("(gross bounce after a big move, minus that market's measured round-trip spread)");
for (const [tlabel, tf] of [["deep+mid liq≥$5k", (i) => i.liquidity >= 5000], ["deep liq≥$50k", (i) => i.liquidity >= 50000]]) {
  for (const mm of [0.03, 0.05, 0.08]) {
    const r = judge(mm, tf);
    if (!r) { console.log(`  ${tlabel}, ≥${(mm * 100).toFixed(0)}c: too few`); continue; }
    const verdict = r.meanNetC > 0 ? " ✅ positive" : "";
    console.log(`  ${tlabel.padEnd(18)} ≥${(mm * 100).toFixed(0)}c move: ${r.meanNetC >= 0 ? "+" : ""}${r.meanNetC.toFixed(3)}c net × ${r.trades} trades (win ${r.winPct.toFixed(1)}%)${verdict}`);
  }
}
