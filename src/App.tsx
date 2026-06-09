import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./lib/supabase";
import {
  compute,
  deriveGroupPlacings,
  groupTable,
  DEFAULT_PRIZES,
  GROUPS,
  type Config,
  type Player,
  type Prizes,
  type Results,
} from "./core";
import {
  claimMyInvites,
  createAccount,
  generateSweepstake,
  getMyAccount,
  getSweepstakeType,
  isPlatformAdmin,
  listAccountPeople,
  listSweepstakes,
  loadBundle,
  logGame,
  resetSweepstake,
  saveResultPatch,
  undoLastGame,
  type Account,
  type Bundle,
  type Role,
  type SweepSummary,
  type SweepstakeType,
} from "./db/repo";
import { money } from "./core";
import { Board, Home, OrgManage, Setup, Tickets } from "./ui/views";
import { AccountDashboard } from "./ui/AccountAdmin";
import { GroupTables } from "./ui/GroupTables";
import { Games } from "./ui/Games";
import { Schedule } from "./ui/Schedule";
import { Stepper, Logo } from "./ui/chrome";

const ONBOARD_STEPS = ["Account", "Staff", "Sweepstake"];

const EMPTY_CONFIG: Config = { fund: 500, seed: 0, prizes: DEFAULT_PRIZES, generated: false };
const EMPTY_RESULTS: Results = { games: [], groupFirst: {}, groupSecond: {}, finalists: [], champion: "", topScorer: "" };

type Tab = "home" | "tickets" | "daily" | "sched" | "groups" | "board" | "org";
type Mode = "dashboard" | "sweep";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [account, setAccount] = useState<Account | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sweeps, setSweeps] = useState<SweepSummary[]>([]);
  const [staffNames, setStaffNames] = useState<string[]>([]);

  const [mode, setMode] = useState<Mode>("dashboard");
  const [sweepstakeId, setSweepstakeId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [sweepType, setSweepType] = useState<SweepstakeType | null>(null);

  const [tab, setTab] = useState<Tab>("home");
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2800); };

  /* ---- auth session ---- */
  useEffect(() => {
    if (!supabaseConfigured) { setAuthReady(true); setAccountLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  /* ---- pull staff names for the Setup prefill (organiser only) ---- */
  const refreshStaffNames = useCallback(async (accountId: string) => {
    try {
      const people = await listAccountPeople(accountId);
      setStaffNames((people.staff ?? []).map((s) => s.name));
    } catch { setStaffNames([]); }
  }, []);

  /* ---- load the user's account + its sweepstakes ---- */
  const refreshAccount = useCallback(async () => {
    if (!account) return;
    const sw = await listSweepstakes(account.id);
    setSweeps(sw);
    await refreshStaffNames(account.id);
  }, [account, refreshStaffNames]);

  useEffect(() => {
    if (!session) { setAccount(null); setAccountLoading(false); return; }
    let cancelled = false;
    (async () => {
      setAccountLoading(true);
      try {
        await claimMyInvites();                 // promote any pending invites to memberships
        const [acc, admin] = await Promise.all([getMyAccount(), isPlatformAdmin()]);
        if (cancelled) return;
        setIsAdmin(admin);
        setAccount(acc);
        if (acc) {
          const sw = await listSweepstakes(acc.id);
          if (cancelled) return;
          setSweeps(sw);
          await refreshStaffNames(acc.id);
        } else {
          setSweeps([]); setStaffNames([]);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) flash("Couldn't load your account.");
      } finally {
        if (!cancelled) setAccountLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session, refreshStaffNames]);

  /* ---- load one sweepstake's bundle ---- */
  const reload = useCallback(async () => {
    if (!sweepstakeId) return;
    try {
      const b = await loadBundle(sweepstakeId);
      setBundle(b);
    } catch (e) {
      console.error(e);
      flash("Couldn't load the sweepstake.");
    }
  }, [sweepstakeId]);

  const openSweep = useCallback(async (id: string) => {
    setSweepstakeId(id);
    setMode("sweep");
    setTab("home");
    setBundle(null);
    setBundleLoading(true);
    try {
      const b = await loadBundle(id);
      setBundle(b);
    } catch (e) {
      console.error(e);
      flash("Couldn't load the sweepstake.");
    } finally {
      setBundleLoading(false);
    }
  }, []);

  const backToDashboard = useCallback(() => {
    setMode("dashboard");
    setSweepstakeId(null);
    setBundle(null);
    refreshAccount();
  }, [refreshAccount]);

  /* ---- realtime + poll fallback (only while viewing a sweep) ---- */
  useEffect(() => {
    if (mode !== "sweep" || !sweepstakeId || tab === "org") return;
    const channel = supabase
      .channel(`sweep:${sweepstakeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game", filter: `sweepstake_id=eq.${sweepstakeId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "result", filter: `sweepstake_id=eq.${sweepstakeId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "sweepstake", filter: `id=eq.${sweepstakeId}` }, () => reload())
      .subscribe();
    const poll = setInterval(reload, 25000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [mode, sweepstakeId, tab, reload]);

  /* ---- the catalogue type behind this sweep (for the Test Event) ---- */
  useEffect(() => {
    const tid = bundle?.typeId;
    if (!tid) { setSweepType(null); return; }
    let cancelled = false;
    getSweepstakeType(tid).then((t) => { if (!cancelled) setSweepType(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [bundle?.typeId]);

  const config = bundle?.config ?? EMPTY_CONFIG;
  const players: Player[] = bundle?.players ?? [];
  const rawResults = bundle?.results ?? EMPTY_RESULTS;
  const role: Role = bundle?.role ?? "player";

  // Live group standings, derived from the logged games (tournament). Group
  // 1st/2nd are computed from the table (only once a group is complete) and
  // injected into the results compute() sees — no more manual group entry.
  const groupTbl = useMemo(() => groupTable(GROUPS, rawResults.games), [rawResults.games]);
  const results = useMemo<Results>(() => {
    const { groupFirst, groupSecond } = deriveGroupPlacings(groupTbl);
    return { ...rawResults, groupFirst, groupSecond };
  }, [rawResults, groupTbl]);

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

  const onCreateAccount = async (name: string) => {
    try {
      await createAccount(name || "My Office");
      const acc = await getMyAccount();
      setAccount(acc);
      setMode("dashboard");
      flash("Account created — add staff and start a sweepstake.");
    } catch (e: any) {
      console.error(e);
      flash(e?.message ?? "Couldn't create account.");
    }
  };

  /* ---- gates ---- */
  if (!supabaseConfigured) return <Shell><div className="card warn">⚠️ Supabase isn't configured. Copy <b>.env.example</b> to <b>.env.local</b> and add your project URL + anon key.</div></Shell>;
  if (!authReady) return <Shell><div className="card muted">Loading…</div></Shell>;
  if (!session) return <Shell><Auth flash={flash} /></Shell>;
  if (accountLoading) return <Shell><div className="card muted">Loading…</div></Shell>;
  if (!account) return <Shell topbar={<TopBar email={session.user.email ?? ""} isAdmin={isAdmin} />}><CreateAccount onCreate={onCreateAccount} email={session.user.email ?? ""} /></Shell>;

  /* ---- account dashboard ---- */
  if (mode === "dashboard") {
    return (
      <Shell topbar={<TopBar email={session.user.email ?? ""} isAdmin={isAdmin} />}>
        <AccountDashboard
          account={account}
          sweeps={sweeps}
          onOpenSweep={openSweep}
          onSweepsChanged={refreshAccount}
          flash={flash}
        />
        {toast && <div className="toast">{toast}</div>}
      </Shell>
    );
  }

  /* ---- a single sweepstake ---- */
  if (bundleLoading || !bundle) return <Shell topbar={<TopBar email={session.user.email ?? ""} isAdmin={isAdmin} onBack={backToDashboard} />}><div className="card muted">Loading…</div></Shell>;

  // Only the tournament engine has app screens so far (field_draw etc. are
  // catalogued but their /app views land in a later phase). Guard, don't crash.
  if (bundle.engine !== "tournament") {
    return (
      <Shell topbar={<TopBar email={session.user.email ?? ""} isAdmin={isAdmin} onBack={backToDashboard} />}>
        <div className="card muted">
          <b>{bundle.name}</b> runs the <b>{bundle.engine}</b> format, which isn't playable in the app yet —
          its screens are coming in a later release. Use <b>← Account</b> to go back.
        </div>
      </Shell>
    );
  }

  // Player/info tabs only — the Organiser controls live in their own header
  // button (below), not mixed in with the player-facing tabs.
  const tabs: [Tab, string][] = [["home", "How it works"], ["tickets", "Tickets"], ["daily", "Games"], ["sched", "Schedule"], ["groups", "Groups"], ["board", "Leaderboard"]];

  return (
    <Shell topbar={<TopBar email={session.user.email ?? ""} isAdmin={isAdmin} onBack={backToDashboard} role={role} />}>
      <header className="app-header-band">
        <div className="app-header-top">
          <div>
            <div className="app-header-title">{bundle.name}</div>
            <div className="app-header-meta">World Cup 2026 · 11 Jun – 19 Jul · 48 teams · 104 games</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {role === "organiser" && (
              tab === "org"
                ? <button className="btn sm" onClick={() => setTab("home")}>← Back to sweep</button>
                : <button className="btn sm" onClick={() => setTab("org")}>⚙ Organiser</button>
            )}
            <button className="btn ghost sm" style={{ color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.3)" }} onClick={reload} title="Refresh">⟳</button>
          </div>
        </div>
        <div className="stat-row">
          <div className="stat-tile"><div className="stat-value">{money(Number(config.fund) || 0)}</div><div className="stat-label">Prize fund</div></div>
          <div className="stat-tile"><div className="stat-value">{money(scoring.paid)}</div><div className="stat-label">Paid out</div></div>
          <div className="stat-tile"><div className="stat-value">{money(scoring.jackpot)}</div><div className="stat-label">{results.champion ? "Winner's pot" : "Jackpot"}</div></div>
          <div className="stat-tile"><div className="stat-value">{players.length}</div><div className="stat-label">Players</div></div>
        </div>
        <div className="fund-bar-wrap"><div className="fund-bar" style={{ width: `${(Number(config.fund) || 0) ? Math.min(100, (scoring.paid / (Number(config.fund) || 1)) * 100) : 0}%` }} /></div>
        <div className="header-tabs">
          {tabs.map(([id, l]) => <button key={id} className={"htab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{l}</button>)}
        </div>
      </header>

      {!config.generated && tab !== "org" && tab !== "home" && tab !== "sched" ? (
        <div className="card muted">The draw hasn't been set up yet. {role === "organiser" ? "Set it up in the " : "The organiser sets it up in the "}<b>Organiser</b> tab.</div>
      ) : (
        <main>
          {tab === "home" && <Home config={config} />}
          {tab === "tickets" && <Tickets scoring={scoring} config={config} results={results} />}
          {tab === "daily" && <Games scoring={scoring} config={config} results={results} />}
          {tab === "sched" && <Schedule groups={GROUPS} games={results.games} />}
          {tab === "groups" && <GroupTables table={groupTbl} />}
          {tab === "board" && <Board scoring={scoring} results={results} />}
          {tab === "org" && role === "organiser" && (
            config.generated
              ? <OrgManage config={config} results={results} players={players} scoring={scoring} actions={actions} flash={flash} />
              : <Setup config={config} onGenerate={onGenerate} flash={flash} staffNames={staffNames} type={sweepType} />
          )}
        </main>
      )}

      <footer className="foot">Office sweepstake · all amounts editable in the Organiser tab.</footer>
      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}

function Shell({ children, topbar }: { children: React.ReactNode; topbar?: React.ReactNode }) {
  return (
    <div className="wrap">
      <div className="app-brandbar">
        <Link to="/" className="brand small-brand"><Logo /> Office Sweepstakes</Link>
      </div>
      {topbar}
      <main>{children}</main>
    </div>
  );
}

function TopBar({ email, isAdmin, onBack, role }: { email: string; isAdmin: boolean; onBack?: () => void; role?: Role }) {
  return (
    <div className="topbar">
      {onBack
        ? <button className="btn ghost sm" onClick={onBack}>← Account</button>
        : <span className={"role-pill" + (role === "organiser" ? " org" : "")}>{role === "organiser" ? "Organiser" : "Organiser console"}</span>}
      <span className="muted small" style={{ marginLeft: "auto" }}>{email}</span>
      {isAdmin && <Link to="/admin" className="btn ghost sm" style={{ marginLeft: 10 }}>Admin</Link>}
      <button className="btn ghost sm" style={{ marginLeft: 10 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  );
}

/* --------------------------- Auth view --------------------------------- */
type AuthMsg = { kind: "error" | "info"; text: string } | null;
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

function Auth({ flash }: { flash: (m: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<AuthMsg>(null);

  const switchMode = (m: "in" | "up") => { setMode(m); setMsg(null); };

  const friendlyError = (e: any): string => {
    const raw = (e?.message || "").toLowerCase();
    if (raw.includes("invalid login")) return "That email or password isn't right.";
    if (raw.includes("email not confirmed")) return "Your email isn't confirmed yet — check your inbox.";
    if (raw.includes("password")) return e.message; // e.g. password-length rules
    return e?.message || "Something went wrong — please try again.";
  };

  const submit = async () => {
    setMsg(null);
    if (!emailOk(email)) { setMsg({ kind: "error", text: "Enter a valid email address." }); return; }
    if (password.length < 6) { setMsg({ kind: "error", text: "Password must be at least 6 characters." }); return; }

    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data.session) {
          flash("Account created — welcome!"); // onAuthStateChange takes it from here
        } else if ((data.user?.identities?.length ?? 0) === 0) {
          // Supabase anti-enumeration: existing email -> no session, no error.
          setMsg({ kind: "error", text: "That email already has an account. Switch to Sign in." });
          setMode("in");
        } else {
          setMsg({ kind: "info", text: "Almost there — check your email to confirm your account, then sign in." });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // success -> onAuthStateChange re-renders the app
      }
    } catch (e: any) {
      setMsg({ kind: "error", text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !busy && emailOk(email) && password.length >= 6;

  return (
    <div className="signin-split">
      <div className="signin-form-panel">
        <div className="seg" style={{ marginBottom: 20, maxWidth: 240 }}>
          <button className={"seg-b" + (mode === "in" ? " on" : "")} style={{ flex: 1 }} onClick={() => switchMode("in")}>Sign in</button>
          <button className={"seg-b" + (mode === "up" ? " on" : "")} style={{ flex: 1 }} onClick={() => switchMode("up")}>Sign up</button>
        </div>
        <h2>{mode === "in" ? "Welcome back" : "Create your account"}</h2>
        <p className="sub">
          {mode === "in"
            ? "Sign in with your work email."
            : "Sign up as an organiser — you'll create a company account and invite colleagues to run sweepstakes."}
        </p>

        {msg && (
          <div className="card" style={{
            margin: "0 0 16px", padding: "10px 13px", fontSize: 13, boxShadow: "none",
            background: msg.kind === "error" ? "#FEF2F2" : "var(--greentint)",
            borderColor: msg.kind === "error" ? "#FECACA" : "#bfe3ce",
            color: msg.kind === "error" ? "var(--red)" : "var(--green)",
          }}>{msg.text}</div>
        )}

        <div className="stack" style={{ gap: 12 }}>
          <input className="input" type="email" autoComplete="email" placeholder="you@company.com"
            value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <input className="input" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"}
            placeholder={mode === "in" ? "Password" : "Create a password (min 6 chars)"}
            value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <button className="btn big" disabled={!canSubmit} onClick={submit}>
            {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </div>

        <p className="muted small" style={{ marginTop: 14 }}>
          {mode === "in"
            ? <>New here? <a className="link" onClick={() => switchMode("up")}>Create an account</a></>
            : <>Already have one? <a className="link" onClick={() => switchMode("in")}>Sign in</a></>}
        </p>
      </div>
      <div className="signin-brand-panel">
        <Logo size={30} />
        <blockquote style={{ marginTop: 16 }}>Run a <em>luck-based</em> office sweepstake for any big event — in minutes.</blockquote>
        <p>World Cup · Grand National · Wimbledon · F1 · the Masters.</p>
      </div>
    </div>
  );
}

/* ---------------------- Create-account view ---------------------------- */
function CreateAccount({ onCreate, email }: { onCreate: (name: string) => void; email: string }) {
  const [name, setName] = useState("");
  return (
    <div style={{ maxWidth: 480, margin: "40px auto" }}>
      <Stepper steps={ONBOARD_STEPS} current={0} />
      <div className="card">
      <h2 className="h2">Create your account</h2>
      <p className="p small">Signed in as {email}. Name your company or office — you'll be its owner, and can add a staff roster, invite co-organisers and run sweepstakes.</p>
      <div className="join-row" style={{ marginTop: 8 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Ltd — London office" />
        <button className="btn" disabled={!name.trim()} onClick={() => onCreate(name)}>Create</button>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>Invited as a co-organiser? It'll appear here automatically once you sign in with the invited email.</p>
      </div>
    </div>
  );
}
