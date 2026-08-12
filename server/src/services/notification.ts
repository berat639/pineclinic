import { db } from '../db/client'
import { notifications, users } from '../db/schema'
import { eq } from 'drizzle-orm'

// In-memory SSE connections per userId
const sseClients = new Map<string, Set<(data: string) => void>>()

export function registerSSEClient(userId: string, send: (data: string) => void) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set())
  sseClients.get(userId)!.add(send)
  return () => { sseClients.get(userId)?.delete(send) }
}

function pushToUser(userId: string, event: object) {
  const clients = sseClients.get(userId)
  if (!clients) return
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const send of clients) send(data)
}

export async function notify(userId: string, type: string, title: string, body?: string, link?: string) {
  const [n] = await db.insert(notifications).values({ userId, type, title, body, link }).returning()
  pushToUser(userId, { type: 'notification', payload: n })
  return n
}

export async function notifyRole(role: string, type: string, title: string, body?: string, link?: string) {
  const roleUsers = await db.select({ id: users.id }).from(users).where(eq(users.role, role))
  for (const u of roleUsers) {
    await notify(u.id, type, title, body, link)
  }
}

// doctorId IS the userId now (hekim user.id = doctor)
export async function notifyDoctorUser(doctorId: string, type: string, title: string, body?: string, link?: string) {
  await notify(doctorId, type, title, body, link)
}
