# Definable Phases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded `simple`/`advanced` duration state machine with a generalized ordered list of named phases that a moderator can define, rename, reorder, and remove, snapshotted per-issue so mid-session changes never corrupt an in-flight issue.

**Architecture:** The state machine drops its fixed `dur_impl/review/test` status strings for a `{status, phaseIndex}` model where `status ∈ {pending,voting,revealed,completed,skipped}` and `phaseIndex = -1` means SP, `0..n-1` indexes into a snapshotted ordered phase list (`Phase = {id,name}`). `reduceIssue` iterates the list generically (SP → phase[0] → … → completed); `simple`/`advanced`/`withEstimation=false` become presets produced by `derivePhases`, and the concrete list is snapshotted onto `issues.phases` at pick time (rows with `null` fall back to the deriver). Estimates keep storing the phase **id** (`impl`/`review`/`test` reused for the presets, so no estimate-row data migration), and `gatherSummary` returns SP + an ordered per-phase array that `sync.ts` sums into the single discovered duration field.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (Postgres/Neon) + drizzle-kit migrations, React 19, shadcn/radix UI, vitest + testcontainers.

## Global Constraints
- Use pnpm, never npm.
- Tests: `pnpm test` (vitest unit), `pnpm test:integration`. Typecheck: `pnpm exec tsc --noEmit`. Lint: `pnpm lint`. Migrations: `pnpm db:generate` then `pnpm db:migrate`.
- All phases SUM into the single discovered duration field (no per-phase YouTrack field mapping).
- Snapshot the resolved phase list onto each issue at pick time so mid-session default changes never corrupt an in-flight issue.
- Backward-compat: issues with null phase list derive it from pokerMode+withEstimation.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Invariants (read once, honor everywhere)

1. **Phase representation.** `type Phase = { id: string; name: string }`. A **phase list** is the ordered array of duration phases. SP is NOT in the list; SP always runs first (even when the list is empty).
2. **Status model.** `type IssueStatus = "pending" | "voting" | "revealed" | "completed" | "skipped"`. The active phase is a separate integer `phaseIndex`: `-1` = SP, `0..phases.length-1` = duration phase. `phaseIndex` is meaningful only while `status ∈ {voting,revealed}`; it is ignored (and irrelevant) for `pending`/`completed`/`skipped`.
3. **Preset phase IDs are load-bearing and MUST NOT change.** `derivePhases` mints `simple → [{id:"impl"}]`, `advanced → [{id:"impl"},{id:"review"},{id:"test"}]`. These ids match every existing `estimates.phase` value, which is exactly why NO estimate-row data migration is needed. Renaming an id detaches every historical estimate row — never do it.
4. **Custom phase ids are minted once.** New phases created in the Settings/Pick editors get `crypto.randomUUID()` for `id`. Rename mutates `name` only. Reorder changes array order only. An id, once assigned to a phase that has estimates, is permanent for that issue's snapshot.
5. **In-flight detection is unchanged.** The literal set `["pending","completed","skipped"]` still means "not in flight" everywhere (`notInState`, `getRoomSnapshot`). Only `voting`/`revealed` are in-flight.

---

## Task 1 — Generalize the pure state machine

**Files**
- Modify: `lib/poker/state-machine.ts` (full rewrite, currently lines 1-151)
- Test: `lib/poker/state-machine.test.ts` (full rewrite, currently lines 1-165)

**Interfaces**

Produces (the canonical types — every later task imports these, never redefines them):
```ts
export type Phase = { id: string; name: string };
export type IssueStatus = "pending" | "voting" | "revealed" | "completed" | "skipped";
export type PokerMode = "simple" | "advanced";

export type IssueState = {
  status: IssueStatus;
  phaseIndex: number; // -1 = SP; 0..phases.length-1 = duration phase. Ignored for pending/completed/skipped.
  round: number;
};

export type Action =
  | { type: "pick" }
  | { type: "reveal" }
  | { type: "submit" }
  | { type: "revote" }
  | { type: "skipPhase" }
  | { type: "skipIssue" }
  | { type: "restore" }
  | { type: "gotoPhase"; target: number }; // -1 = SP, 0..n-1 = duration phase index

export function reduceIssue(state: IssueState, action: Action, phases: Phase[]): IssueState;
export function phaseInfo(
  state: { status: IssueStatus; phaseIndex: number },
  phases: Phase[],
): { kind: "sp" | "duration" | null; phaseId: string | null };
export function isVotingStatus(s: IssueStatus): boolean;
export function isRevealedStatus(s: IssueStatus): boolean;
```

Steps:

- [ ] Write the failing test file `lib/poker/state-machine.test.ts` (full replacement):
  ```ts
  import { describe, it, expect } from "vitest";
  import { reduceIssue, phaseInfo, type IssueState, type Phase } from "./state-machine";

  const ADV: Phase[] = [
    { id: "impl", name: "Implementation" },
    { id: "review", name: "Review" },
    { id: "test", name: "Test" },
  ];
  const SIMPLE: Phase[] = [{ id: "impl", name: "Estimation" }];
  const NONE: Phase[] = [];
  const CUSTOM2: Phase[] = [
    { id: "a", name: "Design" },
    { id: "b", name: "Build" },
  ];
  const CUSTOM4: Phase[] = [
    { id: "a", name: "Design" },
    { id: "b", name: "Build" },
    { id: "c", name: "QA" },
    { id: "d", name: "Docs" },
  ];

  const pending: IssueState = { status: "pending", phaseIndex: -1, round: 1 };

  describe("state machine", () => {
    it("happy path SP -> impl -> review -> test -> completed (advanced)", () => {
      let s = reduceIssue(pending, { type: "pick" }, ADV);
      expect(s).toEqual({ status: "voting", phaseIndex: -1, round: 1 });
      s = reduceIssue(s, { type: "reveal" }, ADV);
      expect(s).toEqual({ status: "revealed", phaseIndex: -1, round: 1 });
      s = reduceIssue(s, { type: "submit" }, ADV);
      expect(s).toEqual({ status: "voting", phaseIndex: 0, round: 1 });
      s = reduceIssue(reduceIssue(s, { type: "reveal" }, ADV), { type: "submit" }, ADV);
      expect(s).toEqual({ status: "voting", phaseIndex: 1, round: 1 });
      s = reduceIssue(reduceIssue(s, { type: "reveal" }, ADV), { type: "submit" }, ADV);
      expect(s).toEqual({ status: "voting", phaseIndex: 2, round: 1 });
      s = reduceIssue(reduceIssue(s, { type: "reveal" }, ADV), { type: "submit" }, ADV);
      expect(s.status).toBe("completed");
    });

    it("simple (1 phase): SP -> impl -> completed", () => {
      let s = reduceIssue(pending, { type: "pick" }, SIMPLE);
      s = reduceIssue(reduceIssue(s, { type: "reveal" }, SIMPLE), { type: "submit" }, SIMPLE);
      expect(s).toEqual({ status: "voting", phaseIndex: 0, round: 1 });
      s = reduceIssue(reduceIssue(s, { type: "reveal" }, SIMPLE), { type: "submit" }, SIMPLE);
      expect(s.status).toBe("completed");
    });

    it("empty phase list (withEstimation=false): SP only -> completed", () => {
      let s = reduceIssue(pending, { type: "pick" }, NONE);
      expect(s).toEqual({ status: "voting", phaseIndex: -1, round: 1 });
      s = reduceIssue(reduceIssue(s, { type: "reveal" }, NONE), { type: "submit" }, NONE);
      expect(s.status).toBe("completed");
    });

    it("custom 2-phase list [Design, Build] runs SP -> 0 -> 1 -> completed", () => {
      let s = reduceIssue(pending, { type: "pick" }, CUSTOM2);
      s = reduceIssue(reduceIssue(s, { type: "reveal" }, CUSTOM2), { type: "submit" }, CUSTOM2);
      expect(s.phaseIndex).toBe(0);
      s = reduceIssue(reduceIssue(s, { type: "reveal" }, CUSTOM2), { type: "submit" }, CUSTOM2);
      expect(s.phaseIndex).toBe(1);
      s = reduceIssue(reduceIssue(s, { type: "reveal" }, CUSTOM2), { type: "submit" }, CUSTOM2);
      expect(s.status).toBe("completed");
    });

    it("custom 4-phase list visits every index then completes", () => {
      let s = reduceIssue(pending, { type: "pick" }, CUSTOM4);
      const seen: number[] = [];
      for (let i = 0; i < 5; i++) {
        if (s.status === "completed") break;
        seen.push(s.phaseIndex);
        s = reduceIssue(reduceIssue(s, { type: "reveal" }, CUSTOM4), { type: "submit" }, CUSTOM4);
      }
      expect(seen).toEqual([-1, 0, 1, 2, 3]);
      expect(s.status).toBe("completed");
    });

    it("revote returns to same voting phase and increments round", () => {
      const s = reduceIssue({ status: "revealed", phaseIndex: -1, round: 1 }, { type: "revote" }, ADV);
      expect(s).toEqual({ status: "voting", phaseIndex: -1, round: 2 });
    });

    it("skipPhase advances past current phase without finalizing", () => {
      const s = reduceIssue({ status: "voting", phaseIndex: -1, round: 1 }, { type: "skipPhase" }, ADV);
      expect(s).toEqual({ status: "voting", phaseIndex: 0, round: 1 });
    });

    it("skipPhase from last phase completes the issue", () => {
      const s = reduceIssue({ status: "voting", phaseIndex: 0, round: 1 }, { type: "skipPhase" }, SIMPLE);
      expect(s.status).toBe("completed");
    });

    it("skipPhase from SP with empty list completes the issue", () => {
      const s = reduceIssue({ status: "voting", phaseIndex: -1, round: 1 }, { type: "skipPhase" }, NONE);
      expect(s.status).toBe("completed");
    });

    it("skip issue from any non-completed state moves to skipped", () => {
      const s = reduceIssue({ status: "revealed", phaseIndex: 1, round: 2 }, { type: "skipIssue" }, ADV);
      expect(s.status).toBe("skipped");
    });

    it("restore: skipped -> pending", () => {
      const s = reduceIssue({ status: "skipped", phaseIndex: -1, round: 2 }, { type: "restore" }, ADV);
      expect(s.status).toBe("pending");
    });

    it("restore from any other state throws", () => {
      for (const status of ["pending", "voting", "revealed", "completed"] as const) {
        expect(() => reduceIssue({ status, phaseIndex: -1, round: 1 }, { type: "restore" }, ADV)).toThrow();
      }
    });

    it("invalid transitions throw", () => {
      expect(() => reduceIssue(pending, { type: "reveal" }, ADV)).toThrow();
      expect(() => reduceIssue({ status: "voting", phaseIndex: -1, round: 1 }, { type: "submit" }, ADV)).toThrow();
    });

    describe("gotoPhase", () => {
      it("jumps from completed back to SP (target -1)", () => {
        const s = reduceIssue({ status: "completed", phaseIndex: 2, round: 1 }, { type: "gotoPhase", target: -1 }, ADV);
        expect(s).toEqual({ status: "voting", phaseIndex: -1, round: 1 });
      });
      it("jumps from SP forward to phase index 2", () => {
        const s = reduceIssue({ status: "voting", phaseIndex: -1, round: 1 }, { type: "gotoPhase", target: 2 }, ADV);
        expect(s).toEqual({ status: "voting", phaseIndex: 2, round: 1 });
      });
      it("rejects gotoPhase from pending and skipped", () => {
        expect(() => reduceIssue(pending, { type: "gotoPhase", target: -1 }, ADV)).toThrow();
        expect(() => reduceIssue({ status: "skipped", phaseIndex: -1, round: 1 }, { type: "gotoPhase", target: -1 }, ADV)).toThrow();
      });
      it("rejects a target beyond the phase list", () => {
        expect(() => reduceIssue({ status: "completed", phaseIndex: 0, round: 1 }, { type: "gotoPhase", target: 3 }, SIMPLE)).toThrow();
      });
    });

    describe("phaseInfo", () => {
      it("SP -> sp/null", () => {
        expect(phaseInfo({ status: "voting", phaseIndex: -1 }, ADV)).toEqual({ kind: "sp", phaseId: null });
      });
      it("duration phase -> duration/id", () => {
        expect(phaseInfo({ status: "revealed", phaseIndex: 1 }, ADV)).toEqual({ kind: "duration", phaseId: "review" });
      });
      it("non-voting -> null/null", () => {
        expect(phaseInfo({ status: "completed", phaseIndex: 2 }, ADV)).toEqual({ kind: null, phaseId: null });
      });
    });
  });
  ```
- [ ] Run: `pnpm test lib/poker/state-machine.test.ts` — expect FAIL (module still exports the old API; imports `phaseInfo`/`Phase` don't exist).
- [ ] Replace `lib/poker/state-machine.ts` in full with:
  ```ts
  export type Phase = { id: string; name: string };

  export type IssueStatus =
    | "pending"
    | "voting"
    | "revealed"
    | "completed"
    | "skipped";

  export type PokerMode = "simple" | "advanced";

  export type IssueState = {
    status: IssueStatus;
    // -1 = SP phase; 0..phases.length-1 = duration phase index.
    // Meaningful only while status is "voting" or "revealed".
    phaseIndex: number;
    round: number;
  };

  export type Action =
    | { type: "pick" }
    | { type: "reveal" }
    | { type: "submit" }
    | { type: "revote" }
    | { type: "skipPhase" }
    | { type: "skipIssue" }
    | { type: "restore" }
    // target: -1 = SP, 0..n-1 = duration phase index
    | { type: "gotoPhase"; target: number };

  /**
   * Compute the state after leaving the current phase via submit or skipPhase.
   * Generic iteration: SP (-1) -> phase 0 -> phase 1 -> ... -> completed.
   * Entering a new phase resets round to 1; reaching completed preserves round.
   */
  function advance(state: IssueState, phases: Phase[]): IssueState {
    const nextIndex = state.phaseIndex + 1; // -1 -> 0 -> 1 ...
    if (nextIndex >= phases.length) {
      return { status: "completed", phaseIndex: state.phaseIndex, round: state.round };
    }
    return { status: "voting", phaseIndex: nextIndex, round: 1 };
  }

  export function reduceIssue(state: IssueState, action: Action, phases: Phase[]): IssueState {
    switch (action.type) {
      case "pick":
        if (state.status !== "pending") throw new Error(`cannot pick from ${state.status}`);
        // Always start at SP (phaseIndex -1). SP runs even when the phase list is empty.
        return { status: "voting", phaseIndex: -1, round: 1 };
      case "reveal":
        if (state.status !== "voting") throw new Error(`cannot reveal from ${state.status}`);
        return { ...state, status: "revealed" };
      case "revote":
        if (state.status !== "revealed") throw new Error(`cannot revote from ${state.status}`);
        return { ...state, status: "voting", round: state.round + 1 };
      case "submit":
        if (state.status !== "revealed") throw new Error(`cannot submit from ${state.status}`);
        return advance(state, phases);
      case "skipPhase":
        if (state.status !== "voting" && state.status !== "revealed") {
          throw new Error(`cannot skipPhase from ${state.status}`);
        }
        return advance(state, phases);
      case "skipIssue":
        if (state.status === "completed") throw new Error("cannot skip a completed issue");
        return { ...state, status: "skipped" };
      case "restore":
        if (state.status !== "skipped") throw new Error(`cannot restore from ${state.status}`);
        return { status: "pending", phaseIndex: -1, round: 1 };
      case "gotoPhase": {
        if (state.status === "pending" || state.status === "skipped") {
          throw new Error(`cannot gotoPhase from ${state.status}`);
        }
        if (action.target < -1 || action.target >= phases.length) {
          throw new Error(`gotoPhase target ${action.target} out of range`);
        }
        // Reset round to 1 — the service computes the true (highest existing round + 1)
        // for the destination phase from the estimates table.
        return { status: "voting", phaseIndex: action.target, round: 1 };
      }
    }
  }

  /**
   * Resolve the current (kind, phaseId) from a status + phaseIndex against the
   * issue's snapshotted phase list. Returns nulls when not in an active phase.
   */
  export function phaseInfo(
    state: { status: IssueStatus; phaseIndex: number },
    phases: Phase[],
  ): { kind: "sp" | "duration" | null; phaseId: string | null } {
    if (state.status !== "voting" && state.status !== "revealed") {
      return { kind: null, phaseId: null };
    }
    if (state.phaseIndex < 0) return { kind: "sp", phaseId: null };
    const p = phases[state.phaseIndex];
    return { kind: "duration", phaseId: p ? p.id : null };
  }

  export function isVotingStatus(s: IssueStatus): boolean {
    return s === "voting";
  }

  export function isRevealedStatus(s: IssueStatus): boolean {
    return s === "revealed";
  }
  ```
- [ ] Run: `pnpm test lib/poker/state-machine.test.ts` — expect PASS.
- [ ] Commit: `feat(state-machine): generalize to {status,phaseIndex} phase-list model` (with trailer).

---

## Task 2 — `derivePhases` deriver (presets + backward-compat)

**Files**
- Modify: `lib/poker/state-machine.ts` (append `derivePhases`)
- Test: `lib/poker/derive-phases.test.ts` (new)

**Interfaces**

Produces:
```ts
export function derivePhases(pokerMode: PokerMode | null, withEstimation: boolean | null): Phase[];
```

Steps:

- [ ] Write failing test `lib/poker/derive-phases.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { derivePhases } from "./state-machine";

  describe("derivePhases", () => {
    it("advanced + withEstimation -> impl/review/test with stable ids", () => {
      expect(derivePhases("advanced", true)).toEqual([
        { id: "impl", name: "Implementation" },
        { id: "review", name: "Review" },
        { id: "test", name: "Test" },
      ]);
    });
    it("simple + withEstimation -> single Estimation phase with id 'impl'", () => {
      expect(derivePhases("simple", true)).toEqual([{ id: "impl", name: "Estimation" }]);
    });
    it("withEstimation=false -> empty list (SP only)", () => {
      expect(derivePhases("advanced", false)).toEqual([]);
      expect(derivePhases("simple", false)).toEqual([]);
    });
    it("null mode defaults to advanced; null withEstimation defaults to true", () => {
      expect(derivePhases(null, null)).toEqual([
        { id: "impl", name: "Implementation" },
        { id: "review", name: "Review" },
        { id: "test", name: "Test" },
      ]);
    });
  });
  ```
- [ ] Run: `pnpm test lib/poker/derive-phases.test.ts` — expect FAIL (`derivePhases` not exported).
- [ ] Append to `lib/poker/state-machine.ts`:
  ```ts
  /**
   * Backward-compat deriver: the concrete phase list for an issue that has no
   * snapshotted `phases` (legacy rows) OR for resolving a moderator preset.
   *
   * INVARIANT: preset phase ids ("impl","review","test") match every existing
   * estimates.phase value. Never change them — doing so detaches historical
   * estimates from their phase. See Invariant #3.
   */
  export function derivePhases(pokerMode: PokerMode | null, withEstimation: boolean | null): Phase[] {
    if (withEstimation === false) return [];
    const mode = pokerMode ?? "advanced";
    if (mode === "simple") return [{ id: "impl", name: "Estimation" }];
    return [
      { id: "impl", name: "Implementation" },
      { id: "review", name: "Review" },
      { id: "test", name: "Test" },
    ];
  }
  ```
- [ ] Run: `pnpm test lib/poker/derive-phases.test.ts` — expect PASS.
- [ ] Commit: `feat(state-machine): add derivePhases preset/back-compat deriver` (with trailer).

---

## Task 3 — Schema columns + migration (with in-flight status remap)

**Files**
- Modify: `lib/db/schema.ts` (users lines 3-19; issues lines 83-107)
- Create: `db/migrations/0008_*.sql` (drizzle-generated name kept as-is, then hand-appended with the remap SQL)
- Modify: `db/migrations/meta/*` (drizzle-kit auto-updates)

**Interfaces** — new columns:
- `users.default_phases` jsonb, nullable — `Phase[] | null`.
- `issues.phases` jsonb, nullable — snapshotted `Phase[] | null`.
- `issues.phase_index` integer, nullable — `-1` = SP; `0..n-1` duration index; null on legacy rows (treated as `-1`).
- `issues.status` values change from `sp_voting`/`dur_*` strings to `pending|voting|revealed|completed|skipped`.

Steps:

- [ ] Edit `lib/db/schema.ts` `users` table — add after `defaultWithEstimation` (line 13):
  ```ts
    // Moderator's preferred default phase list (ordered duration phases, SP excluded).
    // Null → derive from defaultPokerMode + defaultWithEstimation via derivePhases.
    defaultPhases: jsonb("default_phases"), // Array<{ id, name }> or null
  ```
- [ ] Edit `lib/db/schema.ts` `issues` table — add after `directEntry` (line 101):
  ```ts
      // Snapshotted ordered duration phase list, captured at pick time so mid-session
      // default changes never alter an in-flight issue. Null on legacy rows → derive
      // from pokerMode + withEstimation.
      phases: jsonb("phases"), // Array<{ id, name }> or null
      // Active phase pointer: -1 = SP, 0..phases.length-1 = duration phase.
      // Null on legacy rows → treated as -1 (SP).
      phaseIndex: integer("phase_index"),
  ```
  (`jsonb` and `integer` are already imported at line 1.)
- [ ] Run: `pnpm db:generate` — expect it to emit a `db/migrations/0008_*.sql` file adding the three columns. Expected: it does NOT know about the status-string remap (that's a data migration we append by hand).
- [ ] Leave the generated filename and `db/migrations/meta/_journal.json` exactly as drizzle-kit wrote them (do NOT rename — a hand-desynced journal tag breaks `db:migrate`). Only hand-append the in-flight data migration to the END of that generated `.sql` file:
  ```sql
  --> statement-breakpoint
  -- Backward-compat: remap in-flight issue rows from the old encoded status strings
  -- to the new {status, phase_index} model. Terminal rows (completed/skipped/pending)
  -- keep their status and derive phases lazily; only voting/revealed rows need an index.
  UPDATE "issues" SET "status" = 'voting',   "phase_index" = -1 WHERE "status" = 'sp_voting';
  UPDATE "issues" SET "status" = 'revealed', "phase_index" = -1 WHERE "status" = 'sp_revealed';
  UPDATE "issues" SET "status" = 'voting',   "phase_index" = 0  WHERE "status" = 'dur_impl_voting';
  UPDATE "issues" SET "status" = 'revealed', "phase_index" = 0  WHERE "status" = 'dur_impl_revealed';
  UPDATE "issues" SET "status" = 'voting',   "phase_index" = 1  WHERE "status" = 'dur_review_voting';
  UPDATE "issues" SET "status" = 'revealed', "phase_index" = 1  WHERE "status" = 'dur_review_revealed';
  UPDATE "issues" SET "status" = 'voting',   "phase_index" = 2  WHERE "status" = 'dur_test_voting';
  UPDATE "issues" SET "status" = 'revealed', "phase_index" = 2  WHERE "status" = 'dur_test_revealed';
  ```
  Note: existing in-flight rows have null `phases`, so `resolvePhases` (Task 4) derives `[impl,review,test]`/`[impl]` for them and the indexes above line up exactly with `estimates.phase` ids. `pending`/`completed`/`skipped` strings are already valid in the new enum and need no UPDATE.
- [ ] Run: `pnpm db:migrate` — expect it to apply cleanly against a dev DB.
- [ ] Run: `pnpm exec tsc --noEmit` — expect FAIL only in `lib/poker/service.ts` and downstream (they still reference the old state-machine API / summary shape). That's the next tasks. If schema.ts itself errors, fix before committing.
- [ ] Commit: `feat(db): add defaultPhases/phases/phaseIndex columns + status remap migration` (with trailer).

---

## Task 4 — Rewire `service.ts` to the phase-list model

**Files**
- Modify: `lib/poker/service.ts` — imports (line 7), `issueStateFrom` (16-23), `pickIssue` (188-226), `setUserDefaults` (285-295), `setIssueMode` (303-322), `castVote` (324-351), `reveal` (353-362), `currentEstimate` (366-393), `nextRoundFor` (425-439), `submitFinal` (441-482), `skipPhase` (484-505), `startRevote` (539-554), `gotoPhase` (556-596), `getRoomSnapshot` (647-693). `gatherSummary` is Task 5.

**Interfaces**

Consumes: `reduceIssue`, `phaseInfo`, `derivePhases`, `Phase`, `IssueState`, `IssueStatus`, `PokerMode` from `./state-machine`.

Produces (new internal helpers + changed public signatures):
```ts
function issueStateFrom(issue: typeof issues.$inferSelect, round: number): IssueState;
function resolvePhases(issue: typeof issues.$inferSelect): Phase[];
export function setUserDefaults(userId: string, opts: {
  defaultPokerMode?: PokerMode | null;
  defaultWithEstimation?: boolean | null;
  defaultPhases?: Phase[] | null;
}): Promise<void>;
export function pickIssue(sessionId: string, issueId: string, moderatorUserId: string,
  opts?: { mode?: PokerMode; withEstimation?: boolean; phases?: Phase[] }): Promise<IssueState>;
export function gotoPhase(sessionId: string, issueId: string, moderatorUserId: string,
  target: number): Promise<{ status: IssueStatus; round: number }>;
```
`RoomSnapshot.activeIssue` gains `phaseIndex: number`. The `activeIssue.issue` row already carries `phases`/`phaseIndex` (whole row is returned).

Steps:

- [ ] Update the import at `lib/poker/service.ts:7`:
  ```ts
  import { reduceIssue, phaseInfo, derivePhases, type Phase, type IssueState, type IssueStatus, type PokerMode } from "./state-machine";
  ```
- [ ] Replace `issueStateFrom` (lines 16-23) and add `resolvePhases` beneath it:
  ```ts
  /** Build the state-machine input from a stored issue row. */
  function issueStateFrom(issue: typeof issues.$inferSelect, round: number): IssueState {
    return {
      status: issue.status as IssueStatus,
      phaseIndex: issue.phaseIndex ?? -1,
      round,
    };
  }

  /**
   * Resolve the issue's ordered duration phase list. Prefer the snapshot taken at
   * pick time; fall back to the preset deriver for legacy rows with null phases.
   */
  function resolvePhases(issue: typeof issues.$inferSelect): Phase[] {
    if (issue.phases) return issue.phases as Phase[];
    return derivePhases(issue.pokerMode as PokerMode | null, issue.withEstimation);
  }
  ```
- [ ] Rewrite `pickIssue` body (lines 207-224) — resolve+snapshot the phase list, set phaseIndex, open the SP estimate:
  ```ts
      // Resolve mode/withEstimation for the comment/back-compat snapshot.
      const [mod] = await tx.select().from(users).where(eq(users.id, moderatorUserId)).limit(1);
      const mode: PokerMode = opts?.mode ?? (mod?.defaultPokerMode as PokerMode | null) ?? "advanced";
      const withEstimation: boolean =
        opts?.withEstimation ?? mod?.defaultWithEstimation ?? true;

      // Resolve the concrete phase list that drives the state machine:
      //   explicit opts.phases > moderator's defaultPhases > preset deriver.
      const phases: Phase[] =
        opts?.phases ??
        ((mod?.defaultPhases as Phase[] | null) && withEstimation
          ? (mod!.defaultPhases as Phase[])
          : derivePhases(mode, withEstimation));

      const next = reduceIssue(issueStateFrom(issue, 1), { type: "pick" }, phases);
      await tx
        .update(issues)
        .set({ pokerMode: mode, withEstimation, phases, phaseIndex: next.phaseIndex, status: next.status })
        .where(eq(issues.id, issueId));
      await tx.insert(estimates).values({ issueId, kind: "sp", phase: null, round: 1 });
      return next;
  ```
  (Delete the old separate `update({pokerMode,withEstimation})`, `reduceIssue({...},{type:"pick"})`, and `update({status})` lines it replaces.)
- [ ] Update `setUserDefaults` (lines 285-295) to also persist `defaultPhases`:
  ```ts
  export async function setUserDefaults(
    userId: string,
    opts: { defaultPokerMode?: PokerMode | null; defaultWithEstimation?: boolean | null; defaultPhases?: Phase[] | null },
  ) {
    const set: Record<string, unknown> = {};
    if (opts.defaultPokerMode !== undefined) set.defaultPokerMode = opts.defaultPokerMode;
    if (opts.defaultWithEstimation !== undefined) set.defaultWithEstimation = opts.defaultWithEstimation;
    if (opts.defaultPhases !== undefined) set.defaultPhases = opts.defaultPhases;
    if (Object.keys(set).length === 0) return;
    await db.update(users).set(set).where(eq(users.id, userId));
  }
  ```
- [ ] `setIssueMode` (lines 303-322): the finished-check uses `issue.status === "completed" || issue.status === "skipped"` — still valid (enum values unchanged). Leave the body as-is (it updates only `pokerMode`/`withEstimation`). **Do NOT re-snapshot `phases` or touch `phaseIndex` here.** The pick-time snapshot stays authoritative: re-deriving mid-flight could shrink the list (e.g. advanced→simple) while `phaseIndex` still points past its end, stranding `phaseInfo`/`currentEstimate`. `setIssueMode` only adjusts the coarse preset used for the comment/back-compat; the concrete flow keeps running on the phases captured at pick.
- [ ] Update `castVote` (lines 334-336): replace status-string checks:
  ```ts
      const { kind } = phaseInfo(issueStateFrom(issue, 1), resolvePhases(issue));
      if (!kind) throw new Error("not in a voting phase");
      if (issue.status !== "voting") throw new Error(`cannot vote in ${issue.status}`);
  ```
- [ ] Update `reveal` (lines 358): pass phases to `reduceIssue`:
  ```ts
      const next = reduceIssue(issueStateFrom(issue, 1), { type: "reveal" }, resolvePhases(issue));
      await tx.update(issues).set({ status: next.status, phaseIndex: next.phaseIndex }).where(eq(issues.id, issueId));
  ```
- [ ] Update `currentEstimate` (lines 366-393): use `phaseInfo` instead of `phaseOfStatus`:
  ```ts
    const { kind, phaseId } = phaseInfo(issueStateFrom(issue, 1), resolvePhases(issue));
    if (!kind) {
      const [row] = await tx.select().from(estimates).where(eq(estimates.issueId, issueId))
        .orderBy(desc(estimates.round), desc(estimates.id)).limit(1);
      return row ?? null;
    }
    const phaseCond = phaseId === null ? sql`${estimates.phase} IS NULL` : eq(estimates.phase, phaseId);
  ```
  (rest of the function unchanged; `kind` is now the resolved `"sp"|"duration"`).
- [ ] Update `nextRoundFor` (lines 425-439): its `phase` param is already `string | null`; change the type annotation to `phase: string | null` (drop the `"impl"|"review"|"test"` literal). Body unchanged.
- [ ] Update `submitFinal` (lines 446, 469, 475-478):
  - Line 446 `if (!issue.status.endsWith("_revealed"))` → `if (issue.status !== "revealed")`.
  - Line 469 `reduceIssue(issueStateFrom(issue, current.round), { type: "submit" })` → add `, resolvePhases(issue))`.
  - Line 470 also persist phaseIndex: `await tx.update(issues).set({ status: next.status, phaseIndex: next.phaseIndex }).where(eq(issues.id, issueId));`
  - Lines 475-478 open next estimate row:
    ```ts
      const info = phaseInfo(next, resolvePhases(issue));
      if (info.kind && next.status === "voting") {
        const round = await nextRoundFor(tx, issueId, info.kind, info.phaseId);
        await tx.insert(estimates).values({ issueId, kind: info.kind, phase: info.phaseId, round });
      }
    ```
- [ ] Update `skipPhase` (lines 496-502) the same way:
  ```ts
      const phases = resolvePhases(issue);
      const next = reduceIssue(issueStateFrom(issue, current?.round ?? 1), { type: "skipPhase" }, phases);
      await tx.update(issues).set({ status: next.status, phaseIndex: next.phaseIndex }).where(eq(issues.id, issueId));
      const info = phaseInfo(next, phases);
      if (info.kind && next.status === "voting") {
        const round = await nextRoundFor(tx, issueId, info.kind, info.phaseId);
        await tx.insert(estimates).values({ issueId, kind: info.kind, phase: info.phaseId, round });
      }
  ```
- [ ] Update `skipIssue` (lines 512-513): add the phases arg (phaseIndex is irrelevant for `skipped`, so no need to persist it):
  ```ts
      const next = reduceIssue(issueStateFrom(issue, 1), { type: "skipIssue" }, resolvePhases(issue));
      await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
  ```
- [ ] Update `startRevote` (lines 546-547): add phases arg; persist phaseIndex (unchanged value but keep set consistent):
  ```ts
      const next = reduceIssue(issueStateFrom(issue, current.round), { type: "revote" }, resolvePhases(issue));
      await tx.update(issues).set({ status: next.status, phaseIndex: next.phaseIndex }).where(eq(issues.id, issueId));
  ```
- [ ] Rewrite `gotoPhase` (lines 556-596) — signature target is now `number`; destination kind/phaseId from the list:
  ```ts
  export async function gotoPhase(
    sessionId: string,
    issueId: string,
    moderatorUserId: string,
    target: number, // -1 = SP, 0..n-1 = duration phase index
  ) {
    return db.transaction(async (tx) => {
      await assertModerator(tx, sessionId, moderatorUserId);
      const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
      if (!issue || issue.sessionId !== sessionId) throw new Error("issue not in session");

      const inFlight = await tx.select().from(issues)
        .where(and(eq(issues.sessionId, sessionId), notInState(["pending", "completed", "skipped"])));
      if (inFlight.length > 0 && inFlight[0]!.id !== issueId) {
        throw new Error("another issue is already in progress; finish or skip it first");
      }

      const phases = resolvePhases(issue);
      const next = reduceIssue(issueStateFrom(issue, 1), { type: "gotoPhase", target }, phases);
      await tx.update(issues).set({ status: next.status, phaseIndex: next.phaseIndex }).where(eq(issues.id, issueId));

      const targetKind: "sp" | "duration" = target < 0 ? "sp" : "duration";
      const targetPhaseId: string | null = target < 0 ? null : phases[target]!.id;
      const newRound = await nextRoundFor(tx, issueId, targetKind, targetPhaseId);
      await tx.insert(estimates).values({ issueId, kind: targetKind, phase: targetPhaseId, round: newRound });

      return { status: next.status, round: newRound };
    });
  }
  ```
- [ ] Update `restoreIssue` (line 534): after wiping estimates, also reset the pointer:
  ```ts
      await tx.update(issues).set({ status: "pending", phaseIndex: null }).where(eq(issues.id, issueId));
  ```
- [ ] Update `getRoomSnapshot` (lines 650-681):
  - Line 653: `const { kind, phaseId } = phaseInfo({ status: active.status as IssueStatus, phaseIndex: active.phaseIndex ?? -1 }, resolvePhases(active));`
  - Line 654 `phaseCond`: use `phaseId` instead of `phase`.
  - Line 665: `const isRevealed = active.status === "revealed";`
  - Add `phaseIndex: active.phaseIndex ?? -1` to the `activeIssue` object.
  - Update the `RoomSnapshot` type (lines 636-644): `activeIssue` gains `phaseIndex: number;`.
- [ ] Run: `pnpm exec tsc --noEmit` — expect remaining failures ONLY in `gatherSummary`/`comment-formatter`/`sync`/routes/UI (Tasks 5-10). `service.ts` (except `gatherSummary`) should now typecheck.
- [ ] Run existing integration suite to catch regressions in flow: `pnpm test:integration` — expect the phase-flow tests (`goto-phase`, `simple-mode`, `restore-cleans-estimates`) to FAIL where they assert `summary.duration.impl` (Task 5 updates those) but the pick/reveal/submit/skip transitions themselves must still run without throwing. If a transition throws, fix service before proceeding.
- [ ] Commit: `refactor(service): drive poker flow from snapshotted phase list` (with trailer).

---

## Task 5 — `gatherSummary` → ordered phase array + `comment-formatter`

**Files**
- Modify: `lib/poker/comment-formatter.ts` (types 1-26; `formatSummaryComment` 28-113)
- Modify: `lib/poker/service.ts` `gatherSummary` (695-750)
- Test: `lib/poker/comment-formatter.test.ts` (full rewrite, 1-~140)

**Interfaces**

Produces (new `SummaryInput` — the single source of truth for summary shape):
```ts
export type PhaseSummary = { name: string; summary: EstimateSummary };
export type SummaryInput = {
  date: Date;
  members: string[];
  directEntry?: boolean;
  sp: EstimateSummary;
  phases: PhaseSummary[]; // ordered duration phases; [] = SP-only
};
```

Steps:

- [ ] Rewrite `lib/poker/comment-formatter.ts` types (lines 10-26) and `formatSummaryComment` to iterate `s.phases`:
  ```ts
  export type Vote = { user: string; value: number };

  export type EstimateSummary = {
    skipped: boolean;
    final: number | null;
    rounds: number;
    votes: Vote[];
  };

  export type PhaseSummary = { name: string; summary: EstimateSummary };

  export type SummaryInput = {
    date: Date;
    members: string[];
    directEntry?: boolean;
    sp: EstimateSummary;
    phases: PhaseSummary[]; // ordered duration phases; empty = SP-only
  };

  export function formatSummaryComment(s: SummaryInput): string {
    const directEntry = !!s.directEntry;
    const date = s.date.toISOString().slice(0, 10);
    const lines: string[] = [];
    if (directEntry) {
      lines.push(`Estimated via Full House on ${date} (values entered directly).`);
    } else {
      lines.push(`Estimated via Full House on ${date} by ${s.members.join(", ")}.`);
    }
    lines.push("");

    // SP line
    if (s.sp.skipped) {
      lines.push("Story Points: skipped");
    } else if (s.sp.final !== null) {
      if (directEntry) {
        lines.push(`Story Points: ${formatNum(s.sp.final)}  (entered directly)`);
      } else {
        const roundSuffix = s.sp.rounds > 1 ? `  (rounds: ${s.sp.rounds})` : "";
        lines.push(`Story Points: ${formatNum(s.sp.final)}${roundSuffix}`);
        for (const line of groupVoteLines(s.sp.votes)) lines.push(`  ${line}`);
      }
    }
    lines.push("");

    // Duration section
    if (s.phases.length === 0) {
      while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      return lines.join("\n");
    }

    if (directEntry) {
      const total = s.phases.reduce((sum, p) => sum + (p.summary.final ?? 0), 0);
      const anyFinal = s.phases.some((p) => !p.summary.skipped && p.summary.final !== null);
      lines.push(anyFinal ? `Duration: ${formatNum(total)}h  (entered directly)` : "Duration: skipped");
      return lines.join("\n");
    }

    const allSkipped = s.phases.every((p) => p.summary.skipped);
    if (allSkipped) {
      lines.push("Duration: skipped");
      return lines.join("\n");
    }

    const total = s.phases.reduce((sum, p) => sum + (p.summary.final ?? 0), 0);
    // Single-phase lists render inline like the old "simple" mode; multi-phase break down.
    if (s.phases.length === 1) {
      const e = s.phases[0]!.summary;
      const roundSuffix = e.rounds > 1 ? `  (rounds: ${e.rounds})` : "";
      lines.push(`Duration: ${formatNum(e.final ?? 0)}h total (${s.phases[0]!.name})${roundSuffix}`);
      for (const line of groupVoteLines(e.votes)) lines.push(`  ${line}`);
      return lines.join("\n");
    }

    lines.push(`Duration: ${formatNum(total)}h total`);
    for (const p of s.phases) {
      const e = p.summary;
      if (e.skipped) {
        lines.push(`  ${p.name}: skipped`);
        continue;
      }
      const roundSuffix = e.rounds > 1 ? `  (rounds: ${e.rounds})` : "";
      lines.push(`  ${p.name}: ${formatNum(e.final ?? 0)}h${roundSuffix}`);
      for (const line of groupVoteLines(e.votes)) lines.push(`    ${line}`);
    }
    return lines.join("\n");
  }
  ```
  (Keep `groupVoteLines` and `formatNum` unchanged.)
- [ ] Rewrite `lib/poker/comment-formatter.test.ts` to the new shape (replace the fixed `duration:{impl,review,test}` object with a `phases` array). Full replacement:
  ```ts
  import { describe, it, expect } from "vitest";
  import { formatSummaryComment, type SummaryInput } from "./comment-formatter";

  const est = (final: number | null, votes: Array<[string, number]> = [], rounds = 1) => ({
    skipped: final === null,
    final,
    rounds,
    votes: votes.map(([user, value]) => ({ user, value })),
  });

  const baseInput: SummaryInput = {
    date: new Date("2026-05-25T10:00:00Z"),
    members: ["Javad", "Sara", "Reza"],
    sp: est(5, [["Javad", 5], ["Sara", 3], ["Reza", 5]]),
    phases: [
      { name: "Implementation", summary: est(8, [["Javad", 8], ["Sara", 4], ["Reza", 8]]) },
      { name: "Review", summary: est(2, [["Javad", 2], ["Sara", 1], ["Reza", 2]]) },
      { name: "Test", summary: est(2, [["Javad", 2], ["Sara", 2], ["Reza", 2]]) },
    ],
  };

  describe("formatSummaryComment", () => {
    it("includes date, members, SP and per-phase duration", () => {
      const out = formatSummaryComment(baseInput);
      expect(out).toContain("2026-05-25");
      expect(out).toContain("Javad, Sara, Reza");
      expect(out).toContain("Story Points: 5");
      expect(out).toContain("Duration: 12h total");
      expect(out).toContain("Implementation: 8h");
      expect(out).toContain("Review: 2h");
      expect(out).toContain("Test: 2h");
    });

    it("groups votes by value with voter names", () => {
      const out = formatSummaryComment(baseInput);
      expect(out).toContain("3 — Sara");
      expect(out).toContain("5 — Javad, Reza");
    });

    it("renders 'Story Points: skipped' when SP was skipped", () => {
      const out = formatSummaryComment({ ...baseInput, sp: est(null) });
      expect(out).toContain("Story Points: skipped");
      expect(out).not.toMatch(/Story Points: \d/);
    });

    it("renders 'Duration: skipped' when all phases were skipped", () => {
      const out = formatSummaryComment({
        ...baseInput,
        phases: baseInput.phases.map((p) => ({ ...p, summary: est(null) })),
      });
      expect(out).toContain("Duration: skipped");
    });

    it("single-phase list renders inline with the phase name", () => {
      const out = formatSummaryComment({
        ...baseInput,
        phases: [{ name: "Estimation", summary: est(8, [["Javad", 8]]) }],
      });
      expect(out).toContain("Duration: 8h total (Estimation)");
    });

    it("empty phase list omits the duration section", () => {
      const out = formatSummaryComment({ ...baseInput, phases: [] });
      expect(out).not.toContain("Duration");
    });

    it("custom 4-phase list breaks down every phase", () => {
      const out = formatSummaryComment({
        ...baseInput,
        phases: [
          { name: "Design", summary: est(3) },
          { name: "Build", summary: est(5) },
          { name: "QA", summary: est(2) },
          { name: "Docs", summary: est(1) },
        ],
      });
      expect(out).toContain("Duration: 11h total");
      expect(out).toContain("Design: 3h");
      expect(out).toContain("Docs: 1h");
    });

    it("directEntry sums phases into a single line", () => {
      const out = formatSummaryComment({
        ...baseInput,
        directEntry: true,
        sp: est(5),
        phases: [{ name: "Implementation", summary: est(10) }],
      });
      expect(out).toContain("Story Points: 5  (entered directly)");
      expect(out).toContain("Duration: 10h  (entered directly)");
    });
  });
  ```
- [ ] Run: `pnpm test lib/poker/comment-formatter.test.ts` — expect FAIL (formatter+types not yet the new shape). If you edited the formatter before the test, run to confirm PASS instead; order the two edits test-first.
- [ ] After both edits: `pnpm test lib/poker/comment-formatter.test.ts` — expect PASS.
- [ ] Rewrite `gatherSummary` in `lib/poker/service.ts` (lines 737-749 return block; keep 695-736 setup). Build the phase list from the resolved snapshot:
  ```ts
    const phaseList = resolvePhases(issue);
    const phaseSummaries = await Promise.all(
      phaseList.map(async (p) => ({ name: p.name, summary: await summaryFor(`duration:${p.id}`) })),
    );

    return {
      date: new Date(),
      members: memberNames,
      directEntry: !!issue.directEntry,
      sp: await summaryFor("sp:"),
      phases: phaseSummaries,
    };
  ```
  Note: `summaryFor` already returns the `EstimateSummary` shape. For a `directEntry` issue with null `phases`, `resolvePhases` derives `[impl,review,test]`; only `duration:impl` carries the stashed total, so the summed total equals it and the other phases render skipped — the formatter's `directEntry` branch collapses them to one line. (Also delete the now-unused `mode`/`withEstimation` fields from the return object since `SummaryInput` dropped them.)
- [ ] Run: `pnpm exec tsc --noEmit` — expect remaining failures only in `sync.ts`, the summary route, and UI. `service.ts`/`comment-formatter.ts` should typecheck.
- [ ] Commit: `feat(summary): return ordered phase array; format from dynamic list` (with trailer).

---

## Task 6 — `sync.ts`, per-issue summary route, review dialog

**Files**
- Modify: `lib/poker/sync.ts` (line 61)
- Modify: `app/api/sessions/[id]/issues/[issueId]/summary/route.ts` (lines 16-27)
- Modify: `components/poker/send-all-to-youtrack-dialog.tsx` (types 16-17; row init 37; prefill 74-99; per-phase display 270-271)

**Interfaces**

The `/summary` route response changes `perPhase` from a fixed object to an ordered array:
```ts
// GET .../summary -> { sp: number|null; durationTotal: number|null; perPhase: Array<{ name: string; value: number|null }> }
```

Steps:

- [ ] `lib/poker/sync.ts` line 61 — sum the dynamic list:
  ```ts
    const phases = summary.phases.map((p) => p.summary);
  ```
  (Lines 62-63 `anyPhaseFinal`/`phaseTotal` already iterate `phases` generically — unchanged.)
- [ ] Run: `pnpm exec tsc --noEmit` — expect `sync.ts` to typecheck now; remaining failures in the route + dialog.
- [ ] Rewrite the summary route (lines 16-26):
  ```ts
    const durSummaries = summary.phases.map((p) => p.summary);
    const anyPhaseFinal = durSummaries.some((p) => !p.skipped && p.final !== null);
    const total = anyPhaseFinal ? durSummaries.reduce((s, p) => s + (p.final ?? 0), 0) : null;
    return NextResponse.json({
      sp: summary.sp.skipped ? null : summary.sp.final,
      durationTotal: total,
      perPhase: summary.phases.map((p) => ({
        name: p.name,
        value: p.summary.skipped ? null : p.summary.final,
      })),
    });
  ```
- [ ] Update `send-all-to-youtrack-dialog.tsx`:
  - Line 16-17 types:
    ```ts
    type PerPhase = Array<{ name: string; value: number | null }>;
    type Summary = { sp: number | null; durationTotal: number | null; perPhase: PerPhase | null };
    ```
  - Line 37 init `perPhase: null` stays valid.
  - Prefill (around 74-99): assign `perPhase: data.perPhase ?? null` where the row is built (mirror the existing `sp`/`duration` prefill assignment).
  - Per-phase context display (lines 270-271): replace the hard-coded impl/review/test line with:
    ```tsx
    {row.perPhase && row.perPhase.length > 1 && (
      <span className="text-xs text-muted-foreground">
        ({row.perPhase.map((p) => `${p.name} ${p.value ?? "—"}h`).join(" · ")})
      </span>
    )}
    ```
    (Wrap in whatever element currently holds lines 270-271; keep the surrounding JSX.)
- [ ] Run: `pnpm exec tsc --noEmit` — expect failures now only in routes/UI touching state-machine `gotoPhase`/`phaseOfStatus` (Tasks 7-10).
- [ ] Run: `pnpm test` — expect all unit tests PASS.
- [ ] Commit: `feat(sync): sum dynamic phase list; generalize summary route + review dialog` (with trailer).

---

## Task 7 — API routes: pick-issue, goto-phase, user/defaults

**Files**
- Modify: `app/api/sessions/[id]/pick-issue/route.ts` (Body 7-11; call 19-22)
- Modify: `app/api/sessions/[id]/goto-phase/route.ts` (Body 7-10)
- Modify: `app/api/user/defaults/route.ts` (Body 6-9; GET 14-17; POST 25-28)

**Interfaces**
- `POST /pick-issue` body gains `phases?: Array<{id,name}>`.
- `POST /goto-phase` body `target` becomes an integer `>= -1`.
- `GET /api/user/defaults` returns `defaultPhases`; `POST` accepts it.

Steps:

- [ ] `pick-issue/route.ts` — extend Body + pass `phases`:
  ```ts
  const PhaseSchema = z.object({ id: z.string(), name: z.string() });
  const Body = z.object({
    issueId: z.string().uuid(),
    mode: z.enum(["simple", "advanced"]).optional(),
    withEstimation: z.boolean().optional(),
    phases: z.array(PhaseSchema).optional(),
  });
  ```
  and in the call: `pickIssue(id, parsed.data.issueId, user.id, { mode: parsed.data.mode, withEstimation: parsed.data.withEstimation, phases: parsed.data.phases })`.
- [ ] `goto-phase/route.ts` — Body target becomes a number:
  ```ts
  const Body = z.object({
    issueId: z.string().uuid(),
    target: z.number().int().min(-1),
  });
  ```
  (`gotoPhase(id, ..., parsed.data.target)` already matches the new numeric signature.)
- [ ] `user/defaults/route.ts` — extend Body, GET, POST:
  ```ts
  const PhaseSchema = z.object({ id: z.string(), name: z.string() });
  const Body = z.object({
    defaultPokerMode: z.enum(["simple", "advanced"]).nullable().optional(),
    defaultWithEstimation: z.boolean().nullable().optional(),
    defaultPhases: z.array(PhaseSchema).nullable().optional(),
  });
  ```
  GET adds `defaultPhases: user.defaultPhases` to the JSON. POST passes `defaultPhases: parsed.data.defaultPhases` into `setUserDefaults`. (Confirm `getServerUser()` returns the `defaultPhases` column; if it selects specific fields, add `defaultPhases` there.)
- [ ] Run: `pnpm exec tsc --noEmit` — expect failures now only in UI components (Tasks 8-10).
- [ ] Commit: `feat(api): accept phase lists in pick-issue/user-defaults; numeric goto target` (with trailer).

**Note on `getServerUser`:** verify it exposes `defaultPhases`. Search `lib/auth/session.ts`; if it maps a fixed field set, add `defaultPhases`. Include that edit in this task if needed.

---

## Task 8 — Settings dialog: phase-list editor

**Files**
- Modify: `components/shell/user-settings-dialog.tsx` (state 49-52; load 66-79; save 81-98; JSX 108-134)

**Interfaces**

Consumes `Phase` shape `{id,name}`. Editor supports add / rename / reorder (up/down) / remove. New phases get `crypto.randomUUID()` ids (Invariant #4).

Steps:

- [ ] Add state below line 50:
  ```ts
  const [phases, setPhases] = useState<{ id: string; name: string }[]>([]);
  ```
- [ ] In the load effect (66-78), after reading `defaultWithEstimation`, seed the editor from `defaultPhases` or derive from the preset when null:
  ```ts
      const dp = j.defaultPhases as { id: string; name: string }[] | null;
      setPhases(
        dp ??
          (j.defaultWithEstimation === false
            ? []
            : (j.defaultPokerMode ?? "advanced") === "simple"
              ? [{ id: "impl", name: "Estimation" }]
              : [
                  { id: "impl", name: "Implementation" },
                  { id: "review", name: "Review" },
                  { id: "test", name: "Test" },
                ]),
      );
  ```
  (extend the destructured type at line 69 with `defaultPhases: { id: string; name: string }[] | null`.)
- [ ] In `save` (83-90) send `defaultPhases: phases`:
  ```ts
      body: JSON.stringify({
        defaultPokerMode: mode,
        defaultWithEstimation: withEstimation,
        defaultPhases: withEstimation ? phases : [],
      }),
  ```
- [ ] Add the editor block in the JSX after the "Include time estimation" switch (after line 134), rendered only when `withEstimation`:
  ```tsx
  {withEstimation && (
    <div className="flex flex-col gap-2">
      <Label className="block">Estimation phases (SP always runs first)</Label>
      {phases.length === 0 && (
        <p className="text-xs text-muted-foreground">No phases — issues will estimate SP only.</p>
      )}
      {phases.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2">
          <Input
            value={p.name}
            onChange={(e) =>
              setPhases((ps) => ps.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))
            }
            disabled={!loaded}
          />
          <Button type="button" variant="ghost" size="sm" disabled={i === 0}
            onClick={() => setPhases((ps) => {
              const n = [...ps]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n;
            })}>↑</Button>
          <Button type="button" variant="ghost" size="sm" disabled={i === phases.length - 1}
            onClick={() => setPhases((ps) => {
              const n = [...ps]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; return n;
            })}>↓</Button>
          <Button type="button" variant="ghost" size="sm"
            onClick={() => setPhases((ps) => ps.filter((x) => x.id !== p.id))}>✕</Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="self-start"
        onClick={() => setPhases((ps) => [...ps, { id: crypto.randomUUID(), name: `Phase ${ps.length + 1}` }])}>
        Add phase
      </Button>
    </div>
  )}
  ```
- [ ] Run: `pnpm lint` and `pnpm exec tsc --noEmit` — expect the settings dialog to typecheck.
- [ ] Commit: `feat(settings): phase-list editor persisting defaultPhases` (with trailer).

---

## Task 9 — Pick-issue dialog: per-issue phase override

**Files**
- Modify: `components/poker/pick-issue-dialog.tsx` (props 32-40; state 42-48; reset effect 50-58; startVoting 60-74; JSX 110-146)
- Modify: `app/app/poker/[sessionId]/room.client.tsx` — pass `userDefaultPhases` into `PickIssueDialog` (445-456) and accept it as a prop (65-74); thread from `RoomPage`.

**Interfaces**

`PickIssueDialog` gains `defaultPhases: Phase[]`. Starting a vote posts `phases` alongside `mode`/`withEstimation`. When the moderator hasn't touched the editor, `phases` equals the resolved default; the mode `Select` becomes a convenience that reseeds the editor.

Steps:

- [ ] Add prop `defaultPhases: { id: string; name: string }[]` to `PickIssueDialog` (32-40) and state:
  ```ts
  const [phases, setPhases] = useState<{ id: string; name: string }[]>(defaultPhases);
  ```
- [ ] In the reset effect (50-58) add `setPhases(defaultPhases);` and include `defaultPhases` in the dep array.
- [ ] When the mode `Select` changes (line 116 `onValueChange`), reseed the editor to that preset so the two stay consistent:
  ```ts
  onValueChange={(v) => {
    const m = v as "simple" | "advanced";
    setMode(m);
    setPhases(m === "simple"
      ? [{ id: "impl", name: "Estimation" }]
      : [{ id: "impl", name: "Implementation" }, { id: "review", name: "Review" }, { id: "test", name: "Test" }]);
  }}
  ```
- [ ] `startVoting` (60-74) posts phases:
  ```ts
      body: JSON.stringify({ issueId, mode, withEstimation, phases: withEstimation ? phases : [] }),
  ```
- [ ] Add a compact phase editor (add/rename/reorder/remove — reuse the Task 8 markup, keyed by `p.id`, `crypto.randomUUID()` for new) inside the `!directMode` branch (after the "Include time estimation" switch, ~line 138), rendered only when `withEstimation`.
- [ ] In `room.client.tsx`: add prop `userDefaultPhases?: { id: string; name: string }[]` (default derived from `userDefaultMode`/`userDefaultWithEstimation`), pass `defaultPhases={userDefaultPhases}` to `PickIssueDialog` (line ~452), and also send `phases: userDefaultPhases` in `pickWithDefaults` (line 174-180). Thread `userDefaultPhases` from the server component `RoomPage` (read `user.defaultPhases`, derive when null).
- [ ] Run: `pnpm exec tsc --noEmit` + `pnpm lint` — expect pass for these two files.
- [ ] Commit: `feat(pick): per-issue phase-list override` (with trailer).

---

## Task 10 — Room rendering from the dynamic phase list

**Files**
- Modify: `components/poker/phase-stepper.tsx` (full rewrite)
- Modify: `components/poker/moderator-controls.tsx` (GotoTarget 13; ALL_TARGETS 15-20; activeTarget 26-32; available filter 71-80; Select 121-136; props 34-62)
- Modify: `app/app/poker/[sessionId]/room.client.tsx` (SnapshotIssue 32-43; BACK_TO_OPTIONS 58-63; kind/phase derivation 93-95; PhaseStepper usage 359-363; DurationInput label 383-388; ModeratorControls usage 410-425; completed-row Back-to select 323-348; gotoPhase 185-187)

**Interfaces**

`GotoTarget` becomes `number`. `PhaseStepper` renders `[SP, ...phases.map(name)]` and highlights `phaseIndex + 1`. All "Back to…" selects build options from the issue's snapshotted phase list (SP + phases), each value the phase index (`-1` for SP).

Steps:

- [ ] Rewrite `components/poker/phase-stepper.tsx`:
  ```tsx
  export function PhaseStepper({
    phases,
    phaseIndex,
    status,
  }: {
    phases: { id: string; name: string }[];
    phaseIndex: number; // -1 = SP
    status: string;
  }) {
    const steps = [{ key: "sp", label: "SP" }, ...phases.map((p) => ({ key: p.id, label: p.name }))];
    // Highlight index: SP -> 0, duration phase i -> i+1. Terminal states highlight nothing.
    const active = status === "voting" || status === "revealed" ? phaseIndex + 1 : -1;
    return (
      <div className="flex gap-2 justify-center text-xs">
        {steps.map((s, i) => (
          <span key={s.key} className={i === active ? "font-semibold text-foreground" : "text-muted-foreground"}>
            {s.label}
            {i < steps.length - 1 ? " → " : ""}
          </span>
        ))}
      </div>
    );
  }
  ```
- [ ] Rewrite `moderator-controls.tsx`:
  - Line 13: `export type GotoTarget = number;` (kept as a named export so `room.client.tsx` imports still resolve).
  - Replace `ALL_TARGETS`/`activeTarget` with props: the component now receives `phases: { id: string; name: string }[]` and `phaseIndex: number` (drop `mode`/`withEstimation`).
  - `isVoting`/`isRevealed` (68-69): `status === "voting"` / `status === "revealed"`.
  - Build the Back-to options from the phase list, hiding the current index:
    ```ts
    const targets: Array<{ value: number; label: string }> = [
      { value: -1, label: "Story points" },
      ...phases.map((p, i) => ({ value: i, label: p.name })),
    ];
    const available = targets.filter((t) => t.value !== phaseIndex);
    ```
  - The `Select` (121-136): `onValueChange={(v) => onGoto(Number(v))}`, `value=""`, options from `available` with `value={String(t.value)}`.
  - `onGoto: (target: number) => void`.
- [ ] Update `room.client.tsx`:
  - `SnapshotIssue` type (32-43): add `phases: { id: string; name: string }[] | null;` and `phaseIndex: number | null;`. `Snapshot.activeIssue` (49-54): add `phaseIndex: number;`.
  - Helper to resolve a row's phase list (add near top of component):
    ```ts
    const resolveRowPhases = (i: SnapshotIssue) =>
      i.phases ??
      (i.withEstimation === false
        ? []
        : (i.pokerMode ?? "advanced") === "simple"
          ? [{ id: "impl", name: "Estimation" }]
          : [
              { id: "impl", name: "Implementation" },
              { id: "review", name: "Review" },
              { id: "test", name: "Test" },
            ]);
    ```
  - Lines 93-95: derive `kind`/`phaseName` from the active estimate, not `phaseOfStatus`:
    ```ts
    const kind = active?.currentEstimate.kind ?? null;
    const activePhases = active ? resolveRowPhases(active.issue) : [];
    const phaseName =
      active && active.currentEstimate.phase
        ? (activePhases.find((p) => p.id === active.currentEstimate.phase)?.name ?? "")
        : "";
    const unit = kind === "duration" ? "h" : "";
    ```
    (Remove the `phaseOfStatus` import at line 22.)
  - PhaseStepper usage (359-363):
    ```tsx
    <PhaseStepper phases={activePhases} phaseIndex={active.issue.phaseIndex ?? -1} status={status} />
    ```
  - DurationInput label (387): `phaseLabel={phaseName}`.
  - ModeratorControls usage (410-425): drop `mode`/`withEstimation`, add `phases={activePhases}` and `phaseIndex={active.issue.phaseIndex ?? -1}`; `onGoto={(target) => gotoPhase(active.issue.id, target)}`.
  - `gotoPhase` (185-187): signature `(issueId: string, target: number)`; body posts `{ issueId, target }` (unchanged shape, numeric target).
  - Completed-row "Back to…" select (323-348): build options from `resolveRowPhases(i)`:
    ```tsx
    <Select value="" onValueChange={(v) => gotoPhase(i.id, Number(v))}>
      <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Back to…" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="-1">Story points</SelectItem>
        {resolveRowPhases(i).map((p, idx) => (
          <SelectItem key={p.id} value={String(idx)}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    ```
    (Delete the old `BACK_TO_OPTIONS` const at 58-63.)
- [ ] Run: `pnpm exec tsc --noEmit` + `pnpm lint` — expect the whole project to typecheck and lint clean.
- [ ] Run: `pnpm test` — expect all unit tests PASS.
- [ ] Commit: `feat(room): render phases/stepper/goto-targets from dynamic list` (with trailer).

---

## Task 11 — Integration tests + acceptance self-review

**Files**
- Modify: `tests/integration/goto-phase.test.ts` (assertions 104-108; `gotoPhase` target args)
- Modify: `tests/integration/simple-mode.test.ts` (assertions 60-64, 120-123)
- Test: `tests/integration/definable-phases.test.ts` (new — custom-phase end-to-end)
- Modify: `tests/e2e/happy-path.spec.ts` (comment line 82 wording only, optional)

**Interfaces** — Consumes: `pickIssue`, `reveal`, `submitFinal`, `skipPhase`, `gotoPhase`, `gatherSummary` from `lib/poker/service`.

Steps:

- [ ] Update `simple-mode.test.ts`: `summary.duration.impl.final` → `summary.phases[0].summary.final`; simple mode has ONE phase so assert `summary.phases.length === 1` and drop the `review`/`test` skipped assertions (they no longer exist in the list).
- [ ] Update `goto-phase.test.ts`: change any `gotoPhase(..., "sp"|"impl"|"review"|"test")` calls to numeric targets (`-1`/`0`/`1`/`2`); assertions `summary.duration.impl/review/test.final` → `summary.phases[0|1|2].summary.final`.
- [ ] Write `tests/integration/definable-phases.test.ts` covering the spec's acceptance path with a custom list `[Design, Build, QA]` (ids via `crypto.randomUUID()`), following the existing integration harness pattern (see `simple-mode.test.ts` for seed/setup helpers):
  - Seed a session + one issue; `pickIssue(sessionId, issueId, mod, { phases: [Design,Build,QA], withEstimation: true })`.
  - Assert the issue row snapshotted `phases` (3 entries) and `phaseIndex === -1`, `status === "voting"`.
  - Walk SP → Design → Build → QA: for each phase cast votes, `reveal`, `submitFinal`; assert `phaseIndex` progresses `-1 → 0 → 1 → 2` and lands `completed`.
  - `const s = await gatherSummary(issueId);` assert `s.phases.map((p) => p.name) === ["Design","Build","QA"]` and the summed duration equals the three finals.
  - Second case: change the moderator's `defaultPhases` AFTER pick, re-read the issue, assert its snapshotted `phases` is unchanged (mid-session default change doesn't alter a started issue).
- [ ] Run: `pnpm test:integration` — expect PASS.
- [ ] **Acceptance self-review** — confirm each spec criterion maps to green tests, fix any gap inline:
  - *Custom `[Design,Build,QA]` runs SP→Design→Build→QA→completed* → `definable-phases.test.ts` walk + `state-machine.test.ts` custom-list cases.
  - *Duration written back = sum of all phases* → `sync.ts` sum (Task 6) + `definable-phases.test.ts` `gatherSummary` sum.
  - *Changing default mid-session does not alter a started issue* → snapshot-on-pick (Task 4 `pickIssue`) + the second case in `definable-phases.test.ts`.
- [ ] Run full gate: `pnpm test && pnpm test:integration && pnpm exec tsc --noEmit && pnpm lint` — expect all PASS.
- [ ] Commit: `test(phases): integration coverage for custom phase lists + snapshot isolation` (with trailer).

---

## Type/name consistency checklist (verify before declaring done)

- `Phase`, `IssueStatus`, `IssueState`, `Action`, `PokerMode` are exported once from `lib/poker/state-machine.ts` and imported (never redefined) everywhere else.
- `reduceIssue(state, action, phases)` — every call site passes the resolved `phases` (grep: no 2-arg calls remain).
- `phaseInfo(state, phases)` replaces every former `phaseOfStatus` call (grep confirms `phaseOfStatus` is gone).
- `derivePhases(pokerMode, withEstimation)` — the ONLY place preset ids `impl`/`review`/`test` are minted; UI `resolveRowPhases`/reseed helpers mirror it exactly.
- `gotoPhase` target is `number` end-to-end: state-machine `Action`, `service.gotoPhase`, `/goto-phase` route Body, `GotoTarget`, both room selects.
- `SummaryInput` = `{ date, members, directEntry?, sp, phases: PhaseSummary[] }` — every producer (`gatherSummary`) and consumer (`formatSummaryComment`, `sync.ts`, `/summary` route) agrees.
- No string still parses `_voting`/`_revealed`/`dur_*` (grep `--include=*.ts --include=*.tsx` for those substrings returns only the migration SQL and the e2e comment).
