import { sma } from "../lib/indicators.js";

// Prediction-market strategy. Contracts trade between $0.01 and $0.99 and pay
// $1 or $0. Fades overreaction: a sharp move away from the recent average on
// news tends to overshoot and partially retrace — take the other side and exit
// on the retrace.

const TREND = 20;

export const extremeFade = {
  name: "extreme-fade",
  markets: ["prediction"],
  warmup: TREND + 1,

  onBar({ closes, position }) {
    const price = closes.at(-1);
    const prev = closes.at(-2);
    const avg = sma(closes, TREND);
    if (avg == null) return null;

    if (position) {
      // Exit when price mean-reverts back through the trend average — but only
      // once the trade is in profit, since the longshot fade enters with price
      // already below the average. Stops/targets handle the losing side.
      if (position.side === "short" && price <= avg && price < position.entryPrice) {
        return { action: "exit", note: "reverted to mean" };
      }
      if (position.side === "long" && price >= avg && price > position.entryPrice) {
        return { action: "exit", note: "reverted to mean" };
      }
      return null;
    }

    const jump = price - prev;

    // Overreaction fade: >6c single-bar move stretched >8c beyond the average.
    if (jump > 0.06 && price - avg > 0.08 && price < 0.9) {
      return {
        action: "enter", side: "short",
        stopPrice: Math.min(price + 0.08, 0.99),
        targetPrice: Math.max(avg, 0.01),
        note: `fading +${(jump * 100).toFixed(0)}c spike`,
      };
    }
    if (jump < -0.06 && avg - price > 0.08 && price > 0.1) {
      return {
        action: "enter", side: "long",
        stopPrice: Math.max(price - 0.08, 0.01),
        targetPrice: Math.min(avg, 0.99),
        note: `fading ${(jump * 100).toFixed(0)}c drop`,
      };
    }
    return null;
  },
};
