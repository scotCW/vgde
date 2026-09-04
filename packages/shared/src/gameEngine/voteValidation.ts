import type { GameConfig } from "../gameConfig.js";
import type { VoteCardRef } from "../types.js";
import { hasAvailableTargets, isCardAvailable } from "./deck.js";

export type VoteRejectionReason =
  | "SELF_VOTE_NOT_ALLOWED"
  | "TARGET_NOT_IN_SESSION"
  | "CARD_ALREADY_USED"
  | "VOLUNTARY_ABSTAIN_DISABLED";

export type VoteValidationResult =
  | { ok: true; isAutoAbstain: boolean }
  | { ok: false; reason: VoteRejectionReason };

export interface ValidateVoteInput {
  config: GameConfig;
  voterPlayerId: string;
  /** null = the player is trying to abstain. */
  targetPlayerId: string | null;
  sessionPlayerIds: string[];
  /** Only meaningful (and only consulted) for DECK_UNIQUE. */
  deck?: VoteCardRef[];
}

/**
 * Validates one vote submission against the session's rules. Deck Mode's
 * "can't vote for the same person twice" and the abstain toggle interact:
 * a player whose deck is exhausted has no legal target left, so that's
 * always a forced/auto-abstain regardless of allowVoluntaryAbstain — that
 * flag only governs a player choosing to abstain while targets remain.
 */
export function validateVote(input: ValidateVoteInput): VoteValidationResult {
  const { config, voterPlayerId, targetPlayerId, sessionPlayerIds, deck } = input;
  const isDeckMode = config.mode === "DECK_UNIQUE";

  if (targetPlayerId === null) {
    if (isDeckMode && deck) {
      const canStillVote = hasAvailableTargets(deck, voterPlayerId);
      if (!canStillVote) {
        // Forced abstain: always allowed, independent of the config toggle.
        return { ok: true, isAutoAbstain: true };
      }
    }
    if (!config.allowVoluntaryAbstain) {
      return { ok: false, reason: "VOLUNTARY_ABSTAIN_DISABLED" };
    }
    return { ok: true, isAutoAbstain: false };
  }

  if (targetPlayerId === voterPlayerId) {
    return { ok: false, reason: "SELF_VOTE_NOT_ALLOWED" };
  }
  if (!sessionPlayerIds.includes(targetPlayerId)) {
    return { ok: false, reason: "TARGET_NOT_IN_SESSION" };
  }
  if (isDeckMode) {
    if (!deck || !isCardAvailable(deck, voterPlayerId, targetPlayerId)) {
      return { ok: false, reason: "CARD_ALREADY_USED" };
    }
  }

  return { ok: true, isAutoAbstain: false };
}
