import { describe, it, expect } from "vitest";
import { suggestSp, suggestDuration } from "./suggestion";

describe("suggestSp", () => {
  it("returns null for empty votes", () => {
    expect(suggestSp([])).toBeNull();
  });
  it("returns the single mode", () => {
    expect(suggestSp([3, 3, 5])).toBe(3);
  });
  it("on a tie, picks the highest tied value", () => {
    expect(suggestSp([2, 2, 5, 5])).toBe(5);
  });
  it("when all unique, returns the median rounded up to a deck card", () => {
    // votes [1,2,3,5,8] → median 3 → deck has 3 → 3
    expect(suggestSp([1, 2, 3, 5, 8])).toBe(3);
    // votes [1,2,5,8] → median 3.5 → next deck card up = 5
    expect(suggestSp([1, 2, 5, 8])).toBe(5);
  });
});

describe("suggestDuration", () => {
  it("returns null for empty votes", () => {
    expect(suggestDuration([])).toBeNull();
  });
  it("rounds average to nearest 0.5", () => {
    expect(suggestDuration([4, 8])).toBe(6);
    expect(suggestDuration([4, 4, 8])).toBeCloseTo(5.5); // (4+4+8)/3 = 5.333 → 5.5
    expect(suggestDuration([1, 2, 3])).toBe(2); // (1+2+3)/3 = 2
    expect(suggestDuration([1.5, 2.5])).toBe(2);
  });
  it("single vote returns that value", () => {
    expect(suggestDuration([8])).toBe(8);
  });
});
