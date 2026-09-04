import { describe, expect, it } from "vitest";
import {
  consumeCard,
  generateDeck,
  hasAvailableTargets,
  isCardAvailable,
  remainingTargets,
} from "./deck.js";

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
