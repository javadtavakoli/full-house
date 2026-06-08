const ADVANCED_STEPS = [
  { key: "sp", label: "SP" },
  { key: "impl", label: "Impl" },
  { key: "review", label: "Review" },
  { key: "test", label: "Test" },
] as const;

const SIMPLE_STEPS = [
  { key: "sp", label: "SP" },
  // dur_impl is the single Estimation phase in simple mode
  { key: "impl", label: "Estimation" },
] as const;

const SP_ONLY = [{ key: "sp", label: "SP" }] as const;

export function PhaseStepper({
  status,
  mode = "advanced",
  withEstimation = true,
}: {
  status: string;
  mode?: "simple" | "advanced";
  withEstimation?: boolean;
}) {
  const steps = !withEstimation
    ? SP_ONLY
    : mode === "simple"
      ? SIMPLE_STEPS
      : ADVANCED_STEPS;
  const active = activeStep(status);
  return (
    <div className="flex gap-2 justify-center text-xs">
      {steps.map((s, i) => (
        <span
          key={s.key}
          className={
            i === active ? "font-semibold text-foreground" : "text-muted-foreground"
          }
        >
          {s.label}
          {i < steps.length - 1 ? " → " : ""}
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
