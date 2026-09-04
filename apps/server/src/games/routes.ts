import type { FastifyInstance, FastifyReply } from "fastify";
import { z, type ZodType } from "zod";
import { GameModeSchema } from "@voting-game/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/plugin.js";
import { GameError } from "./errors.js";
import {
  createGameSession,
  joinGameSession,
  questionEligibilityWhere,
  startGameSession,
  updateGameConfig,
} from "./service.js";
import {
  CUSTOM_CARD_IMPORT_MAX,
  CUSTOM_CARD_TAGS_MAX,
  CUSTOM_CARD_TAG_LENGTH_MAX,
  CUSTOM_CARD_TEXT_MAX,
  createCustomCard,
  deleteCustomCard,
  exportMyCustomCards,
  importCustomCards,
  listMyCustomCards,
  updateCustomCard,
} from "./customCards.js";
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

  // Every read here is scoped to "the built-in bank, plus my own custom
  // cards" — custom cards are private to their creator (see
  // questionEligibilityWhere), so this is the same eligibility a game this
  // user hosts would actually draw from.

  app.get("/questions/tags", async (request, reply) => {
    const rows = await prisma.questionBank.findMany({
      where: questionEligibilityWhere(request.user!.id),
      select: { tags: true },
    });
    const tags = [...new Set(rows.flatMap((r) => r.tags))].sort();
    return reply.send({ tags });
  });

  // No question text — just enough for the client to locally compute how
  // many questions survive a given set of excluded tags, using the same
  // filterQuestionsByTags used server-side, so the "not enough questions"
  // warning matches what starting the game will actually enforce.
  app.get("/questions/bank-summary", async (request, reply) => {
    const rows = await prisma.questionBank.findMany({
      where: questionEligibilityWhere(request.user!.id),
      select: { id: true, tags: true },
    });
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
      ...questionEligibilityWhere(request.user!.id),
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

  const CustomCardBodySchema = z.object({
    text: z.string().trim().min(1).max(CUSTOM_CARD_TEXT_MAX),
    tags: z.array(z.string().trim().min(1).max(CUSTOM_CARD_TAG_LENGTH_MAX)).max(CUSTOM_CARD_TAGS_MAX).default([]),
  });

  // A user's own custom cards, private to them — never mixed into the
  // public /questions browse above or shown to anyone else.
  app.get("/questions/custom", async (request, reply) => {
    const cards = await listMyCustomCards(request.user!.id);
    return reply.send(cards);
  });

  app.post("/questions/custom", async (request, reply) => {
    const body = parseBody(reply, CustomCardBodySchema, request.body);
    if (body === null) return;
    const card = await createCustomCard(request.user!.id, body.text, body.tags);
    return reply.code(201).send(card);
  });

  app.patch("/questions/custom/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = parseBody(reply, CustomCardBodySchema, request.body);
    if (body === null) return;
    const card = await updateCustomCard(request.user!.id, id, body.text, body.tags);
    return reply.send(card);
  });

  app.delete("/questions/custom/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await deleteCustomCard(request.user!.id, id);
    return reply.code(204).send();
  });

  // A portable {version, cards} snapshot — download it, hand the file to
  // someone else, they import it into their own account. No shared host
  // needed just because one person happened to write the deck.
  app.get("/questions/custom/export", async (request, reply) => {
    const bundle = await exportMyCustomCards(request.user!.id);
    return reply.send(bundle);
  });

  const ImportBodySchema = z.object({
    cards: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(CUSTOM_CARD_TEXT_MAX),
          tags: z.array(z.string().trim().max(CUSTOM_CARD_TAG_LENGTH_MAX)).max(CUSTOM_CARD_TAGS_MAX).default([]),
        }),
      )
      .min(1)
      .max(CUSTOM_CARD_IMPORT_MAX),
  });

  app.post("/questions/custom/import", async (request, reply) => {
    const body = parseBody(reply, ImportBodySchema, request.body);
    if (body === null) return;
    const result = await importCustomCards(request.user!.id, body.cards);
    return reply.send(result);
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
