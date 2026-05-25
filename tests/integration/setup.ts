import { afterAll, beforeAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let pool: Pool;

export let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  testDb = drizzle(pool, { schema });
  await migrate(testDb, { migrationsFolder: "./db/migrations" });
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});
