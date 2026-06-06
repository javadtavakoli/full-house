import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSession, joinSession, getSessionView } from "@/lib/poker/service";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function newUser(name: string) {
  const [u] = await testDb.insert(users).values({
    youtrackId: name + "-" + Math.random(),
    email: `${name}@x`,
    displayName: name,
  }).returning();
  return u!;
}

describe("session lifecycle", () => {
  it("creates a session via the real createSession, seeds issues, and joins members", async () => {
    const moderator = await newUser("mod");
    const voter = await newUser("voter");

    const session = await createSession({
      creatorUserId: moderator.id,
      token: "tok",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "Sprint 47",
    });

    await joinSession(session.id, voter.id);

    const view = await getSessionView(session.id);
    expect(view).not.toBeNull();
    expect(view!.issues.map((i) => i.issueKey).sort()).toEqual(["FH-100", "FH-101"]);
    expect(view!.members.length).toBe(2);
    expect(view!.members.find((m) => m.userId === moderator.id)?.role).toBe("moderator");
    expect(view!.members.find((m) => m.userId === voter.id)?.role).toBe("voter");
  });

  it("discovers SP, duration field, and done state names from the sprint and persists them on the session", async () => {
    const moderator = await newUser("mod-discover");

    const session = await createSession({
      creatorUserId: moderator.id,
      token: "tok",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "Sprint 47",
    });

    const [row] = await testDb.select().from(sessions).where(eq(sessions.id, session.id)).limit(1);
    expect(row).toBeDefined();
    expect(row!.spField).toBe("Story Points");
    expect(row!.durationField).toBe("Estimation");
    // The msw default sprint contains only Open-state issues, so doneStateNames discovery
    // returns nothing and we land on the env fallback (vitest-setup sets "Done,Won't fix").
    expect(row!.doneStateNames).toEqual(["Done", "Won't fix"]);
    // Candidates fetched from /users are persisted as JSONB.
    expect(row!.candidates).toEqual([
      { youtrackId: "u1", login: "alice", name: "Alice", fullName: "Alice Smith" },
      { youtrackId: "u2", login: "bob", name: "Bob", fullName: "Bob Jones" },
    ]);
  });

  it("filters out issues whose state is in the discovered done set", async () => {
    const moderator = await newUser("mod-filter");

    // Override the default sprint handler with a payload that includes one Done issue.
    server.use(
      http.get("https://example.youtrack.cloud/api/agiles/B1/sprints/S47", () =>
        HttpResponse.json({
          issues: [
            {
              id: "yt-open", idReadable: "FH-200", summary: "Open one", description: null,
              customFields: [
                { name: "Story Points", projectCustomField: { field: { fieldType: { id: "integer" } } }, value: 3 },
                { name: "State", projectCustomField: { field: { fieldType: { id: "state[1]" } } }, value: { name: "In Progress", isResolved: false } },
              ],
            },
            {
              id: "yt-done", idReadable: "FH-201", summary: "Done one", description: null,
              customFields: [
                { name: "Story Points", projectCustomField: { field: { fieldType: { id: "integer" } } }, value: 5 },
                { name: "State", projectCustomField: { field: { fieldType: { id: "state[1]" } } }, value: { name: "Fixed", isResolved: true } },
              ],
            },
            {
              id: "yt-other", idReadable: "FH-202", summary: "Another open", description: null,
              customFields: [
                { name: "Story Points", projectCustomField: { field: { fieldType: { id: "integer" } } }, value: 2 },
                { name: "State", projectCustomField: { field: { fieldType: { id: "state[1]" } } }, value: { name: "Open", isResolved: false } },
              ],
            },
          ],
        }),
      ),
    );

    const session = await createSession({
      creatorUserId: moderator.id,
      token: "tok",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "Sprint 47",
    });

    const view = await getSessionView(session.id);
    expect(view).not.toBeNull();
    expect(view!.issues.map((i) => i.issueKey).sort()).toEqual(["FH-200", "FH-202"]);

    const [row] = await testDb.select().from(sessions).where(eq(sessions.id, session.id)).limit(1);
    expect(row!.doneStateNames).toEqual(["Fixed"]);
  });
});
