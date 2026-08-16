# Experiment backlog

Worked through by the 4-hourly lab cycles, top item first. Each cycle: pick the
top unchecked item, run it, record results in FINDINGS.md, check it off (move
to Done with a one-line result), and add any new hypotheses it generates.
Rules: verify across ALL windows/seeds; improvements must help median AND
worst; never modify data/real/ contents or weaken simulator realism.

## Queue

- [ ] **Bar resampling**: add 5-min/15-min resampling to ReplayAdapter (aggregate 1-min bars), re-run momentum study and SMA configs on slower bars. Does trend edge appear at slower timescales net of costs? (Raised stakes: cycle-1 result means slower bars are the only remaining path for stock strategies at retail costs.)
- [ ] **Re-ingest prediction windows without selection bias**: change ingest-real.js market selection from top-range to seeded-random among usable markets, re-run reversion study on committed windows, confirm it matches the full-sample sign.
- [ ] **Fade threshold sweep on real data**: extreme-fade on prediction-real with minJump ∈ {5c, 8c} only; compare vs costs. If nothing clears 1c round-trip, record that fading mids at snapshot cadence is untradeable and mark the strategy sim-only.
- [ ] **Adaptive arb entry threshold**: make venue-arb's entrySpread scale with a cost estimate (≥ 4× per-leg slip + 1c margin), re-run arb-stress. Goal: median stays positive at 1c slip even if smaller.
- [ ] **Maker-side fill modeling (prediction)**: add an optional fill model where entries rest at the mid and fill only if the next bar trades through (no slip, fill risk instead). Re-test fade economics under it — honestly model the non-fills.
- [ ] **Momentum breakout on real stocks**: rsi-momentum mode won big in sim but sim over-trends; measure its real-data economics per trade (like the SMA cross study) before trusting it anywhere.
- [ ] **Goal-profile drawdown audit**: for each goal profile, record intra-run max drawdown distribution across seeds — flag any profile whose median drawdown exceeds 40% as effectively ruin-risk even in sim.

## Done

- [x] 2026-08-16 (cycle 1) Stocks mean-reversion at 1-min: NOT tradeable — gross ≈ 0 bps after k-sigma moves, net −6 to −10 bps, negative in 10/10 windows across full k×H grid → FINDINGS.md #4

- [x] 2026-08-16 Momentum study (stocks-real): trend assumption fails at 1-min; best gross +1.4 bps vs 6 bps costs → FINDINGS.md #1
- [x] 2026-08-16 Reversion study (Polymarket full sample): right sign (−0.33c after ≥5c moves), below 1c costs; committed windows selection-biased → FINDINGS.md #2
- [x] 2026-08-16 Arb stress grid: +263% at 0.5c slip → −52% at 1c; leg rejection secondary → FINDINGS.md #3
