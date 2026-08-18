# Experiment backlog

Worked through by the 4-hourly lab cycles, top item first. Each cycle: pick the
top unchecked item, run it, record results in FINDINGS.md, check it off (move
to Done with a one-line result), and add any new hypotheses it generates.
Rules: verify across ALL windows/seeds; improvements must help median AND
worst; never modify data/real/ contents or weaken simulator realism.

VENUE CONTEXT (2026-08-16): Adam is in Washington State. Kalshi is unavailable
there — do not build toward Kalshi live trading. Polymarket is Adam's actionable
prediction venue (he reports access; no paper mode exists, so anything aimed
there must survive real-data testing before any real-money suggestion, sized
tiny). Alpaca paper is the live-testing track for stocks once keys arrive.
Never suggest circumventing state restrictions.

## Queue

- [ ] **Fade threshold sweep on real data**: extreme-fade on prediction-real with minJump ∈ {5c, 8c} only; compare vs costs. If nothing clears 1c round-trip, record that fading mids at snapshot cadence is untradeable and mark the strategy sim-only.
- [ ] **Maker-side fill modeling (prediction)**: add an optional fill model where entries rest at the mid and fill only if the next bar trades through (no slip, fill risk instead). Re-test fade economics under it — honestly model the non-fills.
- [ ] **Momentum breakout on real stocks**: rsi-momentum mode won big in sim but sim over-trends; measure its real-data economics per trade (like the SMA cross study) before trusting it anywhere.
- [ ] **Goal-profile drawdown audit**: for each goal profile, record intra-run max drawdown distribution across seeds — flag any profile whose median drawdown exceeds 40% as effectively ruin-risk even in sim.

## Done

- [x] 2026-08-18 (cycle 11) Bias re-ingest CLOSED (fair windows show +0.29c continuation, no reversion edge) + arb execution-cost stress: arb is fragile — 4c entry craters to -14%/mo at 1c slippage; raised to 8c for robustness but nothing survives 2c; the income "pass" rides on unverifiable cheap-execution assumption → FINDINGS.md #14

- [x] 2026-08-18 (cycle 10) Portfolio/diversification: spreading golden cross across 4 indices halved drawdown for free (20%→10%) but blend still only 53% months-up, ~5.4%/yr; even buy-hold S&P is 63% months-up — stocks can't hit 80%-months-positive, that's a fixed-income property → FINDINGS.md #13
- [x] 2026-08-17 (cycle 9) Slow strategies: golden cross (SMA 50/200) is the first positive real-data stock config (+3% median on 30-day windows, +37%/9y daily, 8.7% maxDD) BUT buy-and-hold made +109% same period, and 3.6%/yr < T-bills — trend-following is a drawdown-reducer, not an edge; no stock income edge exists → FINDINGS.md #12
- [x] 2026-08-17 (cycle 8) New-market mispricing study: young markets priced just as tightly as mature (0.1c spread at every age; young ≤ mature even among uncertain markets) — no maker/sloppiness edge; closes Adam's prediction idea list (#4a and #4b both negative) → FINDINGS.md #11
- [x] 2026-08-17 (cycle 7) Fade re-judged on UNBIASED liquid windows (prediction-fair-real, random selection, liq≥$5k, measured 0.1c cost): only 7-18 trades across 10 windows, ~0% median — no bettable edge; extreme-fade RETIRED as real-data candidate (sparse ~25-min data is a caveat, not a rescue) → FINDINGS.md #10
- [x] 2026-08-17 (cycle 6) Polymarket cost model: real spreads 0.1c deep / 0.3c mid / 2c thin (old 0.5c assumption 5x too harsh); net of measured cost the fade only clears on ≥8c moves in deep markets (+0.05 to +1.2c/trade, 46-90 trades, 31-39% win) — thin high-variance edge, not a robust pass; ReplayAdapter cost corrected → FINDINGS.md #9
- [x] 2026-08-17 (cycle 5) Expiry-drift study: ~90% of near-expiry markets already near-certain (drift already priced); only ~21 liquid uncertain near-expiry markets at a time; KEY SURPRISE — real spreads are 0.1-0.4c, our 0.5c slip assumption 5-10x too pessimistic in liquid markets → FINDINGS.md #8
- [x] 2026-08-17 (cycle 4) Venue-arb retuned on calibrated sim: 4c entry gaps required (2-3c churn loses), 10% risk optimal — +5.21%/month median, all seeds within DD cap; FIRST goal-v2 pass (stretch, sim-only) → FINDINGS.md #7
- [x] 2026-08-16 (cycle 3) Simulator calibration: fake markets were 13x too jumpy and 2-5x too mean-reverting; after calibration extreme-fade fell +7,719% → −10%/month and venue-arb +1,010% → +2.1%/month — all four systems now honestly fail goal v2, venue-arb closest → FINDINGS.md #6
- [x] 2026-08-16 (cycle 2) Bar resampling: 5/15-min bars move real SMA results from −3.4% median to ~breakeven (+0.4% best config, 5/10 windows positive) — no edge, but no cost bleed; longer windows queued → FINDINGS.md #5
- [x] 2026-08-16 (cycle 1) Stocks mean-reversion at 1-min: NOT tradeable — gross ≈ 0 bps after k-sigma moves, net −6 to −10 bps, negative in 10/10 windows across full k×H grid → FINDINGS.md #4

- [x] 2026-08-16 Momentum study (stocks-real): trend assumption fails at 1-min; best gross +1.4 bps vs 6 bps costs → FINDINGS.md #1
- [x] 2026-08-16 Reversion study (Polymarket full sample): right sign (−0.33c after ≥5c moves), below 1c costs; committed windows selection-biased → FINDINGS.md #2
- [x] 2026-08-16 Arb stress grid: +263% at 0.5c slip → −52% at 1c; leg rejection secondary → FINDINGS.md #3
