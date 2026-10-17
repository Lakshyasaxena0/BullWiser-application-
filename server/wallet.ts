// ─────────────────────────────────────────────────────────────────────────────
// Credit wallet + ledger. Every change to a balance is a ledger row, and balance changes are atomic
// (a spend can never take the balance below zero, even with parallel requests).
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from "./db";

type Q = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };

let ready: Promise<void> | null = null;
export function ensureWalletTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS credit_wallets (
        user_id VARCHAR PRIMARY KEY REFERENCES users(id),
        balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
        updated_at TIMESTAMP DEFAULT now())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS credit_transactions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(id),
        delta INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        kind VARCHAR NOT NULL,            -- purchase | spend | refund | referral | bonus
        description TEXT,
        meta JSONB,
        created_at TIMESTAMP DEFAULT now())`);
      await pool.query("CREATE INDEX IF NOT EXISTS credit_tx_user_idx ON credit_transactions (user_id, id DESC)");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS use_astrology BOOLEAN NOT NULL DEFAULT TRUE");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS use_ai BOOLEAN NOT NULL DEFAULT TRUE");
      await pool.query(`CREATE TABLE IF NOT EXISTS prediction_feedback (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(id),
        prediction_id INTEGER NOT NULL,
        rating SMALLINT NOT NULL,         -- 1 = helpful, -1 = not helpful
        comment TEXT,
        created_at TIMESTAMP DEFAULT now(),
        UNIQUE (user_id, prediction_id))`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** Optional signup gift (env WELCOME_CREDITS, default 0). Given once, when the wallet is first created. */
const welcomeCredits = () => Math.max(0, Math.min(1000, parseInt(process.env.WELCOME_CREDITS || "0", 10) || 0));

async function ensureWallet(db: Q, userId: string): Promise<void> {
  const w = welcomeCredits();
  const r = await db.query("INSERT INTO credit_wallets (user_id, balance) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING RETURNING balance", [userId, w]);
  if (r.rows[0] && w > 0) {
    await db.query("INSERT INTO credit_transactions (user_id, delta, balance_after, kind, description) VALUES ($1,$2,$2,'bonus','Welcome credits')", [userId, w]);
  }
}

export async function getBalance(userId: string): Promise<number> {
  await ensureWalletTables();
  await ensureWallet(pool, userId);
  const r = await pool.query("SELECT balance FROM credit_wallets WHERE user_id = $1", [userId]);
  return Number(r.rows[0]?.balance) || 0;
}

/** Add credits (purchase / refund / bonus). Pass a transaction client to make it part of a bigger transaction. */
export async function addCredits(db: Q, userId: string, amount: number, kind: string, description: string, meta?: any): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid credit amount");
  await ensureWallet(db, userId);
  const r = await db.query("UPDATE credit_wallets SET balance = balance + $2, updated_at = now() WHERE user_id = $1 RETURNING balance", [userId, amount]);
  const balance = Number(r.rows[0].balance);
  await db.query("INSERT INTO credit_transactions (user_id, delta, balance_after, kind, description, meta) VALUES ($1,$2,$3,$4,$5,$6)",
    [userId, amount, balance, kind, description, meta ? JSON.stringify(meta) : null]);
  return balance;
}

export interface Spend { ok: boolean; balance: number; txId?: number }
/** Atomically take credits. Fails (ok=false) if the balance is not enough. */
export async function spendCredits(userId: string, amount: number, description: string, meta?: any): Promise<Spend> {
  await ensureWalletTables();
  await ensureWallet(pool, userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query("UPDATE credit_wallets SET balance = balance - $2, updated_at = now() WHERE user_id = $1 AND balance >= $2 RETURNING balance", [userId, amount]);
    if (!r.rows[0]) {
      await client.query("ROLLBACK");
      const b = await pool.query("SELECT balance FROM credit_wallets WHERE user_id = $1", [userId]);
      return { ok: false, balance: Number(b.rows[0]?.balance) || 0 };
    }
    const balance = Number(r.rows[0].balance);
    const t = await client.query("INSERT INTO credit_transactions (user_id, delta, balance_after, kind, description, meta) VALUES ($1,$2,$3,'spend',$4,$5) RETURNING id",
      [userId, -amount, balance, description, meta ? JSON.stringify(meta) : null]);
    await client.query("COMMIT");
    return { ok: true, balance, txId: t.rows[0].id };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { client.release(); }
}

/** Give back a spend (when the prediction failed). Only once per transaction. */
export async function refundSpend(userId: string, txId: number, reason: string): Promise<number | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query("SELECT delta, meta FROM credit_transactions WHERE id = $1 AND user_id = $2 AND kind = 'spend' FOR UPDATE", [txId, userId]);
    if (!t.rows[0]) { await client.query("ROLLBACK"); return null; }
    const already = await client.query("SELECT 1 FROM credit_transactions WHERE user_id = $1 AND kind = 'refund' AND (meta->>'refundOf')::int = $2", [userId, txId]);
    if (already.rows[0]) { await client.query("ROLLBACK"); return null; }
    const balance = await addCredits(client, userId, -Number(t.rows[0].delta), "refund", `Refund: ${reason}`, { refundOf: txId });
    await client.query("COMMIT");
    return balance;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[Wallet] refund failed:", (e as any)?.message || e);
    return null;
  } finally { client.release(); }
}

export async function recentTransactions(userId: string, limit = 30) {
  await ensureWalletTables();
  const r = await pool.query(
    `SELECT id, delta, balance_after AS "balanceAfter", kind, description, created_at AS "createdAt"
       FROM credit_transactions WHERE user_id = $1 ORDER BY id DESC LIMIT $2`, [userId, limit]);
  return r.rows;
}
