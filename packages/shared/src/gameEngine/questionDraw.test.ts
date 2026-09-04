import { describe, expect, it } from "vitest";
import { drawQuestions, filterQuestionsByTags, questionCountForMode } from "./questionDraw.js";
import { DEFAULT_CLASSIC_CONFIG, DEFAULT_DECK_CONFIG } from "../gameConfig.js";
import type { Question } from "../types.js";

function bank(n: number): Question[] {
  return Array.from({ length: n }, (_, i) => ({ id: `q${i}`, text: `Question ${i}` }));
}

describe("drawQuestions", () => {
  it("draws the requested count with no duplicates", () => {
    const drawn = drawQuestions(bank(20), 10);
    expect(drawn).toHaveLength(10);
    expect(new Set(drawn.map((q) => q.id)).size).toBe(10);
  });

  it("throws if the bank is smaller than the requested count", () => {
    expect(() => drawQuestions(bank(3), 10)).toThrow();
  });
});

describe("filterQuestionsByTags", () => {
  const tagged = [
    { id: "a", tags: ["silly"] },
    { id: "b", tags: ["nsfw"] },
    { id: "c", tags: ["silly", "alcohol"] },
    { id: "d", tags: [] },
  ];

  it("is a no-op with no excluded tags", () => {
    expect(filterQuestionsByTags(tagged, [])).toBe(tagged);
  });

  it("drops any question carrying an excluded tag", () => {
    const result = filterQuestionsByTags(tagged, ["nsfw"]);
    expect(result.map((q) => q.id)).toEqual(["a", "c", "d"]);
  });

  it("drops a question matching any of several excluded tags", () => {
    const result = filterQuestionsByTags(tagged, ["nsfw", "alcohol"]);
    expect(result.map((q) => q.id)).toEqual(["a", "d"]);
  });
});

describe("questionCountForMode", () => {
  it("uses the configured questionCount for CLASSIC_COUNT", () => {
    expect(questionCountForMode({ ...DEFAULT_CLASSIC_CONFIG, questionCount: 25 }, 4)).toBe(25);
  });

  it("uses the player count for DECK_UNIQUE", () => {
    expect(questionCountForMode(DEFAULT_DECK_CONFIG, 7)).toBe(7);
  });

  it("has no fixed count for FIRST_TO_N_CARDS", () => {
    expect(
      questionCountForMode({ ...DEFAULT_DECK_CONFIG, mode: "FIRST_TO_N_CARDS" }, 5),
    ).toBeNull();
  });
});
