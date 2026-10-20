import { db } from '../db/client'
import { treatmentPlans, patients, clinics, notificationTemplates } from '../db/schema'
import { eq, and, lte } from 'drizzle-orm'
import { sendSMS } from '../services/netgsm'
import { activeConfig } from '../integrations/managed/store'
import { enqueueWhatsAppNotification } from '../db/repositories/whatsapp'

export function startReminderCron() {
  console.log('[CRON] Starting reminder cron job...')
  // Saatte bir çalışır (3600000 ms)
  setInterval(async () => {
    try {
      await processReminders()
    } catch (e) {
      console.error('[CRON Error] processReminders:', e)
    }
  }, 1000 * 60 * 60)

  // Başlangıçta 5 saniye sonra ilk taramayı yap
  setTimeout(() => { void processReminders().catch(() => console.error('[CRON] İlk tarama tamamlanamadı.')) }, 5000)
}

async function processReminders() {
  const today = new Date().toISOString().slice(0, 10)
  
  // Bildirim tarihi gelmiş veya geçmiş olanları bul
  const dueTreatments = await db
    .select({
      treatment: treatmentPlans,
      patient: patients,
      clinic: clinics
    })
    .from(treatmentPlans)
    .innerJoin(patients, eq(treatmentPlans.patientId, patients.id))
    .innerJoin(clinics, eq(treatmentPlans.clinicId, clinics.id))
    .where(
      and(
        eq(treatmentPlans.notifyPatient, true),
        lte(treatmentPlans.nextNotificationDate, today)
      )
    )

  if (dueTreatments.length > 0) {
    console.log(`[CRON] ${dueTreatments.length} adet bekleyen tedavi bildirimi bulundu.`)
  }

  for (const { treatment, patient, clinic } of dueTreatments) {
    if (!patient.phone) {
      console.log(`[CRON] ${patient.name} için telefon numarası yok, atlanıyor.`)
      continue
    }

    const notifType = treatment.notificationType ?? 'sms'

    // ── SMS Gönderimi ──────────────────────────────────────────────────────────
    const sendSms = notifType === 'sms' || notifType === 'both' || notifType === 'whatsapp_sms'

    if (sendSms) {
      const managedSms = await activeConfig(clinic.id, 'sms')
      const smsUsercode = managedSms?.username || clinic.netgsmUsercode
      const smsPassword = managedSms?.password || clinic.netgsmPassword
      const smsSenderId = managedSms?.senderId || clinic.smsSenderId
      if (!smsUsercode || !smsPassword || !smsSenderId) {
        console.log(`[CRON] ${clinic.name} kliniğinin SMS bilgileri eksik, SMS atlanıyor.`)
      } else {
        // Şablon varsa DB'den çek, yoksa default mesaj kullan
        const tplRows = await db.select()
          .from(notificationTemplates)
          .where(and(
            eq(notificationTemplates.clinicId, clinic.id),
            eq(notificationTemplates.type, 'sms'),
            eq(notificationTemplates.name, 'periodic_reminder')
          ))
          .limit(1)

        const optOutLink = `\n\nİletişim tercihleri: https://pinecllinic.thinpine.com/optout?p=${patient.id}`
        const message = (tplRows[0]?.content
          ?? `Sayin ${patient.name}, ${treatment.procedureName} isleminiz icin kontrol vaktiniz gelmistir. Randevu almak icin lutfen klinigimizle iletisime geciniz. Iyi gunler dileriz.`) + optOutLink

        console.log(`[SMS] Sending to ${patient.name} (${patient.phone}) via NetGSM...`)
        const res = await sendSMS({
          usercode: smsUsercode,
          password: smsPassword,
          senderId: smsSenderId,
          phone: patient.phone,
          message
        })

        if (!res.success) {
          console.error(`[SMS] Failed for ${patient.name}:`, res.error)
        } else {
          console.log(`[SMS] Success for ${patient.name}`)
        }
      }
    }

    // ── WhatsApp Gönderimi ─────────────────────────────────────────────────────
    const sendWa = notifType === 'whatsapp' || notifType === 'whatsapp_sms' || notifType === 'both'

    if (sendWa && !patient.whatsappOptOut) {
      if (!clinic.whatsappEnabled || !clinic.evolutionApiKey || !clinic.evolutionInstanceName || !clinic.evolutionBaseUrl) {
        console.error(`[WA CRON] ${clinic.name} kliniğinin Evolution bağlantısı kapalı veya eksik; WhatsApp bildirimi atlandı.`)
      } else {
        const [template] = await db.select().from(notificationTemplates).where(and(
          eq(notificationTemplates.clinicId, clinic.id), eq(notificationTemplates.type, 'whatsapp'), eq(notificationTemplates.name, 'periodic_reminder'),
        )).limit(1)
        const content = (template?.content || `Sayın {{hasta_adi}}, {{islem}} işleminiz için kontrol vaktiniz gelmiştir. Randevu almak için bize yazabilirsiniz.`)
          .replace(/\{\{hasta_adi\}\}/g, patient.name).replace(/\{\{islem\}\}/g, treatment.procedureName)
        const message = `${content}\n\nWhatsApp bildirimlerini kapatmak için DUR yazabilirsiniz.`
        try {
          await enqueueWhatsAppNotification(clinic, patient.phone, message, `reminder:${treatment.id}:${treatment.nextNotificationDate}`)
        } catch {
          console.error('[WA CRON] Bildirim kuyruğa alınamadı.')
        }
      }
    }

    // ── Sonraki Bildirim Tarihini Güncelle ─────────────────────────────────────
    let nextDate: string | null = null
    let shouldNotifyAgain = false

    if (treatment.isPeriodic && treatment.periodDays) {
      const d = new Date()
      d.setDate(d.getDate() + treatment.periodDays)
      nextDate = d.toISOString().slice(0, 10)
      shouldNotifyAgain = true
    }

    await db.update(treatmentPlans)
      .set({
        notificationSentAt: new Date(),
        nextNotificationDate: nextDate,
        notifyPatient: shouldNotifyAgain
      })
      .where(eq(treatmentPlans.id, treatment.id))
  }
}
