import { eq, desc, and, gte, lte, sql, ilike, or } from 'drizzle-orm'
import { db } from '../client'
import {
  users,
  patients,
  dentalAppointments,
  treatmentPlans,
  patientPayments,
  completedWorks,
} from '../schema'

// ── Doctors (hekim users) ────────────────────────────────────────────────────

export async function listDoctors() {
  return db.select({ id: users.id, name: users.name, specialty: users.specialty, color: users.color, active: users.active })
    .from(users).where(eq(users.role, 'hekim'))
}

export async function createDoctor(data: { name: string; specialty: string; color?: string }) {
  // Legacy compat — creates a hekim user with a generated email
  const hash = await Bun.password.hash('Hekim123!')
  const [row] = await db.insert(users).values({
    email: `hekim.${Date.now()}@klinik.com`,
    passwordHash: hash,
    name: data.name,
    role: 'hekim',
    specialty: data.specialty,
    color: data.color ?? '#60a5fa',
  }).returning()
  return { id: row!.id, name: row!.name, specialty: row!.specialty, color: row!.color, active: row!.active }
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
  doctorId: string | null
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

export async function deleteDentalAppointment(id: string): Promise<boolean> {
  const rows = await db.delete(dentalAppointments).where(eq(dentalAppointments.id, id)).returning({ id: dentalAppointments.id })
  return rows.length > 0
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
  toothNumber?: string
  indication?: string
  cost: number
  status?: string
  clinicId?: string
  isPeriodic?: boolean
  periodDays?: number
  nextNotificationDate?: string
  notifyPatient?: boolean
  notificationType?: string
}) {
  const [row] = await db.insert(treatmentPlans).values({
    patientId: data.patientId,
    procedureName: data.procedureName,
    toothNumber: data.toothNumber,
    indication: data.indication,
    cost: data.cost,
    status: data.status ?? 'planned',
    clinicId: data.clinicId,
    isPeriodic: data.isPeriodic ?? false,
    periodDays: data.periodDays,
    nextNotificationDate: data.nextNotificationDate,
    notifyPatient: data.notifyPatient ?? false,
    notificationType: data.notificationType ?? 'sms',
  }).returning()
  return row
}

export async function updateTreatmentPlan(id: string, data: { status?: string }) {
  const [row] = await db.update(treatmentPlans)
    .set({ status: data.status })
    .where(eq(treatmentPlans.id, id))
    .returning()
  return row ?? null
}

export async function deleteTreatmentPlan(id: string): Promise<boolean> {
  const rows = await db.delete(treatmentPlans).where(eq(treatmentPlans.id, id)).returning({ id: treatmentPlans.id })
  return rows.length > 0
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
  status?: string
  dueDate?: string
  treatmentPlanId?: string
}) {
  const [row] = await db.insert(patientPayments).values({
    patientId: data.patientId,
    date: data.date,
    amount: data.amount,
    method: data.method,
    notes: data.notes ?? null,
    status: data.status ?? 'completed',
    dueDate: data.dueDate ?? null,
    treatmentPlanId: data.treatmentPlanId ?? null,
  }).returning()
  return row
}

export async function listAllPayments(opts?: {
  page?: number
  pageSize?: number
  status?: string
  search?: string
}) {
  const page = Math.max(1, Number(opts?.page || 1))
  const pageSize = Math.min(100, Math.max(1, Number(opts?.pageSize || 25)))
  const offset = (page - 1) * pageSize

  const conditions: any[] = []
  if (opts?.status && opts.status !== 'all') {
    conditions.push(eq(patientPayments.status, opts.status))
  }
  if (opts?.search && opts.search.trim()) {
    const q = `%${opts.search.trim()}%`
    conditions.push(or(ilike(patients.name, q), ilike(patients.phone, q)))
  }

  const whereExpr = conditions.length ? and(...conditions) : undefined

  const countQuery = db
    .select({ total: sql<number>`count(*)::int` })
    .from(patientPayments)
    .innerJoin(patients, eq(patientPayments.patientId, patients.id))

  const countRows = whereExpr ? await countQuery.where(whereExpr) : await countQuery
  const total = countRows[0]?.total ?? 0

  const dataQuery = db
    .select({
      id: patientPayments.id,
      patientId: patientPayments.patientId,
      patientName: patients.name,
      patientPhone: patients.phone,
      date: patientPayments.date,
      amount: patientPayments.amount,
      method: patientPayments.method,
      notes: patientPayments.notes,
      status: patientPayments.status,
      dueDate: patientPayments.dueDate,
      createdAt: patientPayments.createdAt,
      treatmentPlanId: patientPayments.treatmentPlanId,
      treatmentProcedureName: treatmentPlans.procedureName,
      treatmentIndication: treatmentPlans.indication,
      treatmentToothNumber: treatmentPlans.toothNumber,
    })
    .from(patientPayments)
    .innerJoin(patients, eq(patientPayments.patientId, patients.id))
    .leftJoin(treatmentPlans, eq(patientPayments.treatmentPlanId, treatmentPlans.id))
    .orderBy(desc(patientPayments.createdAt))
    .limit(pageSize)
    .offset(offset)

  const items = whereExpr ? await dataQuery.where(whereExpr) : await dataQuery

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function updatePayment(id: string, data: {
  date?: string
  amount?: number
  method?: string
  notes?: string
  status?: string
  dueDate?: string | null
  treatmentPlanId?: string | null
}) {
  const values: Record<string, unknown> = {}
  if (data.date !== undefined) values.date = data.date
  if (data.amount !== undefined) values.amount = data.amount
  if (data.method !== undefined) values.method = data.method
  if (data.notes !== undefined) values.notes = data.notes
  if (data.status !== undefined) values.status = data.status
  if (data.dueDate !== undefined) values.dueDate = data.dueDate
  if (data.treatmentPlanId !== undefined) values.treatmentPlanId = data.treatmentPlanId
  if (Object.keys(values).length === 0) return null
  const [row] = await db.update(patientPayments).set(values).where(eq(patientPayments.id, id)).returning()
  return row ?? null
}

export async function deletePayment(id: string): Promise<boolean> {
  const rows = await db.delete(patientPayments).where(eq(patientPayments.id, id)).returning({ id: patientPayments.id })
  return rows.length > 0
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
  doctorId?: string | null
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

  const startTime = new Date(`${data.date}T${data.time}:00+03:00`)

  if (data.doctorId) {
    // Existing patient flow: 15min, time not confirmed
    const endTime = new Date(startTime.getTime() + 15 * 60_000)
    const [row] = await db.insert(dentalAppointments).values({
      patientId: patient.id,
      doctorId: data.doctorId,
      title: `${data.customerName} - ${data.type}`,
      startTime,
      endTime,
      status: 'scheduled',
      type: data.type,
      notes: data.notes ?? null,
      timeConfirmed: false,
    }).returning()
    return row
  }

  // New patient flow: no doctor, pending assignment, 30min
  const endTime = new Date(startTime.getTime() + 30 * 60_000)
  const [row] = await db.insert(dentalAppointments).values({
    patientId: patient.id,
    doctorId: null,
    title: `${data.customerName} - ${data.type}`,
    startTime,
    endTime,
    status: 'pending_assignment',
    type: data.type || 'kontrol',
    notes: data.notes ?? null,
    timeConfirmed: true,
  }).returning()
  return row
}

// ── Patient Doctor History ───────────────────────────────────────────────────

export async function getPatientDoctorHistory(phone: string) {
  const [patient] = await db.select().from(patients)
    .where(eq(patients.phone, phone)).limit(1)
  if (!patient) return []

  const appts = await db
    .select({
      doctorId: dentalAppointments.doctorId,
      doctorName: users.name,
      startTime: dentalAppointments.startTime,
      type: dentalAppointments.type,
    })
    .from(dentalAppointments)
    .innerJoin(users, eq(dentalAppointments.doctorId, users.id))
    .where(eq(dentalAppointments.patientId, patient.id))
    .orderBy(desc(dentalAppointments.startTime))

  // Deduplicate by doctor, keep most recent
  const seen = new Map<string, { doktor_id: string; doktor_adi: string; son_tedavi: string; islem: string }>()
  for (const a of appts) {
    if (!a.doctorId || seen.has(a.doctorId)) continue
    seen.set(a.doctorId, {
      doktor_id: a.doctorId,
      doktor_adi: a.doctorName,
      son_tedavi: a.startTime.toISOString().split('T')[0],
      islem: a.type,
    })
  }
  return [...seen.values()]
}

// ── Update Dental Appointment ────────────────────────────────────────────────

export async function updateDentalAppointment(id: string, data: {
  doctorId?: string | null
  timeConfirmed?: boolean
  status?: string
  startTime?: Date
  endTime?: Date
  notes?: string
}) {
  const values: Record<string, unknown> = {}
  if (data.doctorId !== undefined) values.doctorId = data.doctorId
  if (data.timeConfirmed !== undefined) values.timeConfirmed = data.timeConfirmed
  if (data.status !== undefined) values.status = data.status
  if (data.startTime !== undefined) values.startTime = data.startTime
  if (data.endTime !== undefined) values.endTime = data.endTime
  if (data.notes !== undefined) values.notes = data.notes
  if (Object.keys(values).length === 0) return null
  const [row] = await db.update(dentalAppointments)
    .set(values)
    .where(eq(dentalAppointments.id, id))
    .returning()
  return row ?? null
}
