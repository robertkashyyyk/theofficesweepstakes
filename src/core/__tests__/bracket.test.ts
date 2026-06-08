/* =========================================================================
   Knockout bracket tests — structure + reproducible simulation.
   ========================================================================= */
import { describe, it, expect } from "vitest";
import { qualifiers, seedBracket, playBracket, deriveFinalChampion, simulateTournament } from "../bracket";
import { mulberry32 } from "../prng";

// 12 groups (A..L) of 4 teams each — the World Cup shape.
const LETTERS = "ABCDEFGHIJKL".split("");
const groups = (): Record<string, string[]> =>
  Object.fromEntries(LETTERS.map((g) => [g, [1, 2, 3, 4].map((n) => `${g}${n}`)]));

describe("qualifiers + seedBracket", () => {
  it("produces 32 qualifiers and a 16-match Round of 32", () => {
    const order = groups();
    const qs = qualifiers(order, LETTERS.slice(0, 8));
    expect(qs.length).toBe(32);
    expect(new Set(qs).size).toBe(32); // all distinct
    const r32 = seedBracket(qs);
    expect(r32.matches.length).toBe(16);
    expect(r32.name).toBe("Round of 32");
  });

  it("never pairs two group winners against each other in R32", () => {
    const order = groups();
    const winners = new Set(LETTERS.map((g) => order[g][0]));
    const r32 = seedBracket(qualifiers(order, LETTERS.slice(0, 8)));
    for (const m of r32.matches) {
      expect(winners.has(m.a) && winners.has(m.b)).toBe(false);
    }
  });
});

describe("playBracket", () => {
  const pickA = (a: string) => a; // deterministic: 'a' always wins
  it("runs R32 → Final with halving rounds", () => {
    const qs = qualifiers(groups(), LETTERS.slice(0, 8));
    const b = playBracket(qs, pickA);
    expect(b.rounds.map((r) => r.matches.length)).toEqual([16, 8, 4, 2, 1]);
    expect(b.rounds.map((r) => r.name)).toEqual([
      "Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Final",
    ]);
  });

  it("each round's teams are the previous round's winners", () => {
    const qs = qualifiers(groups(), LETTERS.slice(0, 8));
    const b = playBracket(qs, (a, b2) => (a < b2 ? a : b2));
    for (let i = 1; i < b.rounds.length; i++) {
      const prevWinners = new Set(b.rounds[i - 1].matches.map((m) => m.winner));
      const thisTeams = new Set(b.rounds[i].matches.flatMap((m) => [m.a, m.b]));
      expect(thisTeams).toEqual(prevWinners);
    }
  });

  it("champion is one of the two finalists", () => {
    const qs = qualifiers(groups(), LETTERS.slice(0, 8));
    const b = playBracket(qs, (a, b2) => (a < b2 ? a : b2));
    const { finalists, champion } = deriveFinalChampion(b);
    expect(finalists.length).toBe(2);
    expect(finalists).toContain(champion);
  });
});

describe("simulateTournament", () => {
  it("fills groups, a full bracket, finalists and champion", () => {
    const sim = simulateTournament(groups(), mulberry32(7));
    expect(Object.keys(sim.groupFirst).length).toBe(12);
    expect(Object.keys(sim.groupSecond).length).toBe(12);
    expect(sim.bracket.rounds.map((r) => r.matches.length)).toEqual([16, 8, 4, 2, 1]);
    expect(sim.finalists).toContain(sim.champion);
  });

  it("is reproducible under the same seeded rng", () => {
    const a = simulateTournament(groups(), mulberry32(42));
    const b = simulateTournament(groups(), mulberry32(42));
    expect(a).toEqual(b);
  });
});
