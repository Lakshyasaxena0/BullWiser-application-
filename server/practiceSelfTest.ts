// Checks the app's own practice loop: what it decides to predict, that the predictions are stored for the practice
// account without charging anyone, and that they are scored against the real price and fed into learning — with fake feeds.
import { pool } from "./db";
import { stockDataService } from "./stockDataService";
import { cryptoDataService } from "./cryptoDataService";
import { aiService } from "./aiService";
import { predictionMonitoringService } from "./predictionMonitoringService";
import { learningService, buildSnapshot } from "./learningService";
import { ensureWalletTables } from "./wallet";
import { ensurePracticeUser, isPracticeUser } from "./practiceUser";
import { isNseOpen, nextTradingClose, targetFor, planPractice, makePracticePrediction, runPracticeCycle } from "./practiceService";

let fail = 0; const ok = (n: string, c: boolean, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`); if (!c) fail++; };
const ist = (y: number, m: number, d: number, h: number, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi) - 5.5 * 3600000);

(async () => {
  // ── market clock ──
  const mon11 = ist(2026, 11, 9, 11, 0);          // Monday 11:00 IST
  ok("Monday 11:00 IST → NSE open", isNseOpen(mon11));
  ok("Monday 08:00 IST → closed", !isNseOpen(ist(2026, 11, 9, 8, 0)));
  ok("Monday 15:27 IST → closed (too close to the bell)", !isNseOpen(ist(2026, 11, 9, 15, 27)));
  ok("Saturday 11:00 IST → closed", !isNseOpen(ist(2026, 11, 14, 11, 0)));
  const fri = ist(2026, 11, 13, 10, 0);
  ok("1 trading day after Friday = Monday 15:30 IST", nextTradingClose(fri, 1).getTime() === ist(2026, 11, 16, 15, 30).getTime());
  ok("5 trading days after Monday = next Monday 15:30 IST", nextTradingClose(mon11, 5).getTime() === ist(2026, 11, 16, 15, 30).getTime());
  ok("crypto 1 day = +24 h, 1 week = +7 d", targetFor(true, "1d", mon11).getTime() - mon11.getTime() === 86400000 && targetFor(true, "1w", mon11).getTime() - mon11.getTime() === 7 * 86400000);

  // ── planning ──
  const S = ["AAA", "BBB", "CCC"], C = ["BTC", "ETH"];
  const open = planPractice([], mon11, 100, S, C);
  ok("market open: every stock and coin, both horizons", open.length === (3 + 2) * 2, `${open.length}`);
  const closed = planPractice([], ist(2026, 11, 14, 11, 0), 100, S, C);
  ok("market closed: only crypto is planned", closed.length === 4 && closed.every(x => x.crypto));
  ok("max per run is respected", planPractice([], mon11, 3, S, C).length === 3);
  const now = new Date();
  const existing = [{ stock: "AAA", created_at: now, target_date: new Date(now.getTime() + 86400000), is_active: true }, { stock: "CRYPTO_BTC", created_at: now, target_date: new Date(now.getTime() + 7 * 86400000), is_active: true }];
  const p2 = planPractice(existing, mon11, 100, S, C);
  ok("no second open prediction for the same asset and horizon", !p2.some(x => x.symbol === "AAA" && x.horizon === "1d") && !p2.some(x => x.symbol === "BTC" && x.horizon === "1w"));
  ok("…but the other horizon is still planned", p2.some(x => x.symbol === "AAA" && x.horizon === "1w") && p2.some(x => x.symbol === "BTC" && x.horizon === "1d"));
  const six = planPractice([], mon11, 4, S, C);
  ok("stocks and coins are both practised when both are possible", six.some(x => x.crypto) && six.some(x => !x.crypto));

  // ── fake feeds ──
  await ensureWalletTables();
  const bars = Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.now() - (60 - i) * 86400000), open: 100, high: 101, low: 99, close: 100, volume: 1000 }));
  let marketState = "REGULAR", analysisOk = true;
  (stockDataService as any).forgetQuote = () => {};
  (cryptoDataService as any).forgetQuote = () => {};
  (stockDataService as any).getStockQuote = async () => ({ lastPrice: 100, exchange: "NSE", marketState });
  (stockDataService as any).getHistoricalData = async () => bars;
  (cryptoDataService as any).getCryptoQuote = async () => ({ lastPrice: 100, name: "X" });
  (cryptoDataService as any).getCryptoHistoricalData = async () => bars;
  const fake = (market: "stock" | "crypto") => async (sym: string) => analysisOk ? ({
    prediction: { priceTarget: { low: 97, high: 103 }, confidence: 70 }, finalDirection: "bullish", combinedConfidence: 70, volHalfRangePct: 3,
    analysis: { technicalFactors: ["fake"] }, astroRecommendation: "fake",
    learningSnapshot: buildSnapshot({ market, symbol: sym, sector: "IT", finalDirection: "bullish", statsDirection: "bullish", astroDirection: "bearish",
      confidence: 70, weights: { statistical: 55, astrological: 45 }, learnedFrom: 0, aiUsed: false, factors: { jupiter: 30 } }),
  }) : null;
  (aiService as any).generateEnhancedPrediction = fake("stock");
  (aiService as any).generateEnhancedCryptoPrediction = fake("crypto");

  const uid = await ensurePracticeUser();
  await pool.query("DELETE FROM feedback WHERE user_id=$1", [uid]); await pool.query("DELETE FROM predictions WHERE user_id=$1", [uid]);
  const item = { symbol: "TST", crypto: false, horizon: "1d" as const };
  marketState = "CLOSED";
  ok("exchange closed / holiday → no stock prediction", (await makePracticePrediction(uid, item, mon11)) === "market-closed");
  marketState = "REGULAR"; analysisOk = false;
  ok("no engine result → nothing stored", (await makePracticePrediction(uid, item, mon11)) === "no-analysis");
  analysisOk = true;
  ok("normal prediction is created", (await makePracticePrediction(uid, item, mon11)) === "created");
  const one = (await pool.query("SELECT * FROM predictions WHERE user_id=$1", [uid])).rows;
  ok("stored for the practice account, mode 'practice', with learning snapshot", one.length === 1 && one[0].mode === "practice" && !!one[0].ai_learning);
  ok("start price is the live price, target is a trading-day close", Number(one[0].current_price) === 100 && new Date(one[0].target_date).getTime() === ist(2026, 11, 10, 15, 30).getTime());
  ok("practice account is recognised (no notifications for it)", await isPracticeUser(uid));

  // ── full cycle ──
  await pool.query("DELETE FROM predictions WHERE user_id=$1", [uid]);
  const run = await runPracticeCycle({ max: 6, gapMs: 0, now: mon11 });
  ok("cycle makes the planned predictions", run.created === 6, `${run.created} created, ${run.skipped} skipped, ${run.failed} failed`);
  const run2 = await runPracticeCycle({ max: 500, gapMs: 0, now: mon11 });
  const total = (await pool.query("SELECT count(*)::int c, count(DISTINCT stock || target_date::text)::int d FROM predictions WHERE user_id=$1", [uid])).rows[0];
  ok("second run fills the rest without repeating any", total.c === total.d && total.c === 6 + run2.created, `${total.c} total`);
  const run3 = await runPracticeCycle({ max: 500, gapMs: 0, now: mon11 });
  ok("third run: everything already open → nothing new", run3.created === 0);
  const hasTx = (await pool.query("SELECT to_regclass('credit_transactions') t")).rows[0].t;
  const charged = hasTx ? (await pool.query("SELECT count(*)::int c FROM credit_transactions WHERE user_id=$1", [uid])).rows[0].c : 0;
  ok("nobody was charged", charged === 0);

  // ── scored against the real price and learned from ──
  learningService.invalidateLearningCache();
  const before = await learningService.getProfile("TST", "IT", "stock");
  await pool.query("UPDATE predictions SET target_date = now() - interval '1 hour' WHERE user_id=$1", [uid]);
  (stockDataService as any).getStockQuote = async () => ({ lastPrice: 108, marketState: "CLOSED" });
  (cryptoDataService as any).getCryptoQuote = async () => ({ lastPrice: 108 });
  await predictionMonitoringService.monitorDuePredictions();
  learningService.invalidateLearningCache();
  const after = await learningService.getProfile("TST", "IT", "stock");
  const scored = (await pool.query("SELECT count(*)::int c FROM predictions WHERE user_id=$1 AND is_active=false AND actual_price IS NOT NULL", [uid])).rows[0].c;
  ok("every practice prediction was scored with the real price", scored === total.c, `${scored}/${total.c}`);
  const stockRows = (await pool.query("SELECT count(*)::int c FROM predictions WHERE user_id=$1 AND stock NOT LIKE 'CRYPTO\\_%'", [uid])).rows[0].c;
  ok("learning sees the practice outcomes", after.samples.global >= before.samples.global + stockRows && stockRows > 0, `stock samples ${before.samples.global} → ${after.samples.global}`);
  ok("weights moved toward statistics (it was right, astrology wrong)", after.weights.statistical > 55, `${after.weights.statistical}/${after.weights.astrological}`);
  const notes = (await pool.query("SELECT count(*)::int c FROM notifications WHERE user_id=$1", [uid])).rows[0].c;
  ok("no notifications created for the practice account", notes === 0, `${notes}`);

  await pool.query("DELETE FROM feedback WHERE user_id=$1", [uid]); await pool.query("DELETE FROM predictions WHERE user_id=$1", [uid]);
  await pool.query("DELETE FROM users WHERE id=$1", [uid]).catch(() => {});
  await pool.end();
  console.log(fail ? `\n${fail} check(s) FAILED` : "\nAll practice checks passed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
