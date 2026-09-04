import type { GameConfig } from "@voting-game/shared";

export interface PlayerDto {
  id: string;
  displayName: string;
  isConfigurator: boolean;
  cardsWon: number;
  isMe: boolean;
}

export interface SessionDto {
  id: string;
  joinCode: string;
  status: "LOBBY" | "VOTING" | "COMPLETED";
  // null once the host has deleted their account after a game completed —
  // see the server's schema comments on GameSession.hostUserId.
  hostUserId: string | null;
  config: GameConfig;
  modeVoteOpen: boolean;
  tagVoteOpen: boolean;
  /** null when no vote is currently open; mode is null within it only if this player voted to abstain. */
  myModeVoteStatus: { voted: boolean; mode: GameConfig["mode"] | null } | null;
  /** null when no vote is currently open. */
  myTagVoteStatus: { voted: boolean; excludedTags: string[] } | null;
  players: PlayerDto[];
}

export interface QuestionBankSummaryItem {
  id: string;
  tags: string[];
}

export interface CustomCardDto {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
}

export interface QuestionDto {
  id: string;
  text: string;
  tags: string[];
}

export interface PaginatedQuestions {
  items: QuestionDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface VotingQuestionDto {
  sessionQuestionId: string;
  text: string;
  orderIndex: number;
  myVote: { targetPlayerId: string | null; isAutoAbstain: boolean } | null;
  availableTargetPlayerIds: string[] | null;
  hasAvailableTargets: boolean | null;
}

export interface ResultDto {
  sessionQuestionId: string;
  text: string;
  orderIndex: number;
  tally: Record<string, number>;
  winnerPlayerId: string | null;
  revealedAt: string | null;
}

export type { GameConfig };
