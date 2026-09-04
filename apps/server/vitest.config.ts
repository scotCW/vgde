import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Route/integration tests need a live Postgres (DATABASE_URL) and
    // aren't wired up yet — see README. Don't fail `npm test` in the
    // meantime; the meaningful coverage lives in packages/shared.
    passWithNoTests: true,
  },
});
