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
  it("snaps average to nearest deck card", () => {
    // avg = (4+8)/2 = 6 → deck cards 4, 8 — round up on tie → 8
    expect(suggestDuration([4, 8])).toBe(8);
    // avg = (4+4+8)/3 = 5.33 → distance to 4 is 1.33, to 8 is 2.67 → 4
    expect(suggestDuration([4, 4, 8])).toBe(4);
  });
  it("single vote = that value if it's a deck card", () => {
    expect(suggestDuration([8])).toBe(8);
  });
  it("rounds up on a tie distance", () => {
    // avg = 3 → distance to 2 is 1, to 4 is 1 → tie → 4
    expect(suggestDuration([2, 4])).toBe(4);
  });
});
