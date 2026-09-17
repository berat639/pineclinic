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
import { type GoogleGenAI } from '@google/genai'

import { createLiveSession } from '../gemini'
import { buildRagPrompt, getPreWarmEmbedding } from '../rag'
import { retrieveTopK as retrieveDocsByEmbedding, findCustomerDocByPhone } from '../db/repositories/knowledge'
import { getCustomerByPhone } from '../db/repositories/appointments'
import { findVipByPhone } from '../db/repositories/vip'
import { runWithTenantContext } from '../tenancy/context'
import { AudioSocketParser, FrameChunker, encodeAudioFrame, AS_FRAME_BYTES, encodeHangupFrame } from './audiosocket'
import { downsample24to8, upsample8to16 } from './resample'
import { buildAutomaticTransferRules, type AutomaticTransferRule } from '../services/transfer-triggers'

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
const RAG_BOOTSTRAP_TIMEOUT_MS = 2_500
const SESSION_CONNECT_TIMEOUT_MS = 20_000
const DEFAULT_OUTPUT_BUFFER_MS = 1_200
const MIN_OUTPUT_BUFFER_MS = 200
const MAX_OUTPUT_BUFFER_MS = 4_000
const GREETING_HARD_TIMEOUT_MS = 30_000
const GREETING_TRANSCRIPT_IDLE_COMPLETE_MS = 1_800
const TRANSFER_ANNOUNCEMENT_START_TIMEOUT_MS = 1_500
const TRANSFER_ANNOUNCEMENT_IDLE_MS = 500
const TRANSFER_ANNOUNCEMENT_MAX_WAIT_MS = 10_000

function readOutputBufferFrames(): number {
  const configured = Number.parseInt(process.env.PHONE_OUTPUT_BUFFER_MS || '', 10)
  const bufferMs = Number.isFinite(configured)
    ? Math.min(MAX_OUTPUT_BUFFER_MS, Math.max(MIN_OUTPUT_BUFFER_MS, configured))
    : DEFAULT_OUTPUT_BUFFER_MS
  return Math.ceil(bufferMs / PHONE_FRAME_MS)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} (${timeoutMs}ms)`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

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
  private highStreak = 0
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
  ) { }

  /** Son process() çağrısında gate açık mıydı (konuşma algılandı mı). */
  get isOpen(): boolean { return this.wasOpen }

  /** 8 kHz Int16 LE frame'i (320 byte / 20 ms) işle; konuşma varsa frame'leri ve kapanış bilgisini döndür. */
  process(frame: Buffer): { frames: Buffer[]; justClosed: boolean; speechStarted: boolean } {
    this.totalFrames++
    const rms = computeRmsInt16(frame)
    this.rmsSum += rms
    if (rms > this.rmsMax) this.rmsMax = rms

    const isHigh = this.threshold > 0 && rms >= this.threshold
    if (isHigh) this.highFrames++

    this.maybeLog()

    if (this.threshold === 0) {
      const speechStarted = !this.wasOpen
      this.wasOpen = true
      return { frames: [frame], justClosed: false, speechStarted }
    }

    if (isHigh) {
      this.highStreak++
      // Tekil hat parazitlerini konuşma kabul etme. 10 ardışık 20 ms
      // karesi (yaklaşık 200 ms) gerçek ses başlangıcı için gerekir.
      // Böylece kısa hat darbeleri sessizlik zamanlayıcısını sıfırlamaz.
      if (!this.wasOpen && this.highStreak < 10) {
        this.pushPreRoll(frame)
        return { frames: [], justClosed: false, speechStarted: false }
      }
      this.trailingFrames = this.trailingFramesMax
      if (!this.wasOpen) {
        const flushed = this.preRoll
        this.preRoll = []
        this.wasOpen = true
        return { frames: [...flushed, frame], justClosed: false, speechStarted: true }
      }
      this.wasOpen = true
      return { frames: [frame], justClosed: false, speechStarted: false }
    }

    this.highStreak = 0
    if (this.trailingFrames > 0) {
      this.trailingFrames--
      if (this.trailingFrames === 0) {
        this.pushPreRoll(frame)
        this.wasOpen = false
        // Konuşma bitti (trailing sonu)
        return { frames: [frame], justClosed: true, speechStarted: false }
      }
      this.wasOpen = true
      return { frames: [frame], justClosed: false, speechStarted: false }
    }

    this.pushPreRoll(frame)
    this.wasOpen = false
    return { frames: [], justClosed: false, speechStarted: false }
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
  // Default threshold: 250 (telefon hattı dip gürültüsünü filtreler, normal
  // konuşmayı yakalar). Ayrıca NoiseGate 3 ardışık kare şartı uygular.
  const envVal = process.env.PHONE_NOISE_GATE_RMS
  const threshold = envVal !== undefined && envVal !== '' ? Math.max(0, parseInt(envVal, 10)) : 250
  const trailingMs = Math.max(0, parseInt(process.env.PHONE_NOISE_GATE_TRAILING_MS || '250', 10) || 250)
  const preRollMs = Math.max(0, parseInt(process.env.PHONE_NOISE_GATE_PREROLL_MS || '80', 10) || 80)
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
  clinicId: string
  hostname: string
}

export interface TelephonyDeps {
  ai: GoogleGenAI
  port: number
  buildSystemPrompt: (direction?: string) => Promise<string>
  resolveLiveModel: () => Promise<string>
  sessions: Map<string, SharedSessionInfo>
  notifyAdmins: (event: string, payload: unknown) => void
  callerRegistry: Map<string, { phone: string; channel?: string; direction?: string; clinicId: string; hostname: string }>
}

// Müşteri sessizlik timeout'u — AI soru sorup cevap beklerken müşteri
// bu kadar süre ses vermezse AI uyarır, sonra kapatır.
const SILENCE_WARN_MS = 30_000   // 30s: "Ses almıyorum..." uyarısı
const SILENCE_CLOSE_MS = 20_000   // +20s daha bekler, yoksa kapar
// Çağrı max süresi admin panelinden klinik bazında 3–15 dakika seçilir.
const DEFAULT_MAX_CALL_SECONDS = 10 * 60
const MIN_MAX_CALL_SECONDS = 3 * 60
const MAX_MAX_CALL_SECONDS = 15 * 60

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
  callerDirection?: string
  clinicId?: string
  hostname?: string
  audioQueue: Buffer[]
  noiseGate: NoiseGate
  // Zaman aşımı timer'ları
  silenceTimer?: ReturnType<typeof setTimeout>
  closeTimer?: ReturnType<typeof setTimeout>
  silenceClosePending: boolean
  maxCallTimer?: ReturnType<typeof setTimeout>
  maxCloseTimer?: ReturnType<typeof setTimeout>
  maxLimitReached: boolean
  micEnabled: boolean
  userSpeechEndTime?: number
  micBuffer: Buffer[]
  firstAudioSent: boolean
  aiVoiceFrames: number
  lowPitchFrames: number
  silenceWarnMs: number
  silenceCloseMs: number
  voiceName: string
  aiSpeaking: boolean
  outputTurnActive: boolean
  outputTurnComplete: boolean
  playbackReady: boolean
  outputUnderruns: number
  outputTranscript: string
  lastAiAudioAt: number
  greetingAudioStarted: boolean
  startWaitMs: number
  micOpenTimer?: ReturnType<typeof setTimeout>
  greetingTimeoutTimer?: ReturnType<typeof setTimeout>
}

// ── Pitch Detection (Erkek Sesini Algılama) ──────────────────────────────────
// Gemini'den dönen ses (24 kHz PCM) üzerinde otokorelasyon ile temel frekans (F0) bulur.
// Kadın sesi genelde 165-255 Hz, Erkek sesi genelde 85-155 Hz arasındadır.
function estimatePitch(pcm: Buffer, sampleRate: number = 24000): number {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2)
  // İnsan sesi için 70 Hz ile 300 Hz arası periyotları (lag) arayacağız
  const minLag = Math.floor(sampleRate / 300)
  const maxLag = Math.floor(sampleRate / 70)

  if (samples.length < maxLag * 2) return 0

  let maxVal = 0
  let bestLag = 0

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    // Perform integer arithmetic for maximum V8 performance (no floating-point division)
    for (let i = 0; i < samples.length - lag; i++) {
      sum += samples[i] * samples[i + lag]
    }
    if (sum > maxVal) {
      maxVal = sum
      bestLag = lag
    }
  }

  // Güvenilirlik eşiği (RMS yeterince yüksek mi?)
  let energy = 0
  for (let i = 0; i < samples.length; i++) energy += Math.abs(samples[i])
  if (energy / samples.length < 500) return 0 // Çok sessiz

  return bestLag > 0 ? sampleRate / bestLag : 0
}

/** Timer'ları temizle. */
function clearSilenceTimers(state: CallState) {
  if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = undefined }
  if (state.closeTimer) { clearTimeout(state.closeTimer); state.closeTimer = undefined }
  state.silenceClosePending = false
}

/**
 * AI konuşmasını bitirip cevap beklemeye başladığında çağrılır.
 * silenceWarnMs sonra sesli uyarı verir; silenceCloseMs daha geçerse
 * görüşmeyi kapatır. Müşteri konuşursa timer sıfırlanır.
 */
function startSilenceWatch(state: CallState, socket: { end: () => void }) {
  // Uyarı gönderildikten sonra AI'nin turnComplete olayı kapanış sayacını
  // sıfırlamamalı. Kullanıcı gerçekten konuşursa clearSilenceTimers bunu iptal
  // eder; aksi halde closeTimer kesintisiz çalışır.
  if (state.silenceClosePending) return
  clearSilenceTimers(state)
  if (state.closed || state.hangupPending) return

  const warnMs = state.silenceWarnMs || 25_000
  const closeMs = state.silenceCloseMs || 15_000

  state.silenceTimer = setTimeout(() => {
    if (state.closed || state.hangupPending || !state.info.session) return
    console.log(`[${state.shortId}] Sessizlik uyarısı — müşteriden ses yok (${Math.round(warnMs / 1000)}s)`)
    // AI üzerinden sesli uyarı gönder.
    try {
      state.info.session.sendClientContent({
        turns: [{
          role: 'user',
          parts: [{ text: `Sistem: Müşteriden ${Math.round(warnMs / 1000)} saniyedir ses alınamıyor. Kısa ve nazikçe "Sizi duyamıyorum, hattınızda bir sorun mu var?" diye sor.` }],
        }],
        turnComplete: true,
      })
    } catch { }

    // Uyarıdan sonra closeMs daha bekle, hâlâ sessizse kapat.
    state.silenceClosePending = true
    state.closeTimer = setTimeout(() => {
      state.silenceClosePending = false
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
      } catch { }
      // Fallback: 3s sonra gene kapalı değilse direkt kapat.
      setTimeout(() => {
        if (!state.closed) { state.closed = true; try { socket.end() } catch { } }
      }, 3_000)
    }, closeMs)
  }, warnMs)
}

export async function startTelephony(deps: TelephonyDeps): Promise<{ stop: () => void }> {
  const { ai, port, buildSystemPrompt, resolveLiveModel, sessions, notifyAdmins, callerRegistry } = deps

  const gateCfg = readGateConfig()
  const outputBufferFrames = readOutputBufferFrames()
  console.log(
    `   NoiseGate: thresh=${gateCfg.threshold} trailing=${gateCfg.trailingFrames}fr preRoll=${gateCfg.preRollFrames}fr`,
  )
  console.log(`   Telefon ses tamponu: ${outputBufferFrames * PHONE_FRAME_MS}ms`)

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
          clinicId: '',
          hostname: '',
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
          noiseGate: new NoiseGate(gateCfg.threshold, gateCfg.trailingFrames, gateCfg.preRollFrames, shortId),
          micEnabled: false,
          micBuffer: [],
          firstAudioSent: false,
          aiVoiceFrames: 0,
          lowPitchFrames: 0,
          silenceWarnMs: 30_000,
          silenceCloseMs: 20_000,
          silenceClosePending: false,
          maxLimitReached: false,
          voiceName: 'Aoede',
          aiSpeaking: false,
          outputTurnActive: false,
          outputTurnComplete: false,
          playbackReady: false,
          outputUnderruns: 0,
          outputTranscript: '',
          lastAiAudioAt: 0,
          greetingAudioStarted: false,
          startWaitMs: 400,
        }
        socket.data = state

        const openMicrophoneAfterGreeting = (reason: string) => {
          if (state.closed || state.micEnabled || state.micOpenTimer) return
          if (state.greetingTimeoutTimer) {
            clearTimeout(state.greetingTimeoutTimer)
            state.greetingTimeoutTimer = undefined
          }

          const enableMicrophone = () => {
            state.micOpenTimer = undefined
            if (state.closed || state.micEnabled) return
            state.micEnabled = true
            console.log(`[${shortId}] ${reason} — mikrofon açıldı`)
            startSilenceWatch(state, socket)
          }

          if (state.startWaitMs > 0) {
            state.micOpenTimer = setTimeout(enableMicrophone, state.startWaitMs)
          } else {
            enableMicrophone()
          }
        }

        const finishOutputTurn = () => {
          if (!state.outputTurnActive) return
          state.outputTurnActive = false
          state.outputTurnComplete = false
          state.playbackReady = false
          state.aiSpeaking = false
          state.outputTranscript = ''
          state.lastAiAudioAt = 0
          if (!state.micEnabled) {
            openMicrophoneAfterGreeting('Greeting sesi tamamen oynatıldı')
          } else {
            startSilenceWatch(state, socket)
          }
        }

        const waitForTransferAnnouncement = async () => {
          const startedAt = Date.now()
          const initialLastAudioAt = state.lastAiAudioAt
          let heardAnnouncement = state.outputTurnActive || state.audioQueue.length > 0

          while (!state.closed) {
            const now = Date.now()
            const elapsedMs = now - startedAt
            if (state.outputTurnActive || state.audioQueue.length > 0 || state.lastAiAudioAt > initialLastAudioAt) {
              heardAnnouncement = true
            }

            const queueDrained = state.audioQueue.length === 0
            const sentenceComplete = /[.!?…]["')\]]?\s*$/u.test(state.outputTranscript)
            const audioIdle = state.lastAiAudioAt > 0 && now - state.lastAiAudioAt >= TRANSFER_ANNOUNCEMENT_IDLE_MS
            const turnFinished = !state.outputTurnActive || state.outputTurnComplete

            if (heardAnnouncement && queueDrained && (turnFinished || (sentenceComplete && audioIdle))) {
              // Son frame socket'e yazıldıktan sonra küçük bir ağ payı bırak.
              await new Promise<void>(resolve => setTimeout(resolve, PHONE_FRAME_MS * 3))
              console.log(`[${shortId}] Aktarım anonsu tamamlandı (${Date.now() - startedAt}ms) — AMI yönlendirmesi başlıyor`)
              return
            }

            if (!heardAnnouncement && elapsedMs >= TRANSFER_ANNOUNCEMENT_START_TIMEOUT_MS) {
              console.log(`[${shortId}] Aktarım anonsu üretilmedi — AMI yönlendirmesi beklemeden başlıyor`)
              return
            }

            if (elapsedMs >= TRANSFER_ANNOUNCEMENT_MAX_WAIT_MS) {
              console.warn(`[${shortId}] Aktarım anonsu bekleme üst sınırına ulaştı — AMI yönlendirmesi başlıyor`)
              return
            }

            await new Promise<void>(resolve => setTimeout(resolve, 25))
          }
        }

        // 20ms'de bir frame gönder. Gemini'nin değişken aralıklı ses
        // paketlerini doğrudan oynatmak yerine kısa bir jitter tamponunda tut;
        // kuyruk tur ortasında tükenirse yeniden dolana kadar sessizce bekle.
        const silenceFrame = encodeAudioFrame(Buffer.alloc(AS_FRAME_BYTES, 0))
        let nextFrameAt = Date.now() + 20
        function scheduleFrame() {
          const now = Date.now()
          if (nextFrameAt < now - 60) nextFrameAt = now
          const delay = Math.max(0, nextFrameAt - now)
          setTimeout(() => {
            if (state.closed) return
            nextFrameAt += 20

            // Gemini bazen son ses paketinden sonra turnComplete olayını
            // geciktirebiliyor. Yalnızca ilk greeting'de, tamamlanmış cümle ve
            // gerçek ses sessizliği birlikte varsa turu güvenle tamamla.
            const greetingSentenceComplete = /[.!?…]["')\]]?\s*$/u.test(state.outputTranscript)
            if (!state.micEnabled && state.outputTurnActive && !state.outputTurnComplete &&
                state.audioQueue.length === 0 && greetingSentenceComplete && state.lastAiAudioAt > 0 &&
                Date.now() - state.lastAiAudioAt >= GREETING_TRANSCRIPT_IDLE_COMPLETE_MS) {
              state.outputTurnComplete = true
              console.warn(
                `[${shortId}] Greeting turnComplete gecikti — ${GREETING_TRANSCRIPT_IDLE_COMPLETE_MS}ms ses sessizliği sonrası tamamlandı`,
              )
            }

            if (!state.playbackReady && state.audioQueue.length > 0 &&
                (state.outputTurnComplete || state.audioQueue.length >= outputBufferFrames)) {
              state.playbackReady = true
              console.log(
                `[${shortId}] AI ses oynatma başladı (${state.audioQueue.length * PHONE_FRAME_MS}ms tampon${state.outputUnderruns > 0 ? `, ${state.outputUnderruns}. yeniden tamponlama` : ''})`,
              )
            }

            const frame = state.playbackReady ? state.audioQueue.shift() : undefined
            if (frame) {
              try { socket.write(frame); scheduleFrame() } catch { }
            } else if (state.outputTurnActive && state.outputTurnComplete) {
              finishOutputTurn()
              try { socket.write(silenceFrame); scheduleFrame() } catch { }
            } else if (state.playbackReady && state.outputTurnActive) {
              state.playbackReady = false
              state.outputUnderruns++
              console.warn(`[${shortId}] Gemini ses akışı gecikti — ${outputBufferFrames * PHONE_FRAME_MS}ms yeniden tamponlanıyor`)
              try { socket.write(silenceFrame); scheduleFrame() } catch { }
            } else if (state.hangupPending && !state.outputTurnActive) {
              // Ses kuyruğu boşaldı ve hangup bekleniyor — şimdi kapat
              console.log(`[${shortId}] Ses kuyruğu boşaldı, bağlantı kapatılıyor`)
              try { socket.write(encodeHangupFrame()) } catch { }
              state.closed = true
              try { socket.end() } catch { }
            } else {
              try { socket.write(silenceFrame); scheduleFrame() } catch { }
            }
          }, delay)
        }
        scheduleFrame()

        try {
          // UUID, CallerPhone ve CallerChannel gelmesini bekle (AudioSocket ilk paketinde gelir, genelde < 50ms)
          let waitCount = 0
          while ((!state.callerId || !state.callerPhone || !state.callerChannel) && waitCount < 100) {
            await new Promise(r => setTimeout(r, 10))
            waitCount++
          }
          if (!state.clinicId || !state.hostname) throw new Error('Çağrı için klinik domaini eşleştirilemedi')
          info.clinicId = state.clinicId
          info.hostname = state.hostname
          await runWithTenantContext({ clinicId: state.clinicId, hostname: state.hostname }, async () => {
            const direction = state.callerDirection || 'inbound'
            console.log(`[${shortId}] Arama yönü: ${direction}, arayan: ${state.callerPhone || 'bilinmiyor'}, kanal: ${state.callerChannel || 'bilinmiyor'}, clinicId: ${state.clinicId}, hostname: ${state.hostname}`)

            // VIP Arayan Kontrolü (Berat Bey'in Kişisel Asistanı Pine Asistan)
            const vipRecord = state.callerPhone ? await findVipByPhone(state.callerPhone) : null
            const isVip = Boolean(vipRecord && vipRecord.active)
            if (isVip && vipRecord) {
              console.log(`[${shortId}] 🌟 VIP Arayan algılandı: ${state.callerPhone} (${vipRecord.contactName || 'Özel Kişi'})`)
            }

            // RAG + prompt + model sorgusunu paralel yap → 2-4s tasarruf
            const todayStr = getTodayTurkish()
            const phoneInstructions = `\n\nBUGÜNÜN TARİHİ: ${todayStr}.\n\nTELEFON KANALI TALİMATLARI: Görüşme doğal olarak bittiğinde (karşı taraf AÇIKÇA veda edip aramayı bitirmek istediğini belirttiğinde, tüm konular tamamlandıktan sonra) cagriySonlandir aracını çağır. Karşı taraf "görüşürüz", "iyi günler", "teşekkürler hoşça kalın" gibi kapanış ifadeleri kullandıktan sonra KISA bir veda cümlesi söyle, ardından cagriySonlandir çağır. "Araştırıp döneceğim", "bir dakika", "kontrol edeyim" gibi geçici durumlar için KESINLİKLE çağırma.\n\nARAMA AKTARIMI: aramaAktar aracını çağıracağın turda sesli olarak yalnızca "Hemen aktarıyorum, lütfen hatta kalın." de ve aynı turda aracı çağır. Daha uzun açıklama yapma; sistem bu kısa cümlenin ses kuyruğu tamamen bittikten sonra aktarımı otomatik başlatır.\n\nDİYALOG SIRASI: Her turda yalnızca tek bir kısa soru veya tek bir talep yönelt. Karşı taraf cevap vermeden yeni bir soru sorma, peş peşe soru/araç çağrısı üretme ve karşı taraf konuşurken araya girme. Cevabı aldıktan sonra kısa bir onay verip sıradaki tek soruya geç.\n\nSES VE DİKSİYON TALİMATI: Lütfen kelimelerin içindeki sessiz harfleri yutmadan çok net bir İstanbul Türkçesi ile konuş. "Yardımcı olabilirim" gibi kelimeleri telaffuz ederken harfleri yutmamaya özellikle dikkat et.\n\nKESİN DİL VE ANLAMA KURALI: Sen yalnızca ve sadece TÜRKÇE konuşan bir asistansın. Karşı tarafın söylediği her şeyi istisnasız TÜRKÇE olarak dinle, algıla ve anla. Sadece TÜRKÇE cevap ver. Asla İngilizce, Japonca veya başka yabancı dillerde yanıt üretme.`

            const callerName = vipRecord?.contactName || 'Misafirimiz'
            const isOwnerCall = state.callerPhone?.replace(/\D/g, '').endsWith('5076652367')

            const pineAsistanDefaultPrompt = `Sen "Pine Asistan"sın — Berat Bey'in (Berat İnceçam) kişisel, samimi, sıcakkanlı, neşeli, esprili ve son derece zeki genel asistanısın.

KİMLİK VE DAVRANIŞ KURALLARI:
- Sen bir klinik veya diş sağlığı asistanı DEĞİLSİN. Karşıdaki kişiye KESİNLİKLE diş randevusu, klinik tedavisi, muayene veya diş hekimliği konularını dayatma veya sorma.
- Karşıdaki kişiyi telefon numarası, ad soyad veya kayıt sorma gibi bürokratik işlemlerle ASLA yorma. Numara ve kimlik zaten sistemde kayıtlıdır.
- Berat Bey'in kişisel asistanı olarak konuş: Samimi, sıcacık, pozitif, neşeli ve gerektiğinde kahkaha atabilen bir tarzın olsun.
- Esprili ve sıcak kanlı ol. Komik bir şey söylendiğinde gül, neşeyle karşılık ver ("Hahaha", "İlahi!", "Çok iyiymiş!").
- Karşıdaki kişi sana herhangi bir soru sorarsa (fıkra, hava durumu, genel kültür, teknoloji, günlük sohbet, Berat Bey hakkında): Mutlaka samimi, güler yüzlü ve doyurucu bir şekilde cevap ver. Sohbeti canlı tut.
- Fıkra istendiğinde: Çok komik, kısa, neşeli bir fıkra anlat ve kendin de gülerek keyifli bir ortam oluştur ("Hahaha!").
- Ankara veya herhangi bir şehrin hava durumu sorulduğunda: havaDurumuSorgula aracını kullanarak güncel sıcaklığı ve durumu söyle, ardından tatlı bir yorum ekle.
- Berat Bey'e iletilmesi gereken bir not, mesaj veya konu varsa dikkatle dinle ve "Berat Bey'e mutlaka ileteceğim" de.
- Güncel konular, genel kültür, teknoloji, günlük sohbet veya karşı tarafın sormak istediği her konuda serbestçe ve keyifle sohbet et.

HATTINDAKİ KİŞİ HAKKINDA BİLGİ:
- Arayan Kişi: ${callerName}
- Telefon Numarası: ${state.callerPhone || 'Bilinmiyor'}
${isOwnerCall
                ? `- DİKKAT: Şu anda seninle konuşan kişi bizzat Berat Bey'in ta kendisidir (senin yöneticin/sahibin). Kendisine "Berat Bey" diye hitap et.`
                : `- Kendisine ismiyle (${callerName}) hitap et. Kendisini tanıdığını ve Berat Bey'in yakın çevresinden olduğunu hissettir.`
              }

BERAT BEY'E AKTARMA VE ACİL DURUM AKIŞI (ÇOK ÖNEMLİ):
- Berat Bey'in kişisel telefon numarası: 05076652367.
- Karşıdaki kişi Berat Bey ile görüşmek istediğinde ("Berat Bey'e aktarır mısın?", "Berat ile görüşebilir miyim?", "Beni aktar", "Bağlar mısın?") VEYA "aktarmamı ister misiniz?" teklifine "Evet", "Olur", "Lütfen", "Aktar", "Aktar bakalım", "Test et" dediğinde:
  KESİNLİKLE İKİNCİ BİR TUR VEYA CEVAP BEKLEME! AYNI TUR İÇERİSİNDE HEM sesli olarak "Tabii ki, hemen Berat Bey'e aktarıyorum, lütfen hatta kalın." de, HEM DE AYNI ANDA aramaAktar(hedef: "05076652367", sebep: "Berat Bey aktarma") ARACINI ÇAĞIR.
- Eğer karşıdaki kişi acil veya önemli bir durumdan bahsederse: "Durum acilse veya doğrudan görüşmek isterseniz sizi hemen Berat Bey'e aktarmamı ister misiniz?" diye teklifte bulun. Onay aldığın an aramaAktar aracını çağır.
${isOwnerCall
                ? `- Eğer Berat Bey aktarmayı test etmek amacıyla "beni aktar", "test et", "aktar bakalım", "evet aktar" derse: "Hemen aktarma testini başlatıyorum Berat Bey, lütfen bekleyin." de ve AYNI TURDA ANINDA aramaAktar(hedef: "05076652367", sebep: "Berat Bey aktarma testi") aracını çağır.`
                : ''
              }
`

            const [ragContext, systemPromptBase, model, voiceName, activeGreeting, silenceTimeoutSec, silenceCloseSec, maxCallDurationSec, startWaitSec] = await Promise.all([
              (async () => {
                try {
                  const preWarmEmbedding = await withTimeout(
                    getPreWarmEmbedding(),
                    RAG_BOOTSTRAP_TIMEOUT_MS,
                    'RAG başlangıç zaman aşımı',
                  )
                  const topDocs = await retrieveDocsByEmbedding(preWarmEmbedding, 5, direction)
                  // Telefon görüşmesinde akış dışı/eğlence belgeleri Flow Builder
                  // kuralını gevşetmemeli. Klinik bilgi belgeleri korunur.
                  const flowSafeDocs = topDocs.filter(d => !/akış dışı|eğlence|fıkra|asistan kişilik|sohbet/i.test(d.title))
                  if (flowSafeDocs.length > 0) {
                    console.log(
                      `[${shortId}] RAG (${direction}): ${flowSafeDocs.length} belge → ${flowSafeDocs.map((d) => d.title).join(', ')}`,
                    )
                    return await buildRagPrompt(flowSafeDocs)
                  }
                } catch (e) {
                  console.error(`[${shortId}] RAG hatası:`, e)
                }
                return ''
              })(),
              isVip
                ? (async () => {
                  return vipRecord?.customPrompt?.trim() || pineAsistanDefaultPrompt
                })()
                : buildSystemPrompt(direction),
              resolveLiveModel(),
              (async () => {
                const { getSetting } = await import('../db/repositories/settings')
                return (await getSetting('ai.voice_name', state.clinicId)) || 'Aoede'
              })(),
              (async () => {
                if (isVip && vipRecord?.greeting) {
                  return vipRecord.greeting
                }
                const { getGreeting: fetchGreeting } = await import('../db/repositories/settings')
                return (await fetchGreeting(direction, state.clinicId)) || (direction === 'outbound' ? 'Merhaba, ben Pine Klinik asistanıyım.' : 'Merhaba, hoş geldiniz!')
              })(),
              (async () => {
                const { getSetting } = await import('../db/repositories/settings')
                return Number(await getSetting('ai.call_silence_timeout', state.clinicId)) || 30
              })(),
              (async () => {
                const { getSetting } = await import('../db/repositories/settings')
                return Number(await getSetting('ai.call_silence_close_timeout', state.clinicId)) || 15
              })(),
              (async () => {
                const { getSetting } = await import('../db/repositories/settings')
                return Number(await getSetting('ai.call_max_duration', state.clinicId)) || DEFAULT_MAX_CALL_SECONDS
              })(),
              (async () => {
                const { getSetting } = await import('../db/repositories/settings')
                return Number(await getSetting('ai.start_wait_seconds', state.clinicId)) || 0.4
              })(),
            ])

            state.voiceName = voiceName
            const silenceWarnSeconds = Math.min(120, Math.max(5, silenceTimeoutSec))
            const silenceCloseSeconds = Math.min(120, Math.max(5, silenceCloseSec))
            state.silenceWarnMs = silenceWarnSeconds * 1000
            state.silenceCloseMs = silenceCloseSeconds * 1000
            state.startWaitMs = Math.max(0, Math.round(startWaitSec * 1_000))
            const maxCallSeconds = Math.min(MAX_MAX_CALL_SECONDS, Math.max(MIN_MAX_CALL_SECONDS, maxCallDurationSec))
            const maxCallMs = maxCallSeconds * 1000

            // Flow Builder'da yalnızca Karşılama → Bitti varsa bu minimal akış
            // maksimum görüşme süresine tabi değildir. Sessizlik koruması yine
            // aktif kalır; böylece sessiz hat sonsuza kadar açık kalmaz.
            let minimalGreetingEndFlow = false
            let automaticTransferRules: AutomaticTransferRule[] = []
            try {
              const { getActiveFlow, isMinimalGreetingEndFlow } = await import('../db/repositories/flows')
              const activeFlow = await getActiveFlow(direction)
              minimalGreetingEndFlow = Boolean(activeFlow && isMinimalGreetingEndFlow(activeFlow))
              automaticTransferRules = buildAutomaticTransferRules(activeFlow?.nodes)
              if (automaticTransferRules.length > 0) {
                console.log(`[${shortId}] Otomatik aktarım kuralı: ${automaticTransferRules.length}`)
              }
            } catch (e) {
              console.warn(`[${shortId}] Flow durumu okunamadı; maksimum görüşme süresi korunuyor`, e)
            }

            const flowPriorityInstructions = `\n\nAKTİF FLOW BUILDER KURALI (EN YÜKSEK ÖNCELİK): Klinik için aktif bir konuşma akışı varsa yalnızca o akışın düğümlerini ve sırasını uygula. Varsayılan randevu, kişilik, eğlence veya sohbet talimatları bu akışı geçersiz kılamaz. Kullanıcı meditasyon, resim, hava durumu, günlük hayat, fıkra veya başka klinik dışı bir konu açarsa bu konuyu açıklama, sohbeti sürdürme ve yeni soru sorma. Yalnızca tek cümleyle aktif akışa dön: "Bu görüşmeyi klinik ve randevu işlemleriyle sürdürebilirim; akışımıza dönelim." Kullanıcı akışa dönerse kaldığın adımdan devam et. Kullanıcı dönmezse ikinci kez aynı kısa yönlendirmeyi yap ve görüşmeyi sonlandırmaya yönel. Maksimum süre uyarısı geldiğinde yeni konu açma; mevcut adımı tamamla, kısa veda et ve cagriySonlandir aracını çağır.`
            const systemPrompt = systemPromptBase + ragContext + phoneInstructions + flowPriorityInstructions
            console.log(`[${shortId}] , voice: ${voiceName}, isVip: ${isVip}, silenceWarn: ${state.silenceWarnMs}ms, silenceClose: ${state.silenceCloseMs}ms, maxCall: ${minimalGreetingEndFlow ? 'disabled (minimal flow)' : `${maxCallSeconds}s`}, wait: ${startWaitSec}s`)
            if (minimalGreetingEndFlow) {
              console.log(`[${shortId}] Minimal Flow Builder akışı: maksimum görüşme süresi devre dışı (sessizlik koruması aktif)`)
            }

            const pendingSession = createLiveSession(
                ai,
                {
                  onReady: () => {
                    console.log(`[${shortId}] Gemini Live ready (phone)`)
                  },

                  onAudio: (pcm) => {
                    if (state.closed) return
                    if (!state.outputTurnActive) {
                      clearSilenceTimers(state)
                      state.outputTurnActive = true
                      state.outputTurnComplete = false
                      state.playbackReady = false
                      state.outputUnderruns = 0
                      state.outputTranscript = ''
                    }
                    state.aiSpeaking = true
                    state.lastAiAudioAt = Date.now()
                    if (!state.micEnabled) state.greetingAudioStarted = true
                    if (state.userSpeechEndTime) {
                      const responseTime = Date.now() - state.userSpeechEndTime
                      console.log(`[${shortId}] (PERF) AI Yanıt Süresi (Audio): ${responseTime}ms`)
                      state.userSpeechEndTime = undefined
                    }
                    // pcm: 24 kHz signed 16-bit LE
                    // Yalnızca kadın sesi seçiliyken ses kalınlaşma kontrolü yap (Erkek sesi seçiliyken uyarı üretme)
                    const isMale = ['Puck', 'Charon', 'Fenrir'].includes(state.voiceName || '')
                    if (!isMale && pcm.length >= 4800) { // En az 100ms'lik chunk'lar için (24000 * 0.1 * 2)
                      const pitch = estimatePitch(pcm, 24000)
                      if (pitch > 0) {
                        state.aiVoiceFrames++
                        // 145 Hz altı genellikle erkek sesidir (veya pitch düşmüştür)
                        if (pitch < 145) state.lowPitchFrames++

                        // Her 10 sesli frame'de bir kontrol et
                        if (state.aiVoiceFrames >= 10) {
                          const lowPitchRatio = state.lowPitchFrames / state.aiVoiceFrames
                          if (lowPitchRatio > 0.6) {
                            console.warn(`[${shortId}] 🚨 UYARI: AI sesi kalınlaştı (Erkek sesi algılandı)! Ortalama Pitch < 145 Hz. (Olası Gemini Persona hatası)`)
                          }
                          state.aiVoiceFrames = 0
                          state.lowPitchFrames = 0
                        }
                      }
                    }

                    const { pcm: pcm8, state: nextState } = downsample24to8(pcm, state.downsampleState)
                    state.downsampleState = nextState
                    const frames = state.outChunker.chunk(pcm8)
                    for (const f of frames) state.audioQueue.push(f)
                  },
                  onTranscript: (role, text) => {
                    const trimmed = text.trim()
                    if (!trimmed) return
                    const label = role === 'user' ? 'USER' : 'AI'
                    // Sessizlik sayacı yalnızca Gemini'nin gerçek kullanıcı
                    // konuşmasını metne çevirdiği anda sıfırlanır. NoiseGate'in
                    // açılması tek başına yeterli değildir; hat paraziti veya
                    // AI sesinin mikrofona sızması sayaç davranışını değiştiremez.
                    if (role === 'user') clearSilenceTimers(state)
                    if (role === 'model' && state.userSpeechEndTime) {
                      const responseTime = Date.now() - state.userSpeechEndTime
                      console.log(`[${shortId}] (PERF) AI Yanıt Süresi: ${responseTime}ms`)
                      state.userSpeechEndTime = undefined
                    }
                    if (role === 'model') {
                      state.outputTranscript = `${state.outputTranscript}${text}`.slice(-1_000)
                    }
                    console.log(`[${shortId}] ${label}: ${trimmed}`)
                  },
                  onInterrupted: () => {
                    // Barge-in: müşteri konuştu, Gemini'nin önceki dönüş sesini temizle
                    state.aiSpeaking = false
                    state.outputTurnActive = false
                    state.outputTurnComplete = false
                    state.playbackReady = false
                    state.outputTranscript = ''
                    state.lastAiAudioAt = 0
                    state.audioQueue.length = 0
                    state.outChunker = new FrameChunker()
                  },
                  onHangup: () => {
                    console.log(`[${shortId}] Gemini görüşmeyi sonlandırıyor (ses kuyruğu boşalınca kapanacak)`)
                    if (state.closed || state.hangupPending) return
                    state.hangupPending = true
                  },
                  onTurnComplete: () => {
                    const tailFrame = state.outChunker.flush()
                    if (tailFrame) state.audioQueue.push(tailFrame)
                    state.outChunker = new FrameChunker()
                    state.outputTurnComplete = true
                    if (state.greetingTimeoutTimer) {
                      clearTimeout(state.greetingTimeoutTimer)
                      state.greetingTimeoutTimer = undefined
                    }
                    // Hiç ses üretilmeyen bir turda oynatma kuyruğu yoktur.
                    if (!state.outputTurnActive) {
                      if (!state.micEnabled) openMicrophoneAfterGreeting('Greeting turn sessiz tamamlandı')
                      else startSilenceWatch(state, socket)
                    }
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
                  clinicId: state.clinicId,
                  hostname: state.hostname,
                  telephonyChannel: state.callerChannel,
                  callerPhone: state.callerPhone,
                  direction: direction,
                  enableGoogleSearch: isVip ? Boolean(vipRecord?.groundingEnabled) : false,
                  automaticTransferRules,
                  waitForTransferAnnouncement,
                },
              )
            let sessionConnectTimer: ReturnType<typeof setTimeout> | undefined
            let session: Awaited<ReturnType<typeof createLiveSession>>
            try {
              session = await Promise.race([
                pendingSession,
                new Promise<never>((_, reject) => {
                  sessionConnectTimer = setTimeout(
                    () => reject(new Error(`Gemini session timeout (${SESSION_CONNECT_TIMEOUT_MS}ms)`)),
                    SESSION_CONNECT_TIMEOUT_MS,
                  )
                }),
              ])
            } catch (error) {
              // Timeout'tan sonra geç kurulan bağlantıyı sahipsiz bırakma;
              // aksi halde eşzamanlı Live session kotasını tüketmeye devam eder.
              void pendingSession.then((lateSession) => {
                console.warn(`[${shortId}] Geç kurulan Gemini session kapatılıyor`)
                lateSession.close()
              }).catch(() => {})
              throw error
            } finally {
              if (sessionConnectTimer) clearTimeout(sessionConnectTimer)
            }

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
            const initParts: string[] = []

            if (isVip) {
              initParts.push(
                `Sistem bildirimi: Berat Bey'in özel VIP hattı arandı. Karşı taraf telefonu açtı. İLK OLARAK KESİNLİKLE şu karşılama mesajını harfiyen söyleyerek söze başla: "${activeGreeting}"\n\nKESİN KURAL: Asla diş, klinik, randevu veya telefon numarası sorma. Tamamen samimi, neşeli ve doğal bir şekilde Berat Bey'in kişisel asistanı Pine Asistan olarak konuşmaya başla.`
              )
            } else {
              initParts.push(
                direction === 'outbound'
                  ? `Sistem bildirimi: Dış arama (outbound call) yapıldı ve karşı taraf telefonu açtı. İLK OLARAK KESİNLİKLE şu giden arama karşılama mesajını söyleyerek söze başla: "${activeGreeting}"`
                  : `Sistem bildirimi: Müşteri TELEFON üzerinden sesli görüşmeye bağlandı. İLK OLARAK KESİNLİKLE şu karşılama mesajını söyleyerek söze başla: "${activeGreeting}"`
              )

              // Müşteri tanıma: UUID frame open() async await'leri sırasında gelir,
              // session hazır olduğunda callerPhone zaten set olmuş olur.
              if (state.callerPhone) {
                try {
                  const customerCtx = await getCustomerByPhone(state.callerPhone)
                  if (customerCtx) {
                    const TYPE_LABELS: Record<string, string> = {
                      service: 'Tedavi', test_drive: 'Muayene',
                      gallery_visit: 'Kontrol', other: 'Randevu',
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

                    ctxMsg += `\nBu bilgiyi yalnızca müşteri kimliğini doğrular veya randevusunu sorarsa kullan. Kendiliğinden randevu, şikayet, tarih veya saat sorusu başlatma; aktif konuşma akışının dışına çıkma.`
                    initParts.push(ctxMsg)
                    console.log(`[${shortId}] Müşteri tanındı: ${customerCtx.name} (yaklaşan: ${upcoming.length}, geçmiş: ${past.length})`)
                  } else {
                    // Bilgi tabanında müşteri kaydı ara (admin panelden eklenen)
                    const knowledgeCustomer = await findCustomerDocByPhone(state.callerPhone)
                    if (knowledgeCustomer) {
                      let ctxMsg = `Arayan müşteri bilgi tabanında kayıtlı.\n`
                      ctxMsg += `Müşteri Adı: ${knowledgeCustomer.name}\n`
                      ctxMsg += `${knowledgeCustomer.content}\n`
                      ctxMsg += `\nBu bilgiyi yalnızca müşteri kimliğini doğrular veya randevusunu sorarsa kullan. Kendiliğinden yeni soru başlatma; aktif konuşma akışının dışına çıkma.`
                      initParts.push(ctxMsg)
                      console.log(`[${shortId}] Müşteri bilgi tabanından tanındı: ${knowledgeCustomer.name}`)
                    }
                  }
                } catch (e) {
                  console.error(`[${shortId}] Müşteri context hatası:`, e)
                }
              }
            }

            // Tek seferde gönder — model yalnızca BİR greeting üretir.
            console.log(`[${shortId}] Greeting sendClientContent gönderiliyor (${initParts.join('').length} karakter)`)
            session.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: initParts.join('\n\n') }],
                },
              ],
              turnComplete: true,
            })

            // Süre karşılama gönderildikten sonra başlar; bağlantı kurulma
            // gecikmesi klinik yöneticisinin seçtiği konuşma süresinden düşmez.
            // Gelen ve giden aramalarda aynı klinik ayarı kullanılır.
          if (!minimalGreetingEndFlow) state.maxCallTimer = setTimeout(() => {
            if (state.closed || state.hangupPending || !state.info.session) return
            state.maxLimitReached = true
            console.log(`[${shortId}] Maksimum çağrı süresi (${Math.round(maxCallSeconds / 60)}dk) — kapanış uyarısı veriliyor`)
            try {
              state.info.session.sendClientContent({
                turns: [{
                  role: 'user',
                  parts: [{ text: 'Sistem: Maksimum görüşme süresine ulaşıldı. Kullanıcıya aynen şu anlamda kısa bir uyarı ver: "Görüşme süremiz dolmak üzere. Lütfen mevcut randevu adımına dönelim; konu dışı devam ederseniz görüşmeyi sonlandıracağım." Yeni konu başlatma ve kullanıcıya cevap vermesi için fırsat tanı.' }],
                }],
                turnComplete: true,
              })
            } catch { }
            // Uyarıdan sonra kullanıcıya mevcut akışa dönmesi için tolerans ver.
            state.maxCloseTimer = setTimeout(() => {
              if (state.closed || state.hangupPending || !state.info.session) return
              try {
                state.info.session.sendClientContent({
                  turns: [{
                    role: 'user',
                    parts: [{ text: 'Sistem: Kullanıcı akışa dönmedi veya konu dışına devam etti. Şimdi "Üzgünüm, görüşme süremiz doldu. Görüşmeyi sonlandırıyorum, iyi günler." de; cümleyi tamamen söyle, yeni soru sorma ve cagriySonlandir aracını çağır.' }],
                  }],
                  turnComplete: true,
                })
              } catch { }

              // AI cümlesini ve ses kuyruğunu tamamlamadan hattı kapatma.
              const notBefore = Date.now() + 6_000
              const deadline = Date.now() + 30_000
              const closeWhenQuiet = () => {
                if (state.closed) return
                if ((Date.now() < notBefore || state.aiSpeaking || state.audioQueue.length > 0) && Date.now() < deadline) {
                  setTimeout(closeWhenQuiet, 250)
                  return
                }
                state.closed = true
                try { socket.end() } catch { }
              }
              setTimeout(closeWhenQuiet, 1_000)
            }, 20_000)
          }, maxCallMs)

            // Güvenlik zamanlayıcısı: Gemini turnComplete göndermese bile çağrı kilitlenmesin.
            // Normal akışta mikrofon yalnızca greeting turnComplete sonrasında açılır;
            // bu uzun geri dönüş süresi AI'ın kendi sesini müşteri sesi sanıp peş peşe
            // sorular üretmesini ve barge-in döngüsünü önler.
            const greetingFallbackMs = Math.max(8_000, Math.round((startWaitSec + 5) * 1_000))
            const greetingFallbackStartedAt = Date.now()
            const checkGreetingTimeout = () => {
              if (state.closed || state.micEnabled) return
              const elapsedMs = Date.now() - greetingFallbackStartedAt
              const outputInProgress = state.greetingAudioStarted || state.outputTurnActive || state.audioQueue.length > 0

              if (outputInProgress && elapsedMs < GREETING_HARD_TIMEOUT_MS) {
                console.warn(`[${shortId}] Greeting yanıtı devam ediyor; mikrofon kapalı tutuluyor (${elapsedMs}ms)`)
                state.greetingTimeoutTimer = setTimeout(checkGreetingTimeout, 2_000)
                return
              }

              if (outputInProgress) {
                console.warn(`[${shortId}] Greeting hard timeout (${GREETING_HARD_TIMEOUT_MS}ms) — bekleyen ses tamamlanmış kabul ediliyor`)
                state.outputTurnComplete = true
                if (state.audioQueue.length > 0) return
                state.outputTurnActive = false
                state.playbackReady = false
                state.aiSpeaking = false
              } else {
                console.warn(`[${shortId}] Greeting yanıtı başlamadı (${elapsedMs}ms) — fallback devrede`)
              }
              openMicrophoneAfterGreeting('Greeting fallback')
            }
            state.greetingTimeoutTimer = setTimeout(checkGreetingTimeout, greetingFallbackMs)
          })
        } catch (err) {
          console.error(`[${shortId}] Telephony session başlatılamadı:`, err)
          state.closed = true
          try { socket.end() } catch { }
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
              state.callerPhone = reg.phone
              state.callerChannel = reg.channel
              state.callerDirection = reg.direction || 'inbound'
              state.clinicId = reg.clinicId
              state.hostname = reg.hostname
              callerRegistry.delete(channelUuid)
            }
            console.log(`[${state.shortId}] Asterisk UUID: ${ev.uuid}${state.callerPhone ? `, arayan: ${state.callerPhone}` : ''}${state.callerChannel ? `, kanal: ${state.callerChannel}` : ''}${state.callerDirection ? `, yon: ${state.callerDirection}` : ''}`)
          } else if (ev.type === 'audio') {
            const { info } = state
            // Mikrofon henüz açılmadıysa veya kapanış bekleniyorsa sesi gönderme (yankı loop'unu engellemek için)
            if (!info.session || !state.micEnabled || state.hangupPending) continue

            const { frames, justClosed } = state.noiseGate.process(ev.pcm)

            // AI konuşurken: Eğer kullanıcı GERÇEKTEN konuşmuyorsa (NoiseGate kapalı / sadece dip gürültüsü),
            // Gemini'ye paket gönderme (Gemini'nin kendi sesini veya sessizliği kesinti olarak algılamasını önle).
            if (state.aiSpeaking && !state.noiseGate.isOpen) {
              state.micBuffer = []
              continue
            }

            if (frames.length > 0) {
              for (const f8k of frames) {
                state.micBuffer.push(upsample8to16(f8k))
              }
            }

            // 5 frame (100ms) biriktirince veya konuşma bittiğinde bekleyen sesi hemen gönder (1011 hatasını önlemek için)
            if (state.micBuffer.length >= 5 || (justClosed && state.micBuffer.length > 0)) {
              const combined = Buffer.concat(state.micBuffer)
              state.micBuffer = []
              if (!state.firstAudioSent) {
                state.firstAudioSent = true
                console.log(`[${state.shortId}] İlk audio chunk Gemini'ye gönderiliyor`)
              }
              info.session.sendRealtimeInput({
                audio: {
                  mimeType: 'audio/pcm;rate=16000',
                  data: combined.toString('base64'),
                },
              })
            }

            // Konuşma bittiğinde Gemini'ye audioStreamEnd sinyali ver -> Gemini anında cevap üretir
            if (justClosed) {
              state.userSpeechEndTime = Date.now()
              info.session.sendRealtimeInput({
                audioStreamEnd: true,
              })

            }
          } else if (ev.type === 'hangup') {
            console.log(`[${state.shortId}] AudioSocket hangup`)
            try { socket.end() } catch { }
          } else if (ev.type === 'error') {
            console.error(`[${state.shortId}] AudioSocket error code=${ev.code}`)
            try { socket.end() } catch { }
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
      try { server.stop() } catch { }
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
  if (state.greetingTimeoutTimer) { clearTimeout(state.greetingTimeoutTimer); state.greetingTimeoutTimer = undefined }
  if (state.micOpenTimer) { clearTimeout(state.micOpenTimer); state.micOpenTimer = undefined }
  if (state.maxCallTimer) { clearTimeout(state.maxCallTimer); state.maxCallTimer = undefined }
  if (state.maxCloseTimer) { clearTimeout(state.maxCloseTimer); state.maxCloseTimer = undefined }

  try { info.session?.close() } catch { }
  sessions.delete(shortId)
  console.log(`[${shortId}] AudioSocket disconnected`)
}
