// Strategy contract (instances come from per-strategy factories):
//   { name, markets, warmup, params, onBar(ctx) }
// ctx = { symbol, bars, closes, position, all }
//   bars oldest-first; position may be null; all = Map(symbol -> bars) so
//   cross-symbol strategies (arbitrage) can see the whole book.
// onBar returns null, or a signal:
//   { action: "enter", side: "long"|"short", stopLossPct?, takeProfitPct?, stopPrice?, targetPrice?, note? }
//   { action: "exit", note? }
//
// Tuned parameters live in engine/params.json (written by engine/lab.js) and
// are merged over each strategy's DEFAULTS; explicit overrides win over both.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSmaCrossover, DEFAULTS as SMA_DEFAULTS } from "./sma-crossover.js";
import { makeRsiMeanReversion, DEFAULTS as RSI_DEFAULTS } from "./rsi-mean-reversion.js";
import { makeExtremeFade, DEFAULTS as FADE_DEFAULTS } from "./extreme-fade.js";
import { makeVenueArb, DEFAULTS as ARB_DEFAULTS } from "./venue-arb.js";

export const STRATEGIES = {
  "sma-crossover": { make: makeSmaCrossover, defaults: SMA_DEFAULTS },
  "rsi-mean-reversion": { make: makeRsiMeanReversion, defaults: RSI_DEFAULTS },
  "extreme-fade": { make: makeExtremeFade, defaults: FADE_DEFAULTS },
  "venue-arb": { make: makeVenueArb, defaults: ARB_DEFAULTS },
};

const PARAMS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "params.json");

export function loadTunedParams() {
  try {
    return JSON.parse(fs.readFileSync(PARAMS_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function saveTunedParams(all) {
  fs.writeFileSync(PARAMS_PATH, JSON.stringify(all, null, 2) + "\n");
}

export function getStrategy(name, overrides = {}) {
  const entry = STRATEGIES[name];
  if (!entry) {
    throw new Error(`Unknown strategy "${name}". Available: ${Object.keys(STRATEGIES).join(", ")}`);
  }
  const tuned = loadTunedParams()[name] ?? {};
  return entry.make({ ...tuned, ...overrides });
}
