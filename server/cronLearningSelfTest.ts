// End-to-end check of the cron → score → learn loop against a real database, with fake price feeds.
//   stats always right, astrology always wrong  →  the learned weights must move toward statistics,
//   results must be stored, notifications created, late checks must use the target-day close.
import { pool } from "./db";
import { storage } from "./storage";
import { stockDataService } from "./stockDataService";
import { cryptoDataService } from "./cryptoDataService";
import { predictionMonitoringService } from "./predictionMonitoringService";
import { learningService, buildSnapshot } from "./learningService";
import { ensureWalletTables } from "./wallet";

let fail = 0; const ok = (n: string, c: boolean, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`); if (!c) fail++; };

(async () => {
  await ensureWalletTables();
  const u = await storage.createUser({ username: "cron_" + Date.now(), password: "x", email: `c${Date.now()}@t.com`, firstName: "C", lastName: "T" } as any);
  const day = 86400000;
  const mk = async (sym: string, targetOffsetMs: number, entry: number) => {
    await storage.createPrediction({
      userId: u.id, stock: sym, currentPrice: entry, predLow: entry * 1.02, predHigh: entry * 1.10, confidence: 70,
      mode: "ai-astro-combined", riskLevel: "medium", targetDate: new Date(Date.now() + targetOffsetMs),
      aiLearning: buildSnapshot({ market: "stock", symbol: sym, sector: "IT", finalDirection: "bullish", statsDirection: "bullish", astroDirection: "bearish",
        confidence: 70, weights: { statistical: 55, astrological: 45 }, learnedFrom: 0, aiUsed: false, factors: { jupiter: 30 } }),
    } as any);
  };
  // 12 due predictions: bought at 100, real price later 108 → bullish was right, astrology (bearish) wrong
  for (let i = 0; i < 12; i++) await mk("TST" + i, -3600_000, 100);
  // one prediction that is 10 days late: live price (200) is NOT the answer, the target-day close (109) is
  await mk("LATE", -10 * day, 100);

  (stockDataService as any).getStockQuote = async (s: string) => ({ lastPrice: s === "LATE" ? 200 : 108 });
  (stockDataService as any).getHistoricalData = async () => [
    { date: new Date(Date.now() - 12 * day), close: 90 }, { date: new Date(Date.now() - 10 * day), close: 109 }, { date: new Date(Date.now() - 5 * day), close: 150 },
  ];
  (cryptoDataService as any).getCryptoQuote = async () => ({ lastPrice: 1 });

  const before = await learningService.getProfile("TST1", "IT", "stock");
  await predictionMonitoringService.monitorDuePredictions();
  learningService.invalidateLearningCache();
  const after = await learningService.getProfile("TST1", "IT", "stock");

  const rows = (await pool.query("SELECT stock, actual_price, is_active FROM predictions WHERE user_id=$1", [u.id])).rows;
  ok("all 13 predictions scored and closed", rows.length === 13 && rows.every((r: any) => r.is_active === false && r.actual_price != null));
  const late = rows.find((r: any) => r.stock === "LATE");
  ok("late check uses the target-day close (109), not the live price (200)", Math.abs(Number(late.actual_price) - 109) < 0.01, `got ${late.actual_price}`);
  ok("learning had no data before", before.samples.global < 5);
  ok("learning sees the new outcomes", after.samples.global >= 12, `samples ${after.samples.global}`);
  ok("weights moved toward statistics (it was right, astrology wrong)", after.weights.statistical > 55, `${after.weights.statistical}/${after.weights.astrological}`);
  ok("stats reliability > astrology reliability", after.reliability.statistics > after.reliability.astrology, `${after.reliability.statistics}% vs ${after.reliability.astrology}%`);
  const n = (await pool.query("SELECT count(*)::int c FROM notifications WHERE user_id=$1", [u.id])).rows[0].c;
  ok("result notifications created", n === 13, `${n}`);
  for (const t of ["feedback", "predictions", "notifications", "credit_transactions", "credit_wallets"]) await pool.query(`DELETE FROM ${t} WHERE user_id=$1`, [u.id]).catch(() => {});
  await pool.query("DELETE FROM users WHERE id=$1", [u.id]).catch(() => {});
  await pool.end();
  console.log(fail ? `\n${fail} check(s) FAILED` : "\nAll cron/learning checks passed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
