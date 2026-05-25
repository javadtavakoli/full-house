import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { listBoards } from "./boards";

const server = setupServer(
  http.get("https://example.youtrack.cloud/api/agiles", () =>
    HttpResponse.json([
      { id: "B1", name: "Mobile" },
      { id: "B2", name: "Backend" },
    ]),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("listBoards", () => {
  it("returns id+name pairs", async () => {
    const boards = await listBoards("token");
    expect(boards).toEqual([
      { id: "B1", name: "Mobile" },
      { id: "B2", name: "Backend" },
    ]);
  });
});
