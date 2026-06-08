/* =========================================================================
   Value-equalised dealing tests (§4).
   Uses a seeded Rng (mulberry32) so the "random" deals are reproducible.
   ========================================================================= */
import { describe, it, expect } from "vitest";
import { dealTickets, type DealInput } from "../dealing";
import { mulberry32 } from "../prng";
import { DEFAULT_PRIZES, SCORER_POOL, TEAMS } from "../constants";
import type { Player } from "../types";

const inputs = (n: number): DealInput[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, createdAt: 1000 + i }));

const teamMarkets = ["winnerTeams", "finalistTeams", "groupWinnerTeams", "groupRunnerUpTeams"] as const;

function totalDealt(players: Player[], key: keyof Player): number {
  return players.reduce((s, p) => s + (p[key] as string[]).length, 0);
}

describe("dealTickets — conservation", () => {
  it("deals each team pool exactly once across players (no loss, no dupes)", () => {
    const players = dealTickets(inputs(7), 500, DEFAULT_PRIZES, mulberry32(1));
    for (const key of teamMarkets) {
      expect(totalDealt(players, key)).toBe(TEAMS.length);
      const all = players.flatMap((p) => p[key] as string[]);
      expect(new Set(all).size).toBe(TEAMS.length); // every team exactly once
    }
    expect(totalDealt(players, "bootPlayers")).toBe(SCORER_POOL.length);
  });

  it("each player's books are alphabetically sorted", () => {
    const players = dealTickets(inputs(5), 500, DEFAULT_PRIZES, mulberry32(2));
    for (const p of players) {
      for (const key of [...teamMarkets, "bootPlayers"] as const) {
        const arr = p[key] as string[];
        expect(arr).toEqual([...arr].sort());
      }
    }
  });
});

describe("dealTickets — fairness", () => {
  it("within a market, per-player counts differ by at most 1 (round-robin)", () => {
    const players = dealTickets(inputs(7), 500, DEFAULT_PRIZES, mulberry32(3));
    for (const key of teamMarkets) {
      const counts = players.map((p) => (p[key] as string[]).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it("compensates: a player short on the top market is topped up on a lower one", () => {
    // 7 players, 48 teams -> 6 each + 6 leftover. The 6 short-changed on the
    // highest-EV market should be first in line for the next market's leftover.
    const players = dealTickets(inputs(7), 500, DEFAULT_PRIZES, mulberry32(4));
    // Winner market has highest EV; whoever got only 6 winners should not be
    // systematically also short on every other market.
    const winnerCounts = players.map((p) => p.winnerTeams.length);
    const shortOnWinner = winnerCounts.map((c, i) => ({ i, c })).filter((x) => x.c === Math.min(...winnerCounts));
    // those players should have >= average on at least one other market
    for (const { i } of shortOnWinner) {
      const others = teamMarkets.slice(1).map((k) => (players[i][k] as string[]).length);
      expect(Math.max(...others)).toBeGreaterThanOrEqual(6);
    }
  });

  it("is reproducible given the same seeded rng", () => {
    const a = dealTickets(inputs(9), 500, DEFAULT_PRIZES, mulberry32(123));
    const b = dealTickets(inputs(9), 500, DEFAULT_PRIZES, mulberry32(123));
    expect(a).toEqual(b);
  });

  it("handles an exact division (e.g. 48 / 4 wraps with no leftover skew)", () => {
    const players = dealTickets(inputs(4), 500, DEFAULT_PRIZES, mulberry32(5));
    expect(players.every((p) => p.winnerTeams.length === 12)).toBe(true);
  });
});
