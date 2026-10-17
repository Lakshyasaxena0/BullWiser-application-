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
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, optional `COINGECKO_API_KEY`, `FINNHUB_API_KEY`, `PAYWALL_ENABLED`.

**Payment wall:** it switches on automatically as soon as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set. Until then the plan buttons show "Payments coming soon" and predictions are free. Force it with `PAYWALL_ENABLED=true` / `false`.

**AI:** Groq (llama-3.3-70b) writes the conclusion. If Groq is down, slow or has no key, the built-in formula engine (statistics + astrology weights) answers instead — the app never stops predicting.

## 2. Set the app URL
Edit `app-config.json` → `appUrl` to your Render URL (and copy it to `desktop/app-config.json` if you build locally).

## 3. Build the Android APK
GitHub → Actions → **Build Android APK** → Run workflow → download `BullWiser-android-apk`. Install the APK (allow "unknown sources").
Local: `cd mobile && npm install && npm run apk` (needs Android SDK + JDK 17).

## 4. Build the Windows installer
GitHub → Actions → **Build Windows installer** → Run workflow → download the `.exe` files. Use `ia32` for 32-bit/Windows 7, `x64` for 64-bit.
Local: `cd desktop && npm install && npm run dist`. Electron 22 is the last version that runs on Windows 7/8.

## Astrology engine (`server/vedic/`)
Real sidereal (Lahiri) planetary positions from `astronomy-engine`, real panchang (tithi, nakshatra, yoga, karana), sunrise-based hora / Rahu-Gulika-Yama kaal, ascendant with whole-sign houses. Interpretation: dignity, **retrograde**, **combustion**, **graha drishti (aspects)**, **parivartana (exchange)**, **mritu bhaga**, Jaimini and natural **karakas**, and planet/sign/house → product & sector mapping (every planet/sign signifies products and services). `npm run test:vedic` verifies the engine against known ingress and retrograde dates. Mritu bhaga degrees follow a commonly quoted table — have a qualified astrologer verify before relying on it.

## Dev
`npm install && npm run dev` · `npx tsc --noEmit` · `npm run build` · `npm run test:vedic`
