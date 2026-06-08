/* =========================================================================
   /admin — super-admin (platform owner) console. Phase A is READ-ONLY: a
   bird's-eye view of every account, its organisers and its sweepstakes.
   Separate from /app; self-gates via is_platform_admin (and admin_overview,
   which is SECURITY DEFINER and raises for anyone else).
   ========================================================================= */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { adminOverview, isPlatformAdmin, type AdminAccount } from "../db/repo";

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
        {state.kind === "ready" && <Overview accounts={state.accounts} />}
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
