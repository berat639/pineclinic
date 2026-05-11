'use client'

import { useCallback, useRef, useState } from 'react'

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error'
export type TranscriptEntry = { role: 'user' | 'model'; text: string; id: string }

export function useVoiceAI(wsUrl: string) {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])

  // Refs (avoid re-renders)
  const wsRef = useRef<WebSocket | null>(null)
  const micCtxRef = useRef<AudioContext | null>(null)
  const playCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const nextTimeRef = useRef(0)
  const statusRef = useRef<VoiceStatus>('idle')

  const setStatusBoth = (s: VoiceStatus) => {
    statusRef.current = s
    setStatus(s)
  }

  // Stop all queued audio playback immediately (barge-in)
  const stopPlayback = useCallback(() => {
    for (const src of sourcesRef.current) {
      try { src.stop(0) } catch { /* ignore */ }
    }
    sourcesRef.current = []
    nextTimeRef.current = 0
  }, [])

  // Schedule a PCM 24kHz chunk for playback
  const schedulePCM = useCallback((buffer: ArrayBuffer) => {
    const ctx = playCtxRef.current
    if (!ctx) return

    const int16 = new Int16Array(buffer)
    if (int16.length === 0) return

    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, 24000)
    audioBuffer.getChannelData(0).set(float32)

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)

    // Schedule seamlessly after previous chunk
    const startAt = Math.max(ctx.currentTime + 0.05, nextTimeRef.current)
    source.start(startAt)
    nextTimeRef.current = startAt + audioBuffer.duration

    sourcesRef.current.push(source)
    setStatusBoth('speaking')

    source.onended = () => {
      sourcesRef.current = sourcesRef.current.filter(s => s !== source)
      if (sourcesRef.current.length === 0 && statusRef.current === 'speaking') {
        setStatusBoth('listening')
      }
    }
  }, [])

  const start = useCallback(async (phone: string) => {
    if (statusRef.current !== 'idle') return
    setStatusBoth('connecting')

    try {
      // Mic permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      // Two AudioContexts: mic (native rate) + playback (24kHz)
      const micCtx = new AudioContext()
      const playCtx = new AudioContext({ sampleRate: 24000 })
      micCtxRef.current = micCtx
      playCtxRef.current = playCtx

      // Load mic worklet
      await micCtx.audioWorklet.addModule('/mic-worklet.js')

      // WebSocket
      const ws = new WebSocket(`${wsUrl}?phone=${encodeURIComponent(phone)}`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          schedulePCM(event.data)
        } else {
          try {
            const msg = JSON.parse(event.data as string)
            switch (msg.type) {
              case 'ready':
                setStatusBoth('listening')
                // Start streaming mic audio
                startMicStreaming(micCtx, stream, ws)
                break
              case 'interrupted':
                stopPlayback()
                setStatusBoth('listening')
                break
              case 'transcript':
                setTranscript(prev => [...prev, {
                  id: crypto.randomUUID(),
                  role: msg.role as 'model',
                  text: msg.text as string,
                }])
                break
              case 'turn_complete':
                // Audio onended handles status
                break
              case 'error':
                console.error('Server error:', msg.message)
                setStatusBoth('error')
                break
            }
          } catch { /* ignore parse errors */ }
        }
      }

      ws.onerror = () => setStatusBoth('error')
      ws.onclose = () => {
        if (statusRef.current !== 'idle') setStatusBoth('idle')
      }
    } catch (err) {
      console.error('Failed to start:', err)
      setStatusBoth('error')
      cleanup()
    }
  }, [wsUrl, schedulePCM, stopPlayback])

  function startMicStreaming(ctx: AudioContext, stream: MediaStream, ws: WebSocket) {
    const source = ctx.createMediaStreamSource(stream)
    const worklet = new AudioWorkletNode(ctx, 'mic-processor')
    source.connect(worklet)
    workletRef.current = worklet

    worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(e.data)
      }
    }
  }

  function cleanup() {
    stopPlayback()
    streamRef.current?.getTracks().forEach(t => t.stop())
    workletRef.current?.disconnect()
    try { micCtxRef.current?.close() } catch {}
    try { playCtxRef.current?.close() } catch {}
    wsRef.current?.close()
    streamRef.current = null
    workletRef.current = null
    micCtxRef.current = null
    playCtxRef.current = null
    wsRef.current = null
    nextTimeRef.current = 0
  }

  const stop = useCallback(() => {
    cleanup()
    setStatusBoth('idle')
    setTranscript([])
  }, [stopPlayback])

  return { status, transcript, start, stop }
}
