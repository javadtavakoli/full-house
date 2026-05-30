import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, sessionMembers, issues, users, estimates, votes } from "@/lib/db/schema";
import { listSprintIssues } from "@/lib/youtrack/issues";
import { youtrackConfig } from "@/lib/youtrack/config";
import { reduceIssue, phaseOfStatus, type IssueStatus } from "./state-machine";
import { isValidCard } from "./decks";

export async function createSession(opts: {
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

  return db.transaction(async (tx) => {
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

export async function joinSession(sessionId: string, userId: string) {
  await db
    .insert(sessionMembers)
    .values({ sessionId, userId, role: "voter" })
    .onConflictDoUpdate({
      target: [sessionMembers.sessionId, sessionMembers.userId],
      set: { lastSeenAt: new Date() },
    });
}

export async function getSessionView(sessionId: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) return null;
  const members = await db
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
  const issuesList = await db
    .select()
    .from(issues)
    .where(eq(issues.sessionId, sessionId))
    .orderBy(issues.position);
  return { session, members, issues: issuesList };
}

export async function pickIssue(sessionId: string, issueId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    // ensure no other issue is currently in-flight (not pending / completed / skipped)
    const inFlight = await tx
      .select()
      .from(issues)
      .where(and(eq(issues.sessionId, sessionId), notInState(["pending", "completed", "skipped"])));
    if (inFlight.length > 0) throw new Error("another issue is already in progress");

    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue || issue.sessionId !== sessionId) throw new Error("issue not in session");
    if (issue.status !== "pending") throw new Error(`issue is ${issue.status}`);

    const next = reduceIssue({ status: issue.status as IssueStatus, round: 1 }, { type: "pick" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
    await tx.insert(estimates).values({ issueId, kind: "sp", phase: null, round: 1 });
    return next;
  });
}

export async function castVote(sessionId: string, issueId: string, userId: string, value: number) {
  return db.transaction(async (tx) => {
    await assertMember(tx, sessionId, userId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue || issue.sessionId !== sessionId) throw new Error("issue not in session");
    const { kind } = phaseOfStatus(issue.status as IssueStatus);
    if (!kind) throw new Error("not in a voting phase");
    if (!issue.status.endsWith("_voting")) throw new Error(`cannot vote in ${issue.status}`);
    if (!isValidCard(value, kind)) throw new Error(`invalid ${kind} card: ${value}`);

    const current = await currentEstimate(tx, issueId);
    if (!current) throw new Error("no current estimate row");

    await tx
      .insert(votes)
      .values({ estimateId: current.id, userId, value: String(value) })
      .onConflictDoUpdate({
        target: [votes.estimateId, votes.userId],
        set: { value: String(value), castAt: new Date() },
      });
  });
}

export async function reveal(sessionId: string, issueId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue) throw new Error("issue not found");
    const next = reduceIssue({ status: issue.status as IssueStatus, round: 1 }, { type: "reveal" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
    return next;
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function currentEstimate(tx: Tx, issueId: string) {
  const [row] = await tx
    .select()
    .from(estimates)
    .where(eq(estimates.issueId, issueId))
    .orderBy(desc(estimates.round), desc(estimates.id))
    .limit(1);
  return row ?? null;
}

async function assertMember(tx: Tx, sessionId: string, userId: string) {
  const [m] = await tx
    .select()
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)))
    .limit(1);
  if (!m) throw new Error("not a member of this session");
}

async function assertModerator(tx: Tx, sessionId: string, userId: string) {
  const [m] = await tx
    .select()
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)))
    .limit(1);
  if (!m || m.role !== "moderator") throw new Error("moderator only");
}

function notInState(states: string[]) {
  return sql`${issues.status} NOT IN (${sql.join(states.map((s) => sql`${s}`), sql`, `)})`;
}
