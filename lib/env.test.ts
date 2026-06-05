import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("env", () => {
  const original = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("YT_") || k.startsWith("PUSHER_") || k === "DATABASE_URL" || k === "AUTH_SECRET" || k === "NEXT_PUBLIC_SITE_URL") {
        delete process.env[k];
      }
    }
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("parses a complete valid env", async () => {
    process.env.DATABASE_URL = "postgres://u:p@h/db";
    process.env.AUTH_SECRET = "x".repeat(32);
    process.env.YT_BASE_URL = "https://example.youtrack.cloud";
    process.env.YT_TOKEN_ENC_KEY = Buffer.alloc(32).toString("base64");
    process.env.YT_SP_FIELD = "Story Points";
    process.env.YT_DURATION_FIELD = "Estimation";
    process.env.YT_DONE_STATE_NAMES = "Done,Won't fix";
    process.env.PUSHER_APP_ID = "1";
    process.env.PUSHER_KEY = "k";
    process.env.PUSHER_SECRET = "s";
    process.env.PUSHER_CLUSTER = "eu";
    process.env.NEXT_PUBLIC_PUSHER_KEY = "k";
    process.env.NEXT_PUBLIC_PUSHER_CLUSTER = "eu";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const { env } = await import("./env");
    expect(env.YT_DONE_STATE_NAMES).toEqual(["Done", "Won't fix"]);
    expect(env.YT_BASE_URL).toBe("https://example.youtrack.cloud");
  });

  it("throws when DATABASE_URL is missing", async () => {
    await expect(import("./env")).rejects.toThrow(/DATABASE_URL/);
  });
});
