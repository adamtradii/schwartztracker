// Backlog experiment (Adam's #4a): expiry drift. Do real Polymarket prices
// behave differently as markets approach their end date, and is there a
// pattern worth trading in the final days?
//
// Data: data/real/polymarket-markets-snapshot.csv.gz — 9.5k real markets,
// one snapshot (~2026-04-17), with prices, bid/ask, volume, end dates.
//
// HONEST LIMIT: this is a single cross-sectional snapshot, so it can show how
// near-expiry markets LOOK (price distribution, spreads, activity) but cannot
// measure returns over time. It can kill or support the idea; proving
// profitability would need panel data.
//
// Usage: node engine/experiments/expiry-study.js

import fs from "node:fs";
import zlib from "node:zlib";

const SNAPSHOT_TS = Date.parse("2026-04-17T12:00:00Z");

// Minimal CSV parser handling quoted fields with commas/escaped quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const raw = zlib.gunzipSync(fs.readFileSync("data/real/polymarket-markets-snapshot.csv.gz")).toString();
const rows = parseCsv(raw);
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const markets = [];
for (const r of rows.slice(1)) {
  if (r.length < header.length) continue;
  const end = Date.parse(r[idx.end_date]);
  const bid = parseFloat(r[idx.best_bid]), ask = parseFloat(r[idx.best_ask]);
  const vol24 = parseFloat(r[idx.volume_24h]) || 0;
  const change = parseFloat(r[idx.one_day_change]);
  let yes = NaN;
  try { yes = parseFloat(JSON.parse(r[idx.outcome_prices])[0]); } catch { /* skip */ }
  if (!Number.isFinite(end) || !Number.isFinite(yes)) continue;
  const daysLeft = (end - SNAPSHOT_TS) / 86400000;
  if (daysLeft < 0 || daysLeft > 365) continue;
  markets.push({
    daysLeft, yes,
    spread: Number.isFinite(bid) && Number.isFinite(ask) && ask > bid ? ask - bid : null,
    vol24, change: Number.isFinite(change) ? Math.abs(change) : null,
  });
}

const BUCKETS = [
  ["0-1d", 0, 1], ["1-3d", 1, 3], ["3-7d", 3, 7], ["7-30d", 7, 30], ["30-90d", 30, 90], ["90d+", 90, 365],
];
const pct = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * p)];

console.log(`[expiry-study] ${markets.length} real markets with valid expiry + price\n`);
console.log("Bucket   n     price: %near-certain(<5c or >95c)  %mid(20-80c)   median spread   median 24h vol   %moved≥1c today");
for (const [label, lo, hi] of BUCKETS) {
  const ms = markets.filter((m) => m.daysLeft >= lo && m.daysLeft < hi);
  if (ms.length < 20) { console.log(`${label.padEnd(8)} ${ms.length} (too few)`); continue; }
  const certain = (100 * ms.filter((m) => m.yes < 0.05 || m.yes > 0.95).length) / ms.length;
  const mid = (100 * ms.filter((m) => m.yes >= 0.2 && m.yes <= 0.8).length) / ms.length;
  const spreads = ms.map((m) => m.spread).filter((x) => x != null);
  const moved = ms.filter((m) => m.change != null);
  const movedPct = moved.length ? (100 * moved.filter((m) => m.change >= 0.01).length) / moved.length : NaN;
  console.log(
    `${label.padEnd(8)} ${String(ms.length).padStart(4)}  ${certain.toFixed(1).padStart(8)}%${" ".repeat(18)}${mid.toFixed(1).padStart(5)}%   ${spreads.length ? (pct(spreads, 0.5) * 100).toFixed(1) + "c" : "—"}${" ".repeat(10)}$${Math.round(pct(ms.map((m) => m.vol24), 0.5)).toLocaleString().padStart(9)}   ${movedPct.toFixed(1)}%`
  );
}

// The tradeable question: among near-expiry markets, how many are still
// genuinely uncertain AND liquid AND tight enough to trade?
const near = markets.filter((m) => m.daysLeft < 3 && m.yes >= 0.1 && m.yes <= 0.9);
const tradeable = near.filter((m) => m.spread != null && m.spread <= 0.02 && m.vol24 >= 1000);
console.log(`\nNear-expiry (<3d) still-uncertain markets: ${near.length}; of those, liquid+tight (spread ≤2c, vol24h ≥$1k): ${tradeable.length}`);
