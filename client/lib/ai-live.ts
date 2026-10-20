import {
  GoogleGenAI,
  Modality,
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

export type SessionConfig = {
  systemPrompt: string
  toolDeclarations: FunctionDeclaration[]
  model: string
  /** Metin sohbeti Live modelini kullanmaz; Live modelleri TEXT çıktısı desteklemez. */
  textModel: string
  greeting: string
  branding: {
    title: string
    subtitle: string
    logoUrl: string
  }
  voiceName?: string
  startWaitSeconds?: number
  callSilenceTimeout?: number
  callSilenceCloseTimeout?: number
  callMaxDuration?: number
  flowSession?: { id: string; token: string; revision?: number }
}

// ── Tool call → server HTTP ────────────────────────────────────────────────
async function handleToolCall(name: string, args: Record<string, unknown>, flowSession?: { id: string; token: string; revision?: number }): Promise<Record<string, unknown>> {
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
    case 'akisBilgisiGuncelle': {
      if (!flowSession) return { success: false, message: 'Akışla çalışma bu görüşmede açık değil.' }
      let result: Record<string, unknown>
      try {
        const response = await fetch(`/api/flow-sessions/${flowSession.id}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-flow-session-key': flowSession.token },
          body: JSON.stringify({
            id: `${Date.now()}-${Math.random()}`,
            revision: flowSession.revision,
            fields: (args.bilgiler || {}) as Record<string, unknown>,
            intent: args.yeni_kisi === true ? 'new_person' : 'continue',
          }),
        })
        result = await response.json()
      } catch { return { success: false, message: 'Akış bilgisi güncellenemedi.' } }
      if (typeof result.revision === 'number') flowSession.revision = result.revision
      return result
    }
    case 'randevuOlustur': {
      if (!flowSession) return post('/api/tools/create-appointment', args)
      try {
        const response = await fetch(`/api/flow-sessions/${flowSession.id}/actions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-flow-session-key': flowSession.token },
          body: JSON.stringify({ name, args }),
        })
        return await response.json()
      } catch { return { success: false, message: 'Randevu işlemi şu an tamamlanamadı.' } }
    }
    case 'searchKnowledgeBase': return post('/api/tools/search-knowledge', { sorgu: args.sorgu })
    case 'musteriSorgula': return post('/api/tools/customer-query', { telefon: args.telefon })
    case 'randevuGuncelle': return post('/api/tools/create-appointment', { ...args, _update: true })
    case 'randevuMusaitlikKontrol': return post('/api/tools/check-availability', args)
    case 'gecmisRandevular': return post('/api/tools/customer-query', { telefon: args.telefon })
    default: return { error: `Unknown tool: ${name}` }
  }
}

export class AiLiveSession {
  private session: Session | null = null
  private textAi: GoogleGenAI | null = null
  private textConfig: SessionConfig | null = null
  private textHistory: Array<Record<string, unknown>> = []
  private textQueue: Promise<void> = Promise.resolve()
  private callbacks: LiveChatCallbacks
  private _isConnected = false
  private _sendGuard = false
  private flowSession?: { id: string; token: string; revision?: number }

  constructor(callbacks: LiveChatCallbacks) {
    this.callbacks = callbacks
  }

  async connect(apiKey: string, config: SessionConfig, mode: 'audio' | 'text' = 'audio'): Promise<void> {
    const modelName = config.model || 'gemini-3.8-live'
    this.flowSession = config.flowSession

    // Gemini Live is an audio session. Requesting TEXT from it causes
    // "response modalities (TEXT) is not supported". Keep text chat on the
    // regular content-generation API, while voice continues to use Live.
    if (mode === 'text') {
      this.textAi = new GoogleGenAI({ apiKey })
      this.textConfig = config
      this.textHistory = []
      this.textQueue = Promise.resolve()
      this._sendGuard = false
      this._isConnected = true
      this.callbacks.onConnectionChange(true)
      return
    }

    return new Promise<void>((resolve, reject) => {
      const ai = new GoogleGenAI({ apiKey })
      let resolved = false

      ai.live
        .connect({
          model: `models/${modelName}`,
          callbacks: {
            onopen: () => {
              // console.log('[Live] Connected')
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
              this._sendGuard = true
              this.callbacks.onError(e.message || 'Bağlantı hatası')
              if (!resolved) { resolved = true; reject(new Error(e.message || 'Failed')) }
            },
            onclose: (e: CloseEvent) => {
              this._isConnected = false
              this._sendGuard = true
              this.callbacks.onConnectionChange(false)
              if (e.code !== 1000) {
                const reason = e.reason || `Bağlantı kesildi (kod: ${e.code})`
                console.error(`[Live] Closed: ${e.code} reason: ${e.reason}`)
                this.callbacks.onError(reason)
                if (!resolved) { resolved = true; reject(new Error(reason)) }
              } else {
                if (!resolved) { resolved = true; resolve() }
              }
            },
          },
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: config.systemPrompt,
            tools: config.toolDeclarations.length > 0
              ? [{ functionDeclarations: config.toolDeclarations }]
              : undefined,
            contextWindowCompression: {
              triggerTokens: '25600',
              slidingWindow: {
                targetTokens: '16000',
              },
            },
            speechConfig: mode === 'audio' ? {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: config.voiceName || 'Aoede',
                },
              },
            } : undefined,
            realtimeInputConfig: mode === 'audio' ? {
              automaticActivityDetection: {
                disabled: false,
              },
            } : undefined,
          },
        })
        .then((session) => {
          this.session = session
          // console.log(`[Live] Session: ${modelName}`)
        })
        .catch((err) => {
          console.error('[Live] Connect failed:', err)
          this._isConnected = false
          if (!resolved) { resolved = true; reject(err) }
        })
    })
  }

  sendAudio(base64PCM: string) {
    if (!this.session || !this._isConnected || this._sendGuard) return
    try {
      this.session.sendRealtimeInput({
        audio: { data: base64PCM, mimeType: 'audio/pcm;rate=16000' },
      })
    } catch {
      this._isConnected = false
      this._sendGuard = true
    }
  }

  sendText(text: string) {
    if (!this._isConnected || this._sendGuard) return

    if (this.textAi && this.textConfig) {
      // Greeting and a quickly typed first message must retain their order.
      this.textQueue = this.textQueue.then(() => this.sendTextChat(text))
      return
    }

    if (!this.session) return
    try {
      this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      })
    } catch { /* ignore */ }
  }

  private async sendTextChat(text: string): Promise<void> {
    const ai = this.textAi
    const config = this.textConfig
    if (!ai || !config || !this._isConnected || this._sendGuard) return

    this.textHistory.push({ role: 'user', parts: [{ text }] })

    try {
      // A tool can require one or more model round trips before it produces
      // visible text. Cap the loop to avoid a malformed tool response keeping
      // the browser request alive forever.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await ai.models.generateContent({
          model: config.textModel || 'gemini-2.5-flash',
          contents: this.textHistory as any,
          config: {
            systemInstruction: config.systemPrompt,
            tools: config.toolDeclarations.length > 0
              ? [{ functionDeclarations: config.toolDeclarations }]
              : undefined,
          },
        })

        const functionCalls = response.functionCalls ?? []
        if (functionCalls.length === 0) {
          const answer = response.text?.trim()
          if (answer) this.callbacks.onText(answer)
          this.callbacks.onTurnComplete()
          return
        }

        this.textHistory.push({
          role: 'model',
          parts: functionCalls.map(call => ({
            functionCall: { name: call.name, args: call.args ?? {} },
          })),
        })

        const results = await Promise.all(functionCalls.map(async (call) => ({
          name: call.name,
          response: await handleToolCall(call.name ?? '', (call.args ?? {}) as Record<string, unknown>, this.flowSession),
        })))
        this.textHistory.push({
          role: 'user',
          parts: results.map(result => ({ functionResponse: result })),
        })
      }

      throw new Error('Araç yanıtı tamamlanamadı. Lütfen tekrar deneyin.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Yazılı asistan yanıt veremedi.'
      console.error('[Text chat] Error:', error)
      this._isConnected = false
      this.callbacks.onConnectionChange(false)
      this.callbacks.onError(message)
    }
  }

  disconnect() {
    this._isConnected = false
    if (this.session) {
      try { this.session.close() } catch { /* */ }
      this.session = null
    }
    this.textAi = null
    this.textConfig = null
    this.textHistory = []
    this.textQueue = Promise.resolve()
    if (this.flowSession) {
      const { id, token } = this.flowSession
      this.flowSession = undefined
      void fetch(`/api/flow-sessions/${id}`, { method: 'DELETE', headers: { 'x-flow-session-key': token } })
    }
  }

  get connected() { return this._isConnected }

  private handleMessage(message: LiveServerMessage) {
    // Tool calls
    if (message.toolCall?.functionCalls?.length) {
      for (const fc of message.toolCall.functionCalls) {
        handleToolCall(fc.name ?? '', fc.args as Record<string, unknown>, this.flowSession)
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

    // Output transcription (text of what AI said in audio mode)
    const transcript = (message as any).serverContent?.outputTranscription?.text
    if (transcript) {
      // console.log('[AI]', transcript)
      this.callbacks.onText(transcript)
    }

    if (message.serverContent?.turnComplete) this.callbacks.onTurnComplete()
    if (message.serverContent?.interrupted) this.callbacks.onInterrupted()
  }
}
