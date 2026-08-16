# Lab Report

_Last run: 2026-08-16T08:44:42.639Z · $500 simulated bankroll per strategy · 10 seeds × 6000 one-minute bars each._

## Current performance

| Strategy | Market | Median return | Worst seed | Best seed | Median DD | Win rate | Trades | Score |
|---|---|---|---|---|---|---|---|---|
| sma-crossover | stocks | 10.80% | 0.39% | 18.25% | 4.82% | 35.8% | 4634 | 9.79 |
| rsi-mean-reversion | stocks | -6.82% | -13.37% | -4.50% | 7.28% | 23.0% | 225 | -15.32 |
| extreme-fade | prediction | 2.70% | 0.78% | 6.17% | 1.41% | 84.3% | 136 | 2.74 |
| venue-arb | prediction-arb | 13.55% | 9.68% | 18.77% | 1.43% | 54.9% | 1575 | 18.04 |

## Goal: $500 → $1500 in 72 simulated hours (4320 bars) — ✅ ALL SYSTEMS PASS

| Strategy | Median equity | Worst seed | Best seed | Seeds ≥ target | Pass |
|---|---|---|---|---|---|
| sma-crossover | $2117 | $1627 | $3374 | 10/10 | ✅ |
| rsi-mean-reversion | $2949 | $1963 | $3733 | 10/10 | ✅ |
| extreme-fade | $2872 | $723 | $4050 | 6/10 | ✅ |
| venue-arb | $1917 | $770 | $3690 | 7/10 | ✅ |

_Goal profiles (engine/goal-profiles.json) are deliberately aggressive: 4x intraday margin on stocks, 15-30% risk per trade. This level of risk is how accounts blow up in real markets — it exists to chase the 3x-in-72h goal in simulation, not as a recommendation._

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
| 3 | 08-16 08:44 | 9.79 | -15.32 | 2.74 | 18.04 | — |

_All results are simulated paper trading. A score that only improves on simulated data may not transfer to live markets._
