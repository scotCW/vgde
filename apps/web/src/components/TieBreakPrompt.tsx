import { useState } from "react";
import { post } from "../api.js";
import type { PlayerDto } from "../types.js";

export interface ActiveTieBreak {
  sessionQuestionId: string;
  tieBreakRoundId: string;
  text: string;
  candidatePlayerIds: string[];
}

interface Props {
  code: string;
  tieBreak: ActiveTieBreak;
  players: PlayerDto[];
  onVoted: () => void;
}

export default function TieBreakPrompt({ code, tieBreak, players, onVoted }: Props) {
  const [busy, setBusy] = useState(false);
  const [voted, setVoted] = useState(false);
  const candidates = players.filter((p) => tieBreak.candidatePlayerIds.includes(p.id));

  async function vote(targetPlayerId: string | null) {
    setBusy(true);
    try {
      await post(`/sessions/${code}/tiebreak/${tieBreak.tieBreakRoundId}/vote`, { targetPlayerId });
      setVoted(true);
      onVoted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-amber-500 bg-amber-950/30 p-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-400">Tie-break</p>
      <p className="mb-3 text-lg font-medium">{tieBreak.text}</p>
      {voted ? (
        <p className="text-sm text-slate-400">Vote recorded — waiting on everyone else…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {candidates.map((p) => (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => void vote(p.id)}
              className="rounded-full bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {p.displayName}
            </button>
          ))}
          <button
            disabled={busy}
            onClick={() => void vote(null)}
            className="rounded-full bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Abstain
          </button>
        </div>
      )}
    </div>
  );
}
