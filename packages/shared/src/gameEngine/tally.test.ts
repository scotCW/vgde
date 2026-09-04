import { describe, expect, it } from "vitest";
import { tallyVotes } from "./tally.js";
import type { CastVote } from "../types.js";

function vote(voter: string, target: string | null, isAutoAbstain = false): CastVote {
  return { voterPlayerId: voter, targetPlayerId: target, isAutoAbstain };
}

describe("tallyVotes", () => {
  it("counts votes per target and identifies a single winner", () => {
    const result = tallyVotes([vote("a", "c"), vote("b", "c"), vote("c", "a")]);
    expect(result.counts.get("c")).toBe(2);
    expect(result.topCount).toBe(2);
    expect(result.topPlayerIds).toEqual(["c"]);
  });

  it("excludes voluntary and auto abstains from the tally", () => {
    const result = tallyVotes([
      vote("a", "c"),
      vote("b", null, false),
      vote("c", null, true),
    ]);
    expect(result.counts.get("c")).toBe(1);
    expect(result.topPlayerIds).toEqual(["c"]);
  });

  it("reports no top players when everyone abstains", () => {
    const result = tallyVotes([vote("a", null), vote("b", null, true)]);
    expect(result.topCount).toBe(0);
    expect(result.topPlayerIds).toEqual([]);
  });

  it("reports every player tied for the top count", () => {
    const result = tallyVotes([vote("a", "x"), vote("b", "y")]);
    expect(result.topCount).toBe(1);
    expect(result.topPlayerIds.sort()).toEqual(["x", "y"]);
  });
});
