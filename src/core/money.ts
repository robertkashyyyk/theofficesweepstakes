/* =========================================================================
   Money helpers — ported from the .jsx. Kept in their own module so both the
   dealer and the scorer can share `toGBP` without a circular import.
   ========================================================================= */
import type { PrizeAmount } from "./types";

/** Resolve a £/% prize against the fund. % is value/100 of the fund. */
export function toGBP(item: PrizeAmount | undefined, fund: number): number {
  if (item && item.mode === "%") return (fund * (Number(item.value) || 0)) / 100;
  return Number(item?.value) || 0;
}

/** Format a number as GBP, rounding to 2dp the same way the prototype does. */
export function money(n: number): string {
  return "£" + (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-GB");
}

/** Which group a team belongs to (letter), or undefined. */
export function groupOf(team: string, groups: Record<string, string[]>): string | undefined {
  return Object.keys(groups).find((g) => groups[g].includes(team));
}
