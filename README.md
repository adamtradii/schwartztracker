# Day Trader

An algorithmic day-trading system that works on **stocks** and **prediction markets** through a pluggable market-adapter layer, with a backtester, risk management, and a live React dashboard.

**Paper trading by default.** The Alpaca adapter points at the paper endpoint and the Kalshi adapter points at the demo environment unless you explicitly opt in to live trading with an environment variable. Nothing in this repo is financial advice; day trading routinely loses money, so test strategies thoroughly in paper mode first.

## Quick start (no API keys needed)

```bash
npm install

# Backtest the default stock strategy on simulated data
npm run backtest

# Backtest a prediction-market strategy
npm run backtest -- --market prediction --strategy extreme-fade

# Run the paper trader on a fast simulated feed
npm run paper

# In another terminal: the dashboard (http://localhost:3000)
npm run dev
```

The dashboard shows the live engine when `npm run paper` is running, and otherwise falls back to the most recent backtest result.

## Architecture

```
engine/
  core.js               bar loop: exits → strategy signal → risk gate → order
  backtest.js           replays bars through the engine, prints stats
  paper.js              live loop + state server on :8787 for the dashboard
  lib/
    indicators.js       SMA, EMA, RSI, VWAP, Bollinger, stddev
    portfolio.js        cash, positions, closed trades, equity curve, stats
    risk.js             position sizing, stops, max positions, daily loss limit
  strategies/
    sma-crossover.js       stocks — 9/21 SMA momentum
    rsi-mean-reversion.js  stocks — buy oversold dips at the lower Bollinger band
    extreme-fade.js        prediction — fade news overreactions, exit on retrace
  adapters/
    simulated.js        deterministic synthetic data, zero keys required
    alpaca.js           US stocks (paper by default)
    kalshi.js           prediction markets (demo by default)
src/                    React dashboard (Vite + Recharts)
```

Everything is priced in dollars end to end — a stock share or a 0–1 prediction contract flows through the same portfolio, risk, and strategy machinery.

## Risk management

Every entry signal passes through `engine/lib/risk.js`:

- **Position sizing** — risks a fixed % of equity (default 1%) between entry and stop
- **Max concurrent positions** (default 4) and **max % of equity per position** (default 25%)
- **Stop-loss / take-profit** on every position, strategy-overridable
- **Daily loss limit** (default 3%) — new entries halt for the rest of the day; protective exits keep running

## Connecting real (paper) accounts

### Alpaca — stocks

Create free paper keys at [app.alpaca.markets](https://app.alpaca.markets), then:

```bash
export ALPACA_KEY_ID=...
export ALPACA_SECRET_KEY=...
npm run paper -- --adapter alpaca --symbols AAPL,MSFT,NVDA --strategy rsi-mean-reversion
```

### Kalshi — prediction markets

Create demo API credentials at [kalshi.com](https://kalshi.com) (an API key id plus an RSA private key), then:

```bash
export KALSHI_KEY_ID=...
export KALSHI_PRIVATE_KEY=/path/to/private-key.pem
npm run paper -- --adapter kalshi
```

With no `--symbols`, the Kalshi adapter picks the most liquid open markets automatically.

### Going live

Live endpoints require an explicit opt-in (`ALPACA_LIVE=1` or `KALSHI_LIVE=1`). Don't do this until a strategy has survived a long stretch of paper trading — and even then, expect the live edge to be smaller than the paper one.

## CLI flags

| Flag | Applies to | Meaning |
|---|---|---|
| `--market stocks\|prediction` | backtest, sim paper | which simulated market to generate |
| `--strategy <name>` | both | `sma-crossover`, `rsi-mean-reversion`, `extreme-fade` |
| `--adapter simulated\|alpaca\|kalshi` | paper | data + execution venue |
| `--symbols A,B,C` | both | override the symbol list |
| `--bars N` | backtest | number of 1-minute bars to replay |
| `--cash N` | both | starting cash (default 25,000) |
| `--seed N` | backtest, sim | RNG seed for reproducible simulated data |
| `--interval N` | paper | seconds between ticks |

## Writing a strategy

Add a file to `engine/strategies/` and register it in `strategies/index.js`:

```js
export const myStrategy = {
  name: "my-strategy",
  markets: ["stocks"],        // or ["prediction"], or both
  warmup: 30,                 // bars of history needed before signals
  onBar({ symbol, bars, closes, position }) {
    // return null, or:
    // { action: "enter", side: "long"|"short", stopLossPct?, takeProfitPct?, note? }
    // { action: "exit", note? }
  },
};
```

Backtest it against several seeds before trusting it: `npm run backtest -- --strategy my-strategy --seed 1` (then 2, 3, …). A strategy that only wins on one seed is fitting noise.
