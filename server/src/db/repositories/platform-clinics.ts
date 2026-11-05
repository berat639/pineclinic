import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import {
  auditLog,
  clinicDomains,
  clinicMemberships,
  clinicSettings,
  clinics,
  knowledgeCategories,
  staffInvitations,
  users,
} from '../schema'
import { DEFAULT_CATEGORIES } from './categories'
import { invalidateTenantCache, isLocalHostname, normalizeHostname } from '../../tenancy/context'
import { deleteAllUserSessions } from './users'
import { ensureStaffInvitationsSchema, getClinicSmtpStatus } from '../../services/staff-invitations'

const DEFAULT_ROLE_PERMISSIONS = {
  hekim: ['calendar', 'patients', 'knowledge'],
  sekreter: ['calendar', 'patients', 'payments'],
  asistan: ['calendar', 'patients'],
}

export interface CreatePlatformClinicInput {
  name: string
  hostname: string
  timezone?: string
}

export interface PlatformClinicRow {
  id: string
  name: string
  hostname: string
  isActive: boolean
  createdAt: string
}

export class ClinicProvisioningError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message)
    this.name = 'ClinicProvisioningError'
  }
}

function validateClinicName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 120) {
    throw new ClinicProvisioningError('Klinik adı 2 ile 120 karakter arasında olmalıdır.')
  }
  return name
}

function validateHostname(value: string): string {
  const hostname = normalizeHostname(value)
  if (!hostname || hostname.length > 253) {
    throw new ClinicProvisioningError('Geçerli bir klinik hostname değeri girin.')
  }
  if (isLocalHostname(hostname)) {
    throw new ClinicProvisioningError('Yeni klinik için localhost yerine clinic-a.localhost gibi ayrı bir hostname kullanın.')
  }

  const labels = hostname.split('.')
  const valid = labels.every(label => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ))
  if (!valid || (!hostname.includes('.') && hostname !== 'localhost')) {
    throw new ClinicProvisioningError('Hostname alanına alan adı veya subdomain girilmelidir.')
  }
  return hostname
}

function validateTimezone(value: string | undefined): string {
  const timezone = value?.trim() || 'Europe/Istanbul'
  try {
    new Intl.DateTimeFormat('tr-TR', { timeZone: timezone }).format()
    return timezone
  } catch {
    throw new ClinicProvisioningError('Geçerli bir IANA saat dilimi girin.')
  }
}

export async function listPlatformClinics(): Promise<PlatformClinicRow[]> {
  const rows = await db
    .select({
      id: clinics.id,
      name: clinics.name,
      hostname: sql<string | null>`(
        SELECT domain.hostname
        FROM clinic_domains AS domain
        WHERE domain.clinic_id = ${clinics.id}
          AND domain.is_primary = true
        ORDER BY domain.created_at
        LIMIT 1
      )`,
      isActive: clinics.isActive,
      createdAt: clinics.createdAt,
    })
    .from(clinics)
    .orderBy(desc(clinics.createdAt))

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    hostname: row.hostname || '',
    isActive: row.isActive,
    createdAt: row.createdAt?.toISOString() || '',
  }))
}

export async function createPlatformClinic(
  input: CreatePlatformClinicInput,
  platformAdminUserId: string,
): Promise<PlatformClinicRow> {
  const name = validateClinicName(input.name)
  const hostname = validateHostname(input.hostname)
  const timezone = validateTimezone(input.timezone)

  const created = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`clinic-host:${hostname}`}, 0))`)

    const [existingDomain] = await tx
      .select({ clinicId: clinicDomains.clinicId })
      .from(clinicDomains)
      .where(eq(clinicDomains.hostname, hostname))
      .limit(1)
    if (existingDomain) {
      throw new ClinicProvisioningError('Bu hostname başka bir kliniğe bağlı.', 409)
    }

    const [clinic] = await tx.insert(clinics).values({ name, isActive: true }).returning()
    if (!clinic) throw new ClinicProvisioningError('Klinik oluşturulamadı.', 500)

    await tx.insert(clinicDomains).values({
      clinicId: clinic.id,
      hostname,
      isPrimary: true,
      isActive: true,
    })

    await tx.insert(clinicMemberships).values({
      clinicId: clinic.id,
      userId: platformAdminUserId,
      role: 'yonetici',
      active: true,
    }).onConflictDoNothing()

    await tx.insert(knowledgeCategories).values(
      DEFAULT_CATEGORIES.map(category => ({ ...category, clinicId: clinic.id })),
    ).onConflictDoNothing()

    await tx.insert(clinicSettings).values([
      { clinicId: clinic.id, key: 'branding.title', value: name },
      { clinicId: clinic.id, key: 'branding.subtitle', value: 'Randevu · Bilgi' },
      { clinicId: clinic.id, key: 'clinic.timezone', value: timezone },
      { clinicId: clinic.id, key: 'ai.greeting', value: `Merhaba, ${name} asistanına hoş geldiniz. Size nasıl yardımcı olabilirim?` },
      { clinicId: clinic.id, key: 'greeting_message', value: `Merhaba, ${name} asistanına hoş geldiniz. Size nasıl yardımcı olabilirim?` },
      { clinicId: clinic.id, key: 'ai.greeting_outbound', value: `Merhaba, ben ${name} asistanıyım.` },
      { clinicId: clinic.id, key: 'greeting_message_outbound', value: `Merhaba, ben ${name} asistanıyım.` },
      { clinicId: clinic.id, key: 'role_tab_permissions', value: JSON.stringify(DEFAULT_ROLE_PERMISSIONS) },
    ]).onConflictDoNothing()

    await tx.insert(auditLog).values({
      clinicId: clinic.id,
      userId: platformAdminUserId,
      action: 'platform.clinic.create',
      targetType: 'clinic',
      targetId: clinic.id,
      metadata: { hostname, timezone },
    })

    return clinic
  })

  invalidateTenantCache(hostname)
  try {
    const { ensureClinicInheritedIntegrations } = await import('../../integrations/managed/store')
    await ensureClinicInheritedIntegrations(created.id)
  } catch {}
  try {
    const { ensureAutomaticEvolutionConfig } = await import('./whatsapp')
    await ensureAutomaticEvolutionConfig(created.id)
  } catch {}
  return {
    id: created.id,
    name: created.name,
    hostname,
    isActive: created.isActive,
    createdAt: created.createdAt?.toISOString() || '',
  }
}

export interface PlatformClinicAdminRow {
  id: string
  email: string
  name: string
  phone: string | null
  role: string
  active: boolean
  isPlatformAdmin: boolean
  createdAt: string
}

export async function setPlatformClinicActive(
  clinicId: string,
  isActive: boolean,
  actorUserId: string,
): Promise<PlatformClinicRow> {
  const [existing] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1)
  if (!existing) {
    throw new ClinicProvisioningError('Klinik bulunamadı.', 404)
  }

  const [updated] = await db
    .update(clinics)
    .set({ isActive })
    .where(eq(clinics.id, clinicId))
    .returning()

  if (!isActive) {
    const memberRows = await db
      .select({ userId: clinicMemberships.userId, isPlatformAdmin: users.isPlatformAdmin })
      .from(clinicMemberships)
      .innerJoin(users, eq(clinicMemberships.userId, users.id))
      .where(eq(clinicMemberships.clinicId, clinicId))

    for (const member of memberRows) {
      if (!member.isPlatformAdmin && member.userId !== actorUserId) {
        await deleteAllUserSessions(member.userId)
      }
    }
  }

  await db.insert(auditLog).values({
    clinicId,
    userId: actorUserId,
    action: isActive ? 'platform.clinic.unfreeze' : 'platform.clinic.freeze',
    targetType: 'clinic',
    targetId: clinicId,
    metadata: { isActive },
  })

  invalidateTenantCache()

  const [domainRow] = await db
    .select({ hostname: clinicDomains.hostname })
    .from(clinicDomains)
    .where(and(eq(clinicDomains.clinicId, clinicId), eq(clinicDomains.isPrimary, true)))
    .limit(1)

  return {
    id: updated!.id,
    name: updated!.name,
    hostname: domainRow?.hostname || '',
    isActive: updated!.isActive,
    createdAt: updated!.createdAt?.toISOString() || '',
  }
}

export async function listPlatformClinicAdmins(clinicId: string) {
  await ensureStaffInvitationsSchema()

  const [clinic] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1)
  if (!clinic) {
    throw new ClinicProvisioningError('Klinik bulunamadı.', 404)
  }

  const [domainRow] = await db
    .select({ hostname: clinicDomains.hostname })
    .from(clinicDomains)
    .where(and(eq(clinicDomains.clinicId, clinicId), eq(clinicDomains.isPrimary, true)))
    .limit(1)

  const adminRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: clinicMemberships.role,
      userActive: users.active,
      membershipActive: clinicMemberships.active,
      isPlatformAdmin: users.isPlatformAdmin,
      createdAt: users.createdAt,
    })
    .from(clinicMemberships)
    .innerJoin(users, eq(clinicMemberships.userId, users.id))
    .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.role, 'yonetici')))
    .orderBy(asc(users.isPlatformAdmin), desc(users.createdAt))

  const admins: PlatformClinicAdminRow[] = adminRows.map(row => ({
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone ?? null,
    role: row.role,
    active: Boolean(row.userActive && row.membershipActive),
    isPlatformAdmin: Boolean(row.isPlatformAdmin),
    createdAt: row.createdAt?.toISOString() || '',
  }))

  const invitations = await db
    .select({
      id: staffInvitations.id,
      email: staffInvitations.email,
      name: staffInvitations.name,
      role: staffInvitations.role,
      status: staffInvitations.status,
      expiresAt: staffInvitations.expiresAt,
      createdAt: staffInvitations.createdAt,
    })
    .from(staffInvitations)
    .where(and(eq(staffInvitations.clinicId, clinicId), eq(staffInvitations.role, 'yonetici')))
    .orderBy(desc(staffInvitations.createdAt))
    .limit(30)

  const smtpStatus = await getClinicSmtpStatus(clinicId)

  return {
    clinicId,
    clinicName: clinic.name,
    clinicIsActive: clinic.isActive,
    primaryHostname: domainRow?.hostname || '',
    admins,
    invitations: invitations.map(inv => ({
      ...inv,
      expiresAt: inv.expiresAt?.toISOString() || '',
      createdAt: inv.createdAt?.toISOString() || '',
    })),
    smtpStatus,
  }
}

export async function assignPlatformClinicSeedAdmin(
  clinicId: string,
  input: { name: string; email: string; password: string; phone?: string },
  actorUserId: string,
): Promise<PlatformClinicAdminRow> {
  const [clinic] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1)
  if (!clinic) {
    throw new ClinicProvisioningError('Klinik bulunamadı.', 404)
  }

  const name = (input.name || '').trim()
  const email = (input.email || '').toLowerCase().trim()
  const password = input.password || ''
  const phone = input.phone?.trim() || null

  if (name.length < 2) {
    throw new ClinicProvisioningError('Yönetici adı en az 2 karakter olmalıdır.', 400)
  }
  if (!email || !email.includes('@')) {
    throw new ClinicProvisioningError('Geçerli bir e-posta adresi girin.', 400)
  }
  if (password.length < 6) {
    throw new ClinicProvisioningError('Şifre en az 6 karakter olmalıdır.', 400)
  }

  const passwordHash = await Bun.password.hash(password)

  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  let targetUser = existingUser

  if (existingUser) {
    if (existingUser.isPlatformAdmin) {
      throw new ClinicProvisioningError(
        'Bu e-posta adresi satışçı / platform yöneticisi hesabına aittir. Klinik Seed Yöneticisi için ayrı bir e-posta kullanın.',
        400,
      )
    }
    const [updated] = await db
      .update(users)
      .set({
        name,
        passwordHash,
        phone,
        role: 'yonetici',
        active: true,
      })
      .where(eq(users.id, existingUser.id))
      .returning()
    targetUser = updated
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name,
        phone,
        role: 'yonetici',
        active: true,
        isPlatformAdmin: false,
      })
      .returning()
    targetUser = created
  }

  if (!targetUser) {
    throw new ClinicProvisioningError('Seed yönetici oluşturulamadı.', 500)
  }

  await db
    .insert(clinicMemberships)
    .values({
      clinicId,
      userId: targetUser.id,
      role: 'yonetici',
      active: true,
    })
    .onConflictDoUpdate({
      target: [clinicMemberships.clinicId, clinicMemberships.userId],
      set: { role: 'yonetici', active: true },
    })

  await db.insert(auditLog).values({
    clinicId,
    userId: actorUserId,
    action: 'platform.clinic.seed_admin.assign',
    targetType: 'user',
    targetId: targetUser.id,
    metadata: { email: targetUser.email, name: targetUser.name },
  })

  return {
    id: targetUser.id,
    email: targetUser.email,
    name: targetUser.name,
    phone: targetUser.phone ?? null,
    role: 'yonetici',
    active: true,
    isPlatformAdmin: Boolean(targetUser.isPlatformAdmin),
    createdAt: targetUser.createdAt?.toISOString() || '',
  }
}

export async function setPlatformClinicAdminActive(
  clinicId: string,
  targetUserId: string,
  active: boolean,
  actorUserId: string,
): Promise<{ id: string; active: boolean }> {
  const [membership] = await db
    .select()
    .from(clinicMemberships)
    .where(
      and(
        eq(clinicMemberships.clinicId, clinicId),
        eq(clinicMemberships.userId, targetUserId),
        eq(clinicMemberships.role, 'yonetici'),
      ),
    )
    .limit(1)

  if (!membership) {
    throw new ClinicProvisioningError('Bu klinikte belirtilen yönetici kaydı bulunamadı.', 404)
  }

  const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1)
  if (!targetUser) {
    throw new ClinicProvisioningError('Kullanıcı bulunamadı.', 404)
  }

  if (!active && (targetUser.id === actorUserId || targetUser.isPlatformAdmin)) {
    throw new ClinicProvisioningError(
      'Satışçı / Platform yöneticisi hesabı dondurulamaz. Yalnızca kliniğe atanan Seed User (Yönetici) hesapları dondurulabilir.',
      400,
    )
  }

  await db
    .update(clinicMemberships)
    .set({ active })
    .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.userId, targetUserId)))

  await db
    .update(users)
    .set({ active })
    .where(eq(users.id, targetUserId))

  if (!active) {
    await deleteAllUserSessions(targetUserId)
  }

  await db.insert(auditLog).values({
    clinicId,
    userId: actorUserId,
    action: active ? 'platform.clinic.admin.unfreeze' : 'platform.clinic.admin.freeze',
    targetType: 'user',
    targetId: targetUserId,
    metadata: { active },
  })

  return { id: targetUserId, active }
}
