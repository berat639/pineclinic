export const services = ['phone', 'sms', 'smtp'] as const
export type Service = typeof services[number]
export type Config = {
  username: string; password: string; numbers?: string[]; callerId?: string; transferNumber?: string
  host?: string; port?: number; secure?: 'tls' | 'ssl'; senderId?: string; fromName?: string; fromAddress?: string
}
export class SetupError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
export function serviceOf(value: string): Service {
  if (!services.includes(value as Service)) throw new SetupError('Geçersiz entegrasyon')
  return value as Service
}
export function phone(value: string): string {
  let digits = value.replace(/[^0-9]/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) digits = `90${digits}`
  if (!/^90[1-9]\d{9}$/.test(digits)) throw new SetupError('Geçerli bir Türkiye telefon numarası girin')
  return `+${digits}`
}
export function safeText(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\r\n\x00-\x1f]/.test(value)) throw new SetupError(`${label} geçersiz`)
  return value.trim()
}
export function validateConfig(service: Service, input: Record<string, unknown>, old?: Config): Config {
  const username = safeText(input.username, 'Kullanıcı adı')
  const password = input.password ? safeText(input.password, 'Parola', 512) : old?.password || ''
  if (!password) throw new SetupError('Parola zorunludur')
  if (service === 'phone') {
    if (!/^[a-zA-Z0-9_.@+-]+$/.test(username)) throw new SetupError('SIP kullanıcı adı geçersiz')
    if (!Array.isArray(input.numbers) || !input.numbers.length || input.numbers.length > 50) throw new SetupError('En az bir klinik numarası gerekli')
    const numbers = [...new Set(input.numbers.map(n => phone(String(n))))]
    const callerId = phone(String(input.callerId || ''))
    if (!numbers.includes(callerId)) throw new SetupError('Çıkış numarası klinik numaralarından biri olmalı')
    return { username, password, numbers, callerId, transferNumber: input.transferNumber ? phone(String(input.transferNumber)) : '' }
  }
  if (service === 'sms') return { username, password, senderId: safeText(input.senderId, 'Gönderici başlığı', 32) }
  const host = safeText(input.host, 'SMTP sunucusu', 253)
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw new SetupError('SMTP sunucusu geçersiz')
  const secure = input.secure === 'ssl' ? 'ssl' : 'tls'
  const port = Number(input.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535 || (port === 465 && secure !== 'ssl') || (secure === 'ssl' && port !== 465)) throw new SetupError('SMTP port/güvenlik eşleşmesi geçersiz')
  const fromAddress = safeText(input.fromAddress || username, 'Gönderici e-postası')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress)) throw new SetupError('Gönderici e-postası geçersiz')
  return { username, password, host, port, secure, fromAddress, fromName: safeText(input.fromName || 'Klinik', 'Gönderici adı') }
}
export function publicConfig(config: Config | null) {
  if (!config) return null
  const { password, ...fields } = config
  return { ...fields, hasPassword: Boolean(password) }
}
export function endpointId(clinicId: string) { return `clinic-${clinicId.replace(/-/g, '')}` }
