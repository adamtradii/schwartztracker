// Tracks cash, open positions, and closed trades. Market-agnostic:
// a "position" can be shares of a stock or contracts on a prediction market.

export class Portfolio {
  constructor(startingCash, { margin = 1 } = {}) {
    this.startingCash = startingCash;
    this.margin = margin;       // intraday buying power multiple (1 = cash account)
    this.cash = startingCash;
    this.positions = new Map(); // symbol -> { symbol, qty, entryPrice, entryTime, side }
    this.trades = [];           // closed trades
    this.equityCurve = [];      // { time, equity }
  }

  get openSymbols() {
    return [...this.positions.keys()];
  }

  // Total gross exposure (longs + shorts) at entry prices, for the margin check.
  grossExposure() {
    let e = 0;
    for (const p of this.positions.values()) e += p.qty * p.entryPrice;
    return e;
  }

  open(symbol, side, qty, price, time, meta = {}) {
    const cost = qty * price;
    // Margin accounts borrow: cash may go negative, but GROSS exposure
    // (longs + shorts alike) is capped at margin × current equity. Interest
    // is ignored (intraday horizon).
    const prices = {};
    for (const p of this.positions.values()) prices[p.symbol] = p.entryPrice;
    if (this.grossExposure() + cost > this.margin * this.equity(prices)) return null;
    if (side === "long") this.cash -= cost;
    // Shorts credit cash on entry; margin is not modeled — risk limits cap exposure instead.
    if (side === "short") this.cash += cost;
    const pos = { symbol, side, qty, entryPrice: price, entryTime: time, ...meta };
    this.positions.set(symbol, pos);
    return pos;
  }

  close(symbol, price, time, reason = "signal") {
    const pos = this.positions.get(symbol);
    if (!pos) return null;
    const dir = pos.side === "long" ? 1 : -1;
    const pnl = dir * (price - pos.entryPrice) * pos.qty;
    if (pos.side === "long") this.cash += pos.qty * price;
    else this.cash -= pos.qty * price;
    this.positions.delete(symbol);
    const trade = {
      symbol, side: pos.side, qty: pos.qty,
      entryPrice: pos.entryPrice, exitPrice: price,
      entryTime: pos.entryTime, exitTime: time,
      pnl, reason, strategy: pos.strategy || null,
    };
    this.trades.push(trade);
    return trade;
  }

  unrealized(prices) {
    let u = 0;
    for (const pos of this.positions.values()) {
      const p = prices[pos.symbol];
      if (p == null) continue;
      const dir = pos.side === "long" ? 1 : -1;
      u += dir * (p - pos.entryPrice) * pos.qty;
    }
    return u;
  }

  // Equity = cash + market value of longs - buyback cost of shorts.
  equity(prices) {
    let eq = this.cash;
    for (const pos of this.positions.values()) {
      const p = prices[pos.symbol] ?? pos.entryPrice;
      if (pos.side === "long") eq += pos.qty * p;
      else eq -= pos.qty * p;
    }
    return eq;
  }

  markEquity(prices, time) {
    this.equityCurve.push({ time, equity: this.equity(prices) });
  }

  stats() {
    const wins = this.trades.filter((t) => t.pnl > 0);
    const losses = this.trades.filter((t) => t.pnl <= 0);
    const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
    const last = this.equityCurve.at(-1);
    const finalEquity = last ? last.equity : this.cash;
    let peak = -Infinity, maxDrawdown = 0;
    for (const { equity } of this.equityCurve) {
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
    }
    return {
      startingCash: this.startingCash,
      finalEquity,
      totalReturnPct: ((finalEquity - this.startingCash) / this.startingCash) * 100,
      trades: this.trades.length,
      winRate: this.trades.length ? (wins.length / this.trades.length) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? -grossLoss / losses.length : 0,
      maxDrawdownPct: maxDrawdown * 100,
    };
  }
}
