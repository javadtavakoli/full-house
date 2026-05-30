const STEPS = [
  { key: "sp", label: "SP" },
  { key: "impl", label: "Impl" },
  { key: "review", label: "Review" },
  { key: "test", label: "Test" },
] as const;

export function PhaseStepper({ status }: { status: string }) {
  const active = activeStep(status);
  return (
    <div className="flex gap-2 justify-center text-xs">
      {STEPS.map((s, i) => (
        <span key={s.key} className={i === active ? "font-semibold text-foreground" : "text-muted-foreground"}>
          {s.label}{i < STEPS.length - 1 ? " → " : ""}
        </span>
      ))}
    </div>
  );
}

function activeStep(status: string): number {
  if (status.startsWith("sp_")) return 0;
  if (status.startsWith("dur_impl")) return 1;
  if (status.startsWith("dur_review")) return 2;
  if (status.startsWith("dur_test")) return 3;
  return -1;
}
