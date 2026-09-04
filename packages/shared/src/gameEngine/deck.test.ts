import { describe, expect, it } from "vitest";
import {
  consumeCard,
  generateDeck,
  guaranteedForcedAbstainCount,
  hasAvailableTargets,
  isCardAvailable,
  remainingTargets,
} from "./deck.js";
import { questionCountForMode } from "./questionDraw.js";
import { validateVote } from "./voteValidation.js";
import { DEFAULT_DECK_CONFIG } from "../gameConfig.js";

describe("generateDeck", () => {
  it("creates one card per ordered (owner, target) pair, no self-targets", () => {
    const deck = generateDeck(["a", "b", "c"]);
    expect(deck).toHaveLength(6);
    expect(deck.some((c) => c.ownerPlayerId === c.targetPlayerId)).toBe(false);
    expect(remainingTargets(deck, "a").sort()).toEqual(["b", "c"]);
  });
});

describe("consumeCard / hasAvailableTargets", () => {
  it("removes exactly one card from availability and leaves others untouched", () => {
    let deck = generateDeck(["a", "b", "c"]);
    expect(isCardAvailable(deck, "a", "b")).toBe(true);

    deck = consumeCard(deck, "a", "b");
    expect(isCardAvailable(deck, "a", "b")).toBe(false);
    expect(isCardAvailable(deck, "a", "c")).toBe(true);
    expect(hasAvailableTargets(deck, "a")).toBe(true);
  });

  it("throws if the card was already used or never existed", () => {
    let deck = generateDeck(["a", "b"]);
    deck = consumeCard(deck, "a", "b");
    expect(() => consumeCard(deck, "a", "b")).toThrow();
  });

  it("reports no available targets once every card for an owner is used", () => {
    let deck = generateDeck(["a", "b", "c"]);
    deck = consumeCard(deck, "a", "b");
    deck = consumeCard(deck, "a", "c");
    expect(hasAvailableTargets(deck, "a")).toBe(false);
    // Other players are unaffected.
    expect(hasAvailableTargets(deck, "b")).toBe(true);
  });
});

describe("guaranteedForcedAbstainCount", () => {
  it("is zero when the deck covers every question", () => {
    expect(guaranteedForcedAbstainCount(5, 5)).toBe(0);
    expect(guaranteedForcedAbstainCount(5, 10)).toBe(0);
  });

  it("counts exactly the shortfall between questions and deck size", () => {
    expect(guaranteedForcedAbstainCount(10, 7)).toBe(3);
  });

  // The actual invariant this check exists for: Deck Mode always draws
  // `playerCount` questions but deals `playerCount - 1` cards per player
  // (questionCountForMode's DECK_UNIQUE case). That's guaranteed to be a
  // 1-question shortfall for every player, in every Deck Mode game, no
  // matter how many people are playing — not a rare case that only shows
  // up with a small group.
  it("is always exactly 1 for Deck Mode's actual math, at any player count", () => {
    for (const playerCount of [3, 4, 5, 10, 50, 200]) {
      const questionCount = questionCountForMode(DEFAULT_DECK_CONFIG, playerCount)!;
      const deckSize = playerCount - 1;
      expect(guaranteedForcedAbstainCount(questionCount, deckSize)).toBe(1);
    }
  });
});

describe("forced abstain end-to-end (voluntary abstain disabled)", () => {
  // Proves the guarantee above doesn't just hold arithmetically — that a
  // player who votes on every question they still have a card for
  // legitimately reaches a validateVote(null) call that's accepted as a
  // forced abstain on their last question, even with the host's
  // "allowVoluntaryAbstain: false" toggle in effect the whole time.
  it.each([3, 4, 6, 10])(
    "every player is correctly forced to abstain on exactly their last question (%i players)",
    (playerCount) => {
      const players = Array.from({ length: playerCount }, (_, i) => `p${i}`);
      const config = { ...DEFAULT_DECK_CONFIG, allowVoluntaryAbstain: false };
      const questionCount = questionCountForMode(config, playerCount)!;
      let deck = generateDeck(players);

      for (const voter of players) {
        let autoAbstainCount = 0;
        for (let q = 0; q < questionCount; q++) {
          const targets = remainingTargets(deck, voter);
          const target = targets[0] ?? null;

          const result = validateVote({
            config,
            voterPlayerId: voter,
            targetPlayerId: target,
            sessionPlayerIds: players,
            deck,
          });
          expect(result.ok).toBe(true);
          if (!result.ok) continue;

          if (target !== null) {
            deck = consumeCard(deck, voter, target);
            expect(result.isAutoAbstain).toBe(false);
          } else {
            autoAbstainCount++;
            expect(result.isAutoAbstain).toBe(true);
          }
        }
        // Exactly one forced abstain per player: playerCount - 1 cards
        // covers all but one of the playerCount questions.
        expect(autoAbstainCount).toBe(1);
      }
    },
  );
});
