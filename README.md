# Office World Cup 2026 Sweepstake

A free-to-enter, pure-luck office sweepstake (48 teams, 104 games). Built per
[`sweepstake-build-brief.md`](./sweepstake-build-brief.md), using the working
React prototype (`world-cup-sweepstake.jsx`) as the behavioural source of truth.

**Stack:** React + Vite + TypeScript front end, Supabase (Postgres + Auth + RLS)
backend. Deterministic rotation & scoring live in a pure, fully-tested core
module that the UI and DB both depend on but neither owns.

---

## Layout

```
src/core/            # PURE, framework-agnostic. No React / Supabase imports.
  constants.ts       #   GROUPS, TEAMS, SCORELINES, SCORER_POOL, DEFAULT_PRIZES (verbatim §7)
  prng.ts            #   mulberry32, seededShuffle, scoreFor, sortedPlayers  ← the §5 trap
  dealing.ts         #   value-equalised dealTickets (§4)
  scoring.ts         #   compute() + projection() (§6)
  money.ts           #   toGBP, money, groupOf
  __tests__/         #   24 tests, incl. golden values from the original .jsx
src/db/repo.ts       # Supabase row <-> core type mapping + RPC calls
src/lib/supabase.ts  # client
src/ui/views.tsx     # presentational components (ported from the .jsx)
src/App.tsx          # auth gate, role-based tabs, realtime, action wiring
supabase/migrations/ # 0001 schema (§8) + 0002 generation/reset RPCs
```

## Run it

```bash
npm install
cp .env.example .env.local      # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
# apply supabase/migrations/*.sql to your project (CLI: `supabase db push`, or paste in the SQL editor)
npm run dev                     # app
npm test                        # the deterministic-core test suite
npm run build                   # typecheck + production build
```

First sign-in with no sweepstake → you can **create** one (you become its
organiser). Add other staff as members (`sweepstake_member`, role `player`)
and they'll see it on sign-in.

---

## ⚠️ The two things that must never change

These are the genuine traps called out in the brief. Both are enforced by tests
and/or DB constraints, but a future edit could still break them — read this first.

### 1. The rotation is reproducible forever (§5)

`scoreFor(seed, gameIndex, playerIndex)` recomputes who held which scoreline for
**every past game, forever**, from three immutable inputs. It was ported
**byte-for-byte** from the prototype (`src/core/prng.ts`). Do **not**:

- "tidy" the bit-twiddling in `mulberry32`, change the multiplier `2654435761`,
  or alter the Fisher–Yates loop in `seededShuffle`;
- change how `playerIndex` is derived — it is the player's position in a **stable
  sort by `createdAt`, tie-break `id`** (`sortedPlayers`). It is **never stored**;
  it is always re-derived, so it stays correct, but the *sort definition* must
  never change;
- reuse or renumber a `game_index`.

`src/core/__tests__/determinism.test.ts` pins this with (a) golden values
captured from the original `.jsx` and (b) an independent reference swept across
thousands of inputs. If you touch `prng.ts` and those break, you've changed
history — revert.

### 2. Games are append-only, undo-last-only

Each `game` row has an **immutable, monotonic, gap-free `game_index`** per
sweepstake. The DB enforces it (`supabase/migrations/0001_init.sql`):

- **INSERT** must use the next index (trigger `game_monotonic`);
- **UPDATE** is forbidden outright (trigger `game_no_update`);
- **DELETE** is allowed only for the *last* game (trigger `game_undo_last`).

Scoring keys off `game.gameIndex`, **not** array position, so a gap can never
shift another game's winner. There's a test for exactly this
(`scoring.test.ts → "removing a middle game does not change other games' winners"`).

---

## How the money works (§6)

Standings are **derived, never stored** — `compute(players, results, config)` is
a pure function, so editing a result (or undoing a game) instantly re-derives
correct totals. The fund is self-balancing: every small payout draws it down,
unheld scorelines stay in the pot, and the champion's ticket-holder takes
`fund − everything else paid`.

## Auth & roles (replaces the prototype PIN, §9)

Supabase Auth + RLS. `sweepstake_member(role)` is `organiser` or `player`:

- **organisers** can set up, generate, log games, enter results, reset;
- **players** are read-only (enforced by RLS policies, not just the UI).

The PIN from the prototype is gone — it was cosmetic.

## Generation is one transaction (§9)

The value-equalised deal runs in the shared TS core on the organiser's client
(its output is *persisted*, not re-derived, so it needn't be seed-reproducible),
then `generate_sweepstake(...)` writes all players, the seed, fund and prizes,
and flips `generated` **atomically**. `reset_sweepstake(...)` is likewise one
transaction.

> **Trust note:** because the deal is computed client-side, a malicious
> organiser could in principle submit a hand-crafted allocation. For a
> free-to-enter office sweep that's acceptable. If you ever need it
> server-authoritative, move `dealTickets` into a Supabase Edge Function (it's
> already pure TS and imports nothing framework-specific) and have the RPC call
> that instead.

## Productionising checklist status (§9)

| Item | Status |
|---|---|
| Storage/API (schema + endpoints) | ✅ `supabase/migrations`, `src/db/repo.ts` |
| Generation as one transaction | ✅ `generate_sweepstake` RPC |
| Auth/roles (organiser vs player) | ✅ Supabase Auth + RLS |
| Locking on `generated` | ✅ `player_freeze` trigger |
| Validation (unique names, fund > 0, negative-floor warning) | ✅ constraints + Setup UI confirm |
| Multi-tenant (scope by `sweepstake_id`) | ✅ everything scoped; app loads the caller's first sweepstake |
| Realtime | ✅ Supabase Realtime on `game`/`result`/`sweepstake`, 25s poll fallback |

## Before launch

- Re-check `GROUPS` / `TEAMS` and `SCORER_POOL` in `src/core/constants.ts`
  against the **final official draw** (the prototype's list is provisional).
- The palette (deep navy / electric blue / coral) is intentional — **do not**
  introduce green-and-gold accents (§10).
