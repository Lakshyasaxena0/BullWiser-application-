import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  integer,
  real,
  text,
  boolean,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Training data for AI-Astrology learning
export const trainingData = pgTable("training_data", {
  id: serial("id").primaryKey(),
  stockSymbol: text("stock_symbol").notNull(),
  sector: text("sector"),
  predictionDate: timestamp("prediction_date").notNull(),
  predictedDirection: text("predicted_direction").notNull(),
  actualDirection: text("actual_direction").notNull(),
  planetaryConfig: text("planetary_config").notNull(),
  dashaConfig: text("dasha_config").notNull(),
  transitConfig: text("transit_config").notNull(),
  actualReturn: real("actual_return").notNull(),
  accuracy: real("accuracy").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type TrainingData = typeof trainingData.$inferSelect;
export type InsertTrainingData = typeof trainingData.$inferInsert;

// Astrology charts storage
export const astrologyCharts = pgTable("astrology_charts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  chartType: text("chart_type").notNull(),
  chartData: text("chart_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type AstrologyChart = typeof astrologyCharts.$inferSelect;
export type InsertAstrologyChart = typeof astrologyCharts.$inferInsert;

// Planetary rulers for sectors
export const planetaryRulers = pgTable("planetary_rulers", {
  id: serial("id").primaryKey(),
  sector: text("sector").notNull(),
  rulingPlanets: text("ruling_planets").notNull(),
  beneficPlanets: text("benefic_planets").notNull(),
  maleficPlanets: text("malefic_planets").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type PlanetaryRuler = typeof planetaryRulers.$inferSelect;
export type InsertPlanetaryRuler = typeof planetaryRulers.$inferInsert;

// Sector mappings for stocks
export const sectorMappings = pgTable("sector_mappings", {
  id: serial("id").primaryKey(),
  stockSymbol: text("stock_symbol").notNull(),
  sector: text("sector").notNull(),
  subSector: text("sub_sector"),
  keyHouses: text("key_houses").notNull(),
  keyNakshatras: text("key_nakshatras").notNull(),
  zodiacSigns: text("zodiac_signs").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type SectorMapping = typeof sectorMappings.$inferSelect;
export type InsertSectorMapping = typeof sectorMappings.$inferInsert;

// Session storage table - mandatory for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table with custom authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  password: varchar("password").notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  role: varchar("role").notNull().default("user"),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: varchar("mode").notNull(),
  tradeType: varchar("trade_type").notNull(),
  tradesPerDay: integer("trades_per_day").notNull(),
  duration: varchar("duration").notNull(),
  startTs: integer("start_ts").notNull(),
  endTs: integer("end_ts").notNull(),
  price: integer("price").notNull(), // whole rupees
  currency: varchar("currency").notNull().default("INR"),
  paymentId: integer("payment_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Razorpay payments (amount in paise). Subscriptions are created only when a payment is verified.
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  provider: varchar("provider").notNull().default("razorpay"),
  razorpayOrderId: varchar("razorpay_order_id").notNull().unique(),
  razorpayPaymentId: varchar("razorpay_payment_id").unique(),
  amountPaise: integer("amount_paise").notNull(),
  currency: varchar("currency").notNull().default("INR"),
  status: varchar("status").notNull().default("created"), // created | paid | failed
  kind: varchar("kind").notNull(), // stock | crypto
  plan: jsonb("plan").notNull(),
  subscriptionId: integer("subscription_id"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  paidAt: timestamp("paid_at"),
});
export type Payment = typeof payments.$inferSelect;

// Feedback table
export const feedback = pgTable("feedback", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  stock: varchar("stock").notNull(),
  requestedTime: varchar("requested_time").notNull(),
  actualPrice: real("actual_price"),
  useful: integer("useful").notNull(),
  submittedAt: integer("submitted_at").notNull(),
});

// Training status table
export const trainingStatus = pgTable("training_status", {
  id: integer("id").primaryKey().default(1),
  progress: integer("progress").default(0),
  message: text("message").default("Not started"),
  startedAt: integer("started_at").default(0),
});

// Predictions table for storing prediction results
// ★ UPDATED: Added analytics columns for detailed tracking
export const predictions = pgTable("predictions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  stock: varchar("stock").notNull(),
  currentPrice: real("current_price").notNull(),
  predLow: real("pred_low").notNull(),
  predHigh: real("pred_high").notNull(),
  confidence: real("confidence").notNull(),
  mode: varchar("mode").notNull(),
  riskLevel: varchar("risk_level").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  targetDate: timestamp("target_date"),
  isActive: boolean("is_active").default(true),
  
  // ★ NEW: Analytics columns
  statisticalReasoning: text("statistical_reasoning"),
  astroReasoning: text("astro_reasoning"),
  planetaryData: jsonb("planetary_data"),
  aiLearning: text("ai_learning"),
  actualPrice: real("actual_price"),
  deviation: real("deviation"),
});

// User watchlist
export const watchlist = pgTable("watchlist", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  stock: varchar("stock").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type InsertSubscription = typeof subscriptions.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;

export type InsertFeedback = typeof feedback.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;

export type InsertPrediction = typeof predictions.$inferInsert;
export type Prediction = typeof predictions.$inferSelect;

export type InsertWatchlist = typeof watchlist.$inferInsert;
export type WatchlistItem = typeof watchlist.$inferSelect;

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
});

export const insertPredictionSchema = createInsertSchema(predictions).omit({
  id: true,
  createdAt: true,
});

export const insertWatchlistSchema = createInsertSchema(watchlist).omit({
  id: true,
  createdAt: true,
});
