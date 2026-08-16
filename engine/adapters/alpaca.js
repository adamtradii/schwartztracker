// Alpaca adapter — US stocks. Defaults to the PAPER trading endpoint; no real
// money moves unless you explicitly set ALPACA_LIVE=1.
//
// Env:
//   ALPACA_KEY_ID, ALPACA_SECRET_KEY   (from https://app.alpaca.markets, paper keys)
//   ALPACA_LIVE=1                      (opt-in to the live endpoint — off by default)

const PAPER_URL = "https://paper-api.alpaca.markets";
const LIVE_URL = "https://api.alpaca.markets";
const DATA_URL = "https://data.alpaca.markets";

export class AlpacaAdapter {
  constructor({ symbols = ["AAPL", "TSLA", "NVDA", "SPY"], intervalMs = 60_000 } = {}) {
    this.market = "stocks";
    this.symbols = symbols;
    this.intervalMs = intervalMs;
    this.live = process.env.ALPACA_LIVE === "1";
    this.name = this.live ? "alpaca-LIVE" : "alpaca-paper";
    this.base = this.live ? LIVE_URL : PAPER_URL;
    this.key = process.env.ALPACA_KEY_ID;
    this.secret = process.env.ALPACA_SECRET_KEY;
  }

  headers() {
    return {
      "APCA-API-KEY-ID": this.key,
      "APCA-API-SECRET-KEY": this.secret,
      "content-type": "application/json",
    };
  }

  async connect() {
    if (!this.key || !this.secret) {
      throw new Error("Set ALPACA_KEY_ID and ALPACA_SECRET_KEY (paper keys from app.alpaca.markets)");
    }
    const res = await fetch(`${this.base}/v2/account`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Alpaca auth failed: ${res.status} ${await res.text()}`);
    const acct = await res.json();
    console.log(`[alpaca] connected (${this.live ? "LIVE" : "paper"}), equity $${acct.equity}`);
  }

  async history(symbol, bars) {
    const url = new URL(`${DATA_URL}/v2/stocks/${symbol}/bars`);
    url.searchParams.set("timeframe", "1Min");
    url.searchParams.set("limit", String(bars));
    url.searchParams.set("adjustment", "raw");
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Alpaca bars failed for ${symbol}: ${res.status}`);
    const data = await res.json();
    return (data.bars ?? []).map((b) => ({
      time: Date.parse(b.t), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
    }));
  }

  // Latest 1-min bar per symbol (polled once per interval by the paper loop).
  async nextBars() {
    const out = {};
    for (const symbol of this.symbols) {
      const url = new URL(`${DATA_URL}/v2/stocks/${symbol}/bars/latest`);
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) continue;
      const { bar } = await res.json();
      if (bar) out[symbol] = { time: Date.parse(bar.t), open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v };
    }
    return out;
  }

  async placeOrder({ symbol, side, qty }) {
    const res = await fetch(`${this.base}/v2/orders`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ symbol, qty: String(qty), side, type: "market", time_in_force: "day" }),
    });
    if (!res.ok) throw new Error(`Alpaca order failed: ${res.status} ${await res.text()}`);
    const order = await res.json();
    // Poll briefly for the fill price
    for (let i = 0; i < 10; i++) {
      const check = await fetch(`${this.base}/v2/orders/${order.id}`, { headers: this.headers() });
      const o = await check.json();
      if (o.status === "filled") {
        return { symbol, side, qty, fillPrice: parseFloat(o.filled_avg_price), status: "filled" };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { symbol, side, qty, fillPrice: null, status: "pending", orderId: order.id };
  }
}
