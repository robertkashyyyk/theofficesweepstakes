/* =========================================================================
   /admin — super-admin (platform owner) console.
     * Phase A: read-only overview of every account + its sweepstakes.
     * Phase B: the sweepstake-type CATALOGUE — view all types, edit metadata
       (name/sport/default prizes/total games/active). Entrant pools (teams/
       groups/scorers) are seeded via migration and edited via SQL.
   Separate from /app; self-gates via is_platform_admin.
   ========================================================================= */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import {
  adminListSweepstakeTypes,
  adminOverview,
  isPlatformAdmin,
  setTypeActive,
  upsertSweepstakeType,
  type AdminAccount,
  type SweepstakeType,
} from "../db/repo";
import type { Prizes } from "../core";

type State =
  | { kind: "loading" }
  | { kind: "signedout" }
  | { kind: "forbidden" }
  | { kind: "ready"; accounts: AdminAccount[] };

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!supabaseConfigured) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!session) { setState({ kind: "signedout" }); return; }
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const admin = await isPlatformAdmin();
      if (cancelled) return;
      if (!admin) { setState({ kind: "forbidden" }); return; }
      try {
        const accounts = await adminOverview();
        if (!cancelled) setState({ kind: "ready", accounts });
      } catch {
        if (!cancelled) setState({ kind: "forbidden" });
      }
    })();
    return () => { cancelled = true; };
  }, [authReady, session]);

  return (
    <div className="wrap">
      <div className="app-brandbar">
        <Link to="/" className="brand small-brand">🎟️ Office Sweepstakes</Link>
      </div>
      <div className="topbar">
        <span className="role-pill org">Platform admin</span>
        <span className="muted small" style={{ marginLeft: "auto" }}>{session?.user.email}</span>
        <Link to="/app" className="btn ghost sm" style={{ marginLeft: 10 }}>Back to app</Link>
        {session && <button className="btn ghost sm" style={{ marginLeft: 10 }} onClick={() => supabase.auth.signOut()}>Sign out</button>}
      </div>

      <main>
        <header className="hero" style={{ paddingBottom: 8 }}>
          <div className="hero-tag">SUPER-ADMIN · READ-ONLY OVERVIEW</div>
          <h1 className="hero-title">Platform <span>console</span></h1>
        </header>

        {!supabaseConfigured && <div className="card warn">⚠️ Supabase isn't configured.</div>}
        {state.kind === "loading" && <div className="card muted">Loading…</div>}
        {state.kind === "signedout" && (
          <div className="card muted">You need to <Link to="/app" style={{ color: "var(--cyan)" }}>sign in</Link> to view the admin console.</div>
        )}
        {state.kind === "forbidden" && (
          <div className="card warn">Not authorised — this area is for platform admins only.</div>
        )}
        {state.kind === "ready" && (
          <div className="stack" style={{ gap: 24 }}>
            <Catalogue />
            <Overview accounts={state.accounts} />
          </div>
        )}
      </main>
    </div>
  );
}

function Overview({ accounts }: { accounts: AdminAccount[] }) {
  const totalSweeps = accounts.reduce((n, a) => n + a.sweepstakes.length, 0);
  if (!accounts.length) return <div className="card muted">No accounts yet.</div>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card subtle">
        <p className="p small">
          <b>{accounts.length}</b> account{accounts.length === 1 ? "" : "s"} ·{" "}
          <b>{totalSweeps}</b> sweepstake{totalSweeps === 1 ? "" : "s"} across the platform.
        </p>
      </div>
      {accounts.map((a) => (
        <div className="card" key={a.id}>
          <h2 className="h2">{a.name}</h2>
          <p className="p small muted">
            Organisers: {a.members.length
              ? a.members.map((m) => `${m.email} (${m.role})`).join(", ")
              : "—"}
          </p>
          {a.sweepstakes.length ? (
            <table className="board" style={{ marginTop: 8 }}>
              <thead><tr><th>Sweepstake</th><th style={{ textAlign: "right" }}>Status</th></tr></thead>
              <tbody>
                {a.sweepstakes.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td style={{ textAlign: "right" }}>
                      <span className={"role-pill" + (s.generated ? " org" : "")}>{s.generated ? "live" : "draft"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p small muted">No sweepstakes yet.</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Catalogue (Phase B) ----------------------- */
type PrizeKey = "finalist" | "groupWinner" | "groupRunnerUp" | "boot";

interface Draft {
  id?: string;
  name: string;
  sport: string;
  engine: string;
  totalGames: number;
  data: Record<string, unknown>;
  prizes: Prizes;
  active: boolean;
}

const emptyPrizes = (): Prizes => ({
  perGame: 1,
  finalist: { mode: "£", value: 30 },
  groupWinner: { mode: "£", value: 4 },
  groupRunnerUp: { mode: "£", value: 2 },
  boot: { mode: "£", value: 40 },
});

function toDraft(t: SweepstakeType): Draft {
  const d = (t.data ?? {}) as Record<string, unknown>;
  return {
    id: t.id,
    name: t.name,
    sport: t.sport,
    engine: t.engine,
    totalGames: Number(d.totalGames) || 0,
    data: d,
    prizes: t.defaultPrizes,
    active: t.active,
  };
}

function Catalogue() {
  const [types, setTypes] = useState<SweepstakeType[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState("");
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  const load = async () => {
    try { setTypes(await adminListSweepstakeTypes()); }
    catch (e: any) { flash(e?.message ?? "Couldn't load types."); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { flash("Name is required."); return; }
    try {
      await upsertSweepstakeType({
        id: draft.id,
        name: draft.name.trim(),
        sport: draft.sport.trim(),
        engine: draft.engine.trim() || "tournament",
        data: { ...draft.data, totalGames: Number(draft.totalGames) || 0 },
        defaultPrizes: draft.prizes,
        active: draft.active,
      });
      setDraft(null);
      await load();
      flash("Saved.");
    } catch (e: any) { flash(e?.message ?? "Save failed."); }
  };

  const toggleActive = async (t: SweepstakeType) => {
    try { await setTypeActive(t.id, !t.active); await load(); }
    catch (e: any) { flash(e?.message ?? "Couldn't update."); }
  };

  return (
    <div className="card">
      <h2 className="h2">Sweepstake types</h2>
      <p className="p small muted">
        The catalogue of formats organisers can run. Edit metadata here; entrant pools
        (teams / groups / scorers) are seeded and edited via SQL.
      </p>
      {types === null ? (
        <p className="p small muted">Loading…</p>
      ) : (
        <table className="board" style={{ marginTop: 8 }}>
          <thead><tr><th>Name</th><th>Sport</th><th>Engine</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.sport}</td>
                <td><span className="role-pill">{t.engine}</span></td>
                <td><span className={"role-pill" + (t.active ? " org" : "")}>{t.active ? "active" : "off"}</span></td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn ghost sm" onClick={() => setDraft(toDraft(t))}>Edit</button>{" "}
                  <button className="btn ghost sm" onClick={() => toggleActive(t)}>{t.active ? "Deactivate" : "Activate"}</button>
                </td>
              </tr>
            ))}
            {!types.length && <tr><td colSpan={5} className="muted">No types yet.</td></tr>}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 12 }}>
        {draft ? (
          <TypeEditor draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setDraft(null)} />
        ) : (
          <button
            className="btn ghost sm"
            onClick={() => setDraft({ name: "", sport: "Football", engine: "tournament", totalGames: 0, data: { groups: {}, scorerPool: [] }, prizes: emptyPrizes(), active: true })}
          >+ New type</button>
        )}
      </div>
      {msg && <p className="p small" style={{ marginTop: 8, color: "var(--cyan)" }}>{msg}</p>}
    </div>
  );
}

function TypeEditor({ draft, setDraft, onSave, onCancel }: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setPrize = (k: PrizeKey, patch: Partial<Prizes["finalist"]>) =>
    set({ prizes: { ...draft.prizes, [k]: { ...draft.prizes[k], ...patch } } });
  const prizeRow = (label: string, k: PrizeKey) => (
    <label className="fld"><span>{label}</span>
      <div style={{ display: "flex", gap: 6 }}>
        <input className="input num2" type="number" min="0" value={draft.prizes[k].value}
          onChange={(e) => setPrize(k, { value: Number(e.target.value) })} />
        <select className="input mini" value={draft.prizes[k].mode}
          onChange={(e) => setPrize(k, { mode: e.target.value as "£" | "%" })}>
          <option value="£">£</option><option value="%">%</option>
        </select>
      </div>
    </label>
  );
  return (
    <div className="card subtle">
      <h2 className="h2">{draft.id ? "Edit type" : "New type"}</h2>
      <div className="kg">
        <label className="fld"><span>Name</span><input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="fld"><span>Sport</span><input className="input" value={draft.sport} onChange={(e) => set({ sport: e.target.value })} /></label>
        <label className="fld"><span>Engine</span>
          <select className="input" value={draft.engine} onChange={(e) => set({ engine: e.target.value })}>
            <option value="tournament">tournament</option>
          </select>
        </label>
        <label className="fld"><span>Total games</span><input className="input num2" type="number" min="0" value={draft.totalGames} onChange={(e) => set({ totalGames: Number(e.target.value) })} /></label>
        <label className="fld"><span>Daily £ / game</span><input className="input num2" type="number" min="0" step="0.5" value={draft.prizes.perGame} onChange={(e) => set({ prizes: { ...draft.prizes, perGame: Number(e.target.value) } })} /></label>
        {prizeRow("Finalist", "finalist")}
        {prizeRow("Group winner", "groupWinner")}
        {prizeRow("Group runner-up", "groupRunnerUp")}
        {prizeRow("Golden Boot", "boot")}
        <label className="fld"><span>Active</span>
          <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} style={{ width: 18, height: 18 }} />
        </label>
      </div>
      {!draft.id && (
        <p className="p small muted">New types start with empty pools — add teams / groups / scorers via SQL before running one.</p>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button className="btn" onClick={onSave}>Save</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
