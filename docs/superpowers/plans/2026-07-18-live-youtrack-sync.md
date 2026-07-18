# Live YouTrack Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a moderator pull post-creation YouTrack changes (edited summary/description, reordered or newly-added issues) into an open room via an on-mount background resync and a manual "Refresh from YouTrack" button, without touching any poker/voting state.

**Architecture:** A new reconcile function `resyncIssuesFromYouTrack` (in `lib/poker/resync.ts`) re-fetches the session's sprint issues with the moderator's token and updates **descriptive fields only** on the local `issues` table (update existing by `youtrackIssueId`, insert newly-added, leave removed untouched). A moderator-gated `POST /api/sessions/[id]/resync` endpoint resolves the YouTrack token exactly like the existing `/sync` route, runs the reconcile, and broadcasts the existing `issue-changed` Pusher event so every client re-pulls the DB snapshot. The moderator's room UI fires the resync once on mount (best-effort, non-blocking) and exposes a manual refresh button.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (Postgres/Neon), Pusher, trackpilot YouTrack client, vitest + testcontainers integration tests.

## Global Constraints
- Use pnpm, never npm.
- Tests: `pnpm test` (vitest unit), `pnpm test:integration` (vitest + testcontainers postgres). Typecheck: `pnpm exec tsc --noEmit`. Lint: `pnpm lint`.
- Reconcile descriptive fields ONLY; never touch poker/voting state.
- Moderator-gated endpoints use assertModerator; only the moderator holds a YouTrack token.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Schema decision — `stateName` is DROPPED from reconcile scope (read this first)

The design lists `stateName` among the fields to reconcile, but the `issues` table (`lib/db/schema.ts:83-107`) has **no `state_name` column**, `createSession` never persists issue state, and nothing in the room UI (`room.client.tsx`) displays it — rows show only `issueKey`, `summary`, and a poker-status badge. Adding a column nothing reads would expand scope (migration + `createSession` change + snapshot type) for zero user-visible effect, so **this plan reconciles `summary`, `description`, and `position` only** and does **not** add a migration. Issue **state is still read transiently** from each fetched issue (same `fieldType.id.startsWith("state")` detection `createSession` uses) purely to apply the done-state exclusion filter — it is never stored. If a future feature needs to display or persist state, add the column then.

**Documented consequence (intentional, not a gap):** an existing issue that becomes *done* in YouTrack drops out of the fetched non-done set, so the reconcile treats it exactly like a *removed* issue — its local row (including any status/estimates) is **left untouched**. Removal/done handling is explicitly out of scope for this iteration per the spec.

---

## Task 1 — Reconcile core function + integration tests

**Files**
- Modify: `lib/poker/service.ts` — export the sprint-issues field mask (line 25-26) and add a public moderator-gate helper (near `assertModerator`, ~line 404-411).
- Create: `lib/poker/resync.ts`.
- Test: `tests/integration/resync.test.ts` (new; testcontainers + msw, mirrors `tests/integration/sync.test.ts` and `workspace-base-url.test.ts`).

**Interfaces**
- Produces: `export const SPRINT_ISSUES_FIELDS: string` (promote the existing module-private const in `service.ts` to an export so `resync.ts` reuses the identical field mask — do NOT duplicate the string).
- Produces: `export async function assertSessionModerator(sessionId: string, userId: string): Promise<void>` in `service.ts` — throws `Error("moderator only")` unless `userId` is the session's moderator. (The existing `assertModerator` is `Tx`-scoped and module-private; this is a `db`-backed public sibling so `resync.ts` and callers can gate **before** the network fetch. Matches the `pickIssue`/`reveal`/`submitFinal` pattern of asserting inside the service layer.)
- Produces: `export type ResyncResult = { updated: number; inserted: number }`.
- Produces: `export async function resyncIssuesFromYouTrack(sessionId: string, moderatorUserId: string, token: string): Promise<ResyncResult>` — gates on moderator, derives `baseUrl` from `session.workspaceBaseUrl || env.YT_BASE_URL` (identical to `syncIssue`, so the route only needs to pass the token), re-fetches sprint issues, reconciles descriptive fields.
- Consumes: `youtrackApi` (`lib/youtrack/api.ts`), `conventionsForSession` (`service.ts`), `RawIssue` (`lib/youtrack/discover.ts`), `env` (`lib/env`), `db` + `issues`/`sessions` (`lib/db`).

**Steps**

- [ ] Write the failing integration test file `tests/integration/resync.test.ts` with the complete contents below. It covers reconcile (update/insert/leave-removed), the hard invariant (in-flight issue's descriptive field IS updated while status/estimates/votes/mode are unchanged), and moderator gating.

```ts
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
```

- [ ] Run the failing test (targeted to the new file so the RED is unambiguous):
  `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/resync.test.ts`
  Expected: **FAIL** — `Cannot find module '@/lib/poker/resync'` (and `resyncIssuesFromYouTrack` unresolved).

- [ ] Export the field mask and add the public moderator gate in `lib/poker/service.ts`. Change line 25 from `const SPRINT_ISSUES_FIELDS =` to `export const SPRINT_ISSUES_FIELDS =`. Then add this function immediately after the existing private `assertModerator` (after line 411):

```ts
/**
 * Public, db-backed moderator gate for callers outside the transaction-scoped
 * service functions (e.g. resync). Throws "moderator only" for non-moderators.
 */
export async function assertSessionModerator(sessionId: string, userId: string): Promise<void> {
  const [m] = await db
    .select()
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)))
    .limit(1);
  if (!m || m.role !== "moderator") throw new Error("moderator only");
}
```

- [ ] Create `lib/poker/resync.ts` with the complete implementation below:

```ts
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
```

  Note on `position`: reassigning to the filtered index picks up YouTrack reorders and shifts caused by removed issues. There is no unique constraint on `position`, so a transient collision with a removed issue's stale position is harmless — ordering is best-effort.

- [ ] Run the test again:
  `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/resync.test.ts`
  Expected: **PASS** (3 passing).

- [ ] Typecheck: `pnpm exec tsc --noEmit`. Expected: no errors.

- [ ] Commit:
  `git add lib/poker/service.ts lib/poker/resync.ts tests/integration/resync.test.ts && git commit -m "feat(resync): reconcile descriptive issue fields from YouTrack" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

**Deliverable:** `resyncIssuesFromYouTrack` reconciles descriptive fields, gated by moderator, with the hard invariant proven by an integration test.

---

## Task 2 — Moderator-gated `POST /api/sessions/[id]/resync` endpoint

**Files**
- Create: `app/api/sessions/[id]/resync/route.ts` (copies the token/context resolution of `app/api/sessions/[id]/sync/route.ts`).

**Interfaces**
- Consumes: `getServerUser`, `getYoutrackContext` (`lib/auth/session.ts`); `resyncIssuesFromYouTrack` (`lib/poker/resync.ts`).
- Produces: `POST` handler returning `200 { updated, inserted }` on success; `401` (unauthenticated / no YouTrack account), `412` (client-mode token header missing), `403` (`"moderator only"`), `500` (other errors).

Note on gating verification: this repo has **no route-test harness** (no `route.test.ts` files; mocking `next-auth` breaks vitest's ESM loader per the comment in `service.ts:50`). The moderator gate is already proven at the function layer in Task 1; the route only maps the thrown `"moderator only"` to HTTP 403. Verify the route via typecheck/lint here and the live check in Task 5.

**Steps**

- [ ] Create `app/api/sessions/[id]/resync/route.ts` with the complete contents below. It mirrors the `/sync` route's auth + `getYoutrackContext` flow (which handles both server and client encryption modes, including the `x-youtrack-token` header). The Pusher broadcast is deliberately deferred to Task 3.

```ts
import { NextResponse } from "next/server";
import { getServerUser, getYoutrackContext } from "@/lib/auth/session";
import { resyncIssuesFromYouTrack } from "@/lib/poker/resync";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Resolve the moderator's YouTrack token exactly like the /sync route: server
  // mode decrypts from the DB, client mode reads the x-youtrack-token header.
  const ctx = await getYoutrackContext(req, user.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const result = await resyncIssuesFromYouTrack(id, user.id, ctx.token);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "moderator only") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] Typecheck: `pnpm exec tsc --noEmit`. Expected: no errors.

- [ ] Lint the new route: `pnpm lint`. Expected: no new errors.

- [ ] Commit:
  `git add "app/api/sessions/[id]/resync/route.ts" && git commit -m "feat(resync): add moderator-gated POST /api/sessions/[id]/resync" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

**Deliverable:** A moderator-gated endpoint that resolves the moderator's token (both encryption modes) and runs the reconcile, returning `{ updated, inserted }`.

---

## Task 3 — Broadcast `issue-changed` after a successful reconcile

**Files**
- Modify: `app/api/sessions/[id]/resync/route.ts` (add one broadcast call in the success path).

**Interfaces**
- Consumes: `broadcastIssueChanged(sessionId: string, issueId: string)` (`lib/pusher/server.ts:21`).

Rationale: the client's `onEvent` (`room.client.tsx:102-109`) ignores the `issue-changed` payload and simply calls `refresh()` for any non-`session-ended` event, and `useSessionRoom` already binds `"issue-changed"` (`hooks/use-session-room.ts:13`). A resync spans many issues, so there is no single meaningful `issueId` — pass an empty string sentinel; the payload is never read. This is the intended full-snapshot re-pull model (spec "Propagation" + "Cross-cutting notes").

**Steps**

- [ ] In `app/api/sessions/[id]/resync/route.ts`, add the import and the broadcast. Change the import block to also import the broadcaster:

```ts
import { broadcastIssueChanged } from "@/lib/pusher/server";
```

  and replace the success branch inside the `try` block with:

```ts
    const result = await resyncIssuesFromYouTrack(id, user.id, ctx.token);
    // Resync spans the whole issue set; the payload issueId is unused by the
    // client (it re-pulls the full snapshot on any issue-changed event).
    await broadcastIssueChanged(id, "");
    return NextResponse.json(result);
```

- [ ] Typecheck: `pnpm exec tsc --noEmit`. Expected: no errors.

- [ ] Run the full integration suite to confirm nothing regressed (Pusher is suppressed under `E2E_TEST`, but the reconcile path is unchanged):
  `pnpm test:integration`
  Expected: **PASS** (including the 3 resync tests).

- [ ] Commit:
  `git add "app/api/sessions/[id]/resync/route.ts" && git commit -m "feat(resync): broadcast issue-changed so clients re-pull after reconcile" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

**Deliverable:** Every successful reconcile fans out an `issue-changed` event; all connected clients re-pull the snapshot.

---

## Task 4 — Client: on-mount background resync + "Refresh from YouTrack" button (moderator only)

**Files**
- Modify: `app/app/poker/[sessionId]/room.client.tsx` — imports (line 1-2, add `useRef`; add `ytFetch` import near line 5); moderator-detection is already computed at line 85 (`isModerator`); add a `refreshing` state (near line 76-81); add a manual-refresh handler + a run-once mount effect (near line 111-121); add the button in the header (near line 217-239).

**Interfaces**
- Consumes: `ytFetch` (`lib/youtrack/client-fetch.ts`) so client-encryption-mode moderators attach the `x-youtrack-token` header automatically; `refresh` (already defined at line 97-100); `toast` (already imported, line 4); `isModerator` (already computed, line 85).
- Produces: no new exports — internal UI wiring only.

Behavior rules (spec "Triggers" + "Notes / edge cases"):
- On-mount resync runs **once**, **moderator-only**, in the **background**, **best-effort** — it must not block first paint and must not crash the room if the token is missing/expired. It renders the cached snapshot first (already the case: `initialSnapshot` is server-rendered), then refreshes on success. Stays **silent** on failure (no toast) so a stale token doesn't nag on every mount.
- The manual button surfaces a spinner and a success/error toast.
- Both paths are decoupled from the existing 20s presence-refresh interval (line 115-118).

**Steps**

- [ ] Update the React import on line 2 to add `useRef`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

- [ ] Add the `ytFetch` import (place after the `useSessionRoom` import, ~line 5):

```tsx
import { ytFetch } from "@/lib/youtrack/client-fetch";
```

- [ ] Add a `refreshing` state alongside the other `useState` hooks (after line 81, `pickDialogIssue`):

```tsx
  const [refreshing, setRefreshing] = useState(false);
```

- [ ] Add the manual-refresh handler and the run-once mount effect. Insert immediately after the existing periodic-refresh `useEffect` (after line 118), before the "reset card" effect:

```tsx
  // Manual "Refresh from YouTrack" — moderator-triggered, with a spinner + toast.
  const refreshFromYouTrack = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await ytFetch(`/api/sessions/${snap.session.id}/resync`, { method: "POST" });
      if (!r.ok) {
        toast.error((await r.text()) || "Refresh failed");
        return;
      }
      const { updated, inserted } = (await r.json()) as { updated: number; inserted: number };
      await refresh();
      toast.success(`Synced from YouTrack — ${updated} updated, ${inserted} new`);
    } catch {
      toast.error("Could not reach YouTrack");
    } finally {
      setRefreshing(false);
    }
  }, [snap.session.id, refresh]);

  // On mount (moderator only): render the cached snapshot first, then resync in
  // the background and refresh. Best-effort — a missing/expired token must not
  // block first paint or crash the room, so failures are swallowed silently.
  const didMountResync = useRef(false);
  useEffect(() => {
    if (!isModerator || didMountResync.current) return;
    didMountResync.current = true;
    void (async () => {
      try {
        const r = await ytFetch(`/api/sessions/${snap.session.id}/resync`, { method: "POST" });
        if (r.ok) await refresh();
      } catch {
        /* best-effort; keep showing the cached snapshot */
      }
    })();
  }, [isModerator, snap.session.id, refresh]);
```

- [ ] Add the "Refresh from YouTrack" button in the header. Insert it inside the moderator block, immediately before the existing `Review & send` button (before line 222):

```tsx
          {isModerator && (
            <Button
              variant="outline"
              size="sm"
              onClick={refreshFromYouTrack}
              disabled={refreshing}
              title="Re-read this sprint's issues from YouTrack"
            >
              {refreshing ? "Refreshing…" : "Refresh from YouTrack"}
            </Button>
          )}
```

- [ ] Typecheck: `pnpm exec tsc --noEmit`. Expected: no errors.

- [ ] Lint: `pnpm lint`. Expected: no new errors.

- [ ] Commit:
  `git add "app/app/poker/[sessionId]/room.client.tsx" && git commit -m "feat(resync): on-mount background resync + manual refresh button for moderators" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

**Deliverable:** The moderator's room resyncs once on mount (non-blocking, silent on failure) and exposes a working "Refresh from YouTrack" button with spinner + toast. Note: UI wiring here is a thin fetch+toast with no automated coverage (this repo tests UI via Playwright e2e, not unit) — Task 5's live check exercises it.

---

## Task 5 — Live / manual verification against Feature 2 acceptance criteria

**Files**
- None (verification only).

**Steps**

- [ ] Run the full automated gates and confirm all green:
  - `pnpm test` (unit) — expected PASS.
  - `pnpm test:integration` (includes the 3 resync tests) — expected PASS.
  - `pnpm exec tsc --noEmit` — expected no errors.
  - `pnpm lint` — expected no new errors.

- [ ] Start the dev server (`pnpm dev`) and sign in as a moderator with a live YouTrack workspace. Create a session against a real sprint.

- [ ] **AC1 — edited summary reaches the room.** In YouTrack, edit an issue's summary. In the room, click **Refresh from YouTrack** (and separately: reload the page to exercise the on-mount trigger). Confirm the new summary appears in the pending/completed list and the toast shows the updated/new counts.

- [ ] **AC2 — newly-added issue appears.** Add an issue to the sprint in YouTrack, then Refresh. Confirm it shows in the pending list with status `pending`. Confirm a voter's browser (second session, no token) also sees it after the moderator refreshes — proving the `issue-changed` Pusher fan-out + snapshot re-pull.

- [ ] **AC3 — in-progress vote unaffected.** Start estimating an issue and cast votes (or reach a revealed phase). While that issue is in flight, edit its summary in YouTrack and click Refresh. Confirm: the summary updates, but the current phase/status, the votes already cast, and the revealed values are all unchanged (this mirrors the Task 1 invariant test, verified live).

- [ ] **Edge case — missing/expired token.** Confirm that when the token resolution fails (e.g. client-mode moderator who hasn't re-entered their password), the manual button shows a non-blocking error toast and the room keeps rendering the cached snapshot; the on-mount trigger fails silently without blocking first paint.

- [ ] If any check fails, use superpowers:systematic-debugging before patching, and re-run the affected task's tests.

**Deliverable:** All three Feature 2 acceptance criteria confirmed live, plus the missing-token edge case, with the full automated suite green.

---

## Self-review against Feature 2 acceptance criteria

- **"Editing an issue summary in YouTrack and then opening (or clicking Refresh in) the room shows the new summary."** → Reconcile updates `summary` (Task 1); on-mount + manual triggers (Task 4); AC1 live check (Task 5). ✅
- **"Adding an issue to the sprint makes it appear in the pending list after a refresh."** → Reconcile inserts new issues as `pending` (Task 1, test asserts `status === "pending"`); AC2 live check + voter propagation via `issue-changed` (Tasks 3, 5). ✅
- **"An in-progress vote is unaffected by a concurrent resync."** → Limited update SET `{summary, description, position}`; invariant integration test asserts status/estimates/votes/mode unchanged while summary IS updated (Task 1); current-issue pointer preserved because it derives from untouched `status`; AC3 live check (Task 5). ✅
- **Spec design details covered:** `conventionsForSession` + board/sprint load, moderator's-token re-fetch with the same field mask (`SPRINT_ISSUES_FIELDS` shared, not duplicated), leave-removed-untouched (no delete), moderator-only `POST /api/sessions/[id]/resync` resolving the token like `/sync`, both triggers, `issue-changed` propagation, best-effort non-blocking on-mount, non-blocking error toast on missing/expired token. ✅
- **Gap acknowledged inline:** `stateName` is dropped from reconcile scope (no column exists; nothing reads it) — see the "Schema decision" callout, including the intentional consequence that an issue turning *done* in YouTrack is treated as removed and left untouched. ✅
