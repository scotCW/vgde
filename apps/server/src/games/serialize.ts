import { GameConfigSchema } from "@voting-game/shared";
import { prisma } from "../db.js";
import { hasAvailableTargets, remainingTargets } from "@voting-game/shared";

/**
 * Everything sent to a client is shaped here. This is the anonymity
 * boundary: a Vote's targetPlayerId is never serialized except as part of
 * an aggregate tally (counts per target, no voter identity) after a
 * question is finalized.
 */
export async function serializeSessionForPlayer(sessionId: string, requestingPlayerId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) return null;
  const config = GameConfigSchema.parse(session.config);

  let myModeVoteStatus: { voted: boolean; mode: string | null } | null = null;
  if (session.modeVoteOpen) {
    const vote = await prisma.modeVote.findUnique({
      where: { gameSessionId_voterPlayerId: { gameSessionId: sessionId, voterPlayerId: requestingPlayerId } },
    });
    // vote.mode null means "voted to abstain" — distinct from vote === null,
    // which means this player hasn't submitted anything yet.
    myModeVoteStatus = vote ? { voted: true, mode: vote.mode } : { voted: false, mode: null };
  }

  let myTagVoteStatus: { voted: boolean; excludedTags: string[] } | null = null;
  if (session.tagVoteOpen) {
    const vote = await prisma.tagVote.findUnique({
      where: { gameSessionId_voterPlayerId: { gameSessionId: sessionId, voterPlayerId: requestingPlayerId } },
    });
    myTagVoteStatus = vote
      ? { voted: true, excludedTags: vote.excludedTags }
      : { voted: false, excludedTags: [] };
  }

  return {
    id: session.id,
    joinCode: session.joinCode,
    status: session.status,
    hostUserId: session.hostUserId,
    config,
    modeVoteOpen: session.modeVoteOpen,
    tagVoteOpen: session.tagVoteOpen,
    // null when no vote is currently open.
    myModeVoteStatus,
    myTagVoteStatus,
    players: session.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isConfigurator: p.isConfigurator,
      cardsWon: p.cardsWon,
      isMe: p.id === requestingPlayerId,
    })),
  };
}

export async function serializeVotingQuestionsForPlayer(sessionId: string, playerId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) return [];
  const config = GameConfigSchema.parse(session.config);

  const questions = await prisma.sessionQuestion.findMany({
    where: { gameSessionId: sessionId, status: "VOTING" },
    include: { question: true, votes: { where: { voterPlayerId: playerId } } },
    orderBy: { orderIndex: "asc" },
  });

  let deck: { ownerPlayerId: string; targetPlayerId: string; usedAt: Date | null }[] | null = null;
  if (config.mode === "DECK_UNIQUE") {
    deck = await prisma.voteCard.findMany({ where: { gameSessionId: sessionId } });
  }

  return questions.map((q) => {
    const myVote = q.votes[0] ?? null;
    return {
      sessionQuestionId: q.id,
      text: q.question.text,
      orderIndex: q.orderIndex,
      myVote: myVote ? { targetPlayerId: myVote.targetPlayerId, isAutoAbstain: myVote.isAutoAbstain } : null,
      availableTargetPlayerIds: deck ? remainingTargets(deck, playerId) : null,
      hasAvailableTargets: deck ? hasAvailableTargets(deck, playerId) : null,
    };
  });
}

export async function serializeResults(sessionId: string) {
  const revealed = await prisma.sessionQuestion.findMany({
    where: { gameSessionId: sessionId, status: "REVEALED" },
    include: { question: true, votes: true },
    orderBy: { orderIndex: "asc" },
  });

  return revealed.map((q) => {
    const counts = new Map<string, number>();
    for (const v of q.votes) {
      if (v.targetPlayerId) counts.set(v.targetPlayerId, (counts.get(v.targetPlayerId) ?? 0) + 1);
    }
    return {
      sessionQuestionId: q.id,
      text: q.question.text,
      orderIndex: q.orderIndex,
      tally: Object.fromEntries(counts),
      winnerPlayerId: q.winnerPlayerId,
      revealedAt: q.revealedAt,
    };
  });
}
