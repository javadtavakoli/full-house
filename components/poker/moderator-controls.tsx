"use client";
import { Button } from "@/components/ui/button";

export function ModeratorControls({
  status, suggestion, onReveal, onSubmit, onRevote, onSkipPhase, onSkipIssue, onEnd,
}: {
  status: string;
  suggestion: number | null;
  onReveal: () => void;
  onSubmit: (v: number) => void;
  onRevote: () => void;
  onSkipPhase: () => void;
  onSkipIssue: () => void;
  onEnd: () => void;
}) {
  const isVoting = status.endsWith("_voting");
  const isRevealed = status.endsWith("_revealed");
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {isVoting && <Button onClick={onReveal}>Reveal votes</Button>}
      {isRevealed && (
        <>
          <Button onClick={() => suggestion !== null && onSubmit(suggestion)} disabled={suggestion === null}>
            Submit {suggestion ?? "?"}
          </Button>
          <Button variant="outline" onClick={onRevote}>Revote</Button>
        </>
      )}
      <Button variant="outline" onClick={onSkipPhase}>Skip phase</Button>
      <Button variant="outline" onClick={onSkipIssue}>Skip issue</Button>
      <Button variant="destructive" onClick={onEnd}>End session</Button>
    </div>
  );
}
