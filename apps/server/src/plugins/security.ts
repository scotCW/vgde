import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { Env } from "../env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Defense-in-depth CSRF mitigation on top of the sameSite=strict session
 * cookie: mutating requests must carry a custom header (plain <form>
 * submissions and simple cross-site fetches can't add one without a
 * preflight) and, if ALLOWED_ORIGINS is configured, an allowed Origin.
 */
export default fp(async function securityPlugin(app: FastifyInstance, opts: { env: Env }) {
  const { env } = opts;

  app.addHook("onRequest", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (request.url.startsWith("/auth/oidc/")) return; // browser-navigated redirect flow

    const origin = request.headers.origin;
    if (env.ALLOWED_ORIGINS.length > 0 && origin && !env.ALLOWED_ORIGINS.includes(origin)) {
      return reply.code(403).send({ error: "ORIGIN_NOT_ALLOWED" });
    }
    if (request.headers["x-requested-with"] !== "voting-game") {
      return reply.code(403).send({ error: "MISSING_CSRF_HEADER" });
    }
  });
});
