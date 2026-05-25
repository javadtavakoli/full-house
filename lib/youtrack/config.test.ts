import { describe, it, expect } from "vitest";
import { youtrackConfig } from "./config";

describe("youtrackConfig", () => {
  it("returns a config object built from env", () => {
    const c = youtrackConfig();
    expect(c.baseUrl).toBe(process.env.YT_BASE_URL);
    expect(c.spField).toBe(process.env.YT_SP_FIELD);
    expect(c.doneStateNames.length).toBeGreaterThanOrEqual(1);
  });
});
