// ─────────────────────────────────────────────────────────────────────────────
// Refer-a-friend (credit version). Rules (see below for the bonus size):
//  • every user has a personal referral code (created on first use);
//  • a new user can enter a friend's code at sign-up (link: /auth?ref=CODE);
//  • the referrer earns bonus CREDITS (default 20) when that friend makes their FIRST credit purchase
//    (sign-ups alone earn nothing, so fake accounts are worthless);
//  • the bonus is added to the referrer's wallet in the same database transaction as the friend's payment.
// ─────────────────────────────────────────────────────────────────────────────
import { randomInt } from "crypto";
import type { Express, Response } from "express";
import { pool } from "./db";
import { isAuthenticated } from "./auth";
import { addCredits } from "./wallet";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

let ready: Promise<void> | null = null;
export function ensureReferralTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR");
      await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_uq ON users (referral_code) WHERE referral_code IS NOT NULL");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS referrals (
          id SERIAL PRIMARY KEY,
          referrer_id VARCHAR NOT NULL REFERENCES users(id),
          referred_id VARCHAR NOT NULL UNIQUE REFERENCES users(id),
          status VARCHAR NOT NULL DEFAULT 'pending',   -- pending → rewarded → redeemed
          created_at TIMESTAMP DEFAULT now(),
          rewarded_at TIMESTAMP,
          redeemed_at TIMESTAMP,
          trigger_payment_id INTEGER,
          redeemed_payment_id INTEGER
        )`);
      await pool.query("CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_id, status)");
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const normalizeCode = (c: unknown) => (typeof c === "string" ? c.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) : "");

function makeCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export async function getOrCreateCode(userId: string): Promise<string> {
  await ensureReferralTables();
  const cur = await pool.query("SELECT referral_code FROM users WHERE id = $1", [userId]);
  if (cur.rows[0]?.referral_code) return cur.rows[0].referral_code;
  for (let i = 0; i < 6; i++) {
    const code = makeCode();
    try {
      const r = await pool.query("UPDATE users SET referral_code = $2 WHERE id = $1 AND referral_code IS NULL RETURNING referral_code", [userId, code]);
      if (r.rows[0]) return r.rows[0].referral_code;
      const again = await pool.query("SELECT referral_code FROM users WHERE id = $1", [userId]);
      if (again.rows[0]?.referral_code) return again.rows[0].referral_code;
    } catch (e: any) {
      if (e?.code !== "23505") throw e; // code collision → try another
    }
  }
  throw new Error("Could not create a referral code");
}

/** Called right after sign-up. Never throws — a bad code must not block registration. */
export async function attachReferral(newUserId: string, rawCode: unknown): Promise<boolean> {
  try {
    const code = normalizeCode(rawCode);
    if (!code) return false;
    await ensureReferralTables();
    const ref = await pool.query("SELECT id FROM users WHERE referral_code = $1", [code]);
    const referrerId = ref.rows[0]?.id;
    if (!referrerId || referrerId === newUserId) return false;
    const r = await pool.query(
      "INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2) ON CONFLICT (referred_id) DO NOTHING RETURNING id",
      [referrerId, newUserId]
    );
    return Boolean(r.rows[0]);
  } catch (e: any) {
    console.error("[Referral] attach failed:", e?.message || e);
    return false;
  }
}

type Q = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };

/** Credits the inviter earns when their friend makes the first credit purchase (env REFERRAL_BONUS_CREDITS, default 20 ≈ ₹200). */
export const referralBonusCredits = () => Math.max(1, Math.min(500, parseInt(process.env.REFERRAL_BONUS_CREDITS || "20", 10) || 20));

/** Inside the payment transaction: the buyer's FIRST purchase gives whoever invited them bonus credits. */
export async function rewardReferrerWithCredits(db: Q, buyerId: string, paymentRowId: number): Promise<string | null> {
  const r = await db.query(
    `UPDATE referrals SET status = 'redeemed', rewarded_at = now(), redeemed_at = now(), trigger_payment_id = $2
      WHERE referred_id = $1 AND status = 'pending' RETURNING referrer_id`, [buyerId, paymentRowId]);
  const referrerId = r.rows[0]?.referrer_id ?? null;
  if (referrerId) await addCredits(db, referrerId, referralBonusCredits(), "referral", "Referral bonus: your friend bought credits", { buyerId, paymentRowId });
  return referrerId;
}

export function registerReferralRoutes(app: Express) {
  ensureReferralTables().catch((e) => console.error("[Referral] Could not prepare tables:", e?.message || e));

  app.get("/api/referrals/me", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const code = await getOrCreateCode(userId);
      const stats = await pool.query(
        `SELECT count(*)::int AS invited,
                count(*) FILTER (WHERE status = 'pending')::int  AS waiting,
                count(*) FILTER (WHERE status = 'rewarded')::int AS credits,
                count(*) FILTER (WHERE status = 'redeemed')::int AS used
           FROM referrals WHERE referrer_id = $1`, [userId]);
      const s = stats.rows[0] || {};
      const earned = (s.credits || 0) + (s.used || 0);
      res.json({
        code,
        invited: s.invited || 0,                     // friends who signed up with your code
        waiting: s.waiting || 0,                     // …and haven't bought credits yet
        rewarded: earned,                            // friends who bought credits → you were paid
        bonusPerFriend: referralBonusCredits(),      // credits you get per such friend
        totalBonusCredits: earned * referralBonusCredits(),
      });
    } catch (e: any) {
      console.error("[Referral] me failed:", e?.message || e);
      res.status(500).json({ message: "Could not load your referral details" });
    }
  });

  // Lets the sign-up form say "code accepted" — reveals nothing about the owner
  const checks = new Map<string, number[]>();
  app.get("/api/referrals/validate", async (req: any, res: Response) => {
    const now = Date.now();
    const arr = (checks.get(req.ip) || []).filter((t) => now - t < 60_000);
    arr.push(now); checks.set(req.ip, arr); if (checks.size > 5000) checks.clear();
    if (arr.length > 30) return res.status(429).json({ valid: false });
    try {
      await ensureReferralTables();
      const code = normalizeCode(req.query.code);
      if (!code) return res.json({ valid: false });
      const r = await pool.query("SELECT 1 FROM users WHERE referral_code = $1", [code]);
      res.json({ valid: r.rows.length > 0 });
    } catch { res.json({ valid: false }); }
  });
}
