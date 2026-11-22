import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { eq } from "drizzle-orm";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues } from "@/lib/db/schema";
import { createSession, enterDirectly, getRoomSnapshot } from "@/lib/poker/service";
import { resyncIssuesFromYouTrack } from "@/lib/poker/resync";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const field = (name: string, type: string, value: unknown) => ({
  name,
  projectCustomField: { field: { fieldType: { id: type } } },
  value,
});
const open = field("State", "state[1]", { name: "Open", isResolved: false });

function sprintWith(sp: number | null, minutes: number | null) {
  return http.get("https://example.youtrack.cloud/api/agiles/B1/sprints/S47", () =>
    HttpResponse.json({
      issues: [
        {
          id: "yt-1",
          idReadable: "FH-100",
          summary: "Foo",
          description: null,
          customFields: [
            field("Story Points", "integer", sp),
            field("Estimation", "period", minutes === null ? null : { minutes }),
            open,
          ],
        },
        {
          id: "yt-2",
          idReadable: "FH-101",
          summary: "Bar",
          description: null,
          customFields: [field("Story Points", "integer", null), field("Estimation", "period", null), open],
        },
      ],
    }),
  );
}

async function newUser(label: string) {
  const [u] = await testDb
    .insert(users)
    .values({ youtrackId: label + Math.random(), email: label, displayName: label })
    .returning();
  return u!;
}

describe("issue list SP / estimation values", () => {
  it("stores YouTrack values on create, refreshes them on resync", async () => {
    server.use(sprintWith(5, 390));
    const mod = await newUser("mod-yt-values");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });

    const rows = await testDb.select().from(issues).where(eq(issues.sessionId, session.id)).orderBy(issues.position);
    expect(Number(rows[0]!.ytSp)).toBe(5);
    expect(Number(rows[0]!.ytDurationHours)).toBe(6.5);
    expect(rows[1]!.ytSp).toBeNull();
    expect(rows[1]!.ytDurationHours).toBeNull();

    server.use(sprintWith(8, null));
    await resyncIssuesFromYouTrack(session.id, mod.id, "t");
    const [after] = await testDb.select().from(issues).where(eq(issues.youtrackIssueId, "yt-1"));
    expect(Number(after!.ytSp)).toBe(8);
    expect(after!.ytDurationHours).toBeNull();
  });

  it("snapshot exposes this session's decided values for completed issues only", async () => {
    server.use(sprintWith(null, null));
    const mod = await newUser("mod-result");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const rows = await testDb.select().from(issues).where(eq(issues.sessionId, session.id)).orderBy(issues.position);

    await enterDirectly(session.id, rows[0]!.id, mod.id, { sp: 3, durationTotal: 4.5 });

    const snap = await getRoomSnapshot(session.id);
    const done = snap!.issues.find((i) => i.id === rows[0]!.id)!;
    expect(done.result).toEqual({ sp: 3, durationHours: 4.5, phases: [{ name: "Implementation", hours: 4.5 }] });
    expect(done.syncStatus).toBeNull();
    expect(snap!.issues.find((i) => i.id === rows[1]!.id)!.result).toBeNull();
  });
});
