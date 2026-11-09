import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import cron from "node-cron";
import compression from "compression";
import { pool } from "./db";
import { predictionMonitoringService } from "./predictionMonitoringService";
import { runPracticeCycle } from "./practiceService";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Must be the VERY FIRST middleware — before everything including express.json()
// Using manual headers because we need credentials + dynamic origin support.
//
// Key requirements for cross-origin cookies (Netlify → Render):
//   1. Access-Control-Allow-Origin must be the EXACT request origin (not "*")
//   2. Access-Control-Allow-Credentials must be "true"
//   3. OPTIONS preflight must return 204 immediately
// ─────────────────────────────────────────────────────────────────────────────
// Comma-separated list of allowed browser origins, e.g.
//   ALLOWED_ORIGINS=https://astrowizard.example,https://my-site.netlify.app
// Reflecting every Origin while sending Allow-Credentials lets ANY website make
// authenticated requests as a logged-in user, so set this in production.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

if (allowedOrigins.length === 0 && process.env.NODE_ENV === "production") {
  console.warn("[CORS] ALLOWED_ORIGINS is not set — allowing ALL origins with credentials. Set ALLOWED_ORIGINS in production.");
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  // Allow the origin if it is on the allowlist (or if no allowlist is configured,
  // which keeps the previous allow-all behaviour for local development).
  const originAllowed = !!origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin));
  if (origin && originAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie"
    );
    res.setHeader("Access-Control-Expose-Headers", "Set-Cookie");
  }

  // Respond to preflight immediately — do NOT call next()
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});
// ─────────────────────────────────────────────────────────────────────────────

// rawBody is needed to verify Razorpay webhook signatures
// Basic security headers (no CSP: the app loads third-party scripts such as Razorpay checkout)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.use(compression());   // smaller pages and API answers → faster on mobile data
app.use(express.json({ limit: '1mb', verify: (req: any, _res, buf) => { if (req.url?.startsWith('/api/payments/webhook')) req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));
// Health check for Render and UptimeRobot. It also runs a tiny database query (at most once every 20 s), so every
// ping keeps the Supabase database awake (free projects pause after a week without activity).
// Always answers 200 while the server is up; "db" says whether the database answered (use an UptimeRobot
// "keyword" monitor for "db":"ok" to be alerted when the database is down).
let healthCache = { at: 0, db: 'unknown' as 'ok' | 'down' | 'unknown' };
app.get('/api/health', async (_req, res) => {
  if (Date.now() - healthCache.at > 20_000) {
    try {
      await Promise.race([pool.query('SELECT 1'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
      healthCache = { at: Date.now(), db: 'ok' };
    } catch { healthCache = { at: Date.now(), db: 'down' }; }
  }
  res.json({ ok: true, db: healthCache.db, time: new Date().toISOString() });
});

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

// ─── Routes + server ──────────────────────────────────────────────────────────
(async () => {
  const server = await registerRoutes(app);

  // Indexes for the queries that run all the time (dashboard, history, cron scoring). Safe to repeat; failures never stop the app.
  for (const q of [
    "CREATE INDEX IF NOT EXISTS predictions_user_created_idx ON predictions (user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS predictions_due_idx ON predictions (is_active, target_date)",
    "CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback (user_id)",
  ]) pool.query(q).catch((e: any) => console.error('[DB] index not created:', e?.message || e));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    const distPublicPath = resolve(__dirname, "public");
    if (existsSync(distPublicPath)) {
      log("📁 Serving static frontend from dist/public");
      serveStatic(app);
    } else {
      log("ℹ️  dist/public not found — running in API-only mode (frontend on Netlify)");
      app.use((_req: Request, res: Response) => {
        res.status(404).json({
          message: "API-only mode. Frontend is on Netlify.",
        });
      });
    }
  }

  // ─── HOURLY CYCLE: check results, then practise ────────────────────────────
  // Every hour, on the hour:
  //   1. CHECK    – every prediction whose target time has passed is compared with the REAL price
  //                 (users' predictions and the app's own practice ones) and the learning profile is rebuilt.
  //   2. PRACTISE – the app makes a new batch of predictions on its own (see practiceService.ts), so it keeps
  //                 learning even when nobody is using it.
  // Free hosting sleeps, so the same cycle also runs 90 seconds after every start to catch up on anything missed.
  let cycleRunning = false; // never let two cycles overlap if one is slow
  const runHourlyCycle = async (label: string) => {
    if (cycleRunning) { log(`⏭️ [${label}] Previous cycle still running — skipping`); return; }
    cycleRunning = true;
    const now = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    log(`🔄 [${label}] Starting at ${now} IST — checking results, then practising...`);
    try { await predictionMonitoringService.monitorDuePredictions(); log(`✅ [${label}] Result check completed`); }
    catch (error) { log(`❌ [${label}] Result check failed: ` + (error instanceof Error ? error.message : 'Unknown error')); console.error(error); }
    try { await runPracticeCycle(); }
    catch (error) { log(`❌ [${label}] Practice run failed: ` + (error instanceof Error ? error.message : 'Unknown error')); console.error(error); }
    finally { cycleRunning = false; }
  };
  cron.schedule('0 * * * *', () => { void runHourlyCycle('Cron'); });
  log('⏰ Hourly cycle scheduled (every hour: check results against real prices, then practise new predictions)');
  setTimeout(() => { void runHourlyCycle('Startup'); }, 90_000);
  // ─────────────────────────────────────────────────────────────────────────────

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`🚀 Server started on http://0.0.0.0:${port}`);
    log(`📡 API available at http://0.0.0.0:${port}/api`);
  });
})();
