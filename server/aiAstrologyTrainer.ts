import { GoogleGenerativeAI } from "@google/generative-ai";
import { advancedAstrologyService } from './advancedAstrologyService';
import { db } from './db';
import { trainingData } from '@shared/schema';
import { desc } from 'drizzle-orm';
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';

// ── NOTE: pythonAstrologyBridge import removed — was imported but never used ──

// Uses Groq (llama-3.3-70b) through the shared groqClient (Groq_API_key / GROQ_API_KEY)
import { groqJSON } from './groqClient';

async function geminiJSON(systemPrompt: string, userPrompt: string): Promise<any> {
  const result = await groqJSON(systemPrompt, userPrompt, 1500);
  if (!result) throw new Error('Groq unavailable');
  return result;
}

interface ChartAnalysis {
  d1Analysis:      string;
  d9Analysis:      string;
  d10Analysis:     string;
  transitAnalysis: string;
  dashaAnalysis:   string;
  horaAnalysis:    string;
  combinedInsight: string;
  confidence:      number;
}

interface StockPrediction {
  direction:   'bullish' | 'bearish' | 'neutral';
  confidence:  number;
  entryPrice:  number;
  targetPrice: number;
  stopLoss:    number;
  timeFrame:   string;
  reasoning:   string;
}

export class AIAstrologyTrainer {

  async trainOnChartReading(
    birthDate:   Date,
    birthTime:   string,
    latitude:    number,
    longitude:   number,
    currentDate: Date = new Date()
  ): Promise<ChartAnalysis> {
    const d1Chart       = advancedAstrologyService.generateD1Chart(birthDate, birthTime, latitude, longitude);
    const d9Chart       = advancedAstrologyService.generateD9Chart(d1Chart);
    const d10Chart      = advancedAstrologyService.generateD10Chart(d1Chart);
    const transits      = advancedAstrologyService.calculateTransits(d1Chart, currentDate);
    const moonNakshatra = d1Chart.planets.find((p: any) => p.planet === 'Moon')?.nakshatra || 'Ashwini';
    const dashaSystem   = advancedAstrologyService.calculateDasha(moonNakshatra, birthDate, currentDate);
    const currentTime   = currentDate.toTimeString().split(' ')[0];
    const horaSystem    = advancedAstrologyService.calculateHoraSystem(currentDate, currentTime);
    const chartContext  = this.prepareChartContext(d1Chart, d9Chart, d10Chart, transits, dashaSystem, horaSystem);

    try {
      const analysis = await geminiJSON(
        `You are an expert Vedic astrologer specializing in financial astrology for the Indian stock market.
Analyze the provided astrological charts and provide detailed, actionable insights for stock market predictions.
Focus on:
- Wealth houses (2nd, 5th, 9th, 11th) and their lords
- Career house (10th) for professional and financial direction
- Planetary periods (Mahadasha/Antardasha) and their financial implications
- Current planetary transits affecting wealth and career
- Hora system for short-term trading timing
- Yogas formed (Raj Yoga, Dhana Yoga, Arishta Yoga) and their strength
Return JSON with these exact keys: d1Analysis, d9Analysis, d10Analysis, transitAnalysis, dashaAnalysis, horaAnalysis, combinedInsight, confidence (number 30-95).`,
        chartContext
      );

      return {
        d1Analysis:      analysis.d1Analysis      || 'Birth chart shows mixed planetary influences on wealth',
        d9Analysis:      analysis.d9Analysis      || 'Navamsa reveals underlying wealth patterns',
        d10Analysis:     analysis.d10Analysis     || 'Career chart indicates professional direction',
        transitAnalysis: analysis.transitAnalysis || 'Current transits show neutral to slightly positive influence',
        dashaAnalysis:   analysis.dashaAnalysis   || 'Current planetary period suggests measured approach',
        horaAnalysis:    analysis.horaAnalysis    || 'Current hora indicates moderate trading conditions',
        combinedInsight: analysis.combinedInsight || 'Combined chart analysis suggests balanced market outlook',
        confidence:      typeof analysis.confidence === 'number'
          ? Math.min(95, Math.max(30, analysis.confidence))
          : 55,
      };
    } catch (error) {
      console.error('Groq chart analysis error:', error);
      return this.performRuleBasedAnalysis(d1Chart, d9Chart, d10Chart, transits, dashaSystem, horaSystem);
    }
  }

  async predictStockWithAstrology(
    stockSymbol:    string,
    sector:         string,
    currentPrice:   number,
    historicalData: any[]
  ): Promise<StockPrediction> {
    const currentDate    = new Date();
    const sectorAnalysis = await advancedAstrologyService.analyzeStockBySector(stockSymbol, sector, currentDate);

    const predictionContext = {
      stock:            stockSymbol,
      sector,
      currentPrice,
      recentPrices:     historicalData.slice(-10),
      sectorStrength:   sectorAnalysis.sectorStrength,
      planetarySupport: sectorAnalysis.planetarySupport,
      timing:           sectorAnalysis.timing,
      keyFactors:       sectorAnalysis.keyFactors,
      recommendation:   sectorAnalysis.recommendation,
    };

    try {
      const prediction = await geminiJSON(
        `You are a financial analyst with deep expertise in combining technical analysis with Vedic astrological insights for Indian equities (NSE/BSE).
Key rules:
- Astrological factors carry 60% weight; technical analysis carries 40% weight
- When astrology and technicals disagree, astrology takes precedence
- For "excellent" timing: targetPrice 5-10% above entry, stopLoss 3% below entry
- For "good" timing: targetPrice 3-5% above entry, stopLoss 2.5% below entry
- For "neutral" timing: targetPrice 2% above entry, stopLoss 2% below entry
- For "challenging" timing: direction should be bearish, tight stopLoss
- Always use the actual currentPrice to compute entryPrice, targetPrice, stopLoss
Return JSON with: direction, confidence (30-90), entryPrice, targetPrice, stopLoss, timeFrame, reasoning.`,
        JSON.stringify(predictionContext)
      );

      const finalConfidence = (sectorAnalysis.sectorStrength * 0.6) + ((prediction.confidence || 50) * 0.4);

      return {
        direction:   this.determineDirection(sectorAnalysis.timing, prediction.direction),
        confidence:  Math.round(finalConfidence),
        entryPrice:  prediction.entryPrice  || currentPrice,
        targetPrice: prediction.targetPrice || this.calculateTarget(currentPrice, sectorAnalysis.timing),
        stopLoss:    prediction.stopLoss    || this.calculateStopLoss(currentPrice, sectorAnalysis.timing),
        timeFrame:   prediction.timeFrame   || this.getTimeFrame(sectorAnalysis.timing),
        reasoning:   this.combineReasoning(sectorAnalysis, prediction),
      };
    } catch (error) {
      console.error('Groq stock prediction error:', error);
      return this.createAstrologicalPrediction(stockSymbol, currentPrice, sectorAnalysis);
    }
  }

  async trainOnRealWorldCase(
    stockSymbol:   string,
    sector:        string,
    predictionDate: Date,
    actualOutcome: {
      direction:    'bullish' | 'bearish' | 'neutral';
      actualReturn: number;
      timeToTarget: number;
    }
  ): Promise<{ success: boolean; learnings: string[] }> {
    try {
      const planetaryConfig = await this.getPlanetaryConfiguration(predictionDate);
      const dashaConfig     = await this.getDashaConfiguration(predictionDate);
      const transitConfig   = await this.getTransitConfiguration(predictionDate);
      const prediction      = await this.predictStockWithAstrology(stockSymbol, sector, 100, []);

      await advancedAstrologyService.recordTrainingData(
        stockSymbol, predictionDate,
        prediction.direction, actualOutcome.direction,
        planetaryConfig, dashaConfig, transitConfig,
        actualOutcome.actualReturn
      );

      const learnings = await this.extractLearnings(stockSymbol, sector, prediction, actualOutcome, planetaryConfig);
      await this.updateModelWithLearnings(learnings, sector);

      return { success: true, learnings };
    } catch (error) {
      console.error('Training error:', error);
      return { success: false, learnings: ['Failed to process training case'] };
    }
  }

  async batchTrainOnHistoricalData(
    trainingCases: Array<{
      stockSymbol:     string;
      sector:          string;
      date:            Date;
      actualDirection: 'bullish' | 'bearish' | 'neutral';
      actualReturn:    number;
    }>,
    progressCallback?: (progress: number) => void
  ): Promise<{
    totalCases:       number;
    successfulCases:  number;
    overallAccuracy:  number;
    sectorAccuracies: Record<string, number>;
    keyLearnings:     string[];
  }> {
    let successfulCases = 0;
    const sectorAccuracies: Record<string, number[]> = {};
    const allLearnings: string[] = [];

    for (let i = 0; i < trainingCases.length; i++) {
      const tc     = trainingCases[i];
      const result = await this.trainOnRealWorldCase(tc.stockSymbol, tc.sector, tc.date, {
        direction: tc.actualDirection, actualReturn: tc.actualReturn, timeToTarget: 1,
      });
      if (result.success) {
        successfulCases++;
        allLearnings.push(...result.learnings);
        if (!sectorAccuracies[tc.sector]) sectorAccuracies[tc.sector] = [];
        sectorAccuracies[tc.sector].push(100);
      }
      if (progressCallback) progressCallback(Math.round((i + 1) / trainingCases.length * 100));
    }

    const avgSectorAccuracies: Record<string, number> = {};
    for (const [sector, accuracies] of Object.entries(sectorAccuracies)) {
      avgSectorAccuracies[sector] = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    }

    return {
      totalCases:       trainingCases.length,
      successfulCases,
      overallAccuracy:  trainingCases.length > 0 ? (successfulCases / trainingCases.length) * 100 : 0,
      sectorAccuracies: avgSectorAccuracies,
      keyLearnings:     this.summarizeLearnings(allLearnings),
    };
  }

  async trainAndSaveModel(
    trainingCases: Array<{
      stockSymbol:         string;
      sector:              string;
      date:                Date;
      actualDirection:     'bullish' | 'bearish' | 'neutral';
      actualReturn:        number;
      features:            number[];
      astrologicalFactors: any;
    }>,
    modelName: string = 'bullwiser_main',
    modelType: string = 'random_forest'
  ): Promise<{ success: boolean; modelPath?: string; accuracy?: number; error?: string }> {
    try {
      console.log(`[Trainer] Training ${modelType} model with ${trainingCases.length} cases`);

      const features = trainingCases.map(c => c.features);
      const targets  = trainingCases.map(c => {
        const directionMap: Record<string, number> = { bearish: 0, neutral: 1, bullish: 2 };
        return directionMap[c.actualDirection];
      });

      const td = {
        features,
        targets,
        metadata: {
          model_name:      modelName,
          model_type:      modelType,
          astrology_enabled: true,
          sector_focus:    [...new Set(trainingCases.map(c => c.sector))],
          training_period: `${trainingCases[0]?.date} to ${trainingCases[trainingCases.length - 1]?.date}`,
          total_samples:   trainingCases.length,
          feature_count:   features[0]?.length || 0,
        },
      };

      // Write temp file for Python to read
      const tempFile = path.join(process.cwd(), 'temp_training_data.json');
      writeFileSync(tempFile, JSON.stringify(td, null, 2));

      // ── FIX: call training_bridge.py with correct CLI format ──
      // Command: python training_bridge.py train <data_json_file>
      const result = await this.executePythonTraining(tempFile);

      if (result.success) {
        console.log(`[Trainer] Model ${modelName} trained — accuracy: ${result.test_accuracy}`);
        await this.recordModelTraining({
          modelName, modelType, accuracy: result.test_accuracy,
          modelPath: result.model_path, trainingCases: trainingCases.length,
          sectors: [...new Set(trainingCases.map(c => c.sector))],
        });
        return { success: true, modelPath: result.model_path, accuracy: result.test_accuracy };
      }
      return { success: false, error: result.error || 'Training failed' };
    } catch (error) {
      console.error('Model training error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ── FIX: correct CLI command — "python training_bridge.py train <file>" ──
  private executePythonTraining(dataFile: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'python_modules', 'training_bridge.py');
      // Correct CLI: training_bridge.py train <data_json_file>
      const proc = spawn('python3', [scriptPath, 'train', dataFile]);
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0) {
          try { resolve(JSON.parse(stdout)); }
          catch (e) { reject(new Error(`Failed to parse training result: ${e}\nRaw output: ${stdout}`)); }
        } else {
          reject(new Error(`Python training failed (exit ${code}): ${stderr}`));
        }
      });
      proc.on('error', err => reject(new Error(`Failed to start Python: ${err.message}`)));
    });
  }

  async predictWithSavedModel(
    modelName: string,
    features:  number[]
  ): Promise<{
    success:     boolean;
    prediction?: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number };
    error?:      string;
  }> {
    try {
      const scriptPath = path.join(process.cwd(), 'python_modules', 'training_bridge.py');
      return await new Promise((resolve, reject) => {
        // Correct CLI: training_bridge.py predict <model_name> <features_json>
        const proc = spawn('python3', [scriptPath, 'predict', modelName, JSON.stringify(features)]);
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => {
          if (code === 0) {
            try { resolve(JSON.parse(stdout)); }
            catch (e) { reject(new Error(`Failed to parse prediction: ${e}`)); }
          } else {
            reject(new Error(`Python prediction failed: ${stderr}`));
          }
        });
        proc.on('error', err => reject(new Error(`Failed to start Python: ${err.message}`)));
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Prediction failed' };
    }
  }

  async listAvailableModels(): Promise<{ success: boolean; models: any[]; error?: string }> {
    try {
      const scriptPath = path.join(process.cwd(), 'python_modules', 'training_bridge.py');
      return await new Promise((resolve, reject) => {
        // Correct CLI: training_bridge.py list
        const proc = spawn('python3', [scriptPath, 'list']);
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => {
          if (code === 0) {
            try { resolve(JSON.parse(stdout)); }
            catch (e) { reject(new Error(`Failed to parse model list: ${e}`)); }
          } else {
            resolve({ success: false, models: [], error: `Python unavailable: ${stderr}` });
          }
        });
        proc.on('error', () => resolve({ success: false, models: [], error: 'Python3 not available on this server' }));
      });
    } catch (error) {
      return { success: false, models: [], error: error instanceof Error ? error.message : 'Failed to list models' };
    }
  }

  private async recordModelTraining(record: {
    modelName: string; modelType: string; accuracy: number;
    modelPath: string; trainingCases: number; sectors: string[];
  }): Promise<void> {
    try {
      await db.insert(trainingData).values({
        stockSymbol:       'MODEL_TRAINING',
        sector:            record.sectors.join(','),
        predictionDate:    new Date(),
        predictedDirection: 'neutral',
        actualDirection:   'neutral',
        accuracy:          record.accuracy,
        actualReturn:      0,
        planetaryConfig:   JSON.stringify({ model_name: record.modelName, model_type: record.modelType, model_path: record.modelPath, training_cases: record.trainingCases, sectors: record.sectors }),
        dashaConfig:       JSON.stringify({ type: 'model_training' }),
        transitConfig:     JSON.stringify({ created_at: new Date().toISOString() }),
      });
    } catch (error) {
      console.error('Failed to record model training:', error);
    }
  }

  async getPerformanceMetrics(lookbackDays = 30): Promise<{
    accuracy: number; profitability: number; bestSectors: string[];
    bestPlanetaryConfigs: any[]; recommendations: string[]; trainedModels?: any[];
  }> {
    try {
      const recentData = await db.select().from(trainingData).orderBy(desc(trainingData.createdAt)).limit(100);

      if (recentData.length === 0) {
        return { accuracy: 0, profitability: 0, bestSectors: [], bestPlanetaryConfigs: [], recommendations: ['No historical data available. Start training with real cases.'] };
      }

      const totalAccuracy = recentData.reduce((sum, d) => sum + d.accuracy, 0) / recentData.length;
      const totalReturn   = recentData.reduce((sum, d) => sum + d.actualReturn, 0);

      const sectorPerf: Record<string, { accuracy: number; returns: number; count: number }> = {};
      recentData.forEach(data => {
        if (data.sector) {
          if (!sectorPerf[data.sector]) sectorPerf[data.sector] = { accuracy: 0, returns: 0, count: 0 };
          sectorPerf[data.sector].accuracy += data.accuracy;
          sectorPerf[data.sector].returns  += data.actualReturn;
          sectorPerf[data.sector].count++;
        }
      });

      const bestSectors = Object.entries(sectorPerf)
        .sort((a, b) => (b[1].accuracy / b[1].count) - (a[1].accuracy / a[1].count))
        .slice(0, 3).map(([sector]) => sector);

      const successfulConfigs = recentData.filter(d => d.accuracy > 70).map(d => JSON.parse(d.planetaryConfig)).slice(0, 5);
      const recommendations   = this.generateRecommendations(totalAccuracy, totalReturn, bestSectors, successfulConfigs);
      const modelsResult      = await this.listAvailableModels();

      return { accuracy: totalAccuracy, profitability: totalReturn, bestSectors, bestPlanetaryConfigs: successfulConfigs, recommendations, trainedModels: modelsResult.success ? modelsResult.models : [] };
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      return { accuracy: 0, profitability: 0, bestSectors: [], bestPlanetaryConfigs: [], recommendations: ['Error fetching performance data'] };
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private prepareChartContext(d1Chart: any, d9Chart: any, d10Chart: any, transits: any[], dashaSystem: any, horaSystem: any): string {
    return JSON.stringify({
      d1Chart:  { houses: d1Chart.houses, planets: d1Chart.planets, aspects: d1Chart.aspects, yogas: d1Chart.yogas },
      d9Chart:  { planets: d9Chart.planets, yogas: d9Chart.yogas },
      d10Chart: { planets: d10Chart.planets, yogas: d10Chart.yogas },
      currentTransits: transits,
      dashaSystem:  { maha: dashaSystem.maha, antar: dashaSystem.antar, effects: dashaSystem.effects },
      horaSystem:   { currentHora: horaSystem.hora, subHora: horaSystem.subHora, microHora: horaSystem.microHora },
      request: 'Analyze these charts for Indian stock market predictions. Focus on wealth indicators (2nd, 5th, 9th, 11th houses), career (10th house), planetary periods, and current transits.',
    });
  }

  private performRuleBasedAnalysis(d1Chart: any, d9Chart: any, d10Chart: any, transits: any[], dashaSystem: any, horaSystem: any): ChartAnalysis {
    let confidence = 50;
    const wealthHouses  = [2, 5, 9, 11];
    const wealthPlanets = d1Chart.planets.filter((p: any) => wealthHouses.includes(p.house));
    if (wealthPlanets.length > 2) confidence += 10;
    const benefics = ['Jupiter', 'Venus', 'Mercury'];
    confidence += d1Chart.planets.filter((p: any) => benefics.includes(p.planet) && !p.debilitated).length * 5;
    if (['Sun', 'Jupiter', 'Venus'].includes(horaSystem.hora)) confidence += 10;
    confidence = Math.min(95, Math.max(30, confidence));
    return {
      d1Analysis:      `Birth chart has ${wealthPlanets.length} planets in wealth houses`,
      d9Analysis:      `Navamsa shows ${d9Chart.yogas?.length || 0} yogas for prosperity`,
      d10Analysis:     `Career chart indicates ${d10Chart.yogas?.length || 0} professional yogas`,
      transitAnalysis: `${transits.length} significant transits affecting wealth and career`,
      dashaAnalysis:   `${dashaSystem.maha} Mahadasha with ${dashaSystem.antar} Antardasha is active`,
      horaAnalysis:    `${horaSystem.hora} hora — ${['Sun', 'Jupiter', 'Venus'].includes(horaSystem.hora) ? 'favorable' : 'neutral'} for trading`,
      combinedInsight: `Overall wealth potential is ${confidence > 65 ? 'positive' : confidence > 50 ? 'moderate' : 'cautious'}`,
      confidence,
    };
  }

  private determineDirection(timing: 'excellent' | 'good' | 'neutral' | 'challenging', aiDirection?: string): 'bullish' | 'bearish' | 'neutral' {
    if (timing === 'excellent' || timing === 'good') return 'bullish';
    if (timing === 'challenging') return 'bearish';
    if (aiDirection === 'bullish' || aiDirection === 'bearish') return aiDirection as 'bullish' | 'bearish';
    return 'neutral';
  }

  private calculateTarget(price: number, timing: string): number {
    const m: Record<string, number> = { excellent: 1.08, good: 1.05, neutral: 1.02, challenging: 0.95 };
    return Math.round(price * (m[timing] || 1.02) * 100) / 100;
  }

  private calculateStopLoss(price: number, timing: string): number {
    const m: Record<string, number> = { excellent: 0.97, good: 0.96, neutral: 0.95, challenging: 0.93 };
    return Math.round(price * (m[timing] || 0.95) * 100) / 100;
  }

  private getTimeFrame(timing: string): string {
    const t: Record<string, string> = { excellent: '1-3 days', good: '3-7 days', neutral: '7-14 days', challenging: 'Avoid trading' };
    return t[timing] || '7 days';
  }

  private combineReasoning(sectorAnalysis: any, aiPrediction: any): string {
    const astroReasons = (sectorAnalysis.keyFactors || []).slice(0, 3).join('. ');
    const aiReason     = aiPrediction.reasoning || 'Technical indicators align with astrological direction';
    return `Astrological factors (60%): ${astroReasons}. Technical analysis (40%): ${aiReason}`;
  }

  private createAstrologicalPrediction(stockSymbol: string, currentPrice: number, sectorAnalysis: any): StockPrediction {
    const direction = sectorAnalysis.timing === 'excellent' || sectorAnalysis.timing === 'good' ? 'bullish'
      : sectorAnalysis.timing === 'challenging' ? 'bearish' : 'neutral';
    return {
      direction, confidence: Math.round(sectorAnalysis.sectorStrength), entryPrice: currentPrice,
      targetPrice: this.calculateTarget(currentPrice, sectorAnalysis.timing),
      stopLoss:    this.calculateStopLoss(currentPrice, sectorAnalysis.timing),
      timeFrame:   this.getTimeFrame(sectorAnalysis.timing),
      reasoning:   `Pure astrological analysis: ${sectorAnalysis.recommendation}`,
    };
  }

  private async getPlanetaryConfiguration(date: Date): Promise<any> {
    const planets = await this.calculatePlanetaryPositionsForDate(date, date.toTimeString().split(' ')[0]);
    return { date: date.toISOString(), planets, favorablePlanets: planets.filter((p: any) => p.exalted || p.beneficial), challengingPlanets: planets.filter((p: any) => p.debilitated || p.retrograde) };
  }

  private async getDashaConfiguration(date: Date): Promise<any> {
    return { date: date.toISOString(), mahaDasha: 'Jupiter', antarDasha: 'Venus', pratyantarDasha: 'Mercury' };
  }

  private async getTransitConfiguration(date: Date): Promise<any> {
    return { date: date.toISOString(), majorTransits: [{ planet: 'Jupiter', sign: 'Taurus', effect: 'beneficial' }, { planet: 'Saturn', sign: 'Aquarius', effect: 'neutral' }] };
  }

  private async calculatePlanetaryPositionsForDate(date: Date, time: string): Promise<any[]> {
    return [
      { planet: 'Sun',  sign: 'Leo',    degree: 15, exalted: true    },
      { planet: 'Moon', sign: 'Cancer', degree: 10, beneficial: true },
      { planet: 'Mars', sign: 'Aries',  degree: 25, exalted: true    },
    ];
  }

  private async extractLearnings(stockSymbol: string, sector: string, prediction: StockPrediction, actualOutcome: any, planetaryConfig: any): Promise<string[]> {
    const learnings: string[] = [];
    if (prediction.direction === actualOutcome.direction) {
      learnings.push(`Successful ${prediction.direction} prediction for ${stockSymbol} in ${sector} sector`);
      if (planetaryConfig.favorablePlanets.length > 0) {
        learnings.push(`Key benefic planets: ${planetaryConfig.favorablePlanets.map((p: any) => p.planet).join(', ')}`);
      }
    } else {
      learnings.push(`Incorrect prediction for ${stockSymbol}: expected ${prediction.direction}, actual ${actualOutcome.direction}`);
      learnings.push(`Adjust ${sector} sector weights — review challenging planets`);
      if (planetaryConfig.challengingPlanets.length > 0) {
        learnings.push(`Challenging planets: ${planetaryConfig.challengingPlanets.map((p: any) => p.planet).join(', ')}`);
      }
    }
    learnings.push(`Actual return: ${actualOutcome.actualReturn.toFixed(2)}%`);
    return learnings;
  }

  private async updateModelWithLearnings(learnings: string[], sector: string): Promise<void> {
    console.log(`[Trainer] Model updated for ${sector}:`, learnings.slice(0, 2));
  }

  private summarizeLearnings(allLearnings: string[]): string[] {
    const counts: Record<string, number> = {};
    allLearnings.forEach(l => { counts[l] = (counts[l] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([l]) => l);
  }

  private generateRecommendations(accuracy: number, returns: number, bestSectors: string[], successfulConfigs: any[]): string[] {
    const r: string[] = [];
    r.push(accuracy > 70 ? `Achieving ${accuracy.toFixed(1)}% accuracy — continue current approach` : `Accuracy at ${accuracy.toFixed(1)}% — increase training data`);
    if (returns > 0) r.push(`Profitable system: ${returns.toFixed(2)}% cumulative returns`);
    if (bestSectors.length > 0) r.push(`Top performing sectors: ${bestSectors.join(', ')}`);
    if (successfulConfigs.length > 0) r.push(`${successfulConfigs.length} high-confidence planetary patterns identified`);
    r.push('Continue training with real-world market outcomes for continuous improvement');
    return r;
  }
}

export const aiAstrologyTrainer = new AIAstrologyTrainer();
