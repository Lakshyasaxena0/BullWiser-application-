// Run: npm run test:vedic — checks the ephemeris against well-known historical dates.
import { siderealPositions, panchang, dayParts, hhmmIST } from "./ephemeris";
import { analyzeSky, assetView } from "./analysis";
import { astrologyService } from "../astrologyService";

let fail = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail++; };
const P = (s: string) => siderealPositions(new Date(s));

ok("Saturn enters sidereal Aquarius ~17 Jan 2023", P("2023-01-14T12:00:00Z").Saturn.sign === "Capricorn" && P("2023-01-18T12:00:00Z").Saturn.sign === "Aquarius");
ok("Saturn enters sidereal Pisces ~29 Mar 2025", P("2025-03-27T12:00:00Z").Saturn.sign === "Aquarius" && P("2025-03-31T12:00:00Z").Saturn.sign === "Pisces");
ok("Jupiter enters sidereal Taurus ~1 May 2024", P("2024-04-29T12:00:00Z").Jupiter.sign === "Aries" && P("2024-05-02T12:00:00Z").Jupiter.sign === "Taurus");
ok("Mercury retrograde 25 Mar 2025, direct 10 Apr 2025", P("2025-03-25T12:00:00Z").Mercury.retrograde && !P("2025-04-10T12:00:00Z").Mercury.retrograde);
ok("Mars retrograde 20 Jan 2025, direct 10 Mar 2025", P("2025-01-20T12:00:00Z").Mars.retrograde && !P("2025-03-10T12:00:00Z").Mars.retrograde);
ok("Rahu and Ketu are 180° apart", Math.abs(((P("2024-06-01T00:00:00Z").Rahu.longitude - P("2024-06-01T00:00:00Z").Ketu.longitude + 360) % 360) - 180) < 1e-6);
const pc = panchang(new Date("2024-11-15T05:00:00Z"));
ok("Kartik Purnima 15 Nov 2024 = Purnima / Shukla", pc.tithi === "Purnima" && pc.paksha === "Shukla");
const dp = dayParts(new Date("2024-11-15T05:00:00Z"));
ok("Mumbai sunrise 15 Nov 2024 ≈ 06:46 IST", hhmmIST(dp.sunrise) === "06:46" || hhmmIST(dp.sunrise) === "06:47");
ok("Friday Rahu Kaal starts ≈ 10:30–11:00 IST", ["10:58", "10:59", "11:00", "10:57"].includes(hhmmIST(dp.rahuKalam[0])));
const sky = analyzeSky(new Date("2025-03-25T05:00:00Z"));
ok("Mercury debilitated+combust+retrograde in Pisces (25 Mar 2025)", sky.planets.Mercury.dignity === "debilitated" && sky.planets.Mercury.combust && sky.planets.Mercury.retrograde);
ok("Jupiter–Venus sign exchange detected (Mar 2025)", sky.exchanges.some(e => [e.a, e.b].includes("Jupiter") && [e.a, e.b].includes("Venus")));
ok("IT stock is bearish with that Mercury", assetView(sky, "TCS").bias === "bearish");

(async () => {
  const pred = await astrologyService.generateAstroPrediction("RELIANCE", new Date(), 2500);
  ok("generateAstroPrediction returns a bounded result", pred.strength >= 0 && pred.strength <= 100 && pred.confidence >= 40 && pred.confidence <= 90 && !!pred.vedic);
  const a = await astrologyService.generateAstroPrediction("BTC", new Date("2025-03-25T05:00:00Z"), 80000);
  const b = await astrologyService.generateAstroPrediction("BTC", new Date("2025-03-25T05:00:00Z"), 80000);
  ok("deterministic for the same moment", a.strength === b.strength);
  console.log(fail ? `\n${fail} FAILED` : "\nAll vedic checks passed");
  process.exit(fail ? 1 : 0);
})();
