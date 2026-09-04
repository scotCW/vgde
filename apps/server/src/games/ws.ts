import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { rooms } from "./rooms.js";

export default async function gameWsRoutes(app: FastifyInstance) {
  app.get("/ws/sessions/:code", { websocket: true }, async (socket, request) => {
    const { code } = request.params as { code: string };

    const origin = request.headers.origin;
    if (app.env.ALLOWED_ORIGINS.length > 0 && origin && !app.env.ALLOWED_ORIGINS.includes(origin)) {
      socket.close(4403, "origin not allowed");
      return;
    }

    if (!request.user) {
      socket.close(4401, "unauthenticated");
      return;
    }

    const session = await prisma.gameSession.findUnique({ where: { joinCode: code.toUpperCase() } });
    if (!session) {
      socket.close(4404, "session not found");
      return;
    }
    const player = await prisma.player.findUnique({
      where: { gameSessionId_userId: { gameSessionId: session.id, userId: request.user.id } },
    });
    if (!player) {
      socket.close(4403, "not a player in this session");
      return;
    }

    // Broadcast-only channel: the server never expects client -> server
    // messages here, all mutations go through the authenticated REST API.
    rooms.join(session.id, socket);
  });
}
