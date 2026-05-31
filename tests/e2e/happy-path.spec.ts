import { test, expect, type Page } from "@playwright/test";

// E2E happy path:
//   moderator + voter sign in (test bypass)
//   moderator seeds a session (test bypass — skips YouTrack fetch)
//   moderator picks the issue, both vote, moderator reveals + submits
//   moderator skips three duration phases (impl / review / test) → completed
//   moderator sees "No more pending issues"
//
// Realtime is disabled in E2E mode (placeholder Pusher creds would 401);
// every state-changing action is therefore followed by an explicit
// `page.reload()` to force a fresh snapshot. We `waitForResponse` first
// to serialize action + reload and avoid races (especially for the three
// skip-phase calls).

async function postAndReload(page: Page, sessionId: string, action: string, click: () => Promise<void>) {
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes(`/api/sessions/${sessionId}/${action}`) && r.request().method() === "POST",
  );
  await click();
  const res = await responsePromise;
  expect(res.ok(), `${action} returned ${res.status()}`).toBeTruthy();
  await page.reload();
}

test("happy path: mod + voter vote, reveal, submit, skip three duration phases, complete", async ({ browser }) => {
  const modContext = await browser.newContext();
  const voterContext = await browser.newContext();

  const modPage = await modContext.newPage();
  const voterPage = await voterContext.newPage();

  // 1. Auth bypass — sets the session cookie on each context
  const modSignIn = await modPage.request.post("/api/test/sign-in-as", {
    data: { youtrackId: "e2e-mod", name: "Mod", email: "mod@x" },
  });
  expect(modSignIn.ok()).toBeTruthy();
  const voterSignIn = await voterPage.request.post("/api/test/sign-in-as", {
    data: { youtrackId: "e2e-voter", name: "Voter", email: "voter@x" },
  });
  expect(voterSignIn.ok()).toBeTruthy();

  // 2. Seed a session directly (skips YouTrack sprint-fetch)
  const seedRes = await modPage.request.post("/api/test/seed-session", {
    data: { moderatorYoutrackId: "e2e-mod", voterYoutrackIds: ["e2e-voter"] },
  });
  expect(seedRes.ok()).toBeTruthy();
  const { sessionId } = (await seedRes.json()) as { sessionId: string };
  expect(sessionId).toBeTruthy();

  // 3. Moderator enters the room. Verify the seeded issue and Estimate
  // control are visible.
  await modPage.goto(`/app/poker/${sessionId}`);
  await expect(modPage.getByText(/FH-1/)).toBeVisible();
  await expect(modPage.getByRole("button", { name: "Estimate" })).toBeVisible();

  // 4. Moderator picks the issue → reload to see the deck.
  await postAndReload(modPage, sessionId, "pick-issue", async () => {
    await modPage.getByRole("button", { name: "Estimate" }).click();
  });

  // Cross-context check: voter now lands on the room and sees the active
  // issue without needing realtime, because the initial snapshot already
  // contains the picked issue.
  await voterPage.goto(`/app/poker/${sessionId}`);
  await expect(voterPage.getByText(/FH-1/)).toBeVisible();

  // 5. Both cast a vote of 5 (SP phase). The card buttons render the value
  // as plain text in a <button>, so the exact-name match works.
  await postAndReload(modPage, sessionId, "vote", async () => {
    await modPage.getByRole("button", { name: "5", exact: true }).click();
  });
  await postAndReload(voterPage, sessionId, "vote", async () => {
    await voterPage.getByRole("button", { name: "5", exact: true }).click();
  });

  // 6. Reveal → reload to see "Submit 5".
  await postAndReload(modPage, sessionId, "reveal", async () => {
    await modPage.getByRole("button", { name: "Reveal votes" }).click();
  });

  // 7. Submit 5 → enters dur_impl_voting.
  await postAndReload(modPage, sessionId, "submit", async () => {
    await modPage.getByRole("button", { name: /Submit 5/ }).click();
  });

  // 8. Skip the three duration phases (impl → review → test → completed).
  // Each click is serialized through postAndReload to avoid concurrent
  // skip-phase transactions racing on issue status.
  for (let i = 0; i < 3; i++) {
    await postAndReload(modPage, sessionId, "skip-phase", async () => {
      await modPage.getByRole("button", { name: "Skip phase" }).click();
    });
  }

  // 9. With the only issue completed, there are no more pending issues.
  await expect(modPage.getByText(/No more pending issues/)).toBeVisible({ timeout: 10_000 });
});
