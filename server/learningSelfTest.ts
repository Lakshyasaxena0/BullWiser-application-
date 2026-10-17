// Run: npm run test:learning — the self-improvement loop moves weights in the right direction.
import { computeProfile, scoreOutcome, buildSnapshot, parseSnapshot, BASE_STAT } from "./learningService";
let fail = 0; const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fail++; };

// Simulate 60 past predictions at ₹100: price really rose 3% each time. Statistics said bullish, astrology bearish.
const recs: any[] = [];
for (let i = 0; i < 60; i++) {
  const snapRaw = buildSnapshot({
    market: "stock", symbol: "TCS", sector: "IT", finalDirection: "bullish", statsDirection: "bullish", astroDirection: "bearish",
    confidence: 70, weights: { statistical: 55, astrological: 45 }, learnedFrom: 0, aiUsed: false,
    factors: { hora: 70, vedic: 30, nakshatra: 60 }, ltDirection: "bullish", shortDirection: "bearish",
  });
  const pred = { currentPrice: 100, predLow: 95, predHigh: 99, aiLearning: snapRaw };      // range too low: price ends at 103
  const sc = scoreOutcome(pred, 103);
  recs.push({ snap: parseSnapshot(sc.aiLearning)!, w: 1, sector: "IT", symbol: "TCS", market: "stock" });
}
const p = computeProfile(recs, "TCS", "IT", "stock");
ok("stats gets more weight than the 55 base (it was right)", p.weights.statistical > BASE_STAT && p.weights.statistical <= 70);
ok("never below 40 / above 70", p.weights.statistical >= 40 && p.weights.statistical <= 70);
ok("factors that called it right are up-weighted", (p.factorWeights.hora ?? 1) > 1 && (p.factorWeights.vedic ?? 1) < 1);
ok("20-year layer outperformed → positive shift", p.ltShift > 0);
ok("ranges that missed → widened", p.rangeScale > 1 && p.coverage === 0);
ok("overconfidence is corrected downward or flat", p.confidenceAdjustment <= 10);
const none = computeProfile([], "TCS", "IT", "stock");
ok("no data → neutral defaults", none.rangeScale === 1 && none.ltShift === 0 && none.weights.statistical === 55);
process.exit(fail ? 1 : 0);
