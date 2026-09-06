import { useTheme, type ThemePreference } from "../hooks/useTheme.js";

const NEXT: Record<ThemePreference, ThemePreference> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const ICON: Record<ThemePreference, string> = {
  light: "☀️",
  dark: "🌙",
  system: "🖥️",
};

const LABEL: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "Auto",
};

/**
 * Cycles light -> dark -> system -> light. Rendered once, fixed corner, on
 * every page. Icon-only below sm: — on a narrow phone viewport, page
 * content runs edge to edge (no side margin to float over), so a wider
 * button here risks sitting on top of a tap target as the page scrolls
 * underneath it.
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      title="Switch theme"
      className="fixed right-3 top-3 z-50 rounded-full border border-border bg-surface px-2.5 py-1.5 text-sm text-muted shadow-sm hover:bg-surface-alt sm:px-3"
    >
      {ICON[theme]}
      <span className="hidden sm:inline"> {LABEL[theme]}</span>
    </button>
  );
}
