/* =========================================================================
   Shared UI chrome — small, dependency-free building blocks reused across the
   onboarding flow so the screens feel like one product. (Leaf module: imports
   nothing else from ui/, to avoid import cycles.)
   ========================================================================= */

/** Geometric ticket-stub logomark. Inherits colour via currentColor. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6V7z" fill="currentColor" />
      <path d="M13 5.5v13" stroke="#D9F020" strokeWidth="1.6" strokeDasharray="2 2" strokeLinecap="round" />
      <circle cx="8" cy="12" r="2" fill="#D9F020" />
    </svg>
  );
}

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
