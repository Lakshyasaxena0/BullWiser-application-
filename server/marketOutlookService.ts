// ─────────────────────────────────────────────────────────────────────────────
// marketOutlookService.ts — FIXED VERSION
// Predicts bullish / bearish outlook for stock sectors and cryptocurrencies
// Statistical Analysis (50%) + Vedic Astrology (50%)
// 
// KEY FIX: Now properly calculates planetary positions for TARGET DATE
// instead of always using current date
// ─────────────────────────────────────────────────────────────────────────────

import { stockDataService }          from './stockDataService';
import { cryptoDataService }         from './cryptoDataService';
import { astrologyService }          from './astrologyService';
import { advancedAstrologyService }  from './advancedAstrologyService';
import { statisticalAnalysisService } from './statisticalAnalysisService';

// ── Sector → representative stocks ───────────────────────────────────────────
const SECTOR_STOCKS: Record<string, string[]> = {
  'IT':      ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'],
  'Banking': ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK'],
  'Pharma':  ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP'],
  'Energy':  ['RELIANCE', 'ONGC', 'BPCL', 'NTPC', 'POWERGRID'],
  'Auto':    ['MARUTI', 'TATAMOTORS', 'HEROMOTOCO', 'EICHERMOT', 'BAJAJFINSV'],
  'FMCG':    ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'TITAN'],
  'Metals':  ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL', 'COALINDIA'],
  'Realty':  ['ADANIENT', 'ADANIPORTS', 'DMART', 'IRCTC', 'ZOMATO'],
};

// ── Crypto list ───────────────────────────────────────────────────────────────
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'MATIC', 'AVAX', 'LINK'];
const CRYPTO_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana',
  XRP: 'XRP', ADA: 'Cardano', DOGE: 'Dogecoin', MATIC: 'Polygon',
  AVAX: 'Avalanche', LINK: 'Chainlink',
};

// ── Sector planetary rulers ───────────────────────────────────────────────────
const SECTOR_RULERS: Record<string, string[]> = {
  'IT':      ['Mercury', 'Rahu'],
  'Banking': ['Jupiter', 'Venus'],
  'Pharma':  ['Moon', 'Jupiter'],
  'Energy':  ['Sun', 'Mars'],
  'Auto':    ['Mars', 'Saturn'],
  'FMCG':    ['Venus', 'Moon'],
  'Metals':  ['Saturn', 'Mars'],
  'Realty':  ['Mars', 'Saturn'],
};

// ── Crypto planetary rulers ───────────────────────────────────────────────────
const CRYPTO_RULERS: Record<string, string> = {
  BTC: 'Sun', ETH: 'Mercury', BNB: 'Venus', SOL: 'Mars',
  XRP: 'Saturn', ADA: 'Jupiter', DOGE: 'Moon', MATIC: 'Moon',
  AVAX: 'Mars', LINK: 'Mercury',
};

// ── Planetary bullish bias ────────────────────────────────────────────────────
const PLANET_BIAS: Record<string, number> = {
  Sun: 0.70, Moon: 0.50, Mars: 0.60, Mercury: 0.65,
  Jupiter: 0.90, Venus: 0.80, Saturn: 0.30, Rahu: 0.40, Ketu: 0.35,
};

// ── Horizon → volatility band multiplier ─────────────────────────────────────
const HORIZON_BAND: Record<string, number> = {
  '1w': 0.04, '2w': 0.06, '3w': 0.08,
  '1m': 0.10, '2m': 0.14, '4m': 0.18, '6m': 0.22, '1y': 0.30,
};

// ── Horizon → days ───────────────────────────────────────────────────────────
export const HORIZON_DAYS: Record<string, number> = {
  '1w': 7, '2w': 14, '3w': 21, '1m': 30,
  '2m': 60, '4m': 120, '6m': 180, '1y': 365,
};

// ─────────────────────────────────────────────────────────────────────────────
export interface SectorOutlook {
  sector:             string;
  signal:             'bullish' | 'bearish' | 'neutral';
  strength:           'strong' | 'moderate' | 'weak';
  confidence:         number;
  changeEstimate:     number;        // expected % change
  rangeLow:           number;        // e.g. -5 (%)
  rangeHigh:          number;        // e.g. +12 (%)
  statsScore:         number;        // 0-100
  astroScore:         number;        // 0-100
  keyFactors:         string[];
  risks:              string[];
  topStock:           string;
  topStockChange:     number;
  horizon:            string;
  targetDate:         string;
}

export interface CryptoOutlook {
  symbol:             string;
  name:               string;
  signal:             'bullish' | 'bearish' | 'neutral';
  strength:           'strong' | 'moderate' | 'weak';
  confidence:         number;
  changeEstimate:     number;
  rangeLow:           number;
  rangeHigh:          number;
  currentPrice:       number;
  statsScore:         number;
  astroScore:         number;
  keyFactors:         string[];
  risks:              string[];
  horizon:            string;
  targetDate:         string;
}

export interface MarketOutlookResult {
  generatedAt:  string;
  horizon:      string;
  targetDate:   string;
  daysAhead:    number;
  stocks: {
    bullish: SectorOutlook[];
    bearish: SectorOutlook[];
    neutral: SectorOutlook[];
    all:     SectorOutlook[];
  };
  crypto: {
    bullish: CryptoOutlook[];
    bearish: CryptoOutlook[];
    neutral: CryptoOutlook[];
    all:     CryptoOutlook[];
  };
  marketSummary: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export class MarketOutlookService {

  // ── Main entry point ──────────────────────────────────────────────────────
  async generateOutlook(horizon: string): Promise<MarketOutlookResult> {
    const days       = HORIZON_DAYS[horizon] || 30;
    const targetDate = new Date(Date.now() + days * 86400000);
    const band       = HORIZON_BAND[horizon] || 0.10;

    console.log(`[Outlook] Generating ${horizon} outlook (${days} days ahead) → target: ${targetDate.toISOString().split('T')[0]}`);

    // ★ KEY FIX: Fetch astrology data for TARGET DATE, not current date
    const [astroData, sectorOutlooks, cryptoOutlooks] = await Promise.all([
      astrologyService.getCurrentAstrology(targetDate), // ← FIXED: was new Date()
      this.analyzeSectors(horizon, days, band, targetDate), // ← Pass targetDate
      this.analyzeCryptos(horizon, days, band, targetDate), // ← Pass targetDate
    ]);

    // Sort by changeEstimate descending
    const allSectors = sectorOutlooks.sort((a, b) => b.changeEstimate - a.changeEstimate);
    const allCryptos = cryptoOutlooks.sort((a, b) => b.changeEstimate - a.changeEstimate);

    const stocksBullish = allSectors.filter(s => s.signal === 'bullish');
    const stocksBearish = allSectors.filter(s => s.signal === 'bearish');
    const stocksNeutral = allSectors.filter(s => s.signal === 'neutral');

    const cryptoBullish = allCryptos.filter(c => c.signal === 'bullish');
    const cryptoBearish = allCryptos.filter(c => c.signal === 'bearish');
    const cryptoNeutral = allCryptos.filter(c => c.signal === 'neutral');

    const marketSummary = this.buildMarketSummary(horizon, stocksBullish, stocksBearish, cryptoBullish, cryptoBearish, astroData);

    console.log(`[Outlook] ${horizon} result: ${stocksBullish.length} bullish, ${stocksBearish.length} bearish, ${stocksNeutral.length} neutral sectors`);

    return {
      generatedAt:  new Date().toISOString(),
      horizon,
      targetDate:   targetDate.toISOString(),
      daysAhead:    days,
      stocks: { bullish: stocksBullish, bearish: stocksBearish, neutral: stocksNeutral, all: allSectors },
      crypto: { bullish: cryptoBullish, bearish: cryptoBearish, neutral: cryptoNeutral, all: allCryptos },
      marketSummary,
    };
  }

  // ── Analyze all stock sectors ─────────────────────────────────────────────
  private async analyzeSectors(horizon: string, days: number, band: number, targetDate: Date): Promise<SectorOutlook[]> {
    // ★ KEY FIX: Get astrology data for TARGET DATE
    const astroData  = await astrologyService.getCurrentAstrology(targetDate); // ← FIXED: was new Date()

    const results = await Promise.all(
      Object.entries(SECTOR_STOCKS).map(async ([sector, stocks]) => {
        return this.analyzeSingleSector(sector, stocks, horizon, days, band, targetDate, astroData);
      })
    );

    return results.filter(Boolean) as SectorOutlook[];
  }

  private async analyzeSingleSector(
    sector: string, stocks: string[], horizon: string,
    days: number, band: number, targetDate: Date, astroData: any
  ): Promise<SectorOutlook> {
    // ── Statistical: fetch quotes and historical for representative stocks ──
    let statsScore   = 50;
    let topStock     = stocks[0];
    let topChange    = 0;
    let statsFactors: string[] = [];
    let statsRisks:   string[] = [];

    try {
      // Use first 2 stocks to keep API calls manageable
      const sampleStocks = stocks.slice(0, 2);
      const statsResults = await Promise.all(
        sampleStocks.map(async symbol => {
          try {
            const hist = await stockDataService.getHistoricalData(symbol, Math.min(days + 30, 90));
            if (hist && hist.length >= 10) {
              const bars = statisticalAnalysisService.normalizeYahooData(hist);
              return statisticalAnalysisService.analyzeHistoricalData(symbol, bars);
            }
            return null;
          } catch { return null; }
        })
      );

      const validStats = statsResults.filter(Boolean);
      if (validStats.length > 0) {
        statsScore = Math.round(validStats.reduce((s, r) => s + (r!.statisticalScore), 0) / validStats.length);
        const best = validStats.reduce((a, b) => (a!.statisticalScore > b!.statisticalScore ? a : b));
        topStock   = best!.symbol;
        topChange  = best!.momentum.roc20;

        // Collect key factors from best performing stock
        statsFactors = best!.keyFindings.slice(0, 3);
        statsRisks   = best!.keyRisks.slice(0, 2);

        // Add sector-level factor
        const trend = best!.movingAverages.trend;
        if (trend === 'uptrend')   statsFactors.unshift(`${sector} sector in technical uptrend`);
        if (trend === 'downtrend') statsRisks.unshift(`${sector} sector in technical downtrend`);
      }
    } catch (err) {
      console.error(`[Outlook] Stats error for ${sector}:`, err);
    }

    // ── Astrological: sector planetary rulers ─────────────────────────────
    const rulers    = SECTOR_RULERS[sector] || ['Mercury'];
    let astroScore  = 50;
    const astroFactors: string[] = [];

    try {
      const planetaryPositions = astroData.planetaryPositions || [];
      let totalBias = 0;

      for (const ruler of rulers) {
        const pos = planetaryPositions.find((p: any) => p.planet === ruler);
        const bias = PLANET_BIAS[ruler] || 0.5;

        let rulerScore = bias * 100;
        if (pos?.retrograde) rulerScore = 100 - rulerScore;

        // Exaltation / debilitation bonus
        const exaltations: Record<string, string> = {
          Sun: 'Aries', Moon: 'Taurus', Mars: 'Capricorn',
          Mercury: 'Virgo', Jupiter: 'Cancer', Venus: 'Pisces', Saturn: 'Libra',
        };
        const debilitations: Record<string, string> = {
          Sun: 'Libra', Moon: 'Scorpio', Mars: 'Cancer',
          Mercury: 'Pisces', Jupiter: 'Capricorn', Venus: 'Virgo', Saturn: 'Aries',
        };

        if (pos && exaltations[ruler] === pos.sign) {
          rulerScore *= 1.2;
          astroFactors.push(`${ruler} exalted in ${pos.sign} — strong support for ${sector}`);
        } else if (pos && debilitations[ruler] === pos.sign) {
          rulerScore *= 0.8;
          astroFactors.push(`${ruler} debilitated in ${pos.sign} — challenges for ${sector}`);
        } else if (pos) {
          astroFactors.push(`${ruler} in ${pos.sign}${pos.retrograde ? ' (retrograde)' : ''}`);
        }

        totalBias += rulerScore;
      }

      astroScore = Math.round(Math.min(100, Math.max(0, totalBias / rulers.length)));

      // Advanced sector analysis with TARGET DATE
      const advanced = await advancedAstrologyService.analyzeStockBySector(stocks[0], sector, targetDate).catch(() => null);
      if (advanced) {
        astroScore = Math.round((astroScore + advanced.sectorStrength) / 2);
        if (advanced.timing === 'excellent') astroFactors.push(`Excellent planetary timing for ${sector} on ${horizon} horizon`);
        if (advanced.timing === 'challenging') astroFactors.push(`Challenging planetary period for ${sector} ahead`);
        if (advanced.keyFactors?.length) astroFactors.push(...advanced.keyFactors.slice(0, 2));
      }
    } catch (err) {
      console.error(`[Outlook] Astro error for ${sector}:`, err);
    }

    // ── Combine 50/50 ─────────────────────────────────────────────────────
    const combinedScore = Math.round((statsScore * 0.5) + (astroScore * 0.5));
    const signal: SectorOutlook['signal'] = combinedScore > 60 ? 'bullish' : combinedScore < 40 ? 'bearish' : 'neutral';
    const confidence = Math.round(40 + Math.abs(combinedScore - 50) * 1.1);

    // ── Change estimate based on score and horizon band ───────────────────
    const scoreBias = (combinedScore - 50) / 50; // -1 to +1
    const changeEstimate = Math.round(scoreBias * band * 100 * 100) / 100;
    const rangeLow  = Math.round((changeEstimate - band * 50) * 100) / 100;
    const rangeHigh = Math.round((changeEstimate + band * 50) * 100) / 100;

    const strength: SectorOutlook['strength'] =
      Math.abs(combinedScore - 50) > 20 ? 'strong' :
      Math.abs(combinedScore - 50) > 10 ? 'moderate' : 'weak';

    const allFactors = [...statsFactors, ...astroFactors].slice(0, 5);
    const allRisks   = [...statsRisks].slice(0, 3);
    if (signal === 'bearish' && allRisks.length < 2) allRisks.push(`${sector} sector faces headwinds over ${horizon} horizon`);

    return {
      sector, signal, strength, confidence, changeEstimate, rangeLow, rangeHigh,
      statsScore, astroScore,
      keyFactors: allFactors.length > 0 ? allFactors : [`${sector} sector analysis based on ${horizon} horizon`],
      risks:      allRisks.length  > 0 ? allRisks  : [],
      topStock, topStockChange: Math.round(topChange * 100) / 100,
      horizon, targetDate: targetDate.toISOString(),
    };
  }

  // ── Analyze all cryptocurrencies ──────────────────────────────────────────
  private async analyzeCryptos(horizon: string, days: number, band: number, targetDate: Date): Promise<CryptoOutlook[]> {
    // ★ KEY FIX: Get astrology for TARGET DATE
    const astroData = await astrologyService.getCurrentAstrology(targetDate); // ← FIXED: was new Date()

    const results = await Promise.all(
      CRYPTO_SYMBOLS.map(symbol => this.analyzeSingleCrypto(symbol, horizon, days, band, astroData, targetDate))
    );

    return results.filter(Boolean) as CryptoOutlook[];
  }

  private async analyzeSingleCrypto(
    symbol: string, horizon: string, days: number, band: number, astroData: any, targetDate: Date
  ): Promise<CryptoOutlook | null> {
    // Crypto gets higher volatility band
    const cryptoBand = band * 1.5;

    // ── Get current price ─────────────────────────────────────────────────
    let currentPrice = 0;
    try {
      const quote = await cryptoDataService.getCryptoQuote(symbol);
      currentPrice = quote?.lastPrice || 0;
    } catch { /* use 0 */ }

    // ── Statistical: use quote history if available ───────────────────────
    let statsScore   = 50;
    let statsFactors: string[] = [];
    let statsRisks:   string[] = [];

    try {
      const hist = await cryptoDataService.getCryptoHistoricalData(symbol, Math.min(days + 30, 90));
      if (hist && hist.length >= 10) {
        const bars = statisticalAnalysisService.normalizeYahooData(hist);
        const result = statisticalAnalysisService.analyzeHistoricalData(symbol, bars);
        if (result) {
          statsScore   = result.statisticalScore;
          statsFactors = result.keyFindings.slice(0, 3);
          statsRisks   = result.keyRisks.slice(0, 2);
        }
      }
    } catch { /* skip */ }

    // ── Astrological ──────────────────────────────────────────────────────
    let astroScore = 50;
    const astroFactors: string[] = [];

    try {
      const ruler = CRYPTO_RULERS[symbol] || 'Mercury';
      const pos   = (astroData.planetaryPositions || []).find((p: any) => p.planet === ruler);
      const bias  = PLANET_BIAS[ruler] || 0.5;

      let rulerScore = bias * 100;
      if (pos?.retrograde) {
        rulerScore = 100 - rulerScore;
        astroFactors.push(`${ruler} retrograde on ${horizon} horizon — ${symbol} may face turbulence`);
      } else if (pos) {
        astroFactors.push(`${ruler} (${symbol}'s ruler) in ${pos.sign} for ${horizon} period`);
      }

      // Hora influence
      const hora = astroData.hora || '';
      if (hora === ruler) {
        rulerScore = Math.min(100, rulerScore + 15);
        astroFactors.push(`${ruler} hora active — favorable for ${symbol}`);
      }

      astroScore = Math.round(Math.min(100, Math.max(0, rulerScore)));

      // Lunar phase influence on crypto (crypto is highly Moon-sensitive)
      if (astroData.lunarPhase === 'Full Moon') {
        astroScore = Math.min(100, astroScore + 8);
        astroFactors.push('Full Moon period — heightened crypto volatility expected');
      } else if (astroData.lunarPhase === 'New Moon') {
        astroFactors.push('New Moon phase — potential trend reversal period');
      }
    } catch { /* skip */ }

    // ── Combine 50/50 ─────────────────────────────────────────────────────
    const combinedScore = Math.round((statsScore * 0.5) + (astroScore * 0.5));
    const signal: CryptoOutlook['signal'] = combinedScore > 60 ? 'bullish' : combinedScore < 40 ? 'bearish' : 'neutral';
    const confidence = Math.round(35 + Math.abs(combinedScore - 50) * 0.9); // crypto lower confidence

    const scoreBias     = (combinedScore - 50) / 50;
    const changeEstimate = Math.round(scoreBias * cryptoBand * 100 * 100) / 100;
    const rangeLow      = Math.round((changeEstimate - cryptoBand * 60) * 100) / 100;
    const rangeHigh     = Math.round((changeEstimate + cryptoBand * 60) * 100) / 100;

    const strength: CryptoOutlook['strength'] =
      Math.abs(combinedScore - 50) > 20 ? 'strong' :
      Math.abs(combinedScore - 50) > 10 ? 'moderate' : 'weak';

    const allFactors = [...statsFactors, ...astroFactors].slice(0, 4);
    const allRisks   = [...statsRisks, 'Crypto markets are highly volatile — use stop-loss'].slice(0, 3);

    return {
      symbol, name: CRYPTO_NAMES[symbol] || symbol, signal, strength,
      confidence, changeEstimate, rangeLow, rangeHigh, currentPrice,
      statsScore, astroScore,
      keyFactors: allFactors.length > 0 ? allFactors : [`${symbol} analysis for ${horizon} horizon`],
      risks: allRisks,
      horizon, targetDate: targetDate.toISOString(),
    };
  }

  // ── Market summary text ───────────────────────────────────────────────────
  private buildMarketSummary(
    horizon: string,
    bullishSectors: SectorOutlook[], bearishSectors: SectorOutlook[],
    bullishCrypto:  CryptoOutlook[],  bearishCrypto:  CryptoOutlook[],
    astroData: any
  ): string {
    const topBullish = bullishSectors[0]?.sector;
    const topBearish = bearishSectors[0]?.sector;
    const topCrypto  = bullishCrypto[0]?.symbol;
    const hora       = astroData.hora || 'Mercury';

    let summary = `For the ${horizon} horizon: `;
    if (topBullish) summary += `${topBullish} leads the bullish outlook. `;
    if (topBearish) summary += `${topBearish} faces headwinds. `;
    if (topCrypto)  summary += `In crypto, ${topCrypto} shows the strongest upside potential. `;
    summary += `Planetary configuration at target date shows ${hora} hora influence, adding ${['Jupiter', 'Venus', 'Mercury'].includes(hora) ? 'positive' : 'cautionary'} energy.`;
    return summary;
  }
}

export const marketOutlookService = new MarketOutlookService();
