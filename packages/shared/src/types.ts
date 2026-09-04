export interface PlayerRef {
  id: string;
  cardsWon: number;
}

export interface Question {
  id: string;
  text: string;
}

/** A single vote-card in Deck Mode: owner may target this player exactly once. */
export interface VoteCardRef {
  ownerPlayerId: string;
  targetPlayerId: string;
  usedAt: Date | null;
}

export interface CastVote {
  voterPlayerId: string;
  targetPlayerId: string | null;
  isAutoAbstain: boolean;
}

export type RngFn = () => number;
