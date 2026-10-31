import { sql } from 'drizzle-orm'
import nodemailer from 'nodemailer'
import { db } from '../../db/client'
import { sendSMS } from '../../services/netgsm'
import { sendAmiAction } from '../../services/asterisk-ami'
import { Config, Service, SetupError, endpointId, phone, safeText } from './model'
import { audit, clinicExists, decrypt, ensureIntegrations, getRow } from './store'
import { reconcileAsterisk, registered } from './asterisk'

export function smtpTransport(c: Config) {
  const isSsl = c.port === 465 || c.secure === 'ssl'
  return nodemailer.createTransport({ host:c.host,port:c.port,secure:isSsl,requireTLS:!isSsl,auth:{user:c.username,pass:c.password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,tls:{rejectUnauthorized:false} })
}
export function describeSmtpError(err: any, c: { host?: string; port?: number; username?: string; fromAddress?: string }): string {
  const code = String(err?.code || '')
  const msg = String(err?.message || '').toLowerCase()
  const host = (c.host || '').toLowerCase()
  const port = Number(c.port || 587)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || msg.includes('getaddrinfo')) {
    return `SMTP sunucu adresi (${c.host}) bulunamadı (DNS kaydı yok). 💡 Öneri: Sunucu adresinde yazım hatası olmadığından emin olun (örn. mx-out03.natrohost.com, mail.alanadi.com, smtp.gmail.com).`
  }
  if (code === 'EAUTH' || msg.includes('invalid login') || msg.includes('535')) {
    if (host.includes('gmail') || host.includes('google')) {
      return 'Gmail / Google Workspace kimlik doğrulaması reddedildi (535). 💡 Öneri: Google normal hesap şifresini kabul etmez; Google Hesabım → Güvenlik → 2 Adımlı Doğrulama → Uygulama Şifreleri menüsünden 16 haneli Uygulama Şifresi oluşturup Parola alanına girin.'
    }
    if (host.includes('yandex')) {
      return 'Yandex SMTP kimlik doğrulaması reddedildi (535). 💡 Öneri: Yandex Hesap → Güvenlik → Uygulama Şifreleri menüsünden uygulama şifresi oluşturun ve Gönderici e-posta ile Kullanıcı adresinin aynı olduğundan emin olun.'
    }
    if (host.includes('office365') || host.includes('outlook')) {
      return 'Microsoft 365 / Outlook kimlik doğrulaması reddedildi. 💡 Öneri: Microsoft 365 yönetim panelinden bu hesap için "Authenticated SMTP (Kimliği Doğrulanmış SMTP)" izninin açık olduğunu kontrol edin.'
    }
    return `SMTP kullanıcı adı (${c.username}) veya parolası sunucu tarafından reddedildi (535). 💡 Öneri: Kullanıcı alanına e-posta adresinin tamamını yazdığınızdan ve parolanın webmail giriş şifrenizle aynı olduğundan emin olun.`
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ECONNREFUSED' || msg.includes('timeout') || msg.includes('econnrefused')) {
    if (port === 587) {
      return `Port 587 (STARTTLS) bağlantısı zaman aşımına uğradı (${c.host}:587 yanıt vermiyor). 💡 Öneri: Natro ve kurumsal mail sunucularında 587 portu kapalı veya yanıtsız olabilir; Port değerini 465 (SSL) yapıp sunucu olarak mx-out03.natrohost.com veya mail.alanadi.com ile tekrar kaydedip deneyin.`
    }
    if (port === 465) {
      return `Port 465 (SSL) üzerinden ${c.host} sunucusuna bağlanılamadı. 💡 Öneri: Sunucu adresini kontrol edin (Natro için mx-out03.natrohost.com) veya Port 587 deneyin.`
    }
    return `SMTP sunucusuna (${c.host}:${port}) bağlanılamadı. 💡 Öneri: Standart SMTP portları olan 465 (SSL) veya 587 (TLS) değerlerinden birini deneyin.`
  }
  if (code === 'ESOCKET' || msg.includes('certificate') || msg.includes('altnames') || msg.includes('wrong version number') || msg.includes('ssl')) {
    return `SMTP SSL/TLS güvenlik el sıkışması başarısız oldu (${c.host}:${port}). 💡 Öneri: Port 587 ise 465 (SSL) yapmayı deneyin; paylaşımlı hosting (Natro/cPanel) kullanıyorsanız mail.alanadi.com yerine sağlayıcının gerçek sunucu adını (örn. mx-out03.natrohost.com) girin.`
  }
  if (code === 'EENVELOPE' || msg.includes('sender') || msg.includes('550') || msg.includes('553')) {
    return `SMTP sunucusu gönderici adresini (${c.fromAddress || c.username}) veya alıcıyı reddetti. 💡 Öneri: "Gönderici e-posta" alanının "Kullanıcı" alanındaki e-posta adresiyle (${c.username}) birebir aynı olduğundan emin olun.`
  }
  return `SMTP bağlantısı tamamlanamadı (${err?.message || 'Bilinmeyen hata'}). 💡 Öneri: Port 465 (SSL) ve sağlayıcı sunucu adresini (örn. mx-out03.natrohost.com) kullanarak tekrar deneyin.`
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
    const [recent] = await tx.execute(sql`SELECT id FROM integration_tests WHERE clinic_id=${id} AND service=${service} AND status NOT IN ('failed','cancelled') AND created_at>now()-interval '15 seconds' LIMIT 1`)
    if (recent) throw new SetupError('Yeni test için 15 saniye bekleyin',429)
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
        if (!await registered(id)) throw new SetupError('SIP kaydı henüz hazır değil (Unregistered). 💡 Öneri: 1) SIP kullanıcı adı ve SIP şifresini (Web panel şifresi değil, Ses/Santral SIP şifresi) kontrol edin. 2) NetGSM Ses Paketinizde sunucu IP adresinin güvenilir IP listesinde tanımlı olduğundan emin olun.')
        const result = await sendAmiAction({Action:'Originate',Channel:`PJSIP/${target.replace('+','')}@${endpointId(id)}`,Context:'outbound-ai',Exten:'s',Priority:'1',CallerID:c.callerId!.replace('+',''),Variable:`CUSTOMER_NUMBER=${target},VOICEAI_CLINIC_ID=${id},VOICEAI_TEST_ID=${created.id}`,Async:'true'})
        if (!result.success) throw new SetupError(`${result.message} 💡 Öneri: Çıkış numarasının Gelen numaralar listesinde yer aldığından ve test numarasının +90 5XX... cep telefonu olduğundan emin olun.`)
      }
    } else if (service === 'sms') {
      const result = await sendSMS({usercode:c.username,password:c.password,senderId:c.senderId!,phone:target,message:'Klinik entegrasyon test mesajı.'})
      if (!result.success) throw new SetupError(result.reason || 'SMS sağlayıcısı test gönderimini kabul etmedi. 💡 Öneri: API kullanıcı kodu, parola ve onaylı gönderici başlığını (MsgHeader) kontrol edin.')
    } else {
      const transport = smtpTransport(c)
      try {
        await transport.verify()
        const info = await transport.sendMail({from:{name:c.fromName || 'Klinik',address:c.fromAddress!},to:target,subject:'Klinik bağlantı testi',text:'Klinik e-posta entegrasyonu test mesajı.'})
        if (!info.accepted?.length) throw new SetupError('SMTP sunucusu alıcı e-posta adresini kabul etmedi. 💡 Öneri: Test alıcısı alanına geçerli bir e-posta adresi girin ve Gönderici e-posta adresinin Kullanıcı ile aynı olduğundan emin olun.')
      } catch (smtpErr: any) {
        if (smtpErr instanceof SetupError) throw smtpErr
        throw new SetupError(describeSmtpError(smtpErr, c))
      } finally { transport.close() }
    }
    await db.execute(sql`UPDATE integration_tests SET status='accepted',message=${service==='phone'?'Çağrı testi bekleniyor':'Sağlayıcı kabul etti; teslimatı doğrulayın'} WHERE id=${created.id} AND status='pending'`)
  } catch (error) {
    const message = error instanceof SetupError ? error.message : 'Test tamamlanamadı. Bağlantı bilgilerini ve sağlayıcı erişimini kontrol edin.'
    // Keep credentials and provider frames out of records; retain the actionable error in server logs.
    console.error(`[Integrations] ${service}/${kind} test failed for clinic ${id}:`, error instanceof Error ? error.message : 'Bilinmeyen hata')
    await db.execute(sql`UPDATE integration_tests SET status='failed',message=${message} WHERE id=${created.id} AND status='pending'`)
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
export async function cancelTest(id: string, service: Service, testId: string, user: string) {
  await ensureIntegrations(); await clinicExists(id)
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('managed-integrations',0))`)
    const [test] = await tx.execute(sql`
      SELECT id FROM integration_tests
      WHERE id=${testId} AND clinic_id=${id} AND service=${service}
        AND status IN ('pending','accepted') AND expires_at>now()
      FOR UPDATE
    `)
    if (!test) throw new SetupError('Yalnızca bekleyen test iptal edilebilir',409)
    await tx.execute(sql`UPDATE integration_tests SET status='cancelled',message='Test kullanıcı tarafından iptal edildi',expires_at=now() WHERE id=${testId}`)
    await audit(tx,id,user,'integration.test.cancel',service)
  })
  // A cancelled phone test must no longer keep its draft SIP registration alive.
  if (service === 'phone') await reconcileAsterisk()
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
