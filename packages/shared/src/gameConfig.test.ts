import { describe, expect, it } from "vitest";
import { DEFAULT_DECK_CONFIG, GameConfigSchema, reconcileConfigForMode } from "./gameConfig.js";

describe("reconcileConfigForMode", () => {
  it("leaves a config alone when allowVoluntaryAbstain is true", () => {
    const config = { ...DEFAULT_DECK_CONFIG, mode: "CLASSIC_COUNT" as const };
    expect(reconcileConfigForMode(config)).toBe(config);
  });

  it("leaves allowVoluntaryAbstain=false alone in DECK_UNIQUE", () => {
    const config = { ...DEFAULT_DECK_CONFIG, allowVoluntaryAbstain: false };
    expect(reconcileConfigForMode(config).allowVoluntaryAbstain).toBe(false);
  });

  it("re-enables voluntary abstain when the mode moves away from DECK_UNIQUE", () => {
    const config = { ...DEFAULT_DECK_CONFIG, mode: "CLASSIC_COUNT" as const, allowVoluntaryAbstain: false };
    const result = reconcileConfigForMode(config);
    expect(result.allowVoluntaryAbstain).toBe(true);
  });

  it("produces a config GameConfigSchema accepts even from an otherwise-invalid merge", () => {
    // Simulates a mode-vote result landing on top of a config that had
    // voluntary abstain disabled from a prior DECK_UNIQUE setup — without
    // reconciliation this merge fails GameConfigSchema's refine.
    const merged = {
      ...DEFAULT_DECK_CONFIG,
      allowVoluntaryAbstain: false,
      mode: "FIRST_TO_N_CARDS" as const,
    };
    expect(GameConfigSchema.safeParse(merged).success).toBe(false);
    expect(GameConfigSchema.safeParse(reconcileConfigForMode(merged)).success).toBe(true);
  });
});
