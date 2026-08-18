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

## 2026-08-17 00:29Z — cycle 4

### 7. Arbitrage retuned on the honest simulator: first goal pass (+5.2%/month, sim-only)

With the simulator no longer flattering anyone, venue-arb was retuned from scratch (18-config grid, verified on all 10 seeds, monthly horizon):

- **Entry threshold is everything.** Entering on 2-3c cross-venue gaps loses money on the calibrated sim — those gaps are mostly noise and fees eat the round trip. Only 4c+ gaps are worth taking. This mirrors the arb-stress finding: the strategy lives or dies on the gap-vs-cost ratio.
- **Risk sizing swept 4→15%:** returns scale up but so do drawdowns; at 15% the worst seed breaches the 15% drawdown cap. **10% per trade is the sweet spot: +5.21%/month median, +14.2% worst-seed drawdown — every seed inside the cap.**
- New config applied to params.json and the goal profile. Goal v2 status: **venue-arb passes at stretch level (🚀 +5.2%/month, 9.1% median drawdown). The other three systems still fail.**

Standing caveat, unchanged: this is the one system with no real-data validation possible in this sandbox (no public two-venue tick data). Its numbers are the calibrated simulator's word. The stale-quote mechanism that generates the gaps is plausible but unverified — treat this as "promising pending real data," never as proven.

## 2026-08-17 04:29Z — cycle 5

### 8. Expiry drift: mostly already priced in — but the study surprised us about costs

2,393 real Polymarket markets bucketed by time to expiry (single snapshot — this shows how markets *look*, and cannot measure returns over time):

- **The "drift to certainty" is real but already done**: ~90% of markets within 3 days of expiry already sit below 5c or above 95c. Only ~8% are still genuinely uncertain. There's no obvious free lunch in "ride prices toward 0/1 at the end" — by the final days, the riding is over.
- **A small live hunting ground exists**: at snapshot time, 24 near-expiry markets were still uncertain, and 21 of those were liquid and tight — enough to matter for a $500 account, too few to scale.
- **The genuinely important discovery is about trading costs**: median bid-ask spreads are **0.1c** in active near-expiry markets and 0.3-0.4c even in long-dated ones. Our flat 0.5c-per-side slippage assumption is **5-10x too pessimistic for liquid markets.** Every prediction-market idea we labeled "right sign, loses to costs" (especially the fade, FINDINGS #2) must be re-judged against measured spreads. If real round-trip cost in liquid markets is ~0.2c, a −0.33c average bounce after 5c moves flips from untradeable to potentially tradeable.
- Near-expiry markets are also the most active (86-98% moved ≥1c that day vs ~38% of long-dated ones) — activity and tight spreads live in the same place.

**Applied/next:** the cost-model item (next in queue) is now the highest-value experiment in the sandbox: measure spread by liquidity tier, restrict the reversion study to tight-spread markets, and restate fade economics net of *measured* costs.

## 2026-08-17 08:29Z — cycle 6

### 9. Real Polymarket cost model: cheaper than we assumed, but the fade still isn't a robust edge

Measured real spreads across 9,550 markets, by how much money is in each market:

| Liquidity tier | Markets | Median spread (= round-trip cost) |
|---|---|---|
| Deep (≥$50k) | 8,010 | **0.10c** |
| Mid ($5k-50k) | 1,442 | 0.30c |
| Thin (<$5k) | 98 | 2.00c |

So trading the big, liquid markets costs about a tenth of a cent round-trip — our old assumption of half a cent was 5x too harsh. Good news. But when I re-ran the fade idea **market-by-market, subtracting each market's real spread**, the honest verdict is only a small improvement:

- Fading moves of 3-5c: still **loses** net of real cost (−1.1 to −1.4c per trade) even in liquid markets.
- Fading only **big moves (≥8c) in deep markets**: barely **positive** — +0.05c/trade (mid+deep) to +1.2c/trade (deep only) — but on just 46-90 trades with a 31-39% win rate, meaning a few big reversals carry it. That's a thin, high-variance edge, not a reliable one.

**Plain-English bottom line:** cheaper trading costs move the fade from "clearly loses" to "roughly breakeven, maybe slightly positive if you only fade the biggest jumps in the most liquid markets." On the real 30-day windows with the corrected 0.2c cost, the best fade config now shows +1.0% median (was −0.6%) but still only 6/10 windows positive with a −10.8% worst window. Not a goal pass, and too variable to bet on — but no longer a dead end.

**Applied:** ReplayAdapter prediction cost corrected from 0.5c to 0.1c per side (measured deep-market value); real-data fade config updated to the least-bad large-move setting. venue-arb re-tuned by the auto-tuner this cycle still passes (+4.75%/month, 4.7% drawdown).

## 2026-08-17 12:29Z — cycle 7

### 10. The fade, judged fairly, is not a bettable edge — verdict: retired from real-data hope

I rebuilt the prediction test windows the honest way: only liquid markets (≥$5k, where real spreads are ~0.1c), selected at random instead of cherry-picking the most volatile ones (which had quietly biased earlier tests toward trending markets). Then re-ran the large-move fade net of the real 0.1c cost:

- Across all 10 unbiased windows, the fade found only **7 to 18 trades total** and netted **~0% median** (best window +4.5%, worst −2.9%, positive in 4/10).
- Translation: once you remove the selection bias and restrict to markets you could actually trade cheaply, there simply aren't enough "big jump then reversal" opportunities to build anything on, and the few that exist wash out to nothing.

**Verdict: extreme-fade is retired as a real-data candidate.** It survives only in the (now-honest) simulator, where it also loses. This closes the prediction-market *price-pattern* thread: neither the overreaction fade nor the expiry drift is a real, bettable edge in the data we can reach.

Important honest caveat about the data: our real Polymarket history is sparse — about 26 snapshots per market at ~25-minute spacing. A dense per-minute or tick feed could reveal faster patterns this data can't see. So the accurate statement is "no bettable fade edge exists in the data available to us," not "no such edge can possibly exist." Getting denser Polymarket data (needs the network opened or a bigger dataset) is the only way to check further.

## 2026-08-17 16:29Z — cycle 8

### 11. New markets are NOT sloppily priced — no maker edge there

Tested whether brand-new Polymarket markets are looser than established ones, across 9,550 real markets bucketed by age:

- Median spread is **0.10c at every age** from under a day to 90 days old. New markets are just as tight as mature ones.
- Focusing on genuinely uncertain markets (priced 20-80c, where mispricing would matter) and controlling for liquidity: young markets (<7 days) are **the same or tighter** than mature ones (in the mid-liquidity tier, young 1.0c vs mature 2.0c — the opposite of the hypothesis).

**Plain-English bottom line:** Polymarket's automated market-makers quote new markets just as tightly as old ones, so there's no "the market is sloppy because it's new" opportunity to harvest. Another honest dead end — and a useful one: it says the venue is efficiently made, which is exactly why the simple price-pattern edges keep failing.

This closes Adam's prediction-market idea list (#4a expiry drift and #4b new-market mispricing both negative). The prediction venue is efficient at the timescales and data we can measure; no simple structural edge survives. What remains untested there would need dense (tick-level) data or genuine information advantage on specific events — neither is a systematic algorithm.

## 2026-08-17 — goal changed to STEADY INCOME (Adam's call)

Goal v3: median ≥1%/month, max drawdown ≤8%, and ≥80% of test months positive — steadiness over size. Scoreboard against the new bar:

| System | Monthly | Drawdown | Months positive | Verdict |
|---|---|---|---|---|
| venue-arb (sim) | +4.75% | 4.7% | 80% | 🚀 meets income bar — but simulator-only |
| sma-crossover (real) | −3.8% | 9.2% | 10% | ❌ |
| rsi-momentum (real) | −6.7% | 12.6% | 20% | ❌ |
| extreme-fade (sim) | −14.9% | 20.3% | 20% | ❌ |

The income framing actually flatters the arb (its steadiness — 80% positive months, small drawdowns — is exactly the income profile) and correctly damns the rest. But the one system that fits is the one we cannot validate on real data. Honest state: no real-data system produces steady income; the only steady performer is unverifiable in this sandbox.

## 2026-08-17 20:29Z — cycle 9

### 12. Slow trend-following works — but only as a worse version of buy-and-hold

Tested slow strategies where they finally get enough signals to matter. The classic "golden cross" (buy when the 50-day average crosses above the 200-day, sell when it crosses back) is the first real-data stock config that isn't a loser:

- **9 years of daily data (S&P), unleveraged:** +37% total over 2010-2018, just 9 trades, 8.7% max drawdown, profit factor 3.15. Genuinely positive, genuinely calm — the solid result.
- **30-day windows:** too short to judge a 50/200 fairly (few crossovers per window → high variance); unleveraged it lands around breakeven (−1.6% median, 40% windows positive, 5.1% drawdown). The +3% I first saw used 2x leverage across four indices — not appropriate for an income goal, so discarded. The daily result above is the honest one.

**But here's the honest benchmark that matters.** Over the exact same 9 years, simply **buying and holding the S&P made +109%** — three times more — with a 21% max drawdown. So the golden-cross strategy captured about a third of the return while cutting the drawdown by more than half. That's the real, well-known nature of trend-following: **it's a drawdown-reduction tool, not a money-making edge.** It doesn't beat the market; it gives you a smoother, smaller slice of it.

And for the income goal specifically: +37% over 9 years is about **3.6% per year** — which is *below* what US Treasury bills pay right now for zero risk. So the one stock strategy that "works" on real data still loses to a savings account.

**Bottom line for stocks:** there is no day-trading income edge here. The honest options are (a) buy and hold an index — more return, bigger drawdowns, no algorithm needed; or (b) T-bills/money-market — less return, no drawdowns. Every strategy we built lands *between* those two and beats *neither*. The algorithm adds nothing you couldn't get more simply.

**Applied:** the sma-crossover goal profile is switched to the honest best (50/200 long-only) so the scoreboard reflects the least-bad real config, still short of the 80%-consistency income bar.

## 2026-08-18 00:29Z — cycle 10

### 13. Diversification is a real free lunch for drawdown — but can't manufacture monthly steadiness

Combined the one positive real stock strategy (golden cross) across all 4 indices at once, on the same 2010-2018 period (a legitimate, contemporaneous diversification test):

- **Spreading across 4 indices roughly halved the drawdown for free:** the golden-cross blend had a 10.4% max drawdown vs ~20% for any single index — same return, much smoother. Diversification genuinely works and costs nothing. Worth doing on anything you run.
- **But it still doesn't reach the income bar.** The diversified trend blend: ~5.4%/year, 10.4% max drawdown, and only **53% of months positive.** The income goal wants ≥80% of months positive — and *nothing here comes close*.

**The deeper lesson — why the income bar is so hard for these assets:** even plain buy-and-hold the S&P is only up in ~63% of months; the diversified stock blends are ~53-59%. Stocks are simply choppy month to month — that's their nature. **"Positive almost every month" is not a property any stock strategy can provide**, diversified or not, trend or buy-hold. The only assets that are up ~100% of months are fixed income (T-bills, money-market, short bonds) — which is exactly why they, not any trading strategy, are the real tool for a steady monthly income stream.

**Honest conclusion of the diversification thread:** combining systems helps drawdown a lot and should be used, but it cannot turn choppy assets into a steady paycheck. The 80%-months-positive requirement is met by savings-type instruments, full stop — no algorithm in this project reaches it on real data.

## 2026-08-18 04:29Z — cycle 11

### 14. The arbitrage "pass" is fragile — it only works if execution is cheap, and we can't guarantee that

Closed the prediction-window bias item (the unbiased fair windows show slight *continuation* after big moves, +0.29c — confirming no reversion edge once cherry-picking is removed). Then stress-tested the one passing system, venue-arb, against realistic execution cost. (Also fixed a plumbing bug: the slippage override wasn't reaching the simulator, so earlier this-cycle numbers were identical across cost levels — now corrected.)

Median monthly return by entry threshold vs. real per-trade slippage:

| Entry gap required | at 0.5c | at 1.0c | at 1.5c | at 2.0c |
|---|---|---|---|---|
| 4c (old setting) | +4.0% | **−14.3%** | −29.4% | −35.1% |
| 8c (new setting) | +12.9% | −1.6% | −12.5% | −23.2% |
| 10c | +10.3% | 0.0% | 0.0% | −4.9% |

**Plain English:** the arbitrage system makes good money *only if* trading costs about half a cent per trade. Bump that to one cent and it barely breaks even; at two cents it loses badly. Requiring bigger price gaps before trading (raised the setting from 4c to 8c) makes it more robust, but nothing survives 2c cost.

Why this matters: real arbitrage means being a *taker* on both venues simultaneously (you can't wait for a good fill — the gap closes). Taker costs plus the reality that the cheap venue isn't always the tight one make ~1c+ effective cost entirely plausible. So venue-arb's "pass" sits right at the edge of viability, on the one assumption (cheap execution) we have no real data to confirm.

**Bottom line: the only system that meets the income goal does so on a knife-edge cost assumption we can't verify.** Raised the entry threshold to 8c for robustness, but the honest label is now "sim-only AND fragile to costs" — not a system to fund on faith.

### Cross-cutting

The sim-vs-real gap (strategies profitable in sim, losing on real data) is now explained mechanistically for stocks: the simulator's GBM-with-drift-regimes trends more than real index prices at 1-min. The fix is honest strategy/timescale changes, never re-tuning the simulator toward the strategies.
