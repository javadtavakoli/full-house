import { describe, it, expect } from "vitest";
import { derivePhases } from "./state-machine";

describe("derivePhases", () => {
  it("advanced + withEstimation -> impl/review/test with stable ids", () => {
    expect(derivePhases("advanced", true)).toEqual([
      { id: "impl", name: "Implementation" },
      { id: "review", name: "Review" },
      { id: "test", name: "Test" },
    ]);
  });
  it("simple + withEstimation -> single Estimation phase with id 'impl'", () => {
    expect(derivePhases("simple", true)).toEqual([{ id: "impl", name: "Estimation" }]);
  });
  it("withEstimation=false -> empty list (SP only)", () => {
    expect(derivePhases("advanced", false)).toEqual([]);
    expect(derivePhases("simple", false)).toEqual([]);
  });
  it("null mode defaults to advanced; null withEstimation defaults to true", () => {
    expect(derivePhases(null, null)).toEqual([
      { id: "impl", name: "Implementation" },
      { id: "review", name: "Review" },
      { id: "test", name: "Test" },
    ]);
  });
});
