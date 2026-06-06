"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSessionRoom } from "@/hooks/use-session-room";
import { usePresencePing } from "@/hooks/use-presence-ping";
import { CardDeck } from "@/components/poker/card-deck";
import { VoterList } from "@/components/poker/voter-list";
import { RevealPanel } from "@/components/poker/reveal-panel";
import { ModeratorControls } from "@/components/poker/moderator-controls";
import { IssueCard } from "@/components/poker/issue-card";
import { RoundBadge } from "@/components/poker/round-badge";
import { PhaseStepper } from "@/components/poker/phase-stepper";
import { DurationInput } from "@/components/poker/duration-input";
import { SendToYoutrackDialog } from "@/components/poker/send-to-youtrack-dialog";
import { SP_DECK } from "@/lib/poker/decks";
import { suggestSp, suggestDuration } from "@/lib/poker/suggestion";
import { phaseOfStatus } from "@/lib/poker/state-machine";
import { Button } from "@/components/ui/button";

type Snapshot = {
  session: { id: string; sprintName: string; createdBy: string; status: string };
  members: Array<{ userId: string; role: string; displayName: string; avatarUrl: string | null; lastSeenAt: string }>;
  issues: Array<{ id: string; issueKey: string; summary: string; description: string | null; status: string; position: number; syncStatus: "ok" | "failed" | null }>;
  activeIssue: {
    issue: { id: string; issueKey: string; summary: string; description: string | null; status: string };
    currentEstimate: { id: string; round: number; kind: "sp" | "duration"; phase: string | null };
    votes: Array<{ userId: string; value?: number | null }>;
    isRevealed: boolean;
  } | null;
};

export function RoomClient({
  initialSnapshot, currentUserId, youtrackBaseUrl,
}: {
  initialSnapshot: Snapshot;
  currentUserId: string;
  youtrackBaseUrl: string;
}) {
  const router = useRouter();
  const [snap, setSnap] = useState<Snapshot>(initialSnapshot);
  const [myCard, setMyCard] = useState<number | null>(null);
  const [abstained, setAbstained] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendDialogIssue, setSendDialogIssue] = useState<{ id: string; key: string } | null>(null);

  usePresencePing(initialSnapshot.session.id);

  const isModerator = snap.members.find((m) => m.userId === currentUserId)?.role === "moderator";
  const moderatorId = snap.members.find((m) => m.role === "moderator")?.userId ?? null;
  const moderatorIsStale = (() => {
    const mod = snap.members.find((m) => m.userId === moderatorId);
    if (!mod) return false;
    return Date.now() - new Date(mod.lastSeenAt).getTime() > 5 * 60 * 1000;
  })();
  const active = snap.activeIssue;
  const status = active?.issue.status ?? "pending";
  const { kind, phase } = phaseOfStatus(status as never);
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

  // Periodic refresh so the moderator picks up lastSeenAt freshness even
  // when no action events fire (presence pings don't broadcast).
  useEffect(() => {
    const id = setInterval(() => { void refresh(); }, 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  // reset card when active issue or phase changes
  useEffect(() => { setMyCard(null); setAbstained(false); }, [active?.issue.id, status]);

  const votedUserIds = useMemo(() => new Set((active?.votes ?? []).map((v) => v.userId)), [active]);
  const suggestion = useMemo(() => {
    if (!active || !active.isRevealed) return null;
    const vals = active.votes.map((v) => v.value).filter((v): v is number => typeof v === "number");
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
    setAbstained(false);
    if (!(await post("/vote", { issueId: active.issue.id, value: v }))) setMyCard(null);
  }
  async function abstain() {
    if (!active) return;
    const prevAbstained = abstained;
    const prevCard = myCard;
    setAbstained(true);
    setMyCard(null);
    if (!(await post("/vote", { issueId: active.issue.id, value: null }))) {
      setAbstained(prevAbstained);
      setMyCard(prevCard);
    }
  }
  async function reveal() { if (active) await post("/reveal", { issueId: active.issue.id }); }
  async function submit(v: number) {
    if (!active || submitting) return;
    setSubmitting(true);
    try {
      await post("/submit", { issueId: active.issue.id, finalValue: v });
    } finally {
      setSubmitting(false);
    }
  }
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(window.location.href); toast("URL copied"); }}>
            Copy invite URL
          </Button>
          {!isModerator && moderatorIsStale && (
            <Button size="sm" variant="outline" onClick={async () => {
              const r = await fetch(`/api/sessions/${snap.session.id}/takeover`, { method: "POST" });
              if (!r.ok) toast.error(await r.text());
              else { toast.success("You're the moderator now"); refresh(); }
            }}>Take over moderation</Button>
          )}
        </div>
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

      {!active && (() => {
        const completed = snap.issues.filter((i) => i.status === "completed" || i.status === "skipped");
        if (completed.length === 0) return null;
        return (
          <section className="flex flex-col gap-2 mt-4">
            <h2 className="text-sm font-medium text-muted-foreground">Completed</h2>
            <ul className="flex flex-col gap-1">
              {completed.map((i) => (
                <li key={i.id} className="flex items-center justify-between border rounded px-3 py-2 text-sm">
                  <span className="opacity-70">{i.issueKey} — {i.summary} {i.status === "skipped" && <em className="text-xs text-muted-foreground">(skipped)</em>}</span>
                  {isModerator && i.syncStatus === null && (
                    <Button size="sm" onClick={() => setSendDialogIssue({ id: i.id, key: i.issueKey })}>
                      Send to YouTrack
                    </Button>
                  )}
                  {isModerator && i.syncStatus === "failed" && (
                    <Button size="sm" variant="outline" onClick={() => setSendDialogIssue({ id: i.id, key: i.issueKey })}>
                      Retry sync
                    </Button>
                  )}
                  {i.syncStatus === "ok" && (
                    <span className="text-xs text-emerald-700">Synced</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })()}

      {active && (
        <>
          <PhaseStepper status={status} />
          <IssueCard
            youtrackBaseUrl={youtrackBaseUrl}
            keyId={active.issue.issueKey}
            summary={active.issue.summary}
            description={active.issue.description}
          />
          <div className="flex items-center justify-center gap-2">
            <RoundBadge round={active.currentEstimate.round} />
          </div>
          <VoterList members={snap.members} votedUserIds={votedUserIds} moderatorId={moderatorId} />

          {!active.isRevealed && (
            <div className="flex flex-col items-center gap-3">
              {kind === "sp" ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground text-center">Your card</p>
                  <CardDeck deck={SP_DECK} selected={myCard} onPick={vote} disabled={false} />
                </>
              ) : (
                <DurationInput
                  value={myCard}
                  onSubmit={vote}
                  disabled={false}
                  phaseLabel={phase ?? ""}
                />
              )}
              <Button
                variant={abstained ? "secondary" : "ghost"}
                size="sm"
                onClick={abstain}
                className="text-xs"
              >
                {abstained ? "No opinion ✓" : "I have no opinion"}
              </Button>
            </div>
          )}

          {active.isRevealed && (
            <RevealPanel
              votes={active.votes.map((v) => ({ userId: v.userId, value: v.value ?? null }))}
              suggestion={suggestion}
              members={snap.members}
              unit={unit as "" | "h"}
            />
          )}

          {isModerator && (
            <ModeratorControls
              status={status}
              kind={kind}
              suggestion={suggestion}
              submitting={submitting}
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

      {sendDialogIssue && (
        <SendToYoutrackDialog
          open={!!sendDialogIssue}
          onOpenChange={(v) => { if (!v) setSendDialogIssue(null); }}
          sessionId={snap.session.id}
          issueId={sendDialogIssue.id}
          issueKey={sendDialogIssue.key}
          onDone={() => { void refresh(); }}
        />
      )}
    </div>
  );
}
