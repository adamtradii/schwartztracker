// Strategy contract:
//   { name, markets: ["stocks"|"prediction"], warmup, onBar(ctx) }
// ctx = { symbol, bars, closes, position }  (bars oldest-first, position may be null)
// onBar returns null, or a signal:
//   { action: "enter", side: "long"|"short", stopLossPct?, takeProfitPct?, stopPrice?, targetPrice?, note? }
//   { action: "exit", note? }

import { smaCrossover } from "./sma-crossover.js";
import { rsiMeanReversion } from "./rsi-mean-reversion.js";
import { extremeFade } from "./extreme-fade.js";

export const STRATEGIES = {
  "sma-crossover": smaCrossover,
  "rsi-mean-reversion": rsiMeanReversion,
  "extreme-fade": extremeFade,
};

export function getStrategy(name) {
  const s = STRATEGIES[name];
  if (!s) {
    throw new Error(`Unknown strategy "${name}". Available: ${Object.keys(STRATEGIES).join(", ")}`);
  }
  return s;
}
