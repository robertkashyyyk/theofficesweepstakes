/* =========================================================================
   Tournament schedule tests — knockout template, third-slot allocation, and
   resolution of the full 104-match plan from the live groups.
   ========================================================================= */
import { describe, it, expect } from "vitest";
import { KNOCKOUT_TEMPLATE, assignThirds, resolveSchedule } from "../schedule";
import { groupFixtures } from "../groupStage";
import type { Game } from "../types";

const LETTERS = "ABCDEFGHIJKL".split("");
const groups = (): Record<string, string[]> =>
  Object.fromEntries(LETTERS.map((g) => [g, [1, 2, 3, 4].map((n) => `${g}${n}`)]));
const allGroupGames = (): Game[] =>
  groupFixtures(groups()).map((f) => ({ gameIndex: f.index, score: "2-0", label: "" }));

const SLOTS: Record<number, string> = { 74: "ABCDF", 77: "CDFGH", 79: "CEFHI", 80: "EHIJK", 81: "BEFIJ", 82: "AEHIJ", 85: "EFGIJ", 87: "DEIJL" };

describe("KNOCKOUT_TEMPLATE", () => {
  it("has 32 matches numbered 73..104", () => {
    expect(KNOCKOUT_TEMPLATE.length).toBe(32);
    expect(KNOCKOUT_TEMPLATE.map((e) => e.match)).toEqual(Array.from({ length: 32 }, (_, i) => 73 + i));
  });
});

describe("assignThirds", () => {
  it("gives a valid, distinct, complete allocation for sample combinations", () => {
    const combos = [
      ["A", "B", "C", "D", "E", "F", "G", "H"],
      ["E", "F", "G", "H", "I", "J", "K", "L"],
      ["A", "B", "C", "D", "I", "J", "K", "L"],
    ];
    for (const combo of combos) {
      const a = assignThirds(combo);
      expect(a).not.toBeNull();
      const used = Object.values(a!);
      expect(new Set(used).size).toBe(8);                 // distinct
      expect(new Set(used)).toEqual(new Set(combo));      // all qualified placed
      for (const [m, g] of Object.entries(a!)) expect(SLOTS[+m].includes(g)).toBe(true); // respects constraint
    }
  });
});

describe("resolveSchedule", () => {
  it("produces 104 entries: 72 group + 32 knockout", () => {
    const s = resolveSchedule(groups(), []);
    expect(s.length).toBe(104);
    expect(s.filter((e) => e.stage === "Group").length).toBe(72);
    expect(s.filter((e) => e.stage !== "Group").length).toBe(32);
  });

  it("shows placeholders before the group stage completes", () => {
    const m74 = resolveSchedule(groups(), []).find((e) => e.match === 74)!;
    expect(m74.a).toBe("Winner Grp E");
    expect(m74.b).toBe("3rd A/B/C/D/F");
  });

  it("fills winner / runner-up / thirds once groups complete", () => {
    const g = groups();
    const m74 = resolveSchedule(g, allGroupGames()).find((e) => e.match === 74)!;
    expect(g.E).toContain(m74.a);              // real winner of group E
    expect(m74.a).not.toMatch(/Winner Grp/);
    expect(m74.b).not.toMatch(/^3rd /);        // a real 3rd-placed team
  });
});
