import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues, estimates } from "@/lib/db/schema";
import {
  createSession,
  pickIssue,
  castVote,
  reveal,
  submitFinal,
  gotoPhase,
  gatherSummary,
} from "@/lib/poker/service";
import { eq, and, desc } from "drizzle-orm";

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

describe("gotoPhase", () => {
  // The risky path the design is built around: go back to SP after the issue is
  // completed, re-vote, then walk forward again. The new finalValue must be the
  // one gatherSummary reports (not a stale value from the first pass).
  it("goto sp on a completed issue → re-vote → submit → summary reflects new SP", async () => {
    const mod = await newUser("mod-goto-sp");
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));

    // First pass — complete every phase with values.
    await pickIssue(session.id, issue!.id, mod.id);
    await castVote(session.id, issue!.id, mod.id, 5);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 5); // SP=5
    await castVote(session.id, issue!.id, mod.id, 8);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 8); // impl=8
    await castVote(session.id, issue!.id, mod.id, 2);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 2); // review=2
    await castVote(session.id, issue!.id, mod.id, 1);
    await reveal(session.id, issue!.id, mod.id);
    const completed = await submitFinal(session.id, issue!.id, mod.id, 1); // test=1
    expect(completed.status).toBe("completed");

    // Jump back to SP. Round must be 2 (highest prior + 1).
    const backToSp = await gotoPhase(session.id, issue!.id, mod.id, "sp");
    expect(backToSp.status).toBe("sp_voting");
    expect(backToSp.round).toBe(2);

    // Re-vote and submit a different SP.
    await castVote(session.id, issue!.id, mod.id, 13);
    await reveal(session.id, issue!.id, mod.id);
    const afterSp = await submitFinal(session.id, issue!.id, mod.id, 13);
    expect(afterSp.status).toBe("dur_impl_voting");

    // The duration-impl row opened by submitFinal must NOT collide with the prior
    // round-1 row (otherwise gatherSummary may read the stale finalValue). Round
    // for the new impl row should be 2.
    const implRows = await testDb
      .select()
      .from(estimates)
      .where(
        and(
          eq(estimates.issueId, issue!.id),
          eq(estimates.kind, "duration"),
          eq(estimates.phase, "impl"),
        ),
      )
      .orderBy(desc(estimates.round));
    expect(implRows.length).toBe(2);
    expect(implRows[0]!.round).toBe(2);
    // Old row still has its finalValue
    expect(implRows[1]!.finalValue).toBe("8");
    // New row is open (no final yet)
    expect(implRows[0]!.finalValue).toBeNull();

    // Walk forward with new values and verify gatherSummary picks the NEW round 2 row.
    await castVote(session.id, issue!.id, mod.id, 10);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 10); // impl=10 (new)
    await castVote(session.id, issue!.id, mod.id, 3);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 3); // review=3 (new)
    await castVote(session.id, issue!.id, mod.id, 4);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 4); // test=4 (new)

    const summary = await gatherSummary(issue!.id);
    expect(summary.sp.final).toBe(13);
    expect(summary.duration.impl.final).toBe(10);
    expect(summary.duration.review.final).toBe(3);
    expect(summary.duration.test.final).toBe(4);
  });

  it("rejects gotoPhase when another issue is already in flight", async () => {
    const mod = await newUser("mod-goto-inflight");
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });
    const allIssues = await testDb
      .select()
      .from(issues)
      .where(eq(issues.sessionId, session.id))
      .orderBy(issues.position);
    // Complete the first issue.
    const first = allIssues[0]!;
    await pickIssue(session.id, first.id, mod.id);
    await castVote(session.id, first.id, mod.id, 5);
    await reveal(session.id, first.id, mod.id);
    await submitFinal(session.id, first.id, mod.id, 5);
    await castVote(session.id, first.id, mod.id, 8);
    await reveal(session.id, first.id, mod.id);
    await submitFinal(session.id, first.id, mod.id, 8);
    await castVote(session.id, first.id, mod.id, 2);
    await reveal(session.id, first.id, mod.id);
    await submitFinal(session.id, first.id, mod.id, 2);
    await castVote(session.id, first.id, mod.id, 1);
    await reveal(session.id, first.id, mod.id);
    await submitFinal(session.id, first.id, mod.id, 1);

    // Start a second issue.
    const second = allIssues[1]!;
    await pickIssue(session.id, second.id, mod.id);

    // Trying to reopen the first one while the second is active must throw.
    await expect(gotoPhase(session.id, first.id, mod.id, "sp")).rejects.toThrow(/in progress/);
  });
});
