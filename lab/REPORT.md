# Lab Report

_Last run: 2026-08-17T04:32:13.867Z · $500 simulated bankroll per strategy · 10 seeds × 6000 one-minute bars each._

## Current performance

| Strategy | Market | Median return | Worst seed | Best seed | Median DD | Win rate | Trades | Score |
|---|---|---|---|---|---|---|---|---|
| sma-crossover | stocks | 13.09% | 8.38% | 22.94% | 2.72% | 33.3% | 2619 | 16.60 |
| rsi-mean-reversion | stocks | -6.11% | -12.01% | -3.80% | 6.82% | 20.7% | 315 | -13.83 |
| extreme-fade | prediction | 0.37% | -0.19% | 1.23% | 0.11% | 50.0% | 11 | 0.25 |
| venue-arb | prediction-arb | -0.13% | -0.73% | 0.89% | 0.34% | 16.8% | 35 | -0.58 |

## Real-data validation

_Real historical data committed under `data/real/`: 1-min index bars (S&P 500, DAX, Nikkei, EuroStoxx; 2012-2018 windows) and Polymarket Yes prices at native ~25-min cadence. Windows play the role of seeds. These numbers are reported as they land — the simulator is never adjusted to make them look better._

| Strategy | Market | Median return | Worst window | Best window | Win rate | Trades |
|---|---|---|---|---|---|---|
| sma-crossover | stocks-real | 0.40% | -1.68% | 3.05% | 45.3% | 97 |
| rsi-mean-reversion | stocks-real | -4.67% | -6.93% | -2.83% | 22.8% | 3266 |
| extreme-fade | prediction-real | -2.58% | -14.48% | 13.11% | 33.2% | 82 |

## Goal: 3%+/month (stretch 5%+) with max drawdown ≤ 15% — ❌ NOT YET

_$500 per system, measured over ~1 month per run. "real" = real historical windows; "sim" = simulator only (no real data available at the cadence needed). Pass needs the return target AND the drawdown cap together._

| Strategy | Data | Median monthly | Worst | Best | Median DD | Worst DD | Status |
|---|---|---|---|---|---|---|---|
| sma-crossover | real | -3.78% | -14.47% | 0.02% | 9.2% | 15.6% | ❌ |
| rsi-mean-reversion | real | -6.74% | -17.49% | 6.89% | 12.6% | 21.2% | ❌ |
| extreme-fade | sim | -14.91% | -23.35% | 10.41% | 20.3% | 24.4% | ❌ |
| venue-arb | sim | 5.21% | -13.74% | 22.01% | 9.1% | 14.2% | 🚀 stretch |

_The old 3x-in-72-hours goal was retired 2026-08-16: it required ruin-level risk settings. Push returns higher only while the drawdown cap holds._

## Tuned parameters

```json
{
  "rsi-mean-reversion": {
    "rsiPeriod": 21,
    "oversold": 20,
    "recovered": 50,
    "stopLossPct": 1.2,
    "takeProfitPct": 2
  },
  "sma-crossover": {
    "fast": 7,
    "slow": 50
  },
  "venue-arb": {
    "entrySpread": 0.04,
    "exitSpread": 0.01,
    "stopSpread": 0.12
  },
  "extreme-fade": {
    "trend": 40,
    "minJump": 0.04,
    "minStretch": 0.08,
    "stopDist": 0.05
  }
}
```

## Score history (median-return robustness score per run)

| Run | Time | sma-crossover | rsi-mean-reversion | extreme-fade | venue-arb | Tuned |
|---|---|---|---|---|---|---|
| 1 | 08-16 08:26 | 9.79 | -24.51 | 2.74 | 18.04 | — |
| 2 | 08-16 08:26 | 9.79 | -15.32 | 2.74 | 18.04 | rsi-mean-reversion ✓ |
| 3 | 08-16 08:44 | 9.79 | -15.32 | 2.74 | 18.04 | — |
| 4 | 08-16 09:32 | 9.79 | -15.32 | 2.74 | 18.04 | — |
| 5 | 08-16 12:31 | 16.60 | -15.32 | 2.74 | 18.04 | sma-crossover ✓ |
| 6 | 08-16 16:32 | 16.60 | -13.83 | 2.74 | 18.04 | rsi-mean-reversion ✓ |
| 7 | 08-16 18:14 | 16.60 | -13.83 | 2.74 | 18.04 | — |
| 8 | 08-16 21:14 | 16.60 | -13.83 | 0.03 | 12.48 | venue-arb ✓ |
| 9 | 08-16 21:15 | 16.60 | -13.83 | 0.03 | -0.49 | — |
| 10 | 08-17 00:34 | 16.60 | -13.83 | 0.03 | -0.58 | rsi-mean-reversion |
| 11 | 08-17 04:32 | 16.60 | -13.83 | 0.25 | -0.58 | extreme-fade ✓ |

_All results are simulated paper trading. A score that only improves on simulated data may not transfer to live markets._
