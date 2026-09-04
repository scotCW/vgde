import type { Question, RngFn } from "../types.js";
import type { GameConfig } from "../gameConfig.js";

/** Fisher-Yates shuffle, using an injectable RNG so tests are deterministic. */
export function shuffle<T>(items: T[], rng: RngFn = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

/**
 * Removes any question carrying one of the session's excluded tags (e.g. a
 * host filtering out "nsfw" or "alcohol"). An empty exclusion list is a
 * no-op — every question stays in the pool.
 */
export function filterQuestionsByTags<T extends { tags: string[] }>(
  questions: T[],
  excludedTags: string[],
): T[] {
  if (excludedTags.length === 0) return questions;
  const excluded = new Set(excludedTags);
  return questions.filter((q) => !q.tags.some((t) => excluded.has(t)));
}

/**
 * Draws `count` unique questions from the bank for one session. No repeats
 * within a session; the same question may appear in other sessions.
 */
export function drawQuestions(
  bank: Question[],
  count: number,
  rng: RngFn = Math.random,
): Question[] {
  if (count > bank.length) {
    throw new Error(
      `Requested ${count} questions but bank only has ${bank.length}`,
    );
  }
  return shuffle(bank, rng).slice(0, count);
}

/**
 * How many questions the session draws up front. FIRST_TO_N_CARDS has no
 * fixed total (it runs in batches until the win condition is met), so this
 * returns null for that mode.
 */
export function questionCountForMode(
  config: GameConfig,
  playerCount: number,
): number | null {
  switch (config.mode) {
    case "CLASSIC_COUNT":
      // Schema guarantees questionCount is set for this mode.
      return config.questionCount!;
    case "DECK_UNIQUE":
      return playerCount;
    case "FIRST_TO_N_CARDS":
      return null;
  }
}
