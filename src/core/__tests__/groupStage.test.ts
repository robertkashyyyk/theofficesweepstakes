/* =========================================================================
   Group-stage tests — fixtures (round-robin) + live table computation.
   ========================================================================= */
import { describe, it, expect } from "vitest";
import { groupFixtures, groupTable, deriveGroupPlacings, bestThirds } from "../groupStage";
import type { Game } from "../types";

const LETTERS = "ABCDEFGHIJKL".split("");
const twelve = (): Record<string, string[]> =>
  Object.fromEntries(LETTERS.map((g) => [g, [1, 2, 3, 4].map((n) => `${g}${n}`)]));
const score = (gameIndex: number, s: string): Game => ({ gameIndex, score: s, label: "" });

describe("groupFixtures", () => {
  it("makes 72 fixtures (6 per group), contiguous indices, every team plays 3", () => {
    const fx = groupFixtures(twelve());
    expect(fx.length).toBe(72);
    expect(fx.map((f) => f.index)).toEqual([...Array(72).keys()]);

    const perGroup: Record<string, number> = {};
    const appearances: Record<string, number> = {};
    fx.forEach((f) => {
      perGroup[f.group] = (perGroup[f.group] ?? 0) + 1;
      appearances[f.home] = (appearances[f.home] ?? 0) + 1;
      appearances[f.away] = (appearances[f.away] ?? 0) + 1;
    });
    expect(Object.values(perGroup).every((c) => c === 6)).toBe(true);
    expect(Object.values(appearances).every((c) => c === 3)).toBe(true);
  });

  it("is a complete round-robin within a group (all 6 unique pairings)", () => {
    const fx = groupFixtures({ A: ["a", "b", "c", "d"] });
    const pairs = new Set(fx.map((f) => [f.home, f.away].sort().join("-")));
    expect(pairs.size).toBe(6);
  });
});

describe("groupTable", () => {
  const groups = { A: ["a", "b", "c", "d"] };
  const fx = groupFixtures(groups);

  it("tallies points and goal difference correctly", () => {
    const t = groupTable(groups, [score(fx[0].index, "3-1")]);
    const home = t.A.find((r) => r.team === fx[0].home)!;
    const away = t.A.find((r) => r.team === fx[0].away)!;
    expect(home.pts).toBe(3); expect(home.gd).toBe(2); expect(home.w).toBe(1);
    expect(away.pts).toBe(0); expect(away.gd).toBe(-2); expect(away.l).toBe(1);
  });

  it("awards a point each for a draw", () => {
    const t = groupTable(groups, [score(fx[0].index, "2-2")]);
    expect(t.A.find((r) => r.team === fx[0].home)!.pts).toBe(1);
    expect(t.A.find((r) => r.team === fx[0].away)!.pts).toBe(1);
  });

  it("sums to 12 team-games and 18 points once a group is complete", () => {
    const games = fx.map((f) => score(f.index, "2-0"));
    const t = groupTable(groups, games);
    expect(t.A.reduce((s, r) => s + r.p, 0)).toBe(12);
    expect(t.A.reduce((s, r) => s + r.pts, 0)).toBe(18); // 6 decisive games
    expect(t.A[0].pts).toBeGreaterThanOrEqual(t.A[1].pts); // ranked
  });
});

describe("deriveGroupPlacings", () => {
  const groups = { A: ["a", "b", "c", "d"] };
  const fx = groupFixtures(groups);

  it("sets top-two only when the group is fully played", () => {
    const partial = groupTable(groups, fx.slice(0, 3).map((f) => score(f.index, "1-0")));
    expect(deriveGroupPlacings(partial).groupFirst.A).toBeUndefined();

    const full = groupTable(groups, fx.map((f) => score(f.index, "2-0")));
    const pl = deriveGroupPlacings(full);
    expect(pl.groupFirst.A).toBe(full.A[0].team);
    expect(pl.groupSecond.A).toBe(full.A[1].team);
  });
});

describe("bestThirds", () => {
  it("picks 8 of the 12 third-placed teams", () => {
    const groups = twelve();
    const t = groupTable(groups, groupFixtures(groups).map((f) => score(f.index, "2-0")));
    expect(bestThirds(t).length).toBe(8);
  });
});
