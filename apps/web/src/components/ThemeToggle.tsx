import { useTheme, type ThemePreference } from "../hooks/useTheme.js";

const NEXT: Record<ThemePreference, ThemePreference> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const LABEL: Record<ThemePreference, string> = {
  light: "☀️ Light",
  dark: "🌙 Dark",
  system: "🖥️ Auto",
};

/** Cycles light -> dark -> system -> light. Rendered once, fixed corner, on every page. */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      title="Switch theme"
      className="fixed right-3 top-3 z-50 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted shadow-sm hover:bg-surface-alt"
    >
      {LABEL[theme]}
    </button>
  );
}
