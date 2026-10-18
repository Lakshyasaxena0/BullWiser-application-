// ─────────────────────────────────────────────────────────────────────────────
// marketOutlookService.ts
// Anticipated top-performing and weakest sectors (stocks) and coins (crypto) for a chosen time horizon.
//
// Every number comes from real data — nothing is a fixed/made-up score:
//   • Statistics (55%): each constituent's own price history (up to 8 years) → 20-year-style analog forecast
//     (longTermStatsService): median / p10 / p90 return over the horizon, probability of a rise, volatility.
//   • Astrology (45%): the real sidereal sky computed for dates across the window (vedic/analysis):
//     sector karakatwa scores (stocks) and per-coin asset view (crypto).
//     Astrology shifts the statistical expectation by at most ±½ of the asset's own horizon volatility.
// A sector or coin whose price data cannot be fetched is listed under `unavailable`, never given a default score.
// ─────────────────────────────────────────────────────────────────────────────

import { stockDataService }           from './stockDataService';
import { statisticalAnalysisService } from './statisticalAnalysisService';
import { longTermStatsService, type LongTermStats } from './longTermStatsService';
import { analyzeSky, sectorOutlook, assetView } from './vedic/analysis';

// Sector name (matches the Vedic karakatwa sector names) → representative large caps
const SECTOR_STOCKS: Record<string, string[]> = {
  'IT & Software':           ['TCS', 'INFY', 'HCLTECH', 'WIPRO'],
  'Banking & Finance':       ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK'],
  'Pharma':                  ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB'],
  'Oil & Gas':               ['RELIANCE', 'ONGC', 'BPCL', 'IOC'],
  'Power & Energy':          ['NTPC', 'POWERGRID', 'TATAPOWER', 'ADANIGREEN'],
  'Automobiles':             ['MARUTI', 'TATAMOTORS', 'EICHERMOT', 'HEROMOTOCO'],
  'FMCG':                    ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA'],
  'Steel & Metals':          ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL'],
  'Infrastructure & Cement': ['LT', 'ULTRACEMCO', 'GRASIM', 'ADANIPORTS'],
  'Real Estate':             ['DLF', 'GODREJPROP', 'OBEROIRLTY'],
  'Telecom':                 ['BHARTIARTL', 'IDEA'],
  'Defence':                 ['HAL', 'BEL', 'BDL'],
  'Insurance':               ['SBILIFE', 'HDFCLIFE', 'LICI'],
  'Consumer Durables':       ['TITAN', 'ASIANPAINT', 'HAVELLS'],
};

const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT', 'TRX', 'LTC', 'BCH', 'ATOM', 'NEAR', 'UNI', 'SHIB', 'SUI', 'APT', 'ARB'];
const CRYPTO_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano', DOGE: 'Dogecoin', AVAX: 'Avalanche',
  LINK: 'Chainlink', DOT: 'Polkadot', TRX: 'TRON', LTC: 'Litecoin', BCH: 'Bitcoin Cash', ATOM: 'Cosmos', NEAR: 'NEAR Protocol',
  UNI: 'Uniswap', SHIB: 'Shiba Inu', SUI: 'Sui', APT: 'Aptos', ARB: 'Arbitrum',
};

export const HORIZON_DAYS: Record<string, number> = { '1w': 7, '2w': 14, '3w': 21, '1m': 30, '2m': 60, '4m': 120, '6m': 180, '1y': 365 };

export interface SectorOutlook {
  sector: string; signal: 'bullish' | 'bearish' | 'neutral'; strength: 'strong' | 'moderate' | 'weak';
  confidence: number; changeEstimate: number; rangeLow: number; rangeHigh: number;
  statsScore: number; astroScore: number; probUpPct: number;
  keyFactors: string[]; risks: string[]; topStock: string; topStockChange: number;
  stocksAnalysed: number; horizon: string; targetDate: string;
}
export interface CryptoOutlook {
  symbol: string; name: string; signal: 'bullish' | 'bearish' | 'neutral'; strength: 'strong' | 'moderate' | 'weak';
  confidence: number; changeEstimate: number; rangeLow: number; rangeHigh: number; currentPrice: number;
  statsScore: number; astroScore: number; probUpPct: number;
  keyFactors: string[]; risks: string[]; horizon: string; targetDate: string;
}
interface Bucket<T> { bullish: T[]; bearish: T[]; neutral: T[]; all: T[]; topBullish: T[]; topBearish: T[]; unavailable: string[] }
export interface MarketOutlookResult {
  generatedAt: string; horizon: string; targetDate: string; daysAhead: number;
  stocks: Bucket<SectorOutlook>; crypto: Bucket<CryptoOutlook>; marketSummary: string; method: string;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Run async jobs with limited concurrency (keeps Yahoo / CoinGecko happy). */
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const HISTORY_DAYS = 8 * 365;
const HISTORY_TTL = 6 * 3600 * 1000;
const RESULT_TTL = 15 * 60 * 1000;

export class MarketOutlookService {
  private bars = new Map<string, { at: number; value: any[] }>();
  private results = new Map<string, { at: number; value: MarketOutlookResult }>();

  private async history(key: string, loader: () => Promise<any[]>) {
    const hit = this.bars.get(key);
    if (hit && Date.now() - hit.at < HISTORY_TTL) return hit.value;
    const raw = await loader().catch(() => []);
    const bars = statisticalAnalysisService.normalizeYahooData(raw || []);
    if (bars.length) this.bars.set(key, { at: Date.now(), value: bars });
    return bars;
  }
  private stockBars(symbol: string) { return this.history(`S:${symbol}`, () => stockDataService.getHistoricalData(symbol, HISTORY_DAYS)); }
  private cryptoBars(symbol: string) { return this.history(`C:${symbol}`, () => stockDataService.getYahooSeries(`${symbol}-USD`, HISTORY_DAYS)); }

  /** Sky sample dates across the window (25/50/75/100%) – transits during the whole period matter, not just the last day. */
  private sampleDates(days: number): Date[] {
    return [0.25, 0.5, 0.75, 1].map(f => new Date(Date.now() + days * f * 86400000));
  }

  async generateOutlook(horizon: string, opts: { refresh?: boolean } = {}): Promise<MarketOutlookResult> {
    const days = HORIZON_DAYS[horizon] || 30;
    const cached = this.results.get(horizon);
    if (!opts.refresh && cached && Date.now() - cached.at < RESULT_TTL) return cached.value;

    const targetDate = new Date(Date.now() + days * 86400000);
    const skies = this.sampleDates(days).map(d => analyzeSky(d));

    const [stocks, crypto] = await Promise.all([this.analyzeSectors(horizon, targetDate, skies), this.analyzeCryptos(horizon, targetDate, skies)]);
    const result: MarketOutlookResult = {
      generatedAt: new Date().toISOString(), horizon, targetDate: targetDate.toISOString(), daysAhead: days,
      stocks, crypto,
      marketSummary: this.summary(horizon, stocks, crypto),
      method: 'Statistics 55%: own price history (up to 8 years) → analog forecast over the horizon. Astrology 45%: sidereal sky sampled across the window; it can shift the expectation by at most half the asset\'s own horizon volatility.',
    };
    if (stocks.all.length || crypto.all.length) this.results.set(horizon, { at: Date.now(), value: result });   // never cache an empty (no-data) result
    return result;
  }

  private bucket<T extends { signal: string; changeEstimate: number }>(all: T[], unavailable: string[]): Bucket<T> {
    const sorted = [...all].sort((a, b) => b.changeEstimate - a.changeEstimate);
    return {
      all: sorted,
      bullish: sorted.filter(x => x.signal === 'bullish'), bearish: sorted.filter(x => x.signal === 'bearish').reverse(), neutral: sorted.filter(x => x.signal === 'neutral'),
      topBullish: sorted.filter(x => x.changeEstimate > 0).slice(0, 4),
      topBearish: [...sorted].reverse().filter(x => x.changeEstimate < 0).slice(0, 4),
      unavailable,
    };
  }

  // ── Stocks: sectors ───────────────────────────────────────────────────────
  private async analyzeSectors(horizon: string, targetDate: Date, skies: ReturnType<typeof analyzeSky>[]): Promise<Bucket<SectorOutlook>> {
    // Astro: average the sector karakatwa score over the sampled dates, then z-normalise across sectors
    const names = Object.keys(SECTOR_STOCKS);
    const raw: Record<string, number> = {}; const why: Record<string, string[]> = {};
    for (const n of names) raw[n] = 0;
    skies.forEach((sky, i) => {
      const o = sectorOutlook(sky); const map = new Map(o.map(x => [x.sector, x]));
      for (const n of names) { raw[n] += (map.get(n)?.score ?? 0) / skies.length; if (i === skies.length - 1) why[n] = map.get(n)?.reasons ?? []; }
    });
    const vals = names.map(n => raw[n]); const mu = mean(vals), sd = std(vals) || 1;
    const tilt = (n: string) => clamp(((raw[n] - mu) / sd) / 2, -1, 1);

    // Stats for every constituent (concurrency-limited, cached)
    const all = names.flatMap(n => SECTOR_STOCKS[n].map(s => ({ sector: n, symbol: s })));
    const lt = new Map<string, LongTermStats | null>();
    await pool(all, 6, async ({ symbol }) => {
      const bars = await this.stockBars(symbol);
      lt.set(symbol, bars.length >= 260 ? longTermStatsService.analyze(symbol, bars, targetDate) : null);
    });

    const out: SectorOutlook[] = []; const unavailable: string[] = [];
    for (const sector of names) {
      const stats = SECTOR_STOCKS[sector].map(s => lt.get(s)).filter((x): x is LongTermStats => !!x);
      if (!stats.length) { unavailable.push(sector); continue; }
      const statsExp = mean(stats.map(s => s.forecast.medianReturnPct));
      const sigma = mean(stats.map(s => s.profile.annualVolPct * Math.sqrt(s.horizonDays / 252)));
      const astroT = tilt(sector);
      const astroExp = astroT * 0.5 * sigma;
      const expected = 0.55 * statsExp + 0.45 * astroExp;
      const best = stats.reduce((a, b) => (a.forecast.medianReturnPct > b.forecast.medianReturnPct ? a : b));
      const agree = (statsExp >= 0) === (astroExp >= 0);
      const confidence = Math.round(clamp(mean(stats.map(s => s.confidence)) + (agree ? 5 : -8), 30, 85));
      const score = 50 + 50 * Math.tanh(expected / (sigma || 1));
      const signal = expected > 0.15 * sigma ? 'bullish' : expected < -0.15 * sigma ? 'bearish' : 'neutral';
      const dev = Math.abs(expected) / (sigma || 1);
      const shift = expected - statsExp;
      out.push({
        sector, signal, strength: dev > 0.6 ? 'strong' : dev > 0.3 ? 'moderate' : 'weak', confidence,
        changeEstimate: r2(expected),
        rangeLow: r2(mean(stats.map(s => s.forecast.p10ReturnPct)) + shift), rangeHigh: r2(mean(stats.map(s => s.forecast.p90ReturnPct)) + shift),
        statsScore: Math.round(mean(stats.map(s => s.score))), astroScore: Math.round(50 + 50 * astroT),
        probUpPct: Math.round(mean(stats.map(s => s.forecast.probUpPct))),
        keyFactors: [
          `${stats.length} of ${SECTOR_STOCKS[sector].length} constituents analysed; typical outcome ${r2(statsExp)}% over ${horizon} (historical analogs)`,
          ...best.keyFindings.slice(0, 2).map(f => `${best.symbol}: ${f}`),
          ...(why[sector] ?? []).slice(0, 3).map(f => `Astro: ${f}`),
        ].slice(0, 6),
        risks: [...new Set(stats.flatMap(s => s.keyRisks))].slice(0, 3),
        topStock: best.symbol, topStockChange: r2(best.forecast.medianReturnPct),
        stocksAnalysed: stats.length, horizon, targetDate: targetDate.toISOString(),
      });
    }
    return this.bucket(out, unavailable);
  }

  // ── Crypto: coins ─────────────────────────────────────────────────────────
  private async analyzeCryptos(horizon: string, targetDate: Date, skies: ReturnType<typeof analyzeSky>[]): Promise<Bucket<CryptoOutlook>> {
    const results = await pool(CRYPTO_SYMBOLS, 5, async (symbol) => {
      const bars = await this.cryptoBars(symbol);
      const lt = bars.length >= 260 ? longTermStatsService.analyze(symbol, bars, targetDate) : null;
      return { symbol, lt, last: bars.length ? bars[bars.length - 1].close : 0 };
    });

    const out: CryptoOutlook[] = []; const unavailable: string[] = [];
    for (const { symbol, lt, last } of results) {
      if (!lt) { unavailable.push(symbol); continue; }
      const views = skies.map(sky => assetView(sky, symbol, 'crypto'));
      const astroT = clamp(mean(views.map(v => v.score)), -1, 1);
      const sigma = lt.profile.annualVolPct * Math.sqrt(lt.horizonDays / 252);
      const statsExp = lt.forecast.medianReturnPct;
      const astroExp = astroT * 0.5 * sigma;
      const expected = 0.55 * statsExp + 0.45 * astroExp;
      const agree = (statsExp >= 0) === (astroExp >= 0);
      const dev = Math.abs(expected) / (sigma || 1);
      const shift = expected - statsExp;
      const last_ = views[views.length - 1];
      out.push({
        symbol, name: CRYPTO_NAMES[symbol] || symbol,
        signal: expected > 0.15 * sigma ? 'bullish' : expected < -0.15 * sigma ? 'bearish' : 'neutral',
        strength: dev > 0.6 ? 'strong' : dev > 0.3 ? 'moderate' : 'weak',
        confidence: Math.round(clamp(lt.confidence - 5 + (agree ? 5 : -8), 30, 80)),
        changeEstimate: r2(expected), rangeLow: r2(lt.forecast.p10ReturnPct + shift), rangeHigh: r2(lt.forecast.p90ReturnPct + shift),
        currentPrice: last,
        statsScore: Math.round(lt.score), astroScore: Math.round(50 + 50 * astroT), probUpPct: Math.round(lt.forecast.probUpPct),
        keyFactors: [...lt.keyFindings.slice(0, 3), ...last_.reasons.slice(0, 2).map(f => `Astro: ${f}`)].slice(0, 5),
        risks: [...lt.keyRisks.slice(0, 2), 'Crypto is highly volatile; ranges are wide'].slice(0, 3),
        horizon, targetDate: targetDate.toISOString(),
      });
    }
    return this.bucket(out, unavailable);
  }

  private summary(horizon: string, s: Bucket<SectorOutlook>, c: Bucket<CryptoOutlook>): string {
    const up = s.topBullish.map(x => `${x.sector} (${x.changeEstimate > 0 ? '+' : ''}${x.changeEstimate}%)`).slice(0, 2).join(', ');
    const dn = s.topBearish.map(x => `${x.sector} (${x.changeEstimate}%)`).slice(0, 2).join(', ');
    const cu = c.topBullish[0], cd = c.topBearish[0];
    const parts = [`For the ${horizon} horizon:`];
    if (up) parts.push(`strongest sectors: ${up}.`);
    if (dn) parts.push(`weakest sectors: ${dn}.`);
    if (cu) parts.push(`Crypto leader: ${cu.symbol} (${cu.changeEstimate > 0 ? '+' : ''}${cu.changeEstimate}%).`);
    if (cd) parts.push(`Crypto laggard: ${cd.symbol} (${cd.changeEstimate}%).`);
    if (!up && !dn && !cu) parts.push('market data was unavailable right now — please refresh in a moment.');
    return parts.join(' ');
  }
}

export const marketOutlookService = new MarketOutlookService();
