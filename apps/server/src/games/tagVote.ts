import { GameConfigSchema } from "@voting-game/shared";
import { prisma } from "../db.js";
import { GameError } from "./errors.js";
import { rooms } from "./rooms.js";

async function availableTags(): Promise<string[]> {
  const rows = await prisma.questionBank.findMany({ select: { tags: true } });
  return [...new Set(rows.flatMap((r) => r.tags))].sort();
}

/** Host delegates which question-bank tags to exclude to the table. */
export async function openTagVote(sessionId: string, requesterUserId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (session.hostUserId !== requesterUserId) {
    throw new GameError("NOT_HOST", "Only the host can start a category vote", 403);
  }
  if (session.status !== "LOBBY") {
    throw new GameError("SESSION_ALREADY_STARTED", "Categories are locked once the game starts", 409);
  }
  if (session.modeVoteOpen) {
    throw new GameError("VOTE_IN_PROGRESS", "Only one lobby vote can run at a time", 409);
  }

  await prisma.$transaction([
    prisma.tagVote.deleteMany({ where: { gameSessionId: sessionId } }),
    prisma.gameSession.update({ where: { id: sessionId }, data: { tagVoteOpen: true } }),
  ]);

  rooms.broadcast(sessionId, "tagvote:opened", { candidates: await availableTags() });
}

/** Host can force an early resolution (e.g. someone's AFK) using whatever votes are in so far. */
export async function closeTagVote(sessionId: string, requesterUserId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (session.hostUserId !== requesterUserId) {
    throw new GameError("NOT_HOST", "Only the host can close a category vote", 403);
  }
  if (!session.tagVoteOpen) {
    throw new GameError("NO_TAG_VOTE", "There's no category vote in progress", 409);
  }
  await resolveTagVote(sessionId);
}

export async function submitTagVote(sessionId: string, voterPlayerId: string, excludedTags: string[]) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  if (!session.tagVoteOpen) {
    throw new GameError("NO_TAG_VOTE", "There's no category vote in progress", 409);
  }
  const voter = session.players.find((p) => p.id === voterPlayerId);
  if (!voter) throw new GameError("NOT_A_PLAYER", "You are not a player in this session", 403);

  const validTags = new Set(await availableTags());
  const deduped = [...new Set(excludedTags)];
  if (!deduped.every((t) => validTags.has(t))) {
    throw new GameError("INVALID_TAG", "Not a valid question category", 422);
  }

  await prisma.tagVote.upsert({
    where: { gameSessionId_voterPlayerId: { gameSessionId: sessionId, voterPlayerId } },
    create: { gameSessionId: sessionId, voterPlayerId, excludedTags: deduped },
    update: { excludedTags: deduped },
  });

  const submitted = await prisma.tagVote.count({ where: { gameSessionId: sessionId } });
  rooms.broadcast(sessionId, "tagvote:progress", { submitted, total: session.players.length });

  if (submitted >= session.players.length) {
    await resolveTagVote(sessionId);
  }
}

/**
 * Resolution is a union, not a majority: a tag is excluded from the session
 * if even one player asked to leave it out. This is a content-comfort
 * filter (nobody should end up seeing a category they didn't want), not a
 * popularity contest — the same reasoning behind voluntary abstain always
 * being allowed elsewhere in the app.
 */
async function resolveTagVote(sessionId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || !session.tagVoteOpen) return;

  const votes = await prisma.tagVote.findMany({ where: { gameSessionId: sessionId } });
  const excludedTags = [...new Set(votes.flatMap((v) => v.excludedTags))].sort();

  const currentConfig = GameConfigSchema.parse(session.config);
  const nextConfig = GameConfigSchema.parse({ ...currentConfig, excludedTags });

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { config: nextConfig, tagVoteOpen: false },
  });
  await prisma.tagVote.deleteMany({ where: { gameSessionId: sessionId } });

  rooms.broadcast(sessionId, "tagvote:resolved", { excludedTags });
}
