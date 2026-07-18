# Planning Poker Improvements — Design

**Date:** 2026-07-18
**Status:** Approved for planning

Four independent improvements to the Full House planning-poker app. Each is
scoped to ship on its own; they are ordered by dependency and blocking priority.

**Build order:** #1 (voter re-join) → #2 (live YouTrack sync) → #3 (definable
phases) → #4 (inline SP/estimate boxes). #4 depends on #3's phase model, so #3 is
specced first of the two.

---

## Background (current behavior)

- **Voter join.** Unauthed visitors to a room URL see `VoterPicker`
  ([components/poker/voter-picker.tsx](../../../components/poker/voter-picker.tsx)),
  which lists the session's `candidates` (imported YouTrack users) and lets a
  visitor pick their name. Picking calls `signIn("voter", { sessionId, youtrackId })`;
  the `signIn` callback ([lib/auth/config.ts:22-65](../../../lib/auth/config.ts))
  inserts a `session_members` row (`onConflictDoNothing`) and re-establishes the
  JWT session. `RoomPage` ([app/app/poker/[sessionId]/page.tsx](../../../app/app/poker/%5BsessionId%5D/page.tsx))
  computes `claimedYoutrackIds` from **all** `session_members` rows and passes it
  to the picker, which permanently disables those names.
- **YouTrack read.** YouTrack is read **once**, at session creation
  (`createSession` in [lib/poker/service.ts](../../../lib/poker/service.ts)),
  which snapshots issues (`summary`, `description`, `position`, etc.) into the
  local `issues` table. Nothing re-reads YouTrack during a live session. The 20s
  `setInterval` in `room.client.tsx` and all Pusher events only re-pull the app's
  own DB snapshot; write-back to YouTrack happens only via the moderator's
  "Review & Send" dialog (`/api/sessions/[id]/sync`).
- **Phases / decks.** Card decks are hard-coded
  ([lib/poker/decks.ts](../../../lib/poker/decks.ts)). The estimation "plan" is a
  hard-coded state machine
  ([lib/poker/state-machine.ts](../../../lib/poker/state-machine.ts)): `simple`
  mode = one duration phase (`dur_impl`), `advanced` = three
  (`dur_impl`/`dur_review`/`dur_test`). A per-moderator default
  (`users.defaultPokerMode`, `users.defaultWithEstimation`) already exists and is
  editable in the Settings dialog
  ([components/shell/user-settings-dialog.tsx](../../../components/shell/user-settings-dialog.tsx)).
- **Issue rows.** The pending / completed / skipped lists render inline in
  `room.client.tsx` and show only `issueKey` + `summary` + a status badge — no
  numeric values, nothing inline-editable. Direct numeric entry exists only inside
  `PickIssueDialog` (direct-entry view) and the Review & Send dialog.
- **Moderator token.** Only the moderator holds a YouTrack token (server-mode:
  decryptable from the DB; client-mode: in the moderator's `sessionStorage` and
  sent via the `x-youtrack-token` header). Voters have no token. Any feature that
  reads or writes YouTrack is therefore inherently moderator-driven.

---

## Feature 1 — Voter re-join fix (bug)

**Problem.** After a voter joins via the moderator's link and later signs out (or
loses their cookie, or returns on another device), their own name is grayed out as
"already joined" and cannot be re-selected, locking them out of the room.

**Root cause.** `claimedYoutrackIds` is derived from every `session_members` row
and used to `disabled` the corresponding names permanently
([voter-picker.tsx](../../../components/poker/voter-picker.tsx) line ~97). The
voter "auth" model is name-selection only (no secret), so this gray-out provides
no real impersonation protection — it only blocks the legitimate owner from
re-entering.

**Decision.** Names are **always re-pickable**.

**Design.**
- Remove the `disabled={isClaimed || ...}` gating on the candidate button (keep
  `disabled` only for the transient `isPending` "joining…" state). Keep an
  informational, non-blocking "in room" hint on names that currently have a member
  row.
- Clicking a name (claimed or not) runs `signIn("voter", …)` as today. The member
  insert is already idempotent (`onConflictDoNothing`), and the sign-in
  re-establishes the session cookie, so re-selecting one's own name simply logs
  back in.
- No schema or API change.

**Second-cause guard (must verify).** A returning voter only sees the picker if
their session is genuinely gone. If `next-auth@5.0.0-beta.31`'s
`signOut` → `signIn({ redirect: false })` path silently no-ops (a known class of
v5-beta issue), ungraying the name will make the click *appear* to work while the
voter still bounces. **Acceptance requires testing the full loop live:** join →
sign out → click your own name → land in the room with a valid session. If the
no-op reproduces, fix it as part of this feature (e.g. force a navigation/refresh
after `signIn`, or verify the session before routing).

**Acceptance criteria.**
- A voter who has joined and signed out can click their own name and re-enter the
  room with a working session.
- Two different visitors can still both join (unrelated names remain selectable).

---

## Feature 2 — Live YouTrack sync

**Goal.** Changes made in YouTrack after session creation (edited summary /
description, reordered or newly-added issues) should reach an open room, without
short-interval polling.

**Decision.** On-open refetch (cache-then-update) **plus** a manual "Refresh from
YouTrack" button. Moderator-driven.

**Design.**
- New reconcile function, `resyncIssuesFromYouTrack(sessionId, ytContext)` (new
  `lib/poker/resync.ts`, or added to `service.ts`):
  1. Load the session's board/sprint + field conventions
     (`conventionsForSession`).
  2. Re-fetch sprint issues from YouTrack using the moderator's token (same field
     mask + fetch path as `createSession`).
  3. Reconcile into the local `issues` table:
     - **Update** `summary`, `description`, `position`, `stateName` for issues that
       still exist.
     - **Insert** issues newly added to the sprint (status `pending`).
     - **Leave** issues that disappeared from the sprint untouched (do not delete;
       they may carry local estimates). Removal handling is out of scope for this
       iteration.
- **Hard invariant:** reconcile touches **descriptive fields only**. It never
  modifies poker `status`, `estimates`, the current-issue pointer, the phase plan,
  or any voting state. This keeps in-flight voting safe.
- **Access:** moderator-only. New `POST /api/sessions/[id]/resync`, gated by
  `assertModerator`, resolving the moderator's YouTrack context the same way the
  existing `/sync` route does.
- **Triggers:**
  - *On room mount (moderator only):* render the cached DB snapshot immediately,
    then fire the resync in the background. On completion, refresh the local
    snapshot.
  - *Manual button:* a "Refresh from YouTrack" control in the moderator's room UI
    that calls the same endpoint and shows a spinner/toast.
- **Propagation:** after a successful reconcile, broadcast the existing
  `issue-changed` Pusher event on `private-session-{sessionId}` so every client
  re-pulls the DB snapshot (matching the current refresh model). Voters need no
  token — they receive updates purely through Pusher + snapshot re-pull.

**Notes / edge cases.**
- If the moderator's token is missing/expired, the endpoint returns an error and
  the room keeps showing the cached snapshot; surface a non-blocking toast.
- The on-mount resync is best-effort and must not block first paint.

**Acceptance criteria.**
- Editing an issue summary in YouTrack and then opening (or clicking Refresh in)
  the room shows the new summary.
- Adding an issue to the sprint in YouTrack makes it appear in the pending list
  after a refresh.
- An in-progress vote is unaffected by a concurrent resync.

---

## Feature 3 — Definable phases

**Goal.** Let a moderator define their own estimation phases instead of the fixed
`simple` (1 phase) / `advanced` (3 phases: impl/review/test) split.

**Decision.** All phases **sum into the single discovered duration field** (exactly
as impl+review+test do today). Phases are a voting/UI breakdown only — there is no
per-phase → YouTrack field mapping.

**Design.**

*Phase model.*
- A phase is `{ id: string, name: string }`. A **phase list** is an ordered array
  of phases (the duration phases). The SP phase always runs first and is not part
  of this list.
- Replace the hard-coded `IssueStatus` duration states
  (`dur_impl_voting/revealed`, `dur_review_*`, `dur_test_*`) with a **generalized
  phase-index model**: an issue tracks the current phase index into its snapshotted
  phase list, plus a voting/revealed sub-state. The state machine
  (`nextAfterPhase` and friends in
  [lib/poker/state-machine.ts](../../../lib/poker/state-machine.ts)) iterates the
  list generically: SP → phase[0] → phase[1] → … → completed.
  - `simple` and `advanced` become presets over this model: `simple` = a
    single-phase list (e.g. `[{name: "Estimation"}]`); `advanced` = the current
    three (`Impl`, `Review`, `Test`). `withEstimation = false` = empty phase list
    (SP only).
- Estimates continue to be stored per phase; `gatherSummary` sums all duration
  phases into the total, and `sync.ts` writes that total to the one duration field
  — **unchanged** apart from iterating a dynamic list instead of three fixed keys.

*Storage.*
- **Per-moderator default:** a new `users.defaultPhases` column (JSON array of
  `{ id, name }`), beside `defaultPokerMode` / `defaultWithEstimation`. Requires a
  Drizzle migration.
- **Per-issue snapshot:** when an issue is picked/started, snapshot the resolved
  phase list onto the `issues` row (JSON), alongside the existing `pokerMode` /
  `withEstimation` snapshot columns. This ensures mid-session changes to the
  moderator's default never corrupt an in-flight issue.
- **Compatibility:** existing `pokerMode` remains as the coarse preset selector;
  the concrete phase list is what drives the state machine. Existing sessions with
  no snapshotted phase list fall back to deriving the list from `pokerMode` +
  `withEstimation` (so old rows keep working).

*Configuration UI.*
- A **phase-list editor** in the Settings dialog
  ([user-settings-dialog.tsx](../../../components/shell/user-settings-dialog.tsx)):
  add / rename / reorder / remove phases; persists via an extended
  `/api/user/defaults` (or a new sibling route) writing `users.defaultPhases`.
- **Per-issue override** in `PickIssueDialog`: allow adjusting the phase list for
  the issue about to be started (defaults to the moderator's phase list).

*Migration / rollout.*
- Drizzle migration adds `users.defaultPhases` and the per-issue phase-list column.
- Backfill is unnecessary: null defaults derive from the existing preset logic.

**Acceptance criteria.**
- A moderator can define phases `["Design", "Build", "QA"]` in Settings; a new
  issue estimated with those phases runs SP → Design → Build → QA → completed.
- The duration written back to YouTrack equals the sum of all phase durations.
- Changing the default phase list mid-session does not alter an already-started
  issue's phases.

---

## Feature 4 — Inline SP/estimate boxes on each row

**Goal.** Edit an issue's SP and estimate directly from the task list, not only
from the opened dialog.

**Decisions.**
- Values are **saved locally** and synced later via the existing Review & Send
  dialog.
- Typing a value **stashes it without changing the issue's poker status** (a
  pending issue stays pending).

**Design.**
- Add two small numeric inputs per issue row (in `room.client.tsx`'s list
  rendering): **SP** and **total duration (hours)**. Visible to the moderator.
- Debounced save via a new moderator-only endpoint
  `PATCH /api/sessions/[id]/issues/[issueId]/estimate` accepting
  `{ sp?: number | null, durationTotal?: number | null }`. It writes a **stashed
  manual value** onto the issue's result store **without** transitioning poker
  status.
  - Storage: reuse the estimate/result mechanism (e.g. a manual/direct estimate
    record or dedicated stash columns on `issues`) such that `gatherSummary` and
    the Review & Send flow can read it. Exact storage decided in planning, but it
    must not require the issue to be `completed`.
- After a save, broadcast `issue-changed` so all clients re-pull.
- **Review & Send inclusion:** the Review & Send dialog currently lists only
  completed issues. Extend it to also include any issue that has a stashed value,
  so manually-entered estimates on pending issues are sync-able.
- The single duration box is the **total** duration — a deliberate shortcut past
  the per-phase breakdown from Feature 3. (If both a phase-vote result and a
  stashed manual total exist, the manual value takes precedence for that issue in
  the Review dialog; final rule confirmed in planning.)

**Acceptance criteria.**
- A moderator can type SP and duration on a pending row; the values persist and the
  issue stays in the pending list.
- Those values appear in the Review & Send dialog and can be pushed to YouTrack.
- Editing is debounced and reflected for other participants via Pusher.

---

## Cross-cutting notes

- **Pusher event reuse.** Features 2 and 4 reuse the existing `issue-changed`
  event + full-snapshot re-pull model rather than sending granular payloads,
  consistent with the current client (`room.client.tsx` calls `refresh()` on any
  event).
- **Moderator gating.** Features 2 and 4 endpoints use `assertModerator`. Feature 1
  is intentionally open (voter self-service).
- **Testing.** Feature 1 requires a live end-to-end check of the sign-out → re-join
  loop (see its second-cause guard). Features 2–4 get unit coverage for the
  reconcile/state-machine/stash logic plus targeted integration tests where the
  existing suites (`*.test.ts`, `vitest.integration.config.ts`) already cover the
  touched modules.
