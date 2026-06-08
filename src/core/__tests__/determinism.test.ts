/* =========================================================================
   Determinism / rotation equivalence tests.

   Two layers of protection:
   1. GOLDEN constants captured by running the ORIGINAL .jsx functions in Node.
      These are frozen regression anchors — if the port drifts, they break.
   2. An independent reference re-implementation (a second verbatim copy of the
      .jsx logic, inlined below) swept across many inputs vs. our module.
   ========================================================================= */
import { describe, it, expect } from "vitest";
import { mulberry32, seededShuffle, scoreFor, sortedPlayers } from "../prng";
import { SCORELINES } from "../constants";
import type { Player } from "../types";

/* ---- Layer 2: independent reference (verbatim from world-cup-sweepstake.jsx) ---- */
function refMulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function refSeededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const r = refMulberry32(seed >>> 0);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function refScoreFor(seed: number, gi: number, pi: number): string {
  const s = (seed + (gi + 1) * 2654435761) >>> 0;
  return refSeededShuffle(SCORELINES, s)[pi % SCORELINES.length];
}

/* ---- Layer 1: GOLDEN values captured from the original .jsx in Node ---- */
const GOLDEN_SAMPLES: [number, number, number, string][] = [
  [0, 0, 0, "0-2"], [0, 0, 1, "0-1"], [0, 0, 7, "4-4"], [0, 0, 24, "2-3"], [0, 0, 25, "0-2"], [0, 0, 80, "1-4"],
  [0, 1, 0, "2-0"], [0, 5, 7, "2-2"], [0, 50, 24, "3-3"], [0, 103, 80, "1-3"],
  [1, 0, 0, "2-4"], [1, 5, 80, "4-4"], [1, 103, 80, "1-1"],
  [1234, 0, 0, "2-0"], [1234, 1, 1, "1-0"], [1234, 50, 7, "3-3"], [1234, 103, 24, "2-1"],
  [987654321, 0, 0, "2-0"], [987654321, 1, 80, "0-0"], [987654321, 103, 80, "3-4"],
  [4294967295, 0, 0, "2-0"], [4294967295, 5, 80, "2-1"], [4294967295, 103, 7, "3-2"],
];

const GOLDEN_DECK0 = ["0-2","0-1","4-2","3-4","3-1","1-4","0-3","4-4","0-4","3-2","2-0","2-2","1-1","3-0","0-0","1-2","4-1","4-0","1-3","2-4","3-3","4-3","1-0","2-1","2-3"];
const GOLDEN_MUL0 = [0.26642920868471265, 0.6270739405881613, 0.7342509443406016, 0.7202267837710679, 0.9236361971125007];

describe("mulberry32 (verbatim port)", () => {
  it("matches the golden sequence for seed 0..4", () => {
    expect([0, 1, 2, 3, 4].map((i) => mulberry32(0 + i)())).toEqual(GOLDEN_MUL0);
  });
  it("is in [0,1)", () => {
    const r = mulberry32(123456);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("scoreFor (deterministic rotation §5)", () => {
  it("matches GOLDEN samples from the original .jsx", () => {
    for (const [seed, gi, pi, want] of GOLDEN_SAMPLES) {
      expect(scoreFor(seed, gi, pi)).toBe(want);
    }
  });

  it("matches the golden deck for (seed=0, gameIndex=0)", () => {
    const s = (0 + 1 * 2654435761) >>> 0;
    expect(seededShuffle(SCORELINES, s)).toEqual(GOLDEN_DECK0);
  });

  it("equals an independent reference across a large sweep", () => {
    for (const seed of [0, 1, 7, 1234, 65535, 987654321, 4294967295]) {
      for (let gi = 0; gi < 104; gi++) {
        for (const pi of [0, 1, 2, 24, 25, 26, 79, 80]) {
          expect(scoreFor(seed, gi, pi)).toBe(refScoreFor(seed, gi, pi));
        }
      }
    }
  });

  it("wraps playerIndex modulo deck length (pi and pi+25 collide)", () => {
    expect(scoreFor(1234, 3, 5)).toBe(scoreFor(1234, 3, 5 + SCORELINES.length));
  });

  it("only ever returns a value from the 25-scoreline pool", () => {
    const pool = new Set(SCORELINES);
    for (let gi = 0; gi < 104; gi++) {
      for (let pi = 0; pi < 60; pi++) {
        expect(pool.has(scoreFor(42, gi, pi))).toBe(true);
      }
    }
  });
});

describe("seededShuffle", () => {
  it("returns a permutation and does not mutate the input", () => {
    const src = [...SCORELINES];
    const out = seededShuffle(SCORELINES, 999);
    expect(SCORELINES).toEqual(src); // untouched
    expect([...out].sort()).toEqual([...SCORELINES].sort()); // permutation
  });
});

describe("sortedPlayers → playerIndex stability", () => {
  const mk = (id: string, createdAt: number): Player => ({
    id, name: id, createdAt,
    winnerTeams: [], finalistTeams: [], groupWinnerTeams: [], groupRunnerUpTeams: [], bootPlayers: [],
  });

  it("orders by createdAt then id, regardless of input order", () => {
    const a = mk("b", 100), b = mk("a", 100), c = mk("z", 50);
    const order = sortedPlayers([a, b, c]).map((p) => p.id);
    expect(order).toEqual(["z", "a", "b"]); // createdAt 50 first; tie 100 -> id asc
  });

  it("is independent of insertion order (rotation key is stable)", () => {
    const players = [mk("p3", 3), mk("p1", 1), mk("p2", 2)];
    const f = sortedPlayers(players).map((p) => p.id);
    const r = sortedPlayers([...players].reverse()).map((p) => p.id);
    expect(f).toEqual(r);
  });
});
