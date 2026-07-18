export type Vote = { user: string; value: number };

export type EstimateSummary = {
  skipped: boolean;
  final: number | null;
  rounds: number;
  votes: Vote[];
};

export type PhaseSummary = { name: string; summary: EstimateSummary };

export type SummaryInput = {
  date: Date;
  members: string[];
  // True when the moderator typed values without voting. Suppresses per-voter
  // breakdowns and annotates the lines with "(entered directly)".
  directEntry?: boolean;
  sp: EstimateSummary;
  phases: PhaseSummary[]; // ordered duration phases; empty = SP-only
};

export function formatSummaryComment(s: SummaryInput): string {
  const directEntry = !!s.directEntry;
  const date = s.date.toISOString().slice(0, 10);
  const lines: string[] = [];
  if (directEntry) {
    lines.push(`Estimated via Full House on ${date} (values entered directly).`);
  } else {
    lines.push(`Estimated via Full House on ${date} by ${s.members.join(", ")}.`);
  }
  lines.push("");

  // SP line
  if (s.sp.skipped) {
    lines.push("Story Points: skipped");
  } else if (s.sp.final !== null) {
    if (directEntry) {
      lines.push(`Story Points: ${formatNum(s.sp.final)}  (entered directly)`);
    } else {
      const roundSuffix = s.sp.rounds > 1 ? `  (rounds: ${s.sp.rounds})` : "";
      lines.push(`Story Points: ${formatNum(s.sp.final)}${roundSuffix}`);
      for (const line of groupVoteLines(s.sp.votes)) lines.push(`  ${line}`);
    }
  }
  lines.push("");

  // Duration section
  if (s.phases.length === 0) {
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
  }

  if (directEntry) {
    const total = s.phases.reduce((sum, p) => sum + (p.summary.final ?? 0), 0);
    const anyFinal = s.phases.some((p) => !p.summary.skipped && p.summary.final !== null);
    lines.push(anyFinal ? `Duration: ${formatNum(total)}h  (entered directly)` : "Duration: skipped");
    return lines.join("\n");
  }

  const allSkipped = s.phases.every((p) => p.summary.skipped);
  if (allSkipped) {
    lines.push("Duration: skipped");
    return lines.join("\n");
  }

  const total = s.phases.reduce((sum, p) => sum + (p.summary.final ?? 0), 0);
  // Single-phase lists render inline like the old "simple" mode; multi-phase break down.
  if (s.phases.length === 1) {
    const e = s.phases[0]!.summary;
    const roundSuffix = e.rounds > 1 ? `  (rounds: ${e.rounds})` : "";
    lines.push(`Duration: ${formatNum(e.final ?? 0)}h total (${s.phases[0]!.name})${roundSuffix}`);
    for (const line of groupVoteLines(e.votes)) lines.push(`  ${line}`);
    return lines.join("\n");
  }

  lines.push(`Duration: ${formatNum(total)}h total`);
  for (const p of s.phases) {
    const e = p.summary;
    if (e.skipped) {
      lines.push(`  ${p.name}: skipped`);
      continue;
    }
    const roundSuffix = e.rounds > 1 ? `  (rounds: ${e.rounds})` : "";
    lines.push(`  ${p.name}: ${formatNum(e.final ?? 0)}h${roundSuffix}`);
    for (const line of groupVoteLines(e.votes)) lines.push(`    ${line}`);
  }
  return lines.join("\n");
}

function groupVoteLines(votes: Vote[]): string[] {
  const byValue = new Map<number, string[]>();
  for (const v of votes) {
    const list = byValue.get(v.value) ?? [];
    list.push(v.user);
    byValue.set(v.value, list);
  }
  return [...byValue.entries()]
    .sort(([a], [b]) => a - b)
    .map(([value, users]) => `${formatNum(value)} — ${users.join(", ")}`);
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
