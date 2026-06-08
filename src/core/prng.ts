/* =========================================================================
   DETERMINISTIC ROTATION — the single most important thing to get right (§5).

   Ported BYTE-FOR-BYTE from world-cup-sweepstake.jsx. Server and client MUST
   agree, and past games must recompute identically forever. Do NOT "tidy" the
   bit-twiddling, change the multiplier 2654435761, or alter the Fisher–Yates
   loop direction — any of those silently rewrites who won past games.

   The only inputs that may EVER change a result are:
     - seed         (stored once at generation, immutable)
     - gameIndex    (immutable, monotonic, never renumbered)
     - playerIndex  (stable sort position, frozen after generation)
   ========================================================================= */
import { SCORELINES } from "./constants";
import type { Player, Rng } from "./types";

/** mulberry32 PRNG — verbatim port. `a` is coerced to int32 internally. */
export function mulberry32(a: number): Rng {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher–Yates — verbatim port. Returns a NEW array; input untouched. */
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const r = mulberry32(seed >>> 0);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The scoreline held by `playerIndex` for `gameIndex` — verbatim port.
 * `>>> 0` keeps the seed mix a 32-bit unsigned int. This is the canonical
 * rotation function; both client preview and server scoring call it.
 */
export function scoreFor(seed: number, gameIndex: number, playerIndex: number): string {
  const s = (seed + (gameIndex + 1) * 2654435761) >>> 0;
  const deck = seededShuffle(SCORELINES, s);
  return deck[playerIndex % deck.length];
}

/**
 * Stable player ordering — the definition of `playerIndex`.
 * Sort by createdAt asc, tie-break by id asc. MUST match everywhere.
 */
export function sortedPlayers(players: readonly Player[]): Player[] {
  return [...players].sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** player id -> playerIndex, derived from the stable order. */
export function playerIndexMap(players: readonly Player[]): Record<string, number> {
  const ordered = sortedPlayers(players);
  const idx: Record<string, number> = {};
  ordered.forEach((p, i) => {
    idx[p.id] = i;
  });
  return idx;
}

/**
 * Non-deterministic shuffle used only at generation for the value-equalised
 * deal (those assignments are PERSISTED, not re-derived, so they need not be
 * reproducible from the seed). RNG is injectable purely so tests can pin it.
 */
export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
