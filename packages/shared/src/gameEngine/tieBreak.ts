import type { RngFn } from "../types.js";
import type { RunoffFallback, TieBreakConfig } from "../gameConfig.js";
import { tallyVotes } from "./tally.js";
import type { CastVote } from "../types.js";

export interface TieBreakOutcome {
  /** The player awarded the card, or null if no one is (a tie with NO_AWARD, or nobody voted). */
  winnerPlayerId: string | null;
  /** True when the caller must run a synced runoff vote among `candidates` before a winner is known. */
  needsRunoff: boolean;
  candidates: string[];
}

/**
 * Resolves a question's vote tally into a single winner (or no winner),
 * given the session's configured tie-break method.
 *
 * - 0 or 1 top vote-getters: resolved directly, no tie exists.
 * - A genuine tie is resolved per `tieBreak.method`. RUNOFF doesn't resolve
 *   here — it signals the caller to collect a second, synced vote restricted
 *   to `candidates` and then call `resolveRunoffTally`.
 */
export function resolveTie(
  topPlayerIds: string[],
  tieBreak: TieBreakConfig,
  rng: RngFn = Math.random,
): TieBreakOutcome {
  if (topPlayerIds.length <= 1) {
    return { winnerPlayerId: topPlayerIds[0] ?? null, needsRunoff: false, candidates: [] };
  }

  switch (tieBreak.method) {
    case "NO_AWARD":
      return { winnerPlayerId: null, needsRunoff: false, candidates: topPlayerIds };
    case "RANDOM":
      return {
        winnerPlayerId: pickRandom(topPlayerIds, rng),
        needsRunoff: false,
        candidates: topPlayerIds,
      };
    case "RUNOFF":
      return { winnerPlayerId: null, needsRunoff: true, candidates: topPlayerIds };
  }
}

/**
 * Resolves the votes cast in a runoff round. Runoff votes are restricted to
 * the tied candidates and never consume a Deck Mode vote-card (see
 * voteValidation.ts) — they're a tie-break formality, not a new permanent
 * choice. If the runoff ties again, `runoffFallback` decides (never another
 * RUNOFF, to avoid an unbounded loop).
 */
export function resolveRunoffTally(
  runoffVotes: CastVote[],
  runoffFallback: RunoffFallback,
  rng: RngFn = Math.random,
): { winnerPlayerId: string | null } {
  const { topPlayerIds } = tallyVotes(runoffVotes);

  if (topPlayerIds.length <= 1) {
    return { winnerPlayerId: topPlayerIds[0] ?? null };
  }

  if (runoffFallback === "RANDOM") {
    return { winnerPlayerId: pickRandom(topPlayerIds, rng) };
  }
  return { winnerPlayerId: null };
}

function pickRandom<T>(items: T[], rng: RngFn): T {
  const idx = Math.floor(rng() * items.length);
  return items[idx]!;
}
