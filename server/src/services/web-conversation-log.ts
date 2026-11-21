import { createHash } from 'node:crypto'
import { ConversationLog } from '../telephony/conversation-log'

const EVENTS = new Set([
  'çağrı_başladı', 'bağlantı_hazır', 'mikrofon_akışı_başladı', 'konuşma_metni',
  'asistan_sesi_alındı', 'asistan_üretimi_tamamlandı', 'asistan_sözü_kesildi',
  'asistan_sesi_oynatmaya_planlandı', 'asistan_sesi_oynatımı_bitti',
  'asistan_sesi_oynatımı_temizlendi', 'bağlantı_hatası', 'çağrı_bitti',
  'dil_ihlali_engellendi', 'görüşme_kapatma_onaylandı',
])
const TTL_MS = 35 * 60_000

type WebEvent = {
  event: string; clientSequence: number; clientTimestamp: string; clientElapsedMs: number
  text?: string; speaker?: 'arayan' | 'asistan'; queuedAudioMs?: number
  discardedAudioMs?: number; scheduledDelayMs?: number; code?: string
}
type Entry = { log: ConversationLog; lastSequence: number; lastElapsedMs: number; expiresAt: number; ended: boolean }

/** Auth is checked by the route. Retains counters only, never transcript history. */
export class WebConversationLogStore {
  private readonly entries = new Map<string, Entry>()
  constructor(private readonly write: (line: string) => void = console.log, private readonly now = Date.now) {}

  ingest(clinicId: string, token: string, body: unknown): { accepted: number } {
    const payload = body as { callId?: unknown; events?: unknown }
    if (!payload || typeof payload.callId !== 'string' || !/^web_[a-f0-9-]{36}$/.test(payload.callId) ||
        !Array.isArray(payload.events) || payload.events.length < 1 || payload.events.length > 16) {
      throw new Error('Geçersiz konuşma kaydı')
    }
    const events: WebEvent[] = []
    let previousSequence = 0
    for (const value of payload.events) {
      if (!value || typeof value !== 'object') throw new Error('Geçersiz olay')
      const raw = value as Record<string, unknown>
      if (typeof raw.event !== 'string' || !EVENTS.has(raw.event) ||
          !Number.isInteger(raw.clientSequence) || Number(raw.clientSequence) <= previousSequence || Number(raw.clientSequence) > 20_000 ||
          typeof raw.clientTimestamp !== 'string' || !Number.isFinite(Date.parse(raw.clientTimestamp)) ||
          typeof raw.clientElapsedMs !== 'number' || !Number.isFinite(raw.clientElapsedMs) || raw.clientElapsedMs < 0 || raw.clientElapsedMs > 7_200_000) {
        throw new Error('Geçersiz olay zamanı veya sırası')
      }
      if (raw.text !== undefined && (typeof raw.text !== 'string' || raw.text.length > 4_000)) throw new Error('Geçersiz konuşma metni')
      if (raw.event === 'konuşma_metni' && (typeof raw.text !== 'string' || !['arayan', 'asistan'].includes(String(raw.speaker)))) throw new Error('Geçersiz konuşmacı')
      const event: WebEvent = {
        event: raw.event, clientSequence: Number(raw.clientSequence),
        clientTimestamp: raw.clientTimestamp, clientElapsedMs: raw.clientElapsedMs,
      }
      if (typeof raw.text === 'string') event.text = raw.text
      if (raw.speaker === 'arayan' || raw.speaker === 'asistan') event.speaker = raw.speaker
      for (const field of ['queuedAudioMs', 'discardedAudioMs', 'scheduledDelayMs'] as const) {
        const n = raw[field]
        if (typeof n === 'number' && Number.isFinite(n) && n >= 0) event[field] = Math.min(120_000, n)
      }
      if (typeof raw.code === 'string') event.code = raw.code.slice(0, 80)
      previousSequence = event.clientSequence
      events.push(event)
    }
    const now = this.now()
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key)
    const key = createHash('sha256').update(`${clinicId}:${token}:${payload.callId}`).digest('hex')
    let entry = this.entries.get(key)
    if (!entry) {
      if (this.entries.size >= 2_000) throw new Error('Konuşma kaydı sınırı doldu')
      entry = { log: new ConversationLog(payload.callId, this.write), lastSequence: 0, lastElapsedMs: 0, expiresAt: now + TTL_MS, ended: false }
      this.entries.set(key, entry)
    }
    let elapsed = entry.lastElapsedMs
    for (const event of events) {
      if (event.clientSequence <= entry.lastSequence || entry.ended) continue
      if (event.clientElapsedMs < elapsed) throw new Error('Konuşma zamanı geriye gidemez')
      elapsed = event.clientElapsedMs
    }
    let accepted = 0
    for (const event of events) {
      if (event.clientSequence <= entry.lastSequence || entry.ended) continue
      entry.lastSequence = event.clientSequence
      entry.lastElapsedMs = event.clientElapsedMs
      const { event: name, ...details } = event
      const fields = { ...details, clinicId, channel: 'web', transport: 'direct', source: 'tarayıcı_bildirimi', timing: 'tarayıcı_olay_zamanı_ve_sunucu_alınma_zamanı' }
      if (name === 'çağrı_bitti') { entry.log.end(fields); entry.ended = true }
      else entry.log.event(name, fields)
      accepted++
    }
    return { accepted }
  }
}

export const webConversationLogs = new WebConversationLogStore()
