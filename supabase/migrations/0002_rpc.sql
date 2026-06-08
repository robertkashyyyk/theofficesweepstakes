-- =============================================================================
-- Generation as a single transaction (§9: "Generation should be one transaction")
--
-- The value-equalised deal is computed in the shared TS core on the organiser's
-- client (its result is persisted, not re-derived, so it need not be seed-
-- reproducible). These RPCs persist that result atomically and set the
-- rotation seed. Only the deterministic rotation seed is security-sensitive,
-- and it is stored + used identically everywhere.
-- =============================================================================

-- Create a draft sweepstake and make the caller its organiser. One transaction.
create or replace function create_sweepstake(
  p_name   text,
  p_fund   numeric,
  p_prizes jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to create a sweepstake';
  end if;
  insert into sweepstake (name, fund, seed, prizes, generated)
    values (coalesce(p_name, 'Office World Cup Sweep'), p_fund, 0, p_prizes, false)
    returning id into new_id;
  insert into sweepstake_member (sweepstake_id, user_id, role)
    values (new_id, auth.uid(), 'organiser');
  insert into result (sweepstake_id) values (new_id);
  return new_id;
end $$;

-- Deal the books + lock the draw. One transaction.
-- p_players: jsonb array of
--   { id, name, createdAt(ms),
--     winnerTeams[], finalistTeams[], groupWinnerTeams[],
--     groupRunnerUpTeams[], bootPlayers[] }
create or replace function generate_sweepstake(
  p_sweepstake_id uuid,
  p_fund          numeric,
  p_prizes        jsonb,
  p_seed          bigint,
  p_players       jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  if not is_organiser(p_sweepstake_id) then
    raise exception 'only an organiser may generate this sweepstake';
  end if;
  if (select generated from sweepstake where id = p_sweepstake_id) then
    raise exception 'already generated; reset first';
  end if;
  if p_fund is null or p_fund <= 0 then
    raise exception 'fund must be > 0';
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) < 2 then
    raise exception 'need at least 2 players';
  end if;

  -- insert players while still ungenerated (the freeze trigger allows it)
  for rec in select * from jsonb_array_elements(p_players) loop
    insert into player (
      id, sweepstake_id, name, created_at,
      winner_teams, finalist_teams, group_winner_teams, group_runner_up_teams, boot_players
    ) values (
      (rec->>'id')::uuid,
      p_sweepstake_id,
      rec->>'name',
      to_timestamp((rec->>'createdAt')::bigint / 1000.0),
      array(select jsonb_array_elements_text(rec->'winnerTeams')),
      array(select jsonb_array_elements_text(rec->'finalistTeams')),
      array(select jsonb_array_elements_text(rec->'groupWinnerTeams')),
      array(select jsonb_array_elements_text(rec->'groupRunnerUpTeams')),
      array(select jsonb_array_elements_text(rec->'bootPlayers'))
    );
  end loop;

  update sweepstake
     set fund = p_fund, prizes = p_prizes, seed = p_seed, generated = true
   where id = p_sweepstake_id;
end $$;

-- Reset: wipe players + results, unlock. Organiser only. One transaction.
create or replace function reset_sweepstake(p_sweepstake_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_organiser(p_sweepstake_id) then
    raise exception 'only an organiser may reset this sweepstake';
  end if;
  -- unlock first so the player freeze trigger permits the delete
  update sweepstake set generated = false where id = p_sweepstake_id;
  delete from game   where sweepstake_id = p_sweepstake_id;
  delete from player where sweepstake_id = p_sweepstake_id;
  update result set group_first = '{}', group_second = '{}', finalists = '{}',
                    champion = '', top_scorer = '', updated_at = now()
    where sweepstake_id = p_sweepstake_id;
end $$;
