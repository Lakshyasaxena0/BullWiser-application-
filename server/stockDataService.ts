import YahooFinanceLib from 'yahoo-finance2';
const yahooFinance = new (YahooFinanceLib as any)({ suppressNotices: ['yahooSurvey'] });

export interface StockQuote {
  symbol: string;
  companyName?: string;
  exchange: 'NSE' | 'BSE';
  lastPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  marketCap?: number;
  previousClose: number;
  timestamp: Date;
  astrologyBias?: number;
  horaInfluence?: string;
  adjustedPrice?: number;
}

export interface IndexData {
  name: string;
  value: number;
  change: number;
  changePercent: number;
  timestamp: Date;
}

export interface MarketOverview {
  indices: {
    nifty50: IndexData;
    sensex: IndexData;
    bankNifty: IndexData;
    niftyIT: IndexData;
  };
  topGainers: StockQuote[];
  topLosers: StockQuote[];
  mostActive: StockQuote[];
}

const NSE_COMPANY_NAMES: Record<string, string> = {
  'RELIANCE':   'Reliance Industries Ltd.',
  'TCS':        'Tata Consultancy Services Ltd.',
  'HDFCBANK':   'HDFC Bank Ltd.',
  'INFY':       'Infosys Ltd.',
  'ICICIBANK':  'ICICI Bank Ltd.',
  'KOTAKBANK':  'Kotak Mahindra Bank Ltd.',
  'HINDUNILVR': 'Hindustan Unilever Ltd.',
  'SBIN':       'State Bank of India',
  'BAJFINANCE': 'Bajaj Finance Ltd.',
  'BHARTIARTL': 'Bharti Airtel Ltd.',
  'ITC':        'ITC Ltd.',
  'AXISBANK':   'Axis Bank Ltd.',
  'LT':         'Larsen & Toubro Ltd.',
  'ASIANPAINT': 'Asian Paints Ltd.',
  'DMART':      'Avenue Supermarts Ltd.',
  'WIPRO':      'Wipro Ltd.',
  'MARUTI':     'Maruti Suzuki India Ltd.',
  'TITAN':      'Titan Company Ltd.',
  'NESTLEIND':  'Nestle India Ltd.',
  'SUNPHARMA':  'Sun Pharmaceutical Industries Ltd.',
  'ADANIGREEN': 'Adani Green Energy Ltd.',
  'ADANIENT':   'Adani Enterprises Ltd.',
  'ADANIPORTS': 'Adani Ports and SEZ Ltd.',
  'TATAMOTORS': 'Tata Motors Ltd.',
  'TATASTEEL':  'Tata Steel Ltd.',
  'JSWSTEEL':   'JSW Steel Ltd.',
  'POWERGRID':  'Power Grid Corporation of India Ltd.',
  'NTPC':       'NTPC Ltd.',
  'ONGC':       'Oil & Natural Gas Corporation Ltd.',
  'COALINDIA':  'Coal India Ltd.',
  'ULTRACEMCO': 'UltraTech Cement Ltd.',
  'GRASIM':     'Grasim Industries Ltd.',
  'DRREDDY':    "Dr. Reddy's Laboratories Ltd.",
  'CIPLA':      'Cipla Ltd.',
  'APOLLOHOSP': 'Apollo Hospitals Enterprise Ltd.',
  'HINDALCO':   'Hindalco Industries Ltd.',
  'TECHM':      'Tech Mahindra Ltd.',
  'HCLTECH':    'HCL Technologies Ltd.',
  'BPCL':       'Bharat Petroleum Corporation Ltd.',
  'IOC':        'Indian Oil Corporation Ltd.',
  'DIVISLAB':   "Divi's Laboratories Ltd.",
  'BRITANNIA':  'Britannia Industries Ltd.',
  'VEDL':       'Vedanta Ltd.',
  'EICHERMOT':  'Eicher Motors Ltd.',
  'UPL':        'UPL Ltd.',
  'SHREECEM':   'Shree Cement Ltd.',
  'INDUSINDBK': 'IndusInd Bank Ltd.',
  'HEROMOTOCO': 'Hero MotoCorp Ltd.',
  'BAJAJFINSV': 'Bajaj Finserv Ltd.',
  'SUZLON':     'Suzlon Energy Ltd.',
  'ZOMATO':     'Zomato Ltd.',
  'PAYTM':      'One97 Communications Ltd.',
  'NYKAA':      'FSN E-Commerce Ventures Ltd.',
  'IRCTC':      'Indian Railway Catering & Tourism Corporation',
  'PNB':        'Punjab National Bank',
  'BANKBARODA': 'Bank of Baroda',
  'CANBK':      'Canara Bank',
  'YESBANK':    'Yes Bank Ltd.',
  'IDBI':       'IDBI Bank Ltd.',
};


// Deterministic pseudo-random fraction in [0,1) from symbol + hour (no Math.random)
function seededFraction(symbol: string, hour: number): number {
  let x = 0;
  for (const c of symbol) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  x = Math.imul(x ^ (hour * 40503), 2654435761) >>> 0;
  return (x % 1000) / 1000;
}

function calculateAstrologyBias(symbol: string): { bias: number; hora: string } {
  const hour = new Date().getHours();
  const horaRulers = [
    'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars',
    'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars',
    'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars',
    'Sun', 'Venus', 'Mercury'
  ];
  const currentHora = horaRulers[hour];
  const rnd = seededFraction(symbol, hour);
  const symbolHash = symbol.charCodeAt(0) + symbol.length;
  const horaIndex = horaRulers.indexOf(currentHora);
  let bias = ((symbolHash * horaIndex) % 11) - 5;
  switch (currentHora) {
    case 'Jupiter': bias += rnd > 0.5 ? 2 : 1; break;
    case 'Venus':   bias += rnd > 0.6 ? 1 : 0; break;
    case 'Saturn':  bias -= rnd > 0.5 ? 2 : 1; break;
    case 'Mars':    bias += rnd > 0.5 ? 1 : -1; break;
    case 'Mercury': bias += rnd > 0.7 ? 1 : 0; break;
    case 'Moon':    bias += (rnd - 0.5) * 2; break;
    case 'Sun':     bias += rnd > 0.6 ? 1 : 0; break;
  }
  bias = Math.max(-5, Math.min(5, Math.round(bias)));
  return { bias, hora: currentHora };
}

function applyAstrologyBias(quote: StockQuote): StockQuote {
  const { bias, hora } = calculateAstrologyBias(quote.symbol);
    return {
    ...quote,
    astrologyBias: bias,
    horaInfluence: hora,
    adjustedPrice: quote.lastPrice, // real market price — astro bias is a signal only, never alters price
  };
}

export class StockDataService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 60000;

  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    return Boolean(cached && (Date.now() - cached.timestamp) < this.CACHE_TTL);
  }

  private getCachedData(key: string): any {
    return this.cache.get(key)?.data ?? null;
  }

  private setCacheData(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async getNSEQuote(symbol: string): Promise<StockQuote | null> {
    const cacheKey = `nse_quote_${symbol}`;
    if (this.isCacheValid(cacheKey)) return this.getCachedData(cacheKey);
    try {
      const data = await yahooFinance.quote(`${symbol}.NS`, {}, { validateResult: false });
      if (!data || !data.regularMarketPrice) return null;
      const quote: StockQuote = {
        symbol,
        companyName: data.shortName || NSE_COMPANY_NAMES[symbol] || symbol,
        exchange: 'NSE',
        lastPrice: data.regularMarketPrice,
        change: data.regularMarketChange ?? 0,
        changePercent: data.regularMarketChangePercent ?? 0,
        volume: data.regularMarketVolume ?? 0,
        openPrice: data.regularMarketOpen ?? data.regularMarketPrice,
        highPrice: data.regularMarketDayHigh ?? data.regularMarketPrice,
        lowPrice: data.regularMarketDayLow ?? data.regularMarketPrice,
        marketCap: data.marketCap ?? 0,
        previousClose: data.regularMarketPreviousClose ?? data.regularMarketPrice,
        timestamp: new Date(),
      };
      const biasedQuote = applyAstrologyBias(quote);
      this.setCacheData(cacheKey, biasedQuote);
      return biasedQuote;
    } catch (error) {
      console.error(`Error fetching Yahoo Finance NSE quote for ${symbol}:`, error);
      return null;
    }
  }

  async getBSEQuote(symbol: string): Promise<StockQuote | null> {
    const cacheKey = `bse_quote_${symbol}`;
    if (this.isCacheValid(cacheKey)) return this.getCachedData(cacheKey);
    try {
      const data = await yahooFinance.quote(`${symbol}.BO`, {}, { validateResult: false });
      if (!data || !data.regularMarketPrice) {
        const nseQuote = await this.getNSEQuote(symbol);
        if (!nseQuote) return null;
        return { ...nseQuote, exchange: 'BSE' };
      }
      const quote: StockQuote = {
        symbol,
        companyName: data.shortName || NSE_COMPANY_NAMES[symbol] || symbol,
        exchange: 'BSE',
        lastPrice: data.regularMarketPrice,
        change: data.regularMarketChange ?? 0,
        changePercent: data.regularMarketChangePercent ?? 0,
        volume: data.regularMarketVolume ?? 0,
        openPrice: data.regularMarketOpen ?? data.regularMarketPrice,
        highPrice: data.regularMarketDayHigh ?? data.regularMarketPrice,
        lowPrice: data.regularMarketDayLow ?? data.regularMarketPrice,
        marketCap: data.marketCap ?? 0,
        previousClose: data.regularMarketPreviousClose ?? data.regularMarketPrice,
        timestamp: new Date(),
      };
      const biasedQuote = applyAstrologyBias(quote);
      this.setCacheData(cacheKey, biasedQuote);
      return biasedQuote;
    } catch (error) {
      console.error(`Error fetching Yahoo Finance BSE quote for ${symbol}:`, error);
      return null;
    }
  }

  async getStockQuote(symbol: string, exchange?: 'NSE' | 'BSE'): Promise<StockQuote | null> {
    if (exchange === 'BSE') return this.getBSEQuote(symbol);
    if (exchange === 'NSE') return this.getNSEQuote(symbol);
    const nseQuote = await this.getNSEQuote(symbol);
    return nseQuote || this.getBSEQuote(symbol);
  }

  async getMarketIndices(): Promise<IndexData[]> {
    const cacheKey = 'market_indices';
    if (this.isCacheValid(cacheKey)) return this.getCachedData(cacheKey);
    try {
      const indexSymbols = [
        { yahoo: '^NSEI',    name: 'NIFTY 50'   },
        { yahoo: '^BSESN',   name: 'SENSEX'     },
        { yahoo: '^NSEBANK', name: 'BANK NIFTY' },
        { yahoo: '^CNXIT',   name: 'NIFTY IT'   },
      ];
      const results = await Promise.all(
        indexSymbols.map(async ({ yahoo, name }) => {
          try {
            const data = await yahooFinance.quote(yahoo, {}, { validateResult: false });
            if (!data || !data.regularMarketPrice) return null;
            return {
              name,
              value: data.regularMarketPrice,
              change: data.regularMarketChange ?? 0,
              changePercent: data.regularMarketChangePercent ?? 0,
              timestamp: new Date(),
            } as IndexData;
          } catch {
            return null;
          }
        })
      );
      const indexData = results.filter(Boolean) as IndexData[];
      this.setCacheData(cacheKey, indexData);
      return indexData;
    } catch (error) {
      console.error('Error fetching market indices:', error);
      return [];
    }
  }

  async getMarketOverview(): Promise<MarketOverview> {
    const cacheKey = 'market_overview';
    if (this.isCacheValid(cacheKey)) return this.getCachedData(cacheKey);
    const fallback: MarketOverview = {
      indices: {
        nifty50:   { name: 'NIFTY 50',   value: 0, change: 0, changePercent: 0, timestamp: new Date() },
        sensex:    { name: 'SENSEX',      value: 0, change: 0, changePercent: 0, timestamp: new Date() },
        bankNifty: { name: 'BANK NIFTY', value: 0, change: 0, changePercent: 0, timestamp: new Date() },
        niftyIT:   { name: 'NIFTY IT',   value: 0, change: 0, changePercent: 0, timestamp: new Date() },
      },
      topGainers: [],
      topLosers: [],
      mostActive: [],
    };
    try {
      const topStocks = [
        'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
        'KOTAKBANK', 'HINDUNILVR', 'SBIN', 'BAJFINANCE', 'BHARTIARTL',
      ];
      const [indices, stockQuotes] = await Promise.all([
        this.getMarketIndices(),
        Promise.all(topStocks.map(s => this.getNSEQuote(s))),
      ]);
      const validQuotes = stockQuotes.filter(Boolean) as StockQuote[];
      const sortedByChange = [...validQuotes].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
      const sortedByVolume = [...validQuotes].sort((a, b) => (b.volume || 0) - (a.volume || 0));
      const findIndex = (name: string): IndexData =>
        indices.find(i => i.name === name) ?? { name, value: 0, change: 0, changePercent: 0, timestamp: new Date() };
      const overview: MarketOverview = {
        indices: {
          nifty50:   findIndex('NIFTY 50'),
          sensex:    findIndex('SENSEX'),
          bankNifty: findIndex('BANK NIFTY'),
          niftyIT:   findIndex('NIFTY IT'),
        },
        topGainers: sortedByChange.slice(0, 5),
        topLosers:  sortedByChange.slice(-5).reverse(),
        mostActive: sortedByVolume.slice(0, 5),
      };
      this.setCacheData(cacheKey, overview);
      return overview;
    } catch (error) {
      console.error('Error fetching market overview:', error);
      return fallback;
    }
  }

  async getHistoricalData(symbol: string, days: number = 30): Promise<any[]> {
    const cacheKey = `historical_${symbol}_${days}`;
    if (this.isCacheValid(cacheKey)) return this.getCachedData(cacheKey);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
            const result = await yahooFinance.chart(`${symbol}.NS`, {
        period1: startDate,
        period2: endDate,
        interval: '1d',
      }, { validateResult: false });
      const data = result?.quotes || [];
      if (!data || data.length === 0) return [];
      const historicalData = data.map((entry: any) => ({
        date:                entry.date,
        open:                (entry.open ?? 0) ,
        high:                (entry.high ?? 0) ,
        low:                 (entry.low ?? 0) ,
        close:               (entry.close ?? 0) ,
        volume:              entry.volume ?? 0,
        CH_CLOSING_PRICE:    (entry.close ?? 0) ,
        CH_OPENING_PRICE:    (entry.open ?? 0) ,
        CH_TRADE_HIGH_PRICE: (entry.high ?? 0) ,
        CH_TRADE_LOW_PRICE:  (entry.low ?? 0) ,
        CH_TOT_TRADED_QTY:   entry.volume ?? 0,
        CH_TIMESTAMP:        entry.date,
      }));
      this.setCacheData(cacheKey, historicalData);
      return historicalData;
    } catch (error) {
      console.error(`Error fetching Yahoo Finance historical data for ${symbol}:`, error);
      return [];
    }
  }

  async searchStocks(query: string): Promise<Partial<StockQuote>[]> {
    try {
      const allStocks = Object.entries(NSE_COMPANY_NAMES).map(([symbol, companyName]) => ({ symbol, companyName }));
      const queryLower = query.toLowerCase().trim();

      const matched = allStocks
        .filter(({ symbol, companyName }) =>
          symbol.toLowerCase().includes(queryLower) ||
          companyName.toLowerCase().includes(queryLower)
        )
        .sort((a, b) => {
          if (a.symbol.toLowerCase() === queryLower) return -1;
          if (b.symbol.toLowerCase() === queryLower) return 1;
          if (a.symbol.toLowerCase().startsWith(queryLower)) return -1;
          if (b.symbol.toLowerCase().startsWith(queryLower)) return 1;
          return a.symbol.localeCompare(b.symbol);
        })
        .slice(0, 10);

      // ── FIX: Fetch quotes in parallel with a timeout, but always
      //         return the name-matched result even if the live quote fails.
      const results = await Promise.all(
        matched.map(async ({ symbol, companyName }) => {
          try {
            // Race the Yahoo Finance call against a 3-second timeout
            const quotePromise = this.getNSEQuote(symbol);
            const timeoutPromise = new Promise<null>(resolve =>
              setTimeout(() => resolve(null), 3000)
            );
            const quote = await Promise.race([quotePromise, timeoutPromise]);

            if (quote) {
              // Live data available — return full quote with company name
              return { ...quote, companyName };
            }
          } catch {
            // Swallow individual fetch errors
          }

          // Fallback: return the stock from our known list without a live price
          // The frontend will still show the result so the user can select it.
          return {
            symbol,
            companyName,
            exchange: 'NSE' as const,
            lastPrice: 0,          // 0 signals "price unavailable"
            change: 0,
            changePercent: 0,
            volume: 0,
            openPrice: 0,
            highPrice: 0,
            lowPrice: 0,
            previousClose: 0,
            timestamp: new Date(),
          } satisfies Partial<StockQuote>;
        })
      );

      return results;
    } catch (error) {
      console.error('Error searching stocks:', error);
      return [];
    }
  }
}

export const stockDataService = new StockDataService();
