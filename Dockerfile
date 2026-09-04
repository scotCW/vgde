# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS build
WORKDIR /repo

# Prisma's query engine needs libssl to be resolvable at generate time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web

RUN npm run build --workspace=@voting-game/shared \
 && npm run prisma:generate --workspace=@voting-game/server \
 && npm run build --workspace=@voting-game/server \
 && npm run build --workspace=@voting-game/web

FROM node:26-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# The query engine needs this at request time too, not just at generate time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
# Deliberately the same shape of install as the build stage (just
# --omit=dev), not a --workspace-filtered one: a filtered `npm ci` doesn't
# hoist identically to a full one, which silently produced duplicate nested
# copies of shared dependencies (e.g. two zod installs, breaking
# `instanceof` checks on errors it throws — see app.ts's error handler
# comment). The web workspace's runtime deps this pulls in unnecessarily
# (react et al., not used since only apps/web/dist is served) are a small
# price for a guaranteed-consistent tree.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/server/dist apps/server/dist
COPY --from=build /repo/apps/server/prisma apps/server/prisma
COPY --from=build /repo/apps/server/docker-entrypoint.sh apps/server/docker-entrypoint.sh
COPY --from=build /repo/apps/web/dist apps/web/dist

# npm workspaces hoists deps to the repo root's node_modules (not per
# package), so that's where `prisma generate`'s output actually landed in
# the build stage too — /repo/apps/server/node_modules/.prisma doesn't
# exist.
COPY --from=build /repo/node_modules/.prisma node_modules/.prisma

RUN chmod +x apps/server/docker-entrypoint.sh \
 && addgroup --system --gid 1001 voting-game \
 && adduser --system --uid 1001 --ingroup voting-game voting-game \
 && chown -R voting-game:voting-game /repo
USER voting-game

EXPOSE 3000
WORKDIR /repo/apps/server
ENTRYPOINT ["./docker-entrypoint.sh"]
