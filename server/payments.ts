// ─────────────────────────────────────────────────────────────────────────────
// Razorpay payments for BullWiser subscriptions (INR only).
//
// Flow:
//   1. POST /api/payments/create-order  → server prices the plan itself, creates a Razorpay order,
//                                         stores a `payments` row (status "created").
//   2. Browser opens Razorpay Checkout with that order.
//   3. POST /api/payments/verify        → server checks the HMAC signature AND asks Razorpay for the
//                                         payment, then activates the subscription.
//   4. POST /api/payments/webhook       → Razorpay → server safety net (user closed the tab after paying).
// A subscription is ONLY ever created by `fulfillOrder`, which is idempotent (row lock + unique ids).
//
// Env vars: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "crypto";
import axios from "axios";
import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { isAuthenticated } from "./auth";
import { ensureReferralTables, usableCredits, redeemCredits, rewardReferrer } from "./referrals";

const RAZORPAY_API = process.env.RAZORPAY_API_URL || "https://api.razorpay.com/v1";
const keyId = () => process.env.RAZORPAY_KEY_ID || "";
const keySecret = () => process.env.RAZORPAY_KEY_SECRET || "";
const webhookSecret = () => process.env.RAZORPAY_WEBHOOK_SECRET || "";
export const isPaymentsConfigured = () => Boolean(keyId() && keySecret());

/**
 * Paywall switch. PAYWALL_ENABLED=true forces it ON, =false forces it OFF.
 * If unset, the paywall turns ON automatically as soon as the Razorpay keys are present.
 */
export const isPaywallOn = () => {
  const f = (process.env.PAYWALL_ENABLED || '').trim().toLowerCase();
  if (f === 'true') return true;
  if (f === 'false') return false;
  return isPaymentsConfigured();
};

const DURATION_SECONDS: Record<string, number> = { daily: 86400, weekly: 7 * 86400, monthly: 30 * 86400, yearly: 365 * 86400 };

export interface PaymentDeps {
  parseBillingInput: (body: any, kind: "stock" | "crypto") => { error: string } | { value: any };
  calculateStock: (mode: string, tradeType: string, tradesPerDay: number, duration: string, referralCount: number) => any;
  calculateCrypto: (mode: string, tradesPerDay: number, cryptoValue: number, duration: string, referralCount: number) => any;
}

let tableReady: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR NOT NULL REFERENCES users(id),
          provider VARCHAR NOT NULL DEFAULT 'razorpay',
          razorpay_order_id VARCHAR NOT NULL UNIQUE,
          razorpay_payment_id VARCHAR UNIQUE,
          amount_paise INTEGER NOT NULL,
          currency VARCHAR NOT NULL DEFAULT 'INR',
          status VARCHAR NOT NULL DEFAULT 'created',
          kind VARCHAR NOT NULL,
          plan JSONB NOT NULL,
          subscription_id INTEGER,
          failure_reason TEXT,
          created_at TIMESTAMP DEFAULT now(),
          paid_at TIMESTAMP
        )`);
      await pool.query("CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id)");
      await pool.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency VARCHAR NOT NULL DEFAULT 'INR'");
      await pool.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_id INTEGER");
      await ensureReferralTables();
    })().catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

const rzp = (method: "get" | "post", path: string, data?: any) =>
  axios.request({ method, url: `${RAZORPAY_API}${path}`, data, auth: { username: keyId(), password: keySecret() }, timeout: 15000 });

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a || "", "utf8"), y = Buffer.from(b || "", "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const hmacHex = (secret: string, payload: string | Buffer) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

/** Activate the subscription for a paid order. Safe to call many times / concurrently. */
export async function fulfillOrder(orderId: string, paymentId: string, paidAmountPaise: number): Promise<{ subscriptionId: number; alreadyDone: boolean }> {
  await ensureTables();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM payments WHERE razorpay_order_id = $1 FOR UPDATE", [orderId]);
    const pay = rows[0];
    if (!pay) throw new Error("Unknown order");
    if (pay.status === "paid" && pay.subscription_id) {
      await client.query("COMMIT");
      return { subscriptionId: pay.subscription_id, alreadyDone: true };
    }
    if (paidAmountPaise !== pay.amount_paise) throw new Error(`Amount mismatch (paid ${paidAmountPaise}, expected ${pay.amount_paise})`);

    const plan = pay.plan;
    const startTs = Math.floor(Date.now() / 1000);
    const endTs = startTs + (DURATION_SECONDS[plan.duration] || DURATION_SECONDS.monthly);
    const sub = await client.query(
      `INSERT INTO subscriptions (user_id, mode, trade_type, trades_per_day, duration, start_ts, end_ts, price, currency, payment_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [pay.user_id, plan.dbMode, plan.dbTradeType, plan.tradesPerDay, plan.duration, startTs, endTs, Math.round(pay.amount_paise / 100), pay.currency, pay.id]
    );
    // Referral bookkeeping (same transaction): spend the credits this payment used, and
    // reward whoever invited the buyer (their first paid payment earns the inviter a credit).
    if (plan.creditsUsed > 0) await redeemCredits(client, pay.user_id, plan.creditsUsed, pay.id);
    await rewardReferrer(client, pay.user_id, pay.id);
    await client.query(
      "UPDATE payments SET status='paid', razorpay_payment_id=$2, subscription_id=$3, paid_at=now(), failure_reason=NULL WHERE id=$1",
      [pay.id, paymentId, sub.rows[0].id]
    );
    await client.query("COMMIT");
    console.log(`[Payments] Order ${orderId} paid (${paymentId}) → subscription ${sub.rows[0].id}`);
    return { subscriptionId: sub.rows[0].id, alreadyDone: false };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function registerPaymentRoutes(app: Express, deps: PaymentDeps) {
  ensureTables().catch((e) => console.error("[Payments] Could not prepare tables:", e?.message || e));

  // Public config for the checkout button
  app.get("/api/payments/config", (_req, res) => {
    res.json({ enabled: isPaymentsConfigured(), paywall: isPaywallOn(), keyId: isPaymentsConfigured() ? keyId() : null, currency: "INR" });
  });

  // 1. Create an order. The PRICE IS COMPUTED HERE — anything price-like from the browser is ignored.
  app.post("/api/payments/create-order", isAuthenticated, async (req: any, res: Response) => {
    try {
      if (!isPaymentsConfigured()) return res.status(503).json({ message: "Payments are not configured yet. Please try again later." });
      await ensureTables();
      const kind = req.body?.kind === "crypto" ? "crypto" : "stock";
      const parsed = deps.parseBillingInput({ duration: "monthly", ...req.body }, kind);
      if ("error" in parsed) return res.status(400).json({ message: parsed.error });
      const v = parsed.value;
      // Referral discount comes from the DATABASE (credits earned when friends paid) — never from the browser
      const credits = await usableCredits(req.user.id);
      const bill = kind === "stock"
        ? deps.calculateStock(v.mode, v.tradeType, v.tradesPerDay, v.duration, credits)
        : deps.calculateCrypto(v.mode, v.tradesPerDay, v.cryptoValue, v.duration, credits);
      const amountRupees = Math.round(bill.finalBill);
      if (!Number.isFinite(amountRupees) || amountRupees < 1) return res.status(400).json({ message: "Invalid plan price" });
      const amountPaise = amountRupees * 100;

      const plan = {
        duration: v.duration, tradesPerDay: v.tradesPerDay, mode: v.mode, tradeType: kind === "stock" ? v.tradeType : "crypto",
        dbMode: kind === "stock" ? v.mode : `crypto-${v.mode}`, dbTradeType: kind === "stock" ? v.tradeType : "crypto",
        cryptoValue: kind === "crypto" ? v.cryptoValue : undefined,
        creditsUsed: credits,
      };
      const receipt = `bw_${req.user.id.slice(0, 8)}_${Date.now().toString(36)}`;
      const order = (await rzp("post", "/orders", { amount: amountPaise, currency: "INR", receipt, notes: { userId: req.user.id, kind, duration: v.duration } })).data;
      await pool.query(
        "INSERT INTO payments (user_id, razorpay_order_id, amount_paise, currency, kind, plan) VALUES ($1,$2,$3,'INR',$4,$5)",
        [req.user.id, order.id, amountPaise, kind, JSON.stringify(plan)]
      );
      res.json({ orderId: order.id, amount: amountPaise, currency: "INR", keyId: keyId(), invoice: bill, name: "BullWiser", description: `${kind === "crypto" ? "Crypto" : "Stock"} plan – ${v.duration}` });
    } catch (e: any) {
      console.error("[Payments] create-order failed:", e?.response?.data || e?.message || e);
      res.status(502).json({ message: "Could not start the payment. Please try again." });
    }
  });

  // 2. Browser reports a finished payment → we verify it ourselves
  app.post("/api/payments/verify", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
      if (typeof orderId !== "string" || typeof paymentId !== "string" || typeof signature !== "string") {
        return res.status(400).json({ message: "Missing payment details" });
      }
      await ensureTables();
      const { rows } = await pool.query("SELECT user_id, amount_paise FROM payments WHERE razorpay_order_id = $1", [orderId]);
      if (!rows[0] || rows[0].user_id !== req.user.id) return res.status(404).json({ message: "Order not found" });

      if (!safeEqualHex(hmacHex(keySecret(), `${orderId}|${paymentId}`), signature)) {
        await pool.query("UPDATE payments SET failure_reason='bad signature' WHERE razorpay_order_id=$1 AND status<>'paid'", [orderId]);
        return res.status(400).json({ message: "Payment verification failed" });
      }
      // Double-check with Razorpay itself: right order, right amount, money actually captured
      const p = (await rzp("get", `/payments/${encodeURIComponent(paymentId)}`)).data;
      if (p.order_id !== orderId || p.currency !== "INR") return res.status(400).json({ message: "Payment does not match the order" });
      if (p.status !== "captured") return res.status(409).json({ message: `Payment is ${p.status}. If money was deducted it will activate automatically.` });

      const done = await fulfillOrder(orderId, paymentId, p.amount);
      res.json({ status: "ok", subscriptionId: done.subscriptionId });
    } catch (e: any) {
      console.error("[Payments] verify failed:", e?.response?.data || e?.message || e);
      res.status(500).json({ message: "Could not confirm the payment. If money was deducted, your plan will activate automatically within a few minutes." });
    }
  });

  // 3. Razorpay → us (needs the RAW body for the signature; see express.json verify in index.ts)
  app.post("/api/payments/webhook", async (req: Request, res: Response) => {
    try {
      const raw: Buffer | undefined = (req as any).rawBody;
      const secret = webhookSecret();
      const sig = String(req.headers["x-razorpay-signature"] || "");
      if (!secret || !raw || !safeEqualHex(hmacHex(secret, raw), sig)) return res.status(400).json({ message: "Invalid signature" });

      await ensureTables();
      const event = req.body?.event as string;
      const pay = req.body?.payload?.payment?.entity;
      if ((event === "payment.captured" || event === "order.paid") && pay?.order_id && pay?.id) {
        await fulfillOrder(pay.order_id, pay.id, pay.amount);
      } else if (event === "payment.failed" && pay?.order_id) {
        await pool.query("UPDATE payments SET status='failed', failure_reason=$2 WHERE razorpay_order_id=$1 AND status='created'",
          [pay.order_id, String(pay.error_description || pay.error_code || "failed").slice(0, 300)]);
      }
      res.json({ status: "ok" });
    } catch (e: any) {
      console.error("[Payments] webhook error:", e?.message || e);
      res.status(500).json({ message: "retry" }); // non-2xx → Razorpay retries
    }
  });

  // Payment history for the logged-in user
  app.get("/api/payments", isAuthenticated, async (req: any, res: Response) => {
    try {
      await ensureTables();
      const { rows } = await pool.query(
        `SELECT id, razorpay_order_id AS "orderId", razorpay_payment_id AS "paymentId", amount_paise / 100 AS amount, currency, status, kind,
                subscription_id AS "subscriptionId", created_at AS "createdAt", paid_at AS "paidAt"
         FROM payments WHERE user_id = $1 ORDER BY id DESC LIMIT 50`, [req.user.id]);
      res.json(rows);
    } catch { res.status(500).json({ message: "Error fetching payments" }); }
  });
}
