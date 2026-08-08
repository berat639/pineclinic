import { eq, desc, and, gte, lte } from 'drizzle-orm'
import { db } from '../client'
import {
  doctors,
  patients,
  dentalAppointments,
  treatmentPlans,
  patientPayments,
  completedWorks,
} from '../schema'

// ── Doctors ──────────────────────────────────────────────────────────────────

export async function listDoctors() {
  return db.select().from(doctors).where(eq(doctors.active, true))
}

// ── Dental Appointments ──────────────────────────────────────────────────────

export async function listDentalAppointments(dateStr?: string) {
  if (dateStr) {
    const dayStart = new Date(`${dateStr}T00:00:00+03:00`)
    const dayEnd = new Date(`${dateStr}T23:59:59+03:00`)
    return db
      .select()
      .from(dentalAppointments)
      .where(and(gte(dentalAppointments.startTime, dayStart), lte(dentalAppointments.startTime, dayEnd)))
      .orderBy(dentalAppointments.startTime)
  }
  return db.select().from(dentalAppointments).orderBy(dentalAppointments.startTime)
}

export async function createDentalAppointment(data: {
  patientId: string
  doctorId: string
  title: string
  startTime: Date
  endTime: Date
  status?: string
  type?: string
  notes?: string
}) {
  const [row] = await db.insert(dentalAppointments).values({
    patientId: data.patientId,
    doctorId: data.doctorId,
    title: data.title,
    startTime: data.startTime,
    endTime: data.endTime,
    status: data.status ?? 'scheduled',
    type: data.type ?? 'general',
    notes: data.notes ?? null,
  }).returning()
  return row
}

// ── Patients ─────────────────────────────────────────────────────────────────

export async function getPatient(id: string) {
  const [row] = await db.select().from(patients).where(eq(patients.id, id)).limit(1)
  return row ?? null
}

export async function listPatients() {
  return db.select().from(patients).orderBy(desc(patients.createdAt))
}

export async function createPatient(data: { name: string; phone?: string; balance?: number }) {
  const [row] = await db.insert(patients).values({
    name: data.name,
    phone: data.phone ?? null,
    balance: data.balance ?? 0,
  }).returning()
  return row
}

// ── Treatment Plans ──────────────────────────────────────────────────────────

export async function getPatientTreatments(patientId: string) {
  return db.select().from(treatmentPlans).where(eq(treatmentPlans.patientId, patientId)).orderBy(desc(treatmentPlans.createdAt))
}

export async function createTreatmentPlan(data: {
  patientId: string
  procedureName: string
  cost: number
  status?: string
}) {
  const [row] = await db.insert(treatmentPlans).values({
    patientId: data.patientId,
    procedureName: data.procedureName,
    cost: data.cost,
    status: data.status ?? 'planned',
  }).returning()
  return row
}

// ── Payments ─────────────────────────────────────────────────────────────────

export async function getPatientPayments(patientId: string) {
  return db.select().from(patientPayments).where(eq(patientPayments.patientId, patientId)).orderBy(desc(patientPayments.createdAt))
}

export async function createPayment(data: {
  patientId: string
  date: string
  amount: number
  method: string
  notes?: string
}) {
  const [row] = await db.insert(patientPayments).values({
    patientId: data.patientId,
    date: data.date,
    amount: data.amount,
    method: data.method,
    notes: data.notes ?? null,
  }).returning()
  return row
}

// ── Completed Works ──────────────────────────────────────────────────────────

export async function getPatientCompletedWorks(patientId: string) {
  return db.select().from(completedWorks).where(eq(completedWorks.patientId, patientId)).orderBy(desc(completedWorks.createdAt))
}

export async function createCompletedWork(data: {
  patientId: string
  doctorId: string
  date: string
  description: string
}) {
  const [row] = await db.insert(completedWorks).values({
    patientId: data.patientId,
    doctorId: data.doctorId,
    date: data.date,
    description: data.description,
  }).returning()
  return row
}

// ── Voice → Calendar Sync ────────────────────────────────────────────────────

export async function createDentalAppointmentFromVoice(data: {
  customerName: string
  phone: string
  type: string
  date: string
  time: string
  notes?: string | null
}) {
  // Find or create patient
  let [patient] = await db.select().from(patients)
    .where(eq(patients.phone, data.phone)).limit(1)
  if (!patient) {
    [patient] = await db.insert(patients).values({
      name: data.customerName,
      phone: data.phone,
      balance: 0,
    }).returning()
  }

  // Assign to first active doctor (admin can reassign later)
  const [doctor] = await db.select().from(doctors)
    .where(eq(doctors.active, true)).limit(1)
  if (!doctor) return null

  const startTime = new Date(`${data.date}T${data.time}:00+03:00`)
  const endTime = new Date(startTime.getTime() + 30 * 60_000)

  const [row] = await db.insert(dentalAppointments).values({
    patientId: patient.id,
    doctorId: doctor.id,
    title: `${data.customerName} - ${data.type}`,
    startTime,
    endTime,
    status: 'scheduled',
    type: data.type,
    notes: data.notes ?? null,
  }).returning()
  return row
}
