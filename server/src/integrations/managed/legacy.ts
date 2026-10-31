import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { Config, phone } from './model'
import { encrypt, ensureIntegrations } from './store'

// Import only verified ownership. Existing source records are retained for rollback.
export async function importLegacyIntegrations() {
  await ensureIntegrations()
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('managed-integrations',0))`)
    const clinics = await tx.execute(sql`SELECT * FROM clinics WHERE is_active=true`)
    for (const clinic of clinics) {
      const id = String(clinic.id)
      const rows = await tx.execute(sql`SELECT key,value FROM clinic_settings WHERE clinic_id=${id} AND key LIKE 'smtp.%'`)
      const settings = Object.fromEntries(rows.map(r => [String(r.key),String(r.value)]))
      const values: {service:string;config:Config}[] = []
      if (clinic.netgsmUsercode) {} // SQL rows use snake_case.
      if (clinic.netgsm_usercode && clinic.netgsm_password && clinic.sms_sender_id) values.push({service:'sms',config:{username:String(clinic.netgsm_usercode),password:String(clinic.netgsm_password),senderId:String(clinic.sms_sender_id)}})
      if (settings['smtp.host'] && settings['smtp.user'] && settings['smtp.pass']) values.push({service:'smtp',config:{username:settings['smtp.user'],password:settings['smtp.pass'],host:settings['smtp.host'],port:Number(settings['smtp.port'])||587,secure:settings['smtp.secure']==='ssl'?'ssl':'tls',fromAddress:settings['smtp.user'],fromName:String(clinic.name)}})
      const host = (process.env.TELEPHONY_CLINIC_HOSTNAME || (process.env.DEFAULT_CLINIC_HOSTS || 'pineclinic.thinpine.com').split(',')[0] || 'pineclinic.thinpine.com').trim().toLowerCase()
      const [domain] = host ? await tx.execute(sql`SELECT hostname FROM clinic_domains WHERE clinic_id=${id} AND hostname=${host} AND is_active=true`) : []
      if ((domain || clinics.length === 1) && process.env.NETGSM_SIP_USER && process.env.NETGSM_SIP_PASSWORD) {
        const numberRows = await tx.execute(sql`SELECT phone_number FROM clinic_phone_numbers WHERE clinic_id=${id} AND is_active=true`)
        const numbers = numberRows.flatMap(r => { try { return [phone(String(r.phone_number))] } catch { return [] } })
        let own = ''; try { own = phone(process.env.NETGSM_SIP_USER) } catch {}
        const allNumbers = [...new Set([...(own ? [own] : []), ...numbers])]
        if (own && allNumbers.length > 0) {
          values.push({service:'phone',config:{username:process.env.NETGSM_SIP_USER,password:process.env.NETGSM_SIP_PASSWORD,numbers:allNumbers,callerId:own,transferNumber:''}})
        }
      }
      for (const {service,config} of values) {
        const [exists] = await tx.execute(sql`SELECT clinic_id FROM managed_integrations WHERE clinic_id=${id} AND service=${service}`)
        if (exists) continue
        const [deleted] = await tx.execute(sql`SELECT id FROM audit_log WHERE clinic_id=${id} AND action='integration.delete' AND target_id=${service} LIMIT 1`)
        if (deleted) continue
        if (service==='phone') {
          const claimItems = [['sip',config.username],...(config.numbers || []).map(n=>['phone',n])]
          let hasConflict = false
          for (const [kind,value] of claimItems) {
            const [conflict] = await tx.execute(sql`SELECT clinic_id FROM integration_claims WHERE kind=${kind} AND value=${value} AND clinic_id<>${id}`)
            if (conflict) { hasConflict = true; break }
          }
          if (hasConflict) continue
          for (const [kind,value] of claimItems) {
            await tx.execute(sql`INSERT INTO integration_claims(kind,value,clinic_id) VALUES(${kind},${value},${id}) ON CONFLICT DO NOTHING`)
          }
          for (const num of config.numbers || []) {
            await tx.execute(sql`INSERT INTO clinic_phone_numbers(clinic_id,phone_number,is_active,is_primary) VALUES(${id},${num},true,${num===config.callerId}) ON CONFLICT(phone_number) DO NOTHING`)
          }
        }
        const encoded=JSON.stringify(encrypt(config))
        await tx.execute(sql`INSERT INTO managed_integrations(clinic_id,service,draft,active,active_revision,enabled,legacy) VALUES(${id},${service},${encoded}::jsonb,${encoded}::jsonb,1,true,true) ON CONFLICT DO NOTHING`)
      }
    }
  })
}
