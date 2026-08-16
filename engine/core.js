// Core bar-processing loop shared by the backtester and the paper trader.
// For each new bar: check protective exits, ask the strategy for a signal,
// pass it through risk, then hand orders to the adapter.

export class Engine {
  constructor({ adapter, strategy, portfolio, risk, log = console.log }) {
    if (!strategy.markets.includes(adapter.market)) {
      throw new Error(`Strategy "${strategy.name}" targets ${strategy.markets.join("/")} markets, adapter is ${adapter.market}`);
    }
    this.adapter = adapter;
    this.strategy = strategy;
    this.portfolio = portfolio;
    this.risk = risk;
    this.log = log;
    this.history = new Map(); // symbol -> bars (oldest first)
    this.maxHistory = 500;
    this.lastPrices = {};
    this.events = [];
  }

  pushBar(symbol, bar) {
    let bars = this.history.get(symbol);
    if (!bars) { bars = []; this.history.set(symbol, bars); }
    bars.push(bar);
    if (bars.length > this.maxHistory) bars.shift();
    this.lastPrices[symbol] = bar.close;
  }

  event(msg, time) {
    const e = { time, msg };
    this.events.push(e);
    if (this.events.length > 200) this.events.shift();
    this.log(`[${new Date(time).toISOString().slice(5, 16).replace("T", " ")}] ${msg}`);
  }

  async onBar(symbol, bar) {
    this.pushBar(symbol, bar);
    const bars = this.history.get(symbol);
    if (bars.length < (this.strategy.warmup ?? 30)) return;

    const price = bar.close;
    const position = this.portfolio.positions.get(symbol) ?? null;

    // 1. Protective exits always run, even when trading is halted for the day.
    if (position) {
      const exitReason = this.risk.checkExit(position, price);
      if (exitReason) {
        await this.executeExit(symbol, price, bar.time, exitReason);
        return;
      }
    }

    // 2. Strategy signal
    const signal = this.strategy.onBar({ symbol, bars, closes: bars.map((b) => b.close), position, all: this.history });
    if (!signal) return;

    if (signal.action === "exit" && position) {
      await this.executeExit(symbol, price, bar.time, signal.note ?? "signal");
      return;
    }

    if (signal.action === "enter" && !position) {
      const gate = this.risk.canOpen(this.portfolio);
      if (!gate.ok) return;

      const equity = this.portfolio.equity(this.lastPrices);
      const { stopPrice, targetPrice } = this.risk.stops(signal.side, price, signal);
      // Stocks allow fractional shares (Alpaca supports them); prediction
      // contracts are whole units.
      const qty = this.risk.size(equity, price, stopPrice, { fractional: this.adapter.market === "stocks" });
      if (qty <= 0) return;

      const orderSide = signal.side === "long" ? "buy" : "sell";
      const fill = await this.adapter.placeOrder({ symbol, side: orderSide, qty, price });
      if (fill.status !== "filled" || fill.fillPrice == null) return;

      this.portfolio.open(symbol, signal.side, qty, fill.fillPrice, bar.time, {
        stopPrice, targetPrice, strategy: this.strategy.name,
      });
      this.event(`OPEN ${signal.side.toUpperCase()} ${qty} ${symbol} @ ${fill.fillPrice.toFixed(4)} (${signal.note ?? ""})`, bar.time);
    }
  }

  async executeExit(symbol, price, time, reason) {
    const pos = this.portfolio.positions.get(symbol);
    const orderSide = pos.side === "long" ? "sell" : "buy";
    const fill = await this.adapter.placeOrder({ symbol, side: orderSide, qty: pos.qty, price });
    const fillPrice = fill.fillPrice ?? price;
    const trade = this.portfolio.close(symbol, fillPrice, time, reason);
    if (trade) {
      this.event(`CLOSE ${symbol} @ ${fillPrice.toFixed(4)} — ${reason} — P&L ${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}`, time);
    }
  }

  // Process one synchronized tick of bars across symbols.
  async onTick(barsBySymbol) {
    for (const [symbol, bar] of Object.entries(barsBySymbol)) {
      if (bar) await this.onBar(symbol, bar);
    }
    const times = Object.values(barsBySymbol).filter(Boolean).map((b) => b.time);
    if (times.length === 0) return;
    const t = Math.max(...times);
    this.portfolio.markEquity(this.lastPrices, t);
    this.risk.markDay(t, this.portfolio.equity(this.lastPrices));
  }

  state() {
    return {
      adapter: this.adapter.name,
      strategy: this.strategy.name,
      haltedForDay: this.risk.haltedForDay,
      cash: this.portfolio.cash,
      equity: this.portfolio.equity(this.lastPrices),
      unrealized: this.portfolio.unrealized(this.lastPrices),
      prices: this.lastPrices,
      positions: [...this.portfolio.positions.values()],
      trades: this.portfolio.trades.slice(-100),
      equityCurve: this.portfolio.equityCurve.slice(-2000),
      events: this.events.slice(-50),
      stats: this.portfolio.stats(),
      updatedAt: Date.now(),
    };
  }
}
