import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./lib/supabase";
import {
  compute,
  DEFAULT_PRIZES,
  type Config,
  type Player,
  type Prizes,
  type Results,
} from "./core";
import {
  createSweepstake,
  generateSweepstake,
  getMySweepstakeId,
  loadBundle,
  logGame,
  resetSweepstake,
  saveResultPatch,
  undoLastGame,
  type Bundle,
  type Role,
} from "./db/repo";
import { Board, Daily, Home, OrgManage, Pot, Setup, Tickets } from "./ui/views";

const EMPTY_CONFIG: Config = { fund: 500, seed: 0, prizes: DEFAULT_PRIZES, generated: false };
const EMPTY_RESULTS: Results = { games: [], groupFirst: {}, groupSecond: {}, finalists: [], champion: "", topScorer: "" };

type Tab = "home" | "tickets" | "daily" | "board" | "org";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [sweepstakeId, setSweepstakeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2800); };

  /* ---- auth session ---- */
  useEffect(() => {
    if (!supabaseConfigured) { setAuthReady(true); setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  /* ---- load the user's sweepstake bundle ---- */
  const reload = useCallback(async () => {
    if (!session) return;
    try {
      const sid = sweepstakeId ?? (await getMySweepstakeId());
      setSweepstakeId(sid);
      if (!sid) { setBundle(null); setLoading(false); return; }
      const b = await loadBundle(sid);
      setBundle(b);
    } catch (e) {
      console.error(e);
      flash("Couldn't load the sweepstake.");
    } finally {
      setLoading(false);
    }
  }, [session, sweepstakeId]);

  useEffect(() => { if (session) { setLoading(true); reload(); } }, [session, reload]);

  /* ---- realtime + poll fallback (§9) ---- */
  useEffect(() => {
    if (!sweepstakeId || tab === "org") return;
    const channel = supabase
      .channel(`sweep:${sweepstakeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game", filter: `sweepstake_id=eq.${sweepstakeId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "result", filter: `sweepstake_id=eq.${sweepstakeId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "sweepstake", filter: `id=eq.${sweepstakeId}` }, () => reload())
      .subscribe();
    const poll = setInterval(reload, 25000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [sweepstakeId, tab, reload]);

  const config = bundle?.config ?? EMPTY_CONFIG;
  const players: Player[] = bundle?.players ?? [];
  const results = bundle?.results ?? EMPTY_RESULTS;
  const role: Role = bundle?.role ?? "player";

  const scoring = useMemo(() => compute(players, results, config), [players, results, config]);

  /* ---- organiser actions ---- */
  const actions = useMemo(() => ({
    logGame: async (score: string, label: string) => {
      if (!sweepstakeId) return;
      await logGame(sweepstakeId, results.games.length, score, label);
      await reload();
    },
    undoLast: async () => {
      if (!sweepstakeId || !results.games.length) return;
      await undoLastGame(sweepstakeId, results.games[results.games.length - 1].gameIndex);
      await reload();
    },
    setGroup: async (g: string, slot: 1 | 2, team: string) => {
      if (!sweepstakeId) return;
      const key = slot === 1 ? "group_first" : "group_second";
      const cur = slot === 1 ? results.groupFirst : results.groupSecond;
      await saveResultPatch(sweepstakeId, { [key]: { ...cur, [g]: team } } as any);
      await reload();
    },
    setFinalist: async (i: number, team: string) => {
      if (!sweepstakeId) return;
      const f = [...(results.finalists || ["", ""])]; f[i] = team;
      await saveResultPatch(sweepstakeId, { finalists: f });
      await reload();
    },
    setChampion: async (team: string) => {
      if (!sweepstakeId) return;
      await saveResultPatch(sweepstakeId, { champion: team });
      await reload();
    },
    setTopScorer: async (s: string) => {
      if (!sweepstakeId) return;
      await saveResultPatch(sweepstakeId, { top_scorer: s });
      await reload();
    },
    reset: async () => {
      if (!sweepstakeId) return;
      await resetSweepstake(sweepstakeId);
      await reload();
      flash("Reset — set up a new draw.");
    },
  }), [sweepstakeId, results, reload]);

  const onGenerate = async (fund: number, prizes: Prizes, names: string[]) => {
    if (!sweepstakeId) return;
    try {
      await generateSweepstake(sweepstakeId, fund, prizes, names);
      await reload();
      setTab("tickets");
      flash("🎟️ Tickets generated and dealt!");
    } catch (e: any) {
      console.error(e);
      flash(e?.message ?? "Generation failed.");
    }
  };

  const onCreate = async (name: string) => {
    try {
      const id = await createSweepstake(name || "Office World Cup Sweep", 500, DEFAULT_PRIZES);
      setSweepstakeId(id);
      await reload();
      setTab("org");
      flash("Draft created — set it up in the Organiser tab.");
    } catch (e: any) {
      console.error(e);
      flash(e?.message ?? "Couldn't create.");
    }
  };

  /* ---- gates ---- */
  if (!supabaseConfigured) return <Shell><div className="card warn">⚠️ Supabase isn't configured. Copy <b>.env.example</b> to <b>.env.local</b> and add your project URL + anon key.</div></Shell>;
  if (!authReady) return <Shell><div className="card muted">Loading…</div></Shell>;
  if (!session) return <Shell><Auth flash={flash} /></Shell>;
  if (loading) return <Shell><div className="card muted">Loading…</div></Shell>;
  if (!bundle) return <Shell><CreateSweep onCreate={onCreate} email={session.user.email ?? ""} /></Shell>;

  const tabs: [Tab, string][] = [["home", "How it works"], ["tickets", "Tickets"], ["daily", "Daily games"], ["board", "Leaderboard"]];
  if (role === "organiser") tabs.push(["org", "Organiser"]);

  return (
    <Shell>
      <div className="topbar">
        <span className={"role-pill" + (role === "organiser" ? " org" : "")}>{role === "organiser" ? "Organiser" : "Player"} · {session.user.email}</span>
        <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
      <header className="hero">
        <div className="hero-tag">FREE TO ENTER · PURE LUCK · {players.length} {players.length === 1 ? "PLAYER" : "PLAYERS"}</div>
        <h1 className="hero-title">THE OFFICE<br /><span>WORLD CUP</span> SWEEP</h1>
        <p className="hero-sub">USA · Canada · Mexico — 11 June to 19 July 2026 — 48 teams, 104 games.</p>
      </header>
      <Pot config={config} scoring={scoring} results={results} />
      <nav className="tabs">
        {tabs.map(([id, l]) => <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{l}</button>)}
        <button className="tab ghost" onClick={reload} title="Refresh">⟳</button>
      </nav>

      {!config.generated && tab !== "org" && tab !== "home" ? (
        <div className="card muted">The draw hasn't been set up yet. {role === "organiser" ? "Set it up in the " : "The organiser sets it up in the "}<b>Organiser</b> tab.</div>
      ) : (
        <main>
          {tab === "home" && <Home config={config} />}
          {tab === "tickets" && <Tickets scoring={scoring} config={config} results={results} />}
          {tab === "daily" && <Daily scoring={scoring} config={config} results={results} />}
          {tab === "board" && <Board scoring={scoring} results={results} />}
          {tab === "org" && role === "organiser" && (
            config.generated
              ? <OrgManage config={config} results={results} players={players} scoring={scoring} actions={actions} flash={flash} />
              : <Setup config={config} onGenerate={onGenerate} flash={flash} />
          )}
        </main>
      )}

      <footer className="foot">Free office sweepstake · all amounts editable in the Organiser tab.</footer>
      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      <main>{children}</main>
    </div>
  );
}

/* --------------------------- Auth view --------------------------------- */
function Auth({ flash }: { flash: (m: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        flash("Account created — check your email if confirmation is on, or sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: any) {
      flash(e?.message ?? "Auth failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2 className="h2">{mode === "in" ? "Sign in" : "Create account"}</h2>
      <p className="p small">Use your work email. Roles (organiser vs player) are assigned per sweepstake.</p>
      <div className="stack" style={{ gap: 10 }}>
        <input className="input" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="btn big" disabled={busy || !email || !password} onClick={submit}>{mode === "in" ? "Sign in" : "Sign up"}</button>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        {mode === "in" ? "No account? " : "Already have one? "}
        <a style={{ color: "var(--cyan)", cursor: "pointer" }} onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Create one" : "Sign in"}
        </a>
      </p>
    </div>
  );
}

/* ---------------------- Create-sweepstake view ------------------------- */
function CreateSweep({ onCreate, email }: { onCreate: (name: string) => void; email: string }) {
  const [name, setName] = useState("Office World Cup Sweep");
  return (
    <div className="card" style={{ maxWidth: 480, margin: "40px auto" }}>
      <h2 className="h2">Start a sweepstake</h2>
      <p className="p small">Signed in as {email}. You'll be the organiser — you can set the fund, add staff and deal the books in the next step.</p>
      <div className="join-row" style={{ marginTop: 8 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sweepstake name" />
        <button className="btn" onClick={() => onCreate(name)}>Create</button>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>Already part of one? Ask your organiser to add your email as a player — then it'll appear here automatically.</p>
    </div>
  );
}
