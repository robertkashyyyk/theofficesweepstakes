/* =========================================================================
   Knockout bracket display — rounds as horizontally-scrolling columns.
   Pure presentational; takes a core Bracket.
   ========================================================================= */
import type { Bracket as BracketT } from "../core";

function Side({ name, win }: { name: string; win: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5,
      fontWeight: win ? 800 : 500, color: win ? "var(--cyan)" : "var(--muted)",
    }}>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name || "—"}</span>
      {win && <span>✓</span>}
    </div>
  );
}

export function Bracket({ bracket }: { bracket: BracketT }) {
  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
      {bracket.rounds.map((r, ri) => (
        <div key={ri} style={{ minWidth: 190, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="t-lbl">{r.name}</div>
          {r.matches.map((m, mi) => (
            <div className="card" key={mi} style={{ padding: "8px 10px", margin: 0 }}>
              <Side name={m.a} win={!!m.winner && m.winner === m.a} />
              <div style={{ height: 1, background: "var(--line)", margin: "5px 0" }} />
              <Side name={m.b} win={!!m.winner && m.winner === m.b} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
