// ─────────────────────────────────────────────────────────────────────────────
// Refer-a-friend. Rules:
//  • every user has a personal referral code (created on first use);
//  • a new user can enter a friend's code at sign-up (link: /auth?ref=CODE);
//  • the referrer earns ONE credit when that friend makes their FIRST PAID payment
//    (sign-ups alone earn nothing, so fake accounts are worthless);
//  • each credit = 10% off the referrer's next payment, up to 5 credits (50%) at once;
//  • credits are consumed when the discounted payment succeeds.
// The discount is always computed on the server from the database — never from the browser.
// ─────────────────────────────────────────────────────────────────────────────
import { randomInt } from "crypto";
import type { Express, Response } from "express";
import { pool } from "./db";
import { isAuthenticated } from "./auth";

export const DISCOUNT_PER_REFERRAL_PCT = 10;
export const MAX_CREDITS_PER_PAYMENT = 5; // 5 × 10% = 50% cap (same cap as the price formula)
const OPEN_ORDER_WINDOW_MIN = 30;
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

/** Credits the user can apply to a NEW order (minus credits already held by other open, unpaid orders). */
export async function usableCredits(userId: string): Promise<number> {
  await ensureReferralTables();
  let held = 0;
  try {
    const h = await pool.query(
      `SELECT COALESCE(SUM((plan->>'creditsUsed')::int), 0) AS held FROM payments
        WHERE user_id = $1 AND status = 'created' AND created_at > now() - ($2 || ' minutes')::interval`,
      [userId, String(OPEN_ORDER_WINDOW_MIN)]);
    held = Number(h.rows[0]?.held) || 0;
  } catch { /* payments table not created yet → nothing is held */ }
  const r = await pool.query("SELECT count(*)::int AS n FROM referrals WHERE referrer_id = $1 AND status = 'rewarded'", [userId]);
  return Math.max(0, Math.min(MAX_CREDITS_PER_PAYMENT, (Number(r.rows[0]?.n) || 0) - held));
}

type Q = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };

/** Inside the payment transaction: spend credits used by this payment. */
export async function redeemCredits(db: Q, userId: string, n: number, paymentRowId: number): Promise<number> {
  if (!n || n < 1) return 0;
  const r = await db.query(
    `UPDATE referrals SET status = 'redeemed', redeemed_at = now(), redeemed_payment_id = $3
      WHERE id IN (SELECT id FROM referrals WHERE referrer_id = $1 AND status = 'rewarded'
                   ORDER BY rewarded_at LIMIT $2 FOR UPDATE SKIP LOCKED)
      RETURNING id`, [userId, n, paymentRowId]);
  return r.rows.length;
}

/** Inside the payment transaction: the buyer's FIRST paid payment rewards whoever referred them. */
export async function rewardReferrer(db: Q, buyerId: string, paymentRowId: number): Promise<string | null> {
  const r = await db.query(
    `UPDATE referrals SET status = 'rewarded', rewarded_at = now(), trigger_payment_id = $2
      WHERE referred_id = $1 AND status = 'pending' RETURNING referrer_id`, [buyerId, paymentRowId]);
  return r.rows[0]?.referrer_id ?? null;
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
      const usable = await usableCredits(userId);
      res.json({
        code,
        invited: s.invited || 0,            // friends who signed up with your code
        waiting: s.waiting || 0,            // …and haven't paid yet
        credits: s.credits || 0,            // unused rewards
        used: s.used || 0,
        discountPercent: Math.min(usable, MAX_CREDITS_PER_PAYMENT) * DISCOUNT_PER_REFERRAL_PCT, // applied to your next payment
        perReferralPercent: DISCOUNT_PER_REFERRAL_PCT,
        maxDiscountPercent: MAX_CREDITS_PER_PAYMENT * DISCOUNT_PER_REFERRAL_PCT,
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
