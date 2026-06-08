-- =============================================================================
-- Phase B — sweepstake-type catalogue + the `tournament` engine boundary
--
-- "Engines (code) vs types (data)": deterministic logic lives in versioned,
-- tested engines (Phase B = `tournament`); a *type* is catalogue data that picks
-- an engine and supplies its pools + default prizes. A sweepstake records which
-- engine it runs and SNAPSHOTS the type's data at creation, so later catalogue
-- edits can never rewrite a running sweep.
--
-- Additive: all sweepstake rows are still empty. The only replacement is
-- create_sweepstake, whose signature changes to take a type.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- sweepstake_type — the platform-owned catalogue
-- ---------------------------------------------------------------------------
create table sweepstake_type (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  sport          text not null default '',
  engine         text not null,                 -- code registry key, e.g. 'tournament'
  data           jsonb not null default '{}',   -- engine pools (groups/scorerPool/totalGames)
  default_prizes jsonb not null default '{}',
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Seed the World Cup 2026 type from the core constants (src/core/constants.ts).
-- Dollar-quoted so apostrophes (Côte d'Ivoire) need no escaping.
insert into sweepstake_type (name, sport, engine, data, default_prizes, active) values (
  'World Cup 2026', 'Football', 'tournament',
  $json${
    "totalGames": 104,
    "groups": {
      "A": ["Mexico","South Africa","South Korea","Czechia"],
      "B": ["Canada","Qatar","Switzerland","Bosnia & Herzegovina"],
      "C": ["Brazil","Morocco","Haiti","Scotland"],
      "D": ["United States","Paraguay","Australia","Türkiye"],
      "E": ["Germany","Curaçao","Côte d'Ivoire","Ecuador"],
      "F": ["Netherlands","Japan","Tunisia","Sweden"],
      "G": ["Belgium","Egypt","Iran","New Zealand"],
      "H": ["Spain","Cabo Verde","Uruguay","Saudi Arabia"],
      "I": ["France","Senegal","Norway","Iraq"],
      "J": ["Argentina","Algeria","Austria","Jordan"],
      "K": ["Portugal","DR Congo","Uzbekistan","Colombia"],
      "L": ["England","Croatia","Ghana","Panama"]
    },
    "scorerPool": [
      "Kylian Mbappé (France)","Ousmane Dembélé (France)","Michael Olise (France)","Marcus Thuram (France)",
      "Harry Kane (England)","Jude Bellingham (England)","Bukayo Saka (England)","Phil Foden (England)",
      "Lamine Yamal (Spain)","Pedri (Spain)","Dani Olmo (Spain)","Mikel Oyarzabal (Spain)",
      "Vinícius Jr (Brazil)","Raphinha (Brazil)","Rodrygo (Brazil)","Endrick (Brazil)",
      "Lionel Messi (Argentina)","Lautaro Martínez (Argentina)","Julián Álvarez (Argentina)",
      "Cristiano Ronaldo (Portugal)","Bruno Fernandes (Portugal)","Rafael Leão (Portugal)","Gonçalo Ramos (Portugal)",
      "Cody Gakpo (Netherlands)","Memphis Depay (Netherlands)","Donyell Malen (Netherlands)",
      "Florian Wirtz (Germany)","Kai Havertz (Germany)","Jamal Musiala (Germany)",
      "Romelu Lukaku (Belgium)","Kevin De Bruyne (Belgium)","Jérémy Doku (Belgium)",
      "Erling Haaland (Norway)","Alexander Sørloth (Norway)",
      "Mohamed Salah (Egypt)","Youssef En-Nesyri (Morocco)","Achraf Hakimi (Morocco)",
      "Nicolas Jackson (Senegal)","Sébastien Haller (Côte d'Ivoire)",
      "Darwin Núñez (Uruguay)","Luis Díaz (Colombia)","James Rodríguez (Colombia)",
      "Enner Valencia (Ecuador)","Takefusa Kubo (Japan)","Kaoru Mitoma (Japan)",
      "Son Heung-min (South Korea)","Breel Embolo (Switzerland)","Marko Arnautović (Austria)",
      "Raúl Jiménez (Mexico)","Santiago Giménez (Mexico)","Christian Pulisic (United States)",
      "Folarin Balogun (United States)","Mohammed Kudus (Ghana)","Antoine Semenyo (Ghana)"
    ]
  }$json$::jsonb,
  $json${"perGame":1,"finalist":{"mode":"£","value":30},"groupWinner":{"mode":"£","value":4},"groupRunnerUp":{"mode":"£","value":2},"boot":{"mode":"£","value":40}}$json$::jsonb,
  true
);

-- ---------------------------------------------------------------------------
-- sweepstake gains engine + type provenance + a frozen data snapshot
-- ---------------------------------------------------------------------------
alter table sweepstake add column type_id   uuid references sweepstake_type(id),
                       add column engine    text not null default 'tournament',
                       add column type_data jsonb not null default '{}';

-- =============================================================================
-- RLS — catalogue is readable (active rows) by any signed-in user for the create
-- picker; fully managed by platform admins only.
-- =============================================================================
alter table sweepstake_type enable row level security;

create policy type_read_active on sweepstake_type for select
  using (active or is_platform_admin());
create policy type_admin_all   on sweepstake_type for all
  using (is_platform_admin()) with check (is_platform_admin());

-- =============================================================================
-- Replace create_sweepstake: it now takes a type, snapshots the type's data and
-- engine, and copies the type's default prizes. (Setup still edits fund/prizes.)
-- =============================================================================
drop function if exists create_sweepstake(uuid, text, numeric, jsonb);
create or replace function create_sweepstake(
  p_account_id uuid,
  p_type_id    uuid,
  p_name       text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; t sweepstake_type;
begin
  if not is_account_organiser(p_account_id) then
    raise exception 'only an organiser of this account may create a sweepstake';
  end if;
  select * into t from sweepstake_type where id = p_type_id and active = true;
  if not found then
    raise exception 'unknown or inactive sweepstake type';
  end if;
  insert into sweepstake (account_id, type_id, engine, type_data, name, fund, seed, prizes, generated)
    values (p_account_id, t.id, t.engine, t.data,
            coalesce(nullif(btrim(p_name), ''), t.name),
            500, 0, t.default_prizes, false)
    returning id into new_id;
  insert into sweepstake_member (sweepstake_id, user_id, role)
    values (new_id, auth.uid(), 'organiser');
  insert into result (sweepstake_id) values (new_id);
  return new_id;
end $$;

-- Grants: keep off public + anon (Supabase grants anon explicitly on new funcs).
revoke execute on function create_sweepstake(uuid, uuid, text) from public, anon;
grant  execute on function create_sweepstake(uuid, uuid, text) to authenticated;
