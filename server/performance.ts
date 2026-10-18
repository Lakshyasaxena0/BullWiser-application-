// ─────────────────────────────────────────────────────────────────────────────
// performance.ts — how many of BullWiser's predictions turned out right or wrong.
// Uses only real, already-scored outcomes (the cron job compares each due prediction with the actual price).
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { pool } from "./db";
import { isAuthenticated } from "./auth";
import { parseSnapshot } from "./learningService";

export interface PerfRow { stock: string; aiLearning: string | null; actualPrice: number | null; isActive: boolean | null; predLow: number; predHigh: number; confidence: number; createdAt?: Date | string | null }
export interface PerfSummary {
  scored: number; correct: number; wrong: number; accuracyPct: number | null;
  rangeHitPct: number | null; pending: number; avgConfidence: number | null;
  byMarket: { stock: { scored: number; correct: number; accuracyPct: number | null }; crypto: { scored: number; correct: number; accuracyPct: number | null } };
  statisticsAccuracyPct: number | null; astrologyAccuracyPct: number | null;
  recent: { symbol: string; predicted: string; actual: string; changePct: number; correct: boolean; at: string | null }[];
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** Pure — exported for tests. */
export function summarizePerformance(rows: PerfRow[]): PerfSummary {
  let scored = 0, correct = 0, inRange = 0, inRangeN = 0, pending = 0, conf = 0;
  const mk = { stock: { n: 0, c: 0 }, crypto: { n: 0, c: 0 } };
  let sN = 0, sC = 0, aN = 0, aC = 0;
  const recent: PerfSummary["recent"] = [];
  for (const r of rows) {
    if (r.isActive && r.actualPrice == null) { pending++; continue; }
    const snap = parseSnapshot(r.aiLearning);
    const o = snap?.outcome;
    if (!snap || !o) continue;                       // not scored (no snapshot / not yet compared with real price)
    scored++; conf += Number(r.confidence) || 0;
    if (o.finalCorrect) correct++;
    const m = snap.market === "crypto" ? mk.crypto : mk.stock; m.n++; if (o.finalCorrect) m.c++;
    if (o.inRange != null) { inRangeN++; if (o.inRange) inRange++; }
    if (o.statsCorrect != null) { sN++; if (o.statsCorrect) sC++; }
    if (o.astroCorrect != null) { aN++; if (o.astroCorrect) aC++; }
    recent.push({ symbol: snap.symbol || r.stock, predicted: snap.finalDirection, actual: o.actualDirection, changePct: o.changePct, correct: o.finalCorrect, at: o.scoredAt ?? null });
  }
  recent.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return {
    scored, correct, wrong: scored - correct, accuracyPct: pct(correct, scored), rangeHitPct: pct(inRange, inRangeN), pending,
    avgConfidence: scored ? Math.round(conf / scored) : null,
    byMarket: { stock: { scored: mk.stock.n, correct: mk.stock.c, accuracyPct: pct(mk.stock.c, mk.stock.n) }, crypto: { scored: mk.crypto.n, correct: mk.crypto.c, accuracyPct: pct(mk.crypto.c, mk.crypto.n) } },
    statisticsAccuracyPct: pct(sC, sN), astrologyAccuracyPct: pct(aC, aN),
    recent: recent.slice(0, 8),
  };
}

const COLS = `stock, ai_learning AS "aiLearning", actual_price AS "actualPrice", is_active AS "isActive", pred_low AS "predLow", pred_high AS "predHigh", confidence, created_at AS "createdAt"`;
let appCache: { at: number; value: PerfSummary } | null = null;

export function registerPerformanceRoutes(app: Express) {
  app.get("/api/predictions/performance", isAuthenticated, async (req: any, res) => {
    try {
      if (!appCache || Date.now() - appCache.at > 5 * 60 * 1000) {
        const all = await pool.query(`SELECT ${COLS} FROM predictions ORDER BY created_at DESC LIMIT 20000`);
        appCache = { at: Date.now(), value: { ...summarizePerformance(all.rows), recent: [] } };   // app-wide: counts only, no other users' calls
      }
      const mine = await pool.query(`SELECT ${COLS} FROM predictions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 2000`, [req.user.id]);
      res.json({ app: appCache.value, mine: summarizePerformance(mine.rows) });
    } catch (e: any) { console.error("[Performance] failed:", e?.message || e); res.status(500).json({ message: "Could not load performance" }); }
  });
}
