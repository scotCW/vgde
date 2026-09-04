import { describe, expect, it } from "vitest";
import { DEFAULT_CLASSIC_CONFIG, DEFAULT_DECK_CONFIG } from "../gameConfig.js";
import { consumeCard, generateDeck } from "./deck.js";
import { validateVote } from "./voteValidation.js";

describe("validateVote — Classic Count", () => {
  const players = ["a", "b", "c"];

  it("allows voting for another player", () => {
    const result = validateVote({
      config: DEFAULT_CLASSIC_CONFIG,
      voterPlayerId: "a",
      targetPlayerId: "b",
      sessionPlayerIds: players,
    });
    expect(result).toEqual({ ok: true, isAutoAbstain: false });
  });

  it("allows voluntary abstain by default", () => {
    const result = validateVote({
      config: DEFAULT_CLASSIC_CONFIG,
      voterPlayerId: "a",
      targetPlayerId: null,
      sessionPlayerIds: players,
    });
    expect(result).toEqual({ ok: true, isAutoAbstain: false });
  });

  it("rejects self-votes", () => {
    const result = validateVote({
      config: DEFAULT_CLASSIC_CONFIG,
      voterPlayerId: "a",
      targetPlayerId: "a",
      sessionPlayerIds: players,
    });
    expect(result).toEqual({ ok: false, reason: "SELF_VOTE_NOT_ALLOWED" });
  });

  it("rejects a target outside the session", () => {
    const result = validateVote({
      config: DEFAULT_CLASSIC_CONFIG,
      voterPlayerId: "a",
      targetPlayerId: "ghost",
      sessionPlayerIds: players,
    });
    expect(result).toEqual({ ok: false, reason: "TARGET_NOT_IN_SESSION" });
  });

  it("permits repeat votes for the same target across questions (no deck restriction)", () => {
    const first = validateVote({
      config: DEFAULT_CLASSIC_CONFIG,
      voterPlayerId: "a",
      targetPlayerId: "b",
      sessionPlayerIds: players,
    });
    const second = validateVote({
      config: DEFAULT_CLASSIC_CONFIG,
      voterPlayerId: "a",
      targetPlayerId: "b",
      sessionPlayerIds: players,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });
});

describe("validateVote — Deck Mode", () => {
  const players = ["a", "b", "c"];

  it("rejects a target whose card was already consumed", () => {
    let deck = generateDeck(players);
    deck = consumeCard(deck, "a", "b");

    const result = validateVote({
      config: DEFAULT_DECK_CONFIG,
      voterPlayerId: "a",
      targetPlayerId: "b",
      sessionPlayerIds: players,
      deck,
    });
    expect(result).toEqual({ ok: false, reason: "CARD_ALREADY_USED" });
  });

  it("allows a target whose card is still available", () => {
    let deck = generateDeck(players);
    deck = consumeCard(deck, "a", "b");

    const result = validateVote({
      config: DEFAULT_DECK_CONFIG,
      voterPlayerId: "a",
      targetPlayerId: "c",
      sessionPlayerIds: players,
      deck,
    });
    expect(result).toEqual({ ok: true, isAutoAbstain: false });
  });

  it("forces auto-abstain once a player's deck is exhausted, even with voluntary abstain disabled", () => {
    let deck = generateDeck(players);
    deck = consumeCard(deck, "a", "b");
    deck = consumeCard(deck, "a", "c");

    const config = { ...DEFAULT_DECK_CONFIG, allowVoluntaryAbstain: false };
    const result = validateVote({
      config,
      voterPlayerId: "a",
      targetPlayerId: null,
      sessionPlayerIds: players,
      deck,
    });
    expect(result).toEqual({ ok: true, isAutoAbstain: true });
  });

  it("rejects a voluntary abstain (targets still available) when the host disabled it", () => {
    const deck = generateDeck(players);
    const config = { ...DEFAULT_DECK_CONFIG, allowVoluntaryAbstain: false };

    const result = validateVote({
      config,
      voterPlayerId: "a",
      targetPlayerId: null,
      sessionPlayerIds: players,
      deck,
    });
    expect(result).toEqual({ ok: false, reason: "VOLUNTARY_ABSTAIN_DISABLED" });
  });

  it("allows voluntary abstain with targets still available when the host permits it", () => {
    const deck = generateDeck(players);
    const result = validateVote({
      config: DEFAULT_DECK_CONFIG,
      voterPlayerId: "a",
      targetPlayerId: null,
      sessionPlayerIds: players,
      deck,
    });
    expect(result).toEqual({ ok: true, isAutoAbstain: false });
  });
});
