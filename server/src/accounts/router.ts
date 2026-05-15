// eslint-disable-next-line @typescript-eslint/no-require-imports
const Redlock = require('redlock') as new (clients: unknown[], options?: {
  retryCount?: number
  retryDelay?: number
  retryJitter?: number
}) => {
  lock(resource: string, ttl: number): Promise<{ unlock: () => Promise<void> }>
}

import { sql } from 'drizzle-orm'
import { GoogleGenAI } from '@google/genai'
import { db } from '../db/client'
import { redisClient } from '../db/redis'
import { AsyncMutex } from '../utils/mutex'
import { accountPool } from './pool'

const redlock = new Redlock([redisClient], {
  retryCount: 5,
  retryDelay: 200,
  retryJitter: 50,
})

const acquireMutex = new AsyncMutex()

export type AcquiredAccount = {
  accountId: string
  client: GoogleGenAI
}

/**
 * Acquire an available account using 3-layer locking:
 * 1. In-process AsyncMutex — serializes concurrent acquire calls in same process
 * 2. Redis Redlock — prevents race across multiple server instances
 * 3. PostgreSQL FOR UPDATE SKIP LOCKED — database-level atomic reservation
 *
 * Throws 'NO_ACCOUNT_AVAILABLE' if all accounts are at capacity or quota limit.
 */
export async function acquire(): Promise<AcquiredAccount> {
  return acquireMutex.run(async () => {
    // Layer 2: distributed lock (5s TTL — enough for the DB transaction)
    const lock = await redlock.lock('lock:account-acquire', 5000)
    try {
      return await _acquireFromDb()
    } finally {
      await lock.unlock().catch(() => {})
    }
  })
}

async function _acquireFromDb(): Promise<AcquiredAccount> {
  const today = new Date().toISOString().split('T')[0]!

  // Layer 3: PostgreSQL FOR UPDATE SKIP LOCKED
  // Selects candidates sorted by priority DESC, then by concurrent sessions ASC (least loaded first)
  // FOR UPDATE SKIP LOCKED skips rows locked by other concurrent transactions
  const result = await db.execute(sql`
    SELECT
      a.id,
      a.name,
      a.max_concurrent_sessions,
      a.daily_token_limit,
      COALESCE(u.concurrent_sessions, 0) AS concurrent_sessions,
      COALESCE(u.total_tokens, 0) AS total_tokens_today
    FROM accounts a
    LEFT JOIN account_usage u
      ON u.account_id = a.id AND u.date = ${today}
    WHERE a.is_active = true
    ORDER BY a.priority DESC, COALESCE(u.concurrent_sessions, 0) ASC
    FOR UPDATE OF a SKIP LOCKED
  `)

  const candidates = result as unknown as Array<{
    id: string
    name: string
    max_concurrent_sessions: number
    daily_token_limit: number
    concurrent_sessions: number
    total_tokens_today: number
  }>

  for (const candidate of candidates) {
    // Skip if at concurrent session limit
    if (candidate.concurrent_sessions >= candidate.max_concurrent_sessions) continue
    // Skip if daily token quota exhausted (BIGINT returns as string from postgres.js — use Number())
    if (Number(candidate.total_tokens_today) >= Number(candidate.daily_token_limit)) continue

    // Atomic increment of concurrent_sessions via UPSERT
    await db.execute(sql`
      INSERT INTO account_usage (account_id, date, concurrent_sessions)
      VALUES (${candidate.id}, ${today}, 1)
      ON CONFLICT (account_id, date) DO UPDATE
        SET concurrent_sessions = account_usage.concurrent_sessions + 1
    `)

    const client = accountPool.get(candidate.id)
    if (!client) {
      // Pool doesn't have this account — undo the increment
      await db.execute(sql`
        UPDATE account_usage
        SET concurrent_sessions = GREATEST(0, concurrent_sessions - 1)
        WHERE account_id = ${candidate.id} AND date = ${today}
      `)
      continue
    }

    console.log(`[Router] Hesap secildi: ${candidate.name} (concurrent: ${candidate.concurrent_sessions + 1}/${candidate.max_concurrent_sessions})`)
    return { accountId: candidate.id, client }
  }

  throw new Error('NO_ACCOUNT_AVAILABLE')
}

/**
 * Release an account after a session ends.
 * Atomically decrements concurrent_sessions.
 * No lock needed — GREATEST(0, n-1) is always safe as an atomic decrement.
 */
export async function release(accountId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]!
  await db.execute(sql`
    UPDATE account_usage
    SET concurrent_sessions = GREATEST(0, concurrent_sessions - 1)
    WHERE account_id = ${accountId} AND date = ${today}
  `)
  console.log(`[Router] Hesap serbest birakildi: ${accountId}`)
}

/**
 * Check if any account is available without acquiring one.
 * Used by the queue worker to decide whether to process queued sessions.
 */
export async function hasAvailableAccount(): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0]!
  const result = await db.execute(sql`
    SELECT 1
    FROM accounts a
    LEFT JOIN account_usage u ON u.account_id = a.id AND u.date = ${today}
    WHERE a.is_active = true
      AND COALESCE(u.concurrent_sessions, 0) < a.max_concurrent_sessions
      AND COALESCE(u.total_tokens, 0) < a.daily_token_limit
    LIMIT 1
  `)
  return (result as unknown[]).length > 0
}
