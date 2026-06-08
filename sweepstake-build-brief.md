# World Cup 2026 Sweepstake — Build Brief for Claude Code

A working reference implementation already exists as a single React file
(`world-cup-sweepstake.jsx`). It runs on browser `window.storage`. This brief
captures the **rules and the non-obvious logic** so you can re-implement it
properly inside our app (real backend, real auth) rather than copying the
prototype verbatim. Treat the `.jsx` as the behavioural source of truth; treat
this document as the spec.

---

## 1. What it is

A free-to-enter, **pure-luck** office sweepstake for the 2026 World Cup
(48 teams, 104 games). No predictions or skill. An organiser sets it up once
and the system deals every staff member a "ticket book". Tickets pay out across
the whole tournament from a fixed prize fund; the tournament winner's ticket
holder scoops whatever's left.

---

## 2. The setup flow (organiser-driven)

A wizard, run once by the organiser:

1. **Prize fund** — a £ amount (e.g. 500). Not hard-coded.
2. **Staff** — a player count, then a name for each.
3. **Prize amounts** — per category, entered as **£ or %** of the fund.
4. **Outcome check** — a live table showing each prize, what it pays, how many
   times it pays, and the resulting **Winner's jackpot floor**. Warn (don't
   necessarily block) if committed prizes exceed the fund.
5. **Generate** — deals all ticket books, stores a random `seed`, locks entries.

After generation the ticket books are **immutable**.

---

## 3. Markets and how tickets are dealt

There are six markets. **Teams are dealt four separate times** — a player can
hold Brazil as a Winner ticket but France as a Finalist ticket, etc.

| Market | Pool | Pays |
|---|---|---|
| 🏆 World Cup Winner | 48 teams | the remaining jackpot |
| 🎽 Reaches the Final | 48 teams | fixed £, each of the 2 finalists |
| 🥇 Group Winner | 48 teams | fixed £, each of the 12 group winners |
| 🥈 Group Runner-up | 48 teams | fixed £, each of the 12 runners-up |
| 👟 Golden Boot | ~56 players | fixed £, the single top scorer |
| ⚽ Correct Score | 25 ordered scorelines | fixed £ **per game** |

The five team/scorer markets are dealt **once** (value-equalised — see §4).
The correct-score market is **rotated every game** (see §5).

---

## 4. Value-equalised dealing (the five one-time markets)

Goal: when a pool doesn't divide evenly among players, anyone short-changed on a
high-value market is compensated with extra tickets in lower-value markets, so
**expected winnings stay roughly level**.

Algorithm (per generation):

```
// GBP value of each prize (resolve £/% against fund first)
f, gw, gru, boot   // finalist, groupWinner, groupRunnerUp, boot — each in £
jackpotEst = max(fund*0.10, fund - (f*2 + gw*12 + gru*12 + boot + perGame*104*0.5))

// expected value of ONE ticket in each market
ev.winner        = jackpotEst / 48
ev.finalist      = (2  * f)    / 48
ev.groupWinner   = (12 * gw)   / 48
ev.groupRunnerUp = (12 * gru)  / 48
ev.boot          = boot        / scorerPool.length

markets = [winner, finalist, groupWinner, groupRunnerUp, boot] sorted by ev DESC
cumEV[player] = 0 for all

for each market m:
    order  = players sorted by cumEV ASC          // short-changed first
    deck   = shuffle(m.pool)
    deal deck round-robin into players following `order`
        // because order is cumEV-ascending, the leftover (pool.length % N)
        // tickets land on the lowest-cumEV players
    cumEV[p] += (tickets p received this market) * ev[m]
```

Correct-score is **excluded** from this — rotation handles its fairness.

---

## 5. Correct-score rotation (the daily game)

- Pool = the **25 ordered scorelines** 0-0 … 4-4 (`team1-team2`, so 1-0 and 0-1
  are different tickets).
- **Order matters.** A ticket "2-1" wins only if the team listed first in the
  fixture wins 2-1. The organiser logs each result in fixture order.
- Each game, every player is dealt **one** scoreline, re-shuffled per game, so
  over 104 games everyone cycles through likely and unlikely scores.
- A game pays `perGame` to whoever holds its exact score (split if several do).
  If **no one** holds it, that money stays in the pot (→ bigger jackpot).

This is **deterministic**, computed from the stored `seed` + game order — we do
**not** store 104 × N assignments:

```
function scoreFor(seed, gameIndex, playerIndex):
    s    = (seed + (gameIndex + 1) * 2654435761) >>> 0   // 32-bit
    deck = seededShuffle(SCORELINES, s)                  // mulberry32 PRNG
    return deck[playerIndex % deck.length]
```

- `playerIndex` = the player's position in a **stable sort** (by `createdAt`,
  tie-break `id`). This must never change after generation.
- `gameIndex` = the game's position in the ordered games list (0-based).
- `seededShuffle` = Fisher–Yates seeded by `mulberry32(s)`. Port both exactly
  from the `.jsx` so server and client agree.

**Critical:** games are logged **in order** and are append-only. Only ever
allow "undo the last game". Deleting/renumbering a middle game would change
`gameIndex` for everything after it and silently rewrite who won past games.
Safer in a DB: give each game an immutable, monotonic `game_index` and never
reuse or renumber it.

---

## 6. Money model

- Every prize is set as **£ or %** of the fund. Resolve % against the fund.
- **Winner takes the remainder.** The pot is self-balancing and can't overspend:
  every small payout draws it down; the champion's holder gets `fund − everything
  else paid`. Unheld correct-scores never leave the pot, so the winner typically
  gets *more* than the displayed floor.

Scoring (recompute from stored data; pure function of players + results + config):

```
paid = 0
for each logged game gi with ordered score S:
    holders = players where scoreFor(seed, gi, idx[p]) == S
    if holders: each holder += perGame / holders.length

for each player p:
    p += gw  for each of p.groupWinnerTeams that actually won its group
    p += gru for each of p.groupRunnerUpTeams that actually finished 2nd
    p += f   for each of p.finalistTeams in the actual 2 finalists

if topScorer set:
    holders = players holding that scorer; each += boot / holders.length

paid    = sum of all the above
jackpot = max(0, fund - paid)
champion's Winner-ticket holder += jackpot
```

---

## 7. Constants to carry over verbatim

All in the `.jsx`; reuse as-is (re-check the team list/groups against the final
official draw before launch):

- **48 teams in 12 groups (A–L)** — `GROUPS` object.
- **25 ordered scorelines** — generated `0-0 … 4-4`.
- **Golden Boot pool** — ~56 named players across qualified nations (`SCORER_POOL`).
- **Default prizes** — perGame £1; finalist £30; groupWinner £4; groupRunnerUp £2;
  boot £40; Winner = remainder. All editable.

---

## 8. Suggested data model (replace `window.storage`)

```
sweepstake        id, fund, seed, prizes(json: perGame, finalist{mode,value}, …),
                  generated(bool), created_at
player            id, sweepstake_id, name, created_at,
                  winner_teams[], finalist_teams[], group_winner_teams[],
                  group_runner_up_teams[], boot_players[]      // dealt at generation
game              id, sweepstake_id, game_index (monotonic),
                  score("t1-t2"), label, created_at            // append-only
result            sweepstake_id, group_first(json A→team), group_second(json),
                  finalists[2], champion, top_scorer
```

`game_index` is the rotation key — keep it stable and gap-free per sweepstake.
Standings are **derived** (don't store winnings; compute via §6 so they stay
correct if a result is edited).

---

## 9. Productionising the prototype

- **Storage/API** — swap `window.storage` (shared key-value) for the schema
  above + endpoints. Generation should be one transaction.
- **Auth/roles** — replace the PIN (it's cosmetic, not security) with real auth:
  organiser can set up / log games / enter results; players read-only.
- **Locking** — `generated = true` freezes ticket books and the staff list.
- **Validation** — block negative Winner floor or surface a clear warning;
  enforce unique names; fund > 0.
- **Multi-tenant** — scope everything by `sweepstake_id` if more than one runs.
- **Realtime** — the prototype polls every 25s; use sockets/SSE if you have them.

---

## 10. Things to preserve / gotchas

- **Ordered correct-scores** depend on fixture listing order — always log the
  first-named team's goals first. Rotation makes this fair over the tournament.
- **Golden Boot / Champion can go unheld** (rare scorer, or a champion nobody
  holds — shouldn't happen since all 48 are dealt) → rolls into the jackpot.
- **Append-only games** with undo-last-only (see §5).
- **Palette is intentional** — deep navy / electric blue / coral. Keep it; do
  **not** introduce green-and-gold accents anywhere in the UI.

---

## 11. Suggested prompt to start Claude Code

> "We're adding an office World Cup sweepstake to [our app — stack: e.g. Next.js
> + Postgres/Prisma]. Attached are a working React reference (`world-cup-
> sweepstake.jsx`) and a build brief (`sweepstake-build-brief.md`). Re-implement
> it against our stack: persist to the DB schema in §8, replace the PIN with our
> existing auth (organiser vs player roles), and port the deterministic rotation
> (§5) and scoring (§6) exactly so results are reproducible. Keep the existing
> palette. Start by scaffolding the data model and the generation endpoint."
