"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ModeratorControls({
  status, kind, suggestion, submitting = false, onReveal, onSubmit, onRevote, onSkipPhase, onSkipIssue, onEnd,
}: {
  status: string;
  kind: "sp" | "duration" | null;
  suggestion: number | null;
  submitting?: boolean;
  onReveal: () => void;
  onSubmit: (v: number) => void;
  onRevote: () => void;
  onSkipPhase: () => void;
  onSkipIssue: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState<string>(suggestion !== null ? String(suggestion) : "");
  useEffect(() => {
    setDraft(suggestion !== null ? String(suggestion) : "");
  }, [suggestion, status]);

  const isVoting = status.endsWith("_voting");
  const isRevealed = status.endsWith("_revealed");

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
      <Button variant="destructive" onClick={onEnd} disabled={submitting}>End session</Button>
    </div>
  );
}
