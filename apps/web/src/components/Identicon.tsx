/**
 * A small deterministic, dependency-free "identicon" — a symmetric 5x5
 * mosaic plus a hue, both derived from a string seed (a Player.id, not any
 * cross-game account identifier) via a basic string hash. Same seed always
 * renders the same icon, no network request and nothing to look up, and
 * it's just an extra visual cue for telling players apart at a glance —
 * displayName stays the source of truth.
 */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0;
}

const GRID = 5;
const HALF = 3; // columns 0-2 are hashed directly; 3-4 mirror 1-0 for left/right symmetry

interface Props {
  seed: string;
  size?: number;
  className?: string;
}

export default function Identicon({ seed, size = 24, className }: Props) {
  const hash = hashSeed(seed);
  const hue = hash % 360;
  const cellSize = size / GRID;

  const rects: { x: number; y: number }[] = [];
  let bit = 0;
  for (let col = 0; col < HALF; col++) {
    for (let row = 0; row < GRID; row++) {
      const on = ((hash >> bit++) & 1) === 1;
      if (!on) continue;
      rects.push({ x: col, y: row });
      const mirrorCol = GRID - 1 - col;
      if (mirrorCol !== col) rects.push({ x: mirrorCol, y: row });
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`shrink-0 rounded-md ${className ?? ""}`}
      role="img"
      aria-hidden="true"
    >
      <g fill={`hsl(${hue}, 55%, 45%)`}>
        {rects.map((r) => (
          <rect key={`${r.x}-${r.y}`} x={r.x * cellSize} y={r.y * cellSize} width={cellSize} height={cellSize} />
        ))}
      </g>
    </svg>
  );
}
