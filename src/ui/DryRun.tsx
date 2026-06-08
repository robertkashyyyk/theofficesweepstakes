/* =========================================================================
   Dry-run / Test-Event simulator — plays a whole tournament IN MEMORY so it can
   be seen fully populated. Nothing is persisted.

   Two callers:
   - super-admin "Dry run" (default): 20 dummy players, the type's default prizes.
   - organiser "Test Event" (`organiser`): deals to the organiser's real roster +
     their fund/prizes, shows a readiness checklist, and is gated to the event's
     start date (available until kickoff).

   Deals via the core dealer, plays the group stage on real fixtures → table →
   bracket → champion + golden boot, runs `compute()`, and renders by reusing the
   live views (Pot / Tickets / Daily / Board) + Group tables + Bracket.
   ========================================================================= */
import { useMemo, useState } from "react";
import {
  bestThirds,
  compute,
  dealTickets,
  deriveFinalChampion,
  deriveGroupPlacings,
  groupFixtures,
  groupOrderFromTable,
  groupTable,
  mulberry32,
  playBracket,
  qualifiers,
  DEFAULT_PRIZES,
  type Config,
  type Prizes,
  type Results,
} from "../core";
import type { SweepstakeType } from "../db/repo";
import { Board, Pot, Tickets } from "./views";
import { Bracket } from "./Bracket";
import { GroupTables } from "./GroupTables";
import { Games } from "./Games";

type Tab = "board" | "groups" | "bracket" | "tickets" | "daily";
const DUMMY_COUNT = 20;

const prizesConfigured = (p: Prizes) =>
  (Number(p?.perGame) || 0) > 0 ||
  [p?.finalist, p?.groupWinner, p?.groupRunnerUp, p?.boot].some((x) => (Number(x?.value) || 0) > 0);

export function DryRun({
  type, onClose, roster, fund: fundProp, prizes: prizesProp, organiser = false,
}: {
  type: SweepstakeType;
  onClose: () => void;
  roster?: string[];
  fund?: number;
  prizes?: Prizes;
  organiser?: boolean;
}) {
  const [nonce, setNonce] = useState(() => Math.floor(Math.random() * 1e9));
  const [tab, setTab] = useState<Tab>("board");

  const data = (type.data ?? {}) as { groups?: Record<string, string[]>; scorerPool?: string[]; totalGames?: number };
  const groups = data.groups ?? {};
  const scorerPool = data.scorerPool ?? [];
  const totalGames = data.totalGames ?? 104;
  const groupCount = Object.keys(groups).length;
  const supported = groupCount === 12; // the bracket sim expects the 12-group WC shape

  const fund = fundProp ?? 500;
  const prizes: Prizes = prizesProp ?? (type.defaultPrizes as Prizes) ?? DEFAULT_PRIZES;
  const names = useMemo(
    () => (organiser
      ? (roster ?? []).map((n) => n.trim()).filter(Boolean)
      : Array.from({ length: DUMMY_COUNT }, (_, i) => `Player ${i + 1}`)),
    [organiser, roster]
  );

  const started = !!type.startsAt && Date.now() >= new Date(type.startsAt).getTime();
  const canSim = supported && names.length >= 2 && !started;

  const checks = [
    { ok: names.length >= 2, label: `Players added (${names.length})`, hint: "Add at least 2 staff names below." },
    { ok: fund > 0, label: "Prize fund set", hint: "Set a fund above £0." },
    { ok: prizesConfigured(prizes), label: "Prizes configured", hint: "Set the per-game and prize amounts." },
    { ok: supported, label: "Event data ready", hint: "The event isn't fully set up by the platform owner yet." },
  ];

  const sim = useMemo(() => {
    if (!canSim) return null;
    const rng = mulberry32(nonce >>> 0);
    const rndScore = () => `${Math.floor(rng() * 5)}-${Math.floor(rng() * 5)}`;

    const inputs = names.map((name, i) => ({ id: `sim-${i}`, name, createdAt: 1_700_000_000_000 + i }));
    const players = dealTickets(inputs, fund, prizes, rng);

    const fixtures = groupFixtures(groups);
    const groupGames = fixtures.map((f) => ({ gameIndex: f.index, score: rndScore(), label: `${f.home} v ${f.away}` }));
    const table = groupTable(groups, groupGames);
    const qs = qualifiers(groupOrderFromTable(table), bestThirds(table));
    const bracket = playBracket(qs, (x, y) => (rng() < 0.5 ? x : y));
    const { finalists, champion } = deriveFinalChampion(bracket);
    const { groupFirst, groupSecond } = deriveGroupPlacings(table);

    const koGames = Array.from({ length: Math.max(0, totalGames - fixtures.length) }, (_, i) => ({
      gameIndex: fixtures.length + i, score: rndScore(), label: "Knockout",
    }));
    const games = [...groupGames, ...koGames];
    const topScorer = scorerPool.length ? scorerPool[Math.floor(rng() * scorerPool.length)] : "";

    const results: Results = { games, groupFirst, groupSecond, finalists, champion, topScorer };
    const config: Config = { fund, seed: nonce >>> 0, prizes, generated: true };
    const scoring = compute(players, results, config);
    return { results, config, scoring, bracket, table };
  }, [canSim, nonce, names, fund, prizes, groups, scorerPool, totalGames]);

  const tabs: [Tab, string][] = [["board", "Leaderboard"], ["groups", "Groups"], ["bracket", "Bracket"], ["tickets", "Tickets"], ["daily", "Games"]];
  const title = organiser ? `Test Event · ${type.name}` : `Dry run · ${type.name}`;

  return (
    <div className="card" style={{ borderColor: "var(--blue)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h2 className="h2" style={{ margin: 0 }}>{title}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {canSim && <button className="btn ghost sm" onClick={() => setNonce(Math.floor(Math.random() * 1e9))}>🎲 Re-roll</button>}
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
      </div>
      <p className="p small muted" style={{ marginTop: 6 }}>
        {organiser
          ? "A throwaway simulation with your current roster & settings — nothing is saved."
          : `A throwaway simulation with ${DUMMY_COUNT} dummy players — nothing is saved.`}
        {sim && <> Champion: <b style={{ color: "var(--amber)" }}>{sim.results.champion || "—"}</b>.</>}
      </p>

      {organiser && (
        <div className="card subtle" style={{ marginTop: 8 }}>
          <div className="t-lbl">Readiness</div>
          {checks.map((c) => (
            <div key={c.label} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, padding: "3px 0" }}>
              <span style={{ color: c.ok ? "var(--cyan)" : "var(--coral)", fontWeight: 800 }}>{c.ok ? "✓" : "✗"}</span>
              <span>{c.label}{!c.ok && <span className="muted"> — {c.hint}</span>}</span>
            </div>
          ))}
        </div>
      )}

      {started ? (
        <div className="card muted" style={{ marginTop: 8 }}>This event has already kicked off — test mode is closed.</div>
      ) : !supported ? (
        <div className="card muted" style={{ marginTop: 8 }}>
          The simulator currently supports the 12-group World Cup format. This type has {groupCount} group{groupCount === 1 ? "" : "s"}.
        </div>
      ) : !sim ? (
        <div className="card muted" style={{ marginTop: 8 }}>Add at least 2 players to run the simulation.</div>
      ) : (
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
          {tab === "groups" && <GroupTables table={sim.table} />}
          {tab === "bracket" && <Bracket bracket={sim.bracket} />}
          {tab === "tickets" && <Tickets scoring={sim.scoring} config={sim.config} results={sim.results} />}
          {tab === "daily" && <Games scoring={sim.scoring} config={sim.config} results={sim.results} />}
        </>
      )}
    </div>
  );
}
