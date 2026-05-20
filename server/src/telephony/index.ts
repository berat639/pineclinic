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
import { StartSensitivity, EndSensitivity } from '@google/genai'
import type { GoogleGenAI } from '@google/genai'

import { createLiveSession } from '../gemini'
import { buildRagPrompt, embedText, PRE_WARM_QUERY } from '../rag'
import { retrieveTopK as retrieveDocsByEmbedding } from '../db/repositories/knowledge'
import { AudioSocketParser, FrameChunker, encodeAudioFrame, AS_FRAME_BYTES, encodeHangupFrame } from './audiosocket'
import { downsample24to8, upsample8to16 } from './resample'

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
  systemPromptBase: string
  resolveLiveModel: () => Promise<string>
  sessions: Map<string, SharedSessionInfo>
  notifyAdmins: (event: string, payload: unknown) => void
}

/** Tek bir AudioSocket bağlantısı için durum. */
interface CallState {
  shortId: string
  info: SharedSessionInfo
  parser: AudioSocketParser
  outChunker: FrameChunker
  downsampleState: { history: number[]; phase: number }
  closed: boolean
  callerId?: string
  audioQueue: Buffer[]
}

export async function startTelephony(deps: TelephonyDeps): Promise<{ stop: () => void }> {
  const { ai, port, systemPromptBase, resolveLiveModel, sessions, notifyAdmins } = deps

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
          audioQueue: [],
        }
        socket.data = state

        // 20ms'de bir frame gönder: queue'da varsa gerçek audio, yoksa sessizlik
        const silenceFrame = encodeAudioFrame(Buffer.alloc(AS_FRAME_BYTES, 0))
        let nextFrameAt = Date.now() + 20
        function scheduleFrame() {
          const delay = Math.max(0, nextFrameAt - Date.now())
          setTimeout(() => {
            if (state.closed) return
            nextFrameAt += 20
            const frame = state.audioQueue.shift()
            try {
              socket.write(frame ?? silenceFrame)
              scheduleFrame()
            } catch {
              // socket error — stop scheduling
            }
          }, delay)
        }
        scheduleFrame()

        try {
          // RAG pre-warm (web /ws ile aynı)
          let ragContext = ''
          try {
            const preWarmEmbedding = await embedText(PRE_WARM_QUERY)
            const topDocs = await retrieveDocsByEmbedding(preWarmEmbedding, 5)
            if (topDocs.length > 0) {
              ragContext = buildRagPrompt(topDocs)
              console.log(
                `[${shortId}] RAG: ${topDocs.length} belge → ${topDocs
                  .map((d) => d.title)
                  .join(', ')}`,
              )
            }
          } catch (e) {
            console.error(`[${shortId}] RAG hatası:`, e)
          }

          const phoneInstructions = '\n\nTELEFON KANALI TALİMATLARI: Görüşme doğal olarak bittiğinde (müşteri veda ettikten sonra, tüm istekler tamamlandıktan sonra) mutlaka cagriySonlandir aracını çağır. Müşteri "görüşürüz", "iyi günler", "teşekkürler hoşça kalın" gibi kapanış ifadeleri kullandıktan sonra kısa bir kapanış yap ve cagriySonlandir çağır.'
          const systemPrompt = systemPromptBase + ragContext + phoneInstructions
          const model = await resolveLiveModel()
          console.log(`[${shortId}] Gemini Live model: ${model}`)

          const session = await createLiveSession(
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
              onTranscript: (_role, _text) => {
                // Telefon kanalında transcript şu an UI'a iletilmiyor; ileride
                // SSE üzerinden admin'e aktarmak için burası kullanılabilir.
              },
              onInterrupted: () => {
                // Barge-in: müşteri konuştu, Gemini'nin önceki dönüş sesini temizle
                state.audioQueue.length = 0
                state.outChunker = new FrameChunker()
              },
              onHangup: () => {
                console.log(`[${shortId}] Gemini görüşmeyi sonlandırıyor`)
                if (state.closed) return
                try { socket.write(encodeHangupFrame()) } catch {}
                state.closed = true
                try { socket.end() } catch {}
              },
              onTurnComplete: () => {
                // no-op (Asterisk RTP kendisi pacing yapıyor)
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
              realtimeInputConfig: {
                automaticActivityDetection: {
                  startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
                  endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
                  prefixPaddingMs: 300,
                  silenceDurationMs: 1200,
                },
              },
            },
          )

          info.session = session
          sessions.set(shortId, info)
          notifyAdmins('session_start', {
            id: shortId,
            channel: 'phone',
            activeSessions: sessions.size,
          })

          // Gemini'ye telefon kanalı geldiğini bildir
          session.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [
                  {
                    text: 'Sistem bildirimi: Müşteri TELEFON üzerinden sesli görüşmeye bağlandı. (Bu satır müşteri adı veya talebi değildir; randevuya yazma.)',
                  },
                ],
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
            state.callerId = ev.uuid
            console.log(`[${state.shortId}] Asterisk UUID: ${ev.uuid}`)
          } else if (ev.type === 'audio') {
            const { info } = state
            if (!info.session) continue
            const pcm16 = upsample8to16(ev.pcm)
            info.session.sendRealtimeInput({
              media: {
                data: pcm16.toString('base64'),
                mimeType: 'audio/pcm;rate=16000',
              },
            })
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

  try { info.session?.close() } catch {}
  sessions.delete(shortId)
  console.log(`[${shortId}] AudioSocket disconnected`)
}
