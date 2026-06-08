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
  // Mode controls how duration phases are rendered.
  // Defaults to "advanced" + true for backward compat with older callers/tests.
  mode?: "simple" | "advanced";
  withEstimation?: boolean;
  // True when the moderator typed values without voting. Suppresses per-voter
  // breakdowns and annotates the lines with "(entered directly)".
  directEntry?: boolean;
  sp: EstimateSummary;
  duration: {
    impl: EstimateSummary;
    review: EstimateSummary;
    test: EstimateSummary;
  };
};

export function formatSummaryComment(s: SummaryInput): string {
  const mode = s.mode ?? "advanced";
  const withEstimation = s.withEstimation ?? true;
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
  if (!withEstimation) {
    // SP-only mode — no duration line at all.
    // Trim trailing blank line.
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
  }

  if (directEntry) {
    // Direct-entry stores the total in the "impl" slot for both modes.
    const total = s.duration.impl.final;
    if (total === null || s.duration.impl.skipped) {
      lines.push("Duration: skipped");
    } else {
      lines.push(`Duration: ${formatNum(total)}h  (entered directly)`);
    }
    return lines.join("\n");
  }

  if (mode === "simple") {
    // Single "Estimation" phase, stored in the impl slot.
    const est = s.duration.impl;
    if (est.skipped || est.final === null) {
      lines.push("Duration: skipped");
    } else {
      const roundSuffix = est.rounds > 1 ? `  (rounds: ${est.rounds})` : "";
      lines.push(`Duration: ${formatNum(est.final)}h total (Estimation)${roundSuffix}`);
      for (const line of groupVoteLines(est.votes)) lines.push(`  ${line}`);
    }
    return lines.join("\n");
  }

  // Advanced mode — three phases.
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
