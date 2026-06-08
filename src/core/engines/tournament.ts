/* =========================================================================
   `tournament` engine — groups + knockout + rotating correct-score.

   This IS the existing World Cup logic, repackaged behind the Engine boundary.
   It delegates to the pure core (dealing / scoring / prng / projection) with NO
   changes to that code, so the determinism golden tests stay green.

   Phase B has a single tournament type (World Cup 2026) whose `data` equals the
   core's WC constants, so the wrapper delegates to the constant-bound core
   functions. Full per-type pool parameterisation (a 2nd tournament from data
   alone) lands when it's actually needed — it would be added here + in the core
   behind optional args, guarded by its own tests, without touching the rotation.
   ========================================================================= */
import { dealTickets, type DealInput } from "../dealing";
import { compute as coreCompute, projection as coreProjection } from "../scoring";
import { scoreFor as coreScoreFor } from "../prng";
import type { Config, Player, Prizes, Projection, Results, Rng, Scoring } from "../types";
import type { Engine, EngineData } from "./types";

export const tournament: Engine = {
  key: "tournament",
  label: "Tournament — groups, knockout & rotating correct-score",
  sportDefault: "Football",

  deal(inputs: DealInput[], fund: number, prizes: Prizes, _data: EngineData, rng?: Rng): Player[] {
    return dealTickets(inputs, fund, prizes, rng ?? Math.random);
  },

  scoreFor(seed: number, gameIndex: number, playerIndex: number): string {
    return coreScoreFor(seed, gameIndex, playerIndex);
  },

  compute(players: Player[], results: Results, config: Config, _data: EngineData): Scoring {
    return coreCompute(players, results, config);
  },

  projection(fund: number, prizes: Prizes, _data: EngineData): Projection {
    return coreProjection(fund, prizes);
  },
};
