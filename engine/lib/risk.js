// Risk manager: position sizing plus hard limits that every strategy signal
// must pass before an order goes out.

export const DEFAULT_RISK = {
  maxPositions: 4,          // concurrent open positions
  riskPerTradePct: 1.0,     // % of equity risked between entry and stop
  maxPositionPct: 25,       // max % of equity in a single position
  dailyLossLimitPct: 3.0,   // stop trading for the day past this drawdown
  stopLossPct: 1.5,         // default stop distance if strategy doesn't set one
  takeProfitPct: 3.0,       // default target if strategy doesn't set one
};

export class RiskManager {
  constructor(config = {}) {
    this.cfg = { ...DEFAULT_RISK, ...config };
    this.dayStartEquity = null;
    this.currentDay = null;
    this.haltedForDay = false;
  }

  // Call on every bar; resets the daily loss tracker at day boundaries.
  markDay(time, equity) {
    const day = new Date(time).toISOString().slice(0, 10);
    if (day !== this.currentDay) {
      this.currentDay = day;
      this.dayStartEquity = equity;
      this.haltedForDay = false;
    }
    if (
      !this.haltedForDay &&
      this.dayStartEquity > 0 &&
      (this.dayStartEquity - equity) / this.dayStartEquity >= this.cfg.dailyLossLimitPct / 100
    ) {
      this.haltedForDay = true;
    }
  }

  canOpen(portfolio) {
    if (this.haltedForDay) return { ok: false, why: "daily loss limit hit" };
    if (portfolio.positions.size >= this.cfg.maxPositions) return { ok: false, why: "max positions" };
    return { ok: true };
  }

  // Size a position from equity, price, and stop distance.
  // Prediction-market contracts are priced 0-1, so qty comes out in contracts naturally.
  size(equity, price, stopPrice) {
    const riskDollars = equity * (this.cfg.riskPerTradePct / 100);
    const perUnitRisk = Math.abs(price - stopPrice);
    if (perUnitRisk <= 0) return 0;
    let qty = Math.floor(riskDollars / perUnitRisk);
    const maxQty = Math.floor((equity * (this.cfg.maxPositionPct / 100)) / price);
    qty = Math.min(qty, maxQty);
    return Math.max(qty, 0);
  }

  stops(side, price, signal = {}) {
    const stopPct = (signal.stopLossPct ?? this.cfg.stopLossPct) / 100;
    const tpPct = (signal.takeProfitPct ?? this.cfg.takeProfitPct) / 100;
    const dir = side === "long" ? 1 : -1;
    return {
      stopPrice: signal.stopPrice ?? price * (1 - dir * stopPct),
      targetPrice: signal.targetPrice ?? price * (1 + dir * tpPct),
    };
  }

  // Returns an exit reason when a protective level is breached, else null.
  checkExit(pos, price) {
    if (pos.stopPrice != null) {
      if (pos.side === "long" && price <= pos.stopPrice) return "stop-loss";
      if (pos.side === "short" && price >= pos.stopPrice) return "stop-loss";
    }
    if (pos.targetPrice != null) {
      if (pos.side === "long" && price >= pos.targetPrice) return "take-profit";
      if (pos.side === "short" && price <= pos.targetPrice) return "take-profit";
    }
    return null;
  }
}
