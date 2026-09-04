import type { VoteCardRef } from "../types.js";

/**
 * Deck Mode: every player gets exactly one vote-card per other player.
 * Consuming a card against a target is what enforces "can't vote for the
 * same person twice."
 */
export function generateDeck(playerIds: string[]): VoteCardRef[] {
  const deck: VoteCardRef[] = [];
  for (const owner of playerIds) {
    for (const target of playerIds) {
      if (owner === target) continue;
      deck.push({ ownerPlayerId: owner, targetPlayerId: target, usedAt: null });
    }
  }
  return deck;
}

/**
 * How many of a player's questions are guaranteed to have no valid
 * target left, given a deck of `deckSize` cards and `questionCount`
 * questions — i.e. questions beyond what the deck can possibly cover.
 *
 * In Deck Mode specifically, `deckSize` is always `playerCount - 1` and
 * `questionCount` is always `playerCount` (see `questionCountForMode`),
 * so this is always exactly 1 for every player, every game, regardless
 * of how many people are playing — it's not a rare edge case that shows
 * up only with small groups, it's a structural property of the mode
 * itself. That forced abstain is always allowed (see `voteValidation.ts`)
 * so nothing breaks, but a host who disables voluntary abstaining
 * expecting *zero* abstentions needs to know this can't be achieved —
 * this function exists so that can be surfaced explicitly instead of
 * discovered mid-game.
 */
export function guaranteedForcedAbstainCount(questionCount: number, deckSize: number): number {
  return Math.max(0, questionCount - deckSize);
}

export function remainingTargets(deck: VoteCardRef[], ownerPlayerId: string): string[] {
  return deck
    .filter((c) => c.ownerPlayerId === ownerPlayerId && c.usedAt === null)
    .map((c) => c.targetPlayerId);
}

export function hasAvailableTargets(deck: VoteCardRef[], ownerPlayerId: string): boolean {
  return remainingTargets(deck, ownerPlayerId).length > 0;
}

export function isCardAvailable(
  deck: VoteCardRef[],
  ownerPlayerId: string,
  targetPlayerId: string,
): boolean {
  return deck.some(
    (c) =>
      c.ownerPlayerId === ownerPlayerId &&
      c.targetPlayerId === targetPlayerId &&
      c.usedAt === null,
  );
}

/** Returns a new deck array with the matching card marked used (immutable). */
export function consumeCard(
  deck: VoteCardRef[],
  ownerPlayerId: string,
  targetPlayerId: string,
  usedAt: Date = new Date(),
): VoteCardRef[] {
  let consumed = false;
  const next = deck.map((c) => {
    if (
      !consumed &&
      c.ownerPlayerId === ownerPlayerId &&
      c.targetPlayerId === targetPlayerId &&
      c.usedAt === null
    ) {
      consumed = true;
      return { ...c, usedAt };
    }
    return c;
  });
  if (!consumed) {
    throw new Error(
      `No available vote-card for owner=${ownerPlayerId} target=${targetPlayerId}`,
    );
  }
  return next;
}
