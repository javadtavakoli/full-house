import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/poker/service";

// YouTrack collection endpoints are paginated: without `$top` the server
// returns only the first 42 items. The real workspace has 51 users and
// "shayan.sh20079" sits at position 45, so he fell off the voter picker.
const YT_DEFAULT_TOP = 42;
const workspaceUsers = Array.from({ length: 51 }, (_, i) =>
  i === 44
    ? { id: "u-shayan", login: "shayan.sh20079", name: "shayan.sh20079", fullName: "shayan.sh20079" }
    : { id: `u${i}`, login: `user${i}`, name: `User ${i}`, fullName: `User ${i}` },
);

const server = setupServer(
  http.get("https://example.youtrack.cloud/api/users", ({ request }) => {
    const url = new URL(request.url);
    const skip = Number(url.searchParams.get("$skip") ?? 0);
    const top = Number(url.searchParams.get("$top") ?? YT_DEFAULT_TOP);
    return HttpResponse.json(workspaceUsers.slice(skip, skip + top));
  }),
  ...handlers,
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("session candidates", () => {
  it("includes every workspace user, not just YouTrack's first page", async () => {
    const [mod] = await testDb
      .insert(users)
      .values({ youtrackId: "mod-" + Math.random(), email: "mod@x", displayName: "mod" })
      .returning();

    const session = await createSession({
      creatorUserId: mod!.id,
      token: "tok",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "Sprint 47",
    });

    const [row] = await testDb.select().from(sessions).where(eq(sessions.id, session.id));
    const candidates = row!.candidates as Array<{ login: string }>;
    expect(candidates).toHaveLength(51);
    expect(candidates.map((c) => c.login)).toContain("shayan.sh20079");
  });
});
