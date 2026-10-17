// Run: npm run test:weights — default and learned weights stay anchored on 55% statistics / 45% astrology.
import { computeProfile, BASE_STAT } from "./learningService";
let fail = 0; const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fail++; };
const empty = computeProfile([], "TCS", "IT", "stock");
ok("no history → 55/45", empty.weights.statistical === 55 && empty.weights.astrological === 45 && BASE_STAT === 55);
process.exit(fail ? 1 : 0);
