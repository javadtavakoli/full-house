import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Next.js convention: .env.local overrides .env. Load both, .env.local last so it wins.
config({ path: ".env" });
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  verbose: true,
  strict: true,
});
