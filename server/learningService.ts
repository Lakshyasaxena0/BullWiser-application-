// ─────────────────────────────────────────────────────────────────────────────
// learningService.ts
// Real learning from prediction outcomes.
//
//  1. When a prediction is made, a SNAPSHOT is stored in predictions.ai_learning (JSON):
//     what the statistics said, what the astrology said, what the final answer was,
//     the confidence, and the weights that were used.
//  2. When the cron job scores that prediction against the real price, the OUTCOME is added
//     to the same JSON: was the final call right? was statistics right? was astrology right?
//  3. Before the next prediction, getProfile() turns all scored outcomes (from ALL users)
//     into a track record: how reliable statistics vs astrology have been for this stock,
//     its sector and the whole market. From that it derives
//        • the weights for statistics vs astrology,
//        • a confidence correction (are our "70%" calls really right 70% of the time?),
//        • a plain-language track record that is shown to the AI conclusion step.
//
//  No schema change: it uses the existing ai_learning / actual_price / deviation columns.
//  Small samples are shrunk towards 50/50, so a few lucky/unlucky results can't swing things.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from './db';
import { predictions } from '@shared/schema';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

export type Dir = 'bullish' | 'bearish' | 'neutral';
export type Market = 'stock' | 'crypto';

export interface LearningSnapshot {
  v: 1;
  market: Market;
  symbol: string;
  sector: string;
  finalDirection: Dir;
  statsDirection: Dir | null;      // null = statistics were not available
  astroDirection: Dir | null;      // null = astrology was not available
  confidence: number;
  weights: { statistical: number; astrological: number }; // percentages that were used
  learnedFrom: number;             // number of past outcomes behind those weights
  aiUsed: boolean;
  outcome?: {
    actualPrice: number;
    changePct: number;
    actualDirection: Dir;
    finalCorrect: boolean;
    statsCorrect: boolean | null;
    astroCorrect: boolean | null;
    scoredAt: string;
  };
}

export interface SourceReliability { symbol: number | null; sector: number | null; global: number | null; blended: number }

export interface LearningProfile {
  hasData: boolean;                                   // enough outcomes to trust the weights
  samples: { symbol: number; sector: number; global: number };
  weights: { statistical: number; astrological: number }; // 0-100, sum 100
  reliability: { statistics: number; astrology: number; final: number }; // 0-100 blended hit-rates
  confidenceAdjustment: number;                       // add to the confidence
  directionAccuracy: Partial<Record<Dir, number>>;    // final-call hit-rate per direction (0-100)
  summary: string;                                    // plain language, for the AI prompt / UI
}

const DEFAULT_PROFILE: LearningProfile = {
  hasData: false,
  samples: { symbol: 0, sector: 0, global: 0 },
  weights: { statistical: 50, astrological: 50 },
  reliability: { statistics: 50, astrology: 50, final: 50 },
  confidenceAdjustment: 0,
  directionAccuracy: {},
  summary: 'No scored prediction history yet — using an even 50/50 weighting.',
};

const MIN_OUTCOMES_TO_TRUST = 5;   // market-wide scored outcomes needed before weights move
const HALF_LIFE_DAYS = 60;         // older outcomes count less
const CACHE_MS = 5 * 60_000;
const MAX_RECORDS = 1500;

export interface Rec { snap: LearningSnapshot; w: number; sector: string; symbol: string; market: Market }

let cache: { at: number; recs: Rec[] } | null = null;

function isDir(x: any): x is Dir { return x === 'bullish' || x === 'bearish' || x === 'neutral'; }

export function parseSnapshot(raw: unknown): LearningSnapshot | null {
  if (typeof raw !== 'string' || raw[0] !== '{') return null;
  try {
    const s = JSON.parse(raw);
    if (s?.v !== 1 || !isDir(s.finalDirection)) return null;
    return s as LearningSnapshot;
  } catch { return null; }
}

/** Build the snapshot stored with a new prediction. */
export function buildSnapshot(args: {
  market: Market; symbol: string; sector: string;
  finalDirection: Dir; statsDirection: Dir | null; astroDirection: Dir | null;
  confidence: number; weights: { statistical: number; astrological: number };
  learnedFrom: number; aiUsed: boolean;
}): string {
  const snap: LearningSnapshot = { v: 1, ...args, confidence: Math.round(args.confidence) };
  return JSON.stringify(snap);
}

/** Direction resolution used when statistics and astrology disagree: the side that has earned
 *  more trust (weight × confidence) wins; a near-tie is neutral. */
export function resolveDirection(
  statsDir: Dir, astroDir: Dir,
  wStats: number, wAstro: number, statsConf: number, astroConf: number
): Dir {
  if (statsDir === astroDir) return statsDir;
  if (statsDir === 'neutral') return astroDir;
  if (astroDir === 'neutral') return statsDir;
  const s = wStats * statsConf;
  const a = wAstro * astroConf;
  if (Math.abs(s - a) < 4) return 'neutral';
  return s > a ? statsDir : astroDir;
}

// ── Outcome scoring (called by the cron job) ─────────────────────────────────
export function scoreOutcome(pred: any, actualPrice: number): { aiLearning: string | null; finalCorrect: boolean | null; deviation: number } {
  const cur = Number(pred.currentPrice);
  const mid = (Number(pred.predLow) + Number(pred.predHigh)) / 2;
  // Percent, because the analytics page shows predictions.deviation as a % (actual vs predicted midpoint)
  const deviation = mid > 0 ? Math.round(((actualPrice - mid) / mid) * 10000) / 100 : 0;
  const snap = parseSnapshot(pred.aiLearning);
  if (!snap || !(cur > 0)) return { aiLearning: null, finalCorrect: null, deviation };

  const changePct = ((actualPrice - cur) / cur) * 100;
  const halfRangePct = ((Number(pred.predHigh) - Number(pred.predLow)) / 2 / cur) * 100;
  const band = Math.max(0.3, 0.25 * halfRangePct);           // "flat" zone around the entry price
  const actualDirection: Dir = changePct > band ? 'bullish' : changePct < -band ? 'bearish' : 'neutral';

  const hit = (d: Dir | null) => (d === null ? null : d === actualDirection);
  const finalCorrect = snap.finalDirection === actualDirection;
  snap.outcome = {
    actualPrice,
    changePct: Math.round(changePct * 100) / 100,
    actualDirection,
    finalCorrect,
    statsCorrect: hit(snap.statsDirection),
    astroCorrect: hit(snap.astroDirection),
    scoredAt: new Date().toISOString(),
  };
  return { aiLearning: JSON.stringify(snap), finalCorrect, deviation };
}

// ── Track record ─────────────────────────────────────────────────────────────
async function loadRecords(): Promise<Rec[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.recs;
  const rows = await db
    .select({ aiLearning: predictions.aiLearning, createdAt: predictions.createdAt })
    .from(predictions)
    .where(and(eq(predictions.isActive, false), isNotNull(predictions.aiLearning), isNotNull(predictions.actualPrice)))
    .orderBy(desc(predictions.createdAt))
    .limit(MAX_RECORDS);

  const now = Date.now();
  const recs: Rec[] = [];
  for (const r of rows) {
    const snap = parseSnapshot(r.aiLearning);
    if (!snap?.outcome) continue;
    const t = snap.outcome.scoredAt ? Date.parse(snap.outcome.scoredAt) : (r.createdAt?.getTime() ?? now);
    const ageDays = Math.max(0, (now - t) / 86_400_000);
    recs.push({ snap, w: Math.pow(0.5, ageDays / HALF_LIFE_DAYS), sector: snap.sector, symbol: snap.symbol, market: snap.market });
  }
  cache = { at: now, recs };
  return recs;
}

export function invalidateLearningCache() { cache = null; }

interface Agg { n: number; statsN: number; astroN: number; sHit: number; aHit: number; fHit: number; fN: number; confSum: number; hitSum: number; wSum: number }
const emptyAgg = (): Agg => ({ n: 0, statsN: 0, astroN: 0, sHit: 0, aHit: 0, fHit: 0, fN: 0, confSum: 0, hitSum: 0, wSum: 0 });

function aggregate(recs: Rec[]): Agg {
  const g = emptyAgg();
  for (const { snap, w } of recs) {
    const o = snap.outcome!;
    g.n++;
    g.wSum += w;
    g.fN += w; g.fHit += o.finalCorrect ? w : 0;
    g.confSum += snap.confidence * w; g.hitSum += (o.finalCorrect ? 100 : 0) * w;
    if (o.statsCorrect !== null && o.statsCorrect !== undefined) { g.statsN += w; g.sHit += o.statsCorrect ? w : 0; }
    if (o.astroCorrect !== null && o.astroCorrect !== undefined) { g.astroN += w; g.aHit += o.astroCorrect ? w : 0; }
  }
  return g;
}

// Hit-rate with a Beta(2,2)-style prior so tiny samples stay close to 50%.
const rate = (hit: number, n: number) => (hit + 2) / (n + 4);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Blend global → sector → symbol so specific evidence counts more only as it accumulates. */
function blend(gv: number, sv: number | null, sn: number, yv: number | null, yn: number): number {
  let v = gv;
  if (sv !== null) v = lerp(v, sv, sn / (sn + 10));
  if (yv !== null) v = lerp(v, yv, yn / (yn + 6));
  return v;
}

export async function getProfile(symbol: string, sector: string, market: Market): Promise<LearningProfile> {
  try {
    return computeProfile(await loadRecords(), symbol, sector, market);
  } catch (err) {
    console.error('[Learning] getProfile failed (using 50/50):', err);
    return DEFAULT_PROFILE;
  }
}

/** Pure computation (exported for testing). */
export function computeProfile(records: Rec[], symbol: string, sector: string, market: Market): LearningProfile {
  {
    const all = records.filter(r => r.market === market);
    const sym = symbol.toUpperCase();
    const gAgg = aggregate(all);
    if (gAgg.n < MIN_OUTCOMES_TO_TRUST) {
      return { ...DEFAULT_PROFILE, samples: { symbol: 0, sector: 0, global: gAgg.n },
        summary: `Only ${gAgg.n} scored prediction${gAgg.n === 1 ? '' : 's'} so far — not enough to adjust the 50/50 weighting.` };
    }
    const sAgg = aggregate(all.filter(r => r.sector === sector));
    const yAgg = aggregate(all.filter(r => r.symbol.toUpperCase() === sym));

    const pick = (sel: (a: Agg) => [number, number]) => {
      const [gh, gn] = sel(gAgg), [sh, sn] = sel(sAgg), [yh, yn] = sel(yAgg);
      const gv = rate(gh, gn);
      const sv = sn > 0 ? rate(sh, sn) : null;
      const yv = yn > 0 ? rate(yh, yn) : null;
      return { symbol: yv, sector: sv, global: gv, blended: blend(gv, sv, sn, yv, yn) } as SourceReliability;
    };
    const rStats = pick(a => [a.sHit, a.statsN]);
    const rAstro = pick(a => [a.aHit, a.astroN]);
    const rFinal = pick(a => [a.fHit, a.fN]);

    // Weights: share of reliability, kept inside 25–75 so neither source is ever ignored.
    const raw = rStats.blended / (rStats.blended + rAstro.blended);
    const wS = Math.min(0.75, Math.max(0.25, raw));
    const statistical = Math.round(wS * 100);

    // Confidence calibration: stated confidence vs real hit-rate (market-wide → sector → symbol).
    const gap = (a: Agg) => (a.wSum > 0 ? a.hitSum / a.wSum - a.confSum / a.wSum : 0);
    const gapBlend = blend(gap(gAgg), sAgg.n >= 3 ? gap(sAgg) : null, sAgg.n, yAgg.n >= 3 ? gap(yAgg) : null, yAgg.n);
    const shrink = gAgg.n / (gAgg.n + 15);
    const confidenceAdjustment = Math.max(-15, Math.min(10, Math.round(gapBlend * shrink)));

    // Per-direction hit-rate of the final call (market-wide)
    const directionAccuracy: Partial<Record<Dir, number>> = {};
    for (const d of ['bullish', 'bearish', 'neutral'] as Dir[]) {
      const rs = all.filter(r => r.snap.finalDirection === d);
      if (rs.length >= 3) directionAccuracy[d] = Math.round(100 * rs.filter(r => r.snap.outcome!.finalCorrect).length / rs.length);
    }

    const pct = (x: number) => Math.round(x * 100);
    const lines = [
      `Track record from ${gAgg.n} scored ${market} predictions (${sAgg.n} in ${sector}, ${yAgg.n} for ${sym}), recent results count more:`,
      `- Statistics called the real direction correctly ${pct(rStats.blended)}% of the time; astrology ${pct(rAstro.blended)}%; the final conclusion ${pct(rFinal.blended)}%.`,
      `- Evidence-based weighting: ${statistical}% statistics / ${100 - statistical}% astrology.`,
      confidenceAdjustment !== 0
        ? `- Past confidence was ${confidenceAdjustment < 0 ? 'too high' : 'too low'}: adjust by ${confidenceAdjustment > 0 ? '+' : ''}${confidenceAdjustment}.`
        : '- Past confidence has been well calibrated.',
      ...(Object.keys(directionAccuracy).length
        ? [`- Final-call hit-rate by direction: ${Object.entries(directionAccuracy).map(([d, v]) => `${d} ${v}%`).join(', ')}.`] : []),
    ];

    return {
      hasData: true,
      samples: { symbol: yAgg.n, sector: sAgg.n, global: gAgg.n },
      weights: { statistical, astrological: 100 - statistical },
      reliability: { statistics: pct(rStats.blended), astrology: pct(rAstro.blended), final: pct(rFinal.blended) },
      confidenceAdjustment,
      directionAccuracy,
      summary: lines.join('\n'),
    };
  }
}

export const learningService = { getProfile, scoreOutcome, buildSnapshot, resolveDirection, invalidateLearningCache };
