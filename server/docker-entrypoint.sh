#!/bin/sh
set -e

echo "[Entrypoint] DB migration çalıştırılıyor..."
bun run /app/server/src/db/migrate.ts

echo "[Entrypoint] DB Seed (Temel veriler) çalıştırılıyor..."
bun run /app/server/src/scripts/migrate-seed.ts

echo "[Entrypoint] İlk Yönetici Hesabı (Kullanıcı) oluşturuluyor..."
bun run /app/server/src/scripts/seed-users.ts

echo "[Entrypoint] Sunucu başlatılıyor..."
exec bun run /app/server/src/index.ts
