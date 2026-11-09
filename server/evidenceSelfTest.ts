// Checks the rules taken from the research literature (see evidenceRules.ts and docs/prediction-evidence.md).
import { confidenceCeiling, shortTermPressure, vixRangeFactors, uniquenessWeight, astroAgreementBonus } from "./evidenceRules";
import { computePriceRange } from "./predictionHelpers";
import { applyUniqueness, computeProfile, buildSnapshot, type Rec } from "./learningService";
import { statisticalAnalysisService } from "./statisticalAnalysisService";
import { summarizePerformance } from "./performance";

let fail = 0; const ok = (n: string, c: boolean, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`); if (!c) fail++; };

// 1. honest confidence
ok("ceiling grows with the horizon", confidenceCeiling(1, false) < confidenceCeiling(7, false) && confidenceCeiling(7, false) < confidenceCeiling(30, false) && confidenceCeiling(30, false) < confidenceCeiling(365, false));
ok("1-day call never above 66%, crypto 4 points lower", confidenceCeiling(1, false) === 66 && confidenceCeiling(1, true) === 62);

// 2. one-month momentum vs reversal
ok("+12% near 52-week high on strong volume → continuation", shortTermPressure({ r1mPct: 12, pth: 0.97, turnoverRatio: 1.3 }).score > 55);
ok("+12% but far from the high → reversal risk", shortTermPressure({ r1mPct: 12, pth: 0.7, turnoverRatio: 1.3 }).score < 45);
ok("+12% on thin volume → reversal risk", shortTermPressure({ r1mPct: 12, pth: 0.95, turnoverRatio: 0.7 }).score < 45);
ok("−12% far from the high on thin volume → bounce", shortTermPressure({ r1mPct: -12, pth: 0.6, turnoverRatio: 0.7 }).score > 55);
ok("small moves / missing data → no view", shortTermPressure({ r1mPct: 3, pth: 0.9, turnoverRatio: 1 }).score === 50 && shortTermPressure({ r1mPct: null, pth: null, turnoverRatio: null }).score === 50);
ok("the rule stays mild (38…62)", [shortTermPressure({ r1mPct: 30, pth: 1, turnoverRatio: 2 }).score, shortTermPressure({ r1mPct: 30, pth: 0.5, turnoverRatio: 0.5 }).score, shortTermPressure({ r1mPct: -30, pth: 0.4, turnoverRatio: 0.5 }).score].every(x => x >= 38 && x <= 62));
// …and it reaches the real stats engine
const mk = (n: number, f: (i: number) => number, vol: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.now() - (n - i) * 86400000), open: f(i), high: f(i) * 1.005, low: f(i) * 0.995, close: f(i), volume: vol(i) }));
const rally = mk(300, i => (i < 270 ? 100 + i * 0.1 : 127 + (i - 270) * 1.2), i => (i < 270 ? 1000 : 1800));       // new highs on rising volume
const spike = mk(300, i => (i < 200 ? 200 - i * 0.4 : i < 270 ? 120 : 120 + (i - 270) * 1.0), i => (i < 270 ? 1000 : 600));   // bounce far from the high on thin volume
const a1 = statisticalAnalysisService.analyzeHistoricalData("RALLY", rally as any)!, a2 = statisticalAnalysisService.analyzeHistoricalData("SPIKE", spike as any)!;
ok("stats engine: rally to new highs on volume is read as continuation", a1.keyFindings.some(x => /tend to continue/.test(x)), a1.keyFindings.join(" | ").slice(0, 90));
ok("stats engine: sharp rise far from the high on thin volume is read as reversal risk", a2.keyRisks.some(x => /give back/.test(x)), a2.keyRisks.join(" | ").slice(0, 90));

// 3. volatility regime → range
const enh = (regime: string) => ({ marketContext: { vixRegime: regime }, volHalfRangePct: 3 });
const rN = computePriceRange(100, enh("normal"), 0.03), rF = computePriceRange(100, enh("fear"), 0.03), rC = computePriceRange(100, enh("calm"), 0.03), rU = computePriceRange(100, enh("unknown"), 0.03);
ok("normal / unknown VIX leaves the range as it was", rN.low === rU.low && rN.high === rU.high && rN.low === 97 && rN.high === 103);
ok("fear widens the range", rF.high - rF.low > rN.high - rN.low, `${rF.low}–${rF.high} vs ${rN.low}–${rN.high}`);
ok("…and gives the downside more room than the upside", (100 - rF.low) > (rF.high - 100) && (rF.high - 100) / 3 < (100 - rF.low) / 3);
ok("calm market narrows it slightly", rC.high - rC.low < rN.high - rN.low);
ok("VIX factors: elevated is between normal and fear", vixRangeFactors("elevated").widen > 1 && vixRangeFactors("elevated").widen < vixRangeFactors("fear").widen);

// 4. independent evidence only
ok("3 same-day outcomes count in full, 25 count like ~9", uniquenessWeight(3) === 1 && Math.abs(25 * uniquenessWeight(25) - Math.sqrt(75)) < 1e-9);
const snapOf = (market: "stock" | "crypto") => JSON.parse(buildSnapshot({ market, symbol: "S", sector: "IT", finalDirection: "bullish", statsDirection: "bullish", astroDirection: "bearish", confidence: 70, weights: { statistical: 55, astrological: 45 }, learnedFrom: 0, aiUsed: false }));
const rec = (day: string, market: "stock" | "crypto", right: boolean): Rec => ({
  snap: { ...snapOf(market), outcome: { factorCorrect: {}, ltCorrect: null, shortCorrect: null, inRange: true, actualPrice: 1, changePct: right ? 5 : -5, actualDirection: right ? "bullish" : "bearish", finalCorrect: right, statsCorrect: right, astroCorrect: !right, scoredAt: `${day}T10:00:00Z` } },
  w: 1, sector: "IT", symbol: "S", market,
});
const oneDay = applyUniqueness(Array.from({ length: 25 }, () => rec("2026-11-02", "stock", true)));
const spread = applyUniqueness(Array.from({ length: 25 }, (_, i) => rec(`2026-10-${String((i % 25) + 1).padStart(2, "0")}`, "stock", true)));
const pOne = computeProfile(oneDay, "S", "IT", "stock"), pSpread = computeProfile(spread, "S", "IT", "stock");
ok("25 outcomes from ONE market day move the weights less than 25 from 25 different days", pOne.weights.statistical < pSpread.weights.statistical, `${pOne.weights.statistical} vs ${pSpread.weights.statistical}`);
ok("raw sample count is still shown to the user", pOne.samples.global === 25);
const tiny = applyUniqueness(Array.from({ length: 5 }, () => rec("2026-11-02", "stock", true)));
ok("five same-day outcomes (little independent evidence) leave weights at 55/45 until more days arrive", computeProfile(tiny, "S", "IT", "stock").weights.statistical <= 60);

// 5. astrology agreement bonus
ok("full +8 while astrology keeps its 45% weight, less once learning demotes it", astroAgreementBonus(0.45) === 8 && astroAgreementBonus(0.30) < 8 && astroAgreementBonus(0.30) >= 2);

// 6. baseline comparison
const row = (dir: string, right: boolean) => ({ stock: "X", aiLearning: JSON.stringify({ v: 1, market: "stock", symbol: "X", finalDirection: "bullish", confidence: 60, outcome: { actualDirection: dir, finalCorrect: right, changePct: 1, statsCorrect: null, astroCorrect: null, inRange: true, scoredAt: "2026-11-02T00:00:00Z" } }), actualPrice: 1, isActive: false, predLow: 1, predHigh: 2, confidence: 60 });
const perf = summarizePerformance([row("bullish", true), row("bullish", true), row("bullish", true), row("bearish", false), row("neutral", false)] as any);
ok("baseline = share of the most common outcome; edge = accuracy minus baseline", perf.baselinePct === 60 && perf.accuracyPct === 60 && perf.edgePct === 0, `${perf.baselinePct}% / edge ${perf.edgePct}`);

console.log(fail ? `\n${fail} check(s) FAILED` : "\nAll evidence checks passed");
process.exit(fail ? 1 : 0);
