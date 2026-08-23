import { db } from '../db/client'
import { treatmentPlans, patients, clinics, notificationTemplates } from '../db/schema'
import { eq, and, lte } from 'drizzle-orm'
import { sendSMS } from '../services/netgsm'
import { sendWhatsAppTemplate, sendWhatsAppText, type WhatsAppCredentials } from '../integrations/whatsapp'

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
  setTimeout(() => processReminders(), 5000)
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
      if (!clinic.netgsmUsercode || !clinic.netgsmPassword || !clinic.smsSenderId) {
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
          usercode: clinic.netgsmUsercode,
          password: clinic.netgsmPassword,
          senderId: clinic.smsSenderId,
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
    const sendWa = notifType === 'whatsapp' || notifType === 'whatsapp_sms'

    if (sendWa) {
      if (patient.whatsappOptOut) {
        console.log(`[WA CRON] ${patient.name} WA opt-out, atlanıyor.`)
      } else if (!clinic.whatsappEnabled || !clinic.whatsappPhoneNumberId || !clinic.whatsappAccessToken) {
        console.log(`[CRON] ${clinic.name} kliniğinin WhatsApp bilgileri eksik, WA atlanıyor.`)
      } else {
        const creds: WhatsAppCredentials = {
          phoneNumberId: clinic.whatsappPhoneNumberId,
          accessToken: clinic.whatsappAccessToken,
        }

        // WA şablonunu DB'den bul
        const waTplRows = await db.select()
          .from(notificationTemplates)
          .where(and(
            eq(notificationTemplates.clinicId, clinic.id),
            eq(notificationTemplates.type, 'whatsapp'),
            eq(notificationTemplates.name, 'periodic_reminder')
          ))
          .limit(1)

        const waTpl = waTplRows[0]

        let waResult
        if (waTpl?.whatsappTemplateName && waTpl.whatsappTemplateStatus === 'APPROVED') {
          // Meta-approved template: build components with patient name and procedure
          const components = [{
            type: 'body' as const,
            parameters: [
              { type: 'text' as const, text: patient.name },
              { type: 'text' as const, text: treatment.procedureName },
            ]
          }]
          waResult = await sendWhatsAppTemplate(patient.phone, creds, waTpl.whatsappTemplateName, 'tr', components)
        } else {
          // Fallback: free text (only works within 24h window — may fail, that's ok)
          const optOutLink = `\n\nİletişim tercihleri: https://pinecllinic.thinpine.com/optout?p=${patient.id}`
          const fallbackText = (waTpl?.content
            ?? `Sayın ${patient.name}, ${treatment.procedureName} işleminiz için kontrol vaktiniz gelmiştir. Randevu almak için lütfen bize yazın.`) + optOutLink
          waResult = await sendWhatsAppText(patient.phone, creds, fallbackText)
        }

        if (!waResult.success) {
          if (waResult.error === 'OPT_OUT') {
            await db.update(patients).set({ whatsappOptOut: true }).where(eq(patients.id, patient.id))
            console.log(`[WA CRON] Opt-out detected for ${patient.name}`)
          } else {
            console.error(`[WA CRON] Failed for ${patient.name}:`, waResult.error)
          }
        } else {
          console.log(`[WA CRON] Success for ${patient.name}`)
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
