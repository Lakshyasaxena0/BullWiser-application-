import { confidenceCeiling } from "./evidenceRules";

// Last line of defence before a prediction is shown or saved. A prediction that fails these basic sanity rules is
// never returned (the route refunds the credits instead) — a missing answer is better than a wrong-looking one.
export interface GuardInput { currentPrice: number; low: number; high: number; confidence: number; direction: string; daysAhead: number; crypto: boolean }
export interface GuardResult { ok: boolean; reason?: string; confidence: number; direction: string; notes: string[] }

/** The widest range that can still be believable for the horizon (very generous: only absurd output trips it). */
export function maxRangeWidth(daysAhead: number, crypto: boolean): number {
  const base = 0.15 + 0.9 * Math.sqrt(Math.max(1, daysAhead) / 365);
  return Math.min(crypto ? 4 : 2, base * (crypto ? 2.5 : 1));
}

export function guardPrediction(i: GuardInput): GuardResult {
  const notes: string[] = [];
  const fin = (x: number) => typeof x === "number" && isFinite(x);
  if (![i.currentPrice, i.low, i.high].every(fin) || i.currentPrice <= 0 || i.low <= 0 || i.high <= 0)
    return { ok: false, reason: "invalid prices", confidence: 0, direction: i.direction, notes };
  if (i.high <= i.low) return { ok: false, reason: "price range is empty", confidence: 0, direction: i.direction, notes };
  const width = (i.high - i.low) / i.currentPrice;
  if (width > maxRangeWidth(i.daysAhead, i.crypto)) return { ok: false, reason: `price range too wide (${Math.round(width * 100)}%)`, confidence: 0, direction: i.direction, notes };
  // the range has to be somewhere near the live price, otherwise the data feed and the model disagree about what the stock costs
  if (i.low > i.currentPrice * 1.6 || i.high < i.currentPrice * 0.4) return { ok: false, reason: "range far from the live price", confidence: 0, direction: i.direction, notes };

  let direction = i.direction;
  let confidence = fin(i.confidence) ? i.confidence : 50;
  // nobody can be near-certain about a market, and the nearer the target the closer a call is to a coin flip:
  // stated confidence is held inside an honest band that depends on the horizon (see evidenceRules.ts)
  const ceiling = confidenceCeiling(i.daysAhead, i.crypto);
  const wanted = Math.round(confidence);
  confidence = Math.max(20, Math.min(ceiling, wanted));
  if (wanted > ceiling) notes.push(`Confidence is held at ${ceiling}% at most for a ${i.daysAhead <= 1 ? "1-day" : i.daysAhead + "-day"} call — markets are never certain.`);
  // direction and range must tell the same story
  const midMove = ((i.low + i.high) / 2 - i.currentPrice) / i.currentPrice;
  const tol = Math.max(0.01, width * 0.15);
  if ((direction === "bullish" && midMove < -tol) || (direction === "bearish" && midMove > tol)) {
    notes.push("Direction and price range disagreed, so the call was downgraded to neutral.");
    direction = "neutral"; confidence = Math.max(20, confidence - 10);
  }
  return { ok: true, confidence, direction, notes };
}
