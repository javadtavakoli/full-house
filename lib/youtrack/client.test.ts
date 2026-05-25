import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { youtrackFetch } from "./client";

const calls: string[] = [];

const server = setupServer(
  http.get("https://example.youtrack.cloud/api/test", ({ request }) => {
    calls.push(request.headers.get("authorization") ?? "");
    return HttpResponse.json({ ok: true });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { server.resetHandlers(); calls.length = 0; });
afterAll(() => server.close());

describe("youtrackFetch", () => {
  it("attaches bearer token and parses JSON", async () => {
    const data = await youtrackFetch("/api/test", { token: "abc" });
    expect(data).toEqual({ ok: true });
    expect(calls[0]).toBe("Bearer abc");
  });

  it("throws YoutrackError on non-2xx", async () => {
    server.use(http.get("https://example.youtrack.cloud/api/x", () => HttpResponse.json({ error: "nope" }, { status: 403 })));
    await expect(youtrackFetch("/api/x", { token: "abc" })).rejects.toThrow(/403/);
  });
});
