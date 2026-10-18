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
import { sendMail } from "./mailer";

// Per-user switches that are stored on the server (so they follow the user across devices)
export const SETTING_DEFAULTS = { predictionAlerts: true, emailNotifications: true, marketingEmails: false, shareAnalytics: true } as const;
export type UserSettings = { [K in keyof typeof SETTING_DEFAULTS]: boolean };

let settingsReady: Promise<void> | null = null;
function ensureSettingsColumn() {
  settingsReady ??= pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb").then(() => undefined);
  return settingsReady;
}
export async function getUserSettings(userId: string): Promise<UserSettings & { email: string | null }> {
  await ensureSettingsColumn();
  const r = await pool.query("SELECT settings, email FROM users WHERE id = $1", [userId]);
  const raw = r.rows[0]?.settings ?? {};
  const out: any = { email: r.rows[0]?.email ?? null };
  for (const [k, d] of Object.entries(SETTING_DEFAULTS)) out[k] = typeof raw[k] === "boolean" ? raw[k] : d;
  return out;
}

// ── In-app notifications (the bell + Notifications page) ──
let notifReady: Promise<void> | null = null;
function ensureNotificationsTable() {
  notifReady ??= pool.query(`CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY, user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(30) NOT NULL DEFAULT 'info', title TEXT NOT NULL, message TEXT NOT NULL,
      symbol VARCHAR(40), read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);`).then(() => undefined);
  return notifReady;
}
export async function addNotification(userId: string, n: { type: string; title: string; message: string; symbol?: string }) {
  try {
    await ensureNotificationsTable();
    await pool.query("INSERT INTO notifications (user_id, type, title, message, symbol) VALUES ($1,$2,$3,$4,$5)", [userId, n.type, n.title, n.message, n.symbol ?? null]);
  } catch (e: any) { console.error("[Notify] could not store notification:", e?.message || e); }
}

/** Email the owner when one of their predictions has been checked against the real price (only if they left the switches on). */
export async function notifyPredictionResult(userId: string, info: { symbol: string; predicted: string; actual: string; changePct: number; correct: boolean }) {
  try {
    const st = await getUserSettings(userId);
    if (st.predictionAlerts) {
      await addNotification(userId, {
        type: info.correct ? "success" : "warning", symbol: info.symbol,
        title: `${info.symbol}: prediction ${info.correct ? "was right" : "was wrong"}`,
        message: `We called ${info.predicted}; the real price moved ${info.changePct > 0 ? "+" : ""}${info.changePct}% (${info.actual}).`,
      });
    }
    if (!st.email || !st.emailNotifications || !st.predictionAlerts) return;
    const verdict = info.correct ? "was right ✅" : "was wrong ❌";
    const text = `Your BullWiser prediction for ${info.symbol} has reached its target date.\n\nWe called it ${info.predicted}; the real price moved ${info.changePct > 0 ? "+" : ""}${info.changePct}% (${info.actual}). The call ${verdict}.\n\nSee all results under Prediction Analytics. BullWiser gives analysis only — it does not buy or sell anything, and you are responsible for your own profit or loss.\n\nYou can turn these emails off in Settings → Notifications.`;
    await sendMail({ to: st.email, subject: `BullWiser: your ${info.symbol} prediction ${info.correct ? "was right" : "was wrong"}`, text, html: text.replace(/\n/g, "<br>") });
  } catch (e: any) { console.error("[Notify] prediction result email failed:", e?.message || e); }
}

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

  app.get("/api/user/settings", isAuthenticated, async (req: any, res: Response) => {
    try { res.json(await getUserSettings(req.user.id)); }
    catch { res.status(500).json({ message: "Could not load settings" }); }
  });

  app.put("/api/user/settings", isAuthenticated, async (req: any, res: Response) => {
    try {
      await ensureSettingsColumn();
      const patch: Record<string, boolean> = {};
      for (const k of Object.keys(SETTING_DEFAULTS)) {
        const v = (req.body || {})[k];
        if (v === undefined) continue;
        if (typeof v !== "boolean") return res.status(400).json({ message: `${k} must be true or false` });
        patch[k] = v;
      }
      await pool.query("UPDATE users SET settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb, updated_at = now() WHERE id = $1", [req.user.id, JSON.stringify(patch)]);
      res.json(await getUserSettings(req.user.id));
    } catch { res.status(500).json({ message: "Could not save settings" }); }
  });

  app.get("/api/notifications", isAuthenticated, async (req: any, res: Response) => {
    try {
      await ensureNotificationsTable();
      const r = await pool.query(`SELECT id, type, title, message, symbol, read, created_at AS "createdAt" FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
      res.json(r.rows);
    } catch { res.status(500).json({ message: "Could not load notifications" }); }
  });
  app.post("/api/notifications/read-all", isAuthenticated, async (req: any, res: Response) => {
    try { await ensureNotificationsTable(); await pool.query("UPDATE notifications SET read = true WHERE user_id = $1", [req.user.id]); res.json({ status: "ok" }); }
    catch { res.status(500).json({ message: "Could not update notifications" }); }
  });
  app.post("/api/notifications/:id/read", isAuthenticated, async (req: any, res: Response) => {
    try { await ensureNotificationsTable(); await pool.query("UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2", [parseInt(req.params.id, 10), req.user.id]); res.json({ status: "ok" }); }
    catch { res.status(500).json({ message: "Could not update notification" }); }
  });
  app.delete("/api/notifications/:id", isAuthenticated, async (req: any, res: Response) => {
    try { await ensureNotificationsTable(); await pool.query("DELETE FROM notifications WHERE id = $1 AND user_id = $2", [parseInt(req.params.id, 10), req.user.id]); res.json({ status: "ok" }); }
    catch { res.status(500).json({ message: "Could not delete notification" }); }
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
