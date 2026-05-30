import { afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";

// Start container at module-load time (top-level await) so the URL is available
// before any test file imports `@/lib/db/client` (which instantiates a Pool
// eagerly at module-eval time and caches it on globalThis).
const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine").start();
process.env.DATABASE_URL = container.getConnectionUri();

const pool = new Pool({ connectionString: container.getConnectionUri() });
// Inject our pool into the global cache so `lib/db/client.ts`'s
// `global.__dbPool ?? new Pool(...)` takes the cached branch and shares
// the same pool the test harness uses.
(global as { __dbPool?: Pool }).__dbPool = pool;

export const testDb = drizzle(pool, { schema });

await migrate(testDb, { migrationsFolder: "./db/migrations" });

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});
