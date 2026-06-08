import { describe, it, expect } from "vitest";
import { formatSummaryComment, type SummaryInput } from "./comment-formatter";

const baseInput: SummaryInput = {
  date: new Date("2026-05-25T10:00:00Z"),
  members: ["Javad", "Sara", "Reza"],
  sp: { skipped: false, final: 5, rounds: 1, votes: [{ user: "Javad", value: 5 }, { user: "Sara", value: 3 }, { user: "Reza", value: 5 }] },
  duration: {
    impl: { skipped: false, final: 8, rounds: 1, votes: [{ user: "Javad", value: 8 }, { user: "Sara", value: 4 }, { user: "Reza", value: 8 }] },
    review: { skipped: false, final: 2, rounds: 1, votes: [{ user: "Javad", value: 2 }, { user: "Sara", value: 1 }, { user: "Reza", value: 2 }] },
    test: { skipped: false, final: 2, rounds: 1, votes: [{ user: "Javad", value: 2 }, { user: "Sara", value: 2 }, { user: "Reza", value: 2 }] },
  },
};

describe("formatSummaryComment", () => {
  it("includes date, members, SP and per-phase duration", () => {
    const out = formatSummaryComment(baseInput);
    expect(out).toContain("2026-05-25");
    expect(out).toContain("Javad, Sara, Reza");
    expect(out).toContain("Story Points: 5");
    expect(out).toContain("Duration: 12h total");
    expect(out).toContain("Implementation: 8h");
    expect(out).toContain("Review: 2h");
    expect(out).toContain("Test: 2h");
  });

  it("groups votes by value with voter names", () => {
    const out = formatSummaryComment(baseInput);
    expect(out).toContain("3 — Sara");
    expect(out).toContain("5 — Javad, Reza");
  });

  it("renders 'Story Points: skipped' when SP was skipped", () => {
    const out = formatSummaryComment({ ...baseInput, sp: { skipped: true, final: null, rounds: 0, votes: [] } });
    expect(out).toContain("Story Points: skipped");
    expect(out).not.toMatch(/Story Points: \d/);
  });

  it("renders 'Duration: skipped' when all three phases were skipped", () => {
    const out = formatSummaryComment({
      ...baseInput,
      duration: {
        impl: { skipped: true, final: null, rounds: 0, votes: [] },
        review: { skipped: true, final: null, rounds: 0, votes: [] },
        test: { skipped: true, final: null, rounds: 0, votes: [] },
      },
    });
    expect(out).toContain("Duration: skipped");
  });

  it("renders a single phase as skipped, others as numbers", () => {
    const out = formatSummaryComment({
      ...baseInput,
      duration: { ...baseInput.duration, review: { skipped: true, final: null, rounds: 0, votes: [] } },
    });
    expect(out).toContain("Review: skipped");
    expect(out).toContain("Duration: 10h total");
  });

  it("shows '(rounds: N)' when more than one round happened", () => {
    const out = formatSummaryComment({ ...baseInput, sp: { ...baseInput.sp, rounds: 2 } });
    expect(out).toMatch(/Story Points: 5\s+\(rounds: 2\)/);
  });

  it("simple mode renders a single Estimation line, no review/test breakdown", () => {
    const out = formatSummaryComment({
      ...baseInput,
      mode: "simple",
      withEstimation: true,
      duration: {
        impl: { skipped: false, final: 8, rounds: 1, votes: [{ user: "Javad", value: 8 }, { user: "Sara", value: 4 }, { user: "Reza", value: 8 }] },
        review: { skipped: true, final: null, rounds: 0, votes: [] },
        test: { skipped: true, final: null, rounds: 0, votes: [] },
      },
    });
    expect(out).toContain("Duration: 8h total (Estimation)");
    expect(out).not.toContain("Implementation:");
    expect(out).not.toContain("Review:");
    expect(out).not.toContain("Test:");
    // Per-voter breakdown is still emitted.
    expect(out).toContain("8 — Javad, Reza");
    expect(out).toContain("4 — Sara");
  });

  it("withEstimation=false omits the duration section entirely", () => {
    const out = formatSummaryComment({
      ...baseInput,
      mode: "simple",
      withEstimation: false,
      duration: {
        impl: { skipped: true, final: null, rounds: 0, votes: [] },
        review: { skipped: true, final: null, rounds: 0, votes: [] },
        test: { skipped: true, final: null, rounds: 0, votes: [] },
      },
    });
    expect(out).toContain("Story Points: 5");
    expect(out).not.toContain("Duration");
  });

  it("direct entry annotates lines and omits per-voter breakdown", () => {
    const out = formatSummaryComment({
      ...baseInput,
      directEntry: true,
      mode: "simple",
      withEstimation: true,
      sp: { skipped: false, final: 5, rounds: 1, votes: [] },
      duration: {
        impl: { skipped: false, final: 12, rounds: 1, votes: [] },
        review: { skipped: true, final: null, rounds: 0, votes: [] },
        test: { skipped: true, final: null, rounds: 0, votes: [] },
      },
    });
    expect(out).toContain("Story Points: 5  (entered directly)");
    expect(out).toContain("Duration: 12h  (entered directly)");
    expect(out).toContain("(values entered directly)");
    expect(out).not.toContain("— Javad");
  });

  it("direct entry with no duration entered → 'Duration: skipped'", () => {
    const out = formatSummaryComment({
      ...baseInput,
      directEntry: true,
      mode: "simple",
      withEstimation: true,
      sp: { skipped: false, final: 3, rounds: 1, votes: [] },
      duration: {
        impl: { skipped: true, final: null, rounds: 0, votes: [] },
        review: { skipped: true, final: null, rounds: 0, votes: [] },
        test: { skipped: true, final: null, rounds: 0, votes: [] },
      },
    });
    expect(out).toContain("Story Points: 3  (entered directly)");
    expect(out).toContain("Duration: skipped");
  });
});
