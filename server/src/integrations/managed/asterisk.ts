import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { sendAmiAction } from '../../services/asterisk-ami'
import { Config, endpointId, SetupError } from './model'
import { decrypt, ensureIntegrations } from './store'

type Section = { name: string; fields: Record<string,string> }
export function sections(id: string, c: Config): Section[] {
  const name = endpointId(id)
  return [
    { name: `${name}-auth`, fields: { type:'auth',auth_type:'userpass',username:c.username,password:c.password } },
    { name: `${name}-aor`, fields: { type:'aor',contact:'sip:sip.netgsm.com.tr:5060;transport=tcp',qualify_frequency:'60' } },
    { name: `${name}-registration`, fields: { type:'registration',transport:'transport-tcp',outbound_auth:`${name}-auth`,server_uri:'sip:sip.netgsm.com.tr:5060;transport=tcp',client_uri:`sip:${c.username}@sip.netgsm.com.tr;transport=tcp`,retry_interval:'60',expiration:'3600',line:'yes',endpoint:name,contact_user:c.username } },
    { name, fields: { type:'endpoint',transport:'transport-tcp',context:'from-netgsm',disallow:'all',allow:'alaw,ulaw',outbound_auth:`${name}-auth`,aors:`${name}-aor`,direct_media:'no',rtp_symmetric:'yes',force_rport:'yes',rewrite_contact:'yes',from_user:c.username,from_domain:'sip.netgsm.com.tr' } },
  ]
}
async function command(command: string) {
  const result = await sendAmiAction({Action:'Command',Command:command})
  if (!result.success) throw new SetupError(result.message,503)
  return result.raw || ''
}
export async function registered(id: string) {
  const raw = await command('pjsip show registrations')
  return raw.split('\n').some(line => line.includes(`${endpointId(id)}-registration/`) && /\bRegistered\b/.test(line))
}
async function writeSections(target: Section[]) {
  const filename = 'managed/clinics.conf'
  const existing = await sendAmiAction({Action:'GetConfig',Filename:filename})
  if (!existing.success) throw new SetupError('Asterisk yönetilen yapılandırma desteği hazır değil',503)
  const names = [...(existing.raw || '').matchAll(/Category-\d+: ([^\r\n]+)/g)].map(m => m[1])
  const action: Record<string,string> = {Action:'UpdateConfig',SrcFilename:filename,DstFilename:filename,Reload:'no'}
  let i = 0
  const add = (values: Record<string,string>) => { const suffix = String(i++).padStart(6,'0'); for (const [key,value] of Object.entries(values)) action[`${key}-${suffix}`] = value }
  for (const name of names) add({Action:'DelCat',Cat:name})
  for (const section of target) {
    add({Action:'NewCat',Cat:section.name})
    for (const [key,value] of Object.entries(section.fields)) {
      if (/[\r\n\x00]/.test(value)) throw new SetupError('Geçersiz SIP yapılandırması')
      add({Action:'Append',Cat:section.name,Var:key,Value:value.replace(/;/g,'\\;')})
    }
  }
  const result = await sendAmiAction(action,15000)
  if (!result.success) throw new SetupError('Asterisk yapılandırması uygulanamadı',503)
  await command('pjsip reload')
}

async function retireLegacyTrunk() {
  const action: Record<string, string> = {
    Action: 'UpdateConfig', SrcFilename: 'pjsip.conf', DstFilename: 'pjsip.conf', Reload: 'no',
    'Action-000000': 'DelCat', 'Cat-000000': 'netgsm-registration',
    'Action-000001': 'DelCat', 'Cat-000001': 'netgsm-endpoint',
    'Action-000002': 'DelCat', 'Cat-000002': 'netgsm-aor',
    'Action-000003': 'DelCat', 'Cat-000003': 'netgsm-auth',
    'Action-000004': 'Update', 'Cat-000004': 'netgsm-identify', 'Var-000004': 'endpoint', 'Value-000004': 'netgsm-ingress',
  }
  const result = await sendAmiAction(action, 15000)
  if (!result.success) throw new SetupError('Eski SIP kaydı güvenle devreden çıkarılamadı', 503)
  await command('pjsip reload')
}
// PostgreSQL advisory lock serializes reconcilers across backend replicas.
export async function reconcileAsterisk() {
  await ensureIntegrations()
  await db.transaction(async tx => {
    const [lock] = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtextextended('asterisk-sync',0)) AS locked`)
    if (!lock?.locked) return
    const rows = await tx.execute(sql`SELECT m.* FROM managed_integrations m JOIN clinics c ON c.id=m.clinic_id WHERE m.service='phone' AND c.is_active=true`)
    const desired: Section[] = []
    for (const row of rows) {
      const [test] = await tx.execute(sql`SELECT id FROM integration_tests WHERE clinic_id=${row.clinic_id} AND service='phone' AND revision=${row.revision} AND expires_at>now() AND status IN ('pending','accepted','confirmed') LIMIT 1`)
      const config = test ? row.draft : row.enabled ? row.active : null
      if (config) desired.push(...sections(String(row.clinic_id),decrypt(config as Config)))
    }
    // Persist the last successful snapshot; never log secret-bearing AMI frames.
    const before = await sendAmiAction({Action:'GetConfig',Filename:'managed/clinics.conf'})
    if (!before.success) throw new SetupError('Asterisk güncellemesi gerekli',503)
    const snapshot = parseConfig(before.raw || '')
    if (JSON.stringify(snapshot) !== JSON.stringify(desired)) {
      try {
        await writeSections(desired)
        const endpoints = await command('pjsip show endpoints')
        for (const row of desired.filter(s => s.fields.type === 'endpoint')) if (!endpoints.includes(row.name)) throw new SetupError('Asterisk endpoint doğrulanamadı',503)
      } catch (error) { await writeSections(snapshot).catch(() => {}); throw error }
    }
    // The old singleton trunk is retired only after at least one generated
    // endpoint is loaded and visible to Asterisk. This avoids dual REGISTER.
    if (desired.length > 0) {
      const registrations = await command('pjsip show registrations')
      if (registrations.includes('netgsm-registration/')) await retireLegacyTrunk()
    }
    for (const row of rows) {
      const ok = await registered(String(row.clinic_id))
      await tx.execute(sql`UPDATE managed_integrations SET health=${ok ? 'registered':'unregistered'},checked_at=now() WHERE clinic_id=${row.clinic_id} AND service='phone'`)
    }
  })
}
function parseConfig(raw: string): Section[] {
  const result: Section[] = []
  for (const line of raw.split('\r\n')) {
    const cat = line.match(/^Category-\d+: (.+)$/)
    if (cat) result.push({name:cat[1],fields:{}})
    const field = line.match(/^Line-\d+-\d+: ([^=]+)=(.*)$/)
    if (field && result.length) result[result.length-1].fields[field[1]] = field[2].replace(/\\;/g,';')
  }
  return result
}
let timer: ReturnType<typeof setInterval> | undefined
export function startIntegrationReconciler() {
  if (timer || process.env.TELEPHONY_ENABLED !== '1') return
  const run = () => void reconcileAsterisk().catch(() => console.error('[Integrations] Asterisk eşitlemesi başarısız; yeniden denenecek.'))
  run(); timer = setInterval(run,60000); timer.unref()
}
