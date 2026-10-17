// Market context for Indian stocks: how is the Nifty 50 doing, how does this stock compare with it
// (relative strength) and how nervous is the market (India VIX). Produces a SMALL score adjustment
// (max ±6 points on the 0–100 statistics score) plus plain-language notes. Never throws.
import { stockDataService } from './stockDataService';

export interface MarketContext {
  available: boolean;
  niftyTrend: 'up' | 'down' | 'sideways';
  niftyRet63dPct: number;
  stockRet63dPct: number | null;
  relStrengthPct: number | null;      // stock 63d return minus Nifty 63d return
  vix: number | null;
  vixRegime: 'calm' | 'normal' | 'elevated' | 'fear' | 'unknown';
  scoreAdj: number;                   // -6 … +6
  notes: string[];
}

const ret = (c: number[], n: number) => (c.length > n && c[c.length - 1 - n] > 0 ? (c[c.length - 1] / c[c.length - 1 - n] - 1) * 100 : null);
const sma = (c: number[], n: number) => (c.length >= n ? c.slice(-n).reduce((a, b) => a + b, 0) / n : null);

export function computeContext(niftyClose: number[], stockClose: number[] | null, vixLast: number | null): MarketContext {
  const notes: string[] = [];
  let adj = 0;
  const nR = ret(niftyClose, 63) ?? 0;
  const s50 = sma(niftyClose, 50), s200 = sma(niftyClose, 200), last = niftyClose[niftyClose.length - 1];
  let trend: MarketContext['niftyTrend'] = 'sideways';
  if (s50 && s200 && last) {
    if (last > s50 && s50 > s200) { trend = 'up'; adj += 2; notes.push('Nifty 50 is in an uptrend (above its 50- and 200-day averages)'); }
    else if (last < s50 && s50 < s200) { trend = 'down'; adj -= 2; notes.push('Nifty 50 is in a downtrend (below its 50- and 200-day averages)'); }
  }
  const sR = stockClose ? ret(stockClose, 63) : null;
  const rel = sR !== null ? sR - nR : null;
  if (rel !== null) {
    if (rel > 5) { adj += 2; notes.push(`Stock beat the Nifty by ${rel.toFixed(1)}% over 3 months (relative strength is strong)`); }
    else if (rel < -5) { adj -= 2; notes.push(`Stock lagged the Nifty by ${Math.abs(rel).toFixed(1)}% over 3 months (relative strength is weak)`); }
  }
  let regime: MarketContext['vixRegime'] = 'unknown';
  if (vixLast !== null) {
    if (vixLast < 13) { regime = 'calm'; }
    else if (vixLast < 18) { regime = 'normal'; }
    else if (vixLast < 24) { regime = 'elevated'; adj -= 1; notes.push(`India VIX is ${vixLast.toFixed(1)} — market is nervous, expect bigger swings`); }
    else { regime = 'fear'; adj -= 2; notes.push(`India VIX is ${vixLast.toFixed(1)} — high fear, predictions are less reliable`); }
  }
  return { available: niftyClose.length > 60, niftyTrend: trend, niftyRet63dPct: Math.round(nR * 10) / 10, stockRet63dPct: sR === null ? null : Math.round(sR * 10) / 10,
    relStrengthPct: rel === null ? null : Math.round(rel * 10) / 10, vix: vixLast, vixRegime: regime, scoreAdj: Math.max(-6, Math.min(6, adj)), notes };
}

export async function getMarketContext(stockBars: any[]): Promise<MarketContext | null> {
  try {
    const [nifty, vix] = await Promise.all([stockDataService.getYahooSeries('^NSEI', 400), stockDataService.getYahooSeries('^INDIAVIX', 15)]);
    const nc = nifty.map((b: any) => Number(b.close)).filter((x: number) => x > 0);
    if (nc.length < 60) return null;
    const sc = (stockBars || []).map((b: any) => Number(b.close ?? b.CH_CLOSING_PRICE)).filter((x: number) => x > 0);
    const vl = vix.length ? Number(vix[vix.length - 1].close) : null;
    return computeContext(nc, sc.length > 70 ? sc : null, vl);
  } catch { return null; }
}
