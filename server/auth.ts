import { attachReferral } from "./referrals";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  // timingSafeEqual throws if the buffers differ in length (e.g. a corrupt stored hash)
  if (hashedBuf.length !== suppliedBuf.length) return false;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// A random per-boot secret invalidates every session cookie on each restart
// (and breaks multi-instance setups). Prefer SESSION_SECRET; otherwise derive a
// stable secret from DATABASE_URL so logins survive restarts.
function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  console.warn("[Auth] SESSION_SECRET is not set — deriving a stable secret from DATABASE_URL. Set SESSION_SECRET in your environment.");
  return createHash("sha256")
    .update("bullwiser-session:" + (process.env.DATABASE_URL || "dev-only-secret"))
    .digest("hex");
}

export function setupAuth(app: Express) {
  const PostgresSessionStore = connectPg(session);
  const sessionStore = new PostgresSessionStore({
    pool,
    createTableIfMissing: true,
    tableName: "sessions",
  });

  const isProduction = process.env.NODE_ENV === "production";

  app.set("trust proxy", 1);

  app.use(session({
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) return done(null, false);
      const match = await comparePasswords(password, user.password);
      if (!match) return done(null, false);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) return done(null, false);
      done(null, user);
    } catch (err) {
      done(null, false);
    }
  });

  // Register
  app.post("/api/register", async (req, res, next) => {
    try {
      const { password, confirmPassword, email, firstName, lastName, referralCode } = req.body;
      const username = typeof req.body.username === "string" ? req.body.username.trim() : "";

      if (!username || typeof password !== "string" || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      if (password !== confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      // An email is needed so a forgotten password can be reset by mail
      const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ message: "A valid email address is required (used to reset your password)" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPw = await hashPassword(password);
      const newUser = await storage.createUser({
        username,
        password: hashedPw,
        email: cleanEmail,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      // Friend's referral code (optional). Failures here never block sign-up.
      if (referralCode) await attachReferral(newUser.id, referralCode);

      req.login(newUser, (err) => {
        if (err) return next(err);
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json(userWithoutPassword);
      });
    } catch (err: any) {
      // Unique-constraint violation (duplicate username/email, including a race
      // between the existence check above and the insert) -> 400, not a 500.
      if (err?.code === "23505") {
        const field = String(err?.constraint || "").includes("email") ? "Email" : "Username";
        return res.status(400).json({ message: `${field} already exists` });
      }
      next(err);
    }
  });

  // Login
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Invalid username or password" });
      req.login(user, (err) => {
        if (err) return next(err);
        const { password, ...userWithoutPassword } = user;
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  // Logout
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  // Get current user
  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as SelectUser;
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });
}

export const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "Unauthorized" });
};
