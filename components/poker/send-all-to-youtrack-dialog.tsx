"use client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ytFetch } from "@/lib/youtrack/client-fetch";

type PerPhase = { impl: number | null; review: number | null; test: number | null };
type Summary = { sp: number | null; durationTotal: number | null; perPhase: PerPhase | null };

export type ReviewIssue = {
  id: string;
  issueKey: string;
  summary: string;
  status: string; // "completed" | "skipped"
  syncStatus: "ok" | "failed" | null;
};

type RowState = {
  loading: boolean;
  sp: string;
  duration: string;
  perPhase: PerPhase | null;
  status: "pending" | "sending" | "sent" | "failed";
  error?: string;
};

function defaultRow(): RowState {
  return { loading: true, sp: "", duration: "", perPhase: null, status: "pending" };
}

export function SendAllToYoutrackDialog({
  open,
  onOpenChange,
  sessionId,
  issues,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  issues: ReviewIssue[];
  /** Called after a successful send-all or end action so the parent can refresh / navigate. */
  onDone: (opts?: { ended?: boolean }) => void;
}) {
  const sendable = issues.filter((i) => i.status === "completed");
  const skipped = issues.filter((i) => i.status === "skipped");

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [sending, setSending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [ending, setEnding] = useState(false);

  // Reload row state every time the dialog opens. Sendable issues are fetched in
  // parallel via the existing /summary endpoint to prefill SP + duration totals.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAttempted(false);
    const initial: Record<string, RowState> = {};
    for (const i of sendable) initial[i.id] = defaultRow();
    setRows(initial);
    Promise.all(
      sendable.map(async (i) => {
        try {
          const r = await fetch(`/api/sessions/${sessionId}/issues/${i.id}/summary`);
          if (!r.ok) throw new Error(await r.text());
          const data = (await r.json()) as Summary;
          if (cancelled) return;
          setRows((prev) => ({
            ...prev,
            [i.id]: {
              loading: false,
              sp: data.sp !== null && data.sp !== undefined ? String(data.sp) : "",
              duration:
                data.durationTotal !== null && data.durationTotal !== undefined
                  ? String(data.durationTotal)
                  : "",
              perPhase: data.perPhase,
              status: "pending",
            },
          }));
        } catch (e) {
          if (cancelled) return;
          setRows((prev) => ({
            ...prev,
            [i.id]: {
              ...defaultRow(),
              loading: false,
              status: "failed",
              error: `summary load failed: ${(e as Error).message}`,
            },
          }));
        }
      }),
    );
    return () => {
      cancelled = true;
    };
    // sessionId + open are the inputs; sendable derives from `issues`, intentionally
    // re-keyed on open to avoid resetting mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  const updateRow = useCallback((id: string, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  }, []);

  /**
   * Send a single row. Returns true if every sub-call (sp/duration/comment) was ok.
   * Rows already marked `sent` are skipped (idempotent retries on partial failures).
   * Takes `row` explicitly so a sendAll loop can pass freshly-read row state instead
   * of relying on a stale closure of `rows`.
   */
  async function sendOne(issueId: string, row: RowState): Promise<boolean> {
    if (!row || row.loading || row.status === "sent") return row?.status === "sent";

    const spNum = row.sp.trim() === "" ? null : Number(row.sp);
    const durNum = row.duration.trim() === "" ? null : Number(row.duration);
    if ((spNum !== null && !Number.isFinite(spNum)) || (durNum !== null && !Number.isFinite(durNum))) {
      updateRow(issueId, { status: "failed", error: "invalid number" });
      return false;
    }
    updateRow(issueId, { status: "sending", error: undefined });
    try {
      // sync hits YouTrack on the server side — pass the token header for
      // client-mode users via ytFetch.
      const r = await ytFetch(`/api/sessions/${sessionId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, spOverride: spNum, durationOverride: durNum }),
      });
      if (!r.ok) {
        const text = await r.text();
        updateRow(issueId, { status: "failed", error: text });
        return false;
      }
      const result = (await r.json()) as Record<string, { ok: boolean; error?: string }>;
      const failures = Object.entries(result).filter(([, v]) => !v.ok);
      if (failures.length > 0) {
        updateRow(issueId, {
          status: "failed",
          error: failures.map(([k, v]) => `${k}${v.error ? `: ${v.error}` : ""}`).join("; "),
        });
        return false;
      }
      updateRow(issueId, { status: "sent", error: undefined });
      return true;
    } catch (e) {
      updateRow(issueId, { status: "failed", error: (e as Error).message });
      return false;
    }
  }

  async function sendAll(): Promise<boolean> {
    setSending(true);
    setAttempted(true);
    try {
      // Snapshot the latest row state at the start of the run. State updates from
      // previous sendOne calls within this loop won't propagate to a re-render in
      // time, so we keep a local map and update it as we go.
      const snapshot: Record<string, RowState> = { ...rows };
      let allOk = true;
      // Serialize: YouTrack rate-limits and we want stable per-row status updates.
      for (const i of sendable) {
        const current = snapshot[i.id];
        if (!current) continue;
        const ok = await sendOne(i.id, current);
        snapshot[i.id] = { ...current, status: ok ? "sent" : "failed" };
        if (!ok) allOk = false;
      }
      if (allOk) toast.success("All issues sent to YouTrack");
      else toast.error("Some issues failed; review and retry");
      onDone();
      return allOk;
    } finally {
      setSending(false);
    }
  }

  async function endSession() {
    setEnding(true);
    try {
      const r = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!r.ok) {
        toast.error(await r.text());
        return;
      }
      onOpenChange(false);
      onDone({ ended: true });
    } finally {
      setEnding(false);
    }
  }

  async function sendAndEnd() {
    const ok = await sendAll();
    if (ok) await endSession();
  }

  const anyFailed = sendable.some((i) => rows[i.id]?.status === "failed");
  const allSent = sendable.length > 0 && sendable.every((i) => rows[i.id]?.status === "sent");

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && !ending && onOpenChange(v)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review &amp; send to YouTrack</DialogTitle>
          <DialogDescription>
            Review the values that will be written to YouTrack. Leave a field blank to skip writing
            that field. A summary comment is posted regardless.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {sendable.length === 0 && skipped.length === 0 && (
            <p className="text-sm text-muted-foreground">No completed or skipped issues yet.</p>
          )}

          {sendable.map((i) => {
            const row = rows[i.id] ?? defaultRow();
            return (
              <div
                key={i.id}
                className="border rounded px-3 py-2 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">{i.issueKey}</div>
                    <div className="text-sm truncate">{i.summary}</div>
                  </div>
                  <RowStatus row={row} prevSync={i.syncStatus} />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <span className="text-muted-foreground">SP</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="h-7 w-20"
                      value={row.sp}
                      placeholder="blank"
                      onChange={(e) => updateRow(i.id, { sp: e.target.value })}
                      disabled={row.loading || sending || ending || row.status === "sent"}
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-muted-foreground">Total duration (h)</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step={0.5}
                      className="h-7 w-24"
                      value={row.duration}
                      placeholder="blank"
                      onChange={(e) => updateRow(i.id, { duration: e.target.value })}
                      disabled={row.loading || sending || ending || row.status === "sent"}
                    />
                  </label>
                  {row.perPhase && (
                    <span className="text-muted-foreground">
                      (impl {row.perPhase.impl ?? "—"}h · review {row.perPhase.review ?? "—"}h ·
                      test {row.perPhase.test ?? "—"}h)
                    </span>
                  )}
                </div>
                {row.error && (
                  <p className="text-xs text-rose-700 break-all">{row.error}</p>
                )}
              </div>
            );
          })}

          {skipped.map((i) => (
            <div
              key={i.id}
              className="border rounded px-3 py-2 flex items-center justify-between text-sm opacity-70"
            >
              <div className="min-w-0">
                <span className="font-mono text-xs text-muted-foreground">{i.issueKey}</span>{" "}
                <span className="truncate">{i.summary}</span>
              </div>
              <span className="text-xs text-muted-foreground italic">(skipped — no write)</span>
            </div>
          ))}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {sendable.length} sendable · {skipped.length} skipped
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {/* Always offer an end path: with no sendable issues "End without sending"
                is the only end action available, so it must render unconditionally. */}
            {(attempted || sendable.length === 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={endSession}
                disabled={sending || ending}
                title="End the session without sending the remaining failures"
              >
                {ending ? "Ending…" : "End without sending"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending || ending}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={sendAll}
              disabled={sending || ending || sendable.length === 0 || allSent}
            >
              {sending ? "Sending…" : anyFailed ? "Retry failed" : "Send all to YouTrack"}
            </Button>
            <Button
              onClick={sendAndEnd}
              disabled={sending || ending || sendable.length === 0}
            >
              {sending || ending ? "Working…" : "Send and end session"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowStatus({
  row,
  prevSync,
}: {
  row: RowState;
  prevSync: "ok" | "failed" | null;
}) {
  if (row.loading) return <span className="text-xs text-muted-foreground">loading…</span>;
  if (row.status === "sending") return <span className="text-xs text-muted-foreground">sending…</span>;
  if (row.status === "sent") return <span className="text-xs text-emerald-700">sent</span>;
  if (row.status === "failed") return <span className="text-xs text-rose-700">failed</span>;
  if (prevSync === "ok") return <span className="text-xs text-emerald-700">already synced</span>;
  if (prevSync === "failed") return <span className="text-xs text-amber-700">previously failed</span>;
  return <span className="text-xs text-muted-foreground">pending</span>;
}
