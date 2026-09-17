import { and, eq } from 'drizzle-orm'
import { db } from '../client'
import { clinicMemberships, users } from '../schema'

export async function getActiveMembership(userId: string, clinicId: string) {
  const [membership] = await db.select().from(clinicMemberships).where(and(
    eq(clinicMemberships.userId, userId),
    eq(clinicMemberships.clinicId, clinicId),
    eq(clinicMemberships.active, true),
  )).limit(1)
  return membership ?? null
}

export async function ensurePlatformAdminMembership(userId: string, clinicId: string) {
  const [user] = await db.select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users).where(eq(users.id, userId)).limit(1)
  if (!user?.isPlatformAdmin) return null

  const [membership] = await db.insert(clinicMemberships).values({
    clinicId,
    userId,
    role: 'yonetici',
    active: true,
  }).onConflictDoUpdate({
    target: [clinicMemberships.clinicId, clinicMemberships.userId],
    set: { active: true, updatedAt: new Date() },
  }).returning()
  return membership ?? null
}
