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

  it("validates membership for kind=duration", () => {
    expect(isValidCard(8, "duration")).toBe(true);
    expect(isValidCard(3, "duration")).toBe(false);
  });
});
