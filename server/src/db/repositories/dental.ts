import { eq, desc, and, gte, lte, sql, ilike, or, inArray } from 'drizzle-orm'
import { db } from '../client'
import {
  users,
  patients,
  dentalAppointments,
  treatmentPlans,
  treatmentGroups,
  appointmentTreatments,
  patientPayments,
  completedWorks,
  businessSettings,
  notificationTemplates,
  consultations,
  patientNotes,
  clinicMemberships,
  doctorLeaves,
  waitingList,
  toothRecords,
  doctorNotes,
  patientAnamnesis,
  patientDiseases,
  materialUsages,
  installmentPlans,
  whatsappConversations
} from '../schema'
import { currentClinicId, requireClinicId } from '../../tenancy/context'

let aiReviewSchemaPromise: Promise<void> | null = null

/** Lightweight runtime safety net when a deployment starts before its migration. */
export function ensureAiAppointmentReviewSchema(): Promise<void> {
  if (!aiReviewSchemaPromise) aiReviewSchemaPromise = (async () => {
    await db.execute(sql`ALTER TABLE dental_appointments ALTER COLUMN patient_id DROP NOT NULL`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS intake_source TEXT`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS intake_patient_name TEXT`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS intake_patient_phone TEXT`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS review_status TEXT`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id)`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS rejection_reason TEXT`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`)
    await db.execute(sql`UPDATE dental_appointments SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL`)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS dental_appointments_patient_activity_idx ON dental_appointments (clinic_id, patient_id, updated_at DESC)`)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS dental_appointments_review_status_idx ON dental_appointments (clinic_id, review_status, start_time)`)
  })().catch(error => { aiReviewSchemaPromise = null; throw error })
  return aiReviewSchemaPromise
}

// ── Doctors (hekim users) ────────────────────────────────────────────────────

export async function listDoctors() {
  const clinicId = requireClinicId()
  return db.select({ id: users.id, name: users.name, specialty: users.specialty, color: users.color, active: users.active })
    .from(users).innerJoin(clinicMemberships, eq(clinicMemberships.userId, users.id))
    .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.role, 'hekim'), eq(clinicMemberships.active, true)))
}

export async function createDoctor(data: { name: string; specialty: string; color?: string }) {
  const clinicId = requireClinicId()
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
  await db.insert(clinicMemberships).values({ clinicId, userId: row!.id, role: 'hekim', active: true })
  return { id: row!.id, name: row!.name, specialty: row!.specialty, color: row!.color, active: row!.active }
}

// ── Doctor Leaves (Hekim İzinleri / Çalışma Dışı Saatler) ───────────────────

let hasEnsuredLeavesTable = false
export async function ensureDoctorLeavesTable() {
  if (hasEnsuredLeavesTable) return
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS doctor_leaves (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id   UUID REFERENCES clinics(id) ON DELETE CASCADE,
        doctor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date        TEXT NOT NULL,
        start_time  TEXT NOT NULL,
        end_time    TEXT NOT NULL,
        is_full_day BOOLEAN NOT NULL DEFAULT false,
        reason      TEXT,
        notes       TEXT,
        created_by  UUID REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS doctor_leaves_clinic_date_idx ON doctor_leaves (clinic_id, date);
      CREATE INDEX IF NOT EXISTS doctor_leaves_doctor_date_idx ON doctor_leaves (doctor_id, date);
    `)
    hasEnsuredLeavesTable = true
  } catch (err) {
    console.error('[DentalRepo] Error ensuring doctor_leaves table:', err)
  }
}

export async function getDoctorLeaves(filters?: {
  doctorId?: string
  date?: string
  startDate?: string
  endDate?: string
}) {
  await ensureDoctorLeavesTable()
  const clinicId = requireClinicId()

  const conditions = [eq(doctorLeaves.clinicId, clinicId)]
  if (filters?.doctorId) {
    conditions.push(eq(doctorLeaves.doctorId, filters.doctorId))
  }
  if (filters?.date) {
    conditions.push(eq(doctorLeaves.date, filters.date))
  }
  if (filters?.startDate && filters?.endDate) {
    conditions.push(gte(doctorLeaves.date, filters.startDate), lte(doctorLeaves.date, filters.endDate))
  }

  const rows = await db
    .select({
      id: doctorLeaves.id,
      clinicId: doctorLeaves.clinicId,
      doctorId: doctorLeaves.doctorId,
      doctorName: users.name,
      doctorColor: users.color,
      doctorSpecialty: users.specialty,
      date: doctorLeaves.date,
      startTime: doctorLeaves.startTime,
      endTime: doctorLeaves.endTime,
      isFullDay: doctorLeaves.isFullDay,
      reason: doctorLeaves.reason,
      notes: doctorLeaves.notes,
      createdBy: doctorLeaves.createdBy,
      createdAt: doctorLeaves.createdAt,
    })
    .from(doctorLeaves)
    .leftJoin(users, eq(doctorLeaves.doctorId, users.id))
    .where(and(...conditions))
    .orderBy(doctorLeaves.date, doctorLeaves.startTime)

  return rows
}

export async function createDoctorLeave(data: {
  doctorId: string
  date: string
  startTime: string
  endTime: string
  isFullDay?: boolean
  reason?: string
  notes?: string
  createdBy?: string
}) {
  await ensureDoctorLeavesTable()
  const clinicId = requireClinicId()

  const [row] = await db
    .insert(doctorLeaves)
    .values({
      clinicId,
      doctorId: data.doctorId,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      isFullDay: Boolean(data.isFullDay),
      reason: data.reason || null,
      notes: data.notes || null,
      createdBy: data.createdBy || null,
    })
    .returning()

  return row
}

export async function deleteDoctorLeave(id: string): Promise<boolean> {
  await ensureDoctorLeavesTable()
  const clinicId = requireClinicId()

  const rows = await db
    .delete(doctorLeaves)
    .where(and(eq(doctorLeaves.id, id), eq(doctorLeaves.clinicId, clinicId)))
    .returning({ id: doctorLeaves.id })

  return rows.length > 0
}

export async function checkDoctorLeaveConflict(
  doctorId: string,
  startTime: Date,
  endTime: Date
): Promise<{ conflict: boolean; leave?: any }> {
  try {
    await ensureDoctorLeavesTable()
    const dateStr = startTime.toLocaleDateString('sv')

    const leaves = await getDoctorLeaves({ doctorId, date: dateStr })
    const apptStartMins = startTime.getHours() * 60 + startTime.getMinutes()
    const apptEndMins = endTime.getHours() * 60 + endTime.getMinutes()

    for (const l of leaves) {
      if (l.isFullDay) {
        return { conflict: true, leave: l }
      }
      const [sh, sm] = (l.startTime || '00:00').split(':').map(Number)
      const [eh, em] = (l.endTime || '23:59').split(':').map(Number)
      const lStartMins = (sh || 0) * 60 + (sm || 0)
      const lEndMins = (eh || 0) * 60 + (em || 0)

      if (apptStartMins < lEndMins && apptEndMins > lStartMins) {
        return { conflict: true, leave: l }
      }
    }
    return { conflict: false }
  } catch (err) {
    console.error('[DentalRepo] Error checking leave conflict:', err)
    return { conflict: false }
  }
}

// ── Dental Appointments ──────────────────────────────────────────────────────

export async function listDentalAppointments(dateStr?: string) {
  await ensureAiAppointmentReviewSchema()
  const clinicId = requireClinicId()
  let appts: any[] = [];
  if (dateStr) {
    const dayStart = new Date(`${dateStr}T00:00:00+03:00`)
    const dayEnd = new Date(`${dateStr}T23:59:59+03:00`)
    appts = await db
      .select()
      .from(dentalAppointments)
      .where(and(eq(dentalAppointments.clinicId, clinicId), gte(dentalAppointments.startTime, dayStart), lte(dentalAppointments.startTime, dayEnd)))
      .orderBy(dentalAppointments.startTime)
  } else {
    appts = await db.select().from(dentalAppointments).where(eq(dentalAppointments.clinicId, clinicId)).orderBy(dentalAppointments.startTime)
  }
  
  if (appts.length === 0) return appts;
  
  const { appointmentTreatments } = await import('../schema');
  const { inArray } = await import('drizzle-orm');
  
  const apptIds = appts.map((a: any) => a.id);
  const links = await db.select({ appointmentId: appointmentTreatments.appointmentId })
    .from(appointmentTreatments)
    .where(inArray(appointmentTreatments.appointmentId, apptIds));
    
  const linkedApptIds = new Set(links.map(l => l.appointmentId));
  return appts.map(a => ({ ...a, hasTreatment: linkedApptIds.has(a.id) }));
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
  const clinicId = requireClinicId()
  if (data.doctorId) {
    const { conflict, leave } = await checkDoctorLeaveConflict(data.doctorId, data.startTime, data.endTime)
    if (conflict) {
      const reasonText = leave?.reason ? ` (${leave.reason})` : ''
      throw new Error(`Hekim belirtilen saatlerde izinlidir: ${leave.startTime}-${leave.endTime}${reasonText}. Randevu oluşturulamaz.`)
    }
  }
  const [row] = await db.insert(dentalAppointments).values({
    clinicId,
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
  const clinicId = requireClinicId()
  const rows = await db.delete(dentalAppointments).where(and(eq(dentalAppointments.id, id), eq(dentalAppointments.clinicId, clinicId))).returning({ id: dentalAppointments.id })
  return rows.length > 0
}

// ── Patients ─────────────────────────────────────────────────────────────────

export async function getPatient(id: string) {
  const clinicId = requireClinicId()
  const [row] = await db.select().from(patients).where(and(eq(patients.id, id), eq(patients.clinicId, clinicId))).limit(1)
  return row ?? null
}

/**
 * Finds a clinical patient card by telephone number. Phone numbers are stored
 * in more than one human-friendly format, so equality alone is not reliable.
 */
export async function findPatientByPhone(phone: string, explicitClinicId?: string) {
  const clinicId = explicitClinicId ?? requireClinicId()
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null

  const rows = await db.select({ id: patients.id, name: patients.name, phone: patients.phone })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), sql`${patients.phone} IS NOT NULL`))

  const lastTenDigits = digits.slice(-10)
  return rows.find(patient => patient.phone?.replace(/\D/g, '').endsWith(lastTenDigits)) ?? null
}

export async function getPatientFullProfile(patientId: string) {
  const clinicId = requireClinicId()
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
    db.select().from(patients).where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId))).limit(1),
    
    // Anamnesis
    db.select({ formData: patientAnamnesis.formData, filledAt: patientAnamnesis.filledAt })
      .from(patientAnamnesis).where(and(eq(patientAnamnesis.clinicId, clinicId), eq(patientAnamnesis.patientId, patientId))).orderBy(desc(patientAnamnesis.filledAt)).limit(1),

    // Diseases
    db.select({ name: patientDiseases.name, status: patientDiseases.status, notes: patientDiseases.notes })
      .from(patientDiseases).where(and(eq(patientDiseases.clinicId, clinicId), eq(patientDiseases.patientId, patientId))),

    // Appointments (visit dates)
    db.select({
        id: dentalAppointments.id,
        startTime: dentalAppointments.startTime,
        status: dentalAppointments.status,
      })
      .from(dentalAppointments)
      .where(and(eq(dentalAppointments.clinicId, clinicId), eq(dentalAppointments.patientId, patientId)))
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
    .where(and(eq(treatmentPlans.clinicId, clinicId), eq(treatmentPlans.patientId, patientId)))
    .orderBy(desc(treatmentPlans.createdAt)),

    // Treatment Groups
    db.select({ id: treatmentGroups.id, name: treatmentGroups.name, status: treatmentGroups.status })
      .from(treatmentGroups).where(and(eq(treatmentGroups.clinicId, clinicId), eq(treatmentGroups.patientId, patientId))),

    // Payments (dates only)
    db.select({ date: patientPayments.date })
      .from(patientPayments).where(and(eq(patientPayments.clinicId, clinicId), eq(patientPayments.patientId, patientId))).orderBy(desc(patientPayments.date)),

    // Completed Works
    db.select({ id: completedWorks.id, date: completedWorks.date, description: completedWorks.description, doctorName: users.name })
      .from(completedWorks).leftJoin(users, eq(completedWorks.doctorId, users.id))
      .where(and(eq(completedWorks.clinicId, clinicId), eq(completedWorks.patientId, patientId))).orderBy(desc(completedWorks.date)),

    // Consultations
    db.select({ id: consultations.id, consultationNote: consultations.consultationNote, diseaseNote: consultations.diseaseNote, createdAt: consultations.createdAt, doctorName: users.name })
      .from(consultations).leftJoin(users, eq(consultations.doctorId, users.id))
      .where(and(eq(consultations.clinicId, clinicId), eq(consultations.patientId, patientId))).orderBy(desc(consultations.createdAt)),

    // Doctor Notes
    db.select({ id: doctorNotes.id, content: doctorNotes.content, createdAt: doctorNotes.createdAt, doctorName: users.name })
      .from(doctorNotes).leftJoin(users, eq(doctorNotes.doctorId, users.id))
      .where(and(eq(doctorNotes.clinicId, clinicId), eq(doctorNotes.patientId, patientId))).orderBy(desc(doctorNotes.createdAt)),

    // Tooth Records
    db.select({ toothNumber: toothRecords.toothNumber, surface: toothRecords.surface, condition: toothRecords.condition, date: toothRecords.date })
      .from(toothRecords).where(and(eq(toothRecords.clinicId, clinicId), eq(toothRecords.patientId, patientId))).orderBy(desc(toothRecords.date)),

    // Material Usages
    db.select({ date: materialUsages.date, quantity: materialUsages.quantity, itemName: inventoryItems.name })
      .from(materialUsages).leftJoin(inventoryItems, eq(materialUsages.inventoryItemId, inventoryItems.id))
      .where(and(eq(materialUsages.clinicId, clinicId), eq(materialUsages.patientId, patientId))).orderBy(desc(materialUsages.date)),
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
  const clinicId = requireClinicId()
  await ensureAiAppointmentReviewSchema()
  return db.select({
    id: patients.id,
    clinicId: patients.clinicId,
    name: patients.name,
    phone: patients.phone,
    email: patients.email,
    tcIdentity: patients.tcIdentity,
    gender: patients.gender,
    birthDate: patients.birthDate,
    birthYear: patients.birthYear,
    balance: patients.balance,
    whatsappOptOut: patients.whatsappOptOut,
    smsOptOut: patients.smsOptOut,
    emailOptOut: patients.emailOptOut,
    createdAt: patients.createdAt,
    lastAppointmentActivityAt: sql<Date | null>`(
      SELECT max(${dentalAppointments.updatedAt})
      FROM ${dentalAppointments}
      WHERE ${dentalAppointments.clinicId} = ${clinicId}
        AND ${dentalAppointments.patientId} = ${patients.id}
    )`,
  }).from(patients)
    .where(eq(patients.clinicId, clinicId))
    .orderBy(sql`(
      SELECT max(${dentalAppointments.updatedAt})
      FROM ${dentalAppointments}
      WHERE ${dentalAppointments.clinicId} = ${clinicId}
        AND ${dentalAppointments.patientId} = ${patients.id}
    ) DESC NULLS LAST`, desc(patients.createdAt))
}

export async function createPatient(data: { name: string; phone?: string; balance?: number; email?: string; tcIdentity?: string; gender?: string; birthDate?: string; birthYear?: number }) {
  const [row] = await db.insert(patients).values({
    clinicId: requireClinicId(),
    name: data.name,
    phone: data.phone ?? null,
    email: data.email ?? null,
    tcIdentity: data.tcIdentity ?? null,
    gender: data.gender ?? null,
    birthDate: data.birthDate ? new Date(data.birthDate) : null,
    birthYear: data.birthDate ? null : (data.birthYear ?? null),
    balance: data.balance ?? 0,
  }).returning()
  return row
}

// ── Treatment Groups ─────────────────────────────────────────────────────────

export async function getPatientTreatmentGroups(patientId: string) {
  const clinicId = requireClinicId()
  const groups = await db.select({
    id: treatmentGroups.id,
    patientId: treatmentGroups.patientId,
    name: treatmentGroups.name,
    description: treatmentGroups.description,
    status: treatmentGroups.status,
    createdById: treatmentGroups.createdById,
    updatedById: treatmentGroups.updatedById,
    createdAt: treatmentGroups.createdAt,
    creatorName: users.name,
    creatorRole: users.role,
  }).from(treatmentGroups)
    .leftJoin(users, eq(treatmentGroups.createdById, users.id))
    .where(and(eq(treatmentGroups.clinicId, clinicId), eq(treatmentGroups.patientId, patientId)))
    .orderBy(desc(treatmentGroups.createdAt))
  
  // For each group, fetch its treatment plans + attached sessions
  const result = []
  for (const group of groups) {
    const plans = await db.select().from(treatmentPlans)
      .where(and(eq(treatmentPlans.clinicId, clinicId), eq(treatmentPlans.patientId, patientId), eq(treatmentPlans.groupId, group.id)))
      .orderBy(desc(treatmentPlans.createdAt))
    
    for (const p of plans) {
      const sessions = await db.select({
        id: appointmentTreatments.id,
        appointmentId: appointmentTreatments.appointmentId,
        sessionNumber: appointmentTreatments.sessionNumber,
        sessionStatus: appointmentTreatments.sessionStatus,
        notes: appointmentTreatments.notes,
        startTime: dentalAppointments.startTime,
        endTime: dentalAppointments.endTime
      }).from(appointmentTreatments)
        .innerJoin(dentalAppointments, eq(appointmentTreatments.appointmentId, dentalAppointments.id))
        .where(eq(appointmentTreatments.treatmentPlanId, p.id))
      ;(p as any).sessions = sessions
    }

    result.push({ ...group, treatments: plans })
  }
  
  // Also fetch ungrouped treatments + attached sessions
  const ungrouped = await db.select().from(treatmentPlans)
    .where(and(eq(treatmentPlans.clinicId, clinicId), eq(treatmentPlans.patientId, patientId), sql`group_id IS NULL`))
    .orderBy(desc(treatmentPlans.createdAt))

  for (const p of ungrouped) {
    const sessions = await db.select({
      id: appointmentTreatments.id,
      appointmentId: appointmentTreatments.appointmentId,
      sessionNumber: appointmentTreatments.sessionNumber,
      sessionStatus: appointmentTreatments.sessionStatus,
      notes: appointmentTreatments.notes,
      startTime: dentalAppointments.startTime,
      endTime: dentalAppointments.endTime
    }).from(appointmentTreatments)
      .innerJoin(dentalAppointments, eq(appointmentTreatments.appointmentId, dentalAppointments.id))
      .where(eq(appointmentTreatments.treatmentPlanId, p.id))
    ;(p as any).sessions = sessions
  }
  
  return { groups: result, ungrouped }
}

export async function getAppointmentTreatments(appointmentId: string) {
  const clinicId = requireClinicId()
  return await db.select({
    id: appointmentTreatments.id,
    appointmentId: appointmentTreatments.appointmentId,
    treatmentPlanId: appointmentTreatments.treatmentPlanId,
    sessionNumber: appointmentTreatments.sessionNumber,
    sessionStatus: appointmentTreatments.sessionStatus,
    notes: appointmentTreatments.notes,
    createdAt: appointmentTreatments.createdAt,
    procedureName: treatmentPlans.procedureName,
    toothNumber: treatmentPlans.toothNumber,
    cost: treatmentPlans.cost,
    status: treatmentPlans.status
  }).from(appointmentTreatments)
    .innerJoin(treatmentPlans, eq(appointmentTreatments.treatmentPlanId, treatmentPlans.id))
    .where(and(eq(appointmentTreatments.appointmentId, appointmentId), eq(treatmentPlans.clinicId, clinicId)))
    .orderBy(appointmentTreatments.sessionNumber)
}

export async function linkTreatmentToAppointment(appointmentId: string, treatmentPlanId: string, sessionNumber: number = 1, notes?: string) {
  const clinicId = requireClinicId()
  const [valid] = await db.select({ id: treatmentPlans.id }).from(treatmentPlans)
    .innerJoin(dentalAppointments, eq(dentalAppointments.id, appointmentId))
    .where(and(eq(treatmentPlans.id, treatmentPlanId), eq(treatmentPlans.clinicId, clinicId), eq(dentalAppointments.clinicId, clinicId))).limit(1)
  if (!valid) throw new Error('Randevu veya tedavi bu kliniğe ait değil')
  // Check if already linked
  const existing = await db.select().from(appointmentTreatments)
    .where(and(eq(appointmentTreatments.appointmentId, appointmentId), eq(appointmentTreatments.treatmentPlanId, treatmentPlanId)))
  if (existing.length > 0) return existing[0]

  const [row] = await db.insert(appointmentTreatments).values({
    appointmentId,
    treatmentPlanId,
    sessionNumber,
    notes
  }).returning()
  return row
}

export async function unlinkTreatmentFromAppointment(appointmentId: string, treatmentPlanId: string) {
  const clinicId = requireClinicId()
  const [valid] = await db.select({ id: treatmentPlans.id }).from(treatmentPlans)
    .innerJoin(dentalAppointments, eq(dentalAppointments.id, appointmentId))
    .where(and(eq(treatmentPlans.id, treatmentPlanId), eq(treatmentPlans.clinicId, clinicId), eq(dentalAppointments.clinicId, clinicId))).limit(1)
  if (!valid) return false
  const rows = await db.delete(appointmentTreatments)
    .where(and(eq(appointmentTreatments.appointmentId, appointmentId), eq(appointmentTreatments.treatmentPlanId, treatmentPlanId)))
    .returning()
  return rows.length > 0
}

export async function updateAppointmentTreatmentSession(atId: string, data: { sessionStatus?: string; notes?: string }) {
  const values: Record<string, unknown> = {}
  if (data.sessionStatus !== undefined) values.sessionStatus = data.sessionStatus
  if (data.notes !== undefined) values.notes = data.notes
  if (Object.keys(values).length === 0) return null

  const clinicId = requireClinicId()
  const [owned] = await db.select({ id: appointmentTreatments.id }).from(appointmentTreatments)
    .innerJoin(dentalAppointments, eq(appointmentTreatments.appointmentId, dentalAppointments.id))
    .where(and(eq(appointmentTreatments.id, atId), eq(dentalAppointments.clinicId, clinicId))).limit(1)
  if (!owned) return null
  const [row] = await db.update(appointmentTreatments).set(values).where(eq(appointmentTreatments.id, atId)).returning()
  return row
}

export async function createTreatmentGroup(data: {
  patientId: string
  name: string
  description?: string
  createdById?: string
}) {
  const clinicId = requireClinicId()
  const [row] = await db.insert(treatmentGroups).values({
    clinicId,
    patientId: data.patientId,
    name: data.name,
    description: data.description,
    createdById: data.createdById,
  }).returning()
  return row
}

export async function updateTreatmentGroup(id: string, data: {
  name?: string
  description?: string
  status?: string
  updatedById?: string
}) {
  const clinicId = requireClinicId()
  const values: Record<string, unknown> = {}
  if (data.name !== undefined) values.name = data.name
  if (data.description !== undefined) values.description = data.description
  if (data.status !== undefined) values.status = data.status
  if (data.updatedById !== undefined) values.updatedById = data.updatedById
  if (Object.keys(values).length === 0) return null
  const [row] = await db.update(treatmentGroups)
    .set(values)
    .where(and(eq(treatmentGroups.id, id), eq(treatmentGroups.clinicId, clinicId)))
    .returning()
  return row ?? null
}

export async function deleteTreatmentGroup(id: string): Promise<boolean> {
  const clinicId = requireClinicId()
  // First unlink treatments from this group
  await db.delete(treatmentPlans).where(and(eq(treatmentPlans.groupId, id), eq(treatmentPlans.clinicId, clinicId)))
  const rows = await db.delete(treatmentGroups).where(and(eq(treatmentGroups.id, id), eq(treatmentGroups.clinicId, clinicId))).returning({ id: treatmentGroups.id })
  return rows.length > 0
}

// ── Treatment Plans ──────────────────────────────────────────────────────────

export async function getPatientTreatments(patientId: string) {
  const clinicId = requireClinicId()
  const plans = await db.select().from(treatmentPlans).where(and(eq(treatmentPlans.clinicId, clinicId), eq(treatmentPlans.patientId, patientId))).orderBy(desc(treatmentPlans.createdAt))

  for (const p of plans) {
    const sessions = await db.select({
      id: appointmentTreatments.id,
      appointmentId: appointmentTreatments.appointmentId,
      sessionNumber: appointmentTreatments.sessionNumber,
      sessionStatus: appointmentTreatments.sessionStatus,
      notes: appointmentTreatments.notes,
      startTime: dentalAppointments.startTime,
      endTime: dentalAppointments.endTime
    }).from(appointmentTreatments)
      .innerJoin(dentalAppointments, eq(appointmentTreatments.appointmentId, dentalAppointments.id))
      .where(eq(appointmentTreatments.treatmentPlanId, p.id))
    ;(p as any).sessions = sessions
  }

  return plans
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
  const clinicId = data.clinicId ?? requireClinicId()
  const [row] = await db.insert(treatmentPlans).values({
    patientId: data.patientId,
    doctorId: data.doctorId,
    procedureName: data.procedureName,
    toothNumber: data.toothNumber,
    indication: data.indication,
    cost: data.cost,
    status: data.status ?? 'planned',
    dcmUrl: data.dcmUrl,
    clinicId,
    groupId: data.groupId,
    isPeriodic: data.isPeriodic ?? false,
    periodDays: data.periodDays,
    nextNotificationDate: data.nextNotificationDate,
    notifyPatient: data.notifyPatient ?? false,
    notificationType: data.notificationType ?? 'sms',
  }).returning()
  return row
}

export async function updateTreatmentPlan(id: string, data: { status?: string; groupId?: string | null; doctorId?: string | null }) {
  const clinicId = requireClinicId()
  const values: Record<string, unknown> = {}
  if (data.status !== undefined) values.status = data.status
  if (data.groupId !== undefined) values.groupId = data.groupId
  if (data.doctorId !== undefined) values.doctorId = data.doctorId
  if (Object.keys(values).length === 0) return null
  const [row] = await db.update(treatmentPlans)
    .set(values)
    .where(and(eq(treatmentPlans.id, id), eq(treatmentPlans.clinicId, clinicId)))
    .returning()
  return row ?? null
}

export async function deleteTreatmentPlan(id: string): Promise<boolean> {
  const clinicId = requireClinicId()
  const rows = await db.delete(treatmentPlans).where(and(eq(treatmentPlans.id, id), eq(treatmentPlans.clinicId, clinicId))).returning({ id: treatmentPlans.id })
  return rows.length > 0
}

// ── Payments ─────────────────────────────────────────────────────────────────

export async function getPatientPayments(patientId: string) {
  return db.select().from(patientPayments).where(and(eq(patientPayments.clinicId, requireClinicId()), eq(patientPayments.patientId, patientId))).orderBy(desc(patientPayments.createdAt))
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
    clinicId: requireClinicId(),
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

  const conditions: any[] = [eq(patientPayments.clinicId, requireClinicId())]
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
  const clinicId = requireClinicId()
  const values: Record<string, unknown> = {}
  if (data.date !== undefined) values.date = data.date
  if (data.amount !== undefined) values.amount = data.amount
  if (data.method !== undefined) values.method = data.method
  if (data.notes !== undefined) values.notes = data.notes
  if (data.status !== undefined) values.status = data.status
  if (data.dueDate !== undefined) values.dueDate = data.dueDate
  if (data.treatmentPlanId !== undefined) values.treatmentPlanId = data.treatmentPlanId
  if (Object.keys(values).length === 0) return null
  const [row] = await db.update(patientPayments).set(values).where(and(eq(patientPayments.id, id), eq(patientPayments.clinicId, clinicId))).returning()
  return row ?? null
}

export async function deletePayment(id: string): Promise<boolean> {
  const rows = await db.delete(patientPayments).where(and(eq(patientPayments.id, id), eq(patientPayments.clinicId, requireClinicId()))).returning({ id: patientPayments.id })
  return rows.length > 0
}

// ── Completed Works ──────────────────────────────────────────────────────────

export async function getPatientCompletedWorks(patientId: string) {
  return db.select().from(completedWorks).where(and(eq(completedWorks.clinicId, requireClinicId()), eq(completedWorks.patientId, patientId))).orderBy(desc(completedWorks.createdAt))
}

export async function createCompletedWork(data: {
  patientId: string
  doctorId: string
  date: string
  description: string
}) {
  const [row] = await db.insert(completedWorks).values({
    clinicId: requireClinicId(),
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
  type?: string
  date: string
  time: string
  notes?: string | null
  doctorId?: string | null
  complaint?: string
}) {
  const clinicId = requireClinicId()
  // Find or create patient
  let [patient] = await db.select().from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.phone, data.phone))).limit(1)
  if (!patient) {
    [patient] = await db.insert(patients).values({
      clinicId,
      name: data.customerName,
      phone: data.phone,
      balance: 0,
    }).returning()
  }

  const startTime = new Date(`${data.date}T${data.time}:00+03:00`)
  // 15 min control slot
  const endTime = new Date(startTime.getTime() + 15 * 60_000)

  const [row] = await db.insert(dentalAppointments).values({
    clinicId,
    patientId: patient.id,
    doctorId: data.doctorId || null,
    title: `${data.customerName} - ${data.type || 'kontrol'}`,
    startTime,
    endTime,
    status: data.doctorId ? 'scheduled' : 'pending_assignment',
    type: data.type || 'kontrol',
    notes: data.notes ?? (data.complaint ? `Şikayet: ${data.complaint}` : null),
    complaint: data.complaint ?? null,
    timeConfirmed: false, // Voice appointments require reception verification
  }).returning()
  return row
}

// ── Patient Notes (Voice & Manual) ──────────────────────────────────────────

export async function createPatientNote(data: {
  phone: string
  content: string
  patientId?: string | null
  source?: string
  clinicId?: string
}) {
  const clinicId = data.clinicId || requireClinicId()
  let pId = data.patientId
  if (!pId && data.phone) {
    const [p] = await db.select({ id: patients.id }).from(patients).where(and(eq(patients.clinicId, clinicId), eq(patients.phone, data.phone))).limit(1)
    if (p) pId = p.id
  }
  const [row] = await db.insert(patientNotes).values({
    clinicId,
    patientId: pId || null,
    phone: data.phone,
    content: data.content,
    source: data.source || 'voice',
    status: 'unread',
  }).returning()
  return row
}

export async function listPatientNotes(status?: string) {
  const clinicId = requireClinicId()
  const query = db
    .select({
      id: patientNotes.id,
      patientId: patientNotes.patientId,
      patientName: patients.name,
      phone: patientNotes.phone,
      content: patientNotes.content,
      source: patientNotes.source,
      status: patientNotes.status,
      createdAt: patientNotes.createdAt,
    })
    .from(patientNotes)
    .leftJoin(patients, eq(patientNotes.patientId, patients.id))
    .orderBy(desc(patientNotes.createdAt))

  if (status) {
    return query.where(and(eq(patientNotes.clinicId, clinicId), eq(patientNotes.status, status)))
  }
  return query.where(eq(patientNotes.clinicId, clinicId))
}

export async function markPatientNoteRead(id: string) {
  const [row] = await db.update(patientNotes).set({ status: 'read' }).where(and(eq(patientNotes.id, id), eq(patientNotes.clinicId, requireClinicId()))).returning()
  return row
}

// ── Patient Doctor History ───────────────────────────────────────────────────

export async function getPatientDoctorHistory(phone: string, explicitClinicId?: string) {
  const clinicId = explicitClinicId ?? requireClinicId()
  const patient = await findPatientByPhone(phone, clinicId)
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
    .where(and(eq(dentalAppointments.clinicId, clinicId), eq(dentalAppointments.patientId, patient.id)))
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
  const clinicId = requireClinicId()
  const [existing] = await db.select({ status: dentalAppointments.status, reviewStatus: dentalAppointments.reviewStatus })
    .from(dentalAppointments).where(and(eq(dentalAppointments.id, id), eq(dentalAppointments.clinicId, clinicId))).limit(1)
  if (existing?.status === 'pending_review' && existing.reviewStatus === 'pending' && (data.status !== undefined || data.type !== undefined)) {
    throw new Error('AI onay bekleyen randevu yalnızca Desk Onay ekranından sonuçlandırılabilir.')
  }
  if (data.doctorId && data.startTime && data.endTime) {
    const { conflict, leave } = await checkDoctorLeaveConflict(data.doctorId, data.startTime, data.endTime)
    if (conflict) {
      const reasonText = leave?.reason ? ` (${leave.reason})` : ''
      throw new Error(`Hekim belirtilen saatlerde izinlidir: ${leave.startTime}-${leave.endTime}${reasonText}. Randevu taşınamaz.`)
    }
  }
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
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(dentalAppointments.id, id), eq(dentalAppointments.clinicId, clinicId)))
    .returning()
  return row ?? null
}

/** Confirm a tentative AI appointment and bind it to a real patient atomically. */
export async function approveAiAppointment(id: string, data: {
  patientId?: string
  patient?: { name: string; phone?: string }
  patientUpdate?: { name?: string; phone?: string }
  doctorId?: string | null
  startTime: Date
  endTime: Date
  complaint?: string
  reviewedBy: string
}) {
  const clinicId = requireClinicId()
  if (!data.patientId && !data.patient?.name?.trim()) throw new Error('Onay için hasta seçilmeli veya yeni hasta oluşturulmalı.')
  if (!(data.startTime instanceof Date) || !Number.isFinite(data.startTime.getTime()) || !(data.endTime instanceof Date) || data.endTime <= data.startTime) {
    throw new Error('Geçerli randevu tarih ve saati gerekli.')
  }

  return db.transaction(async (tx) => {
    const [appointment] = await tx.select().from(dentalAppointments)
      .where(and(eq(dentalAppointments.id, id), eq(dentalAppointments.clinicId, clinicId))).for('update')
    if (!appointment) throw new Error('Randevu bulunamadı.')
    if (appointment.status !== 'pending_review' || appointment.reviewStatus !== 'pending') throw new Error('Bu AI talebi zaten sonuçlandırılmış.')

    let patientId = data.patientId
    if (patientId) {
      const [patient] = await tx.select({ id: patients.id }).from(patients)
        .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId))).limit(1)
      if (!patient) throw new Error('Seçilen hasta bu kliniğe ait değil.')
      if (data.patientUpdate && (data.patientUpdate.name?.trim() || data.patientUpdate.phone !== undefined)) {
        await tx.update(patients).set({
          ...(data.patientUpdate.name?.trim() ? { name: data.patientUpdate.name.trim() } : {}),
          ...(data.patientUpdate.phone !== undefined ? { phone: data.patientUpdate.phone.trim() || null } : {}),
        }).where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
      }
    } else {
      const [patient] = await tx.insert(patients).values({
        clinicId, name: data.patient!.name.trim(), phone: data.patient!.phone?.trim() || null, balance: 0,
      }).returning({ id: patients.id })
      patientId = patient.id
    }

    if (data.doctorId) {
      const [doctor] = await tx.select({ id: users.id }).from(users)
        .innerJoin(clinicMemberships, eq(clinicMemberships.userId, users.id))
        .where(and(eq(users.id, data.doctorId), eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.role, 'hekim'), eq(clinicMemberships.active, true))).limit(1)
      if (!doctor) throw new Error('Seçilen hekim bu klinikte aktif değil.')
    }

    const conflicts = await tx.select({ id: dentalAppointments.id }).from(dentalAppointments).where(and(
      eq(dentalAppointments.clinicId, clinicId),
      sql`${dentalAppointments.id} <> ${id}`,
      sql`${dentalAppointments.status} <> 'cancelled'`,
      sql`${dentalAppointments.startTime} < ${data.endTime}`,
      sql`${dentalAppointments.endTime} > ${data.startTime}`,
    )).limit(1)
    if (conflicts.length) throw new Error('Seçilen saat geçici veya planlanmış başka bir randevu ile çakışıyor.')

    const [updated] = await tx.update(dentalAppointments).set({
      patientId, doctorId: data.doctorId || null, startTime: data.startTime, endTime: data.endTime,
      complaint: data.complaint ?? appointment.complaint, notes: data.complaint ?? appointment.notes,
      status: data.doctorId ? 'scheduled' : 'pending_assignment', type: 'kontrol', timeConfirmed: true,
      reviewStatus: 'approved', reviewedBy: data.reviewedBy, reviewedAt: new Date(), rejectionReason: null,
      title: `${appointment.intakePatientName || appointment.title.split(' - ')[0]} - kontrol`, updatedAt: new Date(),
    }).where(and(eq(dentalAppointments.id, id), eq(dentalAppointments.reviewStatus, 'pending'))).returning()
    if (!updated) throw new Error('Randevu aynı anda başka bir kullanıcı tarafından işlendi.')
    return updated
  })
}

export async function rejectAiAppointment(id: string, reason: string, reviewedBy: string) {
  const clinicId = requireClinicId()
  if (!reason.trim()) throw new Error('İptal nedeni zorunludur.')
  const [row] = await db.update(dentalAppointments).set({
    status: 'cancelled', reviewStatus: 'rejected', rejectionReason: reason.trim(), reviewedBy, reviewedAt: new Date(), updatedAt: new Date(),
  }).where(and(eq(dentalAppointments.id, id), eq(dentalAppointments.clinicId, clinicId), eq(dentalAppointments.status, 'pending_review'), eq(dentalAppointments.reviewStatus, 'pending'))).returning()
  if (!row) throw new Error('Bu AI talebi zaten sonuçlandırılmış veya bulunamadı.')
  return row
}

// ── Consultations ────────────────────────────────────────────────────────────

export async function deleteConsultation(id: string) {
  const { consultations } = await import('../schema')
  const rows = await db.delete(consultations).where(and(eq(consultations.id, id), eq(consultations.clinicId, requireClinicId()))).returning({ id: consultations.id })
  return rows.length > 0
}

// ── Diseases (Hastalıklar) ───────────────────────────────────────────────────

export async function getPatientDiseases(patientId: string) {
  const { patientDiseases } = await import('../schema')
  return db.select().from(patientDiseases).where(and(eq(patientDiseases.clinicId, requireClinicId()), eq(patientDiseases.patientId, patientId))).orderBy(desc(patientDiseases.createdAt))
}

export async function createPatientDisease(data: { patientId: string, name: string, notes?: string }) {
  const { patientDiseases } = await import('../schema')
  const [row] = await db.insert(patientDiseases).values({
    clinicId: requireClinicId(),
    patientId: data.patientId,
    name: data.name,
    notes: data.notes ?? null,
  }).returning()
  return row
}

export async function deletePatientDisease(id: string) {
  const { patientDiseases } = await import('../schema')
  const rows = await db.delete(patientDiseases).where(and(eq(patientDiseases.id, id), eq(patientDiseases.clinicId, requireClinicId()))).returning({ id: patientDiseases.id })
  return rows.length > 0
}

export async function createConsultation(data: {
  patientId: string
  clinicId?: string
  doctorId?: string
  consultationNote: string
  diseaseNote?: string
}) {
  const clinicId = data.clinicId ?? requireClinicId()
  const [row] = await db.insert(consultations).values({
    patientId: data.patientId,
    clinicId,
    doctorId: data.doctorId,
    consultationNote: data.consultationNote,
    diseaseNote: data.diseaseNote,
  }).returning()
  return row
}

export async function getPatientConsultations(patientId: string) {
  const clinicId = requireClinicId()
  return await db.query.consultations.findMany({
    where: and(eq(consultations.clinicId, clinicId), eq(consultations.patientId, patientId)),
    orderBy: [desc(consultations.createdAt)]
  })
}

export async function getClinicConsultationAutocomplete(clinicId: string) {
  if (clinicId !== requireClinicId()) throw new Error('Bu kliniğe erişim yetkiniz yok')
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

type BulkPatientInput = {
  name: string
  phone?: string | null
  tcIdentity?: string | null
  email?: string | null
  gender?: string | null
  birthDate?: string | null
  birthYear?: number | null
  createdAt?: string | null
  sourceRow?: number
}

const currentYear = () => new Date().getFullYear()

const isImportValue = (value: unknown): value is string | number => {
  if (value === null || value === undefined) return false
  const text = String(value).trim().toLowerCase()
  return text !== '' && text !== 'null' && text !== '—' && text !== '-'
}

const normalizePhoneForMatch = (value: string | null | undefined) => {
  if (!isImportValue(value)) return null
  let digits = String(value).replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length === 12) digits = `0${digits.slice(2)}`
  else if (digits.length === 10) digits = `0${digits}`
  return digits || null
}

const normalizeTcForMatch = (value: string | null | undefined) => {
  if (!isImportValue(value)) return null
  const digits = String(value).replace(/\D/g, '')
  return digits || null
}

const normalizeEmailForMatch = (value: string | null | undefined) => {
  if (!isImportValue(value)) return null
  return String(value).trim().toLowerCase()
}

const parseBulkBirth = (patient: BulkPatientInput): { birthDate: Date | null, birthYear: number | null } | null => {
  if (patient.birthDate !== undefined && patient.birthDate !== null) {
    const value = String(patient.birthDate).trim()
    if (!/^\d{4}$/.test(value)) {
      const date = new Date(value)
      if (!isNaN(date.getTime()) && date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= currentYear()) {
        return { birthDate: date, birthYear: null }
      }
    }
  }

  if (patient.birthYear !== undefined && patient.birthYear !== null) {
    const year = Number(patient.birthYear)
    if (Number.isInteger(year) && year >= 1900 && year <= currentYear()) {
      return { birthDate: null, birthYear: year }
    }
  }

  return null
}

export async function createPatientsBulk(patientList: BulkPatientInput[]) {
  const clinicId = requireClinicId()
  if (!patientList || patientList.length === 0) return { success: true, insertedCount: 0, updatedCount: 0, totalProcessed: 0, errors: [] }
  
  const existingRows = await db.select().from(patients).where(eq(patients.clinicId, clinicId))

  type ExistingPatient = typeof existingRows[number]
  const addToIndex = (index: Map<string, ExistingPatient[]>, key: string | null, patient: ExistingPatient) => {
    if (!key) return
    const values = index.get(key) || []
    values.push(patient)
    index.set(key, values)
  }
  const existingByTc = new Map<string, ExistingPatient[]>()
  const existingByPhone = new Map<string, ExistingPatient[]>()
  const existingByEmail = new Map<string, ExistingPatient[]>()
  for (const row of existingRows) {
    addToIndex(existingByTc, normalizeTcForMatch(row.tcIdentity), row)
    addToIndex(existingByPhone, normalizePhoneForMatch(row.phone), row)
    addToIndex(existingByEmail, normalizeEmailForMatch(row.email), row)
  }

  const uniqueList: BulkPatientInput[] = []
  
  const currentTcs = new Set<string>()
  const currentPhones = new Set<string>()
  const currentEmails = new Set<string>()
  let updatedCount = 0
  const errors: string[] = []

  for (const p of patientList) {
    const name = p.name ? String(p.name).trim() : ''
    if (!name) continue

    const validTc = isImportValue(p.tcIdentity) ? String(p.tcIdentity).trim() : null
    const validPh = isImportValue(p.phone) ? String(p.phone).trim() : null
    const validEm = isImportValue(p.email) ? String(p.email).trim() : null
    const validGender = isImportValue(p.gender) ? String(p.gender).trim() : null
    const tcKey = normalizeTcForMatch(validTc)
    const phoneKey = normalizePhoneForMatch(validPh)
    const emailKey = normalizeEmailForMatch(validEm)
    const matches = new Map<string, ExistingPatient>()
    for (const match of [
      ...(tcKey ? existingByTc.get(tcKey) || [] : []),
      ...(phoneKey ? existingByPhone.get(phoneKey) || [] : []),
      ...(emailKey ? existingByEmail.get(emailKey) || [] : [])
    ]) matches.set(match.id, match)

    if (matches.size > 1) {
      errors.push(`${p.sourceRow || 'Bilinmeyen'}. satır: TC, telefon veya e-posta farklı mevcut hastalarla eşleşti; kayıt güncellenmedi.`)
      continue
    }

    const existingPatient = matches.values().next().value as ExistingPatient | undefined
    const birth = parseBulkBirth(p)

    if (existingPatient) {
      const fieldsToUpdate: Record<string, unknown> = {}
      if (name && name !== existingPatient.name) fieldsToUpdate.name = name
      if (validTc && validTc !== existingPatient.tcIdentity) fieldsToUpdate.tcIdentity = validTc
      if (validPh && validPh !== existingPatient.phone) fieldsToUpdate.phone = validPh
      if (validEm && validEm !== existingPatient.email) fieldsToUpdate.email = validEm
      if (validGender && validGender !== existingPatient.gender) fieldsToUpdate.gender = validGender
      if (birth && (birth.birthDate?.getTime() !== existingPatient.birthDate?.getTime() || birth.birthYear !== existingPatient.birthYear)) {
        fieldsToUpdate.birthDate = birth.birthDate
        fieldsToUpdate.birthYear = birth.birthYear
      }
      if (p.createdAt) {
        const createdAt = new Date(p.createdAt)
        if (!isNaN(createdAt.getTime()) && createdAt.getTime() !== existingPatient.createdAt?.getTime()) fieldsToUpdate.createdAt = createdAt
      }

      if (Object.keys(fieldsToUpdate).length > 0) {
        await db.update(patients).set(fieldsToUpdate).where(and(eq(patients.id, existingPatient.id), eq(patients.clinicId, clinicId)))
        updatedCount++
        Object.assign(existingPatient, fieldsToUpdate)
        addToIndex(existingByTc, normalizeTcForMatch(existingPatient.tcIdentity), existingPatient)
        addToIndex(existingByPhone, normalizePhoneForMatch(existingPatient.phone), existingPatient)
        addToIndex(existingByEmail, normalizeEmailForMatch(existingPatient.email), existingPatient)
      }
      continue
    }

    if ((tcKey && currentTcs.has(tcKey)) || (phoneKey && currentPhones.has(phoneKey)) || (emailKey && currentEmails.has(emailKey))) {
      errors.push(`${p.sourceRow || 'Bilinmeyen'}. satır: Dosya içinde aynı kimlik bilgileriyle tekrar eden kayıt atlandı.`)
      continue
    }

    uniqueList.push({
      ...p,
      name,
      tcIdentity: validTc,
      phone: validPh,
      email: validEm,
      gender: validGender
    })
    if (tcKey) currentTcs.add(tcKey)
    if (phoneKey) currentPhones.add(phoneKey)
    if (emailKey) currentEmails.add(emailKey)
  }

  let insertedCount = 0
  if (uniqueList.length > 0) {
    const mapped = uniqueList.map(p => {
      const birth = parseBulkBirth(p)
      let createdAt: Date | undefined = undefined
      if (p.createdAt) {
        const d = new Date(p.createdAt)
        if (!isNaN(d.getTime())) createdAt = d
      }
      return {
        clinicId,
        name: p.name,
        phone: p.phone,
        tcIdentity: p.tcIdentity,
        email: p.email,
        gender: p.gender,
        birthDate: birth?.birthDate || null,
        birthYear: birth?.birthYear || null,
        ...(createdAt ? { createdAt } : {})
      }
    })
    const inserted = await db.insert(patients).values(mapped).returning()
    insertedCount = inserted.length
  }

  return {
    success: true,
    insertedCount,
    updatedCount,
    totalProcessed: patientList.length,
    errors
  }
}

export async function updateTreatmentGroupFull(groupId: string, data: {
  name: string
  description?: string
  patientId: string
  treatments: any[]
  updatedById?: string
  appointmentId?: string
}) {
  const clinicId = requireClinicId()
  await updateTreatmentGroup(groupId, { name: data.name, description: data.description, updatedById: data.updatedById })
  
  const existing = await db.select().from(treatmentPlans).where(and(eq(treatmentPlans.clinicId, clinicId), eq(treatmentPlans.groupId, groupId)))
  const existingIds = existing.map(t => t.id)
  const incomingIds = data.treatments.filter(t => t.id).map(t => t.id)
  const idsToDelete = existingIds.filter(id => !incomingIds.includes(id))
  
  for (const id of idsToDelete) {
    await db.delete(treatmentPlans).where(and(eq(treatmentPlans.id, id), eq(treatmentPlans.clinicId, clinicId)))
  }
  
  for (const t of data.treatments) {
    let tId = t.id
    if (t.id && existingIds.includes(t.id)) {
       await db.update(treatmentPlans).set({
         procedureName: t.procedureName,
         toothNumber: t.toothNumber,
         indication: t.indication,
         cost: t.cost,
         doctorId: t.doctorId
       }).where(and(eq(treatmentPlans.id, t.id), eq(treatmentPlans.clinicId, clinicId)))
    } else {
       const created = await createTreatmentPlan({ 
         patientId: data.patientId,
         procedureName: t.procedureName,
         toothNumber: t.toothNumber,
         indication: t.indication,
         cost: t.cost,
         doctorId: t.doctorId,
         groupId 
       })
       tId = created?.id
    }
    if (data.appointmentId && tId) {
      await linkTreatmentToAppointment(data.appointmentId, tId, 1).catch(() => {})
    }
  }
  return true
}

export async function deletePatientsBulk(patientIds: string[]) {
  const clinicId = requireClinicId()
  if (!patientIds || patientIds.length === 0) return { deletedCount: 0 }

  const validPatients = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), inArray(patients.id, patientIds)))

  const validIds = validPatients.map(p => p.id)
  if (validIds.length === 0) return { deletedCount: 0 }

  await db.transaction(async (tx) => {
    // 1. WhatsApp conversation referansını null yap
    await tx
      .update(whatsappConversations)
      .set({ patientId: null })
      .where(inArray(whatsappConversations.patientId, validIds))

    // 2. Material Usages (hastaya bağlı)
    await tx.delete(materialUsages).where(inArray(materialUsages.patientId, validIds))

    // 3. Tooth records
    await tx.delete(toothRecords).where(inArray(toothRecords.patientId, validIds))

    // 4. Appointment Treatments ve Dental Appointments
    const patientAppointments = await tx
      .select({ id: dentalAppointments.id })
      .from(dentalAppointments)
      .where(inArray(dentalAppointments.patientId, validIds))
    const apptIds = patientAppointments.map(a => a.id)

    if (apptIds.length > 0) {
      await tx.delete(appointmentTreatments).where(inArray(appointmentTreatments.appointmentId, apptIds))
      await tx.delete(dentalAppointments).where(inArray(dentalAppointments.id, apptIds))
    }

    // 5. Patient payments
    await tx.delete(patientPayments).where(inArray(patientPayments.patientId, validIds))

    // 6. Installment plans
    await tx.delete(installmentPlans).where(inArray(installmentPlans.patientId, validIds))

    // 7. Completed works (lab works)
    await tx.delete(completedWorks).where(inArray(completedWorks.patientId, validIds))

    // 8. Waiting list
    await tx.delete(waitingList).where(inArray(waitingList.patientId, validIds))

    // 9. Consultations & Notes & Diseases & Anamnesis
    await tx.delete(consultations).where(inArray(consultations.patientId, validIds))
    await tx.delete(doctorNotes).where(inArray(doctorNotes.patientId, validIds))
    await tx.delete(patientNotes).where(inArray(patientNotes.patientId, validIds))
    await tx.delete(patientDiseases).where(inArray(patientDiseases.patientId, validIds))
    await tx.delete(patientAnamnesis).where(inArray(patientAnamnesis.patientId, validIds))

    // 10. Treatment plans & treatment groups
    await tx.delete(treatmentPlans).where(inArray(treatmentPlans.patientId, validIds))
    await tx.delete(treatmentGroups).where(inArray(treatmentGroups.patientId, validIds))

    // 11. En son hastaları sil
    await tx.delete(patients).where(and(eq(patients.clinicId, clinicId), inArray(patients.id, validIds)))
  })

  return { deletedCount: validIds.length }
}

export async function deletePatient(patientId: string) {
  return await deletePatientsBulk([patientId])
}
