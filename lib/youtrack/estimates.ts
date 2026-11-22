import type { RawIssue } from "./discover";

export type YtEstimates = { ytSp: number | null; ytDurationHours: number | null };

/**
 * Read the issue's current SP and duration values from YouTrack custom fields.
 * Period fields come back as `{ minutes }`; plain numeric duration fields are
 * treated as hours (same unit the app writes).
 */
export function readYtEstimates(
  issue: Pick<RawIssue, "customFields">,
  spField: string | null | undefined,
  durationField: string | null | undefined,
): YtEstimates {
  const find = (name: string | null | undefined) =>
    name ? issue.customFields?.find((f) => f.name === name)?.value : undefined;

  const spRaw = find(spField);
  const ytSp = typeof spRaw === "number" && Number.isFinite(spRaw) ? spRaw : null;

  const durRaw = find(durationField);
  let ytDurationHours: number | null = null;
  if (typeof durRaw === "number" && Number.isFinite(durRaw)) {
    ytDurationHours = durRaw;
  } else if (durRaw && typeof durRaw === "object") {
    const minutes = (durRaw as { minutes?: unknown }).minutes;
    if (typeof minutes === "number" && Number.isFinite(minutes)) ytDurationHours = minutes / 60;
  }
  return { ytSp, ytDurationHours };
}

/** Drizzle `numeric` columns accept strings. */
export function ytEstimateColumns(e: YtEstimates): { ytSp: string | null; ytDurationHours: string | null } {
  return {
    ytSp: e.ytSp === null ? null : String(e.ytSp),
    ytDurationHours: e.ytDurationHours === null ? null : String(e.ytDurationHours),
  };
}
