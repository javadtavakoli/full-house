export type Vote = { user: string; value: number };

export type EstimateSummary = {
  skipped: boolean;
  final: number | null;
  rounds: number;
  votes: Vote[];
};

export type SummaryInput = {
  date: Date;
  members: string[];
  sp: EstimateSummary;
  duration: {
    impl: EstimateSummary;
    review: EstimateSummary;
    test: EstimateSummary;
  };
};

export function formatSummaryComment(s: SummaryInput): string {
  const date = s.date.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`Estimated via Full House on ${date} by ${s.members.join(", ")}.`);
  lines.push("");

  // SP line
  if (s.sp.skipped) {
    lines.push("Story Points: skipped");
  } else if (s.sp.final !== null) {
    const roundSuffix = s.sp.rounds > 1 ? `  (rounds: ${s.sp.rounds})` : "";
    lines.push(`Story Points: ${formatNum(s.sp.final)}${roundSuffix}`);
    for (const line of groupVoteLines(s.sp.votes)) lines.push(`  ${line}`);
  }
  lines.push("");

  // Duration
  const phases: Array<{ label: string; key: "impl" | "review" | "test" }> = [
    { label: "Implementation", key: "impl" },
    { label: "Review", key: "review" },
    { label: "Test", key: "test" },
  ];
  const allSkipped = phases.every((p) => s.duration[p.key].skipped);
  if (allSkipped) {
    lines.push("Duration: skipped");
  } else {
    const total = phases.reduce((sum, p) => sum + (s.duration[p.key].final ?? 0), 0);
    lines.push(`Duration: ${formatNum(total)}h total`);
    for (const p of phases) {
      const e = s.duration[p.key];
      if (e.skipped) {
        lines.push(`  ${p.label}: skipped`);
        continue;
      }
      const roundSuffix = e.rounds > 1 ? `  (rounds: ${e.rounds})` : "";
      lines.push(`  ${p.label}: ${formatNum(e.final ?? 0)}h${roundSuffix}`);
      for (const line of groupVoteLines(e.votes)) lines.push(`    ${line}`);
    }
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
