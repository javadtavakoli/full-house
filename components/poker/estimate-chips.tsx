import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHours } from "@/lib/poker/format-hours";

/**
 * Small SP / duration chips for an issue row. Renders nothing for missing values.
 * `pending` = values decided here but not yet in YouTrack → greyed, with a tooltip.
 */
export function EstimateChips({
  sp,
  durationHours,
  phases,
  pending,
  pendingLabel = "Pending — not sent to YouTrack yet",
}: {
  sp: number | null;
  durationHours: number | null;
  phases?: Array<{ name: string; hours: number }>;
  pending?: boolean;
  pendingLabel?: string;
}) {
  if (sp === null && durationHours === null) return null;
  const chip = cn(
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums whitespace-nowrap",
    pending ? "border-dashed text-muted-foreground opacity-70" : "bg-secondary text-secondary-foreground border-transparent",
  );
  const split =
    phases && phases.length > 1 ? phases.map((p) => `${p.name} ${formatHours(p.hours)}`).join(" · ") : null;
  const durTitle = [split, pending ? pendingLabel : null].filter(Boolean).join("\n") || undefined;
  const pendingTitle = pending ? pendingLabel : undefined;

  return (
    <span className="flex items-center gap-1 shrink-0">
      {sp !== null && (
        <span className={chip} title={pendingTitle} aria-label={`Story points ${sp}${pending ? ", pending" : ""}`}>
          SP {sp}
        </span>
      )}
      {durationHours !== null && (
        <span
          className={chip}
          title={durTitle}
          aria-label={`Estimation ${formatHours(durationHours)}${pending ? ", pending" : ""}`}
        >
          <Timer className="h-3 w-3" aria-hidden="true" />
          {formatHours(durationHours)}
        </span>
      )}
    </span>
  );
}
