// ─────────────────────────────────────────────────────────────────────────────
// Settings endpoints:
//   GET/PUT /api/user/preferences        astrology on/off, AI on/off
//   GET     /api/predictions/feedback    my recent predictions + the feedback I already gave
//   POST    /api/predictions/:id/feedback  one rating (+ comment) per prediction
// ─────────────────────────────────────────────────────────────────────────────
import type { Express, Response } from "express";
import { pool } from "./db";
import { isAuthenticated } from "./auth";
import { ensureWalletTables } from "./wallet";
import { getUserPrefs } from "./credits";

export function registerUserSettingsRoutes(app: Express) {
  app.get("/api/user/preferences", isAuthenticated, async (req: any, res: Response) => {
    try { res.json(await getUserPrefs(req.user.id)); }
    catch { res.status(500).json({ message: "Could not load preferences" }); }
  });

  app.put("/api/user/preferences", isAuthenticated, async (req: any, res: Response) => {
    try {
      await ensureWalletTables();
      const { useAi, useAstro } = req.body || {};
      if (useAi !== undefined && typeof useAi !== "boolean") return res.status(400).json({ message: "useAi must be true or false" });
      if (useAstro !== undefined && typeof useAstro !== "boolean") return res.status(400).json({ message: "useAstro must be true or false" });
      await pool.query("UPDATE users SET use_ai = COALESCE($2, use_ai), use_astrology = COALESCE($3, use_astrology), updated_at = now() WHERE id = $1",
        [req.user.id, useAi ?? null, useAstro ?? null]);
      res.json(await getUserPrefs(req.user.id));
    } catch { res.status(500).json({ message: "Could not save preferences" }); }
  });

  app.get("/api/predictions/feedback", isAuthenticated, async (req: any, res: Response) => {
    try {
      await ensureWalletTables();
      const r = await pool.query(
        `SELECT p.id, p.stock, p.current_price AS "currentPrice", p.pred_low AS "predLow", p.pred_high AS "predHigh", p.confidence,
                p.created_at AS "createdAt", p.target_date AS "targetDate", p.actual_price AS "actualPrice",
                f.rating, f.comment
           FROM predictions p LEFT JOIN prediction_feedback f ON f.prediction_id = p.id AND f.user_id = p.user_id
          WHERE p.user_id = $1 ORDER BY p.id DESC LIMIT 30`, [req.user.id]);
      res.json(r.rows);
    } catch { res.status(500).json({ message: "Could not load your predictions" }); }
  });

  app.post("/api/predictions/:id/feedback", isAuthenticated, async (req: any, res: Response) => {
    try {
      await ensureWalletTables();
      const id = parseInt(req.params.id, 10);
      const rating = Number(req.body?.rating);
      const comment = typeof req.body?.comment === "string" ? req.body.comment.trim().slice(0, 1000) : null;
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid prediction" });
      if (rating !== 1 && rating !== -1) return res.status(400).json({ message: "Rating must be 1 (helpful) or -1 (not helpful)" });
      const own = await pool.query("SELECT 1 FROM predictions WHERE id = $1 AND user_id = $2", [id, req.user.id]);
      if (!own.rows[0]) return res.status(404).json({ message: "Prediction not found" });
      await pool.query(
        `INSERT INTO prediction_feedback (user_id, prediction_id, rating, comment) VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, prediction_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now()`,
        [req.user.id, id, rating, comment || null]);
      res.json({ status: "ok" });
    } catch (e: any) {
      console.error("[Settings] feedback failed:", e?.message || e);
      res.status(500).json({ message: "Could not save your feedback" });
    }
  });
}
