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

export type GotoTarget = number;

export function ModeratorControls({
  status,
  kind,
  suggestion,
  submitting = false,
  phases,
  phaseIndex,
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
  phases: { id: string; name: string }[];
  phaseIndex: number;
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

  const isVoting = status === "voting";
  const isRevealed = status === "revealed";

  // Build the Back-to options from the phase list, hiding the current index —
  // that's what Revote is for.
  const targets: Array<{ value: number; label: string }> = [
    { value: -1, label: "Story points" },
    ...phases.map((p, i) => ({ value: i, label: p.name })),
  ];
  const available = targets.filter((t) => t.value !== phaseIndex);

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
        onValueChange={(v) => onGoto(Number(v))}
        disabled={submitting}
      >
        <SelectTrigger className="w-36 h-9" disabled={submitting}>
          <SelectValue placeholder="Back to…" />
        </SelectTrigger>
        <SelectContent>
          {available.map((t) => (
            <SelectItem key={t.value} value={String(t.value)}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="destructive" onClick={onEnd} disabled={submitting}>End session</Button>
    </div>
  );
}
