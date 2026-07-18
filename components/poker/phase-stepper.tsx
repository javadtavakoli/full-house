export function PhaseStepper({
  phases,
  phaseIndex,
  status,
}: {
  phases: { id: string; name: string }[];
  phaseIndex: number; // -1 = SP
  status: string;
}) {
  const steps = [{ key: "sp", label: "SP" }, ...phases.map((p) => ({ key: p.id, label: p.name }))];
  // Highlight index: SP -> 0, duration phase i -> i+1. Terminal states highlight nothing.
  const active = status === "voting" || status === "revealed" ? phaseIndex + 1 : -1;
  return (
    <div className="flex gap-2 justify-center text-xs">
      {steps.map((s, i) => (
        <span key={s.key} className={i === active ? "font-semibold text-foreground" : "text-muted-foreground"}>
          {s.label}
          {i < steps.length - 1 ? " → " : ""}
        </span>
      ))}
    </div>
  );
}
