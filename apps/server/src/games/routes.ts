import type { FastifyInstance, FastifyReply } from "fastify";
import { z, type ZodType } from "zod";
import { GameModeSchema } from "@voting-game/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/plugin.js";
import { GameError } from "./errors.js";
import {
  createGameSession,
  joinGameSession,
  startGameSession,
  updateGameConfig,
} from "./service.js";
import { submitVote } from "./voting.js";
import { submitTieBreakVote } from "./tiebreak.js";
import { revealNextQuestion } from "./reveal.js";
import { closeModeVote, openModeVote, submitModeVote } from "./modeVote.js";
import { closeTagVote, openTagVote, submitTagVote } from "./tagVote.js";
import {
  serializeResults,
  serializeSessionForPlayer,
  serializeVotingQuestionsForPlayer,
} from "./serialize.js";

const VOTE_RATE_LIMIT = { max: 60, timeWindow: "1 minute" };

const QUESTIONS_PAGE_SIZE_DEFAULT = 50;
const QUESTIONS_PAGE_SIZE_MAX = 100;

const QuestionsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  // Comma-separated tag list, OR-matched — mirrors the tag-filter UI.
  tags: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((t) => t.trim()).filter(Boolean) : [])),
  limit: z.coerce.number().int().min(1).max(QUESTIONS_PAGE_SIZE_MAX).default(QUESTIONS_PAGE_SIZE_DEFAULT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Validates a request body and sends a 400 directly on failure, returning
 * null so the caller can just `return` — deliberately not `.parse()` +
 * relying on the global error handler for ZodError: some versions of zod
 * ship errors that don't reliably identify as ZodError once they cross a
 * plugin boundary (see app.ts's error handler comment), which turned this
 * into a 500 instead of a 400 in practice. safeParse + an inline response
 * sidesteps that entirely.
 */
function parseBody<T>(reply: FastifyReply, schema: ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    reply.code(400).send({ error: "INVALID_INPUT", issues: result.error.issues });
    return null;
  }
  return result.data;
}

async function loadSessionAndPlayer(joinCode: string, userId: string) {
  const session = await prisma.gameSession.findUnique({ where: { joinCode } });
  if (!session) throw new GameError("SESSION_NOT_FOUND", "Session not found", 404);
  const player = await prisma.player.findUnique({
    where: { gameSessionId_userId: { gameSessionId: session.id, userId } },
  });
  if (!player) throw new GameError("NOT_A_PLAYER", "You are not a player in this session", 403);
  return { session, player };
}

export default async function gameRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/questions/tags", async (_request, reply) => {
    const rows = await prisma.questionBank.findMany({ select: { tags: true } });
    const tags = [...new Set(rows.flatMap((r) => r.tags))].sort();
    return reply.send({ tags });
  });

  // No question text — just enough for the client to locally compute how
  // many questions survive a given set of excluded tags, using the same
  // filterQuestionsByTags used server-side, so the "not enough questions"
  // warning matches what starting the game will actually enforce.
  app.get("/questions/bank-summary", async (_request, reply) => {
    const rows = await prisma.questionBank.findMany({ select: { id: true, tags: true } });
    return reply.send(rows);
  });

  // Full text, for browsing the bank outside of any game session. Paginated
  // and filtered server-side — the bank is seed data today (193 rows), but
  // browsing shouldn't assume that stays small, so this never loads more
  // than one page's worth into memory or over the wire.
  app.get("/questions", async (request, reply) => {
    const query = parseBody(reply, QuestionsQuerySchema, request.query);
    if (query === null) return;
    const { search, tags, limit, offset } = query;

    const where = {
      ...(search ? { text: { contains: search, mode: "insensitive" as const } } : {}),
      ...(tags.length > 0 ? { tags: { hasSome: tags } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.questionBank.findMany({
        where,
        select: { id: true, text: true, tags: true },
        orderBy: { text: "asc" },
        skip: offset,
        take: limit,
      }),
      prisma.questionBank.count({ where }),
    ]);

    return reply.send({ items, total, limit, offset });
  });

  app.post("/sessions", async (request, reply) => {
    const session = await createGameSession(request.user!.id, request.user!.displayNameDefault);
    return reply.code(201).send({ joinCode: session.joinCode, id: session.id });
  });

  app.post("/sessions/:code/join", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = parseBody(
      reply,
      z.object({ displayName: z.string().min(1).max(40).optional() }),
      request.body ?? {},
    );
    if (body === null) return;
    const { session, player } = await joinGameSession(
      code.toUpperCase(),
      request.user!.id,
      body.displayName ?? request.user!.displayNameDefault,
    );
    return reply.code(200).send({ sessionId: session.id, playerId: player.id });
  });

  app.get("/sessions/:code", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { session, player } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
    const dto = await serializeSessionForPlayer(session.id, player.id);
    return reply.send(dto);
  });

  app.patch("/sessions/:code/config", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { session } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
    const config = await updateGameConfig(session.id, request.user!.id, request.body);
    return reply.send(config);
  });

  app.post("/sessions/:code/mode-vote/open", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { session } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
    await openModeVote(session.id, request.user!.id);
    return reply.code(204).send();
  });

  app.post("/sessions/:code/mode-vote/close", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { session } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
    await closeModeVote(session.id, request.user!.id);
    return reply.code(204).send();
  });

  app.post(
    "/sessions/:code/mode-vote",
    { config: { rateLimit: VOTE_RATE_LIMIT } },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = parseBody(reply, z.object({ mode: GameModeSchema.nullable() }), request.body);
      if (body === null) return;
      const { session, player } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
      await submitModeVote(session.id, player.id, body.mode);
      return reply.code(204).send();
    },
  );

  app.post("/sessions/:code/tag-vote/open", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { session } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
    await openTagVote(session.id, request.user!.id);
    return reply.code(204).send();
  });

  app.post("/sessions/:code/tag-vote/close", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { session } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
    await closeTagVote(session.id, request.user!.id);
    return reply.code(204).send();
  });

  app.post(
    "/sessions/:code/tag-vote",
    { config: { rateLimit: VOTE_RATE_LIMIT } },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = parseBody(reply, z.object({ excludedTags: z.array(z.string()).max(50) }), request.body);
      if (body === null) return;
      const { session, player } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
      await submitTagVote(session.id, player.id, body.excludedTags);
      return reply.code(204).send();
    },
  );

  app.post("/sessions/:code/start", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { session } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
    await startGameSession(session.id, request.user!.id);
    return reply.code(204).send();
  });

  app.get("/sessions/:code/questions", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { session, player } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
    const questions = await serializeVotingQuestionsForPlayer(session.id, player.id);
    return reply.send(questions);
  });

  app.post(
    "/sessions/:code/votes",
    { config: { rateLimit: VOTE_RATE_LIMIT } },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = parseBody(
        reply,
        z.object({ sessionQuestionId: z.string().uuid(), targetPlayerId: z.string().uuid().nullable() }),
        request.body,
      );
      if (body === null) return;
      const { session, player } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
      await submitVote(session.id, body.sessionQuestionId, player.id, body.targetPlayerId);
      return reply.code(204).send();
    },
  );

  app.post(
    "/sessions/:code/tiebreak/:roundId/vote",
    { config: { rateLimit: VOTE_RATE_LIMIT } },
    async (request, reply) => {
      const { code, roundId } = request.params as { code: string; roundId: string };
      const body = parseBody(reply, z.object({ targetPlayerId: z.string().uuid().nullable() }), request.body);
      if (body === null) return;
      const { session, player } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
      await submitTieBreakVote(session.id, roundId, player.id, body.targetPlayerId);
      return reply.code(204).send();
    },
  );

  app.post("/sessions/:code/reveal/next", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { session } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
    await revealNextQuestion(session.id, request.user!.id);
    return reply.code(204).send();
  });

  app.get("/sessions/:code/results", async (request, reply) => {
    const { code } = request.params as { code: string };
    const { session } = await loadSessionAndPlayer(code.toUpperCase(), request.user!.id);
    const results = await serializeResults(session.id);
    return reply.send(results);
  });
}
