import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { oidcEnabled, passwordLoginEnabled } from "../env.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createAuthSession, destroyAuthSession } from "./session.js";
import { handleOidcCallback, startOidcLogin } from "./oidc.js";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(200),
  displayName: z.string().min(1).max(40),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export default async function authRoutes(app: FastifyInstance) {
  const env = app.env;

  // AUTH_MODE=oidc_only is a hard cutover: these routes don't exist at
  // all (404, not a soft "disabled" response), so there's no local
  // credential path left to attack or accidentally leave open — including
  // for accounts that already have a password set from before the switch.
  if (passwordLoginEnabled(env)) {
    app.post(
      "/auth/register",
      { config: { rateLimit: AUTH_RATE_LIMIT } },
      async (request, reply) => {
        const body = RegisterSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "INVALID_INPUT", issues: body.error.issues });
        }
        const { email, password, displayName } = body.data;

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          return reply.code(409).send({ error: "EMAIL_IN_USE" });
        }

        const passwordHash = await hashPassword(password);
        const user = await prisma.user.create({
          data: { id: randomUUID(), email, passwordHash, displayNameDefault: displayName },
        });

        await createAuthSession(reply, env, user.id);
        return reply.code(201).send({ id: user.id, email: user.email, displayName: user.displayNameDefault });
      },
    );

    app.post(
      "/auth/login",
      { config: { rateLimit: AUTH_RATE_LIMIT } },
      async (request, reply) => {
        const body = LoginSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "INVALID_INPUT" });
        }
        const { email, password } = body.data;

        const user = await prisma.user.findUnique({ where: { email } });
        // Constant-shape response whether the account exists or not, to avoid
        // leaking which emails are registered; still verify a dummy hash so
        // the timing doesn't leak it either.
        const hashToCheck = user?.passwordHash ?? "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        const valid = await verifyPassword(hashToCheck, password);

        if (!user || !user.passwordHash || !valid) {
          return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
        }

        await createAuthSession(reply, env, user.id);
        return reply.send({ id: user.id, email: user.email, displayName: user.displayNameDefault });
      },
    );
  }

  app.post("/auth/logout", async (request, reply) => {
    await destroyAuthSession(request, reply);
    return reply.code(204).send();
  });

  app.get("/auth/config", async (_request, reply) => {
    return reply.send({ oidcEnabled: oidcEnabled(env), passwordLoginEnabled: passwordLoginEnabled(env) });
  });

  app.get("/me", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "UNAUTHENTICATED" });
    return reply.send(request.user);
  });

  if (oidcEnabled(env)) {
    app.get("/auth/oidc/start", async (request, reply) => startOidcLogin(request, reply, env));
    app.get("/auth/oidc/callback", async (request, reply) => handleOidcCallback(request, reply, env));
  }
}
