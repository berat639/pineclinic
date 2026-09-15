import { db } from '../db/client'
import { clinicMemberships, notifications } from '../db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClinicId } from '../tenancy/context'

// In-memory SSE connections per userId
const sseClients = new Map<string, Set<(data: string) => void>>()

const clientKey = (clinicId: string, userId: string) => `${clinicId}:${userId}`

export function registerSSEClient(userId: string, send: (data: string) => void) {
  const key = clientKey(requireClinicId(), userId)
  if (!sseClients.has(key)) sseClients.set(key, new Set())
  sseClients.get(key)!.add(send)
  return () => { sseClients.get(key)?.delete(send) }
}

function pushToUser(clinicId: string, userId: string, event: object) {
  const clients = sseClients.get(clientKey(clinicId, userId))
  if (!clients) return
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const send of clients) send(data)
}

export async function notify(userId: string, type: string, title: string, body?: string, link?: string) {
  const clinicId = requireClinicId()
  const [n] = await db.insert(notifications).values({ clinicId, userId, type, title, body, link }).returning()
  pushToUser(clinicId, userId, { type: 'notification', payload: n })
  return n
}

export async function notifyRole(role: string, type: string, title: string, body?: string, link?: string) {
  const roleUsers = await db.select({ id: clinicMemberships.userId }).from(clinicMemberships)
    .where(and(eq(clinicMemberships.clinicId, requireClinicId()), eq(clinicMemberships.role, role), eq(clinicMemberships.active, true)))
  for (const u of roleUsers) {
    await notify(u.id, type, title, body, link)
  }
}

// doctorId IS the userId now (hekim user.id = doctor)
export async function notifyDoctorUser(doctorId: string, type: string, title: string, body?: string, link?: string) {
  await notify(doctorId, type, title, body, link)
}
