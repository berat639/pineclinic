/** Evolution API v2 (WHATSAPP-BAILEYS). Never log credentials or webhook bodies. */
import { timingSafeEqual } from 'node:crypto'

export interface WhatsAppCredentials { baseUrl: string; apiKey: string; instanceName: string }
export interface EvolutionQrResponse {
  base64?: unknown
  qrcode?: { base64?: unknown }
  instance?: { state?: unknown; status?: unknown }
  error?: unknown
}

export interface EvolutionQrResult {
  qrcode: string | null
  connectionState: string
}

const QR_DATA_URL_PREFIX = 'data:image/png;base64,'
const QR_DATA_URL_MAX_LENGTH = 200_000
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export class EvolutionError extends Error {
  constructor(public status: number, public uncertain = false) {
    super(uncertain ? 'Gönderim sonucu doğrulanamadı; kontrol gerekli.' : `Evolution API hatası (${status}).`)
  }
}
export function validateEvolutionUrl(value: string): string {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Geçerli bir HTTP/HTTPS Evolution sunucu adresi girin.')
  }
  return url.toString().replace(/\/+$/, '')
}
export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = `90${digits.slice(1)}`
  if (digits.length === 10 && digits.startsWith('5')) digits = `90${digits}`
  if (!/^[1-9]\d{9,14}$/.test(digits)) throw new Error('Geçerli bir uluslararası telefon numarası gerekli.')
  return `+${digits}`
}
export function detectOptOut(text: string): boolean {
  return ['dur', 'durdur', 'stop', 'unsubscribe', 'bildirim istemiyorum', 'mesaj istemiyorum', 'bildirimleri kapat']
    .includes(text.trim().toLocaleLowerCase('tr-TR').replace(/[.!]+$/, ''))
}
export function detectLocationRequest(text: string): boolean {
  const normalized = text.toLocaleLowerCase('tr-TR').replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim()
  return /\b(konum|adres|lokasyon)\b/.test(normalized)
    || /\b(nerede|neredesiniz|neredeyiz)\b/.test(normalized)
    || /\b(yol tarifi|nasıl gelebilirim|nasıl giderim)\b/.test(normalized)
}
export function verifyWebhookSecret(actual: string | null, expected: string): boolean {
  const a = Buffer.from(actual || '')
  const b = Buffer.from(expected)
  return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b)
}
export async function evolutionRequest<T>(creds: WhatsAppCredentials, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${validateEvolutionUrl(creds.baseUrl)}${path}`, {
      method, headers: { apikey: creds.apiKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000), redirect: 'error',
    })
  } catch { throw new EvolutionError(0, method !== 'GET') }
  if (!res.ok) throw new EvolutionError(res.status, res.status >= 500)
  try { return await res.json() as T } catch { throw new EvolutionError(res.status, method !== 'GET') }
}

/** Accept Evolution's documented data URL and compatible raw PNG Base64 responses. */
export function normalizeEvolutionQr(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const candidate = value.trim().replace(/\s/g, '')
  const encoded = candidate.startsWith(QR_DATA_URL_PREFIX) ? candidate.slice(QR_DATA_URL_PREFIX.length) : candidate
  if (!encoded || encoded.length + QR_DATA_URL_PREFIX.length >= QR_DATA_URL_MAX_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return null
  const png = Buffer.from(encoded, 'base64')
  if (png.length < PNG_SIGNATURE.length || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null
  return `${QR_DATA_URL_PREFIX}${encoded}`
}

export function evolutionConnectionState(result: EvolutionQrResponse, fallback = 'connecting'): string {
  const state = result.instance?.state ?? result.instance?.status
  return typeof state === 'string' && state.trim() ? state : fallback
}

/**
 * QR generation is asynchronous in Evolution/WhatsApp-Baileys. A newly created
 * or re-opened instance can therefore answer before its PNG has been encoded.
 */
export async function requestEvolutionQr(creds: WhatsAppCredentials, attempts = 4): Promise<EvolutionQrResult> {
  let connectionState = 'connecting'
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await evolutionRequest<EvolutionQrResponse>(creds, `/instance/connect/${encodeURIComponent(creds.instanceName)}`)
    if (result.error === true) {
      if (attempt === attempts - 1) throw new Error('Evolution instance bağlantısı henüz hazır değil. Birkaç saniye sonra yeniden deneyin.')
    } else {
      connectionState = evolutionConnectionState(result)
      const qrcode = normalizeEvolutionQr(result.base64) || normalizeEvolutionQr(result.qrcode?.base64)
      if (qrcode || connectionState === 'open') return { qrcode, connectionState }
    }
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 800))
  }
  return { qrcode: null, connectionState }
}

export async function sendWhatsAppText(to: string, creds: WhatsAppCredentials, text: string): Promise<{ messageId: string }> {
  const number = /^(\d+)(@s\.whatsapp\.net|@lid)$/.test(to) ? to : normalizePhone(to).slice(1)
  const data = await evolutionRequest<{ key?: { id?: string } }>(creds,
    `/message/sendText/${encodeURIComponent(creds.instanceName)}`, { number, text, linkPreview: false })
  if (!data.key?.id) throw new EvolutionError(200, true)
  return { messageId: data.key.id }
}
export interface IncomingWhatsAppMessage {
  externalId: string; remoteJid: string; phone: string | null; text: string; fromMe: boolean; timestamp: number
}
/** Only recent direct messages are eligible. LIDs are never interpreted as telephone numbers. */
export function parseEvolutionMessages(payload: unknown, now = Date.now()): IncomingWhatsAppMessage[] {
  const p = payload as any
  if (String(p?.event).replace(/[.-]/g, '_').toUpperCase() !== 'MESSAGES_UPSERT') return []
  const entries = Array.isArray(p.data) ? p.data : [p.data]
  return entries.flatMap((data: any) => {
    const key = data?.key
    const remoteJid = key?.remoteJid
    if (typeof key?.id !== 'string' || typeof remoteJid !== 'string' || !/^\d+(@s\.whatsapp\.net|@lid)$/.test(remoteJid)) return []
    const timestamp = Number(data.messageTimestamp?.low ?? data.messageTimestamp) * 1000
    if (!Number.isFinite(timestamp) || timestamp < now - 10 * 60_000 || timestamp > now + 60_000) return []
    let message = data.message
    for (let i = 0; i < 3; i++) {
      const wrapped = message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message?.viewOnceMessageV2?.message
      if (!wrapped) break
      message = wrapped
    }
    const text = message?.conversation || message?.extendedTextMessage?.text || message?.buttonsResponseMessage?.selectedDisplayText || message?.listResponseMessage?.title
    if (typeof text !== 'string' || !text.trim() || text.length > 12_000) return []
    const phoneJid = [remoteJid, key.remoteJidAlt, data.senderPn].find(j => typeof j === 'string' && /^\d+@s\.whatsapp\.net$/.test(j))
    let phone: string | null = null
    try { if (phoneJid) phone = normalizePhone(phoneJid.split('@')[0]) } catch { /* unresolved sender identity */ }
    return [{ externalId: key.id, remoteJid: phone ? `${phone.slice(1)}@s.whatsapp.net` : remoteJid, phone, text: text.trim(), fromMe: key.fromMe === true, timestamp }]
  })
}
