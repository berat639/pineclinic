FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY client/package.json ./package.json
RUN bun install

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY client/ ./

ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BACKEND_URL=""
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

ARG NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

ARG SERVER_URL=http://localhost:3001
ENV SERVER_URL=$SERVER_URL

ARG BACKEND_PROXY_URL=http://localhost:3001
ENV BACKEND_PROXY_URL=$BACKEND_PROXY_URL

RUN rm -f .env && bun run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
