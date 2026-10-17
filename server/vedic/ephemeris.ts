// ─────────────────────────────────────────────────────────────────────────────
// ephemeris.ts — real astronomical positions for Vedic (sidereal, Lahiri) charts.
// Uses the `astronomy-engine` package (pure JS, ~1 arc-minute accuracy for the Sun,
// Moon and planets) instead of the old linear "mean longitude" approximation.
// ─────────────────────────────────────────────────────────────────────────────
import * as Astro from "astronomy-engine";

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;
export type SignName = (typeof SIGNS)[number];

export const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"] as const;
export type PlanetName = (typeof PLANETS)[number];

export const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha",
  "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula",
  "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];

export interface GeoLocation { lat: number; lng: number }
export const MUMBAI: GeoLocation = { lat: 19.076, lng: 72.8777 }; // NSE / BSE

const BODY: Record<string, Astro.Body> = {
  Sun: Astro.Body.Sun, Moon: Astro.Body.Moon, Mars: Astro.Body.Mars,
  Mercury: Astro.Body.Mercury, Jupiter: Astro.Body.Jupiter, Venus: Astro.Body.Venus, Saturn: Astro.Body.Saturn,
};

export const norm360 = (x: number) => ((x % 360) + 360) % 360;
/** Smallest signed angle a→b in degrees, range (-180, 180]. */
export const angleDiff = (a: number, b: number) => { const d = norm360(b - a); return d > 180 ? d - 360 : d; };

const julianCenturies = (date: Date) => (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525;

/** Lahiri (Chitrapaksha) ayanamsa in degrees: 23°51'11" at J2000.0 plus general precession. */
export function lahiriAyanamsa(date: Date): number {
  const T = julianCenturies(date);
  return 23.85306 + (5028.796195 * T + 1.1054348 * T * T) / 3600;
}

/** Mean lunar node (Rahu), tropical longitude. */
function meanNodeTropical(date: Date): number {
  const T = julianCenturies(date);
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T);
}

function tropicalLongitude(planet: string, date: Date): number {
  if (planet === "Rahu") return meanNodeTropical(date);
  if (planet === "Ketu") return norm360(meanNodeTropical(date) + 180);
  const vec = Astro.GeoVector(BODY[planet], date, true);
  return norm360(Astro.Ecliptic(vec).elon);
}

export interface PlanetPoint {
  planet: PlanetName;
  longitude: number;     // sidereal, 0–360
  signIndex: number;     // 0 = Aries
  sign: SignName;
  degree: number;        // 0–30 within the sign
  speed: number;         // degrees / day (negative = retrograde)
  retrograde: boolean;
}

export function siderealPositions(date: Date): Record<PlanetName, PlanetPoint> {
  const ay = lahiriAyanamsa(date);
  const out = {} as Record<PlanetName, PlanetPoint>;
  const dt = 6 * 3600 * 1000; // ±6h for the speed estimate
  for (const planet of PLANETS) {
    const lon = norm360(tropicalLongitude(planet, date) - ay);
    let speed: number;
    if (planet === "Rahu" || planet === "Ketu") speed = -0.0529539; // mean node always moves backwards
    else {
      const a = tropicalLongitude(planet, new Date(date.getTime() - dt));
      const b = tropicalLongitude(planet, new Date(date.getTime() + dt));
      speed = angleDiff(a, b) / 0.5;
    }
    const signIndex = Math.floor(lon / 30);
    out[planet] = {
      planet, longitude: lon, signIndex, sign: SIGNS[signIndex], degree: lon - signIndex * 30, speed,
      // The Sun and Moon never turn retrograde; the nodes are always "retrograde" but that is not a signal.
      retrograde: planet === "Sun" || planet === "Moon" || planet === "Rahu" || planet === "Ketu" ? false : speed < 0,
    };
  }
  return out;
}

/** Sidereal ascendant (lagna) longitude for a place and moment. */
export function siderealAscendant(date: Date, loc: GeoLocation = MUMBAI): number {
  const gmstHours = Astro.SiderealTime(date); // apparent sidereal time at Greenwich, hours
  const ramc = norm360(gmstHours * 15 + loc.lng) * Math.PI / 180;
  const T = julianCenturies(date);
  const eps = (23.4392911 - 0.0130042 * T) * Math.PI / 180;
  const lat = loc.lat * Math.PI / 180;
  const asc = Math.atan2(Math.cos(ramc), -(Math.sin(eps) * Math.tan(lat) + Math.cos(eps) * Math.sin(ramc)));
  return norm360(asc * 180 / Math.PI - lahiriAyanamsa(date));
}

// ── Panchang (real, from the Sun–Moon geometry) ──────────────────────────────
const TITHI_NAMES = ["Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi"];
const YOGA_NAMES = ["Vishkumbh", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti"];
const MOVABLE_KARANAS = ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti"];
const DAY_LORDS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];           // Sunday … Saturday
const HORA_ORDER = ["Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars"];           // descending speed order

export interface PanchangInfo {
  tithi: string; paksha: "Shukla" | "Krishna"; tithiNumber: number;   // 1–30
  nakshatra: string; yoga: string; karana: string;
  moonElongation: number; lunarPhase: string; lunarIllumination: number;
}

export function panchang(date: Date): PanchangInfo {
  const pos = siderealPositions(date);
  const elong = norm360(pos.Moon.longitude - pos.Sun.longitude);
  const tithiNumber = Math.floor(elong / 12) + 1;                       // 1..30
  const paksha = tithiNumber <= 15 ? "Shukla" : "Krishna";
  const inPaksha = ((tithiNumber - 1) % 15) + 1;                        // 1..15
  const tithi = inPaksha === 15 ? (paksha === "Shukla" ? "Purnima" : "Amavasya") : TITHI_NAMES[inPaksha - 1];
  const nakshatra = NAKSHATRAS[Math.floor(pos.Moon.longitude / (360 / 27)) % 27];
  const yoga = YOGA_NAMES[Math.floor(norm360(pos.Sun.longitude + pos.Moon.longitude) / (360 / 27)) % 27];
  const k = Math.floor(elong / 6);                                      // 0..59 half-tithis
  const karana = k === 0 ? "Kimstughna" : k >= 57 ? ["Shakuni", "Chatushpada", "Naga"][k - 57] : MOVABLE_KARANAS[(k - 1) % 7];
  const illum = (1 - Math.cos(elong * Math.PI / 180)) / 2 * 100;
  const lunarPhase = elong < 12 || elong > 348 ? "New Moon" : Math.abs(elong - 180) < 12 ? "Full Moon" : elong < 180 ? "Waxing" : "Waning";
  return { tithi, paksha, tithiNumber, nakshatra, yoga, karana, moonElongation: elong, lunarPhase, lunarIllumination: Math.round(illum * 10) / 10 };
}

// ── Day parts from real sunrise / sunset ─────────────────────────────────────
const IST_OFFSET_MIN = 330;
export const toIST = (d: Date) => new Date(d.getTime() + IST_OFFSET_MIN * 60000);
export const hhmmIST = (d: Date) => { const t = toIST(d); return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`; };

function sunEvent(kind: "rise" | "set", from: Date, loc: GeoLocation): Date | null {
  const obs = new Astro.Observer(loc.lat, loc.lng, 0);
  const ev = Astro.SearchRiseSet(Astro.Body.Sun, obs, kind === "rise" ? +1 : -1, from, 2);
  return ev ? ev.date : null;
}

export interface DayParts {
  sunrise: Date; sunset: Date; nextSunrise: Date; weekday: number;      // weekday of the Vedic day (0 = Sunday)
  hora: string; rahuKalam: [Date, Date]; gulikaKalam: [Date, Date]; yamagandaKalam: [Date, Date];
  abhijit: [Date, Date]; brahma: [Date, Date];
}

const RAHU_PART = [8, 2, 7, 5, 6, 4, 3];       // Sunday … Saturday (1-based eighth of the day)
const GULIKA_PART = [7, 6, 5, 4, 3, 2, 1];
const YAMA_PART = [4, 3, 2, 1, 7, 6, 5];

export function dayParts(date: Date, loc: GeoLocation = MUMBAI): DayParts {
  // Find the sunrise that starts the Vedic day containing `date`
  const istMidnight = new Date(Date.UTC(toIST(date).getUTCFullYear(), toIST(date).getUTCMonth(), toIST(date).getUTCDate()) - IST_OFFSET_MIN * 60000);
  let sunrise = sunEvent("rise", istMidnight, loc) as Date;
  if (date.getTime() < sunrise.getTime()) sunrise = sunEvent("rise", new Date(istMidnight.getTime() - 86400000), loc) as Date;
  const sunset = sunEvent("set", sunrise, loc) as Date;
  const nextSunrise = sunEvent("rise", new Date(sunrise.getTime() + 3 * 3600000), loc) as Date;
  const weekday = toIST(sunrise).getUTCDay();

  const dayLen = sunset.getTime() - sunrise.getTime();
  const eighth = dayLen / 8;
  const part = (n: number): [Date, Date] => [new Date(sunrise.getTime() + (n - 1) * eighth), new Date(sunrise.getTime() + n * eighth)];

  // Hora: 24 equal parts from sunrise to next sunrise, lords follow the weekday's lord
  const horaLen = (nextSunrise.getTime() - sunrise.getTime()) / 24;
  const horaIdx = Math.min(23, Math.max(0, Math.floor((date.getTime() - sunrise.getTime()) / horaLen)));
  const start = HORA_ORDER.indexOf(DAY_LORDS[weekday]);
  const hora = HORA_ORDER[(start + horaIdx) % 7];

  const noon = new Date((sunrise.getTime() + sunset.getTime()) / 2);
  return {
    sunrise, sunset, nextSunrise, weekday, hora,
    rahuKalam: part(RAHU_PART[weekday]), gulikaKalam: part(GULIKA_PART[weekday]), yamagandaKalam: part(YAMA_PART[weekday]),
    abhijit: [new Date(noon.getTime() - 24 * 60000), new Date(noon.getTime() + 24 * 60000)],
    brahma: [new Date(sunrise.getTime() - 96 * 60000), new Date(sunrise.getTime() - 48 * 60000)],
  };
}
