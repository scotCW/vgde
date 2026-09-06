import { useEffect, useMemo, useRef, useState } from "react";
import { post } from "../api.js";
import type { PlayerDto, ResultDto } from "../types.js";
import Identicon from "./Identicon.js";

const FANCY_REVEAL_KEY = "vgde:fancy-reveal";

interface Props {
  code: string;
  results: ResultDto[];
  players: PlayerDto[];
  revealMode: "ALL_AT_ONCE" | "ONE_AT_A_TIME_SYNCED";
  isHost: boolean;
  readyToRevealNext: boolean;
}

function playerName(players: PlayerDto[], id: string): string {
  return players.find((p) => p.id === id)?.displayName ?? "Unknown";
}

/**
 * winnerPlayerId being null is ambiguous on its own — it means either
 * nobody voted for anyone (every player abstained) or votes were cast but
 * ended in a tie the configured tie-break method didn't award to anyone.
 * Distinguishing the two only needs what's already on ResultDto: an empty
 * tally means no one was voted for at all.
 */
function resultOutcome(
  r: ResultDto,
): { kind: "winner"; playerId: string } | { kind: "no_votes" } | { kind: "no_award" } {
  if (r.winnerPlayerId) return { kind: "winner", playerId: r.winnerPlayerId };
  return Object.keys(r.tally).length === 0 ? { kind: "no_votes" } : { kind: "no_award" };
}

export default function ResultsPanel({ code, results, players, revealMode, isHost, readyToRevealNext }: Props) {
  const [sort, setSort] = useState<"order" | "alpha">("order");
  const [busy, setBusy] = useState(false);
  const [fancy, setFancy] = useState(() => {
    try {
      return localStorage.getItem(FANCY_REVEAL_KEY) === "true";
    } catch {
      return false;
    }
  });

  // Only the result(s) that showed up since the last render get the
  // reveal animation — a page refresh or re-sort shouldn't replay it for
  // everything that was already sitting there.
  const seenIds = useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const fresh = results.filter((r) => !seenIds.current.has(r.sessionQuestionId));
    if (fresh.length > 0) {
      setFreshIds(new Set(fresh.map((r) => r.sessionQuestionId)));
      for (const r of fresh) seenIds.current.add(r.sessionQuestionId);
    }
  }, [results]);

  const sorted = useMemo(() => {
    const copy = [...results];
    if (sort === "alpha") copy.sort((a, b) => a.text.localeCompare(b.text));
    else copy.sort((a, b) => a.orderIndex - b.orderIndex);
    return copy;
  }, [results, sort]);

  function toggleFancy() {
    const next = !fancy;
    setFancy(next);
    try {
      localStorage.setItem(FANCY_REVEAL_KEY, String(next));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — a
      // personal cosmetic preference just not persisting isn't worth
      // failing over.
    }
  }

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
      {revealMode === "ONE_AT_A_TIME_SYNCED" && (
        <>
          {fancy && (
            <style>{`
              @keyframes vgde-fancy-reveal {
                0% { opacity: 0; transform: scale(0.8) rotateX(35deg); }
                60% { opacity: 1; transform: scale(1.03) rotateX(0deg); }
                100% { opacity: 1; transform: scale(1) rotateX(0deg); }
              }
            `}</style>
          )}
          <label className="flex items-center gap-2 self-start text-sm text-muted">
            <input type="checkbox" checked={fancy} onChange={toggleFancy} />
            ✨ Fancy reveal
          </label>
        </>
      )}
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

      {sorted.map((r) => {
        const outcome = resultOutcome(r);
        const animate = fancy && revealMode === "ONE_AT_A_TIME_SYNCED" && freshIds.has(r.sessionQuestionId);
        return (
          <div
            key={r.sessionQuestionId}
            style={animate ? { animation: "vgde-fancy-reveal 0.6s ease-out" } : undefined}
            className={`rounded-2xl border p-5 ${
              outcome.kind === "winner" ? "border-panel-accent-border bg-surface" : "border-border bg-surface"
            }`}
          >
            <p className="mb-2 text-lg font-medium">{r.text}</p>
            {outcome.kind === "winner" ? (
              <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-link">
                🏆 <Identicon seed={outcome.playerId} size={16} className="h-4 w-4 md:h-6 md:w-6" />
                {playerName(players, outcome.playerId)} won this card
              </p>
            ) : outcome.kind === "no_votes" ? (
              <p className="mb-3 text-sm font-medium text-subtle">😴 Everyone abstained — no card awarded</p>
            ) : (
              <p className="mb-3 text-sm font-medium text-warning">🤝 Tied, no card awarded</p>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              {Object.entries(r.tally).map(([playerId, count]) => {
                const isWinner = outcome.kind === "winner" && playerId === outcome.playerId;
                return (
                  <span
                    key={playerId}
                    className={`flex items-center gap-1 ${isWinner ? "font-semibold text-link" : "text-muted"}`}
                  >
                    <Identicon seed={playerId} size={14} className="h-3.5 w-3.5 md:h-5 md:w-5" />
                    {playerName(players, playerId)}: {count}
                  </span>
                );
              })}
              {Object.keys(r.tally).length === 0 && <span className="text-subtle">No votes were cast.</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
