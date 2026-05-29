import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { listSprints, pickDefaultSprint } from "./sprints";

const server = setupServer(
  http.get("https://example.youtrack.cloud/api/agiles/B1/sprints", () =>
    HttpResponse.json([
      { id: "S46", name: "Sprint 46", archived: false, start: 1714521600000, finish: 1715731199000 },
      { id: "S47", name: "Sprint 47", archived: false, start: 1715731200000, finish: 1716940799000 },
      { id: "S45", name: "Sprint 45", archived: true, start: 0, finish: 1714521599000 },
    ]),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("listSprints", () => {
  it("returns sprints excluding archived", async () => {
    const sprints = await listSprints("token", "B1");
    expect(sprints.map((s) => s.id)).toEqual(["S46", "S47"]);
  });
});

describe("pickDefaultSprint", () => {
  it("returns the next sprint after the current one", () => {
    const now = 1715000000000;
    const picked = pickDefaultSprint(
      [
        { id: "S46", name: "Sprint 46", archived: false, start: 1714521600000, finish: 1715731199000 }, // current
        { id: "S47", name: "Sprint 47", archived: false, start: 1715731200000, finish: 1716940799000 }, // next
      ],
      now,
    );
    expect(picked?.id).toBe("S47");
  });

  it("falls back to the current sprint when no next one exists", () => {
    const now = 1715000000000;
    const picked = pickDefaultSprint(
      [{ id: "S46", name: "Sprint 46", archived: false, start: 1714521600000, finish: 1715731199000 }],
      now,
    );
    expect(picked?.id).toBe("S46");
  });
});
