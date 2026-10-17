
"""
astro_production.py

Production-ready wrapper for BullWiser astrology module
- Implements all optimization recommendations
- Redis caching support (when available)
- Parallel processing for batch operations
- Enhanced error handling and monitoring
- Performance metrics and logging
"""

import os
import time
import logging
from typing import List, Dict, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
import json

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

from astro_module import AstroEngine

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ProductionAstroEngine:
    def __init__(self, 
                 ephem_path: Optional[str] = None,
                 redis_url: Optional[str] = None,
                 cache_ttl: int = 3600,
                 max_workers: int = 4):
        
        self.engine = AstroEngine(ephem_path=ephem_path, cache_size=50000)
        self.cache_ttl = cache_ttl
        self.max_workers = max_workers
        
        # Redis cache setup
        self.redis_client = None
        if REDIS_AVAILABLE and redis_url:
            try:
                self.redis_client = redis.from_url(redis_url)
                self.redis_client.ping()
                logger.info("✅ Redis cache connected")
            except Exception as e:
                logger.warning(f"⚠️ Redis unavailable: {e}")
        
        # Performance metrics
        self.metrics = {
            'cache_hits': 0,
            'cache_misses': 0,
            'computation_time': [],
            'batch_operations': 0
        }
    
    def _get_cache_key(self, operation: str, *args) -> str:
        """Generate consistent cache keys"""
        key_parts = [operation] + [str(arg) for arg in args]
        return f"astro:{':'.join(key_parts)}"
    
    def _get_from_cache(self, key: str) -> Optional[Dict]:
        """Get from Redis cache if available, fallback to memory"""
        if self.redis_client:
            try:
                data = self.redis_client.get(key)
                if data:
                    self.metrics['cache_hits'] += 1
                    return json.loads(data)
            except Exception as e:
                logger.warning(f"Cache get error: {e}")
        
        self.metrics['cache_misses'] += 1
        return None
    
    def _set_cache(self, key: str, data: Dict) -> None:
        """Set in Redis cache if available"""
        if self.redis_client:
            try:
                self.redis_client.setex(
                    key, 
                    self.cache_ttl, 
                    json.dumps(data, default=str)
                )
            except Exception as e:
                logger.warning(f"Cache set error: {e}")
    
    def score_time_cached(self, 
                         when_dt: datetime, 
                         lat: float, 
                         lon: float, 
                         sector: Optional[str] = None, 
                         tz: str = 'Asia/Kolkata') -> Tuple[float, Dict]:
        """
        Cached version of score_time with production optimizations
        """
        # Create cache key
        cache_key = self._get_cache_key(
            'score', 
            when_dt.isoformat(), 
            lat, lon, sector or 'none', tz
        )
        
        # Check cache first
        cached_result = self._get_from_cache(cache_key)
        if cached_result:
            return cached_result['score'], cached_result['details']
        
        # Compute result
        start_time = time.time()
        try:
            score, details = self.engine.score_time(when_dt, lat, lon, sector, tz)
            computation_time = time.time() - start_time
            self.metrics['computation_time'].append(computation_time)
            
            # Cache result
            result = {'score': score, 'details': details}
            self._set_cache(cache_key, result)
            
            return score, details
            
        except Exception as e:
            logger.error(f"Scoring failed: {e}")
            # Return fallback neutral score
            fallback_details = {
                'error': str(e),
                'fallback': True,
                'final_score': 10.0,
                'raw_score': 10.0
            }
            return 10.0, fallback_details
    
    def batch_score_parallel(self, 
                           datetimes: List[datetime], 
                           lat: float, 
                           lon: float, 
                           sector: Optional[str] = None) -> List[Tuple]:
        """
        Parallel batch scoring with optimizations
        """
        self.metrics['batch_operations'] += 1
        
        # Group by date for precomputation optimization
        dates_to_precompute = set(dt.date() for dt in datetimes)
        
        # Precompute daily positions
        logger.info(f"Precomputing positions for {len(dates_to_precompute)} dates")
        for date in dates_to_precompute:
            self.engine.precompute_daily_positions(date)
        
        # Parallel processing
        results = [None] * len(datetimes)
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit all tasks
            future_to_index = {
                executor.submit(
                    self.score_time_cached, 
                    dt, lat, lon, sector
                ): i 
                for i, dt in enumerate(datetimes)
            }
            
            # Collect results
            for future in as_completed(future_to_index):
                index = future_to_index[future]
                try:
                    results[index] = future.result()
                except Exception as e:
                    logger.error(f"Parallel task failed: {e}")
                    results[index] = (10.0, {'error': str(e), 'fallback': True})
        
        return results
    
    def precompute_trading_day(self, 
                              date: datetime.date, 
                              lat: float = 19.0760, 
                              lon: float = 72.8777,
                              start_hour: int = 9,
                              end_hour: int = 15,
                              interval_minutes: int = 15) -> Dict:
        """
        Precompute all scores for a trading day and cache them
        """
        logger.info(f"Precomputing trading day {date}")
        
        # Generate trading hours
        trading_times = []
        start_dt = datetime.combine(date, datetime.min.time().replace(hour=start_hour))
        end_dt = datetime.combine(date, datetime.min.time().replace(hour=end_hour))
        
        current_dt = start_dt
        while current_dt <= end_dt:
            trading_times.append(current_dt)
            current_dt += timedelta(minutes=interval_minutes)
        
        # Batch compute all scores
        results = self.batch_score_parallel(trading_times, lat, lon)
        
        # Format and cache results
        trading_scores = {}
        for dt, (score, details) in zip(trading_times, results):
            time_key = dt.strftime('%H:%M')
            trading_scores[time_key] = {
                'score': score,
                'details': details,
                'datetime': dt.isoformat()
            }
        
        # Cache the full day
        cache_key = self._get_cache_key('trading_day', date.isoformat(), lat, lon)
        self._set_cache(cache_key, trading_scores)
        
        return trading_scores
    
    def get_performance_metrics(self) -> Dict:
        """Get performance metrics for monitoring"""
        avg_computation_time = (
            sum(self.metrics['computation_time']) / len(self.metrics['computation_time'])
            if self.metrics['computation_time'] else 0
        )
        
        cache_hit_rate = (
            self.metrics['cache_hits'] / 
            (self.metrics['cache_hits'] + self.metrics['cache_misses'])
            if (self.metrics['cache_hits'] + self.metrics['cache_misses']) > 0 else 0
        )
        
        return {
            'cache_hit_rate': cache_hit_rate,
            'avg_computation_time_ms': avg_computation_time * 1000,
            'total_operations': self.metrics['cache_hits'] + self.metrics['cache_misses'],
            'batch_operations': self.metrics['batch_operations'],
            'redis_available': self.redis_client is not None
        }

# Singleton instance for production use
_production_engine = None

def get_production_engine() -> ProductionAstroEngine:
    """Get or create production engine singleton"""
    global _production_engine
    if _production_engine is None:
        redis_url = os.environ.get('REDIS_URL')
        _production_engine = ProductionAstroEngine(redis_url=redis_url)
    return _production_engine
