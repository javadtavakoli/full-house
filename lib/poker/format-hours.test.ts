import { describe, it, expect } from "vitest";
import { formatHours } from "./format-hours";

describe("formatHours", () => {
  it("formats whole, fractional and sub-hour values", () => {
    expect(formatHours(6)).toBe("6h");
    expect(formatHours(1.5)).toBe("1h 30m");
    expect(formatHours(0.25)).toBe("15m");
    expect(formatHours(0)).toBe("0m");
    expect(formatHours(12.5)).toBe("12h 30m");
  });
});
