#!/bin/sh
set -e

echo "[Entrypoint] DB migration çalıştırılıyor..."
bun run /app/server/src/db/migrate.ts

echo "[Entrypoint] Seed çalıştırılıyor..."
bun run /app/server/src/scripts/migrate-seed.ts

echo "[Entrypoint] Sunucu başlatılıyor..."
exec bun run /app/server/src/index.ts
