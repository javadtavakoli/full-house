import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues, estimates } from "@/lib/db/schema";
import {
  createSession,
  pickIssue,
  skipIssue,
  restoreIssue,
} from "@/lib/poker/service";
import { eq } from "drizzle-orm";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function newUser(label: string) {
  const [u] = await testDb
    .insert(users)
    .values({ youtrackId: label + Math.random(), email: label, displayName: label })
    .returning();
  return u!;
}

describe("restoreIssue cleans estimate rows", () => {
  it("pick → skip → restore deletes every estimate row for the issue", async () => {
    const mod = await newUser("mod-restore-clean");
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });
    const [issue] = await testDb
      .select()
      .from(issues)
      .where(eq(issues.sessionId, session.id));

    // pick creates an sp estimate row (round 1)
    await pickIssue(session.id, issue!.id, mod.id);
    const beforeSkip = await testDb
      .select()
      .from(estimates)
      .where(eq(estimates.issueId, issue!.id));
    expect(beforeSkip.length).toBeGreaterThan(0);

    await skipIssue(session.id, issue!.id, mod.id);
    // skipIssue does NOT delete estimate rows by itself — the row from pick is still there.
    const afterSkip = await testDb
      .select()
      .from(estimates)
      .where(eq(estimates.issueId, issue!.id));
    expect(afterSkip.length).toBeGreaterThan(0);

    // restoreIssue must wipe them; otherwise a subsequent pick → vote round 1
    // would collide with this stale row and gatherSummary may read it.
    await restoreIssue(session.id, issue!.id, mod.id);
    const afterRestore = await testDb
      .select()
      .from(estimates)
      .where(eq(estimates.issueId, issue!.id));
    expect(afterRestore.length).toBe(0);
  });
});
