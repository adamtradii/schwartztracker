# Lab Report

_Last run: 2026-08-17T16:32:04.888Z · $500 simulated bankroll per strategy · 10 seeds × 6000 one-minute bars each._

## Current performance

| Strategy | Market | Median return | Worst seed | Best seed | Median DD | Win rate | Trades | Score |
|---|---|---|---|---|---|---|---|---|
| sma-crossover | stocks | 13.09% | 8.38% | 22.94% | 2.72% | 33.3% | 2619 | 16.60 |
| rsi-mean-reversion | stocks | -5.82% | -10.86% | -3.58% | 6.18% | 18.7% | 390 | -12.80 |
| extreme-fade | prediction | 0.37% | -0.19% | 1.23% | 0.11% | 50.0% | 11 | 0.25 |
| venue-arb | prediction-arb | -0.08% | -0.34% | 0.43% | 0.18% | 18.3% | 27 | -0.29 |

## Real-data validation

_Real historical data committed under `data/real/`: 1-min index bars (S&P 500, DAX, Nikkei, EuroStoxx; 2012-2018 windows) and Polymarket Yes prices at native ~25-min cadence. Windows play the role of seeds. These numbers are reported as they land — the simulator is never adjusted to make them look better._

| Strategy | Market | Median return | Worst window | Best window | Win rate | Trades |
|---|---|---|---|---|---|---|
| sma-crossover | stocks-real | 0.40% | -1.68% | 3.05% | 45.3% | 97 |
| rsi-mean-reversion | stocks-real | -4.67% | -6.93% | -2.83% | 22.8% | 3266 |
| extreme-fade | prediction-fair-real | 0.00% | -1.79% | 4.54% | 39.8% | 18 |

## Goal: 3%+/month (stretch 5%+) with max drawdown ≤ 15% — ❌ NOT YET

_$500 per system, measured over ~1 month per run. "real" = real historical windows; "sim" = simulator only (no real data available at the cadence needed). Pass needs the return target AND the drawdown cap together._

| Strategy | Data | Median monthly | Worst | Best | Median DD | Worst DD | Status |
|---|---|---|---|---|---|---|---|
| sma-crossover | real | -3.78% | -14.47% | 0.02% | 9.2% | 15.6% | ❌ |
| rsi-mean-reversion | real | -6.74% | -17.49% | 6.89% | 12.6% | 21.2% | ❌ |
| extreme-fade | sim | -14.91% | -23.35% | 10.41% | 20.3% | 24.4% | ❌ |
| venue-arb | sim | 4.75% | -6.43% | 13.87% | 4.7% | 6.4% | ✅ pass |

_The old 3x-in-72-hours goal was retired 2026-08-16: it required ruin-level risk settings. Push returns higher only while the drawdown cap holds._

## Tuned parameters

```json
{
  "rsi-mean-reversion": {
    "rsiPeriod": 21,
    "oversold": 20,
    "recovered": 50,
    "stopLossPct": 0.8,
    "takeProfitPct": 4
  },
  "sma-crossover": {
    "fast": 7,
    "slow": 50
  },
  "venue-arb": {
    "entrySpread": 0.05,
    "exitSpread": 0.005,
    "stopSpread": 0.2
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
| 12 | 08-17 08:33 | 16.60 | -13.83 | 0.25 | -0.29 | venue-arb ✓ |
| 13 | 08-17 12:46 | 16.60 | -13.83 | 0.25 | -0.29 | sma-crossover |
| 14 | 08-17 16:32 | 16.60 | -12.80 | 0.25 | -0.29 | rsi-mean-reversion ✓ |

_All results are simulated paper trading. A score that only improves on simulated data may not transfer to live markets._
