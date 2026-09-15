import { eq } from 'drizzle-orm'
import { db } from '../client'
import { clinics } from '../schema'
import { getSetting, setSetting } from './settings'
import { requireClinicId } from '../../tenancy/context'

export interface IntegrationsSettings {
  // VoIP
  voipProvider?: string | null
  voipLabel?: string | null
  voipBaseUrl?: string | null
  voipTrunkHost?: string | null

  // SMTP
  smtpHost?: string | null
  smtpPort?: string | null
  smtpUser?: string | null
  smtpPass?: string | null
  smtpSecure?: string | null

  // SMS (NetGSM)
  smsUsercode?: string | null
  smsPassword?: string | null
  smsSenderId?: string | null

}

const KEYS = {
  VOIP_PROVIDER: 'voip.provider',
  VOIP_LABEL: 'voip.label',
  VOIP_BASEURL: 'voip.base_url',
  VOIP_TRUNKHOST: 'voip.trunk_host',
  SMTP_HOST: 'smtp.host',
  SMTP_PORT: 'smtp.port',
  SMTP_USER: 'smtp.user',
  SMTP_PASS: 'smtp.pass',
  SMTP_SECURE: 'smtp.secure',
}

export async function getIntegrations(): Promise<IntegrationsSettings> {
  const clinicId = requireClinicId()
  const [
    voipProvider, voipLabel, voipBaseUrl, voipTrunkHost,
    smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure
  ] = await Promise.all([
    getSetting(KEYS.VOIP_PROVIDER),
    getSetting(KEYS.VOIP_LABEL),
    getSetting(KEYS.VOIP_BASEURL),
    getSetting(KEYS.VOIP_TRUNKHOST),
    getSetting(KEYS.SMTP_HOST),
    getSetting(KEYS.SMTP_PORT),
    getSetting(KEYS.SMTP_USER),
    getSetting(KEYS.SMTP_PASS),
    getSetting(KEYS.SMTP_SECURE)
  ])

  const clinicList = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1)
  const clinic = clinicList[0]

  return {
    voipProvider,
    voipLabel,
    voipBaseUrl,
    voipTrunkHost,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpSecure,
    smsUsercode: clinic?.netgsmUsercode || null,
    smsPassword: clinic?.netgsmPassword || null,
    smsSenderId: clinic?.smsSenderId || null,
  }
}

export async function updateIntegrations(patch: IntegrationsSettings): Promise<void> {
  const clinicId = requireClinicId()
  const updates: Promise<any>[] = []

  // VoIP updates
  if (patch.voipProvider !== undefined) updates.push(setSetting(KEYS.VOIP_PROVIDER, patch.voipProvider || ''))
  if (patch.voipLabel !== undefined) updates.push(setSetting(KEYS.VOIP_LABEL, patch.voipLabel || ''))
  if (patch.voipBaseUrl !== undefined) updates.push(setSetting(KEYS.VOIP_BASEURL, patch.voipBaseUrl || ''))
  if (patch.voipTrunkHost !== undefined) updates.push(setSetting(KEYS.VOIP_TRUNKHOST, patch.voipTrunkHost || ''))

  // SMTP updates
  if (patch.smtpHost !== undefined) updates.push(setSetting(KEYS.SMTP_HOST, patch.smtpHost || ''))
  if (patch.smtpPort !== undefined) updates.push(setSetting(KEYS.SMTP_PORT, patch.smtpPort || ''))
  if (patch.smtpUser !== undefined) updates.push(setSetting(KEYS.SMTP_USER, patch.smtpUser || ''))
  if (patch.smtpPass !== undefined) updates.push(setSetting(KEYS.SMTP_PASS, patch.smtpPass || ''))
  if (patch.smtpSecure !== undefined) updates.push(setSetting(KEYS.SMTP_SECURE, patch.smtpSecure || ''))

  await Promise.all(updates)

  // SMS credentials belong to the active clinic.
  const hasClinicUpdate = [
    patch.smsUsercode, patch.smsPassword, patch.smsSenderId,
  ].some(v => v !== undefined)

  if (hasClinicUpdate) {
    const clinicList = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1)
    if (clinicList.length > 0) {
      const clinic = clinicList[0]
      const toUpdate: any = {}

      if (patch.smsUsercode !== undefined) toUpdate.netgsmUsercode = patch.smsUsercode
      if (patch.smsPassword !== undefined) toUpdate.netgsmPassword = patch.smsPassword
      if (patch.smsSenderId !== undefined) toUpdate.smsSenderId = patch.smsSenderId

      await db.update(clinics).set(toUpdate).where(eq(clinics.id, clinic!.id))
    }
  }
}
