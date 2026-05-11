import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { randomUUID } from 'crypto'
import type { GoogleGenAI } from '@google/genai'
import { createLiveSession } from './gemini'
import { readAppointments, getCustomerByPhone } from './db'
import { buildSystemPrompt } from './services/customer'
import { adminPlugin } from './api/admin'
import { accountPool } from './accounts/pool'
import { acquire, release } from './accounts/router'
import { startSession, record, endSession, startFlushScheduler, shutdown as trackerShutdown } from './accounts/tracker'
import { enqueueSession, dequeueSession, closeQueue } from './queue/session-queue'
import { db, checkDbHealth, closeDb } from './db/client'
import { sql } from 'drizzle-orm'
import { checkRedisHealth, closeRedis } from './db/redis'

const PORT = Number(process.env.PORT) || 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000'
const IDLE_TIMEOUT_MS = 90_000

// Active Gemini sessions keyed by WS session ID
const sessions = new Map<string, Awaited<ReturnType<typeof createLiveSession>>>()
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

// In-process waiting queue: sessions waiting for an available account
type WaitEntry = { id: string; ws: { send: (data: unknown) => void; close: () => void }; phone: string }
const waitQueue: WaitEntry[] = []

function resetIdleTimer(id: string, ws: { close: () => void }) {
  const existing = idleTimers.get(id)
  if (existing) clearTimeout(existing)
  idleTimers.set(id, setTimeout(() => {
    console.log(`[${id}] Idle timeout — session kapatılıyor`)
    void cleanupSession(id)
    ws.close()
  }, IDLE_TIMEOUT_MS))
}

function clearIdleTimer(id: string) {
  const t = idleTimers.get(id)
  if (t) clearTimeout(t)
  idleTimers.delete(id)
}

// Map WS session ID → account ID (for release on close)
const sessionAccounts = new Map<string, string>()

async function cleanupSession(id: string) {
  clearIdleTimer(id)
  const session = sessions.get(id)
  try { session?.close() } catch {}
  sessions.delete(id)

  const accountId = sessionAccounts.get(id)
  if (accountId) {
    sessionAccounts.delete(id)
    await endSession(id).catch(() => {})
    await release(accountId).catch(() => {})
    // Wake up waiting queue after releasing a slot
    processWaitQueue()
  }
}

// Try to process next entry in the wait queue
function processWaitQueue() {
  const entry = waitQueue[0]
  if (!entry) return
  // Attempt to create session for the first waiter
  void (async () => {
    try {
      const { accountId, client } = await acquire()
      waitQueue.shift() // remove from queue
      await dequeueSession(entry.id).catch(() => {})
      await initSession(entry.id, entry.ws, accountId, client, entry.phone)
    } catch {
      // Still no slot available — leave waiters in queue silently
    }
  })()
}

async function initSession(
  id: string,
  ws: { send: (data: unknown) => void; close: () => void },
  accountId: string,
  client: GoogleGenAI,
  phone: string,
) {
  const dbSessionId = await startSession(id, accountId)
  sessionAccounts.set(id, accountId)

  // Look up customer history by phone for personalized greeting
  const customer = phone ? await getCustomerByPhone(phone).catch(() => null) : null
  const systemPrompt = buildSystemPrompt(customer)
  if (customer) {
    console.log(`[${id}] Müşteri bulundu: ${customer.name} (${customer.appointmentHistory.length} randevu)`)
  }

  const session = await createLiveSession(client, {
    onReady: () => {
      console.log(`[${id}] Gemini Live hazır (hesap: ${accountId.slice(0, 8)})`)
      ws.send(JSON.stringify({ type: 'ready' }))
    },
    onAudio: (pcm) => ws.send(pcm),
    onTranscript: (role, text) => ws.send(JSON.stringify({ type: 'transcript', role, text })),
    onInterrupted: () => ws.send(JSON.stringify({ type: 'interrupted' })),
    onTurnComplete: () => ws.send(JSON.stringify({ type: 'turn_complete' })),
    onUsage: (usage) => record(id, {
      promptTokenCount: usage.promptTokenCount,
      responseTokenCount: usage.candidatesTokenCount,
      totalTokenCount: usage.totalTokenCount,
    }),
    onError: (e) => console.error(`[${id}] Gemini hata:`, e),
    onClose: () => {
      console.log(`[${id}] Gemini session kapandı`)
      sessions.delete(id)
    },
  }, {
    dbSessionId,
    systemPrompt,
  })

  sessions.set(id, session)

  // Auto-greet — context-aware for returning customers
  const greetTrigger = customer
    ? `[KAYITLI MÜŞTERİ BAĞLANDI: ${customer.name}, Tel: ${phone}]`
    : '[KULLANICI BAĞLANDI]'

  session.sendClientContent({
    turns: [{ role: 'user', parts: [{ text: greetTrigger }] }],
    turnComplete: true,
  })

  console.log(`[${id}] Session başlatıldı (db: ${dbSessionId})`)
}

// Initialize all services before starting the server
async function bootstrap() {
  console.log('\n[Bootstrap] Servisler başlatılıyor...')

  const [dbOk, redisOk] = await Promise.all([checkDbHealth(), checkRedisHealth()])
  if (!dbOk) throw new Error('PostgreSQL bağlantısı başarısız')
  if (!redisOk) throw new Error('Redis bağlantısı başarısız')
  console.log('[Bootstrap] DB ve Redis ✓')

  // Reset stale concurrent_sessions counters from previous run (server crash/restart)
  await db.execute(sql`UPDATE account_usage SET concurrent_sessions = 0`)
  console.log('[Bootstrap] Stale concurrent_sessions sıfırlandı')

  await accountPool.initialize()
  if (accountPool.getAll().length === 0) {
    console.warn('[Bootstrap] UYARI: Hiç aktif hesap yok. Lütfen admin API ile hesap ekleyin.')
  }

  startFlushScheduler()
  console.log('[Bootstrap] Tüm servisler hazır\n')
}

// Graceful shutdown
async function gracefulShutdown() {
  console.log('\n[Shutdown] Kapatılıyor...')
  await trackerShutdown()
  await closeQueue()
  await closeDb()
  await closeRedis()
  console.log('[Shutdown] Tamamlandı')
  process.exit(0)
}

process.on('SIGTERM', () => void gracefulShutdown())
process.on('SIGINT', () => void gracefulShutdown())

// Start bootstrap then listen
await bootstrap()

const app = new Elysia()
  .use(cors({ origin: CORS_ORIGIN }))
  .use(adminPlugin)

  .get('/api/appointments', async () => readAppointments())

  .ws('/ws', {
    async open(ws) {
      const id = randomUUID().slice(0, 8)
      const phone = (ws.data as unknown as { query: { phone?: string } }).query?.phone ?? ''
      console.log(`[${id}] Client bağlandı${phone ? ` (tel: ${phone})` : ''}`)
      ;(ws.data as Record<string, unknown>).sessionId = id

      try {
        const { accountId, client } = await acquire()
        await initSession(id, ws, accountId, client, phone)
        resetIdleTimer(id, ws)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg === 'NO_ACCOUNT_AVAILABLE') {
          console.warn(`[${id}] Tüm hesaplar dolu — kuyruğa ekleniyor`)
          waitQueue.push({ id, ws, phone })
          await enqueueSession(id).catch(() => {})
        } else {
          console.error(`[${id}] Session başlatma hatası:`, err)
          ws.send(JSON.stringify({ type: 'error', message: 'Session başlatılamadı' }))
          ws.close()
        }
      }
    },

    message(ws, message) {
      const id = (ws.data as Record<string, unknown>).sessionId as string
      const session = sessions.get(id)
      if (!session) return

      if (message instanceof Buffer || message instanceof Uint8Array) {
        const buf = Buffer.isBuffer(message) ? message : Buffer.from(message)
        session.sendRealtimeInput({
          media: { data: buf.toString('base64'), mimeType: 'audio/pcm;rate=16000' },
        })
        resetIdleTimer(id, ws)
      }
    },

    close(ws) {
      const id = (ws.data as Record<string, unknown>).sessionId as string
      // Remove from wait queue if they were waiting
      const waitIdx = waitQueue.findIndex(e => e.id === id)
      if (waitIdx !== -1) {
        waitQueue.splice(waitIdx, 1)
        void dequeueSession(id).catch(() => {})
      }
      void cleanupSession(id)
      console.log(`[${id}] Bağlantı kesildi`)
    },
  })

  .listen(PORT, () => {
    console.log(` Voice AI Server`)
    console.log(`   http://localhost:${PORT}`)
    console.log(`   ws://localhost:${PORT}/ws`)
    console.log(`   Admin: http://localhost:${PORT}/api/admin`)
    console.log(`   Model: ${process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio'}\n`)
  })

export type App = typeof app
