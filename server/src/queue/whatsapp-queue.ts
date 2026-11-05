import { Queue, Worker } from 'bullmq'
import postgres from 'postgres'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { clinics, whatsappConversations, whatsappMessages } from '../db/schema'
import { createBullMQRedis } from '../db/redis'
import { processWhatsAppConversation } from '../services/whatsapp-conversation'

let stop: (() => Promise<void>) | undefined
let activeQueue: Queue<{ conversationId: string }> | undefined
let activeLocks: ReturnType<typeof postgres> | undefined

async function runWithConversationLock(locksPool: ReturnType<typeof postgres>, conversationId: string) {
  const connection = await locksPool.reserve()
  const identity = `whatsapp:${conversationId}`
  let acquired = false
  try {
    const [row] = await connection`SELECT pg_try_advisory_lock(hashtextextended(${identity}, 0)) AS acquired`
    acquired = Boolean(row?.acquired)
    if (acquired) await processWhatsAppConversation(conversationId)
  } finally {
    if (acquired) await connection`SELECT pg_advisory_unlock(hashtextextended(${identity}, 0))`
    connection.release()
  }
}

export async function triggerWhatsAppConversation(conversationId: string): Promise<void> {
  if (!conversationId) return
  if (activeQueue) {
    try {
      await activeQueue.add('process', { conversationId }, { jobId: `chat_${conversationId}` })
      return
    } catch {
      // Fallback to direct locked execution if Redis queue is unavailable
    }
  }
  if (activeLocks) {
    try {
      await runWithConversationLock(activeLocks, conversationId)
    } catch (err) {
      console.error('[WhatsApp] Doğrudan konuşma işleme hatası:', err)
    }
  }
}

/** PostgreSQL is the durable inbox/outbox. Redis only schedules work, so a Redis restart loses no messages. */
export function startWhatsAppWorker() {
  if (stop) return stop
  const producer = createBullMQRedis()
  const consumer = createBullMQRedis()
  const queue = new Queue<{ conversationId: string }>('whatsapp-conversations', { connection: producer,
    defaultJobOptions: { removeOnComplete: true, removeOnFail: true, attempts: 1 } })
  const locks = postgres(process.env.DATABASE_URL!, { max: 2, connect_timeout: 10 })
  activeQueue = queue
  activeLocks = locks
  const worker = new Worker<{ conversationId: string }>('whatsapp-conversations', async job => {
    await runWithConversationLock(locks, job.data.conversationId)
  }, { connection: consumer, concurrency: 2 })
  worker.on('error', () => console.error('[WhatsApp] Kuyruk bağlantısı kesildi; kayıtlar yeniden taranacak.'))
  worker.on('failed', () => console.error('[WhatsApp] İşlem kesildi; kalıcı kayıt yeniden taranacak.'))
  let scanning = false
  const scan = async () => {
    if (scanning) return
    scanning = true
    try {
      const pending = await db.selectDistinct({ id: whatsappMessages.conversationId }).from(whatsappMessages)
        .innerJoin(whatsappConversations, eq(whatsappMessages.conversationId, whatsappConversations.id))
        .innerJoin(clinics, eq(whatsappConversations.clinicId, clinics.id))
        .where(sql`${whatsappMessages.status} IN ('pending','processing','reply_ready','sending') AND ${whatsappMessages.availableAt} <= now()`).limit(200)
      for (const conversation of pending) {
        await triggerWhatsAppConversation(conversation.id)
      }
    } catch { console.error('[WhatsApp] Kuyruk taraması ertelendi.') } finally { scanning = false }
  }
  const interval = setInterval(() => { void scan() }, 5000)
  void scan()
  stop = async () => {
    clearInterval(interval)
    activeQueue = undefined
    activeLocks = undefined
    await worker.close()
    await queue.close()
    await Promise.all([producer.quit(), consumer.quit(), locks.end()])
    stop = undefined
  }
  const shutdown = () => { void stop?.() }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
  return stop
}
