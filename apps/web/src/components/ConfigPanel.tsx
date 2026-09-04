import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  filterQuestionsByTags,
  guaranteedForcedAbstainCount,
  questionCountForMode,
  type GameConfig,
} from "@voting-game/shared";
import { get, patch, post } from "../api.js";
import type { QuestionBankSummaryItem } from "../types.js";

interface Props {
  code: string;
  config: GameConfig;
  isHost: boolean;
  playerCount: number;
  modeVoteOpen: boolean;
  tagVoteOpen: boolean;
  onChanged: () => void;
}

export default function ConfigPanel({
  code,
  config,
  isHost,
  playerCount,
  modeVoteOpen,
  tagVoteOpen,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voteOpen = modeVoteOpen || tagVoteOpen;

  const tagsQuery = useQuery({
    queryKey: ["question-tags"],
    queryFn: () => get<{ tags: string[] }>("/questions/tags"),
    staleTime: Infinity,
  });

  const bankSummaryQuery = useQuery({
    queryKey: ["question-bank-summary"],
    queryFn: () => get<QuestionBankSummaryItem[]>("/questions/bank-summary"),
    staleTime: Infinity,
  });

  const bankWarning = useMemo(() => {
    if (!bankSummaryQuery.data) return null;
    const eligible = filterQuestionsByTags(bankSummaryQuery.data, config.excludedTags).length;
    const required = config.mode === "FIRST_TO_N_CARDS"
      ? config.batchSize
      : questionCountForMode(config, playerCount);
    if (required === null || eligible >= required) return null;
    return config.mode === "FIRST_TO_N_CARDS"
      ? `Only ${eligible} questions match these filters, but each batch needs ${required} — batches will run smaller than configured, and the game may end early if the bank runs out.`
      : `Only ${eligible} questions match these filters, but this mode needs ${required} to start. Exclude fewer categories, lower the question count, or add more players.`;
  }, [bankSummaryQuery.data, config, playerCount]);

  // Deck Mode always deals playerCount - 1 cards but draws playerCount
  // questions — every player is guaranteed to run out one question early,
  // regardless of settings or how many people are playing. Forced abstain
  // is always allowed when it happens (nothing breaks), but a host who
  // disables voluntary abstaining might otherwise expect zero abstentions
  // — that's not achievable here, so say so explicitly.
  const deckAbstainCount =
    config.mode === "DECK_UNIQUE" && playerCount >= 2
      ? guaranteedForcedAbstainCount(playerCount, playerCount - 1)
      : 0;

  async function update(partial: Partial<GameConfig>) {
    setBusy(true);
    setError(null);
    try {
      await patch(`/sessions/${code}/config`, partial);
      onChanged();
    } catch {
      setError("Couldn't update settings.");
    } finally {
      setBusy(false);
    }
  }

  function toggleTag(tag: string, excluded: boolean) {
    const next = excluded
      ? [...config.excludedTags, tag]
      : config.excludedTags.filter((t) => t !== tag);
    void update({ excludedTags: next });
  }

  async function delegateMode() {
    setBusy(true);
    setError(null);
    try {
      await post(`/sessions/${code}/mode-vote/open`);
      onChanged();
    } catch {
      setError("Couldn't start a mode vote.");
    } finally {
      setBusy(false);
    }
  }

  async function delegateTags() {
    setBusy(true);
    setError(null);
    try {
      await post(`/sessions/${code}/tag-vote/open`);
      onChanged();
    } catch {
      setError("Couldn't start a category vote.");
    } finally {
      setBusy(false);
    }
  }

  const questionsForMode =
    config.mode === "CLASSIC_COUNT"
      ? `${config.questionCount ?? 10} questions`
      : config.mode === "DECK_UNIQUE"
        ? `${playerCount} questions (one per player)`
        : `first to ${config.targetCards ?? 6} cards, ${config.batchSize ?? 5} at a time`;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 font-semibold">Game settings</h2>

      {!isHost && (
        <p className="mb-4 text-sm text-slate-400">Only the host can change these.</p>
      )}
      {voteOpen && (
        <p className="mb-4 text-sm text-indigo-400">
          Settings are locked while the group votes {modeVoteOpen ? "on the mode" : "on categories"} below.
        </p>
      )}

      <fieldset disabled={!isHost || busy || voteOpen} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Mode</span>
          <select
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
            value={config.mode}
            onChange={(e) => void update({ mode: e.target.value as GameConfig["mode"] })}
          >
            <option value="CLASSIC_COUNT">Classic Count — fixed number of questions</option>
            <option value="DECK_UNIQUE">Deck Mode — one vote per person, no repeats</option>
            <option value="FIRST_TO_N_CARDS">First to N Cards — play until someone wins</option>
          </select>
        </label>

        {isHost && !voteOpen && (
          <button
            type="button"
            onClick={() => void delegateMode()}
            className="self-start text-sm text-indigo-400 underline hover:text-indigo-300"
          >
            Let the group vote on the mode instead
          </button>
        )}

        {config.mode === "CLASSIC_COUNT" && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-400">Number of questions</span>
            <input
              type="number"
              min={1}
              max={500}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              value={config.questionCount ?? 10}
              onChange={(e) => void update({ questionCount: Number(e.target.value) })}
            />
          </label>
        )}

        {config.mode === "FIRST_TO_N_CARDS" && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">Cards needed to win</span>
              <input
                type="number"
                min={1}
                max={50}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                value={config.targetCards}
                onChange={(e) => void update({ targetCards: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">Questions per batch</span>
              <input
                type="number"
                min={1}
                max={50}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                value={config.batchSize}
                onChange={(e) => void update({ batchSize: Number(e.target.value) })}
              />
            </label>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.allowVoluntaryAbstain}
              disabled={!isHost || busy || config.mode !== "DECK_UNIQUE"}
              onChange={(e) => void update({ allowVoluntaryAbstain: e.target.checked })}
            />
            <span className="text-sm">
              Allow players to abstain by choice
              {config.mode !== "DECK_UNIQUE" && " (always on outside Deck Mode)"}
            </span>
          </label>
          {deckAbstainCount > 0 && (
            <p className="text-xs text-amber-400">
              ⚠ With {playerCount} players, everyone gets {playerCount - 1} vote-cards for{" "}
              {playerCount} questions — every player will hit one automatic, unavoidable abstain
              near the end of the game no matter this setting.{" "}
              {config.allowVoluntaryAbstain
                ? "This only controls abstaining early, while cards remain."
                : "Turning this off won't get you to zero abstentions — that last one can't be prevented."}
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Tie-break method</span>
          <select
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
            value={config.tieBreak.method}
            onChange={(e) =>
              void update({
                tieBreak: {
                  method: e.target.value as GameConfig["tieBreak"]["method"],
                  runoffFallback:
                    e.target.value === "RUNOFF"
                      ? (config.tieBreak.runoffFallback ?? "NO_AWARD")
                      : undefined,
                },
              })
            }
          >
            <option value="NO_AWARD">No award — nobody gets the card</option>
            <option value="RANDOM">Random — server picks among the tied</option>
            <option value="RUNOFF">Runoff — everyone votes again on just the tied players</option>
          </select>
        </label>

        {config.tieBreak.method === "RUNOFF" && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-400">If the runoff ties again</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              value={config.tieBreak.runoffFallback ?? "NO_AWARD"}
              onChange={(e) =>
                void update({
                  tieBreak: { method: "RUNOFF", runoffFallback: e.target.value as "NO_AWARD" | "RANDOM" },
                })
              }
            >
              <option value="NO_AWARD">No award</option>
              <option value="RANDOM">Random</option>
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Reveal style</span>
          <select
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
            value={config.revealMode}
            onChange={(e) => void update({ revealMode: e.target.value as GameConfig["revealMode"] })}
          >
            <option value="ALL_AT_ONCE">All at once — browse results whenever</option>
            <option value="ONE_AT_A_TIME_SYNCED">One at a time — host reveals, everyone sees together</option>
          </select>
        </label>

        {tagsQuery.data && tagsQuery.data.tags.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-slate-400">Question categories to leave out</span>
            <div className="flex flex-wrap gap-2">
              {tagsQuery.data.tags.map((tag) => {
                const excluded = config.excludedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag, !excluded)}
                    className={`rounded-full border px-3 py-1 text-sm capitalize transition ${
                      excluded
                        ? "border-red-500 bg-red-950/60 text-red-300 line-through"
                        : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-slate-500">
              Click a category to leave it out of this game. Everything's included by default.
            </span>
            {isHost && !voteOpen && (
              <button
                type="button"
                onClick={() => void delegateTags()}
                className="mt-1 self-start text-sm text-indigo-400 underline hover:text-indigo-300"
              >
                Let the group vote on categories instead
              </button>
            )}
          </div>
        )}
      </fieldset>

      <p className="mt-4 text-sm text-slate-400">{questionsForMode}</p>
      {bankWarning && <p className="mt-2 text-sm text-amber-400">⚠ {bankWarning}</p>}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
