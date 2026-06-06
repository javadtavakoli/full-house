type Member = { userId: string; displayName: string };
type Vote = { userId: string; value: number | null };

export function RevealPanel({
  votes, suggestion, members, unit,
}: { votes: Vote[]; suggestion: number | null; members: Member[]; unit: "" | "h" }) {
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.displayName ?? "?";
  const numbered = votes.filter((v): v is { userId: string; value: number } => typeof v.value === "number");
  const abstainers = votes.filter((v) => v.value === null);
  const byValue = new Map<number, string[]>();
  for (const v of numbered) {
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
      {abstainers.length > 0 && (
        <div className="text-xs text-muted-foreground text-center italic">
          Abstained: {abstainers.map((v) => nameOf(v.userId)).join(", ")}
        </div>
      )}
    </div>
  );
}
