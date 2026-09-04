import type { WebSocket } from "ws";

/**
 * Minimal broadcast-only room manager: one room per game session. Chosen
 * over a library like Socket.IO to keep the realtime surface small and
 * auditable — this app only ever needs server -> room fanout, never
 * client -> client messaging.
 */
class RoomManager {
  private rooms = new Map<string, Set<WebSocket>>();

  join(sessionId: string, socket: WebSocket): void {
    let room = this.rooms.get(sessionId);
    if (!room) {
      room = new Set();
      this.rooms.set(sessionId, room);
    }
    room.add(socket);
    socket.once("close", () => this.leave(sessionId, socket));
  }

  leave(sessionId: string, socket: WebSocket): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    room.delete(socket);
    if (room.size === 0) this.rooms.delete(sessionId);
  }

  broadcast(sessionId: string, event: string, payload: unknown): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    const message = JSON.stringify({ event, payload });
    for (const socket of room) {
      if (socket.readyState === socket.OPEN) socket.send(message);
    }
  }
}

export const rooms = new RoomManager();
