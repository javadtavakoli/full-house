import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues } from "@/lib/db/schema";
import { createSession, joinSession, pickIssue, castVote, reveal } from "@/lib/poker/service";
import { eq } from "drizzle-orm";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function newUser(name: string) {
  const [u] = await testDb.insert(users).values({ youtrackId: name + Math.random(), email: name, displayName: name }).returning();
  return u!;
}

describe("voting", () => {
  it("pick → vote → reveal", async () => {
    const mod = await newUser("mod");
    const voter = await newUser("voter");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    await joinSession(session.id, voter.id);
    const [firstIssue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    expect(firstIssue).toBeDefined();

    const picked = await pickIssue(session.id, firstIssue!.id, mod.id);
    expect(picked.status).toBe("sp_voting");

    await castVote(session.id, firstIssue!.id, mod.id, 5);
    await castVote(session.id, firstIssue!.id, voter.id, 3);

    const revealed = await reveal(session.id, firstIssue!.id, mod.id);
    expect(revealed.status).toBe("sp_revealed");
  });

  it("non-moderator cannot pick", async () => {
    const mod = await newUser("mod2");
    const voter = await newUser("voter2");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    await joinSession(session.id, voter.id);
    const [firstIssue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await expect(pickIssue(session.id, firstIssue!.id, voter.id)).rejects.toThrow(/moderator/);
  });

  it("invalid SP card rejected", async () => {
    const mod = await newUser("mod3");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [firstIssue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, firstIssue!.id, mod.id);
    await expect(castVote(session.id, firstIssue!.id, mod.id, 4)).rejects.toThrow(/invalid sp card/);
  });
});
