import { randomUUID } from "node:crypto";
import { GameConfigSchema, validateVote, type VoteCardRef } from "@voting-game/shared";
import { prisma } from "../db.js";
import { GameError } from "./errors.js";
import { rooms } from "./rooms.js";
import { finalizeBatchIfComplete } from "./reveal.js";

export async function submitVote(
  sessionId: string,
  sessionQuestionId: string,
  voterPlayerId: string,
  targetPlayerId: string | null,
) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (session.status !== "VOTING") {
    throw new GameError("NOT_VOTING", "This session is not currently accepting votes", 409);
  }

  const voter = session.players.find((p) => p.id === voterPlayerId);
  if (!voter) throw new GameError("NOT_A_PLAYER", "You are not a player in this session", 403);

  const sessionQuestion = await prisma.sessionQuestion.findUnique({
    where: { id: sessionQuestionId },
  });
  if (!sessionQuestion || sessionQuestion.gameSessionId !== sessionId) {
    throw new GameError("QUESTION_NOT_FOUND", "Question not found in this session", 404);
  }
  if (sessionQuestion.status !== "VOTING") {
    throw new GameError("QUESTION_NOT_OPEN", "This question is not open for voting", 409);
  }

  const config = GameConfigSchema.parse(session.config);
  const sessionPlayerIds = session.players.map((p) => p.id);

  let deck: VoteCardRef[] | undefined;
  if (config.mode === "DECK_UNIQUE") {
    const cards = await prisma.voteCard.findMany({ where: { gameSessionId: sessionId } });
    deck = cards.map((c) => ({
      ownerPlayerId: c.ownerPlayerId,
      targetPlayerId: c.targetPlayerId,
      usedAt: c.usedAt,
    }));
  }

  const result = validateVote({
    config,
    voterPlayerId,
    targetPlayerId,
    sessionPlayerIds,
    deck,
  });
  if (!result.ok) {
    throw new GameError(result.reason, `Vote rejected: ${result.reason}`, 422);
  }

  const existingVote = await prisma.vote.findUnique({
    where: { sessionQuestionId_voterPlayerId: { sessionQuestionId, voterPlayerId } },
  });

  await prisma.$transaction(async (tx) => {
    // Deck Mode: release the previously-consumed card if the player is
    // changing their answer before the batch closes.
    if (config.mode === "DECK_UNIQUE" && existingVote?.targetPlayerId) {
      await tx.voteCard.updateMany({
        where: {
          gameSessionId: sessionId,
          ownerPlayerId: voterPlayerId,
          targetPlayerId: existingVote.targetPlayerId,
        },
        data: { usedAt: null, usedOnSessionQuestionId: null },
      });
    }

    await tx.vote.upsert({
      where: { sessionQuestionId_voterPlayerId: { sessionQuestionId, voterPlayerId } },
      create: {
        id: randomUUID(),
        sessionQuestionId,
        voterPlayerId,
        targetPlayerId,
        isAutoAbstain: result.isAutoAbstain,
      },
      update: { targetPlayerId, isAutoAbstain: result.isAutoAbstain },
    });

    if (config.mode === "DECK_UNIQUE" && targetPlayerId) {
      const updated = await tx.voteCard.updateMany({
        where: {
          gameSessionId: sessionId,
          ownerPlayerId: voterPlayerId,
          targetPlayerId,
          usedAt: null,
        },
        data: { usedAt: new Date(), usedOnSessionQuestionId: sessionQuestionId },
      });
      if (updated.count === 0) {
        throw new GameError("CARD_ALREADY_USED", "That vote-card was already used", 409);
      }
    }
  });

  await broadcastVoteProgress(sessionId);
  await finalizeBatchIfComplete(sessionId);
}

async function broadcastVoteProgress(sessionId: string) {
  const votingQuestions = await prisma.sessionQuestion.findMany({
    where: { gameSessionId: sessionId, status: "VOTING" },
    select: { id: true },
  });
  const playerCount = await prisma.player.count({ where: { gameSessionId: sessionId } });
  const votesSubmitted = await prisma.vote.count({
    where: { sessionQuestionId: { in: votingQuestions.map((q) => q.id) } },
  });
  const total = playerCount * votingQuestions.length;

  rooms.broadcast(sessionId, "vote:progress", { submitted: votesSubmitted, total });
}
