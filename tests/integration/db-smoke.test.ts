import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./setup";

describe("db", () => {
  it("connects and runs SELECT 1", async () => {
    const r = await testDb.execute(sql`SELECT 1 as v`);
    expect(r.rows[0]?.v).toBe(1);
  });
});
