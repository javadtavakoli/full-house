"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSessionRoom } from "@/hooks/use-session-room";
import { usePresencePing } from "@/hooks/use-presence-ping";
import { CardDeck } from "@/components/poker/card-deck";
import { VoterList } from "@/components/poker/voter-list";
import { RevealPanel } from "@/components/poker/reveal-panel";
import { ModeratorControls, type GotoTarget } from "@/components/poker/moderator-controls";
import { IssueCard } from "@/components/poker/issue-card";
import { RoundBadge } from "@/components/poker/round-badge";
import { PhaseStepper } from "@/components/poker/phase-stepper";
import { DurationInput } from "@/components/poker/duration-input";
import { PickIssueDialog } from "@/components/poker/pick-issue-dialog";
import {
  SendAllToYoutrackDialog,
  type ReviewIssue,
} from "@/components/poker/send-all-to-youtrack-dialog";
import { SP_DECK } from "@/lib/poker/decks";
import { suggestSp, suggestDuration } from "@/lib/poker/suggestion";
import { phaseOfStatus } from "@/lib/poker/state-machine";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SnapshotIssue = {
  id: string;
  issueKey: string;
  summary: string;
  description: string | null;
  status: string;
  position: number;
  syncStatus: "ok" | "failed" | null;
  pokerMode: "simple" | "advanced" | null;
  withEstimation: boolean | null;
  directEntry: boolean;
};

type Snapshot = {
  session: { id: string; sprintName: string; createdBy: string; status: string };
  members: Array<{ userId: string; role: string; displayName: string; avatarUrl: string | null; lastSeenAt: string }>;
  issues: Array<SnapshotIssue>;
  activeIssue: {
    issue: SnapshotIssue;
    currentEstimate: { id: string; round: number; kind: "sp" | "duration"; phase: string | null };
    votes: Array<{ userId: string; value?: number | null }>;
    isRevealed: boolean;
  } | null;
};

// Options shown in the per-row "Back to…" select on completed issues.
const BACK_TO_OPTIONS: Array<{ value: GotoTarget; label: string }> = [
  { value: "sp", label: "Story points" },
  { value: "impl", label: "Implementation" },
  { value: "review", label: "Review" },
  { value: "test", label: "Test" },
];

export function RoomClient({
  initialSnapshot, currentUserId, youtrackBaseUrl,
  userDefaultMode = "advanced", userDefaultWithEstimation = true,
}: {
  initialSnapshot: Snapshot;
  currentUserId: string;
  youtrackBaseUrl: string;
  userDefaultMode?: "simple" | "advanced";
  userDefaultWithEstimation?: boolean;
}) {
  const router = useRouter();
  const [snap, setSnap] = useState<Snapshot>(initialSnapshot);
  const [myCard, setMyCard] = useState<number | null>(null);
  const [abstained, setAbstained] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pickDialogIssue, setPickDialogIssue] = useState<{ id: string; key: string } | null>(null);

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

  // Legacy single-button pick — kept for callers that still want to use moderator defaults
  // without showing the dialog. The dialog (PickIssueDialog) calls /pick-issue directly.
  async function pick(issueId: string) { await post("/pick-issue", { issueId }); }
  void pick;
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

  // gotoPhase is callable for either the active issue (from ModeratorControls)
  // or a completed issue (from the per-row select). Accept the issueId explicitly
  // so the completed-list control can target a non-active issue.
  async function gotoPhase(issueId: string, target: GotoTarget) {
    await post("/goto-phase", { issueId, target });
  }

  // The "End session" button no longer deletes the session immediately — it opens
  // the review dialog, which contains both Send-and-end and End-without-sending.
  function endSession() {
    setReviewOpen(true);
  }

  const pending = snap.issues.filter((i) => i.status === "pending");
  const completedIssues = snap.issues.filter((i) => i.status === "completed");
  const skippedIssues = snap.issues.filter((i) => i.status === "skipped");
  const reviewable: ReviewIssue[] = [...completedIssues, ...skippedIssues].map((i) => ({
    id: i.id,
    issueKey: i.issueKey,
    summary: i.summary,
    status: i.status,
    syncStatus: i.syncStatus,
  }));

  // The header "Review & send" button is disabled when there's nothing to send.
  // Skipped-only doesn't count — they're never written to YouTrack.
  const hasSendable = completedIssues.length > 0;

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
          {isModerator && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReviewOpen(true)}
              disabled={!hasSendable}
              title={hasSendable ? "Review and send to YouTrack" : "Nothing to send yet"}
            >
              Review &amp; send
            </Button>
          )}
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
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No more pending issues.{" "}
              {isModerator && (
                <Button variant="link" onClick={endSession}>End session</Button>
              )}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between border rounded px-3 py-2">
                <span>{i.issueKey} — {i.summary}</span>
                {isModerator && (
                  <Button
                    size="sm"
                    onClick={() => setPickDialogIssue({ id: i.id, key: i.issueKey })}
                  >
                    Estimate
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!active && (() => {
        const completedAndSkipped = snap.issues.filter((i) => i.status === "completed" || i.status === "skipped");
        if (completedAndSkipped.length === 0) return null;
        return (
          <section className="flex flex-col gap-2 mt-4">
            <h2 className="text-sm font-medium text-muted-foreground">Completed</h2>
            <ul className="flex flex-col gap-1">
              {completedAndSkipped.map((i) => (
                <li key={i.id} className="flex items-center justify-between border rounded px-3 py-2 text-sm gap-2">
                  <span className="opacity-70 min-w-0 truncate">
                    {i.issueKey} — {i.summary}{" "}
                    {i.status === "skipped" && (
                      <em className="text-xs text-muted-foreground">(skipped)</em>
                    )}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {/* Status badge */}
                    {i.status === "skipped" ? (
                      <span className="text-xs text-muted-foreground">skipped</span>
                    ) : i.syncStatus === "ok" ? (
                      <span className="text-xs text-emerald-700">sent</span>
                    ) : i.syncStatus === "failed" ? (
                      <span className="text-xs text-amber-700">failed</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">completed</span>
                    )}
                    {/* Moderator can re-open a completed issue at any phase */}
                    {isModerator && i.status === "completed" && (
                      <Select
                        value=""
                        onValueChange={(v) => gotoPhase(i.id, v as GotoTarget)}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue placeholder="Back to…" />
                        </SelectTrigger>
                        <SelectContent>
                          {BACK_TO_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}

      {active && (
        <>
          <PhaseStepper
            status={status}
            mode={active.issue.pokerMode ?? "advanced"}
            withEstimation={active.issue.withEstimation ?? true}
          />
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
              onGoto={(target) => gotoPhase(active.issue.id, target)}
            />
          )}
        </>
      )}

      <SendAllToYoutrackDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        sessionId={snap.session.id}
        issues={reviewable}
        onDone={(opts) => {
          void refresh();
          if (opts?.ended) {
            // session-ended Pusher event will also fire and route us back, but
            // refresh covers the local-broadcast-suppressed case (E2E mode).
            router.push("/app");
          }
        }}
      />

      {pickDialogIssue && (
        <PickIssueDialog
          open={!!pickDialogIssue}
          onOpenChange={(v) => { if (!v) setPickDialogIssue(null); }}
          sessionId={snap.session.id}
          issueId={pickDialogIssue.id}
          issueKey={pickDialogIssue.key}
          defaultMode={userDefaultMode}
          defaultWithEstimation={userDefaultWithEstimation}
          onDone={() => { setPickDialogIssue(null); void refresh(); }}
        />
      )}
    </div>
  );
}
