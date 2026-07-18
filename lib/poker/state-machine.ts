export type Phase = { id: string; name: string };

export type IssueStatus =
  | "pending"
  | "voting"
  | "revealed"
  | "completed"
  | "skipped";

export type PokerMode = "simple" | "advanced";

export type IssueState = {
  status: IssueStatus;
  // -1 = SP phase; 0..phases.length-1 = duration phase index.
  // Meaningful only while status is "voting" or "revealed".
  phaseIndex: number;
  round: number;
};

export type Action =
  | { type: "pick" }
  | { type: "reveal" }
  | { type: "submit" }
  | { type: "revote" }
  | { type: "skipPhase" }
  | { type: "skipIssue" }
  | { type: "restore" }
  // target: -1 = SP, 0..n-1 = duration phase index
  | { type: "gotoPhase"; target: number };

/**
 * Compute the state after leaving the current phase via submit or skipPhase.
 * Generic iteration: SP (-1) -> phase 0 -> phase 1 -> ... -> completed.
 * Entering a new phase resets round to 1; reaching completed preserves round.
 */
function advance(state: IssueState, phases: Phase[]): IssueState {
  const nextIndex = state.phaseIndex + 1; // -1 -> 0 -> 1 ...
  if (nextIndex >= phases.length) {
    return { status: "completed", phaseIndex: state.phaseIndex, round: state.round };
  }
  return { status: "voting", phaseIndex: nextIndex, round: 1 };
}

export function reduceIssue(state: IssueState, action: Action, phases: Phase[]): IssueState {
  switch (action.type) {
    case "pick":
      if (state.status !== "pending") throw new Error(`cannot pick from ${state.status}`);
      // Always start at SP (phaseIndex -1). SP runs even when the phase list is empty.
      return { status: "voting", phaseIndex: -1, round: 1 };
    case "reveal":
      if (state.status !== "voting") throw new Error(`cannot reveal from ${state.status}`);
      return { ...state, status: "revealed" };
    case "revote":
      if (state.status !== "revealed") throw new Error(`cannot revote from ${state.status}`);
      return { ...state, status: "voting", round: state.round + 1 };
    case "submit":
      if (state.status !== "revealed") throw new Error(`cannot submit from ${state.status}`);
      return advance(state, phases);
    case "skipPhase":
      if (state.status !== "voting" && state.status !== "revealed") {
        throw new Error(`cannot skipPhase from ${state.status}`);
      }
      return advance(state, phases);
    case "skipIssue":
      if (state.status === "completed") throw new Error("cannot skip a completed issue");
      return { ...state, status: "skipped" };
    case "restore":
      if (state.status !== "skipped") throw new Error(`cannot restore from ${state.status}`);
      return { status: "pending", phaseIndex: -1, round: 1 };
    case "gotoPhase": {
      if (state.status === "pending" || state.status === "skipped") {
        throw new Error(`cannot gotoPhase from ${state.status}`);
      }
      if (action.target < -1 || action.target >= phases.length) {
        throw new Error(`gotoPhase target ${action.target} out of range`);
      }
      // Reset round to 1 — the service computes the true (highest existing round + 1)
      // for the destination phase from the estimates table.
      return { status: "voting", phaseIndex: action.target, round: 1 };
    }
  }
}

/**
 * Resolve the current (kind, phaseId) from a status + phaseIndex against the
 * issue's snapshotted phase list. Returns nulls when not in an active phase.
 */
export function phaseInfo(
  state: { status: IssueStatus; phaseIndex: number },
  phases: Phase[],
): { kind: "sp" | "duration" | null; phaseId: string | null } {
  if (state.status !== "voting" && state.status !== "revealed") {
    return { kind: null, phaseId: null };
  }
  if (state.phaseIndex < 0) return { kind: "sp", phaseId: null };
  const p = phases[state.phaseIndex];
  return { kind: "duration", phaseId: p ? p.id : null };
}

export function isVotingStatus(s: IssueStatus): boolean {
  return s === "voting";
}

export function isRevealedStatus(s: IssueStatus): boolean {
  return s === "revealed";
}
