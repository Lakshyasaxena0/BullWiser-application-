// ─────────────────────────────────────────────────────────────────────────────
// astrologyService.ts — Vedic astrology for market prediction.
// Real planetary positions (astronomy-engine, sidereal Lahiri), real panchang,
// sunrise-based hora / rahu kaal, and the full interpretation layer in ./vedic/.
// ─────────────────────────────────────────────────────────────────────────────
import { siderealPositions, panchang, dayParts, hhmmIST, MUMBAI } from './vedic/ephemeris';
import { analyzeSky, assetView, sectorOutlook, AssetVedicView, SkyAnalysis } from './vedic/analysis';

interface PlanetaryPosition {
  planet: string;
  sign: string;
  degree: number;
  retrograde: boolean;
  house?: number;
  dignity?: string;
  combust?: boolean;
  mrituBhaga?: boolean;
  nakshatra?: string;
}

interface MuhuratWindow {
  start: string;
  end: string;
  quality: 'excellent' | 'good' | 'average' | 'poor';
}

interface AstrologyData {
  hora: string;
  tithi: string;
  nakshatra: string;
  yoga: string;
  karana: string;
  lunarPhase: string;
  lunarIllumination: number;
  planetaryPositions: PlanetaryPosition[];
  muhuratWindows: MuhuratWindow[];
  rahuKalamStart: string;
  rahuKalamEnd: string;
  gulikaKalamStart: string;
  gulikaKalamEnd: string;
  yamghantaKalamStart: string;
  yamghantaKalamEnd: string;
  sunrise?: string;
  sunset?: string;
  paksha?: string;
  lagna?: string;
  aspects?: { from: string; to: string; kind: string }[];
  exchanges?: string[];
  karakas?: { atmakaraka: string; amatyakaraka: string; darakaraka: string };
  sectorOutlook?: { sector: string; score: number }[];
  source: 'calculated';
}

interface AstrologyPrediction {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  confidence: number;
  factors: {
    hora: number;
    tithi: number;
    nakshatra: number;
    planetary: number;
    muhurat: number;
    rahuKetu: number;
    vedic: number;
  };
  recommendation: string;
  warnings: string[];
  vedic?: AssetVedicView;
}

const CRYPTO_SYMBOLS = new Set(['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','MATIC','DOT','LTC','LINK','AVAX','USDT','TRX']);

export class AstrologyService {
  private readonly planetaryStrengths: Record<string, { bullish: number; volatility: number }> = {
    Sun:     { bullish: 0.7, volatility: 0.3 },
    Moon:    { bullish: 0.5, volatility: 0.8 },
    Mars:    { bullish: 0.6, volatility: 0.9 },
    Mercury: { bullish: 0.6, volatility: 0.4 },
    Jupiter: { bullish: 0.9, volatility: 0.2 },
    Venus:   { bullish: 0.8, volatility: 0.3 },
    Saturn:  { bullish: 0.3, volatility: 0.6 },
    Rahu:    { bullish: 0.4, volatility: 0.95 },
    Ketu:    { bullish: 0.3, volatility: 0.9 },
  };

  private readonly nakshatraQualities: Record<string, number> = {
    Ashwini: 0.8, Bharani: 0.4, Krittika: 0.6, Rohini: 0.9,
    Mrigashira: 0.7, Ardra: 0.3, Punarvasu: 0.8, Pushya: 0.95,
    Ashlesha: 0.2, Magha: 0.7, 'Purva Phalguni': 0.6, 'Uttara Phalguni': 0.8,
    Hasta: 0.85, Chitra: 0.6, Swati: 0.7, Vishakha: 0.5,
    Anuradha: 0.8, Jyeshtha: 0.3, Mula: 0.2, 'Purva Ashadha': 0.6,
    'Uttara Ashadha': 0.8, Shravana: 0.9, Dhanishta: 0.7, Shatabhisha: 0.5,
    'Purva Bhadrapada': 0.4, 'Uttara Bhadrapada': 0.7, Revati: 0.85,
  };

  // ── Main: real-time astrology data ────────────────────────────────────────
  async getCurrentAstrology(date?: Date, location?: { lat: number; lng: number }): Promise<AstrologyData> {
    const d = date || new Date();
    const loc = location ?? MUMBAI;
    const pc = panchang(d);
    const dp = dayParts(d, loc);
    const sky = analyzeSky(d, loc);
    const fmt = (r: [Date, Date]) => ({ start: hhmmIST(r[0]), end: hhmmIST(r[1]) });
    const rahu = fmt(dp.rahuKalam), gulika = fmt(dp.gulikaKalam), yama = fmt(dp.yamagandaKalam);
    const abhijit = fmt(dp.abhijit), brahma = fmt(dp.brahma);

    return {
      hora: dp.hora, tithi: pc.tithi, paksha: pc.paksha, nakshatra: pc.nakshatra, yoga: pc.yoga, karana: pc.karana,
      lunarPhase: pc.lunarPhase, lunarIllumination: pc.lunarIllumination,
      planetaryPositions: this.positionsFrom(sky),
      muhuratWindows: [
        { ...abhijit, quality: 'excellent' },
        { ...brahma, quality: 'good' },
      ],
      rahuKalamStart: rahu.start, rahuKalamEnd: rahu.end,
      gulikaKalamStart: gulika.start, gulikaKalamEnd: gulika.end,
      yamghantaKalamStart: yama.start, yamghantaKalamEnd: yama.end,
      sunrise: hhmmIST(dp.sunrise), sunset: hhmmIST(dp.sunset), lagna: sky.lagnaSign,
      aspects: sky.aspects.map(a => ({ from: a.from, to: a.to, kind: a.kind })),
      exchanges: sky.exchanges.map(e => e.note),
      karakas: { atmakaraka: sky.karaka.atmakaraka, amatyakaraka: sky.karaka.amatyakaraka, darakaraka: sky.karaka.darakaraka },
      sectorOutlook: sectorOutlook(sky).map(s => ({ sector: s.sector, score: s.score })),
      source: 'calculated',
    };
  }

  private positionsFrom(sky: SkyAnalysis): PlanetaryPosition[] {
    return Object.values(sky.planets).map(p => ({
      planet: p.planet, sign: p.sign, degree: p.degree, retrograde: p.retrograde, house: p.house,
      dignity: p.dignity, combust: p.combust, mrituBhaga: p.mrituBhaga, nakshatra: p.nakshatra,
    }));
  }

  async getDrikpanchangData(date: Date, location?: { lat: number; lng: number }): Promise<AstrologyData | null> {
    return this.getCurrentAstrology(date, location);
  }

  // ── Prediction engine ─────────────────────────────────────────────────────
  async generateAstroPrediction(symbol: string, date: Date, currentPrice: number, assetType?: 'stock' | 'crypto'): Promise<AstrologyPrediction> {
    const type = assetType ?? (CRYPTO_SYMBOLS.has(symbol.toUpperCase().replace(/[-_/]?(USD|USDT|INR)$/, '')) ? 'crypto' : 'stock');
    const astroData      = await this.getCurrentAstrology(date);
    const sky            = analyzeSky(date);
    const vedic          = assetView(sky, symbol, type);

    const horaScore      = this.calcHoraScore(astroData.hora);
    const tithiScore     = this.calcTithiScore(astroData.tithi, astroData.paksha);
    const nakshatraScore = this.calcNakshatraScore(astroData.nakshatra);
    const planetaryScore = this.calcPlanetaryScore(sky);
    const muhuratScore   = this.calcMuhuratScore(astroData.muhuratWindows, date);
    const rahuKetuScore  = this.calcRahuKetuScore(astroData, date);
    const vedicScore     = 50 + vedic.score * 50;

    const total =
      horaScore * 0.12 + tithiScore * 0.10 + nakshatraScore * 0.13 +
      planetaryScore * 0.15 + muhuratScore * 0.05 + rahuKetuScore * 0.05 + vedicScore * 0.40;

    const direction: 'bullish' | 'bearish' | 'neutral' =
      total > 58 ? 'bullish' : total < 42 ? 'bearish' : 'neutral';
    const confidence    = Math.min(90, Math.max(40, Math.abs(total - 50) * 2 + 40 + this.astroBonus(astroData)));
    const warnings      = this.buildWarnings(astroData, date, vedic);
    const recommendation = this.buildRecommendation(direction, total, astroData, warnings);

    return {
      direction, strength: total, confidence,
      factors: { hora: horaScore, tithi: tithiScore, nakshatra: nakshatraScore, planetary: planetaryScore, muhurat: muhuratScore, rahuKetu: rahuKetuScore, vedic: vedicScore },
      recommendation, warnings, vedic,
    };
  }

  combineAIAndAstroPredictions(aiPrediction: any, astroPrediction: AstrologyPrediction, feedbackAdjustment = 0, currentPrice = 0): any {
    if (!aiPrediction) {
      return {
        prediction: {
          direction:  astroPrediction.direction,
          confidence: astroPrediction.confidence,
          priceTarget: {
            low:  currentPrice > 0 ? Math.round(currentPrice * 0.975 * 100) / 100 : 0,
            high: currentPrice > 0 ? Math.round(currentPrice * 1.025 * 100) / 100 : 0,
          },
        },
        combinedConfidence:  astroPrediction.confidence,
        finalDirection:      astroPrediction.direction,
        astroRecommendation: astroPrediction.recommendation,
        warnings:            astroPrediction.warnings,
        astroFactors:        astroPrediction.factors,
        vedic:               astroPrediction.vedic,
        metadata: { aiEnabled: false, feedbackLearningApplied: false },
      };
    }

    const aiDir    = aiPrediction.prediction?.direction || 'neutral';
    const astroDir = astroPrediction.direction;
    const opposite = (aiDir === 'bullish' && astroDir === 'bearish') || (aiDir === 'bearish' && astroDir === 'bullish');

    if (opposite) {
      return {
        ...aiPrediction,
        prediction:         { ...aiPrediction.prediction, direction: astroDir, confidence: astroPrediction.confidence },
        astroOverride:      true,
        astroFactors:       astroPrediction.factors,
        vedic:              astroPrediction.vedic,
        combinedConfidence: astroPrediction.confidence,
        finalDirection:     astroDir,
        recommendation:     astroPrediction.recommendation,
        warnings:           astroPrediction.warnings,
      };
    }

    const combined = Math.round(
      (aiPrediction.prediction?.confidence || 60) * 0.4 +
      astroPrediction.confidence * 0.6 +
      feedbackAdjustment
    );
    return {
      ...aiPrediction,
      astroFactors:        astroPrediction.factors,
      vedic:               astroPrediction.vedic,
      astroDirection:      astroDir,
      astroStrength:       astroPrediction.strength,
      combinedConfidence:  Math.min(95, Math.max(30, combined)),
      astroRecommendation: astroPrediction.recommendation,
      warnings:            astroPrediction.warnings,
      finalDirection:      aiDir === astroDir ? aiDir : astroDir,
    };
  }

  // ── Scoring ───────────────────────────────────────────────────────────────
  private calcHoraScore(hora: string): number {
    const s = this.planetaryStrengths[hora];
    if (!s) return 50;
    return Math.max(0, Math.min(100, s.bullish * 100 - s.volatility * 10 + 5));
  }

  private calcTithiScore(tithi: string, paksha?: string): number {
    const good = ['Dwitiya','Tritiya','Panchami','Saptami','Dashami','Ekadashi','Trayodashi'];
    const bad  = ['Chaturthi','Shashthi','Ashtami','Navami','Chaturdashi','Amavasya'];
    let s = good.includes(tithi) ? 70 : bad.includes(tithi) ? 30 : 50;
    if (paksha === 'Shukla') s += 5; else if (paksha === 'Krishna') s -= 5;
    return s;
  }

  private calcNakshatraScore(n: string): number {
    return (this.nakshatraQualities[n] || 0.5) * 100;
  }

  /** Market-wide planetary strength from real dignity / retrograde / combustion / aspects. */
  private calcPlanetaryScore(sky: SkyAnalysis): number {
    const w: Record<string, number> = { Jupiter: 1.5, Venus: 1.2, Sun: 0.8, Moon: 1, Mercury: 1, Mars: 0.7, Saturn: 0.9, Rahu: 0.4, Ketu: 0.3 };
    let num = 0, den = 0;
    for (const [p, a] of Object.entries(sky.planets)) { num += a.strength * (w[p] ?? 1); den += (w[p] ?? 1); }
    const avg = den ? num / den : 0;
    return Math.max(0, Math.min(100, 50 + Math.tanh(avg / 2) * 50));
  }

  private calcMuhuratScore(windows: MuhuratWindow[], d: Date): number {
    const t = hhmmIST(d);
    for (const w of windows) {
      if (this.inRange(t, w.start, w.end))
        return w.quality === 'excellent' ? 80 : w.quality === 'good' ? 65 : w.quality === 'average' ? 50 : 30;
    }
    return 50;
  }

  private calcRahuKetuScore(a: AstrologyData, d: Date): number {
    const t = hhmmIST(d);
    if (this.inRange(t, a.rahuKalamStart, a.rahuKalamEnd))           return 25;
    if (this.inRange(t, a.gulikaKalamStart, a.gulikaKalamEnd))       return 35;
    if (this.inRange(t, a.yamghantaKalamStart, a.yamghantaKalamEnd)) return 40;
    return 50;
  }

  private inRange(cur: string, start: string, end: string): boolean {
    if (!cur || !start || !end) return false;
    const [ch, cm] = cur.split(':').map(Number);
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const c = ch * 60 + cm, s = sh * 60 + sm, e = eh * 60 + em;
    return c >= s && c <= e;
  }

  private astroBonus(a: AstrologyData): number {
    let b = 0;
    if (['Siddhi','Shubha','Brahma','Indra','Siddha','Saubhagya'].includes(a.yoga)) b += 8;
    if (['Vyatipata','Vaidhriti','Vyaghata','Atiganda'].includes(a.yoga)) b -= 5;
    if (a.lunarPhase === 'Full Moon' || a.lunarPhase === 'New Moon')    b += 3;
    return b;
  }

  private buildWarnings(a: AstrologyData, d: Date, v?: AssetVedicView): string[] {
    const t = hhmmIST(d);
    const w: string[] = [];
    if (this.inRange(t, a.rahuKalamStart, a.rahuKalamEnd))     w.push('High volatility window — Rahu Kalam active');
    if (this.inRange(t, a.gulikaKalamStart, a.gulikaKalamEnd)) w.push('Proceed with caution — Gulika Kalam active');
    if (a.lunarPhase === 'New Moon')  w.push('New Moon — market sentiment may be suppressed');
    if (a.lunarPhase === 'Full Moon') w.push('Full Moon — expect heightened market emotions');
    const retro = a.planetaryPositions.filter(p => p.retrograde);
    if (retro.length > 2) w.push(`${retro.length} planets retrograde (${retro.map(p => p.planet).join(', ')}) — expect reversals`);
    if (v?.highlights.combust.length)   w.push(`Combust: ${v.highlights.combust.join(', ')} — weakened results from these planets`);
    if (v?.highlights.mrituBhaga.length) w.push(`Mritu bhaga: ${v.highlights.mrituBhaga.join(', ')} — sensitive degree, sudden moves possible`);
    return w;
  }

  private buildRecommendation(dir: string, score: number, a: AstrologyData, warnings: string[]): string {
    let r = dir === 'bullish'
      ? score > 70 ? 'Strong supportive signal — planetary alignment favours upward movement'
                  : 'Moderately supportive — consider scaled entry with stop-loss'
      : dir === 'bearish'
      ? score < 30 ? 'Avoid new long positions — planetary alignment unfavourable'
                   : 'Mildly bearish — wait for a better entry point'
      : 'Mixed signals — market may consolidate, monitor closely';
    const good = a.muhuratWindows.find(w => w.quality === 'excellent' || w.quality === 'good');
    if (good) r += `. Abhijit/auspicious window: ${good.start}–${good.end} IST`;
    return r;
  }
}

export const astrologyService = new AstrologyService();
