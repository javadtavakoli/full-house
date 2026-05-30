type Member = { userId: string; displayName: string };
export function RevealPanel({
  votes, suggestion, members, unit,
}: { votes: Array<{ userId: string; value: number }>; suggestion: number | null; members: Member[]; unit: "" | "h" }) {
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.displayName ?? "?";
  const byValue = new Map<number, string[]>();
  for (const v of votes) {
    const list = byValue.get(v.value) ?? [];
    list.push(nameOf(v.userId));
    byValue.set(v.value, list);
  }
  const groups = [...byValue.entries()].sort(([a], [b]) => a - b);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-muted-foreground text-center">
        Suggested: <span className="font-semibold text-foreground">{suggestion === null ? "—" : `${suggestion}${unit}`}</span>
      </div>
      <div className="flex gap-3 justify-center flex-wrap">
        {groups.map(([value, names]) => (
          <div key={value} className="flex flex-col items-center gap-1">
            <div className="w-14 h-20 rounded-md border-2 border-emerald-500 bg-emerald-50 flex items-center justify-center font-semibold text-lg">
              {value}{unit}
            </div>
            <span className="text-xs text-muted-foreground">{names.join(", ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
