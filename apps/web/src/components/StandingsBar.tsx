import Identicon from "./Identicon.js";
import type { PlayerDto } from "../types.js";

interface Props {
  players: PlayerDto[];
  /**
   * When true, hides card counts *and* avoids sorting by them — sorting
   * by cardsWon while hiding the number would still leak who's ahead
   * through list order alone, which defeats the point.
   */
  hideCardsWon?: boolean;
}

export default function StandingsBar({ players, hideCardsWon = false }: Props) {
  const sorted = hideCardsWon
    ? [...players].sort((a, b) => a.displayName.localeCompare(b.displayName))
    : [...players].sort((a, b) => b.cardsWon - a.cardsWon);
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-surface p-3">
      {sorted.map((p) => (
        <span
          key={p.id}
          className={`flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-sm ${p.isMe ? "bg-panel-accent text-link" : "bg-surface-alt text-muted"}`}
        >
          <Identicon seed={p.id} size={18} className="h-[18px] w-[18px] md:h-7 md:w-7" />
          {p.displayName}
          {!hideCardsWon && ` · ${p.cardsWon} 🃏`}
        </span>
      ))}
    </div>
  );
}
