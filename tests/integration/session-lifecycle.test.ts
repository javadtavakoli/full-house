import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, sessions, sessionMembers, issues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listSprintIssues } from "@/lib/youtrack/issues";
import { youtrackConfig } from "@/lib/youtrack/config";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function newUser(name: string) {
  const [u] = await testDb.insert(users).values({
    youtrackId: name,
    email: `${name}@x`,
    displayName: name,
  }).returning();
  return u!;
}

async function createSessionWithIssues(opts: {
  creatorUserId: string;
  token: string;
  boardId: string;
  sprintId: string;
  sprintName: string;
}) {
  const cfg = youtrackConfig();
  const ytIssues = await listSprintIssues(opts.token, opts.boardId, opts.sprintId, {
    excludeStates: cfg.doneStateNames,
  });

  return testDb.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({
        createdBy: opts.creatorUserId,
        boardId: opts.boardId,
        sprintId: opts.sprintId,
        sprintName: opts.sprintName,
      })
      .returning();
    if (!session) throw new Error("session insert failed");

    await tx.insert(sessionMembers).values({
      sessionId: session.id,
      userId: opts.creatorUserId,
      role: "moderator",
    });

    if (ytIssues.length > 0) {
      await tx.insert(issues).values(
        ytIssues.map((i, idx) => ({
          sessionId: session.id,
          youtrackIssueId: i.id,
          issueKey: i.key,
          summary: i.summary,
          description: i.description,
          position: idx,
        })),
      );
    }

    return session;
  });
}

async function joinSessionWithRole(sessionId: string, userId: string) {
  await testDb
    .insert(sessionMembers)
    .values({ sessionId, userId, role: "voter" })
    .onConflictDoUpdate({
      target: [sessionMembers.sessionId, sessionMembers.userId],
      set: { lastSeenAt: new Date() },
    });
}

async function getSessionView(sessionId: string) {
  const [session] = await testDb.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) return null;
  const members = await testDb
    .select({
      userId: sessionMembers.userId,
      role: sessionMembers.role,
      lastSeenAt: sessionMembers.lastSeenAt,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(sessionMembers)
    .innerJoin(users, eq(users.id, sessionMembers.userId))
    .where(eq(sessionMembers.sessionId, sessionId));
  const issuesList = await testDb
    .select()
    .from(issues)
    .where(eq(issues.sessionId, sessionId))
    .orderBy(issues.position);
  return { session, members, issues: issuesList };
}

describe("session lifecycle", () => {
  it("creates a session, seeds issues from YouTrack, and joins members", async () => {
    const moderator = await newUser("mod");
    const voter = await newUser("voter");

    const session = await createSessionWithIssues({
      creatorUserId: moderator.id,
      token: "tok",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "Sprint 47",
    });

    await joinSessionWithRole(session.id, voter.id);

    const view = await getSessionView(session.id);
    expect(view).not.toBeNull();
    expect(view!.issues.map((i) => i.issueKey).sort()).toEqual(["FH-100", "FH-101"]);
    expect(view!.members.length).toBe(2);
    expect(view!.members.find((m) => m.userId === moderator.id)?.role).toBe("moderator");
    expect(view!.members.find((m) => m.userId === voter.id)?.role).toBe("voter");
  });
});
