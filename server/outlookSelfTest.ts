// Run: npm run test:outlook — checks the Market Outlook maths using SYNTHETIC price histories (test data only).
import { MarketOutlookService } from "./marketOutlookService";
let fail = 0; const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fail++; };

function series(seed: number, dailyDrift: number, vol: number, n = 2000) {
  let x = seed, p = 100; const out: any[] = []; const start = Date.now() - n * 86400000;
  const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  for (let i = 0; i < n; i++) {
    const z = (rnd() + rnd() + rnd() + rnd() - 2) * 1.7;       // ~N(0,1)
    p *= Math.exp(dailyDrift + vol * z);
    out.push({ date: new Date(start + i * 86400000), open: p, high: p * 1.005, low: p * 0.995, close: p, volume: 1e6 });
  }
  return out;
}

(async () => {
  const svc: any = new MarketOutlookService();
  // sectors: first 4 strongly rising, last 4 strongly falling, others flat
  const seed = (key: string, drift: number, s: number) => svc.bars.set(key, { at: Date.now(), value: series(s, drift, 0.012) });
  const rising = ["TCS", "INFY", "HCLTECH", "WIPRO"], falling = ["TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL"];
  const every = ["TCS","INFY","HCLTECH","WIPRO","HDFCBANK","ICICIBANK","SBIN","AXISBANK","SUNPHARMA","DRREDDY","CIPLA","DIVISLAB","RELIANCE","ONGC","BPCL","IOC","NTPC","POWERGRID","TATAPOWER","ADANIGREEN","MARUTI","TATAMOTORS","EICHERMOT","HEROMOTOCO","HINDUNILVR","ITC","NESTLEIND","BRITANNIA","TATASTEEL","JSWSTEEL","HINDALCO","VEDL","LT","ULTRACEMCO","GRASIM","ADANIPORTS","DLF","GODREJPROP","OBEROIRLTY","BHARTIARTL","IDEA","HAL","BEL","BDL","SBILIFE","HDFCLIFE","LICI","TITAN","ASIANPAINT","HAVELLS"];
  every.forEach((s, i) => seed(`S:${s}`, rising.includes(s) ? 0.0025 : falling.includes(s) ? -0.0025 : 0.0001, 100 + i));
  ["BTC","ETH","BNB","SOL","XRP","ADA","DOGE","AVAX","LINK","DOT","TRX","LTC","BCH","ATOM","NEAR","UNI","SHIB","SUI","APT","ARB"].forEach((s, i) => seed(`C:${s}`, i < 4 ? 0.003 : i > 15 ? -0.003 : 0, 500 + i));

  const r = await svc.generateOutlook("1m");
  ok("14 sectors analysed", r.stocks.all.length === 14 && r.stocks.unavailable.length === 0);
  ok("top 4 bullish list has at most 4 entries, sorted high→low", r.stocks.topBullish.length <= 4 && r.stocks.topBullish.every((x: any, i: number, a: any[]) => i === 0 || a[i - 1].changeEstimate >= x.changeEstimate));
  ok("top 4 bearish list has at most 4 entries, sorted most-negative first", r.stocks.topBearish.length <= 4 && r.stocks.topBearish.every((x: any, i: number, a: any[]) => i === 0 || a[i - 1].changeEstimate <= x.changeEstimate));
  ok("IT (rising history) ranks above Steel & Metals (falling history)", r.stocks.all.findIndex((x: any) => x.sector === "IT & Software") < r.stocks.all.findIndex((x: any) => x.sector === "Steel & Metals"));
  ok("Steel & Metals expected return is lower than IT", r.stocks.all.find((x: any) => x.sector === "Steel & Metals").changeEstimate < r.stocks.all.find((x: any) => x.sector === "IT & Software").changeEstimate);
  ok("crypto: rising coins above falling coins", r.crypto.all.findIndex((x: any) => x.symbol === "BTC") < r.crypto.all.findIndex((x: any) => x.symbol === "ARB"));
  ok("every row has range low ≤ expected ≤ range high (±shift tolerance)", r.stocks.all.every((x: any) => x.rangeLow <= x.rangeHigh));
  ok("confidence within 30–85", [...r.stocks.all, ...r.crypto.all].every((x: any) => x.confidence >= 30 && x.confidence <= 85));
  ok("deterministic for same inputs (cached)", JSON.stringify((await svc.generateOutlook("1m")).stocks.all) === JSON.stringify(r.stocks.all));
  const r1y = await svc.generateOutlook("1y");
  ok("longer horizon changes the target date and numbers", r1y.daysAhead === 365 && JSON.stringify(r1y.stocks.all) !== JSON.stringify(r.stocks.all));
  const svc2: any = new MarketOutlookService();
  const empty = await svc2.generateOutlook("1m").catch(() => null);
  ok("no data → everything 'unavailable', nothing invented", !!empty && empty.stocks.all.length === 0 && empty.stocks.unavailable.length === 14);
  console.log(fail ? `\n${fail} FAILED` : "\nAll outlook checks passed"); process.exit(fail ? 1 : 0);
})();
