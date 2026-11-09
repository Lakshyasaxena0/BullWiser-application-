# BullWiser — what the research says, and what we built from it

Written 9 Nov 2026. BullWiser only analyses; it never buys or sells. Every rule below is **mild on purpose**: published
edges in markets are small, unstable and often shrink after publication, so each rule nudges a score, a confidence or a
range, and the app's own scored results (the learning loop, now also fed by the hourly self-practice) decide how far to trust it.

## The honest baseline
* Next-day and next-week price **direction is close to a coin flip**, even for good models. Ranges and calibration matter more than a confident arrow.
* Backtests overfit easily: look-ahead leakage, many trials, overlapping samples, regime changes. Out-of-sample, walk-forward tests with only past data are the standard
  of proof ([pitfalls & remedies](https://chenqijunvc.github.io/Common-Pitfalls-in-Financial-Machine-Learning-and-Their-Solutions): purging/embargo, uniqueness weighting, dynamic volatility-scaled labels, meta-labeling).
* Probability forecasts are usually **over-confident**; recalibrating against outcomes improves accuracy
  ([Turner et al., recalibrating probabilistic forecasts](https://cambridge.org/core/services/aop-cambridge-core/content/view/5D8F0DFC90FC1E9B5C38C12992A6C6A7/S1930297500009049a.pdf/recalibrating-probabilistic-forecasts-to-improve-theiraccuracy.pdf)).

## What was integrated

| Finding (source) | What the app now does | Where |
|---|---|---|
| Forecasters are over-confident; short-horizon direction is near 50/50 | Stated confidence is capped by horizon: 1 day ≤ 66%, ≤ 7 d ≤ 70%, ≤ 30 d ≤ 74%, ≤ 90 d ≤ 78%, longer ≤ 80% (crypto 4 points lower). The learning loop still corrects up/down from real hit-rates. A note says when the cap applied. | `evidenceRules.confidenceCeiling`, `predictionGuard.ts` |
| One-month returns **reverse** for thin / far-from-high stocks but **continue** near the 52-week high on high turnover ([short-term momentum & reversal, 52-week-high ratio and turnover](https://ideas.repec.org/a/eee/empfin/v79y2024ics0927539824000902.html)); short-term momentum and long-term reversal exist on NSE ([Indian study](https://www.publishingindia.com/archive/ijfm/a-study-of-contrarian-and-momentum-profits-in-indian-stock-market)) | The old "10-day move > 5% ⇒ bullish" rule is replaced by a context-aware rule using 1-month return, price ÷ 52-week high and volume vs its 6-month norm. Score stays within 38–62. | `evidenceRules.shortTermPressure`, `statisticalAnalysisService.ts` |
| Momentum persists for months, partly reverses later ([time-series momentum](https://papers.ssrn.com/abstract=2089463)); trend filters mainly cut drawdowns, with caveats about data-snooping ([moving-average evidence](https://www.cxoadvisory.com/technical-trading/long-term-outperformance-from-trends-defined-by-moving-averages)) | Already present: 200-DMA state and 12-1 month momentum in the 20-year layer. Kept; no extra weight added. | `longTermStatsService.ts` |
| India VIX forecasts realised Nifty volatility at least as well as GARCH; its link to returns is strongest in the **left tail** ([NSE working paper](https://nsearchives.nseindia.com/research/content/res_WorkingPaper9.pdf)) | In a nervous market (VIX regime elevated / fear) the price range is widened (×1.10 / ×1.25) with extra room on the downside; a calm market narrows it slightly (×0.95). | `evidenceRules.vixRangeFactors`, `predictionHelpers.computePriceRange` |
| Simple/conservative combinations beat aggressively estimated weights when data are few ([forecast combination puzzle](https://arxiv.org/pdf/1505.00475)) | Already present: weights start at 55/45, move only as fast as the sample justifies and stay inside 40–70. Now sample size means **independent** samples (next row). | `learningService.ts` |
| Overlapping/correlated samples inflate evidence (uniqueness weighting, [pitfalls](https://chenqijunvc.github.io/Common-Pitfalls-in-Financial-Machine-Learning-and-Their-Solutions)) | Outcomes scored on the same day in the same market share one market move, so a group counts as fewer samples (3 count fully, 25 count like ~9). One market day can no longer swing the learned weights — important now that the app practises on ~25 stocks a day. | `evidenceRules.uniquenessWeight`, `learningService.applyUniqueness` |
| Calendar effects are **not persistent** on the Nifty ([month-of-year study](https://mpra.ub.uni-muenchen.de/24185/1/MPRA_paper_24185.pdf)) | Month-of-year influence cut from ±4 to ±2 score points and needs ≥ 12 years of that month. The AI prompt treats seasonality as a tie-breaker at most. | `longTermStatsService.ts`, `aiService.ts` |
| Astrology-type market effects are tiny: new-moon vs full-moon gap ≈ 4–5 bp a day across 48 countries, mostly insignificant country by country ([Yuan, Zheng & Zhu, "Are investors moonstruck?"](https://www.bus.umich.edu/pdf/mitsui/workshopdocs/ZhengMoonstruck.pdf)); no pattern in daily detrended returns ([CXO](https://www.cxoadvisory.com/calendar-effects/lunar-cycle-and-stock-returns/)) | The house 55:45 ratio is kept (product decision), but the "statistics and astrology agree" confidence bonus (+8) now **shrinks as the learned track record demotes astrology**. The AI prompt tells the model to let the track record decide astrology's say. | `evidenceRules.astroAgreementBonus`, `aiService.ts` |
| A model must beat the laziest strategy to have an edge | Performance summaries now include the baseline "always guess the most common outcome" and the edge over it; shown in the self-learning card. | `performance.ts`, `SelfLearningCard.tsx` |
| Out-of-sample evidence is the only real proof | The app now predicts by itself every hour on 25 stocks and 10 coins and checks every result against the real price (see `practiceService.ts`). | `practiceService.ts` |

## Deliberately not added
* **Intraday / 1-hour direction calls** – almost pure noise; would also distort the learned weights.
* **Cross-sectional stock ranking** (the form in which most momentum/reversal papers are written) – BullWiser predicts one asset at a time, so those results are used only as mild context.
* **Calendar trading rules** (turn-of-month, day-of-week, January) – unstable in Indian data.
* **A fixed "astrology is right/wrong" verdict** – the learning loop measures it on real scored results and moves its weight (40–70% statistics) accordingly.

## Still worth doing later (needs data we do not have yet)
* Walk-forward astrology backtest on 20 years of history per stock, used as a prior for the learned weights.
* India-specific inputs: FII/DII flows, expiry-day effects, results calendar, circuit-limit bands, delivery %.
* Conformal / rolling-quantile calibration of ranges ([temporal conformal prediction](https://arxiv.org/html/2507.05470v6)) — today ranges are self-calibrated by the share of real prices that landed inside them (target 70%).

## How to judge BullWiser fairly
Look at the Self-learning report after a few weeks: the number of independent outcomes, hit-rate **versus the baseline**, whether stated confidence matches the real hit-rate (Calibration), and whether real prices fall inside the predicted ranges (about 70%).
Treat any single result as luck, and any accuracy figure from fewer than ~100 independent outcomes as unreliable.
