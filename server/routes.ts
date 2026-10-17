import { pool } from "./db";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, hashPassword, comparePasswords } from "./auth";
import { registerPasswordResetRoutes } from "./passwordReset";
import { longTermStatsService, LONG_TERM_DAYS } from "./longTermStatsService";
import { statisticalAnalysisService } from "./statisticalAnalysisService";
import { registerPaymentRoutes, isPaywallOn } from "./payments";
import { registerReferralRoutes } from "./referrals";
import { registerCreditRoutes, chargeOrReject, refundCharge, quotePrediction, getUserPrefs } from "./credits";
import { registerUserSettingsRoutes } from "./userSettings";
import { enterRequestOptions } from "./requestOptions";
import { outlookCost } from "./creditPricing";
import { insertSubscriptionSchema, insertFeedbackSchema, insertPredictionSchema, insertWatchlistSchema } from "@shared/schema";
import { stockDataService } from "./stockDataService";
import { cryptoDataService } from "./cryptoDataService";
import { aiService } from "./aiService";
import { feedbackLearningService } from "./feedbackLearningService";
import { astrologyService } from "./astrologyService";
import { advancedAstrologyService } from "./advancedAstrologyService";
import { aiAstrologyTrainer } from "./aiAstrologyTrainer";
import { marketOutlookService } from "./marketOutlookService";
import { predictionHistoryService } from "./predictionHistoryService";
import * as crypto from 'crypto';
import { db } from "./db";
import { users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { predictions, feedback, subscriptions, watchlist, astrologyCharts } from '@shared/schema';
import { isGroqConfigured } from "./groqClient";

// ── Request-validation helpers ───────────────────────────────────────────────

/** Parse the optional `when` field. Returns a valid Date, or null if it can't be parsed. */
function parseWhen(when: unknown): Date | null {
  if (!when || when === 'now') return new Date();
  const d = new Date(when as string);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * PAYWALL: when OFF (default) every logged-in user can use predictions and market outlook without a plan.
 * Turns ON automatically once RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set (override with PAYWALL_ENABLED=true/false).
 */


/** Planetary snapshot stored with each prediction (shared by every prediction route). */
async function buildPlanetaryData(whenDate: Date): Promise<any | null> {
  try {
    const astroData = await astrologyService.getCurrentAstrology(whenDate);
    const planetaryObj: any = {};
    if (Array.isArray(astroData.planetaryPositions)) {
      astroData.planetaryPositions.forEach(p => {
        planetaryObj[p.planet.toLowerCase()] = {
          sign: p.sign,
          degree: Math.round(p.degree * 10) / 10,
          house: Math.floor((p.degree / 30) * 12) + 1,
          retrograde: p.retrograde || false,
        };
      });
    }
    return {
      ...planetaryObj,
      hora: astroData.hora || null,
      tithi: astroData.tithi || null,
      nakshatra: astroData.nakshatra || null,
      yoga: astroData.yoga || null,
      karana: astroData.karana || null,
      lunarPhase: astroData.lunarPhase || null,
    };
  } catch (astroError) {
    console.log('[Predict] Could not fetch planetary data:', astroError);
    return null;
  }
}

// ★ Helper: Calculate time-scaled risk multiplier
/**
 * Price range for a prediction, based on the asset's own behaviour instead of a fixed percentage:
 *   1. stocks with 20-year history: the historical p10–p90 of same-horizon moves after similar setups (skewed, centred on the typical move)
 *   2. otherwise: ±1.28σ from the asset's recent daily volatility
 *   3. otherwise: the old fixed time-scaled percentage
 * `rangeScale` is the learned calibration (from how often real prices landed inside past ranges); riskLevel widens/narrows it.
 */
function computePriceRange(currentPrice: number, enhanced: any, riskMultiplier: number, riskLevel?: string): { low: number; high: number } {
  const rs = Number(enhanced?.learningProfile?.rangeScale) || 1;
  const k = rs * (({ low: 0.85, medium: 1, high: 1.2 } as Record<string, number>)[riskLevel || 'medium'] ?? 1);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const lt = enhanced?.longTermStats;
  let low: number, high: number;
  if (lt?.reliable && lt.forecast) {
    const f = lt.forecast;
    const mid = f.medianReturnPct / 100;
    low = currentPrice * (1 + mid + ((f.p10ReturnPct / 100) - mid) * k);
    high = currentPrice * (1 + mid + ((f.p90ReturnPct / 100) - mid) * k);
  } else if (Number(enhanced?.volHalfRangePct) > 0) {
    const v = (Number(enhanced.volHalfRangePct) / 100) * k;
    low = currentPrice * (1 - v); high = currentPrice * (1 + v);
  } else {
    low = currentPrice * (1 - riskMultiplier * k); high = currentPrice * (1 + riskMultiplier * k);
  }
  low = Math.max(currentPrice * 0.01, low);
  if (high <= low) high = low * 1.001;
  return { low: r2(low), high: r2(high) };
}

function getTimeScaledRiskMultiplier(targetDate: Date, riskLevel: string, isStock: boolean = true): number {
  const now = new Date();
  const daysUntilTarget = Math.max(1, Math.floor((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  
  // Base multipliers by risk level
  const baseMultipliers = {
    low: 0.015,    // 1.5% for conservative
    medium: 0.025, // 2.5% for balanced
    high: 0.04     // 4% for aggressive
  };
  
  const baseMultiplier = baseMultipliers[riskLevel as keyof typeof baseMultipliers] || baseMultipliers.medium;
  
  // Time scaling factors
  // 1 day = 1x, 1 week = 1.5x, 1 month = 2.5x, 3 months = 4x, 6 months = 6x, 1 year = 10x
  let timeMultiplier = 1;
  if (daysUntilTarget <= 1) {
    timeMultiplier = 1;
  } else if (daysUntilTarget <= 7) {
    timeMultiplier = 1 + (daysUntilTarget / 7) * 0.5; // Scale from 1x to 1.5x
  } else if (daysUntilTarget <= 30) {
    timeMultiplier = 1.5 + ((daysUntilTarget - 7) / 23) * 1.0; // Scale from 1.5x to 2.5x
  } else if (daysUntilTarget <= 90) {
    timeMultiplier = 2.5 + ((daysUntilTarget - 30) / 60) * 1.5; // Scale from 2.5x to 4x
  } else if (daysUntilTarget <= 180) {
    timeMultiplier = 4 + ((daysUntilTarget - 90) / 90) * 2; // Scale from 4x to 6x
  } else if (daysUntilTarget <= 365) {
    timeMultiplier = 6 + ((daysUntilTarget - 180) / 185) * 4; // Scale from 6x to 10x
  } else {
    // Beyond 1 year: cap at 12x to prevent unrealistic ranges
    timeMultiplier = Math.min(12, 10 + ((daysUntilTarget - 365) / 365) * 2);
  }
  
  // Crypto gets additional volatility multiplier
  const volatilityMultiplier = isStock ? 1 : 1.5;
  
  const finalMultiplier = baseMultiplier * timeMultiplier * volatilityMultiplier;
  
  console.log(`[RiskCalc] Days: ${daysUntilTarget}, Base: ${baseMultiplier}, Time: ${timeMultiplier.toFixed(2)}x, Final: ${finalMultiplier.toFixed(4)}`);
  
  return finalMultiplier;
}

let trainingInProgress = false;

async function runRealTraining() {
  if (trainingInProgress) return;
  trainingInProgress = true;
  const startTs = Math.floor(Date.now() / 1000);
  try {
    await storage.updateTrainingStatus(0, 'Loading predictions from database...', startTs);
    const allPredictions = await db.select().from(predictions).limit(500);
    const allFeedback = await db.select().from(feedback).limit(500);
    await storage.updateTrainingStatus(10, `Loaded ${allPredictions.length} predictions, ${allFeedback.length} feedback records`, startTs);
    if (allPredictions.length < 10) {
      await storage.updateTrainingStatus(100, 'Not enough data yet — need at least 10 predictions with feedback to train', startTs);
      trainingInProgress = false;
      return;
    }
    await storage.updateTrainingStatus(20, 'Building training cases from astrological features...', startTs);
    const feedbackByStock = new Map<string, typeof allFeedback>();
    for (const f of allFeedback) {
      if (!feedbackByStock.has(f.stock)) feedbackByStock.set(f.stock, []);
      feedbackByStock.get(f.stock)!.push(f);
    }
    const SECTOR_MAP: Record<string, string> = {
      TCS: 'IT', INFY: 'IT', WIPRO: 'IT', HCLTECH: 'IT', TECHM: 'IT',
      HDFCBANK: 'Banking', ICICIBANK: 'Banking', SBIN: 'Banking', AXISBANK: 'Banking',
      KOTAKBANK: 'Banking', RELIANCE: 'Energy', ONGC: 'Energy', NTPC: 'Energy',
      SUNPHARMA: 'Pharma', DRREDDY: 'Pharma', CIPLA: 'Pharma',
      MARUTI: 'Auto', TATAMOTORS: 'Auto', TATASTEEL: 'Metals', JSWSTEEL: 'Metals',
    };
    const trainingCases: Array<{ stockSymbol: string; sector: string; date: Date; actualDirection: 'bullish' | 'bearish' | 'neutral'; actualReturn: number }> = [];
    for (const pred of allPredictions) {
      const stockFeedbacks = feedbackByStock.get(pred.stock) || [];
      const matchedFeedback = stockFeedbacks.find(f => Math.abs(f.submittedAt - (pred.createdAt ? Math.floor(pred.createdAt.getTime() / 1000) : 0)) < 7 * 86400);
      if (!matchedFeedback?.actualPrice) continue;
      const actualChange = ((matchedFeedback.actualPrice - pred.currentPrice) / pred.currentPrice) * 100;
      const actualDirection: 'bullish' | 'bearish' | 'neutral' = actualChange > 1 ? 'bullish' : actualChange < -1 ? 'bearish' : 'neutral';
      const symbol = pred.stock.replace('CRYPTO_', '');
      trainingCases.push({ stockSymbol: symbol, sector: SECTOR_MAP[symbol] || 'General', date: pred.createdAt || new Date(), actualDirection, actualReturn: actualChange });
    }
    await storage.updateTrainingStatus(40, `Built ${trainingCases.length} training cases from real outcomes`, startTs);
    if (trainingCases.length < 5) {
      await storage.updateTrainingStatus(100, `Only ${trainingCases.length} matched cases — submit more feedback with actual prices to improve training`, startTs);
      trainingInProgress = false;
      return;
    }
    await storage.updateTrainingStatus(50, 'Running astrological pattern training...', startTs);
    const result = await aiAstrologyTrainer.batchTrainOnHistoricalData(trainingCases, (progress) => {
      const scaled = 50 + Math.floor(progress * 0.45);
      storage.updateTrainingStatus(scaled, `Training: ${progress}% complete`, startTs);
    });
    await storage.updateTrainingStatus(98, 'Saving performance metrics...', startTs);
    const sectorSummary = Object.entries(result.sectorAccuracies).map(([s, a]) => `${s}: ${(a as number).toFixed(0)}%`).join(', ');
    await storage.updateTrainingStatus(100, `Done — ${result.overallAccuracy.toFixed(1)}% accuracy on ${result.totalCases} cases. Sectors: ${sectorSummary || 'N/A'}`, startTs);
  } catch (error) {
    console.error('[Training] Error:', error);
    await storage.updateTrainingStatus(0, `Training failed: ${error instanceof Error ? error.message : 'Unknown error'}`, startTs);
  } finally {
    trainingInProgress = false;
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  registerPasswordResetRoutes(app);
  registerReferralRoutes(app);
  registerPaymentRoutes(app);
  registerCreditRoutes(app);
  registerUserSettingsRoutes(app);

  app.get('/api/warmup', async (req, res) => {
    try {
      await storage.getTrainingStatus();
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'waking' });
    }
  });

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const { password, ...userWithoutPassword } = req.user;
      res.json({ ...userWithoutPassword, role: req.user.role || 'user' });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get('/api/market/outlook', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const horizon = (req.query.horizon as string) || '1m';
      const type = (req.query.type as string) || 'stocks';
      const validHorizons = ['1w', '2w', '3w', '1m', '2m', '4m', '6m', '1y'];
      if (!validHorizons.includes(horizon)) {
        return res.status(400).json({ message: `Invalid horizon. Use one of: ${validHorizons.join(', ')}` });
      }
      const prefs = await getUserPrefs(userId);
      enterRequestOptions(prefs);
      const oCharge = await chargeOrReject(req, res, outlookCost(horizon), `Market outlook (${horizon})`, { kind: 'outlook', horizon });
      if (!oCharge) return;
      req._charge = oCharge;
      console.log(`[Outlook] User ${userId} requesting ${horizon} ${type} outlook`);
      const outlook = await marketOutlookService.generateOutlook(horizon);
      const response: any = { generatedAt: outlook.generatedAt, horizon: outlook.horizon, targetDate: outlook.targetDate, daysAhead: outlook.daysAhead, marketSummary: outlook.marketSummary, stocks: outlook.stocks, crypto: outlook.crypto, stocksLocked: false, cryptoLocked: false };
      return res.json(response);
    } catch (error) {
      console.error('Market outlook error:', error);
      await refundCharge(req, req._charge, 'market outlook failed');
      res.status(500).json({ message: 'Error generating market outlook' });
    }
  });

  app.post('/api/predict', isAuthenticated, async (req: any, res) => {
    try {
      const { stock = 'TCS', when } = req.body;
      const userId = req.user.id;
      const prefs = await getUserPrefs(userId);
      enterRequestOptions(prefs);
      const whenDate = parseWhen(when);
      if (!whenDate) return res.status(400).json({ message: "Invalid date in 'when'" });
      const upperSymbol = String(stock).toUpperCase();
      
      console.log(`[Predict] Generating prediction for ${upperSymbol} with target date: ${whenDate.toISOString()}`);
      
      let realTimeQuote = await stockDataService.getStockQuote(upperSymbol, 'NSE');
      if (!realTimeQuote) {
        console.log(`[Predict] NSE failed for ${upperSymbol}, trying BSE...`);
        realTimeQuote = await stockDataService.getStockQuote(upperSymbol, 'BSE');
      }
      if (!realTimeQuote) {
        return res.status(503).json({ message: `Live market data for "${upperSymbol}" is currently unavailable.`, error: "QUOTE_UNAVAILABLE", symbol: upperSymbol });
      }
      const currentPrice = realTimeQuote.lastPrice;
      // Credits: price depends on style, risk, engines on, horizon and the size of the possible move
      const cost = await quotePrediction(userId, 'stock', upperSymbol, whenDate, req.body.mode, req.body.riskLevel);
      const charge = await chargeOrReject(req, res, cost, `Stock prediction ${upperSymbol}`, { kind: 'stock', symbol: upperSymbol, mode: req.body.mode, risk: req.body.riskLevel, lines: cost.lines });
      if (!charge) return;
      req._charge = charge;
      const historicalData = await stockDataService.getHistoricalData(upperSymbol, LONG_TERM_DAYS);
      
      // ★ Calculate time-based risk multiplier
      const riskMultiplier = getTimeScaledRiskMultiplier(whenDate, req.body.riskLevel || 'medium', true);
      
      let enhancedPrediction: any = null;
      try {
        enhancedPrediction = await aiService.generateEnhancedPrediction(upperSymbol, currentPrice, userId, historicalData, whenDate);
      } catch (pipelineError) {
        console.error('[Predict] AI/Astro pipeline error:', pipelineError);
      }
      
      if (!enhancedPrediction || !enhancedPrediction.prediction) {
        try {
          const astroPred = await astrologyService.generateAstroPrediction(upperSymbol, whenDate, currentPrice);
          enhancedPrediction = { 
            prediction: { 
              direction: astroPred.direction, 
              confidence: astroPred.confidence, 
              priceTarget: { 
                low: Math.round(currentPrice * (1 - riskMultiplier) * 100) / 100, 
                high: Math.round(currentPrice * (1 + riskMultiplier) * 100) / 100 
              } 
            }, 
            combinedConfidence: astroPred.confidence, 
            finalDirection: astroPred.direction, 
            astroRecommendation: astroPred.recommendation, 
            warnings: astroPred.warnings, 
            analysis: { technicalFactors: [], marketSentiment: 'mixed', keyRisks: astroPred.warnings, recommendation: astroPred.recommendation }, 
            vedic: astroPred.vedic || null,
            reasoning: 'Vedic astrology analysis', 
            metadata: { aiEnabled: false, feedbackLearningApplied: false } 
          };
        } catch {
          enhancedPrediction = { 
            prediction: { 
              direction: 'neutral', 
              confidence: 50, 
              priceTarget: { 
                low: Math.round(currentPrice * (1 - riskMultiplier) * 100) / 100, 
                high: Math.round(currentPrice * (1 + riskMultiplier) * 100) / 100 
              } 
            }, 
            combinedConfidence: 50, 
            finalDirection: 'neutral', 
            astroRecommendation: 'Hold and observe', 
            warnings: [], 
            analysis: { technicalFactors: [], marketSentiment: 'mixed', keyRisks: [], recommendation: 'Hold and observe' }, 
            reasoning: 'Conservative estimate', 
            metadata: { aiEnabled: false, feedbackLearningApplied: false } 
          };
        }
      } else {
        // ★ If AI gave prediction, also scale it by time horizon
        if (enhancedPrediction.prediction?.priceTarget) {
          const aiLow = enhancedPrediction.prediction.priceTarget.low;
          const aiHigh = enhancedPrediction.prediction.priceTarget.high;
          const aiRange = aiHigh - aiLow;
          const center = currentPrice;
          
          // Apply time scaling to AI's range as well
          // ...and by how often past ranges actually contained the real price (self-calibration, 0.8–1.4x)
          const range = computePriceRange(center, enhancedPrediction, riskMultiplier, req.body.riskLevel);
          enhancedPrediction.prediction.priceTarget.low = range.low;
          enhancedPrediction.prediction.priceTarget.high = range.high;
          
          console.log(`[Predict] AI prediction scaled: ${aiLow}-${aiHigh} → ${enhancedPrediction.prediction.priceTarget.low}-${enhancedPrediction.prediction.priceTarget.high}`);
        }
      }
      
      const isDevMode = process.env.NODE_ENV === 'development';
      const showAstroDetails = isDevMode && req.user?.role === 'developer';
      const finalPrediction = { stock: upperSymbol, when: whenDate.toISOString(), currentPrice, predLow: enhancedPrediction.prediction?.priceTarget?.low || Math.round(currentPrice * (1 - riskMultiplier) * 100) / 100, predHigh: enhancedPrediction.prediction?.priceTarget?.high || Math.round(currentPrice * (1 + riskMultiplier) * 100) / 100, confidence: enhancedPrediction.combinedConfidence || enhancedPrediction.prediction?.confidence || 50, exchange: realTimeQuote.exchange, direction: enhancedPrediction.finalDirection || 'neutral', technicalFactors: enhancedPrediction.analysis?.technicalFactors || [], marketSentiment: enhancedPrediction.analysis?.marketSentiment || 'mixed', keyRisks: enhancedPrediction.warnings || enhancedPrediction.analysis?.keyRisks || [], recommendation: enhancedPrediction.aiConclusion?.recommendation || enhancedPrediction.astroRecommendation || enhancedPrediction.analysis?.recommendation || 'Hold and observe', reasoning: enhancedPrediction.reasoning || 'Astrology-based analysis', aiPowered: enhancedPrediction.metadata?.aiEnabled || false, livePriceAvailable: currentPrice > 0, feedbackEnhanced: enhancedPrediction.metadata?.feedbackLearningApplied || false, aiConclusion: enhancedPrediction.aiConclusion || null, learning: enhancedPrediction.learningProfile || null, creditsCharged: req._charge?.amount ?? 0, creditsBalance: req._charge?.balance ?? null, vedic: enhancedPrediction.vedic || null, longTermStats: enhancedPrediction.longTermStats || null, companyName: realTimeQuote.companyName, ...(showAstroDetails && { astrologyBias: realTimeQuote.astrologyBias || 0, horaInfluence: realTimeQuote.horaInfluence, astroFactors: enhancedPrediction.astroFactors, astroStrength: enhancedPrediction.astroStrength, astroPowered: true }) };
      
      const statisticalReasoning = enhancedPrediction.analysis?.technicalFactors?.length > 0 ? enhancedPrediction.analysis.technicalFactors.join('; ') : 'Standard technical analysis applied';
      const astroReasoning = enhancedPrediction.astroRecommendation || (enhancedPrediction.warnings?.length > 0 ? enhancedPrediction.warnings.join('; ') : null);
      
      // ★ Planetary snapshot for the target date (stored as a real JSON object in the jsonb column)
      const planetaryData = await buildPlanetaryData(whenDate);

      await storage.createPrediction({ aiLearning: enhancedPrediction.learningSnapshot || null, userId, stock: finalPrediction.stock, currentPrice: finalPrediction.currentPrice, predLow: finalPrediction.predLow, predHigh: finalPrediction.predHigh, confidence: finalPrediction.confidence, mode: req.body.mode || 'ai-astro-combined', riskLevel: req.body.riskLevel || 'medium', targetDate: whenDate, statisticalReasoning, astroReasoning, planetaryData });
      
      return res.json(finalPrediction);
    } catch (error) {
      console.error('Prediction error:', error);
      await refundCharge(req, req._charge, 'prediction failed');
      return res.status(500).json({ message: "An error occurred while generating the prediction.", error: "PREDICTION_ERROR" });
    }
  });

  app.post('/api/crypto/predict', isAuthenticated, async (req: any, res) => {
    try {
      const { crypto: cryptoSymbol = 'BTC', when, mode = 'suggestion', riskLevel = 'high' } = req.body;
      const userId = req.user.id;
      const prefs = await getUserPrefs(userId);
      enterRequestOptions(prefs);
      const cryptoQuote = await cryptoDataService.getCryptoQuote(cryptoSymbol.toUpperCase());
      if (!cryptoQuote) return res.status(404).json({ message: "Cryptocurrency not found" });
      
      const whenDate = parseWhen(when);
      if (!whenDate) return res.status(400).json({ message: "Invalid date in 'when'" });
      const currentPrice = cryptoQuote.adjustedPrice || cryptoQuote.lastPrice;
      const cCost = await quotePrediction(userId, 'crypto', String(cryptoSymbol), whenDate, mode, riskLevel);
      const cCharge = await chargeOrReject(req, res, cCost, `Crypto prediction ${String(cryptoSymbol).toUpperCase()}`, { kind: 'crypto', symbol: String(cryptoSymbol).toUpperCase(), mode, risk: riskLevel, lines: cCost.lines });
      if (!cCharge) return;
      req._charge = cCharge;

      console.log(`[CryptoPredict] Generating prediction for ${cryptoSymbol} with target date: ${whenDate.toISOString()}`);
      
      // ★ Calculate time-based risk multiplier for crypto (higher volatility)
      const riskMultiplier = getTimeScaledRiskMultiplier(whenDate, riskLevel, false);
      
      const historicalData = await cryptoDataService.getCryptoHistoricalData(cryptoSymbol.toUpperCase(), 30);
      const enhancedPrediction = await aiService.generateEnhancedCryptoPrediction(cryptoSymbol.toUpperCase(), currentPrice, userId, historicalData, cryptoQuote, whenDate);
      
      // ★ Apply time scaling to crypto predictions
      let predLow, predHigh;
      if (enhancedPrediction.prediction?.priceTarget) {
        const cr = computePriceRange(currentPrice, enhancedPrediction, riskMultiplier, riskLevel);
        predLow = cr.low; predHigh = cr.high;
      } else {
        const cr = computePriceRange(currentPrice, enhancedPrediction, riskMultiplier, riskLevel);
        predLow = cr.low; predHigh = cr.high;
      }
      
      const finalPrediction = { crypto: cryptoSymbol.toUpperCase(), name: cryptoQuote.name, when: whenDate.toISOString(), currentPrice, predLow, predHigh, confidence: enhancedPrediction.combinedConfidence || 65, direction: enhancedPrediction.finalDirection || 'neutral', volatility: 'high', technicalFactors: enhancedPrediction.analysis?.technicalFactors || [], marketSentiment: enhancedPrediction.analysis?.marketSentiment || 'mixed', keyRisks: enhancedPrediction.warnings || [], recommendation: enhancedPrediction.aiConclusion?.recommendation || enhancedPrediction.astroRecommendation || 'Hold and observe', reasoning: enhancedPrediction.reasoning || 'Astrology-based crypto analysis', marketCap: cryptoQuote.marketCap, volume24h: cryptoQuote.volume24h, change24h: cryptoQuote.changePercent24h, aiPowered: enhancedPrediction.metadata?.aiEnabled || false, aiConclusion: enhancedPrediction.aiConclusion || null, learning: enhancedPrediction.learningProfile || null, vedic: enhancedPrediction.vedic || null, creditsCharged: req._charge?.amount ?? 0, creditsBalance: req._charge?.balance ?? null, livePriceAvailable: currentPrice > 0 };
      
      const cryptoStatisticalReasoning = enhancedPrediction.analysis?.technicalFactors?.length > 0 ? enhancedPrediction.analysis.technicalFactors.join('; ') : 'Crypto technical analysis with volatility adjustment';
      const cryptoAstroReasoning = enhancedPrediction.astroRecommendation || null;
      
      // ★ Planetary snapshot for the target date
      const cryptoPlanetaryData = await buildPlanetaryData(whenDate);

      await storage.createPrediction({ aiLearning: enhancedPrediction.learningSnapshot || null, userId, stock: `CRYPTO_${finalPrediction.crypto}`, currentPrice: finalPrediction.currentPrice, predLow: finalPrediction.predLow, predHigh: finalPrediction.predHigh, confidence: finalPrediction.confidence, mode, riskLevel, targetDate: whenDate, statisticalReasoning: cryptoStatisticalReasoning, astroReasoning: cryptoAstroReasoning, planetaryData: cryptoPlanetaryData });
      
      return res.json(finalPrediction);
    } catch (error) {
      console.error('Crypto prediction error:', error);
      await refundCharge(req, req._charge, 'crypto prediction failed');
      res.status(500).json({ message: "Error generating crypto prediction" });
    }
  });

  app.get('/api/predictions/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string || '100');
      const history = await predictionHistoryService.getUserPredictionHistory(userId, limit);
      res.json(history);
    } catch (error) {
      console.error('[API] Error fetching prediction history:', error);
      res.status(500).json({ message: 'Error fetching prediction history' });
    }
  });

  // Calibration: when BullWiser says "70% confident", how often did the real price land inside the predicted range?
  app.get('/api/predictions/calibration', isAuthenticated, async (req: any, res) => {
    try {
      const r = await pool.query(
        `SELECT confidence, pred_low AS lo, pred_high AS hi, actual_price AS actual
           FROM predictions WHERE user_id = $1 AND actual_price IS NOT NULL AND pred_low IS NOT NULL AND pred_high IS NOT NULL`, [req.user.id]);
      const edges = [0, 40, 50, 60, 70, 101];
      const buckets = edges.slice(0, -1).map((lo, i) => ({ label: i === edges.length - 2 ? `${lo}%+` : `${lo}–${edges[i + 1] - 1}%`, lo, hi: edges[i + 1], n: 0, hit: 0 }));
      for (const row of r.rows) {
        const b = buckets.find(x => Number(row.confidence) >= x.lo && Number(row.confidence) < x.hi);
        if (!b) continue;
        b.n++; if (Number(row.actual) >= Number(row.lo) && Number(row.actual) <= Number(row.hi)) b.hit++;
      }
      res.json({ total: r.rows.length, buckets: buckets.map(b => ({ label: b.label, n: b.n, hitRatePct: b.n ? Math.round((b.hit / b.n) * 100) : null })) });
    } catch (e) { res.status(500).json({ message: 'Error computing calibration' }); }
  });

  app.get('/api/predictions/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const stats = await predictionHistoryService.getUserPredictionStats(userId);
      res.json(stats);
    } catch (error) {
      console.error('[API] Error fetching prediction stats:', error);
      res.status(500).json({ message: 'Error fetching prediction stats' });
    }
  });

  app.get('/api/predictions/:id/details', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const predictionId = parseInt(req.params.id);
      if (isNaN(predictionId)) return res.status(400).json({ message: 'Invalid prediction id' });
      const details = await predictionHistoryService.getPredictionDetails(predictionId, userId);
      if (!details) {
        return res.status(404).json({ message: 'Prediction not found' });
      }
      res.json(details);
    } catch (error) {
      console.error('[API] Error fetching prediction details:', error);
      res.status(500).json({ message: 'Error fetching prediction details' });
    }
  });

  // Long-horizon outlook from the stock's own 20-year behaviour (growth rate + volatility), not from today's tick.
  app.post('/api/forecast', isAuthenticated, async (req, res) => {
    try {
      const stock = String(req.body?.stock || 'TCS').toUpperCase();
      const realTimeQuote = await stockDataService.getStockQuote(stock);
      const currentPrice = realTimeQuote?.lastPrice || 0;
      if (!(currentPrice > 0)) return res.status(503).json({ message: 'Live price unavailable right now' });
      const bars = statisticalAnalysisService.normalizeYahooData(await stockDataService.getHistoricalData(stock, LONG_TERM_DAYS));
      const lt = longTermStatsService.analyze(stock, bars, new Date(Date.now() + 30 * 86400000));
      if (!lt) return res.status(404).json({ message: 'Not enough price history for a long-term outlook' });
      const mu = Math.max(-0.05, Math.min(0.25, lt.profile.cagrPct / 100));       // sane bounds on long-run growth
      const sigma = Math.min(1, lt.profile.annualVolPct / 100);
      const result: any = {};
      for (const [horizon, t] of [['6m', 0.5], ['1y', 1], ['3y', 3], ['5y', 5]] as const) {
        const median = currentPrice * Math.pow(1 + mu, t);
        const spread = 1.28 * sigma * Math.sqrt(t);
        const predLow = Math.round(median * Math.exp(-spread) * 100) / 100;
        const predHigh = Math.round(median * Math.exp(spread) * 100) / 100;
        result[horizon] = {
          stock, when: new Date().toISOString(), currentPrice, predLow, predHigh,
          confidence: Math.round(Math.max(30, Math.min(60, 60 - 8 * Math.sqrt(t) - (lt.yearsOfData < 10 ? 8 : 0)))),
          pctChange: Math.round(((median - currentPrice) / currentPrice) * 10000) / 100,
          basis: `${lt.yearsOfData}y history: growth ${lt.profile.cagrPct}%/yr, volatility ${lt.profile.annualVolPct}%/yr (≈80% range)`,
        };
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Error generating forecast" });
    }
  });

  app.post('/api/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { stock = 'UNKNOWN', when = '', actualPrice, useful = 'yes', predictionId, actualDirection = 'neutral' } = req.body;
      const wasUseful = useful === 'yes' || useful === 'true' || useful === true;
      const parsedPrice = actualPrice ? parseFloat(actualPrice) : null;
      if (predictionId && parsedPrice) {
        await feedbackLearningService.recordFeedback(userId, parseInt(predictionId), parsedPrice, actualDirection as 'up' | 'down' | 'neutral', wasUseful);
        res.json({ status: 'ok', message: 'Feedback recorded with accuracy tracking' });
        return;
      }
      await storage.createFeedback({ userId, stock, requestedTime: when, actualPrice: parsedPrice, useful: wasUseful ? 1 : 0, submittedAt: Math.floor(Date.now() / 1000) });
      res.json({ status: 'ok' });
    } catch (error) {
      console.error('Feedback error:', error);
      res.status(500).json({ message: "Error submitting feedback" });
    }
  });

  let lastTrainingStart = 0;
  app.post('/api/training/start', isAuthenticated, async (req, res) => {
    if (trainingInProgress) return res.json({ status: 'running' });
    if (Date.now() - lastTrainingStart < 30 * 60 * 1000) return res.status(429).json({ message: 'Training was started recently. Please try again in a while.' });
    lastTrainingStart = Date.now();
    runRealTraining();
    res.json({ status: 'started' });
  });

  app.get('/api/training/status', async (req, res) => {
    try {
      const status = await storage.getTrainingStatus();
      res.json(status || { progress: 0, message: 'not started', startedAt: 0 });
    } catch (error) {
      res.status(500).json({ message: "Error fetching training status" });
    }
  });

  app.get('/api/user/subscriptions', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await storage.getUserSubscriptions(req.user.id));
    } catch (error) {
      res.status(500).json({ message: "Error fetching subscriptions" });
    }
  });

  app.get('/api/user/predictions', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await storage.getUserPredictions(req.user.id));
    } catch (error) {
      res.status(500).json({ message: "Error fetching predictions" });
    }
  });

  app.get('/api/user/predictions/active', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await storage.getUserActivePredictions(req.user.id));
    } catch (error) {
      res.status(500).json({ message: "Error fetching active predictions" });
    }
  });

  app.get('/api/user/predictions/stats', isAuthenticated, async (req: any, res) => {
    try {
      const allPredictions = await storage.getUserPredictions(req.user.id);
      if (allPredictions.length === 0) return res.json({ weeklyAccuracy: [], totalPredictions: 0, avgAccuracy: 0 });
      // Real accuracy: share of scored predictions (actual price known) whose actual price landed inside [predLow, predHigh]
      const scored = allPredictions.filter(p => p.actualPrice != null && p.createdAt);
      const hit = (p: any) => p.actualPrice >= p.predLow && p.actualPrice <= p.predHigh;
      const DAY = 24 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const weeklyAccuracy: { week: string; accuracy: number; predictions: number }[] = [];
      for (let w = 3; w >= 0; w--) {
        const from = nowMs - (w + 1) * 7 * DAY, to = nowMs - w * 7 * DAY;
        const inWeek = scored.filter(p => { const t = new Date(p.createdAt as any).getTime(); return t >= from && t < to; });
        if (inWeek.length === 0) continue;
        weeklyAccuracy.push({ week: w === 0 ? 'This week' : `${w + 1} weeks ago`.replace('2 weeks ago', 'Last week'), accuracy: Math.round((inWeek.filter(hit).length / inWeek.length) * 1000) / 10, predictions: inWeek.length });
      }
      const avgAccuracy = scored.length ? Math.round((scored.filter(hit).length / scored.length) * 1000) / 10 : 0;
      res.json({ weeklyAccuracy, totalPredictions: allPredictions.length, scoredPredictions: scored.length, avgAccuracy });
    } catch (error) {
      res.status(500).json({ message: "Error fetching prediction statistics" });
    }
  });

  app.get('/api/user/dashboard-stats', isAuthenticated, async (req: any, res) => {
    try {
      const [allPredictions, allFeedback] = await Promise.all([storage.getUserPredictions(req.user.id), storage.getUserFeedback(req.user.id)]);
      const activePredictions = allPredictions.filter(p => p.isActive);
      const portfolioValue = activePredictions.reduce((sum, p) => sum + (p.currentPrice || 0), 0);
      let accuracyRate = 0;
      if (allFeedback.length > 0) accuracyRate = Math.round((allFeedback.filter(f => f.useful === 1).length / allFeedback.length) * 100 * 10) / 10;
      else if (allPredictions.length > 0) accuracyRate = Math.round((allPredictions.reduce((sum, p) => sum + (p.confidence || 0), 0) / allPredictions.length) * 10) / 10;
      res.json({ portfolioValue: Math.round(portfolioValue * 100) / 100, accuracyRate, totalPredictions: allPredictions.length, activePredictionsCount: activePredictions.length });
    } catch (error) {
      res.status(500).json({ message: "Error fetching dashboard statistics" });
    }
  });

  app.get('/api/user/watchlist', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await storage.getUserWatchlist(req.user.id));
    } catch (error) {
      res.status(500).json({ message: "Error fetching watchlist" });
    }
  });

  app.post('/api/user/watchlist', isAuthenticated, async (req: any, res) => {
    try {
      const stock = typeof req.body.stock === 'string' ? req.body.stock.trim().toUpperCase() : '';
      if (!stock) return res.status(400).json({ message: "Stock symbol is required" });
      const existing = (await storage.getUserWatchlist(req.user.id)).find(w => w.stock === stock);
      if (existing) return res.json(existing);
      res.json(await storage.addToWatchlist({ userId: req.user.id, stock }));
    } catch (error) {
      res.status(500).json({ message: "Error adding to watchlist" });
    }
  });

  app.delete('/api/user/watchlist/:stock', isAuthenticated, async (req: any, res) => {
    try {
      await storage.removeFromWatchlist(req.user.id, req.params.stock);
      res.json({ status: 'ok' });
    } catch (error) {
      res.status(500).json({ message: "Error removing from watchlist" });
    }
  });

  app.get('/api/market/overview', async (req, res) => {
    try {
      res.json(await stockDataService.getMarketOverview());
    } catch (error) {
      res.status(500).json({ message: "Error fetching market data" });
    }
  });

  app.get('/api/crypto/overview', async (req, res) => {
    try {
      res.json(await cryptoDataService.getCryptoOverview());
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch crypto overview" });
    }
  });

  app.get('/api/crypto/quote/:symbol', async (req: any, res) => {
    try {
      const quote = await cryptoDataService.getCryptoQuote(req.params.symbol.toUpperCase());
      if (!quote) return res.status(404).json({ message: "Cryptocurrency not found" });
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch crypto quote" });
    }
  });

  // Lets any logged-in user make themselves 'developer'/'admin', so it is only
  // available outside production (or when explicitly enabled with ALLOW_DEV_SET_ROLE=true).
  app.post('/api/dev/set-role', isAuthenticated, async (req: any, res) => {
    try {
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_SET_ROLE !== 'true') {
        return res.status(403).json({ message: "Role changes are disabled in production" });
      }
      const { role } = req.body;
      if (!['user', 'developer', 'admin'].includes(role)) return res.status(400).json({ message: "Invalid role" });
      await storage.updateUserRole(req.user.id, role);
      res.json({ status: 'ok', message: `Role updated to ${role}` });
    } catch (error) {
      res.status(500).json({ message: "Error updating role" });
    }
  });

  app.get('/api/stock/:symbol', async (req, res) => {
    try {
      const quote = await stockDataService.getStockQuote(req.params.symbol.toUpperCase(), req.query.exchange as 'NSE' | 'BSE' | undefined);
      if (!quote) return res.status(404).json({ message: "Stock not found" });
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Error fetching stock quote" });
    }
  });

  app.get('/api/search/stocks', async (req, res) => {
    try {
      const { q: query } = req.query;
      if (!query || typeof query !== 'string') return res.status(400).json({ message: "Query parameter required" });
      res.json(await stockDataService.searchStocks(query));
    } catch (error) {
      res.status(500).json({ message: "Error searching stocks" });
    }
  });

  app.get('/api/crypto/:symbol', async (req, res) => {
    try {
      const quote = await cryptoDataService.getCryptoQuote(req.params.symbol.toUpperCase());
      if (!quote) return res.status(404).json({ message: "Cryptocurrency not found" });
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Error fetching crypto quote" });
    }
  });

  app.get('/api/search/crypto', async (req, res) => {
    try {
      const { q: query } = req.query;
      if (!query || typeof query !== 'string') return res.status(400).json({ message: "Query parameter required" });
      res.json(await cryptoDataService.searchCryptos(query));
    } catch (error) {
      res.status(500).json({ message: "Error searching cryptocurrencies" });
    }
  });

  app.get('/api/feedback/metrics/:symbol', isAuthenticated, async (req, res) => {
    try {
      res.json(await feedbackLearningService.getStockMetrics(req.params.symbol));
    } catch (error) {
      res.status(500).json({ message: 'Error fetching metrics' });
    }
  });

  app.get('/api/feedback/personalization', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await feedbackLearningService.getUserPersonalization(req.user.id));
    } catch (error) {
      res.status(500).json({ message: 'Error fetching personalization' });
    }
  });

  app.get('/api/astrology/current', async (req, res) => {
    try {
      const { lat, lng } = req.query;
      const location = lat && lng ? { lat: parseFloat(lat as string), lng: parseFloat(lng as string) } : undefined;
      res.json(await astrologyService.getCurrentAstrology(new Date(), location));
    } catch (error) {
      res.status(500).json({ message: 'Error fetching astrology data' });
    }
  });

  // 20-year statistical analysis for a stock (also used by the prediction pipeline)
  app.get('/api/stock/:symbol/stats', isAuthenticated, async (req, res) => {
    try {
      const symbol = String(req.params.symbol).toUpperCase();
      const target = parseWhen(req.query.when as string) ?? new Date(Date.now() + 30 * 86400000);
      const raw = await stockDataService.getHistoricalData(symbol, LONG_TERM_DAYS);
      const bars = statisticalAnalysisService.normalizeYahooData(raw);
      const result = longTermStatsService.analyze(symbol, bars, target);
      if (!result) return res.status(404).json({ message: 'Not enough price history (need at least ~1 year) for statistical analysis.' });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: 'Error running statistical analysis' });
    }
  });

  // Self-learning report: how accurate past predictions were and what the system adjusted because of it
  app.get('/api/learning/summary', isAuthenticated, async (_req, res) => {
    try {
      const { learningService } = await import('./learningService');
      const [stock, crypto] = await Promise.all([learningService.getProfile('*', 'General', 'stock'), learningService.getProfile('*', 'Crypto', 'crypto')]);
      res.json({ stock, crypto, checkedEvery: '2 hours', baseRatio: '55% statistics : 45% astrology' });
    } catch (e) { res.status(500).json({ message: 'Error loading learning summary' }); }
  });

  app.get('/api/stock/:symbol/history', async (req, res) => {
    try {
      res.json(await stockDataService.getHistoricalData(req.params.symbol.toUpperCase(), parseInt(req.query.days as string || '30')));
    } catch (error) {
      res.status(500).json({ message: "Error fetching historical data" });
    }
  });

  app.get('/api/crypto/:symbol/history', async (req, res) => {
    try {
      res.json(await cryptoDataService.getCryptoHistoricalData(req.params.symbol.toUpperCase(), parseInt(req.query.days as string || '30')));
    } catch (error) {
      res.status(500).json({ message: "Error fetching crypto historical data" });
    }
  });

  app.get('/api/ai/status', async (req, res) => {
    try {
      const isConfigured = isGroqConfigured();
      res.json({ aiEnabled: isConfigured, provider: isConfigured ? 'Groq llama-3.3-70b' : 'Built-in engine', message: isConfigured ? 'Groq AI reads the statistics + astrology and writes the conclusion; built-in engine is the fallback' : 'Groq key not set — using the built-in statistics + astrology engine.' });
    } catch (error) {
      res.status(500).json({ message: 'Error checking AI status' });
    }
  });

  app.post('/api/astrology/analyze-chart', isAuthenticated, async (req: any, res) => {
    try {
      const { birthDate, birthTime, latitude, longitude } = req.body;
      res.json(await aiAstrologyTrainer.trainOnChartReading(new Date(birthDate), birthTime, latitude || 28.6139, longitude || 77.2090, new Date()));
    } catch (error) {
      res.status(500).json({ message: 'Error analyzing chart' });
    }
  });

  app.post('/api/astrology/sector-analysis', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await advancedAstrologyService.analyzeStockBySector(req.body.stockSymbol, req.body.sector, new Date()));
    } catch (error) {
      res.status(500).json({ message: 'Error analyzing sector' });
    }
  });

  app.post('/api/training/record-case', isAuthenticated, async (req: any, res) => {
    try {
      const { stockSymbol, sector, predictionDate, actualOutcome } = req.body;
      res.json(await aiAstrologyTrainer.trainOnRealWorldCase(stockSymbol, sector, new Date(predictionDate), { direction: actualOutcome.direction, actualReturn: actualOutcome.actualReturn, timeToTarget: actualOutcome.timeToTarget || 1 }));
    } catch (error) {
      res.status(500).json({ message: 'Error recording training case' });
    }
  });

  // Model-training endpoints spawn Python processes, so they require a login and a safe model name.
  const SAFE_MODEL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

  app.post('/api/training/train-model', isAuthenticated, async (req: any, res) => {
    try {
      const { trainingCases, modelName, modelType } = req.body;
      if (!trainingCases || !Array.isArray(trainingCases)) return res.status(400).json({ error: "Training cases array required" });
      if (modelName !== undefined && !SAFE_MODEL_NAME.test(String(modelName))) return res.status(400).json({ error: "Invalid model name" });
      const result = await aiAstrologyTrainer.trainAndSaveModel(trainingCases, modelName || 'bullwiser_main', modelType || 'random_forest');
      result.success ? res.json({ success: true, modelPath: result.modelPath, accuracy: result.accuracy }) : res.status(500).json({ success: false, error: result.error });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/training/predict-with-model', isAuthenticated, async (req: any, res) => {
    try {
      const { modelName, features } = req.body;
      if (!modelName || !features) return res.status(400).json({ error: "Model name and features required" });
      if (!SAFE_MODEL_NAME.test(String(modelName))) return res.status(400).json({ error: "Invalid model name" });
      res.json(await aiAstrologyTrainer.predictWithSavedModel(modelName, features));
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/training/models', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await aiAstrologyTrainer.listAvailableModels());
    } catch (error) {
      res.status(500).json({ success: false, models: [] });
    }
  });

  app.post('/api/training/batch-train', isAuthenticated, async (req: any, res) => {
    try {
      const cases = req.body.trainingCases.map((c: any) => ({ ...c, date: new Date(c.date) }));
      res.json(await aiAstrologyTrainer.batchTrainOnHistoricalData(cases, (p) => console.log(`Training: ${p}%`)));
    } catch (error) {
      res.status(500).json({ message: 'Error in batch training' });
    }
  });

  app.get('/api/training/performance', isAuthenticated, async (req, res) => {
    try {
      res.json(await aiAstrologyTrainer.getPerformanceMetrics(parseInt(req.query.lookbackDays as string || '30')));
    } catch (error) {
      res.status(500).json({ message: 'Error fetching performance metrics' });
    }
  });

  app.get('/api/training/history/:sector', isAuthenticated, async (req, res) => {
    try {
      res.json(await advancedAstrologyService.learnFromHistory(req.params.sector, parseInt(req.query.lookbackDays as string || '365')));
    } catch (error) {
      res.status(500).json({ message: 'Error fetching learning history' });
    }
  });

  app.get('/api/user/feedback', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await storage.getUserFeedback(req.user.id));
    } catch (error) {
      res.status(500).json({ message: "Error fetching feedback" });
    }
  });

  app.put('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { firstName, lastName, email, profileImageUrl } = req.body;
      const [updated] = await db.update(users).set({ firstName: firstName || null, lastName: lastName || null, email: email || null, profileImageUrl: profileImageUrl || null, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password: _, ...u } = updated;
      res.json(u);
    } catch (error) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.put('/api/user/password', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ message: "Current and new password are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const [userRecord] = await db.select().from(users).where(eq(users.id, userId));
      if (!userRecord) return res.status(404).json({ message: "User not found" });
      if (!(await comparePasswords(currentPassword, userRecord.password))) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      await db.update(users).set({ password: await hashPassword(newPassword), updatedAt: new Date() }).where(eq(users.id, userId));
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.get('/api/user/export', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const [allPredictions, allSubscriptions, allFeedback, allWatchlist] = await Promise.all([storage.getUserPredictions(userId), storage.getUserSubscriptions(userId), storage.getUserFeedback(userId), storage.getUserWatchlist(userId)]);
      const { password: _pw, ...userWithoutPassword } = req.user;
      res.setHeader('Content-Disposition', `attachment; filename="bullwiser-${new Date().toISOString().split('T')[0]}.json"`);
      res.json({ user: userWithoutPassword, predictions: allPredictions, subscriptions: allSubscriptions, feedback: allFeedback, watchlist: allWatchlist, exportedAt: new Date().toISOString() });
    } catch (error) {
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  app.delete('/api/user/account', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      // Every child table has a non-cascading FK to users.id, so deleting the user row
      // alone failed with a constraint error for anyone who had any data. Remove the
      // dependent rows first, atomically.
      await db.transaction(async (tx) => {
        await tx.delete(watchlist).where(eq(watchlist.userId, userId));
        await tx.delete(feedback).where(eq(feedback.userId, userId));
        await tx.delete(predictions).where(eq(predictions.userId, userId));
        await tx.delete(subscriptions).where(eq(subscriptions.userId, userId));
        await tx.delete(astrologyCharts).where(eq(astrologyCharts.userId, userId));
        await tx.delete(users).where(eq(users.id, userId));
      });
      req.logout((err: any) => {
        if (err) console.error('[Account] Logout after delete failed:', err);
        res.json({ message: "Account deleted successfully" });
      });
    } catch (error) {
      console.error('[Account] Delete failed:', error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  app.post('/api/notifications/subscribe', isAuthenticated, async (req: any, res) => {
    res.json({ status: 'success', message: 'Subscription stored' });
  });

  app.post('/api/notifications/unsubscribe', isAuthenticated, async (req: any, res) => {
    res.json({ status: 'success', message: 'Unsubscribed' });
  });

  app.post('/api/notifications/test', isAuthenticated, async (req: any, res) => {
    res.json({ status: 'success', message: 'Test notification sent' });
  });

  const httpServer = createServer(app);
  return httpServer;
}
