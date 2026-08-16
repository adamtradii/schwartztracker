import { rsi, bollinger } from "../lib/indicators.js";

// Mean reversion: buy oversold dips (RSI < oversold near the lower Bollinger
// band), exit when RSI recovers or protective stops fire.

export const DEFAULTS = {
  rsiPeriod: 14,
  oversold: 30,
  recovered: 55,
  bbPeriod: 20,
  bbMult: 2,
  stopLossPct: 1.2,
  takeProfitPct: 2.0,
};

export function makeRsiMeanReversion(params = {}) {
  const p = { ...DEFAULTS, ...params };
  return {
    name: "rsi-mean-reversion",
    markets: ["stocks"],
    warmup: Math.max(p.rsiPeriod + 2, p.bbPeriod + 1),
    params: p,

    onBar({ closes, position }) {
      const r = rsi(closes, p.rsiPeriod);
      const bb = bollinger(closes, p.bbPeriod, p.bbMult);
      if (r == null || bb == null) return null;
      const price = closes.at(-1);

      if (!position && r < p.oversold && price <= bb.lower * 1.002) {
        return {
          action: "enter",
          side: "long",
          stopLossPct: p.stopLossPct,
          takeProfitPct: p.takeProfitPct,
          note: `RSI ${r.toFixed(1)} oversold at lower band`,
        };
      }
      if (position?.side === "long" && r > p.recovered) {
        return { action: "exit", note: `RSI recovered to ${r.toFixed(1)}` };
      }
      return null;
    },
  };
}
