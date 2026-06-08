/* =========================================================================
   Knockout bracket — structural helpers for a 12-group, 48-team tournament
   (the World Cup 2026 shape): 12 group winners + 12 runners-up + 8 best
   third-placed = 32 → R32 → R16 → QF → SF → Final.

   PURE + framework-agnostic. This is bracket STRUCTURE only: it derives the two
   finalists + champion that the existing scoring already consumes. It does NOT
   change prizes or `compute()` — so the determinism/scoring tests are untouched.

   The R32 seeding is a valid, balanced single-elimination template (group
   winners spread so two winners never meet in R32). The "8 best thirds" pick is
   REPRESENTATIVE (a seeded choice among the 12), not the official FIFA
   thirds-assignment lookup table — good enough for a dry-run / visualisation.
   ========================================================================= */
import { shuffle } from "./prng";
import type { Rng } from "./types";

export interface KOMatch {
  a: string;
  b: string;
  winner: string; // "" until played
}
export interface KORound {
  name: string;
  matches: KOMatch[];
}
export interface Bracket {
  rounds: KORound[]; // R32, R16, QF, SF, Final
}

function roundName(matchCount: number): string {
  return (
    { 16: "Round of 32", 8: "Round of 16", 4: "Quarter-finals", 2: "Semi-finals", 1: "Final" }[matchCount] ??
    `Round of ${matchCount * 2}`
  );
}

/**
 * Order the 32 qualifiers so adjacent pairs are R32 matchups: each group winner
 * meets a runner-up/third, and the leftover others meet each other.
 * `groupOrder[g]` is the group's finishing order [1st,2nd,3rd,4th]; `thirdLetters`
 * are the 8 group letters whose third-placed team qualifies.
 */
export function qualifiers(groupOrder: Record<string, string[]>, thirdLetters: string[]): string[] {
  const letters = Object.keys(groupOrder).sort();
  const firsts = letters.map((g) => groupOrder[g][0]);
  const seconds = letters.map((g) => groupOrder[g][1]);
  const thirds = thirdLetters.map((g) => groupOrder[g][2]);
  const others = [...seconds, ...thirds];

  const arr: string[] = [];
  for (let i = 0; i < firsts.length; i++) arr.push(firsts[i], others[i]); // winner vs other
  for (let i = firsts.length; i + 1 < others.length; i += 2) arr.push(others[i], others[i + 1]); // other vs other
  return arr;
}

/** Pair an ordered qualifier list into the opening round's matches. */
export function seedBracket(qs: string[]): KORound {
  const matches: KOMatch[] = [];
  for (let i = 0; i + 1 < qs.length; i += 2) matches.push({ a: qs[i], b: qs[i + 1], winner: "" });
  return { name: roundName(matches.length), matches };
}

/** Play a round: pick each match's winner. `pickWinner` is injected. */
export function playRound(round: KORound, pickWinner: (a: string, b: string) => string): KORound {
  return { name: round.name, matches: round.matches.map((m) => ({ ...m, winner: pickWinner(m.a, m.b) })) };
}

/** Build the next round by pairing this round's winners, or null at the final. */
export function nextRound(played: KORound): KORound | null {
  const winners = played.matches.map((m) => m.winner);
  if (winners.length < 2) return null;
  const matches: KOMatch[] = [];
  for (let i = 0; i + 1 < winners.length; i += 2) matches.push({ a: winners[i], b: winners[i + 1], winner: "" });
  return { name: roundName(matches.length), matches };
}

/** Seed + play every round through to the final. */
export function playBracket(qs: string[], pickWinner: (a: string, b: string) => string): Bracket {
  const rounds: KORound[] = [];
  let round = seedBracket(qs);
  // guard against a malformed (non power-of-two) seed
  for (let guard = 0; guard < 12; guard++) {
    const played = playRound(round, pickWinner);
    rounds.push(played);
    const nxt = nextRound(played);
    if (!nxt) break;
    round = nxt;
  }
  return { rounds };
}

/** The two finalists and the champion, read off the final round. */
export function deriveFinalChampion(bracket: Bracket): { finalists: string[]; champion: string } {
  const final = bracket.rounds[bracket.rounds.length - 1]?.matches[0];
  if (!final) return { finalists: [], champion: "" };
  return { finalists: [final.a, final.b], champion: final.winner };
}

export interface SimulatedTournament {
  groupFirst: Record<string, string>;
  groupSecond: Record<string, string>;
  bracket: Bracket;
  finalists: string[];
  champion: string;
}

/**
 * Randomly play a whole tournament from its groups: order each group, pick the 8
 * best thirds, seed + play the bracket. Rng injected so it's reproducible/testable.
 * Expects a 12-group, 4-per-group shape (the World Cup format).
 */
export function simulateTournament(teamsByGroup: Record<string, string[]>, rng: Rng): SimulatedTournament {
  const letters = Object.keys(teamsByGroup).sort();
  const groupOrder: Record<string, string[]> = {};
  const groupFirst: Record<string, string> = {};
  const groupSecond: Record<string, string> = {};
  letters.forEach((g) => {
    const ord = shuffle(teamsByGroup[g], rng);
    groupOrder[g] = ord;
    groupFirst[g] = ord[0];
    groupSecond[g] = ord[1];
  });
  const thirdLetters = shuffle(letters, rng).slice(0, 8).sort();
  const qs = qualifiers(groupOrder, thirdLetters);
  const pick = (a: string, b: string) => (rng() < 0.5 ? a : b);
  const bracket = playBracket(qs, pick);
  const { finalists, champion } = deriveFinalChampion(bracket);
  return { groupFirst, groupSecond, bracket, finalists, champion };
}
