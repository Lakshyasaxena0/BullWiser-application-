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


/** Liquid NSE universe scanned for gainers / losers / most-traded (large + mid caps across sectors). */
export const TRENDING_UNIVERSE = [
  'RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','KOTAKBANK','HINDUNILVR','SBIN','BAJFINANCE','BHARTIARTL','ITC','AXISBANK','LT','ASIANPAINT','MARUTI',
  'TITAN','NESTLEIND','SUNPHARMA','ULTRACEMCO','WIPRO','HCLTECH','TECHM','ADANIENT','ADANIPORTS','ADANIGREEN','ADANIPOWER','TATAMOTORS','TATASTEEL','TATAPOWER','TATACONSUM',
  'JSWSTEEL','POWERGRID','NTPC','ONGC','COALINDIA','GRASIM','DRREDDY','CIPLA','DIVISLAB','APOLLOHOSP','HINDALCO','BPCL','IOC','BRITANNIA','VEDL','EICHERMOT',
  'SHREECEM','INDUSINDBK','HEROMOTOCO','BAJAJFINSV','BAJAJ-AUTO','M&M','SBILIFE','HDFCLIFE','LICI','HAL','BEL','BDL','DLF','GODREJPROP','OBEROIRLTY',
  'ZOMATO','IRCTC','PNB','BANKBARODA','CANBK','IDFCFIRSTB','YESBANK','FEDERALBNK','SUZLON','IDEA','NHPC','RECLTD','PFC','IRFC','TRENT','DMART',
  'PIDILITIND','HAVELLS','SIEMENS','ABB','MUTHOOTFIN','CHOLAFIN','BHEL','SAIL','NMDC','GAIL','INDIGO','JIOFIN','VBL','POLYCAB','LUPIN','AUROPHARMA',
  'TORNTPHARM','MAXHEALTH','PERSISTENT','COFORGE','MPHASIS','LTIM','DIXON','BOSCHLTD','TVSMOTOR','ASHOKLEY','CUMMINSIND','JINDALSTEL','NATIONALUM','HINDPETRO',
];

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
      this.setCacheData(cacheKey, quote);
      return quote;
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
      this.setCacheData(cacheKey, quote);
      return quote;
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

  /** One batched Yahoo call for many NSE symbols (chunked) → map symbol → quote. Failed symbols are simply absent. */
  private async batchNseQuotes(symbols: string[]): Promise<StockQuote[]> {
    const out: StockQuote[] = [];
    const chunks: string[][] = []; for (let i = 0; i < symbols.length; i += 40) chunks.push(symbols.slice(i, i + 40));
    for (const chunk of chunks) {
      try {
        const rows = await yahooFinance.quote(chunk.map(sym => `${sym}.NS`), {}, { validateResult: false });
        for (const data of (Array.isArray(rows) ? rows : [rows])) {
          if (!data?.regularMarketPrice || !data.symbol) continue;
          const symbol = String(data.symbol).replace(/\.NS$/, '');
          out.push({
            symbol, companyName: data.shortName || NSE_COMPANY_NAMES[symbol] || symbol, exchange: 'NSE',
            lastPrice: data.regularMarketPrice, change: data.regularMarketChange ?? 0, changePercent: data.regularMarketChangePercent ?? 0,
            volume: data.regularMarketVolume ?? 0, openPrice: data.regularMarketOpen ?? data.regularMarketPrice,
            highPrice: data.regularMarketDayHigh ?? data.regularMarketPrice, lowPrice: data.regularMarketDayLow ?? data.regularMarketPrice,
            marketCap: data.marketCap ?? 0, previousClose: data.regularMarketPreviousClose ?? data.regularMarketPrice, timestamp: new Date(),
          });
        }
      } catch (e: any) { console.error('[Market] batch quote failed:', e?.message || e); }
    }
    return out;
  }

  async getMarketOverview(): Promise<MarketOverview> {
    const cacheKey = 'market_overview';
    if (this.isCacheValid(cacheKey)) return this.getCachedData(cacheKey);
    const empty = (name: string): IndexData => ({ name, value: 0, change: 0, changePercent: 0, timestamp: new Date() });
    try {
      const [indices, quotes] = await Promise.all([this.getMarketIndices(), this.batchNseQuotes(TRENDING_UNIVERSE)]);
      // Rank the whole universe on today's real move; "most active" = traded value (price × volume)
      const byChange = [...quotes].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
      const byValue = [...quotes].sort((a, b) => b.lastPrice * (b.volume || 0) - a.lastPrice * (a.volume || 0));
      const find = (name: string): IndexData => indices.find(i => i.name === name) ?? empty(name);
      const overview: MarketOverview = {
        indices: { nifty50: find('NIFTY 50'), sensex: find('SENSEX'), bankNifty: find('BANK NIFTY'), niftyIT: find('NIFTY IT') },
        topGainers: byChange.filter(q => q.changePercent > 0).slice(0, 5),
        topLosers: [...byChange].reverse().filter(q => q.changePercent < 0).slice(0, 5),
        mostActive: byValue.slice(0, 5),
      };
      if (quotes.length) this.setCacheData(cacheKey, overview);       // never cache an empty result
      return overview;
    } catch (error) {
      console.error('Error fetching market overview:', error);
      return { indices: { nifty50: empty('NIFTY 50'), sensex: empty('SENSEX'), bankNifty: empty('BANK NIFTY'), niftyIT: empty('NIFTY IT') }, topGainers: [], topLosers: [], mostActive: [] };
    }
  }

  /** Daily bars for ANY Yahoo ticker (e.g. ^NSEI, ^INDIAVIX, BTC-USD). Cached; [] on failure. */
  async getYahooSeries(yahooSymbol: string, days: number): Promise<any[]> {
    const cacheKey = `series_${yahooSymbol}_${days}`;
    if (this.isCacheValid(cacheKey)) return this.getCachedData(cacheKey);
    try {
      const startDate = new Date(); startDate.setDate(startDate.getDate() - days);
      const result = await yahooFinance.chart(yahooSymbol, { period1: startDate, period2: new Date(), interval: '1d' }, { validateResult: false });
      const data = (result?.quotes || []).filter((q: any) => q && q.close != null);
      const out = data.map((q: any) => ({
        date: q.date, open: q.open ?? q.close, high: q.high ?? q.close, low: q.low ?? q.close, close: q.close, volume: q.volume ?? 0,
        CH_CLOSING_PRICE: q.close, CH_OPENING_PRICE: q.open ?? q.close, CH_TRADE_HIGH_PRICE: q.high ?? q.close, CH_TRADE_LOW_PRICE: q.low ?? q.close,
        CH_TOT_TRADED_QTY: q.volume ?? 0, CH_TIMESTAMP: q.date,
      }));
      if (out.length) this.setCacheData(cacheKey, out);
      return out;
    } catch (e: any) { console.error(`[Yahoo] series ${yahooSymbol} failed:`, e?.message || e); return []; }
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
