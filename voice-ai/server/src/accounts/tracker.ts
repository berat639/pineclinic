// eslint-disable-next-line @typescript-eslint/no-require-imports
const Redlock = require('redlock') as new (clients: unknown[], options?: {
  retryCount?: number
  retryDelay?: number
  retryJitter?: number
  driftFactor?: number
}) => {
  lock(resource: string, ttl: number): Promise<{ unlock: () => Promise<void> }>
}
import { sql, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { redisClient } from '../db/redis'
import { sessions } from '../db/schema'

// Distributed lock for flush operations
const redlock = new Redlock([redisClient], {
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 50,
})

type SessionBuffer = {
  accountId: string
  dbSessionId: string
  promptTokens: number
  responseTokens: number
  totalTokens: number
}

// In-memory accumulator: wsSessionId → buffer
const buffer = new Map<string, SessionBuffer>()

let flushInterval: ReturnType<typeof setInterval> | null = null

export async function startSession(wsSessionId: string, accountId: string): Promise<string> {
  const [row] = await db.insert(sessions).values({
    accountId,
    status: 'active',
  }).returning({ id: sessions.id })

  buffer.set(wsSessionId, {
    accountId,
    dbSessionId: row.id,
    promptTokens: 0,
    responseTokens: 0,
    totalTokens: 0,
  })

  return row.id
}

export function record(wsSessionId: string, usage: {
  promptTokenCount?: number
  responseTokenCount?: number
  totalTokenCount?: number
}): void {
  const entry = buffer.get(wsSessionId)
  if (!entry) return
  entry.promptTokens += usage.promptTokenCount ?? 0
  entry.responseTokens += usage.responseTokenCount ?? 0
  entry.totalTokens += usage.totalTokenCount ?? 0
}

export async function endSession(wsSessionId: string): Promise<void> {
  const entry = buffer.get(wsSessionId)
  if (!entry) return
  buffer.delete(wsSessionId)

  await flushEntry(entry)

  await db.update(sessions)
    .set({ status: 'completed', endedAt: new Date(), totalTokens: entry.totalTokens })
    .where(eq(sessions.id, entry.dbSessionId))
}

async function flushEntry(entry: SessionBuffer): Promise<void> {
  if (entry.totalTokens === 0) return

  const today = new Date().toISOString().split('T')[0]!

  await db.execute(sql`
    INSERT INTO account_usage (account_id, date, prompt_tokens, response_tokens, total_tokens, session_count)
    VALUES (${entry.accountId}, ${today}, ${entry.promptTokens}, ${entry.responseTokens}, ${entry.totalTokens}, 1)
    ON CONFLICT (account_id, date) DO UPDATE SET
      prompt_tokens   = account_usage.prompt_tokens   + EXCLUDED.prompt_tokens,
      response_tokens = account_usage.response_tokens + EXCLUDED.response_tokens,
      total_tokens    = account_usage.total_tokens    + EXCLUDED.total_tokens,
      session_count   = account_usage.session_count   + 1
  `)
}

async function flushAll(): Promise<void> {
  if (buffer.size === 0) return

  const lockKey = 'lock:usage-flush'
  let lock

  try {
    lock = await redlock.lock(lockKey, 30_000)
  } catch {
    console.warn('[Tracker] Flush lock alınamadı, atlanıyor')
    return
  }

  try {
    const today = new Date().toISOString().split('T')[0]!

    const deltas = new Map<string, { prompt: number; response: number; total: number }>()

    for (const entry of buffer.values()) {
      if (entry.totalTokens === 0) continue
      const existing = deltas.get(entry.accountId) ?? { prompt: 0, response: 0, total: 0 }
      existing.prompt += entry.promptTokens
      existing.response += entry.responseTokens
      existing.total += entry.totalTokens
      deltas.set(entry.accountId, existing)
      entry.promptTokens = 0
      entry.responseTokens = 0
      entry.totalTokens = 0
    }

    for (const [accountId, delta] of deltas) {
      if (delta.total === 0) continue
      await db.execute(sql`
        INSERT INTO account_usage (account_id, date, prompt_tokens, response_tokens, total_tokens)
        VALUES (${accountId}, ${today}, ${delta.prompt}, ${delta.response}, ${delta.total})
        ON CONFLICT (account_id, date) DO UPDATE SET
          prompt_tokens   = account_usage.prompt_tokens   + EXCLUDED.prompt_tokens,
          response_tokens = account_usage.response_tokens + EXCLUDED.response_tokens,
          total_tokens    = account_usage.total_tokens    + EXCLUDED.total_tokens
      `)
    }
  } finally {
    await lock.unlock().catch(() => {})
  }
}

export function startFlushScheduler(): void {
  if (flushInterval) return
  flushInterval = setInterval(() => {
    flushAll().catch((err) => console.error('[Tracker] Flush hatası:', err))
  }, 30_000)
  console.log('[Tracker] 30s flush scheduler başlatıldı')
}

export function stopFlushScheduler(): void {
  if (flushInterval) {
    clearInterval(flushInterval)
    flushInterval = null
  }
}

export async function shutdown(): Promise<void> {
  stopFlushScheduler()
  await flushAll()
  console.log('[Tracker] Shutdown flush tamamlandı')
}
