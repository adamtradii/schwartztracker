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

- [ ] **Polymarket cost model + fade re-judgment** (TOP PRIORITY — cycle-5 found our 0.5c slip assumption is 5-10x too pessimistic for liquid markets): (a) measure spread by liquidity tier and price level from the snapshot's bid/ask; (b) join the reversion study's market series to snapshot liquidity — restate mean-bounce-after-big-moves NET of each market's measured spread, restricted to liquid/tight markets; (c) if the fade clears measured costs in the liquid tier, update prediction-real evaluation costs (ReplayAdapter slippage) to the measured model and design a tradeable-fade config. This is the most likely path to a REAL-data goal pass.
- [ ] **New-market mispricing study** (Adam's #4b): snapshot has created_date. Compare spread/price behavior of young markets (<7 days old) vs mature ones using real bid/ask. If young markets look sloppier, design a follow-up strategy test.
- [ ] **Slow strategies on long windows** (Adam's #2): data is READY — stocks-long-real (ten 30-day windows, 15-min bars) and stocks-daily-real (2010-2018 daily) are committed. Test SMA/momentum configs with multi-day holds where they finally get enough signals: SMA 20/60 and 50/200 on stocks-long-real; SMA 10/50, 20/100 and RSI-momentum on stocks-daily-real. Costs: 6 bps round trip. Report per-window medians and whether anything is positive in ≥7/10 windows (daily = single 9-year run; report per-year returns instead).
- [ ] **Portfolio combination test** (Adam's #3): build engine/experiments/portfolio-study.js — combine the per-system equity curves (equal capital split, using each system's best-known real-data config; sim-only for venue-arb, labeled as such) and measure combined return, drawdown, and whether diversification helps vs the best single system. Use real-data results where they exist.
- [ ] **Re-ingest prediction windows without selection bias**: change ingest-real.js market selection from top-range to seeded-random among usable markets, re-run reversion study on committed windows, confirm it matches the full-sample sign.
- [ ] **Fade threshold sweep on real data**: extreme-fade on prediction-real with minJump ∈ {5c, 8c} only; compare vs costs. If nothing clears 1c round-trip, record that fading mids at snapshot cadence is untradeable and mark the strategy sim-only.
- [ ] **Adaptive arb entry threshold**: make venue-arb's entrySpread scale with a cost estimate (≥ 4× per-leg slip + 1c margin), re-run arb-stress. Goal: median stays positive at 1c slip even if smaller.
- [ ] **Maker-side fill modeling (prediction)**: add an optional fill model where entries rest at the mid and fill only if the next bar trades through (no slip, fill risk instead). Re-test fade economics under it — honestly model the non-fills.
- [ ] **Momentum breakout on real stocks**: rsi-momentum mode won big in sim but sim over-trends; measure its real-data economics per trade (like the SMA cross study) before trusting it anywhere.
- [ ] **Goal-profile drawdown audit**: for each goal profile, record intra-run max drawdown distribution across seeds — flag any profile whose median drawdown exceeds 40% as effectively ruin-risk even in sim.

## Done

- [x] 2026-08-17 (cycle 5) Expiry-drift study: ~90% of near-expiry markets already near-certain (drift already priced); only ~21 liquid uncertain near-expiry markets at a time; KEY SURPRISE — real spreads are 0.1-0.4c, our 0.5c slip assumption 5-10x too pessimistic in liquid markets → FINDINGS.md #8
- [x] 2026-08-17 (cycle 4) Venue-arb retuned on calibrated sim: 4c entry gaps required (2-3c churn loses), 10% risk optimal — +5.21%/month median, all seeds within DD cap; FIRST goal-v2 pass (stretch, sim-only) → FINDINGS.md #7
- [x] 2026-08-16 (cycle 3) Simulator calibration: fake markets were 13x too jumpy and 2-5x too mean-reverting; after calibration extreme-fade fell +7,719% → −10%/month and venue-arb +1,010% → +2.1%/month — all four systems now honestly fail goal v2, venue-arb closest → FINDINGS.md #6
- [x] 2026-08-16 (cycle 2) Bar resampling: 5/15-min bars move real SMA results from −3.4% median to ~breakeven (+0.4% best config, 5/10 windows positive) — no edge, but no cost bleed; longer windows queued → FINDINGS.md #5
- [x] 2026-08-16 (cycle 1) Stocks mean-reversion at 1-min: NOT tradeable — gross ≈ 0 bps after k-sigma moves, net −6 to −10 bps, negative in 10/10 windows across full k×H grid → FINDINGS.md #4

- [x] 2026-08-16 Momentum study (stocks-real): trend assumption fails at 1-min; best gross +1.4 bps vs 6 bps costs → FINDINGS.md #1
- [x] 2026-08-16 Reversion study (Polymarket full sample): right sign (−0.33c after ≥5c moves), below 1c costs; committed windows selection-biased → FINDINGS.md #2
- [x] 2026-08-16 Arb stress grid: +263% at 0.5c slip → −52% at 1c; leg rejection secondary → FINDINGS.md #3
