import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import type { Env } from "../env.js";

export const SESSION_COOKIE_NAME = "vg_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createAuthSession(
  reply: FastifyReply,
  env: Env,
  userId: string,
): Promise<void> {
  const session = await prisma.authSession.create({
    data: {
      id: randomUUID(),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  reply.setCookie(SESSION_COOKIE_NAME, session.id, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    signed: true,
  });
}

export async function destroyAuthSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const cookie = request.cookies[SESSION_COOKIE_NAME];
  if (cookie) {
    const unsigned = request.unsignCookie(cookie);
    if (unsigned.valid && unsigned.value) {
      await prisma.authSession.deleteMany({ where: { id: unsigned.value } });
    }
  }
  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

export interface AuthedUser {
  id: string;
  email: string | null;
  displayNameDefault: string;
}

export async function getUserFromRequest(request: FastifyRequest): Promise<AuthedUser | null> {
  const cookie = request.cookies[SESSION_COOKIE_NAME];
  if (!cookie) return null;

  const unsigned = request.unsignCookie(cookie);
  if (!unsigned.valid || !unsigned.value) return null;

  const session = await prisma.authSession.findUnique({
    where: { id: unsigned.value },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    displayNameDefault: session.user.displayNameDefault,
  };
}
