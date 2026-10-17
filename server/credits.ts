// ─────────────────────────────────────────────────────────────────────────────
// Credit routes + the helpers prediction routes use to charge for a prediction.
//   GET  /api/credits/me          balance, packs, recent history, whether credits are currently required
//   POST /api/credits/quote       exact cost (with a line-by-line breakdown) BEFORE the user presses Predict
//   POST /api/credits/create-order  start a Razorpay purchase (pack or loose amount)
// ─────────────────────────────────────────────────────────────────────────────
import type { Express, Response } from "express";
import { pool } from "./db";
import { isAuthenticated } from "./auth";
import { isPaywallOn, isPaymentsConfigured, createCreditOrder } from "./payments";
import { getBalance, spendCredits, refundSpend, recentTransactions, ensureWalletTables } from "./wallet";
import { predictionCost, outlookCost, packList, validateLooseCredits, normStyle, normRisk, CREDIT_RUPEES, LOOSE_MIN, LOOSE_MAX, CostResult, Asset } from "./creditPricing";
import { stockDataService } from "./stockDataService";
import { cryptoDataService } from "./cryptoDataService";

export interface UserPrefs { useAi: boolean; useAstro: boolean }
export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  await ensureWalletTables();
  const r = await pool.query("SELECT use_ai, use_astrology FROM users WHERE id = $1", [userId]);
  return { useAi: r.rows[0]?.use_ai !== false, useAstro: r.rows[0]?.use_astrology !== false };
}

/** Typical ~80% move over the horizon, from the asset's own daily volatility (cached data, no extra cost). */
export async function estimatePotentialPct(asset: Asset, symbol: string, horizonDays: number): Promise<number | null> {
  try {
    const raw = asset === "stock"
      ? await stockDataService.getHistoricalData(symbol.toUpperCase(), 400)
      : await cryptoDataService.getCryptoHistoricalData(symbol.toUpperCase(), 30);
    const closes = (raw || []).map((d: any) => Number(d.close)).filter((x: number) => x > 0).slice(-260);
    if (closes.length < 15) return null;
    const rets: number[] = []; for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
    const m = rets.reduce((s, x) => s + x, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1));
    return Math.min(100, 1.28 * sd * Math.sqrt(Math.max(1, horizonDays)) * 100);
  } catch { return null; }
}

export const horizonDaysFrom = (when: Date) => Math.max(1, Math.ceil((when.getTime() - Date.now()) / 86400000));

export async function quotePrediction(userId: string, asset: Asset, symbol: string, when: Date, style: unknown, risk: unknown): Promise<CostResult> {
  const prefs = await getUserPrefs(userId);
  const days = horizonDaysFrom(when);
  const potential = await estimatePotentialPct(asset, symbol, days);
  return predictionCost({ asset, style: normStyle(style), risk: normRisk(risk), horizonDays: days, useAi: prefs.useAi, useAstro: prefs.useAstro, potentialMovePct: potential });
}

export interface Charge { free: boolean; amount: number; txId?: number; balance?: number }

/** Take the credits for a request, or answer 402 and return null. While the paywall is off nothing is charged. */
export async function chargeOrReject(req: any, res: Response, cost: CostResult, description: string, meta?: any): Promise<Charge | null> {
  if (!isPaywallOn()) return { free: true, amount: 0 };
  const s = await spendCredits(req.user.id, cost.credits, description, meta);
  if (!s.ok) {
    res.status(402).json({
      message: `You need ${cost.credits} credits for this prediction but have ${s.balance}. Please recharge.`,
      error: "INSUFFICIENT_CREDITS", required: cost.credits, balance: s.balance,
    });
    return null;
  }
  return { free: false, amount: cost.credits, txId: s.txId, balance: s.balance };
}
export async function refundCharge(req: any, charge: Charge | null, reason: string) {
  if (!charge || charge.free || !charge.txId) return;
  await refundSpend(req.user.id, charge.txId, reason);
}

export function registerCreditRoutes(app: Express) {
  ensureWalletTables().catch((e) => console.error("[Credits] Could not prepare tables:", e?.message || e));

  app.get("/api/credits/me", isAuthenticated, async (req: any, res: Response) => {
    try {
      const [balance, history] = await Promise.all([getBalance(req.user.id), recentTransactions(req.user.id, 40)]);
      res.json({
        balance, history,
        creditRupees: CREDIT_RUPEES, packs: packList(), looseMin: LOOSE_MIN, looseMax: LOOSE_MAX,
        creditsRequired: isPaywallOn(),                 // false → free mode, nothing is deducted
        paymentsEnabled: isPaymentsConfigured(),
      });
    } catch (e: any) { console.error("[Credits] me failed:", e?.message || e); res.status(500).json({ message: "Could not load your credits" }); }
  });

  app.post("/api/credits/quote", isAuthenticated, async (req: any, res: Response) => {
    try {
      const b = req.body || {};
      let cost: CostResult;
      if (b.kind === "outlook") cost = outlookCost(String(b.horizon || "1m"));
      else {
        const asset: Asset = b.kind === "crypto" ? "crypto" : "stock";
        const when = b.when ? new Date(b.when) : new Date(Date.now() + 30 * 86400000);
        if (isNaN(when.getTime())) return res.status(400).json({ message: "Invalid date" });
        cost = await quotePrediction(req.user.id, asset, String(b.symbol || (asset === "stock" ? "TCS" : "BTC")), when, b.style ?? b.mode, b.riskLevel);
      }
      const balance = await getBalance(req.user.id);
      res.json({ ...cost, balance, creditsRequired: isPaywallOn(), enough: balance >= cost.credits });
    } catch (e: any) { console.error("[Credits] quote failed:", e?.message || e); res.status(500).json({ message: "Could not calculate the cost" }); }
  });

  app.post("/api/credits/create-order", isAuthenticated, async (req: any, res: Response) => {
    try {
      const v = validateLooseCredits(req.body?.credits);
      if (!v.ok) return res.status(400).json({ message: v.message });
      if (!isPaymentsConfigured()) return res.status(503).json({ message: "Payments are not configured yet. Please try again later." });
      res.json(await createCreditOrder(req.user.id, v.credits));
    } catch (e: any) {
      console.error("[Credits] create-order failed:", e?.response?.data || e?.message || e);
      res.status(e?.status === 503 ? 503 : 502).json({ message: "Could not start the payment. Please try again." });
    }
  });
}
