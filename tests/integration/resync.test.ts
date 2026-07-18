import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, sessions, sessionMembers, issues, estimates, votes } from "@/lib/db/schema";
import { createSession, pickIssue, castVote } from "@/lib/poker/service";
import { resyncIssuesFromYouTrack } from "@/lib/poker/resync";
import { and, eq } from "drizzle-orm";

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

// Overrides the base sprint handler: FH-100 (yt-1) edited, FH-102 (yt-3) added,
// FH-101 (yt-2) removed from the sprint.
function changedSprint() {
  return http.get("https://example.youtrack.cloud/api/agiles/B1/sprints/S47", () =>
    HttpResponse.json({
      issues: [
        {
          id: "yt-1",
          idReadable: "FH-100",
          summary: "Foo EDITED",
          description: "new description",
          customFields: [
            {
              name: "State",
              projectCustomField: { field: { fieldType: { id: "state[1]" } } },
              value: { name: "Open", isResolved: false },
            },
          ],
        },
        {
          id: "yt-3",
          idReadable: "FH-102",
          summary: "Baz (new)",
          description: null,
          customFields: [
            {
              name: "State",
              projectCustomField: { field: { fieldType: { id: "state[1]" } } },
              value: { name: "Open", isResolved: false },
            },
          ],
        },
      ],
    }),
  );
}

describe("resyncIssuesFromYouTrack", () => {
  it("updates existing issues, inserts new ones, and leaves removed ones untouched", async () => {
    const mod = await newUser("mod-resync");
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });

    server.use(changedSprint());
    const res = await resyncIssuesFromYouTrack(session.id, mod.id, "tok");
    expect(res).toEqual({ updated: 1, inserted: 1 });

    const rows = await testDb
      .select()
      .from(issues)
      .where(eq(issues.sessionId, session.id))
      .orderBy(issues.position);
    const byYt = new Map(rows.map((r) => [r.youtrackIssueId, r]));

    // existing updated
    expect(byYt.get("yt-1")!.summary).toBe("Foo EDITED");
    expect(byYt.get("yt-1")!.description).toBe("new description");
    expect(byYt.get("yt-1")!.position).toBe(0);
    // newly-added inserted as pending
    expect(byYt.get("yt-3")!.summary).toBe("Baz (new)");
    expect(byYt.get("yt-3")!.status).toBe("pending");
    expect(byYt.get("yt-3")!.position).toBe(1);
    // removed issue left untouched (not deleted, summary preserved)
    expect(byYt.has("yt-2")).toBe(true);
    expect(byYt.get("yt-2")!.summary).toBe("Bar");
  });

  it("reconciles the descriptive field of an in-flight issue WITHOUT touching poker/voting state", async () => {
    const mod = await newUser("mod-inv");
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
      .where(and(eq(issues.sessionId, session.id), eq(issues.youtrackIssueId, "yt-1")));

    // Put FH-100 in flight: pick → cast a vote. Creates an estimate row + a vote
    // row and moves the issue into sp_voting.
    await pickIssue(session.id, issue!.id, mod.id);
    await castVote(session.id, issue!.id, mod.id, 5);

    const [before] = await testDb.select().from(issues).where(eq(issues.id, issue!.id));
    const estBefore = await testDb.select().from(estimates).where(eq(estimates.issueId, issue!.id));
    const voteBefore = await testDb.select().from(votes).where(eq(votes.estimateId, estBefore[0]!.id));

    server.use(changedSprint());
    await resyncIssuesFromYouTrack(session.id, mod.id, "tok");

    const [after] = await testDb.select().from(issues).where(eq(issues.id, issue!.id));
    // Proof the reconcile actually ran on this row (a no-op would also pass the
    // "unchanged" checks, so we assert the descriptive edit landed):
    expect(after!.summary).toBe("Foo EDITED");
    // Hard invariant: poker/voting state is untouched.
    expect(after!.status).toBe(before!.status); // still sp_voting
    expect(after!.pokerMode).toBe(before!.pokerMode);
    expect(after!.withEstimation).toBe(before!.withEstimation);
    expect(after!.directEntry).toBe(before!.directEntry);

    const estAfter = await testDb.select().from(estimates).where(eq(estimates.issueId, issue!.id));
    expect(estAfter.length).toBe(estBefore.length);
    const voteAfter = await testDb.select().from(votes).where(eq(votes.estimateId, estBefore[0]!.id));
    expect(voteAfter.length).toBe(voteBefore.length);
    expect(voteAfter[0]!.value).toBe(voteBefore[0]!.value);
  });

  it("throws 'moderator only' for a non-moderator member (gated before any fetch)", async () => {
    const mod = await newUser("mod-gate");
    const voter = await newUser("voter-gate");
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });
    await testDb
      .insert(sessionMembers)
      .values({ sessionId: session.id, userId: voter.id, role: "voter" });

    // No server.use(changedSprint()) — the gate must throw before the network
    // call, so onUnhandledRequest:"error" would fail the test if a fetch fired.
    await expect(resyncIssuesFromYouTrack(session.id, voter.id, "tok")).rejects.toThrow(
      "moderator only",
    );
  });
});
