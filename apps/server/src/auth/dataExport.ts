import { prisma } from "../db.js";

export const DATA_EXPORT_VERSION = 1;

/**
 * Everything tied to a user's account, in one downloadable bundle: the
 * account itself (no password hash — never export secrets), linked OIDC
 * identities, custom cards, every game they've played in, and every vote
 * they personally cast. Votes are otherwise never exposed with voter
 * identity to *other* players — exporting your own vote history to
 * yourself doesn't touch that guarantee, you already know what you voted.
 */
export async function exportAllMyData(userId: string) {
  const account = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, displayNameDefault: true, createdAt: true },
  });

  const oidcIdentities = await prisma.oidcIdentity.findMany({
    where: { userId },
    select: { issuer: true, subject: true, linkedAt: true },
  });

  const customCards = await prisma.questionBank.findMany({
    where: { createdByUserId: userId },
    select: { text: true, tags: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const players = await prisma.player.findMany({
    where: { userId },
    include: {
      gameSession: {
        select: { joinCode: true, status: true, hostUserId: true, createdAt: true, completedAt: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const playerIds = players.map((p) => p.id);
  const votes = playerIds.length
    ? await prisma.vote.findMany({
        where: { voterPlayerId: { in: playerIds } },
        include: { sessionQuestion: { select: { text: true, gameSessionId: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const joinCodeByGameSessionId = new Map(players.map((p) => [p.gameSessionId, p.gameSession.joinCode]));
  const targetIds = [...new Set(votes.map((v) => v.targetPlayerId).filter((id): id is string => id !== null))];
  const targetNameById = new Map(
    targetIds.length
      ? (
          await prisma.player.findMany({ where: { id: { in: targetIds } }, select: { id: true, displayName: true } })
        ).map((t) => [t.id, t.displayName] as const)
      : [],
  );

  return {
    version: DATA_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    account,
    oidcIdentities,
    customCards,
    games: players.map((p) => ({
      joinCode: p.gameSession.joinCode,
      status: p.gameSession.status,
      isHost: p.gameSession.hostUserId === userId,
      displayName: p.displayName,
      cardsWon: p.cardsWon,
      joinedAt: p.joinedAt,
      gameCreatedAt: p.gameSession.createdAt,
      gameCompletedAt: p.gameSession.completedAt,
    })),
    votes: votes.map((v) => ({
      joinCode: joinCodeByGameSessionId.get(v.sessionQuestion.gameSessionId) ?? null,
      questionText: v.sessionQuestion.text,
      // null = abstained (voluntary or auto) rather than picked someone.
      target: v.targetPlayerId ? (targetNameById.get(v.targetPlayerId) ?? null) : null,
      isAutoAbstain: v.isAutoAbstain,
      createdAt: v.createdAt,
    })),
  };
}
