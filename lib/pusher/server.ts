import Pusher from "pusher";
import { env } from "@/lib/env";

const pusher = new Pusher({
  appId: env.PUSHER_APP_ID,
  key: env.PUSHER_KEY,
  secret: env.PUSHER_SECRET,
  cluster: env.PUSHER_CLUSTER,
  useTLS: true,
});

function channel(sessionId: string) {
  return `private-session-${sessionId}`;
}

export async function broadcastIssueChanged(sessionId: string, issueId: string) {
  await pusher.trigger(channel(sessionId), "issue-changed", { issueId });
}

export async function broadcastPhaseChanged(
  sessionId: string,
  issueId: string,
  status: string,
  round: number,
) {
  await pusher.trigger(channel(sessionId), "phase-changed", {
    issueId,
    status,
    round,
  });
}

export async function broadcastVoteCast(sessionId: string, issueId: string, userId: string) {
  await pusher.trigger(channel(sessionId), "vote-cast", { issueId, userId });
}

export async function broadcastVotesRevealed(sessionId: string, issueId: string) {
  await pusher.trigger(channel(sessionId), "votes-revealed", { issueId });
}

export async function broadcastFinalSubmitted(
  sessionId: string,
  issueId: string,
  finalValue: number,
) {
  await pusher.trigger(channel(sessionId), "final-submitted", { issueId, finalValue });
}

export async function broadcastPhaseSkipped(sessionId: string, issueId: string) {
  await pusher.trigger(channel(sessionId), "phase-skipped", { issueId });
}

export async function broadcastSessionEnded(sessionId: string) {
  await pusher.trigger(channel(sessionId), "session-ended", {});
}

export async function broadcastMemberUpdated(sessionId: string) {
  await pusher.trigger(channel(sessionId), "members-updated", {});
}

export const pusherForAuth = pusher;
