import { eq, desc, and, gte, lte, sql, ilike, or } from 'drizzle-orm'
import { db } from '../client'
import {
  users,
  patients,
  dentalAppointments,
  treatmentPlans,
  treatmentGroups,
  patientPayments,
  completedWorks,
  businessSettings,
  notificationTemplates,
  consultations
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

export async function getPatientFullProfile(patientId: string) {
  const {
    patientAnamnesis,
    patientDiseases,
    dentalAppointments,
    treatmentPlans,
    treatmentGroups,
    patientPayments,
    completedWorks,
    consultations,
    doctorNotes,
    toothRecords,
    materialUsages,
    inventoryItems,
    users
  } = await import('../schema')

  const [
    patientRes,
    anamnesisRes,
    diseasesRes,
    appointmentsRes,
    treatmentsRes,
    groupsRes,
    paymentsRes,
    completedRes,
    consultationsRes,
    notesRes,
    toothRecordsRes,
    materialsRes
  ] = await Promise.all([
    // Patient
    db.select().from(patients).where(eq(patients.id, patientId)).limit(1),
    
    // Anamnesis
    db.select({ formData: patientAnamnesis.formData, filledAt: patientAnamnesis.filledAt })
      .from(patientAnamnesis).where(eq(patientAnamnesis.patientId, patientId)).orderBy(desc(patientAnamnesis.filledAt)).limit(1),

    // Diseases
    db.select({ name: patientDiseases.name, status: patientDiseases.status, notes: patientDiseases.notes })
      .from(patientDiseases).where(eq(patientDiseases.patientId, patientId)),

    // Appointments (visit dates)
    db.select({
        id: dentalAppointments.id,
        startTime: dentalAppointments.startTime,
        status: dentalAppointments.status,
      })
      .from(dentalAppointments)
      .where(eq(dentalAppointments.patientId, patientId))
      .orderBy(desc(dentalAppointments.startTime)),

    // Treatment Plans
    db.select({
      id: treatmentPlans.id,
      procedureName: treatmentPlans.procedureName,
      toothNumber: treatmentPlans.toothNumber,
      cost: treatmentPlans.cost,
      status: treatmentPlans.status,
      createdAt: treatmentPlans.createdAt,
      doctorName: users.name
    })
    .from(treatmentPlans)
    .leftJoin(users, eq(treatmentPlans.doctorId, users.id))
    .where(eq(treatmentPlans.patientId, patientId))
    .orderBy(desc(treatmentPlans.createdAt)),

    // Treatment Groups
    db.select({ id: treatmentGroups.id, name: treatmentGroups.name, status: treatmentGroups.status })
      .from(treatmentGroups).where(eq(treatmentGroups.patientId, patientId)),

    // Payments (dates only)
    db.select({ date: patientPayments.date })
      .from(patientPayments).where(eq(patientPayments.patientId, patientId)).orderBy(desc(patientPayments.date)),

    // Completed Works
    db.select({ id: completedWorks.id, date: completedWorks.date, description: completedWorks.description, doctorName: users.name })
      .from(completedWorks).leftJoin(users, eq(completedWorks.doctorId, users.id))
      .where(eq(completedWorks.patientId, patientId)).orderBy(desc(completedWorks.date)),

    // Consultations
    db.select({ id: consultations.id, consultationNote: consultations.consultationNote, diseaseNote: consultations.diseaseNote, createdAt: consultations.createdAt, doctorName: users.name })
      .from(consultations).leftJoin(users, eq(consultations.doctorId, users.id))
      .where(eq(consultations.patientId, patientId)).orderBy(desc(consultations.createdAt)),

    // Doctor Notes
    db.select({ id: doctorNotes.id, content: doctorNotes.content, createdAt: doctorNotes.createdAt, doctorName: users.name })
      .from(doctorNotes).leftJoin(users, eq(doctorNotes.doctorId, users.id))
      .where(eq(doctorNotes.patientId, patientId)).orderBy(desc(doctorNotes.createdAt)),

    // Tooth Records
    db.select({ toothNumber: toothRecords.toothNumber, surface: toothRecords.surface, condition: toothRecords.condition, date: toothRecords.date })
      .from(toothRecords).where(eq(toothRecords.patientId, patientId)).orderBy(desc(toothRecords.date)),

    // Material Usages
    db.select({ date: materialUsages.date, quantity: materialUsages.quantity, itemName: inventoryItems.name })
      .from(materialUsages).leftJoin(inventoryItems, eq(materialUsages.inventoryItemId, inventoryItems.id))
      .where(eq(materialUsages.patientId, patientId)).orderBy(desc(materialUsages.date)),
  ])

  const patient = patientRes[0]
  if (!patient) return null

  const visitDates = appointmentsRes.filter(a => a.status === 'completed' || a.status === 'confirmed').map(a => a.startTime)
  const totalVisits = visitDates.length
  
  const sortedVisits = [...visitDates].sort((a, b) => a.getTime() - b.getTime())
  const firstVisit = sortedVisits.length > 0 ? sortedVisits[0].toISOString() : null
  const lastVisit = sortedVisits.length > 0 ? sortedVisits[sortedVisits.length - 1].toISOString() : null

  let avgVisitFrequencyDays = null
  if (sortedVisits.length > 1) {
    const diffMs = sortedVisits[sortedVisits.length - 1].getTime() - sortedVisits[0].getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    avgVisitFrequencyDays = Math.round(diffDays / (sortedVisits.length - 1))
  }

  const doctorCounts: Record<string, number> = {}
  completedRes.forEach(c => {
    if (c.doctorName) doctorCounts[c.doctorName] = (doctorCounts[c.doctorName] || 0) + 1
  })
  let topDoctor = null
  let maxCount = 0
  for (const [doc, count] of Object.entries(doctorCounts)) {
    if (count > maxCount) { maxCount = count; topDoctor = doc }
  }

  const totalTreatments = treatmentsRes.length
  const completedTreatments = treatmentsRes.filter(t => t.status === 'completed' || t.status === 'yapıldı' || t.status === '✓ Tamamlandı' || t.status === 'tamamlandı').length
  const treatmentCompletionRate = totalTreatments > 0 ? Math.round((completedTreatments / totalTreatments) * 100) : 0

  return {
    patient,
    anamnesis: anamnesisRes[0] ?? null,
    diseases: diseasesRes,
    appointments: appointmentsRes,
    treatments: treatmentsRes,
    treatmentGroups: groupsRes,
    payments: paymentsRes,
    completedWorks: completedRes,
    consultations: consultationsRes,
    doctorNotes: notesRes,
    toothRecords: toothRecordsRes,
    materialUsages: materialsRes,
    stats: {
      totalVisits,
      firstVisit,
      lastVisit,
      avgVisitFrequencyDays,
      topDoctor,
      treatmentCompletionRate
    }
  }
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

// ── Treatment Groups ─────────────────────────────────────────────────────────

export async function getPatientTreatmentGroups(patientId: string) {
  const groups = await db.select().from(treatmentGroups)
    .where(eq(treatmentGroups.patientId, patientId))
    .orderBy(desc(treatmentGroups.createdAt))
  
  // For each group, fetch its treatment plans
  const result = []
  for (const group of groups) {
    const plans = await db.select().from(treatmentPlans)
      .where(and(eq(treatmentPlans.patientId, patientId), eq(treatmentPlans.groupId, group.id)))
      .orderBy(desc(treatmentPlans.createdAt))
    result.push({ ...group, treatments: plans })
  }
  
  // Also fetch ungrouped treatments
  const ungrouped = await db.select().from(treatmentPlans)
    .where(and(eq(treatmentPlans.patientId, patientId), sql`group_id IS NULL`))
    .orderBy(desc(treatmentPlans.createdAt))
  
  return { groups: result, ungrouped }
}

export async function createTreatmentGroup(data: {
  patientId: string
  name: string
  description?: string
}) {
  const [row] = await db.insert(treatmentGroups).values({
    patientId: data.patientId,
    name: data.name,
    description: data.description,
  }).returning()
  return row
}

export async function updateTreatmentGroup(id: string, data: {
  name?: string
  description?: string
  status?: string
}) {
  const values: Record<string, unknown> = {}
  if (data.name !== undefined) values.name = data.name
  if (data.description !== undefined) values.description = data.description
  if (data.status !== undefined) values.status = data.status
  if (Object.keys(values).length === 0) return null
  const [row] = await db.update(treatmentGroups)
    .set(values)
    .where(eq(treatmentGroups.id, id))
    .returning()
  return row ?? null
}

export async function deleteTreatmentGroup(id: string): Promise<boolean> {
  // First unlink treatments from this group
  await db.delete(treatmentPlans).where(eq(treatmentPlans.groupId, id))
  const rows = await db.delete(treatmentGroups).where(eq(treatmentGroups.id, id)).returning({ id: treatmentGroups.id })
  return rows.length > 0
}

// ── Treatment Plans ──────────────────────────────────────────────────────────

export async function getPatientTreatments(patientId: string) {
  return db.select().from(treatmentPlans).where(eq(treatmentPlans.patientId, patientId)).orderBy(desc(treatmentPlans.createdAt))
}

export async function createTreatmentPlan(data: {
  patientId: string
  doctorId?: string
  procedureName: string
  toothNumber?: string
  indication?: string
  cost: number
  status?: string
  clinicId?: string
  groupId?: string
  isPeriodic?: boolean
  periodDays?: number
  nextNotificationDate?: string
  notifyPatient?: boolean
  notificationType?: string
  dcmUrl?: string
}) {
  const [row] = await db.insert(treatmentPlans).values({
    patientId: data.patientId,
    doctorId: data.doctorId,
    procedureName: data.procedureName,
    toothNumber: data.toothNumber,
    indication: data.indication,
    cost: data.cost,
    status: data.status ?? 'planned',
    dcmUrl: data.dcmUrl,
    clinicId: data.clinicId,
    groupId: data.groupId,
    isPeriodic: data.isPeriodic ?? false,
    periodDays: data.periodDays,
    nextNotificationDate: data.nextNotificationDate,
    notifyPatient: data.notifyPatient ?? false,
    notificationType: data.notificationType ?? 'sms',
  }).returning()
  return row
}

export async function updateTreatmentPlan(id: string, data: { status?: string; groupId?: string | null }) {
  const values: Record<string, unknown> = {}
  if (data.status !== undefined) values.status = data.status
  if (data.groupId !== undefined) values.groupId = data.groupId
  if (Object.keys(values).length === 0) return null
  const [row] = await db.update(treatmentPlans)
    .set(values)
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
  type?: string
  complaint?: string
}) {
  const values: Record<string, unknown> = {}
  if (data.doctorId !== undefined) values.doctorId = data.doctorId
  if (data.timeConfirmed !== undefined) values.timeConfirmed = data.timeConfirmed
  if (data.status !== undefined) values.status = data.status
  if (data.startTime !== undefined) values.startTime = data.startTime
  if (data.endTime !== undefined) values.endTime = data.endTime
  if (data.notes !== undefined) values.notes = data.notes
  if (data.type !== undefined) values.type = data.type
  if (data.complaint !== undefined) values.complaint = data.complaint
  if (Object.keys(values).length === 0) return null
  const [row] = await db.update(dentalAppointments)
    .set(values)
    .where(eq(dentalAppointments.id, id))
    .returning()
  return row ?? null
}

// ── Consultations ────────────────────────────────────────────────────────────

export async function deleteConsultation(id: string) {
  const { consultations } = await import('../schema')
  const rows = await db.delete(consultations).where(eq(consultations.id, id)).returning({ id: consultations.id })
  return rows.length > 0
}

// ── Diseases (Hastalıklar) ───────────────────────────────────────────────────

export async function getPatientDiseases(patientId: string) {
  const { patientDiseases } = await import('../schema')
  return db.select().from(patientDiseases).where(eq(patientDiseases.patientId, patientId)).orderBy(desc(patientDiseases.createdAt))
}

export async function createPatientDisease(data: { patientId: string, name: string, notes?: string }) {
  const { patientDiseases } = await import('../schema')
  const [row] = await db.insert(patientDiseases).values({
    patientId: data.patientId,
    name: data.name,
    notes: data.notes ?? null,
  }).returning()
  return row
}

export async function deletePatientDisease(id: string) {
  const { patientDiseases } = await import('../schema')
  const rows = await db.delete(patientDiseases).where(eq(patientDiseases.id, id)).returning({ id: patientDiseases.id })
  return rows.length > 0
}

export async function createConsultation(data: {
  patientId: string
  clinicId?: string
  doctorId?: string
  consultationNote: string
  diseaseNote?: string
}) {
  const [row] = await db.insert(consultations).values({
    patientId: data.patientId,
    clinicId: data.clinicId,
    doctorId: data.doctorId,
    consultationNote: data.consultationNote,
    diseaseNote: data.diseaseNote,
  }).returning()
  return row
}

export async function getPatientConsultations(patientId: string) {
  return await db.query.consultations.findMany({
    where: eq(consultations.patientId, patientId),
    orderBy: [desc(consultations.createdAt)]
  })
}

export async function getClinicConsultationAutocomplete(clinicId: string) {
  const rows = await db.select({
    consultationNote: consultations.consultationNote,
    diseaseNote: consultations.diseaseNote
  })
  .from(consultations)
  .where(eq(consultations.clinicId, clinicId))
  
  // Get distinct combinations manually since distinct is limited in some ORM versions
  const uniqueConsultations = new Set<string>()
  const uniqueDiseases = new Set<string>()
  
  for (const r of rows) {
    if (r.consultationNote) uniqueConsultations.add(r.consultationNote)
    if (r.diseaseNote) uniqueDiseases.add(r.diseaseNote)
  }
  
  return {
    consultationNotes: Array.from(uniqueConsultations),
    diseaseNotes: Array.from(uniqueDiseases)
  }
}

export async function createPatientsBulk(patientList: {
  name: string
  phone?: string
  tcIdentity?: string
  gender?: string
  birthDate?: string
}[]) {
  if (patientList.length === 0) return []
  const { patients } = await import('../schema')
  const mapped = patientList.map(p => ({ ...p, birthDate: p.birthDate ? new Date(p.birthDate) : null }))
  return await db.insert(patients).values(mapped).returning()
}

export async function updateTreatmentGroupFull(groupId: string, data: {
  name: string
  description?: string
  patientId: string
  treatments: any[]
}) {
  await updateTreatmentGroup(groupId, { name: data.name, description: data.description })
  
  const existing = await db.select().from(treatmentPlans).where(eq(treatmentPlans.groupId, groupId))
  const existingIds = existing.map(t => t.id)
  const incomingIds = data.treatments.filter(t => t.id).map(t => t.id)
  const idsToDelete = existingIds.filter(id => !incomingIds.includes(id))
  
  for (const id of idsToDelete) {
    await db.delete(treatmentPlans).where(eq(treatmentPlans.id, id))
  }
  
  for (const t of data.treatments) {
    if (t.id) {
       await db.update(treatmentPlans).set({
         procedureName: t.procedureName,
         toothNumber: t.toothNumber,
         indication: t.indication,
         cost: t.cost,
         doctorId: t.doctorId
       }).where(eq(treatmentPlans.id, t.id))
    } else {
       await createTreatmentPlan({ 
         patientId: data.patientId,
         procedureName: t.procedureName,
         toothNumber: t.toothNumber,
         indication: t.indication,
         cost: t.cost,
         doctorId: t.doctorId,
         groupId 
       })
    }
  }
  return true
}
