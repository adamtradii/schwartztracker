# Assumption-test findings

Running log of what the experiments in `engine/experiments/` actually showed.
Each cycle appends; nothing gets deleted. Studies are re-runnable:
`node engine/experiments/<name>.js`.

## 2026-08-16 — baseline studies (cycle 0)

### 1. Momentum on real 1-min index data: ASSUMPTION FAILS at tested timescales

`momentum-study.js` on 40 real symbol-windows (S&P 500 / DAX / Nikkei / EuroStoxx, 2012-2018):

- 1-minute return autocorrelation is **negative** (−0.045, positive in only 5/40 series): at the bar scale we trade, real index prices *mean-revert*, they don't trend. 5/15/60-min horizons are ~zero to slightly negative.
- Post-SMA-cross forward returns are positive but tiny: best config (30/90) earns **+1.3 to +1.4 bps gross** per cross vs ~6 bps round-trip cost at our slippage model. 9/21 earns ~0.2 bps — pure noise trading.

**Implications:** no SMA parameterization on 1-min index bars clears costs; the sim rewarded trend-following because its regime-drift generator trends more than real markets do. Leads worth testing: (a) short-horizon *mean-reversion* on stocks — the negative 1-min autocorrelation is itself an edge candidate; (b) resampling to slower bars where the 30/90-style edge might clear a lower-cost venue (index futures ≈1 bp).

### 2. Prediction-market reversion: WEAK, below costs at snapshot cadence

`reversion-study.js` on the full real Polymarket sample (1,005 usable market series):

- After a ≥5c move, the mean next move is **−0.33c** (reversion); after ≥8c, **−0.51c**. The overreaction assumption has the right *sign* in real data.
- But only ~35% of moves revert at all — the mean is carried by a minority of large reversals — and the effect is **smaller than the ~1c round-trip cost** at every threshold.
- Caution: the committed windows (selected for high range) show *continuation*, not reversion — selecting "active" markets biases toward trends. Selection method matters and the ingest should be revisited (random selection, not top-range).

**Implications:** fading on mid-price fills at snapshot cadence does not clear costs in this data. Leads: bigger thresholds only (≥8c), maker-side entries (earn the spread rather than pay it), and finer-cadence data if a reachable source appears.

### 3. Arbitrage: edge is entirely execution-cost; leg risk is secondary

`arb-stress.js`, simulated venue pairs, $500, 6 seeds per cell:

| Stress | Median return |
|---|---|
| 0.5c slip, all fills | +263% |
| 1c slip | **−52%** |
| 2c slip | **−78%** |
| 0.5c slip + 15% rejected legs | +235% |
| 1c slip + 10% rejected legs | −44% |

- Doubling slippage from 0.5c to 1c flips the system from +263% to −52%: with a 4c entry spread and 4 legs per round trip, 1c/leg consumes the entire gross edge.
- Rejected legs (even 15%) barely dent returns in this sim — spread convergence bails out naked legs more often than it punishes them — but this is the least realistic part of the sim and shouldn't be trusted as-is.

**Implications:** the arb profile is calibrated to 0.5c slippage and has no headroom. The entry threshold should scale with measured execution cost (entrySpread ≥ 4× per-leg cost + margin), and that adaptive rule needs implementing and stress-testing. Real cross-venue data remains unavailable in-sandbox; all arb numbers are simulation-only.

### Cross-cutting

The sim-vs-real gap (strategies profitable in sim, losing on real data) is now explained mechanistically for stocks: the simulator's GBM-with-drift-regimes trends more than real index prices at 1-min. The fix is honest strategy/timescale changes, never re-tuning the simulator toward the strategies.
