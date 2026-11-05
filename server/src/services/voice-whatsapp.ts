import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { clinics } from '../db/schema'
import { credentialsFor } from '../db/repositories/whatsapp'
import { getSetting } from '../db/repositories/settings'
import { getActiveFlow } from '../db/repositories/flows'
import { evolutionRequest, normalizePhone, sendWhatsAppText } from '../integrations/whatsapp'
import { currentClinicId } from '../tenancy/context'

export async function sendLocationToCaller(phone: string): Promise<void> {
  const destination = normalizePhone(phone)
  const tenantClinicId = currentClinicId()

  const [
    settingUrl,
    settingMsg,
    settingAddress,
    settingTitle,
    settingLat,
    settingLng,
    activeFlow,
    clinic,
  ] = await Promise.all([
    getSetting('whatsapp.location_url'),
    getSetting('whatsapp.location_message'),
    getSetting('whatsapp.location_address'),
    getSetting('whatsapp.location_title'),
    getSetting('whatsapp.location_lat'),
    getSetting('whatsapp.location_lng'),
    getActiveFlow('inbound').catch(() => null),
    tenantClinicId
      ? db.select().from(clinics).where(eq(clinics.id, tenantClinicId)).limit(1).then(rows => rows[0])
      : db.select().from(clinics).where(and(eq(clinics.isActive, true), eq(clinics.whatsappEnabled, true))).limit(1).then(rows => rows[0]),
  ])

  const locNode = activeFlow?.nodes?.find(n => n.type === 'ACTION' && n.data?.action === 'send_wa_location')
  const nodeData = (locNode?.data ?? {}) as Record<string, unknown>

  const address = String(nodeData.locationAddress || settingAddress || '').trim()
  const title = String(nodeData.locationTitle || settingTitle || clinic?.name || 'Klinik Konumu').trim()
  const latRaw = String(nodeData.locationLat || settingLat || '').trim()
  const lngRaw = String(nodeData.locationLng || settingLng || '').trim()
  const locationMessage = String(nodeData.locationMessage || settingMsg || '📍 Kliniğimizin konumu ve açık adres bilgileri:').trim()

  let locationUrl = String(nodeData.locationUrl || settingUrl || '').trim()
  if (!locationUrl && latRaw && lngRaw) {
    locationUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${latRaw},${lngRaw}`)}`
  } else if (!locationUrl && address) {
    locationUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  }

  if (!locationUrl && !address) throw new Error('Klinik konumu tanımlı değil.')
  if (!clinic || !clinic.evolutionInstanceName) throw new Error('Aktif WhatsApp bağlantısı bulunamadı.')

  const creds = credentialsFor(clinic)
  const latNum = Number(latRaw)
  const lngNum = Number(lngRaw)
  if (Number.isFinite(latNum) && Number.isFinite(lngNum) && latRaw && lngRaw) {
    await evolutionRequest(creds, `/message/sendLocation/${encodeURIComponent(creds.instanceName)}`, {
      number: destination.replace(/^\+/, ''),
      name: title,
      address: address || title,
      latitude: latNum,
      longitude: lngNum,
    }).catch(() => null)
  }

  const parts = [locationMessage]
  if (title) parts.push(`🏥 ${title}`)
  if (address) parts.push(`📌 Açık Adres: ${address}`)
  if (locationUrl) parts.push(`🗺️ Harita: ${locationUrl}`)
  await sendWhatsAppText(destination, creds, parts.join('\n'))
}
