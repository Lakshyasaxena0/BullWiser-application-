
"""
astro_module.py

BullWiser: Astrology module (silent backend layer)
- Computes planetary longitudes, retrograde state, tithi, nakshatra, hora
- Produces a trade-timing score for a given datetime + location
- Contains calibration hooks for weight adjustments (calibrate_weights)
- Caches ephemeris and supports batch processing

Dependencies:
    skyfield, numpy, pytz, scipy (for calibration helpers)

Usage:
    from astro_module import AstroEngine
    engine = AstroEngine(ephem_path='de421.bsp')  # or None to auto-load
    score, details = engine.score_time(datetime_obj, lat, lon, timezone='Asia/Kolkata')

Note: keep astrology outputs internal. Do not expose raw astro text to users.
"""

from skyfield.api import load, wgs84
from skyfield import almanac
from skyfield.api import N, S, E, W
import numpy as np
import pytz
import datetime, json, os, math
from scipy.optimize import minimize
from functools import lru_cache
from typing import List, Dict, Tuple, Optional

# ---------- Configuration & Defaults ----------
DEFAULT_EPHEMERIS = os.environ.get('ASTRO_EPHEMERIS', 'de421.bsp')
CACHE_SIZE = int(os.environ.get('ASTRO_CACHE_SIZE', '10000'))
ENABLE_BATCH_OPTIMIZATION = os.environ.get('ASTRO_BATCH_OPT', 'true').lower() == 'true'
DEFAULT_INTERVAL_MINUTES = int(os.environ.get('ASTRO_INTERVAL_MINUTES', '15'))
PLANETS = {
    'sun': 'sun',
    'moon': 'moon',
    'mercury': 'mercury',
    'venus': 'venus',
    'mars': 'mars',
    'jupiter': 'jupiter barycenter',   # skyfield naming choices
    'saturn': 'saturn barycenter',
    'rahu': None,   # nodes handled separately
    'ketu': None
}
# Hora planet order starting from Sunday sunrise rule (Vedic hora order often starts Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn)
HORA_ORDER = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn']

# Default scoring weights (can be tuned via calibrate_weights)
DEFAULT_WEIGHTS = {
    'hora_score': 1.0,
    'tithi_score': 0.6,
    'nakshatra_score': 0.6,
    'aspect_penalty': 0.8,
    'retrograde_penalty': 0.5,
    'sector_bias': 0.9,   # sector mapping multiplier
    'base_score': 10.0
}

# Mapping of hora -> numeric bias (example; tuned to your earlier table)
HORA_BIAS = {
    'sun': 6,
    'moon': 5,
    'mars': 2,
    'mercury': 7,
    'jupiter': 8,
    'venus': 9,
    'saturn': 1
}

# Tithi and nakshatra modifiers (example; you can extend)
TITHI_MOD = {1: 0, 2: 0, 3: 1, 4: 1, 5: -1}  # simplified; real mapping should be expanded
# Nakshatra groups and bias (27 nakshatras, simplified)
def nakshatra_index_from_long(lon_deg):
    # 27 nakshatras: each 13°20' = 13.333333 deg
    idx = int((lon_deg % 360) / (360.0/27.0))
    return idx  # 0..26

NAKSHATRA_BIAS = np.zeros(27)  # default zeros, can be tuned for specific nakshatras

# Sector <-> Graha mapping (example)
SECTOR_GRAHA_MAP = {
    'fmcg': ['venus', 'jupiter'],
    'it': ['mercury'],
    'banking': ['jupiter'],
    'auto': ['mars'],
    'energy': ['saturn','mars']
}

# internal weight file (persist calibration)
WEIGHTS_PATH = 'astro_weights.json'

# ---------- Engine Class ----------
class AstroEngine:
    def __init__(self, ephem_path=None, weights=None, cache_size=10000):
        self.ephem_path = ephem_path or DEFAULT_EPHEMERIS
        self.ts = load.timescale()
        self.ephemeris = self._load_ephemeris(self.ephem_path)
        self.planets = {k: (self.ephemeris[v] if v and v in self.ephemeris.bodies else None) for k,v in PLANETS.items()}
        self.weights = weights or self._load_weights()
        # Enhanced caching
        self._almanac_cache = {}
        self._pos_cache = {}  # Enhanced LRU cache below
        self._cache_size = cache_size
        self._daily_cache = {}  # For precomputed daily positions
        self._batch_cache = {}  # For vectorized computations

    def _load_ephemeris(self, path):
        try:
            # Check if path is a local file first
            if os.path.exists(path):
                print(f"Loading ephemeris from local file: {path}")
                eph = load(path)
                return eph
            else:
                print(f"Local ephemeris not found at {path}, downloading...")
                eph = load(path)  # skyfield auto-downloads if supported
                return eph
        except Exception as e:
            print(f"⚠️ Ephemeris loading failed: {e}")
            # Fallback: try default ephemeris
            try:
                fallback_path = 'de421.bsp'
                print(f"Attempting fallback to {fallback_path}")
                eph = load(fallback_path)
                print("✅ Fallback ephemeris loaded successfully")
                return eph
            except Exception as ee:
                print(f"❌ Fallback failed: {ee}")
                raise RuntimeError(f"Unable to load ephemeris at '{path}': {e} / Fallback failed: {ee}")

    def _load_weights(self):
        if os.path.exists(WEIGHTS_PATH):
            try:
                with open(WEIGHTS_PATH,'r') as f:
                    return json.load(f)
            except:
                pass
        # default copy
        w = dict(DEFAULT_WEIGHTS)
        # ensure numeric types
        for k,v in w.items():
            w[k] = float(v)
        return w

    def save_weights(self):
        with open(WEIGHTS_PATH,'w') as f:
            json.dump(self.weights, f, indent=2)

    # ---------- Planetary Positions ----------
    def _get_planet_longitude(self, planet_key, when_utc):
        """
        Returns ecliptic longitude in degrees for planet_key at when (skyfield Time).
        Enhanced with numerical stability and production error handling.
        """
        cache_key = (planet_key, round(when_utc.tt, 6))  # Round for better cache hits
        if cache_key in self._pos_cache:
            return self._pos_cache[cache_key]
        
        try:
            body = self.planets.get(planet_key)
            if body is None:
                # handle nodes (Rahu/Ketu) or missing bodies
                if planet_key in ['rahu','ketu']:
                    # Enhanced node calculation with error handling
                    try:
                        sun = self.ephemeris['sun']
                        moon = self.ephemeris['moon']
                        astrometric = self.ephemeris['earth'].at(when_utc).observe(moon).apparent()
                        moon_lon = astrometric.ecliptic_latlon()[1].degrees
                        astrometric_sun = self.ephemeris['earth'].at(when_utc).observe(sun).apparent()
                        sun_lon = astrometric_sun.ecliptic_latlon()[1].degrees
                        
                        # Improved node calculation with numerical stability
                        if planet_key == 'rahu':
                            # Mean ascending node (simplified but more stable)
                            node_lon = (moon_lon - sun_lon + 180.0) % 360.0
                        else:  # ketu
                            node_lon = (moon_lon - sun_lon) % 360.0
                        
                        # Ensure longitude is in [0, 360)
                        node_lon = node_lon % 360.0
                        if node_lon < 0:
                            node_lon += 360.0
                            
                        self._pos_cache[cache_key] = node_lon
                        return node_lon
                    except Exception as e:
                        print(f"⚠️ Node calculation failed for {planet_key}: {e}")
                        # Fallback to approximate position
                        fallback_lon = 125.0 if planet_key == 'rahu' else 305.0
                        self._pos_cache[cache_key] = fallback_lon
                        return fallback_lon
                else:
                    raise ValueError(f"Unknown planet key: {planet_key}")
            
            # Standard planetary position calculation
            obs = self.ephemeris['earth'].at(when_utc).observe(body).apparent()
            ecl = obs.ecliptic_latlon()
            lon = ecl[1].degrees
            
            # Numerical stability: ensure longitude is in [0, 360)
            lon = lon % 360.0
            if lon < 0:
                lon += 360.0
            
            # Cache with size limit
            if len(self._pos_cache) > self._cache_size:
                # Remove oldest entries (simple FIFO)
                oldest_keys = list(self._pos_cache.keys())[:100]
                for key in oldest_keys:
                    del self._pos_cache[key]
            
            self._pos_cache[cache_key] = lon
            return lon
            
        except Exception as e:
            print(f"⚠️ Planetary position calculation failed for {planet_key}: {e}")
            # Return fallback position based on rough planetary periods
            fallback_positions = {
                'sun': (when_utc.tt % 365.25) * (360.0 / 365.25),
                'moon': (when_utc.tt % 27.3) * (360.0 / 27.3),
                'mercury': (when_utc.tt % 88) * (360.0 / 88),
                'venus': (when_utc.tt % 225) * (360.0 / 225),
                'mars': (when_utc.tt % 687) * (360.0 / 687),
                'jupiter': (when_utc.tt % 4333) * (360.0 / 4333),
                'saturn': (when_utc.tt % 10759) * (360.0 / 10759),
            }
            fallback_lon = fallback_positions.get(planet_key, 0.0) % 360.0
            print(f"Using fallback position {fallback_lon:.2f}° for {planet_key}")
            return fallback_lon

    def _is_retrograde(self, planet_key, when_dt):
        # determines retrograde by checking derivative of longitude
        t0 = self.ts.from_datetime(when_dt - datetime.timedelta(hours=6))
        t1 = self.ts.from_datetime(when_dt + datetime.timedelta(hours=6))
        lon0 = self._get_planet_longitude(planet_key, t0)
        lon1 = self._get_planet_longitude(planet_key, t1)
        diff = ((lon1 - lon0 + 540) % 360) - 180  # signed shortest diff
        # if diff negative and magnitude > tiny threshold -> retrograde in that window
        return diff < -0.05

    # ---------- Tithi & Nakshatra ----------
    def compute_tithi(self, when_dt):
        """Return tithi index (1..30) and fractional progress [0..1]."""
        t = self.ts.from_datetime(when_dt)
        sun_lon = self._get_planet_longitude('sun', t)
        moon_lon = self._get_planet_longitude('moon', t)
        diff = (moon_lon - sun_lon) % 360.0
        tithi = int(diff // 12) + 1  # 12° per tithi -> 30 tithis
        frac = (diff % 12) / 12.0
        return {'tithi': tithi, 'progress': frac}

    def compute_nakshatra(self, when_dt):
        t = self.ts.from_datetime(when_dt)
        moon_lon = self._get_planet_longitude('moon', t)
        idx = nakshatra_index_from_long(moon_lon)
        frac = (moon_lon % (360.0/27.0)) / (360.0/27.0)
        return {'nakshatra_index': idx, 'progress': frac}

    # ---------- Hora Calculation ----------
    def compute_hora(self, when_dt, lat, lon, tz_str='UTC'):
        """
        Compute Hora planet for that hour based on sunrise.
        - Finds sunrise time at given location and then finds which hora block `when_dt` falls into.
        - Returns hora planet key (one of HORA_ORDER), hora_index (0..6) and offset minutes into hora.
        """
        # normalize times with timezone
        tz = pytz.timezone(tz_str)
        if when_dt.tzinfo is None:
            when_local = tz.localize(when_dt)
        else:
            when_local = when_dt.astimezone(tz)
        # compute sunrise using skyfield almanac
        eph = self.ephemeris
        t0 = self.ts.from_datetime((when_local - datetime.timedelta(hours=12)).astimezone(pytz.utc).replace(tzinfo=None))
        t1 = self.ts.from_datetime((when_local + datetime.timedelta(hours=36)).astimezone(pytz.utc).replace(tzinfo=None))
        f = almanac.sunrise_sunset(eph, wgs84.latlon(lat,lon))
        times, events = almanac.find_discrete(t0, t1, f)
        sunrise_local = None
        for ti, ev in zip(times, events):
            if ev == 1:  # sunrise event
                dt_utc = ti.utc_datetime().replace(tzinfo=pytz.utc)
                # convert to local
                dt_local = dt_utc.astimezone(tz)
                # find first sunrise after previous midnight
                if dt_local.date() == when_local.date():
                    sunrise_local = dt_local
                    break
        if sunrise_local is None:
            # fallback: approximate sunrise at 6:00 local
            sunrise_local = when_local.replace(hour=6, minute=0, second=0, microsecond=0)
        # hora length = (sunset - sunrise) / 12? Traditional hora is 1 hour from sunrise cycles of planets each hour; using simple hourly slices from sunrise
        delta = when_local - sunrise_local
        total_minutes = delta.total_seconds()/60.0
        hora_index = int(math.floor(total_minutes / 60.0)) % 7
        hora_planet = HORA_ORDER[hora_index]
        offset_minutes = total_minutes - hora_index*60.0
        return {'hora_planet': hora_planet, 'hora_index': hora_index, 'offset_minutes': offset_minutes, 'sunrise_local': sunrise_local.isoformat()}

    # ---------- Aspects & angular relations ----------
    def planetary_aspects(self, when_dt):
        """
        Compute major aspects among planets (conjunction, opposition, trine, square, sextile)
        Returns a list of tuples (p1,p2,angle,aspect_name)
        """
        aspects = []
        t = self.ts.from_datetime(when_dt)
        longs = {}
        for p in PLANETS.keys():
            longs[p] = self._get_planet_longitude(p, t)
        # aspect definitions (deg +- orb)
        aspect_defs = [
            ('conjunction', 0, 6),
            ('sextile', 60, 4),
            ('square', 90, 4),
            ('trine', 120, 4),
            ('opposition', 180, 6),
        ]
        keys = list(longs.keys())
        for i in range(len(keys)):
            for j in range(i+1, len(keys)):
                p1 = keys[i]; p2 = keys[j]
                a = abs(((longs[p1]-longs[p2]+540) % 360)-180)  # angular separation into 0..180
                for name, ang, orb in aspect_defs:
                    if abs(a - ang) <= orb:
                        aspects.append((p1,p2,ang,name))
                        break
        return aspects

    # ---------- Scoring ----------
    def score_time(self, when_dt, lat, lon, sector=None, tz='Asia/Kolkata'):
        """
        Primary function to compute an internal score for a given datetime + location + optional sector.
        Returns: (score, details) where details is a dict describing components.
        """
        # compute primitive quantities
        tithi = self.compute_tithi(when_dt)
        nak = self.compute_nakshatra(when_dt)
        hora = self.compute_hora(when_dt, lat, lon, tz_str=tz)
        aspects = self.planetary_aspects(when_dt)
        # base score
        score = float(self.weights.get('base_score', DEFAULT_WEIGHTS['base_score']))
        reasons = []
        # hora bias
        hora_planet = hora['hora_planet']
        hb = HORA_BIAS.get(hora_planet, 0)
        hora_contrib = hb * self.weights.get('hora_score',1.0)
        score += hora_contrib
        reasons.append(('hora', hora_planet, hb, hora_contrib))
        # tithi modifier (use mapping or default)
        tmod = 0
        try:
            tmod = TITHI_MOD.get(tithi['tithi']%10, 0)  # simple mapping fallback
        except:
            tmod = 0
        tithi_contrib = tmod * self.weights.get('tithi_score',1.0)
        score += tithi_contrib
        reasons.append(('tithi', tithi['tithi'], tmod, tithi_contrib))
        # nakshatra
        nk_idx = nak['nakshatra_index']
        nk_bias = float(NAKSHATRA_BIAS[nk_idx]) if nk_idx < len(NAKSHATRA_BIAS) else 0.0
        nak_contrib = nk_bias * self.weights.get('nakshatra_score',1.0)
        score += nak_contrib
        reasons.append(('nakshatra', nk_idx, nk_bias, nak_contrib))
        # aspects penalties (e.g. Rahu/Ketu or malefic aspects)
        aspect_pen = 0.0
        for (p1,p2,ang,name) in aspects:
            # penalize if malefic planets involved or hard aspects
            if name in ('square','opposition'):
                # increase penalty if mars/saturn/rahu involved
                if any(x in ('mars','saturn','rahu','ketu') for x in (p1,p2)):
                    aspect_pen += 2.0
                else:
                    aspect_pen += 1.0
            elif name == 'conjunction':
                # conjunction with malefic reduces score
                if any(x in ('mars','saturn','rahu','ketu') for x in (p1,p2)):
                    aspect_pen += 1.5
        aspect_pen *= self.weights.get('aspect_penalty',1.0)
        score -= aspect_pen
        reasons.append(('aspects', len(aspects), aspect_pen, None))
        # retrograde penalties
        retro_pen = 0.0
        for p in ['mercury','mars','jupiter','saturn']:
            try:
                if self._is_retrograde(p, when_dt):
                    retro_pen += 1.0
            except Exception:
                pass
        retro_pen *= self.weights.get('retrograde_penalty',1.0)
        score -= retro_pen
        reasons.append(('retrograde', retro_pen, None, None))
        # sector bias multiplier (if sector provided)
        sector_mult = 1.0
        if sector:
            grahas = SECTOR_GRAHA_MAP.get(sector.lower(), [])
            # compute strengthen factor if any graha of sector is strong in this hour
            strengthen = 0.0
            for g in grahas:
                # if hora planet equals graha -> boost
                if hora_planet == g:
                    strengthen += 1.0
            sector_mult = 1.0 + strengthen * (self.weights.get('sector_bias',1.0) * 0.1)
            reasons.append(('sector_bias', sector, strengthen, sector_mult))
        # final score application
        final_score = score * sector_mult
        details = {
            'raw_score': score,
            'final_score': final_score,
            'components': reasons,
            'tithi': tithi,
            'nakshatra': nak,
            'hora': hora,
            'aspects': aspects
        }
        return final_score, details

    # ---------- Calibration hooks ----------
    def calibrate_weights(self, training_examples, initial_weights=None, max_iter=200):
        """
        Calibrate weights using a simple optimizer. training_examples is a list of dicts:
            {'when': datetime, 'lat': float, 'lon': float, 'sector': str or None, 'label': observed_success_binary_or_numeric}
        The optimizer will try to adjust weights so that score correlates with label.
        This uses a least-squares style objective on score->label mapping (simple).
        """
        if initial_weights is None:
            initial_weights = dict(self.weights)
        # flatten weight vector
        keys = ['hora_score','tithi_score','nakshatra_score','aspect_penalty','retrograde_penalty','sector_bias','base_score']
        x0 = np.array([initial_weights[k] for k in keys], dtype=float)

        # build X, y dataset
        X = []
        y = []
        for ex in training_examples:
            s, d = self.score_time(ex['when'], ex['lat'], ex['lon'], sector=ex.get('sector'))
            X.append([d['raw_score']])  # very simple feature: raw score
            y.append(float(ex['label']))
        X = np.array(X)
        y = np.array(y)

        # objective: minimize mean squared error between sigmoid(score_scaled) and y
        def obj(vec):
            # put back into weights
            for i,k in enumerate(keys):
                self.weights[k] = float(vec[i])
            preds = []
            for ex in training_examples:
                s,d = self.score_time(ex['when'], ex['lat'], ex['lon'], sector=ex.get('sector'))
                # map raw final_score to probability via logistic
                p = 1.0/(1.0+math.exp(-0.1*(d['final_score'] - 10.0)))
                preds.append(p)
            preds = np.array(preds)
            return float(np.mean((preds - y)**2))
        res = minimize(obj, x0, method='Powell', options={'maxiter': max_iter})
        # save weights after optimization
        for i,k in enumerate(keys):
            self.weights[k] = float(res.x[i])
        self.save_weights()
        return res

    # ---------- Vectorized & Optimized Batch Processing ----------
    def precompute_daily_positions(self, date: datetime.date, interval_minutes: int = 15) -> Dict:
        """
        Precompute planetary positions for a full day at specified intervals.
        This is ideal for intraday trading where multiple stocks need predictions.
        """
        cache_key = f"{date.isoformat()}_{interval_minutes}"
        if cache_key in self._daily_cache:
            return self._daily_cache[cache_key]
        
        # Generate time points for the day
        start_dt = datetime.datetime.combine(date, datetime.time(0, 0))
        time_points = []
        positions = {}
        
        # Create array of times (vectorized approach)
        minutes_in_day = 24 * 60
        num_points = minutes_in_day // interval_minutes
        
        for i in range(num_points):
            dt = start_dt + datetime.timedelta(minutes=i * interval_minutes)
            time_points.append(dt)
        
        # Vectorized computation using skyfield
        skyfield_times = [self.ts.from_datetime(dt) for dt in time_points]
        
        # Compute all planetary positions in batch
        for planet_key in PLANETS.keys():
            planet_positions = []
            for t in skyfield_times:
                try:
                    pos = self._get_planet_longitude(planet_key, t)
                    planet_positions.append(pos)
                except Exception:
                    planet_positions.append(None)
            positions[planet_key] = dict(zip(time_points, planet_positions))
        
        # Cache the results
        self._daily_cache[cache_key] = positions
        
        # Limit cache size
        if len(self._daily_cache) > 7:  # Keep only 7 days
            oldest_key = min(self._daily_cache.keys())
            del self._daily_cache[oldest_key]
        
        return positions
    
    def batch_score_optimized(self, datetimes: List[datetime.datetime], lat: float, lon: float, sector: Optional[str] = None) -> List[Tuple]:
        """
        Optimized batch scoring using precomputed positions.
        Groups by date and uses vectorized computations.
        """
        results = []
        dates_to_precompute = set(dt.date() for dt in datetimes)
        
        # Precompute positions for all required dates
        for date in dates_to_precompute:
            self.precompute_daily_positions(date)
        
        # Score each datetime using cached positions
        for dt in datetimes:
            try:
                s, d = self.score_time(dt, lat, lon, sector=sector)
                results.append((s, d))
            except Exception as e:
                print(f"⚠️ Scoring failed for {dt}: {e}")
                # Fallback with neutral score
                results.append((10.0, {'error': str(e), 'fallback': True}))
        
        return results
    
    @lru_cache(maxsize=1000)
    def _cached_hora_computation(self, dt_str: str, lat: float, lon: float, tz_str: str) -> Dict:
        """
        LRU cached hora computation for frequently requested times.
        """
        dt = datetime.datetime.fromisoformat(dt_str)
        return self.compute_hora(dt, lat, lon, tz_str)
    
    def batch_score(self, datetimes, lat, lon, sector=None):
        """
        Legacy batch scoring method - now redirects to optimized version.
        """
        return self.batch_score_optimized(datetimes, lat, lon, sector)

# ---------- Example usage helper ----------
def example():
    eng = AstroEngine()
    now = datetime.datetime.now(pytz.timezone('Asia/Kolkata'))
    score, details = eng.score_time(now, 19.075983, 72.877655, sector='it', tz='Asia/Kolkata')
    print("Score:", score)
    print("Details:", details)

if __name__ == "__main__":
    example()
