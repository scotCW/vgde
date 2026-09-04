import type { PlayerRef } from "../types.js";

export interface FirstToNCardsStatus {
  over: boolean;
  /**
   * Players who have reached the target. Normally a single id; can hold
   * more than one if a batch reveal pushes two+ players past the threshold
   * at once, since batching means we can't order who "got there first"
   * within the same batch — they're declared co-winners.
   */
  leaders: string[];
}

export function checkFirstToNCardsEnd(
  players: PlayerRef[],
  targetCards: number,
): FirstToNCardsStatus {
  const leaders = players.filter((p) => p.cardsWon >= targetCards);
  if (leaders.length === 0) {
    return { over: false, leaders: [] };
  }
  const maxCards = Math.max(...leaders.map((p) => p.cardsWon));
  return {
    over: true,
    leaders: leaders.filter((p) => p.cardsWon === maxCards).map((p) => p.id),
  };
}
