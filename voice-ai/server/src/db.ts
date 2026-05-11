// server/src/db.ts — PostgreSQL backed
import { db } from './db/client'
import { sql } from 'drizzle-orm'
import { appointments } from './db/schema'
import { eq } from 'drizzle-orm'
import type { Appointment, NewAppointment } from './db/schema'
import { broadcastSSE } from './events'

export type { Appointment }

export type AppointmentSummary = {
  type: string
  date: string
  time: string
  vehicleInfo?: string | null
  issueOrRequest?: string | null
  isPast: boolean
}

export type CustomerContext = {
  name: string
  phone: string
  appointmentHistory: Array<{
    id: string
    type: string
    date: string
    time: string
    vehicleInfo: string | null
    issueOrRequest: string | null
    isPast: boolean
  }>
}

export async function readAppointments(): Promise<Appointment[]> {
  return db.select().from(appointments).orderBy(appointments.createdAt)
}

/**
 * Create or update an appointment.
 * If sessionId is provided: UPSERT by session_id (prevents duplicates within a session).
 * If no sessionId: plain INSERT.
 */
export async function createAppointment(data: {
  customerName: string
  phone: string
  type: string
  vehicleInfo?: string
  issueOrRequest?: string
  date: string
  time: string
  sessionId?: string
}): Promise<Appointment> {
  if (data.sessionId) {
    // Check if appointment already exists for this session
    const existing = await db.select()
      .from(appointments)
      .where(eq(appointments.sessionId, data.sessionId))
      .limit(1)

    if (existing.length > 0) {
      // UPDATE existing appointment
      const [row] = await db.update(appointments)
        .set({
          customerName: data.customerName,
          phone: data.phone,
          type: data.type,
          vehicleInfo: data.vehicleInfo ?? null,
          issueOrRequest: data.issueOrRequest ?? null,
          date: data.date,
          time: data.time,
        })
        .where(eq(appointments.sessionId, data.sessionId))
        .returning()
      broadcastSSE('new_appointment', row)
      return row
    }
  }

  // INSERT new appointment
  const [row] = await db.insert(appointments).values({
    customerName: data.customerName,
    phone: data.phone,
    type: data.type,
    vehicleInfo: data.vehicleInfo ?? null,
    issueOrRequest: data.issueOrRequest ?? null,
    date: data.date,
    time: data.time,
    sessionId: data.sessionId ?? null,
  }).returning()
  broadcastSSE('new_appointment', row)
  return row
}

/**
 * Look up customer by phone number.
 * Returns their name (from most recent appointment) and appointment history.
 */
export async function getCustomerByPhone(phone: string): Promise<CustomerContext | null> {
  const rows = await db.select()
    .from(appointments)
    .where(eq(appointments.phone, phone))
    .orderBy(sql`created_at DESC`)
    .limit(10)

  if (rows.length === 0) return null

  const today = new Date().toISOString().split('T')[0]!

  return {
    name: rows[0]!.customerName,
    phone,
    appointmentHistory: rows.map(r => ({
      id: r.id,
      type: r.type,
      date: r.date,
      time: r.time,
      vehicleInfo: r.vehicleInfo ?? null,
      issueOrRequest: r.issueOrRequest ?? null,
      isPast: r.date < today,
    })),
  }
}
