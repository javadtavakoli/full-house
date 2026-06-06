import { describe, it, expect } from "vitest";
import { SP_DECK, DURATION_DECK, isValidCard } from "./decks";

describe("decks", () => {
  it("SP deck is pure Fibonacci 1..21", () => {
    expect(SP_DECK).toEqual([1, 2, 3, 5, 8, 13, 21]);
  });

  it("duration deck is 1h..24h doubling", () => {
    expect(DURATION_DECK).toEqual([1, 2, 4, 8, 16, 24]);
  });

  it("validates membership for kind=sp", () => {
    expect(isValidCard(5, "sp")).toBe(true);
    expect(isValidCard(4, "sp")).toBe(false);
  });

  it("accepts any finite non-negative number for kind=duration", () => {
    expect(isValidCard(8, "duration")).toBe(true);
    expect(isValidCard(3, "duration")).toBe(true);
    expect(isValidCard(0, "duration")).toBe(true);
    expect(isValidCard(0.5, "duration")).toBe(true);
    expect(isValidCard(-1, "duration")).toBe(false);
    expect(isValidCard(1000, "duration")).toBe(false);
    expect(isValidCard(Number.NaN, "duration")).toBe(false);
    expect(isValidCard(Number.POSITIVE_INFINITY, "duration")).toBe(false);
  });
});
