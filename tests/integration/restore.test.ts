import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues } from "@/lib/db/schema";
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

describe("restoreIssue", () => {
  it("pick → skip → restore → pending → pick again still works", async () => {
    const mod = await newUser("mod-restore");
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
    expect(issue).toBeDefined();

    // pick → state advances; we still want to be able to skip after picking
    await pickIssue(session.id, issue!.id, mod.id);
    await skipIssue(session.id, issue!.id, mod.id);

    const [afterSkip] = await testDb
      .select()
      .from(issues)
      .where(eq(issues.id, issue!.id));
    expect(afterSkip!.status).toBe("skipped");

    const restored = await restoreIssue(session.id, issue!.id, mod.id);
    expect(restored.status).toBe("pending");
    expect(restored.round).toBe(1);

    const [afterRestore] = await testDb
      .select()
      .from(issues)
      .where(eq(issues.id, issue!.id));
    expect(afterRestore!.status).toBe("pending");

    // Pick the same issue again — the state machine accepts pending → sp_voting.
    const picked = await pickIssue(session.id, issue!.id, mod.id);
    expect(picked.status).toBe("sp_voting");
  });

  it("restoring a non-skipped issue is rejected", async () => {
    const mod = await newUser("mod-restore-bad");
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
    // Still `pending` — restore should refuse.
    await expect(restoreIssue(session.id, issue!.id, mod.id)).rejects.toThrow(
      /not skipped/,
    );
  });

  it("non-moderator cannot restore", async () => {
    const mod = await newUser("mod-restore-perm");
    const voter = await newUser("voter-restore-perm");
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
    await skipIssue(session.id, issue!.id, mod.id);
    await expect(restoreIssue(session.id, issue!.id, voter.id)).rejects.toThrow(
      /moderator/,
    );
  });
});
