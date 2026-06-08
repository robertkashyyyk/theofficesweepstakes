-- =============================================================================
-- World Cup Sweepstake — initial schema (§8 of the build brief)
--
-- Design guarantees baked into the DB, not just the app:
--   * games are APPEND-ONLY and UNDO-LAST-ONLY, with an immutable, monotonic,
--     gap-free game_index per sweepstake (§5 trap). Enforced by triggers.
--   * once a sweepstake is `generated`, the staff list + ticket books FREEZE.
--   * standings are DERIVED (never stored) — see the TS core `compute`.
--   * auth replaces the cosmetic PIN: organiser can write, players read-only.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- sweepstake
-- ---------------------------------------------------------------------------
create table sweepstake (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Office World Cup Sweep',
  fund       numeric(12,2) not null check (fund > 0),
  seed       bigint not null,                 -- 32-bit unsigned rotation seed
  prizes     jsonb not null,                  -- { perGame, finalist{mode,value}, ... }
  generated  boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- membership / roles (replaces the PIN)
-- ---------------------------------------------------------------------------
create table sweepstake_member (
  sweepstake_id uuid not null references sweepstake(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('organiser','player')),
  created_at    timestamptz not null default now(),
  primary key (sweepstake_id, user_id)
);

-- ---------------------------------------------------------------------------
-- player (ticket book) — dealt once at generation, then immutable
--   created_at + id define the STABLE playerIndex used by the rotation.
-- ---------------------------------------------------------------------------
create table player (
  id                   uuid primary key default gen_random_uuid(),
  sweepstake_id        uuid not null references sweepstake(id) on delete cascade,
  name                 text not null,
  created_at           timestamptz not null default now(),
  winner_teams         text[] not null default '{}',
  finalist_teams       text[] not null default '{}',
  group_winner_teams   text[] not null default '{}',
  group_runner_up_teams text[] not null default '{}',
  boot_players         text[] not null default '{}',
  unique (sweepstake_id, name)               -- enforce unique staff names
);
create index player_sweepstake_idx on player (sweepstake_id, created_at, id);

-- ---------------------------------------------------------------------------
-- game — append-only match log; game_index is the immutable rotation key
-- ---------------------------------------------------------------------------
create table game (
  id            uuid primary key default gen_random_uuid(),
  sweepstake_id uuid not null references sweepstake(id) on delete cascade,
  game_index    integer not null check (game_index >= 0),
  score         text not null check (score ~ '^[0-9]+-[0-9]+$'),  -- "t1-t2", fixture order
  label         text not null default '',
  created_at    timestamptz not null default now(),
  unique (sweepstake_id, game_index)
);
create index game_sweepstake_idx on game (sweepstake_id, game_index);

-- ---------------------------------------------------------------------------
-- result — one row per sweepstake (1:1)
-- ---------------------------------------------------------------------------
create table result (
  sweepstake_id uuid primary key references sweepstake(id) on delete cascade,
  group_first   jsonb not null default '{}',   -- { "A": "Mexico", ... }
  group_second  jsonb not null default '{}',
  finalists     text[] not null default '{}',
  champion      text not null default '',
  top_scorer    text not null default '',
  updated_at    timestamptz not null default now()
);

-- =============================================================================
-- Append-only / undo-last-only enforcement for `game`
-- =============================================================================

-- On INSERT: game_index must be exactly the next slot (gap-free, monotonic).
create or replace function game_enforce_monotonic() returns trigger
language plpgsql as $$
declare next_idx integer;
begin
  select coalesce(max(game_index) + 1, 0) into next_idx
    from game where sweepstake_id = new.sweepstake_id;
  if new.game_index <> next_idx then
    raise exception 'game_index must be % (append-only, gap-free); got %', next_idx, new.game_index;
  end if;
  return new;
end $$;
create trigger game_monotonic before insert on game
  for each row execute function game_enforce_monotonic();

-- Forbid UPDATE entirely (a logged score is immutable; to fix, undo + re-log).
create or replace function game_forbid_update() returns trigger
language plpgsql as $$
begin
  raise exception 'games are immutable; undo the last game and re-log instead';
end $$;
create trigger game_no_update before update on game
  for each row execute function game_forbid_update();

-- Allow DELETE only of the LAST game (undo-last-only).
create or replace function game_only_delete_last() returns trigger
language plpgsql as $$
declare max_idx integer;
begin
  select max(game_index) into max_idx
    from game where sweepstake_id = old.sweepstake_id;
  if old.game_index <> max_idx then
    raise exception 'only the last game (#%) may be undone, not #%', max_idx, old.game_index;
  end if;
  return old;
end $$;
create trigger game_undo_last before delete on game
  for each row execute function game_only_delete_last();

-- =============================================================================
-- Lock the staff list + ticket books once generated
-- =============================================================================
create or replace function player_freeze_after_generation() returns trigger
language plpgsql as $$
declare is_gen boolean;
  sid uuid := coalesce(new.sweepstake_id, old.sweepstake_id);
begin
  select generated into is_gen from sweepstake where id = sid;
  if is_gen then
    raise exception 'ticket books are frozen: this sweepstake is already generated';
  end if;
  return coalesce(new, old);
end $$;
create trigger player_freeze before insert or update or delete on player
  for each row execute function player_freeze_after_generation();

-- =============================================================================
-- Role helper + Row Level Security
-- =============================================================================
create or replace function is_member(sid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from sweepstake_member m
    where m.sweepstake_id = sid and m.user_id = auth.uid()
  );
$$;

create or replace function is_organiser(sid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from sweepstake_member m
    where m.sweepstake_id = sid and m.user_id = auth.uid() and m.role = 'organiser'
  );
$$;

alter table sweepstake        enable row level security;
alter table sweepstake_member enable row level security;
alter table player            enable row level security;
alter table game              enable row level security;
alter table result            enable row level security;

-- sweepstake: members read; organisers update. Creation goes ONLY through the
-- create_sweepstake RPC (SECURITY DEFINER, bypasses RLS) so every row gets an
-- organiser member atomically — hence no direct-insert policy (default deny).
create policy sweepstake_read   on sweepstake for select using (is_member(id));
create policy sweepstake_update on sweepstake for update using (is_organiser(id)) with check (is_organiser(id));

-- membership: members can see the roster; organisers manage it.
create policy member_read   on sweepstake_member for select using (is_member(sweepstake_id));
create policy member_write  on sweepstake_member for all using (is_organiser(sweepstake_id)) with check (is_organiser(sweepstake_id));

-- player / game / result: members read; organisers write (triggers add the rest).
create policy player_read   on player for select using (is_member(sweepstake_id));
create policy player_write  on player for all using (is_organiser(sweepstake_id)) with check (is_organiser(sweepstake_id));

create policy game_read     on game for select using (is_member(sweepstake_id));
create policy game_write    on game for all using (is_organiser(sweepstake_id)) with check (is_organiser(sweepstake_id));

create policy result_read   on result for select using (is_member(sweepstake_id));
create policy result_write  on result for all using (is_organiser(sweepstake_id)) with check (is_organiser(sweepstake_id));
