import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

// Using Supabase connection pooler (port 6543)
// Add ?pgbouncer=true to the URL for compatibility
const connectionString = process.env.DATABASE_URL.includes('?') 
  ? process.env.DATABASE_URL 
  : process.env.DATABASE_URL + '?pgbouncer=true';

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000,
});

pool.on('connect', () => {
  console.log('[DB] Connected to Supabase ✅');
});

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});

pool.query('SELECT 1').then(() => {
  console.log('[DB] Database connection verified ✅');
}).catch(err => {
  console.error('[DB] Database connection failed ❌:', err.message);
});

export const db = drizzle(pool, { schema });

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}
