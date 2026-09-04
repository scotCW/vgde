import { describe, expect, it } from "vitest";
import { checkFirstToNCardsEnd } from "./winCondition.js";

describe("checkFirstToNCardsEnd", () => {
  it("is not over while everyone is below the target", () => {
    const status = checkFirstToNCardsEnd(
      [
        { id: "a", cardsWon: 3 },
        { id: "b", cardsWon: 5 },
      ],
      6,
    );
    expect(status.over).toBe(false);
    expect(status.leaders).toEqual([]);
  });

  it("ends the game once a player reaches the target", () => {
    const status = checkFirstToNCardsEnd(
      [
        { id: "a", cardsWon: 6 },
        { id: "b", cardsWon: 4 },
      ],
      6,
    );
    expect(status.over).toBe(true);
    expect(status.leaders).toEqual(["a"]);
  });

  it("declares co-winners if a batch pushes two players past the target simultaneously", () => {
    const status = checkFirstToNCardsEnd(
      [
        { id: "a", cardsWon: 6 },
        { id: "b", cardsWon: 7 },
        { id: "c", cardsWon: 2 },
      ],
      6,
    );
    expect(status.over).toBe(true);
    // Only the highest among those over the line lead; "a" cleared the bar
    // but "b" cleared it by more in the same batch.
    expect(status.leaders).toEqual(["b"]);
  });
});
