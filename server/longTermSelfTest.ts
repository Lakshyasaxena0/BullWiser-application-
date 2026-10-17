// Run: npm run test:stats — sanity checks for the 20-year engine on a deterministic synthetic series.
import { longTermStatsService, tradingDaysBetween } from "./longTermStatsService";
let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const bars: any[] = []; let p = 100; const d0 = new Date("2006-10-17");
for (let i = 0; i < 5200; i++) { p *= 1 + 0.0004 + (rnd() - 0.5) * 0.03; bars.push({ date: new Date(d0.getTime() + i * 86400000 * 1.4), open: p, high: p, low: p, close: p, volume: 1e6 }); }
let fail = 0; const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fail++; };
const now = new Date(bars[bars.length - 1].date);
const r = longTermStatsService.analyze("SYN", bars, new Date(now.getTime() + 30 * 86400000), now)!;
ok("returns a result with ~20 years", !!r && r.yearsOfData > 19);
ok("score within 5..95 and confidence 30..80", r.score >= 5 && r.score <= 95 && r.confidence >= 30 && r.confidence <= 80);
ok("forecast quantiles ordered", r.forecast.p10ReturnPct <= r.forecast.medianReturnPct && r.forecast.medianReturnPct <= r.forecast.p90ReturnPct);
ok("probUp between 0 and 100", r.forecast.probUpPct >= 0 && r.forecast.probUpPct <= 100);
ok("backtest ran", r.backtest.tests > 10);
ok("deterministic", JSON.stringify(r) === JSON.stringify(longTermStatsService.analyze("SYN", bars, new Date(now.getTime() + 30 * 86400000), now)));
ok("too little data → null", longTermStatsService.analyze("X", bars.slice(0, 100), now) === null);
ok("horizon 30 calendar days ≈ 21 trading days", tradingDaysBetween(now, new Date(now.getTime() + 30 * 86400000)) === 21);
process.exit(fail ? 1 : 0);
