'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { AudioStreamPlayer, MicrophoneCapture } from '@/lib/audio'
import { GeminiLiveSession } from '@/lib/gemini-live'
import { useVoiceAI, type VoiceStatus } from '@/hooks/useVoiceAI'
import Link from 'next/link'

type ConnectionMode = 'server' | 'direct'
type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

// ── Map server hook status → unified state ──────────────────────
function mapServerStatus(s: VoiceStatus): ConnectionState {
  switch (s) {
    case 'idle': return 'idle'
    case 'connecting': return 'connecting'
    case 'listening': return 'connected'
    case 'speaking': return 'connected'
    case 'error': return 'error'
  }
}

export default function DirectChat() {
  // ── Mode selection ─────────────────────────────────────────────
  const [mode, setMode] = useState<ConnectionMode>('server')

  // ── Direct mode state ──────────────────────────────────────────
  const [directState, setDirectState] = useState<ConnectionState>('idle')
  const [micLevel, setMicLevel] = useState(0)
  const [isAISpeaking, setIsAISpeaking] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [errorText, setErrorText] = useState('')
  const [callDuration, setCallDuration] = useState(0)
  const [textInput, setTextInput] = useState('')

  const sessionRef = useRef<GeminiLiveSession | null>(null)
  const playerRef = useRef<AudioStreamPlayer | null>(null)
  const micRef = useRef<MicrophoneCapture | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // ── Server mode (WS Proxy) ─────────────────────────────────────
  const [wsUrl, setWsUrl] = useState('')
  const serverHook = useVoiceAI(wsUrl)

  useEffect(() => {
    const envUrl = process.env.NEXT_PUBLIC_WS_URL
    if (envUrl) {
      setWsUrl(envUrl)
    } else {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.hostname
      const port = process.env.NEXT_PUBLIC_WS_PORT || '3005'
      setWsUrl(`${proto}//${host}:${port}/ws`)
    }
  }, [])

  // Server mode timer
  const serverTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [serverDuration, setServerDuration] = useState(0)

  useEffect(() => {
    if (mode !== 'server') return
    const isActive = serverHook.status === 'listening' || serverHook.status === 'speaking'
    if (isActive && !serverTimerRef.current) {
      setServerDuration(0)
      serverTimerRef.current = setInterval(() => setServerDuration(p => p + 1), 1000)
    }
    if (!isActive && serverTimerRef.current) {
      clearInterval(serverTimerRef.current)
      serverTimerRef.current = null
      if (serverHook.status === 'idle') setServerDuration(0)
    }
    return () => {
      if (serverTimerRef.current) { clearInterval(serverTimerRef.current); serverTimerRef.current = null }
    }
  }, [mode, serverHook.status])

  // ── Unified state based on mode ────────────────────────────────
  const connectionState = mode === 'direct' ? directState : mapServerStatus(serverHook.status)
  const unifiedSpeaking = mode === 'direct' ? isAISpeaking : serverHook.status === 'speaking'
  const unifiedError = mode === 'direct' ? errorText : (serverHook.serverError || '')
  const unifiedDuration = mode === 'direct' ? callDuration : serverDuration

  // ── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => { endDirectCall() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Wake Lock ──────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch { /* non-critical */ }
  }, [])

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null }
  }, [])

  // ── Direct mode: Start ─────────────────────────────────────────
  const startDirectCall = useCallback(async () => {
    setDirectState('connecting')
    setStatusText('Bağlantı kuruluyor...')
    setErrorText('')
    setCallDuration(0)

    try {
      const res = await fetch('/api/direct-session')
      const data = await res.json()
      if (!res.ok || !data.apiKey) throw new Error(data.error || 'API key alınamadı')

      playerRef.current = new AudioStreamPlayer(24000)
      await playerRef.current.unlockAudio()

      const session = new GeminiLiveSession({
        onAudioChunk: (base64Data) => {
          setIsAISpeaking(true)
          playerRef.current?.addChunk(base64Data)
        },
        onText: (text) => setStatusText(text),
        onTurnComplete: () => { setIsAISpeaking(false); setStatusText('Dinleniyor...') },
        onConnectionChange: (connected) => {
          if (!connected && sessionRef.current) {
            micRef.current?.stop(); micRef.current = null
            setDirectState('idle'); setStatusText('Bağlantı kapandı'); releaseWakeLock()
          }
        },
        onError: (error) => { setErrorText(error); setDirectState('error') },
        onInterrupted: () => {
          setIsAISpeaking(false)
          if (playerRef.current) { playerRef.current.stop(); playerRef.current = new AudioStreamPlayer(24000) }
        },
      })

      sessionRef.current = session
      await session.connect(data.apiKey)

      const mic = new MicrophoneCapture()
      micRef.current = mic
      await mic.start(
        (base64Chunk) => { if (session.connected) session.sendAudio(base64Chunk) },
        (level) => setMicLevel(level)
      )

      timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)
      await requestWakeLock()
      setDirectState('connected')
      setStatusText('Konuşmaya başlayabilirsiniz!')
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Bağlantı kurulamadı')
      setDirectState('error')
      endDirectCall()
    }
  }, [requestWakeLock, releaseWakeLock])

  // ── Direct mode: End ───────────────────────────────────────────
  const endDirectCall = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    micRef.current?.stop(); micRef.current = null
    playerRef.current?.stop(); playerRef.current = null
    sessionRef.current?.disconnect(); sessionRef.current = null
    releaseWakeLock()
    setDirectState('idle'); setIsAISpeaking(false); setMicLevel(0); setCallDuration(0); setStatusText('')
  }, [releaseWakeLock])

  // ── Unified start/stop ─────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (mode === 'direct') startDirectCall()
    else { requestWakeLock(); serverHook.start() }
  }, [mode, startDirectCall, serverHook, requestWakeLock])

  const handleStop = useCallback(() => {
    if (mode === 'direct') endDirectCall()
    else { releaseWakeLock(); serverHook.stop() }
  }, [mode, endDirectCall, serverHook, releaseWakeLock])

  // ── Send text (direct mode only) ───────────────────────────────
  const sendText = useCallback(() => {
    const text = textInput.trim()
    if (!text || !sessionRef.current?.connected) return
    sessionRef.current.sendText(text)
    setTextInput('')
    setStatusText(`Gönderildi: "${text}"`)
  }, [textInput])

  // ── Format duration ────────────────────────────────────────────
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // ══════════════════════════════════════════════════════════════
  // IDLE / LANDING SCREEN
  // ══════════════════════════════════════════════════════════════
  if (connectionState === 'idle' || connectionState === 'error') {
    return (
      <div className="direct-chat-container">
        <div className="dc-bg-orbs">
          <div className="dc-orb dc-orb-1" style={{ background: '#8b5cf6' }} />
          <div className="dc-orb dc-orb-2" style={{ background: '#3b82f6' }} />
        </div>

        <nav className="dc-nav">
          <Link href="/" className="dc-back-link">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Ana Sayfa
          </Link>
        </nav>

        <div className="dc-center-content">
          <div className="dc-logo-wrap">
            <div className="dc-logo-box">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="dc-pulse-ring dc-pulse-ring-1" />
            <div className="dc-pulse-ring dc-pulse-ring-2" />
          </div>

          <h1 className="dc-title">AI Sesli Asistan</h1>
          <p className="dc-subtitle">Yapay zeka ile gerçek zamanlı sesli sohbet</p>

          {/* ── Mode Selector ──────────────────────────────────── */}
          <div className="dc-mode-selector">
            <button
              className={`dc-mode-btn ${mode === 'server' ? 'dc-mode-btn-active' : ''}`}
              onClick={() => setMode('server')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="8" rx="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" />
                <circle cx="6" cy="6" r="1" fill="currentColor" />
                <circle cx="6" cy="18" r="1" fill="currentColor" />
              </svg>
              Sunucu Modu
            </button>
            <button
              className={`dc-mode-btn ${mode === 'direct' ? 'dc-mode-btn-active' : ''}`}
              onClick={() => setMode('direct')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Doğrudan
            </button>
          </div>

          {/* Mode description */}
          <p className="dc-mode-desc">
            {mode === 'server'
              ? '🔧 Randevu, bilgi tabanı, kayıt ve Netgsm telefon desteği'
              : '⚡ Düşük gecikme, doğrudan bağlantı (sunucu özellikleri yok)'}
          </p>

          {/* Error message */}
          {connectionState === 'error' && unifiedError && (
            <div className="dc-error-box">❌ {unifiedError}</div>
          )}

          {/* Start Call Button */}
          <button onClick={handleStart} className="dc-start-btn" aria-label="Aramayı Başlat">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="white">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
            </svg>
          </button>
          <p className="dc-start-label">Aramayı Başlat</p>

          {/* Info chips */}
          <div className="dc-chips">
            {mode === 'server' ? (
              <>
                <div className="dc-chip">🔧 Randevu</div>
                <div className="dc-chip">📞 Netgsm</div>
                <div className="dc-chip">📚 Bilgi Tabanı</div>
                <div className="dc-chip">🎙 Kayıt</div>
              </>
            ) : (
              <>
                <div className="dc-chip">🎙 Sesli Sohbet</div>
                <div className="dc-chip">🌐 Türkçe</div>
                <div className="dc-chip">⚡ Gerçek Zamanlı</div>
                <div className="dc-chip">🧠 Yapay Zeka</div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // CONNECTING SCREEN
  // ══════════════════════════════════════════════════════════════
  if (connectionState === 'connecting') {
    return (
      <div className="direct-chat-container dc-flex-center">
        <div className="dc-connecting-orb-wrap">
          <div className="dc-connecting-orb-outer">
            <div className="dc-connecting-orb-inner-bg">
              <div className="dc-connecting-orb-inner">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
            </div>
          </div>
        </div>
        <p className="dc-connecting-text">
          {mode === 'direct' ? (statusText || 'Bağlanılıyor...') : 'Sunucuya bağlanılıyor...'}
        </p>
        <p className="dc-connecting-sub">Mikrofon izni gerekebilir</p>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // CONNECTED / LIVE CALL SCREEN
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="direct-chat-container">
      {/* Animated background */}
      <div className="dc-bg-orbs">
        <div
          className="dc-orb dc-orb-live"
          style={{
            background: unifiedSpeaking ? '#8b5cf6' : '#3b82f6',
            opacity: unifiedSpeaking ? 0.08 : 0.03,
            animation: unifiedSpeaking
              ? 'dc-float 3s ease-in-out infinite'
              : 'dc-float 8s ease-in-out infinite',
          }}
        />
        {mode === 'direct' && (
          <div className="dc-orb dc-orb-mic" style={{ background: '#22c55e', opacity: micLevel * 0.06 }} />
        )}
      </div>

      {/* Header */}
      <header className="dc-header">
        <div className="dc-header-left">
          <div className="dc-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="dc-header-title">AI Sesli Asistan</h1>
            <div className="dc-header-status">
              <div className="dc-live-dot" />
              <span>
                {mode === 'server' ? 'Sunucu' : 'Doğrudan'} · Canlı · {formatDuration(unifiedDuration)}
              </span>
            </div>
          </div>
        </div>
        <div className="dc-mode-badge">
          {mode === 'server' ? '🔧 Sunucu' : '⚡ Doğrudan'}
        </div>
      </header>

      {/* Main call area */}
      <div className="dc-call-area">
        <div className="dc-main-orb-wrap">
          {/* Mic level ring (direct mode) */}
          {mode === 'direct' && (
            <div
              className="dc-mic-ring"
              style={{
                border: `3px solid rgba(34, 197, 94, ${micLevel * 0.5})`,
                boxShadow: `0 0 ${micLevel * 40}px rgba(34, 197, 94, ${micLevel * 0.2})`,
                transform: `scale(${1 + micLevel * 0.15})`,
              }}
            />
          )}

          {/* Speaking rings */}
          {unifiedSpeaking && (
            <>
              <div className="dc-speak-ring dc-speak-ring-1" />
              <div className="dc-speak-ring dc-speak-ring-2" />
            </>
          )}

          {/* Main orb */}
          <div
            className="dc-main-orb"
            style={{
              background: unifiedSpeaking
                ? 'linear-gradient(135deg, #8b5cf6, #6d28d9, #ec4899)'
                : mode === 'direct'
                  ? `linear-gradient(135deg, rgba(59, 130, 246, ${0.3 + micLevel * 0.7}), rgba(34, 197, 94, ${0.3 + micLevel * 0.7}))`
                  : 'linear-gradient(135deg, rgba(59, 130, 246, 0.5), rgba(34, 197, 94, 0.5))',
              boxShadow: unifiedSpeaking
                ? '0 0 60px rgba(139, 92, 246, 0.4), 0 0 120px rgba(139, 92, 246, 0.1)'
                : mode === 'direct'
                  ? `0 0 ${20 + micLevel * 60}px rgba(34, 197, 94, ${0.1 + micLevel * 0.3})`
                  : '0 0 30px rgba(34, 197, 94, 0.15)',
              animation: unifiedSpeaking ? 'dc-float 2s ease-in-out infinite' : 'none',
            }}
          >
            <svg
              width="48" height="48" viewBox="0 0 24 24"
              fill="none" stroke="white" strokeWidth="1.5"
              style={{ transition: 'transform 0.3s', transform: unifiedSpeaking ? 'scale(1.1)' : 'scale(1)' }}
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
        </div>

        {/* Status text */}
        <p className="dc-status-text" style={{ color: unifiedSpeaking ? '#a78bfa' : 'var(--foreground)' }}>
          {unifiedSpeaking ? 'AI konuşuyor...' : 'Dinleniyor...'}
        </p>

        {/* Server mode transcript */}
        {mode === 'server' && serverHook.transcript.length > 0 && (
          <div className="dc-transcript">
            {serverHook.transcript.slice(-5).map((entry) => (
              <div
                key={entry.id}
                className={`dc-transcript-entry ${entry.role === 'model' ? 'dc-transcript-ai' : 'dc-transcript-user'}`}
              >
                {entry.text}
              </div>
            ))}
          </div>
        )}

        {/* Direct mode status */}
        {mode === 'direct' && statusText && (
          <p className="dc-status-sub">{statusText}</p>
        )}

        {/* Live waveform bars */}
        <div className="dc-waveform">
          {Array.from({ length: 20 }).map((_, i) => {
            const barHeight = unifiedSpeaking
              ? Math.sin((i / 19) * Math.PI) * 0.8 + 0.2
              : mode === 'direct'
                ? Math.sin((i / 19) * Math.PI) * micLevel
                : 0.1
            return (
              <div
                key={i}
                className="dc-wave-bar"
                style={{
                  height: `${Math.max(4, barHeight * 40)}px`,
                  background: unifiedSpeaking
                    ? 'linear-gradient(to top, #8b5cf6, #ec4899)'
                    : 'linear-gradient(to top, #22c55e, #3b82f6)',
                  opacity: 0.4 + barHeight * 0.6,
                  transitionDuration: unifiedSpeaking ? '300ms' : '75ms',
                  animation: unifiedSpeaking
                    ? `dc-waveform-anim ${0.3 + (i % 5) * 0.1}s ease-in-out infinite ${i * 0.05}s`
                    : 'none',
                }}
              />
            )
          })}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="dc-controls">
        <div className="dc-controls-inner">
          {/* Text input (direct mode only) */}
          {mode === 'direct' && (
            <div className="dc-text-input-wrap">
              <div className="dc-text-input-box">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendText() }}
                  placeholder="Yazarak da mesaj gönderebilirsiniz..."
                  className="dc-text-input"
                />
                {textInput.trim() && (
                  <button onClick={sendText} className="dc-send-btn" aria-label="Gönder">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* End call button */}
          <div className="dc-end-call-wrap">
            <button onClick={handleStop} className="dc-end-btn" aria-label="Aramayı Sonlandır">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          </div>

          <p className="dc-footer-hint">
            {mode === 'server'
              ? 'Sunucu modu · Randevu ve bilgi tabanı aktif'
              : 'Konuşmaya başlayın · AI sizi gerçek zamanlı dinliyor'}
          </p>
        </div>
      </div>
    </div>
  )
}
