#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  POSTGRES_USER="${POSTGRES_USER:-voiceai}"
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-voiceai_secret}"
  POSTGRES_DB="${POSTGRES_DB:-voiceai}"
  POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
  POSTGRES_PORT="${POSTGRES_PORT:-5432}"
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
  echo "[Entrypoint] DATABASE_URL tanımlı değil; PostgreSQL servis değişkenlerinden oluşturuldu."
fi

echo "[Entrypoint] DB migration çalıştırılıyor..."
bun run /app/server/src/db/migrate.ts

echo "[Entrypoint] DB Seed (Temel veriler) çalıştırılıyor..."
bun run /app/server/src/scripts/migrate-seed.ts

echo "[Entrypoint] İlk Yönetici Hesabı (Kullanıcı) oluşturuluyor..."
bun run /app/server/src/scripts/seed-users.ts

echo "[Entrypoint] Sunucu başlatılıyor..."
exec bun run /app/server/src/index.ts
