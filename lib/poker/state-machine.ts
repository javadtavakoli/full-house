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

export type PokerMode = "simple" | "advanced";

export type IssueState = {
  status: IssueStatus;
  round: number;
  mode: PokerMode;
  withEstimation: boolean;
};

export type Action =
  | { type: "pick" }
  | { type: "reveal" }
  | { type: "submit" }
  | { type: "revote" }
  | { type: "skipPhase" }
  | { type: "skipIssue" }
  | { type: "restore" }
  | { type: "gotoPhase"; target: "sp" | "impl" | "review" | "test" };

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

/**
 * Compute the destination status when leaving the current phase via submit or
 * skipPhase. Mode and withEstimation rule the branching:
 *   - withEstimation=false → SP is the only phase; submitting it completes the issue.
 *   - mode=simple          → SP → dur_impl (the single "Estimation" phase) → completed.
 *   - mode=advanced        → SP → impl → review → test → completed.
 */
function nextAfterPhase(state: IssueState): IssueStatus {
  switch (state.status) {
    case "sp_voting":
    case "sp_revealed":
      if (!state.withEstimation) return "completed";
      return "dur_impl_voting";
    case "dur_impl_voting":
    case "dur_impl_revealed":
      return state.mode === "simple" ? "completed" : "dur_review_voting";
    case "dur_review_voting":
    case "dur_review_revealed":
      // Only advanced mode reaches review.
      return "dur_test_voting";
    case "dur_test_voting":
    case "dur_test_revealed":
      return "completed";
    default:
      throw new Error(`no next phase from ${state.status}`);
  }
}

export function reduceIssue(state: IssueState, action: Action): IssueState {
  switch (action.type) {
    case "pick":
      if (state.status !== "pending") throw new Error(`cannot pick from ${state.status}`);
      return { ...state, status: "sp_voting", round: 1 };
    case "reveal": {
      const next = REVEAL_OF[state.status];
      if (!next) throw new Error(`cannot reveal from ${state.status}`);
      return { ...state, status: next };
    }
    case "revote": {
      const next = VOTING_OF[state.status];
      if (!next) throw new Error(`cannot revote from ${state.status}`);
      return { ...state, status: next, round: state.round + 1 };
    }
    case "submit": {
      // submit is only valid on revealed states
      if (!isRevealedStatus(state.status)) throw new Error(`cannot submit from ${state.status}`);
      const next = nextAfterPhase(state);
      return { ...state, status: next, round: next === "completed" ? state.round : 1 };
    }
    case "skipPhase": {
      const next = nextAfterPhase(state);
      // entering a new phase resets the round counter
      return { ...state, status: next, round: next === "completed" ? state.round : 1 };
    }
    case "skipIssue":
      if (state.status === "completed") throw new Error("cannot skip a completed issue");
      return { ...state, status: "skipped", round: state.round };
    case "restore":
      if (state.status !== "skipped") throw new Error(`cannot restore from ${state.status}`);
      return { ...state, status: "pending" };
    case "gotoPhase": {
      // Allowed from any state except `pending` (no active issue) and `skipped`.
      if (state.status === "pending" || state.status === "skipped") {
        throw new Error(`cannot gotoPhase from ${state.status}`);
      }
      const next = (
        action.target === "sp" ? "sp_voting" :
        action.target === "impl" ? "dur_impl_voting" :
        action.target === "review" ? "dur_review_voting" :
        "dur_test_voting"
      ) as IssueStatus;
      // Reset round to 1 — the service computes the true (highest existing round + 1)
      // for the destination phase from the estimates table.
      return { ...state, status: next, round: 1 };
    }
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
