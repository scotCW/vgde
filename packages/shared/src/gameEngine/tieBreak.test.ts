import { describe, expect, it } from "vitest";
import { resolveRunoffTally, resolveTie } from "./tieBreak.js";
import type { CastVote } from "../types.js";

const fixedRng = (value: number) => () => value;

describe("resolveTie", () => {
  it("declares the sole top vote-getter the winner with no tie-break needed", () => {
    const outcome = resolveTie(["x"], { method: "NO_AWARD" });
    expect(outcome).toEqual({ winnerPlayerId: "x", needsRunoff: false, candidates: [] });
  });

  it("NO_AWARD gives no winner on a tie", () => {
    const outcome = resolveTie(["x", "y"], { method: "NO_AWARD" });
    expect(outcome.winnerPlayerId).toBeNull();
    expect(outcome.needsRunoff).toBe(false);
  });

  it("RANDOM deterministically picks based on the injected rng", () => {
    const outcome = resolveTie(["x", "y", "z"], { method: "RANDOM" }, fixedRng(0.5));
    // rng()=0.5 over 3 candidates -> index 1
    expect(outcome.winnerPlayerId).toBe("y");
  });

  it("RUNOFF defers to a second vote and returns the tied candidates", () => {
    const outcome = resolveTie(
      ["x", "y"],
      { method: "RUNOFF", runoffFallback: "NO_AWARD" },
      fixedRng(0),
    );
    expect(outcome).toEqual({
      winnerPlayerId: null,
      needsRunoff: true,
      candidates: ["x", "y"],
    });
  });
});

describe("resolveRunoffTally", () => {
  function vote(voter: string, target: string | null): CastVote {
    return { voterPlayerId: voter, targetPlayerId: target, isAutoAbstain: false };
  }

  it("resolves a clean runoff winner", () => {
    const result = resolveRunoffTally(
      [vote("a", "x"), vote("b", "x"), vote("c", "y")],
      "NO_AWARD",
    );
    expect(result.winnerPlayerId).toBe("x");
  });

  it("falls back to NO_AWARD on a repeated tie, never recursing into another runoff", () => {
    const result = resolveRunoffTally([vote("a", "x"), vote("b", "y")], "NO_AWARD");
    expect(result.winnerPlayerId).toBeNull();
  });

  it("falls back to RANDOM on a repeated tie when configured", () => {
    const result = resolveRunoffTally(
      [vote("a", "x"), vote("b", "y")],
      "RANDOM",
      fixedRng(0),
    );
    expect(result.winnerPlayerId).toBe("x");
  });
});
