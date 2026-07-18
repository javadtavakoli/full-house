import { describe, it, expect } from "vitest";
import { formatSummaryComment, type SummaryInput } from "./comment-formatter";

const est = (final: number | null, votes: Array<[string, number]> = [], rounds = 1) => ({
  skipped: final === null,
  final,
  rounds,
  votes: votes.map(([user, value]) => ({ user, value })),
});

const baseInput: SummaryInput = {
  date: new Date("2026-05-25T10:00:00Z"),
  members: ["Javad", "Sara", "Reza"],
  sp: est(5, [["Javad", 5], ["Sara", 3], ["Reza", 5]]),
  phases: [
    { name: "Implementation", summary: est(8, [["Javad", 8], ["Sara", 4], ["Reza", 8]]) },
    { name: "Review", summary: est(2, [["Javad", 2], ["Sara", 1], ["Reza", 2]]) },
    { name: "Test", summary: est(2, [["Javad", 2], ["Sara", 2], ["Reza", 2]]) },
  ],
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
    const out = formatSummaryComment({ ...baseInput, sp: est(null) });
    expect(out).toContain("Story Points: skipped");
    expect(out).not.toMatch(/Story Points: \d/);
  });

  it("renders 'Duration: skipped' when all phases were skipped", () => {
    const out = formatSummaryComment({
      ...baseInput,
      phases: baseInput.phases.map((p) => ({ ...p, summary: est(null) })),
    });
    expect(out).toContain("Duration: skipped");
  });

  it("single-phase list renders inline with the phase name", () => {
    const out = formatSummaryComment({
      ...baseInput,
      phases: [{ name: "Estimation", summary: est(8, [["Javad", 8]]) }],
    });
    expect(out).toContain("Duration: 8h total (Estimation)");
  });

  it("empty phase list omits the duration section", () => {
    const out = formatSummaryComment({ ...baseInput, phases: [] });
    expect(out).not.toContain("Duration");
  });

  it("custom 4-phase list breaks down every phase", () => {
    const out = formatSummaryComment({
      ...baseInput,
      phases: [
        { name: "Design", summary: est(3) },
        { name: "Build", summary: est(5) },
        { name: "QA", summary: est(2) },
        { name: "Docs", summary: est(1) },
      ],
    });
    expect(out).toContain("Duration: 11h total");
    expect(out).toContain("Design: 3h");
    expect(out).toContain("Docs: 1h");
  });

  it("directEntry sums phases into a single line", () => {
    const out = formatSummaryComment({
      ...baseInput,
      directEntry: true,
      sp: est(5),
      phases: [{ name: "Implementation", summary: est(10) }],
    });
    expect(out).toContain("Story Points: 5  (entered directly)");
    expect(out).toContain("Duration: 10h  (entered directly)");
  });
});
