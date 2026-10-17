// ─────────────────────────────────────────────────────────────────────────────
// Credit pricing. 1 credit = ₹10. Pure functions (no DB) so they are easy to test and tune.
// A prediction's cost depends on:
//   • asset type and prediction style (suggestion only — Auto Mode was removed)
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
export type Style = 'suggestion';
export type Risk = 'low' | 'medium' | 'high';

export interface CostInput {
  asset: Asset; style: Style; risk: Risk; horizonDays: number;
  useAi: boolean; useAstro: boolean;
  potentialMovePct?: number | null;          // typical ~80% move over the horizon, in %
  sectorTier?: number; sectors?: string[];   // sector return level (0–2)
  momentumPct?: number | null;               // recent ~3 month return, %
}
export interface CostLine { label: string; value: string }
export interface CostResult { credits: number; rupees: number; lines: CostLine[] }

// Fixed service costs (credits): each engine that runs costs 3.
const ENGINE = { statistics: 3, astrology: 3, ai: 3 };
const ASSET_EXTRA: Record<Asset, number> = { stock: 0, crypto: 1 };          // crypto needs more live-data work
const RISK_EXTRA: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

/** Extra credits for looking further ahead. */
export function horizonExtra(days: number): number {
  if (days <= 1) return 0;
  if (days <= 7) return 1;
  if (days <= 30) return 2;
  if (days <= 90) return 3;
  return 4;
}
/** Sector tier by typical long-run return potential (2 = high-return, 1 = medium, 0 = steady/low). Tunable table. */
const HIGH_RETURN = ['Defence', 'Infrastructure & Cement', 'Power & Energy', 'Crypto', 'Real Estate', 'Engineering', 'Aviation', 'Technology & Foreign'];
const MID_RETURN = ['IT & Software', 'Banking & Finance', 'Pharma', 'Steel & Metals', 'Mining', 'Automobiles', 'Retail', 'Hospitality', 'Telecom', 'Healthcare', 'Consumer Durables', 'Government/PSU', 'Luxury & Fashion', 'Chemicals', 'Shipping & Water'];
export function sectorTier(sectors: string[]): number {
  if (sectors.some(x => HIGH_RETURN.includes(x))) return 2;
  if (sectors.some(x => MID_RETURN.includes(x))) return 1;
  return 0;
}
/** A stock already performing well costs more to predict (recent ~3 month return, %). */
export function momentumExtra(pct: number | null | undefined): number {
  if (pct == null || !isFinite(pct)) return 0;
  if (pct >= 25) return 2;
  if (pct >= 10) return 1;
  return 0;
}
export function benefitTier(pct: number | null | undefined): number {
  if (pct == null || !isFinite(pct)) return 0;
  if (pct < 3) return 0;
  if (pct < 15) return 1;
  return 2;
}
export const normStyle = (_s: unknown): Style => 'suggestion';
export const normRisk = (r: unknown): Risk => (r === 'low' || r === 'high' ? r : 'medium');

export function predictionCost(i: CostInput): CostResult {
  const asset = ASSET_EXTRA[i.asset];
  const astro = i.useAstro ? ENGINE.astrology : 0, ai = i.useAi ? ENGINE.ai : 0;
  const risk = RISK_EXTRA[i.risk], hz = horizonExtra(i.horizonDays);
  const sec = i.sectorTier ?? 0, mom = momentumExtra(i.momentumPct), ben = benefitTier(i.potentialMovePct);
  const raw = ENGINE.statistics + astro + ai + asset + risk + hz + sec + mom + ben;
  const credits = Math.min(MAX_COST, Math.max(1, raw));
  const sectorName = i.sectors?.length ? i.sectors.slice(0, 2).join(' / ') : (i.asset === 'crypto' ? 'Crypto' : 'sector');
  const lines: CostLine[] = [
    { label: 'Statistics (20-year + indicators)', value: `+${ENGINE.statistics}` },
    { label: 'Astrology (Vedic engine)', value: i.useAstro ? `+${ENGINE.astrology}` : 'off (0)' },
    { label: 'AI reasoning (Groq)', value: i.useAi ? `+${ENGINE.ai}` : 'off (0)' },
    ...(asset ? [{ label: 'Crypto live-data analysis', value: `+${asset}` }] : []),
    { label: `Risk: ${i.risk}`, value: `+${risk}` },
    { label: `Looks ${Math.max(1, Math.round(i.horizonDays))} day(s) ahead`, value: `+${hz}` },
    { label: `Sector return level (${sectorName})`, value: `+${sec}` },
    { label: i.momentumPct != null ? `Recent performance (${Math.round(i.momentumPct * 10) / 10}% in ~3 months)` : 'Recent performance', value: `+${mom}` },
    { label: i.potentialMovePct != null ? `Benefit potential (~${Math.round(i.potentialMovePct * 10) / 10}% move)` : 'Benefit potential', value: `+${ben}` },
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
