# Office Sweepstakes — project guide

A multi-tenant **"Office Sweepstakes"** platform: free-to-enter, pure-luck office
sweepstakes for any big sporting event. Started as a single World Cup 2026 app and
is being generalised into a SaaS. React + Vite + TypeScript front end, Supabase
(Postgres + Auth + RLS) backend.

## Commands
- `npm run dev` — local app (needs `.env.local`; copy `.env.example`)
- `npm test` — the deterministic-core test suite (must stay green)
- `npm run build` — typecheck + production build
- `npm run typecheck` — types only

## Live wiring
- **Repo:** https://github.com/robertkashyyyk/theofficesweepstakes (gh: robertkashyyyk)
- **Supabase:** project **`pcvvoxbdmhrhovqebjix`** ("The Office Sweepstakes", eu-central-1),
  in org `bmasmnwsmgxkdoihacrh`. ⚠️ The org id is NOT the project id — the project is
  `pcvvoxbdmhrhovqebjix`. Migrations applied: `supabase/migrations/0001`–`0003`.
- **Vercel:** project `kashyyyk/theofficesweepstakes` → https://officesweepstakes.com.
  Auto-deploys from `main`. Env vars `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
  set for Production + Development (Preview not set — CLI quirk; preview unused).

## Layout
```
src/core/          PURE, framework-agnostic, fully tested. No React/Supabase imports.
  prng.ts          mulberry32 / seededShuffle / scoreFor  ← deterministic rotation (DO NOT EDIT casually)
  dealing.ts       value-equalised dealTickets
  scoring.ts       compute() + projection()
  constants.ts     GROUPS / SCORELINES / SCORER_POOL (World Cup; provisional vs final draw)
  __tests__/       golden + reference-sweep + scoring tests (24)
src/db/repo.ts     Supabase row <-> core mapping + RPC calls
src/ui/views.tsx   the sweepstake app views (tickets/daily/board/organiser)
src/ui/Landing.tsx public "/" marketing homepage (sport-agnostic)
src/App.tsx        "/app" — auth gate, role tabs, realtime
supabase/migrations/  schema (0001), RPCs (0002), hardening (0003)
```
Routing: `/` = Landing, `/app/*` = the app. `vercel.json` has the SPA rewrite.

## ⚠️ Two do-not-break invariants
1. **Deterministic rotation** (`src/core/prng.ts`) is ported byte-for-byte from the
   prototype and recomputes who won every past game forever. Never tidy the bit-math,
   the `2654435761` multiplier, or the Fisher–Yates loop. `playerIndex` = stable sort
   by `createdAt`, tie-break `id` — never stored, always re-derived. The golden +
   reference-sweep tests in `__tests__/determinism.test.ts` guard this; if they break
   after editing prng, you changed history — revert.
2. **Games are append-only, undo-last-only**, with an immutable monotonic gap-free
   `game_index`. Enforced by DB triggers (`game_monotonic`/`game_no_update`/
   `game_undo_last`). Scoring keys off `game_index`, not array position.

## Product direction (decided 2026-06-08)
Three tiers: **platform owner / super-admin** (Robert, robert@kashyyyk.co.uk — curates
the event catalogue, oversees accounts) → **organiser** (office manager; opens a company
**Account**, adds a reusable **staff** roster, runs sweepstakes) → **players** (staff;
phase 1 = organiser-enters-names + shared read-only board, phase 2 = optional player login).

**Engines (code) vs Types (data):** deterministic logic lives in versioned, tested
*engines* (`tournament` = the existing World Cup logic; `field_draw` = draw-one-from-a-field
for Grand National / Wimbledon / F1 / Masters). A *type* is data (name, sport, entrant pool,
default prizes) that picks an engine. New data = no code; a new format = a new engine + tests.

**Phased build (each = its own migration + a Vercel redeploy):**
- A. Tenancy + super-admin: `account`, `account_member`, `staff`, `platform_admin`; refactor sweepstake under an account.
- B. `sweepstake_type` catalogue + repackage WC logic as the `tournament` engine + super-admin catalogue UI.
- C. `field_draw` engine (Grand National), fully tested.
- D. Super-admin console + public share-link board.

## Conventions
- **Design system (redesigned 2026-06-08): clean light SaaS.** Inter font (no more
  Anton/condensed), light surfaces (`--bg #f5f6f8` / white cards), indigo primary
  (`--primary #4f46e5`), slate neutrals, soft shadows, generous spacing. Tokens +
  shared component classes live in `src/styles.css`; restyle there to cascade
  app-wide. (Superseded the old dark navy/electric-blue/coral + Anton theme.)
- Standings are derived, never stored (recompute via `compute`).
- Generation is one transaction (`generate_sweepstake` RPC). Auth replaces the old PIN.
