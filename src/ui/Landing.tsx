/* =========================================================================
   Public marketing homepage — "Office Sweepstakes" (sport-agnostic).
   Not World Cup branded: the World Cup is just one event in the catalogue.
   Design system: racing green + electric yellow, Barlow (see src/styles.css).
   ========================================================================= */
import { Link } from "react-router-dom";
import { Logo } from "./chrome";

type EventCard = {
  emoji: string;
  name: string;
  blurb: string;
  status: "live" | "soon";
};

const EVENTS: EventCard[] = [
  { emoji: "🏆", name: "World Cup 2026", blurb: "48 teams, 104 games. Team draws, rotating correct-scores and a Golden Boot.", status: "live" },
  { emoji: "🐎", name: "Grand National", blurb: "The classic. Everyone's drawn a horse out of the hat — first past the post scoops the pot.", status: "soon" },
  { emoji: "🏉", name: "Six Nations", blurb: "Draw your nations. Championship, Grand Slam and the dreaded wooden spoon.", status: "soon" },
  { emoji: "🎾", name: "Wimbledon", blurb: "Pull a seed from the draw and follow them through SW19 to the final.", status: "soon" },
  { emoji: "⛳", name: "The Masters", blurb: "A golfer each off the tee at Augusta — last one standing wins the green pot.", status: "soon" },
  { emoji: "🏎️", name: "F1 Grand Prix", blurb: "A driver each on the grid. Podiums, fastest lap and the odd DNF.", status: "soon" },
];

const STEPS = [
  { n: "1", title: "Pick your event", desc: "Choose a sweepstake from the catalogue — football tournament, horse race, tennis draw, whatever's on." },
  { n: "2", title: "Deal everyone in", desc: "Add your staff once and the system deals a fair ticket book to each — balanced by value so nobody gets a dud hand." },
  { n: "3", title: "Follow the drama", desc: "Track it on a live leaderboard. The pot pays out as results land, and the winner takes whatever's left." },
];

const FEATURES = [
  ["🎟️", "Free to enter, pure luck", "No skill, no predictions. Everyone's dealt tickets — it's the office draw, done properly."],
  ["⚖️", "Fair by design", "Tickets are value-equalised: miss a big-ticket draw and you're topped up with smaller ones."],
  ["💷", "A self-balancing pot", "Every small win draws the fund down live; the overall winner scoops the remainder."],
  ["🔁", "Reuse your team", "Set your staff up once, then run a new sweepstake for every big event through the year."],
];

export default function Landing() {
  return (
    <div className="landing">
      <nav className="lnav">
        <Link to="/" className="brand logo-mark"><Logo size={24} /> Office Sweepstakes</Link>
        <div className="lnav-r">
          <Link to="/app" className="tab">Sign in</Link>
          <Link to="/app" className="btn">Start a sweepstake</Link>
        </div>
      </nav>

      <header className="lhero">
        <div className="hero-tag">FREE TO ENTER · PURE LUCK · ANY SPORT</div>
        <h1 className="lhero-title">THE OFFICE SWEEPSTAKE<br /><span>FOR EVERY BIG EVENT</span></h1>
        <p className="lhero-sub">
          The office draw your team actually looks forward to — for the World Cup, the National, the Six
          Nations and more. Set it up in minutes, deal everyone in fairly, and let the pot do the rest.
        </p>
        <div className="lhero-cta">
          <Link to="/app" className="btn big">Start your sweepstake</Link>
          <a href="#events" className="btn ghost big">See what's on</a>
        </div>
        <p className="muted small" style={{ marginTop: 14 }}>Free, luck-based office fun — not a betting product. Your HR/finance team can confirm it's fine to run.</p>
      </header>

      <section className="lsection">
        <h2 className="lh2">How it works</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="step-n">{s.n}</div>
              <div className="step-title">{s.title}</div>
              <div className="step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="lsection" id="events">
        <h2 className="lh2">Pick your event</h2>
        <p className="lsection-sub">One sweepstake engine, every kind of event. New ones are added through the year.</p>
        <div className="events-grid">
          {EVENTS.map((e) => (
            <div className={"event-card" + (e.status === "live" ? " live" : "")} key={e.name}>
              <div className="event-top">
                <span className="event-emoji">{e.emoji}</span>
                <span className={"event-badge " + e.status}>{e.status === "live" ? "Live now" : "Coming soon"}</span>
              </div>
              <div className="event-name">{e.name}</div>
              <div className="event-blurb">{e.blurb}</div>
              {e.status === "live" && <Link to="/app" className="event-link">Run this one →</Link>}
            </div>
          ))}
        </div>
      </section>

      <section className="lsection">
        <h2 className="lh2">Why run it here</h2>
        <div className="features-grid">
          {FEATURES.map(([icon, title, desc]) => (
            <div className="feature" key={title}>
              <span className="feature-icon">{icon}</span>
              <div className="feature-title">{title}</div>
              <div className="feature-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="lcta">
        <h2 className="lh2">Get your office in on it</h2>
        <p className="lsection-sub">Start a free account, set up your first sweepstake and deal your team in today.</p>
        <Link to="/app" className="btn big">Start a sweepstake</Link>
      </section>

      <footer className="lfoot">
        <span className="logo-mark"><Logo size={20} /> Office Sweepstakes</span>
        <span className="muted">Free, luck-based office sweepstakes for every big sporting event.</span>
      </footer>
    </div>
  );
}
