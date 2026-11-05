/** Evolution API v2 (WHATSAPP-BAILEYS) & n8n Meta WhatsApp Cloud API bridge. Never log credentials or webhook bodies. */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type WhatsAppProviderType = 'evolution' | 'n8n_meta'

export interface WhatsAppTemplateDefinition {
  name: string
  language: string
  category?: string
  bodyPreview?: string
  paramKeys?: string[]
}

export interface WhatsAppSendResult {
  messageId: string
}

export interface WhatsAppTransport {
  readonly provider: WhatsAppProviderType
  sendText(to: string, text: string): Promise<WhatsAppSendResult>
  sendTemplate(to: string, template: { name: string; language: string; components?: unknown[] }): Promise<WhatsAppSendResult>
  sendLocation?(to: string, location: { latitude: number; longitude: number; name?: string; address?: string }): Promise<WhatsAppSendResult>
}

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
  if (digits.length === 10 && /^[1-9]/.test(digits)) digits = `90${digits}`
  if (!/^[1-9]\d{9,14}$/.test(digits)) throw new Error('Geçerli bir uluslararası telefon numarası gerekli.')
  return `+${digits}`
}
export function last10Digits(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = last10Digits(a)
  const db = last10Digits(b)
  if (!da || !db) return false
  return da === db
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
export async function requestEvolutionQr(creds: WhatsAppCredentials, attempts = 5): Promise<EvolutionQrResult> {
  let connectionState = 'connecting'
  for (let attempt = 0; attempt < attempts; attempt++) {
    let result: EvolutionQrResponse
    try {
      result = await evolutionRequest<EvolutionQrResponse>(creds, `/instance/connect/${encodeURIComponent(creds.instanceName)}`)
    } catch (err) {
      if (err instanceof EvolutionError && [400, 404].includes(err.status)) {
        try {
          result = await evolutionRequest<EvolutionQrResponse>(creds, '/instance/create', {
            instanceName: creds.instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          })
        } catch (createErr) {
          if (createErr instanceof EvolutionError && [403, 409].includes(createErr.status)) {
            result = await evolutionRequest<EvolutionQrResponse>(creds, `/instance/connect/${encodeURIComponent(creds.instanceName)}`)
          } else {
            throw createErr
          }
        }
      } else {
        throw err
      }
    }
    if (result.error === true) {
      if (attempt === attempts - 1) throw new Error('Evolution instance bağlantısı henüz hazır değil. Birkaç saniye sonra yeniden deneyin.')
    } else {
      connectionState = evolutionConnectionState(result)
      const rAny = result as any
      const qrcode =
        normalizeEvolutionQr(result.base64) ||
        normalizeEvolutionQr(result.qrcode?.base64) ||
        normalizeEvolutionQr(rAny?.data?.base64) ||
        normalizeEvolutionQr(rAny?.data?.qrcode?.base64)
      if (qrcode || connectionState === 'open') return { qrcode, connectionState }
      if (attempt === 0 && connectionState === 'close') {
        await evolutionRequest(creds, `/instance/logout/${encodeURIComponent(creds.instanceName)}`, undefined, 'DELETE').catch(() => {})
      }
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
  const rawData = Array.isArray(p.data?.messages) ? p.data.messages : p.data
  const entries = Array.isArray(rawData) ? rawData : [rawData]
  return entries.flatMap((data: any) => {
    const key = data?.key
    const remoteJid = typeof key?.remoteJid === 'string' ? key.remoteJid.replace(/:\d+@/, '@') : key?.remoteJid
    if (typeof key?.id !== 'string' || typeof remoteJid !== 'string' || !/^\d+(@s\.whatsapp\.net|@lid)$/.test(remoteJid)) return []
    const rawTs = Number(data.messageTimestamp?.low ?? data.messageTimestamp)
    const timestamp = Number.isFinite(rawTs) ? (rawTs > 1e12 ? rawTs : rawTs * 1000) : NaN
    if (!Number.isFinite(timestamp) || timestamp < now - 10 * 60_000 || timestamp > now + 60_000) return []
    let message = data.message
    for (let i = 0; i < 3; i++) {
      const wrapped = message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message?.viewOnceMessageV2?.message
      if (!wrapped) break
      message = wrapped
    }
    const text = message?.conversation || message?.extendedTextMessage?.text || message?.buttonsResponseMessage?.selectedDisplayText || message?.listResponseMessage?.title
    if (typeof text !== 'string' || !text.trim() || text.length > 12_000) return []
    const phoneJid = [remoteJid, key.remoteJidAlt, data.senderPn, key.senderPn]
      .map(j => (typeof j === 'string' ? j.replace(/:\d+@/, '@') : j))
      .find(j => typeof j === 'string' && /^\d+@s\.whatsapp\.net$/.test(j))
    let phone: string | null = null
    try { if (phoneJid) phone = normalizePhone(phoneJid.split('@')[0].split(':')[0]) } catch { /* unresolved sender identity */ }
    return [{ externalId: key.id, remoteJid: phone ? `${phone.slice(1)}@s.whatsapp.net` : remoteJid, phone, text: text.trim(), fromMe: key.fromMe === true, timestamp }]
  })
}

export function validateN8nWebhookUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('Geçerli bir HTTP/HTTPS n8n webhook adresi girin.')
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Geçerli bir HTTP/HTTPS n8n webhook adresi girin.')
  }
  return url.toString()
}

export function signN8nPayload(rawBody: string, secret: string, timestampSec = Math.floor(Date.now() / 1000)): { timestamp: string; signature: string } {
  const ts = String(timestampSec)
  const digest = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')
  return { timestamp: ts, signature: `sha256=${digest}` }
}

/**
 * Verifies X-VoiceAI-Signature: sha256=HMAC_SHA256(secret, timestamp + "." + rawBody)
 * with ±300s replay protection on X-VoiceAI-Timestamp.
 */
export function verifyN8nSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!secret || secret.length < 32 || !timestampHeader || !signatureHeader) return false
  const tsNum = Number(timestampHeader.trim())
  if (!Number.isFinite(tsNum)) return false
  // Accept seconds or milliseconds in header, normalize to seconds for comparison
  const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000
  if (Math.abs(nowMs - tsMs) > 300_000) return false

  const expectedSig = `sha256=${createHmac('sha256', secret).update(`${timestampHeader.trim()}.${rawBody}`).digest('hex')}`
  const a = Buffer.from(signatureHeader.trim())
  const b = Buffer.from(expectedSig)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Parses inbound WhatsApp messages from n8n bridge (either normalized VoiceAI format
 * or raw Meta WhatsApp Cloud API webhook payload).
 */
export function parseN8nInboundMessages(payload: unknown, now = Date.now()): IncomingWhatsAppMessage[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as any

  const rawItems: any[] = []
  if (Array.isArray(p.entry)) {
    for (const entry of p.entry) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const value = change?.value
        const msgs = Array.isArray(value?.messages) ? value.messages : []
        for (const msg of msgs) {
          rawItems.push({
            externalId: msg?.id,
            from: msg?.from,
            timestamp: msg?.timestamp,
            type: msg?.type,
            text:
              msg?.text?.body ??
              msg?.button?.text ??
              msg?.interactive?.button_reply?.title ??
              msg?.interactive?.list_reply?.title,
          })
        }
      }
    }
  } else if (Array.isArray(p.messages)) {
    rawItems.push(...p.messages)
  } else if (Array.isArray(p)) {
    rawItems.push(...p)
  } else {
    rawItems.push(p)
  }

  return rawItems.flatMap((item: any): IncomingWhatsAppMessage[] => {
    const rawFrom =
      typeof item?.from === 'string'
        ? item.from.trim()
        : typeof item?.phone === 'string'
          ? item.phone.trim()
          : typeof item?.sender === 'string'
            ? item.sender.trim()
            : ''
    if (!rawFrom) return []

    let phone: string
    try {
      phone = normalizePhone(rawFrom)
    } catch {
      return []
    }

    const rawText =
      typeof item?.text === 'string'
        ? item.text
        : typeof item?.text?.body === 'string'
          ? item.text.body
          : typeof item?.message === 'string'
            ? item.message
            : typeof item?.body === 'string'
              ? item.body
              : typeof item?.interactiveReply?.title === 'string'
                ? item.interactiveReply.title
                : typeof item?.interactive?.button_reply?.title === 'string'
                  ? item.interactive.button_reply.title
                  : typeof item?.interactive?.list_reply?.title === 'string'
                    ? item.interactive.list_reply.title
                    : ''

    if (typeof rawText !== 'string' || !rawText.trim() || rawText.length > 12_000) return []

    let tsMs = now
    if (item?.timestamp !== undefined && item?.timestamp !== null && item?.timestamp !== '') {
      const n = Number(item.timestamp)
      if (Number.isFinite(n) && n > 0) {
        tsMs = n > 1e12 ? n : n * 1000
      }
    }
    if (tsMs < now - 10 * 60_000 || tsMs > now + 60_000) return []

    const externalId =
      (typeof item?.externalId === 'string' && item.externalId.trim()) ||
      (typeof item?.messageId === 'string' && item.messageId.trim()) ||
      (typeof item?.id === 'string' && item.id.trim()) ||
      `n8n_${tsMs}_${phone.slice(1)}`

    return [{
      externalId,
      remoteJid: `${phone.slice(1)}@s.whatsapp.net`,
      phone,
      text: rawText.trim(),
      fromMe: item?.fromMe === true,
      timestamp: tsMs,
    }]
  })
}

export interface N8nStatusUpdate {
  providerMessageId: string
  status: string
}

export function parseN8nStatusUpdates(payload: unknown): N8nStatusUpdate[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as any
  const items: any[] = []
  if (Array.isArray(p.entry)) {
    for (const entry of p.entry) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : []
        items.push(...statuses)
      }
    }
  } else if (Array.isArray(p.statuses)) {
    items.push(...p.statuses)
  } else if (Array.isArray(p)) {
    items.push(...p)
  } else {
    items.push(p)
  }

  return items.flatMap((u: any): N8nStatusUpdate[] => {
    const id = typeof u?.providerMessageId === 'string'
      ? u.providerMessageId.trim()
      : typeof u?.externalId === 'string'
        ? u.externalId.trim()
        : typeof u?.id === 'string'
          ? u.id.trim()
          : ''
    const status = typeof u?.status === 'string' ? u.status.trim().toLowerCase().slice(0, 40) : ''
    if (!id || !status) return []
    return [{ providerMessageId: id, status }]
  })
}

export class EvolutionTransport implements WhatsAppTransport {
  readonly provider: WhatsAppProviderType = 'evolution'
  constructor(private readonly creds: WhatsAppCredentials) {}

  async sendText(to: string, text: string): Promise<WhatsAppSendResult> {
    return sendWhatsAppText(to, this.creds, text)
  }

  async sendTemplate(to: string, template: { name: string; language: string; components?: unknown[] }): Promise<WhatsAppSendResult> {
    return sendWhatsAppText(to, this.creds, `[${template.name}]`)
  }
}

export interface N8nMetaConfig {
  clinicId: string
  sendWebhookUrl: string
  secret: string
  phoneNumberId?: string | null
  wabaId?: string | null
  accessToken?: string | null
}

export class N8nMetaTransport implements WhatsAppTransport {
  readonly provider: WhatsAppProviderType = 'n8n_meta'
  constructor(private readonly config: N8nMetaConfig) {}

  private async sendDirectMetaGraph(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
    const phoneNumberId = this.config.phoneNumberId?.trim()
    const accessToken = this.config.accessToken?.trim()
    if (!phoneNumberId || !accessToken) {
      throw new EvolutionError(0, true)
    }
    let graphPayload: Record<string, unknown>
    if (payload.mode === 'template' && payload.template && typeof payload.template === 'object') {
      const tpl = payload.template as { name: string; language?: string; components?: unknown[] }
      graphPayload = {
        messaging_product: 'whatsapp',
        to: payload.to,
        type: 'template',
        template: {
          name: tpl.name,
          language: { code: tpl.language || 'tr' },
          components: tpl.components || [],
        },
      }
    } else if (payload.mode === 'location' && payload.location) {
      graphPayload = {
        messaging_product: 'whatsapp',
        to: payload.to,
        type: 'location',
        location: payload.location,
      }
    } else {
      graphPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: payload.to,
        type: 'text',
        text: { preview_url: false, body: String(payload.text || '') },
      }
    }
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphPayload),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      throw new EvolutionError(res.status, res.status >= 500)
    }
    const data: any = await res.json().catch(() => ({}))
    const messageId =
      (typeof data?.messages?.[0]?.id === 'string' && data.messages[0].id.trim()) ||
      (typeof data?.messageId === 'string' && data.messageId.trim()) ||
      ''
    if (!messageId) throw new EvolutionError(200, true)
    return { messageId }
  }

  private async postToN8n(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
    const url = validateN8nWebhookUrl(this.config.sendWebhookUrl)
    const rawBody = JSON.stringify({
      clinicId: this.config.clinicId,
      phoneNumberId: this.config.phoneNumberId || undefined,
      wabaId: this.config.wabaId || undefined,
      accessToken: this.config.accessToken || undefined,
      ...payload,
    })
    const { timestamp, signature } = signN8nPayload(rawBody, this.config.secret)
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': this.config.secret,
          'X-VoiceAI-Timestamp': timestamp,
          'X-VoiceAI-Signature': signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
      })
    } catch {
      if (this.config.phoneNumberId && this.config.accessToken) {
        return this.sendDirectMetaGraph(payload)
      }
      throw new EvolutionError(0, true)
    }
    if (!res.ok) {
      if (this.config.phoneNumberId && this.config.accessToken) {
        return this.sendDirectMetaGraph(payload)
      }
      throw new EvolutionError(res.status, res.status >= 500)
    }
    let data: any = {}
    try {
      data = await res.json()
    } catch {
      throw new EvolutionError(res.status, true)
    }
    const messageId =
      (typeof data?.messageId === 'string' && data.messageId.trim()) ||
      (typeof data?.messages?.[0]?.id === 'string' && data.messages[0].id.trim()) ||
      (typeof data?.id === 'string' && data.id.trim()) ||
      ''
    if (!messageId) throw new EvolutionError(200, true)
    return { messageId }
  }

  private normalizeRecipient(to: string): string {
    const clean = to.endsWith('@s.whatsapp.net') ? to.split('@')[0] : to
    return normalizePhone(clean).slice(1)
  }

  async sendText(to: string, text: string): Promise<WhatsAppSendResult> {
    return this.postToN8n({
      to: this.normalizeRecipient(to),
      mode: 'text',
      text,
    })
  }

  async sendTemplate(to: string, template: { name: string; language: string; components?: unknown[] }): Promise<WhatsAppSendResult> {
    return this.postToN8n({
      to: this.normalizeRecipient(to),
      mode: 'template',
      template: {
        name: template.name,
        language: template.language || 'tr',
        components: template.components ?? [],
      },
    })
  }

  async sendLocation(to: string, location: { latitude: number; longitude: number; name?: string; address?: string }): Promise<WhatsAppSendResult> {
    return this.postToN8n({
      to: this.normalizeRecipient(to),
      mode: 'location',
      location,
    })
  }
}
