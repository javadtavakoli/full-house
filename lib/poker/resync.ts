import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { issues, sessions } from "@/lib/db/schema";
import { youtrackApi } from "@/lib/youtrack/api";
import { env } from "@/lib/env";
import type { RawIssue } from "@/lib/youtrack/discover";
import {
  assertSessionModerator,
  conventionsForSession,
  SPRINT_ISSUES_FIELDS,
} from "./service";

export type ResyncResult = { updated: number; inserted: number };

/**
 * Re-fetch the session's sprint issues with the moderator's token and reconcile
 * DESCRIPTIVE fields only (summary/description/position) into the local `issues`
 * table:
 *   - UPDATE existing issues (matched by youtrackIssueId).
 *   - INSERT newly-added issues (status defaults to 'pending').
 *   - LEAVE removed issues untouched (no delete) — they may carry local estimates.
 *
 * Hard invariant: never touches poker status, estimates, pokerMode/withEstimation,
 * directEntry, the current-issue pointer, or any voting state. The current-issue
 * pointer is derived purely from `status` (see getRoomSnapshot), so leaving status
 * alone preserves it automatically.
 *
 * Issue state is read transiently only to apply the done-state exclusion filter
 * (identical to createSession); it is not stored.
 */
export async function resyncIssuesFromYouTrack(
  sessionId: string,
  moderatorUserId: string,
  token: string,
): Promise<ResyncResult> {
  // Gate BEFORE the network fetch.
  await assertSessionModerator(sessionId, moderatorUserId);

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) throw new Error("session not found");

  // Per-session workspace URL — matches syncIssue; env fallback for legacy rows.
  const baseUrl = session.workspaceBaseUrl || env.YT_BASE_URL;
  if (!baseUrl) throw new Error("session has no workspace URL");

  const { doneStateNames } = conventionsForSession(session);
  const exclude = new Set(doneStateNames);

  const yt = youtrackApi(token, baseUrl);
  const raw = (await yt.request(
    "GET",
    `/agiles/${session.boardId}/sprints/${session.sprintId}`,
    { query: { fields: SPRINT_ISSUES_FIELDS } },
  )) as { issues?: RawIssue[] };

  // Same done-state detection as createSession: fieldType id starts with "state".
  const rawIssues = raw.issues ?? [];
  const ytIssues = rawIssues.filter((i) => {
    const state = i.customFields.find((f) =>
      f.projectCustomField?.field?.fieldType?.id?.startsWith("state"),
    );
    const stateName = (state?.value as { name?: string } | null)?.name ?? null;
    return !(stateName && exclude.has(stateName));
  });

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ youtrackIssueId: issues.youtrackIssueId })
      .from(issues)
      .where(eq(issues.sessionId, sessionId));
    const existingIds = new Set(existing.map((e) => e.youtrackIssueId));

    let updated = 0;
    let inserted = 0;
    for (let idx = 0; idx < ytIssues.length; idx++) {
      const i = ytIssues[idx]!;
      if (existingIds.has(i.id)) {
        // DESCRIPTIVE FIELDS ONLY. Never include status/pokerMode/withEstimation/
        // directEntry here — that limited SET is the structural invariant.
        await tx
          .update(issues)
          .set({ summary: i.summary, description: i.description, position: idx })
          .where(and(eq(issues.sessionId, sessionId), eq(issues.youtrackIssueId, i.id)));
        updated++;
      } else {
        await tx.insert(issues).values({
          sessionId,
          youtrackIssueId: i.id,
          issueKey: i.idReadable,
          summary: i.summary,
          description: i.description,
          position: idx,
          // status defaults to 'pending' via the schema default.
        });
        inserted++;
      }
    }
    return { updated, inserted };
  });
}
