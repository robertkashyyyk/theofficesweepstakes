/* =========================================================================
   Presentational views — ported from world-cup-sweepstake.jsx, retyped against
   the core domain types. Pure display; all data + handlers come from App.
   ========================================================================= */
import { Fragment, useMemo, useState } from "react";
import {
  GROUPS,
  SCORER_POOL,
  TEAMS,
  TOTAL_GAMES,
  groupFixtures,
  groupOf as coreGroupOf,
  groupTable,
  money,
  projection,
  scoreFor,
  toGBP,
  type Config,
  type Player,
  type Prizes,
  type Results,
  type Scoring,
} from "../core";
import { GroupTables } from "./GroupTables";
import { DryRun } from "./DryRun";
import type { SweepstakeType } from "../db/repo";

const groupOf = (t: string) => coreGroupOf(t, GROUPS);

/* ------------------------------ Pot ------------------------------------ */
export function Pot({ config, scoring, results }: { config: Config; scoring: Scoring; results: Results }) {
  const fund = Number(config.fund) || 0;
  const remaining = Math.max(0, fund - scoring.paid);
  return (
    <div className="pot">
      <div className="pot-row">
        <div className="pot-cell"><span className="pot-big">{money(fund)}</span><span className="pot-lbl">Prize fund</span></div>
        <div className="pot-cell"><span className="pot-big" style={{ color: "var(--coral)" }}>{money(scoring.paid)}</span><span className="pot-lbl">Paid out</span></div>
        <div className="pot-cell"><span className="pot-big" style={{ color: "var(--cyan)" }}>{money(remaining)}</span><span className="pot-lbl">{results.champion ? "Winner's jackpot" : "Jackpot (running)"}</span></div>
      </div>
      <div className="bar"><div className="bar-fill" style={{ width: `${fund ? Math.min(100, (scoring.paid / fund) * 100) : 0}%` }} /></div>
    </div>
  );
}

/* ------------------------------ Home ----------------------------------- */
export function Home({ config }: { config: Config }) {
  const fund = Number(config.fund) || 0;
  const P = config.prizes;
  const f = toGBP(P.finalist, fund), gw = toGBP(P.groupWinner, fund), gru = toGBP(P.groupRunnerUp, fund), boot = toGBP(P.boot, fund);
  const rows: [string, string, string][] = [
    ["⚽ Correct score", `${money(P.perGame)} a game`, "Every game you're dealt a fresh correct-score ticket — team 1 (listed first) then team 2 — and it rotates each match. Match the exact 90-min score in fixture order and you win (split if more than one of you holds it). Scores nobody holds roll into the jackpot."],
    ["🥇 Group winner", `${money(gw)} each`, "Each of your group-winner team tickets that tops its group."],
    ["🥈 Group runner-up", `${money(gru)} each`, "Each of your runner-up team tickets that finishes 2nd."],
    ["🎽 Reaches the final", `${money(f)} each`, "Each of your finalist tickets that makes the final."],
    ["👟 Golden Boot", `${money(boot)}`, "Hold the tournament's top scorer."],
    ["🏆 World Cup Winner", "The jackpot", "Hold the team that lifts the cup — take everything left in the fund."],
  ];
  return (
    <div className="stack">
      <div className="card">
        <h2 className="h2">A ticket book each — and something every day</h2>
        <p className="p">There's no picking and no skill. The organiser deals everyone a <b>book of tickets</b>: separate teams for the Winner, the Finalists, Group winners and Group runners-up, a clutch of Golden Boot players, and a <b>fresh scoreline for every single game</b>.</p>
        <p className="p">Because each market is dealt on its own and balanced by value, nobody ends up with a dud hand — if you miss out on a big-ticket draw you get extra smaller tickets to make up for it. And with a rotating scoreline every match, you've got a live shot at {money(P.perGame)} on all 104 games.</p>
      </div>
      <div className="card">
        <h2 className="h2">How the {money(fund)} pays out</h2>
        <div className="prizes">
          {rows.map(([t, amt, d]) => (
            <div className="prize" key={t}>
              <div className="prize-top"><span className="prize-name">{t}</span><span className="prize-amt">{amt}</span></div>
              <div className="prize-desc">{d}</div>
            </div>
          ))}
        </div>
        <p className="p small">The fund is self-balancing: small wins draw it down live and the champion's holder takes the remainder. Unheld scorelines flow back into that jackpot.</p>
      </div>
      <div className="card subtle"><p className="p small"><b>Note:</b> a free-to-enter, luck-based office draw — a straightforward sweepstake rather than anything needing a licence. General info, not legal advice; your HR/finance team can confirm it's fine to run.</p></div>
    </div>
  );
}

/* ---------------------------- Tickets ---------------------------------- */
function TeamLine({ label, teams }: { label: string; teams: string[] }) {
  if (!teams || !teams.length) return null;
  return (
    <div className="t-block"><div className="t-lbl">{label}</div>
      <div className="t-teams">{teams.map((t) => <span className="t-team" key={t}>{t}<i>{groupOf(t)}</i></span>)}</div></div>
  );
}

function Ticket({ pl, sc, champ, upcoming, gameNo, fixture }: { pl: Player; sc: Scoring["per"][string] | undefined; champ: boolean; upcoming: string; gameNo: number; fixture: string }) {
  const b = sc?.breakdown || {};
  const lines: [string, number][] = ([["Daily", b.daily], ["Group winner", b.groupWinner], ["Runner-up", b.groupRunnerUp], ["Finalist", b.finalist], ["Golden Boot", b.boot], ["🏆 Jackpot", b.jackpot]] as [string, number | undefined][]).filter(([, v]) => v).map(([k, v]) => [k, v as number]);
  return (
    <div className={"ticket" + (champ ? " champ" : "")}>
      <div className="ticket-head"><span className="ticket-name">{pl.name}</span><span className="ticket-total">{money(sc?.total || 0)}</span></div>
      <div className="ticket-body">
        <TeamLine label="🏆 Winner" teams={pl.winnerTeams} />
        <TeamLine label="🎽 Reaches final" teams={pl.finalistTeams} />
        <TeamLine label="🥇 Group winner" teams={pl.groupWinnerTeams} />
        <TeamLine label="🥈 Group runner-up" teams={pl.groupRunnerUpTeams} />
        <div className="t-block"><div className="t-lbl">👟 Golden Boot</div>
          <div className="t-scorers">{(pl.bootPlayers || []).map((s) => <span className="t-scorer" key={s}>{s}</span>)}</div></div>
        <div className="t-block scoreline-now">
          <div className="t-lbl">⚽ Correct score · game {gameNo} · {fixture}</div>
          <div className="t-pill">{upcoming}</div>
          <span className="rotates">your scoreline for this game · rotates next game</span>
        </div>
      </div>
      {lines.length > 0 && <div className="ticket-foot">{lines.map(([k, v]) => <span className="win" key={k}>{k} <b>{money(v)}</b></span>)}</div>}
    </div>
  );
}

export function Tickets({ scoring, config, results }: { scoring: Scoring; config: Config; results: Results }) {
  if (!config.generated) return <div className="card muted">Not generated yet.</div>;
  const ordered = scoring.ordered;
  const nextGame = (results.games || []).length;
  const fx = groupFixtures(GROUPS)[nextGame];
  const fixture = fx ? `${fx.home} v ${fx.away}` : "Knockout";
  const list = [...ordered].sort((a, b) => (scoring.per[b.id]?.total || 0) - (scoring.per[a.id]?.total || 0));
  return (
    <div className="tickets-grid">
      {list.map((pl) => {
        const pi = scoring.idx[pl.id];
        const upcoming = scoreFor(config.seed, nextGame, pi);
        return <Ticket key={pl.id} pl={pl} sc={scoring.per[pl.id]} champ={scoring.championHolder === pl.id} upcoming={upcoming} gameNo={nextGame + 1} fixture={fixture} />;
      })}
    </div>
  );
}

/* ----------------------------- Board ----------------------------------- */
export function Board({ scoring, results }: { scoring: Scoring; results: Results }) {
  if (!scoring.ordered.length) return <div className="card muted">No players yet.</div>;
  const list = [...scoring.ordered].sort((a, b) => (scoring.per[b.id]?.total || 0) - (scoring.per[a.id]?.total || 0));
  const top = scoring.per[list[0]?.id]?.total || 0;
  return (
    <div className="stack">
      {!results.champion && <div className="card subtle"><p className="p small">Live standings. The 🏆 jackpot ({money(scoring.jackpot)}) is shown against whoever holds the eventual champion.</p></div>}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {list.map((p, i) => {
          const won = scoring.per[p.id]?.total || 0;
          const champ = scoring.championHolder === p.id;
          return (
            <div key={p.id} style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--border)" : "none", background: champ ? "var(--greentint)" : "#fff" }}>
              <div style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", alignItems: "center", gap: 12 }}>
                <span className="rank" style={{ color: champ ? "var(--green)" : "var(--muted)" }}>{i + 1}</span>
                <span style={{ fontWeight: 600 }}>{p.name}{champ && " 🏆"}</span>
                <span style={{ fontWeight: 700, color: "var(--emerald)" }}>{money(won)}</span>
              </div>
              <div className="lb-bar-wrap" style={{ marginLeft: 44 }}><div className="lb-bar" style={{ width: `${top ? (won / top) * 100 : 0}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------- Setup (organiser) ------------------------- */
export function Setup({ config, onGenerate, flash, staffNames = [], type }: {
  config: Config;
  onGenerate: (fund: number, prizes: Prizes, names: string[]) => void;
  flash: (m: string) => void;
  staffNames?: string[];
  type?: SweepstakeType | null;
}) {
  const [fund, setFund] = useState<number | string>(config.fund || 500);
  const [prizes, setPrizes] = useState<Prizes>(config.prizes);
  const [showTest, setShowTest] = useState(false);
  const [step, setStep] = useState(1);
  const kickoff = type?.startsAt ? new Date(type.startsAt) : null;
  const started = kickoff ? Date.now() >= kickoff.getTime() : false;

  // Players come from the persistent account staff roster (single source of truth).
  const roster = staffNames.filter((n) => n.trim());
  const setPrize = (key: "finalist" | "groupWinner" | "groupRunnerUp" | "boot", patch: Partial<Prizes["finalist"]>) =>
    setPrizes((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  const proj = useMemo(() => projection(Number(fund) || 0, prizes), [fund, prizes]);
  const ready = roster.length >= 2 && (Number(fund) || 0) > 0;

  const doGen = () => {
    if (!ready) { flash(roster.length < 2 ? "Add at least 2 staff on the Account dashboard first." : "Set a prize fund above £0."); return; }
    if (proj.winnerFloor < 0 && !window.confirm("Your prizes commit more than the fund, so the Winner could get £0. Generate anyway?")) return;
    onGenerate(Number(fund), prizes, roster);
  };

  const PrizeRow = ({ label, k }: { label: string; k: "finalist" | "groupWinner" | "groupRunnerUp" | "boot" }) => (
    <div className="prizeset">
      <span className="ps-label">{label}</span>
      <div className="ps-controls">
        <input className="input num2" type="number" min="0" value={prizes[k].value} onChange={(e) => setPrize(k, { value: Number(e.target.value) })} />
        <div className="seg">
          <button className={"seg-b" + (prizes[k].mode === "£" ? " on" : "")} onClick={() => setPrize(k, { mode: "£" })}>£</button>
          <button className={"seg-b" + (prizes[k].mode === "%" ? " on" : "")} onClick={() => setPrize(k, { mode: "%" })}>%</button>
        </div>
        <span className="ps-gbp">= {money(toGBP(prizes[k], Number(fund) || 0))} each</span>
      </div>
    </div>
  );

  const steps = ["Fund & Players", "Prize amounts", "Review & Generate"];
  const wstep = (i: number, label: string) => (
    <>
      <div className={"wizard-step" + (step === i + 1 ? " active" : step > i + 1 ? " done" : "")}>
        <span className="wizard-num">{step > i + 1 ? "✓" : i + 1}</span>{label}
      </div>
      {i < steps.length - 1 && <div className={"wizard-connector" + (step > i + 1 ? " done" : "")} />}
    </>
  );

  return (
    <div className="stack">
      <div className="wizard-steps">{steps.map((l, i) => <Fragment key={l}>{wstep(i, l)}</Fragment>)}</div>

      {step === 1 && (
        <div className="wizard-panel">
          <h3>Step 1 — Fund &amp; Players</h3>
          <div className="form-group">
            <label className="form-label">Total prize fund</label>
            <div className="join-row"><span className="prefix">£</span>
              <input className="input" type="number" min="0" value={fund} onChange={(e) => setFund(e.target.value)} /></div>
          </div>
          <label className="form-label">Players ({roster.length})</label>
          {roster.length ? (
            <div className="chips" style={{ marginBottom: 8 }}>{roster.map((n) => <span key={n} className="chip">{n}</span>)}</div>
          ) : (
            <p className="p small" style={{ color: "var(--red)" }}>No players yet — add at least 2 in the Team Roster on the Account dashboard.</p>
          )}
          <p className="p small muted">Everyone on your staff roster gets a ticket book. Manage players on the Account dashboard — they're saved there.</p>
          <div className="wizard-foot">
            <span />
            <button className="btn" disabled={roster.length < 2 || (Number(fund) || 0) <= 0} onClick={() => setStep(2)}>Next →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-panel">
          <h3>Step 2 — Prize amounts</h3>
          <div className="prizeset">
            <span className="ps-label">⚽ Daily scoreline (per game)</span>
            <div className="ps-controls">
              <span className="prefix sm">£</span>
              <input className="input num2" type="number" min="0" step="0.5" value={prizes.perGame} onChange={(e) => setPrizes((p) => ({ ...p, perGame: Number(e.target.value) }))} />
              <span className="ps-gbp">× up to {TOTAL_GAMES} = {money((Number(prizes.perGame) || 0) * TOTAL_GAMES)}</span>
            </div>
          </div>
          <PrizeRow label="🥇 Group winner (×12)" k="groupWinner" />
          <PrizeRow label="🥈 Group runner-up (×12)" k="groupRunnerUp" />
          <PrizeRow label="🎽 Reaches the final (×2)" k="finalist" />
          <PrizeRow label="👟 Golden Boot (×1)" k="boot" />
          <div className="card subtle" style={{ marginTop: 16, marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="p small muted" style={{ margin: 0 }}>Committed to small prizes: <b>{money(proj.committed)}</b></span>
              <span className="h2" style={{ margin: 0, color: proj.winnerFloor < 0 ? "var(--red)" : "var(--green)" }}>🏆 {money(Math.max(0, proj.winnerFloor))} <span className="p small muted">winner's pot</span></span>
            </div>
            {proj.winnerFloor < 0 && <p className="p small" style={{ color: "var(--red)", margin: "8px 0 0" }}>⚠️ Small prizes exceed the fund — trim them or the Winner gets nothing.</p>}
          </div>
          <div className="wizard-foot">
            <button className="btn ghost" onClick={() => setStep(1)}>← Back</button>
            <button className="btn" onClick={() => setStep(3)}>Next →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-panel">
          <h3>Step 3 — Review &amp; Generate</h3>
          <table className="breakdown">
            <thead><tr><th>Prize</th><th>Each</th><th>Pays</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>
              {proj.rows.map((r) => (<tr key={r.name}><td>{r.name}</td><td>{money(r.unit)}</td><td className="muted">{r.note}</td><td style={{ textAlign: "right" }}>{money(r.total)}</td></tr>))}
              <tr className="br-sum"><td>Committed to small prizes</td><td></td><td></td><td style={{ textAlign: "right" }}>{money(proj.committed)}</td></tr>
              <tr className={"br-win" + (proj.winnerFloor < 0 ? " bad" : "")}><td>🏆 Winner's jackpot (at least)</td><td></td><td className="muted">remainder</td><td style={{ textAlign: "right", fontWeight: 800 }}>{money(Math.max(0, proj.winnerFloor))}</td></tr>
            </tbody>
          </table>

          {type && (
            <div style={{ marginTop: 16 }}>
              {!started ? (
                <button className="btn secondary" onClick={() => setShowTest((s) => !s)}>{showTest ? "Hide test" : "▶ Run a test event first"}</button>
              ) : <p className="p small muted">Test mode closed — the event has kicked off.</p>}
              {kickoff && !started && <span className="p small muted" style={{ marginLeft: 10 }}>Test available until {kickoff.toLocaleDateString()}.</span>}
              {showTest && !started && (
                <div style={{ marginTop: 12 }}>
                  <DryRun type={type} organiser roster={roster} fund={Number(fund) || 0} prizes={prizes} onClose={() => setShowTest(false)} />
                </div>
              )}
            </div>
          )}

          <div className="card subtle" style={{ marginTop: 16, marginBottom: 0, borderColor: "#FDE68A", background: "#FFFBEB" }}>
            <p className="p small" style={{ margin: 0, color: "#92400E" }}>⚠️ Generating deals the books and <b>locks the roster</b> — it can't be undone (only reset). Make sure your {roster.length} players &amp; prizes are right.</p>
          </div>
          <div className="wizard-foot">
            <button className="btn ghost" onClick={() => setStep(2)}>← Back</button>
            <button className="btn generate" disabled={!ready} onClick={doGen}>🎟️ Generate &amp; deal {roster.length} book{roster.length === 1 ? "" : "s"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- OrgManage --------------------------------- */
export function OrgManage({ config, results, players, scoring, actions, flash }: {
  config: Config;
  results: Results;
  players: Player[];
  scoring: Scoring;
  actions: {
    logGame: (score: string, label: string) => Promise<void>;
    undoLast: () => Promise<void>;
    setFinalist: (i: number, team: string) => Promise<void>;
    setChampion: (team: string) => Promise<void>;
    setTopScorer: (s: string) => Promise<void>;
    reset: () => Promise<void>;
  };
  flash: (m: string) => void;
}) {
  void players;
  void scoring;
  const [a, setA] = useState<number | string>(0), [b, setB] = useState<number | string>(0), [label, setLabel] = useState("");
  const games = results.games || [];
  const fixtures = useMemo(() => groupFixtures(GROUPS), []);
  const table = useMemo(() => groupTable(GROUPS, games), [games]);
  const nextFix = fixtures[games.length]; // a known group fixture, or undefined (knockout)

  const logGame = async () => {
    const lbl = nextFix ? `${nextFix.home} v ${nextFix.away}` : label.trim();
    await actions.logGame(`${Number(a)}-${Number(b)}`, lbl);
    setA(0); setB(0); setLabel(""); flash(`Logged game #${games.length + 1}.`);
  };
  const finalistOpts = (results.finalists || []).filter(Boolean);

  return (
    <div className="stack">
      <div className="card">
        <h2 className="h2">Log a game · {money(config.prizes.perGame)} each</h2>
        {nextFix ? (
          <p className="p small">
            Next: <b>game #{games.length + 1}</b> · Group {nextFix.group} ·{" "}
            <b>{nextFix.home} v {nextFix.away}</b>. Enter the score in that order — it updates the group table automatically.
          </p>
        ) : (
          <p className="p small">
            Group stage complete. <b>Game #{games.length + 1}</b> is a knockout match — enter the score and the fixture name.
          </p>
        )}
        <div className="game-form">
          <label className="scorefld"><span>{nextFix ? nextFix.home : "Team 1"}</span><input className="input num" type="number" min="0" value={a} onChange={(e) => setA(e.target.value)} /></label>
          <span className="dash">–</span>
          <label className="scorefld"><span>{nextFix ? nextFix.away : "Team 2"}</span><input className="input num" type="number" min="0" value={b} onChange={(e) => setB(e.target.value)} /></label>
          {!nextFix && <input className="input" placeholder="Fixture (e.g. Final · Brazil v France)" value={label} onChange={(e) => setLabel(e.target.value)} />}
          <button className="btn" onClick={logGame}>Log</button>
        </div>
        {games.length > 0 && <div style={{ marginTop: 12 }}>
          <span className="muted small">Last logged: #{games.length} ({games[games.length - 1].score}{games[games.length - 1].label ? ` · ${games[games.length - 1].label}` : ""}) </span>
          <button className="btn ghost sm" onClick={() => actions.undoLast()}>Undo last</button>
        </div>}
      </div>

      <div className="card">
        <h2 className="h2">Group standings</h2>
        <p className="p small">Builds automatically from the scores you log — top two (highlighted) qualify. No manual entry needed.</p>
        <GroupTables table={table} />
      </div>

      <div className="card">
        <h2 className="h2">Knockout results</h2>
        <div className="kg">
          <label className="fld"><span>Finalist 1</span><select className="input" value={(results.finalists || [])[0] || ""} onChange={(e) => actions.setFinalist(0, e.target.value)}><option value="">—</option>{TEAMS.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="fld"><span>Finalist 2</span><select className="input" value={(results.finalists || [])[1] || ""} onChange={(e) => actions.setFinalist(1, e.target.value)}><option value="">—</option>{TEAMS.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="fld"><span>🏆 Champion (jackpot)</span><select className="input" value={results.champion || ""} onChange={(e) => actions.setChampion(e.target.value)}><option value="">—</option>{(finalistOpts.length ? finalistOpts : TEAMS).map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="fld wide"><span>👟 Golden Boot</span><select className="input" value={results.topScorer || ""} onChange={(e) => actions.setTopScorer(e.target.value)}><option value="">—</option>{SCORER_POOL.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
      </div>

      <div className="card">
        <h2 className="h2">Danger zone</h2>
        <button className="btn danger" onClick={() => window.confirm("Wipe all tickets, the draw and results, and start a new setup?") && actions.reset()}>Reset &amp; re-run setup</button>
      </div>
    </div>
  );
}
