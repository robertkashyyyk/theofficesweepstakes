# Office Sweepstakes — Design & Flow Handoff (for Manus)

> **Purpose of this doc:** give you full context on the product so you can log in,
> evaluate it, and design a **proper end-to-end UX/UI + flow** we can implement.
> The engineering is solid and working; the **design and flow are what we need from
> you.** Two attempts (a dark neon theme, then a plain light "SaaS" theme) have both
> been rejected as generic/dated — we want a considered, distinctive design direction.

---

## 1. What the product is

**Office Sweepstakes** — a multi-tenant web platform for running **free-to-enter,
pure-luck office sweepstakes** for big sporting events (World Cup, Grand National,
Wimbledon, F1, the Masters…). Think of the classic "draw a team/horse out of the hat
at work" — but run online, with live scores, leaderboards and prize tracking.

It started as a single **World Cup 2026** sweepstake app and is being generalised into
a SaaS any office can use for any event.

**Key product principles**
- **Free to enter, pure luck** — no skill, no gambling licence needed; a bit of office fun.
- **The organiser does the work; players just watch their tickets.** Players don't need
  to log in (phase 1) — the organiser runs it and shares a board.
- A **prize fund** (e.g. £500) is split across markets (correct scores, group winners,
  reaching the final, top scorer, the champion takes the remaining jackpot).

## 2. The three types of user

1. **Platform owner / super-admin** (Robert) — curates the catalogue of events, oversees
   accounts. Has a separate `/admin` console.
2. **Organiser** (an office manager) — signs up, creates a **company Account**, builds a
   reusable **staff roster**, and runs sweepstakes. Can invite **co-organisers**.
3. **Players / staff** — the people in the sweep. Phase 1: the organiser enters their
   names and shares a read-only board (no login). Phase 2 (future): optional player login.

## 3. How to access it (to look around)

- **Live app:** https://officesweepstakes.com  → marketing page. The app is at **/app**.
- **Super-admin console:** /admin (only visible to platform admins).
- **Email confirmation is OFF**, so you can **sign up a fresh organiser account** in
  seconds at /app (use any email + password) and walk the full organiser journey.
- To see the **super-admin** side, Robert can grant your email platform-admin access
  (it's a single allow-list row). Ask him.
- Super-admin owner today: robert@kashyyyk.co.uk.

## 4. The core flows (what exists today)

**A. Organiser onboarding**
1. **/app** → Sign in / **Sign up** (email + password).
2. **Create your account** → name your company (you become its owner).
3. **Account dashboard** — three sections:
   - **Sweepstakes** — pick an event *type* (e.g. World Cup 2026) + name → **Create**.
   - **Staff roster** — add/remove the people who'll get tickets (this is where
     "players" are managed — *currently easy to miss; see Known issues*).
   - **Co-organisers** — invite colleagues by email to help run the account.
4. Open a sweepstake → **Setup (Organiser tab)**: set the prize fund, prize amounts,
   review the staff who'll be dealt in, run a **Test Event**, then **Generate & deal**.
5. Once generated, the live sweep has tabs: **How it works · Tickets · Games · Groups ·
   Leaderboard · Organiser**.

**B. Running the event (organiser)**
- **Organiser tab** → log each game's score in fixture order (the app names the next
  real fixture, e.g. "Group C · Brazil v Scotland"). The **group tables build
  automatically**; group winners/runners-up are derived. Knockout results are entered
  manually (for now).

**C. Player / shared view (read-only)**
- **Tickets** — each person's dealt teams + their rotating correct-score per game + winnings.
- **Games** — every game (past + upcoming); expand to see the scoreline every person holds.
- **Groups** — the 12 group tables building live.
- **Leaderboard** — everyone ranked by current winnings; the running jackpot.

**D. Test Event / Dry run** — a one-click **in-memory simulation** of a whole tournament
(deals to the roster, random scores, full group tables + knockout bracket, champion,
golden boot) so the organiser can see it fully populated before it's real. Also available
to the super-admin per event type in /admin.

**E. Super-admin /admin** — overview of all accounts + their sweepstakes; a **catalogue**
of event *types* (edit name/sport/prizes/start date; view the teams/groups/scorers);
a **Dry run** per type.

## 5. What we want from you (Manus) — the deliverable

A **proper, considered design system + flow** we can implement, ideally as:
- A clear **visual direction** (mood, type, colour, components) — distinctive and
  premium, NOT generic. (Avoid: the rejected dark-neon-with-condensed-display-font look,
  and the rejected plain-Inter-light-indigo "default SaaS" look.)
- **Screen-by-screen layouts / wireframes** for the core flow: sign up → create account →
  dashboard (incl. **a clear, obvious way to add players/staff**) → create sweepstake →
  setup → live sweep (tickets / games / groups / leaderboard) → organiser controls.
- Notes on **information hierarchy and flow** — what the organiser sees first, how they
  get from "I just signed up" to "the sweep is live" with minimal confusion.
- It can be Figma, annotated screenshots, a written spec, or HTML/CSS — whatever's easiest;
  I (the engineer) will translate it into the React app.

**The single biggest flow problem to solve:** the journey from **sign up → add people →
create & run a sweepstake** currently feels disjointed (two places that looked like "add
players", an over-long Setup form, a dense live view). Make that journey feel obvious.

## 6. Architecture & hard constraints (for whoever implements)

- **Stack:** React + Vite + TypeScript front end; **Supabase** (Postgres + Auth + RLS)
  backend; deployed on **Vercel** (auto-deploys from `main`).
- **Engines (code) vs Types (data):** deterministic game logic lives in versioned, tested
  *engines* — `tournament` (World Cup-style: groups + knockout + rotating correct-score)
  and `field_draw` (draw-one-from-a-field: Grand National etc.). A *type* is just data
  (name, sport, teams/entrants, prizes) that picks an engine. New event = new data, no code.
- **⚠️ DO NOT change the deterministic core** (`src/core/prng.ts`, dealing, scoring): it
  recomputes who won every past game and is guarded by golden tests. This is logic, not
  UI — a redesign never needs to touch it. Standings are always *derived*, never stored.
- **The redesign is almost entirely `src/styles.css` (shared component classes) + the
  view components in `src/ui/` + `src/App.tsx`.** Re-theming the shared classes cascades
  across the whole app, so a coherent component system is exactly the right deliverable.

## 7. What's already built (so you know it's real, not a mockup)

Tenancy (accounts, staff, co-organiser invites, super-admin), the event-type **catalogue**,
both engines (tournament + field_draw, fully tested), **live group tables**, the **full
knockout bracket + dry-run simulator**, the organiser **Test Event** with a readiness
checklist, per-event **start dates**, and the per-game **expandable scores view**. It's a
working app with a real database — the gap is design/UX, not features.

## 8. Known issues / debt to be aware of

- **Adding players is hard to find.** Players = the **Staff Roster on the Account
  dashboard**. We recently removed a duplicate (and buggy, data-losing) name grid from the
  Setup screen, which makes the dashboard the only place — but it's not obvious. **This is
  a prime thing to redesign.**
- **In-sweep views, /admin, and the Landing page** have only had a baseline re-theme, not
  a structural polish — some still carry leftover bright-cyan highlights from the old dark
  theme. Treat current visuals as a starting point to replace, not a reference.
- Knockout results are still entered manually; auto-results (fetching real scores) is a
  planned future feature.

## 9. Live wiring (for the engineer)

- **Repo:** https://github.com/robertkashyyyk/theofficesweepstakes (auto-deploys `main` → Vercel)
- **Supabase project:** `pcvvoxbdmhrhovqebjix` ("The Office Sweepstakes", eu-central-1)
- **Vercel:** kashyyyk/theofficesweepstakes → https://officesweepstakes.com
- Full engineering notes live in the repo's `CLAUDE.md`.

---

*Hand this back with whatever design/flow direction you produce and the engineer will
implement it screen by screen.*
