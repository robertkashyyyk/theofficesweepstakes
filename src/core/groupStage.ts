/* =========================================================================
   GROUP STAGE — fixtures + live standings table.

   The missing primitive that lets a group table BUILD from results: a
   deterministic fixture list (round-robin per group) mapped to game slots, and
   a pure table computation from the logged scores.

   `gameIndex` 0…(6×groups − 1) maps to a group fixture; the score "home-away"
   updates that fixture's two teams. The correct-score rotation is unaffected
   (it keys off gameIndex + score, not teams), so scoring/determinism are untouched.
   ========================================================================= */
import type { Game } from "./types";

export interface Fixture {
  index: number; // the game slot (0-based) this fixture occupies
  group: string;
  home: string;
  away: string;
}

export interface TeamRow {
  team: string;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number;
}

/** Round-robin pairings (circle method) for an even-sized group. */
function roundRobin(teams: string[]): [string, string][][] {
  const n = teams.length;
  const arr = [...teams];
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      round.push(r % 2 === 0 ? [a, b] : [b, a]); // alternate home/away across rounds
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop() as string); // rotate, keeping arr[0] fixed
  }
  return rounds;
}

/**
 * The full group-stage fixture list, interleaved by matchday across groups
 * (matchday 1 of every group, then matchday 2, …). `index` is the game slot.
 */
export function groupFixtures(groups: Record<string, string[]>): Fixture[] {
  const letters = Object.keys(groups).sort();
  const perGroup: Record<string, [string, string][][]> = {};
  letters.forEach((g) => { perGroup[g] = roundRobin(groups[g]); });
  const matchdays = letters.length ? perGroup[letters[0]].length : 0;

  const fixtures: Fixture[] = [];
  for (let md = 0; md < matchdays; md++) {
    for (const g of letters) {
      for (const [home, away] of perGroup[g][md]) {
        fixtures.push({ index: fixtures.length, group: g, home, away });
      }
    }
  }
  return fixtures;
}

const rankRows = (rows: TeamRow[]): TeamRow[] =>
  [...rows].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (a.team < b.team ? -1 : 1));

/** Compute each group's ranked standings from the logged games. */
export function groupTable(groups: Record<string, string[]>, games: Game[]): Record<string, TeamRow[]> {
  const byIndex = new Map(groupFixtures(groups).map((f) => [f.index, f]));
  const rows: Record<string, Record<string, TeamRow>> = {};
  Object.keys(groups).forEach((g) => {
    rows[g] = {};
    groups[g].forEach((t) => { rows[g][t] = { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }; });
  });

  for (const game of games || []) {
    const fx = byIndex.get(game.gameIndex);
    if (!fx) continue; // knockout / out of range
    const m = /^(\d+)-(\d+)$/.exec(game.score);
    if (!m) continue;
    const hg = +m[1], ag = +m[2];
    const hr = rows[fx.group]?.[fx.home], ar = rows[fx.group]?.[fx.away];
    if (!hr || !ar) continue;
    hr.p++; ar.p++; hr.gf += hg; hr.ga += ag; ar.gf += ag; ar.ga += hg;
    if (hg > ag) { hr.w++; ar.l++; hr.pts += 3; }
    else if (hg < ag) { ar.w++; hr.l++; ar.pts += 3; }
    else { hr.d++; ar.d++; hr.pts++; ar.pts++; }
  }

  const out: Record<string, TeamRow[]> = {};
  Object.keys(groups).forEach((g) => {
    Object.values(rows[g]).forEach((r) => { r.gd = r.gf - r.ga; });
    out[g] = rankRows(Object.values(rows[g]));
  });
  return out;
}

/** The full finishing order per group (1st→last), e.g. for the bracket seeding. */
export function groupOrderFromTable(table: Record<string, TeamRow[]>): Record<string, string[]> {
  const order: Record<string, string[]> = {};
  Object.entries(table).forEach(([g, rows]) => { order[g] = rows.map((r) => r.team); });
  return order;
}

/**
 * Top two per group — but ONLY for groups whose matches are all played, so prizes
 * never pay out on a provisional table. Returns the existing `Results` shape.
 */
export function deriveGroupPlacings(table: Record<string, TeamRow[]>): {
  groupFirst: Record<string, string>;
  groupSecond: Record<string, string>;
} {
  const groupFirst: Record<string, string> = {};
  const groupSecond: Record<string, string> = {};
  Object.entries(table).forEach(([g, rows]) => {
    const complete = rows.length >= 2 && rows.every((r) => r.p >= rows.length - 1);
    if (complete) { groupFirst[g] = rows[0].team; groupSecond[g] = rows[1].team; }
  });
  return { groupFirst, groupSecond };
}

/** The 8 best third-placed group letters (for R32 seeding). */
export function bestThirds(table: Record<string, TeamRow[]>): string[] {
  return Object.entries(table)
    .filter(([, rows]) => rows.length >= 3)
    .map(([g, rows]) => ({ g, r: rows[2] }))
    .sort((a, b) => b.r.pts - a.r.pts || b.r.gd - a.r.gd || b.r.gf - a.r.gf || (a.g < b.g ? -1 : 1))
    .slice(0, 8)
    .map((t) => t.g);
}
