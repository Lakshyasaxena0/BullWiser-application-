// Email verification + record of Terms acceptance.
//   POST /api/verify-email   {token}  → marks the email as verified (one-time link from the mail)
//   POST /api/email/resend            → sends a fresh link (max 1/min, 5/hour)
//   GET  /api/email/status            → { email, verified, mailConfigured }
import type { Express } from "express";
import { randomBytes, createHash } from "crypto";
import { pool } from "./db";
import { isAuthenticated } from "./auth";
import { sendMail, isMailConfigured } from "./mailer";

const TTL_HOURS = 48;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

let ready: Promise<void> | null = null;
export function ensureVerificationTables() {
  ready ??= (async () => {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ");
    await pool.query(`CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id SERIAL PRIMARY KEY, user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  })();
  return ready;
}

export async function recordTermsAcceptance(userId: string) {
  await ensureVerificationTables();
  await pool.query("UPDATE users SET terms_accepted_at = now() WHERE id = $1", [userId]);
}

function appUrl(): string | null {
  const explicit = (process.env.APP_URL || "").trim();
  const first = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)[0];
  const url = explicit || first || "";
  return url ? url.replace(/\/+$/, "") : null;
}

/** Returns "sent" | "throttled" | "unavailable" (no mail provider / no APP_URL) | "already" */
export async function sendVerificationEmail(userId: string): Promise<"sent" | "throttled" | "unavailable" | "already"> {
  await ensureVerificationTables();
  const u = (await pool.query("SELECT email, username, first_name, email_verified_at FROM users WHERE id = $1", [userId])).rows[0];
  if (!u?.email) return "unavailable";
  if (u.email_verified_at) return "already";
  const base = appUrl();
  if (!isMailConfigured() || !base) return "unavailable";
  const r = (await pool.query(`SELECT count(*) FILTER (WHERE created_at > now() - interval '1 minute') AS m, count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS h FROM email_verification_tokens WHERE user_id = $1`, [userId])).rows[0];
  if (Number(r.m) > 0 || Number(r.h) >= 5) return "throttled";
  const token = randomBytes(32).toString("hex");
  await pool.query("UPDATE email_verification_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await pool.query("INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, now() + ($3 || ' hours')::interval)", [userId, sha256(token), String(TTL_HOURS)]);
  const link = `${base}/verify-email?token=${token}`;
  const name = u.first_name || u.username;
  const ok = await sendMail({
    to: u.email, subject: "Verify your BullWiser email",
    text: `Hi ${name},\n\nPlease confirm your email address to finish setting up BullWiser (link valid for ${TTL_HOURS} hours):\n\n${link}\n\nIf you did not create this account, ignore this email.`,
    html: `<p>Hi ${esc(name)},</p><p>Please confirm your email address to finish setting up BullWiser. The link is valid for ${TTL_HOURS} hours.</p><p><a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Verify email</a></p><p style="font-size:12px;color:#555">Or copy this link: ${link}</p><p style="font-size:12px;color:#555">If you did not create this account, ignore this email.</p>`,
  });
  return ok ? "sent" : "unavailable";
}

export function registerEmailVerificationRoutes(app: Express) {
  ensureVerificationTables().catch((e) => console.error("[Verify] setup failed:", e?.message || e));

  app.post("/api/verify-email", async (req, res) => {
    try {
      await ensureVerificationTables();
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: "This verification link is not valid." });
      const t = (await pool.query("UPDATE email_verification_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id", [sha256(token)])).rows[0];
      if (!t) return res.status(400).json({ message: "This link has expired or was already used. Please request a new one from the app." });
      await pool.query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1", [t.user_id]);
      res.json({ status: "verified" });
    } catch (e: any) { console.error("[Verify] failed:", e?.message || e); res.status(500).json({ message: "Could not verify your email" }); }
  });

  app.post("/api/email/resend", isAuthenticated, async (req: any, res) => {
    try {
      const r = await sendVerificationEmail(req.user.id);
      if (r === "sent") return res.json({ status: "sent" });
      if (r === "already") return res.json({ status: "already" });
      if (r === "throttled") return res.status(429).json({ message: "Please wait a minute before asking for another email." });
      res.status(503).json({ message: "Email sending is not set up on the server yet." });
    } catch { res.status(500).json({ message: "Could not send the email" }); }
  });

  app.get("/api/email/status", isAuthenticated, async (req: any, res) => {
    try {
      await ensureVerificationTables();
      const u = (await pool.query("SELECT email, email_verified_at FROM users WHERE id = $1", [req.user.id])).rows[0];
      res.json({ email: u?.email ?? null, verified: !!u?.email_verified_at, mailConfigured: isMailConfigured() });
    } catch { res.status(500).json({ message: "Could not load email status" }); }
  });
}
