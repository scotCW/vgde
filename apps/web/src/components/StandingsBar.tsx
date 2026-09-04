import Identicon from "./Identicon.js";
import type { PlayerDto } from "../types.js";

export default function StandingsBar({ players }: { players: PlayerDto[] }) {
  const sorted = [...players].sort((a, b) => b.cardsWon - a.cardsWon);
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-surface p-3">
      {sorted.map((p) => (
        <span
          key={p.id}
          className={`flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-sm ${p.isMe ? "bg-panel-accent text-link" : "bg-surface-alt text-muted"}`}
        >
          <Identicon seed={p.id} size={18} />
          {p.displayName} · {p.cardsWon} 🃏
        </span>
      ))}
    </div>
  );
}
