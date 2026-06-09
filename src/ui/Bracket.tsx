/* =========================================================================
   Knockout bracket display — rounds as horizontally-scrolling columns
   (Manus spec: bracket-* classes, green winner tint).
   ========================================================================= */
import type { Bracket as BracketT } from "../core";

export function Bracket({ bracket }: { bracket: BracketT }) {
  return (
    <div className="bracket-wrap" style={{ paddingRight: 16 }}>
      <div className="bracket">
        {bracket.rounds.map((r, ri) => (
          <div key={ri} className="bracket-round">
            <div className="bracket-round-label">{r.name}</div>
            {r.matches.map((m, mi) => (
              <div key={mi} className="bracket-match">
                <div className={"bracket-team" + (m.winner && m.winner === m.a ? " winner" : "")}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.a || "—"}</span>
                  {m.winner === m.a && m.winner && <span>✓</span>}
                </div>
                <div className={"bracket-team" + (m.winner && m.winner === m.b ? " winner" : "")}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.b || "—"}</span>
                  {m.winner === m.b && m.winner && <span>✓</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
