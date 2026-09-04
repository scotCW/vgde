import { randomUUID } from "node:crypto";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_CLASSIC_CONFIG,
  GameConfigSchema,
  MIN_PLAYERS,
  generateDeck,
  generateJoinCode,
  drawQuestions,
  filterQuestionsByTags,
  questionCountForMode,
  reconcileConfigForMode,
  type GameConfig,
} from "@voting-game/shared";
import { prisma } from "../db.js";
import { GameError } from "./errors.js";
import { rooms } from "./rooms.js";

export async function createGameSession(hostUserId: string, hostDisplayName: string) {
  let joinCode = generateJoinCode();
  // Extremely unlikely to collide, but retry a few times just in case.
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await prisma.gameSession.findUnique({ where: { joinCode } });
    if (!clash) break;
    joinCode = generateJoinCode();
  }

  const session = await prisma.gameSession.create({
    data: {
      id: randomUUID(),
      joinCode,
      hostUserId,
      config: DEFAULT_CLASSIC_CONFIG,
      players: {
        create: {
          id: randomUUID(),
          userId: hostUserId,
          displayName: hostDisplayName,
          isConfigurator: true,
        },
      },
    },
    include: { players: true },
  });

  return session;
}

export async function joinGameSession(joinCode: string, userId: string, displayName: string) {
  const session = await prisma.gameSession.findUnique({ where: { joinCode } });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "No session with that join code", 404);
  if (session.status !== "LOBBY") {
    throw new GameError("SESSION_ALREADY_STARTED", "This game has already started", 409);
  }

  const existing = await prisma.player.findUnique({
    where: { gameSessionId_userId: { gameSessionId: session.id, userId } },
  });
  if (existing) return { session, player: existing };

  const player = await prisma.player.create({
    data: { id: randomUUID(), gameSessionId: session.id, userId, displayName },
  });

  rooms.broadcast(session.id, "player:joined", {
    playerId: player.id,
    displayName: player.displayName,
  });

  return { session, player };
}

export async function updateGameConfig(
  sessionId: string,
  requesterUserId: string,
  partialConfig: unknown,
): Promise<GameConfig> {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (session.hostUserId !== requesterUserId) {
    throw new GameError("NOT_HOST", "Only the host can change the configuration", 403);
  }
  if (session.status !== "LOBBY") {
    throw new GameError("SESSION_ALREADY_STARTED", "Configuration is locked once the game starts", 409);
  }
  if (session.modeVoteOpen || session.tagVoteOpen) {
    throw new GameError(
      "VOTE_IN_PROGRESS",
      "Settings are locked until the lobby vote resolves",
      409,
    );
  }

  const merged = reconcileConfigForMode({
    ...(session.config as GameConfig),
    ...(partialConfig as Partial<GameConfig>),
  });
  const parsed = GameConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new GameError("INVALID_CONFIG", parsed.error.issues.map((i) => i.message).join("; "));
  }

  await prisma.gameSession.update({ where: { id: sessionId }, data: { config: parsed.data } });
  rooms.broadcast(sessionId, "config:updated", parsed.data);
  return parsed.data;
}

export async function startGameSession(sessionId: string, requesterUserId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (session.hostUserId !== requesterUserId) {
    throw new GameError("NOT_HOST", "Only the host can start the game", 403);
  }
  if (session.status !== "LOBBY") {
    throw new GameError("SESSION_ALREADY_STARTED", "Game already started", 409);
  }
  if (session.modeVoteOpen || session.tagVoteOpen) {
    throw new GameError("VOTE_IN_PROGRESS", "Resolve the lobby vote before starting", 409);
  }
  if (session.players.length < MIN_PLAYERS) {
    throw new GameError(
      "NOT_ENOUGH_PLAYERS",
      `Need at least ${MIN_PLAYERS} players to start`,
    );
  }

  const config = GameConfigSchema.parse(session.config);
  const playerIds = session.players.map((p) => p.id);

  const bankQuestions = filterQuestionsByTags(await prisma.questionBank.findMany(), config.excludedTags);
  const eligibleCount = bankQuestions.length;
  const batchCount =
    config.mode === "FIRST_TO_N_CARDS"
      ? Math.min(config.batchSize ?? DEFAULT_BATCH_SIZE, eligibleCount)
      : questionCountForMode(config, playerIds.length);
  if (batchCount === null) {
    throw new GameError("INVALID_CONFIG", "Could not determine question count");
  }
  if (batchCount > eligibleCount) {
    throw new GameError(
      "NOT_ENOUGH_QUESTIONS",
      `${eligibleCount} questions match the current filters but ${batchCount} are needed`,
    );
  }

  const drawn = drawQuestions(
    bankQuestions.map((q) => ({ id: q.id, text: q.text })),
    batchCount,
  );

  await prisma.$transaction(async (tx) => {
    await tx.sessionQuestion.createMany({
      data: drawn.map((q, i) => ({
        id: randomUUID(),
        gameSessionId: sessionId,
        questionId: q.id,
        orderIndex: i,
        status: "VOTING",
      })),
    });

    if (config.mode === "DECK_UNIQUE") {
      const deck = generateDeck(playerIds);
      await tx.voteCard.createMany({
        data: deck.map((c) => ({
          id: randomUUID(),
          gameSessionId: sessionId,
          ownerPlayerId: c.ownerPlayerId,
          targetPlayerId: c.targetPlayerId,
        })),
      });
    }

    await tx.gameSession.update({
      where: { id: sessionId },
      data: { status: "VOTING", startedAt: new Date() },
    });
  });

  rooms.broadcast(sessionId, "game:started", { questionCount: drawn.length });
}
