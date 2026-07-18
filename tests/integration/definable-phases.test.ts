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
  setUserDefaults,
  gatherSummary,
} from "@/lib/poker/service";
import { formatSummaryComment } from "@/lib/poker/comment-formatter";
import type { Phase } from "@/lib/poker/state-machine";
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

async function phaseIndexOf(issueId: string) {
  const [row] = await testDb.select().from(issues).where(eq(issues.id, issueId));
  return row!.phaseIndex;
}

const CUSTOM_PHASES: Phase[] = [
  { id: crypto.randomUUID(), name: "Design" },
  { id: crypto.randomUUID(), name: "Build" },
  { id: crypto.randomUUID(), name: "QA" },
];

describe("definable phases (custom phase lists)", () => {
  it("SP → Design → Build → QA → completed; duration sum + names surface in gatherSummary/comment", async () => {
    const mod = await newUser("mod-custom");
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));

    const picked = await pickIssue(session.id, issue!.id, mod.id, {
      phases: CUSTOM_PHASES,
      withEstimation: true,
    });
    expect(picked.status).toBe("voting");
    expect(picked.phaseIndex).toBe(-1);

    // The issue row snapshotted the exact custom phase list at pick time.
    const [afterPick] = await testDb.select().from(issues).where(eq(issues.id, issue!.id));
    expect(afterPick!.phases).toEqual(CUSTOM_PHASES);
    expect(afterPick!.phaseIndex).toBe(-1);
    expect(afterPick!.status).toBe("voting");

    // SP phase.
    await castVote(session.id, issue!.id, mod.id, 5);
    await reveal(session.id, issue!.id, mod.id);
    let next = await submitFinal(session.id, issue!.id, mod.id, 5);
    expect(next.status).toBe("voting");
    expect(await phaseIndexOf(issue!.id)).toBe(0); // Design

    // Design phase.
    await castVote(session.id, issue!.id, mod.id, 4);
    await reveal(session.id, issue!.id, mod.id);
    next = await submitFinal(session.id, issue!.id, mod.id, 4);
    expect(next.status).toBe("voting");
    expect(await phaseIndexOf(issue!.id)).toBe(1); // Build

    // Build phase.
    await castVote(session.id, issue!.id, mod.id, 8);
    await reveal(session.id, issue!.id, mod.id);
    next = await submitFinal(session.id, issue!.id, mod.id, 8);
    expect(next.status).toBe("voting");
    expect(await phaseIndexOf(issue!.id)).toBe(2); // QA

    // QA phase — the last one; submitting completes the issue.
    await castVote(session.id, issue!.id, mod.id, 2);
    await reveal(session.id, issue!.id, mod.id);
    next = await submitFinal(session.id, issue!.id, mod.id, 2);
    expect(next.status).toBe("completed");

    const s = await gatherSummary(issue!.id);
    expect(s.phases.map((p) => p.name)).toEqual(["Design", "Build", "QA"]);
    expect(s.sp.final).toBe(5);
    expect(s.phases[0]!.summary.final).toBe(4); // Design
    expect(s.phases[1]!.summary.final).toBe(8); // Build
    expect(s.phases[2]!.summary.final).toBe(2); // QA

    // Summed duration = sum of the three phase finals.
    const total = s.phases.reduce((sum, p) => sum + (p.summary.final ?? 0), 0);
    expect(total).toBe(4 + 8 + 2);

    // Phase names surface in the formatted comment.
    const comment = formatSummaryComment(s);
    expect(comment).toContain("Design");
    expect(comment).toContain("Build");
    expect(comment).toContain("QA");
    expect(comment).toContain(`Duration: ${total}h total`);
  });

  it("changing the moderator's default phases mid-session does not alter an already-picked issue's snapshot", async () => {
    const mod = await newUser("mod-custom-snapshot");
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
    const issue = allIssues[0]!;

    // Set the moderator's default phase list BEFORE picking, then pick without an
    // explicit `phases` override — the issue should snapshot the default at
    // pick time.
    await setUserDefaults(mod.id, { defaultPhases: CUSTOM_PHASES });
    await pickIssue(session.id, issue.id, mod.id, { withEstimation: true });

    const [afterPick] = await testDb.select().from(issues).where(eq(issues.id, issue.id));
    expect(afterPick!.phases).toEqual(CUSTOM_PHASES);

    // Now change the moderator's default phases to something else entirely.
    const OTHER_PHASES: Phase[] = [{ id: crypto.randomUUID(), name: "Other" }];
    await setUserDefaults(mod.id, { defaultPhases: OTHER_PHASES });

    // Re-read the already-picked issue: its snapshotted phases must be
    // untouched by the moderator default change made after pick.
    const [afterDefaultChange] = await testDb.select().from(issues).where(eq(issues.id, issue.id));
    expect(afterDefaultChange!.phases).toEqual(CUSTOM_PHASES);
    expect(afterDefaultChange!.phases).not.toEqual(OTHER_PHASES);
  });
});
