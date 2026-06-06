"use client";
import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";

type PerPhase = { impl: number | null; review: number | null; test: number | null };
type Summary = { sp: number | null; durationTotal: number | null; perPhase: PerPhase | null };

export function SendToYoutrackDialog({
  open,
  onOpenChange,
  sessionId,
  issueId,
  issueKey,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  issueId: string;
  issueKey: string;
  onDone: () => void;
}) {
  const [sp, setSp] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSummary(null);
    fetch(`/api/sessions/${sessionId}/issues/${issueId}/summary`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return (await r.json()) as Summary;
      })
      .then((d) => {
        if (cancelled) return;
        setSummary(d);
        setSp(d.sp !== null && d.sp !== undefined ? String(d.sp) : "");
        setDuration(
          d.durationTotal !== null && d.durationTotal !== undefined ? String(d.durationTotal) : "",
        );
      })
      .catch((e) => {
        if (!cancelled) toast.error(`Failed to load summary: ${(e as Error).message}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, issueId]);

  async function submit() {
    setPending(true);
    try {
      // Blank input => null => "skip the write". A typed number is written.
      const spNum = sp.trim() === "" ? null : Number(sp);
      const durNum = duration.trim() === "" ? null : Number(duration);
      if ((spNum !== null && !Number.isFinite(spNum)) || (durNum !== null && !Number.isFinite(durNum))) {
        toast.error("Enter valid numbers");
        return;
      }
      const r = await fetch(`/api/sessions/${sessionId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId,
          spOverride: spNum,
          durationOverride: durNum,
        }),
      });
      if (!r.ok) {
        toast.error(await r.text());
        return;
      }
      const result = (await r.json()) as Record<string, { ok: boolean; error?: string }>;
      const failures = Object.entries(result).filter(([, v]) => !v.ok);
      if (failures.length === 0) {
        toast.success(`${issueKey} sent to YouTrack`);
        onOpenChange(false);
        onDone();
      } else {
        toast.error(
          `Partial: ${failures.map(([k, v]) => `${k}${v.error ? ` (${v.error})` : ""}`).join(", ")}`,
        );
        onDone();
      }
    } finally {
      setPending(false);
    }
  }

  const perPhase = summary?.perPhase ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send {issueKey} to YouTrack</DialogTitle>
          <DialogDescription>
            Review the computed values and edit before pushing. Leave a field blank to skip writing it.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="sp" className="mb-1 block">
                Story points
              </Label>
              <Input
                id="sp"
                type="number"
                inputMode="numeric"
                value={sp}
                onChange={(e) => setSp(e.target.value)}
                placeholder="blank = don't write SP"
              />
            </div>
            <div>
              <Label htmlFor="dur" className="mb-1 block">
                Total duration (hours)
              </Label>
              <Input
                id="dur"
                type="number"
                inputMode="decimal"
                step={0.5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="blank = don't write duration"
              />
              {perPhase && (
                <p className="text-xs text-muted-foreground mt-1">
                  Per-phase votes: impl {perPhase.impl ?? "—"}h, review {perPhase.review ?? "—"}h,
                  test {perPhase.test ?? "—"}h
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              A summary comment is posted regardless.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || pending}>
            {pending ? "Sending…" : "Send to YouTrack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
