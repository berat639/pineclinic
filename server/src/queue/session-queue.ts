import { Queue } from 'bullmq'
import { createBullMQRedis } from '../db/redis'

export type SessionJobData = {
  wsSessionId: string   // short UUID identifying the WS connection
  requestedAt: number   // Date.now() — for timeout detection
}

const connection = createBullMQRedis()

export const sessionQueue = new Queue<SessionJobData>('voice-session-init', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,   // keep last 100 completed jobs
    removeOnFail: 50,
    attempts: 1,             // no retry — WS may have disconnected
  },
})

// Add a session to the queue — returns job ID
export async function enqueueSession(wsSessionId: string): Promise<string> {
  const job = await sessionQueue.add(
    'init',
    { wsSessionId, requestedAt: Date.now() },
    { jobId: `session:${wsSessionId}` }  // deduplicate by wsSessionId
  )
  return job.id ?? wsSessionId
}

// Get position of a job in the queue (1-indexed, 0 = not found)
export async function getQueuePosition(wsSessionId: string): Promise<number> {
  const waiting = await sessionQueue.getWaiting()
  const idx = waiting.findIndex((j) => j.data.wsSessionId === wsSessionId)
  return idx === -1 ? 0 : idx + 1
}

// Remove a session from the queue (e.g., WS disconnected while waiting)
export async function dequeueSession(wsSessionId: string): Promise<void> {
  const job = await sessionQueue.getJob(`session:${wsSessionId}`)
  if (job) await job.remove()
}

// Get queue stats for admin API
export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    sessionQueue.getWaitingCount(),
    sessionQueue.getActiveCount(),
    sessionQueue.getCompletedCount(),
    sessionQueue.getFailedCount(),
  ])
  return { waiting, active, completed, failed }
}

export async function closeQueue(): Promise<void> {
  await sessionQueue.close()
  await connection.quit()
}
