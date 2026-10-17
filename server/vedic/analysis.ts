// analysis.ts — Vedic interpretation layer: dignity, retrograde, combustion, graha drishti,
// parivartana (exchange), mritu bhaga, karakas and karakatwa → sector mapping.
import { PlanetPoint, PlanetName, PLANETS, SIGNS, siderealPositions, siderealAscendant, angleDiff, norm360, GeoLocation, MUMBAI } from "./ephemeris";

export const SIGN_LORD: PlanetName[] = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"];
const EXALT: Partial<Record<PlanetName, number>> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const OWN: Partial<Record<PlanetName, number[]>> = { Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10] };
const FRIENDS: Record<string, PlanetName[]> = {
  Sun: ["Moon", "Mars", "Jupiter"], Moon: ["Sun", "Mercury"], Mars: ["Sun", "Moon", "Jupiter"],
  Mercury: ["Sun", "Venus"], Jupiter: ["Sun", "Moon", "Mars"], Venus: ["Mercury", "Saturn"], Saturn: ["Mercury", "Venus"],
};
const ENEMIES: Record<string, PlanetName[]> = {
  Sun: ["Venus", "Saturn"], Moon: [], Mars: ["Mercury"], Mercury: ["Moon"], Jupiter: ["Mercury", "Venus"], Venus: ["Sun", "Moon"], Saturn: ["Sun", "Moon", "Mars"],
};
const COMBUST_ORB: Record<string, [number, number]> = { Moon: [12, 12], Mars: [17, 17], Mercury: [14, 12], Jupiter: [11, 11], Venus: [10, 8], Saturn: [15, 15] };
const MRITU: Record<string, number[]> = {
  Sun: [20, 9, 12, 6, 8, 24, 16, 17, 22, 2, 3, 23], Moon: [26, 12, 13, 25, 24, 11, 26, 14, 13, 25, 5, 12],
  Mars: [19, 28, 25, 23, 29, 28, 14, 21, 2, 15, 11, 6], Mercury: [15, 14, 13, 12, 8, 18, 20, 10, 21, 22, 7, 5],
  Jupiter: [19, 29, 12, 27, 6, 4, 13, 10, 17, 11, 15, 28], Venus: [28, 15, 11, 17, 10, 13, 4, 6, 27, 12, 29, 19],
  Saturn: [10, 4, 7, 9, 12, 16, 3, 18, 28, 14, 13, 15],
};
const SPECIAL_ASPECTS: Record<string, number[]> = { Mars: [4, 7, 8], Jupiter: [5, 7, 9], Saturn: [3, 7, 10], Rahu: [5, 7, 9], Ketu: [5, 7, 9] };

export type Dignity = "exalted" | "debilitated" | "own" | "friend" | "enemy" | "neutral";

export function dignityOf(p: PlanetPoint): Dignity {
  if (p.planet === "Rahu" || p.planet === "Ketu") {
    // Common classical view: Rahu exalted Taurus, debilitated Scorpio (Ketu opposite)
    const ex = p.planet === "Rahu" ? 1 : 7, de = p.planet === "Rahu" ? 7 : 1;
    return p.signIndex === ex ? "exalted" : p.signIndex === de ? "debilitated" : "neutral";
  }
  if (EXALT[p.planet] === p.signIndex) return "exalted";
  if ((EXALT[p.planet]! + 6) % 12 === p.signIndex) return "debilitated";
  if (OWN[p.planet]!.includes(p.signIndex)) return "own";
  const lord = SIGN_LORD[p.signIndex];
  if (FRIENDS[p.planet].includes(lord)) return "friend";
  if (ENEMIES[p.planet].includes(lord)) return "enemy";
  return "neutral";
}
const DIGNITY_SCORE: Record<Dignity, number> = { exalted: 2, own: 1.5, friend: 0.75, neutral: 0, enemy: -0.75, debilitated: -2 };

export interface PlanetAnalysis {
  planet: PlanetName; sign: string; degree: number; house: number; nakshatra: string;
  dignity: Dignity; retrograde: boolean; combust: boolean; mrituBhaga: boolean;
  strength: number; // −5…+5, roughly
  notes: string[];
}
export interface Aspect { from: PlanetName; to: PlanetName; kind: "drishti" | "conjunction"; nature: "benefic" | "malefic" | "mixed"; house: number }
export interface Exchange { a: PlanetName; b: PlanetName; type: "Maha" | "Khala" | "Dainya"; note: string }
export interface Karaka { atmakaraka: PlanetName; amatyakaraka: PlanetName; darakaraka: PlanetName; natural: Record<string, string> }
export interface SectorSignal { sector: string; score: number; reasons: string[] }

const NAKS = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"];
const BENEFICS = new Set<PlanetName>(["Jupiter", "Venus", "Mercury", "Moon"]);
const natureOf = (p: PlanetName) => (p === "Jupiter" || p === "Venus" ? "benefic" : p === "Mercury" || p === "Moon" ? "mixed" : "malefic") as Aspect["nature"];

/** Whole-sign house of a planet counted from `lagnaSign`. */
export const houseFrom = (signIndex: number, lagnaSign: number) => ((signIndex - lagnaSign + 12) % 12) + 1;

export function analyzeSky(date: Date, loc: GeoLocation = MUMBAI) {
  const pos = siderealPositions(date);
  const lagna = siderealAscendant(date, loc);
  const lagnaSign = Math.floor(lagna / 30);
  const sun = pos.Sun;
  const planets: Record<string, PlanetAnalysis> = {};

  for (const name of PLANETS) {
    const p = pos[name];
    const dignity = dignityOf(p);
    const notes: string[] = [];
    let strength = DIGNITY_SCORE[dignity];
    if (dignity !== "neutral") notes.push(`${dignity} in ${p.sign}`);

    let combust = false;
    if (COMBUST_ORB[name]) {
      const sep = Math.abs(angleDiff(p.longitude, sun.longitude));
      const orb = COMBUST_ORB[name][p.retrograde ? 1 : 0];
      if (sep <= orb) { combust = true; strength -= 1.5; notes.push(`combust (${sep.toFixed(1)}° from Sun)`); }
    }
    let mrituBhaga = false;
    if (MRITU[name]) {
      const target = MRITU[name][p.signIndex];
      if (Math.abs(p.degree - target) <= 1) { mrituBhaga = true; strength -= 1; notes.push(`mritu bhaga (~${target}° ${p.sign})`); }
    }
    if (p.retrograde) {
      // Retrograde = more intense / delayed; strengthens a natural benefic's effort, but flags reversal for markets.
      strength += (dignity === "debilitated" ? 0.75 : 0.25);
      notes.push("retrograde (reversal / revisiting themes)");
    }
    if (Math.abs(p.speed) < 0.05 && !["Rahu", "Ketu", "Sun", "Moon"].includes(name)) notes.push("stationary (turning point)");
    const nakshatra = NAKS[Math.floor(p.longitude / (360 / 27)) % 27];
    planets[name] = {
      planet: name, sign: p.sign, degree: Math.round(p.degree * 100) / 100, house: houseFrom(p.signIndex, lagnaSign),
      nakshatra, dignity, retrograde: p.retrograde, combust, mrituBhaga, strength: Math.max(-5, Math.min(5, strength)), notes,
    };
  }

  // Aspects (graha drishti) + conjunctions
  const aspects: Aspect[] = [];
  for (const a of PLANETS) {
    for (const b of PLANETS) {
      if (a === b) continue;
      const pa = pos[a], pb = pos[b];
      if (pa.signIndex === pb.signIndex && a < b) aspects.push({ from: a, to: b, kind: "conjunction", nature: natureOf(a), house: planets[a].house });
      const dist = ((pb.signIndex - pa.signIndex + 12) % 12) + 1;
      const set = SPECIAL_ASPECTS[a] ?? [7];
      if (dist !== 1 && set.includes(dist)) aspects.push({ from: a, to: b, kind: "drishti", nature: natureOf(a), house: planets[b].house });
    }
  }
  // Aspects modify strength: benefic aspect +0.3, malefic aspect −0.3 (not for nodes' targets that are nodes)
  for (const asp of aspects) {
    if (asp.to === "Rahu" || asp.to === "Ketu") continue;
    planets[asp.to].strength = Math.max(-5, Math.min(5, planets[asp.to].strength + (asp.nature === "benefic" ? 0.3 : asp.nature === "malefic" ? -0.3 : 0.05)));
  }

  // Parivartana yoga (sign exchange)
  const exchanges: Exchange[] = [];
  const classic = PLANETS.filter(p => p !== "Rahu" && p !== "Ketu");
  for (let i = 0; i < classic.length; i++) for (let j = i + 1; j < classic.length; j++) {
    const a = classic[i], b = classic[j];
    if (SIGN_LORD[pos[a].signIndex] === b && SIGN_LORD[pos[b].signIndex] === a) {
      const ha = planets[a].house, hb = planets[b].house;
      const dusthana = [6, 8, 12];
      const type: Exchange["type"] = dusthana.includes(ha) || dusthana.includes(hb) ? (ha === 3 || hb === 3 ? "Khala" : "Dainya") : "Maha";
      exchanges.push({ a, b, type, note: `${a} in ${pos[a].sign} ⇄ ${b} in ${pos[b].sign} — ${type === "Maha" ? "powerful mutual support" : type === "Khala" ? "mixed, struggle then gain" : "difficult, weakens both"}` });
      planets[a].strength += type === "Maha" ? 1 : type === "Khala" ? 0.3 : -0.5;
      planets[b].strength += type === "Maha" ? 1 : type === "Khala" ? 0.3 : -0.5;
    }
  }

  // Jaimini chara karakas (7 planets by degree within sign; Rahu excluded)
  const ranked = classic.filter(p => p !== "Moon" || true).map(p => ({ p, d: pos[p].degree })).sort((x, y) => y.d - x.d);
  const karaka: Karaka = {
    atmakaraka: ranked[0].p, amatyakaraka: ranked[1].p, darakaraka: ranked[ranked.length - 1].p,
    natural: { Sun: "soul, authority, government", Moon: "mind, public, liquidity", Mars: "energy, land, courage", Mercury: "commerce, intellect, speech", Jupiter: "wealth, expansion, wisdom", Venus: "luxury, comforts, finance of pleasure", Saturn: "labour, discipline, infrastructure", Rahu: "foreign, technology, speculation", Ketu: "detachment, research, sudden breaks" },
  };

  // Bhava karakas relevant for markets
  const houseKarakas = {
    2: { name: "wealth / savings", planet: "Jupiter" }, 5: { name: "speculation / gains", planet: "Jupiter" },
    7: { name: "trade / partnerships", planet: "Venus" }, 9: { name: "luck / fortune", planet: "Jupiter" },
    10: { name: "career / status", planet: "Sun" }, 11: { name: "income / gains", planet: "Jupiter" },
    8: { name: "sudden loss / volatility", planet: "Saturn" }, 12: { name: "expenses / losses", planet: "Saturn" },
  } as const;
  const lord = (h: number) => SIGN_LORD[(lagnaSign + h - 1) % 12];
  const houseLordStrength: Record<number, { lord: PlanetName; strength: number; karaka: string }> = {};
  for (const h of [2, 5, 9, 10, 11, 8, 12]) {
    const l = lord(h); houseLordStrength[h] = { lord: l, strength: Math.round(planets[l].strength * 100) / 100, karaka: houseKarakas[h as keyof typeof houseKarakas].name };
  }

  return { date, pos, lagna, lagnaSign: SIGNS[lagnaSign], planets, aspects, exchanges, karaka, houseLordStrength };
}
export type SkyAnalysis = ReturnType<typeof analyzeSky>;

// ── Karakatwa: planet / sign / house → products & sectors ───────────────────
export const PLANET_SECTORS: Record<PlanetName, string[]> = {
  Sun: ["Government/PSU", "Power & Energy", "Pharma", "Gold"],
  Moon: ["FMCG", "Dairy & Food", "Shipping & Water", "Hospitality", "Retail"],
  Mars: ["Defence", "Real Estate", "Steel & Metals", "Engineering"],
  Mercury: ["IT & Software", "Telecom", "Media", "Trading & Logistics"],
  Jupiter: ["Banking & Finance", "Education", "Gold", "Insurance"],
  Venus: ["Automobiles", "Luxury & Fashion", "Entertainment", "Consumer Durables"],
  Saturn: ["Oil & Gas", "Mining", "Infrastructure & Cement", "Heavy Industry"],
  Rahu: ["Aviation", "Technology & Foreign", "Chemicals", "Crypto"],
  Ketu: ["Research & Spiritual", "Software", "Pharma Research"],
};
// Sign element/quality themes (the sign a planet transits colours the sector)
export const SIGN_THEMES: string[][] = [
  ["Defence", "Steel & Metals", "Engineering"], ["Banking & Finance", "Luxury & Fashion", "Dairy & Food"], ["IT & Software", "Telecom", "Media"],
  ["FMCG", "Shipping & Water", "Hospitality"], ["Government/PSU", "Power & Energy", "Gold"], ["Pharma", "Healthcare", "Trading & Logistics"],
  ["Luxury & Fashion", "Automobiles", "Consumer Durables"], ["Mining", "Insurance", "Chemicals"], ["Education", "Aviation", "Banking & Finance"],
  ["Infrastructure & Cement", "Oil & Gas", "Heavy Industry"], ["Technology & Foreign", "IT & Software", "Telecom"], ["Pharma", "Shipping & Water", "Research & Spiritual"],
];
export const HOUSE_THEMES: Record<number, string[]> = {
  2: ["Banking & Finance", "Gold"], 4: ["Real Estate", "Automobiles"], 5: ["Entertainment", "Education"], 6: ["Pharma", "Healthcare"],
  7: ["Trading & Logistics", "Retail"], 8: ["Insurance", "Mining"], 9: ["Aviation", "Education"], 10: ["Government/PSU", "Infrastructure & Cement"],
  11: ["Banking & Finance", "Technology & Foreign"], 12: ["Shipping & Water", "Research & Spiritual"],
};

/** Score every sector from the current sky using the planet-owns-product principle. */
export function sectorOutlook(sky: SkyAnalysis): SectorSignal[] {
  const map: Record<string, SectorSignal> = {};
  const add = (sector: string, score: number, reason: string) => { (map[sector] ??= { sector, score: 0, reasons: [] }); map[sector].score += score; map[sector].reasons.push(reason); };
  for (const name of PLANETS) {
    const a = sky.planets[name];
    const w = a.strength; // sign of strength = favourable/unfavourable for products it signifies
    for (const s of PLANET_SECTORS[name]) add(s, w, `${name} ${a.dignity === "neutral" ? "in" : a.dignity + " in"} ${a.sign}${a.retrograde ? " (R)" : ""}${a.combust ? ", combust" : ""}`);
    const signIdx = SIGNS.indexOf(a.sign as any);
    for (const s of SIGN_THEMES[signIdx]) add(s, w * 0.3, `${name} transiting ${a.sign}`);
    for (const s of HOUSE_THEMES[a.house] ?? []) add(s, w * 0.25, `${name} in house ${a.house}`);
  }
  return Object.values(map).map(s => ({ ...s, score: Math.round(s.score * 100) / 100, reasons: s.reasons.slice(0, 4) })).sort((x, y) => y.score - x.score);
}

// ── Asset → sector maps ─────────────────────────────────────────────────────
const STOCK_SECTOR: Record<string, string[]> = {
  TCS: ["IT & Software"], INFY: ["IT & Software"], WIPRO: ["IT & Software"], HCLTECH: ["IT & Software"], TECHM: ["IT & Software"], LTIM: ["IT & Software"],
  HDFCBANK: ["Banking & Finance"], ICICIBANK: ["Banking & Finance"], SBIN: ["Banking & Finance", "Government/PSU"], KOTAKBANK: ["Banking & Finance"], AXISBANK: ["Banking & Finance"], BAJFINANCE: ["Banking & Finance"], BAJAJFINSV: ["Banking & Finance", "Insurance"],
  RELIANCE: ["Oil & Gas", "Telecom"], ONGC: ["Oil & Gas", "Government/PSU"], BPCL: ["Oil & Gas"], IOC: ["Oil & Gas"], COALINDIA: ["Mining", "Government/PSU"],
  HINDUNILVR: ["FMCG"], ITC: ["FMCG"], NESTLEIND: ["FMCG", "Dairy & Food"], BRITANNIA: ["FMCG", "Dairy & Food"], TATACONSUM: ["FMCG"],
  MARUTI: ["Automobiles"], TATAMOTORS: ["Automobiles"], "M&M": ["Automobiles"], BAJAJ_AUTO: ["Automobiles"], HEROMOTOCO: ["Automobiles"], EICHERMOT: ["Automobiles"],
  SUNPHARMA: ["Pharma"], DRREDDY: ["Pharma"], CIPLA: ["Pharma"], DIVISLAB: ["Pharma"], APOLLOHOSP: ["Healthcare"],
  TATASTEEL: ["Steel & Metals"], JSWSTEEL: ["Steel & Metals"], HINDALCO: ["Steel & Metals", "Mining"], VEDL: ["Mining", "Steel & Metals"],
  LT: ["Infrastructure & Cement", "Engineering"], ULTRACEMCO: ["Infrastructure & Cement"], GRASIM: ["Infrastructure & Cement"], ADANIPORTS: ["Shipping & Water", "Infrastructure & Cement"],
  NTPC: ["Power & Energy", "Government/PSU"], POWERGRID: ["Power & Energy", "Government/PSU"], ADANIGREEN: ["Power & Energy"], TATAPOWER: ["Power & Energy"],
  BHARTIARTL: ["Telecom"], IDEA: ["Telecom"], TITAN: ["Luxury & Fashion", "Gold"], ASIANPAINT: ["Consumer Durables", "Chemicals"], DLF: ["Real Estate"], GODREJPROP: ["Real Estate"],
  HAL: ["Defence", "Government/PSU", "Aviation"], BEL: ["Defence", "Government/PSU"], INDIGO: ["Aviation"], ZOMATO: ["Hospitality", "Retail"], DMART: ["Retail"], LICI: ["Insurance", "Government/PSU"], SBILIFE: ["Insurance"],
};
const CRYPTO_CATEGORY: Record<string, string[]> = {
  BTC: ["Crypto", "Gold"], ETH: ["Crypto", "Technology & Foreign", "IT & Software"], BNB: ["Crypto", "Trading & Logistics"], SOL: ["Crypto", "Technology & Foreign"],
  XRP: ["Crypto", "Banking & Finance"], ADA: ["Crypto", "Research & Spiritual"], DOGE: ["Crypto", "Entertainment"], MATIC: ["Crypto", "IT & Software"], DOT: ["Crypto", "Technology & Foreign"],
  LTC: ["Crypto", "Trading & Logistics"], LINK: ["Crypto", "IT & Software"], AVAX: ["Crypto", "Technology & Foreign"], USDT: ["Banking & Finance"], TRX: ["Crypto", "Entertainment"],
};
export function sectorsForSymbol(symbol: string, assetType: "stock" | "crypto" = "stock"): string[] {
  const s = symbol.toUpperCase().replace(/\.(NS|BO)$/, "").replace(/-USD.*$|USDT$|INR$/, "");
  return (assetType === "crypto" ? CRYPTO_CATEGORY[s] : STOCK_SECTOR[s]) ?? (assetType === "crypto" ? ["Crypto"] : []);
}

export interface AssetVedicView {
  sectors: string[]; sectorScore: number; score: number; // score −1..+1
  bias: "bullish" | "bearish" | "neutral"; reasons: string[];
  highlights: { retrograde: string[]; combust: string[]; mrituBhaga: string[]; exchanges: string[]; strong: string[]; weak: string[] };
}

/** Asset-specific Vedic view: sector karakas + general market-wide yogas. */
export function assetView(sky: SkyAnalysis, symbol: string, assetType: "stock" | "crypto" = "stock"): AssetVedicView {
  const sectors = sectorsForSymbol(symbol, assetType);
  const outlook = sectorOutlook(sky);
  const lookup = new Map(outlook.map(o => [o.sector, o]));
  const reasons: string[] = [];
  let sectorScore = 0;
  for (const s of sectors) {
    const o = lookup.get(s); if (!o) continue;
    sectorScore += o.score; reasons.push(`${s}: ${o.score >= 0 ? "+" : ""}${o.score} (${o.reasons[0]})`);
  }
  if (sectors.length) sectorScore /= sectors.length;
  // Market wide: Jupiter (growth) & Venus (liquidity) vs Saturn/Mars/Rahu (restriction/volatility)
  const P = sky.planets;
  const market = (P.Jupiter.strength + P.Venus.strength + P.Moon.strength * 0.5 + P.Mercury.strength * 0.5) / 3 - (Math.max(0, -P.Saturn.strength) + Math.max(0, -P.Mars.strength)) * 0.15;
  const lordsGain = (sky.houseLordStrength[11].strength + sky.houseLordStrength[5].strength + sky.houseLordStrength[2].strength) / 3 - sky.houseLordStrength[8].strength * 0.2;
  const raw = sectorScore * 0.45 + market * 0.35 + lordsGain * 0.2;
  const score = Math.max(-1, Math.min(1, Math.tanh(raw / 2.2)));
  const hl = {
    retrograde: PLANETS.filter(p => P[p].retrograde), combust: PLANETS.filter(p => P[p].combust), mrituBhaga: PLANETS.filter(p => P[p].mrituBhaga),
    exchanges: sky.exchanges.map(e => e.note), strong: PLANETS.filter(p => P[p].strength >= 1.5), weak: PLANETS.filter(p => P[p].strength <= -1.5),
  };
  if (hl.retrograde.length) reasons.push(`Retrograde: ${hl.retrograde.join(", ")}`);
  if (hl.combust.length) reasons.push(`Combust: ${hl.combust.join(", ")}`);
  if (hl.mrituBhaga.length) reasons.push(`Mritu bhaga: ${hl.mrituBhaga.join(", ")}`);
  return { sectors, sectorScore: Math.round(sectorScore * 100) / 100, score: Math.round(score * 1000) / 1000, bias: score > 0.12 ? "bullish" : score < -0.12 ? "bearish" : "neutral", reasons, highlights: hl };
}
