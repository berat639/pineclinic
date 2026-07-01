import {
  GoogleGenAI,
  Modality,
  MediaResolution,
  Type,
  type Session,
  type LiveServerMessage,
  type FunctionDeclaration,
} from '@google/genai'

export type LiveChatCallbacks = {
  onAudioChunk: (base64Data: string) => void
  onText: (text: string) => void
  onTurnComplete: () => void
  onConnectionChange: (connected: boolean) => void
  onError: (error: string) => void
  onInterrupted: () => void
}

// ── Tool declarations (same as server-side Gemini config) ─────────────────
const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'searchKnowledgeBase',
    description: 'Bilgi tabanında arama yapar. Araç fiyatları, kampanyalar, servis detayları, garanti bilgileri için kullan.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sorgu: { type: Type.STRING, description: 'Aranacak konu veya soru (Türkçe)' },
      },
      required: ['sorgu'],
    },
  },
  {
    name: 'musteriSorgula',
    description: 'Müşterinin telefon numarasıyla sistemden müşteri bilgisini getirir.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        telefon: { type: Type.STRING, description: 'Müşterinin telefon numarası' },
      },
      required: ['telefon'],
    },
  },
  {
    name: 'randevuOlustur',
    description: 'Müşteri için servis veya galeri randevusu oluşturur.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        musteri_adi: { type: Type.STRING, description: 'Müşterinin ad soyadı' },
        telefon: { type: Type.STRING, description: 'Müşterinin telefonu' },
        randevu_turu: {
          type: Type.STRING,
          enum: ['service', 'test_drive', 'gallery_visit', 'other'],
          description: 'Randevu türü',
        },
        arac_bilgisi: { type: Type.STRING, description: 'Araç marka, model ve yıl' },
        plaka: { type: Type.STRING, description: 'Araç plakası' },
        sorun_veya_talep: { type: Type.STRING, description: 'Müşterinin şikayeti veya talebi' },
        tarih: { type: Type.STRING, description: 'Randevu tarihi (YYYY-MM-DD)' },
        saat: { type: Type.STRING, description: 'Randevu saati (HH:MM)' },
      },
      required: ['musteri_adi', 'telefon', 'randevu_turu', 'tarih', 'saat'],
    },
  },
  {
    name: 'randevuMusaitlikKontrol',
    description: 'Belirli bir tarihteki müsaitliği kontrol eder.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tarih: { type: Type.STRING, description: 'Kontrol edilecek tarih (YYYY-MM-DD)' },
        baslangic_tarih: { type: Type.STRING, description: 'Tarih aralığı başlangıcı' },
        bitis_tarih: { type: Type.STRING, description: 'Tarih aralığı bitişi' },
      },
      required: [],
    },
  },
]

// ── Tool call handler: routes tool calls to server HTTP endpoints ──────────
async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  serverBaseUrl: string,
): Promise<Record<string, unknown>> {
  const post = async (path: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch(`${serverBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return await res.json()
    } catch (err) {
      console.error(`[ToolCall] ${path} failed:`, err)
      return { error: 'Sunucuya erişilemedi.' }
    }
  }

  switch (name) {
    case 'searchKnowledgeBase':
      return post('/api/tools/search-knowledge', { sorgu: args.sorgu })
    case 'musteriSorgula':
      return post('/api/tools/customer-query', { telefon: args.telefon })
    case 'randevuOlustur':
      return post('/api/tools/create-appointment', args)
    case 'randevuMusaitlikKontrol':
      return post('/api/tools/check-availability', args)
    case 'cagriySonlandir':
      return { success: true }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ── System prompt (same as server) ────────────────────────────────────────
function getSystemPrompt(): string {
  const today = new Date()
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  const todayStr = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()} ${days[today.getDay()]}`

  return `Sen Türkçe konuşan, sıcak ve profesyonel bir otomotiv müşteri danışmanısın.
Bugünün tarihi: ${todayStr}

Müşteriyle doğal ve samimi konuş. Kısa, net cümleler kur.
Bilgi tabanından bilgi almak için searchKnowledgeBase aracını kullan.
Müşteri telefon numarası verdiğinde musteriSorgula aracını kullan.
Randevu oluşturmak için randevuOlustur aracını kullan.
Müsaitlik kontrolü için randevuMusaitlikKontrol aracını kullan.

Müşteri ad, telefon ve randevu bilgilerini onaylamadan randevu oluşturma.
Fiyat bilgisi verme — "servisimiz sizi bilgilendirecek" de.
Sadece Türkçe konuş.`
}

export class GeminiLiveSession {
  private session: Session | null = null
  private callbacks: LiveChatCallbacks
  private _isConnected = false
  private serverBaseUrl = ''

  constructor(callbacks: LiveChatCallbacks) {
    this.callbacks = callbacks
  }

  async connect(apiKey: string, serverBaseUrl?: string): Promise<void> {
    // Determine server base URL for tool calls
    if (serverBaseUrl) {
      this.serverBaseUrl = serverBaseUrl
    } else if (typeof window !== 'undefined') {
      // Default: proxy through Next.js rewrites (same origin)
      this.serverBaseUrl = ''
    }

    return new Promise<void>((resolve, reject) => {
      const ai = new GoogleGenAI({ apiKey })

      let resolved = false

      ai.live
        .connect({
          model: 'models/gemini-3.1-flash-live-preview',
          callbacks: {
            onopen: () => {
              console.log('[Live] WebSocket connected')
              this._isConnected = true
              this.callbacks.onConnectionChange(true)
              if (!resolved) {
                resolved = true
                resolve()
              }
            },
            onmessage: (message: LiveServerMessage) => {
              this.handleMessage(message)
            },
            onerror: (e: ErrorEvent) => {
              console.error('[Live] WebSocket error:', e.message || e)
              this._isConnected = false
              this.callbacks.onError(
                e.message || 'WebSocket bağlantı hatası'
              )
              if (!resolved) {
                resolved = true
                reject(new Error(e.message || 'Connection failed'))
              }
            },
            onclose: (e: CloseEvent) => {
              console.log(
                `[Live] WebSocket closed: code=${e.code} reason="${e.reason}"`
              )
              this._isConnected = false
              this.callbacks.onConnectionChange(false)
              if (!resolved) {
                resolved = true
                reject(
                  new Error(`Connection closed: ${e.reason || e.code}`)
                )
              }
            },
          },
          config: {
            responseModalities: [Modality.AUDIO],
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
            systemInstruction: getSystemPrompt(),
            tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Orus',
                },
              },
            },
          },
        })
        .then((session) => {
          this.session = session
          console.log('[Live] Session created with tool calling')
        })
        .catch((err) => {
          console.error('[Live] Connect failed:', err)
          this._isConnected = false
          if (!resolved) {
            resolved = true
            reject(err)
          }
        })
    })
  }

  sendAudio(base64PCM: string) {
    if (!this.session || !this._isConnected) return

    try {
      this.session.sendRealtimeInput({
        audio: {
          data: base64PCM,
          mimeType: 'audio/pcm;rate=16000',
        },
      })
    } catch {
      // WebSocket might have closed between the check and send — ignore
    }
  }

  sendText(text: string) {
    if (!this.session || !this._isConnected) return

    try {
      this.session.sendClientContent({
        turns: [text],
      })
    } catch {
      // Ignore if connection is closing
    }
  }

  disconnect() {
    this._isConnected = false
    if (this.session) {
      try {
        this.session.close()
      } catch {
        // Already closed
      }
      this.session = null
    }
  }

  get connected() {
    return this._isConnected
  }

  private handleMessage(message: LiveServerMessage) {
    // ── Tool calls ─────────────────────────────────────────────
    if (message.toolCall?.functionCalls?.length) {
      for (const fc of message.toolCall.functionCalls) {
        const fcName = fc.name ?? ''
        const fcId = fc.id
        console.log(`[Live] Tool call: ${fcName}`, fc.args)

        handleToolCall(fcName, fc.args as Record<string, unknown>, this.serverBaseUrl)
          .then((result) => {
            console.log(`[Live] Tool result for ${fcName}:`, result)
            if (this.session && this._isConnected) {
              try {
                this.session.sendToolResponse({
                  functionResponses: [{ id: fcId, name: fcName, response: result }],
                })
              } catch (err) {
                console.error(`[Live] sendToolResponse failed:`, err)
              }
            }
          })
          .catch((err) => {
            console.error(`[Live] Tool call ${fcName} failed:`, err)
            if (this.session && this._isConnected) {
              try {
                this.session.sendToolResponse({
                  functionResponses: [{ id: fcId, name: fcName, response: { error: 'tool failed' } }],
                })
              } catch { /* ignore */ }
            }
          })
      }
      return
    }

    // ── Audio and text content ─────────────────────────────────
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part?.inlineData?.data) {
          this.callbacks.onAudioChunk(part.inlineData.data)
        }
        if (part?.text) {
          this.callbacks.onText(part.text)
        }
      }
    }

    if (message.serverContent?.turnComplete) {
      this.callbacks.onTurnComplete()
    }

    if (message.serverContent?.interrupted) {
      this.callbacks.onInterrupted()
    }
  }
}
