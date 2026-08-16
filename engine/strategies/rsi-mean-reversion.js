import { rsi, bollinger, sma } from "../lib/indicators.js";

// RSI strategy with two modes:
//   "reversion": buy oversold dips (RSI < oversold near the lower Bollinger
//     band), exit when RSI recovers. The original form — it consistently lost
//     in lab testing because intraday regimes reward momentum, so dips keep
//     dipping.
//   "momentum": trade RSI strength instead — long when RSI crosses up through
//     `breakout`, short (optional) when it crosses down through 100-breakout,
//     exit when RSI falls back through `fade`.

export const DEFAULTS = {
  mode: "reversion",
  rsiPeriod: 14,
  oversold: 30,
  recovered: 55,
  breakout: 65,   // momentum mode: RSI cross above this = long
  fade: 50,       // momentum mode: RSI back through this = exit
  allowShort: false,
  bbPeriod: 20,
  bbMult: 2,
  stopLossPct: 1.2,
  takeProfitPct: 2.0,
  trendFilter: 0, // only buy dips when price is above this SMA (0 = off)
};

export function makeRsiMeanReversion(params = {}) {
  const p = { ...DEFAULTS, ...params };
  return {
    name: "rsi-mean-reversion",
    markets: ["stocks"],
    warmup: Math.max(p.rsiPeriod + 2, p.bbPeriod + 1, p.trendFilter + 1),
    params: p,

    onBar({ closes, position }) {
      const r = rsi(closes, p.rsiPeriod);
      const bb = bollinger(closes, p.bbPeriod, p.bbMult);
      if (r == null || bb == null) return null;
      const price = closes.at(-1);

      if (p.mode === "momentum") {
        const rPrev = rsi(closes.slice(0, -1), p.rsiPeriod);
        if (rPrev == null) return null;
        if (position?.side === "long" && r < p.fade) return { action: "exit", note: `RSI faded to ${r.toFixed(1)}` };
        if (position?.side === "short" && r > 100 - p.fade) return { action: "exit", note: `RSI recovered to ${r.toFixed(1)}` };
        if (!position && rPrev <= p.breakout && r > p.breakout) {
          return { action: "enter", side: "long", stopLossPct: p.stopLossPct, takeProfitPct: p.takeProfitPct, note: `RSI breakout ${r.toFixed(1)}` };
        }
        if (!position && p.allowShort && rPrev >= 100 - p.breakout && r < 100 - p.breakout) {
          return { action: "enter", side: "short", stopLossPct: p.stopLossPct, takeProfitPct: p.takeProfitPct, note: `RSI breakdown ${r.toFixed(1)}` };
        }
        return null;
      }

      if (p.trendFilter > 0) {
        const trend = sma(closes, p.trendFilter);
        if (trend == null || price < trend) {
          // Downtrend: don't catch falling knives; exit longs on the strategy's
          // normal RSI-recovery rule below.
          if (!position) return null;
        }
      }
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
