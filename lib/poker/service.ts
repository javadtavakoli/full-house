import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, sessionMembers, issues, users, estimates, votes, youtrackPosts } from "@/lib/db/schema";
import { listSprintIssues } from "@/lib/youtrack/issues";
import { youtrackConfig } from "@/lib/youtrack/config";
import { reduceIssue, phaseOfStatus, type IssueStatus } from "./state-machine";
import { isValidCard } from "./decks";
import type { SummaryInput } from "./comment-formatter";

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
  // Determine the active (kind, phase) from the issue's current status so we
  // pick the estimate row for the live phase, not whichever happens to have
  // the largest random UUID. Within a single phase, the highest round wins.
  const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) return null;
  const { kind, phase } = phaseOfStatus(issue.status as IssueStatus);
  if (!kind) {
    // No active phase (pending/completed/skipped) — fall back to the highest
    // round across all estimate rows, for callers that still want the most
    // recently touched row.
    const [row] = await tx
      .select()
      .from(estimates)
      .where(eq(estimates.issueId, issueId))
      .orderBy(desc(estimates.round), desc(estimates.id))
      .limit(1);
    return row ?? null;
  }
  const phaseCond = phase === null ? sql`${estimates.phase} IS NULL` : eq(estimates.phase, phase);
  const [row] = await tx
    .select()
    .from(estimates)
    .where(and(eq(estimates.issueId, issueId), eq(estimates.kind, kind), phaseCond))
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

export async function submitFinal(sessionId: string, issueId: string, moderatorUserId: string, finalValue: number) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue) throw new Error("issue not found");
    if (!issue.status.endsWith("_revealed")) throw new Error(`cannot submit from ${issue.status}`);

    const current = await currentEstimate(tx, issueId);
    if (!current) throw new Error("no current estimate");
    await tx
      .update(estimates)
      .set({ finalValue: String(finalValue), decidedBy: moderatorUserId, decidedAt: new Date() })
      .where(eq(estimates.id, current.id));

    const next = reduceIssue({ status: issue.status as IssueStatus, round: current.round }, { type: "submit" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));

    // Open the next estimate row if we advanced into a voting state
    const phase = phaseOfStatus(next.status);
    if (phase.kind && next.status.endsWith("_voting")) {
      await tx.insert(estimates).values({ issueId, kind: phase.kind, phase: phase.phase, round: 1 });
    }
    return next;
  });
}

export async function skipPhase(sessionId: string, issueId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue) throw new Error("issue not found");
    const current = await currentEstimate(tx, issueId);
    if (current) {
      await tx
        .update(estimates)
        .set({ finalValue: null, decidedBy: moderatorUserId, decidedAt: new Date() })
        .where(eq(estimates.id, current.id));
    }
    const next = reduceIssue({ status: issue.status as IssueStatus, round: current?.round ?? 1 }, { type: "skipPhase" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
    const phase = phaseOfStatus(next.status);
    if (phase.kind && next.status.endsWith("_voting")) {
      await tx.insert(estimates).values({ issueId, kind: phase.kind, phase: phase.phase, round: 1 });
    }
    return next;
  });
}

export async function skipIssue(sessionId: string, issueId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue) throw new Error("issue not found");
    const next = reduceIssue({ status: issue.status as IssueStatus, round: 1 }, { type: "skipIssue" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
    return next;
  });
}

export async function startRevote(sessionId: string, issueId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue) throw new Error("issue not found");
    const current = await currentEstimate(tx, issueId);
    if (!current) throw new Error("no current estimate");
    const next = reduceIssue({ status: issue.status as IssueStatus, round: current.round }, { type: "revote" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
    // open a new estimate row at round+1
    await tx.insert(estimates).values({
      issueId, kind: current.kind, phase: current.phase, round: current.round + 1,
    });
    return next;
  });
}

export async function takeOverModeration(sessionId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [me] = await tx
      .select()
      .from(sessionMembers)
      .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)))
      .limit(1);
    if (!me) throw new Error("not a member");
    const [currentMod] = await tx
      .select()
      .from(sessionMembers)
      .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.role, "moderator")))
      .limit(1);
    if (currentMod) {
      const stale = Date.now() - currentMod.lastSeenAt.getTime() > 5 * 60 * 1000;
      if (!stale) throw new Error("current moderator is active");
      await tx
        .update(sessionMembers)
        .set({ role: "voter" })
        .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, currentMod.userId)));
    }
    await tx
      .update(sessionMembers)
      .set({ role: "moderator", lastSeenAt: new Date() })
      .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)));
  });
}

export async function endSession(sessionId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    await tx.update(sessions).set({ status: "ended", endedAt: new Date() }).where(eq(sessions.id, sessionId));
  });
}

export type RoomSnapshot = {
  session: typeof sessions.$inferSelect;
  members: Array<{ userId: string; role: string; displayName: string; avatarUrl: string | null; lastSeenAt: Date }>;
  issues: Array<typeof issues.$inferSelect & { syncStatus: "ok" | "failed" | null }>;
  activeIssue: {
    issue: typeof issues.$inferSelect;
    currentEstimate: typeof estimates.$inferSelect;
    votes: Array<{ userId: string; value?: number }>;
    isRevealed: boolean;
  } | null;
};

export async function getRoomSnapshot(sessionId: string): Promise<RoomSnapshot | null> {
  const view = await getSessionView(sessionId);
  if (!view) return null;
  const active = view.issues.find((i) => !["pending", "completed", "skipped"].includes(i.status));
  let activeIssue: RoomSnapshot["activeIssue"] = null;
  if (active) {
    const { kind, phase } = phaseOfStatus(active.status as IssueStatus);
    const phaseCond = phase === null ? sql`${estimates.phase} IS NULL` : eq(estimates.phase, phase);
    const whereExpr = kind
      ? and(eq(estimates.issueId, active.id), eq(estimates.kind, kind), phaseCond)
      : eq(estimates.issueId, active.id);
    const [current] = await db
      .select()
      .from(estimates)
      .where(whereExpr)
      .orderBy(desc(estimates.round), desc(estimates.id))
      .limit(1);
    if (current) {
      const isRevealed = active.status.endsWith("_revealed");
      const voteRows = await db
        .select({ userId: votes.userId, value: votes.value })
        .from(votes)
        .where(eq(votes.estimateId, current.id));
      activeIssue = {
        issue: active,
        currentEstimate: current,
        votes: isRevealed
          ? voteRows.map((v) => ({ userId: v.userId, value: Number(v.value) }))
          : voteRows.map((v) => ({ userId: v.userId })),
        isRevealed,
      };
    }
  }
  const postRows = await db
    .select({ issueId: youtrackPosts.issueId, status: youtrackPosts.status })
    .from(youtrackPosts);
  const byIssue = new Map<string, "ok" | "failed">();
  for (const p of postRows) {
    if (p.status === "failed") byIssue.set(p.issueId, "failed");
    else if (!byIssue.has(p.issueId)) byIssue.set(p.issueId, "ok");
  }
  const issuesWithSync = view.issues.map((i) => ({ ...i, syncStatus: byIssue.get(i.id) ?? null }));
  return { session: view.session, members: view.members, issues: issuesWithSync, activeIssue };
}

export async function gatherSummary(issueId: string): Promise<SummaryInput> {
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) throw new Error("issue not found");
  const [session] = await db.select().from(sessions).where(eq(sessions.id, issue.sessionId)).limit(1);
  if (!session) throw new Error("session not found");

  const memberRows = await db
    .select({ userId: sessionMembers.userId, displayName: users.displayName })
    .from(sessionMembers)
    .innerJoin(users, eq(users.id, sessionMembers.userId))
    .where(eq(sessionMembers.sessionId, issue.sessionId));
  const memberNames = memberRows.map((m) => m.displayName);
  const nameOf = (id: string) => memberRows.find((m) => m.userId === id)?.displayName ?? "?";

  const estimateRows = await db.select().from(estimates).where(eq(estimates.issueId, issueId));
  const latestByKey = new Map<string, typeof estimateRows[number]>();
  for (const e of estimateRows) {
    const key = `${e.kind}:${e.phase ?? ""}`;
    const prev = latestByKey.get(key);
    if (!prev || e.round > prev.round) latestByKey.set(key, e);
  }
  const allRounds = new Map<string, number>();
  for (const e of estimateRows) {
    const key = `${e.kind}:${e.phase ?? ""}`;
    allRounds.set(key, Math.max(allRounds.get(key) ?? 0, e.round));
  }

  async function summaryFor(key: string) {
    const latest = latestByKey.get(key);
    if (!latest) return { skipped: true, final: null, rounds: 0, votes: [] as { user: string; value: number }[] };
    const voteRows = await db.select().from(votes).where(eq(votes.estimateId, latest.id));
    return {
      skipped: latest.finalValue === null,
      final: latest.finalValue !== null ? Number(latest.finalValue) : null,
      rounds: allRounds.get(key) ?? 1,
      votes: voteRows.map((v) => ({ user: nameOf(v.userId), value: Number(v.value) })),
    };
  }

  return {
    date: new Date(),
    members: memberNames,
    sp: await summaryFor("sp:"),
    duration: {
      impl: await summaryFor("duration:impl"),
      review: await summaryFor("duration:review"),
      test: await summaryFor("duration:test"),
    },
  };
}

export async function logYoutrackPost(opts: {
  issueId: string;
  kind: "sp_field" | "duration_field" | "comment";
  request: unknown;
  response: unknown;
  status: "success" | "failed";
}) {
  await db.insert(youtrackPosts).values({
    issueId: opts.issueId,
    kind: opts.kind,
    requestPayload: opts.request as object,
    responsePayload: (opts.response as object) ?? null,
    status: opts.status,
  });
}
