import { eq, desc, and, gte, lte } from 'drizzle-orm'
import { db } from '../client'
import { appointments } from '../schema'
import { broadcastSSE } from '../../events'

export interface Appointment {
  id: string
  createdAt: string
  customerName: string
  phone: string
  type: string
  vehicleInfo?: string | null
  issueOrRequest?: string | null
  date: string
  time: string
  sessionId?: string | null
  calendarEventId?: string | null
  ataHsysId?: string | null
  discountRequested?: boolean
  notes?: string | null
  extraFields?: Record<string, string> | null
}

function toIso(d: Date | null | undefined): string {
  return d ? d.toISOString() : ''
}

function rowToAppointment(r: typeof appointments.$inferSelect): Appointment {
  let extraFields: Record<string, string> | null = null
  if (r.extraFields) {
    try { extraFields = JSON.parse(r.extraFields) } catch { /* ignore */ }
  }
  return {
    id: r.id,
    createdAt: toIso(r.createdAt),
    customerName: r.customerName,
    phone: r.phone,
    type: r.type,
    vehicleInfo: r.vehicleInfo,
    issueOrRequest: r.issueOrRequest,
    date: r.date,
    time: r.time,
    sessionId: r.sessionId,
    calendarEventId: r.calendarEventId,
    ataHsysId: r.ataHsysId,
    discountRequested: r.discountRequested ?? false,
    notes: r.notes,
    extraFields,
  }
}

export async function readAppointments(): Promise<Appointment[]> {
  const rows = await db.select().from(appointments).orderBy(desc(appointments.createdAt))
  return rows.map(rowToAppointment)
}

export async function createAppointment(data: {
  customerName: string
  phone: string
  type: string
  vehicleInfo?: string
  issueOrRequest?: string
  date: string
  time: string
  sessionId?: string
  calendarEventId?: string
  discountRequested?: boolean
  notes?: string
  extraFields?: Record<string, string>
}): Promise<Appointment> {
  // sessionId varsa: aynı session için upsert
  if (data.sessionId) {
    const existing = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.sessionId, data.sessionId), eq(appointments.type, data.type)))
      .limit(1)
    if (existing.length > 0) {
      const [updated] = await db
        .update(appointments)
        .set({
          customerName: data.customerName,
          phone: data.phone,
          type: data.type,
          vehicleInfo: data.vehicleInfo ?? null,
          issueOrRequest: data.issueOrRequest ?? null,
          date: data.date,
          time: data.time,
          calendarEventId: data.calendarEventId ?? existing[0].calendarEventId ?? null,
          discountRequested: data.discountRequested ?? existing[0].discountRequested ?? false,
          notes: data.notes ?? existing[0].notes ?? null,
        })
        .where(eq(appointments.id, existing[0].id))
        .returning()
      const result = rowToAppointment(updated)
      try { broadcastSSE('new_appointment', result) } catch {}
      return result
    }
  }

  const [inserted] = await db
    .insert(appointments)
    .values({
      customerName: data.customerName,
      phone: data.phone,
      type: data.type,
      vehicleInfo: data.vehicleInfo ?? null,
      issueOrRequest: data.issueOrRequest ?? null,
      date: data.date,
      time: data.time,
      sessionId: data.sessionId ?? null,
      calendarEventId: data.calendarEventId ?? null,
      discountRequested: data.discountRequested ?? false,
      notes: data.notes ?? null,
      extraFields: data.extraFields ? JSON.stringify(data.extraFields) : null,
    })
    .returning()

  const result = rowToAppointment(inserted)
  try { broadcastSSE('new_appointment', result) } catch {}
  return result
}

export async function updateAppointment(
  id: string,
  data: Partial<Omit<Appointment, 'id' | 'createdAt'>>,
): Promise<Appointment | null> {
  const update: Record<string, unknown> = {}
  if (data.customerName !== undefined) update.customerName = data.customerName
  if (data.phone !== undefined) update.phone = data.phone
  if (data.type !== undefined) update.type = data.type
  if (data.vehicleInfo !== undefined) update.vehicleInfo = data.vehicleInfo
  if (data.issueOrRequest !== undefined) update.issueOrRequest = data.issueOrRequest
  if (data.date !== undefined) update.date = data.date
  if (data.time !== undefined) update.time = data.time
  if (data.sessionId !== undefined) update.sessionId = data.sessionId
  if (data.calendarEventId !== undefined) update.calendarEventId = data.calendarEventId
  if (data.ataHsysId !== undefined) update.ataHsysId = data.ataHsysId
  if (data.discountRequested !== undefined) update.discountRequested = data.discountRequested
  if (data.notes !== undefined) update.notes = data.notes

  if (Object.keys(update).length === 0) {
    const rows = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1)
    return rows[0] ? rowToAppointment(rows[0]) : null
  }

  const [row] = await db
    .update(appointments)
    .set(update as never)
    .where(eq(appointments.id, id))
    .returning()
  if (!row) return null
  const result = rowToAppointment(row)
  try { broadcastSSE('new_appointment', result) } catch {}
  return result
}

export async function deleteAppointment(id: string): Promise<boolean> {
  const rows = await db.delete(appointments).where(eq(appointments.id, id)).returning({ id: appointments.id })
  return rows.length > 0
}

// Customer context lookup — basit telefon eşleşmesi
export interface AppointmentSummary {
  type: string
  date: string
  time: string
  vehicleInfo?: string | null
  issueOrRequest?: string | null
  isPast: boolean
}

export interface CustomerContext {
  name: string
  phone: string
  appointmentHistory: AppointmentSummary[]
}

export async function getCustomerByPhone(phone: string): Promise<CustomerContext | null> {
  const normalizedPhone = phone.replace(/\D/g, '')
  if (normalizedPhone.length < 10) return null

  const rows = await db.select().from(appointments).orderBy(desc(appointments.date))
  const matches = rows.filter(r => r.phone.replace(/\D/g, '').endsWith(normalizedPhone.slice(-10)))
  if (matches.length === 0) return null

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  return {
    name: matches[0].customerName,
    phone: matches[0].phone,
    appointmentHistory: matches.map(a => ({
      type: a.type,
      date: a.date,
      time: a.time,
      vehicleInfo: a.vehicleInfo,
      issueOrRequest: a.issueOrRequest,
      isPast: a.date < today,
    })),
  }
}

export async function getAppointmentsByDateRange(params: {
  date?: string
  from?: string
  to?: string
}): Promise<Appointment[]> {
  const conditions = []
  if (params.date) {
    conditions.push(eq(appointments.date, params.date))
  } else {
    if (params.from) conditions.push(gte(appointments.date, params.from))
    if (params.to) conditions.push(lte(appointments.date, params.to))
  }
  if (conditions.length === 0) return []
  const rows = await db
    .select()
    .from(appointments)
    .where(and(...conditions))
    .orderBy(appointments.date)
  return rows.map(rowToAppointment)
}
