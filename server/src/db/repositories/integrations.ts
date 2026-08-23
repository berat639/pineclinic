import { eq } from 'drizzle-orm'
import { db } from '../client'
import { clinics } from '../schema'
import { getSetting, setSetting } from './settings'

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

  // WhatsApp Business API
  whatsappPhoneNumberId?: string | null
  whatsappAccessToken?: string | null
  whatsappVerifyToken?: string | null
  whatsappEnabled?: boolean | null
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

  // Get clinic settings (assume the first clinic for now)
  const clinicList = await db.select().from(clinics).limit(1)
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
    // WhatsApp
    whatsappPhoneNumberId: clinic?.whatsappPhoneNumberId || null,
    whatsappAccessToken: clinic?.whatsappAccessToken || null,
    whatsappVerifyToken: clinic?.whatsappVerifyToken || null,
    whatsappEnabled: clinic?.whatsappEnabled ?? false,
  }
}

export async function updateIntegrations(patch: IntegrationsSettings): Promise<void> {
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

  // SMS + WhatsApp updates (update the first clinic if exists)
  const hasClinicUpdate = [
    patch.smsUsercode, patch.smsPassword, patch.smsSenderId,
    patch.whatsappPhoneNumberId, patch.whatsappAccessToken,
    patch.whatsappVerifyToken, patch.whatsappEnabled,
  ].some(v => v !== undefined)

  if (hasClinicUpdate) {
    const clinicList = await db.select().from(clinics).limit(1)
    if (clinicList.length > 0) {
      const clinic = clinicList[0]
      const toUpdate: any = {}

      if (patch.smsUsercode !== undefined) toUpdate.netgsmUsercode = patch.smsUsercode
      if (patch.smsPassword !== undefined) toUpdate.netgsmPassword = patch.smsPassword
      if (patch.smsSenderId !== undefined) toUpdate.smsSenderId = patch.smsSenderId
      // WhatsApp
      if (patch.whatsappPhoneNumberId !== undefined) toUpdate.whatsappPhoneNumberId = patch.whatsappPhoneNumberId
      if (patch.whatsappAccessToken !== undefined) toUpdate.whatsappAccessToken = patch.whatsappAccessToken
      if (patch.whatsappVerifyToken !== undefined) toUpdate.whatsappVerifyToken = patch.whatsappVerifyToken
      if (patch.whatsappEnabled !== undefined) toUpdate.whatsappEnabled = patch.whatsappEnabled

      await db.update(clinics).set(toUpdate).where(eq(clinics.id, clinic!.id))
    }
  }
}
