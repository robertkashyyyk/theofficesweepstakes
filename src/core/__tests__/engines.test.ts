/* =========================================================================
   Engine-boundary tests. The `tournament` engine must be a behaviour-preserving
   wrapper over the pure core — these assert it delegates identically, so the
   determinism golden tests (which test the core directly) still fully cover it.
   ========================================================================= */
import { describe, it, expect } from "vitest";
import { ENGINES, getEngine, tournament } from "../engines";
import { dealTickets } from "../dealing";
import { compute, projection } from "../scoring";
import { scoreFor } from "../prng";
import { DEFAULT_PRIZES, GROUPS, SCORER_POOL, TOTAL_GAMES } from "../constants";
import { mulberry32 } from "../prng";
import type { Config, Results } from "../types";

const wcData = { groups: GROUPS, scorerPool: SCORER_POOL, totalGames: TOTAL_GAMES };

describe("engine registry", () => {
  it("resolves tournament by key", () => {
    expect(getEngine("tournament")).toBe(tournament);
    expect(ENGINES.tournament).toBe(tournament);
  });
  it("throws loudly on an unknown engine", () => {
    expect(() => getEngine("field_draw")).toThrow(/Unknown engine/);
  });
});

describe("tournament engine delegates to the core unchanged", () => {
  it("scoreFor matches the core rotation", () => {
    for (const [seed, gi, pi] of [[0, 0, 0], [1234, 50, 7], [4294967295, 103, 80]]) {
      expect(tournament.scoreFor(seed, gi, pi)).toBe(scoreFor(seed, gi, pi));
    }
  });

  it("deal matches dealTickets given the same seeded rng", () => {
    const inputs = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, createdAt: 1000 + i }));
    const viaEngine = tournament.deal(inputs, 500, DEFAULT_PRIZES, wcData, mulberry32(42));
    const viaCore = dealTickets(inputs, 500, DEFAULT_PRIZES, mulberry32(42));
    expect(viaEngine).toEqual(viaCore);
  });

  it("compute matches core compute", () => {
    const players = [
      { id: "a", name: "a", createdAt: 1, winnerTeams: ["Brazil"], finalistTeams: [], groupWinnerTeams: ["Brazil"], groupRunnerUpTeams: [], bootPlayers: [] },
      { id: "b", name: "b", createdAt: 2, winnerTeams: [], finalistTeams: [], groupWinnerTeams: [], groupRunnerUpTeams: [], bootPlayers: [] },
    ];
    const config: Config = { fund: 500, seed: 1234, generated: true, prizes: DEFAULT_PRIZES };
    const results: Results = { games: [], groupFirst: { C: "Brazil" }, groupSecond: {}, finalists: [], champion: "Brazil", topScorer: "" };
    expect(tournament.compute(players, results, config, wcData)).toEqual(compute(players, results, config));
  });

  it("projection matches core projection", () => {
    expect(tournament.projection(500, DEFAULT_PRIZES, wcData)).toEqual(projection(500, DEFAULT_PRIZES));
  });
});
