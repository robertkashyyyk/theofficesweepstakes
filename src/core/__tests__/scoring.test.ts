/* =========================================================================
   Scoring tests (§6) — pure recompute from players + results + config.
   Includes the critical append-only property: results key off gameIndex, so
   removing/editing a middle game never shifts other games' winners.
   ========================================================================= */
import { describe, it, expect } from "vitest";
import { compute } from "../scoring";
import { scoreFor, sortedPlayers } from "../prng";
import type { Config, Game, Player, Results } from "../types";

const SEED = 1234;

const baseConfig: Config = {
  fund: 500,
  seed: SEED,
  generated: true,
  prizes: {
    perGame: 1,
    finalist: { mode: "£", value: 30 },
    groupWinner: { mode: "£", value: 4 },
    groupRunnerUp: { mode: "£", value: 2 },
    boot: { mode: "£", value: 40 },
  },
};

function player(id: string, createdAt: number, over: Partial<Player> = {}): Player {
  return {
    id, name: id, createdAt,
    winnerTeams: [], finalistTeams: [], groupWinnerTeams: [], groupRunnerUpTeams: [], bootPlayers: [],
    ...over,
  };
}

const emptyResults = (): Results => ({
  games: [], groupFirst: {}, groupSecond: {}, finalists: [], champion: "", topScorer: "",
});

/** Build a game at gameIndex `gi` whose score the given player holds. */
function winningGameFor(players: Player[], gi: number, winnerId: string, label = "Match"): Game {
  const idx: Record<string, number> = {};
  sortedPlayers(players).forEach((p, i) => (idx[p.id] = i));
  return { gameIndex: gi, score: scoreFor(SEED, gi, idx[winnerId]), label };
}

describe("daily scorelines", () => {
  it("pays the holder and leaves jackpot = fund - paid", () => {
    const players = [player("a", 1), player("b", 2), player("c", 3)];
    const results = emptyResults();
    results.games = [winningGameFor(players, 0, "a")];
    const s = compute(players, results, baseConfig);
    expect(s.per["a"].breakdown.daily).toBe(1);
    expect(s.paid).toBe(1);
    expect(s.jackpot).toBe(500 - 1);
  });

  it("splits perGame when several players hold the same score", () => {
    // A split needs two players whose playerIndices are congruent mod 25.
    // With 26 players, pi=0 and pi=25 always map to deck[0] -> same scoreline.
    const players = Array.from({ length: 26 }, (_, i) => player(`p${String(i).padStart(2, "0")}`, 1 + i));
    const idx: Record<string, number> = {};
    sortedPlayers(players).forEach((p, i) => (idx[p.id] = i));
    const lowId = Object.keys(idx).find((id) => idx[id] === 0)!;
    const highId = Object.keys(idx).find((id) => idx[id] === 25)!;
    expect(scoreFor(SEED, 0, 0)).toBe(scoreFor(SEED, 0, 25)); // the collision

    const results = emptyResults();
    results.games = [{ gameIndex: 0, score: scoreFor(SEED, 0, 0), label: "" }];
    const s = compute(players, results, baseConfig);
    expect(s.per[lowId].breakdown.daily).toBeCloseTo(0.5);
    expect(s.per[highId].breakdown.daily).toBeCloseTo(0.5);
    expect(s.paid).toBeCloseTo(1); // total still one perGame
  });

  it("unheld scorelines pay nobody and stay in the pot", () => {
    const players = [player("a", 1), player("b", 2)];
    const idx: Record<string, number> = {};
    sortedPlayers(players).forEach((p, i) => (idx[p.id] = i));
    const held = new Set(players.map((p) => scoreFor(SEED, 0, idx[p.id])));
    const unheld = ["0-0","1-0","2-0","3-0","4-0","0-1","1-1","2-1","3-1","4-1"].find((sc) => !held.has(sc))!;
    const results = emptyResults();
    results.games = [{ gameIndex: 0, score: unheld, label: "" }];
    const s = compute(players, results, baseConfig);
    expect(s.paid).toBe(0);
    expect(s.jackpot).toBe(500);
  });
});

describe("append-only / gameIndex independence (the trap)", () => {
  it("removing a middle game does not change other games' winners", () => {
    const players = [player("a", 1), player("b", 2), player("c", 3)];
    const g0 = winningGameFor(players, 0, "a");
    const g1 = winningGameFor(players, 1, "b");
    const g2 = winningGameFor(players, 2, "c");

    const withAll = compute(players, { ...emptyResults(), games: [g0, g1, g2] }, baseConfig);
    // drop the MIDDLE game (gameIndex 1) — gameIndex stays gapped, not renumbered
    const withGap = compute(players, { ...emptyResults(), games: [g0, g2] }, baseConfig);

    expect(withAll.gameWinners[0]).toEqual(["a"]); // g0 winner
    expect(withGap.per["a"].breakdown.daily).toBe(1); // a still won game 0
    expect(withGap.per["c"].breakdown.daily).toBe(1); // c still won game 2
    expect(withGap.per["b"]?.breakdown.daily ?? 0).toBe(0); // b's game gone, nothing shifted
  });

  it("is order-insensitive in the games array (sorts by gameIndex)", () => {
    const players = [player("a", 1), player("b", 2)];
    const g0 = winningGameFor(players, 0, "a");
    const g5 = winningGameFor(players, 5, "b");
    const inOrder = compute(players, { ...emptyResults(), games: [g0, g5] }, baseConfig);
    const reversed = compute(players, { ...emptyResults(), games: [g5, g0] }, baseConfig);
    expect(reversed.per["a"].total).toBe(inOrder.per["a"].total);
    expect(reversed.per["b"].total).toBe(inOrder.per["b"].total);
  });
});

describe("groups, finalists, boot, champion", () => {
  it("awards group winner / runner-up / finalist / boot correctly", () => {
    const players = [
      player("a", 1, { groupWinnerTeams: ["Brazil"], finalistTeams: ["France"], bootPlayers: ["Harry Kane (England)"] }),
      player("b", 2, { groupRunnerUpTeams: ["Scotland"] }),
    ];
    const results: Results = {
      ...emptyResults(),
      groupFirst: { C: "Brazil" },
      groupSecond: { C: "Scotland" },
      finalists: ["France", "Spain"],
      topScorer: "Harry Kane (England)",
    };
    const s = compute(players, results, baseConfig);
    expect(s.per["a"].breakdown.groupWinner).toBe(4);
    expect(s.per["a"].breakdown.finalist).toBe(30);
    expect(s.per["a"].breakdown.boot).toBe(40);
    expect(s.per["b"].breakdown.groupRunnerUp).toBe(2);
  });

  it("champion holder takes fund - everything else paid", () => {
    const players = [
      player("a", 1, { winnerTeams: ["Brazil"], groupWinnerTeams: ["Brazil"] }),
      player("b", 2, {}),
    ];
    const results: Results = { ...emptyResults(), groupFirst: { C: "Brazil" }, champion: "Brazil" };
    const s = compute(players, results, baseConfig);
    // a earns £4 group winner, then the jackpot remainder
    expect(s.per["a"].breakdown.groupWinner).toBe(4);
    expect(s.championHolder).toBe("a");
    expect(s.per["a"].breakdown.jackpot).toBe(500 - 4);
    expect(s.per["a"].total).toBe(500); // a holds champion AND the only small prize
    expect(s.jackpot).toBe(500 - 4);
  });

  it("an unheld champion leaves the jackpot unassigned", () => {
    const players = [player("a", 1, { winnerTeams: ["France"] })];
    const results: Results = { ...emptyResults(), champion: "Brazil" };
    const s = compute(players, results, baseConfig);
    expect(s.championHolder).toBeNull();
    expect(s.per["a"].breakdown.jackpot).toBeUndefined();
  });
});
