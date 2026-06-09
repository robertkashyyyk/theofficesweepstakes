/* =========================================================================
   Printable ticket books — one self-contained page per player for the organiser
   to print or Save-as-PDF and hand out. Each ticket has the player's dealt
   teams, their full 104-game correct-score card, the event's prizes, and how to
   win. Rendered via a body portal so print CSS can hide the app and show only
   the tickets.
   ========================================================================= */
import { createPortal } from "react-dom";
import {
  GROUPS,
  TOTAL_GAMES,
  groupFixtures,
  money,
  scoreFor,
  toGBP,
  type Config,
  type Scoring,
} from "../core";

function Teams({ label, teams }: { label: string; teams: string[] }) {
  if (!teams?.length) return null;
  return (
    <div className="pt-market">
      <span className="pt-market-label">{label}</span>
      <span className="pt-market-teams">{teams.join(", ")}</span>
    </div>
  );
}

export function PrintTickets({ scoring, config, eventName, onClose }: {
  scoring: Scoring;
  config: Config;
  eventName: string;
  onClose: () => void;
}) {
  const fixtures = groupFixtures(GROUPS);
  const fund = Number(config.fund) || 0;
  const P = config.prizes;
  const prizeRows: [string, string][] = [
    ["⚽ Correct score — each game", `${money(P.perGame)} (split if shared)`],
    ["🥇 Group winner — each", money(toGBP(P.groupWinner, fund))],
    ["🥈 Group runner-up — each", money(toGBP(P.groupRunnerUp, fund))],
    ["🎽 Reaches the final — each", money(toGBP(P.finalist, fund))],
    ["👟 Golden Boot", money(toGBP(P.boot, fund))],
    ["🏆 Champion", "the remaining pot"],
  ];

  return createPortal(
    <div className="print-portal">
      <div className="print-toolbar no-print">
        <span className="muted small">{scoring.ordered.length} tickets · use “Save as PDF” in the print dialog</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="print-doc">
        {scoring.ordered.map((p) => {
          const pi = scoring.idx[p.id];
          return (
            <div className="print-ticket" key={p.id}>
              <div className="pt-head">
                <div>
                  <div className="pt-event">{eventName}</div>
                  <div className="pt-tagline">Your sweepstake ticket book</div>
                </div>
                <div className="pt-name">{p.name}</div>
              </div>

              <div className="pt-cols">
                <div className="pt-col">
                  <h4 className="pt-h">Your teams</h4>
                  <Teams label="🏆 Winner" teams={p.winnerTeams} />
                  <Teams label="🎽 Finalists" teams={p.finalistTeams} />
                  <Teams label="🥇 Group winner" teams={p.groupWinnerTeams} />
                  <Teams label="🥈 Group runner-up" teams={p.groupRunnerUpTeams} />
                  <Teams label="👟 Golden Boot" teams={p.bootPlayers} />
                </div>
                <div className="pt-col">
                  <h4 className="pt-h">Prizes</h4>
                  <table className="pt-prizes">
                    <tbody>
                      {prizeRows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
                    </tbody>
                  </table>
                  <p className="pt-how">No skill — it's pure luck. Match the exact 90-min score (in the order shown) to win that game; hold a team that wins its group / reaches the final / lifts the cup to win those. The champion's holder takes whatever's left in the {money(fund)} pot.</p>
                </div>
              </div>

              <h4 className="pt-h">Your correct-score card — all {TOTAL_GAMES} games</h4>
              <div className="pt-grid">
                {Array.from({ length: TOTAL_GAMES }, (_, gi) => {
                  const fx = fixtures[gi];
                  const label = fx ? `${fx.home} v ${fx.away}` : `Knockout`;
                  return (
                    <div className="pt-score" key={gi}>
                      <span className="pt-gno">#{gi + 1}</span> {label} <b>{scoreFor(config.seed, gi, pi)}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
