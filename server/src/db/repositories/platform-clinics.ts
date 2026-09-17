import { desc, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import {
  auditLog,
  clinicDomains,
  clinicMemberships,
  clinicSettings,
  clinics,
  knowledgeCategories,
} from '../schema'
import { DEFAULT_CATEGORIES } from './categories'
import { invalidateTenantCache, isLocalHostname, normalizeHostname } from '../../tenancy/context'

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
  return {
    id: created.id,
    name: created.name,
    hostname,
    isActive: created.isActive,
    createdAt: created.createdAt?.toISOString() || '',
  }
}
