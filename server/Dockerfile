FROM oven/bun:1-slim AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN bun install --frozen-lockfile

# Build/runtime stage
FROM base AS runner
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY package.json ./
COPY server/ ./server/
# Shared, dependency-free pricing rules are used by both server and client.
COPY client/lib/treatment-pricing.ts ./client/lib/treatment-pricing.ts
COPY client/lib/notification-channels.ts ./client/lib/notification-channels.ts
COPY data/ ./data/

RUN chmod +x /app/server/docker-entrypoint.sh

# HTTP/WS (3001) ve telephony AudioSocket TCP (12000) portları
EXPOSE 3001
EXPOSE 12000

ENTRYPOINT ["/app/server/docker-entrypoint.sh"]
