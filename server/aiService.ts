// ─────────────────────────────────────────────────────────────────────────────
// aiService.ts
// Prediction pipeline: Statistical Analysis (50%) + Vedic Astrology (50%)
// AI (Groq llama-3.3-70b) interprets statistical results and combines with astro
// If Groq is unavailable, the built-in statistics + astrology engine produces the answer
// ─────────────────────────────────────────────────────────────────────────────

import { groqJSON } from './groqClient';
import { learningService, type LearningProfile } from './learningService';
import { stockDataService }          from './stockDataService';
import { feedbackLearningService, NEUTRAL_LEARNING_ADJUSTMENT } from './feedbackLearningService';
import { astrologyService }          from './astrologyService';
import { advancedAstrologyService }  from './advancedAstrologyService';
import { statisticalAnalysisService, type StatisticalAnalysisResult } from './statisticalAnalysisService';

// ── Stock → Sector mapping ────────────────────────────────────────────────────
const STOCK_SECTOR_MAP: Record<string, string> = {
  TCS: 'IT', INFY: 'IT', WIPRO: 'IT', HCLTECH: 'IT', TECHM: 'IT',
  HDFCBANK: 'Banking', ICICIBANK: 'Banking', SBIN: 'Banking', AXISBANK: 'Banking',
  KOTAKBANK: 'Banking', PNB: 'Banking', BANKBARODA: 'Banking', INDUSINDBK: 'Banking',
  YESBANK: 'Banking', CANBK: 'Banking', IDBI: 'Banking', BAJFINANCE: 'Banking',
  SUNPHARMA: 'Pharma', DRREDDY: 'Pharma', CIPLA: 'Pharma', DIVISLAB: 'Pharma', APOLLOHOSP: 'Pharma',
  ONGC: 'Energy', BPCL: 'Energy', IOC: 'Energy', POWERGRID: 'Energy', NTPC: 'Energy', ADANIGREEN: 'Energy', RELIANCE: 'Energy',
  MARUTI: 'Auto', TATAMOTORS: 'Auto', HEROMOTOCO: 'Auto', EICHERMOT: 'Auto', BAJAJFINSV: 'Auto',
  HINDUNILVR: 'FMCG', ITC: 'FMCG', NESTLEIND: 'FMCG', BRITANNIA: 'FMCG', TITAN: 'FMCG', ASIANPAINT: 'FMCG', DMART: 'FMCG', ZOMATO: 'FMCG', IRCTC: 'FMCG',
  TATASTEEL: 'Metals', JSWSTEEL: 'Metals', HINDALCO: 'Metals', VEDL: 'Metals', COALINDIA: 'Metals', ULTRACEMCO: 'Metals', GRASIM: 'Metals', LT: 'Metals',
  ADANIENT: 'Realty', ADANIPORTS: 'Realty',
  BHARTIARTL: 'IT', PAYTM: 'IT',
};

function getSector(symbol: string): string {
  return STOCK_SECTOR_MAP[symbol.toUpperCase()] || 'General';
}

// ── AI call: Groq only. Returns null when Groq is unavailable, and the caller then uses the
// built-in statistics + astrology engine (the formula result). ─────────────────────────────
async function callAI(
  systemPrompt: string,
  userPrompt:   string,
  maxTokens:    number = 900
): Promise<any> {
  return groqJSON(systemPrompt, userPrompt, maxTokens);
}

// ─────────────────────────────────────────────────────────────────────────────

interface AIAnalysis {
  direction:       'bullish' | 'bearish' | 'neutral';
  confidence:      number;
  priceTarget:     { low: number; high: number };
  technicalFactors: string[];
  marketSentiment: string;
  keyRisks:        string[];
  recommendation:  string;
  reasoning:       string;
  statsWeight:     number;  // how much stats contributed (0-1)
  astroWeight:     number;  // how much astro contributed (0-1)
}

type Direction = 'bullish' | 'bearish' | 'neutral';

/** Everything the final AI step gets to study. */
interface SynthesisInput {
  assetType:    'stock' | 'crypto';
  symbol:       string;
  sector:       string;
  currentPrice: number;
  targetDate:   Date;
  maxConfidence: number;
  /** Statistical side: indicators + (optional) the AI's own reading of them. */
  stats: {
    signal:     Direction;
    score:      number;
    confidence: number;
    summary:    string;
    indicators: Record<string, any>;
    aiReading?: any;
    findings:   string[];
    risks:      string[];
  } | null;
  /** Astrological side: rule-based Vedic signals. */
  astro: {
    direction:      Direction;
    strength:       number;
    confidence:     number;
    recommendation: string;
    warnings:       string[];
    details:        Record<string, any>;
  } | null;
  /** What the fixed formula would have concluded — the safe fallback and a sanity anchor. */
  formula: { direction: Direction; confidence: number };
  /** Track record learned from past scored predictions (weights + hit-rates). */
  learned?: LearningProfile;
}

export interface AIConclusion {
  direction:      Direction;
  confidence:     number;
  agreement:      'aligned' | 'partial' | 'conflicting';
  weighting:      { statistical: number; astrological: number };
  summary:        string;
  keyDrivers:     string[];
  keyRisks:       string[];
  recommendation: string;
  /** True when the AI chose a different direction than the fixed formula. */
  differsFromFormula: boolean;
  formula:        { direction: Direction; confidence: number };
}

const asDirection = (v: any): Direction | null => {
  const s = String(v ?? '').toLowerCase().trim();
  return s === 'bullish' || s === 'bearish' || s === 'neutral' ? s : null;
};
const cleanText = (v: any, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const cleanList = (v: any, count: number, max: number): string[] =>
  Array.isArray(v) ? v.map(x => cleanText(x, max)).filter(Boolean).slice(0, count) : [];

export class AIService {

  // ── FINAL STEP: AI studies the statistical AND astrological analyses ─────
  // Returns null when no AI provider answers, so callers keep the formula result.
  private async synthesizeWithAI(input: SynthesisInput): Promise<AIConclusion | null> {
    if (!input.stats && !input.astro) return null;

    const horizonDays = Math.max(0, Math.round((input.targetDate.getTime() - Date.now()) / 86_400_000));

    const systemPrompt = `You write the FINAL conclusion of a prediction report for Indian equity and crypto traders.
You receive two independent analyses of the same asset:
1. STATISTICAL — technical indicators computed from price history, plus an AI reading of them.
2. VEDIC ASTROLOGY — rule-based timing and sentiment signals (hora, tithi, nakshatra, planetary positions, sector timing, yogas, transits).
Study BOTH, decide how much weight each deserves, say where they agree or conflict, and give one clear, balanced conclusion.
Rules:
- Use only the data provided. Never invent prices, news or indicators.
- The LEARNED TRACK RECORD below says how reliable each source has actually been on past, scored predictions. Use its weighting as your starting point (stay within ~10 points of it). With no track record, start from 50/50. Shift further only if one side is neutral or missing, and reflect that in the weighting numbers.
- If a source has a poor track record, say so and lean on the other one.
- If the two sides disagree, say so plainly and lower confidence instead of hiding the conflict.
- Use hedged language ("suggests", "leans"). Never promise returns. This is analysis, not financial advice.
- "direction" must be exactly one of: bullish, bearish, neutral.
Respond with valid JSON only.`;

    const userPrompt = `Asset: ${input.symbol} (${input.assetType}, sector: ${input.sector})
Current price: ${input.currentPrice}
Prediction target date: ${input.targetDate.toISOString().slice(0, 10)} (${horizonDays} day${horizonDays === 1 ? '' : 's'} ahead)

STATISTICAL ANALYSIS:
${JSON.stringify(input.stats ?? 'not available (not enough price history)')}

ASTROLOGICAL ANALYSIS:
${JSON.stringify(input.astro ?? 'not available')}

LEARNED TRACK RECORD (from real, scored past predictions):
${input.learned?.summary ?? 'None yet.'}

FORMULA RESULT (uses the learned weighting, plus adjustments): ${input.formula.direction}, confidence ${input.formula.confidence}

Return JSON:
{
  "direction": "bullish|bearish|neutral",
  "confidence": <number 30-90>,
  "agreement": "aligned|partial|conflicting",
  "weighting": { "statistical": <0-100>, "astrological": <0-100> },
  "summary": "<2-3 plain-language sentences: what the statistics say, what the astrology says, and your overall conclusion>",
  "keyDrivers": ["<up to 3 short points that decided the conclusion>"],
  "keyRisks": ["<up to 3 short risks>"],
  "recommendation": "<one short, cautious action>"
}`;

    const raw = await callAI(systemPrompt, userPrompt, 700);
    if (!raw || typeof raw !== 'object') return null;

    const summary = cleanText(raw.summary, 700);
    if (!summary) return null; // an answer with no conclusion is not usable

    // ── Guardrails: the AI refines the result, it cannot wander off from the evidence ──
    // Direction must be one the inputs actually support (neutral is always allowed).
    const allowed = new Set<Direction>(['neutral', input.formula.direction]);
    if (input.stats) allowed.add(input.stats.signal);
    if (input.astro) allowed.add(input.astro.direction);
    const proposed = asDirection(raw.direction);
    const direction: Direction = proposed && allowed.has(proposed) ? proposed : input.formula.direction;

    // Confidence stays within ±15 of the formula and inside the global bounds.
    const rawConf = Number(raw.confidence);
    const nearFormula = isFinite(rawConf)
      ? Math.min(input.formula.confidence + 15, Math.max(input.formula.confidence - 15, rawConf))
      : input.formula.confidence;
    const confidence = Math.round(Math.min(input.maxConfidence, Math.max(30, nearFormula)));

    const agreement: AIConclusion['agreement'] =
      ['aligned', 'partial', 'conflicting'].includes(raw.agreement) ? raw.agreement : 'partial';

    let wStat = Number(raw.weighting?.statistical);
    let wAstro = Number(raw.weighting?.astrological);
    if (!isFinite(wStat) || !isFinite(wAstro) || wStat < 0 || wAstro < 0 || wStat + wAstro === 0) { wStat = 50; wAstro = 50; }
    let total = wStat + wAstro;
    // Evidence beats opinion: when there is a real track record, the AI may only nudge the learned weighting by 10 points.
    if (input.learned?.hasData) {
      const base = input.learned.weights.statistical;
      const statPct = Math.min(base + 10, Math.max(base - 10, (wStat / total) * 100));
      wStat = statPct; wAstro = 100 - statPct; total = 100;
    }

    return {
      direction,
      confidence,
      agreement,
      weighting: { statistical: Math.round((wStat / total) * 100), astrological: Math.round((wAstro / total) * 100) },
      summary,
      keyDrivers: cleanList(raw.keyDrivers, 3, 180),
      keyRisks: cleanList(raw.keyRisks, 3, 180),
      recommendation: cleanText(raw.recommendation, 220),
      differsFromFormula: direction !== input.formula.direction,
      formula: input.formula,
    };
  }

  // ── MAIN STOCK PREDICTION PIPELINE ───────────────────────────────────────
  async generateEnhancedPrediction(
    symbol:        string,
    currentPrice:  number,
    userId?:       string,
    historicalData?: any[],
    targetDate:    Date = new Date()
  ): Promise<any> {
    console.log(`[Pipeline] Starting prediction for ${symbol} @ ₹${currentPrice} (target ${targetDate.toISOString()})`);
    const sector = getSector(symbol);

    // ── Step 1: Feedback learning ─────────────────────────────────────────
    let learningAdjustment = await feedbackLearningService
      .getLearningAdjustments(symbol, userId || '')
      .catch(() => ({ ...NEUTRAL_LEARNING_ADJUSTMENT }));

    // Learned track record (all users, all scored outcomes): decides the statistics-vs-astrology
    // weighting and corrects over/under-confidence.
    const profile = await learningService.getProfile(symbol, sector, 'stock');
    if (profile.hasData) learningAdjustment = { ...learningAdjustment, confidenceAdjustment: profile.confidenceAdjustment };
    console.log(`[Learning] ${symbol}: weights ${profile.weights.statistical}/${profile.weights.astrological}, outcomes=${profile.samples.global}, confAdj=${profile.confidenceAdjustment}`);

    // ── Step 2: Statistical analysis (50% weight) ─────────────────────────
    let statsResult: StatisticalAnalysisResult | null = null;
    try {
      const bars = statisticalAnalysisService.normalizeYahooData(historicalData || []);
      if (bars.length >= 10) {
        statsResult = statisticalAnalysisService.analyzeHistoricalData(symbol, bars);
        console.log(`[Stats] ${symbol}: score=${statsResult?.statisticalScore}, signal=${statsResult?.statisticalSignal}, bars=${bars.length}`);
      } else {
        console.log(`[Stats] Not enough bars for ${symbol}: ${bars.length}`);
      }
    } catch (statsErr) {
      console.error('[Stats] Statistical analysis error:', statsErr);
    }

    // ── Step 3: Vedic Astrology (50% weight) ─────────────────────────────
    const astroPrediction = await astrologyService
      .generateAstroPrediction(symbol, targetDate, currentPrice)
      .catch(() => null);

    // ── Step 4: Advanced astrology (D-10, Sector, Transits, Yogas) ───────
    let advancedAstroResult: any = null;
    let yogaBonus    = 0;
    let transitImpact = 0;

    try {
      advancedAstroResult = await advancedAstrologyService.analyzeStockBySector(symbol, sector, targetDate);
      const d1Chart    = advancedAstrologyService.generateD1Chart(targetDate, '09:15', 19.0760, 72.8777);
      const d10Analysis = advancedAstrologyService.generateD10Chart(d1Chart);
      const careerYogas = d10Analysis?.yogas || [];
      yogaBonus = Math.max(-20, Math.min(20, Math.round(
        careerYogas.reduce((sum: number, yoga: any) => {
          if (yoga.type === 'rajyoga')  return sum + Math.min(yoga.strength * 0.15, 15);
          if (yoga.type === 'dhanyoga') return sum + Math.min(yoga.strength * 0.10, 10);
          if (yoga.type === 'arishta')  return sum - Math.min(yoga.strength * 0.10, 10);
          return sum;
        }, 0)
      )));
      const transits    = advancedAstrologyService.calculateTransits(d1Chart, targetDate);
      const benefic     = transits.filter((t: any) => t.effect === 'beneficial').length;
      const malefic     = transits.filter((t: any) => t.effect === 'malefic').length;
      transitImpact     = Math.max(-15, Math.min(15, (benefic - malefic) * 3));
      console.log(`[AdvAstro] ${symbol}: timing=${advancedAstroResult?.timing}, yoga=${yogaBonus}, transit=${transitImpact}`);
    } catch (advErr) {
      console.error('[AdvAstro] Non-fatal error:', advErr);
    }

    // ── Step 5: AI interprets statistics ─────────────────────────────────
    let aiStatsAnalysis: any = null;
    if (statsResult) {
      aiStatsAnalysis = await this.interpretStatisticsWithAI(symbol, currentPrice, statsResult, sector);
    }

    // ── Step 6: Combine Statistical (50%) + Astrological (50%) ───────────
    const combined = this.combineStatsAndAstro(
      statsResult, astroPrediction, advancedAstroResult,
      aiStatsAnalysis, yogaBonus, transitImpact,
      currentPrice, sector, learningAdjustment, profile.weights
    );

    // ── Step 7: Feedback learning ─────────────────────────────────────────
    let finalPrediction = combined;
    try {
      finalPrediction = feedbackLearningService.applyLearningToPrediction(combined, learningAdjustment);
    } catch { /* non-fatal */ }

    // ── Step 8: User personalization ──────────────────────────────────────
    if (userId) {
      try {
        const pers = await feedbackLearningService.getUserPersonalization(userId);
        finalPrediction.userPersonalization = pers;
        if (finalPrediction.combinedConfidence !== undefined) {
          finalPrediction.combinedConfidence = Math.min(95,
            finalPrediction.combinedConfidence + (pers.personalizedConfidenceBoost || 0)
          );
        }
      } catch { /* non-fatal */ }
    }

    // ── Step 8b: AI studies BOTH the statistical and astrological analyses ─
    // and writes the final conclusion. If no AI provider answers, the formula
    // result above stands unchanged.
    const aiConclusion = await this.synthesizeWithAI({
      assetType: 'stock',
      symbol,
      sector,
      currentPrice,
      targetDate,
      maxConfidence: 95,
      stats: statsResult ? {
        signal:     statsResult.statisticalSignal as Direction,
        score:      statsResult.statisticalScore,
        confidence: aiStatsAnalysis?.confidence ?? statsResult.statisticalConfidence,
        summary:    statsResult.technicalSummary,
        indicators: {
          rsi:         { value: Number(statsResult.rsi.value.toFixed(1)), signal: statsResult.rsi.signal },
          macd:        { signal: statsResult.macd.signal, crossover: statsResult.macd.crossover },
          trend:       statsResult.movingAverages.trend,
          goldenCross: !!statsResult.movingAverages.goldenCross,
          deathCross:  !!statsResult.movingAverages.deathCross,
          adx:         statsResult.trendStrength.adx,
          trendStrength: statsResult.trendStrength.trendStrength,
          nearestSupport:    statsResult.supportResistance.nearestSupport,
          nearestResistance: statsResult.supportResistance.nearestResistance,
          dailyVolatilityPct: statsResult.volatility.dailyVolatility,
          barsAnalysed: statsResult.analysedBars,
        },
        aiReading: aiStatsAnalysis ? {
          direction: aiStatsAnalysis.direction,
          confidence: aiStatsAnalysis.confidence,
          strongestSignal: aiStatsAnalysis.strongestSignal,
          reasoning: aiStatsAnalysis.reasoning,
        } : undefined,
        findings: (statsResult.keyFindings ?? []).slice(0, 5),
        risks:    (statsResult.keyRisks ?? []).slice(0, 4),
      } : null,
      astro: astroPrediction ? {
        direction:      astroPrediction.direction,
        strength:       astroPrediction.strength,
        confidence:     astroPrediction.confidence,
        recommendation: astroPrediction.recommendation,
        warnings:       (astroPrediction.warnings ?? []).slice(0, 4),
        details: {
          factorScores: astroPrediction.factors,
          sectorTiming: advancedAstroResult?.timing ?? null,
          sectorStrength: advancedAstroResult?.sectorStrength ?? null,
          sectorFactors: (advancedAstroResult?.keyFactors ?? []).slice(0, 3),
          yogaBonus,
          transitImpact,
        },
      } : null,
      formula: {
        direction:  finalPrediction.finalDirection as Direction,
        confidence: finalPrediction.combinedConfidence,
      },
      learned: profile,
    }).catch((err) => { console.error('[AI] Synthesis error (non-fatal):', err); return null; });

    if (aiConclusion) {
      finalPrediction.formulaResult = aiConclusion.formula;
      finalPrediction.finalDirection = aiConclusion.direction;
      finalPrediction.combinedConfidence = aiConclusion.confidence;
      if (finalPrediction.prediction) {
        finalPrediction.prediction.direction = aiConclusion.direction;
        finalPrediction.prediction.confidence = aiConclusion.confidence;
      }
      if (finalPrediction.analysis && aiConclusion.recommendation) {
        finalPrediction.analysis.recommendation = aiConclusion.recommendation;
      }
      finalPrediction.aiConclusion = aiConclusion;
      console.log(`[AI] Conclusion for ${symbol}: ${aiConclusion.direction} @ ${aiConclusion.confidence}% (${aiConclusion.agreement}; formula said ${aiConclusion.formula.direction} @ ${aiConclusion.formula.confidence}%)`);
    }

    // ── Step 8c: remember what each source said, so the cron can score them later ──
    const usedWeights = aiConclusion?.weighting ?? profile.weights;
    finalPrediction.learningProfile = { hasData: profile.hasData, outcomes: profile.samples.global, weights: usedWeights, reliability: profile.reliability };
    finalPrediction.learningSnapshot = learningService.buildSnapshot({
      market: 'stock', symbol, sector,
      finalDirection: finalPrediction.finalDirection,
      statsDirection: statsResult ? ((aiStatsAnalysis?.direction ?? statsResult.statisticalSignal) as Direction) : null,
      astroDirection: astroPrediction ? (astroPrediction.direction as Direction) : null,
      confidence: finalPrediction.combinedConfidence,
      weights: usedWeights, learnedFrom: profile.samples.global, aiUsed: aiConclusion !== null,
    });

    // ── Step 9: Metadata ─────────────────────────────────────────────────
    finalPrediction.vedic = astroPrediction?.vedic ?? null;
    finalPrediction.metadata = {
      aiEnabled:            aiStatsAnalysis !== null || aiConclusion !== null,
      aiSynthesisEnabled:   aiConclusion !== null,
      astroEnabled:         astroPrediction !== null,
      advancedAstroEnabled: advancedAstroResult !== null,
      statsEnabled:         statsResult !== null,
      feedbackLearningApplied: true,
      predictionTime:       new Date().toISOString(),
      sector,
      weighting: {
        statistical: `${usedWeights.statistical}%`,
        astrological: `${usedWeights.astrological}%`,
        learned: profile.hasData,
        basedOnOutcomes: profile.samples.global,
      },
      sources: {
        statistics:  statsResult ? `${statsResult.analysedBars} bars of OHLCV data (RSI, MACD, BB, MA, Volume, ADX)` : 'No historical data available',
        astrology:   'Vedic — Hora, Tithi, Nakshatra, Planetary positions',
        advanced:    advancedAstroResult ? `D-10 Dashamsa + ${sector} Sector + Transits + Yogas` : 'Not available',
        ai:          aiConclusion ? 'AI conclusion from statistical + astrological analysis (Groq llama-3.3-70b)'
                   : aiStatsAnalysis ? 'AI statistical interpretation (Groq llama-3.3-70b)' : 'Not available',
        feedback:    profile.hasData ? `Learned from ${profile.samples.global} scored predictions` : 'No scored predictions yet',
      },
    };

    return finalPrediction;
  }

  // ── AI interprets the statistical analysis results ────────────────────────
  private async interpretStatisticsWithAI(
    symbol:      string,
    price:       number,
    stats:       StatisticalAnalysisResult,
    sector:      string
  ): Promise<any> {
    const systemPrompt = `You are a quantitative analyst specializing in Indian equities (NSE/BSE).
You receive a full set of technical indicators computed from historical price data.
Your job: interpret these indicators, identify the strongest signals, assess conviction, and produce a precise price prediction.
Respond with valid JSON only. No markdown.`;

    const userPrompt = `Analyze ${symbol} (${sector} sector) at ₹${price}:

STATISTICAL INDICATORS:
- RSI(14): ${stats.rsi.value.toFixed(1)} → ${stats.rsi.signal}
- MACD: line=${stats.macd.macdLine}, signal=${stats.macd.signalLine}, histogram=${stats.macd.histogram} → ${stats.macd.signal} (${stats.macd.crossover})
- Bollinger Bands: upper=₹${stats.bollingerBands.upper}, mid=₹${stats.bollingerBands.middle}, lower=₹${stats.bollingerBands.lower} → price is ${stats.bollingerBands.pricePosition}, bandwidth=${stats.bollingerBands.bandwidth}%
- Moving Averages: SMA20=₹${stats.movingAverages.sma20?.toFixed(2)}, SMA50=₹${stats.movingAverages.sma50?.toFixed(2)}, EMA21=₹${stats.movingAverages.ema21?.toFixed(2)} → trend: ${stats.movingAverages.trend}${stats.movingAverages.goldenCross ? ' (GOLDEN CROSS!)' : ''}${stats.movingAverages.deathCross ? ' (DEATH CROSS!)' : ''}
- Volume: ratio=${stats.volume.volumeRatio}x avg, VWAP=₹${stats.volume.vwap}, OBV=${stats.volume.obv > 0 ? '+' : ''}${stats.volume.obv.toLocaleString()}
- Support: ₹${stats.supportResistance.nearestSupport} (${stats.supportResistance.distToSupport}% away), Resistance: ₹${stats.supportResistance.nearestResistance} (${stats.supportResistance.distToResistance}% away)
- Momentum: ROC5=${stats.momentum.roc5}%, ROC10=${stats.momentum.roc10}%, Stoch-K=${stats.momentum.stochK}, CCI=${stats.momentum.cci}
- Volatility: daily=${stats.volatility.dailyVolatility}%, ATR=₹${stats.volatility.atr} (${stats.volatility.atrPercent}%), beta≈${stats.volatility.beta}
- Trend Strength: ADX=${stats.trendStrength.adx} (${stats.trendStrength.trendStrength}), +DI=${stats.trendStrength.plusDI}, -DI=${stats.trendStrength.minusDI}
- Statistical Score: ${stats.statisticalScore}/100 → ${stats.statisticalSignal}
- Bars analysed: ${stats.analysedBars}

Key findings: ${stats.keyFindings.join('; ')}
Key risks: ${stats.keyRisks.join('; ')}

Return JSON:
{
  "direction": "bullish|bearish|neutral",
  "confidence": <number 30-90>,
  "priceTarget": { "low": <number>, "high": <number> },
  "timeframe": "1-7 days",
  "technicalFactors": ["<factor1>", "<factor2>", "<factor3>"],
  "keyRisks": ["<risk1>", "<risk2>"],
  "marketSentiment": "<one sentence>",
  "recommendation": "<action>",
  "reasoning": "<2 sentence explanation of the dominant signals>",
  "strongestSignal": "<the single most decisive indicator>",
  "priceTargetBasis": "<how you calculated the price targets>"
}`;

    const result = await callAI(systemPrompt, userPrompt, 800);
    if (!result) return null;

    return {
      direction:        result.direction        || stats.statisticalSignal,
      confidence:       Math.min(90, Math.max(30, result.confidence || stats.statisticalConfidence)),
      priceTarget:      result.priceTarget      || { low: price * 0.97, high: price * 1.03 },
      technicalFactors: result.technicalFactors || stats.keyFindings,
      keyRisks:         result.keyRisks         || stats.keyRisks,
      marketSentiment:  result.marketSentiment  || stats.technicalSummary,
      recommendation:   result.recommendation   || 'Hold and monitor',
      reasoning:        result.reasoning        || stats.technicalSummary,
      strongestSignal:  result.strongestSignal  || '',
    };
  }

  // ── Combine Stats (50%) + Astro (50%) ────────────────────────────────────
  private combineStatsAndAstro(
    statsResult:        StatisticalAnalysisResult | null,
    astroPrediction:    any,
    advancedAstro:      any,
    aiStatsAnalysis:    any,
    yogaBonus:          number,
    transitImpact:      number,
    currentPrice:       number,
    sector:             string,
    learningAdjustment: any,
    weights:            { statistical: number; astrological: number } = { statistical: 50, astrological: 50 }
  ): any {
    const wS = weights.statistical / 100;
    const wA = weights.astrological / 100;

    // ── Statistical side ─────────────────────────────────────────────────
    const statsScore      = statsResult?.statisticalScore       ?? 50;
    const statsConfidence = aiStatsAnalysis?.confidence         ?? statsResult?.statisticalConfidence ?? 50;
    const statsDir        = aiStatsAnalysis?.direction          ?? statsResult?.statisticalSignal     ?? 'neutral';
    const statsLow        = aiStatsAnalysis?.priceTarget?.low   ?? (currentPrice * 0.975);
    const statsHigh       = aiStatsAnalysis?.priceTarget?.high  ?? (currentPrice * 1.025);

    // ── Astrological side ────────────────────────────────────────────────
    const astroScore = astroPrediction
      ? (astroPrediction.strength ?? 50)
      : 50;
    const astroConfidence = astroPrediction?.confidence ?? 50;
    const astroDir        = astroPrediction?.direction  ?? 'neutral';

    // Advanced astro modifiers
    let astroSectorBoost = 0;
    let sectorTiming: string = 'neutral';
    if (advancedAstro) {
      const sectorStrength = advancedAstro.sectorStrength ?? 50;
      astroSectorBoost     = Math.round(((sectorStrength - 50) / 50) * 12);
      sectorTiming         = advancedAstro.timing ?? 'neutral';
    }

    // ── Directional resolution ────────────────────────────────────────────
    // If both agree → use that direction with boosted confidence
    // If they disagree → use statistical direction (data > stars for short term),
    //   but reduce confidence significantly
    let finalDirection: 'bullish' | 'bearish' | 'neutral';
    let directionAgreement = false;

    if (statsDir === astroDir) {
      finalDirection = statsDir;
      directionAgreement = true;
    } else if (statsDir === 'neutral') {
      finalDirection = astroDir;
    } else if (astroDir === 'neutral') {
      finalDirection = statsDir;
    } else {
      // Direct conflict: the source that has earned more trust (learned weight × confidence) wins;
      // a near-tie is neutral.
      finalDirection = learningService.resolveDirection(statsDir, astroDir, wS, wA, statsConfidence, astroConfidence);
    }

    // ── Confidence calculation (50-50 weighted) ───────────────────────────
    let combinedConfidence = Math.round(
      statsConfidence  * wS +
      astroConfidence  * wA +
      astroSectorBoost +
      yogaBonus       +
      transitImpact   +
      (learningAdjustment.confidenceAdjustment ?? 0)
    );

    // Agreement bonus: both agree = +8 confidence
    if (directionAgreement && statsDir !== 'neutral') combinedConfidence += 8;
    // Conflict penalty: disagreement = -10 confidence
    if (!directionAgreement && statsDir !== 'neutral' && astroDir !== 'neutral') combinedConfidence -= 10;

    combinedConfidence = Math.min(95, Math.max(30, combinedConfidence));

    // ── Price targets (blend stats and astro range) ───────────────────────
    const riskMultiplier = finalDirection === 'bullish' ? 0.025
      : finalDirection === 'bearish' ? 0.025 : 0.02;

    // Use AI stats targets if available, else compute from astro risk band
    const astroLow  = currentPrice * (1 - riskMultiplier);
    const astroHigh = currentPrice * (1 + riskMultiplier);

    // 50-50 blend of stats and astro price targets
    const blendedLow  = Math.round(((statsLow  * wS) + (astroLow  * wA)) * 100) / 100;
    const blendedHigh = Math.round(((statsHigh * wS) + (astroHigh * wA)) * 100) / 100;

    // ── ★ SEPARATE Statistical and Astrological factors ───────────────────
    // STATISTICAL FACTORS (pure technical analysis - NO astro)
    const statsTechFactors = aiStatsAnalysis?.technicalFactors ?? statsResult?.keyFindings ?? [];
    
    // ASTROLOGICAL FACTORS (pure astro - NO technical)
    const astroKeyFactors: string[] = [];
    if (advancedAstro?.keyFactors) {
      astroKeyFactors.push(...(advancedAstro.keyFactors.slice(0, 2).map((f: string) => `[${sector}] ${f}`)));
    }
    
    // Yoga / Transit factor labels (ASTROLOGICAL)
    if (yogaBonus > 10)    astroKeyFactors.push('D-10: Strong Raj/Dhana Yoga supports momentum');
    if (transitImpact > 8) astroKeyFactors.push(`Planetary transits: ${Math.round(transitImpact / 3)} benefic influences active`);

    // ── ★ SEPARATE Statistical and Astrological risks ─────────────────────
    // STATISTICAL RISKS
    const statsRisks = aiStatsAnalysis?.keyRisks ?? statsResult?.keyRisks ?? [];
    
    // ASTROLOGICAL RISKS
    const astroRisks = [...(astroPrediction?.warnings ?? [])];
    if (yogaBonus < -10)    astroRisks.push('D-10: Arishta Yoga — increased downside risk');
    if (transitImpact < -8) astroRisks.push(`Planetary transits: ${Math.round(Math.abs(transitImpact) / 3)} malefic influences`);
    
    // Combined risks for display (but keep separate in data structure)
    const allRisks = [...statsRisks.slice(0, 2), ...astroRisks.slice(0, 2)].slice(0, 4);

    // ── Sector timing direction softening ─────────────────────────────────
    if (sectorTiming === 'excellent' && finalDirection === 'bearish') finalDirection = 'neutral';
    if (sectorTiming === 'challenging' && finalDirection === 'bullish') finalDirection = 'neutral';

    // ── Reasoning ─────────────────────────────────────────────────────────
    const statsReasonPart = aiStatsAnalysis?.reasoning ?? statsResult?.technicalSummary ?? '';
    const astroReasonPart = astroPrediction?.recommendation ?? '';
    const reasoning = [statsReasonPart, astroReasonPart].filter(Boolean).join(' | Astro: ');

    return {
      prediction: {
        direction: finalDirection,
        confidence: combinedConfidence,
        priceTarget: { low: blendedLow, high: blendedHigh },
        timeframe: '1-7 days',
      },
      combinedConfidence,
      finalDirection,

      // Statistical breakdown
      statisticalAnalysis: statsResult ? {
        score:      statsResult.statisticalScore,
        signal:     statsResult.statisticalSignal,
        confidence: statsConfidence,
        rsi:        statsResult.rsi,
        macd:       statsResult.macd,
        trend:      statsResult.movingAverages.trend,
        adx:        statsResult.trendStrength.adx,
        support:    statsResult.supportResistance.nearestSupport,
        resistance: statsResult.supportResistance.nearestResistance,
        volatility: statsResult.volatility.annualizedVol,
        barsUsed:   statsResult.analysedBars,
      } : null,

      // Astrology breakdown
      astrologyAnalysis: astroPrediction ? {
        score:      astroScore,
        signal:     astroDir,
        confidence: astroConfidence,
        factors:    astroPrediction.factors,
        sectorTiming,
        yogaBonus,
        transitImpact,
        sectorStrength: advancedAstro?.sectorStrength ?? null,
      } : null,

      // Weighting
      weighting: {
        statistical:  weights.statistical,
        astrological: weights.astrological,
        directionAgreement,
        conflictResolution: !directionAgreement && statsDir !== 'neutral' && astroDir !== 'neutral'
          ? `Stats(${statsDir}) vs Astro(${astroDir}) — resolved to ${finalDirection}`
          : 'No conflict',
      },

      // ★ Output fields for frontend - SEPARATED stats and astro
      analysis: {
        technicalFactors:     statsTechFactors.slice(0, 5),     // ★ PURE STATS ONLY
        astrologicalFactors:  astroKeyFactors.slice(0, 5),      // ★ PURE ASTRO ONLY
        marketSentiment:      aiStatsAnalysis?.marketSentiment ?? statsResult?.technicalSummary ?? 'Mixed signals',
        keyRisks:             allRisks,                         // Combined for display
        statisticalRisks:     statsRisks,                       // ★ PURE STATS RISKS
        astrologicalRisks:    astroRisks,                       // ★ PURE ASTRO RISKS
        recommendation:       aiStatsAnalysis?.recommendation  ?? astroPrediction?.recommendation ?? 'Monitor closely',
      },
      astroRecommendation: astroPrediction?.recommendation ?? '',
      warnings:            allRisks,
      reasoning,
    };
  }

  // ── CRYPTO PREDICTION ─────────────────────────────────────────────────────
  async generateEnhancedCryptoPrediction(
    cryptoSymbol:   string,
    currentPrice:   number,
    userId:         string,
    historicalData: any[] = [],
    cryptoQuote?:   any,
    targetDate:     Date = new Date()
  ): Promise<any> {
    // ── Statistical analysis of crypto historical data ────────────────────
    let statsResult: StatisticalAnalysisResult | null = null;
    try {
      const bars = statisticalAnalysisService.normalizeFinnhubData(
        // Try Finnhub format first, then Yahoo format
        historicalData[0]?.t ? { t: historicalData.map(d => d.timestamp), c: historicalData.map(d => d.close), h: historicalData.map(d => d.high), l: historicalData.map(d => d.low), o: historicalData.map(d => d.open), v: historicalData.map(d => d.volume) }
        : null
      );
      const yahooBars = bars.length < 5
        ? statisticalAnalysisService.normalizeYahooData(historicalData)
        : bars;

      if (yahooBars.length >= 10) {
        statsResult = statisticalAnalysisService.analyzeHistoricalData(cryptoSymbol, yahooBars);
        console.log(`[Stats] Crypto ${cryptoSymbol}: score=${statsResult?.statisticalScore}, bars=${yahooBars.length}`);
      }
    } catch (err) {
      console.error('[Stats] Crypto stats error:', err);
    }

    const astroAnalysis = await astrologyService.getCurrentAstrology(targetDate);
    const userPers      = await feedbackLearningService.getUserPersonalization(userId).catch(() => null);
    const profile       = await learningService.getProfile(cryptoSymbol, 'Crypto', 'crypto');
    const wS = profile.weights.statistical / 100;
    const wA = profile.weights.astrological / 100;
    console.log(`[Learning] ${cryptoSymbol}: weights ${profile.weights.statistical}/${profile.weights.astrological}, outcomes=${profile.samples.global}, confAdj=${profile.confidenceAdjustment}`);

    // AI interprets crypto stats
    let aiStatsAnalysis: any = null;
    if (statsResult) {
      aiStatsAnalysis = await this.interpretStatisticsWithAI(cryptoSymbol, currentPrice, statsResult, 'Crypto');
    }

    // Astro score for crypto
    const cryptoAstro = await astrologyService.generateAstroPrediction(cryptoSymbol, targetDate, currentPrice, 'crypto').catch(() => null);
    const astroStrength = cryptoAstro ? cryptoAstro.strength : 50;
    const astroDir: 'bullish' | 'bearish' | 'neutral' = cryptoAstro ? cryptoAstro.direction : 'neutral';

    // 50-50 blend
    const statsScore = statsResult?.statisticalScore ?? 50;
    const statsDir   = aiStatsAnalysis?.direction ?? statsResult?.statisticalSignal ?? 'neutral';
    const statsConf  = aiStatsAnalysis?.confidence ?? statsResult?.statisticalConfidence ?? 50;

    let finalDir: 'bullish' | 'bearish' | 'neutral' =
      learningService.resolveDirection(statsDir, astroDir, wS, wA, statsConf, astroStrength);

    const combinedConf0 = Math.min(80, Math.max(30, Math.round(
      statsConf * wS + astroStrength * wA + (profile.hasData ? profile.confidenceAdjustment : 0)
    )));
    let combinedConf = combinedConf0;

    const statsLow  = aiStatsAnalysis?.priceTarget?.low  ?? currentPrice * 0.92;
    const statsHigh = aiStatsAnalysis?.priceTarget?.high ?? currentPrice * 1.08;
    const astroLow  = currentPrice * (1 - 0.06);
    const astroHigh = currentPrice * (1 + 0.06);

    const blendedLow  = Math.round(((statsLow  * wS) + (astroLow  * wA)) * 100) / 100;
    const blendedHigh = Math.round(((statsHigh * wS) + (astroHigh * wA)) * 100) / 100;

    const techFactors = [
      ...(aiStatsAnalysis?.technicalFactors ?? statsResult?.keyFindings ?? []).slice(0, 3),
    ];
    const risks = [
      ...(aiStatsAnalysis?.keyRisks ?? statsResult?.keyRisks ?? []).slice(0, 2),
      'Crypto markets are highly volatile — always use stop-loss',
    ];

    // ── AI studies BOTH analyses and writes the final conclusion ──────────
    // (falls back to the formula result above if no AI provider answers)
    const aiConclusion: AIConclusion | null = await this.synthesizeWithAI({
      assetType: 'crypto',
      symbol: cryptoSymbol,
      sector: 'Crypto',
      currentPrice,
      targetDate,
      maxConfidence: 80,
      stats: statsResult ? {
        signal:     statsResult.statisticalSignal as Direction,
        score:      statsResult.statisticalScore,
        confidence: statsConf,
        summary:    statsResult.technicalSummary,
        indicators: {
          rsi:   { value: Number(statsResult.rsi.value.toFixed(1)), signal: statsResult.rsi.signal },
          macd:  { signal: statsResult.macd.signal, crossover: statsResult.macd.crossover },
          trend: statsResult.movingAverages.trend,
          adx:   statsResult.trendStrength.adx,
          dailyVolatilityPct: statsResult.volatility.dailyVolatility,
          barsAnalysed: statsResult.analysedBars,
        },
        aiReading: aiStatsAnalysis ? {
          direction: aiStatsAnalysis.direction,
          confidence: aiStatsAnalysis.confidence,
          strongestSignal: aiStatsAnalysis.strongestSignal,
          reasoning: aiStatsAnalysis.reasoning,
        } : undefined,
        findings: (statsResult.keyFindings ?? []).slice(0, 5),
        risks:    (statsResult.keyRisks ?? []).slice(0, 4),
      } : null,
      astro: {
        direction:      astroDir,
        strength:       Math.round(astroStrength),
        confidence:     Math.round(astroStrength),
        recommendation: cryptoAstro?.recommendation ?? `Astro score ${astroStrength.toFixed(0)}/100 → ${astroDir}`,
        warnings:       (cryptoAstro?.warnings ?? []).slice(0, 4),
        details: {
          hora: astroAnalysis.hora, tithi: astroAnalysis.tithi, nakshatra: astroAnalysis.nakshatra,
          yoga: astroAnalysis.yoga, lunarPhase: astroAnalysis.lunarPhase,
          factorScores: cryptoAstro?.factors,
          vedicReasons: cryptoAstro?.vedic?.reasons?.slice(0, 5),
        },
      },
      formula: { direction: finalDir, confidence: combinedConf0 },
      learned: profile,
    }).catch((err) => { console.error('[AI] Crypto synthesis error (non-fatal):', err); return null; });

    if (aiConclusion) {
      finalDir = aiConclusion.direction;
      combinedConf = aiConclusion.confidence;
      console.log(`[AI] Conclusion for ${cryptoSymbol}: ${aiConclusion.direction} @ ${aiConclusion.confidence}% (${aiConclusion.agreement}; formula said ${aiConclusion.formula.direction} @ ${aiConclusion.formula.confidence}%)`);
    }

    const usedWeights = aiConclusion?.weighting ?? profile.weights;
    const learningSnapshot = learningService.buildSnapshot({
      market: 'crypto', symbol: cryptoSymbol, sector: 'Crypto',
      finalDirection: finalDir,
      statsDirection: statsResult ? (statsDir as Direction) : null,
      astroDirection: astroDir,
      confidence: combinedConf,
      weights: usedWeights, learnedFrom: profile.samples.global, aiUsed: aiConclusion !== null,
    });

    return {
      learningSnapshot,
      learningProfile: { hasData: profile.hasData, outcomes: profile.samples.global, weights: usedWeights, reliability: profile.reliability },
      prediction: { direction: finalDir, priceTarget: { low: blendedLow, high: blendedHigh } },
      combinedConfidence: combinedConf,
      confidence:         combinedConf,
      finalDirection:     finalDir,
      analysis: {
        technicalFactors: techFactors,
        marketSentiment:  aiStatsAnalysis?.marketSentiment ?? 'Volatile crypto market',
        keyRisks:         risks,
        recommendation:   aiConclusion?.recommendation || aiStatsAnalysis?.recommendation || 'Monitor closely with stop-loss',
      },
      aiConclusion,
      astroRecommendation: cryptoAstro?.recommendation ?? `Astro score: ${astroStrength.toFixed(0)}/100 → ${astroDir}`,
      warnings:    risks,
      reasoning:   aiStatsAnalysis?.reasoning ?? statsResult?.technicalSummary ?? 'Statistical + astrological analysis',
      statisticalAnalysis: statsResult ? {
        score: statsResult.statisticalScore, signal: statsResult.statisticalSignal,
        rsi: statsResult.rsi, macd: statsResult.macd, trend: statsResult.movingAverages.trend,
      } : null,
      astroFactors:       astroAnalysis,
      astroStrength,
      vedic:              cryptoAstro?.vedic ?? null,
      metadata: {
        aiEnabled:    aiStatsAnalysis !== null || aiConclusion !== null,
        aiSynthesisEnabled: aiConclusion !== null,
        statsEnabled: statsResult !== null,
        weighting:    { statistical: `${usedWeights.statistical}%`, astrological: `${usedWeights.astrological}%`, learned: profile.hasData, basedOnOutcomes: profile.samples.global },
        sources: {
          statistics: statsResult ? `${statsResult.analysedBars} bars` : 'No historical data',
          astrology:  'Vedic astrology',
          ai:         aiConclusion ? 'Groq conclusion from statistics + astrology' : aiStatsAnalysis ? 'Groq' : 'Not available',
        },
      },
      userPersonalization: userPers ? { accuracyBoost: userPers.personalizedConfidenceBoost } : null,
    };
  }

  async generateMarketInsights(marketData: any): Promise<string | null> {
    const result = await callAI(
      'You are a concise market analyst. Provide brief, actionable market insights in 2-3 sentences.',
      `Market: NIFTY=${marketData.indices?.nifty50?.value}(${marketData.indices?.nifty50?.changePercent}%), SENSEX=${marketData.indices?.sensex?.value}(${marketData.indices?.sensex?.changePercent}%), Gainers: ${marketData.topGainers?.slice(0,3).map((s:any)=>s.symbol).join(',')}, Losers: ${marketData.topLosers?.slice(0,3).map((s:any)=>s.symbol).join(',')}. Provide JSON: {"insight": "..."}`,
      150
    );
    return result?.insight || null;
  }
}

export const aiService = new AIService();
