import type { CastVote } from "../types.js";

export interface TallyResult {
  counts: Map<string, number>;
  topCount: number;
  /** Players tied for the most votes. Empty if everyone abstained. */
  topPlayerIds: string[];
}

/** Abstains (including auto-abstains) never count toward any target's tally. */
export function tallyVotes(votes: CastVote[]): TallyResult {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    if (vote.targetPlayerId === null) continue;
    counts.set(vote.targetPlayerId, (counts.get(vote.targetPlayerId) ?? 0) + 1);
  }

  let topCount = 0;
  for (const count of counts.values()) {
    if (count > topCount) topCount = count;
  }

  const topPlayerIds =
    topCount === 0
      ? []
      : [...counts.entries()].filter(([, c]) => c === topCount).map(([id]) => id);

  return { counts, topCount, topPlayerIds };
}
