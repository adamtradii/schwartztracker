// Kalshi adapter — regulated US prediction market. Defaults to the DEMO
// environment; set KALSHI_LIVE=1 to opt in to production.
//
// Env:
//   KALSHI_KEY_ID        (API key id from kalshi.com account settings)
//   KALSHI_PRIVATE_KEY   (path to the RSA private key PEM file, or the PEM itself)
//   KALSHI_LIVE=1        (opt-in to production — off by default)
//
// Prices are handled in dollars (0-1) throughout the engine; Kalshi's API uses
// cents, converted at the edge here. Long = buy YES, short = buy NO.

import crypto from "node:crypto";
import fs from "node:fs";

const DEMO_URL = "https://demo-api.kalshi.co/trade-api/v2";
const LIVE_URL = "https://api.elections.kalshi.com/trade-api/v2";

export class KalshiAdapter {
  constructor({ symbols = [], intervalMs = 60_000 } = {}) {
    this.market = "prediction";
    this.symbols = symbols; // Kalshi market tickers, e.g. "KXHIGHNY-26AUG16-B87.5"
    this.intervalMs = intervalMs;
    this.live = process.env.KALSHI_LIVE === "1";
    this.name = this.live ? "kalshi-LIVE" : "kalshi-demo";
    this.base = this.live ? LIVE_URL : DEMO_URL;
    this.keyId = process.env.KALSHI_KEY_ID;
    const pk = process.env.KALSHI_PRIVATE_KEY || "";
    this.privateKey = pk.includes("BEGIN") ? pk : (pk && fs.existsSync(pk) ? fs.readFileSync(pk, "utf8") : null);
  }

  sign(method, path) {
    const ts = String(Date.now());
    const msg = ts + method + path;
    const signature = crypto.sign("sha256", Buffer.from(msg), {
      key: this.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    }).toString("base64");
    return {
      "KALSHI-ACCESS-KEY": this.keyId,
      "KALSHI-ACCESS-SIGNATURE": signature,
      "KALSHI-ACCESS-TIMESTAMP": ts,
      "content-type": "application/json",
    };
  }

  async request(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: this.sign(method, "/trade-api/v2" + path),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Kalshi ${method} ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async connect() {
    if (!this.keyId || !this.privateKey) {
      throw new Error("Set KALSHI_KEY_ID and KALSHI_PRIVATE_KEY (demo credentials from kalshi.com)");
    }
    const { balance } = await this.request("GET", "/portfolio/balance");
    console.log(`[kalshi] connected (${this.live ? "LIVE" : "demo"}), balance $${(balance / 100).toFixed(2)}`);
    if (this.symbols.length === 0) {
      // Default to the most liquid open markets
      const data = await this.request("GET", "/markets?status=open&limit=5");
      this.symbols = (data.markets ?? []).map((m) => m.ticker);
      console.log(`[kalshi] auto-selected markets: ${this.symbols.join(", ")}`);
    }
  }

  async history(symbol, bars) {
    const end = Math.floor(Date.now() / 1000);
    const start = end - bars * 60;
    const data = await this.request(
      "GET",
      `/series/x/markets/${symbol}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=1`
    );
    return (data.candlesticks ?? []).map((c) => ({
      time: c.end_period_ts * 1000,
      open: (c.price?.open ?? c.yes_ask?.open ?? 0) / 100,
      high: (c.price?.high ?? 0) / 100,
      low: (c.price?.low ?? 0) / 100,
      close: (c.price?.close ?? c.yes_ask?.close ?? 0) / 100,
      volume: c.volume ?? 0,
    }));
  }

  async nextBars() {
    const out = {};
    for (const symbol of this.symbols) {
      try {
        const { market } = await this.request("GET", `/markets/${symbol}`);
        const mid = ((market.yes_bid + market.yes_ask) / 2) / 100;
        out[symbol] = { time: Date.now(), open: mid, high: mid, low: mid, close: mid, volume: market.volume ?? 0 };
      } catch { /* market may have closed; skip this tick */ }
    }
    return out;
  }

  // side "buy" opens/adds YES exposure, "sell" is expressed as buying NO.
  async placeOrder({ symbol, side, qty, price }) {
    const order = {
      ticker: symbol,
      client_order_id: crypto.randomUUID(),
      side: side === "buy" ? "yes" : "no",
      action: "buy",
      count: qty,
      type: "market",
    };
    const { order: placed } = await this.request("POST", "/portfolio/orders", order);
    return { symbol, side, qty, fillPrice: price, status: placed.status ?? "filled" };
  }
}
