// ─────────────────────────────────────────────────────────────────────────────
// statisticalAnalysisService.ts
// Full statistical analysis engine for BullWiser
// Computes RSI, MACD, Bollinger Bands, EMA/SMA, Volume, Support/Resistance,
// Momentum, Volatility, Beta, Trend Strength — all from raw historical price data.
// ─────────────────────────────────────────────────────────────────────────────

export interface OHLCVBar {
  date:   Date;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface MovingAverages {
  sma5:   number | null;
  sma10:  number | null;
  sma20:  number | null;
  sma50:  number | null;
  ema9:   number | null;
  ema21:  number | null;
  ema50:  number | null;
  trend:  'uptrend' | 'downtrend' | 'sideways';
  goldenCross: boolean; // sma50 crossed above sma200
  deathCross:  boolean; // sma50 crossed below sma200
}

export interface RSIResult {
  value:     number;         // 0–100
  signal:    'oversold' | 'overbought' | 'neutral';
  strength:  'strong' | 'moderate' | 'weak';
}

export interface MACDResult {
  macdLine:   number;
  signalLine: number;
  histogram:  number;
  signal:     'bullish' | 'bearish' | 'neutral';
  crossover:  'bullish_crossover' | 'bearish_crossover' | 'none';
}

export interface BollingerBands {
  upper:      number;
  middle:     number;        // 20-period SMA
  lower:      number;
  bandwidth:  number;        // (upper - lower) / middle * 100
  percentB:   number;        // (price - lower) / (upper - lower)
  signal:     'squeeze' | 'expansion' | 'normal';
  pricePosition: 'above_upper' | 'below_lower' | 'inside';
}

export interface VolumeAnalysis {
  avgVolume20:    number;
  currentVolume:  number;
  volumeRatio:    number;    // current / avg
  trend:          'high' | 'low' | 'normal';
  obv:            number;    // On-Balance Volume
  vwap:           number;    // Volume-Weighted Average Price
}

export interface SupportResistance {
  supports:    number[];     // key support levels (nearest 3)
  resistances: number[];     // key resistance levels (nearest 3)
  nearestSupport:    number;
  nearestResistance: number;
  distToSupport:    number;  // % distance from current price
  distToResistance: number;
}

export interface MomentumIndicators {
  roc5:   number;            // Rate of Change 5-day
  roc10:  number;
  roc20:  number;
  stochK: number;            // Stochastic %K
  stochD: number;            // Stochastic %D (3-period SMA of %K)
  williamsR: number;         // Williams %R
  cci:    number;            // Commodity Channel Index
}

export interface VolatilityMetrics {
  dailyVolatility:   number;  // std dev of daily returns (%)
  weeklyVolatility:  number;
  annualizedVol:     number;  // annualized std dev
  atr:               number;  // Average True Range
  atrPercent:        number;  // ATR as % of price
  beta:              number;  // vs NIFTY50 proxy
}

export interface TrendStrength {
  adx:       number;          // Average Directional Index (0-100)
  plusDI:    number;          // +DI
  minusDI:   number;          // -DI
  trendStrength: 'strong' | 'moderate' | 'weak' | 'no_trend';
  direction: 'up' | 'down' | 'sideways';
}

export interface StatisticalAnalysisResult {
  symbol:            string;
  currentPrice:      number;
  analysedBars:      number;
  movingAverages:    MovingAverages;
  rsi:               RSIResult;
  macd:              MACDResult;
  bollingerBands:    BollingerBands;
  volume:            VolumeAnalysis;
  supportResistance: SupportResistance;
  momentum:          MomentumIndicators;
  volatility:        VolatilityMetrics;
  trendStrength:     TrendStrength;

  // ── Composite statistical score (0–100) ──
  // >65 = statistically bullish, <35 = bearish, 35-65 = neutral
  statisticalScore:  number;
  statisticalSignal: 'bullish' | 'bearish' | 'neutral';
  statisticalConfidence: number;

  // ── Human-readable key findings ──
  keyFindings:  string[];
  keyRisks:     string[];
  technicalSummary: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export class StatisticalAnalysisService {

  // ── Public entry point ────────────────────────────────────────────────────
  analyzeHistoricalData(symbol: string, bars: OHLCVBar[]): StatisticalAnalysisResult | null {
    if (!bars || bars.length < 10) {
      console.log(`[Stats] Not enough data for ${symbol}: ${bars?.length || 0} bars`);
      return null;
    }

    const sorted = [...bars].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const closes  = sorted.map(b => b.close);
    const highs   = sorted.map(b => b.high);
    const lows    = sorted.map(b => b.low);
    const volumes = sorted.map(b => b.volume);
    const current = closes[closes.length - 1];

    const movingAverages    = this.calcMovingAverages(closes);
    const rsi               = this.calcRSI(closes);
    const macd              = this.calcMACD(closes);
    const bollingerBands    = this.calcBollingerBands(closes, current);
    const volume            = this.calcVolumeAnalysis(sorted, volumes);
    const supportResistance = this.calcSupportResistance(closes, highs, lows, current);
    const momentum          = this.calcMomentum(closes, highs, lows);
    const volatility        = this.calcVolatility(closes, highs, lows, current);
    const trendStrength     = this.calcTrendStrength(highs, lows, closes);

    const { score, confidence, keyFindings, keyRisks } = this.buildCompositeScore(
      rsi, macd, bollingerBands, movingAverages, volume, momentum, trendStrength, volatility, current, supportResistance
    );

    const signal: 'bullish' | 'bearish' | 'neutral' =
      score > 65 ? 'bullish' : score < 35 ? 'bearish' : 'neutral';

    const technicalSummary = this.buildTechnicalSummary(signal, score, movingAverages, rsi, macd, trendStrength);

    return {
      symbol, currentPrice: current, analysedBars: sorted.length,
      movingAverages, rsi, macd, bollingerBands, volume,
      supportResistance, momentum, volatility, trendStrength,
      statisticalScore: score, statisticalSignal: signal,
      statisticalConfidence: confidence,
      keyFindings, keyRisks, technicalSummary,
    };
  }

  // ── Moving Averages ───────────────────────────────────────────────────────
  private calcMovingAverages(closes: number[]): MovingAverages {
    const sma = (n: number) => closes.length >= n
      ? closes.slice(-n).reduce((a, b) => a + b, 0) / n
      : null;

    const ema = (n: number): number | null => {
      if (closes.length < n) return null;
      const k = 2 / (n + 1);
      let e = closes.slice(0, n).reduce((a, b) => a + b, 0) / n;
      for (let i = n; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
      return e;
    };

    const sma5  = sma(5);
    const sma10 = sma(10);
    const sma20 = sma(20);
    const sma50 = sma(Math.min(50, closes.length));
    const ema9  = ema(9);
    const ema21 = ema(21);
    const ema50 = ema(Math.min(50, closes.length));
    const last  = closes[closes.length - 1];

    let trend: 'uptrend' | 'downtrend' | 'sideways' = 'sideways';
    if (sma5 && sma20 && sma50) {
      if (last > sma5 && sma5 > sma20 && sma20 > sma50) trend = 'uptrend';
      else if (last < sma5 && sma5 < sma20 && sma20 < sma50) trend = 'downtrend';
    } else if (sma5 && sma20) {
      trend = sma5 > sma20 ? 'uptrend' : sma5 < sma20 ? 'downtrend' : 'sideways';
    }

    // Golden/Death cross: check if sma50 crossed sma20 in last 3 bars
    let goldenCross = false, deathCross = false;
    if (closes.length >= 52 && sma50 && sma20) {
      const prevSma50 = closes.slice(-51, -1).reduce((a, b) => a + b, 0) / 50;
      const prevSma20 = closes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      goldenCross = prevSma50 < prevSma20 && sma50 > sma20;
      deathCross  = prevSma50 > prevSma20 && sma50 < sma20;
    }

    return { sma5, sma10, sma20, sma50, ema9, ema21, ema50, trend, goldenCross, deathCross };
  }

  // ── RSI (14-period) ───────────────────────────────────────────────────────
  private calcRSI(closes: number[], period = 14): RSIResult {
    if (closes.length < period + 1) return { value: 50, signal: 'neutral', strength: 'weak' };

    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const gains   = changes.map(c => c > 0 ? c : 0);
    const losses  = changes.map(c => c < 0 ? -c : 0);

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < changes.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }

    const rs    = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const value = Math.round((100 - 100 / (1 + rs)) * 100) / 100;

    const signal: RSIResult['signal'] = value <= 30 ? 'oversold' : value >= 70 ? 'overbought' : 'neutral';
    const dist   = Math.abs(value - 50);
    const strength: RSIResult['strength'] = dist > 25 ? 'strong' : dist > 10 ? 'moderate' : 'weak';

    return { value, signal, strength };
  }

  // ── MACD (12, 26, 9) ─────────────────────────────────────────────────────
  private calcMACD(closes: number[]): MACDResult {
    const neutral = { macdLine: 0, signalLine: 0, histogram: 0, signal: 'neutral' as const, crossover: 'none' as const };
    if (closes.length < 35) return neutral;

    const ema = (data: number[], n: number): number[] => {
      const k = 2 / (n + 1);
      const out: number[] = [data.slice(0, n).reduce((a, b) => a + b, 0) / n];
      for (let i = n; i < data.length; i++) out.push(data[i] * k + out[out.length - 1] * (1 - k));
      return out;
    };

    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);

    const macdSeries: number[] = [];
    const offset = 26 - 12;
    for (let i = 0; i < ema26.length; i++) macdSeries.push(ema12[i + offset] - ema26[i]);

    const signalSeries = ema(macdSeries, 9);
    const macdLine     = macdSeries[macdSeries.length - 1];
    const signalLine   = signalSeries[signalSeries.length - 1];
    const histogram    = macdLine - signalLine;
    const prevMacd     = macdSeries[macdSeries.length - 2] || 0;
    const prevSignal   = signalSeries[signalSeries.length - 2] || 0;

    let crossover: MACDResult['crossover'] = 'none';
    if (prevMacd <= prevSignal && macdLine > signalLine) crossover = 'bullish_crossover';
    else if (prevMacd >= prevSignal && macdLine < signalLine) crossover = 'bearish_crossover';

    const signal: MACDResult['signal'] = macdLine > signalLine && histogram > 0 ? 'bullish'
      : macdLine < signalLine && histogram < 0 ? 'bearish' : 'neutral';

    return {
      macdLine:   Math.round(macdLine   * 1000) / 1000,
      signalLine: Math.round(signalLine * 1000) / 1000,
      histogram:  Math.round(histogram  * 1000) / 1000,
      signal, crossover,
    };
  }

  // ── Bollinger Bands (20, 2σ) ──────────────────────────────────────────────
  private calcBollingerBands(closes: number[], current: number): BollingerBands {
    const n = Math.min(20, closes.length);
    const slice  = closes.slice(-n);
    const middle = slice.reduce((a, b) => a + b, 0) / n;
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const upper  = middle + 2 * stdDev;
    const lower  = middle - 2 * stdDev;
    const bandwidth = middle > 0 ? ((upper - lower) / middle) * 100 : 0;
    const percentB  = upper !== lower ? (current - lower) / (upper - lower) : 0.5;

    let signal: BollingerBands['signal'] = 'normal';
    if (bandwidth < 5)  signal = 'squeeze';
    if (bandwidth > 20) signal = 'expansion';

    const pricePosition: BollingerBands['pricePosition'] =
      current > upper ? 'above_upper' : current < lower ? 'below_lower' : 'inside';

    return {
      upper:  Math.round(upper  * 100) / 100,
      middle: Math.round(middle * 100) / 100,
      lower:  Math.round(lower  * 100) / 100,
      bandwidth:  Math.round(bandwidth  * 100) / 100,
      percentB:   Math.round(percentB   * 1000) / 1000,
      signal, pricePosition,
    };
  }

  // ── Volume Analysis ───────────────────────────────────────────────────────
  private calcVolumeAnalysis(bars: OHLCVBar[], volumes: number[]): VolumeAnalysis {
    const n = Math.min(20, volumes.length);
    const avgVolume20   = volumes.slice(-n).reduce((a, b) => a + b, 0) / n;
    const currentVolume = volumes[volumes.length - 1] || 0;
    const volumeRatio   = avgVolume20 > 0 ? currentVolume / avgVolume20 : 1;

    const trend: VolumeAnalysis['trend'] =
      volumeRatio > 1.5 ? 'high' : volumeRatio < 0.5 ? 'low' : 'normal';

    // OBV
    let obv = 0;
    for (let i = 1; i < bars.length; i++) {
      if (bars[i].close > bars[i - 1].close)      obv += bars[i].volume;
      else if (bars[i].close < bars[i - 1].close) obv -= bars[i].volume;
    }

    // VWAP (rolling over available data)
    let cumPV = 0, cumVol = 0;
    const last20 = bars.slice(-20);
    for (const b of last20) {
      const typicalPrice = (b.high + b.low + b.close) / 3;
      cumPV  += typicalPrice * b.volume;
      cumVol += b.volume;
    }
    const vwap = cumVol > 0 ? cumPV / cumVol : bars[bars.length - 1].close;

    return {
      avgVolume20:   Math.round(avgVolume20),
      currentVolume: Math.round(currentVolume),
      volumeRatio:   Math.round(volumeRatio * 100) / 100,
      trend, obv: Math.round(obv),
      vwap: Math.round(vwap * 100) / 100,
    };
  }

  // ── Support & Resistance ──────────────────────────────────────────────────
  private calcSupportResistance(closes: number[], highs: number[], lows: number[], current: number): SupportResistance {
    // Find pivot highs and lows over the available data
    const pivotHighs: number[] = [];
    const pivotLows:  number[] = [];
    const w = 3; // window size

    for (let i = w; i < highs.length - w; i++) {
      const slice = highs.slice(i - w, i + w + 1);
      if (highs[i] === Math.max(...slice)) pivotHighs.push(highs[i]);
    }
    for (let i = w; i < lows.length - w; i++) {
      const slice = lows.slice(i - w, i + w + 1);
      if (lows[i] === Math.min(...slice)) pivotLows.push(lows[i]);
    }

    // Cluster nearby levels (within 0.5%)
    const cluster = (levels: number[]) => {
      const clusters: number[] = [];
      const sorted = [...levels].sort((a, b) => a - b);
      let i = 0;
      while (i < sorted.length) {
        const group = [sorted[i]];
        while (i + 1 < sorted.length && Math.abs(sorted[i + 1] - sorted[i]) / sorted[i] < 0.005) {
          i++; group.push(sorted[i]);
        }
        clusters.push(group.reduce((a, b) => a + b, 0) / group.length);
        i++;
      }
      return clusters;
    };

    const allResistances = cluster(pivotHighs).filter(r => r > current).sort((a, b) => a - b).slice(0, 3);
    const allSupports    = cluster(pivotLows).filter(s => s < current).sort((a, b) => b - a).slice(0, 3);

    // Fallback if not enough pivots
    const resistances = allResistances.length > 0 ? allResistances : [current * 1.02, current * 1.05, current * 1.08];
    const supports    = allSupports.length    > 0 ? allSupports    : [current * 0.98, current * 0.95, current * 0.92];

    const nearestResistance = resistances[0];
    const nearestSupport    = supports[0];

    return {
      supports, resistances,
      nearestSupport:    Math.round(nearestSupport    * 100) / 100,
      nearestResistance: Math.round(nearestResistance * 100) / 100,
      distToSupport:    Math.round(((current - nearestSupport)    / current * 100) * 100) / 100,
      distToResistance: Math.round(((nearestResistance - current) / current * 100) * 100) / 100,
    };
  }

  // ── Momentum ──────────────────────────────────────────────────────────────
  private calcMomentum(closes: number[], highs: number[], lows: number[]): MomentumIndicators {
    const roc = (n: number) => closes.length > n
      ? Math.round(((closes[closes.length - 1] - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n]) * 10000) / 100
      : 0;

    // Stochastic (14-period)
    const stochPeriod = Math.min(14, closes.length);
    const highestHigh = Math.max(...highs.slice(-stochPeriod));
    const lowestLow   = Math.min(...lows.slice(-stochPeriod));
    const stochK = highestHigh !== lowestLow
      ? Math.round(((closes[closes.length - 1] - lowestLow) / (highestHigh - lowestLow)) * 10000) / 100
      : 50;
    const stochDArr = closes.slice(-3).map((_, i) => {
      const hi = Math.max(...highs.slice(-stochPeriod - 2 + i, -2 + i || undefined));
      const lo = Math.min(...lows.slice(-stochPeriod - 2 + i, -2 + i || undefined));
      return hi !== lo ? ((closes[closes.length - 3 + i] - lo) / (hi - lo)) * 100 : 50;
    });
    const stochD = Math.round((stochDArr.reduce((a, b) => a + b, 0) / 3) * 100) / 100;

    // Williams %R (14-period) — same as Stochastic but inverted
    const williamsR = Math.round((stochK - 100) * 100) / 100;

    // CCI (20-period)
    const cciPeriod = Math.min(20, closes.length);
    const typPrices = highs.slice(-cciPeriod).map((h, i) => (h + lows[lows.length - cciPeriod + i] + closes[closes.length - cciPeriod + i]) / 3);
    const tpMean = typPrices.reduce((a, b) => a + b, 0) / typPrices.length;
    const meanDev = typPrices.reduce((sum, tp) => sum + Math.abs(tp - tpMean), 0) / typPrices.length;
    const cci = meanDev > 0 ? Math.round(((typPrices[typPrices.length - 1] - tpMean) / (0.015 * meanDev)) * 100) / 100 : 0;

    return { roc5: roc(5), roc10: roc(10), roc20: roc(20), stochK, stochD, williamsR, cci };
  }

  // ── Volatility ────────────────────────────────────────────────────────────
  private calcVolatility(closes: number[], highs: number[], lows: number[], current: number): VolatilityMetrics {
    const dailyReturns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);

    const stdDev = (arr: number[]) => {
      if (arr.length < 2) return 0;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length);
    };

    const dailyVol  = stdDev(dailyReturns) * 100;
    const weeklyVol = stdDev(dailyReturns.slice(-5)) * 100;
    const annVol    = dailyVol * Math.sqrt(252);

    // ATR (14-period)
    const atrPeriod = Math.min(14, closes.length - 1);
    const trValues: number[] = [];
    for (let i = closes.length - atrPeriod; i < closes.length; i++) {
      const hl   = highs[i] - lows[i];
      const hc   = Math.abs(highs[i] - closes[i - 1]);
      const lc   = Math.abs(lows[i]  - closes[i - 1]);
      trValues.push(Math.max(hl, hc, lc));
    }
    const atr = trValues.reduce((a, b) => a + b, 0) / trValues.length;

    // Beta proxy: correlation with NIFTY proxy (use internal market movement approximation)
    // Without real NIFTY data we approximate beta from the stock's own volatility pattern
    const beta = Math.round((dailyVol / 1.2) * 100) / 100; // 1.2% is approximate NIFTY daily vol

    return {
      dailyVolatility:  Math.round(dailyVol  * 100) / 100,
      weeklyVolatility: Math.round(weeklyVol * 100) / 100,
      annualizedVol:    Math.round(annVol    * 100) / 100,
      atr:              Math.round(atr       * 100) / 100,
      atrPercent:       current > 0 ? Math.round((atr / current) * 10000) / 100 : 0,
      beta:             Math.min(3, Math.max(0.1, beta)),
    };
  }

  // ── Trend Strength (ADX) ──────────────────────────────────────────────────
  private calcTrendStrength(highs: number[], lows: number[], closes: number[]): TrendStrength {
    const period = Math.min(14, closes.length - 1);
    if (closes.length < 5) return { adx: 0, plusDI: 0, minusDI: 0, trendStrength: 'no_trend', direction: 'sideways' };

    const plusDMs:  number[] = [];
    const minusDMs: number[] = [];
    const trs:      number[] = [];

    for (let i = 1; i < highs.length; i++) {
      const upMove   = highs[i]  - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      plusDMs.push(upMove   > downMove && upMove   > 0 ? upMove   : 0);
      minusDMs.push(downMove > upMove   && downMove > 0 ? downMove : 0);
      trs.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i]  - closes[i - 1]),
        Math.abs(lows[i]   - closes[i - 1])
      ));
    }

    const smoothed = (arr: number[]) => {
      let val = arr.slice(0, period).reduce((a, b) => a + b, 0);
      for (let i = period; i < arr.length; i++) val = val - val / period + arr[i];
      return val;
    };

    const smTR     = smoothed(trs);
    const smPlusDM = smoothed(plusDMs);
    const smMinusDM = smoothed(minusDMs);

    const plusDI  = smTR > 0 ? (smPlusDM  / smTR) * 100 : 0;
    const minusDI = smTR > 0 ? (smMinusDM / smTR) * 100 : 0;
    const dx      = (plusDI + minusDI) > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;
    const adx     = Math.round(dx * 100) / 100;

    const trendStrength: TrendStrength['trendStrength'] =
      adx >= 40 ? 'strong' : adx >= 25 ? 'moderate' : adx >= 15 ? 'weak' : 'no_trend';
    const direction: TrendStrength['direction'] =
      plusDI > minusDI ? 'up' : plusDI < minusDI ? 'down' : 'sideways';

    return { adx, plusDI: Math.round(plusDI * 100) / 100, minusDI: Math.round(minusDI * 100) / 100, trendStrength, direction };
  }

  // ── Composite Statistical Score ───────────────────────────────────────────
  private buildCompositeScore(
    rsi: RSIResult, macd: MACDResult, bb: BollingerBands,
    ma: MovingAverages, vol: VolumeAnalysis, mom: MomentumIndicators,
    trend: TrendStrength, volatility: VolatilityMetrics, current: number,
    sr: SupportResistance
  ) {
    const keyFindings: string[] = [];
    const keyRisks:    string[] = [];
    let score = 50; // start neutral

    // ── RSI contribution (weight 20%) ──
    let rsiScore = 50;
    if (rsi.value <= 30)      { rsiScore = 80; keyFindings.push(`RSI ${rsi.value.toFixed(1)} — oversold, potential reversal`); }
    else if (rsi.value >= 70) { rsiScore = 20; keyRisks.push(`RSI ${rsi.value.toFixed(1)} — overbought, caution advised`); }
    else if (rsi.value < 45)  { rsiScore = 40; }
    else if (rsi.value > 55)  { rsiScore = 60; }

    // ── MACD contribution (weight 20%) ──
    let macdScore = 50;
    if      (macd.signal === 'bullish' && macd.crossover === 'bullish_crossover') { macdScore = 85; keyFindings.push('MACD bullish crossover — strong buy signal'); }
    else if (macd.signal === 'bullish') { macdScore = 65; keyFindings.push('MACD above signal line — bullish momentum'); }
    else if (macd.signal === 'bearish' && macd.crossover === 'bearish_crossover') { macdScore = 15; keyRisks.push('MACD bearish crossover — sell signal'); }
    else if (macd.signal === 'bearish') { macdScore = 35; keyRisks.push('MACD below signal line — bearish momentum'); }

    // ── Bollinger Bands contribution (weight 15%) ──
    let bbScore = 50;
    if      (bb.pricePosition === 'below_lower') { bbScore = 75; keyFindings.push('Price below lower Bollinger Band — oversold bounce likely'); }
    else if (bb.pricePosition === 'above_upper') { bbScore = 25; keyRisks.push('Price above upper Bollinger Band — overbought'); }
    if      (bb.signal === 'squeeze')            { keyFindings.push('Bollinger squeeze — volatility breakout imminent'); }

    // ── Moving Average contribution (weight 20%) ──
    let maScore = 50;
    if      (ma.trend === 'uptrend')   { maScore = 70; keyFindings.push(`Price in uptrend — above key moving averages`); }
    else if (ma.trend === 'downtrend') { maScore = 30; keyRisks.push('Price in downtrend — below key moving averages'); }
    if (ma.goldenCross) { maScore = Math.min(90, maScore + 15); keyFindings.push('Golden Cross detected — strong long-term bullish signal'); }
    if (ma.deathCross)  { maScore = Math.max(10, maScore - 15); keyRisks.push('Death Cross detected — strong long-term bearish signal'); }

    // ── Volume contribution (weight 10%) ──
    let volScore = 50;
    if (vol.volumeRatio > 1.5 && ma.trend === 'uptrend')    { volScore = 70; keyFindings.push(`Volume ${vol.volumeRatio.toFixed(1)}x average — strong buying interest`); }
    if (vol.volumeRatio > 1.5 && ma.trend === 'downtrend')  { volScore = 30; keyRisks.push(`Volume ${vol.volumeRatio.toFixed(1)}x average on downtrend — strong selling`); }
    if (current > vol.vwap) { volScore = Math.min(80, volScore + 5); }
    else                    { volScore = Math.max(20, volScore - 5); }

    // ── Momentum contribution (weight 10%) ──
    let momScore = 50;
    if (mom.roc10 > 5)   { momScore = 70; keyFindings.push(`Strong 10-day momentum: +${mom.roc10.toFixed(1)}%`); }
    if (mom.roc10 < -5)  { momScore = 30; keyRisks.push(`Weak 10-day momentum: ${mom.roc10.toFixed(1)}%`); }
    if (mom.stochK < 20) { momScore = Math.min(80, momScore + 10); keyFindings.push('Stochastic oversold — potential bounce'); }
    if (mom.stochK > 80) { momScore = Math.max(20, momScore - 10); keyRisks.push('Stochastic overbought'); }

    // ── Trend Strength contribution (weight 5%) ──
    let trendScore = 50;
    if (trend.trendStrength === 'strong' && trend.direction === 'up')   { trendScore = 75; keyFindings.push(`Strong uptrend: ADX ${trend.adx.toFixed(0)}`); }
    if (trend.trendStrength === 'strong' && trend.direction === 'down')  { trendScore = 25; keyRisks.push(`Strong downtrend: ADX ${trend.adx.toFixed(0)}`); }
    if (trend.trendStrength === 'no_trend') keyFindings.push('No clear trend — sideways consolidation');

    // ── Weighted composite ──
    score = Math.round(
      rsiScore  * 0.20 +
      macdScore * 0.20 +
      bbScore   * 0.15 +
      maScore   * 0.20 +
      volScore  * 0.10 +
      momScore  * 0.10 +
      trendScore * 0.05
    );

    // Confidence based on agreement between indicators
    const scores = [rsiScore, macdScore, bbScore, maScore, volScore, momScore, trendScore];
    const bullishCount = scores.filter(s => s > 55).length;
    const bearishCount = scores.filter(s => s < 45).length;
    const agreement   = Math.max(bullishCount, bearishCount) / scores.length;
    const confidence  = Math.round(40 + agreement * 55);

    return { score, confidence, keyFindings: keyFindings.slice(0, 5), keyRisks: keyRisks.slice(0, 4) };
  }

  // ── Technical Summary ─────────────────────────────────────────────────────
  private buildTechnicalSummary(
    signal: string, score: number, ma: MovingAverages,
    rsi: RSIResult, macd: MACDResult, trend: TrendStrength
  ): string {
    const strength = score > 75 || score < 25 ? 'strongly' : score > 60 || score < 40 ? 'moderately' : 'mildly';
    const dir = signal === 'bullish' ? 'bullish' : signal === 'bearish' ? 'bearish' : 'neutral';
    return `Statistical analysis is ${strength} ${dir} (score: ${score}/100). ${ma.trend === 'uptrend' ? 'Price is in an uptrend above key MAs.' : ma.trend === 'downtrend' ? 'Price is in a downtrend below key MAs.' : 'Price is consolidating sideways.'} RSI at ${rsi.value.toFixed(1)} (${rsi.signal}). MACD ${macd.signal}. ADX ${trend.adx.toFixed(0)} indicates ${trend.trendStrength.replace('_', ' ')} trend.`;
  }

  // ── Normalize raw OHLCV from Yahoo Finance / Finnhub format ──────────────
  normalizeYahooData(rawData: any[]): OHLCVBar[] {
    if (!rawData || !Array.isArray(rawData)) return [];
    return rawData
      .filter(d => d && (d.close || d.adjClose) && d.date)
      .map(d => ({
        date:   new Date(d.date),
        open:   parseFloat(d.open  || d.adjOpen  || d.close || 0),
        high:   parseFloat(d.high  || d.adjHigh  || d.close || 0),
        low:    parseFloat(d.low   || d.adjLow   || d.close || 0),
        close:  parseFloat(d.close || d.adjClose || 0),
        volume: parseInt(d.volume  || '0', 10),
      }))
      .filter(d => d.close > 0);
  }

  normalizeFinnhubData(rawData: any): OHLCVBar[] {
    if (!rawData || !rawData.t) return [];
    return rawData.t.map((ts: number, i: number) => ({
      date:   new Date(ts * 1000),
      open:   rawData.o?.[i] || 0,
      high:   rawData.h?.[i] || 0,
      low:    rawData.l?.[i] || 0,
      close:  rawData.c?.[i] || 0,
      volume: rawData.v?.[i] || 0,
    })).filter((d: OHLCVBar) => d.close > 0);
  }
}

export const statisticalAnalysisService = new StatisticalAnalysisService();
