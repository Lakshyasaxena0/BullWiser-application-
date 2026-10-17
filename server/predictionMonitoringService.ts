// ──────────────────────────────────────────────────────────────────────────────
// predictionMonitoringService.ts
// Automatic prediction monitoring and AI self-correction system
// 
// यह service:
// 1. Past predictions को track करती है
// 2. Target date पर actual price check करती है
// 3. Accuracy calculate करती है
// 4. AI model को retrain करती है
// ──────────────────────────────────────────────────────────────────────────────

import { db } from "./db";
import { predictions, feedback } from "@shared/schema";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { stockDataService } from "./stockDataService";
import { cryptoDataService } from "./cryptoDataService";
import { aiAstrologyTrainer } from "./aiAstrologyTrainer";
import { learningService, getProfile, parseSnapshot } from "./learningService";

interface PredictionResult {
  predictionId: number;
  symbol: string;
  predictionDate: Date;
  targetDate: Date;
  predictedLow: number;
  predictedHigh: number;
  actualPrice: number | null;
  accuracy: number | null;
  outcome: 'correct' | 'incorrect' | 'pending';
  errorMargin: number | null;
}

export class PredictionMonitoringService {
  
  // ── Monitor all predictions due today ─────────────────────────────────────
  async monitorDuePredictions(): Promise<void> {
    console.log('[Monitor] Starting prediction monitoring...');

    const now = new Date();

    try {
      // Everything that has reached its target time and is still active.
      // (The old "target date is today" window scored predictions hours BEFORE their
      // target time on the first cron run of the day, and never picked up anything
      // missed while the server was down.)
      const duePredictions = await db
        .select()
        .from(predictions)
        .where(
          and(
            lte(predictions.targetDate, now),
            eq(predictions.isActive, true)
          )
        )
        .orderBy(predictions.targetDate)
        .limit(100); // work through a backlog in batches so one run can't take hours

      console.log(`[Monitor] Found ${duePredictions.length} predictions due`);

      for (const pred of duePredictions) {
        await this.checkPredictionAccuracy(pred);
      }

      // Learn from what was just scored. The learned track record (statistics vs astrology
      // reliability, confidence calibration) is rebuilt from the scored outcomes and is used by the
      // very next prediction. (The old per-case Groq "retraining" saved nothing that predictions
      // ever read, and burned API quota, so it is no longer run from the cron job.)
      if (duePredictions.length > 0) {
        learningService.invalidateLearningCache();
        const p = await getProfile('*', 'General', 'stock');
        const c = await getProfile('*', 'Crypto', 'crypto');
        console.log(`[Monitor] Learned weights — stocks: ${p.weights.statistical}/${p.weights.astrological} (${p.samples.global} outcomes), crypto: ${c.weights.statistical}/${c.weights.astrological} (${c.samples.global} outcomes)`);
      }

    } catch (error) {
      console.error('[Monitor] Error monitoring predictions:', error);
    }
  }

  // ── Check accuracy of a single prediction ─────────────────────────────────
  async checkPredictionAccuracy(prediction: any): Promise<PredictionResult> {
    const symbol = prediction.stock.replace('CRYPTO_', '');
    const isCrypto = prediction.stock.startsWith('CRYPTO_');

    console.log(`[Monitor] Checking prediction for ${symbol}...`);

    try {
      // Fetch current/actual price
      let actualPrice: number | null = null;
      
      // Never let one slow data provider stall the whole run
      const withTimeout = <T>(p: Promise<T>) =>
        Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), 15_000))]);
      if (isCrypto) {
        const quote: any = await withTimeout(cryptoDataService.getCryptoQuote(symbol));
        actualPrice = quote?.lastPrice || null;
      } else {
        const quote: any = await withTimeout(stockDataService.getStockQuote(symbol, 'NSE'));
        actualPrice = quote?.lastPrice || null;
      }

      if (!actualPrice) {
        console.log(`[Monitor] Could not fetch price for ${symbol}`);
        return {
          predictionId: prediction.id,
          symbol,
          predictionDate: prediction.createdAt,
          targetDate: prediction.targetDate,
          predictedLow: prediction.predLow,
          predictedHigh: prediction.predHigh,
          actualPrice: null,
          accuracy: null,
          outcome: 'pending',
          errorMargin: null,
        };
      }

      // Calculate accuracy
      const predictedLow = prediction.predLow;
      const predictedHigh = prediction.predHigh;
      const predictedMid = (predictedLow + predictedHigh) / 2;
      
      // Check if actual price is within predicted range
      const withinRange = actualPrice >= predictedLow && actualPrice <= predictedHigh;
      
      // Calculate error margin
      const errorMargin = Math.abs(actualPrice - predictedMid);
      const errorPercent = (errorMargin / prediction.currentPrice) * 100;
      
      // Calculate accuracy score (0-100)
      let accuracy = 0;
      if (withinRange) {
        // Perfect prediction if within range
        const rangeWidth = predictedHigh - predictedLow;
        const distanceFromMid = Math.abs(actualPrice - predictedMid);
        accuracy = Math.round(100 - (distanceFromMid / rangeWidth) * 50);
      } else {
        // Partial credit based on how close it was
        accuracy = Math.max(0, Math.round(100 - errorPercent * 2));
      }

      const outcome = accuracy >= 70 ? 'correct' : 'incorrect';

      // Score the direction call and each source (statistics / astrology) against reality.
      // This is what the learning service reads to set the weights for future predictions.
      const scored = learningService.scoreOutcome(prediction, actualPrice);
      const useful = scored.finalCorrect !== null ? (scored.finalCorrect ? 1 : 0) : (accuracy >= 70 ? 1 : 0);

      await db.insert(feedback).values({
        userId: prediction.userId,
        stock: prediction.stock,
        requestedTime: prediction.targetDate.toISOString(),
        actualPrice,
        useful,
        submittedAt: Math.floor(Date.now() / 1000),
      });

      // Mark prediction as scored (inactive) and store the outcome
      await db
        .update(predictions)
        .set({
          isActive: false,
          actualPrice,
          deviation: scored.deviation,
          ...(scored.aiLearning ? { aiLearning: scored.aiLearning } : {}),
        })
        .where(eq(predictions.id, prediction.id));

      const snap = parseSnapshot(scored.aiLearning);
      if (snap?.outcome) {
        console.log(`[Monitor] ${symbol}: final ${snap.finalDirection} vs actual ${snap.outcome.actualDirection} (${snap.outcome.changePct}%) — stats ${snap.outcome.statsCorrect}, astro ${snap.outcome.astroCorrect}`);
      }

      console.log(`[Monitor] ${symbol}: Predicted ₹${predictedMid.toFixed(2)}, Actual ₹${actualPrice.toFixed(2)}, Accuracy ${accuracy}%`);

      return {
        predictionId: prediction.id,
        symbol,
        predictionDate: prediction.createdAt,
        targetDate: prediction.targetDate,
        predictedLow,
        predictedHigh,
        actualPrice,
        accuracy,
        outcome,
        errorMargin,
      };

    } catch (error) {
      console.error(`[Monitor] Error checking ${symbol}:`, error);
      return {
        predictionId: prediction.id,
        symbol,
        predictionDate: prediction.createdAt,
        targetDate: prediction.targetDate,
        predictedLow: prediction.predLow,
        predictedHigh: prediction.predHigh,
        actualPrice: null,
        accuracy: null,
        outcome: 'pending',
        errorMargin: null,
      };
    }
  }

  // ── Trigger AI retraining with latest feedback ────────────────────────────
  async triggerAIRetrain(): Promise<void> {
    console.log('[Monitor] Triggering AI retraining with new feedback...');

    try {
      // Get all predictions with feedback
      const allPredictions = await db.select().from(predictions).limit(500);
      const allFeedback = await db.select().from(feedback).limit(500);

      if (allPredictions.length < 10 || allFeedback.length < 5) {
        console.log('[Monitor] Not enough data to retrain yet');
        return;
      }

      // Build training cases
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

      const trainingCases: Array<{
        stockSymbol: string;
        sector: string;
        date: Date;
        actualDirection: 'bullish' | 'bearish' | 'neutral';
        actualReturn: number;
      }> = [];

      for (const pred of allPredictions) {
        const stockFeedbacks = feedbackByStock.get(pred.stock) || [];
        const matchedFeedback = stockFeedbacks.find(
          f => Math.abs(f.submittedAt - (pred.createdAt ? Math.floor(pred.createdAt.getTime() / 1000) : 0)) < 7 * 86400
        );

        if (!matchedFeedback?.actualPrice) continue;

        const actualChange = ((matchedFeedback.actualPrice - pred.currentPrice) / pred.currentPrice) * 100;
        const actualDirection: 'bullish' | 'bearish' | 'neutral' =
          actualChange > 1 ? 'bullish' : actualChange < -1 ? 'bearish' : 'neutral';

        const symbol = pred.stock.replace('CRYPTO_', '');
        trainingCases.push({
          stockSymbol: symbol,
          sector: SECTOR_MAP[symbol] || 'General',
          date: pred.createdAt || new Date(),
          actualDirection,
          actualReturn: actualChange,
        });
      }

      if (trainingCases.length < 5) {
        console.log('[Monitor] Only', trainingCases.length, 'training cases - need more');
        return;
      }

      // Train AI model
      console.log(`[Monitor] Training AI with ${trainingCases.length} cases...`);
      const result = await aiAstrologyTrainer.batchTrainOnHistoricalData(
        trainingCases,
        (progress) => console.log(`[Monitor] Training progress: ${progress}%`)
      );

      console.log(`[Monitor] Training complete! Overall accuracy: ${result.overallAccuracy.toFixed(1)}%`);
      
      // Log sector-wise accuracy
      for (const [sector, accuracy] of Object.entries(result.sectorAccuracies)) {
        console.log(`[Monitor] ${sector}: ${(accuracy as number).toFixed(1)}% accurate`);
      }

    } catch (error) {
      console.error('[Monitor] Error retraining AI:', error);
    }
  }

  // ── Get monitoring statistics ─────────────────────────────────────────────
  async getMonitoringStats(): Promise<{
    totalMonitored: number;
    correctPredictions: number;
    incorrectPredictions: number;
    avgAccuracy: number;
    bestPerformingSector: string;
    needsImprovement: string[];
  }> {
    try {
      const allFeedback = await db.select().from(feedback);
      
      if (allFeedback.length === 0) {
        return {
          totalMonitored: 0,
          correctPredictions: 0,
          incorrectPredictions: 0,
          avgAccuracy: 0,
          bestPerformingSector: 'N/A',
          needsImprovement: [],
        };
      }

      const correct = allFeedback.filter(f => f.useful === 1).length;
      const incorrect = allFeedback.length - correct;
      const avgAccuracy = Math.round((correct / allFeedback.length) * 100);

      // Calculate sector performance
      const sectorStats = new Map<string, { correct: number; total: number }>();
      
      for (const f of allFeedback) {
        const symbol = f.stock.replace('CRYPTO_', '');
        const sector = this.getSectorForSymbol(symbol);
        
        if (!sectorStats.has(sector)) {
          sectorStats.set(sector, { correct: 0, total: 0 });
        }
        
        const stats = sectorStats.get(sector)!;
        stats.total++;
        if (f.useful === 1) stats.correct++;
      }

      // Find best and worst sectors
      let bestSector = 'N/A';
      let bestAccuracy = 0;
      const needsImprovement: string[] = [];

      for (const [sector, stats] of sectorStats.entries()) {
        const accuracy = (stats.correct / stats.total) * 100;
        
        if (accuracy > bestAccuracy) {
          bestAccuracy = accuracy;
          bestSector = sector;
        }
        
        if (accuracy < 60 && stats.total >= 5) {
          needsImprovement.push(`${sector} (${accuracy.toFixed(0)}%)`);
        }
      }

      return {
        totalMonitored: allFeedback.length,
        correctPredictions: correct,
        incorrectPredictions: incorrect,
        avgAccuracy,
        bestPerformingSector: `${bestSector} (${bestAccuracy.toFixed(0)}%)`,
        needsImprovement,
      };

    } catch (error) {
      console.error('[Monitor] Error getting stats:', error);
      return {
        totalMonitored: 0,
        correctPredictions: 0,
        incorrectPredictions: 0,
        avgAccuracy: 0,
        bestPerformingSector: 'N/A',
        needsImprovement: [],
      };
    }
  }

  // ── Helper: Get sector for symbol ─────────────────────────────────────────
  private getSectorForSymbol(symbol: string): string {
    const SECTOR_MAP: Record<string, string> = {
      TCS: 'IT', INFY: 'IT', WIPRO: 'IT', HCLTECH: 'IT', TECHM: 'IT',
      HDFCBANK: 'Banking', ICICIBANK: 'Banking', SBIN: 'Banking', AXISBANK: 'Banking',
      KOTAKBANK: 'Banking', RELIANCE: 'Energy', ONGC: 'Energy', NTPC: 'Energy',
      SUNPHARMA: 'Pharma', DRREDDY: 'Pharma', CIPLA: 'Pharma',
      MARUTI: 'Auto', TATAMOTORS: 'Auto', TATASTEEL: 'Metals', JSWSTEEL: 'Metals',
    };
    return SECTOR_MAP[symbol] || 'General';
  }
}

export const predictionMonitoringService = new PredictionMonitoringService();


// ──────────────────────────────────────────────────────────────────────────────
// CRON JOB SETUP
// Add this to your server startup or use a cron service
// ──────────────────────────────────────────────────────────────────────────────

// Example: Run every day at midnight
// import cron from 'node-cron';
// 
// cron.schedule('0 0 * * *', async () => {
//   console.log('Running daily prediction monitoring...');
//   await predictionMonitoringService.monitorDuePredictions();
// });

// Example: Run every hour
// cron.schedule('0 * * * *', async () => {
//   await predictionMonitoringService.monitorDuePredictions();
// });
