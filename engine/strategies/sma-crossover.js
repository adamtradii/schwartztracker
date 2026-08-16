import { sma } from "../lib/indicators.js";

// Momentum: go long when the fast SMA crosses above the slow SMA, exit on the
// cross back down. Classic trend-following on intraday bars.

const FAST = 9;
const SLOW = 21;

export const smaCrossover = {
  name: "sma-crossover",
  markets: ["stocks"],
  warmup: SLOW + 1,

  onBar({ closes, position }) {
    const fastNow = sma(closes, FAST);
    const slowNow = sma(closes, SLOW);
    const prev = closes.slice(0, -1);
    const fastPrev = sma(prev, FAST);
    const slowPrev = sma(prev, SLOW);
    if ([fastNow, slowNow, fastPrev, slowPrev].some((v) => v == null)) return null;

    const crossedUp = fastPrev <= slowPrev && fastNow > slowNow;
    const crossedDown = fastPrev >= slowPrev && fastNow < slowNow;

    if (!position && crossedUp) {
      return { action: "enter", side: "long", note: `SMA${FAST}>${SLOW} cross up` };
    }
    if (position?.side === "long" && crossedDown) {
      return { action: "exit", note: `SMA${FAST}<${SLOW} cross down` };
    }
    return null;
  },
};
