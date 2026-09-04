# AGENTS.md

Context for AI coding agents working in this repo. Human-facing docs are
the [README](README.md) and the [wiki](https://github.com/scotCW/vgde/wiki)
(game rules, admin options, deployment guides) — this file is about
working *on* the code, not playing the game.

## What this is

A self-hosted, anonymous-voting party game (npm workspaces monorepo):

```
packages/shared/   game rules & config schema (zod), framework-free, unit tested
apps/server/       Fastify API + WebSocket + Prisma/Postgres
apps/web/          React + Vite SPA
```

`packages/shared` holds the actual game logic (deck consumption, tallying,
tie-break resolution, win conditions) as pure functions with no framework
dependency — the server is the only consumer, and every rule change should
land there first, with a unit test, before touching `apps/server`.

## Commands

```bash
npm install                 # from repo root — this is an npm workspaces repo, not per-package installs
npm run build                # shared -> server -> web, in that order (server/web import shared's dist)
npm test                     # meaningful coverage is packages/shared's unit tests; no DB needed for those
docker compose up -d --build # full stack: Postgres + the app, migrations + seed run automatically
```

There's no `apps/server` test suite beyond the shared package's — routes
are only verified by hand against a live Postgres instance (Docker or
otherwise). If you add server-level tests, `apps/server/vitest.config.ts`
is already wired up (`passWithNoTests: true` so `npm test` doesn't fail
with zero test files today).

## Non-obvious things that will bite you

- **This project's shell is zsh, not bash**, if you're working on the
  same kind of setup this was built on. `for x in $var; do` will NOT
  word-split in zsh the way it does in bash/sh — use `${=var}` or a real
  array. Cost real time to figure out mid-session; don't rediscover it.
- **`zod` is pinned to exactly `3.23.8`** (no caret) in both
  `packages/shared/package.json` and `apps/server/package.json`, and
  Dependabot has an `ignore` rule for it in `.github/dependabot.yml`.
  Versions from `3.25.x` onward ship zod 4's internals under a v3-compat
  shim with a *different* top-level export shape — this caused two
  separate `zod` module instances to load in this repo (one hoisted, one
  nested) and broke `instanceof ZodError` checks, turning routine
  input-validation failures into 500s instead of 400s. Don't bump it
  without an actual migration pass; see the comments in `app.ts`'s error
  handler and `routes.ts`'s `parseBody` helper for the full story and the
  workaround (`safeParse` + manual response, not relying on
  `instanceof`/the global error handler for zod errors specifically).
- **Prisma is pinned at `5.x`, deliberately not bumped to 7.** Prisma 7
  removes `datasource { url = env(...) }` from `schema.prisma` entirely —
  it requires a `prisma.config.ts` plus a driver adapter
  (`@prisma/adapter-pg`) passed into the `PrismaClient` constructor in
  `db.ts`. That's a real migration (new dependency, new config file,
  rewritten client construction, needs actual testing against a live DB),
  not a version bump — don't do it as part of unrelated dependency
  cleanup. If/when it happens: `prisma@7.10.0`'s own dependency tree
  currently carries two unpatched high-severity CVEs even for
  Postgres-only usage (`deepmerge-ts` via `@prisma/config`, `mysql2`
  bundled regardless of which driver you actually use) — verified fixed
  by adding `overrides: { "deepmerge-ts": "^8.0.2", "mysql2": "^3.24.3" }`
  to the root `package.json`, worth carrying into that migration.
- **Fastify hooks (not route handlers) must be `async` or take a `done`
  callback.** A plain synchronous 2-arg preHandler hook — e.g. an early
  version of `requireAuth` in `auth/plugin.ts` — hangs every request
  through it *forever*, silently, no error, no timeout. Fastify's hook
  runner treats a non-async 2-arg hook's return value as "should resolve
  to a promise" and never advances if it doesn't. This is specific to
  hooks; plain route handlers don't have this problem.
- **The runtime stage of `Dockerfile` must NOT use `--workspace`-filtered
  `npm ci`.** A filtered install (`npm ci --workspace=@voting-game/server
  --workspace=@voting-game/shared`) does not hoist dependencies
  identically to a full `npm ci`, and previously produced two separate
  nested `zod` installs from a single-version lockfile — a dual-module
  hazard, same class of bug as above. The runtime stage intentionally
  installs the full tree (`npm ci --omit=dev`, no `--workspace` flags)
  even though that pulls in some devDependency-adjacent packages for the
  unused `apps/web` workspace; the size cost is small and the consistency
  guarantee is worth it. See the comment in `Dockerfile`.
- **MacPorts Postgres + `sudo su postgres -c '...'` silently does
  nothing** on macOS — the `postgres` system account's shell is
  `/usr/bin/false`, so `su` never actually runs the command. Use
  `sudo -u postgres <binary> <args>` directly instead. (Only relevant if
  running Postgres outside Docker on macOS; irrelevant for the Docker
  path.)
- **Anonymity is enforced at the serialization boundary, not the
  database.** `apps/server/src/games/serialize.ts` is where every
  outbound response is shaped — a `Vote`'s `targetPlayerId` is stored
  normally in Postgres (has to be, for tallying and double-vote
  prevention) but is never serialized to any client except as part of an
  aggregate count after a question is finalized. If you add a new
  endpoint or WebSocket event that touches votes, route its response
  shaping through here, not an ad-hoc `select`.

## Conventions

- **Local git identity for this repo**: `scotCW` /
  `299917302+scotCW@users.noreply.github.com`, set locally (not
  `--global`) — don't fall back to a different identity.
- **No GPG signing** — not configured for the `scotCW` account. Don't add
  `-S` / `commit.gpgsign true` / anything that tries to sign.
- **GitHub releases must be created as drafts**, never published
  directly — release immutability is on for this repo, so a published
  release's tag/assets can't be changed afterward. Always `draft: true`
  and let the actual publish be a manual, deliberate step.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5
  <noreply@anthropic.com>` when an agent makes the change.
- Comments explain *why*, not *what* — the codebase leans on this
  consistently (see any of the files mentioned above for the tone/level
  of detail expected).
- Don't add abstractions, config flags, or "just in case" flexibility
  beyond what's asked — this repo has stayed intentionally lean; match
  that instead of generalizing prematurely.

## Security posture

argon2id password hashing, revocable server-side sessions (httpOnly,
`sameSite=strict` cookies), a CSRF header check on every mutating
request, rate limiting on auth/voting endpoints, `zod` validation at
every route boundary, Dependabot + CodeQL + secret scanning all enabled
on the GitHub repo. See the README's Security notes section for the full
list and current known gaps (no CI test suite beyond the shared package,
no automated backup strategy documented).
