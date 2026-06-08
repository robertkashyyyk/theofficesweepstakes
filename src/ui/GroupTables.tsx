/* =========================================================================
   Live group standings — 12 tables that build from the logged results.
   Pure presentational; takes a precomputed table (core `groupTable`).
   Top-two rows are highlighted (they qualify).
   ========================================================================= */
import type { TeamRow } from "../core";

export function GroupTables({ table }: { table: Record<string, TeamRow[]> }) {
  const entries = Object.entries(table);
  if (!entries.length) return <div className="card muted">No groups to show yet.</div>;
  return (
    <div className="groups-grid">
      {entries.map(([g, rows]) => (
        <div className="card" key={g} style={{ padding: 12, margin: 0 }}>
          <div className="grp-h" style={{ marginBottom: 8 }}>Group {g}</div>
          <table className="board" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>#</th><th>Team</th>
                <th style={{ textAlign: "center" }}>P</th>
                <th style={{ textAlign: "center" }}>GD</th>
                <th style={{ textAlign: "right" }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.team} className={i < 2 ? "champ-row" : ""}>
                  <td className="rank">{i + 1}</td>
                  <td>{r.team}</td>
                  <td style={{ textAlign: "center" }}>{r.p}</td>
                  <td style={{ textAlign: "center" }}>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
