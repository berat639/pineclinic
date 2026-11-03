import { eq, ne, desc, and, gt, gte, lt, lte, sql, ilike, or, inArray } from 'drizzle-orm'
import { db } from '../client'
import {
  users,
  patients,
  dentalAppointments,
  treatmentPlans,
  treatmentPlanDetails,
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
  whatsappConversations,
  patientConsentRequests,
  planAttachments,
} from '../schema'
import { currentClinicId, requireClinicId } from '../../tenancy/context'

let aiReviewSchemaPromise: Promise<void> | null = null
let patientArchiveSchemaPromise: Promise<void> | null = null
let patientActivityLogsPromise: Promise<void> | null = null

export function ensurePatientActivityLogsTable(): Promise<void> {
  if (!patientActivityLogsPromise) patientActivityLogsPromise = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS patient_activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
        patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
        appointment_id UUID,
        treatment_id UUID,
        category TEXT NOT NULL DEFAULT 'appointment',
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        actor_type TEXT NOT NULL DEFAULT 'desk',
        actor_name TEXT,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS patient_activity_logs_patient_idx ON patient_activity_logs (clinic_id, patient_id, created_at DESC);
    `)
  })().catch(error => {
    patientActivityLogsPromise = null
    console.error('[DentalRepo] Error ensuring patient_activity_logs table:', error)
  })
  return patientActivityLogsPromise
}

export interface PatientActivityLogInput {
  clinicId?: string
  patientId: string
  appointmentId?: string | null
  treatmentId?: string | null
  category?: 'appointment' | 'treatment' | 'patient_response' | string
  eventType?: string
  event_type?: string
  title: string
  oldValue?: string | null
  old_value?: string | null
  newValue?: string | null
  new_value?: string | null
  actorType?: 'patient' | 'doctor' | 'desk' | 'admin' | 'system' | string
  actor_type?: string
  actorName?: string | null
  actor_name?: string | null
  note?: string | null
}

export async function logPatientActivity(entry: PatientActivityLogInput): Promise<void> {
  try {
    await ensurePatientActivityLogsTable()
    const clinicId = entry.clinicId || currentClinicId()
    if (!clinicId || !entry.patientId) return
    const category = entry.category || 'appointment'
    const eventType = entry.eventType || entry.event_type || 'status_changed'
    const oldVal = entry.oldValue !== undefined ? entry.oldValue : (entry.old_value ?? null)
    const newVal = entry.newValue !== undefined ? entry.newValue : (entry.new_value ?? null)
    const actorType = entry.actorType || entry.actor_type || 'desk'
    const actorName = entry.actorName !== undefined ? entry.actorName : (entry.actor_name ?? null)
    await db.execute(sql`
      INSERT INTO patient_activity_logs (
        clinic_id, patient_id, appointment_id, treatment_id,
        category, event_type, title, old_value, new_value,
        actor_type, actor_name, note
      ) VALUES (
        ${clinicId}, ${entry.patientId}, ${entry.appointmentId ?? null}, ${entry.treatmentId ?? null},
        ${category}, ${eventType}, ${entry.title}, ${oldVal}, ${newVal},
        ${actorType}, ${actorName}, ${entry.note ?? null}
      )
    `)
  } catch (err) {
    console.warn('[DentalRepo] Could not write patient activity log:', err)
  }
}

function formatApptDateTimeTR(dt: Date | string | null | undefined, endDt?: Date | string | null): string {
  if (!dt) return ''
  const d = dt instanceof Date ? dt : new Date(dt)
  if (Number.isNaN(d.getTime())) return ''
  const datePart = d.toLocaleDateString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const startPart = d.toLocaleTimeString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
  })
  if (endDt) {
    const ed = endDt instanceof Date ? endDt : new Date(endDt)
    if (!Number.isNaN(ed.getTime())) {
      const endPart = ed.toLocaleTimeString('tr-TR', {
        timeZone: 'Europe/Istanbul',
        hour: '2-digit',
        minute: '2-digit',
      })
      return `${datePart} ${startPart} - ${endPart}`
    }
  }
  return `${datePart} ${startPart}`
}

/** Keeps patient archival safe when a deploy starts before migrations complete. */
export function ensurePatientArchiveSchema(): Promise<void> {
  if (!patientArchiveSchemaPromise) patientArchiveSchemaPromise = (async () => {
    await db.execute(sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false`)
    await db.execute(sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`)
    await db.execute(sql`ALTER TABLE patient_payments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS patients_clinic_archive_idx ON patients (clinic_id, is_archived)`)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS dental_appointments_clinic_active_idx ON dental_appointments (clinic_id, is_active, start_time)`)
  })().catch(error => { patientArchiveSchemaPromise = null; throw error })
  return patientArchiveSchemaPromise
}

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
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS patient_response_status TEXT`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS patient_response_note TEXT`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS patient_preferred_date TEXT`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS patient_responded_at TIMESTAMPTZ`)
    await db.execute(sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS patient_response_channel TEXT`)
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
    .where(and(
      eq(clinicMemberships.clinicId, clinicId),
      eq(clinicMemberships.role, 'hekim'),
      eq(clinicMemberships.active, true),
      eq(users.active, true),
    ))
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
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id            UUID REFERENCES clinics(id) ON DELETE CASCADE,
        doctor_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        substitute_doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        date                 TEXT NOT NULL,
        start_time           TEXT NOT NULL,
        end_time             TEXT NOT NULL,
        is_full_day          BOOLEAN NOT NULL DEFAULT false,
        reason               TEXT,
        notes                TEXT,
        created_by           UUID REFERENCES users(id),
        created_at           TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE doctor_leaves ADD COLUMN IF NOT EXISTS substitute_doctor_id UUID REFERENCES users(id) ON DELETE SET NULL;
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
      substituteDoctorId: doctorLeaves.substituteDoctorId,
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

  const subDocIds = Array.from(
    new Set(rows.map((r) => r.substituteDoctorId).filter((id): id is string => Boolean(id)))
  )
  const subDocMap = new Map<string, string>()
  if (subDocIds.length > 0) {
    const subDocs = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, subDocIds))
    for (const sd of subDocs) {
      if (sd.id && sd.name) subDocMap.set(sd.id, sd.name)
    }
  }

  return rows.map((r) => ({
    ...r,
    substituteDoctorName: r.substituteDoctorId ? subDocMap.get(r.substituteDoctorId) || null : null,
  }))
}

export async function createDoctorLeave(data: {
  doctorId: string
  substituteDoctorId?: string | null
  unassignAppointments?: boolean
  appointmentIds?: string[]
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

  const subDocId =
    typeof data.substituteDoctorId === 'string' && data.substituteDoctorId.trim().length > 0
      ? data.substituteDoctorId.trim()
      : null

  const [row] = await db
    .insert(doctorLeaves)
    .values({
      clinicId,
      doctorId: data.doctorId,
      substituteDoctorId: subDocId,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      isFullDay: Boolean(data.isFullDay),
      reason: data.reason || null,
      notes: data.notes || null,
      createdBy: data.createdBy || null,
    })
    .returning()

  if (subDocId || data.unassignAppointments) {
    try {
      await ensurePatientArchiveSchema()
      const dayStart = new Date(`${data.date}T00:00:00+03:00`)
      const dayEnd = new Date(`${data.date}T23:59:59+03:00`)
      const leaveStartDt = new Date(
        `${data.date}T${data.isFullDay ? '00:00' : data.startTime}:00+03:00`
      )
      const leaveEndDt = new Date(
        `${data.date}T${data.isFullDay ? '23:59' : data.endTime}:${data.isFullDay ? '59' : '00'}+03:00`
      )

      const dayAppts = await db
        .select()
        .from(dentalAppointments)
        .where(
          and(
            eq(dentalAppointments.clinicId, clinicId),
            eq(dentalAppointments.doctorId, data.doctorId),
            eq(dentalAppointments.isActive, true),
            gte(dentalAppointments.startTime, dayStart),
            lte(dentalAppointments.startTime, dayEnd)
          )
        )

      const targetIdSet = new Set<string>()
      for (const a of dayAppts) {
        if (a.status === 'cancelled' || a.status === 'completed') continue
        if (data.isFullDay) {
          targetIdSet.add(a.id)
          continue
        }
        const aStart = new Date(a.startTime).getTime()
        const aEnd = new Date(a.endTime).getTime()
        if (aStart < leaveEndDt.getTime() && aEnd > leaveStartDt.getTime()) {
          targetIdSet.add(a.id)
        }
      }

      if (Array.isArray(data.appointmentIds) && data.appointmentIds.length > 0) {
        const explicitIds = data.appointmentIds.filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0
        )
        if (explicitIds.length > 0) {
          const explicitAppts = await db
            .select({ id: dentalAppointments.id, status: dentalAppointments.status })
            .from(dentalAppointments)
            .where(
              and(
                eq(dentalAppointments.clinicId, clinicId),
                eq(dentalAppointments.doctorId, data.doctorId),
                inArray(dentalAppointments.id, explicitIds)
              )
            )
          for (const ea of explicitAppts) {
            if (ea.status !== 'cancelled' && ea.status !== 'completed') {
              targetIdSet.add(ea.id)
            }
          }
        }
      }

      const targetApptIds = Array.from(targetIdSet)
      if (targetApptIds.length > 0) {
        const links = await db
          .select({ treatmentPlanId: appointmentTreatments.treatmentPlanId })
          .from(appointmentTreatments)
          .where(inArray(appointmentTreatments.appointmentId, targetApptIds))
        const linkedTreatmentIds = Array.from(
          new Set(links.map((l) => l.treatmentPlanId).filter(Boolean))
        )

        if (subDocId) {
          // Case 1: Transfer appointments & linked treatments to substitute doctor
          await db
            .update(dentalAppointments)
            .set({
              doctorId: subDocId,
              status: 'scheduled',
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(dentalAppointments.clinicId, clinicId),
                inArray(dentalAppointments.id, targetApptIds)
              )
            )

          if (linkedTreatmentIds.length > 0) {
            await db
              .update(treatmentPlans)
              .set({ doctorId: subDocId })
              .where(
                and(
                  eq(treatmentPlans.clinicId, clinicId),
                  inArray(treatmentPlans.id, linkedTreatmentIds)
                )
              )

            const detailRows = await db
              .select()
              .from(treatmentPlanDetails)
              .where(
                and(
                  eq(treatmentPlanDetails.clinicId, clinicId),
                  inArray(treatmentPlanDetails.treatmentId, linkedTreatmentIds)
                )
              )
            for (const detail of detailRows) {
              const meta =
                detail.metadata && typeof detail.metadata === 'object'
                  ? { ...(detail.metadata as Record<string, any>) }
                  : {}
              if (Array.isArray(meta.doctorIds) && meta.doctorIds.length > 0) {
                const nextIds: string[] = Array.from(
                  new Set<string>(
                    meta.doctorIds.map((id: string): string =>
                      id === data.doctorId ? subDocId : id
                    )
                  )
                )
                if (!nextIds.includes(subDocId)) nextIds.unshift(subDocId)
                meta.doctorIds = nextIds
              } else {
                meta.doctorIds = [subDocId]
              }
              await db
                .update(treatmentPlanDetails)
                .set({ metadata: meta })
                .where(
                  and(
                    eq(treatmentPlanDetails.clinicId, clinicId),
                    eq(treatmentPlanDetails.treatmentId, detail.treatmentId)
                  )
                )
            }
          }
        } else if (data.unassignAppointments) {
          // Case 2: Unassign doctor from appointments & linked treatments
          await db
            .update(dentalAppointments)
            .set({
              doctorId: null,
              status: 'pending_assignment',
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(dentalAppointments.clinicId, clinicId),
                inArray(dentalAppointments.id, targetApptIds)
              )
            )

          if (linkedTreatmentIds.length > 0) {
            await db
              .update(treatmentPlans)
              .set({ doctorId: null })
              .where(
                and(
                  eq(treatmentPlans.clinicId, clinicId),
                  eq(treatmentPlans.doctorId, data.doctorId),
                  inArray(treatmentPlans.id, linkedTreatmentIds)
                )
              )

            const detailRows = await db
              .select()
              .from(treatmentPlanDetails)
              .where(
                and(
                  eq(treatmentPlanDetails.clinicId, clinicId),
                  inArray(treatmentPlanDetails.treatmentId, linkedTreatmentIds)
                )
              )
            for (const detail of detailRows) {
              const meta =
                detail.metadata && typeof detail.metadata === 'object'
                  ? { ...(detail.metadata as Record<string, any>) }
                  : {}
              if (Array.isArray(meta.doctorIds)) {
                meta.doctorIds = meta.doctorIds.filter((id: string) => id !== data.doctorId)
                await db
                  .update(treatmentPlanDetails)
                  .set({ metadata: meta })
                  .where(
                    and(
                      eq(treatmentPlanDetails.clinicId, clinicId),
                      eq(treatmentPlanDetails.treatmentId, detail.treatmentId)
                    )
                  )
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[DentalRepo] Error processing conflicting appointments on leave creation:', err)
    }
  }

  let substituteDoctorName: string | null = null
  if (subDocId) {
    const [sd] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, subDocId))
      .limit(1)
    substituteDoctorName = sd?.name || null
  }

  return {
    ...row,
    substituteDoctorName,
  }
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
  await ensurePatientArchiveSchema()
  const clinicId = requireClinicId()
  let appts: any[] = [];
  if (dateStr) {
    const dayStart = new Date(`${dateStr}T00:00:00+03:00`)
    const dayEnd = new Date(`${dateStr}T23:59:59+03:00`)
    appts = await db
      .select()
      .from(dentalAppointments)
      .where(and(eq(dentalAppointments.clinicId, clinicId), eq(dentalAppointments.isActive, true), gte(dentalAppointments.startTime, dayStart), lte(dentalAppointments.startTime, dayEnd)))
      .orderBy(dentalAppointments.startTime)
  } else {
    appts = await db.select().from(dentalAppointments).where(and(eq(dentalAppointments.clinicId, clinicId), eq(dentalAppointments.isActive, true))).orderBy(dentalAppointments.startTime)
  }
  
  if (appts.length === 0) return appts;

  // Self-healing: Eğer gelecekteki aktif bir randevunun hekimi dondurulmuş (active = false) ise otomatik boşa çıkar
  try {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const assignedDocIds = Array.from(
      new Set(appts.map((a: any) => a.doctorId).filter((id): id is string => Boolean(id)))
    )
    if (assignedDocIds.length > 0) {
      const docRows = await db
        .select({ id: users.id, active: users.active })
        .from(users)
        .where(inArray(users.id, assignedDocIds))
      const inactiveDocIds = new Set(
        docRows.filter((d) => d.active === false).map((d) => d.id)
      )
      if (inactiveDocIds.size > 0) {
        const toUnassignIds: string[] = []
        for (const a of appts) {
          if (
            a.doctorId &&
            inactiveDocIds.has(a.doctorId) &&
            new Date(a.startTime).getTime() >= startOfToday.getTime() &&
            a.status !== 'completed' &&
            a.status !== 'cancelled' &&
            a.status !== 'no_show'
          ) {
            toUnassignIds.push(a.id)
            a.doctorId = null
            a.status = 'pending_assignment'
          }
        }
        if (toUnassignIds.length > 0) {
          await db
            .update(dentalAppointments)
            .set({
              doctorId: null,
              status: 'pending_assignment',
              updatedAt: new Date(),
            })
            .where(inArray(dentalAppointments.id, toUnassignIds))
        }
      }
    }
  } catch (err) {
    console.warn('[DentalRepo] Could not self-heal frozen doctor appointments:', err)
  }
  
  const { appointmentTreatments } = await import('../schema');
  const { inArray: inArr } = await import('drizzle-orm');
  
  const apptIds = appts.map((a: any) => a.id);
  const links = await db.select({ appointmentId: appointmentTreatments.appointmentId })
    .from(appointmentTreatments)
    .where(inArr(appointmentTreatments.appointmentId, apptIds));
    
  const linkedApptIds = new Set(links.map(l => l.appointmentId));
  return appts.map(a => ({ ...a, hasTreatment: linkedApptIds.has(a.id) }));
}

export async function createDentalAppointment(
  data: {
    patientId: string
    doctorId: string | null
    title: string
    startTime: Date
    endTime: Date
    status?: string
    type?: string
    notes?: string
  },
  actor?: { actorType?: string; actorName?: string }
) {
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
  if (row) {
    if (row.patientId) {
      void logPatientActivity({
        clinicId,
        patientId: row.patientId,
        appointmentId: row.id,
        category: 'appointment',
        event_type: 'appointment_created',
        title: row.title || 'Yeni Randevu Oluşturuldu',
        old_value: null,
        new_value: formatApptDateTimeTR(row.startTime, row.endTime),
        actor_type: actor?.actorType || 'desk',
        actor_name: actor?.actorName || null,
        note: row.notes || null,
      })
    }
    import('../../services/appointment-notifications')
      .then(({ scheduleAppointmentNotification }) =>
        scheduleAppointmentNotification({ clinicId, appointmentId: row.id, kind: 'appointment_created' }),
      )
      .catch(() => {})
  }
  return row
}

export async function deleteDentalAppointment(id: string): Promise<boolean> {
  const clinicId = requireClinicId()
  import('../../services/appointment-notifications')
    .then(({ cancelAppointmentNotifications }) => cancelAppointmentNotifications(clinicId, id))
    .catch(() => {})
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
  await ensurePatientArchiveSchema()
  const clinicId = explicitClinicId ?? requireClinicId()
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null

  const rows = await db.select({ id: patients.id, name: patients.name, phone: patients.phone })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.isArchived, false), sql`${patients.phone} IS NOT NULL`))

  const lastTenDigits = digits.slice(-10)
  return rows.find(patient => patient.phone?.replace(/\D/g, '').endsWith(lastTenDigits)) ?? null
}

export async function getPatientFullProfile(patientId: string) {
  await ensureAiAppointmentReviewSchema()
  await ensurePatientArchiveSchema()
  await ensurePatientActivityLogsTable()
  const clinicId = requireClinicId()
  const {
    patientAnamnesis,
    patientDiseases,
    dentalAppointments,
    treatmentPlans,
    treatmentPlanDetails,
    treatmentGroups,
    appointmentTreatments,
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
    treatmentsRawRes,
    groupsRes,
    paymentsRes,
    completedRes,
    consultationsRes,
    notesRes,
    toothRecordsRes,
    materialsRes,
    activityLogsRaw
  ] = await Promise.all([
    // Patient
    db.select().from(patients).where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId))).limit(1),
    
    // Anamnesis
    db.select({ formData: patientAnamnesis.formData, filledAt: patientAnamnesis.filledAt })
      .from(patientAnamnesis).where(and(eq(patientAnamnesis.clinicId, clinicId), eq(patientAnamnesis.patientId, patientId))).orderBy(desc(patientAnamnesis.filledAt)).limit(1),

    // Diseases
    db.select({ name: patientDiseases.name, status: patientDiseases.status, notes: patientDiseases.notes })
      .from(patientDiseases).where(and(eq(patientDiseases.clinicId, clinicId), eq(patientDiseases.patientId, patientId))),

    // Appointments (full details + doctorName)
    db.select({
        id: dentalAppointments.id,
        startTime: dentalAppointments.startTime,
        endTime: dentalAppointments.endTime,
        status: dentalAppointments.status,
        title: dentalAppointments.title,
        type: dentalAppointments.type,
        notes: dentalAppointments.notes,
        complaint: dentalAppointments.complaint,
        patientResponseStatus: dentalAppointments.patientResponseStatus,
        patientResponseNote: dentalAppointments.patientResponseNote,
        patientPreferredDate: dentalAppointments.patientPreferredDate,
        createdAt: dentalAppointments.createdAt,
        updatedAt: dentalAppointments.updatedAt,
        doctorId: dentalAppointments.doctorId,
        doctorName: users.name,
      })
      .from(dentalAppointments)
      .leftJoin(users, eq(dentalAppointments.doctorId, users.id))
      .where(and(eq(dentalAppointments.clinicId, clinicId), eq(dentalAppointments.patientId, patientId)))
      .orderBy(desc(dentalAppointments.startTime)),

    // Treatment Plans
    db.select({
      id: treatmentPlans.id,
      procedureName: treatmentPlans.procedureName,
      toothNumber: treatmentPlans.toothNumber,
      indication: treatmentPlans.indication,
      cost: treatmentPlans.cost,
      status: treatmentPlans.status,
      groupId: treatmentPlans.groupId,
      groupName: treatmentGroups.name,
      createdAt: treatmentPlans.createdAt,
      doctorId: treatmentPlans.doctorId,
      doctorName: users.name,
      detailMetadata: treatmentPlanDetails.metadata,
    })
    .from(treatmentPlans)
    .leftJoin(users, eq(treatmentPlans.doctorId, users.id))
    .leftJoin(treatmentGroups, eq(treatmentPlans.groupId, treatmentGroups.id))
    .leftJoin(treatmentPlanDetails, eq(treatmentPlans.id, treatmentPlanDetails.treatmentId))
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

    // Activity Logs
    db.execute(sql`
      SELECT id, clinic_id, patient_id, appointment_id, treatment_id,
             category, event_type, title, old_value, new_value,
             actor_type, actor_name, note, created_at
      FROM patient_activity_logs
      WHERE clinic_id = ${clinicId} AND patient_id = ${patientId}
      ORDER BY created_at DESC
      LIMIT 200
    `).catch(() => []),
  ])

  const patient = patientRes[0]
  if (!patient) return null

  const treatmentIds = treatmentsRawRes.map(t => t.id)
  const sessionsByTreatmentId = new Map<string, Array<{ id: string; appointmentId: string; sessionNumber: number; sessionStatus: string; startTime: Date; endTime: Date }>>()
  if (treatmentIds.length > 0) {
    try {
      const sessionRows = await db.select({
        id: appointmentTreatments.id,
        treatmentPlanId: appointmentTreatments.treatmentPlanId,
        appointmentId: appointmentTreatments.appointmentId,
        sessionNumber: appointmentTreatments.sessionNumber,
        sessionStatus: appointmentTreatments.sessionStatus,
        startTime: dentalAppointments.startTime,
        endTime: dentalAppointments.endTime,
      })
        .from(appointmentTreatments)
        .innerJoin(dentalAppointments, eq(appointmentTreatments.appointmentId, dentalAppointments.id))
        .where(and(inArray(appointmentTreatments.treatmentPlanId, treatmentIds), ne(dentalAppointments.status, 'cancelled')))
        .orderBy(desc(dentalAppointments.startTime))
      for (const s of sessionRows) {
        const list = sessionsByTreatmentId.get(s.treatmentPlanId) || []
        list.push({
          id: s.id,
          appointmentId: s.appointmentId,
          sessionNumber: s.sessionNumber,
          sessionStatus: s.sessionStatus,
          startTime: s.startTime,
          endTime: s.endTime,
        })
        sessionsByTreatmentId.set(s.treatmentPlanId, list)
      }
    } catch {}
  }

  const treatmentsRes = treatmentsRawRes.map(t => {
    const meta = (t.detailMetadata && typeof t.detailMetadata === 'object') ? (t.detailMetadata as Record<string, any>) : {}
    const color = typeof meta.color === 'string' ? meta.color : null
    const sessions = sessionsByTreatmentId.get(t.id) || []
    return {
      id: t.id,
      procedureName: t.procedureName,
      toothNumber: t.toothNumber,
      indication: t.indication,
      cost: t.cost,
      status: t.status,
      groupId: t.groupId,
      groupName: t.groupName,
      createdAt: t.createdAt,
      doctorId: t.doctorId,
      doctorName: t.doctorName,
      color,
      metadata: meta,
      sessions,
    }
  })

  const activityLogs = (Array.isArray(activityLogsRaw) ? activityLogsRaw : []).map((row: any) => ({
    id: row.id,
    clinicId: row.clinic_id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    appointment_id: row.appointment_id,
    treatmentId: row.treatment_id,
    treatment_id: row.treatment_id,
    category: row.category,
    eventType: row.event_type,
    event_type: row.event_type,
    title: row.title,
    oldValue: row.old_value,
    old_value: row.old_value,
    newValue: row.new_value,
    new_value: row.new_value,
    actorType: row.actor_type,
    actor_type: row.actor_type,
    actorName: row.actor_name,
    actor_name: row.actor_name,
    note: row.note,
    createdAt: row.created_at,
    created_at: row.created_at,
  }))

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
    activityLogs,
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
  await ensurePatientArchiveSchema()
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
    isArchived: patients.isArchived,
    archivedAt: patients.archivedAt,
    createdAt: patients.createdAt,
    appointmentCount: sql<number>`(
      SELECT count(*)::int
      FROM ${dentalAppointments}
      WHERE ${dentalAppointments.clinicId} = ${clinicId}
        AND ${dentalAppointments.patientId} = ${patients.id}
    )`,
    paymentCount: sql<number>`(
      SELECT count(*)::int
      FROM ${patientPayments}
      WHERE ${patientPayments.clinicId} = ${clinicId}
        AND ${patientPayments.patientId} = ${patients.id}
    )`,
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

async function enrichTreatmentDoctorIds(plans: Array<typeof treatmentPlans.$inferSelect>, clinicId: string) {
  if (plans.length === 0) return
  try {
    const ids = plans.map(p => p.id)
    const details = await db.select({
      treatmentId: treatmentPlanDetails.treatmentId,
      metadata: treatmentPlanDetails.metadata,
    }).from(treatmentPlanDetails).where(and(eq(treatmentPlanDetails.clinicId, clinicId), inArray(treatmentPlanDetails.treatmentId, ids)))
    const detailMap = new Map(details.map(d => [d.treatmentId, d.metadata]))
    for (const p of plans) {
      const meta = detailMap.get(p.id) as Record<string, unknown> | undefined
      const metaDocIds = meta && Array.isArray(meta.doctorIds)
        ? (meta.doctorIds as unknown[]).filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : null
      ;(p as any).doctorIds = metaDocIds ?? (p.doctorId ? [p.doctorId] : [])
    }
  } catch {
    for (const p of plans) {
      ;(p as any).doctorIds = p.doctorId ? [p.doctorId] : []
    }
  }
}

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
    .where(and(eq(treatmentGroups.clinicId, clinicId), eq(treatmentGroups.patientId, patientId), ne(treatmentGroups.status, 'cancelled')))
    .orderBy(desc(treatmentGroups.createdAt))
  
  // For each group, fetch its treatment plans + attached sessions
  const result = []
  for (const group of groups) {
    const plans = await db.select().from(treatmentPlans)
      .where(and(eq(treatmentPlans.clinicId, clinicId), eq(treatmentPlans.patientId, patientId), eq(treatmentPlans.groupId, group.id), ne(treatmentPlans.status, 'cancelled')))
      .orderBy(desc(treatmentPlans.createdAt))
    
    await enrichTreatmentDoctorIds(plans, clinicId)

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
        .where(and(eq(appointmentTreatments.treatmentPlanId, p.id), ne(dentalAppointments.status, 'cancelled')))
        .orderBy(desc(dentalAppointments.startTime), desc(appointmentTreatments.createdAt))
      ;(p as any).sessions = sessions
    }

    result.push({ ...group, treatments: plans })
  }
  
  // Also fetch ungrouped treatments + attached sessions
  const ungrouped = await db.select().from(treatmentPlans)
    .where(and(eq(treatmentPlans.clinicId, clinicId), eq(treatmentPlans.patientId, patientId), ne(treatmentPlans.status, 'cancelled'), sql`group_id IS NULL`))
    .orderBy(desc(treatmentPlans.createdAt))

  await enrichTreatmentDoctorIds(ungrouped, clinicId)

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
      .where(and(eq(appointmentTreatments.treatmentPlanId, p.id), ne(dentalAppointments.status, 'cancelled')))
      .orderBy(desc(dentalAppointments.startTime), desc(appointmentTreatments.createdAt))
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
    .where(and(eq(appointmentTreatments.appointmentId, appointmentId), eq(treatmentPlans.clinicId, clinicId), ne(treatmentPlans.status, 'cancelled')))
    .orderBy(appointmentTreatments.sessionNumber)
}

export async function linkTreatmentToAppointment(appointmentId: string, treatmentPlanId: string, sessionNumber: number = 1, notes?: string) {
  const clinicId = requireClinicId()
  const [valid] = await db.select({ id: treatmentPlans.id }).from(treatmentPlans)
    .innerJoin(dentalAppointments, eq(dentalAppointments.id, appointmentId))
    .where(and(eq(treatmentPlans.id, treatmentPlanId), eq(treatmentPlans.clinicId, clinicId), eq(dentalAppointments.clinicId, clinicId), eq(treatmentPlans.patientId, dentalAppointments.patientId))).limit(1)
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
  import('../../services/appointment-notifications')
    .then(({ scheduleAppointmentNotification }) =>
      scheduleAppointmentNotification({ clinicId, appointmentId, kind: 'appointment_created' }),
    )
    .catch(() => {})
  return row
}

export async function unlinkTreatmentFromAppointment(appointmentId: string, treatmentPlanId: string) {
  const clinicId = requireClinicId()
  const [valid] = await db.select({ id: treatmentPlans.id }).from(treatmentPlans)
    .innerJoin(dentalAppointments, eq(dentalAppointments.id, appointmentId))
    .where(and(eq(treatmentPlans.id, treatmentPlanId), eq(treatmentPlans.clinicId, clinicId), eq(dentalAppointments.clinicId, clinicId), eq(treatmentPlans.patientId, dentalAppointments.patientId))).limit(1)
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
  const plans = await db.select().from(treatmentPlans).where(and(eq(treatmentPlans.clinicId, clinicId), eq(treatmentPlans.patientId, patientId), ne(treatmentPlans.status, 'cancelled'))).orderBy(desc(treatmentPlans.createdAt))

  await enrichTreatmentDoctorIds(plans, clinicId)

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
      .where(and(eq(appointmentTreatments.treatmentPlanId, p.id), ne(dentalAppointments.status, 'cancelled')))
      .orderBy(desc(dentalAppointments.startTime), desc(appointmentTreatments.createdAt))
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

export async function updateTreatmentPlan(
  id: string,
  data: { status?: string; groupId?: string | null; doctorId?: string | null },
  actor?: { actorType?: string; actorName?: string }
) {
  const clinicId = requireClinicId()
  const [existing] = await db
    .select({
      id: treatmentPlans.id,
      patientId: treatmentPlans.patientId,
      procedureName: treatmentPlans.procedureName,
      toothNumber: treatmentPlans.toothNumber,
      status: treatmentPlans.status,
      isPeriodic: treatmentPlans.isPeriodic,
      periodDays: treatmentPlans.periodDays,
      notifyPatient: treatmentPlans.notifyPatient,
    })
    .from(treatmentPlans)
    .where(and(eq(treatmentPlans.id, id), eq(treatmentPlans.clinicId, clinicId)))
    .limit(1)
  if (!existing) return null

  const values: Record<string, unknown> = {}
  if (data.status !== undefined) {
    values.status = data.status
    if (data.status === 'completed') {
      if (existing.isPeriodic && existing.notifyPatient && existing.periodDays && existing.periodDays > 0) {
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + existing.periodDays)
        values.nextNotificationDate = nextDate.toISOString().slice(0, 10)
      }
    }
  }
  if (data.groupId !== undefined) values.groupId = data.groupId
  if (data.doctorId !== undefined) values.doctorId = data.doctorId
  if (Object.keys(values).length === 0) return null
  const [row] = await db.update(treatmentPlans)
    .set(values)
    .where(and(eq(treatmentPlans.id, id), eq(treatmentPlans.clinicId, clinicId)))
    .returning()
  if (row && data.status !== undefined && existing.status !== data.status && existing.patientId) {
    const toothPrefix = existing.toothNumber && /^[1-4][1-8]$/.test(existing.toothNumber)
      ? `#${existing.toothNumber} `
      : ''
    void logPatientActivity({
      clinicId,
      patientId: existing.patientId,
      treatmentId: existing.id,
      category: 'treatment',
      event_type: 'treatment_status_changed',
      title: `${toothPrefix}${existing.procedureName}`,
      old_value: existing.status,
      new_value: data.status,
      actor_type: actor?.actorType || 'desk',
      actor_name: actor?.actorName || null,
    })
  }
  return row ?? null
}

export async function deleteTreatmentPlan(id: string): Promise<boolean> {
  const clinicId = requireClinicId()
  const rows = await db.delete(treatmentPlans).where(and(eq(treatmentPlans.id, id), eq(treatmentPlans.clinicId, clinicId))).returning({ id: treatmentPlans.id })
  return rows.length > 0
}

// ── Payments ─────────────────────────────────────────────────────────────────

export async function getPatientPayments(patientId: string) {
  await ensurePatientArchiveSchema()
  return db.select().from(patientPayments).where(and(eq(patientPayments.clinicId, requireClinicId()), eq(patientPayments.patientId, patientId), eq(patientPayments.isActive, true))).orderBy(desc(patientPayments.createdAt))
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
  await ensurePatientArchiveSchema()
  const page = Math.max(1, Number(opts?.page || 1))
  const pageSize = Math.min(100, Math.max(1, Number(opts?.pageSize || 25)))
  const offset = (page - 1) * pageSize

  const conditions: any[] = [eq(patientPayments.clinicId, requireClinicId()), eq(patientPayments.isActive, true), eq(patients.isArchived, false)]
  if (opts?.status && opts.status !== 'all') {
    conditions.push(eq(patientPayments.status, opts.status))
  }
  if (opts?.search && opts.search.trim()) {
    const rawSearch = opts.search.trim()
    const q = `%${rawSearch}%`
    const digitsOnly = rawSearch.replace(/\D/g, '').replace(/^(?:0090|90|0)/, '')
    if (digitsOnly.length >= 3 && /^[\d+\s()-]+$/.test(rawSearch)) {
      const dq = `%${digitsOnly}%`
      conditions.push(or(ilike(patients.name, q), ilike(patients.phone, q), sql`regexp_replace(coalesce(${patients.phone}, ''), '[^0-9]', '', 'g') LIKE ${dq}`))
    } else {
      conditions.push(or(ilike(patients.name, q), ilike(patients.phone, q)))
    }
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

export async function updateDentalAppointment(
  id: string,
  data: {
    doctorId?: string | null
    timeConfirmed?: boolean
    status?: string
    startTime?: Date
    endTime?: Date
    notes?: string
    type?: string
    complaint?: string
  },
  actor?: { actorType?: string; actorName?: string }
) {
  await ensureAiAppointmentReviewSchema()
  const clinicId = requireClinicId()
  const [existing] = await db.select({
    patientId: dentalAppointments.patientId,
    status: dentalAppointments.status,
    reviewStatus: dentalAppointments.reviewStatus,
    startTime: dentalAppointments.startTime,
    endTime: dentalAppointments.endTime,
    doctorId: dentalAppointments.doctorId,
    title: dentalAppointments.title,
  })
    .from(dentalAppointments)
    .where(and(eq(dentalAppointments.id, id), eq(dentalAppointments.clinicId, clinicId)))
    .limit(1)

  if (!existing) return null

  const targetDoctorId = data.doctorId !== undefined ? data.doctorId : existing.doctorId
  const targetStartTime = data.startTime ?? existing.startTime
  const targetEndTime = data.endTime ?? existing.endTime
  if (targetDoctorId && (data.doctorId !== undefined || data.startTime !== undefined || data.endTime !== undefined) && targetStartTime && targetEndTime) {
    const { conflict, leave } = await checkDoctorLeaveConflict(targetDoctorId, targetStartTime, targetEndTime)
    if (conflict) {
      const reasonText = leave?.reason ? ` (${leave.reason})` : ''
      throw new Error(`Hekim belirtilen saatlerde izinlidir: ${leave.startTime}-${leave.endTime}${reasonText}. Randevu taşınamaz.`)
    }
  }
  const values: Record<string, unknown> = {}
  if (data.doctorId !== undefined) values.doctorId = data.doctorId
  if (data.timeConfirmed !== undefined) values.timeConfirmed = data.timeConfirmed
  if (data.status !== undefined) {
    values.status = data.status
    if (existing.status === 'pending_review' && data.status !== 'pending_review') {
      values.reviewStatus = 'approved'
    }
    if (data.status === 'scheduled') {
      values.patientResponseStatus = null
    } else if (data.status === 'confirmed') {
      values.patientResponseStatus = 'confirmed'
    } else if (data.status === 'postponed') {
      values.patientResponseStatus = 'postponed'
    } else if (data.status === 'cancelled') {
      values.patientResponseStatus = 'cancelled'
    } else if (data.status === 'arrived_unconfirmed') {
      values.patientResponseStatus = 'arrived_unconfirmed'
    }
  }
  if (data.startTime !== undefined) values.startTime = data.startTime
  if (data.endTime !== undefined) values.endTime = data.endTime
  if (data.notes !== undefined) values.notes = data.notes
  if (data.type !== undefined) values.type = data.type
  if (data.complaint !== undefined) values.complaint = data.complaint
  if (data.startTime !== undefined && existing.status === 'postponed' && data.status === undefined) {
    values.status = 'scheduled'
    values.patientResponseStatus = null
  }
  if (Object.keys(values).length === 0) return null
  const [row] = await db.update(dentalAppointments)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(dentalAppointments.id, id), eq(dentalAppointments.clinicId, clinicId)))
    .returning()
  if (row) {
    if (data.doctorId !== undefined && existing.doctorId !== data.doctorId) {
      try {
        const links = await db
          .select({ treatmentPlanId: appointmentTreatments.treatmentPlanId })
          .from(appointmentTreatments)
          .where(eq(appointmentTreatments.appointmentId, row.id))
        const linkedTreatmentIds = Array.from(
          new Set(links.map((l) => l.treatmentPlanId).filter(Boolean))
        )
        if (linkedTreatmentIds.length > 0) {
          await db
            .update(treatmentPlans)
            .set({ doctorId: data.doctorId || null })
            .where(
              and(
                eq(treatmentPlans.clinicId, clinicId),
                inArray(treatmentPlans.id, linkedTreatmentIds),
                sql`${treatmentPlans.status} <> 'completed'`
              )
            )
          const detailRows = await db
            .select()
            .from(treatmentPlanDetails)
            .where(
              and(
                eq(treatmentPlanDetails.clinicId, clinicId),
                inArray(treatmentPlanDetails.treatmentId, linkedTreatmentIds)
              )
            )
          for (const detail of detailRows) {
            const meta =
              detail.metadata && typeof detail.metadata === 'object'
                ? { ...(detail.metadata as Record<string, any>) }
                : {}
            if (data.doctorId) {
              const prevIds = Array.isArray(meta.doctorIds) ? meta.doctorIds.filter((x: string) => x !== existing.doctorId) : []
              meta.doctorIds = Array.from(new Set([data.doctorId, ...prevIds]))
            } else {
              meta.doctorIds = Array.isArray(meta.doctorIds)
                ? meta.doctorIds.filter((x: string) => x !== existing.doctorId)
                : []
            }
            await db
              .update(treatmentPlanDetails)
              .set({ metadata: meta })
              .where(
                and(
                  eq(treatmentPlanDetails.clinicId, clinicId),
                  eq(treatmentPlanDetails.treatmentId, detail.treatmentId)
                )
              )
          }
        }
      } catch (err) {
        console.warn('[DentalRepo] Error syncing linked treatment doctor on appointment update:', err)
      }
    }
    const pId = row.patientId || existing.patientId
    if (pId) {
      const nextStatus = (values.status as string | undefined) ?? existing.status
      if (nextStatus !== existing.status) {
        void logPatientActivity({
          clinicId,
          patientId: pId,
          appointmentId: row.id,
          category: 'appointment',
          event_type: 'status_changed',
          title: row.title || existing.title || 'Randevu Durumu Güncellendi',
          old_value: existing.status,
          new_value: nextStatus,
          actor_type: actor?.actorType || 'desk',
          actor_name: actor?.actorName || null,
        })
      }
      const startChanged = data.startTime !== undefined && existing.startTime?.getTime() !== data.startTime.getTime()
      const endChanged = data.endTime !== undefined && existing.endTime?.getTime() !== data.endTime.getTime()
      if (startChanged || endChanged) {
        void logPatientActivity({
          clinicId,
          patientId: pId,
          appointmentId: row.id,
          category: 'appointment',
          event_type: 'rescheduled',
          title: row.title || existing.title || 'Randevu Tarihi/Saati Değiştirildi',
          old_value: formatApptDateTimeTR(existing.startTime, existing.endTime),
          new_value: formatApptDateTimeTR(row.startTime, row.endTime),
          actor_type: actor?.actorType || 'desk',
          actor_name: actor?.actorName || null,
        })
      }
      if (data.doctorId !== undefined && existing.doctorId !== data.doctorId) {
        void (async () => {
          const docIds = [existing.doctorId, data.doctorId].filter((x): x is string => Boolean(x))
          const docs = docIds.length > 0
            ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, docIds))
            : []
          const docMap = new Map(docs.map(d => [d.id, d.name]))
          const oldDocName = existing.doctorId ? (docMap.get(existing.doctorId) || 'Hekim') : 'Atanmamış'
          const newDocName = data.doctorId ? (docMap.get(data.doctorId) || 'Hekim') : 'Atanmamış'
          await logPatientActivity({
            clinicId,
            patientId: pId,
            appointmentId: row.id,
            category: 'appointment',
            event_type: 'doctor_changed',
            title: row.title || existing.title || 'İlgili Hekim Değiştirildi',
            old_value: oldDocName,
            new_value: newDocName,
            actor_type: actor?.actorType || 'desk',
            actor_name: actor?.actorName || null,
          })
        })().catch(() => {})
      }
    }
    import('../../services/appointment-notifications')
      .then(async ({ scheduleAppointmentNotification, cancelAppointmentNotifications }) => {
        if (['cancelled', 'completed', 'no_show'].includes(row.status) || data.status === 'confirmed') {
          await cancelAppointmentNotifications(clinicId, row.id)
        } else if (data.startTime !== undefined) {
          await scheduleAppointmentNotification({ clinicId, appointmentId: row.id, kind: 'appointment_rescheduled' })
        }
      })
      .catch(() => {})
  }
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
      lt(dentalAppointments.startTime, data.endTime),
      gt(dentalAppointments.endTime, data.startTime),
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
  }).then(updated => {
    import('../../services/appointment-notifications')
      .then(({ scheduleAppointmentNotification }) =>
        scheduleAppointmentNotification({ clinicId, appointmentId: updated.id, kind: 'appointment_created' }),
      )
      .catch(() => {})
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

export class PatientArchiveRequiredError extends Error {
  readonly code = 'PATIENT_ARCHIVE_REQUIRED'
  constructor(readonly patientIds: string[]) {
    super('Randevu, ödeme, tedavi veya onam geçmişi olan hasta kalıcı olarak silinemez; arşivlenmelidir.')
  }
}

export async function deletePatientsBulk(patientIds: string[]) {
  const clinicId = requireClinicId()
  await ensurePatientArchiveSchema()
  const { ensureTreatmentPlanningSchema } = await import('../treatment-planning-schema')
  await ensureTreatmentPlanningSchema()
  if (!patientIds || patientIds.length === 0) return { deletedCount: 0 }

  const validPatients = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), inArray(patients.id, patientIds)))

  const validIds = validPatients.map(p => p.id)
  if (validIds.length === 0) return { deletedCount: 0 }

  const [appointmentRows, paymentRows, treatmentRows, consentRows, attachmentRows] = await Promise.all([
    db.select({ patientId: dentalAppointments.patientId }).from(dentalAppointments)
      .where(and(eq(dentalAppointments.clinicId, clinicId), inArray(dentalAppointments.patientId, validIds))),
    db.select({ patientId: patientPayments.patientId }).from(patientPayments)
      .where(and(eq(patientPayments.clinicId, clinicId), inArray(patientPayments.patientId, validIds))),
    db.select({ patientId: treatmentPlans.patientId }).from(treatmentPlans)
      .where(and(eq(treatmentPlans.clinicId, clinicId), inArray(treatmentPlans.patientId, validIds))),
    db.select({ patientId: patientConsentRequests.patientId }).from(patientConsentRequests)
      .where(and(eq(patientConsentRequests.clinicId, clinicId), inArray(patientConsentRequests.patientId, validIds))),
    db.select({ patientId: planAttachments.patientId }).from(planAttachments)
      .where(and(eq(planAttachments.clinicId, clinicId), inArray(planAttachments.patientId, validIds))),
  ])
  const protectedIds = new Set([...appointmentRows, ...paymentRows, ...treatmentRows, ...consentRows, ...attachmentRows].map(row => row.patientId).filter((id): id is string => Boolean(id)))
  if (protectedIds.size > 0) {
    throw new PatientArchiveRequiredError([...protectedIds])
  }

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

export async function archivePatients(patientIds: string[]) {
  const clinicId = requireClinicId()
  await ensurePatientArchiveSchema()
  if (!patientIds.length) return { archivedCount: 0, deactivatedAppointments: 0, deactivatedPayments: 0 }

  const activePatients = await db.select({ id: patients.id }).from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.isArchived, false), inArray(patients.id, patientIds)))
  const ids = activePatients.map(patient => patient.id)
  if (!ids.length) return { archivedCount: 0, deactivatedAppointments: 0, deactivatedPayments: 0 }

  return db.transaction(async tx => {
    const [appointments, payments] = await Promise.all([
      tx.update(dentalAppointments).set({ isActive: false }).where(and(eq(dentalAppointments.clinicId, clinicId), inArray(dentalAppointments.patientId, ids), eq(dentalAppointments.isActive, true))).returning({ id: dentalAppointments.id }),
      tx.update(patientPayments).set({ isActive: false }).where(and(eq(patientPayments.clinicId, clinicId), inArray(patientPayments.patientId, ids), eq(patientPayments.isActive, true))).returning({ id: patientPayments.id }),
    ])
    await tx.update(patients).set({ isArchived: true, archivedAt: new Date() })
      .where(and(eq(patients.clinicId, clinicId), inArray(patients.id, ids)))
    return { archivedCount: ids.length, deactivatedAppointments: appointments.length, deactivatedPayments: payments.length }
  })
}

export async function restorePatients(patientIds: string[]) {
  const clinicId = requireClinicId()
  await ensurePatientArchiveSchema()
  if (!patientIds.length) return { restoredCount: 0, reactivatedAppointments: 0, reactivatedPayments: 0 }

  const archivedPatients = await db.select({ id: patients.id }).from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.isArchived, true), inArray(patients.id, patientIds)))
  const ids = archivedPatients.map(patient => patient.id)
  if (!ids.length) return { restoredCount: 0, reactivatedAppointments: 0, reactivatedPayments: 0 }

  return db.transaction(async tx => {
    const [appointments, payments] = await Promise.all([
      tx.update(dentalAppointments).set({ isActive: true }).where(and(eq(dentalAppointments.clinicId, clinicId), inArray(dentalAppointments.patientId, ids), eq(dentalAppointments.isActive, false))).returning({ id: dentalAppointments.id }),
      tx.update(patientPayments).set({ isActive: true }).where(and(eq(patientPayments.clinicId, clinicId), inArray(patientPayments.patientId, ids), eq(patientPayments.isActive, false))).returning({ id: patientPayments.id }),
    ])
    await tx.update(patients).set({ isArchived: false, archivedAt: null })
      .where(and(eq(patients.clinicId, clinicId), inArray(patients.id, ids)))
    return { restoredCount: ids.length, reactivatedAppointments: appointments.length, reactivatedPayments: payments.length }
  })
}
