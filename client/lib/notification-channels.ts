export const NOTIFICATION_CHANNELS = ['sms', 'whatsapp', 'email', 'assistant_call'] as const
export type NotificationChannel = typeof NOTIFICATION_CHANNELS[number]
export const notificationLabels: Record<NotificationChannel, string> = {
  sms: 'SMS', whatsapp: 'WhatsApp', email: 'E-posta', assistant_call: 'Asistan ile arama',
}
/** Legacy values remain readable. Unknown channels never fall back to SMS. */
export function notificationChannels(value: string | null | undefined): NotificationChannel[] {
  if (value === 'both') return ['sms', 'whatsapp', 'email']
  if (value === 'whatsapp_sms') return ['sms', 'whatsapp']
  return NOTIFICATION_CHANNELS.filter(channel => (value || '').split(',').includes(channel))
}
export function consentAllows(channel: NotificationChannel, preferences: { channel: string; status: string; textVersion: string }[], version: string | null | undefined, patient: { smsOptOut?: boolean; whatsappOptOut?: boolean; emailOptOut?: boolean }) {
  if (!version) return false
  if ((channel === 'sms' && patient.smsOptOut) || (channel === 'whatsapp' && patient.whatsappOptOut) || (channel === 'email' && patient.emailOptOut)) return false
  return preferences.some(item => item.channel === channel && item.status === 'granted' && item.textVersion === version)
}
