/* =========================================================================
   SCORING (§6) — pure function of players + results + config.

   Recompute standings from stored data; NEVER store winnings. This keeps the
   board correct if a result is edited. Ported from `compute` in the .jsx.

   The daily-scoreline loop uses `game.gameIndex` (NOT array position) as the
   rotation key, so a missing/edited middle game can never shift other games'
   winners. Games should already be sorted by gameIndex by the caller; we sort
   defensively here too.
   ========================================================================= */
import { GROUPS, TOTAL_GAMES } from "./constants";
import { scoreFor, sortedPlayers } from "./prng";
import { toGBP } from "./money";
import type { Config, Player, Projection, Prizes, Results, Scoring } from "./types";

export function compute(players: Player[], results: Results, config: Config): Scoring {
  const fund = Number(config.fund) || 0;
  const P = config.prizes;
  const perGame = Number(P.perGame) || 0;
  const f = toGBP(P.finalist, fund);
  const gw = toGBP(P.groupWinner, fund);
  const gru = toGBP(P.groupRunnerUp, fund);
  const boot = toGBP(P.boot, fund);

  const ordered = sortedPlayers(players);
  const idx: Record<string, number> = {};
  ordered.forEach((p, i) => {
    idx[p.id] = i;
  });

  // group placements lookup: team -> 1 | 2
  const place: Record<string, number> = {};
  Object.keys(GROUPS).forEach((g) => {
    if (results.groupFirst[g]) place[results.groupFirst[g]] = 1;
    if (results.groupSecond[g]) place[results.groupSecond[g]] = 2;
  });
  const finalists = (results.finalists || []).filter(Boolean);

  const per: Scoring["per"] = {};
  ordered.forEach((p) => {
    per[p.id] = { breakdown: {}, total: 0 };
  });
  const add = (id: string, key: string, amt: number) => {
    if (!amt) return;
    per[id].breakdown[key] = (per[id].breakdown[key] || 0) + amt;
    per[id].total += amt;
  };

  // daily scorelines (rotating, split if shared, unheld -> stays in pot)
  const games = [...(results.games || [])].sort((a, b) => a.gameIndex - b.gameIndex);
  const gameWinners: string[][] = [];
  games.forEach((gm) => {
    const holders = ordered.filter((p) => scoreFor(config.seed, gm.gameIndex, idx[p.id]) === gm.score);
    gameWinners.push(holders.map((h) => h.id));
    if (holders.length) {
      const share = perGame / holders.length;
      holders.forEach((h) => add(h.id, "daily", share));
    }
  });

  // groups / finalists
  ordered.forEach((p) => {
    (p.groupWinnerTeams || []).forEach((t) => {
      if (place[t] === 1) add(p.id, "groupWinner", gw);
    });
    (p.groupRunnerUpTeams || []).forEach((t) => {
      if (place[t] === 2) add(p.id, "groupRunnerUp", gru);
    });
    (p.finalistTeams || []).forEach((t) => {
      if (finalists.includes(t)) add(p.id, "finalist", f);
    });
  });

  // golden boot (split if shared)
  if (results.topScorer) {
    const bootHolders = ordered.filter((p) => (p.bootPlayers || []).includes(results.topScorer));
    if (bootHolders.length) {
      const share = boot / bootHolders.length;
      bootHolders.forEach((h) => add(h.id, "boot", share));
    }
  }

  const paid = ordered.reduce((s, p) => s + per[p.id].total, 0);
  const jackpot = Math.max(0, fund - paid);
  let championHolder: string | null = null;
  if (results.champion) {
    const h = ordered.find((p) => (p.winnerTeams || []).includes(results.champion));
    if (h) {
      championHolder = h.id;
      add(h.id, "jackpot", jackpot);
    }
  }

  return { per, paid, jackpot, championHolder, gameWinners, ordered, idx };
}

/** Projected breakdown for the setup preview — ported from `projection`. */
export function projection(fund: number, prizes: Prizes): Projection {
  const f = toGBP(prizes.finalist, fund);
  const gw = toGBP(prizes.groupWinner, fund);
  const gru = toGBP(prizes.groupRunnerUp, fund);
  const boot = toGBP(prizes.boot, fund);
  const dailyMax = (Number(prizes.perGame) || 0) * TOTAL_GAMES;
  const rows = [
    { name: "⚽ Daily scoreline", unit: Number(prizes.perGame) || 0, count: TOTAL_GAMES, total: dailyMax, note: "up to (per game · 104 games)" },
    { name: "🥇 Group winners", unit: gw, count: 12, total: gw * 12, note: "12 groups" },
    { name: "🥈 Group runners-up", unit: gru, count: 12, total: gru * 12, note: "12 groups" },
    { name: "🎽 Reaches the final", unit: f, count: 2, total: f * 2, note: "2 finalists" },
    { name: "👟 Golden Boot", unit: boot, count: 1, total: boot, note: "1 top scorer" },
  ];
  const committed = rows.reduce((s, r) => s + r.total, 0);
  const winnerFloor = fund - committed;
  return { rows, committed, winnerFloor, fund };
}
