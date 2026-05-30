import { db } from "@/lib/db/client";
import { sessions, sessionMembers, issues } from "@/lib/db/schema";
import { listSprintIssues } from "@/lib/youtrack/issues";
import { youtrackConfig } from "@/lib/youtrack/config";

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
