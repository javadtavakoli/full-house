"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type GotoTarget = "sp" | "impl" | "review" | "test";

const ALL_TARGETS: Array<{ value: GotoTarget; label: string }> = [
  { value: "sp", label: "Story points" },
  { value: "impl", label: "Implementation" },
  { value: "review", label: "Review" },
  { value: "test", label: "Test" },
];

/**
 * Map an issue's status to the "phase" it sits in, so we can hide that option
 * from the Back-to dropdown (going back to the current phase is what Revote does).
 */
function activeTarget(status: string): GotoTarget | null {
  if (status.startsWith("sp_")) return "sp";
  if (status.startsWith("dur_impl")) return "impl";
  if (status.startsWith("dur_review")) return "review";
  if (status.startsWith("dur_test")) return "test";
  return null;
}

export function ModeratorControls({
  status,
  kind,
  suggestion,
  submitting = false,
  mode = "advanced",
  withEstimation = true,
  onReveal,
  onSubmit,
  onRevote,
  onSkipPhase,
  onSkipIssue,
  onEnd,
  onGoto,
}: {
  status: string;
  kind: "sp" | "duration" | null;
  suggestion: number | null;
  submitting?: boolean;
  mode?: "simple" | "advanced";
  withEstimation?: boolean;
  onReveal: () => void;
  onSubmit: (v: number) => void;
  onRevote: () => void;
  onSkipPhase: () => void;
  onSkipIssue: () => void;
  onEnd: () => void;
  onGoto: (target: GotoTarget) => void;
}) {
  const [draft, setDraft] = useState<string>(suggestion !== null ? String(suggestion) : "");
  useEffect(() => {
    setDraft(suggestion !== null ? String(suggestion) : "");
  }, [suggestion, status]);

  const isVoting = status.endsWith("_voting");
  const isRevealed = status.endsWith("_revealed");

  const current = activeTarget(status);
  // Hide the current phase from the dropdown — that's what Revote is for.
  // Also hide targets the issue's mode/withEstimation doesn't reach: SP-only
  // issues only allow "sp"; simple-mode issues only allow "sp" and "impl".
  const available = ALL_TARGETS.filter((t) => {
    if (t.value === current) return false;
    if (!withEstimation) return t.value === "sp";
    if (mode === "simple") return t.value === "sp" || t.value === "impl";
    return true;
  });

  function submitDraft() {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) return;
    onSubmit(n);
  }

  return (
    <div className="flex gap-2 justify-center flex-wrap items-center">
      {isVoting && <Button onClick={onReveal}>Reveal votes</Button>}
      {isRevealed && (
        <>
          {kind === "duration" ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={0.5}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={submitting}
                className="w-24"
              />
              <Button onClick={submitDraft} disabled={submitting || draft === ""}>
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => suggestion !== null && onSubmit(suggestion)}
              disabled={submitting || suggestion === null}
            >
              {submitting ? "Submitting…" : `Submit ${suggestion ?? "?"}`}
            </Button>
          )}
          <Button variant="outline" onClick={onRevote} disabled={submitting}>Revote</Button>
        </>
      )}
      <Button variant="outline" onClick={onSkipPhase} disabled={submitting}>Skip phase</Button>
      <Button variant="outline" onClick={onSkipIssue} disabled={submitting}>Skip issue</Button>
      <Select
        value=""
        onValueChange={(v) => onGoto(v as GotoTarget)}
        disabled={submitting}
      >
        <SelectTrigger className="w-36 h-9" disabled={submitting}>
          <SelectValue placeholder="Back to…" />
        </SelectTrigger>
        <SelectContent>
          {available.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="destructive" onClick={onEnd} disabled={submitting}>End session</Button>
    </div>
  );
}
