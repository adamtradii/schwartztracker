import { rsi, bollinger } from "../lib/indicators.js";

// Mean reversion: buy oversold dips (RSI < 30 near the lower Bollinger band),
// exit when RSI recovers past 55 or protective stops fire.

const RSI_PERIOD = 14;
const OVERSOLD = 30;
const RECOVERED = 55;

export const rsiMeanReversion = {
  name: "rsi-mean-reversion",
  markets: ["stocks"],
  warmup: 21,

  onBar({ closes, position }) {
    const r = rsi(closes, RSI_PERIOD);
    const bb = bollinger(closes, 20, 2);
    if (r == null || bb == null) return null;
    const price = closes.at(-1);

    if (!position && r < OVERSOLD && price <= bb.lower * 1.002) {
      return {
        action: "enter",
        side: "long",
        stopLossPct: 1.2,
        takeProfitPct: 2.0,
        note: `RSI ${r.toFixed(1)} oversold at lower band`,
      };
    }
    if (position?.side === "long" && r > RECOVERED) {
      return { action: "exit", note: `RSI recovered to ${r.toFixed(1)}` };
    }
    return null;
  },
};
