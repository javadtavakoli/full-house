import { describe, it, expect } from "vitest";
import { reduceIssue, IssueState } from "./state-machine";

describe("state machine", () => {
  it("happy path SP → impl → review → test → completed", () => {
    let s: IssueState = { status: "pending", round: 1 };
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

  it("revote returns to same voting state and increments round", () => {
    let s: IssueState = { status: "sp_revealed", round: 1 };
    s = reduceIssue(s, { type: "revote" });
    expect(s).toEqual({ status: "sp_voting", round: 2 });
  });

  it("skip phase advances past current phase without finalizing", () => {
    let s: IssueState = { status: "sp_voting", round: 1 };
    s = reduceIssue(s, { type: "skipPhase" });
    expect(s.status).toBe("dur_impl_voting");
    expect(s.round).toBe(1);
  });

  it("skip issue from any non-completed state moves to skipped", () => {
    let s: IssueState = { status: "dur_review_revealed", round: 2 };
    s = reduceIssue(s, { type: "skipIssue" });
    expect(s.status).toBe("skipped");
  });

  it("invalid transitions throw", () => {
    expect(() => reduceIssue({ status: "pending", round: 1 }, { type: "reveal" })).toThrow();
    expect(() => reduceIssue({ status: "sp_voting", round: 1 }, { type: "submit" })).toThrow();
  });

  it("skip on a *_revealed state advances to next phase", () => {
    let s: IssueState = { status: "dur_impl_revealed", round: 1 };
    s = reduceIssue(s, { type: "skipPhase" });
    expect(s.status).toBe("dur_review_voting");
  });

  it("submit on last phase reveal goes to completed", () => {
    let s: IssueState = { status: "dur_test_revealed", round: 1 };
    s = reduceIssue(s, { type: "submit" });
    expect(s.status).toBe("completed");
  });

  describe("gotoPhase", () => {
    it("jumps from completed back to sp_voting", () => {
      const s = reduceIssue({ status: "completed", round: 1 }, { type: "gotoPhase", target: "sp" });
      expect(s).toEqual({ status: "sp_voting", round: 1 });
    });

    it("jumps from dur_review_revealed back to sp_voting", () => {
      const s = reduceIssue(
        { status: "dur_review_revealed", round: 3 },
        { type: "gotoPhase", target: "sp" },
      );
      expect(s).toEqual({ status: "sp_voting", round: 1 });
    });

    it("jumps from sp_voting forward to dur_test_voting", () => {
      const s = reduceIssue(
        { status: "sp_voting", round: 1 },
        { type: "gotoPhase", target: "test" },
      );
      expect(s).toEqual({ status: "dur_test_voting", round: 1 });
    });

    it("targets each destination correctly", () => {
      const base = { status: "completed" as const, round: 1 };
      expect(reduceIssue(base, { type: "gotoPhase", target: "impl" }).status).toBe("dur_impl_voting");
      expect(reduceIssue(base, { type: "gotoPhase", target: "review" }).status).toBe("dur_review_voting");
      expect(reduceIssue(base, { type: "gotoPhase", target: "test" }).status).toBe("dur_test_voting");
    });

    it("rejects gotoPhase from pending", () => {
      expect(() =>
        reduceIssue({ status: "pending", round: 1 }, { type: "gotoPhase", target: "sp" }),
      ).toThrow();
    });

    it("rejects gotoPhase from skipped", () => {
      expect(() =>
        reduceIssue({ status: "skipped", round: 1 }, { type: "gotoPhase", target: "sp" }),
      ).toThrow();
    });
  });
});
