-- =============================================================================
-- Phase A — Tenancy + super-admin
--
-- The pivot: a sweepstake no longer floats alone — it belongs to an ACCOUNT
-- (a company/office tenant). Three tiers:
--   * platform owner / super-admin (Robert)  — curates the platform, sees all
--   * organiser (account owner/member)        — opens an account, runs sweepstakes
--   * players (staff)                         — phase 1 = names only, no login
--
-- Design choices baked in here (decided with the user):
--   * super-admin + co-organiser invites are EMAIL-KEYED, so they work before
--     the invitee has ever signed in. platform_admin is seeded by email;
--     account_invite rows are claimed into account_member on first sign-in.
--   * the account create path mirrors the existing sweepstake one: a
--     SECURITY DEFINER RPC inserts the row + an owner membership atomically,
--     so there is no direct-insert policy (default deny).
--
-- This migration is purely ADDITIVE (all tables empty at apply time) except for
-- replacing create_sweepstake, whose signature gains p_account_id.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- account — a tenant (company / office)
-- ---------------------------------------------------------------------------
create table account (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- account_member — who can log in and organise for an account
--   (players don't log in in phase 1; only owner/organiser roles exist here)
-- ---------------------------------------------------------------------------
create table account_member (
  account_id uuid not null references account(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','organiser')),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

-- ---------------------------------------------------------------------------
-- staff — reusable name roster, used to deal ticket books
--   email is nullable (reserved for phase-2 optional player login)
-- ---------------------------------------------------------------------------
create table staff (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  name       text not null,
  email      text,
  created_at timestamptz not null default now(),
  unique (account_id, name)
);
create index staff_account_idx on staff (account_id, created_at);

-- ---------------------------------------------------------------------------
-- account_invite — pending co-organiser invites, EMAIL-KEYED
--   (the invitee may not have an auth account yet; claimed on first sign-in)
-- ---------------------------------------------------------------------------
create table account_invite (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  email      text not null,
  role       text not null default 'organiser' check (role in ('owner','organiser')),
  created_at timestamptz not null default now(),
  unique (account_id, email)
);

-- ---------------------------------------------------------------------------
-- platform_admin — super-admins, EMAIL-KEYED (works before first sign-in)
-- ---------------------------------------------------------------------------
create table platform_admin (
  email      text primary key,
  created_at timestamptz not null default now()
);
insert into platform_admin (email) values ('robert@kashyyyk.co.uk')
  on conflict do nothing;

-- ---------------------------------------------------------------------------
-- sweepstake gains an owning account (nullable; set by the updated RPC)
-- ---------------------------------------------------------------------------
alter table sweepstake add column account_id uuid references account(id) on delete cascade;
create index sweepstake_account_idx on sweepstake (account_id, created_at);

-- =============================================================================
-- Role helpers (mirror is_member / is_organiser from 0001)
-- =============================================================================
create or replace function is_platform_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from platform_admin
    where email = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function is_account_member(aid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from account_member m
    where m.account_id = aid and m.user_id = auth.uid()
  );
$$;

-- owner or organiser — both may run the account; only "manage" differs by UI
create or replace function is_account_organiser(aid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from account_member m
    where m.account_id = aid and m.user_id = auth.uid()
      and m.role in ('owner','organiser')
  );
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table account        enable row level security;
alter table account_member enable row level security;
alter table staff          enable row level security;
alter table account_invite enable row level security;
alter table platform_admin enable row level security;

-- account: members (and platform admins) read; owner renames. Creation goes
-- ONLY through create_account (SECURITY DEFINER) so the owner membership is
-- attached atomically — hence no insert policy (default deny).
create policy account_read   on account for select
  using (is_account_member(id) or is_platform_admin());
create policy account_update on account for update
  using (is_account_organiser(id)) with check (is_account_organiser(id));

-- account_member: members + platform admins read; organisers manage the roster.
create policy account_member_read  on account_member for select
  using (is_account_member(account_id) or is_platform_admin());
create policy account_member_write on account_member for all
  using (is_account_organiser(account_id)) with check (is_account_organiser(account_id));

-- staff: account organisers read + manage their roster.
create policy staff_read  on staff for select using (is_account_organiser(account_id));
create policy staff_write on staff for all
  using (is_account_organiser(account_id)) with check (is_account_organiser(account_id));

-- account_invite: account organisers read + manage. (Claiming is done by the
-- claim_my_invites RPC under definer rights, so invitees need no direct access.)
create policy invite_read  on account_invite for select using (is_account_organiser(account_id));
create policy invite_write on account_invite for all
  using (is_account_organiser(account_id)) with check (is_account_organiser(account_id));

-- platform_admin: only platform admins can read; no client write (seed-only).
create policy platform_admin_read on platform_admin for select using (is_platform_admin());

-- sweepstake: let platform admins read every sweepstake (for the /admin console),
-- on top of the existing member-read policy from 0001.
create policy sweepstake_admin_read on sweepstake for select using (is_platform_admin());

-- =============================================================================
-- RPCs
-- =============================================================================

-- Create an account and make the caller its owner. One transaction.
create or replace function create_account(p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to create an account';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'account name is required';
  end if;
  insert into account (name, created_by) values (btrim(p_name), auth.uid())
    returning id into new_id;
  insert into account_member (account_id, user_id, role)
    values (new_id, auth.uid(), 'owner');
  return new_id;
end $$;

-- Replace create_sweepstake: it now hangs the sweepstake off an account.
-- (Signature changes, so drop the old one before recreating.)
drop function if exists create_sweepstake(text, numeric, jsonb);
create or replace function create_sweepstake(
  p_account_id uuid,
  p_name       text,
  p_fund       numeric,
  p_prizes     jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not is_account_organiser(p_account_id) then
    raise exception 'only an organiser of this account may create a sweepstake';
  end if;
  insert into sweepstake (account_id, name, fund, seed, prizes, generated)
    values (p_account_id, coalesce(p_name, 'Office Sweepstake'), p_fund, 0, p_prizes, false)
    returning id into new_id;
  insert into sweepstake_member (sweepstake_id, user_id, role)
    values (new_id, auth.uid(), 'organiser');
  insert into result (sweepstake_id) values (new_id);
  return new_id;
end $$;

-- Invite a co-organiser by email (upsert; the row is claimed on their sign-in).
create or replace function invite_co_organiser(p_account_id uuid, p_email text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_account_organiser(p_account_id) then
    raise exception 'only an organiser may invite co-organisers';
  end if;
  if p_email is null or length(btrim(p_email)) = 0 then
    raise exception 'email is required';
  end if;
  insert into account_invite (account_id, email, role)
    values (p_account_id, lower(btrim(p_email)), 'organiser')
    on conflict (account_id, email) do nothing;
end $$;

-- Claim any pending invites matching the caller's email -> real memberships.
-- Idempotent; called by the app right after sign-in.
create or replace function claim_my_invites()
returns void
language plpgsql security definer set search_path = public as $$
declare my_email text := lower(auth.jwt() ->> 'email');
begin
  if my_email is null then return; end if;
  insert into account_member (account_id, user_id, role)
    select i.account_id, auth.uid(), i.role
      from account_invite i
     where i.email = my_email
    on conflict (account_id, user_id) do nothing;
  delete from account_invite where email = my_email;
end $$;

-- People for an account: members (with emails), pending invites, staff roster.
-- Emails live in auth.users (not client-readable), so this returns them under
-- definer rights, guarded to organisers of the account.
create or replace function list_account_people(p_account_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_account_organiser(p_account_id) then
    raise exception 'only an organiser may view account people';
  end if;
  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email, 'role', m.role)
                        order by m.created_at)
        from account_member m join auth.users u on u.id = m.user_id
       where m.account_id = p_account_id), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role) order by i.created_at)
        from account_invite i where i.account_id = p_account_id), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'email', s.email)
                       order by s.created_at)
        from staff s where s.account_id = p_account_id), '[]'::jsonb)
  ) into out;
  return out;
end $$;

-- Platform-wide overview for the /admin console: every account with its members
-- (emails) and its sweepstakes. Guarded to platform admins.
create or replace function admin_overview()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_platform_admin() then
    raise exception 'not authorised';
  end if;
  select coalesce(jsonb_agg(a_obj order by a_created), '[]'::jsonb) into out
  from (
    select a.created_at as a_created, jsonb_build_object(
      'id', a.id,
      'name', a.name,
      'createdAt', a.created_at,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role) order by m.created_at)
          from account_member m join auth.users u on u.id = m.user_id
         where m.account_id = a.id), '[]'::jsonb),
      'sweepstakes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', s.id, 'name', s.name, 'generated', s.generated, 'createdAt', s.created_at)
                 order by s.created_at)
          from sweepstake s where s.account_id = a.id), '[]'::jsonb)
    ) as a_obj
    from account a
  ) accts;
  return out;
end $$;

-- =============================================================================
-- Grants — keep these RPCs/helpers off the anon role (defence-in-depth; each
-- one self-guards). NOTE: Supabase's default privileges EXPLICITLY grant EXECUTE
-- to `anon` on every new public function, so `revoke ... from public` is NOT
-- enough — that only drops the PUBLIC grant, leaving the explicit anon grant in
-- place. We must revoke from `anon` (and public) by name.
-- =============================================================================
revoke execute on function is_platform_admin()                              from public, anon;
revoke execute on function is_account_member(uuid)                          from public, anon;
revoke execute on function is_account_organiser(uuid)                       from public, anon;
revoke execute on function create_account(text)                             from public, anon;
revoke execute on function create_sweepstake(uuid, text, numeric, jsonb)    from public, anon;
revoke execute on function invite_co_organiser(uuid, text)                  from public, anon;
revoke execute on function claim_my_invites()                               from public, anon;
revoke execute on function list_account_people(uuid)                        from public, anon;
revoke execute on function admin_overview()                                 from public, anon;

grant execute on function is_platform_admin()                              to authenticated;
grant execute on function is_account_member(uuid)                          to authenticated;
grant execute on function is_account_organiser(uuid)                       to authenticated;
grant execute on function create_account(text)                             to authenticated;
grant execute on function create_sweepstake(uuid, text, numeric, jsonb)    to authenticated;
grant execute on function invite_co_organiser(uuid, text)                  to authenticated;
grant execute on function claim_my_invites()                               to authenticated;
grant execute on function list_account_people(uuid)                        to authenticated;
grant execute on function admin_overview()                                 to authenticated;
