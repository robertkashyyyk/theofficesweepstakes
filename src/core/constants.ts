/* =========================================================================
   Constants lifted VERBATIM from world-cup-sweepstake.jsx (§7 of the brief).
   Re-check the team list / groups against the final official draw before
   launch. Do NOT reorder SCORELINES — its order is part of the rotation seed
   contract (the deck is shuffled, but the source order must stay fixed).
   ========================================================================= */
import type { Prizes } from "./types";

export const GROUPS: Record<string, string[]> = {
  A: ["Mexico", "South Africa", "South Korea", "Czechia"],
  B: ["Canada", "Qatar", "Switzerland", "Bosnia & Herzegovina"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["United States", "Paraguay", "Australia", "Türkiye"],
  E: ["Germany", "Curaçao", "Côte d'Ivoire", "Ecuador"],
  F: ["Netherlands", "Japan", "Tunisia", "Sweden"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Cabo Verde", "Uruguay", "Saudi Arabia"],
  I: ["France", "Senegal", "Norway", "Iraq"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

export const TEAMS: string[] = Object.values(GROUPS).flat();

export const TOTAL_GAMES = 104;

/**
 * Ordered 90-min correct-score pool (team 1 first): "0-0" .. "4-4" = 25 entries.
 * 1-0 and 0-1 are DIFFERENT tickets — order is meaningful.
 */
export const SCORELINES: string[] = (() => {
  const out: string[] = [];
  for (let t1 = 0; t1 <= 4; t1++) for (let t2 = 0; t2 <= 4; t2++) out.push(`${t1}-${t2}`);
  return out;
})();

export const SCORER_POOL: string[] = [
  "Kylian Mbappé (France)", "Ousmane Dembélé (France)", "Michael Olise (France)", "Marcus Thuram (France)",
  "Harry Kane (England)", "Jude Bellingham (England)", "Bukayo Saka (England)", "Phil Foden (England)",
  "Lamine Yamal (Spain)", "Pedri (Spain)", "Dani Olmo (Spain)", "Mikel Oyarzabal (Spain)",
  "Vinícius Jr (Brazil)", "Raphinha (Brazil)", "Rodrygo (Brazil)", "Endrick (Brazil)",
  "Lionel Messi (Argentina)", "Lautaro Martínez (Argentina)", "Julián Álvarez (Argentina)",
  "Cristiano Ronaldo (Portugal)", "Bruno Fernandes (Portugal)", "Rafael Leão (Portugal)", "Gonçalo Ramos (Portugal)",
  "Cody Gakpo (Netherlands)", "Memphis Depay (Netherlands)", "Donyell Malen (Netherlands)",
  "Florian Wirtz (Germany)", "Kai Havertz (Germany)", "Jamal Musiala (Germany)",
  "Romelu Lukaku (Belgium)", "Kevin De Bruyne (Belgium)", "Jérémy Doku (Belgium)",
  "Erling Haaland (Norway)", "Alexander Sørloth (Norway)",
  "Mohamed Salah (Egypt)", "Youssef En-Nesyri (Morocco)", "Achraf Hakimi (Morocco)",
  "Nicolas Jackson (Senegal)", "Sébastien Haller (Côte d'Ivoire)",
  "Darwin Núñez (Uruguay)", "Luis Díaz (Colombia)", "James Rodríguez (Colombia)",
  "Enner Valencia (Ecuador)", "Takefusa Kubo (Japan)", "Kaoru Mitoma (Japan)",
  "Son Heung-min (South Korea)", "Breel Embolo (Switzerland)", "Marko Arnautović (Austria)",
  "Raúl Jiménez (Mexico)", "Santiago Giménez (Mexico)", "Christian Pulisic (United States)",
  "Folarin Balogun (United States)", "Mohammed Kudus (Ghana)", "Antoine Semenyo (Ghana)",
];

export const DEFAULT_PRIZES: Prizes = {
  perGame: 1,
  finalist: { mode: "£", value: 30 },
  groupWinner: { mode: "£", value: 4 },
  groupRunnerUp: { mode: "£", value: 2 },
  boot: { mode: "£", value: 40 },
};

export const DEFAULT_PIN = "1234";
