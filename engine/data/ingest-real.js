// Ingests REAL market data into compact committed windows under data/real/.
//
// Sources (public GitHub datasets, cloned to /workspace by the session):
//   stocks:     FutureSharks/financial-data — histdata.com 1-minute bars for
//               SPXUSD (S&P 500), GRXEUR (DAX), JPXJPY (Nikkei 225),
//               ETXEUR (EuroStoxx 50), 2010-2018
//   prediction: manja316/polymarket-historical-data — prices_sample.csv,
//               real Polymarket Yes prices, ~26 snapshots per market
//               (~25-minute cadence) across 2,023 markets
//
// Output: data/real/stocks-w<N>.json.gz  (10 windows × 4 symbols × 4320 bars)
//         data/real/prediction-w<N>.json.gz (10 windows × 8 markets × native bars)
// These are committed to git so lab cycles can evaluate on real data without
// re-cloning multi-GB sources.
//
// Usage: node engine/data/ingest-real.js [--stocks-src DIR] [--poly-src FILE]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { parseArgs } from "../cli-args.js";

const OUT_DIR = path.join(process.cwd(), "data", "real");
const STOCKS_SRC = "/workspace/futuresharks/financial-data/pyfinancialdata/data/stocks/histdata";
const POLY_SRC = "/workspace/manja316/polymarket-historical-data/prices_sample.csv";

const INSTRUMENTS = ["SPXUSD", "GRXEUR", "JPXJPY", "ETXEUR"];
// One window per ~9 months, 2012-2018: covers calm and volatile regimes.
const WINDOW_STARTS = [
  "2012-03-05", "2012-11-12", "2013-08-05", "2014-05-05", "2015-01-12",
  "2015-10-05", "2016-06-27", "2017-03-06", "2017-11-06", "2018-08-06",
];
const BARS_PER_WINDOW = 4320;

function writeGz(file, obj) {
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(obj)));
  console.log(`  wrote ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

// histdata M1 format: "YYYYMMDD HHMMSS;open;high;low;close;volume" in EST.
function* histdataBars(file) {
  const text = fs.readFileSync(file, "latin1");
  for (const line of text.split("\n")) {
    const parts = line.trim().split(";");
    if (parts.length < 5) continue;
    const dt = parts[0];
    const time = Date.UTC(+dt.slice(0, 4), +dt.slice(4, 6) - 1, +dt.slice(6, 8), +dt.slice(9, 11), +dt.slice(11, 13));
    yield {
      time,
      open: +parts[1], high: +parts[2], low: +parts[3], close: +parts[4],
      volume: +parts[5] || 1,
    };
  }
}

function round(bar) {
  return {
    time: bar.time,
    open: +bar.open.toFixed(4), high: +bar.high.toFixed(4),
    low: +bar.low.toFixed(4), close: +bar.close.toFixed(4),
    volume: bar.volume,
  };
}

function ingestStocks(srcDir) {
  console.log("[ingest] stocks: real 1-min index bars (histdata via FutureSharks/financial-data)");
  for (let w = 0; w < WINDOW_STARTS.length; w++) {
    const startTs = Date.parse(WINDOW_STARTS[w] + "T00:00:00Z");
    const year = WINDOW_STARTS[w].slice(0, 4);
    const symbols = {};
    for (const inst of INSTRUMENTS) {
      const files = [
        path.join(srcDir, inst, `DAT_ASCII_${inst}_M1_${year}.csv`),
        path.join(srcDir, inst, `DAT_ASCII_${inst}_M1_${+year + 1}.csv`),
      ].filter((f) => fs.existsSync(f));
      const bars = [];
      for (const f of files) {
        for (const b of histdataBars(f)) {
          if (b.time < startTs) continue;
          bars.push(round(b));
          if (bars.length >= BARS_PER_WINDOW) break;
        }
        if (bars.length >= BARS_PER_WINDOW) break;
      }
      if (bars.length >= BARS_PER_WINDOW * 0.9) symbols[inst] = bars;
      else console.warn(`  ! ${inst} window ${w}: only ${bars.length} bars, skipping symbol`);
    }
    writeGz(path.join(OUT_DIR, `stocks-w${w}.json.gz`), {
      source: "histdata.com 1-min via github.com/FutureSharks/financial-data",
      start: WINDOW_STARTS[w], bars: BARS_PER_WINDOW, symbols,
    });
  }
}

function ingestPolymarket(srcFile) {
  console.log("[ingest] prediction: real Polymarket snapshot prices (manja316/polymarket-historical-data)");
  const lines = fs.readFileSync(srcFile, "utf8").trim().split("\n").slice(1);
  const byMarket = new Map();
  for (const line of lines) {
    const [id, outcome, price, ts] = line.split(",");
    if (outcome !== "Yes") continue;
    if (!byMarket.has(id)) byMarket.set(id, []);
    byMarket.get(id).push({ time: Date.parse(ts), close: +price });
  }
  // Keep markets that actually move and aren't pinned near 0/1.
  const usable = [];
  for (const [id, pts] of byMarket) {
    pts.sort((a, b) => a.time - b.time);
    const closes = pts.map((p) => p.close);
    const min = Math.min(...closes), max = Math.max(...closes);
    if (pts.length >= 20 && min > 0.03 && max < 0.97 && max - min >= 0.01) {
      usable.push({ id, bars: pts.map((p) => ({ time: p.time, open: p.close, high: p.close, low: p.close, close: p.close, volume: 1 })) });
    }
  }
  // Most-active first so every window gets markets with real movement.
  usable.sort((a, b) => {
    const range = (m) => Math.max(...m.bars.map((x) => x.close)) - Math.min(...m.bars.map((x) => x.close));
    return range(b) - range(a);
  });
  console.log(`  ${usable.length} usable markets of ${byMarket.size}`);
  const WINDOWS = 10, PER_WINDOW = 8;
  for (let w = 0; w < WINDOWS; w++) {
    const symbols = {};
    for (let i = 0; i < PER_WINDOW; i++) {
      const m = usable[w + i * WINDOWS]; // stride so windows don't share markets
      if (m) symbols[`PM-${m.id}`] = m.bars;
    }
    writeGz(path.join(OUT_DIR, `prediction-w${w}.json.gz`), {
      source: "Polymarket via github.com/manja316/polymarket-historical-data (Yes mid prices, ~25-min cadence)",
      cadenceMinutes: 25, symbols,
    });
  }
}

// Long windows for slow strategies: 30 trading days at 15-min cadence.
// Pre-registered start dates (fixed before looking at results).
const LONG_STARTS = [
  "2012-02-01", "2012-09-04", "2013-04-01", "2013-11-04", "2014-06-02",
  "2015-01-05", "2015-08-03", "2016-04-04", "2017-02-01", "2018-03-01",
];
const LONG_BARS = 30 * 96; // ~30 days × 96 15-min bars/day (near-24h index CFDs)

function resample(bars, n) {
  const out = [];
  for (let i = 0; i + n <= bars.length; i += n) {
    const c = bars.slice(i, i + n);
    out.push({
      time: c.at(-1).time, open: c[0].open,
      high: Math.max(...c.map((b) => b.high)), low: Math.min(...c.map((b) => b.low)),
      close: c.at(-1).close, volume: c.reduce((a, b) => a + b.volume, 0),
    });
  }
  return out;
}

function ingestLongWindows(srcDir) {
  console.log("[ingest] stocks-long: 30-day windows at 15-min cadence");
  for (let w = 0; w < LONG_STARTS.length; w++) {
    const startTs = Date.parse(LONG_STARTS[w] + "T00:00:00Z");
    const year = +LONG_STARTS[w].slice(0, 4);
    const symbols = {};
    for (const inst of INSTRUMENTS) {
      const oneMin = [];
      for (const y of [year, year + 1]) {
        const f = path.join(srcDir, inst, `DAT_ASCII_${inst}_M1_${y}.csv`);
        if (!fs.existsSync(f)) continue;
        for (const b of histdataBars(f)) {
          if (b.time < startTs) continue;
          oneMin.push(b);
          if (oneMin.length >= LONG_BARS * 15) break;
        }
        if (oneMin.length >= LONG_BARS * 15) break;
      }
      const bars = resample(oneMin, 15).slice(0, LONG_BARS).map(round);
      if (bars.length >= LONG_BARS * 0.8) symbols[inst] = bars;
      else console.warn(`  ! ${inst} long window ${w}: only ${bars.length} bars, skipping`);
    }
    writeGz(path.join(OUT_DIR, `stocks-long-w${w}.json.gz`), {
      source: "histdata.com 1-min via github.com/FutureSharks/financial-data, resampled to 15-min",
      start: LONG_STARTS[w], cadenceMinutes: 15, symbols,
    });
  }
}

// Daily bars over the full 2010-2018 span, for multi-day holding strategies.
function ingestDaily(srcDir) {
  console.log("[ingest] stocks-daily: full-history daily bars");
  const symbols = {};
  for (const inst of INSTRUMENTS) {
    const days = new Map(); // yyyy-mm-dd -> {open,high,low,close,volume,time}
    for (let y = 2010; y <= 2018; y++) {
      const f = path.join(srcDir, inst, `DAT_ASCII_${inst}_M1_${y}.csv`);
      if (!fs.existsSync(f)) continue;
      for (const b of histdataBars(f)) {
        const day = new Date(b.time).toISOString().slice(0, 10);
        const d = days.get(day);
        if (!d) days.set(day, { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
        else {
          d.high = Math.max(d.high, b.high); d.low = Math.min(d.low, b.low);
          d.close = b.close; d.volume += b.volume; d.time = b.time;
        }
      }
    }
    symbols[inst] = [...days.values()].sort((a, b) => a.time - b.time).map(round);
    console.log(`  ${inst}: ${symbols[inst].length} daily bars`);
  }
  writeGz(path.join(OUT_DIR, `stocks-daily-w0.json.gz`), {
    source: "histdata.com 1-min via github.com/FutureSharks/financial-data, aggregated to daily, 2010-2018",
    cadenceMinutes: 1440, symbols,
  });
}

// Fair prediction windows: seeded-random selection among LIQUID markets
// (joined to the snapshot for liquidity), replacing the earlier top-range
// selection that biased toward trending markets (FINDINGS #2/#9). Writes NEW
// files prediction-fair-w*.json.gz; the original prediction-w* are left intact
// for audit.
function mulberry32b(seed) {
  return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function parseCsvB(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (inQ) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') inQ = false; else field += c; }
    else if (c === '"') inQ = true; else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else if (c !== "\r") field += c; }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function ingestPredictionFair(srcFile) {
  console.log("[ingest] prediction-fair: liquidity-filtered, seeded-random market selection");
  const snap = parseCsvB(zlib.gunzipSync(fs.readFileSync(path.join(OUT_DIR, "polymarket-markets-snapshot.csv.gz"))).toString());
  const HH = Object.fromEntries(snap[0].map((h, i) => [h, i]));
  const liq = new Map();
  for (const r of snap.slice(1)) if (r.length >= snap[0].length) liq.set(r[HH.market_id], parseFloat(r[HH.liquidity]) || 0);

  const lines = fs.readFileSync(srcFile, "utf8").trim().split("\n").slice(1);
  const byMkt = new Map();
  for (const l of lines) { const [id, outcome, price, ts] = l.split(","); if (outcome !== "Yes") continue; if (!byMkt.has(id)) byMkt.set(id, []); byMkt.get(id).push({ time: Date.parse(ts), close: +price }); }

  const usable = [];
  for (const [id, pts] of byMkt) {
    if ((liq.get(id) ?? 0) < 5000) continue;        // liquid markets only (real spreads ~0.1-0.3c)
    pts.sort((a, b) => a.time - b.time);
    const closes = pts.map((p) => p.close);
    if (pts.length >= 20 && Math.min(...closes) > 0.03 && Math.max(...closes) < 0.97 && Math.max(...closes) - Math.min(...closes) >= 0.02) {
      usable.push({ id, bars: pts.map((p) => ({ time: p.time, open: p.close, high: p.close, low: p.close, close: p.close, volume: 1 })) });
    }
  }
  // Seeded shuffle — NO ranking by range (removes the trend bias).
  const rng = mulberry32b(20260817);
  for (let i = usable.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [usable[i], usable[j]] = [usable[j], usable[i]]; }
  console.log(`  ${usable.length} liquid usable markets (liquidity ≥ $5k)`);
  const WINDOWS = 10, PER = 8;
  for (let w = 0; w < WINDOWS; w++) {
    const symbols = {};
    for (let i = 0; i < PER; i++) { const m = usable[w * PER + i]; if (m) symbols[`PM-${m.id}`] = m.bars; }
    writeGz(path.join(OUT_DIR, `prediction-fair-w${w}.json.gz`), { source: "Polymarket Yes prices, liquid markets (liq≥$5k), seeded-random selection — unbiased", cadenceMinutes: 25, symbols });
  }
}

const args = parseArgs(process.argv.slice(2));
fs.mkdirSync(OUT_DIR, { recursive: true });
if (args.only === "predictionFair" || args.only === "prediction-fair") { ingestPredictionFair(args.polySrc ?? POLY_SRC); }
else if (args.only === "long") { ingestLongWindows(args.stocksSrc ?? STOCKS_SRC); }
else if (args.only === "daily") { ingestDaily(args.stocksSrc ?? STOCKS_SRC); }
else {
  ingestStocks(args.stocksSrc ?? STOCKS_SRC);
  ingestPolymarket(args.polySrc ?? POLY_SRC);
  ingestLongWindows(args.stocksSrc ?? STOCKS_SRC);
  ingestDaily(args.stocksSrc ?? STOCKS_SRC);
}
console.log("[ingest] done");
