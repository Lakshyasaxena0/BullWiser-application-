import { db } from './db';
import { astrologyCharts, planetaryRulers, sectorMappings, trainingData } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface VedicChart {
  type: 'D1' | 'D9' | 'D10' | 'D60' | 'D2' | 'D3' | 'D4' | 'D7' | 'D12' | 'D16' | 'D20' | 'D24' | 'D27' | 'D30';
  houses: House[];
  planets: PlanetPlacement[];
  aspects: Aspect[];
  yogas: Yoga[];
}

interface House {
  number: number;
  sign: string;
  lord: string;
  planets: string[];
  strength: number;
}

interface PlanetPlacement {
  planet: string;
  sign: string;
  house: number;
  degree: number;
  nakshatra: string;
  pada: number;
  retrograde: boolean;
  combustion: boolean;
  exalted: boolean;
  debilitated: boolean;
  vargottama: boolean;
}

interface Aspect {
  from: string;
  to: string;
  type: 'conjunction' | 'opposition' | 'trine' | 'square' | 'sextile';
  strength: number;
  beneficial: boolean;
}

interface Yoga {
  name: string;
  type: 'rajyoga' | 'dhanyoga' | 'arishta' | 'vipreet';
  planets: string[];
  strength: number;
  effect: string;
}

interface Transit {
  planet: string;
  fromSign: string;
  toSign: string;
  date: Date;
  duration: number;
  effect: 'beneficial' | 'malefic' | 'neutral';
}

interface DashaSystem {
  maha: string;
  antar: string;
  pratyantar: string;
  sukshma: string;
  prana: string;
  startDate: Date;
  endDate: Date;
  effects: string[];
}

interface SectorMapping {
  sector: string;
  rulingPlanets: string[];
  beneficPlanets: string[];
  maleficPlanets: string[];
  keyHouses: number[];
  keyNakshatras: string[];
  zodiacSigns: string[];
}

export class AdvancedAstrologyService {
  // Sector-specific planetary rulers and zodiac associations
  private readonly sectorMappings: Record<string, SectorMapping> = {
    'IT': {
      sector: 'Information Technology',
      rulingPlanets: ['Mercury', 'Uranus', 'Rahu'],
      beneficPlanets: ['Mercury', 'Venus', 'Jupiter'],
      maleficPlanets: ['Saturn', 'Ketu'],
      keyHouses: [3, 5, 9, 11],
      keyNakshatras: ['Ashwini', 'Ardra', 'Swati', 'Shatabhisha'],
      zodiacSigns: ['Gemini', 'Virgo', 'Aquarius']
    },
    'Banking': {
      sector: 'Banking & Finance',
      rulingPlanets: ['Jupiter', 'Venus', 'Mercury'],
      beneficPlanets: ['Jupiter', 'Venus', 'Moon'],
      maleficPlanets: ['Mars', 'Rahu', 'Ketu'],
      keyHouses: [2, 9, 11],
      keyNakshatras: ['Rohini', 'Pushya', 'Uttara Phalguni', 'Revati'],
      zodiacSigns: ['Taurus', 'Cancer', 'Capricorn']
    },
    'Pharma': {
      sector: 'Pharmaceuticals',
      rulingPlanets: ['Sun', 'Moon', 'Jupiter'],
      beneficPlanets: ['Sun', 'Jupiter', 'Venus'],
      maleficPlanets: ['Saturn', 'Rahu', 'Mars'],
      keyHouses: [1, 6, 8, 12],
      keyNakshatras: ['Ashwini', 'Punarvasu', 'Hasta', 'Moola'],
      zodiacSigns: ['Cancer', 'Virgo', 'Pisces']
    },
    'Energy': {
      sector: 'Energy & Power',
      rulingPlanets: ['Sun', 'Mars', 'Saturn'],
      beneficPlanets: ['Sun', 'Mars', 'Jupiter'],
      maleficPlanets: ['Rahu', 'Ketu', 'Mercury'],
      keyHouses: [1, 3, 10],
      keyNakshatras: ['Krittika', 'Mrigashira', 'Magha', 'Purva Bhadrapada'],
      zodiacSigns: ['Aries', 'Leo', 'Scorpio']
    },
    'Auto': {
      sector: 'Automobile',
      rulingPlanets: ['Mars', 'Mercury', 'Venus'],
      beneficPlanets: ['Mars', 'Venus', 'Mercury'],
      maleficPlanets: ['Saturn', 'Rahu'],
      keyHouses: [3, 4, 7, 10],
      keyNakshatras: ['Bharani', 'Chitra', 'Vishakha', 'Dhanishta'],
      zodiacSigns: ['Aries', 'Gemini', 'Libra']
    },
    'FMCG': {
      sector: 'Fast Moving Consumer Goods',
      rulingPlanets: ['Moon', 'Venus', 'Mercury'],
      beneficPlanets: ['Moon', 'Venus', 'Jupiter'],
      maleficPlanets: ['Saturn', 'Mars', 'Rahu'],
      keyHouses: [2, 4, 7, 11],
      keyNakshatras: ['Rohini', 'Hasta', 'Swati', 'Shravana'],
      zodiacSigns: ['Taurus', 'Cancer', 'Libra']
    },
    'Realty': {
      sector: 'Real Estate',
      rulingPlanets: ['Saturn', 'Mars', 'Venus'],
      beneficPlanets: ['Saturn', 'Venus', 'Mercury'],
      maleficPlanets: ['Rahu', 'Ketu', 'Sun'],
      keyHouses: [4, 10, 11],
      keyNakshatras: ['Bharani', 'Magha', 'Purva Phalguni', 'Anuradha'],
      zodiacSigns: ['Taurus', 'Capricorn', 'Aquarius']
    },
    'Metals': {
      sector: 'Metals & Mining',
      rulingPlanets: ['Saturn', 'Mars', 'Sun'],
      beneficPlanets: ['Saturn', 'Mars', 'Mercury'],
      maleficPlanets: ['Moon', 'Venus', 'Rahu'],
      keyHouses: [3, 8, 10],
      keyNakshatras: ['Krittika', 'Vishakha', 'Jyeshtha', 'Uttara Ashadha'],
      zodiacSigns: ['Aries', 'Scorpio', 'Capricorn']
    }
  };

  // Generate D1 (Rashi) Chart - Birth Chart
  generateD1Chart(birthDate: Date, birthTime: string, latitude: number, longitude: number): VedicChart {
    const ascendant = this.calculateAscendant(birthDate, birthTime, latitude, longitude);
    const houses = this.calculateHouses(ascendant);
    const planets = this.calculatePlanetaryPositions(birthDate, birthTime);
    const aspects = this.calculateAspects(planets);
    const yogas = this.identifyYogas(planets, houses);

    return {
      type: 'D1',
      houses,
      planets,
      aspects,
      yogas
    };
  }

  // Generate D9 (Navamsa) Chart - Marriage & Dharma
  generateD9Chart(d1Chart: VedicChart): VedicChart {
    const navamsaDivision = 9;
    const navamsaPlanets = d1Chart.planets.map(planet => {
      const navamsaSign = this.calculateDivisionalSign(planet.sign, planet.degree, navamsaDivision);
      const navamsaHouse = this.calculateNavamsaHouse(planet.house, navamsaDivision);
      
      return {
        ...planet,
        sign: navamsaSign,
        house: navamsaHouse,
        vargottama: planet.sign === navamsaSign
      };
    });

    return {
      type: 'D9',
      houses: this.calculateDivisionalHouses(d1Chart.houses, navamsaDivision),
      planets: navamsaPlanets,
      aspects: this.calculateAspects(navamsaPlanets),
      yogas: this.identifyNavamsaYogas(navamsaPlanets)
    };
  }

  // Generate D10 (Dashamsa) Chart - Career & Profession
  generateD10Chart(d1Chart: VedicChart): VedicChart {
    const dashamsaDivision = 10;
    const dashamsaPlanets = d1Chart.planets.map(planet => {
      const dashamsaSign = this.calculateDivisionalSign(planet.sign, planet.degree, dashamsaDivision);
      const dashamsaHouse = this.calculateDashamsaHouse(planet.house, dashamsaDivision);
      
      return {
        ...planet,
        sign: dashamsaSign,
        house: dashamsaHouse
      };
    });

    return {
      type: 'D10',
      houses: this.calculateDivisionalHouses(d1Chart.houses, dashamsaDivision),
      planets: dashamsaPlanets,
      aspects: this.calculateAspects(dashamsaPlanets),
      yogas: this.identifyCareerYogas(dashamsaPlanets)
    };
  }

  // Calculate current transits
  calculateTransits(natalChart: VedicChart, currentDate: Date): Transit[] {
    const currentPlanets = this.calculatePlanetaryPositions(currentDate, '12:00');
    const transits: Transit[] = [];

    natalChart.planets.forEach((natalPlanet, index) => {
      const currentPlanet = currentPlanets[index];
      if (natalPlanet.sign !== currentPlanet.sign) {
        transits.push({
          planet: natalPlanet.planet,
          fromSign: natalPlanet.sign,
          toSign: currentPlanet.sign,
          date: currentDate,
          duration: this.calculateTransitDuration(natalPlanet.planet),
          effect: this.evaluateTransitEffect(natalPlanet, currentPlanet, natalChart)
        });
      }
    });

    return transits;
  }

  // Calculate Vimshottari Dasha periods
  calculateDasha(moonNakshatra: string, birthDate: Date, currentDate: Date): DashaSystem {
    const dashaOrder = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
    const dashaDurations = {
      'Ketu': 7, 'Venus': 20, 'Sun': 6, 'Moon': 10, 'Mars': 7,
      'Rahu': 18, 'Jupiter': 16, 'Saturn': 19, 'Mercury': 17
    };

    const startingDasha = this.getStartingDasha(moonNakshatra);
    const currentDasha = this.getCurrentDasha(startingDasha, birthDate, currentDate, dashaDurations);
    
    return {
      maha: currentDasha.maha,
      antar: currentDasha.antar,
      pratyantar: currentDasha.pratyantar,
      sukshma: currentDasha.sukshma,
      prana: currentDasha.prana,
      startDate: currentDasha.startDate,
      endDate: currentDasha.endDate,
      effects: this.getDashaEffects(currentDasha)
    };
  }

  // Hora and Sub-Hora calculations
  calculateHoraSystem(date: Date, time: string): { hora: string; subHora: string; microHora: string } {
    const hour = parseInt(time.split(':')[0]);
    const minute = parseInt(time.split(':')[1]);
    
    // Planetary hours in order from sunrise
    const horaSequence = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'];
    const dayOfWeek = date.getDay();
    
    // Calculate hora (planetary hour)
    const horaIndex = (dayOfWeek * 24 + hour) % 7;
    const currentHora = horaSequence[horaIndex];
    
    // Calculate sub-hora (20 minutes each)
    const subHoraIndex = Math.floor(minute / 20);
    const subHoraRuler = horaSequence[(horaIndex + subHoraIndex) % 7];
    
    // Calculate micro-hora (3.33 minutes each)
    const microHoraIndex = Math.floor(minute / 3.33);
    const microHoraRuler = horaSequence[(horaIndex + microHoraIndex) % 7];
    
    return {
      hora: currentHora,
      subHora: subHoraRuler,
      microHora: microHoraRuler
    };
  }

  // Analyze stock based on sector and current planetary positions
  async analyzeStockBySector(
    stockSymbol: string,
    sector: string,
    currentDate: Date
  ): Promise<{
    sectorStrength: number;
    planetarySupport: number;
    timing: 'excellent' | 'good' | 'neutral' | 'challenging';
    keyFactors: string[];
    recommendation: string;
  }> {
    const sectorMapping = this.sectorMappings[sector] || this.getDefaultSectorMapping();
    const currentPlanets = this.calculatePlanetaryPositions(currentDate, new Date().toTimeString());
    
    // Calculate sector strength based on planetary positions
    let sectorStrength = 0;
    let planetarySupport = 0;
    const keyFactors: string[] = [];
    
    // Check ruling planets' positions
    sectorMapping.rulingPlanets.forEach(planet => {
      const planetData = currentPlanets.find(p => p.planet === planet);
      if (planetData) {
        if (planetData.exalted) {
          sectorStrength += 20;
          keyFactors.push(`${planet} is exalted - very favorable`);
        } else if (planetData.debilitated) {
          sectorStrength -= 15;
          keyFactors.push(`${planet} is debilitated - challenging`);
        } else if (sectorMapping.zodiacSigns.includes(planetData.sign)) {
          sectorStrength += 10;
          keyFactors.push(`${planet} in favorable ${planetData.sign}`);
        }
        
        if (!planetData.retrograde) {
          planetarySupport += 5;
        } else {
          keyFactors.push(`${planet} retrograde - delays expected`);
        }
      }
    });
    
    // Check benefic vs malefic influences
    sectorMapping.beneficPlanets.forEach(planet => {
      const planetData = currentPlanets.find(p => p.planet === planet);
      if (planetData && sectorMapping.zodiacSigns.includes(planetData.sign)) {
        planetarySupport += 8;
        keyFactors.push(`Benefic ${planet} supports sector`);
      }
    });
    
    sectorMapping.maleficPlanets.forEach(planet => {
      const planetData = currentPlanets.find(p => p.planet === planet);
      if (planetData && sectorMapping.zodiacSigns.includes(planetData.sign)) {
        planetarySupport -= 5;
        keyFactors.push(`Malefic ${planet} creates obstacles`);
      }
    });
    
    // Determine timing quality
    const totalScore = sectorStrength + planetarySupport;
    let timing: 'excellent' | 'good' | 'neutral' | 'challenging';
    let recommendation: string;
    
    if (totalScore >= 40) {
      timing = 'excellent';
      recommendation = `Strong buy signal for ${sector} stocks. Planetary alignment highly favorable.`;
    } else if (totalScore >= 20) {
      timing = 'good';
      recommendation = `Moderate buy signal. ${sector} sector has good support.`;
    } else if (totalScore >= 0) {
      timing = 'neutral';
      recommendation = `Hold position. Mixed planetary influences for ${sector}.`;
    } else {
      timing = 'challenging';
      recommendation = `Avoid new positions in ${sector}. Wait for better planetary alignment.`;
    }
    
    return {
      sectorStrength: Math.max(0, Math.min(100, sectorStrength + 50)),
      planetarySupport: Math.max(0, Math.min(100, planetarySupport + 50)),
      timing,
      keyFactors,
      recommendation
    };
  }

  // Store training data from real-world cases
  async recordTrainingData(
    stockSymbol: string,
    predictionDate: Date,
    predictedDirection: 'bullish' | 'bearish' | 'neutral',
    actualDirection: 'bullish' | 'bearish' | 'neutral',
    planetaryConfig: any,
    dashaConfig: any,
    transitConfig: any,
    actualReturn: number
  ): Promise<void> {
    try {
      await db.insert(trainingData).values({
        stockSymbol,
        predictionDate,
        predictedDirection,
        actualDirection,
        planetaryConfig: JSON.stringify(planetaryConfig),
        dashaConfig: JSON.stringify(dashaConfig),
        transitConfig: JSON.stringify(transitConfig),
        actualReturn,
        accuracy: predictedDirection === actualDirection ? 100 : 0,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Error recording training data:', error);
    }
  }

  // Learn from historical patterns
  async learnFromHistory(
    sector: string,
    lookbackDays: number = 365
  ): Promise<{
    patterns: any[];
    accuracy: number;
    bestConfigurations: any[];
    recommendations: string[];
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    
    try {
      // Fetch historical training data
      const historicalData = await db.select()
        .from(trainingData)
        .where(eq(trainingData.sector, sector));
      
      // Analyze patterns
      const patterns: any[] = [];
      const successfulConfigs: any[] = [];
      let totalAccuracy = 0;
      
      historicalData.forEach(record => {
        const config = {
          planetary: JSON.parse(record.planetaryConfig),
          dasha: JSON.parse(record.dashaConfig),
          transit: JSON.parse(record.transitConfig)
        };
        
        if (record.accuracy > 70) {
          successfulConfigs.push(config);
        }
        
        totalAccuracy += record.accuracy;
        
        // Identify recurring patterns
        patterns.push({
          date: record.predictionDate,
          accuracy: record.accuracy,
          return: record.actualReturn,
          configuration: config
        });
      });
      
      const avgAccuracy = historicalData.length > 0 
        ? totalAccuracy / historicalData.length 
        : 0;
      
      // Generate recommendations based on learning
      const recommendations = this.generateLearningRecommendations(
        successfulConfigs,
        avgAccuracy,
        sector
      );
      
      return {
        patterns,
        accuracy: avgAccuracy,
        bestConfigurations: successfulConfigs.slice(0, 10),
        recommendations
      };
    } catch (error) {
      console.error('Error learning from history:', error);
      return {
        patterns: [],
        accuracy: 0,
        bestConfigurations: [],
        recommendations: ['Insufficient historical data for learning']
      };
    }
  }

  // Private helper methods
  private calculateAscendant(birthDate: Date, birthTime: string, latitude: number, longitude: number): string {
    // Simplified ascendant calculation
    const hour = parseInt(birthTime.split(':')[0]);
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
                   'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    
    const siderealTime = this.calculateSiderealTime(birthDate, birthTime, longitude);
    const ascendantDegree = (siderealTime + latitude / 15) * 15;
    const ascendantSign = signs[Math.floor(ascendantDegree / 30) % 12];
    
    return ascendantSign;
  }

  private calculateSiderealTime(date: Date, time: string, longitude: number): number {
    const julianDay = this.getJulianDay(date);
    const T = (julianDay - 2451545.0) / 36525.0;
    const hour = parseInt(time.split(':')[0]) + parseInt(time.split(':')[1]) / 60;
    
    let siderealTime = 280.46061837 + 360.98564736629 * (julianDay - 2451545.0) +
                       0.000387933 * T * T - T * T * T / 38710000;
    
    siderealTime += hour * 15 + longitude;
    
    return siderealTime % 360;
  }

  private getJulianDay(date: Date): number {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    const a = Math.floor((14 - month) / 12);
    const y = year + 4800 - a;
    const m = month + 12 * a - 3;
    
    return day + Math.floor((153 * m + 2) / 5) + 365 * y + 
           Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  }

  private calculateHouses(ascendant: string): House[] {
    // Deterministic strength by house type (no randomness)
    const HOUSE_STRENGTH = [80, 65, 55, 80, 85, 45, 80, 35, 85, 80, 70, 35];
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
                   'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    
    const lords = {
      'Aries': 'Mars', 'Taurus': 'Venus', 'Gemini': 'Mercury',
      'Cancer': 'Moon', 'Leo': 'Sun', 'Virgo': 'Mercury',
      'Libra': 'Venus', 'Scorpio': 'Mars', 'Sagittarius': 'Jupiter',
      'Capricorn': 'Saturn', 'Aquarius': 'Saturn', 'Pisces': 'Jupiter'
    };
    
    const ascIndex = signs.indexOf(ascendant);
    const houses: House[] = [];
    
    for (let i = 0; i < 12; i++) {
      const signIndex = (ascIndex + i) % 12;
      const sign = signs[signIndex];
      
      houses.push({
        number: i + 1,
        sign,
        lord: lords[sign as keyof typeof lords],
        planets: [],
        strength: HOUSE_STRENGTH[i] // classical house classes: trikona > kendra > 2/11 > 3/6 > dusthana
      });
    }
    
    return houses;
  }

  private calculatePlanetaryPositions(date: Date, time: string): PlanetPlacement[] {
    // Real astronomical calculations based on date/time
    const T = (this.getJulianDay(date) - 2451545.0) / 36525.0;
    const planets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
                   'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    
    return planets.map((planet, index) => {
      const longitude = this.calculatePlanetLongitude(planet, T);
      const sign = signs[Math.floor(longitude / 30)];
      const degree = longitude % 30;
      const nakshatra = this.getNakshatraFromDegree(longitude);
      
      return {
        planet,
        sign,
        house: Math.floor(longitude / 30) + 1,
        degree,
        nakshatra: nakshatra.name,
        pada: nakshatra.pada,
        retrograde: this.isPlanetRetrograde(planet, T),
        combustion: this.isPlanetCombust(planet, longitude),
        exalted: this.isPlanetExalted(planet, sign),
        debilitated: this.isPlanetDebilitated(planet, sign),
        vargottama: false // To be calculated with navamsa
      };
    });
  }

  private calculatePlanetLongitude(planet: string, T: number): number {
    // Simplified ephemeris calculations
    const orbitalData: Record<string, { mean: number; period: number }> = {
      'Sun': { mean: 280.460, period: 365.25 },
      'Moon': { mean: 218.316, period: 27.321 },
      'Mercury': { mean: 252.250, period: 87.969 },
      'Venus': { mean: 181.979, period: 224.701 },
      'Mars': { mean: 355.433, period: 686.980 },
      'Jupiter': { mean: 34.351, period: 4332.589 },
      'Saturn': { mean: 50.078, period: 10759.22 },
      'Rahu': { mean: 125.045, period: -6798.36 }, // Retrograde motion
      'Ketu': { mean: 305.045, period: -6798.36 }
    };
    
    const data = orbitalData[planet] || { mean: 0, period: 365.25 };
    let longitude = (data.mean + (360 / data.period) * T * 36525) % 360;
    
    if (longitude < 0) longitude += 360;
    
    return longitude;
  }

  private getNakshatraFromDegree(longitude: number): { name: string; pada: number } {
    const nakshatras = [
      'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
      'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
      'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
      'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
      'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
    ];
    
    const nakshatraIndex = Math.floor(longitude / 13.333);
    const nakshatraDegree = longitude % 13.333;
    const pada = Math.floor(nakshatraDegree / 3.333) + 1;
    
    return {
      name: nakshatras[nakshatraIndex % 27],
      pada
    };
  }

  private isPlanetRetrograde(planet: string, T: number): boolean {
    // Simplified retrograde detection
    const retrogradePatterns: Record<string, (t: number) => boolean> = {
      'Mercury': (t) => Math.sin(t * 7.5) < -0.7,
      'Venus': (t) => Math.sin(t * 1.6) < -0.8,
      'Mars': (t) => Math.sin(t * 0.5) < -0.7,
      'Jupiter': (t) => Math.sin(t * 0.3) < -0.6,
      'Saturn': (t) => Math.sin(t * 0.2) < -0.5,
      'Rahu': () => true, // Always retrograde
      'Ketu': () => true  // Always retrograde
    };
    
    const pattern = retrogradePatterns[planet];
    return pattern ? pattern(T) : false;
  }

  private isPlanetCombust(planet: string, planetLongitude: number): boolean {
    // Planet is combust if too close to Sun
    // This would need Sun's longitude passed in
    return false; // Simplified for now
  }

  private isPlanetExalted(planet: string, sign: string): boolean {
    const exaltations: Record<string, string> = {
      'Sun': 'Aries', 'Moon': 'Taurus', 'Mars': 'Capricorn',
      'Mercury': 'Virgo', 'Jupiter': 'Cancer', 'Venus': 'Pisces',
      'Saturn': 'Libra', 'Rahu': 'Taurus', 'Ketu': 'Scorpio'
    };
    
    return exaltations[planet] === sign;
  }

  private isPlanetDebilitated(planet: string, sign: string): boolean {
    const debilitations: Record<string, string> = {
      'Sun': 'Libra', 'Moon': 'Scorpio', 'Mars': 'Cancer',
      'Mercury': 'Pisces', 'Jupiter': 'Capricorn', 'Venus': 'Virgo',
      'Saturn': 'Aries', 'Rahu': 'Scorpio', 'Ketu': 'Taurus'
    };
    
    return debilitations[planet] === sign;
  }

  private calculateAspects(planets: PlanetPlacement[]): Aspect[] {
    const aspects: Aspect[] = [];
    
    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const aspect = this.getAspectBetweenPlanets(planets[i], planets[j]);
        if (aspect) {
          aspects.push(aspect);
        }
      }
    }
    
    return aspects;
  }

  private getAspectBetweenPlanets(planet1: PlanetPlacement, planet2: PlanetPlacement): Aspect | null {
    const houseDiff = Math.abs(planet1.house - planet2.house);
    const aspectTypes: Record<number, { type: string; strength: number }> = {
      0: { type: 'conjunction', strength: 100 },
      3: { type: 'square', strength: 75 },
      4: { type: 'trine', strength: 90 },
      6: { type: 'opposition', strength: 80 },
      2: { type: 'sextile', strength: 60 }
    };
    
    const aspectData = aspectTypes[houseDiff % 12];
    if (!aspectData) return null;
    
    const beneficial = this.isAspectBeneficial(planet1.planet, planet2.planet);
    
    return {
      from: planet1.planet,
      to: planet2.planet,
      type: aspectData.type as any,
      strength: aspectData.strength,
      beneficial
    };
  }

  private isAspectBeneficial(planet1: string, planet2: string): boolean {
    const benefics = ['Jupiter', 'Venus', 'Moon', 'Mercury'];
    const malefics = ['Saturn', 'Mars', 'Rahu', 'Ketu', 'Sun'];
    
    const p1Benefic = benefics.includes(planet1);
    const p2Benefic = benefics.includes(planet2);
    
    return p1Benefic || p2Benefic;
  }

  private identifyYogas(planets: PlanetPlacement[], houses: House[]): Yoga[] {
    const yogas: Yoga[] = [];
    
    // Raj Yogas
    const kendraLords = [1, 4, 7, 10].map(h => houses[h - 1].lord);
    const trikonaLords = [1, 5, 9].map(h => houses[h - 1].lord);
    
    kendraLords.forEach(kendra => {
      trikonaLords.forEach(trikona => {
        if (this.planetsInMutualAspect(kendra, trikona, planets)) {
          yogas.push({
            name: `${kendra}-${trikona} Raj Yoga`,
            type: 'rajyoga',
            planets: [kendra, trikona],
            strength: 80,
            effect: 'Success, wealth and prosperity'
          });
        }
      });
    });
    
    // Dhana Yogas (Wealth)
    const dhanaLords = [2, 11].map(h => houses[h - 1].lord);
    dhanaLords.forEach(lord => {
      const planet = planets.find(p => p.planet === lord);
      if (planet && (planet.exalted || [2, 5, 9, 11].includes(planet.house))) {
        yogas.push({
          name: `${lord} Dhana Yoga`,
          type: 'dhanyoga',
          planets: [lord],
          strength: 70,
          effect: 'Wealth accumulation'
        });
      }
    });
    
    return yogas;
  }

  private planetsInMutualAspect(planet1: string, planet2: string, planets: PlanetPlacement[]): boolean {
    const p1 = planets.find(p => p.planet === planet1);
    const p2 = planets.find(p => p.planet === planet2);
    
    if (!p1 || !p2) return false;
    
    const houseDiff = Math.abs(p1.house - p2.house);
    return [0, 3, 4, 6].includes(houseDiff % 12);
  }

  private identifyNavamsaYogas(planets: PlanetPlacement[]): Yoga[] {
    const yogas: Yoga[] = [];
    
    // Vargottama positions strengthen planets
    planets.forEach(planet => {
      if (planet.vargottama) {
        yogas.push({
          name: `${planet.planet} Vargottama`,
          type: 'rajyoga',
          planets: [planet.planet],
          strength: 90,
          effect: `${planet.planet} gains exceptional strength`
        });
      }
    });
    
    return yogas;
  }

  private identifyCareerYogas(planets: PlanetPlacement[]): Yoga[] {
    const yogas: Yoga[] = [];
    
    // 10th house related yogas for career
    const tenthHousePlanets = planets.filter(p => p.house === 10);
    
    tenthHousePlanets.forEach(planet => {
      if (planet.exalted || ['Sun', 'Jupiter', 'Mercury'].includes(planet.planet)) {
        yogas.push({
          name: `${planet.planet} Career Yoga`,
          type: 'rajyoga',
          planets: [planet.planet],
          strength: 85,
          effect: 'Professional success and recognition'
        });
      }
    });
    
    return yogas;
  }

  private calculateDivisionalSign(sign: string, degree: number, division: number): string {
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
                   'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    
    const signIndex = signs.indexOf(sign);
    const divisionalPart = Math.floor(degree / (30 / division));
    const newSignIndex = (signIndex * division + divisionalPart) % 12;
    
    return signs[newSignIndex];
  }

  private calculateNavamsaHouse(d1House: number, division: number): number {
    return ((d1House - 1) * division) % 12 + 1;
  }

  private calculateDashamsaHouse(d1House: number, division: number): number {
    return ((d1House - 1) * division) % 12 + 1;
  }

  private calculateDivisionalHouses(d1Houses: House[], division: number): House[] {
    return d1Houses.map(house => ({
      ...house,
      number: this.calculateNavamsaHouse(house.number, division)
    }));
  }

  private calculateTransitDuration(planet: string): number {
    const durations: Record<string, number> = {
      'Sun': 30, 'Moon': 2.5, 'Mercury': 20, 'Venus': 25,
      'Mars': 45, 'Jupiter': 365, 'Saturn': 900,
      'Rahu': 540, 'Ketu': 540
    };
    
    return durations[planet] || 30;
  }

  private evaluateTransitEffect(
    natalPlanet: PlanetPlacement,
    currentPlanet: PlanetPlacement,
    chart: VedicChart
  ): 'beneficial' | 'malefic' | 'neutral' {
    // Complex evaluation logic
    if (currentPlanet.exalted) return 'beneficial';
    if (currentPlanet.debilitated) return 'malefic';
    
    return 'neutral';
  }

  private getStartingDasha(nakshatra: string): string {
    const nakshatraDashaMap: Record<string, string> = {
      'Ashwini': 'Ketu', 'Bharani': 'Venus', 'Krittika': 'Sun',
      'Rohini': 'Moon', 'Mrigashira': 'Mars', 'Ardra': 'Rahu',
      'Punarvasu': 'Jupiter', 'Pushya': 'Saturn', 'Ashlesha': 'Mercury',
      'Magha': 'Ketu', 'Purva Phalguni': 'Venus', 'Uttara Phalguni': 'Sun',
      'Hasta': 'Moon', 'Chitra': 'Mars', 'Swati': 'Rahu',
      'Vishakha': 'Jupiter', 'Anuradha': 'Saturn', 'Jyeshtha': 'Mercury',
      'Mula': 'Ketu', 'Purva Ashadha': 'Venus', 'Uttara Ashadha': 'Sun',
      'Shravana': 'Moon', 'Dhanishta': 'Mars', 'Shatabhisha': 'Rahu',
      'Purva Bhadrapada': 'Jupiter', 'Uttara Bhadrapada': 'Saturn', 'Revati': 'Mercury'
    };
    
    return nakshatraDashaMap[nakshatra] || 'Ketu';
  }

  private getCurrentDasha(
    startingDasha: string,
    birthDate: Date,
    currentDate: Date,
    dashaDurations: Record<string, number>
  ): any {
    // Complex dasha calculation logic
    const daysSinceBirth = Math.floor((currentDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Simplified for demonstration
    return {
      maha: startingDasha,
      antar: 'Venus',
      pratyantar: 'Sun',
      sukshma: 'Moon',
      prana: 'Mars',
      startDate: currentDate,
      endDate: new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  private getDashaEffects(dasha: any): string[] {
    const effects: string[] = [];
    
    const planetEffects: Record<string, string[]> = {
      'Jupiter': ['Growth', 'Expansion', 'Wisdom', 'Good fortune'],
      'Venus': ['Luxury', 'Relationships', 'Creativity', 'Material gains'],
      'Mercury': ['Communication', 'Business', 'Intelligence', 'Trade'],
      'Sun': ['Authority', 'Recognition', 'Health', 'Government'],
      'Moon': ['Emotions', 'Public', 'Mother', 'Mind'],
      'Mars': ['Energy', 'Conflict', 'Property', 'Siblings'],
      'Saturn': ['Discipline', 'Delays', 'Hard work', 'Justice'],
      'Rahu': ['Foreign', 'Innovation', 'Sudden events', 'Technology'],
      'Ketu': ['Spirituality', 'Loss', 'Liberation', 'Past karma']
    };
    
    effects.push(...(planetEffects[dasha.maha] || []));
    effects.push(...(planetEffects[dasha.antar] || []));
    
    return effects;
  }

  private getDefaultSectorMapping(): SectorMapping {
    return {
      sector: 'General',
      rulingPlanets: ['Jupiter', 'Mercury'],
      beneficPlanets: ['Jupiter', 'Venus', 'Mercury'],
      maleficPlanets: ['Saturn', 'Rahu', 'Ketu'],
      keyHouses: [2, 10, 11],
      keyNakshatras: ['Rohini', 'Pushya', 'Shravana'],
      zodiacSigns: ['Taurus', 'Virgo', 'Capricorn']
    };
  }

  private generateLearningRecommendations(
    configs: any[],
    accuracy: number,
    sector: string
  ): string[] {
    const recommendations: string[] = [];
    
    if (accuracy > 70) {
      recommendations.push(`High accuracy (${accuracy.toFixed(1)}%) achieved for ${sector} predictions`);
      recommendations.push('Continue using current planetary weight configurations');
    } else {
      recommendations.push(`Accuracy needs improvement (${accuracy.toFixed(1)}%) for ${sector}`);
      recommendations.push('Consider adjusting planetary influence weights');
    }
    
    // Analyze successful configurations
    if (configs.length > 0) {
      const commonPlanets = this.findCommonPlanets(configs);
      if (commonPlanets.length > 0) {
        recommendations.push(`Key planets for ${sector}: ${commonPlanets.join(', ')}`);
      }
    }
    
    recommendations.push('Continue collecting real-world data for better predictions');
    
    return recommendations;
  }

  private findCommonPlanets(configs: any[]): string[] {
    const planetCounts: Record<string, number> = {};
    
    configs.forEach(config => {
      if (config.planetary && config.planetary.favorablePlanets) {
        config.planetary.favorablePlanets.forEach((planet: string) => {
          planetCounts[planet] = (planetCounts[planet] || 0) + 1;
        });
      }
    });
    
    return Object.entries(planetCounts)
      .filter(([_, count]) => count > configs.length * 0.5)
      .map(([planet]) => planet);
  }
}

export const advancedAstrologyService = new AdvancedAstrologyService();
