import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { clinics } from '../db/schema'
import { credentialsFor } from '../db/repositories/whatsapp'
import { getSetting } from '../db/repositories/settings'
import { normalizePhone, sendWhatsAppText } from '../integrations/whatsapp'

export async function sendLocationToCaller(phone: string): Promise<void> {
  const destination = normalizePhone(phone)
  const [locationUrl, locationMessage, clinic] = await Promise.all([
    getSetting('whatsapp.location_url'),
    getSetting('whatsapp.location_message'),
    db.select().from(clinics).where(and(eq(clinics.isActive, true), eq(clinics.whatsappEnabled, true))).limit(1).then(rows => rows[0]),
  ])
  if (!locationUrl) throw new Error('Klinik konumu tanımlı değil.')
  if (!clinic) throw new Error('Aktif WhatsApp bağlantısı bulunamadı.')
  const message = `${locationMessage || 'Kliniğimizin konumuna aşağıdaki bağlantıdan ulaşabilirsiniz:'}\n${locationUrl}`
  await sendWhatsAppText(destination, credentialsFor(clinic), message)
}
