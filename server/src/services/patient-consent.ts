import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { clinics, patientConsentPreferences, patientConsentRequests, patients } from '../db/schema'
import { ensureTreatmentPlanningSchema } from '../db/treatment-planning-schema'
import { getSetting, setSetting } from '../db/repositories/settings'
import { credentialsFor } from '../db/repositories/whatsapp'
import type { Config } from '../integrations/managed/model'
import { activeConfig, decrypt, ensureIntegrations, getRow } from '../integrations/managed/store'
import { normalizePhone, sendWhatsAppText } from '../integrations/whatsapp'
import { sendEmail } from './email'
import { sendSMS } from './netgsm'
import { TreatmentPlanError } from './treatment-planning'

export const CONSENT_CHANNELS = ['sms', 'whatsapp', 'email', 'assistant_call'] as const
export type ConsentChannel = typeof CONSENT_CHANNELS[number]
export type DeliveryChannel = Exclude<ConsentChannel, 'assistant_call'>
export type ChannelIntegrationStatus = 'active' | 'unconfigured' | 'error'
export type ChannelIntegrations = Record<ConsentChannel, { status: ChannelIntegrationStatus; message?: string }>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const textKey = 'patient_consent.form_text'

export async function getConsentChannelStatuses(clinicId: string): Promise<ChannelIntegrations> {
  await ensureIntegrations()
  const [clinic] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1)
  const rows = await db.execute(sql`SELECT service, enabled, active, legacy, health, checked_at, revision FROM managed_integrations WHERE clinic_id = ${clinicId}`)
  const tests = await db.execute(sql`
    SELECT DISTINCT ON (service) service, status, message, revision
    FROM integration_tests
    WHERE clinic_id = ${clinicId}
    ORDER BY service, created_at DESC
  `)
  const rowByService = new Map<string, any>(rows.map((r: any) => [String(r.service), r]))
  const testByService = new Map<string, any>(tests.map((t: any) => [String(t.service), t]))

  // 1. SMS
  const smsRow = rowByService.get('sms')
  const smsTest = testByService.get('sms')
  const hasLegacySms = Boolean(clinic?.netgsmUsercode && clinic?.netgsmPassword && clinic?.smsSenderId)
  let smsStatus: { status: ChannelIntegrationStatus; message?: string }
  if (!smsRow) {
    smsStatus = hasLegacySms
      ? { status: 'active' }
      : { status: 'unconfigured', message: 'Klinikler ekranından SMS entegrasyonu yapılmadı' }
  } else if (smsRow.enabled && smsRow.active && smsTest?.status !== 'failed') {
    smsStatus = { status: 'active' }
  } else {
    smsStatus = {
      status: 'error',
      message: smsTest?.status === 'failed'
        ? (String(smsTest.message || '') || 'Son SMS bağlantı testi başarısız')
        : 'SMS entegrasyonu etkinleştirilmedi veya bağlantı hatası var',
    }
  }

  // 2. Email (SMTP)
  const smtpRow = rowByService.get('smtp')
  const smtpTest = testByService.get('smtp')
  let emailStatus: { status: ChannelIntegrationStatus; message?: string }
  if (!smtpRow) {
    emailStatus = { status: 'unconfigured', message: 'Klinikler ekranından E-posta (SMTP) entegrasyonu yapılmadı' }
  } else if (smtpRow.enabled && smtpRow.active && smtpTest?.status !== 'failed') {
    emailStatus = { status: 'active' }
  } else {
    emailStatus = {
      status: 'error',
      message: smtpTest?.status === 'failed'
        ? (String(smtpTest.message || '') || 'Son E-posta (SMTP) bağlantı testi başarısız')
        : 'E-posta (SMTP) entegrasyonu etkinleştirilmedi veya bağlantı hatası var',
    }
  }

  // 3. Assistant Call (Phone / SIP)
  const phoneRow = rowByService.get('phone')
  const phoneTest = testByService.get('phone')
  let phoneStatus: { status: ChannelIntegrationStatus; message?: string }
  const isUnverifiedLegacyPhone = Boolean(phoneRow?.legacy && phoneRow?.health !== 'registered' && phoneRow?.health !== 'unregistered' && !phoneTest)
  if (!phoneRow || isUnverifiedLegacyPhone) {
    phoneStatus = { status: 'unconfigured', message: 'Klinikler ekranından Sesli Asistan (Telefon/SIP) entegrasyonu yapılmadı' }
  } else if (phoneRow.enabled && phoneRow.active && phoneRow.health === 'registered' && phoneTest?.status !== 'failed') {
    phoneStatus = { status: 'active' }
  } else {
    phoneStatus = {
      status: 'error',
      message: phoneRow.health === 'unregistered'
        ? 'SIP telefon bağlantısı koptu (Unregistered)'
        : phoneTest?.status === 'failed'
          ? (String(phoneTest.message || '') || 'Son telefon bağlantı testi başarısız')
          : 'Telefon entegrasyonu etkinleştirilmedi veya SIP kaydı doğrulanmadı',
    }
  }

  // 4. WhatsApp
  const waConfigured = Boolean(
    clinic?.whatsappExpectedPhone ||
    (clinic?.whatsappSetupStatus && clinic.whatsappSetupStatus !== 'not_started') ||
    clinic?.whatsappEnabled
  )
  let whatsappStatus: { status: ChannelIntegrationStatus; message?: string }
  if (!waConfigured) {
    whatsappStatus = { status: 'unconfigured', message: 'Klinikler ekranından WhatsApp entegrasyonu yapılmadı' }
  } else if (clinic?.whatsappEnabled && clinic?.evolutionConnectionState === 'open' && clinic?.whatsappSetupStatus !== 'phone_mismatch') {
    whatsappStatus = { status: 'active' }
  } else {
    whatsappStatus = {
      status: 'error',
      message: clinic?.whatsappSetupStatus === 'phone_mismatch'
        ? 'WhatsApp numarası klinik numarasıyla eşleşmiyor'
        : clinic?.evolutionConnectionState !== 'open'
          ? 'WhatsApp bağlantısı kesildi veya açık değil'
          : 'WhatsApp gönderimleri etkinleştirilmedi',
    }
  }

  return {
    sms: smsStatus,
    whatsapp: whatsappStatus,
    email: emailStatus,
    assistant_call: phoneStatus,
  }
}

export async function consentSettings(clinicId: string) {
  const text = await getSetting(textKey, clinicId)
  return { text: text || DEFAULT_CONSENT_TEXT, version: text ? hash(text).slice(0, 16) : null }
}

export async function saveConsentSettings(clinicId: string, text: unknown) {
  if (typeof text !== 'string' || text.trim().length < 20 || text.length > 10000)
    throw new TreatmentPlanError('Onam metni 20 ile 10.000 karakter arasında olmalıdır')
  await setSetting(textKey, text.trim(), clinicId)
  return consentSettings(clinicId)
}

export async function getPatientConsent(patientId: string, clinicId: string) {
  await ensureTreatmentPlanningSchema()
  if (!UUID.test(patientId)) throw new TreatmentPlanError('Hasta kimliği geçersiz')
  const [patient] = await db.select({ id: patients.id, phone: patients.phone, email: patients.email, smsOptOut: patients.smsOptOut, whatsappOptOut: patients.whatsappOptOut, emailOptOut: patients.emailOptOut })
    .from(patients).where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId))).limit(1)
  if (!patient) throw new TreatmentPlanError('Hasta bulunamadı', 404)
  const preferences = await db.select().from(patientConsentPreferences).where(and(eq(patientConsentPreferences.clinicId, clinicId), eq(patientConsentPreferences.patientId, patientId)))
  const requests = await db.select({ id: patientConsentRequests.id, deliveryChannel: patientConsentRequests.deliveryChannel, status: patientConsentRequests.status,
    createdAt: patientConsentRequests.createdAt, sentAt: patientConsentRequests.sentAt, respondedAt: patientConsentRequests.respondedAt, expiresAt: patientConsentRequests.expiresAt })
    .from(patientConsentRequests).where(and(eq(patientConsentRequests.clinicId, clinicId), eq(patientConsentRequests.patientId, patientId)))
    .orderBy(sql`${patientConsentRequests.createdAt} DESC`).limit(20)
  return { patient, preferences, requests }
}

/** A missing, refused or revoked preference never authorizes notification. */
export async function hasPatientConsent(clinicId: string, patientId: string, channel: ConsentChannel): Promise<boolean> {
  await ensureTreatmentPlanningSchema()
  if (!UUID.test(patientId) || !CONSENT_CHANNELS.includes(channel)) return false
  const [row] = await db.select({ smsOptOut: patients.smsOptOut, whatsappOptOut: patients.whatsappOptOut, emailOptOut: patients.emailOptOut,
    status: patientConsentPreferences.status, textVersion: patientConsentPreferences.textVersion }).from(patients).leftJoin(patientConsentPreferences, and(
    eq(patientConsentPreferences.patientId, patients.id), eq(patientConsentPreferences.clinicId, clinicId), eq(patientConsentPreferences.channel, channel),
  )).where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId))).limit(1)
  const settings = await consentSettings(clinicId)
  if (!row || row.status !== 'granted' || !settings.version || row.textVersion !== settings.version) return false
  if (channel === 'sms' && row.smsOptOut) return false
  if (channel === 'whatsapp' && row.whatsappOptOut) return false
  if (channel === 'email' && row.emailOptOut) return false
  return true
}

type Sender = (channel: DeliveryChannel, patient: typeof patients.$inferSelect, clinic: typeof clinics.$inferSelect, link: string) => Promise<void>
const sendForm: Sender = async (channel, patient, clinic, link) => {
  const message = `Bildirim tercihlerinizi görüntülemek ve yanıtlamak için: ${link}`
  if (channel === 'sms') {
    let config = await activeConfig(clinic.id, 'sms')
    if (!config) {
      const row = await getRow(clinic.id, 'sms')
      if (row?.draft) config = decrypt(row.draft as Config)
    }
    const usercode = config?.username || clinic.netgsmUsercode
    const password = config?.password || clinic.netgsmPassword
    const senderId = config?.senderId || clinic.smsSenderId
    if (!patient.phone || !usercode || !password || !senderId) throw new Error('SMS bağlantısı veya telefon numarası eksik')
    const response = await sendSMS({ usercode, password, senderId, phone: normalizePhone(patient.phone), message })
    if (!response.success) throw new Error(response.reason || 'SMS gönderilemedi')
  } else if (channel === 'email') {
    if (!patient.email) throw new Error('E-posta adresi eksik')
    await sendEmail({ clinicId: clinic.id, to: patient.email, subject: 'Bildirim tercihleri', text: message })
  } else {
    if (!patient.phone || !clinic.whatsappEnabled) throw new Error('WhatsApp bağlantısı veya telefon numarası eksik')
    await sendWhatsAppText(normalizePhone(patient.phone), credentialsFor(clinic), message)
  }
}

export const DEFAULT_CONSENT_TEXT =
  'Kliniğimiz tarafından tedavi planınız, randevu bilgileriniz ve periyodik kontrol hatırlatmalarınız kapsamında seçtiğiniz iletişim kanalları (SMS, WhatsApp, E-posta, Asistan Arama) üzerinden tarafınıza bilgilendirme yapılmasına 6698 sayılı KVKK kapsamında onay veriyorum.'

export async function requestPatientConsent(input: { patientId: string; clinicId: string; userId: string; deliveryChannel: DeliveryChannel; requestKey: string; hostname: string }, sender: Sender = sendForm) {
  await ensureTreatmentPlanningSchema()
  if (!UUID.test(input.patientId) || !['sms', 'whatsapp', 'email'].includes(input.deliveryChannel) || !input.requestKey || input.requestKey.length > 128)
    throw new TreatmentPlanError('Onam isteği geçersiz')
  let settings = await consentSettings(input.clinicId)
  if (!settings.version) settings = await saveConsentSettings(input.clinicId, DEFAULT_CONSENT_TEXT)
  const hostname = input.hostname.toLowerCase().split(':')[0]
  if (!hostname || !/^[a-z0-9.-]+$/.test(hostname)) throw new TreatmentPlanError('Klinik adresi geçersiz')
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)
  const request = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consent:${input.clinicId}:${input.patientId}`}, 0))`)
    const [previous] = await tx.select().from(patientConsentRequests).where(and(eq(patientConsentRequests.clinicId, input.clinicId), eq(patientConsentRequests.requestKey, input.requestKey))).limit(1)
    if (previous) {
      if (previous.patientId !== input.patientId || previous.deliveryChannel !== input.deliveryChannel) throw new TreatmentPlanError('İstek anahtarı kullanılmış', 409)
      return { record: previous, previous: true, patient: null, clinic: null }
    }
    const [patient] = await tx.select().from(patients).where(and(eq(patients.clinicId, input.clinicId), eq(patients.id, input.patientId))).limit(1)
    const [clinic] = await tx.select().from(clinics).where(eq(clinics.id, input.clinicId)).limit(1)
    if (!patient || !clinic) throw new TreatmentPlanError('Hasta bulunamadı', 404)
    if ((input.deliveryChannel === 'sms' && patient.smsOptOut) || (input.deliveryChannel === 'email' && patient.emailOptOut) ||
      (input.deliveryChannel === 'whatsapp' && patient.whatsappOptOut)) throw new TreatmentPlanError('Hasta bu kanaldan iletişimi kapatmış', 409)
    if ((input.deliveryChannel === 'email' && !patient.email) || (input.deliveryChannel !== 'email' && !patient.phone))
      throw new TreatmentPlanError('Seçilen kanalın iletişim bilgisi eksik')
    const recent = await tx.select({ id: patientConsentRequests.id }).from(patientConsentRequests).where(and(
      eq(patientConsentRequests.clinicId, input.clinicId), eq(patientConsentRequests.patientId, input.patientId),
      eq(patientConsentRequests.deliveryChannel, input.deliveryChannel), gt(patientConsentRequests.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
    ))
    if (recent.length >= 3) throw new TreatmentPlanError('Bu kanala saat içinde en fazla üç istek gönderilebilir', 429)
    const [record] = await tx.insert(patientConsentRequests).values({ clinicId: input.clinicId, patientId: input.patientId, deliveryChannel: input.deliveryChannel,
      tokenHash: hash(token), requestKey: input.requestKey, textVersion: settings.version!, textSnapshot: settings.text, requestedBy: input.userId, expiresAt }).returning()
    return { record, previous: false, patient, clinic }
  })
  if (request.previous) return { id: request.record.id, status: request.record.status }
  const protocol = hostname === 'localhost' || hostname === '127.0.0.1' ? 'http' : 'https'
  const link = `${protocol}://${input.hostname}/consent/${token}`
  try {
    const [latest] = await db.select().from(patients).where(and(eq(patients.id, input.patientId), eq(patients.clinicId, input.clinicId))).limit(1)
    if (!latest || (input.deliveryChannel === 'sms' && latest.smsOptOut) || (input.deliveryChannel === 'email' && latest.emailOptOut) ||
      (input.deliveryChannel === 'whatsapp' && latest.whatsappOptOut)) throw new Error('Kanal kapalı')
    if ((input.deliveryChannel === 'email' && latest.email !== request.patient!.email) ||
      (input.deliveryChannel !== 'email' && latest.phone !== request.patient!.phone)) throw new Error('İletişim bilgisi değişti')
    await sender(input.deliveryChannel, request.patient!, request.clinic!, link)
    await db.update(patientConsentRequests).set({ status: 'sent', sentAt: new Date() }).where(eq(patientConsentRequests.id, request.record.id))
    return { id: request.record.id, status: 'sent' }
  } catch (err) {
    await db.update(patientConsentRequests).set({ status: 'failed' }).where(eq(patientConsentRequests.id, request.record.id))
    const detail = err instanceof Error && err.message ? ` (${err.message})` : ''
    throw new TreatmentPlanError(`Onam formu gönderilemedi; kanal ayarlarını kontrol edin${detail}`, 502)
  }
}

export async function grantInClinicPatientConsent(input: { patientId: string; clinicId: string; userId: string; channels?: ConsentChannel[] }) {
  await ensureTreatmentPlanningSchema()
  if (!UUID.test(input.patientId)) throw new TreatmentPlanError('Hasta kimliği geçersiz')
  let settings = await consentSettings(input.clinicId)
  if (!settings.version) settings = await saveConsentSettings(input.clinicId, DEFAULT_CONSENT_TEXT)
  const activeChannels = Array.isArray(input.channels)
    ? input.channels.filter((c): c is ConsentChannel => CONSENT_CHANNELS.includes(c))
    : [...CONSENT_CHANNELS]
  return db.transaction(async tx => {
    const [patient] = await tx.select().from(patients).where(and(eq(patients.clinicId, input.clinicId), eq(patients.id, input.patientId))).for('update')
    if (!patient) throw new TreatmentPlanError('Hasta bulunamadı', 404)
    const now = new Date()
    const token = randomBytes(32).toString('base64url')
    const [record] = await tx.insert(patientConsentRequests).values({
      clinicId: input.clinicId,
      patientId: input.patientId,
      deliveryChannel: 'sms',
      tokenHash: hash(token),
      requestKey: `in-clinic:${crypto.randomUUID()}`,
      textVersion: settings.version!,
      textSnapshot: settings.text,
      requestedBy: input.userId,
      status: 'responded',
      sentAt: now,
      respondedAt: now,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    }).returning()
    for (const channel of CONSENT_CHANNELS) {
      const status = activeChannels.includes(channel) ? 'granted' : 'revoked'
      await tx.insert(patientConsentPreferences).values({
        clinicId: input.clinicId,
        patientId: input.patientId,
        channel,
        status,
        textVersion: settings.version!,
        requestId: record.id,
        respondedAt: now,
      }).onConflictDoUpdate({
        target: [patientConsentPreferences.clinicId, patientConsentPreferences.patientId, patientConsentPreferences.channel],
        set: { status, textVersion: settings.version!, requestId: record.id, respondedAt: now },
      })
      await tx.execute(sql`INSERT INTO patient_consent_audit (clinic_id, patient_id, request_id, channel, status, text_version) VALUES (${input.clinicId}, ${input.patientId}, ${record.id}, ${channel}, ${status}, ${settings.version!})`)
    }
    await tx.update(patients).set({
      smsOptOut: !activeChannels.includes('sms'),
      whatsappOptOut: !activeChannels.includes('whatsapp'),
      emailOptOut: !activeChannels.includes('email'),
    }).where(and(eq(patients.id, input.patientId), eq(patients.clinicId, input.clinicId)))
    return { id: record.id, status: 'responded', channels: activeChannels }
  })
}

export async function getConsentForm(token: string, clinicId: string) {
  await ensureTreatmentPlanningSchema()
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new TreatmentPlanError('Bağlantı geçersiz veya süresi dolmuş', 404)
  const [request] = await db.select().from(patientConsentRequests).where(and(eq(patientConsentRequests.tokenHash, hash(token)), eq(patientConsentRequests.clinicId, clinicId))).limit(1)
  if (!request || request.status !== 'sent' || request.expiresAt <= new Date()) throw new TreatmentPlanError('Bağlantı geçersiz veya süresi dolmuş', 404)
  return { text: request.textSnapshot, version: request.textVersion, expiresAt: request.expiresAt }
}

export async function submitConsentForm(token: string, clinicId: string, answers: unknown) {
  await ensureTreatmentPlanningSchema()
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !answers || typeof answers !== 'object' || Array.isArray(answers) ||
    CONSENT_CHANNELS.some(channel => typeof (answers as Record<string, unknown>)[channel] !== 'boolean')) throw new TreatmentPlanError('Form yanıtları geçersiz')
  const choices = answers as Record<ConsentChannel, boolean>
  const [candidate] = await db.select({ patientId: patientConsentRequests.patientId }).from(patientConsentRequests)
    .where(and(eq(patientConsentRequests.tokenHash, hash(token)), eq(patientConsentRequests.clinicId, clinicId))).limit(1)
  if (!candidate) throw new TreatmentPlanError('Bağlantı geçersiz veya süresi dolmuş', 404)
  return db.transaction(async tx => {
    await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, candidate.patientId), eq(patients.clinicId, clinicId))).for('update')
    const [request] = await tx.select().from(patientConsentRequests).where(and(eq(patientConsentRequests.tokenHash, hash(token)), eq(patientConsentRequests.clinicId, clinicId))).for('update')
    if (!request || request.status !== 'sent' || request.expiresAt <= new Date()) throw new TreatmentPlanError('Bağlantı geçersiz veya süresi dolmuş', 404)
    const now = new Date()
    for (const channel of CONSENT_CHANNELS) {
      const status = choices[channel] ? 'granted' : 'refused'
      await tx.insert(patientConsentPreferences).values({ clinicId, patientId: request.patientId, channel, status, textVersion: request.textVersion, requestId: request.id, respondedAt: now })
        .onConflictDoUpdate({ target: [patientConsentPreferences.clinicId, patientConsentPreferences.patientId, patientConsentPreferences.channel],
          set: { status, textVersion: request.textVersion, requestId: request.id, respondedAt: now } })
      await tx.execute(sql`INSERT INTO patient_consent_audit (clinic_id, patient_id, request_id, channel, status, text_version) VALUES (${clinicId}, ${request.patientId}, ${request.id}, ${channel}, ${status}, ${request.textVersion})`)
    }
    await tx.update(patients).set({ smsOptOut: !choices.sms, whatsappOptOut: !choices.whatsapp, emailOptOut: !choices.email })
      .where(and(eq(patients.id, request.patientId), eq(patients.clinicId, clinicId)))
    await tx.update(patientConsentRequests).set({ status: 'responded', respondedAt: now }).where(eq(patientConsentRequests.id, request.id))
    await tx.execute(sql`UPDATE patient_consent_requests SET status = 'superseded' WHERE clinic_id = ${clinicId}
      AND patient_id = ${request.patientId} AND id <> ${request.id} AND status = 'sent'`)
    return { success: true }
  })
}

export async function revokePatientConsent(clinicId: string, patientId: string, channels: ConsentChannel[]) {
  await ensureTreatmentPlanningSchema()
  await db.transaction(async tx => {
    for (const channel of channels) {
      const [old] = await tx.update(patientConsentPreferences).set({ status: 'revoked' }).where(and(
        eq(patientConsentPreferences.clinicId, clinicId), eq(patientConsentPreferences.patientId, patientId), eq(patientConsentPreferences.channel, channel),
      )).returning()
      if (old) await tx.execute(sql`INSERT INTO patient_consent_audit (clinic_id, patient_id, request_id, channel, status, text_version)
        VALUES (${clinicId}, ${patientId}, ${old.requestId}, ${channel}, 'revoked', ${old.textVersion})`)
    }
  })
}
