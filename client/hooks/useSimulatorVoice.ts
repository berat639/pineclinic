'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Type, type FunctionDeclaration } from '@google/genai'
import { AiLiveSession, type SessionConfig } from '@/lib/ai-live'
import { AudioStreamPlayer, MicrophoneCapture } from '@/lib/audio'

export type SimulatorVoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error'

export const SIMULATOR_NO_AI_MESSAGE = 'Bu klinik için yapay zeka bağlantısı tanımlı değil.'

export interface SimulatorVoiceOptions {
  direction: 'inbound' | 'outbound'
  /** Taslak akış (editördeki hâli). Yayındaki akışa dokunulmaz. */
  nodes: Array<{ id: string; type?: string; position?: unknown; data?: unknown }>
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; label?: unknown }>
  callerProfile: { kayitli: 'true' | 'false' }
  onTranscript: (e: { role: 'user' | 'assistant'; text: string }) => void
  onNodeVisited: (nodeId: string) => void
  onFieldsChanged: (fields: Record<string, string>) => void
}

type SimState = {
  currentNodeId: string | null
  visitedNodeIds: string[]
  visitedEdgeIds: string[]
  fields: Record<string, string>
}

const NODE_TYPE_MAP: Record<string, string> = {
  startNode: 'START',
  fieldNode: 'FIELD',
  conditionNode: 'CONDITION',
  actionNode: 'ACTION',
  endNode: 'END',
}

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'akisBilgisiGuncelle',
    description: 'Hastadan öğrenilen yeni veya düzeltilmiş bilgileri akışa işler ve sıradaki görevi döndürür.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        bilgiler: { type: Type.OBJECT, description: 'Alan adı → değer çiftleri (ör. ad, telefon, tarih, saat).' },
      },
      required: ['bilgiler'],
    },
  },
  {
    name: 'bilgiBankasindaAra',
    description: 'Kliniğin bilgi bankasında hastanın sorusuyla ilgili bilgi arar.',
    parameters: {
      type: Type.OBJECT,
      properties: { sorgu: { type: Type.STRING, description: 'Aranacak soru veya konu.' } },
      required: ['sorgu'],
    },
  },
  {
    name: 'cagriySonlandir',
    description: 'Görüşme tamamlandığında, konu dışı ısrar devam ettiğinde veya maksimum süre dolduğunda veda cümlesinden sonra görüşmeyi sonlandırır.',
    parameters: {
      type: Type.OBJECT,
      properties: { neden: { type: Type.STRING, description: 'Kapanış nedeni' } },
    },
  },
]

function toServerGraph(opts: SimulatorVoiceOptions) {
  const nodes = opts.nodes.map(n => {
    const { _issue, _simStatus, _onDuplicate, _onDelete, _canDelete, ...cleanData } = (n.data || {}) as Record<string, unknown>
    return {
      id: n.id,
      type: NODE_TYPE_MAP[String(n.type)] || String(n.type || 'END'),
      position: n.position,
      data: cleanData,
    }
  })
  const edges = opts.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    ...(typeof e.label === 'string' ? { label: e.label } : {}),
  }))
  return { nodes, edges }
}

async function callSimulator(body: Record<string, unknown>) {
  const res = await fetch('/api/admin/flow/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Simülasyon çalıştırılamadı.')
  return data
}

export function useSimulatorVoice(options: SimulatorVoiceOptions) {
  const [status, setStatus] = useState<SimulatorVoiceStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // Son seçenekler her zaman ref'te tutulur; oturum boyunca eski kapanışlar kullanılmaz.
  const optsRef = useRef(options)
  optsRef.current = options

  const sessionRef = useRef<AiLiveSession | null>(null)
  const playerRef = useRef<AudioStreamPlayer | null>(null)
  const micRef = useRef<MicrophoneCapture | null>(null)
  const maxWarnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runIdRef = useRef(0)
  const modelBufferRef = useRef('')
  const userBufferRef = useRef('')
  const stateRef = useRef<SimState>({ currentNodeId: null, visitedNodeIds: [], visitedEdgeIds: [], fields: {} })

  const flushUser = useCallback(() => {
    const text = userBufferRef.current.trim()
    userBufferRef.current = ''
    if (text) optsRef.current.onTranscript({ role: 'user', text })
  }, [])

  const flushModel = useCallback(() => {
    const text = modelBufferRef.current.trim()
    modelBufferRef.current = ''
    if (text) optsRef.current.onTranscript({ role: 'assistant', text })
  }, [])

  const release = useCallback(() => {
    if (maxWarnTimerRef.current) { clearTimeout(maxWarnTimerRef.current); maxWarnTimerRef.current = null }
    if (maxDurationTimerRef.current) { clearTimeout(maxDurationTimerRef.current); maxDurationTimerRef.current = null }
    if (closeFallbackTimerRef.current) { clearTimeout(closeFallbackTimerRef.current); closeFallbackTimerRef.current = null }
    micRef.current?.stop()
    micRef.current = null
    playerRef.current?.stop()
    playerRef.current = null
    sessionRef.current?.disconnect()
    sessionRef.current = null
  }, [])

  const stop = useCallback(() => {
    runIdRef.current += 1
    flushUser()
    flushModel()
    release()
    setStatus('idle')
  }, [flushModel, flushUser, release])

  // Bileşen kapanınca veya sekme kapanınca mikrofon mutlaka kapanır.
  useEffect(() => {
    const onUnload = () => release()
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      runIdRef.current += 1
      release()
    }
  }, [release])

  const applyState = useCallback((data: any) => {
    const prev = stateRef.current
    const next: SimState = {
      currentNodeId: data.currentNodeId ?? null,
      visitedNodeIds: Array.isArray(data.visitedNodeIds) ? data.visitedNodeIds : prev.visitedNodeIds,
      visitedEdgeIds: Array.isArray(data.visitedEdgeIds) ? data.visitedEdgeIds : prev.visitedEdgeIds,
      fields: data.fields && typeof data.fields === 'object' ? data.fields : prev.fields,
    }
    for (const id of next.visitedNodeIds) {
      if (!prev.visitedNodeIds.includes(id)) optsRef.current.onNodeVisited(id)
    }
    if (JSON.stringify(next.fields) !== JSON.stringify(prev.fields)) optsRef.current.onFieldsChanged(next.fields)
    stateRef.current = next
  }, [])

  /** Yalnızca bellekteki taslak grafı ilerletir; yayın akışına yazmaz. */
  const advance = useCallback(async (extraFields: Record<string, string>) => {
    const { nodes, edges } = toServerGraph(optsRef.current)
    const state = stateRef.current
    const data = await callSimulator({
      direction: optsRef.current.direction,
      nodes,
      edges,
      currentNodeId: state.currentNodeId,
      fields: { ...state.fields, ...extraFields },
      visitedNodeIds: state.visitedNodeIds,
      visitedEdgeIds: state.visitedEdgeIds,
      skipReply: true,
    })
    applyState(data)
    return data as { nextInstruction?: string; completed?: boolean }
  }, [applyState])

  const handleTool = useCallback(async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    try {
      if (name === 'akisBilgisiGuncelle') {
        const raw = (args.bilgiler || {}) as Record<string, unknown>
        const clean: Record<string, string> = {}
        for (const [k, v] of Object.entries(raw)) {
          const text = String(v ?? '').trim()
          if (text) clean[k] = text
        }
        const step = await advance(clean)
        return { success: true, mesaj: step.nextInstruction || 'Bilgi işlendi.', tamamlandi: Boolean(step.completed) }
      }
      if (name === 'bilgiBankasindaAra' || name === 'searchKnowledgeBase') {
        const { nodes, edges } = toServerGraph(optsRef.current)
        const data = await callSimulator({
          kind: 'sesli_bilgi',
          direction: optsRef.current.direction,
          nodes,
          edges,
          userMessage: String(args.sorgu || ''),
        })
        return (data.toolResult as Record<string, unknown>) || { sonuc: 'Bilgi bankasında ilgili kayıt bulunamadı.' }
      }
      if (name === 'cagriySonlandir') {
        micRef.current?.stop()
        micRef.current = null
        if (closeFallbackTimerRef.current) clearTimeout(closeFallbackTimerRef.current)
        closeFallbackTimerRef.current = setTimeout(() => {
          stop()
        }, 4500)
        return { success: true, mesaj: 'Görüşme sonlandırılıyor.' }
      }
      // Randevu, not vb. gerçek işlemler simülasyonda yürütülmez.
      return { success: true, mesaj: 'Simülasyon: bu işlem gerçekten kaydedilmedi.' }
    } catch (err) {
      return { success: false, mesaj: err instanceof Error ? err.message : 'Araç çalıştırılamadı.' }
    }
  }, [advance, stop])

  const start = useCallback(async () => {
    if (status !== 'idle' && status !== 'error') return
    const runId = ++runIdRef.current
    const alive = () => runIdRef.current === runId
    setError(null)
    setStatus('connecting')
    modelBufferRef.current = ''
    userBufferRef.current = ''

    // Tarayıcı izni için oynatıcı, tıklama anında oluşturulur.
    const player = new AudioStreamPlayer(24000)
    playerRef.current = player

    const fail = (message: string) => {
      if (!alive()) return
      release()
      setError(message)
      setStatus('error')
    }

    try {
      stateRef.current = {
        currentNodeId: null,
        visitedNodeIds: [],
        visitedEdgeIds: [],
        fields: { kayitli: optsRef.current.callerProfile.kayitli },
      }
      const { nodes, edges } = toServerGraph(optsRef.current)
      const setup = await callSimulator({ kind: 'sesli_ayar', direction: optsRef.current.direction, nodes, edges })
      if (!alive()) return
      const voice = setup.voiceConfig as {
        available: boolean
        message?: string
        apiKey?: string
        model?: string
        voiceName?: string
        thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
        turnDetectionMode?: 'semantic' | 'standard'
        noiseFilterMode?: 'rnnoise' | 'off'
        callMaxDuration?: number
        systemPrompt?: string
        greeting?: string
      } | undefined
      if (!voice?.available || !voice.apiKey) {
        fail(voice?.message || SIMULATOR_NO_AI_MESSAGE)
        return
      }

      const startNode = optsRef.current.nodes.find(n => n.type === 'startNode' || n.type === 'START')
      if (startNode) {
        stateRef.current.currentNodeId = startNode.id
        stateRef.current.visitedNodeIds = [startNode.id]
        optsRef.current.onNodeVisited(startNode.id)
      }

      const liveConfig: SessionConfig = {
        systemPrompt: voice.systemPrompt || '',
        toolDeclarations: TOOL_DECLARATIONS,
        model: voice.model || '',
        voiceName: voice.voiceName || 'Aoede',
        thinkingLevel: voice.thinkingLevel || 'LOW',
        turnDetectionMode: voice.turnDetectionMode || 'semantic',
        noiseFilterMode: voice.noiseFilterMode || 'rnnoise',
        textModel: 'gemini-2.5-flash',
        greeting: voice.greeting || '',
        branding: { title: '', subtitle: '', logoUrl: '' },
        toolHandler: handleTool,
      }

      const session = new AiLiveSession({
        onAudioChunk: data => {
          if (!alive()) return
          playerRef.current?.addChunk(data)
          setStatus('speaking')
        },
        onText: text => {
          flushUser()
          modelBufferRef.current += text
        },
        onUserText: text => {
          userBufferRef.current += text
        },
        onTurnComplete: () => {
          flushUser()
          flushModel()
          if (alive()) setStatus('listening')
        },
        onInterrupted: () => {
          flushModel()
          playerRef.current?.stop()
          playerRef.current = new AudioStreamPlayer(24000)
          if (alive()) setStatus('listening')
        },
        onConnectionChange: connected => {
          if (!connected && alive()) {
            release()
            setStatus('idle')
          }
        },
        onError: message => fail(message || 'Sesli bağlantı kurulamadı.'),
      })
      sessionRef.current = session
      await session.connect(voice.apiKey, liveConfig, 'audio')
      if (!alive()) { session.disconnect(); return }

      setStatus('listening')
      session.sendText(
        `Sistem bildirimi: Hasta sesli görüşmeye bağlandı (simülasyon). Yalnızca şu karşılama mesajını söyle: "${voice.greeting || 'Merhaba, size nasıl yardımcı olabilirim?'}" ` +
        `Karşılamayı söyledikten sonra DUR ve müşterinin konuşmasını bekle; müşteri konuşmadan başka soru sorma. Müşteri konuştuğunda akisBilgisiGuncelle aracını çağırarak sıradaki adıma geç. (Bu bir sistem bildirimidir, hasta adı sanma.)`,
      )

      const mic = new MicrophoneCapture({
        noiseFilter: (voice.noiseFilterMode ?? 'rnnoise') !== 'off',
      })
      micRef.current = mic
      await mic.start(pcm => session.sendAudio(pcm))
      if (!alive()) { mic.stop(); return }

      const maxSec = Math.min(900, Math.max(180, Number(voice.callMaxDuration) || 600))
      const maxMs = maxSec * 1000
      const warnMs = Math.max(10_000, maxMs - 20_000)
      maxWarnTimerRef.current = setTimeout(() => {
        if (!alive() || !sessionRef.current) return
        try {
          sessionRef.current.sendText(
            'Sistem: Maksimum görüşme süresinin dolmasına 20 saniye kaldı. Hastaya nazikçe sürenin dolmak üzere olduğunu söyleyip randevu/klinik işlemini hemen toparla.',
          )
        } catch {}
      }, warnMs)
      maxDurationTimerRef.current = setTimeout(() => {
        if (!alive()) return
        micRef.current?.stop()
        micRef.current = null
        try {
          sessionRef.current?.sendText(
            'Sistem: Maksimum görüşme süresi doldu. Şimdi "Üzgünüm, görüşme süremiz doldu. Görüşmeyi sonlandırıyorum, sağlıklı günler dilerim." de ve cagriySonlandir aracını çağır.',
          )
        } catch {}
        closeFallbackTimerRef.current = setTimeout(() => {
          if (alive()) stop()
        }, 6500)
      }, maxMs)
    } catch (err) {
      const denied = err instanceof Error && /permission|denied|notallowed/i.test(`${err.name} ${err.message}`)
      fail(denied ? 'Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verip tekrar deneyin.' : err instanceof Error && err.message ? err.message : 'Sesli simülasyon başlatılamadı.')
    }
  }, [advance, flushModel, flushUser, handleTool, release, status])

  return { status, error, start, stop }
}
