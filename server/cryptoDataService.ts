import axios from 'axios';

// Primary source: CoinGecko public API (free, no key needed; optional COINGECKO_API_KEY demo key raises limits).
// Fallback for quotes only: Finnhub (needs FINNHUB_API_KEY).
const COINGECKO_BASE_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const CG_HEADERS: Record<string, string> = COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {};

export interface CryptoQuote {
  symbol: string;
  name: string;
  lastPrice: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  marketCap: number;
  high24h: number;
  low24h: number;
  timestamp: Date;
  astrologyBias?: number;
  horaInfluence?: string;
  adjustedPrice?: number;
}

export interface CryptoOverview {
  totalMarketCap: number;
  totalVolume: number;
  marketCapChange24h: number;
  topGainers: CryptoQuote[];
  topLosers: CryptoQuote[];
  mostActive: CryptoQuote[];
}

const FINNHUB_SYMBOL_MAP: Record<string, string> = {
  'BTC':   'BINANCE:BTCUSDT',
  'ETH':   'BINANCE:ETHUSDT',
  'BNB':   'BINANCE:BNBUSDT',
  'ADA':   'BINANCE:ADAUSDT',
  'SOL':   'BINANCE:SOLUSDT',
  'XRP':   'BINANCE:XRPUSDT',
  'DOT':   'BINANCE:DOTUSDT',
  'MATIC': 'BINANCE:MATICUSDT',
  'AVAX':  'BINANCE:AVAXUSDT',
  'ATOM':  'BINANCE:ATOMUSDT',
  'LINK':  'BINANCE:LINKUSDT',
  'UNI':   'BINANCE:UNIUSDT',
  'LTC':   'BINANCE:LTCUSDT',
  'BCH':   'BINANCE:BCHUSDT',
  'ALGO':  'BINANCE:ALGOUSDT',
  'VET':   'BINANCE:VETUSDT',
  'FIL':   'BINANCE:FILUSDT',
  'DOGE':  'BINANCE:DOGEUSDT',
  'SHIB':  'BINANCE:SHIBUSDT',
  'TRX':   'BINANCE:TRXUSDT',
  'NEAR':  'BINANCE:NEARUSDT',
  'APT':   'BINANCE:APTUSDT',
  'ARB':   'BINANCE:ARBUSDT',
  'OP':    'BINANCE:OPUSDT',
  'INJ':   'BINANCE:INJUSDT',
  'SUI':   'BINANCE:SUIUSDT',
};

const CRYPTO_NAMES: Record<string, string> = {
  'BTC':   'Bitcoin',
  'ETH':   'Ethereum',
  'BNB':   'BNB',
  'ADA':   'Cardano',
  'SOL':   'Solana',
  'XRP':   'XRP',
  'DOT':   'Polkadot',
  'MATIC': 'Polygon',
  'AVAX':  'Avalanche',
  'ATOM':  'Cosmos',
  'LINK':  'Chainlink',
  'UNI':   'Uniswap',
  'LTC':   'Litecoin',
  'BCH':   'Bitcoin Cash',
  'ALGO':  'Algorand',
  'VET':   'VeChain',
  'FIL':   'Filecoin',
  'DOGE':  'Dogecoin',
  'SHIB':  'Shiba Inu',
  'TRX':   'TRON',
  'NEAR':  'NEAR Protocol',
  'APT':   'Aptos',
  'ARB':   'Arbitrum',
  'OP':    'Optimism',
  'INJ':   'Injective',
  'SUI':   'Sui',
};


// Deterministic pseudo-random fraction in [0,1) from symbol + hour (no Math.random)
function seededFraction(symbol: string, hour: number): number {
  let x = 0;
  for (const c of symbol) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  x = Math.imul(x ^ (hour * 40503), 2654435761) >>> 0;
  return (x % 1000) / 1000;
}

function calculateCryptoAstrologyBias(symbol: string): { bias: number; hora: string } {
  const hour = new Date().getHours();
  const horaRulers = [
    'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars',
    'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars',
    'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars',
    'Sun', 'Venus', 'Mercury'
  ];
  const currentHora = horaRulers[hour];
  const rnd = seededFraction(symbol, hour);
  const cryptoInfluence: Record<string, { base: number; volatility: number }> = {
    'BTC':   { base: 2, volatility: 1.2 },
    'ETH':   { base: 1, volatility: 1.1 },
    'BNB':   { base: 0, volatility: 0.9 },
    'ADA':   { base: 1, volatility: 0.8 },
    'SOL':   { base: 2, volatility: 1.3 },
    'XRP':   { base: -1, volatility: 1.1 },
    'DOT':   { base: 1, volatility: 1.0 },
    'MATIC': { base: 1, volatility: 0.9 },
    'AVAX':  { base: 1, volatility: 1.2 },
    'ATOM':  { base: 0, volatility: 1.0 },
  };
  const cryptoData = cryptoInfluence[symbol] || { base: 0, volatility: 1.0 };
  const symbolHash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const horaIndex = horaRulers.indexOf(currentHora);
  let bias = ((symbolHash * horaIndex) % 11) - 5 + cryptoData.base;
  switch (currentHora) {
    case 'Jupiter': bias += rnd > 0.5 ? 2 : 1; break;
    case 'Venus':   bias += rnd > 0.6 ? 1 : 0; break;
    case 'Saturn':  bias -= rnd > 0.5 ? 2 : 1; break;
    case 'Mars':    bias += rnd > 0.5 ? 2 : -2; break;
    case 'Mercury': bias += rnd > 0.7 ? 1 : 0; break;
    case 'Moon':    bias += (rnd - 0.5) * 3; break;
    case 'Sun':     bias += rnd > 0.6 ? 1 : 0; break;
  }
  bias *= cryptoData.volatility;
  bias = Math.max(-5, Math.min(5, Math.round(bias)));
  return { bias, hora: currentHora };
}

function applyCryptoAstrologyBias(quote: CryptoQuote): CryptoQuote {
  const { bias, hora } = calculateCryptoAstrologyBias(quote.symbol);
  return {
    ...quote,
    astrologyBias: bias,
    horaInfluence: hora,
    adjustedPrice: quote.lastPrice, // real market price — astro bias is a signal only, never alters price
  };
}

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', ADA: 'cardano', SOL: 'solana', XRP: 'ripple',
  DOT: 'polkadot', MATIC: 'polygon-ecosystem-token', AVAX: 'avalanche-2', ATOM: 'cosmos', LINK: 'chainlink',
  UNI: 'uniswap', LTC: 'litecoin', BCH: 'bitcoin-cash', ALGO: 'algorand', VET: 'vechain', FIL: 'filecoin',
  DOGE: 'dogecoin', SHIB: 'shiba-inu', TRX: 'tron', NEAR: 'near', APT: 'aptos', ARB: 'arbitrum',
  OP: 'optimism', INJ: 'injective-protocol', SUI: 'sui',
};

export class CryptoDataService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 60000;            // quotes: 1 min
  private readonly HISTORY_TTL = 10 * 60000;     // history: 10 min
  private readonly STALE_MAX = 6 * 60 * 60000;   // serve stale data up to 6h if the API is down/rate-limited

  private ttlFor(key: string): number { return key.startsWith('crypto_hist_') ? this.HISTORY_TTL : this.CACHE_TTL; }
  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    return Boolean(cached && (Date.now() - cached.timestamp) < this.ttlFor(key));
  }
  private getCachedData(key: string): any { return this.cache.get(key)?.data ?? null; }
  private getStale(key: string): any {
    const cached = this.cache.get(key);
    return cached && (Date.now() - cached.timestamp) < this.STALE_MAX ? cached.data : null;
  }
  private setCacheData(key: string, data: any): void { this.cache.set(key, { data, timestamp: Date.now() }); }

  private async cg<T = any>(path: string, params: Record<string, any> = {}): Promise<T> {
    const res = await axios.get(`${COINGECKO_BASE_URL}${path}`, { params, headers: CG_HEADERS, timeout: 10000 });
    return res.data as T;
  }

  private marketRowToQuote(row: any, symbol: string): CryptoQuote | null {
    const price = Number(row?.current_price);
    if (!isFinite(price) || price <= 0) return null;
    return applyCryptoAstrologyBias({
      symbol,
      name:             CRYPTO_NAMES[symbol] || row.name || symbol,
      lastPrice:        price,
      change24h:        Number(row.price_change_24h) || 0,
      changePercent24h: Number(row.price_change_percentage_24h) || 0,
      volume24h:        Number(row.total_volume) || 0,
      marketCap:        Number(row.market_cap) || 0,
      high24h:          Number(row.high_24h) || price,
      low24h:           Number(row.low_24h) || price,
      timestamp:        new Date(),
    });
  }

  /** Batch-fetch quotes for many symbols in ONE CoinGecko call (price, volume, market cap, 24h range). */
  private async fetchMarkets(symbols: string[]): Promise<CryptoQuote[]> {
    const wanted = symbols.map(s => s.toUpperCase()).filter(s => COINGECKO_IDS[s]);
    if (wanted.length === 0) return [];
    const rows = await this.cg<any[]>('/coins/markets', {
      vs_currency: 'usd', ids: wanted.map(s => COINGECKO_IDS[s]).join(','),
      per_page: 250, page: 1, sparkline: false, price_change_percentage: '24h',
    });
    const byId = new Map<string, any>((rows || []).map(r => [r.id, r]));
    const out: CryptoQuote[] = [];
    for (const sym of wanted) {
      const q = this.marketRowToQuote(byId.get(COINGECKO_IDS[sym]), sym);
      if (q) { out.push(q); this.setCacheData(`crypto_quote_${sym}`, q); }
    }
    return out;
  }

  private async finnhubQuote(symbol: string): Promise<CryptoQuote | null> {
    const finnhubSymbol = FINNHUB_SYMBOL_MAP[symbol];
    if (!finnhubSymbol || !FINNHUB_API_KEY) return null;
    const quoteRes = await axios.get(`${FINNHUB_BASE_URL}/quote`, { params: { symbol: finnhubSymbol, token: FINNHUB_API_KEY }, timeout: 8000 });
    const q = quoteRes.data;
    if (!q || !q.c) return null;
    return applyCryptoAstrologyBias({
      symbol, name: CRYPTO_NAMES[symbol] || symbol, lastPrice: q.c, change24h: q.d ?? 0, changePercent24h: q.dp ?? 0,
      volume24h: 0, marketCap: 0, high24h: q.h ?? q.c, low24h: q.l ?? q.c, timestamp: new Date(),
    });
  }

  async getCryptoQuote(symbol: string): Promise<CryptoQuote | null> {
    symbol = symbol.toUpperCase();
    const cacheKey = `crypto_quote_${symbol}`;
    if (this.isCacheValid(cacheKey)) return this.getCachedData(cacheKey);
    if (!COINGECKO_IDS[symbol] && !FINNHUB_SYMBOL_MAP[symbol]) return null;

    try {
      const [q] = await this.fetchMarkets([symbol]);
      if (q) return q;
    } catch (error: any) {
      console.error(`[Crypto] CoinGecko quote failed for ${symbol}: ${error?.response?.status || error?.message}`);
    }
    try {
      const q = await this.finnhubQuote(symbol);
      if (q) { this.setCacheData(cacheKey, q); return q; }
    } catch (error: any) {
      console.error(`[Crypto] Finnhub quote failed for ${symbol}: ${error?.response?.status || error?.message}`);
    }
    return this.getStale(cacheKey); // last known real quote, or null
  }

  async getCryptoOverview(): Promise<CryptoOverview> {
    const cacheKey = 'crypto_overview';
    if (this.isCacheValid(cacheKey)) return this.getCachedData(cacheKey);
    const empty: CryptoOverview = { totalMarketCap: 0, totalVolume: 0, marketCapChange24h: 0, topGainers: [], topLosers: [], mostActive: [] };
    try {
      const topSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'MATIC', 'AVAX', 'LINK'];
      let quotes: CryptoQuote[] = [];
      try { quotes = await this.fetchMarkets(topSymbols); }
      catch { quotes = (await Promise.all(topSymbols.map(s => this.getCryptoQuote(s)))).filter(Boolean) as CryptoQuote[]; }
      if (quotes.length === 0) return this.getStale(cacheKey) || empty;

      let totalMarketCap = quotes.reduce((sum, q) => sum + (q.marketCap || 0), 0);
      let marketCapChange24h = 0;
      try {
        const g = (await this.cg('/global'))?.data;
        if (g?.total_market_cap?.usd) totalMarketCap = g.total_market_cap.usd;
        marketCapChange24h = Number(g?.market_cap_change_percentage_24h_usd) || 0;
      } catch { /* keep sum of top coins */ }

      const sortedByChange = [...quotes].sort((a, b) => (b.changePercent24h || 0) - (a.changePercent24h || 0));
      const sortedByVolume = [...quotes].sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
      const overview: CryptoOverview = {
        totalMarketCap,
        totalVolume: quotes.reduce((sum, q) => sum + (q.volume24h || 0), 0),
        marketCapChange24h,
        topGainers: sortedByChange.slice(0, 5),
        topLosers:  sortedByChange.slice(-5).reverse(),
        mostActive: sortedByVolume.slice(0, 5),
      };
      this.setCacheData(cacheKey, overview);
      return overview;
    } catch (error) {
      console.error('Error fetching crypto overview:', error);
      return this.getStale(cacheKey) || empty;
    }
  }

  /**
   * Real daily OHLCV bars from CoinGecko (used for RSI/MACD/ATR etc.).
   * OHLC comes from /ohlc (aggregated per UTC day), volume from /market_chart. Returns [] if unavailable.
   */
  async getCryptoHistoricalData(symbol: string, days: number = 30): Promise<any[]> {
    symbol = symbol.toUpperCase();
    const id = COINGECKO_IDS[symbol];
    if (!id) return [];
    days = Math.max(7, Math.min(90, Math.floor(days) || 30));
    const cacheKey = `crypto_hist_${symbol}_${days}`;
    if (this.isCacheValid(cacheKey)) return this.getCachedData(cacheKey);

    try {
      const [ohlc, chart] = await Promise.all([
        this.cg<number[][]>(`/coins/${id}/ohlc`, { vs_currency: 'usd', days }),
        this.cg<any>(`/coins/${id}/market_chart`, { vs_currency: 'usd', days, interval: 'daily' }).catch(() => null),
      ]);

      const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const volByDay = new Map<string, number>();
      for (const [ts, v] of (chart?.total_volumes || [])) volByDay.set(dayKey(ts), v);

      // Aggregate candles (4h/4-day) into UTC daily bars
      const byDay = new Map<string, { ts: number; open: number; high: number; low: number; close: number }>();
      for (const row of (ohlc || [])) {
        const [ts, o, h, l, c] = row;
        if (![o, h, l, c].every(n => isFinite(n) && n > 0)) continue;
        const k = dayKey(ts);
        const cur = byDay.get(k);
        if (!cur) byDay.set(k, { ts, open: o, high: h, low: l, close: c });
        else { cur.high = Math.max(cur.high, h); cur.low = Math.min(cur.low, l); cur.close = c; }
      }
      const bars = Array.from(byDay.entries())
        .sort((a, b) => a[1].ts - b[1].ts)
        .map(([k, b]) => ({
          date: new Date(k + 'T00:00:00Z'),
          timestamp: Math.floor(b.ts / 1000),
          open: b.open, high: b.high, low: b.low, close: b.close,
          volume: volByDay.get(k) ?? 0,
        }));
      if (bars.length === 0) return this.getStale(cacheKey) || [];
      this.setCacheData(cacheKey, bars);
      return bars;
    } catch (error: any) {
      console.error(`[Crypto] CoinGecko history failed for ${symbol}: ${error?.response?.status || error?.message}`);
      return this.getStale(cacheKey) || [];
    }
  }

  async searchCryptos(query: string): Promise<CryptoQuote[]> {
    try {
      const queryLower = query.toLowerCase().trim();
      const matched = Object.entries(CRYPTO_NAMES)
        .map(([symbol, name]) => ({ symbol, name }))
        .filter(({ symbol, name }) => symbol.toLowerCase().includes(queryLower) || name.toLowerCase().includes(queryLower))
        .sort((a, b) => {
          if (a.symbol.toLowerCase() === queryLower) return -1;
          if (b.symbol.toLowerCase() === queryLower) return 1;
          if (a.symbol.toLowerCase().startsWith(queryLower)) return -1;
          if (b.symbol.toLowerCase().startsWith(queryLower)) return 1;
          return a.symbol.localeCompare(b.symbol);
        })
        .slice(0, 12);
      if (matched.length === 0) return [];
      try {
        const quotes = await this.fetchMarkets(matched.map(m => m.symbol));
        const order = new Map(matched.map((m, i) => [m.symbol, i]));
        return quotes.sort((a, b) => (order.get(a.symbol) ?? 0) - (order.get(b.symbol) ?? 0));
      } catch {
        const quotes: CryptoQuote[] = [];
        for (const m of matched) { const q = await this.getCryptoQuote(m.symbol); if (q) quotes.push(q); }
        return quotes;
      }
    } catch (error) {
      console.error('Error searching cryptos:', error);
      return [];
    }
  }
}

export const cryptoDataService = new CryptoDataService();
