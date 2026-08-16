# Lab Report

_Last run: 2026-08-16T08:26:42.968Z · $500 simulated bankroll per strategy · 10 seeds × 6000 one-minute bars each._

## Current performance

| Strategy | Market | Median return | Worst seed | Best seed | Median DD | Win rate | Trades | Score |
|---|---|---|---|---|---|---|---|---|
| sma-crossover | stocks | 10.80% | 0.39% | 18.25% | 4.82% | 35.8% | 4634 | 9.79 |
| rsi-mean-reversion | stocks | -6.82% | -13.37% | -4.50% | 7.28% | 23.0% | 225 | -15.32 |
| extreme-fade | prediction | 2.70% | 0.78% | 6.17% | 1.41% | 84.3% | 136 | 2.74 |
| venue-arb | prediction-arb | 13.55% | 9.68% | 18.77% | 1.43% | 54.9% | 1575 | 18.04 |

## Tuned parameters

```json
{
  "rsi-mean-reversion": {
    "rsiPeriod": 21,
    "oversold": 20,
    "recovered": 50,
    "stopLossPct": 2.5,
    "takeProfitPct": 4
  }
}
```

## Score history (median-return robustness score per run)

| Run | Time | sma-crossover | rsi-mean-reversion | extreme-fade | venue-arb | Tuned |
|---|---|---|---|---|---|---|
| 1 | 08-16 08:26 | 9.79 | -24.51 | 2.74 | 18.04 | — |
| 2 | 08-16 08:26 | 9.79 | -15.32 | 2.74 | 18.04 | rsi-mean-reversion ✓ |

_All results are simulated paper trading. A score that only improves on simulated data may not transfer to live markets._
