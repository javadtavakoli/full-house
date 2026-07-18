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
