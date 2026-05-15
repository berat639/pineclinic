import Redis from 'ioredis'

function createRedisUrl(): string {
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL tanımlı değil')
  return url
}

// BullMQ connection — maxRetriesPerRequest null required by BullMQ
export function createBullMQRedis(): Redis {
  const client = new Redis(createRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    lazyConnect: true,
  })

  client.on('connect', () => console.log('[Redis:BullMQ] Bağlandı'))
  client.on('reconnecting', (ms: number) => console.warn(`[Redis:BullMQ] Yeniden bağlanıyor... ${ms}ms`))
  client.on('error', (err: Error) => console.error('[Redis:BullMQ] Hata:', err.message))
  client.on('close', () => console.warn('[Redis:BullMQ] Bağlantı kapandı'))

  return client
}

// General purpose client (distributed locking, health checks)
export const redisClient = new Redis(createRedisUrl(), {
  retryStrategy: (times) => Math.min(times * 100, 3000),
  lazyConnect: true,
})

redisClient.on('connect', () => console.log('[Redis] Bağlandı'))
redisClient.on('reconnecting', (ms: number) => console.warn(`[Redis] Yeniden bağlanıyor... ${ms}ms`))
redisClient.on('error', (err: Error) => console.error('[Redis] Hata:', err.message))
redisClient.on('close', () => console.warn('[Redis] Bağlantı kapandı'))

export async function checkRedisHealth(): Promise<boolean> {
  try {
    await redisClient.ping()
    return true
  } catch {
    return false
  }
}

export async function closeRedis(): Promise<void> {
  await redisClient.quit()
}
