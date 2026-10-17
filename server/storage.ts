import {
  users, subscriptions, feedback, trainingStatus, predictions, watchlist,
  type User, type UpsertUser, type Subscription, type InsertSubscription,
  type Feedback, type InsertFeedback, type Prediction, type InsertPrediction,
  type WatchlistItem, type InsertWatchlist,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserRole(userId: string, role: string): Promise<void>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  getUserSubscriptions(userId: string): Promise<Subscription[]>;
  getSubscription(id: number): Promise<Subscription | undefined>;
  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
  getUserFeedback(userId: string): Promise<Feedback[]>;
  createPrediction(prediction: InsertPrediction): Promise<Prediction>;
  getUserPredictions(userId: string): Promise<Prediction[]>;
  getUserActivePredictions(userId: string): Promise<Prediction[]>;
  updatePredictionStatus(id: number, isActive: boolean): Promise<void>;
  addToWatchlist(watchlistItem: InsertWatchlist): Promise<WatchlistItem>;
  getUserWatchlist(userId: string): Promise<WatchlistItem[]>;
  removeFromWatchlist(userId: string, stock: string): Promise<void>;
  updateTrainingStatus(progress: number, message: string, startedAt?: number): Promise<void>;
  getTrainingStatus(): Promise<{ progress: number; message: string; startedAt: number } | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).onConflictDoUpdate({
      target: users.id,
      set: { ...userData, updatedAt: new Date() },
    }).returning();
    return user;
  }

  async updateUserRole(userId: string, role: string): Promise<void> {
    await db.update(users).set({ role }).where(eq(users.id, userId));
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const [result] = await db.insert(subscriptions).values(subscription).returning();
    return result;
  }

  async getUserSubscriptions(userId: string): Promise<Subscription[]> {
    return await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt));
  }

  async getSubscription(id: number): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    return subscription;
  }

  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    const [result] = await db.insert(feedback).values(feedbackData).returning();
    return result;
  }

  async getUserFeedback(userId: string): Promise<Feedback[]> {
    return await db.select().from(feedback)
      .where(eq(feedback.userId, userId))
      .orderBy(desc(feedback.submittedAt));
  }

  async createPrediction(prediction: InsertPrediction): Promise<Prediction> {
    const [result] = await db.insert(predictions).values(prediction).returning();
    return result;
  }

  async getUserPredictions(userId: string): Promise<Prediction[]> {
    return await db.select().from(predictions)
      .where(eq(predictions.userId, userId))
      .orderBy(desc(predictions.createdAt));
  }

  async getUserActivePredictions(userId: string): Promise<Prediction[]> {
    return await db.select().from(predictions)
      .where(and(eq(predictions.userId, userId), eq(predictions.isActive, true)))
      .orderBy(desc(predictions.createdAt));
  }

  async updatePredictionStatus(id: number, isActive: boolean): Promise<void> {
    await db.update(predictions).set({ isActive }).where(eq(predictions.id, id));
  }

  async addToWatchlist(watchlistItem: InsertWatchlist): Promise<WatchlistItem> {
    const [result] = await db.insert(watchlist).values(watchlistItem).returning();
    return result;
  }

  async getUserWatchlist(userId: string): Promise<WatchlistItem[]> {
    return await db.select().from(watchlist)
      .where(eq(watchlist.userId, userId))
      .orderBy(desc(watchlist.createdAt));
  }

  async removeFromWatchlist(userId: string, stock: string): Promise<void> {
    await db.delete(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.stock, stock)));
  }

  async updateTrainingStatus(progress: number, message: string, startedAt?: number): Promise<void> {
    const updateData: any = { progress, message };
    if (startedAt) updateData.startedAt = startedAt;
    await db.insert(trainingStatus)
      .values({ id: 1, ...updateData })
      .onConflictDoUpdate({ target: trainingStatus.id, set: updateData });
  }

  async getTrainingStatus(): Promise<{ progress: number; message: string; startedAt: number } | undefined> {
    const [status] = await db.select().from(trainingStatus).where(eq(trainingStatus.id, 1));
    if (!status) return undefined;
    return {
      progress: status.progress || 0,
      message: status.message || "Not started",
      startedAt: status.startedAt || 0,
    };
  }
}

export const storage = new DatabaseStorage();
