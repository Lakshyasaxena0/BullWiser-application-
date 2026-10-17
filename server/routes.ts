import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, hashPassword, comparePasswords } from "./auth";
import { registerPasswordResetRoutes } from "./passwordReset";
import { longTermStatsService, LONG_TERM_DAYS } from "./longTermStatsService";
import { statisticalAnalysisService } from "./statisticalAnalysisService";
import { registerPaymentRoutes, isPaywallOn } from "./payments";
import { registerReferralRoutes, usableCredits } from "./referrals";
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


const VALID_DURATIONS = ['daily', 'weekly', 'monthly', 'yearly'];
const VALID_TRADE_TYPES = ['low', 'medium', 'high'];
const VALID_MODES = ['suggestion', 'auto'];

/**
 * Validate and normalise billing inputs. Without this, a negative tradesPerDay produced a
 * negative price (a free subscription), and non-numeric input produced NaN prices that
 * crashed the insert with a 500.
 */
function parseBillingInput(body: any, kind: 'stock' | 'crypto'): { error: string } | { value: any } {
  const mode = body.mode ?? 'suggestion';
  const duration = body.duration ?? 'daily';
  const tradesPerDay = parseInt(body.tradesPerDay ?? 2);
  const referralCount = Math.max(0, parseInt(body.referralCount ?? 0) || 0);

  if (!VALID_MODES.includes(mode)) return { error: `Invalid mode. Use one of: ${VALID_MODES.join(', ')}` };
  if (!VALID_DURATIONS.includes(duration)) return { error: `Invalid duration. Use one of: ${VALID_DURATIONS.join(', ')}` };
  if (!Number.isInteger(tradesPerDay) || tradesPerDay < 1 || tradesPerDay > 100) {
    return { error: 'tradesPerDay must be a whole number between 1 and 100' };
  }

  if (kind === 'stock') {
    const tradeType = body.tradeType ?? 'low';
    if (!VALID_TRADE_TYPES.includes(tradeType)) return { error: `Invalid tradeType. Use one of: ${VALID_TRADE_TYPES.join(', ')}` };
    return { value: { mode, tradeType, tradesPerDay, duration, referralCount } };
  }

  const cryptoValue = parseFloat(body.cryptoValue ?? 10000);
  if (!isFinite(cryptoValue) || cryptoValue <= 0) return { error: 'cryptoValue must be a positive number' };
  return { value: { mode, tradesPerDay, cryptoValue, duration, referralCount } };
}

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

function calculateBullwiserPrice(mode: string, tradeType: string, tradesPerDay: number, duration: string, referralCount: number = 0) {
  const tradeTypeRates = { 'low': 700, 'medium': 1400, 'high': 2100 };
  const ratePerTrade = tradeTypeRates[tradeType as keyof typeof tradeTypeRates] || 700;
  const basePrice = ratePerTrade * tradesPerDay;
  const durationDiscounts = { 'daily': 0.00, 'weekly': 0.05, 'monthly': 0.10, 'yearly': 0.20 };
  const durationDiscount = durationDiscounts[duration as keyof typeof durationDiscounts] || 0.0;
  const discountedPrice = basePrice * (1 - durationDiscount);
  const referralDiscount = Math.min(referralCount * 0.10, 0.50);
  const referralDiscountedPrice = discountedPrice * (1 - referralDiscount);
  let autoModeSurcharge = 0;
  if (mode === 'auto') {
    const multipliers = { 'low': 1, 'medium': 2, 'high': 3 };
    autoModeSurcharge = 150 * (multipliers[tradeType as keyof typeof multipliers] || 1);
  }
  const finalPrice = Math.round(referralDiscountedPrice + autoModeSurcharge);
  return { mode, tradeType, tradesPerDay, duration, basePrice, afterDurationDiscount: Math.round(discountedPrice), afterReferralDiscount: Math.round(referralDiscountedPrice), autoModeSurcharge, referralDiscountApplied: Math.round(referralDiscount * 100), durationDiscountApplied: Math.round(durationDiscount * 100), finalBill: finalPrice };
}

function calculateCryptoBillingPrice(mode: string, tradesPerDay: number, cryptoValue: number, duration: string, referralCount: number = 0) {
  const basePrice = 500;
  const valueMultiplier = Math.max(1, Math.floor(cryptoValue / 1000));
  const tradePrice = tradesPerDay * 50;
  const modeMultiplier = mode === 'auto' ? 1.5 : 1.0;
  const subtotal = (basePrice + tradePrice) * valueMultiplier * modeMultiplier;
  const durationDiscounts = { 'daily': 0.00, 'weekly': 0.05, 'monthly': 0.10, 'yearly': 0.20 };
  const durationDiscount = durationDiscounts[duration as keyof typeof durationDiscounts] || 0.0;
  const discountedPrice = subtotal * (1 - durationDiscount);
  const referralDiscount = Math.min(referralCount * 0.10, 0.50);
  const referralDiscountedPrice = discountedPrice * (1 - referralDiscount);
  let autoModeSurcharge = 0;
  if (mode === 'auto') autoModeSurcharge = Math.min(cryptoValue * 0.01, 1000);
  const finalPrice = Math.round(referralDiscountedPrice + autoModeSurcharge);
  return { mode, tradesPerDay, cryptoValue, duration, basePrice, tradePrice, valueMultiplier, modeMultiplier, subtotal: Math.round(subtotal), afterDurationDiscount: Math.round(discountedPrice), afterReferralDiscount: Math.round(referralDiscountedPrice), autoModeSurcharge: Math.round(autoModeSurcharge), referralDiscountApplied: Math.round(referralDiscount * 100), durationDiscountApplied: Math.round(durationDiscount * 100), finalBill: finalPrice };
}

// ★ Helper: Calculate time-scaled risk multiplier
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
  registerPaymentRoutes(app, { parseBillingInput, calculateStock: calculateBullwiserPrice, calculateCrypto: calculateCryptoBillingPrice });

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

  app.post('/api/billing/estimate', async (req: any, res) => {
    try {
      const parsed = parseBillingInput(req.body, 'stock');
      if ('error' in parsed) return res.status(400).json({ message: parsed.error });
      const { mode, tradeType, tradesPerDay, duration } = parsed.value;
      const referralCount = req.isAuthenticated?.() ? await usableCredits(req.user.id) : 0; // from the database, not the browser
      res.json(calculateBullwiserPrice(mode, tradeType, tradesPerDay, duration, referralCount));
    } catch (error) {
      res.status(500).json({ message: "Error calculating price" });
    }
  });

  app.post('/api/billing/crypto/estimate', async (req: any, res) => {
    try {
      const parsed = parseBillingInput(req.body, 'crypto');
      if ('error' in parsed) return res.status(400).json({ message: parsed.error });
      const { mode, tradesPerDay, cryptoValue, duration } = parsed.value;
      const referralCount = req.isAuthenticated?.() ? await usableCredits(req.user.id) : 0;
      res.json(calculateCryptoBillingPrice(mode, tradesPerDay, cryptoValue, duration, referralCount));
    } catch (error) {
      res.status(500).json({ message: "Error calculating crypto billing price" });
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
      const userSubscriptions = await storage.getUserSubscriptions(userId);
      const now = new Date();
      const hasActiveSub = userSubscriptions.some(s => new Date(s.endTs * 1000) > now);
      if (isPaywallOn() && !hasActiveSub) {
        return res.status(403).json({ message: 'Active subscription required to access market outlook', error: 'SUBSCRIPTION_REQUIRED', subscriptionType: 'any' });
      }
      console.log(`[Outlook] User ${userId} requesting ${horizon} ${type} outlook`);
      const outlook = await marketOutlookService.generateOutlook(horizon);
      const response: any = { generatedAt: outlook.generatedAt, horizon: outlook.horizon, targetDate: outlook.targetDate, daysAhead: outlook.daysAhead, marketSummary: outlook.marketSummary, stocks: outlook.stocks, crypto: outlook.crypto, stocksLocked: false, cryptoLocked: false };
      return res.json(response);
    } catch (error) {
      console.error('Market outlook error:', error);
      res.status(500).json({ message: 'Error generating market outlook' });
    }
  });

  app.post('/api/predict', isAuthenticated, async (req: any, res) => {
    try {
      const { stock = 'TCS', when } = req.body;
      const userId = req.user.id;
      const userSubscriptions = await storage.getUserSubscriptions(userId);
      const activeStockSubscription = userSubscriptions.find(sub => !String(sub.mode).startsWith('crypto') && new Date(sub.endTs * 1000) > new Date());
      if (isPaywallOn() && !activeStockSubscription) {
        return res.status(403).json({ message: "Active stock subscription required", error: "SUBSCRIPTION_REQUIRED", subscriptionType: "stock" });
      }
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
          const rangeScale = Number(enhancedPrediction.learningProfile?.rangeScale) || 1;
          enhancedPrediction.prediction.priceTarget.low = Math.round(center * (1 - riskMultiplier * rangeScale) * 100) / 100;
          enhancedPrediction.prediction.priceTarget.high = Math.round(center * (1 + riskMultiplier * rangeScale) * 100) / 100;
          
          console.log(`[Predict] AI prediction scaled: ${aiLow}-${aiHigh} → ${enhancedPrediction.prediction.priceTarget.low}-${enhancedPrediction.prediction.priceTarget.high}`);
        }
      }
      
      const isDevMode = process.env.NODE_ENV === 'development';
      const showAstroDetails = isDevMode && req.user?.role === 'developer';
      const finalPrediction = { stock: upperSymbol, when: whenDate.toISOString(), currentPrice, predLow: enhancedPrediction.prediction?.priceTarget?.low || Math.round(currentPrice * (1 - riskMultiplier) * 100) / 100, predHigh: enhancedPrediction.prediction?.priceTarget?.high || Math.round(currentPrice * (1 + riskMultiplier) * 100) / 100, confidence: enhancedPrediction.combinedConfidence || enhancedPrediction.prediction?.confidence || 50, exchange: realTimeQuote.exchange, direction: enhancedPrediction.finalDirection || 'neutral', technicalFactors: enhancedPrediction.analysis?.technicalFactors || [], marketSentiment: enhancedPrediction.analysis?.marketSentiment || 'mixed', keyRisks: enhancedPrediction.warnings || enhancedPrediction.analysis?.keyRisks || [], recommendation: enhancedPrediction.aiConclusion?.recommendation || enhancedPrediction.astroRecommendation || enhancedPrediction.analysis?.recommendation || 'Hold and observe', reasoning: enhancedPrediction.reasoning || 'Astrology-based analysis', aiPowered: enhancedPrediction.metadata?.aiEnabled || false, livePriceAvailable: currentPrice > 0, feedbackEnhanced: enhancedPrediction.metadata?.feedbackLearningApplied || false, aiConclusion: enhancedPrediction.aiConclusion || null, learning: enhancedPrediction.learningProfile || null, vedic: enhancedPrediction.vedic || null, longTermStats: enhancedPrediction.longTermStats || null, companyName: realTimeQuote.companyName, ...(showAstroDetails && { astrologyBias: realTimeQuote.astrologyBias || 0, horaInfluence: realTimeQuote.horaInfluence, astroFactors: enhancedPrediction.astroFactors, astroStrength: enhancedPrediction.astroStrength, astroPowered: true }) };
      
      const statisticalReasoning = enhancedPrediction.analysis?.technicalFactors?.length > 0 ? enhancedPrediction.analysis.technicalFactors.join('; ') : 'Standard technical analysis applied';
      const astroReasoning = enhancedPrediction.astroRecommendation || (enhancedPrediction.warnings?.length > 0 ? enhancedPrediction.warnings.join('; ') : null);
      
      // ★ Planetary snapshot for the target date (stored as a real JSON object in the jsonb column)
      const planetaryData = await buildPlanetaryData(whenDate);

      await storage.createPrediction({ aiLearning: enhancedPrediction.learningSnapshot || null, userId, stock: finalPrediction.stock, currentPrice: finalPrediction.currentPrice, predLow: finalPrediction.predLow, predHigh: finalPrediction.predHigh, confidence: finalPrediction.confidence, mode: req.body.mode || 'ai-astro-combined', riskLevel: req.body.riskLevel || 'medium', targetDate: whenDate, statisticalReasoning, astroReasoning, planetaryData });
      
      return res.json(finalPrediction);
    } catch (error) {
      console.error('Prediction error:', error);
      return res.status(500).json({ message: "An error occurred while generating the prediction.", error: "PREDICTION_ERROR" });
    }
  });

  app.post('/api/crypto/predict', isAuthenticated, async (req: any, res) => {
    try {
      const { crypto: cryptoSymbol = 'BTC', when, mode = 'suggestion', riskLevel = 'high' } = req.body;
      const userId = req.user.id;
      const cryptoSubs = await storage.getUserSubscriptions(userId);
      if (isPaywallOn() && !cryptoSubs.some(sub => String(sub.mode).startsWith('crypto') && new Date(sub.endTs * 1000) > new Date())) {
        return res.status(403).json({ message: "Active crypto subscription required", error: "SUBSCRIPTION_REQUIRED", subscriptionType: "crypto" });
      }
      const cryptoQuote = await cryptoDataService.getCryptoQuote(cryptoSymbol.toUpperCase());
      if (!cryptoQuote) return res.status(404).json({ message: "Cryptocurrency not found" });
      
      const whenDate = parseWhen(when);
      if (!whenDate) return res.status(400).json({ message: "Invalid date in 'when'" });
      const currentPrice = cryptoQuote.adjustedPrice || cryptoQuote.lastPrice;

      console.log(`[CryptoPredict] Generating prediction for ${cryptoSymbol} with target date: ${whenDate.toISOString()}`);
      
      // ★ Calculate time-based risk multiplier for crypto (higher volatility)
      const riskMultiplier = getTimeScaledRiskMultiplier(whenDate, riskLevel, false);
      
      const historicalData = await cryptoDataService.getCryptoHistoricalData(cryptoSymbol.toUpperCase(), 30);
      const enhancedPrediction = await aiService.generateEnhancedCryptoPrediction(cryptoSymbol.toUpperCase(), currentPrice, userId, historicalData, cryptoQuote, whenDate);
      
      // ★ Apply time scaling to crypto predictions
      let predLow, predHigh;
      if (enhancedPrediction.prediction?.priceTarget) {
        predLow = Math.round(currentPrice * (1 - riskMultiplier * (Number(enhancedPrediction.learningProfile?.rangeScale) || 1)) * 100) / 100;
        predHigh = Math.round(currentPrice * (1 + riskMultiplier * (Number(enhancedPrediction.learningProfile?.rangeScale) || 1)) * 100) / 100;
      } else {
        predLow = currentPrice * (1 - riskMultiplier * (Number(enhancedPrediction.learningProfile?.rangeScale) || 1));
        predHigh = currentPrice * (1 + riskMultiplier * (Number(enhancedPrediction.learningProfile?.rangeScale) || 1));
      }
      
      const finalPrediction = { crypto: cryptoSymbol.toUpperCase(), name: cryptoQuote.name, when: whenDate.toISOString(), currentPrice, predLow, predHigh, confidence: enhancedPrediction.combinedConfidence || 65, direction: enhancedPrediction.finalDirection || 'neutral', volatility: 'high', technicalFactors: enhancedPrediction.analysis?.technicalFactors || [], marketSentiment: enhancedPrediction.analysis?.marketSentiment || 'mixed', keyRisks: enhancedPrediction.warnings || [], recommendation: enhancedPrediction.aiConclusion?.recommendation || enhancedPrediction.astroRecommendation || 'Hold and observe', reasoning: enhancedPrediction.reasoning || 'Astrology-based crypto analysis', marketCap: cryptoQuote.marketCap, volume24h: cryptoQuote.volume24h, change24h: cryptoQuote.changePercent24h, aiPowered: enhancedPrediction.metadata?.aiEnabled || false, aiConclusion: enhancedPrediction.aiConclusion || null, learning: enhancedPrediction.learningProfile || null, vedic: enhancedPrediction.vedic || null, livePriceAvailable: currentPrice > 0 };
      
      const cryptoStatisticalReasoning = enhancedPrediction.analysis?.technicalFactors?.length > 0 ? enhancedPrediction.analysis.technicalFactors.join('; ') : 'Crypto technical analysis with volatility adjustment';
      const cryptoAstroReasoning = enhancedPrediction.astroRecommendation || null;
      
      // ★ Planetary snapshot for the target date
      const cryptoPlanetaryData = await buildPlanetaryData(whenDate);

      await storage.createPrediction({ aiLearning: enhancedPrediction.learningSnapshot || null, userId, stock: `CRYPTO_${finalPrediction.crypto}`, currentPrice: finalPrediction.currentPrice, predLow: finalPrediction.predLow, predHigh: finalPrediction.predHigh, confidence: finalPrediction.confidence, mode, riskLevel, targetDate: whenDate, statisticalReasoning: cryptoStatisticalReasoning, astroReasoning: cryptoAstroReasoning, planetaryData: cryptoPlanetaryData });
      
      return res.json(finalPrediction);
    } catch (error) {
      console.error('Crypto prediction error:', error);
      res.status(500).json({ message: "Error generating crypto prediction" });
    }
  });

  app.post('/api/crypto/predict/generate', isAuthenticated, async (req: any, res) => {
    try {
      const { subscriptionId, crypto: cryptoSymbol = 'BTC', when } = req.body;
      const userId = req.user.id;
      let subscription: any = null;
      if (isPaywallOn()) {
        subscription = await storage.getSubscription(subscriptionId);
        if (!subscription || subscription.userId !== userId || !String(subscription.mode).startsWith('crypto')) return res.status(403).json({ message: "Invalid or unauthorized subscription" });
        if (subscription.endTs < Math.floor(Date.now() / 1000)) return res.status(403).json({ message: "Subscription expired" });
      }
      const whenDate = parseWhen(when);
      if (!whenDate) return res.status(400).json({ message: "Invalid date in 'when'" });
      const cryptoQuote = await cryptoDataService.getCryptoQuote(cryptoSymbol.toUpperCase());
      if (!cryptoQuote) return res.status(404).json({ message: "Cryptocurrency not found" });
      const currentPrice = cryptoQuote.adjustedPrice || cryptoQuote.lastPrice;
      
      // ★ Calculate time-based risk multiplier
      const riskMultiplier = getTimeScaledRiskMultiplier(whenDate, req.body.riskLevel || 'high', false);
      
      const historicalData = await cryptoDataService.getCryptoHistoricalData(cryptoSymbol.toUpperCase(), 30);
      const enhancedPrediction = await aiService.generateEnhancedCryptoPrediction(cryptoSymbol.toUpperCase(), currentPrice, userId, historicalData, cryptoQuote, whenDate);
      
      // ★ Apply time scaling
      const predLow = Math.round(currentPrice * (1 - riskMultiplier * (Number(enhancedPrediction.learningProfile?.rangeScale) || 1)) * 100) / 100;
      const predHigh = Math.round(currentPrice * (1 + riskMultiplier * (Number(enhancedPrediction.learningProfile?.rangeScale) || 1)) * 100) / 100;
      
      const finalPrediction = { crypto: cryptoSymbol.toUpperCase(), name: cryptoQuote.name, when: whenDate.toISOString(), currentPrice, predLow, predHigh, confidence: enhancedPrediction.combinedConfidence || 65, direction: enhancedPrediction.finalDirection || 'neutral', volatility: 'high', technicalFactors: enhancedPrediction.analysis?.technicalFactors || [], marketSentiment: enhancedPrediction.analysis?.marketSentiment || 'mixed', keyRisks: enhancedPrediction.warnings || [], recommendation: enhancedPrediction.aiConclusion?.recommendation || enhancedPrediction.astroRecommendation || 'Hold and observe', marketCap: cryptoQuote.marketCap, volume24h: cryptoQuote.volume24h, change24h: cryptoQuote.changePercent24h, aiPowered: enhancedPrediction.metadata?.aiEnabled || false, aiConclusion: enhancedPrediction.aiConclusion || null, learning: enhancedPrediction.learningProfile || null, vedic: enhancedPrediction.vedic || null, subscriptionId };
      
      const cryptoStatisticalReasoning = enhancedPrediction.analysis?.technicalFactors?.length > 0 ? enhancedPrediction.analysis.technicalFactors.join('; ') : 'Crypto technical analysis with volatility adjustment';
      const cryptoAstroReasoning = enhancedPrediction.astroRecommendation || null;
      
      // This route previously read planets off the array as if it were an object (always null)
      // and used fields that don't exist (horaLord, currentNakshatra). Use the shared builder.
      const cryptoPlanetaryData = await buildPlanetaryData(whenDate);

      await storage.createPrediction({ aiLearning: enhancedPrediction.learningSnapshot || null, userId, stock: `CRYPTO_${finalPrediction.crypto}`, currentPrice: finalPrediction.currentPrice, predLow: finalPrediction.predLow, predHigh: finalPrediction.predHigh, confidence: finalPrediction.confidence, mode: subscription?.mode || 'suggestion', riskLevel: req.body.riskLevel || 'high', targetDate: whenDate, statisticalReasoning: cryptoStatisticalReasoning, astroReasoning: cryptoAstroReasoning, planetaryData: cryptoPlanetaryData });
      
      return res.json(finalPrediction);
    } catch (error) {
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

  app.post('/api/forecast', async (req, res) => {
    try {
      const { stock = 'TCS' } = req.body;
      const now = new Date();
      const result: any = {};
      const realTimeQuote = await stockDataService.getStockQuote(stock.toUpperCase());
      const currentPrice = realTimeQuote?.lastPrice || 0;
      const astrologyBias = realTimeQuote?.astrologyBias || 0;
      for (const horizon of ['6m', '1y', '3y', '5y']) {
        let band = 0.15, timeMultiplier = 0.5;
        if (horizon === '1y') {
          band = 0.30;
          timeMultiplier = 1;
        } else if (horizon === '3y') {
          band = 0.60;
          timeMultiplier = 3;
        } else if (horizon === '5y') {
          band = 1.0;
          timeMultiplier = 5;
        }
        const technicalDirection = realTimeQuote ? (realTimeQuote.changePercent > 0 ? 0.02 : -0.02) : 0;
        const astrologyInfluence = (astrologyBias / 100) * timeMultiplier * 0.05;
        const center = currentPrice * (1 + technicalDirection + astrologyInfluence);
        const predLow = Math.round(center * (1 - band) * 100) / 100;
        const predHigh = Math.round(center * (1 + band) * 100) / 100;
        const mid = (predLow + predHigh) / 2.0;
        const pctChange = currentPrice > 0 ? ((mid - currentPrice) / currentPrice) * 100.0 : 0;
        let confidence = Math.max(Math.min(60 - (band * 20) + Math.abs(astrologyBias) * 2, 85), 30);
        result[horizon] = { stock: stock.toUpperCase(), when: now.toISOString(), currentPrice, predLow, predHigh, confidence: Math.round(confidence * 10) / 10, pctChange: Math.round(pctChange * 100) / 100, astrologyBias, horaInfluence: realTimeQuote?.horaInfluence, astroBiasApplied: true };
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Error generating forecast" });
    }
  });

  // Subscriptions are created ONLY after a verified Razorpay payment (server/payments.ts).
  // Set ALLOW_FREE_SUBSCRIPTIONS=true for local development only.
  const freeSubsAllowed = () => process.env.ALLOW_FREE_SUBSCRIPTIONS === 'true' && process.env.NODE_ENV !== 'production';

  app.post('/api/subscribe', isAuthenticated, async (req: any, res) => {
    if (!freeSubsAllowed()) return res.status(402).json({ message: 'Payment required. Use /api/payments/create-order.' });
    try {
      const userId = req.user.id;
      const parsed = parseBillingInput({ duration: 'monthly', ...req.body }, 'stock');
      if ('error' in parsed) return res.status(400).json({ message: parsed.error });
      const { mode, tradeType, tradesPerDay, duration, referralCount } = parsed.value;
      const bill = calculateBullwiserPrice(mode, tradeType, tradesPerDay, duration, referralCount);
      const startTs = Math.floor(Date.now() / 1000);
      const durationMap: any = { daily: 86400, weekly: 7 * 86400, monthly: 30 * 86400, yearly: 365 * 86400 };
      const endTs = startTs + durationMap[duration];
      const subscription = await storage.createSubscription({ userId, mode, tradeType, tradesPerDay, duration, startTs, endTs, price: bill.finalBill });
      res.json({ status: 'ok', invoice: bill, subscriptionId: subscription.id });
    } catch (error) {
      res.status(500).json({ message: "Error creating subscription" });
    }
  });

  app.post('/api/crypto/subscribe', isAuthenticated, async (req: any, res) => {
    if (!freeSubsAllowed()) return res.status(402).json({ message: 'Payment required. Use /api/payments/create-order.' });
    try {
      const userId = req.user.id;
      const parsed = parseBillingInput({ duration: 'monthly', ...req.body }, 'crypto');
      if ('error' in parsed) return res.status(400).json({ message: parsed.error });
      const { mode, tradesPerDay, cryptoValue, duration, referralCount } = parsed.value;
      const bill = calculateCryptoBillingPrice(mode, tradesPerDay, cryptoValue, duration, referralCount);
      const startTs = Math.floor(Date.now() / 1000);
      const durationMap: any = { daily: 86400, weekly: 7 * 86400, monthly: 30 * 86400, yearly: 365 * 86400 };
      const endTs = startTs + durationMap[duration];
      const subscription = await storage.createSubscription({ userId, mode: `crypto-${mode}`, tradeType: 'crypto', tradesPerDay, duration, startTs, endTs, price: bill.finalBill });
      res.json({ status: 'ok', invoice: bill, subscriptionId: subscription.id, type: 'crypto' });
    } catch (error) {
      res.status(500).json({ message: "Error creating crypto subscription" });
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

  app.post('/api/training/start', isAuthenticated, async (req, res) => {
    if (trainingInProgress) return res.json({ status: 'running' });
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

  // Invoices contain another user's id and price, so they must be owner-only
  // (the old route was public and IDs are sequential, so anyone could enumerate them).
  app.get('/api/invoice/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
      const subscription = await storage.getSubscription(id);
      if (!subscription || subscription.userId !== req.user.id) return res.status(404).json({ error: 'not found' });
      res.json({ userId: subscription.userId, mode: subscription.mode, tradeType: subscription.tradeType, tradesPerDay: subscription.tradesPerDay, duration: subscription.duration, start: new Date(subscription.startTs * 1000).toISOString(), end: new Date(subscription.endTs * 1000).toISOString(), price: subscription.price });
    } catch (error) {
      res.status(500).json({ message: "Error fetching invoice" });
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
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
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
