-- =============================================================================
-- Hardening pass (addresses Supabase security advisor WARNs)
--   * pin search_path on the trigger functions (they had a mutable one);
--   * revoke EXECUTE on the self-guarding RPCs from `anon` — they already raise
--     for unauthenticated callers, this is defence-in-depth so they're only
--     reachable by signed-in users.
-- The RLS helpers is_member/is_organiser keep EXECUTE for `authenticated`
-- because the RLS policies evaluate them in the caller's context.
-- =============================================================================

create or replace function game_enforce_monotonic() returns trigger
language plpgsql set search_path = public as $$
declare next_idx integer;
begin
  select coalesce(max(game_index) + 1, 0) into next_idx
    from game where sweepstake_id = new.sweepstake_id;
  if new.game_index <> next_idx then
    raise exception 'game_index must be % (append-only, gap-free); got %', next_idx, new.game_index;
  end if;
  return new;
end $$;

create or replace function game_forbid_update() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'games are immutable; undo the last game and re-log instead';
end $$;

create or replace function game_only_delete_last() returns trigger
language plpgsql set search_path = public as $$
declare max_idx integer;
begin
  select max(game_index) into max_idx
    from game where sweepstake_id = old.sweepstake_id;
  if old.game_index <> max_idx then
    raise exception 'only the last game (#%) may be undone, not #%', max_idx, old.game_index;
  end if;
  return old;
end $$;

create or replace function player_freeze_after_generation() returns trigger
language plpgsql set search_path = public as $$
declare is_gen boolean;
  sid uuid := coalesce(new.sweepstake_id, old.sweepstake_id);
begin
  select generated into is_gen from sweepstake where id = sid;
  if is_gen then
    raise exception 'ticket books are frozen: this sweepstake is already generated';
  end if;
  return coalesce(new, old);
end $$;

-- Default EXECUTE is granted to PUBLIC (which both anon + authenticated inherit),
-- so revoke from PUBLIC and re-grant only to authenticated. This makes the RPCs
-- and RLS helpers unreachable by the anon role entirely. (The residual advisor
-- WARNs that `authenticated` can call these SECURITY DEFINER functions are
-- by-design: each one self-guards via auth.uid()/is_organiser, and the RLS
-- policies need is_member/is_organiser callable by signed-in users.)
revoke execute on function create_sweepstake(text, numeric, jsonb) from public;
revoke execute on function generate_sweepstake(uuid, numeric, jsonb, bigint, jsonb) from public;
revoke execute on function reset_sweepstake(uuid) from public;
revoke execute on function is_member(uuid) from public;
revoke execute on function is_organiser(uuid) from public;

grant execute on function create_sweepstake(text, numeric, jsonb) to authenticated;
grant execute on function generate_sweepstake(uuid, numeric, jsonb, bigint, jsonb) to authenticated;
grant execute on function reset_sweepstake(uuid) to authenticated;
grant execute on function is_member(uuid) to authenticated;
grant execute on function is_organiser(uuid) to authenticated;
