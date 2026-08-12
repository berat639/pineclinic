import { db } from '../db/client'
import { treatmentPlans, patients, clinics } from '../db/schema'
import { eq, and, lte } from 'drizzle-orm'
import { sendSMS } from '../services/netgsm'

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
    .innerJoin(clinics, eq(treatmentPlans.clinicId, clinics.id)) // innerJoin olduğu için sadece kliniği olanlar gelir
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

    // Geçerli bir NetGSM bilgisi var mı kontrol et
    if (!clinic.netgsmUsercode || !clinic.netgsmPassword || !clinic.smsSenderId) {
      console.log(`[CRON] ${clinic.name} kliniğinin SMS bilgileri eksik, atlanıyor.`)
      continue
    }

    if (treatment.notificationType === 'sms' || treatment.notificationType === 'both') {
      // TODO: İleride notification_templates tablosundan şablon çekilebilir
      const message = `Sayin ${patient.name}, ${treatment.procedureName} isleminiz icin kontrol vaktiniz gelmistir. Randevu almak icin lutfen klinigimizle iletisime geciniz. Iyi gunler dileriz.`
      
      console.log(`[SMS] Sending to ${patient.name} (${patient.phone}) via NetGSM...`)
      
      const res = await sendSMS({
        usercode: clinic.netgsmUsercode,
        password: clinic.netgsmPassword,
        senderId: clinic.smsSenderId,
        phone: patient.phone,
        message
      })

      if (res.success) {
        console.log(`[SMS] Success for ${patient.name}`)
        
        // Bir sonraki bildirim tarihini hesapla (periyodik ise)
        let nextDate: string | null = null
        let shouldNotifyAgain = false
        
        if (treatment.isPeriodic && treatment.periodDays) {
          const d = new Date()
          d.setDate(d.getDate() + treatment.periodDays)
          nextDate = d.toISOString().slice(0, 10)
          shouldNotifyAgain = true
        }

        // Tedavi planını güncelle
        await db.update(treatmentPlans)
          .set({ 
            notificationSentAt: new Date(),
            nextNotificationDate: nextDate,
            notifyPatient: shouldNotifyAgain 
          })
          .where(eq(treatmentPlans.id, treatment.id))
      } else {
        console.error(`[SMS] Failed for ${patient.name}:`, res.error)
      }
    }
  }
}
