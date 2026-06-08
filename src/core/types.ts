/* =========================================================================
   Core domain types — framework-agnostic, no React / DB / Supabase imports.
   These mirror the suggested data model in §8 of the build brief.
   ========================================================================= */

/** A prize that can be expressed as a flat £ amount or a % of the fund. */
export interface PrizeAmount {
  mode: "£" | "%";
  value: number;
}

/** Prize configuration. `perGame` is always a flat £ amount (per logged game). */
export interface Prizes {
  perGame: number;
  finalist: PrizeAmount;
  groupWinner: PrizeAmount;
  groupRunnerUp: PrizeAmount;
  boot: PrizeAmount;
}

/** Immutable sweepstake configuration, set at generation time. */
export interface Config {
  fund: number;
  /** 32-bit unsigned seed driving the per-game correct-score rotation. */
  seed: number;
  prizes: Prizes;
  generated: boolean;
}

/**
 * A dealt ticket book for one player. The five one-time markets are dealt
 * once at generation and frozen. The correct-score market is NOT stored here —
 * it is derived per game from (seed, gameIndex, playerIndex). See prng.ts.
 *
 * `createdAt` + `id` define the player's STABLE sort position, which becomes
 * the rotation's `playerIndex`. Both must be immutable after generation.
 */
export interface Player {
  id: string;
  name: string;
  /** Epoch ms (or any monotonic value); first sort key for playerIndex. */
  createdAt: number;
  winnerTeams: string[];
  finalistTeams: string[];
  groupWinnerTeams: string[];
  groupRunnerUpTeams: string[];
  bootPlayers: string[];
}

/**
 * One logged match result. `gameIndex` is the immutable, monotonic rotation
 * key (0-based). Games are append-only and undo-last-only — never renumber.
 * `score` is "t1-t2" in FIXTURE ORDER (team listed first scores first).
 */
export interface Game {
  gameIndex: number;
  score: string;
  label: string;
}

export interface Results {
  games: Game[];
  /** group letter -> team that finished 1st */
  groupFirst: Record<string, string>;
  /** group letter -> team that finished 2nd */
  groupSecond: Record<string, string>;
  finalists: string[];
  champion: string;
  topScorer: string;
}

/** Per-player money breakdown produced by `compute`. */
export interface PlayerScore {
  breakdown: Record<string, number>;
  total: number;
}

export interface Scoring {
  per: Record<string, PlayerScore>;
  paid: number;
  jackpot: number;
  championHolder: string | null;
  /** gameWinners[gameIndex] = list of player ids holding that game's score. */
  gameWinners: string[][];
  /** players in stable (playerIndex) order. */
  ordered: Player[];
  /** player id -> playerIndex */
  idx: Record<string, number>;
}

export interface ProjectionRow {
  name: string;
  unit: number;
  count: number;
  total: number;
  note: string;
}

export interface Projection {
  rows: ProjectionRow[];
  committed: number;
  winnerFloor: number;
  fund: number;
}

/** A pure 0..1 random source — injectable so dealing is testable. */
export type Rng = () => number;
