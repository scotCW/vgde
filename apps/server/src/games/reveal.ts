import { randomUUID } from "node:crypto";
import {
  GameConfigSchema,
  checkFirstToNCardsEnd,
  drawQuestions,
  filterQuestionsByTags,
  resolveTie,
  tallyVotes,
  type CastVote,
} from "@voting-game/shared";
import { prisma } from "../db.js";
import { GameError } from "./errors.js";
import { rooms } from "./rooms.js";
import { questionEligibilityWhere } from "./service.js";

/**
 * Called after every vote is recorded. If every currently-open question in
 * this session has a vote from every player, tallies each one — this is
 * what makes voting "all at once, at your own pace" instead of round-based:
 * nothing happens until the whole batch is in.
 */
export async function finalizeBatchIfComplete(sessionId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) return;

  const votingQuestions = await prisma.sessionQuestion.findMany({
    where: { gameSessionId: sessionId, status: "VOTING" },
  });
  if (votingQuestions.length === 0) return;

  const playerCount = session.players.length;
  for (const q of votingQuestions) {
    const voteCount = await prisma.vote.count({ where: { sessionQuestionId: q.id } });
    if (voteCount < playerCount) return; // batch still in progress
  }

  const config = GameConfigSchema.parse(session.config);
  for (const q of votingQuestions) {
    await finalizeQuestion(q.id, sessionId, config);
  }

  await maybeAdvanceBatch(sessionId);
}

/**
 * Tallies one question's votes and either resolves a winner or kicks off a
 * tie-break runoff. Shared by the main-vote path above and the tie-break
 * vote path (tiebreak.ts) once a runoff's votes are all in.
 */
export async function finalizeQuestion(
  sessionQuestionId: string,
  sessionId: string,
  config: ReturnType<typeof GameConfigSchema.parse>,
) {
  const votes = await prisma.vote.findMany({ where: { sessionQuestionId } });
  const castVotes: CastVote[] = votes.map((v) => ({
    voterPlayerId: v.voterPlayerId,
    targetPlayerId: v.targetPlayerId,
    isAutoAbstain: v.isAutoAbstain,
  }));
  const { topPlayerIds } = tallyVotes(castVotes);
  const outcome = resolveTie(topPlayerIds, config.tieBreak);

  if (outcome.needsRunoff) {
    const question = await prisma.sessionQuestion.findUniqueOrThrow({
      where: { id: sessionQuestionId },
    });
    const tieBreakRoundId = randomUUID();
    await prisma.$transaction([
      prisma.tieBreakRound.create({
        data: {
          id: tieBreakRoundId,
          sessionQuestionId,
          roundIndex: 0,
          candidatePlayerIds: outcome.candidates,
        },
      }),
      prisma.sessionQuestion.update({
        where: { id: sessionQuestionId },
        data: { status: "TIE_BREAK" },
      }),
    ]);
    rooms.broadcast(sessionId, "tiebreak:started", {
      sessionQuestionId,
      tieBreakRoundId,
      text: question.text,
      candidatePlayerIds: outcome.candidates,
    });
    return;
  }

  await applyResolvedQuestion(sessionQuestionId, sessionId, config, outcome.winnerPlayerId);
}

export async function applyResolvedQuestion(
  sessionQuestionId: string,
  sessionId: string,
  config: ReturnType<typeof GameConfigSchema.parse>,
  winnerPlayerId: string | null,
) {
  const revealNow = config.revealMode === "ALL_AT_ONCE";

  await prisma.$transaction(async (tx) => {
    if (winnerPlayerId) {
      await tx.player.update({
        where: { id: winnerPlayerId },
        data: { cardsWon: { increment: 1 } },
      });
    }
    await tx.sessionQuestion.update({
      where: { id: sessionQuestionId },
      data: {
        winnerPlayerId,
        status: revealNow ? "REVEALED" : "TALLIED",
        revealedAt: revealNow ? new Date() : null,
      },
    });
  });

  if (revealNow) {
    await broadcastReveal(sessionQuestionId, sessionId);
  }
}

async function broadcastReveal(sessionQuestionId: string, sessionId: string) {
  const sq = await prisma.sessionQuestion.findUnique({
    where: { id: sessionQuestionId },
    include: { votes: true },
  });
  if (!sq) return;

  const castVotes: CastVote[] = sq.votes.map((v) => ({
    voterPlayerId: v.voterPlayerId,
    targetPlayerId: v.targetPlayerId,
    isAutoAbstain: v.isAutoAbstain,
  }));
  const { counts } = tallyVotes(castVotes);

  rooms.broadcast(sessionId, "question:revealed", {
    sessionQuestionId,
    text: sq.text,
    orderIndex: sq.orderIndex,
    tally: Object.fromEntries(counts),
    winnerPlayerId: sq.winnerPlayerId,
  });
}

/** Host-triggered reveal for ONE_AT_A_TIME_SYNCED: shows the next tallied question to everyone at once. */
export async function revealNextQuestion(sessionId: string, requesterUserId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (session.hostUserId !== requesterUserId) {
    throw new GameError("NOT_HOST", "Only the host can reveal the next question", 403);
  }

  const next = await prisma.sessionQuestion.findFirst({
    where: { gameSessionId: sessionId, status: "TALLIED" },
    orderBy: { orderIndex: "asc" },
  });
  if (!next) throw new GameError("NOTHING_TO_REVEAL", "Nothing is waiting to be revealed", 409);

  await prisma.sessionQuestion.update({
    where: { id: next.id },
    data: { status: "REVEALED", revealedAt: new Date() },
  });
  await broadcastReveal(next.id, sessionId);
  await maybeAdvanceBatch(sessionId);
}

/**
 * Once a batch has nothing left in VOTING or TIE_BREAK (and, for the synced
 * reveal mode, nothing left TALLIED-but-unrevealed either), decides what
 * happens next: draw another batch (FIRST_TO_N_CARDS, if no one's won yet),
 * or end the game.
 */
export async function maybeAdvanceBatch(sessionId: string) {
  const pending = await prisma.sessionQuestion.count({
    where: { gameSessionId: sessionId, status: { in: ["VOTING", "TIE_BREAK"] } },
  });
  if (pending > 0) return;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) return;
  const config = GameConfigSchema.parse(session.config);

  if (config.revealMode === "ONE_AT_A_TIME_SYNCED") {
    const stillTallied = await prisma.sessionQuestion.count({
      where: { gameSessionId: sessionId, status: "TALLIED" },
    });
    if (stillTallied > 0) {
      rooms.broadcast(sessionId, "batch:ready_to_reveal", {});
      return; // waiting on the host to click through reveals
    }
  }

  if (config.mode !== "FIRST_TO_N_CARDS") {
    await completeGame(sessionId, session.players);
    return;
  }

  const status = checkFirstToNCardsEnd(session.players, config.targetCards ?? 6);
  if (status.over) {
    await completeGame(sessionId, session.players, status.leaders);
    return;
  }

  const usedQuestionIds = (
    await prisma.sessionQuestion.findMany({
      where: { gameSessionId: sessionId },
      select: { questionId: true },
    })
  )
    .map((q) => q.questionId)
    .filter((id): id is string => id !== null);

  // hostUserId only ever goes null on a COMPLETED session (account
  // deletion is blocked while hosting a non-completed one) — a batch is
  // only ever advanced mid-game, so it's still a real user here.
  const eligibility = session.hostUserId
    ? questionEligibilityWhere(session.hostUserId)
    : { createdByUserId: null };
  const remainingBank = filterQuestionsByTags(
    await prisma.questionBank.findMany({ where: { id: { notIn: usedQuestionIds }, ...eligibility } }),
    config.excludedTags,
  );
  const batchSize = Math.min(config.batchSize ?? 5, remainingBank.length);

  if (batchSize === 0) {
    // Question bank exhausted before anyone hit the target — end the game
    // with whoever has the most cards rather than stalling forever.
    const max = Math.max(...session.players.map((p) => p.cardsWon));
    const leaders = session.players.filter((p) => p.cardsWon === max).map((p) => p.id);
    await completeGame(sessionId, session.players, leaders);
    return;
  }

  const drawn = drawQuestions(
    remainingBank.map((q) => ({ id: q.id, text: q.text })),
    batchSize,
  );
  const startIndex = usedQuestionIds.length;
  await prisma.sessionQuestion.createMany({
    data: drawn.map((q, i) => ({
      id: randomUUID(),
      gameSessionId: sessionId,
      questionId: q.id,
      text: q.text,
      orderIndex: startIndex + i,
      status: "VOTING",
    })),
  });
  rooms.broadcast(sessionId, "batch:started", { questionCount: drawn.length });
}

async function completeGame(
  sessionId: string,
  players: { id: string; displayName: string; cardsWon: number }[],
  leaders: string[] = [],
) {
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  const finalLeaders =
    leaders.length > 0
      ? leaders
      : (() => {
          const max = Math.max(...players.map((p) => p.cardsWon));
          return players.filter((p) => p.cardsWon === max).map((p) => p.id);
        })();

  rooms.broadcast(sessionId, "game:completed", {
    standings: players
      .map((p) => ({ playerId: p.id, displayName: p.displayName, cardsWon: p.cardsWon }))
      .sort((a, b) => b.cardsWon - a.cardsWon),
    winnerPlayerIds: finalLeaders,
  });
}
