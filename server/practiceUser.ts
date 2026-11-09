// The "BullWiser Practice" account: a system user that owns the predictions the app makes by itself.
// It cannot log in (its password is not a valid hash), is never charged credits and is never sent notifications.
import { randomBytes } from "crypto";
import { pool } from "./db";

export const PRACTICE_USERNAME = "bullwiser-practice";
let cachedId: string | null = null;

export async function ensurePracticeUser(): Promise<string> {
  if (cachedId) return cachedId;
  await pool.query(
    `INSERT INTO users (username, password, role) VALUES ($1, $2, 'system') ON CONFLICT (username) DO NOTHING`,
    [PRACTICE_USERNAME, "disabled-" + randomBytes(16).toString("hex")],
  );
  const r = await pool.query(`SELECT id, role FROM users WHERE username = $1`, [PRACTICE_USERNAME]);
  // if a real person somehow owns this username, never adopt their account
  if (!r.rows[0] || r.rows[0].role !== "system") throw new Error("Practice account name is taken by a real user");
  cachedId = r.rows[0].id as string;
  return cachedId;
}

/** True when the prediction belongs to the practice account (no notification / email for those). */
export async function isPracticeUser(userId: string): Promise<boolean> {
  try { return (await ensurePracticeUser()) === userId; } catch { return false; }
}
