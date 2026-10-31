import { beforeAll, afterAll, describe, expect, test } from 'bun:test'
import postgres from 'postgres'

const testUrl = process.env.TREATMENT_TEST_DATABASE_URL
describe.skipIf(!testUrl)('patient notification consent', () => {
  let sql: postgres.Sql
  let consent: typeof import('./patient-consent')
  let clinicId: string
  let otherClinicId: string
  let patientId: string
  let userId: string
  let token = ''
  let phone = ''

  beforeAll(async () => {
    if (!testUrl) throw new Error('Test database is required')
    process.env.DATABASE_URL = testUrl
    sql = postgres(testUrl, { max: 1, onnotice: () => {} })
    consent = await import('./patient-consent')
    const [clinic] = await sql`SELECT id FROM clinics WHERE name <> 'Consent test other' ORDER BY created_at LIMIT 1`
    const [other] = await sql`INSERT INTO clinics (name) VALUES ('Consent test other') RETURNING id`
    phone = `0555${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`
    const [patient] = await sql`INSERT INTO patients (clinic_id, name, phone, email) VALUES (${clinic.id}, 'Consent test', ${phone}, 'test@example.invalid') RETURNING id`
    const [user] = await sql`SELECT id FROM users LIMIT 1`
    clinicId = clinic.id; otherClinicId = other.id; patientId = patient.id; userId = user.id
    await consent.saveConsentSettings(clinicId, 'Test bildirim tercihi metni, bu bir test içeriğidir.')
  })

  afterAll(async () => {
    if (sql) await sql.end()
  })

  test('legacy opt-out false is not affirmative consent', async () => {
    for (const channel of consent.CONSENT_CHANNELS) expect(await consent.hasPatientConsent(clinicId, patientId, channel)).toBe(false)
  })

  test('sending a form does not grant consent, and the token is stored only as a hash', async () => {
    const result = await consent.requestPatientConsent({ clinicId, patientId, userId, deliveryChannel: 'sms', requestKey: crypto.randomUUID(), hostname: 'localhost:3000' },
      async (_channel, _patient, _clinic, link) => { token = link.split('/').at(-1) || '' })
    expect(result.status).toBe('sent')
    expect(token).toHaveLength(43)
    const [row] = await sql`SELECT token_hash FROM patient_consent_requests WHERE id = ${result.id}`
    expect(row.token_hash).not.toBe(token)
    expect(await consent.hasPatientConsent(clinicId, patientId, 'sms')).toBe(false)
    expect((await consent.getConsentForm(token, clinicId)).text).toContain('Test bildirim')
    await expect(consent.getConsentForm(token, otherClinicId)).rejects.toThrow('geçersiz')
  })

  test('only explicit channel answers grant permission, and token cannot be replayed', async () => {
    await consent.submitConsentForm(token, clinicId, { sms: true, whatsapp: false, email: true, assistant_call: false })
    expect(await consent.hasPatientConsent(clinicId, patientId, 'sms')).toBe(true)
    expect(await consent.hasPatientConsent(clinicId, patientId, 'email')).toBe(true)
    expect(await consent.hasPatientConsent(clinicId, patientId, 'whatsapp')).toBe(false)
    expect(await consent.hasPatientConsent(clinicId, patientId, 'assistant_call')).toBe(false)
    await expect(consent.submitConsentForm(token, clinicId, { sms: true, whatsapp: true, email: true, assistant_call: true })).rejects.toThrow('geçersiz')
  })

  test('legacy opt-out blocks a channel even with a grant', async () => {
    await sql`UPDATE patients SET sms_opt_out = true WHERE id = ${patientId}`
    expect(await consent.hasPatientConsent(clinicId, patientId, 'sms')).toBe(false)
    await consent.revokePatientConsent(clinicId, patientId, ['sms'])
    await sql`UPDATE patients SET sms_opt_out = false WHERE id = ${patientId}`
    expect(await consent.hasPatientConsent(clinicId, patientId, 'sms')).toBe(false)
  })

  test('a queued WhatsApp notification is skipped after consent is withdrawn', async () => {
    let nextToken = ''
    await consent.requestPatientConsent({ clinicId, patientId, userId, deliveryChannel: 'email', requestKey: crypto.randomUUID(), hostname: 'localhost:3000' },
      async (_channel, _patient, _clinic, link) => { nextToken = link.split('/').at(-1) || '' })
    await consent.submitConsentForm(nextToken, clinicId, { sms: false, whatsapp: true, email: true, assistant_call: false })
    expect(await consent.hasPatientConsent(clinicId, patientId, 'whatsapp')).toBe(true)
    await sql`UPDATE clinics SET whatsapp_enabled = true, evolution_instance_name = 'consent-test' WHERE id = ${clinicId}`
    const [conversation] = await sql`INSERT INTO whatsapp_conversations (clinic_id, patient_id, patient_phone, instance_name, remote_jid)
      VALUES (${clinicId}, ${patientId}, ${phone}, 'consent-test', ${`${phone}@s.whatsapp.net`}) RETURNING id`
    const [message] = await sql`INSERT INTO whatsapp_messages (conversation_id, external_id, direction, text, reply_text, status)
      VALUES (${conversation.id}, ${`reminder:${crypto.randomUUID()}:whatsapp`}, 'notification', 'test', 'test', 'reply_ready') RETURNING id`
    await sql`UPDATE patients SET whatsapp_opt_out = true WHERE id = ${patientId}`
    await consent.revokePatientConsent(clinicId, patientId, ['whatsapp'])
    const { processWhatsAppConversation } = await import('./whatsapp-conversation')
    await processWhatsAppConversation(conversation.id)
    expect((await sql`SELECT status FROM whatsapp_messages WHERE id = ${message.id}`)[0].status).toBe('skipped')
  })

  test('unknown consent blocks due reminders without claiming they were sent', async () => {
    const [newPatient] = await sql`INSERT INTO patients (clinic_id, name, phone) VALUES (${clinicId}, 'No consent', '05551234567') RETURNING id`
    const [treatment] = await sql`INSERT INTO treatment_plans (clinic_id, patient_id, procedure_name, cost, status, notify_patient, notification_type, next_notification_date)
      VALUES (${clinicId}, ${newPatient.id}, 'Test', 10, 'planned', true, 'sms', '2000-01-01') RETURNING id`
    const { processReminders } = await import('../cron/reminders')
    await processReminders()
    expect((await sql`SELECT notification_sent_at FROM treatment_plans WHERE id = ${treatment.id}`)[0].notification_sent_at).toBeNull()
    expect((await sql`SELECT count(*)::int AS n FROM patient_notification_deliveries WHERE treatment_id = ${treatment.id}`)[0].n).toBe(0)
  })

  test('failed delivery never creates an available form or consent', async () => {
    let failedToken = ''
    const key = crypto.randomUUID()
    await expect(consent.requestPatientConsent({ clinicId, patientId, userId, deliveryChannel: 'email', requestKey: key, hostname: 'localhost:3000' },
      async (_channel, _patient, _clinic, link) => { failedToken = link.split('/').at(-1) || ''; throw new Error('provider unavailable') }))
      .rejects.toThrow('gönderilemedi')
    expect((await sql`SELECT status FROM patient_consent_requests WHERE request_key = ${key}`)[0].status).toBe('failed')
    await expect(consent.getConsentForm(failedToken, clinicId)).rejects.toThrow('geçersiz')
  })

  test('changing the form text requires renewed consent', async () => {
    expect(await consent.hasPatientConsent(clinicId, patientId, 'email')).toBe(true)
    await consent.saveConsentSettings(clinicId, 'Güncellenmiş test bildirim tercihleri metni.')
    expect(await consent.hasPatientConsent(clinicId, patientId, 'email')).toBe(false)
  })
})
