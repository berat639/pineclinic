import { createHmac, timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { Config, endpointId, phone, SetupError } from './model'
import { ensureIntegrations } from './store'
const fields = ['uuid','caller','channel','direction','did','endpoint','clinicId','testId','timestamp']
export function verifyCallSignature(query: Record<string,unknown>, secret = process.env.ASTERISK_AMI_SECRET || '') {
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
  const rows=await db.execute(sql`SELECT m.*,d.hostname FROM managed_integrations m JOIN clinics c ON c.id=m.clinic_id AND c.is_active=true JOIN clinic_domains d ON d.clinic_id=c.id AND d.is_primary=true AND d.is_active=true WHERE m.service='phone'`)
  const source=rows.find(r=>endpointId(String(r.clinic_id))===endpoint)
  if (!source && endpoint!=='netgsm-ingress' && endpoint!=='netgsm-endpoint') throw new SetupError('Bilinmeyen sağlayıcı bağlantısı',403)
  let did: string | null=null
  if(query.did && query.did!=='s') { try {did=phone(String(query.did))} catch {throw new SetupError('Aranan numara geçersiz',403)} }
  const candidates=rows.filter(r=> {
    const configs=[r.active,r.draft].filter(Boolean) as Config[]
    return did && configs.some(c=>c.numbers?.includes(did!))
  })
  const outbound=query.direction==='outbound'
  const row=outbound ? source : did ? (candidates.length===1?candidates[0]:null) : source
  if (!row || (source && source.clinic_id!==row.clinic_id) || (outbound && query.clinicId!==row.clinic_id)) throw new SetupError('Çağrı kliniği güvenle eşleştirilemedi',403)
  const id=String(row.clinic_id)
  let caller: string; try {caller=phone(String(query.caller))} catch {throw new SetupError('Arayan numara geçersiz',403)}
  const tests=await db.execute(sql`SELECT * FROM integration_tests WHERE clinic_id=${id} AND service='phone' AND revision=${row.revision} AND expires_at>now() AND status IN ('pending','accepted') AND target=${caller} ORDER BY created_at DESC`)
  const test=outbound ? tests.find(t=>t.id===query.testId && ['outbound','transfer'].includes(String(t.kind))) : tests.find(t=>t.kind==='inbound')
  if(query.testId && !test) throw new SetupError('Test oturumu geçersiz',403)
  const config=(test?row.draft:row.enabled?row.active:null) as Config | null
  if(!config || (!outbound && did && !config.numbers?.includes(did))) throw new SetupError('Telefon bağlantısı etkin değil',403)
  return { clinicId:id,hostname:String(row.hostname),testId:test?String(test.id):undefined,caller,config }
}
export async function recordCallConnected(channel: string, clinicId: string) {
  await db.execute(sql`UPDATE integration_tests SET evidence=evidence || '{"connected":true}'::jsonb WHERE clinic_id=${clinicId} AND service='phone' AND evidence->>'channel'=${channel} AND expires_at>now()`)
}
