/* =========================================================================
   Data-access layer — maps Supabase rows <-> framework-agnostic core types.
   The core (src/core) never imports this; this is the only DB-aware module
   besides the React components.
   ========================================================================= */
import { supabase } from "../lib/supabase";
import { dealTickets, type Config, type Game, type Player, type Prizes, type Results } from "../core";

export type Role = "organiser" | "player";

export interface Bundle {
  sweepstakeId: string;
  name: string;
  config: Config;
  players: Player[];
  results: Results;
  role: Role;
}

/* ---- row mappers ---- */
function rowToPlayer(r: any): Player {
  return {
    id: r.id,
    name: r.name,
    createdAt: new Date(r.created_at).getTime(),
    winnerTeams: r.winner_teams ?? [],
    finalistTeams: r.finalist_teams ?? [],
    groupWinnerTeams: r.group_winner_teams ?? [],
    groupRunnerUpTeams: r.group_runner_up_teams ?? [],
    bootPlayers: r.boot_players ?? [],
  };
}
function rowToGame(r: any): Game {
  return { gameIndex: r.game_index, score: r.score, label: r.label ?? "" };
}

/* ---- reads ---- */

/** The first sweepstake the signed-in user belongs to (single-tenant default). */
export async function getMySweepstakeId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("sweepstake_member")
    .select("sweepstake_id")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.sweepstake_id ?? null;
}

export async function loadBundle(sweepstakeId: string): Promise<Bundle> {
  const userId = (await supabase.auth.getUser()).data.user?.id;

  const [{ data: sweep, error: e1 }, { data: members, error: e2 }, { data: players, error: e3 }, { data: games, error: e4 }, { data: result, error: e5 }] =
    await Promise.all([
      supabase.from("sweepstake").select("*").eq("id", sweepstakeId).single(),
      supabase.from("sweepstake_member").select("user_id,role").eq("sweepstake_id", sweepstakeId),
      supabase.from("player").select("*").eq("sweepstake_id", sweepstakeId),
      supabase.from("game").select("*").eq("sweepstake_id", sweepstakeId).order("game_index", { ascending: true }),
      supabase.from("result").select("*").eq("sweepstake_id", sweepstakeId).maybeSingle(),
    ]);
  const err = e1 || e2 || e3 || e4 || e5;
  if (err) throw err;

  const role: Role = (members ?? []).find((m: any) => m.user_id === userId)?.role ?? "player";

  const config: Config = {
    fund: Number(sweep.fund),
    seed: Number(sweep.seed),
    prizes: sweep.prizes as Prizes,
    generated: sweep.generated,
  };
  const results: Results = {
    games: (games ?? []).map(rowToGame),
    groupFirst: result?.group_first ?? {},
    groupSecond: result?.group_second ?? {},
    finalists: result?.finalists ?? [],
    champion: result?.champion ?? "",
    topScorer: result?.top_scorer ?? "",
  };

  return {
    sweepstakeId,
    name: sweep.name,
    config,
    players: (players ?? []).map(rowToPlayer),
    results,
    role,
  };
}

/* ---- writes (organiser only; enforced by RLS + triggers) ---- */

export async function createSweepstake(name: string, fund: number, prizes: Prizes): Promise<string> {
  const { data, error } = await supabase.rpc("create_sweepstake", {
    p_name: name,
    p_fund: fund,
    p_prizes: prizes,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Deal the books in the shared core, pick a 32-bit seed, and persist atomically.
 * Player ids + createdAt are generated client-side so the dealt arrays attach
 * stably; playerIndex is always re-derived from (createdAt, id), never stored.
 */
export async function generateSweepstake(
  sweepstakeId: string,
  fund: number,
  prizes: Prizes,
  names: string[]
): Promise<void> {
  const now = Date.now();
  const inputs = names.map((n, i) => ({
    id: crypto.randomUUID(),
    name: n.trim(),
    createdAt: now + i, // distinct, monotonic; survives the timestamptz round-trip
  }));
  const players = dealTickets(inputs, fund, prizes);
  const seed = Math.floor(Math.random() * 0x100000000); // 32-bit unsigned

  const { error } = await supabase.rpc("generate_sweepstake", {
    p_sweepstake_id: sweepstakeId,
    p_fund: fund,
    p_prizes: prizes,
    p_seed: seed,
    p_players: players,
  });
  if (error) throw error;
}

export async function resetSweepstake(sweepstakeId: string): Promise<void> {
  const { error } = await supabase.rpc("reset_sweepstake", { p_sweepstake_id: sweepstakeId });
  if (error) throw error;
}

/** Append the next game. game_index is computed server-side by the trigger; we
 *  pass the expected next index for a clean error if a race occurs. */
export async function logGame(sweepstakeId: string, nextIndex: number, score: string, label: string): Promise<void> {
  const { error } = await supabase
    .from("game")
    .insert({ sweepstake_id: sweepstakeId, game_index: nextIndex, score, label });
  if (error) throw error;
}

export async function undoLastGame(sweepstakeId: string, lastIndex: number): Promise<void> {
  const { error } = await supabase
    .from("game")
    .delete()
    .eq("sweepstake_id", sweepstakeId)
    .eq("game_index", lastIndex);
  if (error) throw error;
}

export async function saveResultPatch(
  sweepstakeId: string,
  patch: Partial<{
    group_first: Record<string, string>;
    group_second: Record<string, string>;
    finalists: string[];
    champion: string;
    top_scorer: string;
  }>
): Promise<void> {
  const { error } = await supabase
    .from("result")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("sweepstake_id", sweepstakeId);
  if (error) throw error;
}
