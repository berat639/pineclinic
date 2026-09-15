import { and, eq } from 'drizzle-orm'
import { db } from '../client'
import { clinicMemberships, users, userSessions } from '../schema'
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
  return updated ?? null
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
  if (clinicId) {
    const rows = await db.delete(clinicMemberships).where(and(
      eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.userId, id),
    )).returning({ userId: clinicMemberships.userId })
    return rows.length > 0
  }
  await deleteAllUserSessions(id)
  const rows = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id })
  return rows.length > 0
}
