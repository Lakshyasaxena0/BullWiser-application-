// ─────────────────────────────────────────────────────────────────────────────
// longTermStatsService.ts — 20-year statistical engine for stocks.
// Works purely on price history (no randomness). It answers: "in the past 20 years,
// when the stock looked like this, what happened over the same time horizon?"
//   • long-run profile: CAGR, volatility, max drawdown, returns over 1/3/5/10/20y
//   • trend/regime: 200-DMA, 12-1 month momentum, drawdown from all-time high
//   • seasonality: month-of-year and weekday behaviour
//   • analog (conditional) forward-return distribution for the requested horizon
//   • walk-forward backtest of this very rule, so the app reports its own historical hit-rate
// ─────────────────────────────────────────────────────────────────────────────
import type { OHLCVBar } from './statisticalAnalysisService';

export const LONG_TERM_YEARS = 20;
export const LONG_TERM_DAYS = Math.ceil(LONG_TERM_YEARS * 365.25) + 10;

export interface LongTermStats {
  symbol: string;
  yearsOfData: number;
  bars: number;
  reliable: boolean;            // ≥ 3 years of data
  horizonDays: number;          // trading days to the target date
  profile: {
    cagrPct: number; annualVolPct: number; maxDrawdownPct: number; currentDrawdownPct: number; sharpe: number;
    returnsPct: Record<string, number | null>;     // "1y","3y","5y","10y","20y"
    pricePercentile: number;                       // where today's price sits in its own history (0–100)
  };
  trend: { above200dma: boolean; dma200Rising: boolean; momentum12m1m: number | null; rsi14: number; state: string };
  seasonality: { month: string; avgMonthlyReturnPct: number; monthlyWinRatePct: number; samples: number; bestMonth: string; worstMonth: string; weekdayEdge: string };
  forecast: {
    method: string; analogSamples: number; effectiveSamples: number;
    probUpPct: number; baseProbUpPct: number;
    medianReturnPct: number; p10ReturnPct: number; p90ReturnPct: number;
    expectedPrice: number; rangeLow: number; rangeHigh: number;
  };
  backtest: { tests: number; hitRatePct: number | null; note: string };
  score: number;                // 0–100
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;           // 30–80
  keyFindings: string[];
  keyRisks: string[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Trading days between two dates (≈ 252/365 of the calendar days), at least 1, at most 252. */
export function tradingDaysBetween(from: Date, to: Date): number {
  const cal = Math.max(0, (to.getTime() - from.getTime()) / 86400000);
  return Math.min(252, Math.max(1, Math.round(cal * 252 / 365)));
}

function rsiSeries(c: number[], period = 14): number[] {
  const out = new Array(c.length).fill(50);
  if (c.length <= period) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
  g /= period; l /= period;
  out[period] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = period + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (period - 1) + Math.max(d, 0)) / period; l = (l * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export class LongTermStatsService {
  analyze(symbol: string, rawBars: OHLCVBar[], targetDate: Date, now: Date = new Date()): LongTermStats | null {
    const bars = [...rawBars].filter(b => b.close > 0).sort((a, b) => a.date.getTime() - b.date.getTime());
    if (bars.length < 260) return null;                                    // need at least ~1 year
    const c = bars.map(b => b.close);
    const n = c.length;
    const cur = c[n - 1];
    const years = (bars[n - 1].date.getTime() - bars[0].date.getTime()) / (365.25 * 86400000);
    const H = tradingDaysBetween(now, targetDate);

    // ── Profile ──
    const dRet: number[] = []; for (let i = 1; i < n; i++) dRet.push(Math.log(c[i] / c[i - 1]));
    const annVol = std(dRet) * Math.sqrt(252);
    const cagr = Math.pow(cur / c[0], 1 / Math.max(years, 0.5)) - 1;
    let peak = c[0], maxDD = 0; for (const p of c) { peak = Math.max(peak, p); maxDD = Math.min(maxDD, p / peak - 1); }
    const curDD = cur / peak - 1;
    const retOver = (y: number) => (n > y * 252 ? r2((cur / c[n - 1 - Math.round(y * 252)] - 1) * 100) : null);
    const sortedC = [...c].sort((a, b) => a - b);
    const pricePct = Math.round((sortedC.filter(x => x <= cur).length / n) * 100);

    // ── State series for analogs ──
    const sma200: number[] = new Array(n).fill(NaN);
    let run = 0; for (let i = 0; i < n; i++) { run += c[i]; if (i >= 200) run -= c[i - 200]; if (i >= 199) sma200[i] = run / 200; }
    const rsi = rsiSeries(c);
    const bucketRsi = (v: number) => (v < 35 ? 0 : v > 65 ? 2 : 1);
    const mom60 = (i: number) => (i >= 60 ? c[i] / c[i - 60] - 1 : 0);
    const bucketMom = (v: number) => (v < -0.08 ? 0 : v > 0.08 ? 2 : 1);
    const state = (i: number) => ({ a: c[i] > sma200[i] ? 1 : 0, r: bucketRsi(rsi[i]), m: bucketMom(mom60(i)) });

    const analog = (upto: number, h: number) => {
      // use only outcomes fully known by index `upto`
      const s = state(upto);
      const lastStart = upto - h;
      const collect = (match: (t: ReturnType<typeof state>) => boolean) => {
        const out: number[] = [];
        for (let j = 200; j <= lastStart; j++) { const t = state(j); if (match(t)) out.push(c[j + h] / c[j] - 1); }
        return out;
      };
      let rets = collect(t => t.a === s.a && t.r === s.r && t.m === s.m); let method = 'trend + RSI + 60-day momentum';
      if (rets.length < Math.max(40, h * 2)) { rets = collect(t => t.a === s.a && t.r === s.r); method = 'trend + RSI'; }
      if (rets.length < Math.max(40, h * 2)) { rets = collect(t => t.a === s.a); method = 'trend (200-DMA)'; }
      const all: number[] = []; for (let j = 0; j <= lastStart; j++) all.push(c[j + h] / c[j] - 1);
      return { rets, all, method };
    };

    const a = analog(n - 1, H);
    const sortedA = [...a.rets].sort((x, y) => x - y);
    const useRets = sortedA.length >= 20 ? sortedA : [...a.all].sort((x, y) => x - y);
    const probUp = mean(useRets.map(x => (x > 0 ? 1 : 0)));
    const baseProbUp = mean(a.all.map(x => (x > 0 ? 1 : 0)));
    const p10 = quantile(useRets, 0.1), p50 = quantile(useRets, 0.5), p90 = quantile(useRets, 0.9);
    const effN = Math.floor(useRets.length / Math.max(1, H));               // overlapping windows → fewer independent samples

    // ── Trend & momentum ──
    const above = cur > sma200[n - 1];
    const rising = n > 220 ? sma200[n - 1] > sma200[n - 21] : false;
    const mom12_1 = n > 252 ? c[n - 22] / c[n - 253] - 1 : null;            // classic 12-1 momentum
    const trendState = above ? (rising ? 'strong uptrend' : 'uptrend, 200-DMA flattening') : (rising ? 'below 200-DMA, long trend still rising' : 'downtrend');

    // ── Seasonality (calendar-month returns, month-end to month-end) ──
    const monthRets: Record<number, number[]> = {}; const wd: Record<number, number[]> = {};
    let mStart = 0;
    for (let i = 1; i < n; i++) {
      const wk = bars[i].date.getDay(); (wd[wk] ??= []).push(c[i] / c[i - 1] - 1);
      if (bars[i].date.getMonth() !== bars[i - 1].date.getMonth()) {
        const m = bars[i - 1].date.getMonth(); (monthRets[m] ??= []).push(c[i - 1] / c[mStart] - 1); mStart = i - 1;
      }
    }
    const tgtMonth = targetDate.getMonth();
    const tm = monthRets[tgtMonth] ?? [];
    const monthAvgs = MONTHS.map((_, m) => ({ m, avg: mean(monthRets[m] ?? []) })).filter(x => (monthRets[x.m] ?? []).length >= 3);
    const best = [...monthAvgs].sort((x, y) => y.avg - x.avg)[0], worst = [...monthAvgs].sort((x, y) => x.avg - y.avg)[0];
    const wdAvg = [1, 2, 3, 4, 5].map(d => ({ d, avg: mean(wd[d] ?? []) }));
    const wdBest = [...wdAvg].sort((x, y) => y.avg - x.avg)[0], wdWorst = [...wdAvg].sort((x, y) => x.avg - y.avg)[0];
    const seas = {
      month: MONTHS[tgtMonth], avgMonthlyReturnPct: r2(mean(tm) * 100), monthlyWinRatePct: tm.length ? Math.round(mean(tm.map(x => (x > 0 ? 1 : 0))) * 100) : 0, samples: tm.length,
      bestMonth: best ? MONTHS[best.m] : '-', worstMonth: worst ? MONTHS[worst.m] : '-',
      weekdayEdge: `${DAYS[wdBest.d]} strongest, ${DAYS[wdWorst.d]} weakest`,
    };

    // ── Score ──
    const scoreFor = (pUp: number, ab: boolean, rs: boolean, mom: number | null, sMonthAvg: number, sWin: number, sN: number) => {
      let s = 50 + 60 * (pUp - 0.5);
      s += ab ? (rs ? 8 : 4) : (rs ? -3 : -8);
      if (mom !== null) s += mom > 0.1 ? 6 : mom < -0.1 ? -6 : 0;
      if (sN >= 8) s += sMonthAvg > 0 && sWin >= 55 ? 4 : sMonthAvg < 0 && sWin <= 45 ? -4 : 0;
      return Math.max(5, Math.min(95, s));
    };
    const score = scoreFor(probUp, above, rising, mom12_1, mean(tm), seas.monthlyWinRatePct, tm.length);
    const signal: LongTermStats['signal'] = score > 60 ? 'bullish' : score < 40 ? 'bearish' : 'neutral';

    // ── Walk-forward backtest of the same rule (last ~6 years, monthly steps, no look-ahead) ──
    let tests = 0, hits = 0;
    const startIdx = Math.max(500, n - 6 * 252 - H);
    for (let i = startIdx; i + H < n; i += 21) {
      const an = analog(i, H);
      const arr = an.rets.length >= 20 ? an.rets : an.all;
      if (arr.length < 20) continue;
      const pu = mean(arr.map(x => (x > 0 ? 1 : 0)));
      const ab = c[i] > sma200[i], rs = sma200[i] > sma200[i - 21];
      const mo = i > 252 ? c[i - 21] / c[i - 252] - 1 : null;
      const sc = scoreFor(pu, ab, rs, mo, 0, 50, 0);
      if (sc > 40 && sc < 60) continue;                                    // only count directional calls
      tests++; const up = c[i + H] > c[i]; if ((sc >= 60) === up) hits++;
    }
    const hit = tests >= 8 ? Math.round((hits / tests) * 100) : null;

    const sampleFactor = Math.min(1, effN / 15);
    const confidence = Math.round(Math.min(80, Math.max(30, 35 + Math.abs(score - 50) * 1.1 * sampleFactor + (years >= 10 ? 5 : 0) + (hit !== null && hit >= 55 ? 4 : hit !== null && hit < 48 ? -6 : 0))));

    // ── Human-readable findings ──
    const f: string[] = [], risks: string[] = [];
    f.push(`${r2(years)} years of data (${n} daily bars): CAGR ${r2(cagr * 100)}%, annual volatility ${r2(annVol * 100)}%, worst drawdown ${r2(maxDD * 100)}%.`);
    f.push(`Over similar past setups (${a.method}) the stock rose after ${Math.round(probUp * 100)}% of ${H}-trading-day windows (all windows: ${Math.round(baseProbUp * 100)}%); median move ${r2(p50 * 100)}%.`);
    f.push(`Trend: ${trendState}${mom12_1 !== null ? `; 12-1 month momentum ${r2(mom12_1 * 100)}%` : ''}.`);
    if (tm.length >= 8) f.push(`${seas.month} has averaged ${seas.avgMonthlyReturnPct}% with a ${seas.monthlyWinRatePct}% win rate over ${tm.length} years.`);
    if (hit !== null) f.push(`Walk-forward backtest of this rule: ${hit}% correct direction over ${tests} past calls.`);
    if (curDD < -0.2) risks.push(`Trading ${r2(-curDD * 100)}% below its all-time high.`);
    if (annVol > 0.4) risks.push(`High long-run volatility (${r2(annVol * 100)}% a year).`);
    if (years < 10) risks.push(`Only ${r2(years)} years of history available — statistics are less reliable.`);
    if (effN < 8) risks.push('Few independent historical analogs for this horizon.');
    if (hit !== null && hit < 50) risks.push(`Past hit-rate of this rule is only ${hit}% — treat as weak evidence.`);

    return {
      symbol, yearsOfData: r2(years), bars: n, reliable: years >= 3, horizonDays: H,
      profile: {
        cagrPct: r2(cagr * 100), annualVolPct: r2(annVol * 100), maxDrawdownPct: r2(maxDD * 100), currentDrawdownPct: r2(curDD * 100),
        sharpe: r2(annVol > 0 ? (cagr - 0.06) / annVol : 0),
        returnsPct: { '1y': retOver(1), '3y': retOver(3), '5y': retOver(5), '10y': retOver(10), '20y': retOver(20) }, pricePercentile: pricePct,
      },
      trend: { above200dma: above, dma200Rising: rising, momentum12m1m: mom12_1 === null ? null : r2(mom12_1 * 100), rsi14: r2(rsi[n - 1]), state: trendState },
      seasonality: seas,
      forecast: {
        method: a.method, analogSamples: useRets.length, effectiveSamples: effN, probUpPct: Math.round(probUp * 100), baseProbUpPct: Math.round(baseProbUp * 100),
        medianReturnPct: r2(p50 * 100), p10ReturnPct: r2(p10 * 100), p90ReturnPct: r2(p90 * 100),
        expectedPrice: r2(cur * (1 + p50)), rangeLow: r2(cur * (1 + p10)), rangeHigh: r2(cur * (1 + p90)),
      },
      backtest: { tests, hitRatePct: hit, note: 'Monthly walk-forward test over the last ~6 years using only data available at each date.' },
      score: Math.round(score), signal, confidence, keyFindings: f, keyRisks: risks,
    };
  }
}

export const longTermStatsService = new LongTermStatsService();
