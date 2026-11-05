import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { sealSecret, openSecret } from '../../services/integration-secrets'
import { integrationDDL } from './schema'
import { Config, Service, SetupError, phone, publicConfig, validateConfig } from './model'

let ready: Promise<void> | undefined
export function ensureIntegrations() {
  return ready ??= (async () => { for (const ddl of integrationDDL) await db.execute(sql.raw(ddl)) })().catch(e => { ready = undefined; throw e })
}
export function encrypt(config: Config): Config { return { ...config, password: sealSecret(config.password) } }
export function decrypt(config: Config): Config { return { ...config, password: openSecret(config.password) } }
export async function clinicExists(id: string) {
  const [c] = await db.execute(sql`SELECT id,name FROM clinics WHERE id=${id} AND is_active=true`)
  if (!c) throw new SetupError('Aktif klinik bulunamadı', 404)
  return c
}
export async function getRow(id: string, service: Service) {
  await ensureIntegrations()
  const [row] = await db.execute(sql`SELECT * FROM managed_integrations WHERE clinic_id=${id} AND service=${service}`)
  return row
}
export async function audit(tx: any, id: string, user: string | null, action: string, service: string) {
  await tx.execute(sql`INSERT INTO audit_log (clinic_id,user_id,action,target_type,target_id,metadata) VALUES (${id},${user},${action},'integration',${service},'{}')`)
}
export async function saveConfig(id: string, service: Service, input: Record<string, unknown>, user: string) {
  await ensureIntegrations(); await clinicExists(id)
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('managed-integrations',0))`)
    const [row] = await tx.execute(sql`SELECT * FROM managed_integrations WHERE clinic_id=${id} AND service=${service} FOR UPDATE`)
    if (row && input.revision !== undefined && Number(input.revision) !== row.revision) throw new SetupError('Ayarlar başka bir işlemde değişti. Yenileyin.', 409)
    const config = encrypt(validateConfig(service, input, row ? decrypt(row.draft as Config) : undefined))
    const autoActivate = Boolean(input.autoActivate)
    if (service === 'phone') {
      const claims = [ ['sip', config.username], ...(config.numbers || []).map(n => ['phone', n]) ]
      for (const [kind,value] of claims) {
        if (kind === 'phone') {
          const legacy = await tx.execute(sql`SELECT clinic_id,phone_number FROM clinic_phone_numbers WHERE clinic_id<>${id} AND is_active=true`)
          if (legacy.some(p => { try { return phone(String(p.phone_number)) === value } catch { return false } })) throw new SetupError('Numara başka bir kliniğe atanmış',409)
        }
        const [owner] = await tx.execute(sql`SELECT clinic_id FROM integration_claims WHERE kind=${kind} AND value=${value}`)
        if (owner && owner.clinic_id !== id) throw new SetupError('Numara veya SIP hesabı başka bir kliniğe atanmış',409)
      }
      await tx.execute(sql`DELETE FROM integration_claims WHERE clinic_id=${id}`)
      for (const [kind,value] of claims) await tx.execute(sql`INSERT INTO integration_claims(kind,value,clinic_id) VALUES(${kind},${value},${id}) ON CONFLICT DO NOTHING`)
      const retainedNumbers = new Set(config.numbers || [])
      const existingPhones = await tx.execute(sql`SELECT id,phone_number FROM clinic_phone_numbers WHERE clinic_id=${id}`)
      for (const p of existingPhones) {
        let norm = ''
        try { norm = phone(String(p.phone_number)) } catch {}
        if (!norm || !retainedNumbers.has(norm)) {
          await tx.execute(sql`DELETE FROM clinic_phone_numbers WHERE id=${p.id}`)
        }
      }
      for (const num of config.numbers || []) {
        await tx.execute(sql`DELETE FROM clinic_phone_numbers WHERE phone_number=${num} AND clinic_id<>${id} AND is_active=false`)
        await tx.execute(sql`INSERT INTO clinic_phone_numbers(clinic_id,phone_number,is_active,is_primary) VALUES(${id},${num},${Boolean(row?.enabled || autoActivate)},${num===config.callerId}) ON CONFLICT(phone_number) DO UPDATE SET clinic_id=${id},is_active=EXCLUDED.is_active,is_primary=EXCLUDED.is_primary`)
      }
    }
    const [saved] = await tx.execute(sql`
      INSERT INTO managed_integrations(clinic_id,service,draft,active,active_revision,enabled,legacy,updated_by)
      VALUES(
        ${id},
        ${service},
        ${JSON.stringify(config)}::jsonb,
        ${autoActivate ? sql`${JSON.stringify(config)}::jsonb` : sql`NULL`},
        ${autoActivate ? 1 : null},
        ${autoActivate},
        false,
        ${user}
      )
      ON CONFLICT(clinic_id,service) DO UPDATE SET
        draft=EXCLUDED.draft,
        active=CASE WHEN ${autoActivate} OR managed_integrations.active IS NOT NULL THEN EXCLUDED.draft ELSE NULL END,
        active_revision=CASE WHEN ${autoActivate} THEN managed_integrations.revision+1 ELSE managed_integrations.active_revision END,
        enabled=CASE WHEN ${autoActivate} THEN true ELSE managed_integrations.enabled END,
        legacy=false,
        revision=managed_integrations.revision+1,
        updated_by=${user},
        updated_at=now()
      RETURNING revision
    `)
    await audit(tx,id,user,'integration.save',service)
    return { ok: true, revision: Number(saved?.revision ?? 1) }
  }).then(async res => {
    if (service === 'phone') {
      const { reconcileAsterisk } = await import('./asterisk')
      await reconcileAsterisk().catch(() => {})
    }
    return res
  })
}
export async function removeConfig(id: string, service: Service, user: string) {
  await ensureIntegrations(); await clinicExists(id)
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('managed-integrations',0))`)
    if (service === 'phone') {
      await tx.execute(sql`DELETE FROM integration_claims WHERE clinic_id=${id}`)
      await tx.execute(sql`DELETE FROM clinic_phone_numbers WHERE clinic_id=${id}`)
    }
    await tx.execute(sql`UPDATE integration_tests SET status='cancelled',expires_at=now() WHERE clinic_id=${id} AND service=${service} AND expires_at>now()`)
    await tx.execute(sql`DELETE FROM managed_integrations WHERE clinic_id=${id} AND service=${service}`)
    await audit(tx,id,user,'integration.delete',service)
  })
  if (service === 'phone') {
    const { reconcileAsterisk } = await import('./asterisk')
    await reconcileAsterisk().catch(() => {})
  }
  return { ok: true }
}
export async function ensureClinicInheritedIntegrations(id: string) {
  await ensureIntegrations()
  const clinic = await clinicExists(id)
  const clinicName = String(clinic.name || 'Klinik')
  for (const service of ['smtp', 'sms'] as Service[]) {
    const [existing] = await db.execute(sql`SELECT clinic_id FROM managed_integrations WHERE clinic_id=${id} AND service=${service}`)
    if (existing) continue
    const [deleted] = await db.execute(sql`SELECT id FROM audit_log WHERE clinic_id=${id} AND action='integration.delete' AND target_id=${service} LIMIT 1`)
    if (deleted) continue
    const [donor] = await db.execute(sql`
      SELECT draft, active
      FROM managed_integrations
      WHERE service=${service} AND clinic_id<>${id} AND (active IS NOT NULL OR draft IS NOT NULL)
      ORDER BY enabled DESC, updated_at DESC
      LIMIT 1
    `)
    if (!donor) continue
    const rawSource = (donor.active || donor.draft) as Config | null
    if (!rawSource) continue
    const cloned: Config = {
      ...rawSource,
      ...(service === 'smtp' ? { fromName: clinicName } : {}),
    }
    const encoded = JSON.stringify(cloned)
    await db.execute(sql`
      INSERT INTO managed_integrations(clinic_id, service, draft, active, revision, active_revision, enabled, legacy)
      VALUES (${id}, ${service}, ${encoded}::jsonb, ${encoded}::jsonb, 1, 1, true, true)
      ON CONFLICT DO NOTHING
    `)
    await db.execute(sql`
      INSERT INTO integration_tests(clinic_id, service, revision, operation_id, kind, target, status, message, confirmed_at, expires_at)
      VALUES (
        ${id},
        ${service},
        1,
        ${`inherited-${id}-${service}`},
        'delivery',
        ${service === 'smtp' ? String(cloned.fromAddress || cloned.username || 'klinik@thinpine.com') : '+905000000000'},
        'confirmed',
        'Platform varsayılan kurumsal bağlantı ayarları otomatik tanımlandı',
        now(),
        now() + interval '365 days'
      )
      ON CONFLICT DO NOTHING
    `).catch(() => {})
  }
}

export async function integrationView(id: string, platform = false) {
  await ensureIntegrations(); await clinicExists(id)
  await ensureClinicInheritedIntegrations(id).catch(() => {})
  const rows = await db.execute(sql`SELECT * FROM managed_integrations WHERE clinic_id=${id}`)
  const result: Record<string, unknown> = {}
  for (const service of ['phone','sms','smtp'] as Service[]) {
    const row = rows.find(r => r.service === service)
    const tests = await db.execute(sql`SELECT id,kind,CASE WHEN status IN ('pending','accepted') AND expires_at<=now() THEN 'expired' ELSE status END AS status,message,created_at,confirmed_at,revision,evidence,expires_at FROM integration_tests WHERE clinic_id=${id} AND service=${service} ORDER BY created_at DESC LIMIT 20`)
    const test = tests[0]
    const active = (row?.active || row?.draft) as Config | null
    result[service] = {
      configured: Boolean(row), enabled: Boolean(row?.enabled), revision: row?.revision ?? 0,
      activeRevision: row?.active_revision ?? null, legacy: Boolean(row?.legacy),
      health: row?.checked_at && Date.now() - new Date(String(row.checked_at)).getTime() < 120000 ? row.health : 'unknown',
      checkedAt: row?.checked_at ?? null, test: test ?? null,
      tests: tests.map(test => ({ id:test.id, kind:test.kind, status:test.status, message:test.message, revision:test.revision, confirmedAt:test.confirmed_at, evidence:test.evidence, expiresAt:test.expires_at })),
      ...(platform ? { config: publicConfig(row?.draft as Config || null) } : {}),
      numbers: active?.numbers || [], callerId: active?.callerId || null,
      senderId: active?.senderId || null, fromAddress: active?.fromAddress || null,
    }
  }
  return { ...result, ...(platform ? { connection: { ip: process.env.NETGSM_PUBLIC_IP || '', port: 5060, protocol: 'TCP' } } : {}) }
}
export async function activeConfig(id: string, service: Service): Promise<Config | null> {
  await clinicExists(id)
  if (service === 'smtp' || service === 'sms') {
    await ensureClinicInheritedIntegrations(id).catch(() => {})
  }
  const row = await getRow(id,service)
  if (row?.enabled && row.active) return decrypt(row.active as Config)
  if (row?.enabled && row.draft) return decrypt(row.draft as Config)
  return null
}
export async function resolveEffectiveConfig(id: string, service: Service): Promise<Config | null> {
  const active = await activeConfig(id, service)
  if (active) return active
  const row = await getRow(id, service)
  if (row?.draft) {
    try { return decrypt(row.draft as Config) } catch {}
  }
  if (service === 'smtp' || service === 'sms') {
    const clinic = await clinicExists(id)
    const [donor] = await db.execute(sql`
      SELECT draft, active
      FROM managed_integrations
      WHERE service=${service} AND (active IS NOT NULL OR draft IS NOT NULL)
      ORDER BY enabled DESC, updated_at DESC
      LIMIT 1
    `)
    const raw = (donor?.active || donor?.draft) as Config | undefined
    if (raw) {
      try {
        const dec = decrypt(raw)
        return service === 'smtp' ? { ...dec, fromName: String(clinic.name || dec.fromName || 'Klinik') } : dec
      } catch {}
    }
  }
  return null
}
