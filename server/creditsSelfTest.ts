// Run: npm run test:credits — pricing rules (pure) and, when a real DATABASE_URL is set, wallet behaviour.
import { predictionCost, outlookCost, validateLooseCredits, packList, CREDIT_RUPEES, benefitTier } from "./creditPricing";
let fail = 0; const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fail++; };
const base = { asset: "stock" as const, style: "suggestion" as const, risk: "low" as const, horizonDays: 1, useAi: true, useAstro: true, potentialMovePct: 0 };

ok("1 credit = ₹10", CREDIT_RUPEES === 10);
ok("packs are 300/500/700/1200/1500/2000 at ₹10 each", JSON.stringify(packList().map(p => [p.credits, p.rupees])) === JSON.stringify([[300, 3000], [500, 5000], [700, 7000], [1200, 12000], [1500, 15000], [2000, 20000]]));
ok("loose buy accepts 37 credits", (validateLooseCredits(37) as any).ok === true);
ok("loose buy rejects 3, 1.5, 'abc', 99999", [3, 1.5, "abc", 99999].every(v => !(validateLooseCredits(v) as any).ok));

const c0 = predictionCost(base).credits;
ok("cheapest full prediction costs 5 credits (₹50)", c0 === 5);
ok("auto-trading signal costs more than suggestion", predictionCost({ ...base, style: "auto" }).credits > c0);
ok("crypto costs more than stock", predictionCost({ ...base, asset: "crypto" }).credits > c0);
ok("higher risk costs more (low < medium < high)", predictionCost({ ...base, risk: "medium" }).credits > c0 && predictionCost({ ...base, risk: "high" }).credits > predictionCost({ ...base, risk: "medium" }).credits);
ok("longer horizon costs more", predictionCost({ ...base, horizonDays: 90 }).credits > predictionCost({ ...base, horizonDays: 7 }).credits);
ok("switching AI off is cheaper", predictionCost({ ...base, useAi: false }).credits < c0);
ok("switching astrology off is cheaper", predictionCost({ ...base, useAstro: false }).credits < c0);
ok("both off = statistics only, cheapest", predictionCost({ ...base, useAi: false, useAstro: false }).credits < predictionCost({ ...base, useAi: false }).credits);
ok("bigger benefit potential costs more", predictionCost({ ...base, potentialMovePct: 20 }).credits > c0 && benefitTier(5) === 1 && benefitTier(1) === 0 && benefitTier(null) === 0);
ok("never below 1 or above 40", predictionCost({ ...base, useAi: false, useAstro: false }).credits >= 1 && predictionCost({ ...base, style: "auto", asset: "crypto", risk: "high", horizonDays: 400, potentialMovePct: 99 }).credits <= 40);
ok("breakdown lines are provided", predictionCost(base).lines.length >= 6);
ok("outlook costs 3 (4 for long horizons)", outlookCost("1m").credits === 3 && outlookCost("1y").credits === 4);

(async () => {
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("x:x@localhost")) {
    const { pool } = await import("./db");
    const w = await import("./wallet");
    await w.ensureWalletTables();
    const uid = "test-wallet-" + Date.now();
    await pool.query("INSERT INTO users (id, username, password) VALUES ($1,$1,'x')", [uid]);
    try {
      ok("new wallet starts at 0", (await w.getBalance(uid)) === 0);
      ok("spend with no credits is refused", (await w.spendCredits(uid, 5, "t")).ok === false);
      const c = await pool.connect(); await c.query("BEGIN"); await w.addCredits(c, uid, 10, "purchase", "t"); await c.query("COMMIT"); c.release();
      ok("balance 10 after top-up", (await w.getBalance(uid)) === 10);
      const [a, b] = await Promise.all([w.spendCredits(uid, 7, "t"), w.spendCredits(uid, 7, "t")]);
      ok("two parallel spends of 7 from 10 → exactly one succeeds", [a.ok, b.ok].filter(Boolean).length === 1);
      const good = a.ok ? a : b;
      ok("balance is 3, never negative", (await w.getBalance(uid)) === 3);
      ok("refund restores credits", (await w.refundSpend(uid, good.txId!, "test")) === 10);
      ok("refund works only once", (await w.refundSpend(uid, good.txId!, "again")) === null && (await w.getBalance(uid)) === 10);
    } finally {
      await pool.query("DELETE FROM credit_transactions WHERE user_id=$1", [uid]);
      await pool.query("DELETE FROM credit_wallets WHERE user_id=$1", [uid]);
      await pool.query("DELETE FROM users WHERE id=$1", [uid]);
      await pool.end();
    }
  } else console.log("(wallet DB tests skipped — set a real DATABASE_URL)");
  console.log(fail ? `\n${fail} FAILED` : "\nAll credit checks passed");
  process.exit(fail ? 1 : 0);
})();
