/* =========================================================================
   Dry-run simulator (super-admin) — plays a whole tournament IN MEMORY so you
   can see it fully populated. Nothing is persisted.

   It deals ticket books to dummy players via the core dealer, randomly plays
   every game, simulates the groups + full knockout bracket, fills champion +
   golden boot, runs `compute()`, and renders the result by REUSING the live
   sweepstake views (Pot / Tickets / Daily / Board) plus the Bracket display.
   "Re-roll" re-simulates from a fresh seed.
   ========================================================================= */
import { useMemo, useState } from "react";
import {
  compute,
  dealTickets,
  mulberry32,
  simulateTournament,
  DEFAULT_PRIZES,
  type Config,
  type Prizes,
  type Results,
} from "../core";
import type { SweepstakeType } from "../db/repo";
import { Board, Daily, Pot, Tickets } from "./views";
import { Bracket } from "./Bracket";

type Tab = "board" | "bracket" | "tickets" | "daily";
const PLAYER_COUNT = 20;

export function DryRun({ type, onClose }: { type: SweepstakeType; onClose: () => void }) {
  const [nonce, setNonce] = useState(() => Math.floor(Math.random() * 1e9));
  const [tab, setTab] = useState<Tab>("board");

  const data = (type.data ?? {}) as { groups?: Record<string, string[]>; scorerPool?: string[]; totalGames?: number };
  const groups = data.groups ?? {};
  const scorerPool = data.scorerPool ?? [];
  const totalGames = data.totalGames ?? 104;
  const groupCount = Object.keys(groups).length;
  const supported = groupCount === 12; // the bracket sim expects the 12-group WC shape

  const sim = useMemo(() => {
    if (!supported) return null;
    const rng = mulberry32(nonce >>> 0);
    const fund = 500;
    const prizes: Prizes = (type.defaultPrizes as Prizes) ?? DEFAULT_PRIZES;

    const inputs = Array.from({ length: PLAYER_COUNT }, (_, i) => ({
      id: `dry-${i}`, name: `Player ${i + 1}`, createdAt: 1_700_000_000_000 + i,
    }));
    const players = dealTickets(inputs, fund, prizes, rng);

    const t = simulateTournament(groups, rng);
    const games = Array.from({ length: totalGames }, (_, i) => ({
      gameIndex: i,
      score: `${Math.floor(rng() * 5)}-${Math.floor(rng() * 5)}`,
      label: `Game ${i + 1}`,
    }));
    const topScorer = scorerPool.length ? scorerPool[Math.floor(rng() * scorerPool.length)] : "";

    const results: Results = {
      games,
      groupFirst: t.groupFirst,
      groupSecond: t.groupSecond,
      finalists: t.finalists,
      champion: t.champion,
      topScorer,
    };
    const config: Config = { fund, seed: nonce >>> 0, prizes, generated: true };
    const scoring = compute(players, results, config);
    return { results, config, scoring, bracket: t.bracket };
  }, [supported, nonce, groups, scorerPool, totalGames, type.defaultPrizes]);

  const tabs: [Tab, string][] = [["board", "Leaderboard"], ["bracket", "Bracket"], ["tickets", "Tickets"], ["daily", "Daily games"]];

  return (
    <div className="card" style={{ borderColor: "var(--blue)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h2 className="h2" style={{ margin: 0 }}>Dry run · {type.name}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost sm" onClick={() => setNonce(Math.floor(Math.random() * 1e9))}>🎲 Re-roll</button>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
      </div>
      <p className="p small muted" style={{ marginTop: 6 }}>
        A throwaway simulation with {PLAYER_COUNT} dummy players — nothing is saved. Champion:{" "}
        <b style={{ color: "var(--amber)" }}>{sim?.results.champion || "—"}</b>.
      </p>

      {!supported ? (
        <div className="card muted" style={{ marginTop: 8 }}>
          The dry-run currently supports the 12-group World Cup format. This type has {groupCount} group{groupCount === 1 ? "" : "s"}.
        </div>
      ) : sim ? (
        <>
          <div style={{ marginTop: 8 }}>
            <Pot config={sim.config} scoring={sim.scoring} results={sim.results} />
          </div>
          <nav className="tabs" style={{ marginTop: 14 }}>
            {tabs.map(([id, l]) => (
              <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{l}</button>
            ))}
          </nav>
          {tab === "board" && <Board scoring={sim.scoring} results={sim.results} />}
          {tab === "bracket" && <Bracket bracket={sim.bracket} />}
          {tab === "tickets" && <Tickets scoring={sim.scoring} config={sim.config} results={sim.results} />}
          {tab === "daily" && <Daily scoring={sim.scoring} config={sim.config} results={sim.results} />}
        </>
      ) : null}
    </div>
  );
}
