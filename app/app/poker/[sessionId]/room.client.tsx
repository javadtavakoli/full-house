"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSessionRoom } from "@/hooks/use-session-room";
import { CardDeck } from "@/components/poker/card-deck";
import { VoterList } from "@/components/poker/voter-list";
import { RevealPanel } from "@/components/poker/reveal-panel";
import { ModeratorControls } from "@/components/poker/moderator-controls";
import { IssueCard } from "@/components/poker/issue-card";
import { RoundBadge } from "@/components/poker/round-badge";
import { PhaseStepper } from "@/components/poker/phase-stepper";
import { SP_DECK, DURATION_DECK } from "@/lib/poker/decks";
import { suggestSp, suggestDuration } from "@/lib/poker/suggestion";
import { phaseOfStatus } from "@/lib/poker/state-machine";
import { Button } from "@/components/ui/button";

type Snapshot = {
  session: { id: string; sprintName: string; createdBy: string; status: string };
  members: Array<{ userId: string; role: string; displayName: string; avatarUrl: string | null; lastSeenAt: string }>;
  issues: Array<{ id: string; issueKey: string; summary: string; description: string | null; status: string; position: number }>;
  activeIssue: {
    issue: { id: string; issueKey: string; summary: string; description: string | null; status: string };
    currentEstimate: { id: string; round: number; kind: "sp" | "duration"; phase: string | null };
    votes: Array<{ userId: string; value: number }>;
    isRevealed: boolean;
  } | null;
};

export function RoomClient({ initialSnapshot, currentUserId }: { initialSnapshot: Snapshot; currentUserId: string }) {
  const router = useRouter();
  const [snap, setSnap] = useState<Snapshot>(initialSnapshot);
  const [myCard, setMyCard] = useState<number | null>(null);

  const isModerator = snap.members.find((m) => m.userId === currentUserId)?.role === "moderator";
  const moderatorId = snap.members.find((m) => m.role === "moderator")?.userId ?? null;
  const active = snap.activeIssue;
  const status = active?.issue.status ?? "pending";
  const { kind, phase } = phaseOfStatus(status as never);
  const deck = kind === "duration" ? DURATION_DECK : SP_DECK;
  const unit = kind === "duration" ? "h" : "";

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/sessions/${snap.session.id}`);
    if (r.ok) setSnap(await r.json());
  }, [snap.session.id]);

  const onEvent = useCallback((e: { type: string }) => {
    if (e.type === "session-ended") {
      toast("Session ended");
      router.push("/app");
      return;
    }
    refresh();
  }, [refresh, router]);

  useSessionRoom(snap.session.id, onEvent);

  // reset card when active issue or phase changes
  useEffect(() => { setMyCard(null); }, [active?.issue.id, status]);

  const votedUserIds = useMemo(() => new Set((active?.votes ?? []).map((v) => v.userId)), [active]);
  const suggestion = useMemo(() => {
    if (!active || !active.isRevealed) return null;
    const vals = active.votes.map((v) => v.value);
    return kind === "sp" ? suggestSp(vals) : suggestDuration(vals);
  }, [active, kind]);

  async function post(path: string, body?: unknown) {
    const r = await fetch(`/api/sessions/${snap.session.id}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) toast.error(await r.text());
    return r.ok;
  }

  async function pick(issueId: string) { await post("/pick-issue", { issueId }); }
  async function vote(v: number) {
    if (!active) return;
    setMyCard(v);
    if (!(await post("/vote", { issueId: active.issue.id, value: v }))) setMyCard(null);
  }
  async function reveal() { if (active) await post("/reveal", { issueId: active.issue.id }); }
  async function submit(v: number) { if (active) await post("/submit", { issueId: active.issue.id, finalValue: v }); }
  async function revote() { if (active) await post("/revote", { issueId: active.issue.id }); }
  async function skipPhase() { if (active) await post("/skip-phase", { issueId: active.issue.id }); }
  async function skipIssue() { if (active) await post("/skip-issue", { issueId: active.issue.id }); }
  async function endSession() {
    const r = await fetch(`/api/sessions/${snap.session.id}`, { method: "DELETE" });
    if (!r.ok) toast.error(await r.text());
  }

  const pending = snap.issues.filter((i) => i.status === "pending");

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{snap.session.sprintName}</h1>
          <p className="text-xs text-muted-foreground">{snap.issues.length} issues · room: {snap.session.id.slice(0, 8)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(window.location.href); toast("URL copied"); }}>
          Copy invite URL
        </Button>
      </header>

      {!active && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Pick an issue</h2>
          {pending.length === 0 && <p className="text-sm text-muted-foreground">No more pending issues. <Button variant="link" onClick={endSession}>End session</Button></p>}
          <ul className="flex flex-col gap-1">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between border rounded px-3 py-2">
                <span>{i.issueKey} — {i.summary}</span>
                {isModerator && <Button size="sm" onClick={() => pick(i.id)}>Estimate</Button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {active && (
        <>
          <PhaseStepper status={status} />
          <IssueCard keyId={active.issue.issueKey} summary={active.issue.summary} description={active.issue.description} />
          <div className="flex items-center justify-center gap-2">
            <RoundBadge round={active.currentEstimate.round} />
          </div>
          <VoterList members={snap.members} votedUserIds={votedUserIds} moderatorId={moderatorId} />

          {!active.isRevealed && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground text-center mb-2">Your card{phase ? ` — ${phase}` : ""}</p>
              <CardDeck deck={deck} selected={myCard} onPick={vote} disabled={false} />
            </div>
          )}

          {active.isRevealed && (
            <RevealPanel votes={active.votes} suggestion={suggestion} members={snap.members} unit={unit as "" | "h"} />
          )}

          {isModerator && (
            <ModeratorControls
              status={status}
              suggestion={suggestion}
              onReveal={reveal}
              onSubmit={submit}
              onRevote={revote}
              onSkipPhase={skipPhase}
              onSkipIssue={skipIssue}
              onEnd={endSession}
            />
          )}
        </>
      )}
    </div>
  );
}
