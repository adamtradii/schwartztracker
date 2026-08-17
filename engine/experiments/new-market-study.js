// Backlog experiment (Adam's #4b): are YOUNG Polymarket markets priced more
// sloppily than mature ones? Sloppy = wider spreads and/or prices sitting
// further from where information would put them. If young markets are
// systematically loose, that's a maker/liquidity-provision opportunity.
//
// Data: data/real/polymarket-markets-snapshot.csv.gz (9.5k real markets with
// created_date, end_date, best_bid/ask, prices, volume, liquidity).
// Age = snapshot time − created_date.
//
// HONEST LIMIT: one snapshot. Shows how young vs old markets LOOK right now;
// cannot prove a young market's price later corrects (needs panel data).
//
// Usage: node engine/experiments/new-market-study.js

import fs from "node:fs";
import zlib from "node:zlib";

const SNAPSHOT_TS = Date.parse("2026-04-17T12:00:00Z");

function parseCsv(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (inQ) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') inQ = false; else field += c; }
    else if (c === '"') inQ = true; else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else if (c !== "\r") field += c; }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(zlib.gunzipSync(fs.readFileSync("data/real/polymarket-markets-snapshot.csv.gz")).toString());
const H = Object.fromEntries(rows[0].map((h, i) => [h, i]));

const mkts = [];
for (const r of rows.slice(1)) {
  if (r.length < rows[0].length) continue;
  const created = Date.parse(r[H.created_date]);
  const bid = parseFloat(r[H.best_bid]), ask = parseFloat(r[H.best_ask]);
  const liq = parseFloat(r[H.liquidity]) || 0;
  const vol24 = parseFloat(r[H.volume_24h]) || 0;
  let yes = NaN; try { yes = parseFloat(JSON.parse(r[H.outcome_prices])[0]); } catch { /**/ }
  if (!Number.isFinite(created) || !Number.isFinite(yes)) continue;
  const ageDays = (SNAPSHOT_TS - created) / 86400000;
  if (ageDays < 0 || ageDays > 400) continue;
  const spread = Number.isFinite(bid) && Number.isFinite(ask) && ask > bid ? ask - bid : null;
  // "distance from a round number" — sloppy pricing sits at odd values;
  // efficient near-resolved markets pin to 0/1.
  mkts.push({ ageDays, yes, spread, liq, vol24 });
}

const BUCKETS = [["<1d", 0, 1], ["1-3d", 1, 3], ["3-7d", 3, 7], ["7-14d", 7, 14], ["14-30d", 14, 30], ["30-90d", 30, 90], ["90d+", 90, 400]];
const pct = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * p)];
const median = (xs) => xs.length ? pct(xs, 0.5) : NaN;

console.log(`[new-market-study] ${mkts.length} real markets with created_date + price\n`);
console.log("Age       n     median spread   median liquidity   median 24h vol   %uncertain(20-80c)");
for (const [label, lo, hi] of BUCKETS) {
  const ms = mkts.filter((m) => m.ageDays >= lo && m.ageDays < hi);
  if (ms.length < 15) { console.log(`${label.padEnd(9)} ${ms.length} (too few)`); continue; }
  const sp = ms.map((m) => m.spread).filter((x) => x != null);
  const uncertain = (100 * ms.filter((m) => m.yes >= 0.2 && m.yes <= 0.8).length) / ms.length;
  console.log(`${label.padEnd(9)} ${String(ms.length).padStart(4)}  ${(median(sp) * 100).toFixed(2).padStart(6)}c        $${Math.round(median(ms.map((m) => m.liq))).toLocaleString().padStart(8)}       $${Math.round(median(ms.map((m) => m.vol24))).toLocaleString().padStart(8)}       ${uncertain.toFixed(1)}%`);
}

// Focused question: among UNCERTAIN markets (20-80c, where mispricing would
// matter), are young ones wider than mature ones — controlling for liquidity?
console.log("\nUncertain markets (20-80c) only — spread by age, within liquidity tiers:");
for (const [tlabel, lo, hi] of [["liq≥$50k", 50000, Infinity], ["liq $5k-50k", 5000, 50000]]) {
  const young = mkts.filter((m) => m.yes >= 0.2 && m.yes <= 0.8 && m.liq >= lo && m.liq < hi && m.ageDays < 7).map((m) => m.spread).filter((x) => x != null);
  const mature = mkts.filter((m) => m.yes >= 0.2 && m.yes <= 0.8 && m.liq >= lo && m.liq < hi && m.ageDays >= 30).map((m) => m.spread).filter((x) => x != null);
  const y = young.length >= 8 ? (median(young) * 100).toFixed(2) + "c" : `n=${young.length}`;
  const mt = mature.length >= 8 ? (median(mature) * 100).toFixed(2) + "c" : `n=${mature.length}`;
  console.log(`  ${tlabel.padEnd(12)} young(<7d): ${y}   mature(≥30d): ${mt}`);
}
