"use client";
import { cn } from "@/lib/utils";

export function CardDeck({
  deck, selected, onPick, disabled,
}: { deck: readonly number[]; selected: number | null; onPick: (v: number) => void; disabled: boolean }) {
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {deck.map((v) => (
        <button
          key={v}
          disabled={disabled}
          onClick={() => onPick(v)}
          className={cn(
            "w-14 h-20 rounded-md border text-lg font-semibold flex items-center justify-center",
            selected === v ? "border-2 border-emerald-500 bg-emerald-50" : "border-muted hover:border-foreground",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
