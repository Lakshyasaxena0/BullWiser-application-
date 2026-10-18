import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import cron from "node-cron";
import { predictionMonitoringService } from "./predictionMonitoringService";

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
app.use(express.json({ limit: '1mb', verify: (req: any, _res, buf) => { if (req.url?.startsWith('/api/payments/webhook')) req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

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

  // ─── CRON JOB: Prediction Monitoring ────────────────────────────────────────
  // ★★★ UPDATED: Now runs every 2 hours (12 times per day) ★★★
  // 
  // Schedule: '0 */2 * * *'
  //   - Minute: 0 (top of the hour)
  //   - Hour: Every 2 hours (0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22)
  //   - Day: Every day
  // 
  // Execution times: 12:00 AM, 2:00 AM, 4:00 AM, 6:00 AM, 8:00 AM, 10:00 AM,
  //                  12:00 PM, 2:00 PM, 4:00 PM, 6:00 PM, 8:00 PM, 10:00 PM
  // 
  // Previous schedule: '0 0 * * *' (once daily at midnight)
  // ─────────────────────────────────────────────────────────────────────────────
  let monitoringRunning = false; // never let two runs overlap if one is slow
  cron.schedule('0 */2 * * *', async () => {
    if (monitoringRunning) { log('⏭️ [Cron] Previous monitoring run still going — skipping this one'); return; }
    monitoringRunning = true;
    const now = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    log(`🔄 [Cron] Starting prediction monitoring at ${now}...`);
    try {
      await predictionMonitoringService.monitorDuePredictions();
      log('✅ [Cron] Prediction monitoring completed successfully');
    } catch (error) {
      log('❌ [Cron] Prediction monitoring failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
      console.error('[Cron] Full error:', error);
    } finally {
      monitoringRunning = false;
    }
  });

  log('⏰ Prediction monitoring cron job scheduled (every 2 hours, 12 times per day)');
  // Free hosting sleeps, so cron ticks can be missed: also check everything that fell due while the server was asleep.
  setTimeout(async () => {
    if (monitoringRunning) return;
    monitoringRunning = true;
    try { await predictionMonitoringService.monitorDuePredictions(); log('✅ [Startup] Caught up on due predictions'); }
    catch (e) { console.error('[Startup] catch-up failed:', e); }
    finally { monitoringRunning = false; }
  }, 90_000);
  // ─────────────────────────────────────────────────────────────────────────────

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`🚀 Server started on http://0.0.0.0:${port}`);
    log(`📡 API available at http://0.0.0.0:${port}/api`);
  });
})();
