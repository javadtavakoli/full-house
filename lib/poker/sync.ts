import { db } from "@/lib/db/client";
import { issues, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { conventionsForSession, gatherSummary, logYoutrackPost } from "./service";
import { formatSummaryComment } from "./comment-formatter";
import { updateIssueField } from "@/lib/youtrack/issues";
import { postIssueComment } from "@/lib/youtrack/comments";
import { logger } from "@/lib/logger";

export type SyncResult = {
  spField: { ok: boolean; error?: string };
  durationField: { ok: boolean; error?: string };
  comment: { ok: boolean; error?: string };
};

export async function syncIssue(issueId: string, token: string): Promise<SyncResult> {
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) throw new Error("issue not found");
  const [session] = await db.select().from(sessions).where(eq(sessions.id, issue.sessionId)).limit(1);
  if (!session) throw new Error("session not found");
  const { spField, durationField } = conventionsForSession(session);
  const summary = await gatherSummary(issueId);

  const result: SyncResult = {
    spField: { ok: true },
    durationField: { ok: true },
    comment: { ok: true },
  };

  // SP field — skip silently if no field discovered/configured
  if (!summary.sp.skipped && summary.sp.final !== null && spField) {
    try {
      await updateIssueField(token, issue.issueKey, spField, summary.sp.final);
      await logYoutrackPost({
        issueId,
        kind: "sp_field",
        request: { field: spField, value: summary.sp.final },
        response: null,
        status: "success",
      });
    } catch (e) {
      result.spField = { ok: false, error: (e as Error).message };
      await logYoutrackPost({
        issueId,
        kind: "sp_field",
        request: { field: spField, value: summary.sp.final },
        response: { error: (e as Error).message },
        status: "failed",
      });
      logger.error({ err: e }, "sync sp field failed");
    }
  }

  // Duration field — sum non-skipped phases; only write if at least one phase is non-skipped
  // AND a duration field is known
  const phases = [summary.duration.impl, summary.duration.review, summary.duration.test];
  const anyNonSkipped = phases.some((p) => !p.skipped && p.final !== null);
  if (anyNonSkipped && durationField) {
    const total = phases.reduce((s, p) => s + (p.final ?? 0), 0);
    try {
      await updateIssueField(token, issue.issueKey, durationField, total, { asPeriodMinutes: true });
      await logYoutrackPost({
        issueId,
        kind: "duration_field",
        request: { field: durationField, value: total },
        response: null,
        status: "success",
      });
    } catch (e) {
      result.durationField = { ok: false, error: (e as Error).message };
      await logYoutrackPost({
        issueId,
        kind: "duration_field",
        request: { field: durationField, value: total },
        response: { error: (e as Error).message },
        status: "failed",
      });
      logger.error({ err: e }, "sync duration field failed");
    }
  }

  // Comment (always posted)
  const text = formatSummaryComment(summary);
  try {
    const res = await postIssueComment(token, issue.issueKey, text);
    await logYoutrackPost({
      issueId,
      kind: "comment",
      request: { text },
      response: res,
      status: "success",
    });
  } catch (e) {
    result.comment = { ok: false, error: (e as Error).message };
    await logYoutrackPost({
      issueId,
      kind: "comment",
      request: { text },
      response: { error: (e as Error).message },
      status: "failed",
    });
    logger.error({ err: e }, "sync comment failed");
  }

  return result;
}
