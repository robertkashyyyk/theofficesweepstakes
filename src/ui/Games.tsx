/* =========================================================================
   Games — the whole schedule, one row per game, expandable to show the exact
   correct-score scoreline EVERY staff member holds for that game (past AND
   future), with winners highlighted. Pure derivation from the rotation.
   ========================================================================= */
import { useState } from "react";
import {
  GROUPS,
  TOTAL_GAMES,
  groupFixtures,
  money,
  scoreFor,
  type Config,
  type Results,
  type Scoring,
} from "../core";

export function Games({ scoring, config, results }: { scoring: Scoring; config: Config; results: Results }) {
  const [open, setOpen] = useState<number | null>(null);
  const games = results.games || [];
  const byIndex = new Map(games.map((g) => [g.gameIndex, g]));
  const fixtures = groupFixtures(GROUPS);
  const total = Math.max(TOTAL_GAMES, games.length);
  const { ordered, idx } = scoring;
  const seed = config.seed;

  if (!ordered.length) return <div className="card muted">No players yet.</div>;

  const winnersFor = (gi: number, result?: string) =>
    result ? ordered.filter((p) => scoreFor(seed, gi, idx[p.id]) === result) : [];
  const paidGames = games.filter((g) => winnersFor(g.gameIndex, g.score).length).length;

  return (
    <div className="stack">
      <div className="card">
        <h2 className="h2">Games <span className="muted" style={{ fontWeight: 400 }}>· {games.length} of {TOTAL_GAMES} logged</span></h2>
        <p className="p small">Tap a game to see the scoreline every player holds — wins are highlighted. {paidGames} paid out at {money(config.prizes.perGame)} each so far.</p>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {Array.from({ length: total }, (_, gi) => {
          const fx = fixtures[gi];
          const logged = byIndex.get(gi);
          const result = logged?.score;
          const title = fx ? `${fx.home} v ${fx.away}` : logged?.label || "Knockout";
          const sub = fx ? `Group ${fx.group}` : "Knockout";
          const winners = winnersFor(gi, result);
          const isOpen = open === gi;
          return (
            <div key={gi} style={{ borderTop: gi ? "1px solid var(--line)" : "none" }}>
              <button
                onClick={() => setOpen(isOpen ? null : gi)}
                style={{ width: "100%", textAlign: "left", background: isOpen ? "rgba(255,255,255,.03)" : "none", border: "none", color: "inherit", cursor: "pointer", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, fontFamily: "inherit", fontSize: 14 }}
              >
                <span className="game-no" style={{ minWidth: 34 }}>#{gi + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: "100%", verticalAlign: "bottom" }}>{title}</b>
                  <span className="muted small"> · {sub}</span>
                </span>
                {result ? <span className="game-score" style={{ fontSize: 15 }}>{result}</span> : <span className="muted small">upcoming</span>}
                <span style={{ width: 84, textAlign: "right" }}>
                  {result && (winners.length ? <span className="chip win-chip">{winners.length} won</span> : <span className="muted small">→ jackpot</span>)}
                </span>
                <span className="muted" style={{ width: 14 }}>{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div style={{ padding: "0 14px 12px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 6 }}>
                  {ordered.map((p) => {
                    const held = scoreFor(seed, gi, idx[p.id]);
                    const won = !!result && held === result;
                    return (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "4px 9px", borderRadius: 8, background: won ? "rgba(52,214,255,.14)" : "var(--bg2)", border: won ? "1px solid rgba(52,214,255,.4)" : "1px solid var(--line)" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <b style={{ color: won ? "var(--cyan)" : "var(--ink)" }}>{held}</b>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
