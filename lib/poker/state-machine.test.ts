import { describe, it, expect } from "vitest";
import { reduceIssue, IssueState } from "./state-machine";

const A = { mode: "advanced", withEstimation: true } as const;
const S = { mode: "simple", withEstimation: true } as const;

describe("state machine", () => {
  it("happy path SP → impl → review → test → completed (advanced + withEstimation)", () => {
    let s: IssueState = { status: "pending", round: 1, ...A };
    s = reduceIssue(s, { type: "pick" });
    expect(s.status).toBe("sp_voting");
    s = reduceIssue(s, { type: "reveal" });
    expect(s.status).toBe("sp_revealed");
    s = reduceIssue(s, { type: "submit" });
    expect(s.status).toBe("dur_impl_voting");
    s = reduceIssue(reduceIssue(s, { type: "reveal" }), { type: "submit" });
    expect(s.status).toBe("dur_review_voting");
    s = reduceIssue(reduceIssue(s, { type: "reveal" }), { type: "submit" });
    expect(s.status).toBe("dur_test_voting");
    s = reduceIssue(reduceIssue(s, { type: "reveal" }), { type: "submit" });
    expect(s.status).toBe("completed");
  });

  it("simple + withEstimation: SP → impl (Estimation) → completed", () => {
    let s: IssueState = { status: "pending", round: 1, ...S };
    s = reduceIssue(s, { type: "pick" });
    expect(s.status).toBe("sp_voting");
    s = reduceIssue(reduceIssue(s, { type: "reveal" }), { type: "submit" });
    expect(s.status).toBe("dur_impl_voting");
    s = reduceIssue(reduceIssue(s, { type: "reveal" }), { type: "submit" });
    // simple mode never visits review/test
    expect(s.status).toBe("completed");
  });

  it("simple + !withEstimation: SP only → completed", () => {
    let s: IssueState = { status: "pending", round: 1, mode: "simple", withEstimation: false };
    s = reduceIssue(s, { type: "pick" });
    s = reduceIssue(reduceIssue(s, { type: "reveal" }), { type: "submit" });
    expect(s.status).toBe("completed");
  });

  it("advanced + !withEstimation: SP only → completed", () => {
    let s: IssueState = { status: "pending", round: 1, mode: "advanced", withEstimation: false };
    s = reduceIssue(s, { type: "pick" });
    s = reduceIssue(reduceIssue(s, { type: "reveal" }), { type: "submit" });
    expect(s.status).toBe("completed");
  });

  it("revote returns to same voting state and increments round", () => {
    let s: IssueState = { status: "sp_revealed", round: 1, ...A };
    s = reduceIssue(s, { type: "revote" });
    expect(s).toEqual({ status: "sp_voting", round: 2, ...A });
  });

  it("skip phase advances past current phase without finalizing", () => {
    let s: IssueState = { status: "sp_voting", round: 1, ...A };
    s = reduceIssue(s, { type: "skipPhase" });
    expect(s.status).toBe("dur_impl_voting");
    expect(s.round).toBe(1);
  });

  it("skipPhase from simple-mode impl completes the issue", () => {
    let s: IssueState = { status: "dur_impl_voting", round: 1, ...S };
    s = reduceIssue(s, { type: "skipPhase" });
    expect(s.status).toBe("completed");
  });

  it("skipPhase from SP with !withEstimation completes the issue", () => {
    let s: IssueState = { status: "sp_voting", round: 1, mode: "advanced", withEstimation: false };
    s = reduceIssue(s, { type: "skipPhase" });
    expect(s.status).toBe("completed");
  });

  it("skip issue from any non-completed state moves to skipped", () => {
    let s: IssueState = { status: "dur_review_revealed", round: 2, ...A };
    s = reduceIssue(s, { type: "skipIssue" });
    expect(s.status).toBe("skipped");
  });

  it("invalid transitions throw", () => {
    expect(() => reduceIssue({ status: "pending", round: 1, ...A }, { type: "reveal" })).toThrow();
    expect(() => reduceIssue({ status: "sp_voting", round: 1, ...A }, { type: "submit" })).toThrow();
  });

  it("skip on a *_revealed state advances to next phase", () => {
    let s: IssueState = { status: "dur_impl_revealed", round: 1, ...A };
    s = reduceIssue(s, { type: "skipPhase" });
    expect(s.status).toBe("dur_review_voting");
  });

  it("submit on last phase reveal goes to completed", () => {
    let s: IssueState = { status: "dur_test_revealed", round: 1, ...A };
    s = reduceIssue(s, { type: "submit" });
    expect(s.status).toBe("completed");
  });

  describe("gotoPhase", () => {
    it("jumps from completed back to sp_voting", () => {
      const s = reduceIssue({ status: "completed", round: 1, ...A }, { type: "gotoPhase", target: "sp" });
      expect(s).toEqual({ status: "sp_voting", round: 1, ...A });
    });

    it("jumps from dur_review_revealed back to sp_voting", () => {
      const s = reduceIssue(
        { status: "dur_review_revealed", round: 3, ...A },
        { type: "gotoPhase", target: "sp" },
      );
      expect(s).toEqual({ status: "sp_voting", round: 1, ...A });
    });

    it("jumps from sp_voting forward to dur_test_voting", () => {
      const s = reduceIssue(
        { status: "sp_voting", round: 1, ...A },
        { type: "gotoPhase", target: "test" },
      );
      expect(s).toEqual({ status: "dur_test_voting", round: 1, ...A });
    });

    it("targets each destination correctly", () => {
      const base: IssueState = { status: "completed", round: 1, ...A };
      expect(reduceIssue(base, { type: "gotoPhase", target: "impl" }).status).toBe("dur_impl_voting");
      expect(reduceIssue(base, { type: "gotoPhase", target: "review" }).status).toBe("dur_review_voting");
      expect(reduceIssue(base, { type: "gotoPhase", target: "test" }).status).toBe("dur_test_voting");
    });

    it("rejects gotoPhase from pending", () => {
      expect(() =>
        reduceIssue({ status: "pending", round: 1, ...A }, { type: "gotoPhase", target: "sp" }),
      ).toThrow();
    });

    it("rejects gotoPhase from skipped", () => {
      expect(() =>
        reduceIssue({ status: "skipped", round: 1, ...A }, { type: "gotoPhase", target: "sp" }),
      ).toThrow();
    });
  });
});
