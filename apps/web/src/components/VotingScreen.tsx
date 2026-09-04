import { useState } from "react";
import type { GameConfig } from "@voting-game/shared";
import { post } from "../api.js";
import type { PlayerDto, VotingQuestionDto } from "../types.js";
import Identicon from "./Identicon.js";

interface Props {
  code: string;
  questions: VotingQuestionDto[];
  players: PlayerDto[];
  myPlayerId: string;
  config: GameConfig;
  progress: { submitted: number; total: number } | null;
  onVoted: () => void;
}

export default function VotingScreen({
  code,
  questions,
  players,
  myPlayerId,
  config,
  progress,
  onVoted,
}: Props) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const others = players.filter((p) => p.id !== myPlayerId);

  async function castVote(sessionQuestionId: string, targetPlayerId: string | null) {
    setPending((p) => new Set(p).add(sessionQuestionId));
    setErrors((e) => ({ ...e, [sessionQuestionId]: "" }));
    try {
      await post(`/sessions/${code}/votes`, { sessionQuestionId, targetPlayerId });
      onVoted();
    } catch {
      setErrors((e) => ({ ...e, [sessionQuestionId]: "That vote wasn't accepted." }));
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(sessionQuestionId);
        return next;
      });
    }
  }

  const answeredCount = questions.filter((q) => q.myVote).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">
          You've answered {answeredCount} of {questions.length}.
          {progress && ` The table has submitted ${progress.submitted} of ${progress.total} answers.`}
        </p>
        <p className="mt-1 text-xs text-subtle">
          Answer at your own pace — results appear once everyone has voted on this batch. Votes stay
          anonymous; no one sees who picked whom.
        </p>
      </div>

      {questions.map((q) => {
        const isDeck = config.mode === "DECK_UNIQUE";
        const busy = pending.has(q.sessionQuestionId);
        const currentTarget = q.myVote?.targetPlayerId ?? null;
        const canAbstainByChoice = config.allowVoluntaryAbstain || (isDeck && q.hasAvailableTargets === false);

        return (
          <div key={q.sessionQuestionId} className="rounded-2xl border border-border bg-surface p-5">
            <p className="mb-3 text-lg font-medium">{q.text}</p>
            {q.myVote?.isAutoAbstain && (
              <p className="mb-2 text-xs text-warning">
                You've already voted for everyone else — automatically abstained.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {others.map((p) => {
                const available = isDeck ? (q.availableTargetPlayerIds?.includes(p.id) ?? false) : true;
                const selected = currentTarget === p.id;
                const disabled = busy || (isDeck && !available && !selected);
                return (
                  <button
                    key={p.id}
                    disabled={disabled}
                    onClick={() => void castVote(q.sessionQuestionId, p.id)}
                    className={`flex items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-medium transition ${
                      selected
                        ? "bg-indigo-600 text-white"
                        : disabled
                          ? "cursor-not-allowed bg-surface-alt text-subtle"
                          : "bg-surface-alt text-text hover:bg-surface-alt-hover"
                    }`}
                    title={isDeck && !available && !selected ? "Already voted for this person" : undefined}
                  >
                    <Identicon seed={p.id} size={18} />
                    {p.displayName}
                  </button>
                );
              })}
              {canAbstainByChoice && (
                <button
                  disabled={busy}
                  onClick={() => void castVote(q.sessionQuestionId, null)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    currentTarget === null && q.myVote
                      ? "bg-surface-strong text-white"
                      : "bg-surface-alt text-text hover:bg-surface-alt-hover"
                  }`}
                >
                  Abstain
                </button>
              )}
            </div>
            {errors[q.sessionQuestionId] && (
              <p className="mt-2 text-sm text-danger">{errors[q.sessionQuestionId]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
