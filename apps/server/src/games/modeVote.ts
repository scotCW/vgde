import {
  GameConfigSchema,
  GameModeSchema,
  reconcileConfigForMode,
  resolveTie,
  tallyVotes,
  type CastVote,
  type GameMode,
} from "@voting-game/shared";
import { prisma } from "../db.js";
import { GameError } from "./errors.js";
import { rooms } from "./rooms.js";

const MODE_CANDIDATES = GameModeSchema.options;

/** Host delegates the CLASSIC_COUNT / DECK_UNIQUE / FIRST_TO_N_CARDS choice to the table. */
export async function openModeVote(sessionId: string, requesterUserId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (session.hostUserId !== requesterUserId) {
    throw new GameError("NOT_HOST", "Only the host can start a mode vote", 403);
  }
  if (session.status !== "LOBBY") {
    throw new GameError("SESSION_ALREADY_STARTED", "The mode is locked once the game starts", 409);
  }
  if (session.tagVoteOpen) {
    throw new GameError("VOTE_IN_PROGRESS", "Only one lobby vote can run at a time", 409);
  }

  await prisma.$transaction([
    prisma.modeVote.deleteMany({ where: { gameSessionId: sessionId } }),
    prisma.gameSession.update({ where: { id: sessionId }, data: { modeVoteOpen: true } }),
  ]);

  rooms.broadcast(sessionId, "modevote:opened", { candidates: MODE_CANDIDATES });
}

/** Host can force an early resolution (e.g. someone's AFK) using whatever votes are in so far. */
export async function closeModeVote(sessionId: string, requesterUserId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (session.hostUserId !== requesterUserId) {
    throw new GameError("NOT_HOST", "Only the host can close a mode vote", 403);
  }
  if (!session.modeVoteOpen) {
    throw new GameError("NO_MODE_VOTE", "There's no mode vote in progress", 409);
  }
  await resolveModeVote(sessionId);
}

export async function submitModeVote(sessionId: string, voterPlayerId: string, mode: GameMode | null) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (!session.modeVoteOpen) {
    throw new GameError("NO_MODE_VOTE", "There's no mode vote in progress", 409);
  }
  const voter = session.players.find((p) => p.id === voterPlayerId);
  if (!voter) throw new GameError("NOT_A_PLAYER", "You are not a player in this session", 403);
  if (mode !== null && !MODE_CANDIDATES.includes(mode)) {
    throw new GameError("INVALID_MODE", "Not a valid game mode", 422);
  }

  await prisma.modeVote.upsert({
    where: { gameSessionId_voterPlayerId: { gameSessionId: sessionId, voterPlayerId } },
    create: { gameSessionId: sessionId, voterPlayerId, mode },
    update: { mode },
  });

  const submitted = await prisma.modeVote.count({ where: { gameSessionId: sessionId } });
  rooms.broadcast(sessionId, "modevote:progress", { submitted, total: session.players.length });

  if (submitted >= session.players.length) {
    await resolveModeVote(sessionId);
  }
}

async function resolveModeVote(sessionId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || !session.modeVoteOpen) return;

  const votes = await prisma.modeVote.findMany({ where: { gameSessionId: sessionId } });
  const castVotes: CastVote[] = votes.map((v) => ({
    voterPlayerId: v.voterPlayerId,
    targetPlayerId: v.mode,
    isAutoAbstain: false,
  }));
  const { counts, topPlayerIds } = tallyVotes(castVotes);

  // Everyone abstained (or nobody voted before the host force-closed it):
  // leave the mode exactly as it was, nothing to change.
  const outcome = resolveTie(topPlayerIds, { method: "RANDOM" });
  const winningMode = outcome.winnerPlayerId as GameMode | null;

  if (winningMode) {
    const currentConfig = GameConfigSchema.parse(session.config);
    const nextConfig = GameConfigSchema.parse(
      reconcileConfigForMode({ ...currentConfig, mode: winningMode }),
    );
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { config: nextConfig, modeVoteOpen: false },
    });
  } else {
    await prisma.gameSession.update({ where: { id: sessionId }, data: { modeVoteOpen: false } });
  }

  await prisma.modeVote.deleteMany({ where: { gameSessionId: sessionId } });

  rooms.broadcast(sessionId, "modevote:resolved", {
    mode: winningMode,
    tally: Object.fromEntries(counts),
  });
}
