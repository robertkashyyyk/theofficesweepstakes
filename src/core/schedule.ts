/* =========================================================================
   TOURNAMENT SCHEDULE — the full 104-match plan, so the organiser (and the
   system) can see every game and when. Group stage (1–72) comes from the real
   draw via `groupFixtures`; the knockout (73–104) is the OFFICIAL WC-2026
   template (slot definitions + dates, from Wikipedia), resolved to real teams
   from the live group table + best-thirds as results come in.

   Slot assignment of third-placed teams uses the official R32 slot constraints
   (the eight 5-group sets) with a deterministic matching — a valid official-
   format allocation (slot choice has no scoring impact; it's display only).
   ========================================================================= */
import type { Game } from "./types";
import { groupFixtures, groupTable, deriveGroupPlacings, bestThirds } from "./groupStage";

export type Stage = "Group" | "R32" | "R16" | "QF" | "SF" | "3P" | "Final";

type Slot =
  | { kind: "winner"; group: string }
  | { kind: "runnerUp"; group: string }
  | { kind: "third"; groups: string[] }
  | { kind: "matchWinner"; match: number }
  | { kind: "matchLoser"; match: number };

interface KOEntry { match: number; stage: Stage; round: string; date: string; a: Slot; b: Slot; }

const W = (group: string): Slot => ({ kind: "winner", group });
const R = (group: string): Slot => ({ kind: "runnerUp", group });
const T = (groups: string): Slot => ({ kind: "third", groups: groups.split("") });
const MW = (match: number): Slot => ({ kind: "matchWinner", match });
const ML = (match: number): Slot => ({ kind: "matchLoser", match });

/** Official 2026 World Cup knockout schedule (matches 73–104), verbatim. */
export const KNOCKOUT_TEMPLATE: KOEntry[] = [
  { match: 73, stage: "R32", round: "Round of 32", date: "28 Jun", a: R("A"), b: R("B") },
  { match: 74, stage: "R32", round: "Round of 32", date: "29 Jun", a: W("E"), b: T("ABCDF") },
  { match: 75, stage: "R32", round: "Round of 32", date: "29 Jun", a: W("F"), b: R("C") },
  { match: 76, stage: "R32", round: "Round of 32", date: "29 Jun", a: W("C"), b: R("F") },
  { match: 77, stage: "R32", round: "Round of 32", date: "30 Jun", a: W("I"), b: T("CDFGH") },
  { match: 78, stage: "R32", round: "Round of 32", date: "30 Jun", a: R("E"), b: R("I") },
  { match: 79, stage: "R32", round: "Round of 32", date: "30 Jun", a: W("A"), b: T("CEFHI") },
  { match: 80, stage: "R32", round: "Round of 32", date: "1 Jul", a: W("L"), b: T("EHIJK") },
  { match: 81, stage: "R32", round: "Round of 32", date: "1 Jul", a: W("D"), b: T("BEFIJ") },
  { match: 82, stage: "R32", round: "Round of 32", date: "1 Jul", a: W("G"), b: T("AEHIJ") },
  { match: 83, stage: "R32", round: "Round of 32", date: "2 Jul", a: R("K"), b: R("L") },
  { match: 84, stage: "R32", round: "Round of 32", date: "2 Jul", a: W("H"), b: R("J") },
  { match: 85, stage: "R32", round: "Round of 32", date: "2 Jul", a: W("B"), b: T("EFGIJ") },
  { match: 86, stage: "R32", round: "Round of 32", date: "3 Jul", a: W("J"), b: R("H") },
  { match: 87, stage: "R32", round: "Round of 32", date: "3 Jul", a: W("K"), b: T("DEIJL") },
  { match: 88, stage: "R32", round: "Round of 32", date: "3 Jul", a: R("D"), b: R("G") },
  { match: 89, stage: "R16", round: "Round of 16", date: "4 Jul", a: MW(74), b: MW(77) },
  { match: 90, stage: "R16", round: "Round of 16", date: "4 Jul", a: MW(73), b: MW(75) },
  { match: 91, stage: "R16", round: "Round of 16", date: "5 Jul", a: MW(76), b: MW(78) },
  { match: 92, stage: "R16", round: "Round of 16", date: "5 Jul", a: MW(79), b: MW(80) },
  { match: 93, stage: "R16", round: "Round of 16", date: "6 Jul", a: MW(83), b: MW(84) },
  { match: 94, stage: "R16", round: "Round of 16", date: "6 Jul", a: MW(81), b: MW(82) },
  { match: 95, stage: "R16", round: "Round of 16", date: "7 Jul", a: MW(86), b: MW(88) },
  { match: 96, stage: "R16", round: "Round of 16", date: "7 Jul", a: MW(85), b: MW(87) },
  { match: 97, stage: "QF", round: "Quarter-finals", date: "9 Jul", a: MW(89), b: MW(90) },
  { match: 98, stage: "QF", round: "Quarter-finals", date: "10 Jul", a: MW(93), b: MW(94) },
  { match: 99, stage: "QF", round: "Quarter-finals", date: "11 Jul", a: MW(91), b: MW(92) },
  { match: 100, stage: "QF", round: "Quarter-finals", date: "11 Jul", a: MW(95), b: MW(96) },
  { match: 101, stage: "SF", round: "Semi-finals", date: "14 Jul", a: MW(97), b: MW(98) },
  { match: 102, stage: "SF", round: "Semi-finals", date: "15 Jul", a: MW(99), b: MW(100) },
  { match: 103, stage: "3P", round: "Third place play-off", date: "18 Jul", a: ML(101), b: ML(102) },
  { match: 104, stage: "Final", round: "Final", date: "19 Jul", a: MW(101), b: MW(102) },
];

/** The eight R32 third-place slots and the group set each may take a third from. */
const THIRD_SLOTS: { match: number; allowed: string[] }[] = [
  { match: 74, allowed: "ABCDF".split("") },
  { match: 77, allowed: "CDFGH".split("") },
  { match: 79, allowed: "CEFHI".split("") },
  { match: 80, allowed: "EHIJK".split("") },
  { match: 81, allowed: "BEFIJ".split("") },
  { match: 82, allowed: "AEHIJ".split("") },
  { match: 85, allowed: "EFGIJ".split("") },
  { match: 87, allowed: "DEIJL".split("") },
];

/** Assign the 8 qualifying third-place group letters to the 8 R32 slots,
 *  respecting each slot's allowed set. Deterministic (alphabetical) backtracking;
 *  returns slot-match → group letter, or null if no valid matching. */
export function assignThirds(qualified: string[]): Record<number, string> | null {
  const pool = [...qualified].sort();
  const used = new Set<string>();
  const res: Record<number, string> = {};
  const dfs = (i: number): boolean => {
    if (i === THIRD_SLOTS.length) return true;
    for (const g of pool) {
      if (!used.has(g) && THIRD_SLOTS[i].allowed.includes(g)) {
        used.add(g); res[THIRD_SLOTS[i].match] = g;
        if (dfs(i + 1)) return true;
        used.delete(g); delete res[THIRD_SLOTS[i].match];
      }
    }
    return false;
  };
  return dfs(0) ? res : null;
}

export interface SchedEntry {
  match: number;        // 1-based match number (= gameIndex + 1)
  stage: Stage;
  round: string;        // display label
  matchday?: number;    // group stage only (1–3)
  date?: string;        // knockout: exact date; group: undefined
  group?: string;       // group stage only
  a: string;            // team or placeholder label
  b: string;
  score?: string;       // if that match has been logged
}

/** Build the full 104-match plan, resolving knockout slots from the live groups. */
export function resolveSchedule(groups: Record<string, string[]>, games: Game[]): SchedEntry[] {
  const scoreOf = (match: number) => (games || []).find((g) => g.gameIndex === match - 1)?.score;

  // group stage (matches 1..72) — matchday-interleaved (24 matches per matchday)
  const fixtures = groupFixtures(groups);
  const group: SchedEntry[] = fixtures.map((f) => ({
    match: f.index + 1,
    stage: "Group",
    round: "Group stage",
    matchday: Math.floor(f.index / 24) + 1,
    group: f.group,
    a: f.home,
    b: f.away,
    score: scoreOf(f.index + 1),
  }));

  // resolve knockout slots from completed groups
  const table = groupTable(groups, games);
  const { groupFirst, groupSecond } = deriveGroupPlacings(table);
  const groupsComplete = Object.keys(groups).every((g) => groupFirst[g]);
  const thirdAssign = groupsComplete ? assignThirds(bestThirds(table)) : null;

  const label = (s: Slot): string => {
    switch (s.kind) {
      case "winner": return groupFirst[s.group] || `Winner Grp ${s.group}`;
      case "runnerUp": return groupSecond[s.group] || `Runner-up Grp ${s.group}`;
      case "third": return `3rd ${s.groups.join("/")}`;
      case "matchWinner": return `Winner M${s.match}`;
      case "matchLoser": return `Loser M${s.match}`;
    }
  };
  const resolve = (entry: KOEntry, s: Slot): string => {
    if (s.kind === "third" && thirdAssign) {
      const g = thirdAssign[entry.match];
      const team = g && table[g] && table[g][2]?.team;
      if (team) return team;
    }
    return label(s);
  };

  const knockout: SchedEntry[] = KNOCKOUT_TEMPLATE.map((e) => ({
    match: e.match,
    stage: e.stage,
    round: e.round,
    date: e.date,
    a: resolve(e, e.a),
    b: resolve(e, e.b),
    score: scoreOf(e.match),
  }));

  return [...group, ...knockout];
}
