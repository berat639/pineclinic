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

// ── Tool declarations — bilgi tabanı, randevu, müşteri sorgu ──────────────
const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'searchKnowledgeBase',
    description: 'Bilgi tabanında arama yapar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sorgu: { type: Type.STRING, description: 'Aranacak konu veya soru' },
      },
      required: ['sorgu'],
    },
  },
  {
    name: 'musteriSorgula',
    description: 'Telefon numarasıyla müşteri bilgisini getirir.',
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
    description: 'Müşteri için randevu oluşturur.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        musteri_adi: { type: Type.STRING, description: 'Ad soyad' },
        telefon: { type: Type.STRING, description: 'Telefon' },
        randevu_turu: { type: Type.STRING, enum: ['service', 'test_drive', 'gallery_visit', 'other'], description: 'Randevu türü' },
        arac_bilgisi: { type: Type.STRING, description: 'Araç bilgisi' },
        plaka: { type: Type.STRING, description: 'Plaka' },
        sorun_veya_talep: { type: Type.STRING, description: 'Şikayet/talep' },
        tarih: { type: Type.STRING, description: 'YYYY-MM-DD' },
        saat: { type: Type.STRING, description: 'HH:MM' },
      },
      required: ['musteri_adi', 'telefon', 'randevu_turu', 'tarih', 'saat'],
    },
  },
  {
    name: 'randevuMusaitlikKontrol',
    description: 'Tarih müsaitliğini kontrol eder.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tarih: { type: Type.STRING, description: 'YYYY-MM-DD' },
      },
      required: [],
    },
  },
]

// ── Tool call → server HTTP ────────────────────────────────────────────────
async function handleToolCall(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const post = async (path: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return await res.json()
    } catch {
      return { error: 'Sunucuya erişilemedi.' }
    }
  }

  switch (name) {
    case 'searchKnowledgeBase': return post('/api/tools/search-knowledge', { sorgu: args.sorgu })
    case 'musteriSorgula': return post('/api/tools/customer-query', { telefon: args.telefon })
    case 'randevuOlustur': return post('/api/tools/create-appointment', args)
    case 'randevuMusaitlikKontrol': return post('/api/tools/check-availability', args)
    default: return { error: `Unknown tool: ${name}` }
  }
}

// ── System prompt ──────────────────────────────────────────────────────────
function getSystemPrompt(): string {
  const today = new Date()
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  return `Sen Türkçe konuşan, sıcak ve profesyonel bir otomotiv müşteri danışmanısın.
Bugünün tarihi: ${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()} ${days[today.getDay()]}

Müşteriyle doğal ve samimi konuş. Kısa, net cümleler kur.
Bilgi tabanından bilgi almak için searchKnowledgeBase aracını kullan.
Müşteri telefon numarası verdiğinde musteriSorgula aracını kullan.
Randevu oluşturmak için randevuOlustur aracını kullan.
Müsaitlik kontrolü için randevuMusaitlikKontrol aracını kullan.
Sadece Türkçe konuş.`
}

export class GeminiLiveSession {
  private session: Session | null = null
  private callbacks: LiveChatCallbacks
  private _isConnected = false

  constructor(callbacks: LiveChatCallbacks) {
    this.callbacks = callbacks
  }

  async connect(apiKey: string, model?: string): Promise<void> {
    const modelName = model || 'gemini-3.1-flash-live-preview'

    return new Promise<void>((resolve, reject) => {
      const ai = new GoogleGenAI({ apiKey })
      let resolved = false

      ai.live
        .connect({
          model: `models/${modelName}`,
          callbacks: {
            onopen: () => {
              console.log('[Live] Connected')
              this._isConnected = true
              this.callbacks.onConnectionChange(true)
              if (!resolved) { resolved = true; resolve() }
            },
            onmessage: (message: LiveServerMessage) => {
              this.handleMessage(message)
            },
            onerror: (e: ErrorEvent) => {
              console.error('[Live] Error:', e.message || e)
              this._isConnected = false
              this.callbacks.onError(e.message || 'Bağlantı hatası')
              if (!resolved) { resolved = true; reject(new Error(e.message || 'Failed')) }
            },
            onclose: (e: CloseEvent) => {
              console.log(`[Live] Closed: ${e.code}`)
              this._isConnected = false
              this.callbacks.onConnectionChange(false)
              if (!resolved) { resolved = true; reject(new Error(`Closed: ${e.reason || e.code}`)) }
            },
          },
          config: {
            responseModalities: [Modality.AUDIO],
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
            systemInstruction: getSystemPrompt(),
            tools: [
              { functionDeclarations: TOOL_DECLARATIONS }
            ],
            contextWindowCompression: {
              triggerTokens: '104857',
              slidingWindow: {
                targetTokens: '52428',
              },
            },
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
          console.log(`[Live] Session: ${modelName}`)
        })
        .catch((err) => {
          console.error('[Live] Connect failed:', err)
          this._isConnected = false
          if (!resolved) { resolved = true; reject(err) }
        })
    })
  }

  sendAudio(base64PCM: string) {
    if (!this.session || !this._isConnected) return
    try {
      this.session.sendRealtimeInput({
        audio: { data: base64PCM, mimeType: 'audio/pcm;rate=16000' },
      })
    } catch { /* ignore */ }
  }

  sendText(text: string) {
    if (!this.session || !this._isConnected) return
    try {
      this.session.sendClientContent({ turns: [text] })
    } catch { /* ignore */ }
  }

  disconnect() {
    this._isConnected = false
    if (this.session) {
      try { this.session.close() } catch { /* */ }
      this.session = null
    }
  }

  get connected() { return this._isConnected }

  private handleMessage(message: LiveServerMessage) {
    // Tool calls
    if (message.toolCall?.functionCalls?.length) {
      for (const fc of message.toolCall.functionCalls) {
        handleToolCall(fc.name ?? '', fc.args as Record<string, unknown>)
          .then((result) => {
            if (this.session && this._isConnected) {
              try {
                this.session.sendToolResponse({
                  functionResponses: [{ id: fc.id, name: fc.name ?? '', response: result }],
                })
              } catch { /* */ }
            }
          })
          .catch(() => {
            if (this.session && this._isConnected) {
              try {
                this.session.sendToolResponse({
                  functionResponses: [{ id: fc.id, name: fc.name ?? '', response: { error: 'failed' } }],
                })
              } catch { /* */ }
            }
          })
      }
      return
    }

    // Audio & text
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part?.inlineData?.data) this.callbacks.onAudioChunk(part.inlineData.data)
        if (part?.text) this.callbacks.onText(part.text)
      }
    }

    if (message.serverContent?.turnComplete) this.callbacks.onTurnComplete()
    if (message.serverContent?.interrupted) this.callbacks.onInterrupted()
  }
}
