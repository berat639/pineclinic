import { db } from '../db/client'
import { treatmentPlans, patients, clinics, notificationTemplates } from '../db/schema'
import { eq, and, lte, ne, sql } from 'drizzle-orm'
import { ensureTreatmentPlanningSchema } from '../db/treatment-planning-schema'
import { sendSMS } from '../services/netgsm'
import { sendEmail } from '../services/email'
import { hasPatientConsent } from '../services/patient-consent'
import { notificationChannels } from '../../../client/lib/notification-channels'
import { activeConfig } from '../integrations/managed/store'
import { enqueueWhatsAppNotification } from '../db/repositories/whatsapp'
import { runWithTenantContext } from '../tenancy/context'

export function startReminderCron() {
  console.log('[CRON] Starting reminder cron job...')
  setInterval(() => { void processReminders().catch(() => console.error('[CRON] Hatırlatma taraması tamamlanamadı.')) }, 60 * 60 * 1000)
  setTimeout(() => { void processReminders().catch(() => console.error('[CRON] İlk tarama tamamlanamadı.')) }, 5000)
}

class DeliveryConfigurationError extends Error {}

/** Every channel has a separate persistent delivery record. A crash after an
 * external action is treated as uncertain and is never silently retried. */
export async function processReminders() {
  await ensureTreatmentPlanningSchema()
  const today = new Date().toISOString().slice(0, 10)
  await db.execute(sql`UPDATE patient_notification_deliveries SET status = 'uncertain', updated_at = NOW()
    WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes'`)
  const due = await db.select({ treatment: treatmentPlans, patient: patients, clinic: clinics })
    .from(treatmentPlans)
    .innerJoin(patients, and(eq(treatmentPlans.patientId, patients.id), eq(treatmentPlans.clinicId, patients.clinicId)))
    .innerJoin(clinics, eq(treatmentPlans.clinicId, clinics.id))
    .where(and(eq(treatmentPlans.notifyPatient, true), ne(treatmentPlans.status, 'cancelled'), lte(treatmentPlans.nextNotificationDate, today)))

  for (const { treatment, patient, clinic } of due) {
    const dueDate = treatment.nextNotificationDate
    if (!dueDate) continue
    const channels = notificationChannels(treatment.notificationType)
    if (!channels.length) continue
    for (const channel of channels) {
      if (!await hasPatientConsent(clinic.id, patient.id, channel)) continue
      if ((channel === 'email' && !patient.email) || (channel !== 'email' && !patient.phone)) continue
      const externalKey = `reminder:${treatment.id}:${dueDate}:${channel}`
      const claimed = await db.execute(sql`INSERT INTO patient_notification_deliveries
        (clinic_id, patient_id, treatment_id, due_date, channel, status, external_key)
        VALUES (${clinic.id}, ${patient.id}, ${treatment.id}, ${dueDate}, ${channel}, 'processing', ${externalKey})
        ON CONFLICT (treatment_id, due_date, channel) DO UPDATE SET status = 'processing', updated_at = NOW()
        WHERE patient_notification_deliveries.status = 'blocked' RETURNING id`)
      if (!claimed.length) continue
      let status = 'failed'
      try {
        // The patient may have withdrawn consent while the job was being claimed.
        if (!await hasPatientConsent(clinic.id, patient.id, channel)) {
          status = 'blocked'
        } else {
          const [template] = await db.select().from(notificationTemplates).where(and(eq(notificationTemplates.clinicId, clinic.id),
            eq(notificationTemplates.type, channel), eq(notificationTemplates.name, 'periodic_reminder'))).limit(1)
          const message = (template?.content || 'Kontrol zamanınız geldi. Randevu için kliniğinizle iletişime geçebilirsiniz.')
            .replace(/\{\{hasta_adi\}\}/g, patient.name).replace(/\{\{islem\}\}/g, treatment.procedureName)
          if (channel === 'sms') {
            const config = await activeConfig(clinic.id, 'sms')
            const usercode = config?.username || clinic.netgsmUsercode
            const password = config?.password || clinic.netgsmPassword
            const senderId = config?.senderId || clinic.smsSenderId
            if (!usercode || !password || !senderId || !patient.phone) throw new DeliveryConfigurationError('SMS yapılandırması eksik')
            if (!await hasPatientConsent(clinic.id, patient.id, channel)) status = 'blocked'
            else {
              const result = await sendSMS({ usercode, password, senderId, phone: patient.phone, message })
              status = result.success ? 'sent' : result.error ? 'uncertain' : 'failed'
            }
          } else if (channel === 'email') {
            if (!patient.email) throw new Error('E-posta adresi eksik')
            const config = await activeConfig(clinic.id, 'smtp')
            if (!config?.host || !config.port || !config.username || !config.password) throw new DeliveryConfigurationError('SMTP yapılandırması eksik')
            if (!await hasPatientConsent(clinic.id, patient.id, channel)) status = 'blocked'
            else {
              await runWithTenantContext({ clinicId: clinic.id, hostname: 'reminder' }, () => sendEmail({ to: patient.email!, subject: 'Kontrol hatırlatması', text: message }))
              status = 'sent'
            }
          } else if (channel === 'assistant_call') {
            if (!patient.phone || process.env.TELEPHONY_ENABLED === '0') throw new DeliveryConfigurationError('Telefon bağlantısı kapalı')
            const config = await activeConfig(clinic.id, 'phone')
            if (!config?.callerId) throw new DeliveryConfigurationError('Telefon yapılandırması eksik')
            const { patientPhoneMatches } = await import('../db/repositories/whatsapp')
            const matches = await db.select({ id: patients.id }).from(patients).where(and(eq(patients.clinicId, clinic.id), patientPhoneMatches(patient.phone))).limit(2)
            if (matches.length !== 1 || matches[0].id !== patient.id) throw new DeliveryConfigurationError('Telefon hasta eşleşmesi belirsiz')
            const { initiateOutboundCall } = await import('../services/asterisk-ami')
            if (!await hasPatientConsent(clinic.id, patient.id, channel)) status = 'blocked'
            else {
              const result = await initiateOutboundCall(patient.phone, clinic.id)
              // AMI acceptance means initiation, never a completed patient call.
              status = result.success ? 'initiated' : 'uncertain'
            }
          } else {
            if (!clinic.whatsappEnabled || !patient.phone) throw new DeliveryConfigurationError('WhatsApp bağlantısı kapalı')
            if (!await hasPatientConsent(clinic.id, patient.id, channel)) status = 'blocked'
            else {
              await enqueueWhatsAppNotification(clinic, patient.phone, `${message}\n\nWhatsApp bildirimlerini kapatmak için DUR yazabilirsiniz.`, externalKey, patient.id)
              status = 'queued'
            }
          }
        }
      } catch (error) {
        // Email delivery errors can occur after the SMTP server accepted a message.
        status = error instanceof DeliveryConfigurationError || channel === 'whatsapp' ? 'blocked' : channel === 'email' || channel === 'assistant_call' ? 'uncertain' : 'failed'
      }
      // The worker can finish a WhatsApp message before this update. Never replace
      // its 'sent' result with the earlier 'queued' state.
      await db.execute(sql`UPDATE patient_notification_deliveries SET status = ${status}, updated_at = NOW()
        WHERE clinic_id = ${clinic.id} AND external_key = ${externalKey} AND status = 'processing'`)
    }
    const deliveries = await db.execute(sql`SELECT channel, status FROM patient_notification_deliveries
      WHERE treatment_id = ${treatment.id} AND due_date = ${dueDate}`)
    if (!channels.every(channel => deliveries.some(row => row.channel === channel && (row.status === 'sent' || (channel === 'assistant_call' && row.status === 'initiated'))))) continue
    let nextDate: string | null = null
    if (treatment.isPeriodic && treatment.periodDays) {
      const date = new Date(); date.setDate(date.getDate() + treatment.periodDays); nextDate = date.toISOString().slice(0, 10)
    }
    await db.update(treatmentPlans).set({ notificationSentAt: new Date(), nextNotificationDate: nextDate, notifyPatient: !!nextDate })
      .where(and(eq(treatmentPlans.id, treatment.id), eq(treatmentPlans.nextNotificationDate, dueDate)))
  }
}
