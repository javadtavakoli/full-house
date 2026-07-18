# Voter Re-join Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make voter names in `VoterPicker` always re-pickable so a voter who signed out (or lost their cookie) can click their own name and re-enter the room with a valid session.

**Architecture:** The permanent `disabled`/gray-out driven by `claimedYoutrackIds` is removed from the candidate button; only the transient `isPending` ("joining…") disabled state remains, plus a non-blocking informational "in room" hint on names that already have a member row. Re-selecting a name re-runs the idempotent `signIn("voter")` flow (member insert is `onConflictDoNothing`; the sign-in re-establishes the JWT cookie). A live Playwright E2E test exercises the full join → real sign-out → re-click loop to also rule out a second cause: a `next-auth@5.0.0-beta.31` `signOut → signIn({ redirect:false })` silent no-op. A conditional Task 3 fixes that no-op if the loop bounces.

**Tech Stack:** Next.js 15 App Router, next-auth 5 beta, React 19, Playwright e2e, vitest.

## Global Constraints
- Use pnpm, never npm (translate any npm command to pnpm).
- Tests: `pnpm test` (vitest unit), `pnpm test:e2e` (playwright). Typecheck: `pnpm exec tsc --noEmit`. Lint: `pnpm lint`.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 1 — VoterPicker: names always clickable, "in room" hint is non-blocking

**Files**
- Test (Create): `components/poker/voter-picker.test.tsx`
- Modify: `components/poker/voter-picker.tsx` (`pick()` at lines ~46-61; candidate `<button>` + hint at lines ~83-124)

**Interfaces**
- Consumes: `VoterPicker` props `{ sessionId, sessionName, candidates: Candidate[], claimedYoutrackIds: string[] }` (unchanged).
- Produces: a claimed candidate renders an **enabled** button (no `opacity-50`, no `cursor-not-allowed`), shows an informational "in room" hint, and clicking it calls `signIn("voter", { sessionId, youtrackId, redirect: false })`.

> Test-design note: assert only durable behavior — button enabled, "in room" hint present, and `signIn` called with the right args. Do NOT assert on the post-`signIn` navigation mechanism (`router.refresh` vs `window.location`), because Task 3 may change it. Keeping this test navigation-agnostic lets it survive Task 3 untouched.

Steps:

- [ ] Write the failing component test. Create `components/poker/voter-picker.test.tsx` with exactly:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signIn = vi.fn().mockResolvedValue({ error: undefined });
const refresh = vi.fn();

vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { VoterPicker, type Candidate } from "./voter-picker";

const candidates: Candidate[] = [
  { youtrackId: "yt-alice", login: "alice", name: "Alice", fullName: "Alice Anderson" },
  { youtrackId: "yt-bob", login: "bob", name: "Bob", fullName: "Bob Baker" },
];

describe("VoterPicker", () => {
  beforeEach(() => {
    signIn.mockClear();
    refresh.mockClear();
  });

  it("keeps a claimed name enabled and shows a non-blocking 'in room' hint", () => {
    render(
      <VoterPicker
        sessionId="s1"
        sessionName="Sprint 47"
        candidates={candidates}
        claimedYoutrackIds={["yt-alice"]}
      />,
    );
    const alice = screen.getByRole("button", { name: /Alice Anderson/ });
    expect(alice).toBeEnabled();
    expect(alice.className).not.toContain("opacity-50");
    expect(alice.className).not.toContain("cursor-not-allowed");
    expect(screen.getByText("in room")).toBeInTheDocument();
    expect(screen.queryByText("already joined")).not.toBeInTheDocument();
  });

  it("re-runs signIn('voter') when a claimed name is clicked", async () => {
    const user = userEvent.setup();
    render(
      <VoterPicker
        sessionId="s1"
        sessionName="Sprint 47"
        candidates={candidates}
        claimedYoutrackIds={["yt-alice"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Alice Anderson/ }));
    expect(signIn).toHaveBeenCalledWith("voter", {
      sessionId: "s1",
      youtrackId: "yt-alice",
      redirect: false,
    });
  });

  it("leaves an unclaimed name selectable (parallel joins)", () => {
    render(
      <VoterPicker
        sessionId="s1"
        sessionName="Sprint 47"
        candidates={candidates}
        claimedYoutrackIds={["yt-alice"]}
      />,
    );
    expect(screen.getByRole("button", { name: /Bob Baker/ })).toBeEnabled();
  });
});
```

- [ ] Confirm `@testing-library/user-event` is available; install if the import fails to resolve. Run:
```bash
pnpm ls @testing-library/user-event || pnpm add -D @testing-library/user-event
```
Expected: either a version line, or a successful add of the dev dependency.

- [ ] Run the new test and watch it FAIL. Run:
```bash
pnpm exec vitest run components/poker/voter-picker.test.tsx
```
Expected: FAIL — the first test fails because the claimed button is currently `disabled` (`opacity-50 cursor-not-allowed`) and renders "already joined" rather than "in room"; the second fails because `pick()` early-returns for claimed candidates so `signIn` is never called.

- [ ] Apply the minimal fix — remove the early-return guard in `pick()`. In `components/poker/voter-picker.tsx`, replace:
```tsx
  async function pick(c: Candidate) {
    if (claimed.has(c.youtrackId)) return;
    setError(null);
```
with:
```tsx
  async function pick(c: Candidate) {
    setError(null);
```

- [ ] Apply the minimal fix — button no longer permanently disabled, no gray-out. Replace:
```tsx
              <button
                type="button"
                disabled={isClaimed || isPending || pending !== null}
                onClick={() => pick(c)}
                className={`w-full flex items-center gap-3 border rounded px-3 py-2 text-left ${
                  isClaimed
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-accent"
                }`}
              >
```
with:
```tsx
              <button
                type="button"
                disabled={isPending || pending !== null}
                onClick={() => pick(c)}
                className="w-full flex items-center gap-3 border rounded px-3 py-2 text-left hover:bg-accent disabled:opacity-60"
              >
```

- [ ] Apply the minimal fix — replace the blocking "already joined" hint with a non-blocking "in room" hint. Replace:
```tsx
                {isClaimed && (
                  <span className="text-xs text-muted-foreground">
                    already joined
                  </span>
                )}
```
with:
```tsx
                {isClaimed && !isPending && (
                  <span className="text-xs text-muted-foreground">
                    in room
                  </span>
                )}
```

- [ ] Run the test and watch it PASS. Run:
```bash
pnpm exec vitest run components/poker/voter-picker.test.tsx
```
Expected: PASS — all three tests green.

- [ ] Typecheck and lint. Run:
```bash
pnpm exec tsc --noEmit && pnpm lint
```
Expected: no errors. (`claimed` / `useMemo` are still used to compute `isClaimed`, so no unused-var lint error.)

- [ ] Commit. Run:
```bash
git add components/poker/voter-picker.tsx components/poker/voter-picker.test.tsx package.json pnpm-lock.yaml
git commit -m "fix(poker): keep voter names re-pickable in VoterPicker

Remove the permanent claimed-name gray-out; keep only the transient
joining state and a non-blocking 'in room' hint. Re-selecting a name
re-runs the idempotent signIn('voter') flow.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — E2E: live join → sign out → re-join loop (the second-cause guard)

**Files**
- Modify: `app/api/test/seed-session/route.ts` (add optional `candidates` to the request body + set `sessions.candidates`)
- Test (Create): `tests/e2e/voter-rejoin.spec.ts`

**Interfaces**
- Consumes: test-only `/api/test/seed-session` (E2E-gated) and `/api/test/sign-in-as`; the real `signIn("voter")` credentials flow and the real `UserMenu` `signOut`.
- Produces: a Playwright spec that fails cleanly (bounded timeout) if a returning voter cannot re-enter the room. That failure is the go/no-go signal for Task 3.

> This extends test-only infrastructure (`/api/test/seed-session`), not any production API or schema — the feature itself requires **no schema or API change** (spec Feature 1). Candidates are needed because the voter `signIn` callback (`lib/auth/config.ts:36`) validates `youtrackId` against `session.candidates`; without them the whole join flow dead-ends.

Steps:

- [ ] Write the failing E2E spec. Create `tests/e2e/voter-rejoin.spec.ts` with exactly:
```ts
import { test, expect } from "@playwright/test";

// Live end-to-end guard for the voter re-join fix (spec Feature 1).
//   moderator signs in (test bypass) and seeds a session whose candidate
//     list contains two voters that are NOT yet members
//   voter (fresh context, no cookie) opens the room, sees the picker, clicks
//     their own name → lands in the room
//   voter SIGNS OUT VIA THE REAL UserMenu (not clearCookies — see note below)
//   voter opens the room again, sees their name with an 'in room' hint that is
//     still clickable, clicks it → re-enters the room with a valid session
//
// The real signOut is load-bearing: the spec's second cause is a
// next-auth@5.0.0-beta.31 signOut -> signIn({redirect:false}) silent no-op.
// A fresh-context first join does NOT reproduce it; only a real signOut
// followed by a real name-click does. Do NOT swap this for context.clearCookies()
// to de-flake — that would make the test pass while silently defeating its
// entire purpose (and Task 3 would never trigger).
//
// youtrackIds are unique to this spec (fullyParallel:true shares the users table).

test("voter can re-join after signing out; unrelated names stay selectable", async ({ browser }) => {
  const modContext = await browser.newContext();
  const voterContext = await browser.newContext();
  const modPage = await modContext.newPage();
  const voterPage = await voterContext.newPage();

  // 1. Moderator auth bypass.
  const modSignIn = await modPage.request.post("/api/test/sign-in-as", {
    data: { youtrackId: "e2e-rejoin-mod", name: "Rejoin Mod", email: "rmod@x" },
  });
  expect(modSignIn.ok()).toBeTruthy();

  // 2. Seed a session with two candidates, neither pre-joined as a member.
  const seedRes = await modPage.request.post("/api/test/seed-session", {
    data: {
      moderatorYoutrackId: "e2e-rejoin-mod",
      candidates: [
        { youtrackId: "e2e-rejoin-voter", login: "rvoter", name: "Rejoin Voter", fullName: "Rejoin Voter" },
        { youtrackId: "e2e-rejoin-other", login: "rother", name: "Other Voter", fullName: "Other Voter" },
      ],
    },
  });
  expect(seedRes.ok()).toBeTruthy();
  const { sessionId } = (await seedRes.json()) as { sessionId: string };
  expect(sessionId).toBeTruthy();

  // 3. Voter (no cookie) opens the room → picker.
  await voterPage.goto(`/app/poker/${sessionId}`);
  await expect(voterPage.getByRole("button", { name: /Rejoin Voter/ })).toBeVisible();
  // Acceptance criterion 2: an unrelated name is also selectable.
  await expect(voterPage.getByRole("button", { name: /Other Voter/ })).toBeEnabled();

  // 4. First join: click own name, wait for the auth callback, land in room.
  const firstCallback = voterPage.waitForResponse(
    (r) => r.url().includes("/api/auth/callback/voter") && r.request().method() === "POST",
  );
  await voterPage.getByRole("button", { name: /Rejoin Voter/ }).click();
  expect((await firstCallback).ok()).toBeTruthy();
  await expect(voterPage.getByText(/FH-1/)).toBeVisible({ timeout: 15_000 });

  // 5. Real sign-out via the UserMenu (avatar trigger is the only <button> in the nav;
  //    Radix portals the dropdown, so the menuitem lives outside <nav>).
  await voterPage.locator("nav button").click();
  await voterPage.getByRole("menuitem", { name: "Sign out" }).click();
  await voterPage.waitForURL("**/", { timeout: 15_000 });

  // 6. Re-open the room → picker again; own name now carries the 'in room' hint
  //    but is still clickable.
  await voterPage.goto(`/app/poker/${sessionId}`);
  const ownName = voterPage.getByRole("button", { name: /Rejoin Voter/ });
  await expect(ownName).toBeVisible();
  await expect(ownName).toBeEnabled();
  await expect(voterPage.getByText("in room")).toBeVisible();

  // 7. Re-join: click own name again → land back in the room with a valid session.
  //    A bounce back to the picker fails here within the bounded timeout (the
  //    second-cause signal for Task 3).
  const secondCallback = voterPage.waitForResponse(
    (r) => r.url().includes("/api/auth/callback/voter") && r.request().method() === "POST",
  );
  await ownName.click();
  expect((await secondCallback).ok()).toBeTruthy();
  await expect(voterPage.getByText(/FH-1/)).toBeVisible({ timeout: 15_000 });
});
```

- [ ] Run the spec BEFORE touching the seed route and watch it FAIL. Run:
```bash
pnpm test:e2e voter-rejoin
```
Expected: FAIL at step 3 — the seeded session has no `candidates`, so the picker renders "No match." and `getByRole("button", { name: /Rejoin Voter/ })` never appears. This confirms the seed route must set candidates.

- [ ] Extend the test-only seed route to accept candidates. In `app/api/test/seed-session/route.ts`, replace the schema:
```ts
const Body = z.object({
  moderatorYoutrackId: z.string(),
  voterYoutrackIds: z.array(z.string()).optional(),
});
```
with:
```ts
const Body = z.object({
  moderatorYoutrackId: z.string(),
  voterYoutrackIds: z.array(z.string()).optional(),
  candidates: z
    .array(
      z.object({
        youtrackId: z.string(),
        login: z.string(),
        name: z.string(),
        fullName: z.string(),
      }),
    )
    .optional(),
});
```

- [ ] Persist the candidates onto the seeded session. In the same file, replace the session insert:
```ts
  const [session] = await db
    .insert(sessions)
    .values({
      createdBy: mod.id,
      boardId: "B1",
      sprintId: "S47",
      sprintName: "Sprint 47",
    })
    .returning();
```
with:
```ts
  const [session] = await db
    .insert(sessions)
    .values({
      createdBy: mod.id,
      boardId: "B1",
      sprintId: "S47",
      sprintName: "Sprint 47",
      candidates: body.candidates ?? [],
    })
    .returning();
```

- [ ] Typecheck the seed route change. Run:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors. (If `sessions.candidates` is typed as a specific JSON shape and rejects the plain object array, cast the value with `as typeof sessions.$inferInsert["candidates"]` at the insert site — confirm the column name/shape in `lib/db/schema.ts` first.)

- [ ] Run the spec again. This is the LIVE re-join verification. Run:
```bash
pnpm test:e2e voter-rejoin
```
Expected: **PASS** — voter joins, signs out, re-clicks their name, and lands back on `FH-1`. **If it FAILS specifically at step 7** (second callback OK but `FH-1` never appears, i.e. the voter bounces back to the picker), the `signIn({ redirect:false })` no-op has reproduced — proceed to Task 3. Any other failure is a normal debugging loop (use superpowers:systematic-debugging).

- [ ] Commit (only once the spec passes, or once you have confirmed a step-7 bounce that routes you to Task 3). Run:
```bash
git add app/api/test/seed-session/route.ts tests/e2e/voter-rejoin.spec.ts
git commit -m "test(poker): e2e guard for voter sign-out -> re-join loop

Seed route accepts candidates; new spec drives join -> real UserMenu
sign-out -> re-click own name -> back in room, and asserts unrelated
names stay selectable.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — CONTINGENCY: fix the `signIn({ redirect:false })` silent no-op

**Run this task ONLY IF** Task 2's spec fails at step 7: the `/api/auth/callback/voter` POST returns OK (so `signIn` "succeeded") yet the voter stays on the picker and `FH-1` never renders within the timeout. This is the `next-auth@5.0.0-beta.31` `signOut → signIn({ redirect:false })` no-op described in the spec's second-cause guard. If Task 2 already passed, SKIP this task entirely.

**Files**
- Modify: `components/poker/voter-picker.tsx` (`pick()`, the success branch at lines ~55-60)

**Interfaces**
- Consumes: `signIn("voter", …)` result; `sessionId` prop.
- Produces: after a successful sign-in, the voter is guaranteed to land in the room with the new session cookie applied. The fix lives in `pick()`, which is the single code path for both first-join and re-join, so it covers both cases.

Steps:

- [ ] Confirm the failure is the no-op, not something else. Re-read the retained Playwright trace for the failing run:
```bash
pnpm test:e2e voter-rejoin --trace on
```
Expected: the trace shows the step-7 `callback/voter` request returning 200 while the page URL stays on the room path still showing the picker (no server re-render picked up the new cookie). If instead the callback errored, this is NOT the no-op — debug that first and do not apply the change below.

- [ ] Apply the fix — force a full-document navigation after a successful sign-in so the server re-renders `RoomPage` with the freshly-set cookie, instead of relying on `router.refresh()`. In `components/poker/voter-picker.tsx`, replace the success tail of `pick()`:
```tsx
    setPending(null);
    if (res?.error) {
      setError("Could not join. Try again or contact the moderator.");
      return;
    }
    router.refresh();
  }
```
with:
```tsx
    setPending(null);
    if (res?.error) {
      setError("Could not join. Try again or contact the moderator.");
      return;
    }
    // next-auth 5 beta's signIn({ redirect:false }) can resolve without a
    // client-side navigation, leaving router.refresh() to re-render the server
    // component before the new session cookie is observed. A full-document
    // navigation guarantees RoomPage re-runs getServerUser() with the cookie set.
    window.location.assign(`/app/poker/${sessionId}`);
  }
```

- [ ] Remove the now-unused `useRouter` import and hook (only if `router` is no longer referenced anywhere in the file). Remove the line `import { useRouter } from "next/navigation";` and the line `const router = useRouter();`. Confirm no other `router.` usage remains first:
```bash
grep -n "router" components/poker/voter-picker.tsx
```
Expected after edit: no matches. (If any `router.` usage remains, keep the import/hook and skip this removal step.)

- [ ] Re-run the component test — it must still PASS untouched (Task 1 deliberately does not assert on the navigation mechanism). Run:
```bash
pnpm exec vitest run components/poker/voter-picker.test.tsx
```
Expected: PASS — the `jsdom` environment provides a no-op `window.location.assign`, and the assertions only cover button state, hint text, and `signIn` args.

- [ ] Re-run the E2E loop and confirm it now PASSES. Run:
```bash
pnpm test:e2e voter-rejoin
```
Expected: PASS — the voter re-enters the room after sign-out; the bounce is gone.

- [ ] Typecheck and lint. Run:
```bash
pnpm exec tsc --noEmit && pnpm lint
```
Expected: no errors (no unused `useRouter` import remains).

- [ ] Commit. Run:
```bash
git add components/poker/voter-picker.tsx
git commit -m "fix(poker): force navigation after voter signIn to defeat beta no-op

next-auth@5.0.0-beta.31 signIn({redirect:false}) could resolve without a
client navigation, so router.refresh() re-rendered before the new session
cookie was observed and the voter bounced back to the picker. Navigate the
full document to /app/poker/[id] so RoomPage re-runs with the cookie set.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review — Feature 1 coverage map

- **Decision "names always re-pickable" / remove `disabled={isClaimed || …}`** → Task 1 (button `disabled` reduced to `isPending || pending !== null`; `opacity-50 cursor-not-allowed` removed).
- **Keep transient "joining…" disabled state** → Task 1 (`isPending` retained in `disabled` and in the "joining…" span).
- **Keep informational non-blocking "in room" hint** → Task 1 ("already joined" → "in room", rendered but never disabling; asserted enabled + hint-present in the component test).
- **Re-selecting runs idempotent `signIn("voter")`, member insert `onConflictDoNothing`** → unchanged in code; exercised live by Task 2 (the `signIn` callback at `lib/auth/config.ts:57-60` already uses `onConflictDoNothing`, no edit needed).
- **No schema or API change** → honored; only test-only `/api/test/seed-session` is extended, called out explicitly as test infrastructure.
- **Second-cause guard: live join → sign out → click own name → land in room with valid session** → Task 2 (real `UserMenu` sign-out, bounded-timeout `FH-1` assertion as the discriminating pass/fail).
- **Contingency IF the no-op reproduces: force navigation / verify session after `signIn`** → Task 3, gated on the exact step-7 bounce, with concrete `window.location.assign` code in `pick()` (covers first-join and re-join alike).
- **Acceptance criterion 1 (signed-out voter re-enters with a working session)** → Task 2 steps 5-7.
- **Acceptance criterion 2 (two different visitors can both join; unrelated names stay selectable)** → Task 1 third test + Task 2 step 3 (`Other Voter` asserted enabled).
