// ─────────────────────────────────────────────────────────────────────────────
// passwordReset.ts — "Forgot password" by email.
//
//   POST /api/forgot-password        { identifier: email or username }
//        Always answers with the same message (never reveals whether an account exists).
//        If the account has an email, a single-use link valid for 30 minutes is mailed.
//   GET  /api/reset-password/check   ?token=...   -> { valid: boolean }
//   POST /api/reset-password         { token, password }
//        Sets the new password, burns the token, and signs the user out everywhere.
//
// Only a SHA-256 hash of each token is stored, so a database leak can't be used to take over
// accounts. The table is created automatically (no migration needed).
// ─────────────────────────────────────────────────────────────────────────────

import type { Express, Request } from 'express';
import { createHash, randomBytes } from 'crypto';
import { pool } from './db';
import { hashPassword } from './auth';
import { sendMail } from './mailer';

const TOKEN_TTL_MIN = 30;
const GENERIC = 'If an account with that email or username exists, a password reset link has been sent to its email address.';

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id          SERIAL PRIMARY KEY,
          user_id     VARCHAR NOT NULL,
          token_hash  VARCHAR(64) NOT NULL UNIQUE,
          expires_at  TIMESTAMPTZ NOT NULL,
          used_at     TIMESTAMPTZ,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
      await pool.query('CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id)');
    })().catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Small in-memory limiter per IP (this is a single-instance service)
const hits = new Map<string, number[]>();
function limited(req: Request, max: number, windowMs: number): boolean {
  const key = `${req.path}|${req.ip}`;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

function appUrl(): string | null {
  const explicit = (process.env.APP_URL || '').trim();
  const fromOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  const url = explicit || fromOrigins || '';
  return url ? url.replace(/\/+$/, '') : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

async function createAndSend(identifier: string): Promise<void> {
  await ensureTable();
  const id = identifier.trim();
  if (!id || id.length > 254) return;

  const { rows } = await pool.query(
    `SELECT id, username, email, first_name FROM users
      WHERE lower(email) = lower($1) OR username = $1
      ORDER BY (lower(email) = lower($1)) DESC LIMIT 1`,
    [id]
  );
  const user = rows[0];
  if (!user || !user.email) return;   // no account / no email on file: stay silent

  // Throttle per user: one mail per minute, five per hour
  const recent = await pool.query(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 minute') AS last_min,
            count(*) FILTER (WHERE created_at > now() - interval '1 hour')   AS last_hour
       FROM password_reset_tokens WHERE user_id = $1`, [user.id]);
  if (Number(recent.rows[0].last_min) > 0 || Number(recent.rows[0].last_hour) >= 5) return;

  const base = appUrl();
  if (!base) { console.error('[Reset] Set APP_URL (your Netlify site URL) on the server — cannot build the reset link.'); return; }

  const token = randomBytes(32).toString('hex');
  // Only the newest link works
  await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [user.id, sha256(token), String(TOKEN_TTL_MIN)]
  );

  const link = `${base}/reset-password?token=${token}`;
  const name = user.first_name || user.username;
  await sendMail({
    to: user.email,
    subject: 'Reset your BullWiser password',
    text: `Hi ${name},\n\nWe received a request to reset your BullWiser password. Open this link to choose a new one (valid for ${TOKEN_TTL_MIN} minutes):\n\n${link}\n\nIf you did not ask for this, you can ignore this email — your password will stay the same.`,
    html: `<p>Hi ${esc(name)},</p><p>We received a request to reset your BullWiser password. Click the button below to choose a new one. The link is valid for ${TOKEN_TTL_MIN} minutes and can be used once.</p>
<p><a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Reset password</a></p>
<p style="font-size:12px;color:#555">Or copy this link: ${link}</p>
<p style="font-size:12px;color:#555">If you did not ask for this, you can ignore this email — your password will stay the same.</p>`,
  });
}

export function registerPasswordResetRoutes(app: Express) {
  app.post('/api/forgot-password', async (req, res) => {
    if (limited(req, 8, 15 * 60_000)) return res.status(429).json({ message: 'Too many requests. Please try again in a few minutes.' });
    const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier
      : typeof req.body?.email === 'string' ? req.body.email : '';
    if (!identifier.trim()) return res.status(400).json({ message: 'Enter your email or username' });
    // Reply immediately with the same text whatever happens, so timing can't reveal accounts.
    res.json({ message: GENERIC });
    createAndSend(identifier).catch((e) => console.error('[Reset] forgot-password failed:', e?.message || e));
  });

  app.get('/api/reset-password/check', async (req, res) => {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      if (!/^[a-f0-9]{64}$/.test(token)) return res.json({ valid: false });
      await ensureTable();
      const { rowCount } = await pool.query(
        'SELECT 1 FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()', [sha256(token)]);
      res.json({ valid: (rowCount ?? 0) > 0 });
    } catch (e) {
      res.json({ valid: false });
    }
  });

  app.post('/api/reset-password', async (req, res) => {
    if (limited(req, 20, 15 * 60_000)) return res.status(429).json({ message: 'Too many attempts. Please try again later.' });
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (password.length > 128) return res.status(400).json({ message: 'Password is too long' });
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: 'This reset link is invalid or has expired' });

    const client = await pool.connect();
    try {
      await ensureTable();
      const newHash = await hashPassword(password);
      await client.query('BEGIN');
      // Burn the token first, atomically: only one request can ever win
      const used = await client.query(
        `UPDATE password_reset_tokens SET used_at = now()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`, [sha256(token)]);
      if (used.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'This reset link is invalid or has expired' });
      }
      const userId = used.rows[0].user_id;
      await client.query('UPDATE users SET password = $1, updated_at = now() WHERE id = $2', [newHash, userId]);
      await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
      await client.query('COMMIT');

      // Sign the user out of every device (best effort; table is created by connect-pg-simple)
      pool.query(`DELETE FROM sessions WHERE (sess::jsonb) -> 'passport' ->> 'user' = $1`, [userId])
        .catch((e) => console.warn('[Reset] Could not clear old sessions:', e?.message || e));

      res.json({ message: 'Password updated. You can now log in with your new password.' });
    } catch (e: any) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      console.error('[Reset] reset-password failed:', e?.message || e);
      res.status(500).json({ message: 'Could not reset the password. Please try again.' });
    } finally {
      client.release();
    }
  });
}
