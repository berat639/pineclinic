import { and, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../client'
import {
  appointmentTreatments,
  clinicMemberships,
  dentalAppointments,
  treatmentPlanDetails,
  treatmentPlans,
  users,
  userSessions,
} from '../schema'
import { currentClinicId } from '../../tenancy/context'

export async function createUser(data: {
  email: string
  passwordHash: string
  name: string
  role: string
  phone?: string
  specialty?: string
  color?: string
  clinicId?: string
}) {
  const clinicId = data.clinicId ?? currentClinicId()
  const { clinicId: _clinicId, ...userData } = data
  return db.transaction(async tx => {
    const [user] = await tx.insert(users).values(userData).returning()
    if (!user) throw new Error('Kullanıcı oluşturulamadı')
    if (clinicId) {
      await tx.insert(clinicMemberships).values({
        clinicId,
        userId: user.id,
        role: user.role,
        active: user.active,
      })
    }
    return user
  })
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return user ?? null
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return user ?? null
}

export async function listUsers() {
  const clinicId = currentClinicId()
  if (!clinicId) return []
  return db.select({
    id: users.id,
    email: users.email,
    phone: users.phone,
    name: users.name,
    role: clinicMemberships.role,
    specialty: users.specialty,
    color: users.color,
    active: users.active,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
  }).from(users)
    .innerJoin(clinicMemberships, eq(clinicMemberships.userId, users.id))
    .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.active, true)))
}

export async function countActiveClinicAdmins(clinicId?: string | null, excludeUserId?: string): Promise<number> {
  const targetClinicId = clinicId ?? currentClinicId()
  if (targetClinicId) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(clinicMemberships, eq(clinicMemberships.userId, users.id))
      .where(
        and(
          eq(clinicMemberships.clinicId, targetClinicId),
          eq(clinicMemberships.role, 'yonetici'),
          eq(clinicMemberships.active, true),
          eq(users.active, true),
          excludeUserId ? ne(users.id, excludeUserId) : undefined,
        ),
      )
    return rows.length
  }
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, 'yonetici'),
        eq(users.active, true),
        excludeUserId ? ne(users.id, excludeUserId) : undefined,
      ),
    )
  return rows.length
}

/**
 * Hekim dondurulduğunda veya kaldırıldığında gelecekteki (ve bugünkü tamamlanmamış)
 * aktif randevularını ve bağlı tedavilerini boşa çıkarır (doctorId = null, status = 'pending_assignment').
 */
export async function unassignDoctorFutureAppointments(userId: string, clinicId?: string | null): Promise<number> {
  try {
    const targetClinicId = clinicId ?? currentClinicId()
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const conditions = [
      eq(dentalAppointments.doctorId, userId),
      eq(dentalAppointments.isActive, true),
      sql`${dentalAppointments.status} NOT IN ('cancelled', 'completed', 'no_show')`,
    ]
    if (targetClinicId) {
      conditions.push(eq(dentalAppointments.clinicId, targetClinicId))
    }

    const futureAppts = await db
      .select({
        id: dentalAppointments.id,
        patientId: dentalAppointments.patientId,
        clinicId: dentalAppointments.clinicId,
        title: dentalAppointments.title,
      })
      .from(dentalAppointments)
      .where(and(...conditions))

    const targetApptIds = futureAppts.map((a) => a.id)

    if (targetApptIds.length > 0) {
      await db
        .update(dentalAppointments)
        .set({
          doctorId: null,
          status: 'pending_assignment',
          updatedAt: new Date(),
        })
        .where(inArray(dentalAppointments.id, targetApptIds))
    }

    // Tamamlanmamış tedavilerde de bu hekimin atamasını boşa çıkar
    const tpConditions = [
      eq(treatmentPlans.doctorId, userId),
      sql`${treatmentPlans.status} <> 'completed'`,
    ]
    if (targetClinicId) {
      tpConditions.push(eq(treatmentPlans.clinicId, targetClinicId))
    }
    await db
      .update(treatmentPlans)
      .set({ doctorId: null })
      .where(and(...tpConditions))

    // treatment_plan_details metadata.doctorIds içerisinden dondurulan hekimi temizle
    const detailRows = await db
      .select({
        treatmentId: treatmentPlanDetails.treatmentId,
        clinicId: treatmentPlanDetails.clinicId,
        metadata: treatmentPlanDetails.metadata,
        status: treatmentPlans.status,
      })
      .from(treatmentPlanDetails)
      .innerJoin(treatmentPlans, eq(treatmentPlans.id, treatmentPlanDetails.treatmentId))
      .where(
        and(
          targetClinicId ? eq(treatmentPlanDetails.clinicId, targetClinicId) : undefined,
          sql`${treatmentPlans.status} <> 'completed'`,
        ),
      )

    for (const detail of detailRows) {
      const meta =
        detail.metadata && typeof detail.metadata === 'object'
          ? { ...(detail.metadata as Record<string, any>) }
          : {}
      if (Array.isArray(meta.doctorIds) && meta.doctorIds.includes(userId)) {
        meta.doctorIds = meta.doctorIds.filter((id: string) => id !== userId)
        await db
          .update(treatmentPlanDetails)
          .set({ metadata: meta })
          .where(
            and(
              eq(treatmentPlanDetails.treatmentId, detail.treatmentId),
              detail.clinicId ? eq(treatmentPlanDetails.clinicId, detail.clinicId) : undefined,
            ),
          )
      }
    }

    if (targetApptIds.length > 0) {
      import('../../events')
        .then(({ broadcastSSE }) => {
          broadcastSSE('appointment_updated', {
            action: 'doctor_frozen',
            doctorId: userId,
            unassignedAppointmentIds: targetApptIds,
          })
        })
        .catch(() => {})
    }

    return targetApptIds.length
  } catch (err) {
    console.error('[UsersRepo] Error unassigning doctor future appointments:', err)
    return 0
  }
}

export async function updateUser(id: string, data: Partial<{
  email: string
  phone: string
  name: string
  role: string
  specialty: string | null
  color: string | null
  active: boolean
  passwordHash: string
  lastLoginAt: Date
}>) {
  const clinicId = currentClinicId()
  if (clinicId) {
    const [membership] = await db.select({ userId: clinicMemberships.userId })
      .from(clinicMemberships).where(and(
        eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.userId, id),
      )).limit(1)
    if (!membership) return null
  }
  const [updated] = await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()
  if (updated && clinicId && data.role) {
    await db.update(clinicMemberships).set({ role: data.role, updatedAt: new Date() }).where(and(
      eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.userId, id),
    ))
  }
  let unassignedAppointmentsCount = 0
  if (updated && data.active === false) {
    await deleteAllUserSessions(id)
    unassignedAppointmentsCount = await unassignDoctorFutureAppointments(id, clinicId)
  }
  return updated ? { ...updated, unassignedAppointmentsCount } : null
}

export async function createSession(data: {
  userId: string
  tokenJti: string
  ipAddress?: string
  userAgent?: string
  expiresAt: Date
}) {
  const [session] = await db.insert(userSessions).values(data).returning()
  return session!
}

export async function getSessionByJti(jti: string) {
  const [session] = await db.select().from(userSessions).where(eq(userSessions.tokenJti, jti)).limit(1)
  return session ?? null
}

export async function deleteSessionByJti(jti: string) {
  await db.delete(userSessions).where(eq(userSessions.tokenJti, jti))
}

export async function deleteAllUserSessions(userId: string) {
  await db.delete(userSessions).where(eq(userSessions.userId, userId))
}

export async function deleteUser(id: string) {
  const clinicId = currentClinicId()
  await deleteAllUserSessions(id)
  await unassignDoctorFutureAppointments(id, clinicId)
  if (clinicId) {
    const rows = await db.delete(clinicMemberships).where(and(
      eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.userId, id),
    )).returning({ userId: clinicMemberships.userId })
    if (rows.length === 0) return false

    const remainingMemberships = await db.select({ clinicId: clinicMemberships.clinicId })
      .from(clinicMemberships)
      .where(eq(clinicMemberships.userId, id))
      .limit(1)

    if (remainingMemberships.length === 0) {
      try {
        await db.delete(users).where(eq(users.id, id))
      } catch {
        // KVKK uyumlu anonimleştirme: geçmiş randevu/tedavi bütünlüğünü koruyarak kişisel verileri temizle
        await db.update(users).set({
          email: `kvkk-removed-${id}@anonim.local`,
          name: 'Kaldırılan Personel (KVKK)',
          phone: null,
          avatar: null,
          passwordHash: 'KVKK_REMOVED',
          active: false,
          updatedAt: new Date(),
        }).where(eq(users.id, id))
      }
    }
    return true
  }
  try {
    const rows = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id })
    return rows.length > 0
  } catch {
    const rows = await db.update(users).set({
      email: `kvkk-removed-${id}@anonim.local`,
      name: 'Kaldırılan Personel (KVKK)',
      phone: null,
      avatar: null,
      passwordHash: 'KVKK_REMOVED',
      active: false,
      updatedAt: new Date(),
    }).where(eq(users.id, id)).returning({ id: users.id })
    return rows.length > 0
  }
}
