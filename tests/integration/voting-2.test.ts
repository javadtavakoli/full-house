import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues, estimates, votes } from "@/lib/db/schema";
import {
  createSession, pickIssue, castVote, reveal, submitFinal,
  skipPhase, startRevote, skipIssue, joinSession, takeOverModeration,
} from "@/lib/poker/service";
import { eq, desc, and } from "drizzle-orm";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function newUser(label: string) {
  const [u] = await testDb.insert(users).values({ youtrackId: label + Math.random(), email: label, displayName: label }).returning();
  return u!;
}

describe("voting advanced", () => {
  it("full flow SP → impl → review → test with submit", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    await castVote(session.id, issue!.id, mod.id, 5);
    await reveal(session.id, issue!.id, mod.id);
    let next = await submitFinal(session.id, issue!.id, mod.id, 5);
    expect(next.status).toBe("dur_impl_voting");
    await castVote(session.id, issue!.id, mod.id, 8);
    await reveal(session.id, issue!.id, mod.id);
    next = await submitFinal(session.id, issue!.id, mod.id, 8);
    expect(next.status).toBe("dur_review_voting");
    await castVote(session.id, issue!.id, mod.id, 2);
    await reveal(session.id, issue!.id, mod.id);
    next = await submitFinal(session.id, issue!.id, mod.id, 2);
    expect(next.status).toBe("dur_test_voting");
    await castVote(session.id, issue!.id, mod.id, 2);
    await reveal(session.id, issue!.id, mod.id);
    next = await submitFinal(session.id, issue!.id, mod.id, 2);
    expect(next.status).toBe("completed");
  });

  it("revote opens a new round and lets users vote again", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    await castVote(session.id, issue!.id, mod.id, 3);
    await reveal(session.id, issue!.id, mod.id);
    const next = await startRevote(session.id, issue!.id, mod.id);
    expect(next.status).toBe("sp_voting");

    // a fresh estimate row should exist with round=2
    const rows = await testDb.select().from(estimates).where(eq(estimates.issueId, issue!.id)).orderBy(desc(estimates.round));
    expect(rows[0]!.round).toBe(2);

    await castVote(session.id, issue!.id, mod.id, 8);
    // Filter to this issue's votes only — single-fork tests share the DB
    const estimateIds = rows.map((r) => r.id);
    const allVotes = await testDb.select().from(votes);
    const issueVotes = allVotes.filter((v) => estimateIds.includes(v.estimateId));
    expect(issueVotes.length).toBe(2);
  });

  it("skipPhase advances and leaves a null-final estimate row", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    const next = await skipPhase(session.id, issue!.id, mod.id);
    expect(next.status).toBe("dur_impl_voting");
    // Filter to this issue's sp estimate only — single-fork tests share the DB
    const spEstimate = await testDb
      .select()
      .from(estimates)
      .where(and(eq(estimates.kind, "sp"), eq(estimates.issueId, issue!.id)));
    expect(spEstimate[0]!.finalValue).toBeNull();
    expect(spEstimate[0]!.decidedBy).toBe(mod.id);
  });

  it("skipIssue moves the issue out of flow", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    const next = await skipIssue(session.id, issue!.id, mod.id);
    expect(next.status).toBe("skipped");
  });

  it("takeover refuses when current moderator is active", async () => {
    const mod = await newUser("mod");
    const member = await newUser("m2");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    await joinSession(session.id, member.id);
    await expect(takeOverModeration(session.id, member.id)).rejects.toThrow(/active/);
  });
});
