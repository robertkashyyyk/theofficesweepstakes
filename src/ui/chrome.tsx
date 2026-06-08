/* =========================================================================
   Shared UI chrome — small, dependency-free building blocks reused across the
   onboarding flow so the screens feel like one product. (Leaf module: imports
   nothing else from ui/, to avoid import cycles.)
   ========================================================================= */

/** Slim onboarding progress: "1 Account · 2 Staff · 3 Sweepstake". */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div key={s} className={"step-pill" + (i === current ? " on" : i < current ? " done" : "")}>
          <span className="step-pill-n">{i < current ? "✓" : i + 1}</span>
          {s}
        </div>
      ))}
    </div>
  );
}
