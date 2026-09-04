import { useMemo, useState } from "react";
import { post } from "../api.js";
import type { PlayerDto, ResultDto } from "../types.js";

interface Props {
  code: string;
  results: ResultDto[];
  players: PlayerDto[];
  revealMode: "ALL_AT_ONCE" | "ONE_AT_A_TIME_SYNCED";
  isHost: boolean;
  readyToRevealNext: boolean;
}

function playerName(players: PlayerDto[], id: string | null): string {
  if (!id) return "No one (tie, no award)";
  return players.find((p) => p.id === id)?.displayName ?? "Unknown";
}

export default function ResultsPanel({ code, results, players, revealMode, isHost, readyToRevealNext }: Props) {
  const [sort, setSort] = useState<"order" | "alpha">("order");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...results];
    if (sort === "alpha") copy.sort((a, b) => a.text.localeCompare(b.text));
    else copy.sort((a, b) => a.orderIndex - b.orderIndex);
    return copy;
  }, [results, sort]);

  async function revealNext() {
    setBusy(true);
    try {
      await post(`/sessions/${code}/reveal/next`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {revealMode === "ONE_AT_A_TIME_SYNCED" && isHost && readyToRevealNext && (
        <button
          onClick={() => void revealNext()}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Reveal next result
        </button>
      )}
      {revealMode === "ONE_AT_A_TIME_SYNCED" && !isHost && readyToRevealNext && (
        <p className="text-sm text-muted">Waiting for the host to reveal the next result…</p>
      )}

      {revealMode === "ALL_AT_ONCE" && results.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Sort:</span>
          <button
            onClick={() => setSort("order")}
            className={`rounded-full px-3 py-1 ${sort === "order" ? "bg-indigo-600 text-white" : "bg-surface-alt"}`}
          >
            Original order
          </button>
          <button
            onClick={() => setSort("alpha")}
            className={`rounded-full px-3 py-1 ${sort === "alpha" ? "bg-indigo-600 text-white" : "bg-surface-alt"}`}
          >
            A–Z
          </button>
        </div>
      )}

      {sorted.length === 0 && <p className="text-muted">No results revealed yet.</p>}

      {sorted.map((r) => (
        <div key={r.sessionQuestionId} className="rounded-2xl border border-border bg-surface p-5">
          <p className="mb-2 text-lg font-medium">{r.text}</p>
          <p className="mb-3 text-sm font-semibold text-link">🏆 {playerName(players, r.winnerPlayerId)}</p>
          <div className="flex flex-wrap gap-3 text-sm text-muted">
            {Object.entries(r.tally).map(([playerId, count]) => (
              <span key={playerId}>
                {playerName(players, playerId)}: {count}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
