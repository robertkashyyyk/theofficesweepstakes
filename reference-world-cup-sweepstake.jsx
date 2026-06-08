import React, { useState, useEffect, useMemo, useCallback } from "react";

/* =========================================================================
   OFFICE WORLD CUP 2026 SWEEPSTAKE  —  organiser-driven
   - Set fund → staff → names → prize amounts (£ or %) → generate.
   - Four SEPARATE team deals (Winner / Finalist / Group winner / Group RU).
   - Value-equalised: anyone short-changed on a big market is topped up
     with extra small tickets so expected winnings stay level.
   - Scorelines ROTATE every game (seeded), £ per game, split if shared,
     unheld results roll into the Winner's jackpot.
   - Winner takes whatever's left in the fund.
   ========================================================================= */

/* ----------------------------- DATA ------------------------------------ */
const GROUPS = {
  A: ["Mexico", "South Africa", "South Korea", "Czechia"],
  B: ["Canada", "Qatar", "Switzerland", "Bosnia & Herzegovina"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["United States", "Paraguay", "Australia", "Türkiye"],
  E: ["Germany", "Curaçao", "Côte d'Ivoire", "Ecuador"],
  F: ["Netherlands", "Japan", "Tunisia", "Sweden"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Cabo Verde", "Uruguay", "Saudi Arabia"],
  I: ["France", "Senegal", "Norway", "Iraq"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};
const TEAMS = Object.values(GROUPS).flat();
const TOTAL_GAMES = 104;

// ordered 90-min correct-score pool (team 1 first), 0-0 up to 4-4 = 25 entries
const SCORELINES = (() => {
  const out = [];
  for (let t1 = 0; t1 <= 4; t1++) for (let t2 = 0; t2 <= 4; t2++) out.push(`${t1}-${t2}`);
  return out;
})();

const SCORER_POOL = [
  "Kylian Mbappé (France)", "Ousmane Dembélé (France)", "Michael Olise (France)", "Marcus Thuram (France)",
  "Harry Kane (England)", "Jude Bellingham (England)", "Bukayo Saka (England)", "Phil Foden (England)",
  "Lamine Yamal (Spain)", "Pedri (Spain)", "Dani Olmo (Spain)", "Mikel Oyarzabal (Spain)",
  "Vinícius Jr (Brazil)", "Raphinha (Brazil)", "Rodrygo (Brazil)", "Endrick (Brazil)",
  "Lionel Messi (Argentina)", "Lautaro Martínez (Argentina)", "Julián Álvarez (Argentina)",
  "Cristiano Ronaldo (Portugal)", "Bruno Fernandes (Portugal)", "Rafael Leão (Portugal)", "Gonçalo Ramos (Portugal)",
  "Cody Gakpo (Netherlands)", "Memphis Depay (Netherlands)", "Donyell Malen (Netherlands)",
  "Florian Wirtz (Germany)", "Kai Havertz (Germany)", "Jamal Musiala (Germany)",
  "Romelu Lukaku (Belgium)", "Kevin De Bruyne (Belgium)", "Jérémy Doku (Belgium)",
  "Erling Haaland (Norway)", "Alexander Sørloth (Norway)",
  "Mohamed Salah (Egypt)", "Youssef En-Nesyri (Morocco)", "Achraf Hakimi (Morocco)",
  "Nicolas Jackson (Senegal)", "Sébastien Haller (Côte d'Ivoire)",
  "Darwin Núñez (Uruguay)", "Luis Díaz (Colombia)", "James Rodríguez (Colombia)",
  "Enner Valencia (Ecuador)", "Takefusa Kubo (Japan)", "Kaoru Mitoma (Japan)",
  "Son Heung-min (South Korea)", "Breel Embolo (Switzerland)", "Marko Arnautović (Austria)",
  "Raúl Jiménez (Mexico)", "Santiago Giménez (Mexico)", "Christian Pulisic (United States)",
  "Folarin Balogun (United States)", "Mohammed Kudus (Ghana)", "Antoine Semenyo (Ghana)",
];

const DEFAULT_PRIZES = {
  perGame: 1,                          // £ per game (fixed £)
  finalist: { mode: "£", value: 30 },  // each finalist (×2)
  groupWinner: { mode: "£", value: 4 },// each (×12)
  groupRunnerUp: { mode: "£", value: 2 },// each (×12)
  boot: { mode: "£", value: 40 },      // ×1
};
const DEFAULT_CONFIG = {
  fund: 500, pin: "1234", generated: false, seed: 0, prizes: DEFAULT_PRIZES,
};
const DEFAULT_RESULTS = {
  games: [], groupFirst: {}, groupSecond: {}, finalists: [], champion: "", topScorer: "",
};

/* --------------------------- STORAGE ----------------------------------- */
const SHARED = true;
const hasStorage = typeof window !== "undefined" && window.storage;
const mem = new Map();
async function sGet(k) {
  if (!hasStorage) return mem.has(k) ? mem.get(k) : null;
  try { const r = await window.storage.get(k, SHARED); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
async function sSet(k, v) {
  if (!hasStorage) { mem.set(k, v); return true; }
  try { await window.storage.set(k, JSON.stringify(v), SHARED); return true; } catch (e) { console.error(e); return false; }
}
async function sList(p) {
  if (!hasStorage) return [...mem.keys()].filter((k) => k.startsWith(p));
  try { const r = await window.storage.list(p, SHARED); return r ? r.keys : []; } catch { return []; }
}
async function sDel(k) { if (!hasStorage) { mem.delete(k); return; } try { await window.storage.delete(k, SHARED); } catch {} }

/* ---------------------------- HELPERS ---------------------------------- */
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : "p" + Date.now() + Math.random().toString(36).slice(2, 7);
const money = (n) => "£" + (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-GB");
const normScore = (a, b) => `${Math.max(a, b)}-${Math.min(a, b)}`;
const groupOf = (t) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(t));
const toGBP = (item, fund) => item && item.mode === "%" ? (fund * (Number(item.value) || 0)) / 100 : Number(item?.value) || 0;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function seededShuffle(arr, seed) {
  const r = mulberry32(seed >>> 0); const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// scoreline held by player index `pi` for game index `gi`
function scoreFor(seed, gi, pi) {
  const s = (seed + (gi + 1) * 2654435761) >>> 0;
  const deck = seededShuffle(SCORELINES, s);
  return deck[pi % deck.length];
}
const sortedPlayers = (players) => [...players].sort((a, b) => (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : 1));

/* ----------------------- VALUE-EQUALISED DEAL -------------------------- */
function dealTickets(players, fund, prizes) {
  const N = players.length;
  const f = toGBP(prizes.finalist, fund), gw = toGBP(prizes.groupWinner, fund),
    gru = toGBP(prizes.groupRunnerUp, fund), boot = toGBP(prizes.boot, fund);
  const fixed = f * 2 + gw * 12 + gru * 12 + boot + (prizes.perGame * TOTAL_GAMES * 0.5);
  const jackpotEst = Math.max(fund * 0.1, fund - fixed);

  const markets = [
    { key: "winnerTeams", pool: TEAMS, ev: jackpotEst / TEAMS.length },
    { key: "finalistTeams", pool: TEAMS, ev: (2 * f) / TEAMS.length },
    { key: "groupWinnerTeams", pool: TEAMS, ev: (12 * gw) / TEAMS.length },
    { key: "groupRunnerUpTeams", pool: TEAMS, ev: (12 * gru) / TEAMS.length },
    { key: "bootPlayers", pool: SCORER_POOL, ev: boot / SCORER_POOL.length },
  ].sort((a, b) => b.ev - a.ev);

  players.forEach((p) => { p.winnerTeams = []; p.finalistTeams = []; p.groupWinnerTeams = []; p.groupRunnerUpTeams = []; p.bootPlayers = []; });
  const cumEV = players.map(() => 0);

  markets.forEach((m) => {
    const order = players.map((_, i) => i).sort((a, b) => cumEV[a] - cumEV[b]);
    const deck = shuffle(m.pool);
    const counts = players.map(() => 0);
    deck.forEach((item, i) => { const pi = order[i % N]; players[pi][m.key].push(item); counts[pi]++; });
    counts.forEach((c, i) => { cumEV[i] += c * m.ev; });
  });
  players.forEach((p) => {
    p.winnerTeams.sort(); p.finalistTeams.sort(); p.groupWinnerTeams.sort();
    p.groupRunnerUpTeams.sort(); p.bootPlayers.sort();
  });
  return players;
}

/* --------------------------- SCORING ----------------------------------- */
function compute(players, results, config) {
  const fund = Number(config.fund) || 0;
  const P = config.prizes;
  const perGame = Number(P.perGame) || 0;
  const f = toGBP(P.finalist, fund), gw = toGBP(P.groupWinner, fund),
    gru = toGBP(P.groupRunnerUp, fund), boot = toGBP(P.boot, fund);

  const ordered = sortedPlayers(players);
  const idx = {}; ordered.forEach((p, i) => { idx[p.id] = i; });

  const place = {};
  Object.keys(GROUPS).forEach((g) => {
    if (results.groupFirst[g]) place[results.groupFirst[g]] = 1;
    if (results.groupSecond[g]) place[results.groupSecond[g]] = 2;
  });
  const finalists = (results.finalists || []).filter(Boolean);

  const per = {}; ordered.forEach((p) => { per[p.id] = { breakdown: {}, total: 0 }; });
  const add = (id, key, amt) => { if (!amt) return; per[id].breakdown[key] = (per[id].breakdown[key] || 0) + amt; per[id].total += amt; };

  // daily scorelines (rotating, split if shared, unheld -> jackpot)
  const gameWinners = [];
  (results.games || []).forEach((gm, gi) => {
    const holders = ordered.filter((p) => scoreFor(config.seed, gi, idx[p.id]) === gm.score);
    gameWinners.push(holders.map((h) => h.id));
    if (holders.length) { const share = perGame / holders.length; holders.forEach((h) => add(h.id, "daily", share)); }
  });
  // groups / finalists / boot
  ordered.forEach((p) => {
    (p.groupWinnerTeams || []).forEach((t) => { if (place[t] === 1) add(p.id, "groupWinner", gw); });
    (p.groupRunnerUpTeams || []).forEach((t) => { if (place[t] === 2) add(p.id, "groupRunnerUp", gru); });
    (p.finalistTeams || []).forEach((t) => { if (finalists.includes(t)) add(p.id, "finalist", f); });
  });
  if (results.topScorer) {
    const bootHolders = ordered.filter((p) => (p.bootPlayers || []).includes(results.topScorer));
    if (bootHolders.length) { const share = boot / bootHolders.length; bootHolders.forEach((h) => add(h.id, "boot", share)); }
  }

  const paid = ordered.reduce((s, p) => s + per[p.id].total, 0);
  const jackpot = Math.max(0, fund - paid);
  let championHolder = null;
  if (results.champion) {
    const h = ordered.find((p) => (p.winnerTeams || []).includes(results.champion));
    if (h) { championHolder = h.id; add(h.id, "jackpot", jackpot); }
  }
  return { per, paid, jackpot, championHolder, gameWinners, ordered, idx };
}

/* projected breakdown for the setup preview */
function projection(fund, prizes, numStaff) {
  const f = toGBP(prizes.finalist, fund), gw = toGBP(prizes.groupWinner, fund),
    gru = toGBP(prizes.groupRunnerUp, fund), boot = toGBP(prizes.boot, fund);
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

/* ============================ COMPONENT ================================= */
export default function App() {
  const [tab, setTab] = useState("home");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [players, setPlayers] = useState([]);
  const [results, setResults] = useState(DEFAULT_RESULTS);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2800); };

  const loadAll = useCallback(async () => {
    const cfg = (await sGet("wc:config")) || DEFAULT_CONFIG;
    const res = (await sGet("wc:results")) || DEFAULT_RESULTS;
    const keys = await sList("wc:player:");
    const pls = [];
    for (const k of keys) { const p = await sGet(k); if (p) pls.push(p); }
    setConfig({ ...DEFAULT_CONFIG, ...cfg, prizes: { ...DEFAULT_PRIZES, ...(cfg.prizes || {}) } });
    setResults({ ...DEFAULT_RESULTS, ...res });
    setPlayers(pls);
    setLoading(false);
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    if (tab === "org") return;
    const t = setInterval(loadAll, 25000); return () => clearInterval(t);
  }, [tab, loadAll]);

  const scoring = useMemo(() => compute(players, results, config), [players, results, config]);

  const saveConfig = async (c) => { setConfig(c); await sSet("wc:config", c); };
  const saveResults = async (r) => { setResults(r); await sSet("wc:results", r); };

  const generate = async (fund, prizes, names, pin) => {
    const old = await sList("wc:player:"); for (const k of old) await sDel(k);
    let pls = names.map((n, i) => ({ id: uid(), name: n.trim(), createdAt: Date.now() + i }));
    pls = dealTickets(pls, fund, prizes);
    for (const p of pls) await sSet("wc:player:" + p.id, p);
    const seed = Math.floor(Math.random() * 1e9);
    await sSet("wc:config", { fund, prizes, pin, generated: true, seed });
    await sSet("wc:results", DEFAULT_RESULTS);
    await loadAll();
    setTab("tickets");
    flash("🎟️ Tickets generated and dealt!");
  };
  const resetAll = async () => {
    const old = await sList("wc:player:"); for (const k of old) await sDel(k);
    await sSet("wc:config", { ...config, generated: false });
    await sSet("wc:results", DEFAULT_RESULTS);
    await loadAll();
    flash("Reset — set up a new draw.");
  };

  const Pot = () => {
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
  };

  const tabs = [["home", "How it works"], ["tickets", "Tickets"], ["daily", "Daily games"], ["board", "Leaderboard"], ["org", "Organiser"]];

  return (
    <div className="wrap">
      <style>{CSS}</style>
      <header className="hero">
        <div className="hero-tag">FREE TO ENTER · PURE LUCK · {players.length} {players.length === 1 ? "PLAYER" : "PLAYERS"}</div>
        <h1 className="hero-title">THE OFFICE<br /><span>WORLD CUP</span> SWEEP</h1>
        <p className="hero-sub">USA · Canada · Mexico — 11 June to 19 July 2026 — 48 teams, 104 games.</p>
      </header>
      <Pot />
      <nav className="tabs">
        {tabs.map(([id, l]) => <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{l}</button>)}
        <button className="tab ghost" onClick={loadAll} title="Refresh">⟳</button>
      </nav>

      {loading ? <div className="card muted">Loading…</div> : !config.generated && tab !== "org" && tab !== "home" ? (
        <div className="card muted">The draw hasn't been set up yet. The organiser sets it up in the <b>Organiser</b> tab.</div>
      ) : (
        <main>
          {tab === "home" && <Home config={config} />}
          {tab === "tickets" && <Tickets players={players} scoring={scoring} config={config} results={results} />}
          {tab === "daily" && <Daily players={players} scoring={scoring} config={config} results={results} />}
          {tab === "board" && <Board players={players} scoring={scoring} results={results} />}
          {tab === "org" && <Organiser {...{ config, saveConfig, results, saveResults, players, generate, resetAll, scoring, flash }} />}
        </main>
      )}

      {!hasStorage && <div className="card warn">⚠️ Preview mode — entries won't be saved or shared. Publish the artifact for the shared version everyone can use.</div>}
      <footer className="foot">Free office sweepstake · all amounts editable in the Organiser tab.</footer>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ============================== TABS ==================================== */
function Home({ config }) {
  const fund = Number(config.fund) || 0;
  const P = config.prizes;
  const f = toGBP(P.finalist, fund), gw = toGBP(P.groupWinner, fund), gru = toGBP(P.groupRunnerUp, fund), boot = toGBP(P.boot, fund);
  const rows = [
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

function Tickets({ players, scoring, config, results }) {
  if (!config.generated) return <div className="card muted">Not generated yet.</div>;
  const ordered = scoring.ordered;
  const nextGame = (results.games || []).length;
  const list = [...ordered].sort((a, b) => (scoring.per[b.id]?.total || 0) - (scoring.per[a.id]?.total || 0));
  return (
    <div className="tickets-grid">
      {list.map((pl) => {
        const pi = scoring.idx[pl.id];
        const upcoming = scoreFor(config.seed, nextGame, pi);
        return <Ticket key={pl.id} pl={pl} sc={scoring.per[pl.id]} champ={scoring.championHolder === pl.id} upcoming={upcoming} gameNo={nextGame + 1} />;
      })}
    </div>
  );
}
function TeamLine({ label, teams }) {
  if (!teams || !teams.length) return null;
  return (<div className="t-block"><div className="t-lbl">{label}</div>
    <div className="t-teams">{teams.map((t) => <span className="t-team" key={t}>{t}<i>{groupOf(t)}</i></span>)}</div></div>);
}
function Ticket({ pl, sc, champ, upcoming, gameNo }) {
  const b = sc?.breakdown || {};
  const lines = [["Daily", b.daily], ["Group winner", b.groupWinner], ["Runner-up", b.groupRunnerUp], ["Finalist", b.finalist], ["Golden Boot", b.boot], ["🏆 Jackpot", b.jackpot]].filter(([, v]) => v);
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
        <div className="t-block scoreline-now"><div className="t-lbl">⚽ Correct score · game {gameNo}</div><div className="t-pill">{upcoming}</div><span className="rotates">team 1–team 2 · rotates next game</span></div>
      </div>
      {lines.length > 0 && <div className="ticket-foot">{lines.map(([k, v]) => <span className="win" key={k}>{k} <b>{money(v)}</b></span>)}</div>}
    </div>
  );
}

function Daily({ players, scoring, config, results }) {
  const games = results.games || [];
  const paidGames = scoring.gameWinners.filter((w) => w.length).length;
  return (
    <div className="stack">
      <div className="card">
        <h2 className="h2">Daily games <span className="muted" style={{ fontWeight: 400 }}>· {games.length} of {TOTAL_GAMES} logged</span></h2>
        <p className="p small">{paidGames} paid out at {money(config.prizes.perGame)} each; {games.length - paidGames} landed on a scoreline nobody held and rolled into the jackpot.</p>
      </div>
      {games.length === 0 ? <div className="card muted">No games logged yet. The organiser logs each 90-minute result in the Organiser tab.</div> :
        [...games].map((g, gi) => ({ g, gi })).reverse().map(({ g, gi }) => {
          const winners = (scoring.gameWinners[gi] || []).map((id) => scoring.ordered.find((p) => p.id === id)?.name).filter(Boolean);
          return (
            <div className="card game" key={gi}>
              <div className="game-l"><span className="game-no">#{gi + 1}</span><span className="game-score">{g.score}</span><span className="game-label">{g.label || "Match"}</span></div>
              <div className="game-r">{winners.length ? winners.map((n) => <span className="chip win-chip" key={n}>{n} +{money(config.prizes.perGame / winners.length)}</span>) : <span className="muted">→ jackpot</span>}</div>
            </div>
          );
        })}
    </div>
  );
}

function Board({ players, scoring, results }) {
  if (!players.length) return <div className="card muted">No players yet.</div>;
  const list = [...scoring.ordered].sort((a, b) => (scoring.per[b.id]?.total || 0) - (scoring.per[a.id]?.total || 0));
  return (
    <div className="stack">
      {!results.champion && <div className="card subtle"><p className="p small">Live standings. The 🏆 jackpot ({money(scoring.jackpot)}) is shown against whoever holds the eventual champion.</p></div>}
      <div className="card">
        <table className="board"><thead><tr><th>#</th><th>Player</th><th style={{ textAlign: "right" }}>Won</th></tr></thead>
          <tbody>{list.map((p, i) => (
            <tr key={p.id} className={scoring.championHolder === p.id ? "champ-row" : ""}>
              <td className="rank">{i + 1}</td><td>{p.name}{scoring.championHolder === p.id && " 🏆"}</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{money(scoring.per[p.id]?.total || 0)}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ----------------------------- ORGANISER -------------------------------- */
function Organiser(props) {
  const { config } = props;
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  if (!authed) return (
    <div className="card">
      <h2 className="h2">Organiser access</h2>
      <p className="p small">Enter the PIN. (Light protection only — not real security.)</p>
      <div className="join-row">
        <input className="input" type="password" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (pin === config.pin ? setAuthed(true) : props.flash("Wrong PIN"))} />
        <button className="btn" onClick={() => pin === config.pin ? setAuthed(true) : props.flash("Wrong PIN")}>Unlock</button>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>Default PIN <b>1234</b>.</p>
    </div>
  );
  return config.generated ? <OrgManage {...props} /> : <Setup {...props} />;
}

function Setup({ config, generate, flash }) {
  const [fund, setFund] = useState(config.fund || 500);
  const [num, setNum] = useState(20);
  const [names, setNames] = useState(Array.from({ length: 20 }, () => ""));
  const [prizes, setPrizes] = useState(config.prizes || DEFAULT_PRIZES);
  const [pin, setPin] = useState(config.pin || "1234");

  const setCount = (n) => {
    n = Math.max(2, Math.min(80, Number(n) || 0));
    setNum(n);
    setNames((prev) => Array.from({ length: n }, (_, i) => prev[i] || ""));
  };
  const setName = (i, v) => setNames((prev) => prev.map((x, j) => (j === i ? v : x)));
  const setPrize = (key, patch) => setPrizes((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  const proj = useMemo(() => projection(Number(fund) || 0, prizes, num), [fund, prizes, num]);
  const filled = names.filter((n) => n.trim()).length;
  const dupe = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean)).size !== filled;
  const ready = filled === num && !dupe && (Number(fund) || 0) > 0;

  const doGen = () => {
    if (!ready) { flash(dupe ? "Names must be unique." : "Fill in every name and a fund."); return; }
    if (proj.winnerFloor < 0 && !window.confirm("Your prizes commit more than the fund, so the Winner could get £0. Generate anyway?")) return;
    generate(Number(fund), prizes, names, pin);
  };

  const PrizeRow = ({ label, k }) => (
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

  return (
    <div className="stack">
      <div className="card">
        <h2 className="h2">1 · Prize fund</h2>
        <div className="join-row"><span className="prefix">£</span>
          <input className="input" type="number" min="0" value={fund} onChange={(e) => setFund(e.target.value)} /></div>
      </div>

      <div className="card">
        <h2 className="h2">2 · Staff</h2>
        <label className="fld" style={{ maxWidth: 180 }}><span>Number of players</span>
          <input className="input" type="number" min="2" max="80" value={num} onChange={(e) => setCount(e.target.value)} /></label>
        <div className="names-grid">
          {names.map((n, i) => (
            <input key={i} className="input" placeholder={`Player ${i + 1}`} value={n} onChange={(e) => setName(i, e.target.value)} />
          ))}
        </div>
        {dupe && <p className="p small" style={{ color: "var(--coral)" }}>Two names match — they need to be unique.</p>}
      </div>

      <div className="card">
        <h2 className="h2">3 · Prize amounts</h2>
        <p className="p small">Set each as £ or % of the fund. The Winner takes whatever's left.</p>
        <div className="prizeset">
          <span className="ps-label">⚽ Daily scoreline (per game)</span>
          <div className="ps-controls">
            <span className="prefix sm">£</span>
            <input className="input num2" type="number" min="0" step="0.5" value={prizes.perGame} onChange={(e) => setPrizes((p) => ({ ...p, perGame: Number(e.target.value) }))} />
            <span className="ps-gbp">× up to {TOTAL_GAMES} games = up to {money((Number(prizes.perGame) || 0) * TOTAL_GAMES)}</span>
          </div>
        </div>
        <PrizeRow label="🥇 Group winner (×12)" k="groupWinner" />
        <PrizeRow label="🥈 Group runner-up (×12)" k="groupRunnerUp" />
        <PrizeRow label="🎽 Reaches the final (×2)" k="finalist" />
        <PrizeRow label="👟 Golden Boot (×1)" k="boot" />
      </div>

      <div className="card">
        <h2 className="h2">Outcome check</h2>
        <table className="breakdown">
          <thead><tr><th>Prize</th><th>Each</th><th>Pays</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
          <tbody>
            {proj.rows.map((r) => (<tr key={r.name}><td>{r.name}</td><td>{money(r.unit)}</td><td className="muted">{r.note}</td><td style={{ textAlign: "right" }}>{money(r.total)}</td></tr>))}
            <tr className="br-sum"><td>Committed to small prizes</td><td></td><td></td><td style={{ textAlign: "right" }}>{money(proj.committed)}</td></tr>
            <tr className={"br-win" + (proj.winnerFloor < 0 ? " bad" : "")}><td>🏆 Winner's jackpot (at least)</td><td></td><td className="muted">remainder</td><td style={{ textAlign: "right", fontWeight: 800 }}>{money(Math.max(0, proj.winnerFloor))}</td></tr>
          </tbody>
        </table>
        {proj.winnerFloor < 0
          ? <p className="p small" style={{ color: "var(--coral)" }}>⚠️ Small prizes commit {money(proj.committed)} — more than the {money(proj.fund)} fund. Trim them or the Winner gets nothing.</p>
          : <p className="p small">In practice the Winner usually gets <b>more</b> than this: any daily game whose score nobody holds rolls back into the jackpot.</p>}
      </div>

      <div className="card">
        <h2 className="h2">4 · Generate</h2>
        <label className="fld" style={{ maxWidth: 200 }}><span>Organiser PIN</span><input className="input" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
        <div style={{ marginTop: 12 }}><button className="btn big" disabled={!ready} onClick={doGen}>🎟️ Generate & deal {num} ticket books</button></div>
        {!ready && <p className="muted small" style={{ marginTop: 8 }}>{filled}/{num} names entered.</p>}
      </div>
    </div>
  );
}

function OrgManage({ config, results, saveResults, resetAll, scoring, flash }) {
  const [a, setA] = useState(0), [b, setB] = useState(0), [label, setLabel] = useState("");
  const games = results.games || [];
  const logGame = () => {
    saveResults({ ...results, games: [...games, { score: `${Number(a)}-${Number(b)}`, label: label.trim() }] });
    setA(0); setB(0); setLabel(""); flash(`Logged game #${games.length + 1}.`);
  };
  const undoLast = () => saveResults({ ...results, games: games.slice(0, -1) });
  const setGroup = (g, slot, team) => { const key = slot === 1 ? "groupFirst" : "groupSecond"; saveResults({ ...results, [key]: { ...results[key], [g]: team } }); };
  const setFinalist = (i, t) => { const f = [...(results.finalists || ["", ""])]; f[i] = t; saveResults({ ...results, finalists: f }); };
  const finalistOpts = (results.finalists || []).filter(Boolean);

  return (
    <div className="stack">
      <div className="card">
        <h2 className="h2">Log a game · {money(config.prizes.perGame)} each</h2>
        <p className="p small">Next is <b>game #{games.length + 1}</b>. Scorelines rotate each game, so log in order. <b>Order matters now</b> — enter the goals for the team listed first in the fixture, then the second team.</p>
        <div className="game-form">
          <label className="scorefld"><span>Team 1</span><input className="input num" type="number" min="0" value={a} onChange={(e) => setA(e.target.value)} /></label>
          <span className="dash">–</span>
          <label className="scorefld"><span>Team 2</span><input className="input num" type="number" min="0" value={b} onChange={(e) => setB(e.target.value)} /></label>
          <input className="input" placeholder="Fixture (e.g. Brazil v Scotland)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn" onClick={logGame}>Log</button>
        </div>
        {games.length > 0 && <div style={{ marginTop: 12 }}>
          <span className="muted small">Last logged: #{games.length} ({games[games.length - 1].score}) </span>
          <button className="btn ghost sm" onClick={undoLast}>Undo last</button>
        </div>}
      </div>

      <div className="card">
        <h2 className="h2">Group placements</h2>
        <p className="p small">Set 1st & 2nd in each group when the group stage ends.</p>
        <div className="groups-grid">
          {Object.keys(GROUPS).map((g) => (
            <div className="grp" key={g}><div className="grp-h">Group {g}</div>
              <select className="input mini" value={results.groupFirst[g] || ""} onChange={(e) => setGroup(g, 1, e.target.value)}><option value="">1st…</option>{GROUPS[g].map((t) => <option key={t}>{t}</option>)}</select>
              <select className="input mini" value={results.groupSecond[g] || ""} onChange={(e) => setGroup(g, 2, e.target.value)}><option value="">2nd…</option>{GROUPS[g].map((t) => <option key={t}>{t}</option>)}</select>
            </div>))}
        </div>
      </div>

      <div className="card">
        <h2 className="h2">Knockout results</h2>
        <div className="kg">
          <label className="fld"><span>Finalist 1</span><select className="input" value={(results.finalists || [])[0] || ""} onChange={(e) => setFinalist(0, e.target.value)}><option value="">—</option>{TEAMS.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="fld"><span>Finalist 2</span><select className="input" value={(results.finalists || [])[1] || ""} onChange={(e) => setFinalist(1, e.target.value)}><option value="">—</option>{TEAMS.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="fld"><span>🏆 Champion (jackpot)</span><select className="input" value={results.champion || ""} onChange={(e) => saveResults({ ...results, champion: e.target.value })}><option value="">—</option>{(finalistOpts.length ? finalistOpts : TEAMS).map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="fld wide"><span>👟 Golden Boot</span><select className="input" value={results.topScorer || ""} onChange={(e) => saveResults({ ...results, topScorer: e.target.value })}><option value="">—</option>{SCORER_POOL.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
      </div>

      <div className="card">
        <h2 className="h2">Danger zone</h2>
        <button className="btn danger" onClick={() => window.confirm("Wipe all tickets, the draw and results, and start a new setup?") && resetAll()}>Reset & re-run setup</button>
      </div>
    </div>
  );
}

/* =============================== CSS ==================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box}
:root{--bg:#070b1f;--bg2:#0c1330;--surface:#121a3d;--surface2:#162149;--ink:#eef1ff;--muted:#8a96c8;--line:rgba(255,255,255,.09);--blue:#3d63ff;--cyan:#34d6ff;--coral:#ff476f;--amber:#ffc24a;}
.wrap{font-family:'Manrope',system-ui,sans-serif;color:var(--ink);background:radial-gradient(900px 500px at 12% -8%,rgba(61,99,255,.28),transparent 60%),radial-gradient(800px 500px at 95% 4%,rgba(255,71,111,.20),transparent 55%),var(--bg);min-height:100vh;padding:22px;max-width:1080px;margin:0 auto;}
.hero{text-align:center;padding:14px 0 6px}
.hero-tag{font-size:11px;letter-spacing:.28em;color:var(--cyan);font-weight:700}
.hero-title{font-family:'Anton',sans-serif;font-weight:400;line-height:.92;font-size:clamp(40px,9vw,82px);margin:8px 0 6px;text-transform:uppercase}
.hero-title span{color:var(--coral);-webkit-text-stroke:1px rgba(255,255,255,.15)}
.hero-sub{color:var(--muted);font-size:14px;margin:0}
.pot{background:linear-gradient(180deg,var(--surface),var(--bg2));border:1px solid var(--line);border-radius:18px;padding:18px;margin:18px 0;box-shadow:0 20px 50px -30px rgba(61,99,255,.6)}
.pot-row{display:flex;gap:10px}
.pot-cell{flex:1;text-align:center;display:flex;flex-direction:column;gap:3px}
.pot-big{font-family:'Anton',sans-serif;font-size:clamp(22px,5vw,38px);line-height:1}
.pot-lbl{font-size:11px;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
.bar{height:7px;background:rgba(255,255,255,.08);border-radius:99px;margin-top:14px;overflow:hidden}
.bar-fill{height:100%;background:linear-gradient(90deg,var(--coral),var(--amber));border-radius:99px;transition:width .5s}
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
.tab{font-family:inherit;font-weight:700;font-size:13px;color:var(--muted);background:var(--surface);border:1px solid var(--line);padding:9px 15px;border-radius:99px;cursor:pointer;transition:.15s}
.tab:hover{color:var(--ink)}
.tab.on{background:var(--blue);color:#fff;border-color:transparent;box-shadow:0 8px 20px -10px var(--blue)}
.tab.ghost{padding:9px 13px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:14px}
.card.subtle{background:var(--bg2)}
.card.warn{background:rgba(255,194,74,.08);border-color:rgba(255,194,74,.3);color:var(--amber);font-size:13px}
.stack{display:flex;flex-direction:column}
.h2{font-family:'Anton',sans-serif;font-weight:400;font-size:23px;margin:0 0 10px;text-transform:uppercase}
.p{color:#c9d0f0;line-height:1.55;margin:0 0 10px;font-size:14.5px}
.p.small{font-size:13px;color:var(--muted)}
.muted{color:var(--muted)}.small{font-size:13px}.p b,.muted b{color:var(--ink)}
.prizes{display:grid;gap:10px}
.prize{background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:13px 15px}
.prize-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.prize-name{font-weight:800;font-size:15px}
.prize-amt{font-family:'Anton',sans-serif;color:var(--cyan);font-size:18px;white-space:nowrap}
.prize-desc{color:var(--muted);font-size:13px;margin-top:4px}
.join-row{display:flex;gap:10px;align-items:stretch}.join-row .input{flex:1}
.prefix{display:flex;align-items:center;font-weight:800;color:var(--muted);font-size:18px}.prefix.sm{font-size:15px}
.input{font-family:inherit;font-size:15px;background:var(--bg2);border:1px solid var(--line);color:var(--ink);padding:11px 13px;border-radius:11px;outline:none;width:100%}
.input:focus{border-color:var(--blue)}
.input.mini{padding:8px 10px;font-size:13px;margin-top:6px}.input.num{width:62px;text-align:center}.input.num2{width:80px;text-align:center}
select.input{appearance:none}
.btn{font-family:inherit;font-weight:800;font-size:14px;background:var(--coral);color:#fff;border:none;padding:11px 20px;border-radius:11px;cursor:pointer;transition:.15s;white-space:nowrap}
.btn:hover{filter:brightness(1.08)}.btn:disabled{opacity:.45;cursor:not-allowed}
.btn.big{font-size:16px;padding:14px 24px;width:100%}
.btn.ghost{background:var(--surface2);color:var(--ink);border:1px solid var(--line)}
.btn.sm{padding:6px 12px;font-size:12px}
.btn.danger{background:transparent;border:1px solid var(--coral);color:var(--coral)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{background:var(--bg2);border:1px solid var(--line);padding:6px 12px;border-radius:99px;font-size:13px;font-weight:600}
.chip.win-chip{background:rgba(52,214,255,.12);border-color:rgba(52,214,255,.4);color:var(--cyan)}
.tickets-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.ticket{background:linear-gradient(180deg,var(--surface2),var(--surface));border:1px solid var(--line);border-radius:16px;overflow:hidden}
.ticket.champ{border-color:var(--amber);box-shadow:0 0 0 1px var(--amber),0 18px 40px -22px var(--amber)}
.ticket-head{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:rgba(255,255,255,.03);border-bottom:1px dashed var(--line)}
.ticket-name{font-weight:800;font-size:16px}
.ticket-total{font-family:'Anton',sans-serif;font-size:20px;color:var(--cyan)}
.ticket.champ .ticket-total{color:var(--amber)}
.ticket-body{padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.t-lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.t-teams{display:flex;flex-wrap:wrap;gap:6px}
.t-team{background:var(--bg2);border:1px solid var(--line);border-radius:8px;padding:4px 9px;font-size:13px;font-weight:600}
.t-team i{color:var(--blue);font-style:normal;font-weight:800;margin-left:5px;font-size:11px}
.t-scorers{display:flex;flex-wrap:wrap;gap:6px}
.t-scorer{background:var(--bg2);border:1px solid var(--line);border-radius:8px;padding:4px 9px;font-size:12px}
.scoreline-now{background:rgba(61,99,255,.08);border:1px solid rgba(61,99,255,.25);border-radius:10px;padding:10px}
.t-pill{display:inline-block;background:var(--blue);color:#fff;font-weight:800;border-radius:8px;padding:6px 14px;font-size:18px}
.rotates{font-size:11px;color:var(--muted);margin-left:10px}
.ticket-foot{display:flex;flex-wrap:wrap;gap:6px;padding:11px 16px;border-top:1px dashed var(--line);background:rgba(0,0,0,.15)}
.win{font-size:11px;color:var(--muted)}.win b{color:var(--cyan);margin-left:2px}
.game{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px}
.game-l{display:flex;align-items:center;gap:12px}
.game-no{font-family:'Anton',sans-serif;color:var(--muted);font-size:15px}
.game-score{font-family:'Anton',sans-serif;font-size:22px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:3px 12px}
.game-label{color:var(--muted);font-size:14px}
.game-r{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.game-form{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.game-form .input:not(.num){flex:1;min-width:160px}
.scorefld{display:flex;flex-direction:column;gap:4px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:800;text-align:center}
.dash{font-size:20px;color:var(--muted)}
.board{width:100%;border-collapse:collapse;font-size:14px}
.board th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:0 10px 10px;border-bottom:1px solid var(--line)}
.board td{padding:11px 10px;border-bottom:1px solid var(--line)}.board tr:last-child td{border-bottom:none}
.rank{font-family:'Anton',sans-serif;color:var(--muted);width:30px}
.champ-row{background:rgba(255,194,74,.08)}.champ-row td{color:var(--amber)}
.names-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:12px}
.groups-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.grp{background:var(--bg2);border:1px solid var(--line);border-radius:11px;padding:11px}.grp-h{font-weight:800;font-size:13px}
.kg{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
.fld{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:var(--muted)}.fld.wide{grid-column:1/-1}
.prizeset{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
.prizeset:last-child{border-bottom:none}
.ps-label{font-weight:700;font-size:14px}
.ps-controls{display:flex;align-items:center;gap:10px}
.ps-gbp{font-size:13px;color:var(--cyan);font-weight:700;min-width:110px}
.seg{display:flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
.seg-b{background:var(--bg2);color:var(--muted);border:none;padding:8px 13px;font-weight:800;cursor:pointer;font-family:inherit}
.seg-b.on{background:var(--blue);color:#fff}
.breakdown{width:100%;border-collapse:collapse;font-size:13.5px}
.breakdown th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:0 8px 8px;border-bottom:1px solid var(--line)}
.breakdown td{padding:9px 8px;border-bottom:1px solid var(--line)}
.br-sum td{font-weight:700;color:var(--ink)}
.br-win td{font-family:'Manrope';color:var(--cyan)}.br-win.bad td{color:var(--coral)}
.foot{text-align:center;color:var(--muted);font-size:12px;margin-top:20px}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--surface2);border:1px solid var(--blue);color:var(--ink);padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;box-shadow:0 20px 50px -20px #000;z-index:50;max-width:90%;text-align:center}
@media(max-width:560px){.pot-row{flex-wrap:wrap}.pot-cell{min-width:45%}.hero-title{font-size:46px}.prizeset{align-items:flex-start}}
`;
