import { createHmac, timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { Config, endpointId, phone, SetupError } from './model'
import { audit, ensureIntegrations } from './store'
const fields = ['uuid','caller','channel','direction','did','endpoint','clinicId','testId','timestamp']
export function verifyCallSignature(query: Record<string,unknown>, secret = process.env.ASTERISK_AMI_SECRET || 'pineclinic_ami_secret_123') {
  const timestamp=Number(query.timestamp)
  if (!secret || !Number.isFinite(timestamp) || Math.abs(Date.now()/1000-timestamp)>60) return false
  const signature=String(query.signature || '')
  if (!/^[a-f0-9]{64}$/.test(signature)) return false
  const values=fields.map(k=>String(query[k] || ''))
  if(values.some(v=>v.includes('|') || /[\r\n]/.test(v))) return false
  const expected=createHmac('sha256',secret).update(values.join('|')).digest()
  return timingSafeEqual(expected,Buffer.from(signature,'hex'))
}
export async function resolveCall(query: Record<string,unknown>) {
  await ensureIntegrations()
  if (!verifyCallSignature(query)) throw new SetupError('Geçersiz santral imzası',401)
  if (!/^[0-9a-f-]{36}$/i.test(String(query.uuid || ''))) throw new SetupError('Çağrı kimliği geçersiz')
  const endpoint=String(query.endpoint || '')
  const queryRows = () => db.execute(sql`
    SELECT m.*, COALESCE((
      SELECT d.hostname
      FROM clinic_domains d
      WHERE d.clinic_id = c.id AND d.is_active = true
      ORDER BY (d.hostname NOT IN ('localhost', '127.0.0.1')) DESC, d.is_primary DESC, d.created_at ASC
      LIMIT 1
    ), ${(process.env.TELEPHONY_CLINIC_HOSTNAME || (process.env.DEFAULT_CLINIC_HOSTS || 'pineclinic.thinpine.com').split(',')[0] || 'pineclinic.thinpine.com').trim()}) AS hostname
    FROM managed_integrations m
    JOIN clinics c ON c.id = m.clinic_id AND c.is_active = true
    WHERE m.service = 'phone'
  `)
  let rows = await queryRows()
  if (rows.length === 0) {
    const { importLegacyIntegrations } = await import('./legacy')
    await importLegacyIntegrations().catch(() => {})
    rows = await queryRows()
  }
  const source=rows.find(r=>endpointId(String(r.clinic_id))===endpoint)
  if (!source && endpoint!=='netgsm-ingress' && endpoint!=='netgsm-endpoint' && endpoint!=='') throw new SetupError('Bilinmeyen sağlayıcı bağlantısı',403)
  let did: string | null=null
  if(query.did && query.did!=='s') {
    const rawDid = String(query.did).trim()
    const sipMatch = rawDid.match(/sip:([^@;>\s]+)/i)
    const candidateDid = (sipMatch ? sipMatch[1] : rawDid).trim()
    if (candidateDid && candidateDid !== 's' && candidateDid !== '100') {
      try { did = phone(candidateDid) } catch { did = null }
    }
  }
  const configMatchesDid = (c: Config, targetDid: string) => {
    if (c.numbers?.some(n => { try { return phone(String(n)) === targetDid } catch { return false } })) return true
    if (c.callerId) { try { if (phone(String(c.callerId)) === targetDid) return true } catch {} }
    if (c.username) { try { if (phone(String(c.username)) === targetDid) return true } catch {} }
    return false
  }
  const candidates=rows.filter(r=> {
    const configs=[r.active,r.draft].filter(Boolean) as Config[]
    return Boolean(did && configs.some(c=>configMatchesDid(c, did!)))
  })
  const outbound=query.direction==='outbound'
  const byClinicId=query.clinicId ? rows.find(r=>String(r.clinic_id)===String(query.clinicId)) : undefined
  const row=outbound
    ? (source || byClinicId)
    : did
      ? (candidates.length===1 ? candidates[0] : (source && candidates.some(c=>c.clinic_id===source.clinic_id) ? source : (rows.length===1 ? rows[0] : null)))
      : (source || byClinicId || (rows.length===1 ? rows[0] : null))
  if (!row || (source && source.clinic_id!==row.clinic_id) || (outbound && query.clinicId && query.clinicId!==row.clinic_id)) throw new SetupError('Çağrı kliniği güvenle eşleştirilemedi',403)
  const id=String(row.clinic_id)
  let caller: string
  try {caller=phone(String(query.caller))} catch {caller=String(query.caller || '').replace(/[^0-9+]/g,'') || 'unknown'}
  const allActiveTests=await db.execute(sql`SELECT * FROM integration_tests WHERE clinic_id=${id} AND service='phone' AND revision=${row.revision} AND expires_at>now() AND status IN ('pending','accepted') ORDER BY created_at DESC`)
  const matchingCallerTests=allActiveTests.filter(t=>t.target===caller)
  const test=outbound
    ? allActiveTests.find(t=>t.id===query.testId && ['outbound','transfer'].includes(String(t.kind)))
    : (matchingCallerTests.find(t=>t.kind==='inbound') || allActiveTests.find(t=>t.kind==='inbound'))
  if(query.testId && !test) throw new SetupError('Test oturumu geçersiz',403)
  const config=(test ? row.draft : (row.enabled && row.active) ? row.active : (!row.active && row.draft) ? row.draft : null) as Config | null
  if(!config || (!outbound && did && !configMatchesDid(config, did) && rows.length > 1)) throw new SetupError('Telefon bağlantısı etkin değil',403)
  return { clinicId:id,hostname:String(row.hostname),testId:test?String(test.id):undefined,caller,config }
}
// Only authenticated routing can attach this channel to a test. AudioSocket
// connection proves call connectivity, not the caller's subjective audio quality.
export async function recordCallConnected(channel: string, clinicId: string, transferred = false) {
  if (!channel) return
  await db.transaction(async tx => {
    const evidence = transferred ? { transferred: true } : { connected: true }
    await tx.execute(sql`UPDATE integration_tests t SET evidence=t.evidence || ${JSON.stringify(evidence)}::jsonb
      FROM managed_integrations m WHERE t.clinic_id=${clinicId} AND t.service='phone'
      AND m.clinic_id=t.clinic_id AND m.service=t.service AND m.revision=t.revision
      AND t.evidence->>'channel'=${channel} AND t.expires_at>now()
      AND t.status IN ('pending','accepted') AND (${!transferred} OR t.kind='transfer')`)
    const confirmed = await tx.execute(sql`UPDATE integration_tests t
      SET status='confirmed',confirmed_at=now(),message='Çağrı bağlantısı otomatik doğrulandı'
      FROM managed_integrations m WHERE t.clinic_id=${clinicId} AND t.service='phone'
      AND m.clinic_id=t.clinic_id AND m.service=t.service AND m.revision=t.revision
      AND t.evidence->>'channel'=${channel} AND t.expires_at>now()
      AND t.status IN ('pending','accepted') AND t.evidence->>'connected'='true'
      AND (t.kind IN ('inbound','outbound') OR (t.kind='transfer' AND t.evidence->>'transferred'='true')) RETURNING t.id`)
    if (confirmed.length) await audit(tx,clinicId,null,'integration.test.auto-confirm','phone')
  })
}
