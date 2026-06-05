export type RawCustomField = {
  name: string;
  projectCustomField?: { field?: { fieldType?: { id?: string } } };
  value?: unknown;
};

export type RawIssue = {
  id: string;
  idReadable: string;
  summary: string;
  description: string | null;
  customFields: RawCustomField[];
};

export type Conventions = {
  spField: string | null;
  durationField: string | null;
  doneStateNames: string[];
};

export type EnvFallback = {
  spField?: string;
  durationField?: string;
  doneStateNames?: string[];
};

export function discoverConventions(issues: RawIssue[], fallback: EnvFallback): Conventions {
  // Tally candidate field names by issue count
  const numericFields = new Map<string, number>(); // name -> count
  const periodFields = new Map<string, number>();
  const resolvedStateNames = new Set<string>();

  for (const issue of issues) {
    for (const cf of issue.customFields ?? []) {
      const typeId = cf.projectCustomField?.field?.fieldType?.id ?? "";
      if (typeId === "integer" || typeId === "float") {
        numericFields.set(cf.name, (numericFields.get(cf.name) ?? 0) + 1);
      } else if (typeId === "period") {
        periodFields.set(cf.name, (periodFields.get(cf.name) ?? 0) + 1);
      } else if (typeId.startsWith("state")) {
        const v = cf.value as { name?: string; isResolved?: boolean } | null;
        if (v && v.isResolved === true && typeof v.name === "string") {
          resolvedStateNames.add(v.name);
        }
      }
    }
  }

  const spField = pickSpField(numericFields, fallback.spField);
  const durationField = pickDurationField(periodFields, numericFields, fallback.durationField);

  const doneStateNames = resolvedStateNames.size > 0
    ? [...resolvedStateNames].sort()
    : (fallback.doneStateNames ?? []);

  return { spField, durationField, doneStateNames };
}

function pickSpField(candidates: Map<string, number>, envFallback?: string): string | null {
  if (candidates.size === 0) return envFallback ?? null;
  const names = [...candidates.keys()];
  const exact = names.find((n) => /^story\s*points?$/i.test(n));
  if (exact) return exact;
  const loose = names.filter((n) => /story|point|sp|sps|estimate|sizing/i.test(n));
  if (loose.length === 0) return envFallback ?? null;
  return bestByCountThenEnvThenLex(loose, candidates, envFallback);
}

function pickDurationField(
  periods: Map<string, number>,
  numerics: Map<string, number>,
  envFallback?: string,
): string | null {
  if (periods.size > 0) {
    const names = [...periods.keys()];
    const preferred = names.filter((n) => /estim|duration/i.test(n));
    if (preferred.length > 0) return bestByCountThenEnvThenLex(preferred, periods, envFallback);
    return bestByCountThenEnvThenLex(names, periods, envFallback);
  }
  const candidates = [...numerics.keys()].filter((n) => /estim|duration|time|hours|effort/i.test(n));
  if (candidates.length === 0) return envFallback ?? null;
  return bestByCountThenEnvThenLex(candidates, numerics, envFallback);
}

function bestByCountThenEnvThenLex(
  names: string[],
  counts: Map<string, number>,
  envFallback?: string,
): string {
  if (envFallback && names.includes(envFallback)) return envFallback;
  const maxCount = Math.max(...names.map((n) => counts.get(n) ?? 0));
  const tied = names.filter((n) => (counts.get(n) ?? 0) === maxCount);
  tied.sort();
  return tied[0]!;
}
