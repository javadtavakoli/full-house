export type IssueStatus =
  | "pending"
  | "sp_voting"
  | "sp_revealed"
  | "dur_impl_voting"
  | "dur_impl_revealed"
  | "dur_review_voting"
  | "dur_review_revealed"
  | "dur_test_voting"
  | "dur_test_revealed"
  | "completed"
  | "skipped";

export type IssueState = { status: IssueStatus; round: number };

export type Action =
  | { type: "pick" }
  | { type: "reveal" }
  | { type: "submit" }
  | { type: "revote" }
  | { type: "skipPhase" }
  | { type: "skipIssue" };

const NEXT_AFTER_PHASE: Partial<Record<IssueStatus, IssueStatus>> = {
  sp_voting: "dur_impl_voting",
  sp_revealed: "dur_impl_voting",
  dur_impl_voting: "dur_review_voting",
  dur_impl_revealed: "dur_review_voting",
  dur_review_voting: "dur_test_voting",
  dur_review_revealed: "dur_test_voting",
  dur_test_voting: "completed",
  dur_test_revealed: "completed",
};

const REVEAL_OF: Partial<Record<IssueStatus, IssueStatus>> = {
  sp_voting: "sp_revealed",
  dur_impl_voting: "dur_impl_revealed",
  dur_review_voting: "dur_review_revealed",
  dur_test_voting: "dur_test_revealed",
};

const VOTING_OF: Partial<Record<IssueStatus, IssueStatus>> = {
  sp_revealed: "sp_voting",
  dur_impl_revealed: "dur_impl_voting",
  dur_review_revealed: "dur_review_voting",
  dur_test_revealed: "dur_test_voting",
};

export function reduceIssue(state: IssueState, action: Action): IssueState {
  switch (action.type) {
    case "pick":
      if (state.status !== "pending") throw new Error(`cannot pick from ${state.status}`);
      return { status: "sp_voting", round: 1 };
    case "reveal": {
      const next = REVEAL_OF[state.status];
      if (!next) throw new Error(`cannot reveal from ${state.status}`);
      return { ...state, status: next };
    }
    case "revote": {
      const next = VOTING_OF[state.status];
      if (!next) throw new Error(`cannot revote from ${state.status}`);
      return { status: next, round: state.round + 1 };
    }
    case "submit": {
      // submit is only valid on revealed states
      const next = NEXT_AFTER_PHASE[state.status];
      if (!next || !isRevealedStatus(state.status)) throw new Error(`cannot submit from ${state.status}`);
      return { status: next, round: next === "completed" ? state.round : 1 };
    }
    case "skipPhase": {
      const next = NEXT_AFTER_PHASE[state.status];
      if (!next) throw new Error(`cannot skipPhase from ${state.status}`);
      // entering a new phase resets the round counter
      return { status: next, round: next === "completed" ? state.round : 1 };
    }
    case "skipIssue":
      if (state.status === "completed") throw new Error("cannot skip a completed issue");
      return { status: "skipped", round: state.round };
  }
}

export function phaseOfStatus(s: IssueStatus): { kind: "sp" | "duration" | null; phase: "impl" | "review" | "test" | null } {
  switch (s) {
    case "sp_voting":
    case "sp_revealed":
      return { kind: "sp", phase: null };
    case "dur_impl_voting":
    case "dur_impl_revealed":
      return { kind: "duration", phase: "impl" };
    case "dur_review_voting":
    case "dur_review_revealed":
      return { kind: "duration", phase: "review" };
    case "dur_test_voting":
    case "dur_test_revealed":
      return { kind: "duration", phase: "test" };
    default:
      return { kind: null, phase: null };
  }
}

export function isVotingStatus(s: IssueStatus): boolean {
  return s.endsWith("_voting");
}

export function isRevealedStatus(s: IssueStatus): boolean {
  return s.endsWith("_revealed");
}
