/* =========================================================================
   ENGINE INTERFACE — the "engines (code) vs types (data)" boundary.

   An engine is versioned, tested deterministic logic. A *type* (catalogue data)
   picks an engine and supplies its pools/config. Phase B ships one engine,
   `tournament` (the World Cup logic); Phase C adds `field_draw`.

   The engine WRAPS the pure core (prng/dealing/scoring) — it never reimplements
   the deterministic maths. Keeping this a thin boundary is what lets the core's
   golden tests stay untouched.
   ========================================================================= */
import type { Config, PrizeAmount, Player, Prizes, Projection, Results, Rng, Scoring } from "../types";
// Reuse the core's DealInput (defined in dealing.ts) rather than redefining it,
// so core/index.ts can re-export both modules without a name collision.
import type { DealInput } from "../dealing";

/** Lightweight engine descriptor for the catalogue / pickers / validation. */
export interface EngineMeta {
  key: string;
  label: string;
  sportDefault: string;
}

/** Data carried by a `tournament` type (the pools that vary per tournament). */
export interface TournamentData {
  groups: Record<string, string[]>;
  scorerPool: string[];
  totalGames: number;
}

/* ---- field_draw engine (draw-one-from-a-field: Grand National, etc.) ---- */

/** Data carried by a `field_draw` type — the pool of entrants. */
export interface FieldDrawData {
  field: string[];
}

/** Prizes for a field_draw sweep. 1st takes the pot remainder (jackpot);
 *  `placePrizes[i]` is the prize for finishing position i+2 (2nd, 3rd, 4th…). */
export interface FieldDrawPrizes {
  placePrizes: PrizeAmount[];
}

/** One player's drawn entrants. */
export interface FieldDrawHolding {
  playerId: string;
  name: string;
  entrants: string[];
}

/** The finishing order, 1st → nth (entrant names). */
export interface FieldDrawOutcome {
  finishers: string[];
}

export interface FieldDrawScore {
  per: Record<string, { breakdown: Record<string, number>; total: number }>;
  paid: number;
  jackpot: number;
  /** playerId holding the winner (1st), or null if not yet set. */
  winnerHolder: string | null;
}

/** Engine-specific data blob (snapshotted onto each sweepstake at creation). */
export type EngineData = TournamentData | FieldDrawData | Record<string, unknown>;

/**
 * A deterministic engine. All methods are pure; `data` is the type's snapshot.
 * `scoreFor` has no `data` arg for `tournament` — its rotation pool is a fixed
 * engine constant (correct-score 0-0..4-4 is universal), so catalogue edits can
 * never rewrite a past game.
 */
export interface Engine {
  /** Registry key, also stored on the sweepstake row (e.g. "tournament"). */
  key: string;
  /** Human label for the catalogue / pickers. */
  label: string;
  /** Default sport label suggested when creating a type for this engine. */
  sportDefault: string;
  deal(inputs: DealInput[], fund: number, prizes: Prizes, data: EngineData, rng?: Rng): Player[];
  scoreFor(seed: number, gameIndex: number, playerIndex: number): string;
  compute(players: Player[], results: Results, config: Config, data: EngineData): Scoring;
  projection(fund: number, prizes: Prizes, data: EngineData): Projection;
}
