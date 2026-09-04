import { useState } from "react";
import type { GameConfig } from "@voting-game/shared";
import { post } from "../api.js";

const MODE_LABELS: Record<GameConfig["mode"], { title: string; blurb: string }> = {
  CLASSIC_COUNT: { title: "Classic Count", blurb: "A fixed number of questions, repeat votes allowed." },
  DECK_UNIQUE: { title: "Deck Mode", blurb: "One question per player, no repeat votes." },
  FIRST_TO_N_CARDS: { title: "First to N Cards", blurb: "Play in batches until someone wins outright." },
};

interface Props {
  code: string;
  isHost: boolean;
  candidates: GameConfig["mode"][];
  myVoteStatus: { voted: boolean; mode: GameConfig["mode"] | null };
  progress: { submitted: number; total: number } | null;
  onChanged: () => void;
}

export default function ModeVotePanel({ code, isHost, candidates, myVoteStatus, progress, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  async function vote(mode: GameConfig["mode"] | null) {
    setBusy(true);
    try {
      await post(`/sessions/${code}/mode-vote`, { mode });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function closeEarly() {
    setBusy(true);
    try {
      await post(`/sessions/${code}/mode-vote/close`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-indigo-500 bg-indigo-950/30 p-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-400">
        Group vote — pick the mode
      </p>
      <p className="mb-3 text-sm text-slate-400">
        The host handed this decision to the table.
        {progress && ` ${progress.submitted} of ${progress.total} have voted.`}
      </p>

      <div className="flex flex-col gap-2">
        {candidates.map((mode) => {
          const info = MODE_LABELS[mode];
          const selected = myVoteStatus.voted && myVoteStatus.mode === mode;
          return (
            <button
              key={mode}
              disabled={busy}
              onClick={() => void vote(mode)}
              className={`rounded-xl border px-4 py-2 text-left transition ${
                selected
                  ? "border-indigo-400 bg-indigo-600 text-white"
                  : "border-slate-700 bg-slate-900 hover:bg-slate-800"
              }`}
            >
              <span className="block font-medium">{info.title}</span>
              <span className="block text-xs text-slate-400">{info.blurb}</span>
            </button>
          );
        })}
        <button
          disabled={busy}
          onClick={() => void vote(null)}
          className={`rounded-xl border px-4 py-2 text-sm ${
            myVoteStatus.voted && myVoteStatus.mode === null
              ? "border-slate-500 bg-slate-700 text-white"
              : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
        >
          Abstain
        </button>
      </div>

      {myVoteStatus.voted && (
        <p className="mt-3 text-xs text-slate-500">Vote recorded — you can change it until everyone's in.</p>
      )}

      {isHost && (
        <button
          disabled={busy}
          onClick={() => void closeEarly()}
          className="mt-4 text-sm text-slate-400 underline hover:text-slate-200"
        >
          Tally now with whoever's voted
        </button>
      )}
    </div>
  );
}
