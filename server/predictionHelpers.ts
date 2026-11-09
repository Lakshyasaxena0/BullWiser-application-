// Shared by the user prediction routes and the automatic practice job, so both build predictions the same way.
import { astrologyService } from "./astrologyService";
import { vixRangeFactors } from "./evidenceRules";

/** Keep the stored learning snapshot identical to what the user was shown (the guard may have lowered confidence / downgraded the call). */
export function syncSnapshot(snapshot: any, direction: string, confidence: number): any {
  if (!snapshot) return snapshot;
  try { const o = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot; o.finalDirection = direction; o.confidence = Math.round(confidence); return typeof snapshot === 'string' ? JSON.stringify(o) : o; }
  catch { return snapshot; }
}

/** Planetary snapshot stored with each prediction (shared by every prediction route). */
export async function buildPlanetaryData(whenDate: Date): Promise<any | null> {
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

/**
 * Price range for a prediction, based on the asset's own behaviour instead of a fixed percentage:
 *   1. stocks with 20-year history: the historical p10–p90 of same-horizon moves after similar setups (skewed, centred on the typical move)
 *   2. otherwise: ±1.28σ from the asset's recent daily volatility
 *   3. otherwise: the old fixed time-scaled percentage
 * `rangeScale` is the learned calibration (from how often real prices landed inside past ranges); riskLevel widens/narrows it.
 */
export function computePriceRange(currentPrice: number, enhanced: any, riskMultiplier: number, riskLevel?: string): { low: number; high: number } {
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
  // Nervous market (India VIX) → wider range, extra room on the downside (volatility rises most when prices fall)
  const vf = vixRangeFactors(enhanced?.marketContext?.vixRegime);
  if (vf.widen !== 1 || vf.downExtra > 0) {
    const centre = (low + high) / 2, hl = centre - low, hh = high - centre;
    low = centre - hl * vf.widen * (1 + vf.downExtra); high = centre + hh * vf.widen;
  }
  low = Math.max(currentPrice * 0.01, low);
  if (high <= low) high = low * 1.001;
  return { low: r2(low), high: r2(high) };
}

// ★ Helper: Calculate time-scaled risk multiplier
export function getTimeScaledRiskMultiplier(targetDate: Date, riskLevel: string, isStock: boolean = true): number {
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

