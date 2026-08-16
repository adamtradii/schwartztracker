# Lab Report

_Last run: 2026-08-16T12:31:34.327Z · $500 simulated bankroll per strategy · 10 seeds × 6000 one-minute bars each._

## Current performance

| Strategy | Market | Median return | Worst seed | Best seed | Median DD | Win rate | Trades | Score |
|---|---|---|---|---|---|---|---|---|
| sma-crossover | stocks | 13.09% | 8.38% | 22.94% | 2.72% | 33.3% | 2619 | 16.60 |
| rsi-mean-reversion | stocks | -6.82% | -13.37% | -4.50% | 7.28% | 23.0% | 225 | -15.32 |
| extreme-fade | prediction | 2.70% | 0.78% | 6.17% | 1.41% | 84.3% | 136 | 2.74 |
| venue-arb | prediction-arb | 13.55% | 9.68% | 18.77% | 1.43% | 54.9% | 1575 | 18.04 |

## Real-data validation

_Real historical data committed under `data/real/`: 1-min index bars (S&P 500, DAX, Nikkei, EuroStoxx; 2012-2018 windows) and Polymarket Yes prices at native ~25-min cadence. Windows play the role of seeds. These numbers are reported as they land — the simulator is never adjusted to make them look better._

| Strategy | Market | Median return | Worst window | Best window | Win rate | Trades |
|---|---|---|---|---|---|---|
| sma-crossover | stocks-real | -3.43% | -5.11% | -2.02% | 21.3% | 2701 |
| rsi-mean-reversion | stocks-real | -4.67% | -6.93% | -2.83% | 22.8% | 3266 |
| extreme-fade | prediction-real | -0.64% | -8.94% | 8.10% | 36.2% | 81 |

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
  },
  "sma-crossover": {
    "fast": 7,
    "slow": 50
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

_All results are simulated paper trading. A score that only improves on simulated data may not transfer to live markets._
