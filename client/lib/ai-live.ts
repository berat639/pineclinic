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
  greeting: string
  branding: {
    title: string
    subtitle: string
    logoUrl: string
  }
  voiceName?: string
}

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
    case 'randevuGuncelle': return post('/api/tools/create-appointment', { ...args, _update: true })
    case 'randevuMusaitlikKontrol': return post('/api/tools/check-availability', args)
    case 'gecmisRandevular': return post('/api/tools/customer-query', { telefon: args.telefon })
    default: return { error: `Unknown tool: ${name}` }
  }
}

export class AiLiveSession {
  private session: Session | null = null
  private callbacks: LiveChatCallbacks
  private _isConnected = false
  private _sendGuard = false

  constructor(callbacks: LiveChatCallbacks) {
    this.callbacks = callbacks
  }

  async connect(apiKey: string, config: SessionConfig, mode: 'audio' | 'text' = 'audio'): Promise<void> {
    const modelName = config.model || 'gemini-3.8-live'

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
            responseModalities: mode === 'text' ? [Modality.TEXT] : [Modality.AUDIO],
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
    if (!this.session || !this._isConnected || this._sendGuard) return
    try {
      this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      })
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
