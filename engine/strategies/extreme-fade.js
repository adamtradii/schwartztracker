import { sma } from "../lib/indicators.js";

// Prediction-market strategy. Contracts trade between $0.01 and $0.99 and pay
// $1 or $0. Fades overreaction: a sharp move away from the recent average on
// news tends to overshoot and partially retrace — take the other side and exit
// on the retrace.

export const DEFAULTS = {
  trend: 20,        // bars in the trend average
  minJump: 0.06,    // single-bar move (in $) that counts as a spike
  minStretch: 0.08, // distance from the trend average required to fade
  stopDist: 0.08,   // stop distance in $
};

export function makeExtremeFade(params = {}) {
  const p = { ...DEFAULTS, ...params };
  return {
    name: "extreme-fade",
    markets: ["prediction"],
    warmup: p.trend + 1,
    params: p,

    onBar({ closes, position }) {
      const price = closes.at(-1);
      const prev = closes.at(-2);
      const avg = sma(closes, p.trend);
      if (avg == null) return null;

      if (position) {
        // Exit when price mean-reverts back through the trend average — but only
        // once the trade is in profit. Stops/targets handle the losing side.
        if (position.side === "short" && price <= avg && price < position.entryPrice) {
          return { action: "exit", note: "reverted to mean" };
        }
        if (position.side === "long" && price >= avg && price > position.entryPrice) {
          return { action: "exit", note: "reverted to mean" };
        }
        return null;
      }

      const jump = price - prev;

      if (jump > p.minJump && price - avg > p.minStretch && price < 0.9) {
        return {
          action: "enter", side: "short",
          stopPrice: Math.min(price + p.stopDist, 0.99),
          targetPrice: Math.max(avg, 0.01),
          note: `fading +${(jump * 100).toFixed(0)}c spike`,
        };
      }
      if (jump < -p.minJump && avg - price > p.minStretch && price > 0.1) {
        return {
          action: "enter", side: "long",
          stopPrice: Math.max(price - p.stopDist, 0.01),
          targetPrice: Math.min(avg, 0.99),
          note: `fading ${(jump * 100).toFixed(0)}c drop`,
        };
      }
      return null;
    },
  };
}
