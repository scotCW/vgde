import { randomUUID } from "node:crypto";
import { GameConfigSchema, resolveRunoffTally, type CastVote } from "@voting-game/shared";
import { prisma } from "../db.js";
import { GameError } from "./errors.js";
import { rooms } from "./rooms.js";
import { applyResolvedQuestion, maybeAdvanceBatch } from "./reveal.js";

/**
 * Runoff votes are always open to abstain regardless of the session's
 * allowVoluntaryAbstain toggle — that flag governs the primary vote, not
 * this tie-break formality — and never touch a Deck Mode vote-card.
 */
export async function submitTieBreakVote(
  sessionId: string,
  tieBreakRoundId: string,
  voterPlayerId: string,
  targetPlayerId: string | null,
) {
  const round = await prisma.tieBreakRound.findUnique({
    where: { id: tieBreakRoundId },
    include: { sessionQuestion: true },
  });
  if (!round || round.sessionQuestion.gameSessionId !== sessionId) {
    throw new GameError("TIEBREAK_NOT_FOUND", "Tie-break round not found", 404);
  }
  if (round.resolved) {
    throw new GameError("TIEBREAK_ALREADY_RESOLVED", "This tie-break has already resolved", 409);
  }

  if (targetPlayerId !== null && !round.candidatePlayerIds.includes(targetPlayerId)) {
    throw new GameError(
      "INVALID_TIEBREAK_TARGET",
      "You can only vote for one of the tied candidates",
      422,
    );
  }

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (!session.players.some((p) => p.id === voterPlayerId)) {
    throw new GameError("NOT_A_PLAYER", "You are not a player in this session", 403);
  }

  await prisma.tieBreakVote.upsert({
    where: { tieBreakRoundId_voterPlayerId: { tieBreakRoundId, voterPlayerId } },
    create: { id: randomUUID(), tieBreakRoundId, voterPlayerId, targetPlayerId },
    update: { targetPlayerId },
  });

  const voteCount = await prisma.tieBreakVote.count({ where: { tieBreakRoundId } });
  if (voteCount < session.players.length) return; // still waiting on other players

  const votes = await prisma.tieBreakVote.findMany({ where: { tieBreakRoundId } });
  const castVotes: CastVote[] = votes.map((v) => ({
    voterPlayerId: v.voterPlayerId,
    targetPlayerId: v.targetPlayerId,
    isAutoAbstain: false,
  }));

  const config = GameConfigSchema.parse(session.config);
  const runoffFallback = config.tieBreak.runoffFallback ?? "NO_AWARD";
  const { winnerPlayerId } = resolveRunoffTally(castVotes, runoffFallback);

  await prisma.tieBreakRound.update({
    where: { id: tieBreakRoundId },
    data: { resolved: true, winnerPlayerId },
  });

  rooms.broadcast(sessionId, "tiebreak:resolved", {
    sessionQuestionId: round.sessionQuestionId,
    winnerPlayerId,
  });

  await applyResolvedQuestion(round.sessionQuestionId, sessionId, config, winnerPlayerId);
  await maybeAdvanceBatch(sessionId);
}
