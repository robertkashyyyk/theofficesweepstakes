/* =========================================================================
   field_draw engine tests — distribution conservation/fairness + scoring.
   The deal is random (persisted, not seed-reproducible), so a seeded mulberry32
   pins it for the reproducibility checks.
   ========================================================================= */
import { describe, it, expect } from "vitest";
import { drawField, scoreFieldDraw, projectFieldDraw } from "../engines";
import { mulberry32 } from "../prng";
import type { DealInput } from "../dealing";
import type { FieldDrawHolding } from "../engines";

const inputs = (n: number): DealInput[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, createdAt: 1000 + i }));
const field = (n: number): string[] => Array.from({ length: n }, (_, i) => `Runner ${i + 1}`);

describe("drawField — conservation", () => {
  it("deals the whole field exactly once (no loss, no dupes)", () => {
    const F = field(40);
    const holds = drawField(inputs(7), F, mulberry32(1));
    const all = holds.flatMap((h) => h.entrants);
    expect(all.length).toBe(40);
    expect(new Set(all).size).toBe(40);
    expect([...all].sort()).toEqual([...F].sort());
  });

  it("sorts each player's entrants", () => {
    const holds = drawField(inputs(5), field(40), mulberry32(2));
    for (const h of holds) expect(h.entrants).toEqual([...h.entrants].sort());
  });
});

describe("drawField — fairness", () => {
  it("per-player counts differ by at most 1", () => {
    const holds = drawField(inputs(7), field(40), mulberry32(3));
    const counts = holds.map((h) => h.entrants.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("exact division gives everyone the same count", () => {
    const holds = drawField(inputs(8), field(40), mulberry32(4));
    expect(holds.every((h) => h.entrants.length === 5)).toBe(true);
  });

  it("is reproducible given the same seeded rng", () => {
    const a = drawField(inputs(9), field(40), mulberry32(123));
    const b = drawField(inputs(9), field(40), mulberry32(123));
    expect(a).toEqual(b);
  });
});

describe("scoreFieldDraw — winner takes the pot + place prizes", () => {
  const holdings: FieldDrawHolding[] = [
    { playerId: "a", name: "A", entrants: ["H1"] },
    { playerId: "b", name: "B", entrants: ["H2"] },
    { playerId: "c", name: "C", entrants: ["H3", "H4"] },
  ];
  const prizes = { placePrizes: [{ mode: "£" as const, value: 20 }, { mode: "£" as const, value: 10 }] };

  it("pays winner the remainder and places their fixed prizes", () => {
    const s = scoreFieldDraw(holdings, { finishers: ["H1", "H2", "H3"] }, 100, prizes);
    expect(s.winnerHolder).toBe("a");
    expect(s.per["a"].breakdown.win).toBe(70); // 100 - (20 + 10)
    expect(s.per["b"].breakdown.place2).toBe(20);
    expect(s.per["c"].breakdown.place3).toBe(10);
    expect(s.jackpot).toBe(70);
    expect(s.paid).toBe(100); // fully paid out when the winner is held
  });

  it("resolves percentage place prizes against the fund", () => {
    const s = scoreFieldDraw(holdings, { finishers: ["H1", "H2"] }, 200, { placePrizes: [{ mode: "%", value: 10 }] });
    expect(s.per["b"].breakdown.place2).toBe(20); // 10% of 200
    expect(s.per["a"].breakdown.win).toBe(180);
  });

  it("an unheld winner leaves the jackpot unassigned", () => {
    const s = scoreFieldDraw(holdings, { finishers: ["H99"] }, 100, { placePrizes: [] });
    expect(s.winnerHolder).toBeNull();
    expect(s.paid).toBe(0);
    expect(s.jackpot).toBe(100);
  });

  it("the dealt winner is always a real holder (field fully dealt)", () => {
    const holds = drawField(inputs(7), field(40), mulberry32(5));
    const winner = "Runner 1";
    const s = scoreFieldDraw(holds, { finishers: [winner] }, 500, { placePrizes: [] });
    expect(s.winnerHolder).not.toBeNull();
    expect(s.per[s.winnerHolder!].breakdown.win).toBe(500);
  });
});

describe("projectFieldDraw", () => {
  it("sums place commitments and leaves the winner floor", () => {
    const p = projectFieldDraw(100, { placePrizes: [{ mode: "£", value: 20 }, { mode: "£", value: 10 }] });
    expect(p.committed).toBe(30);
    expect(p.winnerFloor).toBe(70);
    expect(p.rows.map((r) => r.name)).toEqual(["2nd place", "3rd place"]);
  });
});
