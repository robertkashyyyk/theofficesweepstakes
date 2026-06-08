/* =========================================================================
   Data-access layer — maps Supabase rows <-> framework-agnostic core types.
   The core (src/core) never imports this; this is the only DB-aware module
   besides the React components.
   ========================================================================= */
import { supabase } from "../lib/supabase";
import { dealTickets, type Config, type EngineData, type Game, type Player, type Prizes, type Results } from "../core";

export type Role = "organiser" | "player";
export type AccountRole = "owner" | "organiser";

export interface Bundle {
  sweepstakeId: string;
  name: string;
  config: Config;
  players: Player[];
  results: Results;
  role: Role;
  /** Which engine this sweepstake runs (e.g. "tournament"). */
  engine: string;
  /** Snapshot of the type's data taken at creation (pools/config). */
  typeData: EngineData;
}

/* ---- Phase B: sweepstake-type catalogue ---- */
export interface SweepstakeType {
  id: string;
  name: string;
  sport: string;
  engine: string;
  data: EngineData;
  defaultPrizes: Prizes;
  active: boolean;
}

/* ---- Phase A: tenancy ---- */
export interface Account {
  id: string;
  name: string;
  role: AccountRole; // the signed-in user's role in this account
}
export interface StaffRow {
  id: string;
  name: string;
  email: string | null;
}
export interface AccountPerson {
  userId?: string;
  email: string;
  role: string;
}
export interface AccountPeople {
  members: AccountPerson[];
  invites: { email: string; role: string }[];
  staff: StaffRow[];
}
export interface SweepSummary {
  id: string;
  name: string;
  generated: boolean;
}
export interface AdminAccount {
  id: string;
  name: string;
  createdAt: string;
  members: { email: string; role: string }[];
  sweepstakes: { id: string; name: string; generated: boolean; createdAt: string }[];
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

/** Claim any pending co-organiser invites for the signed-in user's email. */
export async function claimMyInvites(): Promise<void> {
  const { error } = await supabase.rpc("claim_my_invites");
  if (error) throw error;
}

/** The signed-in user's account (Phase A is single-account-per-user). */
export async function getMyAccount(): Promise<Account | null> {
  const { data, error } = await supabase
    .from("account_member")
    .select("role, account:account_id(id, name)")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const acc = (data as any).account;
  return { id: acc.id, name: acc.name, role: (data as any).role as AccountRole };
}

/** Sweepstakes under an account that the signed-in user can access (newest first). */
export async function listSweepstakes(accountId: string): Promise<SweepSummary[]> {
  const { data, error } = await supabase
    .from("sweepstake")
    .select("id, name, generated, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, name: r.name, generated: r.generated }));
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
    engine: sweep.engine ?? "tournament",
    typeData: (sweep.type_data ?? {}) as EngineData,
  };
}

/* ---- writes (organiser only; enforced by RLS + triggers) ---- */

export async function createAccount(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_account", { p_name: name });
  if (error) throw error;
  return data as string;
}

export async function createSweepstake(
  accountId: string,
  typeId: string,
  name: string
): Promise<string> {
  const { data, error } = await supabase.rpc("create_sweepstake", {
    p_account_id: accountId,
    p_type_id: typeId,
    p_name: name,
  });
  if (error) throw error;
  return data as string;
}

/* ---- Phase B: sweepstake-type catalogue ---- */

function rowToType(r: any): SweepstakeType {
  return {
    id: r.id,
    name: r.name,
    sport: r.sport ?? "",
    engine: r.engine,
    data: (r.data ?? {}) as EngineData,
    defaultPrizes: r.default_prizes as Prizes,
    active: r.active,
  };
}

/** Active types, for the organiser's create-sweepstake picker. */
export async function listSweepstakeTypes(): Promise<SweepstakeType[]> {
  const { data, error } = await supabase
    .from("sweepstake_type")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToType);
}

/** All types incl. inactive, for the super-admin catalogue. */
export async function adminListSweepstakeTypes(): Promise<SweepstakeType[]> {
  const { data, error } = await supabase
    .from("sweepstake_type")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToType);
}

/** Create or update a type. Pools live in `data` (managed by the caller; the
 *  /admin UI edits metadata + totalGames and seeds keep the heavy pools).
 *  Platform-admin only (enforced by RLS). */
export async function upsertSweepstakeType(t: {
  id?: string;
  name: string;
  sport: string;
  engine: string;
  data: EngineData;
  defaultPrizes: Prizes;
  active: boolean;
}): Promise<void> {
  const row = {
    name: t.name,
    sport: t.sport,
    engine: t.engine,
    data: t.data,
    default_prizes: t.defaultPrizes,
    active: t.active,
  };
  const q = t.id
    ? supabase.from("sweepstake_type").update(row).eq("id", t.id)
    : supabase.from("sweepstake_type").insert(row);
  const { error } = await q;
  if (error) throw error;
}

export async function setTypeActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from("sweepstake_type").update({ active }).eq("id", id);
  if (error) throw error;
}

/* ---- account people: staff roster + co-organiser invites ---- */

export async function listAccountPeople(accountId: string): Promise<AccountPeople> {
  const { data, error } = await supabase.rpc("list_account_people", { p_account_id: accountId });
  if (error) throw error;
  return data as AccountPeople;
}

export async function addStaff(accountId: string, name: string, email?: string): Promise<void> {
  const { error } = await supabase
    .from("staff")
    .insert({ account_id: accountId, name: name.trim(), email: email?.trim() || null });
  if (error) throw error;
}

export async function removeStaff(staffId: string): Promise<void> {
  const { error } = await supabase.from("staff").delete().eq("id", staffId);
  if (error) throw error;
}

export async function inviteCoOrganiser(accountId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc("invite_co_organiser", {
    p_account_id: accountId,
    p_email: email,
  });
  if (error) throw error;
}

/* ---- super-admin (platform owner) read-only overview ---- */

export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return Boolean(data);
}

export async function adminOverview(): Promise<AdminAccount[]> {
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw error;
  return (data as AdminAccount[]) ?? [];
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
