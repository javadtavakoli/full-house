import { describe, it, expect } from "vitest";
import { reduceIssue, phaseInfo, type IssueState, type Phase } from "./state-machine";

const ADV: Phase[] = [
  { id: "impl", name: "Implementation" },
  { id: "review", name: "Review" },
  { id: "test", name: "Test" },
];
const SIMPLE: Phase[] = [{ id: "impl", name: "Estimation" }];
const NONE: Phase[] = [];
const CUSTOM2: Phase[] = [
  { id: "a", name: "Design" },
  { id: "b", name: "Build" },
];
const CUSTOM4: Phase[] = [
  { id: "a", name: "Design" },
  { id: "b", name: "Build" },
  { id: "c", name: "QA" },
  { id: "d", name: "Docs" },
];

const pending: IssueState = { status: "pending", phaseIndex: -1, round: 1 };

describe("state machine", () => {
  it("happy path SP -> impl -> review -> test -> completed (advanced)", () => {
    let s = reduceIssue(pending, { type: "pick" }, ADV);
    expect(s).toEqual({ status: "voting", phaseIndex: -1, round: 1 });
    s = reduceIssue(s, { type: "reveal" }, ADV);
    expect(s).toEqual({ status: "revealed", phaseIndex: -1, round: 1 });
    s = reduceIssue(s, { type: "submit" }, ADV);
    expect(s).toEqual({ status: "voting", phaseIndex: 0, round: 1 });
    s = reduceIssue(reduceIssue(s, { type: "reveal" }, ADV), { type: "submit" }, ADV);
    expect(s).toEqual({ status: "voting", phaseIndex: 1, round: 1 });
    s = reduceIssue(reduceIssue(s, { type: "reveal" }, ADV), { type: "submit" }, ADV);
    expect(s).toEqual({ status: "voting", phaseIndex: 2, round: 1 });
    s = reduceIssue(reduceIssue(s, { type: "reveal" }, ADV), { type: "submit" }, ADV);
    expect(s.status).toBe("completed");
  });

  it("simple (1 phase): SP -> impl -> completed", () => {
    let s = reduceIssue(pending, { type: "pick" }, SIMPLE);
    s = reduceIssue(reduceIssue(s, { type: "reveal" }, SIMPLE), { type: "submit" }, SIMPLE);
    expect(s).toEqual({ status: "voting", phaseIndex: 0, round: 1 });
    s = reduceIssue(reduceIssue(s, { type: "reveal" }, SIMPLE), { type: "submit" }, SIMPLE);
    expect(s.status).toBe("completed");
  });

  it("empty phase list (withEstimation=false): SP only -> completed", () => {
    let s = reduceIssue(pending, { type: "pick" }, NONE);
    expect(s).toEqual({ status: "voting", phaseIndex: -1, round: 1 });
    s = reduceIssue(reduceIssue(s, { type: "reveal" }, NONE), { type: "submit" }, NONE);
    expect(s.status).toBe("completed");
  });

  it("custom 2-phase list [Design, Build] runs SP -> 0 -> 1 -> completed", () => {
    let s = reduceIssue(pending, { type: "pick" }, CUSTOM2);
    s = reduceIssue(reduceIssue(s, { type: "reveal" }, CUSTOM2), { type: "submit" }, CUSTOM2);
    expect(s.phaseIndex).toBe(0);
    s = reduceIssue(reduceIssue(s, { type: "reveal" }, CUSTOM2), { type: "submit" }, CUSTOM2);
    expect(s.phaseIndex).toBe(1);
    s = reduceIssue(reduceIssue(s, { type: "reveal" }, CUSTOM2), { type: "submit" }, CUSTOM2);
    expect(s.status).toBe("completed");
  });

  it("custom 4-phase list visits every index then completes", () => {
    let s = reduceIssue(pending, { type: "pick" }, CUSTOM4);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      if (s.status === "completed") break;
      seen.push(s.phaseIndex);
      s = reduceIssue(reduceIssue(s, { type: "reveal" }, CUSTOM4), { type: "submit" }, CUSTOM4);
    }
    expect(seen).toEqual([-1, 0, 1, 2, 3]);
    expect(s.status).toBe("completed");
  });

  it("revote returns to same voting phase and increments round", () => {
    const s = reduceIssue({ status: "revealed", phaseIndex: -1, round: 1 }, { type: "revote" }, ADV);
    expect(s).toEqual({ status: "voting", phaseIndex: -1, round: 2 });
  });

  it("skipPhase advances past current phase without finalizing", () => {
    const s = reduceIssue({ status: "voting", phaseIndex: -1, round: 1 }, { type: "skipPhase" }, ADV);
    expect(s).toEqual({ status: "voting", phaseIndex: 0, round: 1 });
  });

  it("skipPhase from last phase completes the issue", () => {
    const s = reduceIssue({ status: "voting", phaseIndex: 0, round: 1 }, { type: "skipPhase" }, SIMPLE);
    expect(s.status).toBe("completed");
  });

  it("skipPhase from SP with empty list completes the issue", () => {
    const s = reduceIssue({ status: "voting", phaseIndex: -1, round: 1 }, { type: "skipPhase" }, NONE);
    expect(s.status).toBe("completed");
  });

  it("skip issue from any non-completed state moves to skipped", () => {
    const s = reduceIssue({ status: "revealed", phaseIndex: 1, round: 2 }, { type: "skipIssue" }, ADV);
    expect(s.status).toBe("skipped");
  });

  it("restore: skipped -> pending", () => {
    const s = reduceIssue({ status: "skipped", phaseIndex: -1, round: 2 }, { type: "restore" }, ADV);
    expect(s.status).toBe("pending");
  });

  it("restore from any other state throws", () => {
    for (const status of ["pending", "voting", "revealed", "completed"] as const) {
      expect(() => reduceIssue({ status, phaseIndex: -1, round: 1 }, { type: "restore" }, ADV)).toThrow();
    }
  });

  it("invalid transitions throw", () => {
    expect(() => reduceIssue(pending, { type: "reveal" }, ADV)).toThrow();
    expect(() => reduceIssue({ status: "voting", phaseIndex: -1, round: 1 }, { type: "submit" }, ADV)).toThrow();
  });

  describe("gotoPhase", () => {
    it("jumps from completed back to SP (target -1)", () => {
      const s = reduceIssue({ status: "completed", phaseIndex: 2, round: 1 }, { type: "gotoPhase", target: -1 }, ADV);
      expect(s).toEqual({ status: "voting", phaseIndex: -1, round: 1 });
    });
    it("jumps from SP forward to phase index 2", () => {
      const s = reduceIssue({ status: "voting", phaseIndex: -1, round: 1 }, { type: "gotoPhase", target: 2 }, ADV);
      expect(s).toEqual({ status: "voting", phaseIndex: 2, round: 1 });
    });
    it("rejects gotoPhase from pending and skipped", () => {
      expect(() => reduceIssue(pending, { type: "gotoPhase", target: -1 }, ADV)).toThrow();
      expect(() => reduceIssue({ status: "skipped", phaseIndex: -1, round: 1 }, { type: "gotoPhase", target: -1 }, ADV)).toThrow();
    });
    it("rejects a target beyond the phase list", () => {
      expect(() => reduceIssue({ status: "completed", phaseIndex: 0, round: 1 }, { type: "gotoPhase", target: 3 }, SIMPLE)).toThrow();
    });
  });

  describe("phaseInfo", () => {
    it("SP -> sp/null", () => {
      expect(phaseInfo({ status: "voting", phaseIndex: -1 }, ADV)).toEqual({ kind: "sp", phaseId: null });
    });
    it("duration phase -> duration/id", () => {
      expect(phaseInfo({ status: "revealed", phaseIndex: 1 }, ADV)).toEqual({ kind: "duration", phaseId: "review" });
    });
    it("non-voting -> null/null", () => {
      expect(phaseInfo({ status: "completed", phaseIndex: 2 }, ADV)).toEqual({ kind: null, phaseId: null });
    });
  });
});
