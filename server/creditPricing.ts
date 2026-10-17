// ─────────────────────────────────────────────────────────────────────────────
// Credit pricing. 1 credit = ₹10. Pure functions (no DB) so they are easy to test and tune.
// A prediction's cost depends on:
//   • asset type and prediction style (suggestion / auto-trading signal)
//   • which engines are switched on: statistics, astrology, AI
//   • the risk level chosen
//   • how far ahead the prediction looks (longer horizons use more history/analysis)
//   • how big the possible move ("benefit potential") is for this asset over that horizon
// ─────────────────────────────────────────────────────────────────────────────
export const CREDIT_RUPEES = 10;
export const PACKS = [300, 500, 700, 1200, 1500, 2000] as const;   // credits
export const LOOSE_MIN = 10;                                        // ₹100
export const LOOSE_MAX = 10000;                                     // ₹1,00,000
export const MAX_COST = 40;

export type Asset = 'stock' | 'crypto';
export type Style = 'suggestion' | 'auto';
export type Risk = 'low' | 'medium' | 'high';

export interface CostInput {
  asset: Asset; style: Style; risk: Risk; horizonDays: number;
  useAi: boolean; useAstro: boolean;
  potentialMovePct?: number | null;          // typical ~80% move over the horizon, in %
}
export interface CostLine { label: string; value: string }
export interface CostResult { credits: number; rupees: number; lines: CostLine[] }

const BASE: Record<Asset, Record<Style, number>> = {
  stock:  { suggestion: 1,   auto: 2 },
  crypto: { suggestion: 1.5, auto: 2.5 },
};
const ENGINE = { statistics: 1, astrology: 1.5, ai: 1.5 };
const RISK_MULT: Record<Risk, number> = { low: 1.0, medium: 1.2, high: 1.4 };

export function horizonMultiplier(days: number): number {
  if (days <= 1) return 1.0;
  if (days <= 7) return 1.1;
  if (days <= 30) return 1.25;
  if (days <= 90) return 1.5;
  return 1.75;
}
export function benefitTier(pct: number | null | undefined): number {
  if (pct == null || !isFinite(pct)) return 0;
  if (pct < 3) return 0;
  if (pct < 7) return 1;
  if (pct < 15) return 1;
  return 2;
}
export const normStyle = (s: unknown): Style => (s === 'auto' ? 'auto' : 'suggestion');
export const normRisk = (r: unknown): Risk => (r === 'low' || r === 'high' ? r : 'medium');

export function predictionCost(i: CostInput): CostResult {
  const base = BASE[i.asset][i.style];
  const engines = ENGINE.statistics + (i.useAstro ? ENGINE.astrology : 0) + (i.useAi ? ENGINE.ai : 0);
  const rm = RISK_MULT[i.risk], hm = horizonMultiplier(i.horizonDays);
  const sub = (base + engines) * rm * hm;
  const bt = benefitTier(i.potentialMovePct);
  const credits = Math.min(MAX_COST, Math.max(1, Math.ceil(sub - 1e-9)) + bt);
  const lines: CostLine[] = [
    { label: `${i.asset === 'stock' ? 'Stock' : 'Crypto'} · ${i.style === 'auto' ? 'Auto-trading signal' : 'AI + Astro suggestion'}`, value: `${base}` },
    { label: 'Statistics (20-year + indicators)', value: `+${ENGINE.statistics}` },
    { label: 'Astrology (Vedic engine)', value: i.useAstro ? `+${ENGINE.astrology}` : 'off (0)' },
    { label: 'AI reasoning (Groq)', value: i.useAi ? `+${ENGINE.ai}` : 'off (0)' },
    { label: `Risk: ${i.risk}`, value: `×${rm}` },
    { label: `Looks ${Math.max(1, Math.round(i.horizonDays))} day(s) ahead`, value: `×${hm}` },
    { label: i.potentialMovePct != null ? `Benefit potential (~${Math.round(i.potentialMovePct * 10) / 10}% move)` : 'Benefit potential', value: `+${bt}` },
  ];
  return { credits, rupees: credits * CREDIT_RUPEES, lines };
}

export function outlookCost(horizon: string): CostResult {
  const long = ['4m', '6m', '1y'].includes(horizon);
  const credits = long ? 4 : 3;
  return { credits, rupees: credits * CREDIT_RUPEES, lines: [{ label: `Market outlook (${horizon})`, value: `${credits}` }] };
}

export function packList() {
  return PACKS.map(c => ({ credits: c, rupees: c * CREDIT_RUPEES }));
}
export function validateLooseCredits(n: unknown): { ok: true; credits: number } | { ok: false; message: string } {
  const c = Number(n);
  if (!Number.isInteger(c)) return { ok: false, message: 'Enter a whole number of credits' };
  if (c < LOOSE_MIN) return { ok: false, message: `Minimum purchase is ${LOOSE_MIN} credits (₹${LOOSE_MIN * CREDIT_RUPEES})` };
  if (c > LOOSE_MAX) return { ok: false, message: `Maximum purchase is ${LOOSE_MAX} credits` };
  return { ok: true, credits: c };
}
