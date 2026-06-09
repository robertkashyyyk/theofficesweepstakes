/* =========================================================================
   Tournament schedule / plan — all 104 matches. Group stage shows the real
   fixtures by matchday; the knockout shows the official structure (slot labels
   + dates) that fills with real teams as the group results land.
   ========================================================================= */
import { resolveSchedule, type Game, type SchedEntry } from "../core";

const isPlaceholder = (s: string) => /^(Winner|Runner-up|3rd|Loser)\b/.test(s);

function Team({ name }: { name: string }) {
  const ph = isPlaceholder(name);
  return <span style={{ color: ph ? "var(--muted)" : "var(--ink)", fontStyle: ph ? "italic" : "normal", fontWeight: ph ? 500 : 600 }}>{name}</span>;
}

function Row({ e, first }: { e: SchedEntry; first: boolean }) {
  return (
    <div className="game" style={{ borderTop: first ? "none" : "1px solid var(--border)", padding: "10px 16px" }}>
      <div className="game-l" style={{ minWidth: 0, gap: 10 }}>
        <span className="game-no" style={{ minWidth: 36 }}>#{e.match}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          <Team name={e.a} /> <span className="muted small">v</span> <Team name={e.b} />
        </span>
      </div>
      <div className="game-r">
        {e.score
          ? <span className="game-score">{e.score}</span>
          : <span className="muted small">{e.date || "to play"}</span>}
      </div>
    </div>
  );
}

function Section({ label, rows }: { label: string; rows: SchedEntry[] }) {
  if (!rows.length) return null;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="group-header">{label}</div>
      {rows.map((e, i) => <Row key={e.match} e={e} first={i === 0} />)}
    </div>
  );
}

export function Schedule({ groups, games }: { groups: Record<string, string[]>; games: Game[] }) {
  const plan = resolveSchedule(groups, games);
  const md = (n: number) => plan.filter((e) => e.stage === "Group" && e.matchday === n);
  const stage = (s: SchedEntry["stage"]) => plan.filter((e) => e.stage === s);

  return (
    <div className="stack">
      <div className="card">
        <h2 className="h2">Schedule <span className="muted" style={{ fontWeight: 400 }}>· 104 matches · 11 Jun – 19 Jul</span></h2>
        <p className="p small">The full plan. Group fixtures are fixed; the knockout shows the official structure (e.g. "Winner Grp E v 3rd A/B/C/D/F") and fills with real teams as the group tables finish.</p>
      </div>
      <Section label="Group stage · Matchday 1" rows={md(1)} />
      <Section label="Group stage · Matchday 2" rows={md(2)} />
      <Section label="Group stage · Matchday 3" rows={md(3)} />
      <Section label="Round of 32" rows={stage("R32")} />
      <Section label="Round of 16" rows={stage("R16")} />
      <Section label="Quarter-finals" rows={stage("QF")} />
      <Section label="Semi-finals" rows={stage("SF")} />
      <Section label="Third place play-off" rows={stage("3P")} />
      <Section label="Final" rows={stage("Final")} />
    </div>
  );
}
