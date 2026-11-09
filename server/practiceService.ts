// ─────────────────────────────────────────────────────────────────────────────
// practiceService.ts — BullWiser practises on its own.
//
// Every hour the app (1) makes fresh predictions on a fixed watchlist of liquid NSE stocks and major coins,
// using exactly the same pipeline as a user prediction (live price → statistics + astrology → AI → quality guard),
// without charging credits, and (2) the hourly cycle in index.ts then compares every due prediction with the
// REAL price (predictionMonitoringService). Every scored result feeds the learning loop, so the stats-vs-astrology
// weights, confidence and range calibration improve even when few people use the app.
//
//   Horizons : 1 day and 1 week (a 1-hour horizon would only measure noise).
//   Stocks   : only while NSE is open (so the start price is truly live); target = a later trading day's close.
//   Crypto   : around the clock; target = +24 h / +7 days.
//   One open prediction per asset and horizon at a time, so the data is not repeated or inflated.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from "./db";
import { storage } from "./storage";
import { stockDataService } from "./stockDataService";
import { cryptoDataService } from "./cryptoDataService";
import { aiService } from "./aiService";
import { LONG_TERM_DAYS } from "./longTermStatsService";
import { guardPrediction } from "./predictionGuard";
import { syncSnapshot, buildPlanetaryData, computePriceRange, getTimeScaledRiskMultiplier } from "./predictionHelpers";
import { enterRequestOptions } from "./requestOptions";
import { ensurePracticeUser } from "./practiceUser";
import { summarizePerformance } from "./performance";

export type Horizon = "1d" | "1w";
export interface PracticeItem { symbol: string; crypto: boolean; horizon: Horizon }

const DEFAULT_STOCKS = "RELIANCE,TCS,HDFCBANK,INFY,ICICIBANK,HINDUNILVR,ITC,SBIN,BHARTIARTL,KOTAKBANK,LT,AXISBANK,ASIANPAINT,MARUTI,SUNPHARMA,TITAN,BAJFINANCE,WIPRO,ONGC,NTPC,TATASTEEL,HCLTECH,ULTRACEMCO,POWERGRID,TECHM";
const DEFAULT_CRYPTO = "BTC,ETH,SOL,BNB,XRP,ADA,DOGE,AVAX,LINK,DOT";
const list = (env: string | undefined, def: string) => (env || def).split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
export const practiceStocks = () => list(process.env.PRACTICE_STOCKS, DEFAULT_STOCKS);
export const practiceCrypto = () => list(process.env.PRACTICE_CRYPTO, DEFAULT_CRYPTO);
const HORIZONS: Horizon[] = ["1d", "1w"];

// ── Market clock (India time) ────────────────────────────────────────────────
const IST = 5.5 * 3600000, DAY = 86400000;
/** NSE regular session, Mon–Fri 09:15–15:30 IST (we stay 5 minutes inside both ends). */
export function isNseOpen(d: Date = new Date()): boolean {
  const t = new Date(d.getTime() + IST);
  const dow = t.getUTCDay(), min = t.getUTCHours() * 60 + t.getUTCMinutes();
  return dow >= 1 && dow <= 5 && min >= 9 * 60 + 20 && min < 15 * 60 + 25;
}
/** 15:30 IST on the Nth trading day after `from` (weekends skipped; exchange holidays are caught by the live market state). */
export function nextTradingClose(from: Date, tradingDays: number): Date {
  let t = new Date(from.getTime() + IST), n = 0;
  while (n < tradingDays) { t = new Date(t.getTime() + DAY); const dow = t.getUTCDay(); if (dow !== 0 && dow !== 6) n++; }
  t.setUTCHours(15, 30, 0, 0);
  return new Date(t.getTime() - IST);
}
export function targetFor(crypto: boolean, horizon: Horizon, now: Date = new Date()): Date {
  if (crypto) return new Date(now.getTime() + (horizon === "1d" ? DAY : 7 * DAY));
  return nextTradingClose(now, horizon === "1d" ? 1 : 5);
}

// ── Which predictions to make this hour ──────────────────────────────────────
interface Existing { stock: string; created_at: Date; target_date: Date | null; is_active: boolean }
const horizonOf = (e: Existing): Horizon => ((e.target_date?.getTime() ?? 0) - e.created_at.getTime() > 3 * DAY ? "1w" : "1d");

/** Pure — exported for tests. Assets without an open prediction for a horizon, longest-unpractised first. */
export function planPractice(existing: Existing[], now: Date, max: number, stocks = practiceStocks(), crypto = practiceCrypto()): PracticeItem[] {
  const open = new Set<string>(), last = new Map<string, number>();
  for (const e of existing) {
    const key = `${e.stock}|${horizonOf(e)}`;
    if (e.is_active) open.add(key);
    last.set(key, Math.max(last.get(key) ?? 0, e.created_at.getTime()));
  }
  const stockOpen = isNseOpen(now);
  const cands: (PracticeItem & { at: number })[] = [];
  for (const s of [...(stockOpen ? stocks : []).map(x => ({ x, c: false })), ...crypto.map(x => ({ x, c: true }))]) {
    for (const h of HORIZONS) {
      const key = `${s.c ? "CRYPTO_" : ""}${s.x}|${h}`;
      if (open.has(key)) continue;
      cands.push({ symbol: s.x, crypto: s.c, horizon: h, at: last.get(key) ?? 0 });
    }
  }
  // never practised first, then the oldest; short horizon first (its result arrives sooner); random tie-break so every asset gets a turn
  cands.sort((a, b) => a.at - b.at || (a.horizon === b.horizon ? 0 : a.horizon === "1d" ? -1 : 1) || Math.random() - 0.5);
  // keep stocks and coins both represented when both are possible
  const picked: PracticeItem[] = [];
  const stocksFirst = cands.filter(c => !c.crypto), coins = cands.filter(c => c.crypto);
  while (picked.length < max && (stocksFirst.length || coins.length)) {
    const a = stocksFirst.shift(), b = coins.shift();
    for (const c of [a, b]) if (c && picked.length < max) picked.push({ symbol: c.symbol, crypto: c.crypto, horizon: c.horizon });
  }
  return picked;
}

// ── One practice prediction ──────────────────────────────────────────────────
export type PracticeResult = "created" | "no-quote" | "market-closed" | "no-history" | "no-analysis" | "rejected" | "error";
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

export async function makePracticePrediction(userId: string, item: PracticeItem, now: Date = new Date()): Promise<PracticeResult> {
  const sym = item.symbol, target = targetFor(item.crypto, item.horizon, now);
  try {
    let price = 0, quote: any = null;
    if (item.crypto) { cryptoDataService.forgetQuote(sym); quote = await cryptoDataService.getCryptoQuote(sym); }
    else { stockDataService.forgetQuote(sym); quote = (await stockDataService.getStockQuote(sym, "NSE")) || (await stockDataService.getStockQuote(sym, "BSE")); }
    price = Number(quote?.lastPrice) || 0;
    if (!(price > 0)) return "no-quote";
    // a live market only: on an exchange holiday or outside the session the last price is not "now"
    if (!item.crypto && quote.marketState && String(quote.marketState).toUpperCase() !== "REGULAR") return "market-closed";

    const hist: any[] = item.crypto ? await cryptoDataService.getCryptoHistoricalData(sym, 30) : await stockDataService.getHistoricalData(sym, LONG_TERM_DAYS);
    if (!hist || hist.length < (item.crypto ? 7 : 30)) return "no-history";

    const riskMultiplier = getTimeScaledRiskMultiplier(target, "medium", !item.crypto);
    enterRequestOptions({ useAi: true, useAstro: true });
    const enhanced: any = item.crypto
      ? await withTimeout(aiService.generateEnhancedCryptoPrediction(sym, price, userId, hist, quote, target), 150_000)
      : await withTimeout(aiService.generateEnhancedPrediction(sym, price, userId, hist, target), 150_000);
    // no engine result (or no learning snapshot) = nothing to learn from: skip rather than store an invented call
    if (!enhanced || !enhanced.learningSnapshot) return "no-analysis";

    const range = computePriceRange(price, enhanced, riskMultiplier, "medium");
    const g = guardPrediction({
      currentPrice: price, low: range.low, high: range.high,
      confidence: enhanced.combinedConfidence || enhanced.prediction?.confidence || 50,
      direction: String(enhanced.finalDirection || "neutral"),
      daysAhead: Math.max(1, Math.ceil((target.getTime() - now.getTime()) / DAY)), crypto: item.crypto,
    });
    if (!g.ok) { console.log(`[Practice] ${sym} ${item.horizon} rejected by guard: ${g.reason}`); return "rejected"; }
    const snapshot = syncSnapshot(enhanced.learningSnapshot, g.direction, g.confidence);

    const technical = enhanced.analysis?.technicalFactors?.length ? enhanced.analysis.technicalFactors.join("; ") : "Standard technical analysis applied";
    const astro = enhanced.astroRecommendation || (enhanced.warnings?.length ? enhanced.warnings.join("; ") : null);
    await storage.createPrediction({
      userId, stock: item.crypto ? `CRYPTO_${sym}` : sym, currentPrice: price, predLow: range.low, predHigh: range.high,
      confidence: g.confidence, mode: "practice", riskLevel: "medium", targetDate: target,
      statisticalReasoning: technical, astroReasoning: astro, planetaryData: await buildPlanetaryData(target), aiLearning: snapshot || null,
    } as any);
    return "created";
  } catch (e) {
    console.error(`[Practice] ${sym} ${item.horizon} failed:`, e instanceof Error ? e.message : e);
    return "error";
  }
}

// ── The hourly practice run ──────────────────────────────────────────────────
export interface PracticeRun { at: string; planned: number; created: number; skipped: number; failed: number }
let lastRun: PracticeRun | null = null;
export const getLastPracticeRun = () => lastRun;

export async function runPracticeCycle(opts: { max?: number; gapMs?: number; budgetMs?: number; now?: Date } = {}): Promise<PracticeRun> {
  const run: PracticeRun = { at: new Date().toISOString(), planned: 0, created: 0, skipped: 0, failed: 0 };
  if (process.env.PRACTICE_ENABLED === "false") { console.log("[Practice] disabled (PRACTICE_ENABLED=false)"); return run; }
  const max = opts.max ?? (Number(process.env.PRACTICE_PER_HOUR) || 8);
  const now = opts.now ?? new Date();
  const started = Date.now();
  try {
    const userId = await ensurePracticeUser();
    const r = await pool.query(
      `SELECT stock, created_at, target_date, is_active FROM predictions WHERE user_id = $1 AND created_at > now() - interval '14 days'`, [userId]);
    const active = r.rows.filter((x: Existing) => x.is_active).length;
    if (active >= 400) { console.log(`[Practice] ${active} predictions still open — waiting for results before making more`); return run; }
    const plan = planPractice(r.rows, now, max);
    run.planned = plan.length;
    for (const item of plan) {
      if (Date.now() - started > (opts.budgetMs ?? 8 * 60_000)) { console.log("[Practice] time budget reached, rest next hour"); break; }
      const res = await makePracticePrediction(userId, item, now);
      if (res === "created") { run.created++; console.log(`[Practice] ✅ ${item.symbol} ${item.horizon} predicted`); }
      else if (res === "error") run.failed++;
      else { run.skipped++; console.log(`[Practice] ${item.symbol} ${item.horizon} skipped (${res})`); }
      if (opts.gapMs !== 0) await new Promise(r2 => setTimeout(r2, opts.gapMs ?? 2000));   // be gentle with Yahoo / CoinGecko / Groq limits
    }
  } catch (e) {
    console.error("[Practice] cycle failed:", e instanceof Error ? e.message : e);
    run.failed++;
  }
  lastRun = run;
  console.log(`[Practice] Cycle done — made ${run.created}, skipped ${run.skipped}, failed ${run.failed}`);
  return run;
}

// ── For the learning report ──────────────────────────────────────────────────
export async function practiceStats() {
  try {
    const userId = await ensurePracticeUser();
    const r = await pool.query(
      `SELECT stock, ai_learning AS "aiLearning", actual_price AS "actualPrice", is_active AS "isActive", pred_low AS "predLow", pred_high AS "predHigh", confidence, created_at AS "createdAt"
         FROM predictions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20000`, [userId]);
    const s = summarizePerformance(r.rows);
    return {
      made: r.rows.length, scored: s.scored, correct: s.correct, accuracyPct: s.accuracyPct, baselinePct: s.baselinePct, edgePct: s.edgePct, waitingForResult: s.pending,
      byMarket: s.byMarket, lastMadeAt: r.rows[0]?.createdAt ?? null, lastRun,
      watching: { stocks: practiceStocks().length, crypto: practiceCrypto().length },
    };
  } catch { return null; }
}
