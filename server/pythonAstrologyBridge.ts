
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

interface PythonAstroResult {
  final_score: number;
  raw_score: number;
  components: Array<[string, any, any, any]>;
  tithi: { tithi: number; progress: number };
  nakshatra: { nakshatra_index: number; progress: number };
  hora: {
    hora_planet: string;
    hora_index: number;
    offset_minutes: number;
    sunrise_local: string;
  };
  aspects: Array<[string, string, number, string]>;
}

export class PythonAstrologyBridge {
  private readonly pythonScript = `
# Bridge script to interface with astro_module.py (production optimized)
import sys
import json
from datetime import datetime
import pytz
import os

# Import your astro_module
sys.path.append('${process.cwd()}/python_modules')

# Try production engine first, fallback to basic
try:
    from astro_production import get_production_engine
    USE_PRODUCTION = True
except ImportError:
    from astro_module import AstroEngine
    USE_PRODUCTION = False
    print("⚠️ Production module unavailable, using basic engine")

def main():
    try:
        # Parse command line arguments
        when_iso = sys.argv[1]
        lat = float(sys.argv[2])
        lon = float(sys.argv[3])
        sector = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != 'null' else None
        tz_str = sys.argv[5] if len(sys.argv) > 5 else 'Asia/Kolkata'
        
        # Parse datetime
        when_dt = datetime.fromisoformat(when_iso.replace('Z', '+00:00'))
        
        # Initialize engine (production or basic)
        if USE_PRODUCTION:
            engine = get_production_engine()
            score, details = engine.score_time_cached(when_dt, lat, lon, sector=sector, tz=tz_str)
            # Include performance metrics
            metrics = engine.get_performance_metrics()
            details['performance_metrics'] = metrics
        else:
            engine = AstroEngine()
            score, details = engine.score_time(when_dt, lat, lon, sector=sector, tz=tz_str)
        
        # Format response
        result = {
            'success': True,
            'score': score,
            'details': details
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'score': None,
            'details': None
        }
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()
`;

  private async setupPythonModule(): Promise<void> {
    const pythonDir = path.join(process.cwd(), 'python_modules');
    const astroModulePath = path.join(pythonDir, 'astro_module.py');
    const bridgeScriptPath = path.join(pythonDir, 'bridge.py');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(pythonDir)) {
      fs.mkdirSync(pythonDir, { recursive: true });
    }
    
    // Write the bridge script
    fs.writeFileSync(bridgeScriptPath, this.pythonScript);
    
    // Copy your astro_module.py to the python_modules directory
    // (You'll need to place your astro_module.py file there)
    if (!fs.existsSync(astroModulePath)) {
      console.warn('⚠️ Python astro_module.py not found. Place it in python_modules/ directory for enhanced calculations.');
    }
  }

  async getEnhancedPrediction(
    date: Date,
    lat: number = 19.0760,
    lon: number = 72.8777,
    sector?: string,
    timezone: string = 'Asia/Kolkata'
  ): Promise<{
    available: boolean;
    score?: number;
    details?: PythonAstroResult;
    error?: string;
  }> {
    try {
      await this.setupPythonModule();
      
      const bridgeScriptPath = path.join(process.cwd(), 'python_modules', 'bridge.py');
      
      return new Promise((resolve) => {
        const args = [
          bridgeScriptPath,
          date.toISOString(),
          lat.toString(),
          lon.toString(),
          sector || 'null',
          timezone
        ];
        
        const python = spawn('python3', args);
        
        let output = '';
        let errorOutput = '';
        
        python.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        python.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        python.on('close', (code) => {
          if (code !== 0) {
            resolve({
              available: false,
              error: `Python process failed: ${errorOutput}`
            });
            return;
          }
          
          try {
            const result = JSON.parse(output);
            
            if (result.success) {
              resolve({
                available: true,
                score: result.score,
                details: result.details
              });
            } else {
              resolve({
                available: false,
                error: result.error
              });
            }
          } catch (e) {
            resolve({
              available: false,
              error: `Failed to parse Python output: ${output}`
            });
          }
        });
        
        python.on('error', (error) => {
          resolve({
            available: false,
            error: `Failed to start Python process: ${error.message}`
          });
        });
      });
    } catch (error) {
      return {
        available: false,
        error: `Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Convert Python astrology score to prediction format
  convertToPrediction(
    pythonResult: PythonAstroResult,
    stockSymbol: string,
    currentPrice: number
  ): {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    factors: any;
    recommendation: string;
    warnings: string[];
  } {
    const score = pythonResult.final_score;
    
    // Convert score to direction (adjust thresholds based on your calibration)
    let direction: 'bullish' | 'bearish' | 'neutral';
    if (score > 12) {
      direction = 'bullish';
    } else if (score < 8) {
      direction = 'bearish';
    } else {
      direction = 'neutral';
    }
    
    // Convert score to confidence (0-100)
    const confidence = Math.min(95, Math.max(30, Math.round((Math.abs(score - 10) / 5) * 100)));
    
    // Extract factors from components
    const factors: any = {};
    pythonResult.components.forEach(([type, value, raw, contrib]) => {
      factors[type] = contrib || raw || value;
    });
    
    // Generate recommendation
    const horaInfo = pythonResult.hora;
    const tithiInfo = pythonResult.tithi;
    
    let recommendation = `Python-enhanced analysis: ${direction} bias (score: ${score.toFixed(1)}). `;
    recommendation += `${horaInfo.hora_planet} hora active. `;
    recommendation += `Tithi ${tithiInfo.tithi} with ${(tithiInfo.progress * 100).toFixed(0)}% progress.`;
    
    // Generate warnings
    const warnings: string[] = [];
    
    // Check for challenging aspects
    const hardAspects = pythonResult.aspects.filter(([p1, p2, ang, name]) => 
      name === 'square' || name === 'opposition'
    );
    
    if (hardAspects.length > 0) {
      warnings.push(`${hardAspects.length} challenging planetary aspects detected`);
    }
    
    // Check for retrograde planets
    const retrogradeCount = pythonResult.components.find(([type]) => type === 'retrograde');
    if (retrogradeCount && retrogradeCount[1] > 0) {
      warnings.push(`${retrogradeCount[1]} planets in retrograde motion`);
    }
    
    return {
      direction,
      confidence,
      factors,
      recommendation,
      warnings
    };
  }
}

export const pythonAstrologyBridge = new PythonAstrologyBridge();
