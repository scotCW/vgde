import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getUserFromRequest, type AuthedUser } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthedUser | null;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("user", null);

  app.addHook("onRequest", async (request: FastifyRequest) => {
    request.user = await getUserFromRequest(request);
  });
});

// Must be async (or take a `done` callback): Fastify's hook runner treats a
// plain synchronous 2-arg hook's return value as "should be a promise" and
// otherwise never advances — a non-async version of this function hangs
// every request through it forever, whether or not the check even fails.
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    await reply.code(401).send({ error: "UNAUTHENTICATED" });
  }
}
