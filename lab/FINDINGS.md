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

## 2026-08-16 12:29Z — cycle 1

### 4. Stocks 1-min mean reversion: NOT TRADEABLE — the autocorrelation is real but worthless

`stock-reversion-study.js`: fade k-sigma 1-min moves (k ∈ 2-4), hold 5-30 bars, 6 bps round-trip cost, 40 real symbol-windows:

- Every cell of the grid is net-negative (−5.8 to −9.9 bps/trade) and **negative in 10/10 windows**. Mean net ≈ −6 bps means gross ≈ 0: after a large 1-min move, the next 5-30 minutes are a coin flip.
- The −0.045 autocorrelation from study #1 is spread thinly across all bars — it does not concentrate after big moves, so there's no entry filter to harvest it. Win rates 19-34% with the negative skew typical of fading.

**Conclusion:** on real index data at 1-minute cadence, neither momentum (#1) nor mean reversion (#4) clears 6 bps costs. 1-min bars on these instruments are untradeable at retail cost assumptions, full stop. All stock-strategy hope now rides on slower bars (resampling, next in queue) or lower-cost venue assumptions — and any strategy that only wins on simulated 1-min bars should be treated as a simulator artifact.

## 2026-08-16 16:29Z — cycle 2

### 5. Bar resampling: stops the bleeding, doesn't create an edge

Added N-minute resampling to ReplayAdapter and ran the SMA grid on real windows at 5-min and 15-min cadence ($500, all 10 windows):

| Config | Median | Worst | Positive windows |
|---|---|---|---|
| 1-min (cycle-1 baseline, tuned) | −3.43% | −5.11% | 0/10 |
| 5-min SMA 20/60 L/S | +0.10% | −1.58% | 5/10 |
| 15-min SMA 20/60 L/S | **+0.40%** | −1.68% | 5/10 |

- Slower bars cut trade count ~25-75x, which mostly eliminates the cost bleed — returns move from clearly negative to statistically indistinguishable from zero. No config shows a real edge (5/10 positive windows = coin flip).
- Matches study #1: autocorrelation at 5-60 min horizons is ≈ 0 on these instruments. Trend-following here is breakeven-at-best, at any cadence we can measure.
- Caveat: each window is only 3 days, so 15-min bars give ~288 bars and a handful of crosses — variance is large. A fair test of slow trend-following needs longer windows (weeks), which the source data supports. Queued.

**Applied:** REAL_EXPERIMENTS now evaluates sma-crossover at 15-min resample with 20/60 L/S — reporting the strategy at its least-bad known configuration, honestly labeled breakeven.

## 2026-08-16 21:00Z — cycle 3

### 6. Simulator calibration: the fake markets were 13x too jumpy and far too forgiving — fixed

In plain English: our practice simulator was letting the prediction-market strategies win money that real markets would never give up. We measured the simulator with the exact same yardstick we used on real Polymarket prices and rebuilt it until the numbers lined up.

Before vs after (25-min periods, vs real targets):

| Statistic | Old sim | New sim | Real |
|---|---|---|---|
| How often prices move ≥1c | 75.8% | 8.0% | 5.8% |
| Avg next move after a ≥5c jump | −0.72c | −0.20c | −0.33c |
| How often a ≥5c jump reverses | 57.6% | 43.6% | 36.5% |

Consequences, exactly as predicted:
- **extreme-fade collapsed from +7,719%/month to −10%/month** in the simulator — now agreeing with the real-data verdict that fading price jumps loses to costs.
- **venue-arb collapsed from ~+1,000%/month to +2.1%/month** after venue disagreement was scaled to realistic levels (each venue's stream must itself look like a real market; cross-venue gaps now come mostly from stale quotes). +2%/month with 4.5% drawdown is finally a *believable* number — but it remains simulation-only until real two-venue data exists, and its parameters were last tuned against the old, too-generous sim (retune queued).
- **Goal v2 scoreboard is now honest: all four systems currently FAIL** the 3%/month bar. Venue-arb is closest (+2.1%, drawdown well inside the cap).

Residual mismatches are documented in sim-calibration-check.js (sim slightly over-reverts at 5c, under-reverts at 8c; move frequency a bit high). None of them favor the strategies systematically.

### Cross-cutting

The sim-vs-real gap (strategies profitable in sim, losing on real data) is now explained mechanistically for stocks: the simulator's GBM-with-drift-regimes trends more than real index prices at 1-min. The fix is honest strategy/timescale changes, never re-tuning the simulator toward the strategies.
