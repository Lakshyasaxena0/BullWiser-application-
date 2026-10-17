import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  // Bug 9 fix: was a noun fragment "DATABASE_URL, ensure the database is provisioned".
  // Rewritten as an actionable error message.
  throw new Error(
    "DATABASE_URL environment variable is not set. " +
      "Provision a PostgreSQL database and add DATABASE_URL to your .env file before running migrations."
  );
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
