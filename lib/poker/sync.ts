import { db } from "@/lib/db/client";
import { issues, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { conventionsForSession, gatherSummary, logYoutrackPost } from "./service";
import { formatSummaryComment } from "./comment-formatter";
import { updateIssueField } from "@/lib/youtrack/issues";
import { postIssueComment } from "@/lib/youtrack/comments";
import { env } from "@/lib/env";

export type SyncResult = {
  spField: { ok: boolean; error?: string };
  durationField: { ok: boolean; error?: string };
  comment: { ok: boolean; error?: string };
};

export type SyncOverrides = {
  // `undefined` → use computed default. `null` → skip the write. `number` → write that value.
  spOverride?: number | null;
  durationOverride?: number | null;
};

function errInfo(e: unknown): { message: string; status: number | null; body: unknown } {
  const err = e as Error & { status?: number; body?: unknown };
  return {
    message: err?.message ?? String(e),
    status: typeof err?.status === "number" ? err.status : null,
    body: err?.body ?? null,
  };
}

export async function syncIssue(
  issueId: string,
  token: string,
  overrides?: SyncOverrides,
): Promise<SyncResult> {
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) throw new Error("issue not found");
  const [session] = await db.select().from(sessions).where(eq(sessions.id, issue.sessionId)).limit(1);
  if (!session) throw new Error("session not found");
  const { spField, durationField } = conventionsForSession(session);
  // Per-session workspace URL — falls back to env for legacy rows that were
  // created before this column existed (default is the empty string).
  const baseUrl = session.workspaceBaseUrl || env.YT_BASE_URL;
  if (!baseUrl) throw new Error("session has no workspace URL");
  const summary = await gatherSummary(issueId);

  const result: SyncResult = {
    spField: { ok: true },
    durationField: { ok: true },
    comment: { ok: true },
  };

  // Decide final values — three-state semantics:
  //   override === undefined → use computed default
  //   override === null      → caller asked to skip the write
  //   override === number    → write that value
  const computedSp = summary.sp.skipped ? null : summary.sp.final;
  const spFinal: number | null =
    overrides?.spOverride !== undefined ? overrides.spOverride : computedSp;

  const phases = [summary.duration.impl, summary.duration.review, summary.duration.test];
  const anyPhaseFinal = phases.some((p) => !p.skipped && p.final !== null);
  const phaseTotal = phases.reduce((s, p) => s + (p.final ?? 0), 0);
  const computedDuration = anyPhaseFinal ? phaseTotal : null;
  const durationFinal: number | null =
    overrides?.durationOverride !== undefined ? overrides.durationOverride : computedDuration;

  // SP field — write only if we have a final and a known field
  if (spFinal !== null && spField) {
    try {
      await updateIssueField(token, issue.issueKey, spField, spFinal, { baseUrl });
      await logYoutrackPost({
        issueId,
        kind: "sp_field",
        request: { field: spField, value: spFinal },
        response: null,
        status: "success",
      });
    } catch (e) {
      const info = errInfo(e);
      result.spField = { ok: false, error: info.message };
      await logYoutrackPost({
        issueId,
        kind: "sp_field",
        request: { field: spField, value: spFinal },
        response: { error: info.message, status: info.status, body: info.body },
        status: "failed",
      });
      console.error("sync sp field failed:", info.message, info.status, info.body);
    }
  }

  // Duration field — write only if we have a final and a known field
  if (durationFinal !== null && durationField) {
    try {
      await updateIssueField(token, issue.issueKey, durationField, durationFinal, {
        asPeriodMinutes: true,
        baseUrl,
      });
      await logYoutrackPost({
        issueId,
        kind: "duration_field",
        request: { field: durationField, value: durationFinal },
        response: null,
        status: "success",
      });
    } catch (e) {
      const info = errInfo(e);
      result.durationField = { ok: false, error: info.message };
      await logYoutrackPost({
        issueId,
        kind: "duration_field",
        request: { field: durationField, value: durationFinal },
        response: { error: info.message, status: info.status, body: info.body },
        status: "failed",
      });
      console.error("sync duration field failed:", info.message, info.status, info.body);
    }
  }

  // Comment (always posted). Append override notes if the moderator changed values
  // away from the computed defaults so the audit trail shows the intentional edit.
  let text = formatSummaryComment(summary);
  const overrideLines: string[] = [];
  if (overrides?.spOverride !== undefined && overrides.spOverride !== computedSp) {
    overrideLines.push(
      overrides.spOverride === null
        ? "Story Points override: skipped by moderator"
        : `Story Points overridden by moderator: ${overrides.spOverride}`,
    );
  }
  if (
    overrides?.durationOverride !== undefined &&
    overrides.durationOverride !== computedDuration
  ) {
    overrideLines.push(
      overrides.durationOverride === null
        ? "Total duration override: skipped by moderator"
        : `Total duration overridden by moderator: ${overrides.durationOverride}h`,
    );
  }
  if (overrideLines.length > 0) {
    text = `${text}\n\n${overrideLines.join("\n")}`;
  }

  try {
    const res = await postIssueComment(token, issue.issueKey, text, baseUrl);
    await logYoutrackPost({
      issueId,
      kind: "comment",
      request: { text },
      response: res,
      status: "success",
    });
  } catch (e) {
    const info = errInfo(e);
    result.comment = { ok: false, error: info.message };
    await logYoutrackPost({
      issueId,
      kind: "comment",
      request: { text },
      response: { error: info.message, status: info.status, body: info.body },
      status: "failed",
    });
    console.error("sync comment failed:", info.message, info.status, info.body);
  }

  return result;
}
