import type { PlayerDto } from "../types.js";

export default function StandingsBar({ players }: { players: PlayerDto[] }) {
  const sorted = [...players].sort((a, b) => b.cardsWon - a.cardsWon);
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-surface p-3">
      {sorted.map((p) => (
        <span
          key={p.id}
          className={`rounded-full px-3 py-1 text-sm ${p.isMe ? "bg-panel-accent text-link" : "bg-surface-alt text-muted"}`}
        >
          {p.displayName} · {p.cardsWon} 🃏
        </span>
      ))}
    </div>
  );
}
