import { z } from "zod";

export const GameModeSchema = z.enum([
  "CLASSIC_COUNT",
  "DECK_UNIQUE",
  "FIRST_TO_N_CARDS",
]);
export type GameMode = z.infer<typeof GameModeSchema>;

export const TieBreakMethodSchema = z.enum(["NO_AWARD", "RANDOM", "RUNOFF"]);
export type TieBreakMethod = z.infer<typeof TieBreakMethodSchema>;

// A runoff that ties again must resolve deterministically without recursing
// into another runoff, so the fallback excludes RUNOFF itself.
export const RunoffFallbackSchema = z.enum(["NO_AWARD", "RANDOM"]);
export type RunoffFallback = z.infer<typeof RunoffFallbackSchema>;

export const RevealModeSchema = z.enum(["ALL_AT_ONCE", "ONE_AT_A_TIME_SYNCED"]);
export type RevealMode = z.infer<typeof RevealModeSchema>;

export const TieBreakConfigSchema = z
  .object({
    method: TieBreakMethodSchema,
    runoffFallback: RunoffFallbackSchema.optional(),
  })
  .refine((v) => v.method !== "RUNOFF" || v.runoffFallback !== undefined, {
    message: "runoffFallback is required when tieBreak.method is RUNOFF",
    path: ["runoffFallback"],
  });
export type TieBreakConfig = z.infer<typeof TieBreakConfigSchema>;

export const MIN_PLAYERS = 3;
export const DEFAULT_TARGET_CARDS = 6;
export const DEFAULT_BATCH_SIZE = 5;

export const GameConfigSchema = z
  .object({
    mode: GameModeSchema,
    // CLASSIC_COUNT only: how many questions the session draws.
    questionCount: z.number().int().min(1).max(500).optional(),
    // FIRST_TO_N_CARDS only: card wins needed to end the game.
    targetCards: z.number().int().min(1).max(50).default(DEFAULT_TARGET_CARDS),
    // FIRST_TO_N_CARDS only: how many questions are drawn/voted per batch.
    batchSize: z.number().int().min(1).max(50).default(DEFAULT_BATCH_SIZE),
    // Voluntary abstain is always allowed except the host may disable it in
    // DECK_UNIQUE. Forced/auto-abstain (deck exhausted) is never affected by
    // this flag — see gameEngine/voteValidation.ts.
    allowVoluntaryAbstain: z.boolean().default(true),
    tieBreak: TieBreakConfigSchema,
    revealMode: RevealModeSchema,
    // Question-bank tags to leave out of this session's draw pool (e.g.
    // "nsfw", "alcohol"). Empty means nothing is filtered out.
    excludedTags: z.array(z.string()).default([]),
  })
  .refine((v) => v.mode !== "CLASSIC_COUNT" || v.questionCount !== undefined, {
    message: "questionCount is required when mode is CLASSIC_COUNT",
    path: ["questionCount"],
  })
  .refine((v) => v.allowVoluntaryAbstain !== false || v.mode === "DECK_UNIQUE", {
    message: "allowVoluntaryAbstain can only be disabled in DECK_UNIQUE mode",
    path: ["allowVoluntaryAbstain"],
  });
export type GameConfig = z.infer<typeof GameConfigSchema>;

/**
 * Auto-corrects fields that only make sense for the mode they came from
 * when the mode changes out from under them — e.g.
 * allowVoluntaryAbstain=false is only legal in DECK_UNIQUE (see the refine
 * above), so a merge that changes `mode` away from it must re-enable
 * voluntary abstain rather than hand the schema a config it will reject.
 * Callers should run this on any merged/partial config before validating.
 */
export function reconcileConfigForMode<T extends { mode: GameMode; allowVoluntaryAbstain?: boolean }>(
  config: T,
): T {
  if (config.mode !== "DECK_UNIQUE" && config.allowVoluntaryAbstain === false) {
    return { ...config, allowVoluntaryAbstain: true };
  }
  return config;
}

export const DEFAULT_CLASSIC_CONFIG: GameConfig = {
  mode: "CLASSIC_COUNT",
  questionCount: 10,
  targetCards: DEFAULT_TARGET_CARDS,
  batchSize: DEFAULT_BATCH_SIZE,
  allowVoluntaryAbstain: true,
  tieBreak: { method: "RANDOM" },
  revealMode: "ALL_AT_ONCE",
  excludedTags: [],
};

export const DEFAULT_DECK_CONFIG: GameConfig = {
  mode: "DECK_UNIQUE",
  targetCards: DEFAULT_TARGET_CARDS,
  batchSize: DEFAULT_BATCH_SIZE,
  allowVoluntaryAbstain: true,
  tieBreak: { method: "RANDOM" },
  revealMode: "ALL_AT_ONCE",
  excludedTags: [],
};
