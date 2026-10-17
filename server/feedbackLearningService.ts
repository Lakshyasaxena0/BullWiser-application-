import { db } from './db';
import { feedback, predictions } from '@shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

interface FeedbackMetrics {
  stockSymbol: string;
  averageAccuracy: number;
  totalFeedbacks: number;
  bullishAccuracy: number;
  bearishAccuracy: number;
  neutralAccuracy: number;
  astroAccuracy: number;
  aiAccuracy: number;
  timeOfDayPerformance: Record<string, number>;
  bestPerformingFactors: string[];
}

export interface LearningAdjustment {
  confidenceAdjustment: number;
  directionBias: 'bullish' | 'bearish' | 'neutral' | null;
  strengthMultiplier: number;
  suggestedFactors: string[];
}

export const NEUTRAL_LEARNING_ADJUSTMENT: LearningAdjustment = {
  confidenceAdjustment: 0,
  directionBias: null,
  strengthMultiplier: 1.0,
  suggestedFactors: [],
};

export class FeedbackLearningService {
  // Store user feedback and actual outcomes
  async recordFeedback(
    userId: string,
    predictionId: number,
    actualPrice: number,
    actualDirection: 'up' | 'down' | 'neutral',
    wasUseful: boolean,
    notes?: string
  ): Promise<void> {
    try {
      // Get the original prediction
      const [originalPrediction] = await db
        .select()
        .from(predictions)
        .where(eq(predictions.id, predictionId));

      if (!originalPrediction) {
        throw new Error('Prediction not found');
      }

      // Calculate accuracy
      const predictedMid = (originalPrediction.predLow + originalPrediction.predHigh) / 2;
      const actualChange = ((actualPrice - originalPrediction.currentPrice) / originalPrediction.currentPrice) * 100;
      const predictedChange = ((predictedMid - originalPrediction.currentPrice) / originalPrediction.currentPrice) * 100;
      
      const accuracy = 100 - Math.abs(actualChange - predictedChange);
      const directionCorrect = 
        (actualDirection === 'up' && predictedMid > originalPrediction.currentPrice) ||
        (actualDirection === 'down' && predictedMid < originalPrediction.currentPrice) ||
        (actualDirection === 'neutral' && Math.abs(predictedChange) < 1);

      // Store feedback
      await db.insert(feedback).values({
        userId,
        stock: originalPrediction.stock,
        requestedTime: originalPrediction.createdAt?.toISOString() || new Date().toISOString(),
        actualPrice,
        useful: wasUseful ? 1 : 0,
        submittedAt: Math.floor(Date.now() / 1000),
        // Store additional metrics in a JSON column if needed
      });

      console.log(`Feedback recorded: Stock ${originalPrediction.stock}, Accuracy: ${accuracy.toFixed(2)}%, Direction Correct: ${directionCorrect}`);
    } catch (error) {
      console.error('Error recording feedback:', error);
    }
  }

  // Analyze feedback to get learning adjustments
  async getLearningAdjustments(
    stockSymbol: string,
    userId?: string
  ): Promise<LearningAdjustment> {
    try {
      // Get recent feedback for this stock
      const recentFeedback = await db
        .select()
        .from(feedback)
        .where(
          and(
            eq(feedback.stock, stockSymbol),
            userId ? eq(feedback.userId, userId) : undefined,
            gte(feedback.submittedAt, Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60) // Last 30 days
          )
        );

      if (recentFeedback.length === 0) {
        return {
          confidenceAdjustment: 0,
          directionBias: null,
          strengthMultiplier: 1.0,
          suggestedFactors: []
        };
      }

      // Analyze usefulness rate
      const usefulCount = recentFeedback.filter(f => f.useful > 0).length;
      const usefulnessRate = usefulCount / recentFeedback.length;

      // Calculate confidence adjustment based on usefulness
      // Check the most severe band first — a rate below 0.2 is also below 0.4, so the
      // old order made the -20 branch unreachable.
      let confidenceAdjustment = 0;
      if (usefulnessRate > 0.8) {
        confidenceAdjustment = 10; // Boost confidence
      } else if (usefulnessRate > 0.6) {
        confidenceAdjustment = 5;
      } else if (usefulnessRate < 0.2) {
        confidenceAdjustment = -20;
      } else if (usefulnessRate < 0.4) {
        confidenceAdjustment = -10; // Reduce confidence
      }

      // Analyze price patterns from feedback
      const priceAccuracies = recentFeedback
        .filter(f => f.actualPrice !== null)
        .map(f => {
          // This is simplified - in production you'd compare with stored prediction data
          return f.actualPrice || 0;
        });

      // Determine if we're consistently over or under-predicting
      let directionBias: 'bullish' | 'bearish' | 'neutral' | null = null;
      let strengthMultiplier = 1.0;

      if (priceAccuracies.length > 5) {
        // Simplified bias detection
        const avgActual = priceAccuracies.reduce((a, b) => a + b, 0) / priceAccuracies.length;
        // You would compare this with predicted prices stored in the predictions table
        
        // Adjust strength based on historical performance
        if (usefulnessRate > 0.7) {
          strengthMultiplier = 1.1; // Increase prediction strength
        } else if (usefulnessRate < 0.3) {
          strengthMultiplier = 0.9; // Reduce prediction strength
        }
      }

      // Suggest factors based on feedback patterns
      const suggestedFactors: string[] = [];
      
      // Time-based analysis
      const feedbackByHour = this.groupFeedbackByHour(recentFeedback);
      const bestHours = Object.entries(feedbackByHour)
        .filter(([_, useful]) => useful > 0.7)
        .map(([hour]) => hour);

      if (bestHours.length > 0) {
        suggestedFactors.push(`Best prediction accuracy during hours: ${bestHours.join(', ')}`);
      }

      // Add more sophisticated analysis based on your needs
      if (usefulnessRate > 0.8) {
        suggestedFactors.push('Current prediction model performing well for this stock');
      } else if (usefulnessRate < 0.4) {
        suggestedFactors.push('Consider adjusting model parameters for this stock');
      }

      return {
        confidenceAdjustment,
        directionBias,
        strengthMultiplier,
        suggestedFactors
      };
    } catch (error) {
      console.error('Error getting learning adjustments:', error);
      return {
        confidenceAdjustment: 0,
        directionBias: null,
        strengthMultiplier: 1.0,
        suggestedFactors: []
      };
    }
  }

  // Get comprehensive metrics for a stock based on feedback
  async getStockMetrics(stockSymbol: string): Promise<FeedbackMetrics> {
    try {
      const allFeedback = await db
        .select()
        .from(feedback)
        .where(eq(feedback.stock, stockSymbol));

      const totalFeedbacks = allFeedback.length;
      
      if (totalFeedbacks === 0) {
        return {
          stockSymbol,
          averageAccuracy: 50,
          totalFeedbacks: 0,
          bullishAccuracy: 50,
          bearishAccuracy: 50,
          neutralAccuracy: 50,
          astroAccuracy: 50,
          aiAccuracy: 50,
          timeOfDayPerformance: {},
          bestPerformingFactors: []
        };
      }

      // Calculate average accuracy
      const usefulFeedbacks = allFeedback.filter(f => f.useful > 0).length;
      const averageAccuracy = (usefulFeedbacks / totalFeedbacks) * 100;

      // Group by time of day
      const timeOfDayPerformance = this.groupFeedbackByHour(allFeedback);

      // Identify best performing factors
      const bestPerformingFactors: string[] = [];
      
      if (averageAccuracy > 70) {
        bestPerformingFactors.push('Overall high accuracy');
      }

      // Find best performing hours
      const bestHour = Object.entries(timeOfDayPerformance)
        .sort(([, a], [, b]) => b - a)[0];
      
      if (bestHour && bestHour[1] > 0.7) {
        bestPerformingFactors.push(`Peak accuracy at hour ${bestHour[0]}`);
      }

      return {
        stockSymbol,
        averageAccuracy,
        totalFeedbacks,
        bullishAccuracy: this.calculateDirectionalAccuracy(allFeedback, 'bullish'),
        bearishAccuracy: this.calculateDirectionalAccuracy(allFeedback, 'bearish'),
        neutralAccuracy: this.calculateDirectionalAccuracy(allFeedback, 'neutral'),
        astroAccuracy: this.calculateMethodAccuracy(allFeedback, 'astro'),
        aiAccuracy: this.calculateMethodAccuracy(allFeedback, 'ai'),
        timeOfDayPerformance,
        bestPerformingFactors
      };
    } catch (error) {
      console.error('Error getting stock metrics:', error);
      return {
        stockSymbol,
        averageAccuracy: 50,
        totalFeedbacks: 0,
        bullishAccuracy: 50,
        bearishAccuracy: 50,
        neutralAccuracy: 50,
        astroAccuracy: 50,
        aiAccuracy: 50,
        timeOfDayPerformance: {},
        bestPerformingFactors: []
      };
    }
  }

  // Group feedback by hour of day
  private groupFeedbackByHour(feedbackList: any[]): Record<string, number> {
    const hourGroups: Record<string, { useful: number; total: number }> = {};
    
    feedbackList.forEach(f => {
      const date = new Date(f.requestedTime);
      const hour = date.getHours().toString();
      
      if (!hourGroups[hour]) {
        hourGroups[hour] = { useful: 0, total: 0 };
      }
      
      hourGroups[hour].total++;
      if (f.useful > 0) {
        hourGroups[hour].useful++;
      }
    });

    const performance: Record<string, number> = {};
    Object.entries(hourGroups).forEach(([hour, data]) => {
      performance[hour] = data.total > 0 ? data.useful / data.total : 0;
    });
    
    return performance;
  }

  // Calculate accuracy for specific prediction directions
  private calculateDirectionalAccuracy(feedbackList: any[], direction: string): number {
    // This is simplified - in production, you'd join with predictions table
    // to get the original prediction direction
    const relevant = feedbackList.filter(f => {
      // Filter by direction from stored prediction
      return true; // Placeholder
    });
    
    if (relevant.length === 0) return 50;
    
    const accurate = relevant.filter(f => f.useful > 0).length;
    return (accurate / relevant.length) * 100;
  }

  // Calculate accuracy for specific methods (AI vs Astro)
  private calculateMethodAccuracy(feedbackList: any[], method: string): number {
    // This would require storing the method used in the prediction
    // For now, return a placeholder
    const relevant = feedbackList.filter(f => {
      // Filter by method from stored prediction
      return true; // Placeholder
    });
    
    if (relevant.length === 0) return 50;
    
    const accurate = relevant.filter(f => f.useful > 0).length;
    return (accurate / relevant.length) * 100;
  }

  // Apply learned adjustments to a prediction
  applyLearningToPrediction(
    basePrediction: any,
    learningAdjustment: LearningAdjustment
  ): any {
    const adjusted = { ...basePrediction };
    
    // Apply confidence adjustment
    if (adjusted.confidence) {
      adjusted.confidence = Math.max(
        10,
        Math.min(95, adjusted.confidence + learningAdjustment.confidenceAdjustment)
      );
    }
    
    // Apply strength multiplier to price targets
    if (adjusted.predLow && adjusted.predHigh && learningAdjustment.strengthMultiplier !== 1.0) {
      const currentPrice = adjusted.currentPrice || 100;
      const lowDiff = adjusted.predLow - currentPrice;
      const highDiff = adjusted.predHigh - currentPrice;
      
      adjusted.predLow = currentPrice + (lowDiff * learningAdjustment.strengthMultiplier);
      adjusted.predHigh = currentPrice + (highDiff * learningAdjustment.strengthMultiplier);
    }
    
    // Add learning insights
    adjusted.learningInsights = {
      feedbackAdjusted: true,
      confidenceAdjustment: learningAdjustment.confidenceAdjustment,
      suggestedFactors: learningAdjustment.suggestedFactors,
      directionBias: learningAdjustment.directionBias
    };
    
    return adjusted;
  }

  // Get personalized adjustments for a specific user
  async getUserPersonalization(userId: string): Promise<{
    preferredStocks: string[];
    accuracyByStock: Record<string, number>;
    bestTimeToTrade: string[];
    personalizedConfidenceBoost: number;
  }> {
    try {
      const userFeedback = await db
        .select()
        .from(feedback)
        .where(eq(feedback.userId, userId));

      if (userFeedback.length === 0) {
        return {
          preferredStocks: [],
          accuracyByStock: {},
          bestTimeToTrade: [],
          personalizedConfidenceBoost: 0
        };
      }

      // Find preferred stocks (most feedback given)
      const stockCounts: Record<string, number> = {};
      const stockAccuracy: Record<string, number> = {};
      
      userFeedback.forEach(f => {
        if (!stockCounts[f.stock]) {
          stockCounts[f.stock] = 0;
          stockAccuracy[f.stock] = 0;
        }
        stockCounts[f.stock]++;
        if (f.useful > 0) {
          stockAccuracy[f.stock]++;
        }
      });

      // Calculate accuracy percentages
      Object.keys(stockAccuracy).forEach(stock => {
        stockAccuracy[stock] = (stockAccuracy[stock] / stockCounts[stock]) * 100;
      });

      // Get top 5 preferred stocks
      const preferredStocks = Object.entries(stockCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([stock]) => stock);

      // Find best time to trade
      const timePerformance = this.groupFeedbackByHour(userFeedback);
      const bestTimeToTrade = Object.entries(timePerformance)
        .filter(([, accuracy]) => accuracy > 0.6)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([hour]) => `${hour}:00`);

      // Calculate personalized confidence boost
      const overallAccuracy = userFeedback.filter(f => f.useful > 0).length / userFeedback.length;
      let personalizedConfidenceBoost = 0;
      
      if (overallAccuracy > 0.8) {
        personalizedConfidenceBoost = 15;
      } else if (overallAccuracy > 0.6) {
        personalizedConfidenceBoost = 10;
      } else if (overallAccuracy < 0.3) {
        personalizedConfidenceBoost = -10;
      }

      return {
        preferredStocks,
        accuracyByStock: stockAccuracy,
        bestTimeToTrade,
        personalizedConfidenceBoost
      };
    } catch (error) {
      console.error('Error getting user personalization:', error);
      return {
        preferredStocks: [],
        accuracyByStock: {},
        bestTimeToTrade: [],
        personalizedConfidenceBoost: 0
      };
    }
  }
}

export const feedbackLearningService = new FeedbackLearningService();
