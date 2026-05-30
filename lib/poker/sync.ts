import { db } from "@/lib/db/client";
import { issues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { gatherSummary, logYoutrackPost } from "./service";
import { formatSummaryComment } from "./comment-formatter";
import { updateIssueField } from "@/lib/youtrack/issues";
import { postIssueComment } from "@/lib/youtrack/comments";
import { youtrackConfig } from "@/lib/youtrack/config";
import { logger } from "@/lib/logger";

export type SyncResult = {
  spField: { ok: boolean; error?: string };
  durationField: { ok: boolean; error?: string };
  comment: { ok: boolean; error?: string };
};

export async function syncIssue(issueId: string, token: string): Promise<SyncResult> {
  const cfg = youtrackConfig();
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) throw new Error("issue not found");
  const summary = await gatherSummary(issueId);

  const result: SyncResult = {
    spField: { ok: true },
    durationField: { ok: true },
    comment: { ok: true },
  };

  // SP field
  if (!summary.sp.skipped && summary.sp.final !== null) {
    try {
      await updateIssueField(token, issue.issueKey, cfg.spField, summary.sp.final);
      await logYoutrackPost({
        issueId,
        kind: "sp_field",
        request: { field: cfg.spField, value: summary.sp.final },
        response: null,
        status: "success",
      });
    } catch (e) {
      result.spField = { ok: false, error: (e as Error).message };
      await logYoutrackPost({
        issueId,
        kind: "sp_field",
        request: { field: cfg.spField, value: summary.sp.final },
        response: { error: (e as Error).message },
        status: "failed",
      });
      logger.error({ err: e }, "sync sp field failed");
    }
  }

  // Duration field — sum non-skipped phases; only write if at least one phase is non-skipped
  const phases = [summary.duration.impl, summary.duration.review, summary.duration.test];
  const anyNonSkipped = phases.some((p) => !p.skipped && p.final !== null);
  if (anyNonSkipped) {
    const total = phases.reduce((s, p) => s + (p.final ?? 0), 0);
    try {
      await updateIssueField(token, issue.issueKey, cfg.durationField, total);
      await logYoutrackPost({
        issueId,
        kind: "duration_field",
        request: { field: cfg.durationField, value: total },
        response: null,
        status: "success",
      });
    } catch (e) {
      result.durationField = { ok: false, error: (e as Error).message };
      await logYoutrackPost({
        issueId,
        kind: "duration_field",
        request: { field: cfg.durationField, value: total },
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
