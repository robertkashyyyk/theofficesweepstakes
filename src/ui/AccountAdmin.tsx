/* =========================================================================
   Account dashboard (Phase A) — the organiser's home for one Account:
     * list / open / create sweepstakes under the account
     * staff roster (reusable names used to deal ticket books)
     * invite co-organisers by email (claimed into membership on their sign-in)
   Presentational + its own data calls via db/repo, matching App's pattern of
   keeping Supabase usage out of the pure core.
   ========================================================================= */
import { useEffect, useState } from "react";
import {
  addStaff,
  createSweepstake,
  inviteCoOrganiser,
  listAccountPeople,
  listSweepstakeTypes,
  removeStaff,
  type Account,
  type AccountPeople,
  type SweepSummary,
  type SweepstakeType,
} from "../db/repo";
import { Stepper } from "./chrome";

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 0",
  borderTop: "1px solid var(--line, rgba(255,255,255,.08))",
};

export function AccountDashboard({
  account,
  sweeps,
  onOpenSweep,
  onSweepsChanged,
  flash,
}: {
  account: Account;
  sweeps: SweepSummary[];
  onOpenSweep: (id: string) => void;
  onSweepsChanged: () => void;
  flash: (m: string) => void;
}) {
  const [people, setPeople] = useState<AccountPeople | null>(null);
  const [types, setTypes] = useState<SweepstakeType[]>([]);
  const [typeId, setTypeId] = useState("");
  const [newSweep, setNewSweep] = useState("");
  const [staffName, setStaffName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const loadPeople = async () => {
    try {
      setPeople(await listAccountPeople(account.id));
    } catch (e: any) {
      flash(e?.message ?? "Couldn't load account people.");
    }
  };
  useEffect(() => {
    loadPeople();
    listSweepstakeTypes()
      .then((ts) => { setTypes(ts); if (ts.length && !typeId) setTypeId(ts[0].id); })
      .catch((e: any) => flash(e?.message ?? "Couldn't load sweepstake types."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  const createSweep = async () => {
    const chosen = typeId || types[0]?.id;
    if (!chosen) { flash("No sweepstake type available."); return; }
    setBusy(true);
    try {
      const id = await createSweepstake(account.id, chosen, newSweep.trim());
      setNewSweep("");
      onSweepsChanged();
      onOpenSweep(id);
      flash("Draft created — set it up in the Organiser tab.");
    } catch (e: any) {
      flash(e?.message ?? "Couldn't create sweepstake.");
    } finally {
      setBusy(false);
    }
  };

  const addStaffMember = async () => {
    const name = staffName.trim();
    if (!name) return;
    try {
      await addStaff(account.id, name);
      setStaffName("");
      await loadPeople();
    } catch (e: any) {
      flash(e?.message ?? "Couldn't add staff (duplicate name?).");
    }
  };

  const remove = async (id: string) => {
    try {
      await removeStaff(id);
      await loadPeople();
    } catch (e: any) {
      flash(e?.message ?? "Couldn't remove.");
    }
  };

  const invite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    try {
      await inviteCoOrganiser(account.id, email);
      setInviteEmail("");
      await loadPeople();
      flash("Invite saved — they'll join automatically when they sign in.");
    } catch (e: any) {
      flash(e?.message ?? "Couldn't invite.");
    }
  };

  const stepCurrent = sweeps.length > 0 ? 3 : (people?.staff?.length ?? 0) > 0 ? 2 : 1;

  const staff = people?.staff ?? [];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Stepper steps={["Account", "Staff", "Sweepstake"]} current={stepCurrent} />
      <div className="dashboard-layout">
        {/* main column ------------------------------------------------- */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 className="h2" style={{ marginBottom: 4 }}>{account.name}</h2>
            <p className="p small muted" style={{ margin: 0 }}>
              You're the <b>{account.role}</b> of this account. Create &amp; run sweepstakes; manage your staff on the right.
            </p>
          </div>

          <div className="card">
            <h2 className="h2">Sweepstakes</h2>
            {sweeps.length === 0 ? (
              <p className="p small muted">No sweepstakes yet — create your first below.</p>
            ) : (
              <div style={{ marginBottom: 4 }}>
                {sweeps.map((s) => (
                  <div key={s.id} className="sweep-card">
                    <div>
                      <div className="sweep-card-name">{s.name}</div>
                      <div className="sweep-card-meta"><span className={"badge " + (s.generated ? "badge-live" : "badge-draft")}>{s.generated ? "Live" : "Draft"}</span></div>
                    </div>
                    <button className="btn-secondary btn-sm" onClick={() => onOpenSweep(s.id)}>Open</button>
                  </div>
                ))}
              </div>
            )}
            <div className="join-row" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <select className="input" style={{ maxWidth: 240 }} value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={!types.length}>
                {types.length ? types.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.sport}</option>) : <option value="">No types available</option>}
              </select>
              <input className="input" value={newSweep} onChange={(e) => setNewSweep(e.target.value)} placeholder="Sweepstake name (optional)" />
              <button className="btn" disabled={busy || !types.length} onClick={createSweep}>Create</button>
            </div>
            {!staff.length && (
              <p className="p small" style={{ marginTop: 8, color: "var(--red)" }}>Tip: add your players in the Team Roster (right) before you generate.</p>
            )}
          </div>

          {/* Co-organisers */}
          <div className="card">
            <h2 className="h2">Co-organisers</h2>
            <p className="p small muted">Invite colleagues by email — they can run sweepstakes for this account once they sign in.</p>
            {people?.members?.map((m) => (
              <div key={m.email} style={rowStyle}><span>{m.email}</span><span className="role-pill org">{m.role}</span></div>
            ))}
            {people?.invites?.map((i) => (
              <div key={i.email} style={rowStyle}><span>{i.email}</span><span className="role-pill">pending</span></div>
            ))}
            <div className="join-row" style={{ marginTop: 12 }}>
              <input className="input" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && invite()} placeholder="colleague@company.com" />
              <button className="btn secondary" onClick={invite}>Invite</button>
            </div>
          </div>
        </div>

        {/* roster sidebar --------------------------------------------- */}
        <div className="dashboard-sidebar">
          <div className="sidebar-title"><span>Team Roster</span><span style={{ color: "var(--green)" }}>{staff.length}</span></div>
          <p className="p small muted" style={{ marginTop: -6 }}>Everyone here gets a ticket book.</p>
          <div style={{ margin: "10px 0 14px" }}>
            {staff.length ? staff.map((s) => (
              <span key={s.id} className="player-chip">
                <span className="player-avatar">{s.name.slice(0, 1).toUpperCase()}</span>
                {s.name}
                <span className="player-x" title="Remove" onClick={() => remove(s.id)}>×</span>
              </span>
            )) : <p className="p small muted">No players yet — add your first below.</p>}
          </div>
          <div className="join-row">
            <input className="input" value={staffName} onChange={(e) => setStaffName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStaffMember()} placeholder="Add a player…" />
            <button className="btn" onClick={addStaffMember}>Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}
