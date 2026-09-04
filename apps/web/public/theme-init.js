// Runs before anything renders so there's no flash of the wrong theme.
// External file (not inline) so it isn't blocked by the CSP's
// `script-src 'self'` — an inline <script> would need a nonce/hash.
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark =
      stored === "dark" ||
      ((!stored || stored === "system") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
