"use client";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function DurationInput({
  value, onSubmit, disabled, phaseLabel,
}: {
  value: number | null;
  onSubmit: (hours: number) => void;
  disabled: boolean;
  phaseLabel: string;
}) {
  const [draft, setDraft] = useState<string>(value !== null ? String(value) : "");

  // Reset draft when the canonical value resets (e.g., new phase, revote)
  useEffect(() => {
    setDraft(value !== null ? String(value) : "");
  }, [value]);

  function submit() {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) return;
    onSubmit(n);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">
        Your estimate — {phaseLabel} (hours)
      </label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          disabled={disabled}
          className="w-24 text-center"
          autoFocus
        />
        <Button size="sm" onClick={submit} disabled={disabled || draft === ""}>Vote</Button>
        {value !== null && <span className="text-xs text-muted-foreground">cast: {value}h</span>}
      </div>
    </div>
  );
}
