import net from 'net'

export interface AmiConfig {
  host: string
  port: number
  username: string
  secret: string
}

function getAmiConfig(): AmiConfig {
  return {
    host: process.env.ASTERISK_AMI_HOST || 'pineclinic-asterisk',
    port: parseInt(process.env.ASTERISK_AMI_PORT || '5038', 10),
    username: process.env.ASTERISK_AMI_USER || 'voiceai',
    secret: process.env.ASTERISK_AMI_SECRET || 'pineclinic_ami_secret_123',
  }
}

/**
 * Execute a command/action on Asterisk AMI with timeout
 */
export async function sendAmiAction(action: Record<string, string>, timeoutMs = 10000): Promise<{ success: boolean; message: string; raw?: string }> {
  const config = getAmiConfig()
  const actionId = crypto.randomUUID()
  if (Object.values(action).some(value => /[\r\n]/.test(value))) return { success: false, message: 'Geçersiz AMI parametresi' }
  return new Promise(resolve => {
    const socket = new net.Socket()
    let buffer = '', loggedIn = false, sentLogin = false, raw = '', done = false
    const finish = (success: boolean, message: string) => {
      if (done) return
      done = true; clearTimeout(timer); socket.destroy(); resolve({ success, message, raw })
    }
    const write = (values: Record<string,string>) => socket.write(Object.entries(values).map(([k,v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n')
    const timer = setTimeout(() => finish(false, 'AMI bağlantı zaman aşımı'), timeoutMs)
    socket.connect(config.port, config.host)
    socket.on('data', chunk => {
      buffer += chunk.toString()
      if (!sentLogin && buffer.includes('Asterisk Call Manager')) {
        const end = buffer.indexOf('\r\n'); if (end < 0) return
        buffer = buffer.slice(end + 2); sentLogin = true
        write({ Action: 'Login', Username: config.username, Secret: config.secret, Events: 'on', ActionID: 'login' })
      }
      let end: number
      while ((end = buffer.indexOf('\r\n\r\n')) >= 0) {
        const frame = buffer.slice(0,end); buffer = buffer.slice(end+4)
        if (!loggedIn) {
          if (frame.includes('Response: Error')) { finish(false, 'AMI kimlik doğrulama hatası'); return }
          if (frame.includes('Response: Success')) { loggedIn = true; write({ ...action, ActionID: actionId }) }
          continue
        }
        if (!frame.includes(`ActionID: ${actionId}`)) continue
        raw += frame + '\r\n\r\n'
        if (frame.includes('Response: Error')) { finish(false,'Asterisk işlemi reddetti'); return }
        if (frame.includes('EventList: Complete') || frame.includes('EventList: complete')) { finish(true,'Tamamlandı'); return }
        if (/Response: (Success|Follows)/.test(frame) && !/EventList: start/i.test(frame)) { finish(true,'Tamamlandı'); return }
      }
    })
    socket.on('error', () => finish(false,'AMI bağlantısı kurulamadı'))
    socket.on('close', () => finish(false,'AMI bağlantısı kapandı'))
  })
}

/**
 * Redirect an active call to target extension/number in dynamic-forward context
 */
export async function transferCall(channel: string, targetNumber: string, clinicId?: string): Promise<{ success: boolean; message: string }> {
  const { requireClinicId } = await import('../tenancy/context')
  const { activeConfig, decrypt, getRow } = await import('../integrations/managed/store')
  const { endpointId, phone } = await import('../integrations/managed/model')
  const { db } = await import('../db/client')
  const { sql } = await import('drizzle-orm')
  const id = clinicId || requireClinicId()
  const [test] = await db.execute(sql`SELECT * FROM integration_tests WHERE clinic_id=${id} AND service='phone' AND kind='transfer' AND evidence->>'channel'=${channel} AND expires_at>now() AND status='accepted' LIMIT 1`)
  const row = test ? await getRow(id,'phone') : null
  const config = row && row.revision===test?.revision ? decrypt(row.draft as import('../integrations/managed/model').Config) : await activeConfig(id,'phone')
  if (!config) return {success:false,message:'Telefon bağlantısı etkin değil'}
  const expected = await sendAmiAction({Action:'Getvar',Channel:channel,Variable:'VOICEAI_CLINIC_ID'})
  if (!expected.success || !expected.raw?.includes(`Value: ${id}\r\n`)) return {success:false,message:'Çağrı kliniği doğrulanamadı'}
  const target = test ? config.transferNumber : phone(targetNumber)
  if (!target) return {success:false,message:'Aktarım numarası tanımlı değil'}
  for (const [Variable,Value] of Object.entries({VOICEAI_ENDPOINT:endpointId(id),VOICEAI_CALLER_ID:config.callerId!.replace('+','')})) {
    const result=await sendAmiAction({Action:'Setvar',Channel:channel,Variable,Value})
    if(!result.success)return result
  }
  return sendAmiAction({Action:'Redirect',Channel:channel,Context:'dynamic-forward',Exten:target.replace('+',''),Priority:'1'})
}

export async function initiateOutboundCall(customerNumber: string, clinicId: string): Promise<{ success: boolean; message: string }> {
  const { activeConfig } = await import('../integrations/managed/store')
  const { endpointId, phone } = await import('../integrations/managed/model')
  const config=await activeConfig(clinicId,'phone')
  if(!config)return {success:false,message:'Klinik telefon bağlantısı etkin değil'}
  const number=phone(customerNumber)
  return sendAmiAction({Action:'Originate',Channel:`PJSIP/${number.replace('+','')}@${endpointId(clinicId)}`,Context:'outbound-ai',Exten:'s',Priority:'1',CallerID:config.callerId!.replace('+',''),Variable:`CUSTOMER_NUMBER=${number},VOICEAI_CLINIC_ID=${clinicId}`,Async:'true'})
}
