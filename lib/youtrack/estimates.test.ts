import { describe, it, expect } from "vitest";
import { readYtEstimates, ytEstimateColumns } from "./estimates";

const issue = (customFields: Array<{ name: string; value?: unknown }>) => ({ customFields });

describe("readYtEstimates", () => {
  it("reads numeric SP and period duration (minutes → hours)", () => {
    const r = readYtEstimates(
      issue([
        { name: "Story points", value: 5 },
        { name: "Estimation", value: { minutes: 390, presentation: "6h 30m" } },
      ]),
      "Story points",
      "Estimation",
    );
    expect(r).toEqual({ ytSp: 5, ytDurationHours: 6.5 });
  });

  it("treats a numeric duration field as hours", () => {
    expect(readYtEstimates(issue([{ name: "Hours", value: 3 }]), null, "Hours")).toEqual({ ytSp: null, ytDurationHours: 3 });
  });

  it("returns nulls when fields are empty, missing, or unknown", () => {
    expect(
      readYtEstimates(issue([{ name: "Story points", value: null }, { name: "Estimation", value: null }]), "Story points", "Estimation"),
    ).toEqual({ ytSp: null, ytDurationHours: null });
    expect(readYtEstimates(issue([{ name: "Story points", value: 3 }]), undefined, undefined)).toEqual({ ytSp: null, ytDurationHours: null });
    expect(readYtEstimates({ customFields: [] }, "Story points", "Estimation")).toEqual({ ytSp: null, ytDurationHours: null });
  });

  it("keeps zero as a real value", () => {
    expect(readYtEstimates(issue([{ name: "SP", value: 0 }]), "SP", null).ytSp).toBe(0);
  });
});

describe("ytEstimateColumns", () => {
  it("stringifies for numeric columns", () => {
    expect(ytEstimateColumns({ ytSp: 2, ytDurationHours: null })).toEqual({ ytSp: "2", ytDurationHours: null });
  });
});
