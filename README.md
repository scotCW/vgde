# The Voting Game — Digital

A self-hosted, browser-based adaptation of *The Voting Game*, with anonymous
voting (no "guess who voted for whom"), batched at-your-own-pace voting
instead of strict rounds, and two configurable rule sets.

## Game modes

- **Classic Count** — host picks a fixed number of questions (10, 100,
  whatever). Players can vote for the same person more than once. Abstaining
  is always allowed.
- **Deck Mode** — number of questions = number of players. Each player gets
  one vote-card per other player; once used, they can't vote for that person
  again. The host can disable *voluntary* abstaining, but a player whose
  deck is empty is always allowed to abstain — there's no one left to vote
  for.
- **First to N Cards** *(secondary mode)* — questions are drawn in batches
  (default 5 at a time) until someone accumulates enough card wins (default
  6) to win outright.

Tie-breaking (no award / random / a synced runoff vote) and reveal style
(all at once, sortable, vs. one at a time with everyone seeing the same
question together) are both configurable per game.

In the lobby, the host can either pick the mode directly or hand the
decision to the table: "delegate to a vote" opens a ballot where every
player picks a mode (or abstains); once everyone's in — or the host tallies
early — the plurality winner becomes the session's mode, with ties broken
randomly. Config is locked while that vote is open.

The question bank (326 prompts, all original text) is tagged, and the host
can exclude whole categories per session — `nsfw` (explicit/adult content
specifically, kept narrow on purpose), `alcohol`, `criminal`, and
`dating`/relationship-themed prompts sit alongside the default
family-friendly set and are opt-out, not opt-in. Like the mode, category
choice can be delegated to a vote: each player privately submits the
categories *they* want left out, and resolution is a union, not a majority
— if even one person excludes a category, it's out for everyone, since this
is a content-comfort filter rather than a popularity contest. Either way
(direct pick or vote result), the lobby shows a warning if the surviving
question pool is too small for the configured mode, before the host hits
start — starting still hard-blocks on it (`NOT_ENOUGH_QUESTIONS`) as the
authoritative check.

The full bank is also browsable outside of any game — "Browse the question
bank" on the home page opens a searchable, tag-filterable, paginated list of
every prompt (`/question-bank` in the app; `GET /questions` in the API,
which takes `search`, `tags`, `limit`, and `offset` query params and never
loads more than one page server- or client-side), so a host can preview
what's in play before configuring a session.

## Stack

- **Backend**: Node.js + TypeScript, Fastify, Prisma/PostgreSQL, raw `ws`
  for realtime (a small hand-rolled room manager, not Socket.IO — smaller
  attack surface for what is purely server → room fanout).
- **Frontend**: React + Vite + TypeScript, TanStack Query, Tailwind.
- **Auth**: local email/password (argon2id) and/or OIDC against any
  standard identity provider (Authentik, Keycloak, Google, etc.) — an OIDC
  login with no matching account auto-provisions one.
- **Shared game engine**: `packages/shared` holds all the actual game rules
  (deck logic, tallying, tie-break resolution, win conditions) as pure,
  unit-tested functions used by the server — no duplicated logic on the
  client.

## Repo layout

```
packages/shared/   game rules & config schema (zod), framework-free, unit tested
apps/server/       Fastify API + WebSocket + Prisma
apps/web/          React SPA
```

## Local development

No Homebrew required. Node comes from [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install --lts
```

Install dependencies from the repo root (this is an npm workspaces
monorepo):

```bash
npm install
```

You need a reachable PostgreSQL instance for the server. The intended path
is Docker Compose (works identically on Linux and Mac, no Homebrew):

```bash
cp .env.example .env
openssl rand -base64 48   # paste the output in as SESSION_SECRET in .env
# also set a real POSTGRES_PASSWORD in .env
docker compose up -d db
```

If you don't want Docker for local dev, point `DATABASE_URL` in `.env` at
any Postgres 14+ instance you already have.

Then, from `apps/server`:

```bash
npm run prisma:migrate   # creates the initial migration + applies it
npm run seed              # loads the question bank (idempotent)
npm run dev                # starts the API on :3000
```

And in another terminal, from `apps/web`:

```bash
npm run dev   # Vite dev server on :5173, proxies /auth, /me, /sessions, /ws to :3000
```

> **MacPorts note**: `sudo port install postgresql16-server` initializes the
> server with `sudo su postgres -c '...'` in a lot of tutorials — don't. The
> `postgres` system account's shell is `/usr/bin/false` on macOS, so `su`
> silently does nothing. Use `sudo -u postgres <binary> <args>` directly
> instead (e.g. `sudo -u postgres /opt/local/lib/postgresql16/bin/initdb -D
> /opt/local/var/db/postgresql16/defaultdb`).

Prisma CLI and the app itself both need `DATABASE_URL` etc. at runtime.
Prisma auto-loads a `.env` next to `apps/server/package.json`; if your `.env`
lives at the repo root (so `docker-compose.yml` can read it too), symlink it
in: `ln -s ../../.env apps/server/.env`. The Node process itself needs the
same thing — `npm run dev` (via `tsx`) doesn't auto-load `.env`.

### Running the test suite

```bash
npm test   # runs vitest across all workspaces; the meaningful coverage is
           # packages/shared's 40 unit tests for the game engine (deck
           # consumption/auto-abstain, tallying, every tie-break method,
           # win conditions, tag filtering) — no database needed for these.
```

## Running in production

```bash
cp .env.example .env
openssl rand -base64 48   # paste the output in as SESSION_SECRET in .env
# also fill in POSTGRES_PASSWORD, etc.
docker compose up -d --build
```

This builds one image containing the compiled server *and* the built SPA
(the server serves both — one process, no separate frontend host needed),
runs Prisma migrations and the (idempotent) question-bank seed on
container start, and serves on `:3000`. Put a reverse proxy (Caddy is the
easiest option — automatic TLS with a two-line Caddyfile) in front of it
for HTTPS; set `COOKIE_SECURE=true` (the default) once you have TLS, and
set `ALLOWED_ORIGINS` to your real domain.

### Deployment guides by auth mode

The above uses this repo's own `docker-compose.yml` + `.env`. If you'd
rather start from a complete, self-contained compose file for the
specific auth setup you want (real values inlined, nothing to
cross-reference), see the [wiki](https://github.com/scotCW/vgde/wiki):

- [Password + OIDC](https://github.com/scotCW/vgde/wiki/Deploy-Password-and-OIDC)
  — both login paths active
- [OIDC only](https://github.com/scotCW/vgde/wiki/Deploy-OIDC-only) —
  single sign-on is the only way in, `/auth/register` and `/auth/login`
  don't exist
- [Password only](https://github.com/scotCW/vgde/wiki/Deploy-Password-only)
  — no external identity provider at all, the simplest option

### Configuring without a `.env` file

`docker-compose.yml` doesn't actually require `.env` — every value there is
`${VAR:-default}` / `${VAR:?error}` interpolation, and that's just Compose's
syntax for "read this from somewhere else at parse time." Nothing stops you
from deleting the interpolation and writing the real values straight into
the file instead, under each service's `environment:` block.

Given the current file (`db` and `app` services, each with an
`environment:` map of `KEY: ${VAR:-default}` lines), converting means, for
every one of those lines, replacing `${VAR:-default}` or `${VAR:?...}` with
a literal value — same key, same place, just no `$`:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: voting_game
      POSTGRES_PASSWORD: a-real-password-here
      POSTGRES_DB: voting_game
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U voting_game"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build: .
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      HOST: 0.0.0.0
      # Same user/password/db as the db service above — this isn't shared
      # automatically once it's hardcoded, so keep the three in sync by hand.
      DATABASE_URL: postgresql://voting_game:a-real-password-here@db:5432/voting_game
      SESSION_SECRET: a-real-64-char-secret-from-openssl-rand--base64-48
      COOKIE_SECURE: "true"
      ALLOWED_ORIGINS: https://voting.example.com
      OIDC_ISSUER_URL: ""
      OIDC_CLIENT_ID: ""
      OIDC_CLIENT_SECRET: ""
      OIDC_REDIRECT_URI: ""
      AUTH_MODE: password_and_oidc
    ports:
      - "127.0.0.1:3000:3000"

volumes:
  db-data:
```

A few things worth knowing before doing this:

- **`POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL` have to
  match by hand now.** The `${POSTGRES_PASSWORD}` interpolation used inside
  `DATABASE_URL` (`postgresql://${POSTGRES_USER:-voting_game}:${POSTGRES_PASSWORD}@db:...`)
  is what currently keeps those in sync automatically from one value — once
  it's hardcoded, that link is gone, so a typo between the two silently
  breaks the app's DB connection while Postgres itself still comes up fine.
- **Empty OIDC values must stay as `""`, not be deleted.** Fastify passes
  `environment:` values through as literal strings; an empty string is what
  the server's env parsing treats as "unset" (see `env.ts`'s `optional()`
  helper) — an *absent* key would instead just be `undefined` in
  `process.env`, which behaves the same way here, so either omitting the
  line or setting `""` both work. Just don't put a placeholder string like
  `changeme` there, since a non-empty value there is treated as configured.
- **This is the same tradeoff as any hardcoded secret**: fine if
  `docker-compose.yml` itself is access-controlled and kept out of version
  control (or the repo it's in is private and only you can reach it), not
  otherwise — a `.env` at least keeps secrets out of the file you're most
  likely to `git add` without thinking about it.
- `.env.example` still lists every variable name and what it's for even if
  you stop using `.env` itself — treat it as the reference for which keys
  exist, and delete `.env` once nothing reads it anymore.

If you'd rather keep secrets out of the compose file entirely but still
avoid a `.env` on disk, the same `${VAR}` interpolation Compose already
does can instead be filled from the shell environment (panels like
Portainer/Unraid/Coolify, a systemd `EnvironmentFile=`, or `export`ing the
values before `docker compose up`) — no compose-file edits needed for that
path, just don't mix it with hardcoding the same variables above.

Once you're not using `.env`, delete it (or keep `.env.example` only) so
there's no stale, unused copy of secrets sitting on disk.

## OIDC (optional)

Set `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and
`OIDC_REDIRECT_URI` in `.env` to enable "continue with single sign-on" —
any standard OIDC provider works. Leaving them unset disables the OIDC
routes entirely; local email/password still works either way. A login from
an identity the app hasn't seen before auto-creates an account (matched
first by issuer+subject, then by verified email, otherwise a fresh account
is provisioned). The auth flow uses PKCE (S256) and a random `state`, both
verified on callback — not just a client secret.

There's no admin panel; all of this is env-var configuration, read once at
process startup. Changing it means editing `.env` and restarting the
container.

Once OIDC is confirmed working, set `AUTH_MODE=oidc_only` to cut over
completely: `/auth/register` and `/auth/login` stop existing (404, not a
hidden form) and the local-login form disappears client-side, for every
account including ones that already have a password set — this is a global
switch, not a per-account one. The server refuses to start with
`AUTH_MODE=oidc_only` unless all four OIDC vars above are set, so it can't
lock everyone out by mistake.

### Pocket ID

[Pocket ID](https://pocket-id.org) — passkey-based, self-hosted, and a
common pairing with a homelab-style deployment of this app — is confirmed
compatible. It's built on [Ory Fosite](https://github.com/ory/fosite), a
standards-compliant OAuth2/OIDC library, and this app's OIDC client
(`openid-client`, dynamic discovery, PKCE S256 always sent, `state`
verified on callback) needs nothing Pocket-ID-specific to work — no code
changes, just client setup on the Pocket ID side:

1. In Pocket ID, go to **Settings → Application Configuration** and make
   sure **Emails Verified** is ticked. This app only auto-links an OIDC
   login to an existing *local* (password) account by matching a verified
   email; if this is off, a user who registered with a password first and
   later signs in via Pocket ID with the same email gets a second, separate
   account instead of being linked to their first one. It doesn't affect
   login itself — a first-time OIDC login always auto-provisions
   correctly either way.
2. Go to **OIDC Clients → Add OIDC Client**.
   - **Name**: whatever you want (e.g. `The Voting Game`).
   - **Callback URLs**: exactly your `OIDC_REDIRECT_URI` value, e.g.
     `https://voting.example.com/auth/oidc/callback`. Pocket ID matches
     this exactly, so no trailing slash, no path differences.
   - **Public Client**: leave this **off**. This app's OIDC flow runs
     entirely server-side and holds `OIDC_CLIENT_SECRET` — it's a
     confidential client, not a public/browser one (Pocket ID enforces
     PKCE for public clients specifically; this app always sends PKCE
     regardless, so either setting works, but "off" is the correct
     description of what this app actually is).
   - **Scopes**: `openid profile email` — the `groups` scope isn't used by
     this app, no need to add it.
3. Save. The Client ID and Client Secret are shown **once** — copy both
   immediately into `.env`.
4. Set `OIDC_ISSUER_URL` to your Pocket ID origin with **no trailing
   slash and no `/.well-known/...` suffix** (e.g. `https://id.example.com`)
   — this app's discovery call appends the well-known path itself.

```bash
OIDC_ISSUER_URL=https://id.example.com
OIDC_CLIENT_ID=<from Pocket ID>
OIDC_CLIENT_SECRET=<from Pocket ID, shown once>
OIDC_REDIRECT_URI=https://voting.example.com/auth/oidc/callback
```

## Security notes

- Passwords: argon2id.
- Sessions: server-side session store behind an httpOnly, `sameSite=strict`
  cookie (individually revocable, unlike a bare JWT).
- CSRF: the sameSite cookie already blocks the common cases; mutating
  requests additionally require a custom header the browser won't attach
  cross-site without a CORS preflight, and requests can be origin-checked
  against `ALLOWED_ORIGINS`.
- Anonymity: every response is shaped in `apps/server/src/games/serialize.ts`
  — a vote's target is never serialized to another player, only aggregate
  counts and the winner once a question is finalized.
- Rate limiting on auth and voting endpoints; `zod` validation on every
  route boundary; no third-party analytics or trackers.

## License

[Unlicense](LICENSE) — public domain. Every dependency in the tree (193
packages, checked with `license-checker`) is MIT, Apache-2.0, ISC,
BSD-3-Clause, BlueOak-1.0.0, or MPL-2.0 (the last is just `lightningcss`,
a build-time-only CSS engine); nothing copyleft, nothing that conflicts
with dedicating this project's own code to the public domain.
