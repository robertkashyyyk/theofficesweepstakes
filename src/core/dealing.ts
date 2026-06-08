/* =========================================================================
   VALUE-EQUALISED DEALING (§4) — the five one-time markets.

   Goal: when a pool doesn't divide evenly, players short-changed on a
   high-value market are compensated with extra low-value tickets, so expected
   winnings stay roughly level. Correct-score is excluded (rotation handles it).

   Ported from `dealTickets` in the .jsx. The per-market shuffle is random (and
   its result is persisted), so an Rng is injected for deterministic tests; in
   production it defaults to Math.random. The ORDER logic (short-changed first,
   leftover lands on lowest cumEV) is the part that must stay faithful.
   ========================================================================= */
import { SCORER_POOL, TEAMS, TOTAL_GAMES } from "./constants";
import { shuffle } from "./prng";
import { toGBP } from "./money";
import type { Player, Prizes, Rng } from "./types";

export interface DealInput {
  id: string;
  name: string;
  createdAt: number;
}

type MarketKey =
  | "winnerTeams"
  | "finalistTeams"
  | "groupWinnerTeams"
  | "groupRunnerUpTeams"
  | "bootPlayers";

/**
 * Deal ticket books to `inputs`. Returns fully-populated Player objects.
 * `fund` and `prizes` only affect the EV ordering of markets, never the pools.
 */
export function dealTickets(
  inputs: DealInput[],
  fund: number,
  prizes: Prizes,
  rng: Rng = Math.random
): Player[] {
  const N = inputs.length;

  const f = toGBP(prizes.finalist, fund);
  const gw = toGBP(prizes.groupWinner, fund);
  const gru = toGBP(prizes.groupRunnerUp, fund);
  const boot = toGBP(prizes.boot, fund);

  const fixed = f * 2 + gw * 12 + gru * 12 + boot + prizes.perGame * TOTAL_GAMES * 0.5;
  const jackpotEst = Math.max(fund * 0.1, fund - fixed);

  const marketDefs: { key: MarketKey; pool: string[]; ev: number }[] = [
    { key: "winnerTeams", pool: TEAMS, ev: jackpotEst / TEAMS.length },
    { key: "finalistTeams", pool: TEAMS, ev: (2 * f) / TEAMS.length },
    { key: "groupWinnerTeams", pool: TEAMS, ev: (12 * gw) / TEAMS.length },
    { key: "groupRunnerUpTeams", pool: TEAMS, ev: (12 * gru) / TEAMS.length },
    { key: "bootPlayers", pool: SCORER_POOL, ev: boot / SCORER_POOL.length },
  ];
  const markets = marketDefs.sort((a, b) => b.ev - a.ev);

  const players: Player[] = inputs.map((p) => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    winnerTeams: [],
    finalistTeams: [],
    groupWinnerTeams: [],
    groupRunnerUpTeams: [],
    bootPlayers: [],
  }));

  const cumEV = players.map(() => 0);

  markets.forEach((m) => {
    // short-changed players first; leftover (pool % N) lands on lowest cumEV
    const order = players.map((_, i) => i).sort((a, b) => cumEV[a] - cumEV[b]);
    const deck = shuffle(m.pool, rng);
    const counts = players.map(() => 0);
    deck.forEach((item, i) => {
      const pi = order[i % N];
      players[pi][m.key].push(item);
      counts[pi]++;
    });
    counts.forEach((c, i) => {
      cumEV[i] += c * m.ev;
    });
  });

  // sort each book for stable, readable display
  players.forEach((p) => {
    p.winnerTeams.sort();
    p.finalistTeams.sort();
    p.groupWinnerTeams.sort();
    p.groupRunnerUpTeams.sort();
    p.bootPlayers.sort();
  });

  return players;
}
