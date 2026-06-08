/* =========================================================================
   `field_draw` engine — draw one (or more) entrant from a field.

   The classic office sweep: a field of entrants (40 horses, a tennis draw, an
   F1 grid…) is distributed among players, value-equalised so counts differ by
   at most one. First past the post scoops the remaining pot; the other places
   pay configurable £/% prizes.

   Pure logic — no DB / React. Mirrors the style of dealing.ts / scoring.ts and
   reuses `shuffle` (prng) + `toGBP` (money). Self-contained native types, so it
   never touches the tournament core or its determinism golden tests.
   ========================================================================= */
import { shuffle } from "../prng";
import { toGBP } from "../money";
import type { Projection, Rng } from "../types";
import type { DealInput } from "../dealing";
import type {
  EngineMeta,
  FieldDrawHolding,
  FieldDrawOutcome,
  FieldDrawPrizes,
  FieldDrawScore,
} from "./types";

export const fieldDrawMeta: EngineMeta = {
  key: "field_draw",
  label: "Field draw — one entrant each, first past the post scoops the pot",
  sportDefault: "Horse racing",
};

/**
 * Distribute `field` across `inputs`, value-equalised (single market, so just an
 * even round-robin over a shuffled deck — per-player counts differ by ≤1, and a
 * shuffled player order randomises who gets the leftover). The deal is random
 * and PERSISTED (not seed-reproducible), so the Rng is injected only for tests.
 */
export function drawField(
  inputs: DealInput[],
  field: string[],
  rng: Rng = Math.random
): FieldDrawHolding[] {
  const N = inputs.length;
  const holdings: FieldDrawHolding[] = inputs.map((p) => ({
    playerId: p.id,
    name: p.name,
    entrants: [],
  }));
  if (N === 0) return holdings;

  const order = shuffle(inputs.map((_, i) => i), rng); // who gets the leftover
  const deck = shuffle(field, rng);
  deck.forEach((entrant, i) => {
    holdings[order[i % N]].entrants.push(entrant);
  });
  holdings.forEach((h) => h.entrants.sort());
  return holdings;
}

/**
 * Score a field_draw sweep from the finishing order. The holder of `finishers[0]`
 * (1st) takes the pot remainder (fund − place payouts); holders of the other
 * finishers take their configured place prize. Pure recompute, never stored.
 */
export function scoreFieldDraw(
  holdings: FieldDrawHolding[],
  outcome: FieldDrawOutcome,
  fund: number,
  prizes: FieldDrawPrizes
): FieldDrawScore {
  const f = Number(fund) || 0;
  const finishers = (outcome.finishers || []).filter(Boolean);

  const holderOf: Record<string, string> = {};
  holdings.forEach((h) => h.entrants.forEach((e) => { holderOf[e] = h.playerId; }));

  const per: FieldDrawScore["per"] = {};
  holdings.forEach((h) => { per[h.playerId] = { breakdown: {}, total: 0 }; });
  const add = (id: string, key: string, amt: number) => {
    if (!amt || !per[id]) return;
    per[id].breakdown[key] = (per[id].breakdown[key] || 0) + amt;
    per[id].total += amt;
  };

  // place prizes: placePrizes[0] -> 2nd (finishers[1]), placePrizes[1] -> 3rd, …
  let placePaid = 0;
  (prizes.placePrizes || []).forEach((pa, i) => {
    const entrant = finishers[i + 1];
    if (!entrant) return;
    const amt = toGBP(pa, f);
    const holder = holderOf[entrant];
    if (holder && amt) { add(holder, `place${i + 2}`, amt); placePaid += amt; }
  });

  const jackpot = Math.max(0, f - placePaid);
  let winnerHolder: string | null = null;
  const winner = finishers[0];
  if (winner && holderOf[winner]) {
    winnerHolder = holderOf[winner];
    add(winnerHolder, "win", jackpot);
  }

  const paid = holdings.reduce((s, h) => s + per[h.playerId].total, 0);
  return { per, paid, jackpot, winnerHolder };
}

const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Setup-preview totals for a field_draw sweep (mirrors scoring.ts `projection`). */
export function projectFieldDraw(fund: number, prizes: FieldDrawPrizes): Projection {
  const f = Number(fund) || 0;
  const rows = (prizes.placePrizes || []).map((pa, i) => {
    const unit = toGBP(pa, f);
    return { name: `${ordinal(i + 2)} place`, unit, count: 1, total: unit, note: "1 place" };
  });
  const committed = rows.reduce((s, r) => s + r.total, 0);
  const winnerFloor = f - committed;
  return { rows, committed, winnerFloor, fund: f };
}
