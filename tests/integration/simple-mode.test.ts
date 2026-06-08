import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues } from "@/lib/db/schema";
import {
  createSession,
  pickIssue,
  castVote,
  reveal,
  submitFinal,
  enterDirectly,
  gatherSummary,
} from "@/lib/poker/service";
import { formatSummaryComment } from "@/lib/poker/comment-formatter";
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

describe("simple poker mode", () => {
  it("SP → impl (Estimation) → completed; review/test never reached", async () => {
    const mod = await newUser("mod-simple");
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));

    const picked = await pickIssue(session.id, issue!.id, mod.id, {
      mode: "simple",
      withEstimation: true,
    });
    expect(picked.status).toBe("sp_voting");

    await castVote(session.id, issue!.id, mod.id, 5);
    await reveal(session.id, issue!.id, mod.id);
    let next = await submitFinal(session.id, issue!.id, mod.id, 5);
    expect(next.status).toBe("dur_impl_voting");

    await castVote(session.id, issue!.id, mod.id, 8);
    await reveal(session.id, issue!.id, mod.id);
    next = await submitFinal(session.id, issue!.id, mod.id, 8);
    // Simple-mode skips review and test — should go straight to completed
    expect(next.status).toBe("completed");

    const summary = await gatherSummary(issue!.id);
    expect(summary.mode).toBe("simple");
    expect(summary.duration.impl.final).toBe(8);
    expect(summary.duration.review.skipped).toBe(true);
    expect(summary.duration.test.skipped).toBe(true);

    const comment = formatSummaryComment(summary);
    expect(comment).toContain("Story Points: 5");
    expect(comment).toContain("Duration: 8h total (Estimation)");
    expect(comment).not.toContain("Implementation:");
  });

  it("withEstimation=false: SP → completed (no duration phases)", async () => {
    const mod = await newUser("mod-sp-only");
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));

    await pickIssue(session.id, issue!.id, mod.id, {
      mode: "advanced",
      withEstimation: false,
    });
    await castVote(session.id, issue!.id, mod.id, 3);
    await reveal(session.id, issue!.id, mod.id);
    const next = await submitFinal(session.id, issue!.id, mod.id, 3);
    expect(next.status).toBe("completed");

    const summary = await gatherSummary(issue!.id);
    expect(summary.withEstimation).toBe(false);
    const comment = formatSummaryComment(summary);
    expect(comment).toContain("Story Points: 3");
    expect(comment).not.toContain("Duration");
  });

  it("enterDirectly: pending → completed without voting; sync values populated", async () => {
    const mod = await newUser("mod-direct");
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));

    const res = await enterDirectly(session.id, issue!.id, mod.id, {
      sp: 5,
      durationTotal: 12,
    });
    expect(res.status).toBe("completed");

    const [updated] = await testDb.select().from(issues).where(eq(issues.id, issue!.id));
    expect(updated!.status).toBe("completed");
    expect(updated!.directEntry).toBe(true);

    const summary = await gatherSummary(issue!.id);
    expect(summary.directEntry).toBe(true);
    expect(summary.sp.final).toBe(5);
    expect(summary.duration.impl.final).toBe(12);

    const comment = formatSummaryComment(summary);
    expect(comment).toContain("Story Points: 5  (entered directly)");
    expect(comment).toContain("Duration: 12h  (entered directly)");
  });

  it("enterDirectly refuses on non-pending issue", async () => {
    const mod = await newUser("mod-direct-2");
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    await expect(
      enterDirectly(session.id, issue!.id, mod.id, { sp: 1, durationTotal: 2 }),
    ).rejects.toThrow(/direct entry only allowed on pending/);
  });
});
