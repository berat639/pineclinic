/**
 * Netgsm SIP Trunk ↔ Gemini Live köprüsü.
 *
 * Akış:
 *   Asterisk → AudioSocket TCP (SLIN 8 kHz) → upsample 8→16 → Gemini Live
 *   Gemini Live → 24 kHz PCM → downsample 24→8 → AudioSocket frame'leri → Asterisk
 *
 * Web istemcisindeki /ws akışıyla aynı `createLiveSession` kullanılır. Mevcut
 * `sessions` Map'i, SSE bildirimleri ve stereo WAV kaydı yeniden kullanılır.
 */

import { randomUUID } from 'crypto'
import { StartSensitivity, EndSensitivity, ActivityHandling } from '@google/genai'
import type { GoogleGenAI } from '@google/genai'

import { createLiveSession } from '../gemini'
import { buildRagPrompt, embedText, PRE_WARM_QUERY } from '../rag'
import { retrieveTopK as retrieveDocsByEmbedding, findCustomerDocByPhone } from '../db/repositories/knowledge'
import { getCustomerByPhone } from '../db/repositories/appointments'
import { AudioSocketParser, FrameChunker, encodeAudioFrame, AS_FRAME_BYTES, encodeHangupFrame } from './audiosocket'
import { downsample24to8, upsample8to16 } from './resample'

// ── Noise gate (telefon kanalı) ──────────────────────────────────────────────
//
// Asterisk → Gemini akışında arka plan gürültüsünün (TV, müzik, ikinci konuşma)
// Gemini VAD'i yanlış tetiklemesini engeller.
//
// Tasarım: 3 koruma katmanı
//   1. Düşük threshold (default 0 = devre dışı, env ile aktive) — fısıltı bile
//      eşik üstünde kalmalı; line noise altında kalmalı.
//   2. Pre-roll buffer — gate açıldığı an, gate kapalıyken yakalanmış son
//      birkaç frame önce gönderilir → konuşmanın ilk hecesi kaybolmaz.
//   3. Trailing — gate açıldıktan sonra RMS eşiğin altına düşse bile bir süre
//      daha açık kalır → cümle sonu kesilmez.
//
// Gemini'ye gönderilen toplam audio süresi her zaman gerçek zamanla eşleşir
// (gerçek audio yerine sessizlik frame'i geçer); böylece Gemini'nin VAD timing'i
// bozulmaz.
const PHONE_FRAME_MS = 20

function computeRmsInt16(pcm: Buffer): number {
  const samples = pcm.length >> 1
  if (samples === 0) return 0
  let sumSq = 0
  for (let i = 0; i < pcm.length; i += 2) {
    const s = pcm.readInt16LE(i)
    sumSq += s * s
  }
  return Math.sqrt(sumSq / samples)
}

class NoiseGate {
  private preRoll: Buffer[] = []
  private trailingFrames = 0
  private wasOpen = false
  private totalFrames = 0
  private highFrames = 0
  private rmsSum = 0
  private rmsMax = 0
  private lastLogAtFrame = 0

  constructor(
    readonly threshold: number,
    private readonly trailingFramesMax: number,
    private readonly preRollMax: number,
    private readonly shortId: string,
    private readonly logIntervalFrames = 500,
  ) {}

  /** Son process() çağrısında gate açık mıydı (konuşma algılandı mı). */
  get isOpen(): boolean { return this.wasOpen }

  /** 8 kHz Int16 LE frame'i (320 byte / 20 ms) işle; Gemini'ye gidecek frame'leri döndür. */
  process(frame: Buffer): Buffer[] {
    this.totalFrames++
    const rms = computeRmsInt16(frame)
    this.rmsSum += rms
    if (rms > this.rmsMax) this.rmsMax = rms

    const isHigh = this.threshold > 0 && rms >= this.threshold
    if (isHigh) this.highFrames++

    this.maybeLog()

    if (this.threshold === 0) {
      // Gate devre dışı — her frame konuşma sayılır.
      this.wasOpen = true
      return [frame]
    }

    if (isHigh) {
      this.trailingFrames = this.trailingFramesMax
      if (!this.wasOpen) {
        const flushed = this.preRoll
        this.preRoll = []
        this.wasOpen = true
        return [...flushed, frame]
      }
      this.wasOpen = true
      return [frame]
    }

    if (this.trailingFrames > 0) {
      this.trailingFrames--
      if (this.trailingFrames === 0) {
        this.pushPreRoll(frame)
        this.wasOpen = false
      } else {
        this.wasOpen = true
      }
      return [frame]
    }

    this.pushPreRoll(frame)
    this.wasOpen = false
    return [Buffer.alloc(frame.length, 0)]
  }

  private pushPreRoll(frame: Buffer): void {
    if (this.preRollMax <= 0) return
    this.preRoll.push(frame)
    if (this.preRoll.length > this.preRollMax) this.preRoll.shift()
  }

  private maybeLog(): void {
    const elapsed = this.totalFrames - this.lastLogAtFrame
    if (elapsed < this.logIntervalFrames) return
    const avg = Math.round(this.rmsSum / elapsed)
    const pct = Math.round((this.highFrames / elapsed) * 100)
    console.log(
      `[${this.shortId}] NoiseGate: ${elapsed}fr | avg=${avg} max=${Math.round(this.rmsMax)} high=${pct}% | thresh=${this.threshold}`,
    )
    this.lastLogAtFrame = this.totalFrames
    this.rmsSum = 0
    this.highFrames = 0
    this.rmsMax = 0
  }
}

function readGateConfig(): { threshold: number; trailingFrames: number; preRollFrames: number } {
  const threshold = Math.max(0, parseInt(process.env.PHONE_NOISE_GATE_RMS || '0', 10) || 0)
  const trailingMs = Math.max(0, parseInt(process.env.PHONE_NOISE_GATE_TRAILING_MS || '300', 10) || 300)
  const preRollMs = Math.max(0, parseInt(process.env.PHONE_NOISE_GATE_PREROLL_MS || '60', 10) || 60)
  return {
    threshold,
    trailingFrames: Math.round(trailingMs / PHONE_FRAME_MS),
    preRollFrames: Math.round(preRollMs / PHONE_FRAME_MS),
  }
}

function getTodayTurkish(): string {
  const now = new Date()
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${days[now.getDay()]}`
}

// SessionInfo arayüzü server/src/index.ts ile birebir uyumlu (referansla geçilir).
interface TimedChunk {
  buffer: Buffer
  offsetMs: number
}

interface SharedSessionInfo {
  session: Awaited<ReturnType<typeof createLiveSession>>
  startedAt: Date
  startedAtMs: number
  audioChunks: TimedChunk[]
  userAudioChunks: TimedChunk[]
  shortId: string
}

export interface TelephonyDeps {
  ai: GoogleGenAI
  port: number
  buildSystemPrompt: () => Promise<string>
  resolveLiveModel: () => Promise<string>
  sessions: Map<string, SharedSessionInfo>
  notifyAdmins: (event: string, payload: unknown) => void
  callerRegistry: Map<string, { phone: string; channel?: string } | string>
}

// Müşteri sessizlik timeout'u — AI soru sorup cevap beklerken müşteri
// bu kadar süre ses vermezse AI uyarır, sonra kapatır.
const SILENCE_WARN_MS  = 30_000   // 30s: "Ses almıyorum..." uyarısı
const SILENCE_CLOSE_MS = 20_000   // +20s daha bekler, yoksa kapar
/** Gate devre dışıyken (threshold=0) sessizlik timer'ını sıfırlamak için min. RMS eşiği */
const SPEECH_RMS_THRESHOLD = 150
// Çağrı max süresi — uzayan/takılı kalan aramaları kapat.
const MAX_CALL_MS      = 20 * 60_000   // 20 dakika

/** Tek bir AudioSocket bağlantısı için durum. */
interface CallState {
  shortId: string
  info: SharedSessionInfo
  parser: AudioSocketParser
  outChunker: FrameChunker
  downsampleState: { history: number[]; phase: number }
  closed: boolean
  hangupPending: boolean
  callerId?: string
  callerPhone?: string
  callerChannel?: string
  audioQueue: Buffer[]
  noiseGate: NoiseGate
  // Zaman aşımı timer'ları
  silenceTimer?: ReturnType<typeof setTimeout>
  closeTimer?: ReturnType<typeof setTimeout>
  maxCallTimer?: ReturnType<typeof setTimeout>
}

/** Timer'ları temizle. */
function clearSilenceTimers(state: CallState) {
  if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = undefined }
  if (state.closeTimer)   { clearTimeout(state.closeTimer);   state.closeTimer   = undefined }
}

/**
 * AI konuşmasını bitirip cevap beklemeye başladığında çağrılır.
 * SILENCE_WARN_MS sonra sesli uyarı verir; SILENCE_CLOSE_MS daha geçerse
 * görüşmeyi kapatır. Müşteri konuşursa timer sıfırlanır.
 */
function startSilenceWatch(state: CallState, socket: { end: () => void }) {
  clearSilenceTimers(state)
  if (state.closed || state.hangupPending) return

  state.silenceTimer = setTimeout(() => {
    if (state.closed || state.hangupPending || !state.info.session) return
    console.log(`[${state.shortId}] Sessizlik uyarısı — müşteriden ses yok`)
    // AI üzerinden sesli uyarı gönder.
    try {
      state.info.session.sendClientContent({
        turns: [{
          role: 'user',
          parts: [{ text: 'Sistem: Müşteriden 30 saniyedir ses alınamıyor. Kısa ve nazikçe "Sizi duyamıyorum, hattınızda bir sorun mu var?" diye sor.' }],
        }],
        turnComplete: true,
      })
    } catch {}

    // Uyarıdan sonra SILENCE_CLOSE_MS daha bekle, hâlâ sessizse kapat.
    state.closeTimer = setTimeout(() => {
      if (state.closed || state.hangupPending || !state.info.session) return
      console.log(`[${state.shortId}] Sessizlik timeout — görüşme sonlandırılıyor`)
      try {
        state.info.session.sendClientContent({
          turns: [{
            role: 'user',
            parts: [{ text: 'Sistem: Hattan ses alınamıyor. Kısa bir veda söyle ve cagriySonlandir aracını çağır.' }],
          }],
          turnComplete: true,
        })
      } catch {}
      // Fallback: 3s sonra gene kapalı değilse direkt kapat.
      setTimeout(() => {
        if (!state.closed) { state.closed = true; try { socket.end() } catch {} }
      }, 3_000)
    }, SILENCE_CLOSE_MS)
  }, SILENCE_WARN_MS)
}

export async function startTelephony(deps: TelephonyDeps): Promise<{ stop: () => void }> {
  const { ai, port, buildSystemPrompt, resolveLiveModel, sessions, notifyAdmins, callerRegistry } = deps

  const gateCfg = readGateConfig()
  console.log(
    `   NoiseGate: thresh=${gateCfg.threshold} trailing=${gateCfg.trailingFrames}fr preRoll=${gateCfg.preRollFrames}fr`,
  )

  const server = Bun.listen<CallState>({
    hostname: '0.0.0.0',
    port,
    socket: {
      async open(socket) {
        const shortId = `tel_${randomUUID().slice(0, 8)}`
        const startedAt = new Date()
        const startedAtMs = Date.now()

        console.log(`[${shortId}] AudioSocket bağlantısı açıldı (${socket.remoteAddress})`)

        const info: SharedSessionInfo = {
          session: null as any,
          startedAt,
          startedAtMs,
          audioChunks: [],
          userAudioChunks: [],
          shortId,
        }

        const state: CallState = {
          shortId,
          info,
          parser: new AudioSocketParser(),
          outChunker: new FrameChunker(),
          downsampleState: { history: new Array(14).fill(0), phase: 0 },
          closed: false,
          hangupPending: false,
          audioQueue: [],
          noiseGate: new NoiseGate(
            gateCfg.threshold,
            gateCfg.trailingFrames,
            gateCfg.preRollFrames,
            shortId,
          ),
        }
        socket.data = state

        // Maksimum çağrı süresi — takılı kalan aramaları zorla kapat.
        state.maxCallTimer = setTimeout(() => {
          if (state.closed || state.hangupPending || !state.info.session) return
          console.log(`[${shortId}] Maksimum çağrı süresi (${MAX_CALL_MS / 60000}dk) — görüşme sonlandırılıyor`)
          try {
            state.info.session.sendClientContent({
              turns: [{
                role: 'user',
                parts: [{ text: 'Sistem: Maksimum görüşme süresi doldu. Kısa bir veda söyle ve cagriySonlandir aracını çağır.' }],
              }],
              turnComplete: true,
            })
          } catch {}
          setTimeout(() => { if (!state.closed) { state.closed = true; try { socket.end() } catch {} } }, 4_000)
        }, MAX_CALL_MS)

        // 20ms'de bir frame gönder: queue'da varsa gerçek audio, yoksa sessizlik
        const silenceFrame = encodeAudioFrame(Buffer.alloc(AS_FRAME_BYTES, 0))
        let nextFrameAt = Date.now() + 20
        function scheduleFrame() {
          const delay = Math.max(0, nextFrameAt - Date.now())
          setTimeout(() => {
            if (state.closed) return
            nextFrameAt += 20
            const frame = state.audioQueue.shift()
            if (frame) {
              try { socket.write(frame); scheduleFrame() } catch {}
            } else if (state.hangupPending) {
              // Ses kuyruğu boşaldı ve hangup bekleniyor — şimdi kapat
              console.log(`[${shortId}] Ses kuyruğu boşaldı, bağlantı kapatılıyor`)
              try { socket.write(encodeHangupFrame()) } catch {}
              state.closed = true
              try { socket.end() } catch {}
            } else {
              try { socket.write(silenceFrame); scheduleFrame() } catch {}
            }
          }, delay)
        }
        scheduleFrame()

        try {
          // RAG + prompt + model sorgusunu paralel yap → 2-4s tasarruf
          const todayStr = getTodayTurkish()
          const phoneInstructions = `\n\nBUGÜNÜN TARİHİ: ${todayStr}. Randevu tarihlerini söylerken mutlaka bu tarihe göre gün hesapla — asla tahmin yapma.\n\nTELEFON KANALI TALİMATLARI: Görüşme doğal olarak bittiğinde (müşteri AÇIKÇA veda edip aramayı bitirmek istediğini belirttiğinde, tüm talepler tamamlandıktan sonra) cagriySonlandir aracını çağır. Müşteri "görüşürüz", "iyi günler", "teşekkürler hoşça kalın" gibi kapanış ifadeleri kullandıktan sonra KISA bir veda cümlesi söyle, ardından cagriySonlandir çağır. "Araştırıp döneceğim", "bir dakika", "kontrol edeyim" gibi geçici durumlar için KESINLIKLE çağırma.`

          const [ragContext, systemPromptBase, model] = await Promise.all([
            (async () => {
              try {
                const preWarmEmbedding = await embedText(PRE_WARM_QUERY)
                const topDocs = await retrieveDocsByEmbedding(preWarmEmbedding, 5)
                if (topDocs.length > 0) {
                  console.log(
                    `[${shortId}] RAG: ${topDocs.length} belge → ${topDocs.map((d) => d.title).join(', ')}`,
                  )
                  return await buildRagPrompt(topDocs)
                }
              } catch (e) {
                console.error(`[${shortId}] RAG hatası:`, e)
              }
              return ''
            })(),
            buildSystemPrompt(),
            resolveLiveModel(),
          ])

          const { getSetting } = await import('../db/repositories/settings')
          const voiceName = (await getSetting('ai.voice_name')) || 'Aoede'
          const systemPrompt = systemPromptBase + ragContext + phoneInstructions
          console.log(`[${shortId}] Gemini Live model: ${model}, voice: ${voiceName}`)

          const SESSION_CONNECT_TIMEOUT_MS = 10_000

          const session = await Promise.race([
            createLiveSession(
            ai,
            {
              onReady: () => console.log(`[${shortId}] Gemini Live ready (phone)`),

              onAudio: (pcm) => {
                if (state.closed) return
                // pcm: 24 kHz signed 16-bit LE → 8 kHz SLIN
                const { pcm: pcm8, state: nextState } = downsample24to8(pcm, state.downsampleState)
                state.downsampleState = nextState
                const frames = state.outChunker.chunk(pcm8)
                for (const f of frames) state.audioQueue.push(f)
              },
              onTranscript: (role, text) => {
                // Tanı için: müşterinin ne söylediğini (input transcription)
                // ve AI'nın ne söylediğini (output transcription) log'a düş.
                // Chunks halinde gelir, fragment fragment yazılır — gerçek
                // zamanlı konuşma takibi için yeterli.
                const trimmed = text.trim()
                if (!trimmed) return
                const label = role === 'user' ? 'USER' : 'AI'
                console.log(`[${shortId}] ${label}: ${trimmed}`)
              },
              onInterrupted: () => {
                // Barge-in: müşteri konuştu, Gemini'nin önceki dönüş sesini temizle
                state.audioQueue.length = 0
                state.outChunker = new FrameChunker()
              },
              onHangup: () => {
                console.log(`[${shortId}] Gemini görüşmeyi sonlandırıyor (ses kuyruğu boşalınca kapanacak)`)
                if (state.closed || state.hangupPending) return
                state.hangupPending = true
              },
              onTurnComplete: () => {
                // AI konuşmasını bitirdi, müşteri cevabını bekliyor.
                // Sessizlik timer'ını başlat; müşteri konuşursa data() sıfırlar.
                startSilenceWatch(state, socket)
              },
              onError: (e) => console.error(`[${shortId}] Gemini error:`, e),
              onClose: () => {
                console.log(`[${shortId}] Gemini session closed (phone)`)
                sessions.delete(shortId)
                notifyAdmins('session_end', {
                  id: shortId,
                  channel: 'phone',
                  activeSessions: sessions.size,
                })
              },
            },
            {
              dbSessionId: shortId,
              systemPrompt,
              model,
              voiceName,
              telephonyChannel: state.callerChannel,
              realtimeInputConfig: {
                // NO_INTERRUPTION: müşteri konuşmaya başlasa bile AI kendi
                // cümlesini/sorusunu sonuna kadar söyler, yarıda kesilmez.
                // (Varsayılan START_OF_ACTIVITY_INTERRUPTS = barge-in açık.)
                activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
                automaticActivityDetection: {
                  // Telefon hattı (8kHz µ-law/A-law) ses amplitüdünü düşürür.
                  // START_SENSITIVITY_HIGH ile kısa/kısık konuşmaları (rakamlar,
                  // "evet", "üç" gibi) yakalarız.
                  startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
                  // END HIGH: kısa cevaplarda ("evet", "hayır", rakamlar)
                  // modelin konuşma bitişini hızlı algılaması için yüksek duyarlılık.
                  endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
                  prefixPaddingMs: 200,
                  // Kısa onay cümlelerinde ("evet") hızlı tepki.
                  silenceDurationMs: 700,
                },
              },
            },
          ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Gemini session timeout (${SESSION_CONNECT_TIMEOUT_MS}ms)`)), SESSION_CONNECT_TIMEOUT_MS)
            ),
          ])

          info.session = session
          sessions.set(shortId, info)
          notifyAdmins('session_start', {
            id: shortId,
            channel: 'phone',
            activeSessions: sessions.size,
          })

          // Tüm başlangıç context'ini TEK bir sendClientContent'te birleştir.
          // Birden fazla turnComplete: true göndermek modelin her birine ayrı
          // greeting üretmesine neden olur.
          const initParts: string[] = [
            'Sistem bildirimi: Müşteri TELEFON üzerinden sesli görüşmeye bağlandı. (Bu satır müşteri adı veya talebi değildir; randevuya yazma.)',
          ]

          // Müşteri tanıma: UUID frame open() async await'leri sırasında gelir,
          // session hazır olduğunda callerPhone zaten set olmuş olur.
          if (state.callerPhone) {
            try {
              const customerCtx = await getCustomerByPhone(state.callerPhone)
              if (customerCtx) {
                const TYPE_LABELS: Record<string, string> = {
                  service: 'Servis', test_drive: 'Test Sürüşü',
                  gallery_visit: 'Galeri Ziyareti', other: 'Randevu',
                }
                const upcoming = customerCtx.appointmentHistory.filter(a => !a.isPast)
                const past = customerCtx.appointmentHistory.filter(a => a.isPast)

                let ctxMsg = `Arayan müşteri sistemde kayıtlı.\n`
                ctxMsg += `Müşteri Adı: ${customerCtx.name}\n`
                ctxMsg += `Telefon: ${customerCtx.phone}\n`

                if (upcoming.length > 0) {
                  ctxMsg += `\nYaklaşan Randevular (${upcoming.length} adet):\n`
                  upcoming.slice(0, 3).forEach(a => {
                    ctxMsg += `- ${a.date} ${a.time}: ${TYPE_LABELS[a.type] ?? a.type}`
                    if (a.vehicleInfo) ctxMsg += ` (${a.vehicleInfo})`
                    ctxMsg += '\n'
                  })
                }

                if (past.length > 0) {
                  ctxMsg += `\nGeçmiş Randevu Sayısı: ${past.length}\n`
                }

                ctxMsg += `\nMüşteriyi ismiyle selamla ve uygunsa yaklaşan randevusunu belirt. (Bu bilgiler sistem tarafından sağlanmıştır, müşteri söylememiştir.)`
                initParts.push(ctxMsg)
                console.log(`[${shortId}] Müşteri tanındı: ${customerCtx.name} (yaklaşan: ${upcoming.length}, geçmiş: ${past.length})`)
              } else {
                // Bilgi tabanında müşteri kaydı ara (admin panelden eklenen)
                const knowledgeCustomer = await findCustomerDocByPhone(state.callerPhone)
                if (knowledgeCustomer) {
                  let ctxMsg = `Arayan müşteri bilgi tabanında kayıtlı.\n`
                  ctxMsg += `Müşteri Adı: ${knowledgeCustomer.name}\n`
                  ctxMsg += `${knowledgeCustomer.content}\n`
                  ctxMsg += `\nMüşteriyi ismiyle selamla. (Bu bilgiler sistem tarafından sağlanmıştır, müşteri söylememiştir.)`
                  initParts.push(ctxMsg)
                  console.log(`[${shortId}] Müşteri bilgi tabanından tanındı: ${knowledgeCustomer.name}`)
                }
              }
            } catch (e) {
              console.error(`[${shortId}] Müşteri context hatası:`, e)
            }
          }

          // Tek seferde gönder — model yalnızca BİR greeting üretir.
          session.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: initParts.map(text => ({ text })),
              },
            ],
            turnComplete: true,
          })
        } catch (err) {
          console.error(`[${shortId}] Telephony session başlatılamadı:`, err)
          state.closed = true
          try { socket.end() } catch {}
        }
      },

      data(socket, chunk) {
        const state = socket.data
        if (!state || state.closed) return
        const events = state.parser.push(chunk)
        for (const ev of events) {
          if (ev.type === 'uuid') {
            const channelUuid = ev.uuid
            state.callerId = channelUuid
            const reg = callerRegistry.get(channelUuid)
            if (reg) {
              if (typeof reg === 'string') {
                state.callerPhone = reg
              } else {
                state.callerPhone = reg.phone
                state.callerChannel = reg.channel
              }
              callerRegistry.delete(channelUuid)
            }
            console.log(`[${state.shortId}] Asterisk UUID: ${ev.uuid}${state.callerPhone ? `, arayan: ${state.callerPhone}` : ''}${state.callerChannel ? `, kanal: ${state.callerChannel}` : ''}`)
          } else if (ev.type === 'audio') {
            const { info } = state
            if (!info.session) continue
            const gatedFrames = state.noiseGate.process(ev.pcm)
            // Sessizlik timer'ını sıfırla: gate aktifse isOpen kullan,
            // gate devre dışıysa (threshold=0) frame RMS eşiğine bak.
            const rmsForSilence = computeRmsInt16(ev.pcm)
            const isSpeech = state.noiseGate.threshold > 0
              ? state.noiseGate.isOpen
              : rmsForSilence >= SPEECH_RMS_THRESHOLD
            if (isSpeech) {
              clearSilenceTimers(state)
            }
            for (const f8k of gatedFrames) {
              const pcm16 = upsample8to16(f8k)
              info.session.sendRealtimeInput({
                audio: {
                  data: pcm16.toString('base64'),
                  mimeType: 'audio/pcm;rate=16000',
                },
              })
            }
          } else if (ev.type === 'hangup') {
            console.log(`[${state.shortId}] AudioSocket hangup`)
            try { socket.end() } catch {}
          } else if (ev.type === 'error') {
            console.error(`[${state.shortId}] AudioSocket error code=${ev.code}`)
            try { socket.end() } catch {}
          }
        }
      },

      close(socket) {
        finalize(socket.data, deps)
      },

      error(socket, error) {
        console.error(`[${socket.data?.shortId ?? 'tel:?'}] socket error:`, error)
        finalize(socket.data, deps)
      },
    },
  })

  console.log(`   AudioSocket: tcp://0.0.0.0:${port}`)
  return {
    stop() {
      try { server.stop() } catch {}
    },
  }
}

function finalize(state: CallState | undefined, deps: TelephonyDeps): void {
  if (!state || state.closed) return
  state.closed = true
  const { info, shortId } = state
  const { sessions } = deps

  // Tüm timeout timer'larını temizle — bellek sızıntısı / geç tetiklenme olmasın.
  clearSilenceTimers(state)
  if (state.maxCallTimer) { clearTimeout(state.maxCallTimer); state.maxCallTimer = undefined }

  try { info.session?.close() } catch {}
  sessions.delete(shortId)
  console.log(`[${shortId}] AudioSocket disconnected`)
}
