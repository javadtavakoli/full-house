import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues } from "@/lib/db/schema";
import { createSession, pickIssue, castVote, reveal, submitFinal } from "@/lib/poker/service";
import { syncIssue } from "@/lib/poker/sync";
import { eq } from "drizzle-orm";

const captured: { url: string; body: unknown }[] = [];

const fieldHandler = http.post("https://example.youtrack.cloud/api/issues/:key", async ({ request, params }) => {
  captured.push({ url: `field:${params.key}`, body: await request.json() });
  return HttpResponse.json({});
});
const commentHandler = http.post("https://example.youtrack.cloud/api/issues/:key/comments", async ({ request, params }) => {
  captured.push({ url: `comment:${params.key}`, body: await request.json() });
  return HttpResponse.json({ id: "c1" });
});

const server = setupServer(...handlers, fieldHandler, commentHandler);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers(...handlers, fieldHandler, commentHandler);
  captured.length = 0;
});
afterAll(() => server.close());

async function newUser(label: string) {
  const [u] = await testDb.insert(users).values({ youtrackId: label + Math.random(), email: label, displayName: label }).returning();
  return u!;
}

describe("syncIssue", () => {
  it("writes SP, duration, and a comment after a completed flow", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    await castVote(session.id, issue!.id, mod.id, 5);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 5);
    await castVote(session.id, issue!.id, mod.id, 8);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 8);
    await castVote(session.id, issue!.id, mod.id, 2);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 2);
    await castVote(session.id, issue!.id, mod.id, 2);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 2);

    captured.length = 0;
    const r = await syncIssue(issue!.id, "tok");
    expect(r).toEqual({ spField: { ok: true }, durationField: { ok: true }, comment: { ok: true } });
    const kinds = captured.map((c) => c.url.split(":")[0]);
    expect(kinds).toEqual(expect.arrayContaining(["field", "field", "comment"]));
    const comment = captured.find((c) => c.url.startsWith("comment"));
    expect(JSON.stringify(comment?.body)).toContain("Story Points: 5");
    expect(JSON.stringify(comment?.body)).toContain("Duration: 12h total");

    // Duration field is written as a Period payload ({ minutes: N }), not a bare number.
    // total = 8 + 2 + 2 = 12h → 720 minutes.
    const fieldBodies = captured
      .filter((c) => c.url.startsWith("field"))
      .map((c) => c.body as { customFields: Array<{ name: string; value: unknown }> });
    const durationBody = fieldBodies.find((b) =>
      b.customFields?.some((f) => f.name === "Estimation"),
    );
    expect(durationBody).toBeDefined();
    expect(durationBody!.customFields[0]!.value).toEqual({ minutes: 720 });
  });

  it("skips field writes when sp/all-duration are skipped, still posts comment", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    const { skipPhase } = await import("@/lib/poker/service");
    await pickIssue(session.id, issue!.id, mod.id);
    await skipPhase(session.id, issue!.id, mod.id); // skip sp
    await skipPhase(session.id, issue!.id, mod.id); // skip impl
    await skipPhase(session.id, issue!.id, mod.id); // skip review
    await skipPhase(session.id, issue!.id, mod.id); // skip test → completed

    captured.length = 0;
    await syncIssue(issue!.id, "tok");
    const kinds = captured.map((c) => c.url.split(":")[0]);
    expect(kinds).toEqual(["comment"]);
  });
});
