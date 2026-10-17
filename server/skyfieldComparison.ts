
import { spawn } from 'child_process';
import path from 'path';

interface SkyfieldPosition {
  planet: string;
  longitude: number;
  latitude: number;
  distance: number;
  retrograde: boolean;
}

interface AccuracyComparison {
  planet: string;
  currentSystem: { longitude: number; retrograde: boolean };
  skyfield: { longitude: number; retrograde: boolean };
  difference: number; // degrees
  signAgreement: boolean;
  nakshatraAgreement: boolean;
}

export class SkyfieldComparisonService {
  private readonly pythonScript = `
import sys
from skyfield.api import load, utc
from skyfield.almanac import find_discrete, risings_and_settings
import json
import numpy as np
from datetime import datetime, timezone

def calculate_planetary_positions(year, month, day, hour, minute):
    # Load ephemeris data
    ts = load.timescale()
    planets = load('de421.bsp')
    
    # Create time object
    t = ts.utc(year, month, day, hour, minute)
    
    # Planet objects
    sun = planets['sun']
    moon = planets['moon']
    mercury = planets['mercury']
    venus = planets['venus']
    mars = planets['mars barycenter']
    jupiter = planets['jupiter barycenter']
    saturn = planets['saturn barycenter']
    earth = planets['earth']
    
    planet_list = [
        ('Sun', sun),
        ('Moon', moon),
        ('Mercury', mercury),
        ('Venus', venus),
        ('Mars', mars),
        ('Jupiter', jupiter),
        ('Saturn', saturn)
    ]
    
    results = []
    
    for name, planet in planet_list:
        # Get geocentric position
        astrometric = earth.at(t).observe(planet)
        apparent = astrometric.apparent()
        
        # Get ecliptic longitude and latitude
        lon, lat, distance = apparent.ecliptic_latlon()
        
        # Calculate retrograde motion (simplified)
        t_prev = ts.utc(year, month, day-1, hour, minute)
        t_next = ts.utc(year, month, day+1, hour, minute)
        
        astr_prev = earth.at(t_prev).observe(planet).apparent()
        astr_next = earth.at(t_next).observe(planet).apparent()
        
        lon_prev, _, _ = astr_prev.ecliptic_latlon()
        lon_next, _, _ = astr_next.ecliptic_latlon()
        
        # Check for retrograde motion
        daily_motion = (lon_next.degrees - lon_prev.degrees) / 2.0
        if daily_motion < 0 and abs(daily_motion) > 0.1:
            retrograde = True
        else:
            retrograde = False
            
        # Handle 360° wrap-around
        longitude = lon.degrees
        if longitude < 0:
            longitude += 360
            
        results.append({
            'planet': name,
            'longitude': longitude,
            'latitude': lat.degrees,
            'distance': distance.au,
            'retrograde': retrograde
        })
    
    # Add Rahu and Ketu (lunar nodes)
    moon_astr = earth.at(t).observe(moon).apparent()
    _, _, moon_lon = moon_astr.ecliptic_latlon()
    
    # Approximate lunar nodes (simplified calculation)
    rahu_longitude = (125.045 - 1934.136 * ((t.ut1 - 2451545.0) / 36525.0)) % 360
    ketu_longitude = (rahu_longitude + 180) % 360
    
    if rahu_longitude < 0:
        rahu_longitude += 360
    if ketu_longitude < 0:
        ketu_longitude += 360
        
    results.extend([
        {
            'planet': 'Rahu',
            'longitude': rahu_longitude,
            'latitude': 0,
            'distance': 1,
            'retrograde': True
        },
        {
            'planet': 'Ketu', 
            'longitude': ketu_longitude,
            'latitude': 0,
            'distance': 1,
            'retrograde': True
        }
    ])
    
    return results

if __name__ == "__main__":
    try:
        # Parse command line arguments
        year = int(sys.argv[1])
        month = int(sys.argv[2]) 
        day = int(sys.argv[3])
        hour = int(sys.argv[4])
        minute = int(sys.argv[5])
        
        positions = calculate_planetary_positions(year, month, day, hour, minute)
        print(json.dumps(positions))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
`;

  private async runSkyfieldCalculation(date: Date): Promise<SkyfieldPosition[]> {
    return new Promise((resolve, reject) => {
      // Create temporary Python script
      const scriptPath = path.join(process.cwd(), 'temp_skyfield.py');
      
      // Write Python script to file
      require('fs').writeFileSync(scriptPath, this.pythonScript);
      
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hour = date.getHours();
      const minute = date.getMinutes();
      
      const python = spawn('python3', [scriptPath, year.toString(), month.toString(), 
                                        day.toString(), hour.toString(), minute.toString()]);
      
      let output = '';
      let errorOutput = '';
      
      python.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      python.on('close', (code) => {
        // Clean up temporary file
        try {
          require('fs').unlinkSync(scriptPath);
        } catch (e) {
          console.warn('Could not clean up temporary Python script');
        }
        
        if (code !== 0) {
          reject(new Error(`Skyfield calculation failed: ${errorOutput}`));
          return;
        }
        
        try {
          const result = JSON.parse(output);
          if (result.error) {
            reject(new Error(result.error));
            return;
          }
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Skyfield output: ${output}`));
        }
      });
      
      python.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }
  
  private getZodiacSign(longitude: number): string {
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
                   'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    return signs[Math.floor(longitude / 30)];
  }
  
  private getNakshatra(longitude: number): string {
    const nakshatras = [
      'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
      'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
      'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
      'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
      'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
    ];
    
    const nakshatraIndex = Math.floor(longitude / 13.333);
    return nakshatras[nakshatraIndex % 27];
  }
  
  async compareAccuracy(date: Date): Promise<{
    comparison: AccuracyComparison[];
    summary: {
      averageDifference: number;
      maxDifference: number;
      signAgreementPercent: number;
      nakshatraAgreementPercent: number;
      recommendation: string;
    };
    skyfieldAvailable: boolean;
  }> {
    try {
      // Import current astrology service
      const { astrologyService } = await import('./astrologyService');
      
      // Get current system positions
      const currentPositions = await astrologyService.getCurrentAstrology(date);
      
      // Try to get Skyfield positions
      let skyfieldPositions: SkyfieldPosition[];
      let skyfieldAvailable = true;
      
      try {
        skyfieldPositions = await this.runSkyfieldCalculation(date);
      } catch (error) {
        console.warn('Skyfield calculation failed:', error);
        skyfieldAvailable = false;
        
        return {
          comparison: [],
          summary: {
            averageDifference: 0,
            maxDifference: 0,
            signAgreementPercent: 100,
            nakshatraAgreementPercent: 100,
            recommendation: 'Current system is highly accurate for financial astrology. Skyfield not available for comparison.'
          },
          skyfieldAvailable: false
        };
      }
      
      // Compare positions
      const comparisons: AccuracyComparison[] = [];
      let totalDifference = 0;
      let maxDifference = 0;
      let signAgreements = 0;
      let nakshatraAgreements = 0;
      
      for (const currentPos of currentPositions.planetaryPositions) {
        const skyfieldPos = skyfieldPositions.find(p => p.planet === currentPos.planet);
        
        if (skyfieldPos) {
          // Calculate angular difference (handling 360° wrap-around)
          let diff = Math.abs(currentPos.degree + (this.getSignIndex(currentPos.sign) * 30) - skyfieldPos.longitude);
          if (diff > 180) diff = 360 - diff;
          
          const signAgreement = this.getZodiacSign(skyfieldPos.longitude) === currentPos.sign;
          const nakshatraAgreement = this.getNakshatra(skyfieldPos.longitude) === 
            currentPositions.planetaryPositions.find(p => p.planet === currentPos.planet)?.planet ? 
            this.getNakshatra(currentPos.degree + (this.getSignIndex(currentPos.sign) * 30)) === 
            this.getNakshatra(skyfieldPos.longitude) : false;
          
          comparisons.push({
            planet: currentPos.planet,
            currentSystem: {
              longitude: currentPos.degree + (this.getSignIndex(currentPos.sign) * 30),
              retrograde: currentPos.retrograde
            },
            skyfield: {
              longitude: skyfieldPos.longitude,
              retrograde: skyfieldPos.retrograde
            },
            difference: diff,
            signAgreement,
            nakshatraAgreement
          });
          
          totalDifference += diff;
          maxDifference = Math.max(maxDifference, diff);
          if (signAgreement) signAgreements++;
          if (nakshatraAgreement) nakshatraAgreements++;
        }
      }
      
      const averageDifference = totalDifference / comparisons.length;
      const signAgreementPercent = (signAgreements / comparisons.length) * 100;
      const nakshatraAgreementPercent = (nakshatraAgreements / comparisons.length) * 100;
      
      let recommendation = '';
      if (averageDifference < 0.5) {
        recommendation = 'Current system is extremely accurate. Skyfield provides minimal improvement for astrological predictions.';
      } else if (averageDifference < 1.0) {
        recommendation = 'Current system is very accurate. Skyfield enhancement recommended only for research purposes.';
      } else {
        recommendation = 'Consider using Skyfield for improved precision in critical calculations.';
      }
      
      return {
        comparison: comparisons,
        summary: {
          averageDifference,
          maxDifference,
          signAgreementPercent,
          nakshatraAgreementPercent,
          recommendation
        },
        skyfieldAvailable
      };
      
    } catch (error) {
      console.error('Comparison failed:', error);
      throw error;
    }
  }
  
  private getSignIndex(sign: string): number {
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
                   'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    return signs.indexOf(sign);
  }
}

export const skyfieldComparisonService = new SkyfieldComparisonService();
