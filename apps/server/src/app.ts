import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ZodError } from "zod";
import { loadEnv, type Env } from "./env.js";
import authPlugin from "./auth/plugin.js";
import securityPlugin from "./plugins/security.js";
import authRoutes from "./auth/routes.js";
import gameRoutes from "./games/routes.js";
import gameWsRoutes from "./games/ws.js";
import { GameError } from "./games/errors.js";

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(envOverride?: Env) {
  const env = envOverride ?? loadEnv();

  const app = Fastify({
    logger:
      env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty" } }
        : true,
    trustProxy: true,
  });

  app.decorate("env", env);

  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });
  await app.register(rateLimit, { global: false });
  await app.register(websocket);
  await app.register(authPlugin);
  await app.register(securityPlugin, { env });

  await app.register(authRoutes);
  await app.register(gameRoutes);
  await app.register(gameWsRoutes);

  // Serves the built SPA in production so the whole app is one process.
  const webDist = path.join(__dirname, "../../web/dist");
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/auth") && !request.url.startsWith("/sessions") && !request.url.startsWith("/me")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "NOT_FOUND" });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof GameError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    // Duck-typed alongside instanceof: zod's package has shipped versions
    // whose top-level export and its own thrown errors don't reliably pass
    // `instanceof ZodError` (see zod's "3.25.x is actually a v4 compat
    // shim" transition) — this must not silently fall through to 500 for
    // routine input validation failures.
    if (error instanceof ZodError || (error && (error as { name?: string }).name === "ZodError")) {
      const issues = error instanceof ZodError ? error.issues : (error as { issues?: unknown }).issues;
      return reply.code(400).send({ error: "INVALID_INPUT", issues });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "INTERNAL_ERROR" });
  });

  return app;
}
