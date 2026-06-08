/* =========================================================================
   Engine registry. A sweepstake stores its `engine` key; ENGINE_META maps each
   key to its descriptor (label/sport) for the catalogue picker + validation.
   Engine LOGIC lives in the per-engine modules and is imported directly by the
   code paths that run it. New format = a new engine module + its own tests.
   ========================================================================= */
import { tournament } from "./tournament";
import { drawField, fieldDrawMeta, projectFieldDraw, scoreFieldDraw } from "./field_draw";
import type { EngineMeta } from "./types";

export * from "./types";

/** Descriptor for every registered engine — drives the /admin engine picker. */
export const ENGINE_META: Record<string, EngineMeta> = {
  [tournament.key]: { key: tournament.key, label: tournament.label, sportDefault: tournament.sportDefault },
  [fieldDrawMeta.key]: fieldDrawMeta,
};

// tournament engine object (wraps the core); field_draw native logic.
export { tournament };
export { drawField, scoreFieldDraw, projectFieldDraw, fieldDrawMeta };
