import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { GameError } from "../games/errors.js";
import { destroyAuthSession } from "./session.js";

/**
 * Deletes a user's account and everything tied to it: OIDC identities,
 * sessions, and custom cards (cascade). Blocked while they're a player in
 * any non-completed game — the host is always a player too, so this covers
 * both cases — since removing them mid-game would either soft-lock the
 * lobby (host-only actions with no host left) or corrupt Deck Mode's
 * fixed-player-count math. Completed games are unaffected either way:
 * Player.userId / GameSession.hostUserId just go null, leaving displayName
 * and cardsWon (and everyone else's results) intact.
 */
export async function deleteAccount(request: FastifyRequest, reply: FastifyReply, userId: string) {
  const activeGame = await prisma.player.findFirst({
    where: { userId, gameSession: { status: { not: "COMPLETED" } } },
    include: { gameSession: { select: { joinCode: true } } },
  });
  if (activeGame) {
    throw new GameError(
      "ACTIVE_GAME",
      `Leave or finish game ${activeGame.gameSession.joinCode} before deleting your account`,
      409,
    );
  }

  await prisma.user.delete({ where: { id: userId } });
  await destroyAuthSession(request, reply);
}
