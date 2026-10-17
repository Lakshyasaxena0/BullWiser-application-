# BullWiser

AI + Vedic-astrology + statistics based **stocks & cryptocurrency prediction system** (informational only — not investment advice).

One codebase, three ways to use it:

| Target | Folder | Output |
|---|---|---|
| Web + API (hosted on Render) | `client/`, `server/` | https://your-app.onrender.com |
| Android 5.1+ | `mobile/` (Capacitor) | `app-debug.apk` |
| Windows 7 / 8 / 8.1 / 10 / 11 | `desktop/` (Electron 22) | `BullWiser-Setup-*-ia32.exe` / `-x64.exe` |

The Android and Windows apps are thin shells that open the Render-hosted site (same login, same data), with an offline/retry page.

## 1. Deploy the server (Render)
Create a Web Service from this repo (`render.yaml` has the settings). Build: `npm install --include=dev && npm run build`, Start: `npm start`.

Environment variables:
`DATABASE_URL`, `SESSION_SECRET`, `APP_URL` (your Render URL), `ALLOWED_ORIGINS`, `Groq_API_key`, `BREVO_API_KEY`, `MAIL_FROM`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, optional `WELCOME_CREDITS` (free credits for new users, default 0), `REFERRAL_BONUS_CREDITS` (default 20), optional `COINGECKO_API_KEY`, `FINNHUB_API_KEY`, `PAYWALL_ENABLED`.

**Payment wall:** it switches on automatically as soon as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set. Until then the buy buttons show "Payments coming soon" and predictions are free (no credits are deducted). Force it with `PAYWALL_ENABLED=true` / `false`.

**AI:** Groq (llama-3.3-70b) writes the conclusion. If Groq is down, slow or has no key, the built-in formula engine (statistics + astrology weights) answers instead — the app never stops predicting.

## 2. Set the app URL
Edit `app-config.json` → `appUrl` to your Render URL (and copy it to `desktop/app-config.json` if you build locally).

## 3. Build the Android APK
GitHub → Actions → **Build Android APK** → Run workflow → download `BullWiser-android-apk`. Install the APK (allow "unknown sources").
Local: `cd mobile && npm install && npm run apk` (needs Android SDK + JDK 17).

## 4. Build the Windows installer
GitHub → Actions → **Build Windows installer** → Run workflow → download the `.exe` files. Use `ia32` for 32-bit/Windows 7, `x64` for 64-bit.
Local: `cd desktop && npm install && npm run dist`. Electron 22 is the last version that runs on Windows 7/8.

## Credits (pay-per-prediction)
BullWiser runs on credits: **1 credit = ₹10**. Packs: 300 / 500 / 700 / 1200 / 1500 / 2000 credits, or a loose buy of 10–10,000 credits. **Prediction cost:** Statistics 4 + Astrology 4 + AI 4 (only for engines switched on) + extras for risk (1/2/3), how far ahead (1–5), sector return level (1–3, e.g. Defence/Infra/Crypto highest), recent performance (a stock up ≥10% / ≥25% in ~3 months costs +2 / +3; otherwise +1) and benefit potential (1–3); crypto +2. The exact breakdown is shown before you press Predict. There is no Auto Mode, daily trade limit or subscription duration; BullWiser never buys or sells anything. Balance, total bought and history are on **Plans & Recharge**; when credits run out the user must recharge.

A prediction costs `ceil((base + engines) × risk × horizon) + benefit tier` credits (min 1, max 40), shown **before** the user presses Predict (`POST /api/credits/quote`):
base — stock suggestion 1, auto-trading 2, crypto 1.5 / 2.5 · engines — statistics +1, astrology +1.5, AI +1.5 (only if switched on in Settings) · risk — low ×1.0, medium ×1.2, high ×1.4 · horizon — ≤1d ×1.0 … >90d ×1.75 · benefit tier — +0 / +1 / +2 for small / medium / large possible move. Market Outlook costs 3–4 credits. Failed predictions are refunded automatically (once). A friend's first purchase gives the inviter bonus credits.

Settings → Predictions: astrology on/off, AI on/off, and 👍/👎 + comment per prediction. Prediction Analytics shows a confidence-vs-real-result calibration chart.

## Astrology engine (`server/vedic/`)
Real sidereal (Lahiri) planetary positions from `astronomy-engine`, real panchang (tithi, nakshatra, yoga, karana), sunrise-based hora / Rahu-Gulika-Yama kaal, ascendant with whole-sign houses. Interpretation: dignity, **retrograde**, **combustion**, **graha drishti (aspects)**, **parivartana (exchange)**, **mritu bhaga**, Jaimini and natural **karakas**, and planet/sign/house → product & sector mapping (every planet/sign signifies products and services). `npm run test:vedic` verifies the engine against known ingress and retrograde dates. Mritu bhaga degrees follow a commonly quoted table — have a qualified astrologer verify before relying on it.

## 20-year statistics (`server/longTermStatsService.ts`)
For every stock prediction the app loads up to 20 years of daily prices and computes: CAGR, volatility, drawdowns, 1/3/5/10/20-year returns, 200-DMA trend and 12-1 momentum, month-of-year seasonality, and a historical-analog forecast (what happened over the same number of trading days after similar trend/RSI/momentum setups) with a likely price range. A walk-forward backtest reports how often this rule was right in the past. The result is blended 50/50 into the statistical score that the AI (or the built-in formula) reads, and shown as the "20-Year Statistics" card. API: `GET /api/stock/:symbol/stats?when=...`. Test: `npm run test:stats`.

**Weighting:** statistics 55% : astrology 45% by default everywhere (predictions, market outlook, AI prompt). The learning loop may move it gently (40–70% statistics) once enough scored predictions exist.

## Self-improving loop
Every 2 hours (and once ~90 s after the server starts, to catch up after free-tier sleep) the app compares each due prediction with the real price and scores: the final call, statistics, astrology, each astrology sub-factor, the 20-year layer vs the short-term indicators, and whether the price landed inside the predicted range. From that it re-learns: the statistics:astrology weighting (starts 55:45, stays 40–70), per-factor multipliers (0.5–1.5), the 20-year layer's share, confidence calibration, and a price-range scale (0.8–1.4, target 70% coverage). Shown on the Prediction Analytics page (`GET /api/learning/summary`). Test: `npm run test:learning`.

## Dev
`npm install && npm run dev` · `npx tsc --noEmit` · `npm run build` · `npm run test:vedic`
