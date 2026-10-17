// ══════════════════════════════════════════════════════════════════════════════
// predictionHistoryService.ts
// Service for fetching and enriching prediction history with analytics data
// ══════════════════════════════════════════════════════════════════════════════

import { db } from "./db";
import { predictions, feedback } from "@shared/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import { parseSnapshot } from "./learningService";

// ai_learning holds a JSON learning snapshot for new predictions (and free text for old ones).
// Turn the snapshot into a readable sentence for the analytics page.
function describeLearning(raw: string | null): string | null {
  if (!raw) return null;
  const snap = parseSnapshot(raw);
  if (!snap) return raw;
  const base = `Final call: ${snap.finalDirection} (${snap.confidence}% confidence). Statistics said ${snap.statsDirection ?? "n/a"}, astrology said ${snap.astroDirection ?? "n/a"}. Weighting used: ${snap.weights.statistical}% statistics / ${snap.weights.astrological}% astrology.`;
  const o = snap.outcome;
  if (!o) return `${base} Waiting to be scored against the real price.`;
  const ok = (b: boolean | null) => (b === null ? "n/a" : b ? "right" : "wrong");
  return `${base} Actual move: ${o.changePct}% (${o.actualDirection}). Final call ${ok(o.finalCorrect)}; statistics ${ok(o.statsCorrect)}; astrology ${ok(o.astroCorrect)}.`;
}

interface PredictionAnalytics {
  id: number;
  stock: string;
  stockName: string;
  isCrypto: boolean;
  
  // Price data
  currentPrice: number;
  predictedLow: number;
  predictedHigh: number;
  predictedMid: number;
  actualPrice: number | null;
  deviation: number | null;
  
  // Accuracy
  confidence: number;
  accuracyScore: number | null;
  isAccurate: boolean | null;
  
  // Dates
  predictionDate: string;
  targetDate: string | null;
  daysAhead: number | null;
  
  // Analysis
  statisticalReasoning: string | null;
  astroReasoning: string | null;
  planetaryData: any | null;
  
  // Learning
  aiLearning: string | null;
  feedbackUseful: boolean | null;
  
  // Metadata
  mode: string;
  riskLevel: string;
  isActive: boolean;
}

export class PredictionHistoryService {
  
  /**
   * Get all predictions for a user with enriched analytics data
   */
  async getUserPredictionHistory(userId: string, limit: number = 100): Promise<PredictionAnalytics[]> {
    try {
      // Fetch user predictions with latest first
      const userPredictions = await db
        .select()
        .from(predictions)
        .where(eq(predictions.userId, userId))
        .orderBy(desc(predictions.createdAt))
        .limit(limit);

      // Fetch all feedback for matching
      const userFeedback = await db
        .select()
        .from(feedback)
        .where(eq(feedback.userId, userId));

      // Build feedback map for quick lookup
      const feedbackMap = new Map<string, typeof userFeedback>();
      for (const f of userFeedback) {
        const key = `${f.stock}_${f.requestedTime}`;
        if (!feedbackMap.has(key)) {
          feedbackMap.set(key, []);
        }
        feedbackMap.get(key)!.push(f);
      }

      // Enrich each prediction with analytics data
      const enrichedPredictions: PredictionAnalytics[] = [];

      for (const pred of userPredictions) {
        const isCrypto = pred.stock.startsWith('CRYPTO_');
        const stockSymbol = isCrypto ? pred.stock.replace('CRYPTO_', '') : pred.stock;
        
        // Calculate predicted mid-point
        const predictedMid = (pred.predLow + pred.predHigh) / 2;
        
        // Find matching feedback
        const predTime = pred.createdAt ? pred.createdAt.toISOString() : '';
        const targetTime = pred.targetDate ? pred.targetDate.toISOString() : '';
        const feedbackKey = `${pred.stock}_${targetTime}`;
        const matchedFeedback = feedbackMap.get(feedbackKey)?.[0];
        
        // Use stored actualPrice or feedback actualPrice
        const actualPrice = pred.actualPrice ?? matchedFeedback?.actualPrice ?? null;
        
        // Calculate deviation if we have actual price
        let deviation: number | null = null;
        let accuracyScore: number | null = null;
        let isAccurate: boolean | null = null;
        
        if (actualPrice !== null) {
          // Deviation as percentage from predicted mid
          deviation = pred.deviation ?? ((actualPrice - predictedMid) / predictedMid) * 100;
          
          // Accuracy score (0-100)
          const withinRange = actualPrice >= pred.predLow && actualPrice <= pred.predHigh;
          if (withinRange) {
            // Perfect if within range
            const rangeWidth = pred.predHigh - pred.predLow;
            const distanceFromMid = Math.abs(actualPrice - predictedMid);
            accuracyScore = Math.round(100 - (distanceFromMid / rangeWidth) * 50);
          } else {
            // Partial credit based on how close
            const errorPercent = Math.abs(deviation);
            accuracyScore = Math.max(0, Math.round(60 - errorPercent * 2));
          }
          
          isAccurate = accuracyScore >= 60;
        }
        
        // Calculate days ahead
        let daysAhead: number | null = null;
        if (pred.createdAt && pred.targetDate) {
          const diffMs = pred.targetDate.getTime() - pred.createdAt.getTime();
          daysAhead = Math.round(diffMs / (1000 * 60 * 60 * 24));
        }
        
        enrichedPredictions.push({
          id: pred.id,
          stock: stockSymbol,
          stockName: this.getStockName(stockSymbol, isCrypto),
          isCrypto,
          
          currentPrice: pred.currentPrice,
          predictedLow: pred.predLow,
          predictedHigh: pred.predHigh,
          predictedMid,
          actualPrice,
          deviation,
          
          confidence: pred.confidence,
          accuracyScore,
          isAccurate,
          
          predictionDate: pred.createdAt ? pred.createdAt.toISOString() : new Date().toISOString(),
          targetDate: pred.targetDate ? pred.targetDate.toISOString() : null,
          daysAhead,
          
          statisticalReasoning: pred.statisticalReasoning || null,
          astroReasoning: pred.astroReasoning || null,
          planetaryData: pred.planetaryData || null,
          
          aiLearning: describeLearning(pred.aiLearning as string | null),
          feedbackUseful: matchedFeedback ? matchedFeedback.useful === 1 : null,
          
          mode: pred.mode,
          riskLevel: pred.riskLevel,
          isActive: pred.isActive ?? true,
        });
      }

      return enrichedPredictions;
    } catch (error) {
      console.error('[PredictionHistory] Error fetching history:', error);
      throw error;
    }
  }

  /**
   * Get statistics for user's predictions
   */
  async getUserPredictionStats(userId: string) {
    try {
      const allPredictions = await this.getUserPredictionHistory(userId, 1000);
      
      const total = allPredictions.length;
      const withActualPrice = allPredictions.filter(p => p.actualPrice !== null);
      const accurate = withActualPrice.filter(p => p.isAccurate === true);
      const inaccurate = withActualPrice.filter(p => p.isAccurate === false);
      
      const avgAccuracy = withActualPrice.length > 0
        ? withActualPrice.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / withActualPrice.length
        : 0;
      
      const avgDeviation = withActualPrice.length > 0
        ? withActualPrice.reduce((sum, p) => sum + Math.abs(p.deviation || 0), 0) / withActualPrice.length
        : 0;
      
      // Group by stock
      const byStock = new Map<string, typeof allPredictions>();
      for (const pred of allPredictions) {
        if (!byStock.has(pred.stock)) {
          byStock.set(pred.stock, []);
        }
        byStock.get(pred.stock)!.push(pred);
      }
      
      // Find best and worst performing stocks
      const stockStats: Array<{stock: string; accuracy: number; count: number}> = [];
      for (const [stock, preds] of byStock.entries()) {
        const measured = preds.filter(p => p.accuracyScore !== null);
        if (measured.length >= 2) {
          const avgAcc = measured.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / measured.length;
          stockStats.push({ stock, accuracy: avgAcc, count: measured.length });
        }
      }
      stockStats.sort((a, b) => b.accuracy - a.accuracy);
      
      return {
        totalPredictions: total,
        measuredPredictions: withActualPrice.length,
        accuratePredictions: accurate.length,
        inaccuratePredictions: inaccurate.length,
        accuracyRate: withActualPrice.length > 0 ? (accurate.length / withActualPrice.length) * 100 : 0,
        avgAccuracy: Math.round(avgAccuracy * 10) / 10,
        avgDeviation: Math.round(avgDeviation * 100) / 100,
        bestPerformingStock: stockStats[0] || null,
        worstPerformingStock: stockStats[stockStats.length - 1] || null,
      };
    } catch (error) {
      console.error('[PredictionHistory] Error calculating stats:', error);
      throw error;
    }
  }

  /**
   * Get a single prediction with full details
   */
  async getPredictionDetails(predictionId: number, userId: string): Promise<PredictionAnalytics | null> {
    try {
      const [pred] = await db
        .select()
        .from(predictions)
        .where(
          and(
            eq(predictions.id, predictionId),
            eq(predictions.userId, userId)
          )
        );

      if (!pred) return null;

      const history = await this.getUserPredictionHistory(userId, 1000);
      return history.find(p => p.id === predictionId) || null;
    } catch (error) {
      console.error('[PredictionHistory] Error fetching prediction details:', error);
      return null;
    }
  }

  /**
   * Helper: Get display name for stock
   */
  private getStockName(symbol: string, isCrypto: boolean): string {
    if (isCrypto) {
      const cryptoNames: Record<string, string> = {
        'BTC': 'Bitcoin',
        'ETH': 'Ethereum',
        'BNB': 'Binance Coin',
        'XRP': 'Ripple',
        'ADA': 'Cardano',
        'DOGE': 'Dogecoin',
        'SOL': 'Solana',
        'DOT': 'Polkadot',
        'MATIC': 'Polygon',
        'LTC': 'Litecoin',
      };
      return cryptoNames[symbol] || symbol;
    }
    
    const stockNames: Record<string, string> = {
      'TCS': 'Tata Consultancy Services',
      'INFY': 'Infosys',
      'WIPRO': 'Wipro',
      'HDFCBANK': 'HDFC Bank',
      'ICICIBANK': 'ICICI Bank',
      'SBIN': 'State Bank of India',
      'RELIANCE': 'Reliance Industries',
      'TATAMOTORS': 'Tata Motors',
      'MARUTI': 'Maruti Suzuki',
      'AXISBANK': 'Axis Bank',
    };
    return stockNames[symbol] || symbol;
  }
}

export const predictionHistoryService = new PredictionHistoryService();
