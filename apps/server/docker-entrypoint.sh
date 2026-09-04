#!/bin/sh
set -e

npx prisma migrate deploy --schema prisma/schema.prisma
node dist/main.js &
SERVER_PID=$!

# Seed only runs its inserts if the table is empty (see prisma/seed.ts),
# so it's safe to run on every boot.
npx tsx prisma/seed.ts || true

wait "$SERVER_PID"
