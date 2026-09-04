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

/**
 * A question is eligible for a game hosted by `hostUserId` if it's a
 * built-in bank question (createdByUserId null) or a custom card that
 * particular host created — custom cards are private to their creator,
 * never mixed into anyone else's game or the public bank browse.
 */
export function questionEligibilityWhere(hostUserId: string) {
  return { OR: [{ createdByUserId: null }, { createdByUserId: hostUserId }] };
}

const MY_GAMES_LIMIT = 50;

/**
 * Every game a user is (or was) a player in, most recently created first —
 * lets someone get back into a game without needing to remember its join
 * code, whether it's still going (to check on slow players) or long since
 * finished (to see the results again).
 */
export async function listMyGames(userId: string) {
  const players = await prisma.player.findMany({
    where: { userId, hiddenFromMyGames: false },
    include: { gameSession: { include: { _count: { select: { players: true } } } } },
    orderBy: { gameSession: { createdAt: "desc" } },
    take: MY_GAMES_LIMIT,
  });
  return players.map((p) => ({
    joinCode: p.gameSession.joinCode,
    status: p.gameSession.status,
    isHost: p.gameSession.hostUserId === userId,
    playerCount: p.gameSession._count.players,
    createdAt: p.gameSession.createdAt,
  }));
}

/**
 * Removes one game from this user's own "My games" list. Purely a view
 * preference on their Player row — the game itself, and every other
 * player's access to it, are untouched, nobody gets kicked. The one
 * exception: if the *host* does this on a game still in LOBBY, the other
 * players (if any are actually there) get a heads-up over the socket that
 * the host has removed it on their side — useful context, since the host
 * disappearing on an unstarted lobby usually means it isn't going anywhere.
 */
export async function hideGameFromMyList(joinCode: string, userId: string) {
  const session = await prisma.gameSession.findUnique({ where: { joinCode } });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  const player = await prisma.player.findUnique({
    where: { gameSessionId_userId: { gameSessionId: session.id, userId } },
  });
  if (!player) throw new GameError("NOT_A_PLAYER", "You are not a player in this session", 403);

  await prisma.player.update({ where: { id: player.id }, data: { hiddenFromMyGames: true } });

  if (session.hostUserId === userId && session.status === "LOBBY") {
    const othersCount = await prisma.player.count({
      where: { gameSessionId: session.id, id: { not: player.id } },
    });
    if (othersCount > 0) {
      rooms.broadcast(session.id, "host:removed_game", {});
    }
  }
}

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

  const bankQuestions = filterQuestionsByTags(
    await prisma.questionBank.findMany({ where: questionEligibilityWhere(requesterUserId) }),
    config.excludedTags,
  );
  const eligibleCount = bankQuestions.length;
  if (eligibleCount === 0) {
    // FIRST_TO_N_CARDS clamps its batch size down to whatever's eligible
    // (see below) rather than refusing to start on a small bank — but
    // clamping down to zero would start a game with no questions to vote
    // on at all, so that one case still needs an explicit refusal.
    throw new GameError("NOT_ENOUGH_QUESTIONS", "No questions match the current filters");
  }
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
        text: q.text,
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
