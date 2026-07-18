# Inline SP/Estimate Boxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the moderator type an issue's SP and total duration directly on each task-list row; the values are stashed on the issue without changing its poker status and become sync-able through the existing Review & Send dialog.

**Architecture:** Two nullable numeric columns (`stashed_sp`, `stashed_duration_total`) are added to `issues`. A new `stashEstimate` service function writes them under `assertModerator` without any status transition, exposed via a thin moderator-gated `PATCH /api/sessions/[id]/issues/[issueId]/estimate` route that broadcasts `issue-changed`. `gatherSummary` surfaces the stashed values; a new pure `applyStashPrecedence` module (unit-testable, no next-auth import) makes the stashed value win over any phase-vote total in the `/summary` prefill, so the Review dialog — extended to also include pending issues that carry a stash — pushes the manual value to YouTrack. The room's pending rows render a debounced `InlineEstimateBoxes` component.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (Postgres/Neon) + drizzle-kit migrations, React 19, Pusher, vitest + testcontainers.

## Global Constraints
- Use pnpm, never npm.
- Tests: `pnpm test` (vitest unit), `pnpm test:integration`. Typecheck: `pnpm exec tsc --noEmit`. Lint: `pnpm lint`. Migrations: `pnpm db:generate` then `pnpm db:migrate`.
- Stashing a value must NOT change an issue's poker status.
- Moderator-gated endpoint via assertModerator; broadcast "issue-changed" after mutation.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Design decisions (locked before coding)

- **Storage: dedicated columns.** `issues.stashedSp numeric` + `issues.stashedDurationTotal numeric`, both nullable. Chosen over manual estimate rows because (a) the stash is a clearly-labelled "manual override", not a vote; (b) it reads directly in `getRoomSnapshot` (already returns `issues.$inferSelect`) and in `gatherSummary` with no extra join; (c) it never risks colliding with the round/phase estimate-row machinery. Manual estimate rows were rejected: they would need a synthetic phase key, would be picked up by `currentEstimate`/`gatherSummary`'s round logic, and would blur the "did the team vote?" boundary.
- **numeric ⇒ string at every layer.** Drizzle returns `numeric` columns as `string | null` and expects a `string` on write. Convert with `Number(...)` (null-guard first) when reading into JS numbers; `String(...)` when writing. The client `SnapshotIssue` types the two fields as `string | null`. Reviewable/enable filters use `!= null` (not truthiness) because `0` is a valid stash.
- **Precedence lives in ONE pure module.** `lib/poker/review.ts` exports `applyStashPrecedence`. It must NOT be inline in the summary route: that route imports `getServerUser` → next-auth, which breaks vitest's ESM loader (same reason `createSession` reads oauth rows directly). `gatherSummary` surfaces the raw stash; the route feeds it through `applyStashPrecedence`.
- **Gating is tested at the service level.** Integration tests call `stashEstimate(...)` directly and assert `rejects.toThrow("moderator only")`, mirroring every other test in `tests/integration`. The route is kept thin (getServerUser → service → broadcast), exactly like `enter-directly`.
- **`syncIssue` is NOT touched.** `SendAllToYoutrackDialog.sendOne` always sends explicit `spOverride`/`durationOverride` (a number or `null`, never `undefined`), so the summary-route prefill already carries the precedence-applied value into the override. Adding precedence to `syncIssue` too would be redundant and violates "precedence in one place".
- **Known, documented limitation (not a bug):** syncing a stashed *pending* issue that has no votes posts a comment whose SP/Duration lines read "skipped" plus a moderator-override line, because `gatherSummary` finds no decided estimate rows. The SP and Duration *field writes* are still correct (they come from the overrides). All Feature 4 acceptance criteria hold. Verification must not mistake this comment wording for a failure.

---

## ⚠️ Execution-ordering reconciliation with the Definable Phases plan (READ FIRST)

This feature ships **after** `2026-07-18-definable-phases.md` (build order #3 → #4). That
plan reshapes two surfaces this plan also edits — reconcile as follows when you execute:

1. **`gatherSummary` return shape.** Definable Phases (its Task 5) rewrites `gatherSummary`
   to return `{ date, members, directEntry, sp, phases: PhaseSummary[] }` — the fixed
   `duration.impl/review/test` object is **gone**. This plan's Task 2 still adds
   `stashedSp`/`stashedDurationTotal` to that return (additive, after the `directEntry`
   line) — that stays valid. But this plan's **Task 3 summary-route code is written against
   the pre-#3 `summary.duration.impl/review/test` shape and MUST be adapted** to sum
   `summary.phases` instead. Task 3 below carries a "post-definable-phases" replacement
   block — use that one if #3 has shipped.
2. **Summary-route `perPhase`.** #3's Task 6 changes the `/summary` response `perPhase`
   into an ordered array `Array<{ name, value }>`, and the review dialog reads it that way.
   The reconciled Task 3 block preserves that array; do **not** reintroduce a fixed
   impl/review/test object.
3. **Migration number.** #3 adds migration `0008`, so **this plan's migration is `0009`**,
   not `0008`. `pnpm db:generate` auto-numbers, so trust the generated filename/`idx`
   rather than the literal `0008` written below (kept only as an illustrative diff). If #4
   is somehow run before #3, it will legitimately be `0008` — either way, use what
   drizzle-kit emits.
4. **Shared-file drift.** `room.client.tsx` and `send-all-to-youtrack-dialog.tsx` are also
   touched by #3. Line numbers below will have drifted; locate by the quoted surrounding
   code, not by line number. The regions differ (this plan: the reviewable/sendable filter
   + inline boxes; #3: phase rendering + per-phase display), so the edits compose.

If the Definable Phases plan has **not** shipped yet, ignore this box and follow the tasks
verbatim.

---

## Task 1 — Schema migration for stash columns

**Files**
- Modify: `lib/db/schema.ts` (issues table, ~lines 83-107 — add two columns)
- Create: `db/migrations/000N_stashed_estimate_columns.sql` (generated by drizzle-kit; `N` is whatever the generator assigns — `0009` when this runs after Definable Phases, `0008` if before)
- Modify: `db/migrations/meta/_journal.json` + `db/migrations/meta/000N_snapshot.json` (generated)

**Interfaces**
- Produces: `issues.stashedSp: string | null`, `issues.stashedDurationTotal: string | null` on `typeof issues.$inferSelect`.

**Steps**
- [ ] Edit `lib/db/schema.ts`: inside the `issues` `pgTable` column block, immediately after the `directEntry` column (line 101), add the two stash columns:
  ```ts
    // True when the moderator typed values without running a vote.
    directEntry: boolean("direct_entry").notNull().default(false),
    // Feature 4 — manual "stashed" estimate typed inline on the task-list row.
    // Nullable: null = no stash for that field. Stored as numeric (string in JS).
    // Writing a stash must NEVER change `status` — a pending issue stays pending.
    stashedSp: numeric("stashed_sp"),
    stashedDurationTotal: numeric("stashed_duration_total"),
  ```
  (`numeric` is already imported at the top of the file.)
- [ ] Run: `pnpm db:generate` — expected: creates `db/migrations/000N_stashed_estimate_columns.sql` (`N` = the next free index, `0009` after Definable Phases) containing exactly:
  ```sql
  ALTER TABLE "issues" ADD COLUMN "stashed_sp" numeric;--> statement-breakpoint
  ALTER TABLE "issues" ADD COLUMN "stashed_duration_total" numeric;
  ```
  and appends the corresponding `idx` entry to `db/migrations/meta/_journal.json`. Do NOT hand-write the SQL or rename the file — if the generated file differs materially, stop and reconcile the schema edit.
- [ ] Run: `pnpm exec tsc --noEmit` — expected PASS (types compile; new fields visible on `$inferSelect`).
- [ ] Run: `pnpm test:integration -- db-smoke` — expected PASS. Testcontainers applies migrations via `migrate(testDb, ...)` at setup, so a green smoke run proves `0008` applies cleanly on a fresh DB.
- [ ] Commit: `git commit -am "feat(db): add stashed_sp/stashed_duration_total columns to issues"` (with trailer).

*(Apply to a running dev DB later with `pnpm db:migrate`; integration tests don't need it — they migrate their own container.)*

---

## Task 2 — `stashEstimate` service fn + gatherSummary surfacing + tests

**Files**
- Modify: `lib/poker/comment-formatter.ts` (`SummaryInput` type, ~lines 10-26 — add two optional fields)
- Modify: `lib/poker/service.ts` (add `stashEstimate` after `enterDirectly`, ~line 279; extend `gatherSummary` return, ~lines 737-749)
- Create: `tests/integration/stash-estimate.test.ts`

**Interfaces**
- Produces: `stashEstimate(sessionId: string, issueId: string, moderatorUserId: string, patch: { sp?: number | null; durationTotal?: number | null }): Promise<void>`
  - `undefined` field ⇒ leave untouched; `null` ⇒ clear; `number` ⇒ set. Never mutates `status`.
- Produces (extended): `gatherSummary(...)` result gains `stashedSp: number | null`, `stashedDurationTotal: number | null`.
- Consumes: `assertModerator(tx, sessionId, userId)` (existing).

**Steps**
- [ ] Add the two optional fields to `SummaryInput` in `lib/poker/comment-formatter.ts` (they MUST be optional — `comment-formatter.test.ts` and other callers build `SummaryInput` literals; `formatSummaryComment` does not read them). After the `directEntry?: boolean;` line add:
  ```ts
    // Feature 4 — raw manual stash on the issue row (null = not stashed).
    // Surfaced for the Review-dialog precedence step; not rendered in the comment.
    stashedSp?: number | null;
    stashedDurationTotal?: number | null;
  ```
- [ ] Write failing integration test `tests/integration/stash-estimate.test.ts`:
  ```ts
  import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
  import { setupServer } from "msw/node";
  import { testDb } from "./setup";
  import { handlers } from "./msw-handlers";
  import { users, issues } from "@/lib/db/schema";
  import {
    createSession,
    joinSession,
    stashEstimate,
    gatherSummary,
  } from "@/lib/poker/service";
  import { eq } from "drizzle-orm";

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

  async function freshSessionWithIssue(label: string) {
    const mod = await newUser(label);
    const session = await createSession({
      creatorUserId: mod.id,
      token: "t",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    return { mod, session, issue: issue! };
  }

  describe("stashEstimate", () => {
    it("stashes sp + durationTotal without changing status; gatherSummary surfaces them", async () => {
      const { mod, session, issue } = await freshSessionWithIssue("stash-mod");
      expect(issue.status).toBe("pending");

      await stashEstimate(session.id, issue.id, mod.id, { sp: 5, durationTotal: 8 });

      const [after] = await testDb.select().from(issues).where(eq(issues.id, issue.id));
      expect(after!.status).toBe("pending"); // status untouched
      expect(Number(after!.stashedSp)).toBe(5);
      expect(Number(after!.stashedDurationTotal)).toBe(8);

      const summary = await gatherSummary(issue.id);
      expect(summary.stashedSp).toBe(5);
      expect(summary.stashedDurationTotal).toBe(8);
    });

    it("undefined leaves a field untouched; null clears it; 0 is preserved", async () => {
      const { mod, session, issue } = await freshSessionWithIssue("stash-partial");
      await stashEstimate(session.id, issue.id, mod.id, { sp: 3, durationTotal: 4 });
      // Patch only durationTotal → sp must remain 3.
      await stashEstimate(session.id, issue.id, mod.id, { durationTotal: 0 });
      let [row] = await testDb.select().from(issues).where(eq(issues.id, issue.id));
      expect(Number(row!.stashedSp)).toBe(3);
      expect(Number(row!.stashedDurationTotal)).toBe(0); // 0 preserved, not cleared
      // Explicit null clears sp.
      await stashEstimate(session.id, issue.id, mod.id, { sp: null });
      [row] = await testDb.select().from(issues).where(eq(issues.id, issue.id));
      expect(row!.stashedSp).toBeNull();
    });

    it("rejects a non-moderator", async () => {
      const { session, issue } = await freshSessionWithIssue("stash-gate");
      const voter = await newUser("stash-voter");
      await joinSession(session.id, voter.id);
      await expect(
        stashEstimate(session.id, issue.id, voter.id, { sp: 1, durationTotal: 1 }),
      ).rejects.toThrow("moderator only");
    });
  });
  ```
- [ ] Run: `pnpm test:integration -- stash-estimate` — expected FAIL (`stashEstimate` is not exported / `summary.stashedSp` undefined).
- [ ] Implement `stashEstimate` in `lib/poker/service.ts`, inserted immediately after the `enterDirectly` function (after line 279):
  ```ts
  /**
   * Feature 4 — stash a manual SP and/or total-duration value typed inline on the
   * task-list row. Moderator-only. Deliberately does NOT touch the issue's poker
   * status: a pending issue stays pending. `undefined` leaves a field untouched;
   * `null` clears it; a number sets it. numeric columns take a string on write.
   */
  export async function stashEstimate(
    sessionId: string,
    issueId: string,
    moderatorUserId: string,
    patch: { sp?: number | null; durationTotal?: number | null },
  ): Promise<void> {
    return db.transaction(async (tx) => {
      await assertModerator(tx, sessionId, moderatorUserId);
      const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
      if (!issue || issue.sessionId !== sessionId) throw new Error("issue not in session");

      const set: Record<string, unknown> = {};
      if (patch.sp !== undefined) set.stashedSp = patch.sp === null ? null : String(patch.sp);
      if (patch.durationTotal !== undefined) {
        set.stashedDurationTotal =
          patch.durationTotal === null ? null : String(patch.durationTotal);
      }
      if (Object.keys(set).length === 0) return;
      // NOTE: `status` intentionally omitted from the update — stash never transitions poker state.
      await tx.update(issues).set(set).where(eq(issues.id, issueId));
    });
  }
  ```
- [ ] Extend the `gatherSummary` return object in `lib/poker/service.ts` (the final `return { ... }`, ~lines 737-749) to surface the stash, reading the issue columns directly (defensive: independent of the per-phase shape, which Feature 3 may reshape). Add these two lines inside the returned object, after `directEntry: !!issue.directEntry,`:
  ```ts
      stashedSp: issue.stashedSp === null ? null : Number(issue.stashedSp),
      stashedDurationTotal:
        issue.stashedDurationTotal === null ? null : Number(issue.stashedDurationTotal),
  ```
- [ ] Run: `pnpm test:integration -- stash-estimate` — expected PASS.
- [ ] Run: `pnpm exec tsc --noEmit` — expected PASS.
- [ ] Commit: `git commit -am "feat(poker): stashEstimate service fn + surface stash in gatherSummary"` (with trailer).

---

## Task 3 — `applyStashPrecedence` pure module + summary-route wiring

**Files**
- Create: `lib/poker/review.ts`
- Create: `lib/poker/review.test.ts`
- Modify: `app/api/sessions/[id]/issues/[issueId]/summary/route.ts` (whole GET body, lines 8-28)

**Interfaces**
- Produces: `applyStashPrecedence(computed: { sp: number | null; durationTotal: number | null }, stash: { sp: number | null; durationTotal: number | null }): { sp: number | null; durationTotal: number | null }`
  - Stash wins when non-null (including `0`); otherwise the computed value passes through.
- Consumes: `gatherSummary` output fields `stashedSp` / `stashedDurationTotal` (Task 2).

**Steps**
- [ ] Write failing unit test `lib/poker/review.test.ts` (runs in the fast `lib/**` config — no DB, no next-auth):
  ```ts
  import { describe, it, expect } from "vitest";
  import { applyStashPrecedence } from "./review";

  describe("applyStashPrecedence", () => {
    it("uses the stash when it is present (manual value wins)", () => {
      expect(
        applyStashPrecedence({ sp: 8, durationTotal: 13 }, { sp: 5, durationTotal: 3 }),
      ).toEqual({ sp: 5, durationTotal: 3 });
    });
    it("falls back to computed when the stash field is null", () => {
      expect(
        applyStashPrecedence({ sp: 8, durationTotal: 13 }, { sp: null, durationTotal: null }),
      ).toEqual({ sp: 8, durationTotal: 13 });
    });
    it("mixes per-field: stashed sp, computed duration", () => {
      expect(
        applyStashPrecedence({ sp: 8, durationTotal: 13 }, { sp: 5, durationTotal: null }),
      ).toEqual({ sp: 5, durationTotal: 13 });
    });
    it("treats a stashed 0 as a real value (not a fallback trigger)", () => {
      expect(
        applyStashPrecedence({ sp: 8, durationTotal: 13 }, { sp: 0, durationTotal: 0 }),
      ).toEqual({ sp: 0, durationTotal: 0 });
    });
  });
  ```
- [ ] Run: `pnpm test -- review` — expected FAIL (`./review` module does not exist).
- [ ] Implement `lib/poker/review.ts`:
  ```ts
  /**
   * Feature 4 precedence: a manual stashed value on an issue takes precedence over
   * the phase-vote-derived computed value in the Review & Send dialog. Applied
   * per field. `null` in the stash means "no manual value → use computed". A
   * stashed 0 is a real value and wins. Pure + dependency-free so it unit-tests
   * without next-auth (which the summary route pulls in and which breaks vitest's
   * ESM loader).
   */
  export function applyStashPrecedence(
    computed: { sp: number | null; durationTotal: number | null },
    stash: { sp: number | null; durationTotal: number | null },
  ): { sp: number | null; durationTotal: number | null } {
    return {
      sp: stash.sp !== null ? stash.sp : computed.sp,
      durationTotal: stash.durationTotal !== null ? stash.durationTotal : computed.durationTotal,
    };
  }
  ```
- [ ] Run: `pnpm test -- review` — expected PASS.
- [ ] Rewrite the GET body of `app/api/sessions/[id]/issues/[issueId]/summary/route.ts` to apply precedence (the dialog prefill is where the manual value must surface). **Use the "post-definable-phases" block below** if the Definable Phases plan has shipped (the normal case for build order #3 → #4); use the "pre-definable-phases" block only if you are running this feature standalone against the old `summary.duration.impl/review/test` shape.

  **Post-definable-phases (RECOMMENDED — `gatherSummary` returns `summary.phases`):** replace the whole GET body with:
  ```ts
  import { NextResponse } from "next/server";
  import { getServerUser } from "@/lib/auth/session";
  import { gatherSummary } from "@/lib/poker/service";
  import { applyStashPrecedence } from "@/lib/poker/review";

  // Prefill data for the "Send to YouTrack" dialog: computed SP and total duration
  // (summed over the issue's ordered phase list) plus a per-phase breakdown for
  // context. A manual stashed value takes precedence over the computed phase total
  // (Feature 4). The moderator can still override either value before the sync POST.
  export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string; issueId: string }> },
  ) {
    const { issueId } = await params;
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const summary = await gatherSummary(issueId);

    const durSummaries = summary.phases.map((p) => p.summary);
    const anyPhaseFinal = durSummaries.some((p) => !p.skipped && p.final !== null);
    const computedTotal = anyPhaseFinal
      ? durSummaries.reduce((s, p) => s + (p.final ?? 0), 0)
      : null;
    const computedSp = summary.sp.skipped ? null : summary.sp.final;

    const { sp, durationTotal } = applyStashPrecedence(
      { sp: computedSp, durationTotal: computedTotal },
      { sp: summary.stashedSp ?? null, durationTotal: summary.stashedDurationTotal ?? null },
    );

    // Keep the array-shaped perPhase that Definable Phases (its Task 6) introduced —
    // the review dialog reads { name, value }[]. Do NOT reintroduce a fixed
    // impl/review/test object here.
    return NextResponse.json({
      sp,
      durationTotal,
      perPhase: summary.phases.map((p) => ({
        name: p.name,
        value: p.summary.skipped ? null : p.summary.final,
      })),
    });
  }
  ```

  **Pre-definable-phases (standalone only — old fixed-phase shape):** replace lines 1-28 with:
  ```ts
  import { NextResponse } from "next/server";
  import { getServerUser } from "@/lib/auth/session";
  import { gatherSummary } from "@/lib/poker/service";
  import { applyStashPrecedence } from "@/lib/poker/review";

  // Prefill data for the "Send to YouTrack" dialog: computed SP and total duration
  // (with per-phase breakdown for context). A manual stashed value takes precedence
  // over the computed phase total (Feature 4). The moderator can still override
  // either value before the actual sync POST.
  export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string; issueId: string }> },
  ) {
    const { issueId } = await params;
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const summary = await gatherSummary(issueId);
    const phases = [summary.duration.impl, summary.duration.review, summary.duration.test];
    const anyPhaseFinal = phases.some((p) => !p.skipped && p.final !== null);
    const computedTotal = anyPhaseFinal ? phases.reduce((s, p) => s + (p.final ?? 0), 0) : null;
    const computedSp = summary.sp.skipped ? null : summary.sp.final;

    const { sp, durationTotal } = applyStashPrecedence(
      { sp: computedSp, durationTotal: computedTotal },
      { sp: summary.stashedSp ?? null, durationTotal: summary.stashedDurationTotal ?? null },
    );

    return NextResponse.json({
      sp,
      durationTotal,
      perPhase: {
        impl: summary.duration.impl.skipped ? null : summary.duration.impl.final,
        review: summary.duration.review.skipped ? null : summary.duration.review.final,
        test: summary.duration.test.skipped ? null : summary.duration.test.final,
      },
    });
  }
  ```
- [ ] Run: `pnpm exec tsc --noEmit` — expected PASS.
- [ ] Commit: `git commit -am "feat(poker): stash-over-vote precedence in Review summary route"` (with trailer).

---

## Task 4 — `PATCH /api/sessions/[id]/issues/[issueId]/estimate` route

**Files**
- Create: `app/api/sessions/[id]/issues/[issueId]/estimate/route.ts`

**Interfaces**
- Produces: `PATCH` handler accepting `{ sp?: number | null; durationTotal?: number | null }`; 401 if unauthenticated, 400 on bad body; calls `stashEstimate` (which throws `"moderator only"` for non-moderators) then `broadcastIssueChanged`.
- Consumes: `getServerUser`, `stashEstimate` (Task 2), `broadcastIssueChanged` (existing).

**Steps**
- [ ] Create `app/api/sessions/[id]/issues/[issueId]/estimate/route.ts` (thin, mirrors `enter-directly/route.ts`; gating happens inside `stashEstimate`, matching the codebase's convention of letting the service throw):
  ```ts
  import { NextResponse } from "next/server";
  import { z } from "zod";
  import { getServerUser } from "@/lib/auth/session";
  import { stashEstimate } from "@/lib/poker/service";
  import { broadcastIssueChanged } from "@/lib/pusher/server";

  // Feature 4 — stash a manual SP / total-duration value typed inline on a task
  // row. Moderator-only (enforced in stashEstimate). Does NOT transition poker
  // status. Fields are optional three-state: omit = leave, null = clear, number = set.
  const Body = z.object({
    sp: z.number().nullable().optional(),
    durationTotal: z.number().nullable().optional(),
  });

  export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string; issueId: string }> },
  ) {
    const { id, issueId } = await params;
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    await stashEstimate(id, issueId, user.id, parsed.data);
    await broadcastIssueChanged(id, issueId);
    return NextResponse.json({ ok: true });
  }
  ```
- [ ] Run: `pnpm exec tsc --noEmit` — expected PASS.
- [ ] Run: `pnpm lint` — expected PASS.
- [ ] Commit: `git commit -am "feat(api): PATCH issues/[issueId]/estimate stash route"` (with trailer).

*(Route-handler gating/broadcast behaviour is exercised end-to-end in Task 7's manual verification; the service-level gating test in Task 2 covers the authorization branch that unit/integration tooling can reach.)*

---

## Task 5 — Inline SP/duration inputs with debounce + Pusher wiring

**Files**
- Create: `components/poker/inline-estimate-boxes.tsx`
- Create: `components/poker/inline-estimate-boxes.test.tsx` (first `*.test.tsx` in the repo; jsdom + testing-library are already configured in `vitest.config.ts`)
- Modify: `app/app/poker/[sessionId]/room.client.tsx` (`SnapshotIssue` type ~lines 32-43; pending-row render ~lines 254-280)

**Interfaces**
- Produces: `InlineEstimateBoxes({ sessionId, issueId, initialSp, initialDuration, disabled? }): JSX.Element` where `initialSp: number | null`, `initialDuration: number | null`.
- Behaviour: debounced (600 ms) `PATCH /api/sessions/{sessionId}/issues/{issueId}/estimate` with `{ sp, durationTotal }`; re-seeds each input from props on snapshot change ONLY when that input is not focused (prevents `issue-changed` refresh from clobbering a mid-edit box).

**Steps**
- [ ] Write failing component test `components/poker/inline-estimate-boxes.test.tsx`:
  ```ts
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { render, screen, fireEvent, act } from "@testing-library/react";
  import { InlineEstimateBoxes } from "./inline-estimate-boxes";

  const DEBOUNCE_MS = 600;

  describe("InlineEstimateBoxes", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
      );
    });
    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("debounces edits into a single PATCH with the current sp + durationTotal", async () => {
      render(
        <InlineEstimateBoxes
          sessionId="sess-1"
          issueId="iss-1"
          initialSp={null}
          initialDuration={null}
        />,
      );
      const [spBox, durBox] = screen.getAllByRole("spinbutton") as HTMLInputElement[];

      fireEvent.change(spBox, { target: { value: "5" } });
      // Under the debounce window → no request yet.
      act(() => vi.advanceTimersByTime(DEBOUNCE_MS - 100));
      expect(fetch).not.toHaveBeenCalled();

      fireEvent.change(durBox, { target: { value: "8" } });
      act(() => vi.advanceTimersByTime(DEBOUNCE_MS));

      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("/api/sessions/sess-1/issues/iss-1/estimate");
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(init.body)).toEqual({ sp: 5, durationTotal: 8 });
    });

    it("sends null when a field is cleared", async () => {
      render(
        <InlineEstimateBoxes
          sessionId="sess-1"
          issueId="iss-1"
          initialSp={5}
          initialDuration={8}
        />,
      );
      const [spBox] = screen.getAllByRole("spinbutton") as HTMLInputElement[];
      fireEvent.change(spBox, { target: { value: "" } });
      act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
      const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ sp: null, durationTotal: 8 });
    });
  });
  ```
- [ ] Run: `pnpm test -- inline-estimate-boxes` — expected FAIL (module does not exist).
- [ ] Implement `components/poker/inline-estimate-boxes.tsx`:
  ```tsx
  "use client";
  import { useEffect, useRef, useState } from "react";
  import { toast } from "sonner";
  import { Input } from "@/components/ui/input";

  const DEBOUNCE_MS = 600;

  function toField(v: number | null): string {
    return v === null ? "" : String(v);
  }
  function parseField(s: string): number | null {
    return s.trim() === "" ? null : Number(s);
  }

  /**
   * Feature 4 — two inline numeric boxes (SP + total duration hours) for a task
   * row. Moderator-only (rendered only for moderators by the parent). Edits are
   * debounced and PATCHed to the stash endpoint; the save never changes poker
   * status. Each box re-seeds from props on a snapshot refresh ONLY when it is not
   * focused, so an `issue-changed` re-pull can't clobber a value being typed.
   */
  export function InlineEstimateBoxes({
    sessionId,
    issueId,
    initialSp,
    initialDuration,
    disabled,
  }: {
    sessionId: string;
    issueId: string;
    initialSp: number | null;
    initialDuration: number | null;
    disabled?: boolean;
  }) {
    const [sp, setSp] = useState(toField(initialSp));
    const [duration, setDuration] = useState(toField(initialDuration));
    const spRef = useRef<HTMLInputElement>(null);
    const durRef = useRef<HTMLInputElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Re-seed from server state on snapshot change, but never while the user is
    // actively editing that box.
    useEffect(() => {
      if (document.activeElement !== spRef.current) setSp(toField(initialSp));
    }, [initialSp]);
    useEffect(() => {
      if (document.activeElement !== durRef.current) setDuration(toField(initialDuration));
    }, [initialDuration]);

    // Clear a pending debounce on unmount.
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    function scheduleSave(nextSp: string, nextDur: string) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void save(nextSp, nextDur); }, DEBOUNCE_MS);
    }

    async function save(spStr: string, durStr: string) {
      const spVal = parseField(spStr);
      const durVal = parseField(durStr);
      if ((spVal !== null && !Number.isFinite(spVal)) || (durVal !== null && !Number.isFinite(durVal))) {
        toast.error("Enter a valid number");
        return;
      }
      const r = await fetch(`/api/sessions/${sessionId}/issues/${issueId}/estimate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sp: spVal, durationTotal: durVal }),
      });
      if (!r.ok) toast.error(await r.text());
    }

    return (
      <div className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">SP</span>
          <Input
            ref={spRef}
            type="number"
            inputMode="numeric"
            className="h-8 w-16"
            value={sp}
            placeholder="—"
            disabled={disabled}
            aria-label="Story points"
            onChange={(e) => { setSp(e.target.value); scheduleSave(e.target.value, duration); }}
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">h</span>
          <Input
            ref={durRef}
            type="number"
            inputMode="decimal"
            step={0.5}
            className="h-8 w-16"
            value={duration}
            placeholder="—"
            disabled={disabled}
            aria-label="Total duration hours"
            onChange={(e) => { setDuration(e.target.value); scheduleSave(sp, e.target.value); }}
          />
        </label>
      </div>
    );
  }
  ```
  *(If `@/components/ui/input` does not forward `ref`, first confirm it is `React.forwardRef`; the shadcn-style `Input` in this repo forwards ref. If a test cannot find `spinbutton` roles, it means `type="number"` was dropped — keep it.)*
- [ ] Run: `pnpm test -- inline-estimate-boxes` — expected PASS.
- [ ] Wire into `room.client.tsx`. First extend the `SnapshotIssue` type (after `directEntry: boolean;`, line 42) with the two stash fields (numeric ⇒ string over the wire):
  ```ts
    stashedSp: string | null;
    stashedDurationTotal: string | null;
  ```
- [ ] Add the import near the other `@/components/poker/*` imports at the top of `room.client.tsx`:
  ```ts
  import { InlineEstimateBoxes } from "@/components/poker/inline-estimate-boxes";
  ```
- [ ] Render the boxes in the pending list. In the `pending.map(...)` `<li>` (lines 254-280), place the inputs before the Estimate button group, inside the `isModerator` block. Replace the `{isModerator && ( <div className="flex items-stretch shrink-0"> ... </div> )}` block with:
  ```tsx
                {isModerator && (
                  <div className="flex items-center gap-2 shrink-0">
                    <InlineEstimateBoxes
                      sessionId={snap.session.id}
                      issueId={i.id}
                      initialSp={i.stashedSp == null ? null : Number(i.stashedSp)}
                      initialDuration={i.stashedDurationTotal == null ? null : Number(i.stashedDurationTotal)}
                    />
                    <div className="flex items-stretch">
                      <Button
                        size="sm"
                        onClick={() => pickWithDefaults(i.id)}
                        className="rounded-r-none"
                        title={`Start estimation (${userDefaultMode}${userDefaultWithEstimation ? "" : ", no estimation"})`}
                      >
                        Estimate
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPickDialogIssue({ id: i.id, key: i.issueKey })}
                        className="rounded-l-none border-l border-l-background/20 px-2"
                        title="Override mode or enter values directly"
                        aria-label="Estimate options"
                      >
                        ▾
                      </Button>
                    </div>
                  </div>
                )}
  ```
- [ ] Run: `pnpm exec tsc --noEmit` — expected PASS.
- [ ] Run: `pnpm lint` — expected PASS.
- [ ] Commit: `git commit -am "feat(poker): inline debounced SP/duration boxes on pending rows"` (with trailer).

---

## Task 6 — Review & Send includes stashed pending issues

**Files**
- Modify: `components/poker/send-all-to-youtrack-dialog.tsx` (`ReviewIssue` type ~lines 19-25; `sendable` filter ~line 54; empty-state text ~line 224)
- Modify: `app/app/poker/[sessionId]/room.client.tsx` (`reviewable` build + `hasSendable`, ~lines 195-208)

**Interfaces**
- Produces (extended): `ReviewIssue` gains `hasStash?: boolean`. `sendable = issues.filter(i => i.status === "completed" || i.hasStash)`.
- A stashed *pending* issue therefore appears in the sendable list; its `/summary` prefill already carries the stash (Task 3), and `sendOne` pushes it via `spOverride`/`durationOverride` (unchanged).

**Steps**
- [ ] In `send-all-to-youtrack-dialog.tsx`, add `hasStash?: boolean;` to the `ReviewIssue` type (after `syncStatus: ...`):
  ```ts
  export type ReviewIssue = {
    id: string;
    issueKey: string;
    summary: string;
    status: string; // "completed" | "skipped" | "pending" (pending only when it carries a stash)
    syncStatus: "ok" | "failed" | null;
    hasStash?: boolean;
  };
  ```
- [ ] Change the `sendable` filter (line 54) so stashed rows (which may be `pending`) are sendable, while keeping skipped separate:
  ```ts
    const sendable = issues.filter((i) => i.status === "completed" || i.hasStash);
    const skipped = issues.filter((i) => i.status === "skipped");
  ```
- [ ] Update the empty-state copy (line 224-226) to reflect that stashed rows count as sendable — replace the guard text:
  ```tsx
          {sendable.length === 0 && skipped.length === 0 && (
            <p className="text-sm text-muted-foreground">No sendable or skipped issues yet.</p>
          )}
  ```
- [ ] In `room.client.tsx`, replace the `reviewable`/`hasSendable` block (lines 195-208) so it includes pending issues that carry a stash, tags each row's `hasStash`, and enables the header button accordingly:
  ```tsx
    const pending = snap.issues.filter((i) => i.status === "pending");
    const completedIssues = snap.issues.filter((i) => i.status === "completed");
    const skippedIssues = snap.issues.filter((i) => i.status === "skipped");

    const hasStash = (i: SnapshotIssue) => i.stashedSp != null || i.stashedDurationTotal != null;
    // Pending issues become reviewable ONLY when the moderator stashed a value on them.
    const stashedPending = pending.filter(hasStash);

    const reviewable: ReviewIssue[] = [
      ...completedIssues.map((i) => ({
        id: i.id, issueKey: i.issueKey, summary: i.summary,
        status: i.status, syncStatus: i.syncStatus, hasStash: hasStash(i),
      })),
      ...stashedPending.map((i) => ({
        id: i.id, issueKey: i.issueKey, summary: i.summary,
        status: i.status, syncStatus: i.syncStatus, hasStash: true,
      })),
      ...skippedIssues.map((i) => ({
        id: i.id, issueKey: i.issueKey, summary: i.summary,
        status: i.status, syncStatus: i.syncStatus, hasStash: false,
      })),
    ];

    // Header "Review & send" enables when there is anything to write: a completed
    // issue OR a pending issue carrying a manual stash. Skipped-only never counts.
    const hasSendable = completedIssues.length > 0 || stashedPending.length > 0;
  ```
- [ ] Run: `pnpm exec tsc --noEmit` — expected PASS.
- [ ] Run: `pnpm lint` — expected PASS.
- [ ] Run: `pnpm test` and `pnpm test:integration` — expected PASS (full suites green; confirms no regression in the touched service/summary modules).
- [ ] Commit: `git commit -am "feat(poker): Review & Send includes stashed pending issues"` (with trailer).

---

## Task 7 — Verification against Feature 4 acceptance criteria

**Files**
- No new source. Run the checks; fix any gap inline in the owning task and re-commit.

**Steps**
- [ ] Run the full gate: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:integration` — expected ALL PASS.
- [ ] AC1 — *"A moderator can type SP and duration on a pending row; the values persist and the issue stays in the pending list."* Covered by `tests/integration/stash-estimate.test.ts` (status stays `pending`, columns hold the values) + `inline-estimate-boxes.test.tsx` (debounced PATCH fires with both fields). Confirm both pass. For manual confirmation, load the `run` skill, start the app, type into a pending row's SP/h boxes, reload → values persist and the row is still under "Pick an issue".
- [ ] AC2 — *"Those values appear in the Review & Send dialog and can be pushed to YouTrack."* Confirm the summary route returns the stashed values via precedence (`review.test.ts` + the `/summary` wiring in Task 3) and that a stashed pending issue is in `sendable` (Task 6). Manually: stash on a pending issue → open Review & send → the row is listed with the typed SP/duration prefilled → "Send all" issues the sync POST with those overrides.
- [ ] AC3 — *"Editing is debounced and reflected for other participants via Pusher."* Debounce verified in `inline-estimate-boxes.test.tsx`; Pusher via the `broadcastIssueChanged` call in the PATCH route (Task 4). Other participants re-pull the snapshot on `issue-changed` and their (unfocused) boxes re-seed from props — confirm the focus-guard `useEffect`s are present so a refresh never clobbers a value being typed.
- [ ] Precedence self-check — *spec: "if both a phase-vote result and a stashed manual total exist, the manual value takes precedence in the Review dialog."* `review.test.ts` asserts stash-wins per field including `0`. Confirm the summary route feeds `summary.stashedSp/stashedDurationTotal` through `applyStashPrecedence`. Confirm `syncIssue` was NOT modified (precedence lives only in the summary prefill, which the dialog turns into explicit overrides).
- [ ] Document-limitation check: syncing a stashed *pending* issue with no votes writes correct SP/Duration fields but a comment whose SP/Duration lines say "skipped" + a moderator-override note. This is expected (see Design decisions) — do NOT "fix" it; all three ACs still hold.
- [ ] Final commit if any inline fix was needed (with trailer). Otherwise the feature is complete.

---

## Self-review against the spec (gaps closed inline)

- **"stashes it without changing the issue's poker status"** — `stashEstimate` omits `status` from the update; asserted in Task 2's test (`after.status === "pending"`).
- **`PATCH .../estimate` with `{ sp?, durationTotal? }`** — implemented verbatim in Task 4; three-state `undefined/null/number` honoured by `stashEstimate`.
- **"writes a stashed manual value ... without transitioning poker status ... not require the issue to be completed"** — dedicated `issues` columns, written on a `pending` row (Task 1/2).
- **"After a save, broadcast issue-changed"** — Task 4 route calls `broadcastIssueChanged`.
- **"Review & Send ... also include any issue that has a stashed value"** — Task 6 adds stashed-pending to `reviewable` + `sendable`.
- **"single duration box is the total"** — one `durationTotal` field end-to-end; no per-phase split introduced.
- **"manual value takes precedence ... write this precedence as concrete code in gatherSummary (or the summary route)"** — `applyStashPrecedence` (concrete code, unit-tested) wired into the summary route; gatherSummary surfaces the raw stash.
- **Feature-3 independence** — the stash total bypasses phases entirely; `gatherSummary` reads the stash columns directly, so a future reshape of the per-phase summary shape leaves the stash read intact.
