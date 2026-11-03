import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  type Session,
  type LiveServerMessage,
  type FunctionDeclaration,
} from '@google/genai'
import {
  buildRealtimeDetectionConfig,
  ENGLISH_INTERCEPT_RECOVERY_PROMPT,
  evaluateLiveKitTurkishTurn,
  isEnglishResponseDetected,
  SEMANTIC_TURN_PROMPT_INSTRUCTION,
  wrapWithTurkishLanguageLock,
  type NoiseFilterMode,
  type TurnAnalysisResult,
  type TurnDetectionMode,
} from './turn-detector'

export type LiveChatCallbacks = {
  onAudioChunk: (base64Data: string) => void
  onText: (text: string) => void
  onTurnComplete: () => void
  onConnectionChange: (connected: boolean) => void
  onError: (error: string) => void
  onInterrupted: () => void
  onInteractionStatus?: (status: 'IN_PROGRESS' | 'IDLE') => void
  /** Kullanıcının konuşmasının yazıya dökümü (sesli modda). */
  onUserText?: (text: string) => void
  /** LiveKit + Türkçe SOV sıra algılayıcı sonucu */
  onTurnDetection?: (result: TurnAnalysisResult) => void
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
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  startWaitSeconds?: number
  turnDetectionMode?: TurnDetectionMode
  noiseFilterMode?: NoiseFilterMode
  callSilenceTimeout?: number
  callSilenceCloseTimeout?: number
  callMaxDuration?: number
  offTopicMaxStrikes?: number
  offTopicCloseMessage?: string
  flowSession?: { id: string; token: string; revision?: number }
  sessionKey?: string
  /**
   * Verilirse araç çağrıları sunucudaki canlı uç noktalara gitmez, bu işleyiciye
   * yönlenir (ör. simülatör: hiçbir gerçek kayıt oluşturulmaz).
   */
  toolHandler?: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

// ── Tool call → server HTTP ────────────────────────────────────────────────
async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  flowSession?: { id: string; token: string; revision?: number },
  sessionKey?: string,
): Promise<Record<string, unknown>> {
  const token = flowSession?.token || sessionKey
  const post = async (path: string, body: Record<string, unknown>) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['x-flow-session-key'] = token
      const res = await fetch(path, {
        method: 'POST',
        headers,
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
    case 'hastaNotKaydet': {
      if (flowSession) {
        try {
          const response = await fetch(`/api/flow-sessions/${flowSession.id}/actions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-flow-session-key': flowSession.token },
            body: JSON.stringify({ name, args }),
          })
          return await response.json()
        } catch { return { success: false, message: 'Not kaydedilirken bir hata oluştu.' } }
      }
      return post('/api/tools/patient-note', args)
    }
    case 'searchKnowledgeBase': return post('/api/tools/search-knowledge', { sorgu: args.sorgu })
    case 'musteriSorgula': {
      const res = await post('/api/tools/customer-query', { telefon: args.telefon })
      if (flowSession && res && typeof res === 'object' && 'kayitli' in res) {
        try {
          const evRes = await fetch(`/api/flow-sessions/${flowSession.id}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-flow-session-key': flowSession.token },
            body: JSON.stringify({
              id: `${Date.now()}-${Math.random()}`,
              revision: flowSession.revision,
              fields: {
                telefon: String(args.telefon || ''),
                kayitli: res.kayitli ? 'true' : 'false',
                'caller.isKnownPatient': res.kayitli ? 'true' : 'false',
                ...(typeof res.musteri_adi === 'string' && res.musteri_adi ? { musteri_adi: res.musteri_adi } : {}),
              },
              intent: 'continue',
            }),
          })
          const evJson = await evRes.json().catch(() => null)
          if (evJson && typeof evJson.revision === 'number') flowSession.revision = evJson.revision
        } catch {}
      }
      return res
    }
    case 'randevuGuncelle': return post('/api/tools/create-appointment', { ...args, _update: true })
    case 'randevuDurumBildir': return post('/api/tools/appointment-status', args)
    case 'randevuMusaitlikKontrol': return post('/api/tools/check-availability', args)
    case 'gecmisRandevular': return post('/api/tools/customer-query', { telefon: args.telefon })
    case 'havaDurumuSorgula': return { success: true, sehir: String(args.sehir || 'Ankara'), sicaklik: '21°C', durum: 'açık ve güneşli', message: `${String(args.sehir || 'Ankara')}'da hava şu an yaklaşık 21 derece, açık ve güneşli.` }
    default: return { error: `Bilinmeyen araç: ${name}` }
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
  private sessionKey?: string
  private toolHandler?: SessionConfig['toolHandler']
  private _interactionInProgress = false
  private _turnMode: TurnDetectionMode = 'semantic'
  private _lastAssistantTranscript = ''
  private _currentModelTranscript = ''
  private _currentUserTranscript = ''
  private _englishInterceptedInTurn = false
  private _englishRecoveryCount = 0
  private _pendingClientTexts: string[] = []
  private _setupReady = false

  constructor(callbacks: LiveChatCallbacks) {
    this.callbacks = callbacks
  }

  private flushPendingTexts() {
    if (!this.session || !this._isConnected || this._sendGuard || this._pendingClientTexts.length === 0) return
    while (this._pendingClientTexts.length > 0) {
      const text = this._pendingClientTexts.shift()
      if (text) {
        try {
          this.session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text }] }],
            turnComplete: true,
          })
        } catch { /* ignore */ }
      }
    }
  }

  async connect(apiKey: string, config: SessionConfig, mode: 'audio' | 'text' = 'audio'): Promise<void> {
    const modelName = config.model || 'gemini-3.8-live'
    this.flowSession = config.flowSession
    this.sessionKey = config.flowSession?.token || config.sessionKey
    this.toolHandler = config.toolHandler
    this._interactionInProgress = false
    this._turnMode = config.turnDetectionMode === 'standard' ? 'standard' : 'semantic'
    this._lastAssistantTranscript = ''
    this._currentModelTranscript = ''
    this._currentUserTranscript = ''
    this._englishInterceptedInTurn = false
    this._englishRecoveryCount = 0
    this._pendingClientTexts = []
    this._setupReady = false

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

    const turnMode: TurnDetectionMode = config.turnDetectionMode === 'standard' ? 'standard' : 'semantic'
    const baseSystemPrompt = turnMode === 'semantic'
      ? `${config.systemPrompt}\n\n${SEMANTIC_TURN_PROMPT_INSTRUCTION}`
      : config.systemPrompt
    const effectiveSystemPrompt = wrapWithTurkishLanguageLock(baseSystemPrompt)

    return new Promise<void>((resolve, reject) => {
      const ai = new GoogleGenAI({ apiKey })
      let resolved = false
      const finishConnect = () => {
        if (!resolved && this.session && this._isConnected) {
          resolved = true
          this._setupReady = true
          this.flushPendingTexts()
          resolve()
        }
      }

      ai.live
        .connect({
          model: `models/${modelName}`,
          callbacks: {
            onopen: () => {
              this._isConnected = true
              this.callbacks.onConnectionChange(true)
            },
            onmessage: (message: LiveServerMessage) => {
              if ((message as any).setupComplete) {
                this._setupReady = true
                finishConnect()
              }
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
            systemInstruction: effectiveSystemPrompt,
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
            realtimeInputConfig: mode === 'audio'
              ? buildRealtimeDetectionConfig(turnMode)
              : undefined,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            ...(modelName === 'gemini-3.8-live-extended-thinking' ? {
              thinkingConfig: { thinkingLevel: ThinkingLevel[config.thinkingLevel || 'LOW'] },
            } : {}),
          },
        })
        .then((session) => {
          this.session = session
          if (this._setupReady) {
            finishConnect()
          } else {
            // setupComplete onmessage içinde gelmiş veya 120ms içinde gelecek olabilir
            setTimeout(() => finishConnect(), 120)
          }
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

    if (!this.session || !this._setupReady) {
      this._pendingClientTexts.push(text)
      return
    }
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
          model: config.textModel || 'gemini-3.8-flash',
          contents: this.textHistory as any,
          config: {
            systemInstruction: wrapWithTurkishLanguageLock(config.systemPrompt),
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
          response: await this.runTool(call.name ?? '', (call.args ?? {}) as Record<string, unknown>),
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
    this.toolHandler = undefined
    if (this.flowSession) {
      const { id, token } = this.flowSession
      this.flowSession = undefined
      void fetch(`/api/flow-sessions/${id}`, { method: 'DELETE', headers: { 'x-flow-session-key': token } })
    }
  }

  get connected() { return this._isConnected }
  get interactionInProgress() { return this._interactionInProgress }

  private runTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.toolHandler) return this.toolHandler(name, args)
    return handleToolCall(name, args, this.flowSession, this.sessionKey)
  }

  private triggerEnglishGuard() {
    if (this._englishInterceptedInTurn) return
    this._englishInterceptedInTurn = true
    this._currentModelTranscript = ''
    this.callbacks.onInterrupted()
    if (this._englishRecoveryCount < 4 && this.session && this._isConnected && !this._sendGuard) {
      this._englishRecoveryCount += 1
      try {
        this.session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: ENGLISH_INTERCEPT_RECOVERY_PROMPT }] }],
          turnComplete: true,
        })
      } catch { /* ignore */ }
    }
  }

  private handleMessage(message: LiveServerMessage) {
    // Tool calls
    if (message.toolCall?.functionCalls?.length) {
      for (const fc of message.toolCall.functionCalls) {
        this.runTool(fc.name ?? '', (fc.args ?? {}) as Record<string, unknown>)
          .then((result) => {
            if (this.session && this._isConnected) {
              try {
                this.session.sendToolResponse({
                  functionResponses: [{
                    id: fc.id,
                    name: fc.name ?? '',
                    response: {
                      ...result,
                      _dil_kurali: 'YALNIZCA TÜRKÇE KONUŞ. İngilizce tek kelime bile kullanma.',
                    },
                  }],
                })
              } catch { /* */ }
            }
          })
          .catch(() => {
            if (this.session && this._isConnected) {
              try {
                this.session.sendToolResponse({
                  functionResponses: [{
                    id: fc.id,
                    name: fc.name ?? '',
                    response: {
                      success: false,
                      message: 'Araç çalıştırılamadı. Yalnızca Türkçe yanıt ver.',
                      _dil_kurali: 'YALNIZCA TÜRKÇE KONUŞ.',
                    },
                  }],
                })
              } catch { /* */ }
            }
          })
      }
    }

    const interactionStatus = (message.serverContent as any)?.interactionStatus ?? (message as any).interactionStatus
    if (interactionStatus === 'IN_PROGRESS' || interactionStatus === 'IDLE') {
      this._interactionInProgress = interactionStatus === 'IN_PROGRESS'
      this.callbacks.onInteractionStatus?.(interactionStatus)
    }

    // Output transcription (text of what AI said in audio mode) — kontrolü
    // ses parçalarından önce yapılır ki İngilizce algılandığı anda ses kesilsin.
    const transcript = (message as any).serverContent?.outputTranscription?.text
    if (transcript && !this._englishInterceptedInTurn) {
      this._currentModelTranscript = `${this._currentModelTranscript}${transcript}`.slice(-600)
      this._currentUserTranscript = ''
      if (isEnglishResponseDetected(this._currentModelTranscript)) {
        this.triggerEnglishGuard()
      } else {
        this.callbacks.onText(transcript)
      }
    }

    // Audio parts (modelTurn.parts[].text Native Audio modunda iç düşünce/thought içerdiği için yok sayılır)
    if (!this._englishInterceptedInTurn && message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (!this._englishInterceptedInTurn && part?.inlineData?.data) {
          this.callbacks.onAudioChunk(part.inlineData.data)
        }
      }
    }

    const userTranscript = (message as any).serverContent?.inputTranscription?.text
    if (userTranscript) {
      this._currentUserTranscript = `${this._currentUserTranscript} ${userTranscript}`.trim().slice(-500)
      this.callbacks.onUserText?.(userTranscript)
      if (this._turnMode === 'semantic') {
        const analysis = evaluateLiveKitTurkishTurn({
          userText: this._currentUserTranscript,
          assistantText: this._lastAssistantTranscript,
        })
        this.callbacks.onTurnDetection?.(analysis)
      }
    }

    if (message.serverContent?.turnComplete) {
      const wasEnglishBlocked = this._englishInterceptedInTurn
      if (!wasEnglishBlocked && this._currentModelTranscript.trim()) {
        this._lastAssistantTranscript = this._currentModelTranscript.trim()
      }
      this._currentModelTranscript = ''
      this._currentUserTranscript = ''
      this._englishInterceptedInTurn = false
      if (!wasEnglishBlocked) {
        this.callbacks.onTurnComplete()
      }
    }
    if (message.serverContent?.interrupted) {
      this._currentModelTranscript = ''
      this._englishInterceptedInTurn = false
      this.callbacks.onInterrupted()
    }
  }
}
