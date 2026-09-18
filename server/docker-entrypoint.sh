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

# Dokploy tüm uygulamaları ortak bir Docker ağına bağlayabilir. Bu durumda
# "postgres" ve "redis" gibi genel DNS adları başka stack'lerle çakışır.
# Mevcut URL'lerdeki kullanıcı, parola ve veritabanını koruyup yalnızca hostu
# bu stack'e özel network alias'ına taşı.
if [ -n "${POSTGRES_HOST_OVERRIDE:-}" ]; then
  export DATABASE_URL="$(bun -e '
    const url = new URL(process.env.DATABASE_URL)
    url.hostname = process.env.POSTGRES_HOST_OVERRIDE
    process.stdout.write(url.toString())
  ')"
  echo "[Entrypoint] PostgreSQL host override uygulandı: ${POSTGRES_HOST_OVERRIDE}"
fi

if [ -n "${REDIS_URL:-}" ] && [ -n "${REDIS_HOST_OVERRIDE:-}" ]; then
  export REDIS_URL="$(bun -e '
    const url = new URL(process.env.REDIS_URL)
    url.hostname = process.env.REDIS_HOST_OVERRIDE
    process.stdout.write(url.toString())
  ')"
  echo "[Entrypoint] Redis host override uygulandı: ${REDIS_HOST_OVERRIDE}"
fi

# Some hosting networks intermittently block outbound DNS from Docker overlay
# networks. Allow deployments to pin the Gemini API hostname to a known-good
# address without baking infrastructure-specific IPs into the image.
if [ -n "${GEMINI_API_IP:-}" ]; then
  GEMINI_API_HOST="${GEMINI_API_HOST:-generativelanguage.googleapis.com}"
  if ! grep -q "[[:space:]]${GEMINI_API_HOST}$" /etc/hosts; then
    if printf '%s\t%s\n' "$GEMINI_API_IP" "$GEMINI_API_HOST" >> /etc/hosts; then
      echo "[Entrypoint] Gemini API hostname eşlemesi eklendi."
    else
      echo "[Entrypoint] UYARI: Gemini API hostname eşlemesi eklenemedi."
    fi
  fi
fi

echo "[Entrypoint] DB migration çalıştırılıyor..."
bun run /app/server/src/db/migrate.ts

echo "[Entrypoint] DB Seed (Temel veriler) çalıştırılıyor..."
bun run /app/server/src/scripts/migrate-seed.ts

echo "[Entrypoint] İlk Yönetici Hesabı (Kullanıcı) oluşturuluyor..."
bun run /app/server/src/scripts/seed-users.ts

echo "[Entrypoint] Sunucu başlatılıyor..."
exec bun run /app/server/src/index.ts
