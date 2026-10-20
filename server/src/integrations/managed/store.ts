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
    if (row && Number(input.revision) !== row.revision) throw new SetupError('Ayarlar başka bir işlemde değişti. Yenileyin.', 409)
    const config = encrypt(validateConfig(service, input, row ? decrypt(row.draft as Config) : undefined))
    if (service === 'phone') {
      const active = row?.active as Config | undefined
      const claims = [ ['sip', config.username], ...(config.numbers || []).map(n => ['phone', n]), ...(active?.numbers || []).map(n => ['phone',n]), ...(active ? [['sip',active.username]] : []) ]
      for (const [kind,value] of claims) {
        if (kind === 'phone') {
          const legacy = await tx.execute(sql`SELECT clinic_id,phone_number FROM clinic_phone_numbers WHERE clinic_id<>${id}`)
          if (legacy.some(p => { try { return phone(String(p.phone_number)) === value } catch { return false } })) throw new SetupError('Numara başka bir kliniğe atanmış',409)
        }
        const [owner] = await tx.execute(sql`SELECT clinic_id FROM integration_claims WHERE kind=${kind} AND value=${value}`)
        if (owner && owner.clinic_id !== id) throw new SetupError('Numara veya SIP hesabı başka bir kliniğe atanmış',409)
      }
      await tx.execute(sql`DELETE FROM integration_claims WHERE clinic_id=${id}`)
      for (const [kind,value] of claims) await tx.execute(sql`INSERT INTO integration_claims(kind,value,clinic_id) VALUES(${kind},${value},${id}) ON CONFLICT DO NOTHING`)
    }
    await tx.execute(sql`INSERT INTO managed_integrations(clinic_id,service,draft,updated_by) VALUES(${id},${service},${JSON.stringify(config)}::jsonb,${user}) ON CONFLICT(clinic_id,service) DO UPDATE SET draft=EXCLUDED.draft,revision=managed_integrations.revision+1,updated_by=${user},updated_at=now()`)
    await audit(tx,id,user,'integration.save',service)
    return { ok: true }
  })
}
export async function integrationView(id: string, platform = false) {
  await ensureIntegrations(); await clinicExists(id)
  const rows = await db.execute(sql`SELECT * FROM managed_integrations WHERE clinic_id=${id}`)
  const result: Record<string, unknown> = {}
  for (const service of ['phone','sms','smtp'] as Service[]) {
    const row = rows.find(r => r.service === service)
    const tests = await db.execute(sql`SELECT id,kind,status,message,created_at,confirmed_at,revision,evidence FROM integration_tests WHERE clinic_id=${id} AND service=${service} ORDER BY created_at DESC LIMIT 20`)
    const test = tests[0]
    const active = row?.active as Config | null
    result[service] = {
      configured: Boolean(row), enabled: Boolean(row?.enabled), revision: row?.revision ?? 0,
      activeRevision: row?.active_revision ?? null, legacy: Boolean(row?.legacy),
      health: row?.checked_at && Date.now() - new Date(String(row.checked_at)).getTime() < 120000 ? row.health : 'unknown',
      checkedAt: row?.checked_at ?? null, test: test ?? null,
      tests: tests.map(test => ({ id:test.id, kind:test.kind, status:test.status, message:test.message, revision:test.revision, confirmedAt:test.confirmed_at, evidence:test.evidence })),
      ...(platform ? { config: publicConfig(row?.draft as Config || null) } : {}),
      numbers: active?.numbers || [], callerId: active?.callerId || null,
      senderId: active?.senderId || null, fromAddress: active?.fromAddress || null,
    }
  }
  return { ...result, ...(platform ? { connection: { ip: process.env.NETGSM_PUBLIC_IP || '', port: 5060, protocol: 'TCP' } } : {}) }
}
export async function activeConfig(id: string, service: Service): Promise<Config | null> {
  await clinicExists(id)
  const row = await getRow(id,service)
  return row?.enabled && row.active ? decrypt(row.active as Config) : null
}
