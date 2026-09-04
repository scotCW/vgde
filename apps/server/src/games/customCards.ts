import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { GameError } from "./errors.js";

export const CUSTOM_CARD_TEXT_MAX = 500;
export const CUSTOM_CARD_TAGS_MAX = 10;
export const CUSTOM_CARD_TAG_LENGTH_MAX = 30;

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

export async function listMyCustomCards(userId: string) {
  return prisma.questionBank.findMany({
    where: { createdByUserId: userId },
    select: { id: true, text: true, tags: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCustomCard(userId: string, text: string, tags: string[]) {
  return prisma.questionBank.create({
    data: {
      id: randomUUID(),
      text: text.trim(),
      tags: normalizeTags(tags),
      createdByUserId: userId,
    },
    select: { id: true, text: true, tags: true, createdAt: true },
  });
}

async function requireOwnedCard(userId: string, cardId: string) {
  const card = await prisma.questionBank.findUnique({ where: { id: cardId } });
  if (!card || card.createdByUserId !== userId) {
    // Same 404 whether it doesn't exist or belongs to someone else —
    // custom cards are private, so their existence shouldn't leak either.
    throw new GameError("CARD_NOT_FOUND", "No custom card with that id", 404);
  }
  return card;
}

export async function updateCustomCard(userId: string, cardId: string, text: string, tags: string[]) {
  await requireOwnedCard(userId, cardId);
  return prisma.questionBank.update({
    where: { id: cardId },
    data: { text: text.trim(), tags: normalizeTags(tags) },
    select: { id: true, text: true, tags: true, createdAt: true },
  });
}

export async function deleteCustomCard(userId: string, cardId: string) {
  await requireOwnedCard(userId, cardId);
  await prisma.questionBank.delete({ where: { id: cardId } });
}
