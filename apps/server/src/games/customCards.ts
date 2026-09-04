import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { GameError } from "./errors.js";

export const CUSTOM_CARD_TEXT_MAX = 500;
export const CUSTOM_CARD_TAGS_MAX = 10;
export const CUSTOM_CARD_TAG_LENGTH_MAX = 30;
export const CUSTOM_CARD_IMPORT_MAX = 500;
export const CUSTOM_CARD_EXPORT_VERSION = 1;

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

/**
 * A portable snapshot of one user's custom cards — just text+tags, no ids
 * or ownership, so it means the same thing re-imported into anyone else's
 * account. Lets a group share a homemade deck without needing one
 * designated host who happens to hold the only copy of it.
 */
export async function exportMyCustomCards(userId: string) {
  const cards = await prisma.questionBank.findMany({
    where: { createdByUserId: userId },
    select: { text: true, tags: true },
    orderBy: { createdAt: "asc" },
  });
  return { version: CUSTOM_CARD_EXPORT_VERSION, cards };
}

/**
 * Bulk-adds cards to the importer's own custom bank, skipping anything
 * that's an exact text match for a card they already have — re-importing
 * the same file (or importing from someone who imported from you) doesn't
 * pile up duplicates.
 */
export async function importCustomCards(userId: string, cards: { text: string; tags: string[] }[]) {
  const existing = new Set(
    (await prisma.questionBank.findMany({ where: { createdByUserId: userId }, select: { text: true } })).map(
      (c) => c.text,
    ),
  );

  const seenInThisImport = new Set<string>();
  const toCreate = cards
    .map((c) => ({ text: c.text.trim(), tags: normalizeTags(c.tags) }))
    .filter((c) => c.text.length > 0)
    .filter((c) => {
      if (existing.has(c.text) || seenInThisImport.has(c.text)) return false;
      seenInThisImport.add(c.text);
      return true;
    });

  if (toCreate.length > 0) {
    await prisma.questionBank.createMany({
      data: toCreate.map((c) => ({ id: randomUUID(), text: c.text, tags: c.tags, createdByUserId: userId })),
    });
  }

  return { imported: toCreate.length, skipped: cards.length - toCreate.length };
}
