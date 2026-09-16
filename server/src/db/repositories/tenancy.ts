import { and, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { clinicDomains, clinicMemberships, clinics, users } from '../schema'
import { invalidateTenantCache, normalizeHostname } from '../../tenancy/context'
import { ensureEvolutionInstance } from './whatsapp'

function clinicNameFromHostname(hostname: string): string {
  const label = hostname.split('.')[0] || hostname
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Yeni Klinik'
}

export async function provisionClinicForPlatformAdmin(hostnameValue: string, userId: string) {
  const hostname = normalizeHostname(hostnameValue)
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    throw new Error('Geçerli bir klinik domaini gerekli')
  }

  const [platformAdmin] = await db.select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isPlatformAdmin, true), eq(users.active, true)))
    .limit(1)
  if (!platformAdmin) throw new Error('Sadece platform yöneticisi klinik oluşturabilir')

  const provisioned = await db.transaction(async tx => {
    // Serialize provisioning for the same hostname so concurrent first-login
    // requests cannot create orphan clinics before the UNIQUE check wins.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${hostname}, 0))`)
    const [existing] = await tx.select({
      clinicId: clinicDomains.clinicId,
      hostname: clinicDomains.hostname,
    }).from(clinicDomains).where(eq(clinicDomains.hostname, hostname)).limit(1)

    if (existing) return { ...existing, created: false }

    const [clinic] = await tx.insert(clinics).values({
      name: clinicNameFromHostname(hostname),
      isActive: true,
    }).returning({ id: clinics.id })
    if (!clinic) throw new Error('Klinik oluşturulamadı')

    await tx.insert(clinicDomains).values({
      clinicId: clinic.id,
      hostname,
      isPrimary: true,
      isActive: true,
    })
    await tx.insert(clinicMemberships).values({
      clinicId: clinic.id,
      userId,
      role: 'yonetici',
      active: true,
    })

    invalidateTenantCache(hostname)
    return { clinicId: clinic.id, hostname, created: true }
  })

  if (provisioned.created && process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY) {
    // An external WhatsApp outage must not block the clinic's first login. The
    // QR endpoint runs this same idempotent operation again when necessary.
    void ensureEvolutionInstance(provisioned.clinicId).catch(error => {
      console.error(`[Evolution] Klinik instance otomatik oluşturulamadı (${provisioned.clinicId}):`, error instanceof Error ? error.message : 'Bilinmeyen hata')
    })
  }
  return { clinicId: provisioned.clinicId, hostname: provisioned.hostname }
}

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
