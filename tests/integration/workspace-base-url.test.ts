import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, sessions, oauthAccounts } from "@/lib/db/schema";
import { createSession } from "@/lib/poker/service";
import { encrypt } from "@/lib/encryption";
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

describe("multi-tenant workspace URL", () => {
  it("createSession writes the moderator's oauth workspace URL into the session row", async () => {
    const mod = await newUser("mod-tenant");
    // Use a host distinct from env.YT_BASE_URL so the assertion can only pass
    // if createSession actually read from oauth_accounts.workspaceBaseUrl.
    // We register MSW handlers for the new host so the YT calls succeed.
    const workspaceBaseUrl = "https://acme.youtrack.cloud";
    expect(workspaceBaseUrl).not.toBe(process.env.YT_BASE_URL);

    server.use(
      http.get("https://acme.youtrack.cloud/api/users", () =>
        HttpResponse.json([
          { id: "u1", login: "alice", name: "Alice", fullName: "Alice Smith" },
        ]),
      ),
      http.get(
        "https://acme.youtrack.cloud/api/agiles/B1/sprints/S47",
        () =>
          HttpResponse.json({
            issues: [
              {
                id: "yt-acme-1",
                idReadable: "ACME-1",
                summary: "Foo",
                description: null,
                customFields: [
                  {
                    name: "Story Points",
                    projectCustomField: { field: { fieldType: { id: "integer" } } },
                    value: null,
                  },
                  {
                    name: "State",
                    projectCustomField: { field: { fieldType: { id: "state[1]" } } },
                    value: { name: "Open", isResolved: false },
                  },
                ],
              },
            ],
          }),
      ),
    );

    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await testDb.insert(oauthAccounts).values({
      userId: mod.id,
      provider: "youtrack",
      accessToken: encrypt("pat-token", process.env.YT_TOKEN_ENC_KEY!),
      refreshToken: null,
      expiresAt: farFuture,
      scope: "PAT",
      workspaceBaseUrl,
    });

    const session = await createSession({
      creatorUserId: mod.id,
      token: "pat-token",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });

    const [row] = await testDb
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.workspaceBaseUrl).toBe(workspaceBaseUrl);
  });

  it("falls back to env.YT_BASE_URL when the moderator has no oauth row", async () => {
    const mod = await newUser("mod-tenant-fallback");

    const session = await createSession({
      creatorUserId: mod.id,
      token: "tok",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "S47",
    });

    const [row] = await testDb
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.workspaceBaseUrl).toBe(process.env.YT_BASE_URL);
  });
});
