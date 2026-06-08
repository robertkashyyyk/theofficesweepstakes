/* =========================================================================
   Engine registry. A sweepstake stores its `engine` key; this maps it back to
   the code. New format = a new engine registered here (+ its own tests).
   ========================================================================= */
import { tournament } from "./tournament";
import type { Engine } from "./types";

export * from "./types";

export const ENGINES: Record<string, Engine> = {
  [tournament.key]: tournament,
};

/** Resolve an engine by key; throws on an unknown key (fail loud, not silent). */
export function getEngine(key: string): Engine {
  const e = ENGINES[key];
  if (!e) throw new Error(`Unknown engine: ${key}`);
  return e;
}

export { tournament };
