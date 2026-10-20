import { sql } from 'drizzle-orm'
import nodemailer from 'nodemailer'
import { db } from '../../db/client'
import { sendSMS } from '../../services/netgsm'
import { sendAmiAction } from '../../services/asterisk-ami'
import { Config, Service, SetupError, endpointId, phone, safeText } from './model'
import { audit, clinicExists, decrypt, ensureIntegrations, getRow } from './store'
import { reconcileAsterisk, registered } from './asterisk'

export function smtpTransport(c: Config) {
  return nodemailer.createTransport({ host:c.host,port:c.port,secure:c.secure==='ssl',requireTLS:c.secure==='tls',auth:{user:c.username,pass:c.password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,tls:{rejectUnauthorized:true} })
}
export async function testInfo(id: string, service: Service, testId: string) {
  await ensureIntegrations(); await clinicExists(id)
  const [test] = await db.execute(sql`SELECT id,revision,kind,target,status,evidence,message,created_at,expires_at,confirmed_at FROM integration_tests WHERE id=${testId} AND clinic_id=${id} AND service=${service}`)
  if (!test) throw new SetupError('Test bulunamadı',404)
  return test
}
export async function beginTest(id: string, service: Service, body: Record<string,unknown>, user: string) {
  await clinicExists(id); await ensureIntegrations()
  const operationId = String(body.operationId || '')
  if (!/^[0-9a-f-]{36}$/i.test(operationId)) throw new SetupError('Geçerli işlem kimliği gerekli')
  const target = service === 'smtp' ? safeText(body.target,'Test e-posta adresi') : phone(String(body.target || ''))
  if (service === 'smtp' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) throw new SetupError('Test e-posta adresi geçersiz')
  const kind = service === 'phone' ? String(body.kind || 'inbound') : 'delivery'
  if (service === 'phone' && !['inbound','outbound','transfer'].includes(kind)) throw new SetupError('Test türü geçersiz')
  const created = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('managed-integrations',0))`)
    const [existing] = await tx.execute(sql`SELECT id FROM integration_tests WHERE clinic_id=${id} AND service=${service} AND operation_id=${operationId}`)
    if (existing) return { id: String(existing.id), duplicate:true }
    const [row] = await tx.execute(sql`SELECT * FROM managed_integrations WHERE clinic_id=${id} AND service=${service} FOR UPDATE`)
    if (!row || row.revision !== Number(body.revision)) throw new SetupError('Önce güncel ayarları kaydedin',409)
    const [recent] = await tx.execute(sql`SELECT id FROM integration_tests WHERE clinic_id=${id} AND service=${service} AND created_at>now()-interval '30 seconds' LIMIT 1`)
    if (recent) throw new SetupError('Yeni test için 30 saniye bekleyin',429)
    const config = decrypt(row.draft as Config)
    if (service === 'phone' && row.enabled && row.active) {
      const active = decrypt(row.active as Config)
      if (JSON.stringify(active) !== JSON.stringify(config)) throw new SetupError('Çalışan hattın test sırasında değişmemesi için önce telefon bağlantısını devre dışı bırakın. Devam eden çağrılar korunur.',409)
    }
    if (kind === 'transfer' && !config.transferNumber) throw new SetupError('Aktarım numarası tanımlı değil')
    const [test] = await tx.execute(sql`INSERT INTO integration_tests(clinic_id,service,revision,operation_id,kind,target,created_by) VALUES(${id},${service},${row.revision},${operationId},${kind},${target},${user}) RETURNING id`)
    await audit(tx,id,user,'integration.test',service)
    return { id:String(test.id),duplicate:false,config }
  })
  if (created.duplicate) return testInfo(id,service,created.id)
  try {
    const c = created.config!
    if (service === 'phone') {
      await reconcileAsterisk()
      // Registration is asynchronous; the test remains pending and can be refreshed.
      if (kind !== 'inbound') {
        if (!await registered(id)) throw new SetupError('SIP kaydı henüz hazır değil. Bağlantı durumunu kontrol edip testi yeniden başlatın.')
        const result = await sendAmiAction({Action:'Originate',Channel:`PJSIP/${target.replace('+','')}@${endpointId(id)}`,Context:'outbound-ai',Exten:'s',Priority:'1',CallerID:c.callerId!.replace('+',''),Variable:`CUSTOMER_NUMBER=${target},VOICEAI_CLINIC_ID=${id},VOICEAI_TEST_ID=${created.id}`,Async:'true'})
        if (!result.success) throw new SetupError(result.message)
      }
    } else if (service === 'sms') {
      const result = await sendSMS({usercode:c.username,password:c.password,senderId:c.senderId!,phone:target,message:'Klinik entegrasyon test mesajı.'})
      if (!result.success) throw new SetupError('SMS sağlayıcısı test gönderimini kabul etmedi')
    } else {
      const transport = smtpTransport(c)
      try {
        await transport.verify()
        const info = await transport.sendMail({from:{name:c.fromName || 'Klinik',address:c.fromAddress!},to:target,subject:'Klinik bağlantı testi',text:'Klinik e-posta entegrasyonu test mesajı.'})
        if (!info.accepted?.length) throw new SetupError('SMTP alıcıyı kabul etmedi')
      } finally { transport.close() }
    }
    await db.execute(sql`UPDATE integration_tests SET status='accepted',message=${service==='phone'?'Çağrı testi bekleniyor':'Sağlayıcı kabul etti; teslimatı doğrulayın'} WHERE id=${created.id}`)
  } catch {
    await db.execute(sql`UPDATE integration_tests SET status='failed',message='Test tamamlanamadı. Bağlantı bilgilerini ve sağlayıcı erişimini kontrol edin.' WHERE id=${created.id}`)
  }
  return testInfo(id,service,created.id)
}
export async function confirmTest(id: string, service: Service, testId: string, user: string) {
  await ensureIntegrations(); await clinicExists(id)
  await db.transaction(async tx => {
    const [row] = await tx.execute(sql`SELECT revision FROM managed_integrations WHERE clinic_id=${id} AND service=${service} FOR UPDATE`)
    const [test] = await tx.execute(sql`SELECT * FROM integration_tests WHERE id=${testId} AND clinic_id=${id} AND service=${service} AND expires_at>now() FOR UPDATE`)
    if (!row || !test || test.revision !== row.revision || !['accepted','confirmed'].includes(String(test.status))) throw new SetupError('Güncel ve başarılı test gerekli',409)
    if (service === 'phone') {
      const evidence = test.evidence as Record<string,unknown>
      if (!evidence.connected || (test.kind === 'transfer' && !evidence.transferred) || !await registered(id)) throw new SetupError('SIP kaydı ve gerçek çağrı bağlantısı doğrulanmalı; aktarım testinde çağrı aktarılmalı',409)
    }
    await tx.execute(sql`UPDATE integration_tests SET status='confirmed',confirmed_at=now() WHERE id=${testId}`)
    await audit(tx,id,user,'integration.test.confirm',service)
  })
  return testInfo(id,service,testId)
}
export async function setEnabled(id: string, service: Service, enabled: boolean, revision: number, user: string) {
  await ensureIntegrations(); await clinicExists(id)
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('managed-integrations',0))`)
    const [row] = await tx.execute(sql`SELECT * FROM managed_integrations WHERE clinic_id=${id} AND service=${service} FOR UPDATE`)
    if (!row || row.revision !== revision) throw new SetupError('Ayarlar değişmiş. Ekranı yenileyin.',409)
    if (enabled) {
      const tests = await tx.execute(sql`SELECT kind FROM integration_tests WHERE clinic_id=${id} AND service=${service} AND revision=${revision} AND status='confirmed' AND confirmed_at>now()-interval '24 hours'`)
      const required = service === 'phone' ? ['inbound','outbound',...((row.draft as Config).transferNumber ? ['transfer'] : [])] : ['delivery']
      if (required.some(kind => !tests.some(t => t.kind === kind))) throw new SetupError('Gerekli testleri tamamlayıp teslimatı/çift yönlü sesi doğrulayın',409)
      if (service === 'phone' && !await registered(id)) throw new SetupError('SIP kaydı aktif değil',409)
      await tx.execute(sql`UPDATE managed_integrations SET enabled=true,active=draft,active_revision=revision,legacy=false,updated_by=${user},updated_at=now() WHERE clinic_id=${id} AND service=${service}`)
      if (service === 'phone') {
        const c = row.draft as Config
        await tx.execute(sql`UPDATE clinic_phone_numbers SET is_active=false,is_primary=false WHERE clinic_id=${id}`)
        for (const number of c.numbers || []) await tx.execute(sql`INSERT INTO clinic_phone_numbers(clinic_id,phone_number,is_active,is_primary) VALUES(${id},${number},true,${number===c.callerId}) ON CONFLICT(phone_number) DO UPDATE SET is_active=true,is_primary=EXCLUDED.is_primary WHERE clinic_phone_numbers.clinic_id=${id}`)
      }
    } else {
      await tx.execute(sql`UPDATE managed_integrations SET enabled=false,updated_by=${user},updated_at=now() WHERE clinic_id=${id} AND service=${service}`)
      await tx.execute(sql`UPDATE integration_tests SET expires_at=now() WHERE clinic_id=${id} AND service=${service} AND expires_at>now()`)
    }
    await audit(tx,id,user,enabled?'integration.activate':'integration.deactivate',service)
  })
  if (service === 'phone') await reconcileAsterisk()
  return {ok:true}
}
