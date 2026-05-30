import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { listSprintIssues, updateIssueField } from "./issues";

const captured: { method: string; body: unknown }[] = [];

const server = setupServer(
  http.get("https://example.youtrack.cloud/api/agiles/B1/sprints/S47", () =>
    HttpResponse.json({
      issues: [
        {
          id: "1-100",
          idReadable: "FH-1242",
          summary: "Refactor billing webhook handler",
          description: "do the thing",
          customFields: [{ name: "State", value: { name: "Open" } }],
        },
        {
          id: "1-101",
          idReadable: "FH-1243",
          summary: "Done one",
          description: null,
          customFields: [{ name: "State", value: { name: "Done" } }],
        },
      ],
    }),
  ),
  http.post("https://example.youtrack.cloud/api/issues/FH-1242", async ({ request }) => {
    captured.push({ method: request.method, body: await request.json() });
    return HttpResponse.json({});
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { server.resetHandlers(); captured.length = 0; });
afterAll(() => server.close());

describe("listSprintIssues", () => {
  it("returns issues, filtering out done by configured state names", async () => {
    const issues = await listSprintIssues("token", "B1", "S47", { excludeStates: ["Done"] });
    expect(issues.map((i) => i.key)).toEqual(["FH-1242"]);
  });

  it("returns all issues when excludeStates is empty", async () => {
    const issues = await listSprintIssues("token", "B1", "S47", { excludeStates: [] });
    expect(issues.map((i) => i.key)).toEqual(["FH-1242", "FH-1243"]);
  });
});

describe("updateIssueField", () => {
  it("posts a customFields payload", async () => {
    await updateIssueField("token", "FH-1242", "Story Points", 5);
    expect(captured[0]?.method).toBe("POST");
    expect(captured[0]?.body).toEqual({
      customFields: [{ name: "Story Points", value: 5 }],
    });
  });
});
