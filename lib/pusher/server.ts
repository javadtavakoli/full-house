import Pusher from "pusher";
import { env } from "@/lib/env";

const pusher = new Pusher({
  appId: env.PUSHER_APP_ID,
  key: env.PUSHER_KEY,
  secret: env.PUSHER_SECRET,
  cluster: env.PUSHER_CLUSTER,
  useTLS: true,
});

// When running E2E tests we deliberately suppress real Pusher traffic.
// The placeholder credentials would otherwise cause `trigger` to error
// (and the test environment has no real Pusher infra to deliver to).
const E2E = process.env.E2E_TEST === "1";

function channel(sessionId: string) {
  return `private-session-${sessionId}`;
}

export async function broadcastIssueChanged(sessionId: string, issueId: string) {
  if (E2E) return;
  await pusher.trigger(channel(sessionId), "issue-changed", { issueId });
}

export async function broadcastPhaseChanged(
  sessionId: string,
  issueId: string,
  status: string,
  round: number,
) {
  if (E2E) return;
  await pusher.trigger(channel(sessionId), "phase-changed", {
    issueId,
    status,
    round,
  });
}

export async function broadcastVoteCast(sessionId: string, issueId: string, userId: string) {
  if (E2E) return;
  await pusher.trigger(channel(sessionId), "vote-cast", { issueId, userId });
}

export async function broadcastVotesRevealed(sessionId: string, issueId: string) {
  if (E2E) return;
  await pusher.trigger(channel(sessionId), "votes-revealed", { issueId });
}

export async function broadcastFinalSubmitted(
  sessionId: string,
  issueId: string,
  finalValue: number,
) {
  if (E2E) return;
  await pusher.trigger(channel(sessionId), "final-submitted", { issueId, finalValue });
}

export async function broadcastPhaseSkipped(sessionId: string, issueId: string) {
  if (E2E) return;
  await pusher.trigger(channel(sessionId), "phase-skipped", { issueId });
}

export async function broadcastSessionEnded(sessionId: string) {
  if (E2E) return;
  await pusher.trigger(channel(sessionId), "session-ended", {});
}

export async function broadcastMemberUpdated(sessionId: string) {
  if (E2E) return;
  await pusher.trigger(channel(sessionId), "members-updated", {});
}

export const pusherForAuth = pusher;
