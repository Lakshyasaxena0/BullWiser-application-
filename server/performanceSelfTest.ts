// Run: npm run test:performance — correct/wrong counting from scored outcomes (synthetic rows, test data only).
import { summarizePerformance } from "./performance";
let fail = 0; const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fail++; };
const snap = (market: string, symbol: string, final: string, actual: string, correct: boolean, extra: any = {}) => JSON.stringify({
  v: 1, market, symbol, sector: "x", finalDirection: final, statsDirection: "bullish", astroDirection: "bearish", confidence: 60,
  weights: { statistical: 55, astrological: 45 }, learnedFrom: 0, aiUsed: false,
  outcome: { actualPrice: 110, changePct: actual === "bullish" ? 5 : -5, actualDirection: actual, finalCorrect: correct, statsCorrect: actual === "bullish", astroCorrect: actual === "bearish", inRange: correct, scoredAt: "2026-10-1" + (extra.d ?? 0) + "T00:00:00Z" },
});
const row = (stock: string, ai: string | null, active = false, actual: number | null = 110) => ({ stock, aiLearning: ai, actualPrice: actual, isActive: active, predLow: 95, predHigh: 105, confidence: 60 });
const rows = [
  row("TCS", snap("stock", "TCS", "bullish", "bullish", true, { d: 1 })),
  row("INFY", snap("stock", "INFY", "bullish", "bearish", false, { d: 2 })),
  row("CRYPTO_BTC", snap("crypto", "BTC", "bearish", "bearish", true, { d: 3 })),
  row("HDFCBANK", null, true, null),                        // pending – not yet due
  row("SBIN", null, false, 100),                            // no snapshot – can't be judged, must not count
];
const r = summarizePerformance(rows as any);
ok("scored = 3 (pending and snapshot-less rows are not counted)", r.scored === 3);
ok("2 correct, 1 wrong", r.correct === 2 && r.wrong === 1);
ok("accuracy 66.7%", r.accuracyPct === 66.7);
ok("pending = 1", r.pending === 1);
ok("by market: stock 1/2, crypto 1/1", r.byMarket.stock.scored === 2 && r.byMarket.stock.correct === 1 && r.byMarket.crypto.accuracyPct === 100);
ok("recent list newest first", r.recent[0].symbol === "BTC");
ok("no data → null accuracy, not 0 or a made-up number", summarizePerformance([]).accuracyPct === null);
console.log(fail ? `\n${fail} FAILED` : "\nAll performance checks passed"); process.exit(fail ? 1 : 0);
