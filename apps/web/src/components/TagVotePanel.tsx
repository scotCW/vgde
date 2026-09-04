import { useState } from "react";
import { post } from "../api.js";

interface Props {
  code: string;
  isHost: boolean;
  candidates: string[];
  myVoteStatus: { voted: boolean; excludedTags: string[] };
  progress: { submitted: number; total: number } | null;
  onChanged: () => void;
}

export default function TagVotePanel({ code, isHost, candidates, myVoteStatus, progress, onChanged }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(myVoteStatus.excludedTags));
  const [busy, setBusy] = useState(false);

  function toggle(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    try {
      await post(`/sessions/${code}/tag-vote`, { excludedTags: [...selected] });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function closeEarly() {
    setBusy(true);
    try {
      await post(`/sessions/${code}/tag-vote/close`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-indigo-500 bg-indigo-950/30 p-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-400">
        Group vote — categories to leave out
      </p>
      <p className="mb-3 text-sm text-slate-400">
        Pick anything you personally don't want in this game — if even one person excludes a category,
        it's out for everyone.
        {progress && ` ${progress.submitted} of ${progress.total} have voted.`}
      </p>

      <div className="flex flex-wrap gap-2">
        {candidates.map((tag) => {
          const excluded = selected.has(tag);
          return (
            <button
              key={tag}
              disabled={busy}
              onClick={() => toggle(tag)}
              className={`rounded-full border px-3 py-1 text-sm capitalize transition ${
                excluded
                  ? "border-red-500 bg-red-950/60 text-red-300 line-through"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>

      <button
        disabled={busy}
        onClick={() => void submit()}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
      >
        {myVoteStatus.voted ? "Update my picks" : "Submit my picks"}
      </button>
      {myVoteStatus.voted && (
        <p className="mt-2 text-xs text-slate-500">Vote recorded — you can change it until everyone's in.</p>
      )}

      {isHost && (
        <button
          disabled={busy}
          onClick={() => void closeEarly()}
          className="mt-3 block text-sm text-slate-400 underline hover:text-slate-200"
        >
          Tally now with whoever's voted
        </button>
      )}
    </div>
  );
}
