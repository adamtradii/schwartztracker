import { sma } from "../lib/indicators.js";

// Momentum: go long when the fast SMA crosses above the slow SMA, exit on the
// cross back down. Classic trend-following on intraday bars.

export const DEFAULTS = { fast: 9, slow: 21 };

export function makeSmaCrossover(params = {}) {
  const p = { ...DEFAULTS, ...params };
  return {
    name: "sma-crossover",
    markets: ["stocks"],
    warmup: p.slow + 1,
    params: p,

    onBar({ closes, position }) {
      const fastNow = sma(closes, p.fast);
      const slowNow = sma(closes, p.slow);
      const prev = closes.slice(0, -1);
      const fastPrev = sma(prev, p.fast);
      const slowPrev = sma(prev, p.slow);
      if ([fastNow, slowNow, fastPrev, slowPrev].some((v) => v == null)) return null;

      const crossedUp = fastPrev <= slowPrev && fastNow > slowNow;
      const crossedDown = fastPrev >= slowPrev && fastNow < slowNow;

      if (!position && crossedUp) {
        return { action: "enter", side: "long", note: `SMA${p.fast}>${p.slow} cross up` };
      }
      if (position?.side === "long" && crossedDown) {
        return { action: "exit", note: `SMA${p.fast}<${p.slow} cross down` };
      }
      return null;
    },
  };
}
