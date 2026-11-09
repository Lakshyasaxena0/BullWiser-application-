// ─────────────────────────────────────────────────────────────────────────────
// evidenceRules.ts — small, testable rules taken from the research literature and from practitioners' experience.
// Every rule is deliberately MILD: the published edges are small and unstable, so each one only nudges a score,
// a confidence or a range. The app's own scored results (the learning loop) decide how far to trust it.
// Full write-up with sources: docs/prediction-evidence.md
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Honest confidence ─────────────────────────────────────────────────────
// Forecasters are systematically over-confident (recalibration literature, e.g. Turner et al. on probability
// forecasts), and next-day / next-week price direction is close to a coin flip even for good models.
// So the confidence shown is capped by how far ahead the call is. This is a PRIOR: the learning loop still lowers
// (or raises) confidence from the app's real hit-rate on top of it.
export function confidenceCeiling(daysAhead: number, crypto: boolean): number {
  const d = Math.max(0, daysAhead);
  const base = d <= 2 ? 66 : d <= 7 ? 70 : d <= 30 ? 74 : d <= 90 ? 78 : 80;
  return crypto ? base - 4 : base;          // coins gap and swing more: slightly less certainty
}

// ── 2. Short-term momentum vs reversal ───────────────────────────────────────
// One-month returns tend to REVERSE for small / thinly traded / far-from-high stocks (liquidity provision), but CONTINUE
// for stocks near their 52-week high with high turnover (anchoring to the 52-week high). Short-term momentum and long-term
// reversal are both documented for NSE stocks. (Short-term reversal & 52-week-high interaction: Empirical Finance 2024;
// 52-week-high momentum: George & Hwang 2004; Indian evidence: Int. J. Financial Management.)
// Returns a 0–100 score (50 = no view). Mild by design: 38…62.
export interface ShortTermInput { r1mPct: number | null; pth: number | null; turnoverRatio: number | null }
export function shortTermPressure(x: ShortTermInput): { score: number; note: string | null } {
  const { r1mPct: r, pth, turnoverRatio: t } = x;
  if (r === null || pth === null) return { score: 50, note: null };
  const nearHigh = pth >= 0.92, farFromHigh = pth < 0.85;
  const busy = t === null ? true : t >= 1.0, quiet = t !== null && t < 0.9;
  if (r >= 8) {
    if (nearHigh && busy) return { score: 62, note: `Up ${r.toFixed(1)}% in a month, close to its 52-week high on strong volume — such moves tend to continue` };
    if (farFromHigh || quiet) return { score: 40, note: `Up ${r.toFixed(1)}% in a month but far from its high / on thin volume — such sharp rises often give back part of the gain` };
  }
  if (r <= -8) {
    if (farFromHigh && quiet) return { score: 58, note: `Down ${Math.abs(r).toFixed(1)}% in a month on thin volume — such drops often bounce` };
    if (busy && !farFromHigh) return { score: 44, note: `Down ${Math.abs(r).toFixed(1)}% in a month on heavy volume while still near its high — selling pressure may continue` };
  }
  return { score: 50, note: null };
}

// ── 3. Volatility regime → price range ───────────────────────────────────────
// India VIX forecasts realised Nifty volatility at least as well as GARCH-type models, and its link to returns is
// strongest in the LEFT tail (falls move it far more than rises). So in a nervous market the range gets wider, and
// the downside side gets extra room. The learned range calibration (coverage) still corrects any bias.
export function vixRangeFactors(regime: string | null | undefined): { widen: number; downExtra: number } {
  switch (regime) {
    case 'calm': return { widen: 0.95, downExtra: 0 };
    case 'elevated': return { widen: 1.10, downExtra: 0.05 };
    case 'fear': return { widen: 1.25, downExtra: 0.12 };
    default: return { widen: 1, downExtra: 0 };
  }
}

// ── 4. Independent evidence only ─────────────────────────────────────────────
// Outcomes scored on the same day in the same market share one market move (a rally lifts almost every stock), so they are
// not independent samples. Count them with less weight so a single market day cannot swing the learned weights
// ("uniqueness weighting", López de Prado). 3 same-day outcomes count in full, 25 count like ~9.
export function uniquenessWeight(countInBucket: number, full = 3): number {
  return countInBucket <= full ? 1 : Math.sqrt(full / countInBucket);
}

// ── 5. Does agreement with astrology deserve a bonus? ────────────────────────
// Studies of astro-type market effects (e.g. the lunar cycle) find at most very small gaps (a few basis points a day,
// weakly significant country by country, absent in daily detrended returns). Agreement between statistics and astrology
// therefore earns the full bonus only while astrology's learned weight is intact; as the track record demotes it, the bonus shrinks.
export function astroAgreementBonus(astroWeightFraction: number, full = 8, houseWeight = 0.45): number {
  const k = Math.max(0.3, Math.min(1, astroWeightFraction / houseWeight));
  return Math.round(full * k);
}

// ── 6. Calendar effects are unstable in India ────────────────────────────────
// Month-of-year rankings on the Nifty changed from one regime to another (rank correlations not significant),
// so a month's historical average gets a smaller say than trend and analog evidence, and needs more history.
export const SEASONALITY_MIN_YEARS = 12;
export const SEASONALITY_SCORE_POINTS = 2;
