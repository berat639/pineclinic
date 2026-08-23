'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ThemeToggle } from './theme-provider'
import { AiLiveSession, type LiveChatCallbacks, type SessionConfig } from '@/lib/ai-live'
import { AudioStreamPlayer, MicrophoneCapture } from '@/lib/audio'

type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error'

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: 'Başlamak için tıklayın',
  connecting: 'Bağlanıyor...',
  listening: 'Sizi dinliyorum',
  speaking: 'Asistan konuşuyor...',
  error: 'Bir hata oluştu',
}

const STATUS_COLOR: Record<VoiceStatus, string> = {
  idle: '#334155',
  connecting: '#f59e0b',
  listening: '#22c55e',
  speaking: '#818cf8',
  error: '#ef4444',
}

const STATUS_ICON: Record<VoiceStatus, string> = {
  idle: '🎙️',
  connecting: '⏳',
  listening: '🎙️',
  speaking: '🔊',
  error: '⚠️',
}

type TranscriptEntry = { id: string; role: 'user' | 'model'; text: string }

export default function Home() {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null)
  const [mode, setMode] = useState<'audio' | 'text'>('audio')
  const [textInput, setTextInput] = useState('')

  const sessionRef = useRef<AiLiveSession | null>(null)
  const playerRef = useRef<AudioStreamPlayer | null>(null)
  const micRef = useRef<MicrophoneCapture | null>(null)
  const textBufferRef = useRef('')
  const isActive = status !== 'idle' && status !== 'error'

  // Fetch config on mount (safe, just static DB info)
  useEffect(() => {
    fetch('/api/direct-session-config')
      .then(r => r.json())
      .then((config: SessionConfig) => {
        setSessionConfig(config)
        if (config.branding?.title) {
          document.title = `Voice AI — ${config.branding.title}`
        }
      })
      .catch(() => {})
  }, [])

  const addTranscript = useCallback((role: 'user' | 'model', text: string) => {
    setTranscript(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, role, text }])
  }, [])

  const start = useCallback(async () => {
    setStatus('connecting')
    setErrorMsg('')
    setTranscript([])

    let currentApiKey = apiKey
    if (!currentApiKey) {
      try {
        const r = await fetch('/api/direct-session')
        const d = await r.json()
        if (d.apiKey) {
          currentApiKey = d.apiKey
          setApiKey(d.apiKey)
        } else {
          throw new Error('API Key alınamadı')
        }
      } catch (err) {
        setStatus('error')
        setErrorMsg('Bağlantı kurulamadı (API Key hatası).')
        return
      }
    }

    if (!currentApiKey || !sessionConfig) {
      setStatus('error')
      setErrorMsg('API key veya oturum ayarları bulunamadı. Server ayarlarını kontrol edin.')
      return
    }

    try {
      // iOS AudioContext unlock
      const unlockCtx = new AudioContext()
      const buf = unlockCtx.createBuffer(1, 1, 22050)
      const src = unlockCtx.createBufferSource()
      src.buffer = buf
      src.connect(unlockCtx.destination)
      src.start(0)
      setTimeout(() => unlockCtx.close(), 100)
    } catch { /* ignore */ }

    const player = new AudioStreamPlayer(24000)
    playerRef.current = player

    const callbacks: LiveChatCallbacks = {
      onAudioChunk: (data) => {
        player.addChunk(data)
        setStatus('speaking')
      },
      onText: (text) => {
        textBufferRef.current += text
        // console.log('[AI Text]', text)
      },
      onTurnComplete: () => {
        if (textBufferRef.current.trim().length > 0) {
          // console.log('[AI Turn]', textBufferRef.current.trim())
          addTranscript('model', textBufferRef.current.trim())
          textBufferRef.current = ''
        }
        setStatus('listening')
      },
      onConnectionChange: (connected) => {
        if (!connected && sessionRef.current) {
          micRef.current?.stop()
          micRef.current = null
          playerRef.current?.stop()
          playerRef.current = null
          sessionRef.current = null
          setStatus('idle')
        }
      },
      onError: (err) => {
        micRef.current?.stop()
        micRef.current = null
        setStatus('error')
        setErrorMsg(err)
      },
      onInterrupted: () => {
        setStatus('listening')
        if (playerRef.current) {
          playerRef.current.stop()
          playerRef.current = new AudioStreamPlayer(24000)
        }
      },
    }

    const session = new AiLiveSession(callbacks)
    sessionRef.current = session

    try {
      await session.connect(currentApiKey, sessionConfig, mode)

      // Wait briefly to confirm session is stable (AI may close immediately on errors)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (session.connected) resolve()
          else reject(new Error('Oturum hemen kapatıldı'))
        }, 800)
        // If already disconnected, reject immediately
        const check = setInterval(() => {
          if (!session.connected) {
            clearTimeout(timer)
            clearInterval(check)
            reject(new Error('Oturum hemen kapatıldı'))
          }
        }, 100)
        // Clear interval on success
        setTimeout(() => clearInterval(check), 800)
      })

      setStatus('listening')

      const greetingPrompt = sessionConfig?.greeting
        ? `Sistem bildirimi: Müşteri ${mode === 'audio' ? 'sesli' : 'yazılı'} görüşmeye bağlandı. Müşteriye tam olarak şu karşılama mesajını okuyarak konuşmayı başlat: "${sessionConfig.greeting}" (Bu bir sistem bildirimidir, müşteri adı sanma.)`
        : `Sistem bildirimi: Müşteri ${mode === 'audio' ? 'sesli' : 'yazılı'} görüşmeye bağlandı. Kısaca "Merhaba, size nasıl yardımcı olabilirim?" diyerek görüşmeyi başlat.`
      session.sendText(greetingPrompt)

      if (mode === 'audio') {
        const mic = new MicrophoneCapture()
        micRef.current = mic
        await mic.start((pcm) => {
          session.sendAudio(pcm)
        })
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Bağlantı hatası')
    }
  }, [apiKey, sessionConfig, addTranscript])

  const stop = useCallback(() => {
    micRef.current?.stop()
    micRef.current = null
    sessionRef.current?.disconnect()
    sessionRef.current = null
    playerRef.current?.stop()
    playerRef.current = null
    setStatus('idle')
  }, [])

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* Top Nav */}
      <nav style={{
        width: '100%',
        padding: '0 2rem',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(5, 10, 20, 0.8)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {sessionConfig?.branding?.logoUrl ? (
            <img
              src={sessionConfig.branding.logoUrl}
              alt="Logo"
              style={{ height: 24, width: 'auto', filter: 'var(--logo-filter)' }}
            />
          ) : (
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
            }} />
          )}
          <div style={{
            width: 1,
            height: 20,
            background: 'rgba(255,255,255,0.15)',
          }} />
          <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 500, letterSpacing: '0.05em' }}>
            {sessionConfig?.branding?.title || 'Asistan'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeToggle />
        </div>
      </nav>

      {/* Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        gap: '2.5rem',
        width: '100%',
        maxWidth: 560,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', animation: 'fadeIn 0.6s ease' }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #60a5fa 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem',
            letterSpacing: '-0.02em',
          }}>
            {sessionConfig?.branding?.title || 'Asistan'}
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 400 }}>
            {sessionConfig?.branding?.subtitle || 'Randevu · Bilgi'}
          </p>
        </div>

        {/* Mode Toggle */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '-1rem', zIndex: 10 }}>
          <button
            onClick={() => status === 'idle' && setMode('audio')}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '20px',
              border: `1px solid ${mode === 'audio' ? '#3b82f6' : '#475569'}`,
              background: mode === 'audio' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              color: mode === 'audio' ? '#60a5fa' : '#94a3b8',
              cursor: status === 'idle' ? 'pointer' : 'not-allowed',
              opacity: status === 'idle' ? 1 : 0.5,
              transition: 'all 0.2s',
            }}
          >
            🎙️ Sesli
          </button>
          <button
            onClick={() => status === 'idle' && setMode('text')}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '20px',
              border: `1px solid ${mode === 'text' ? '#3b82f6' : '#475569'}`,
              background: mode === 'text' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              color: mode === 'text' ? '#60a5fa' : '#94a3b8',
              cursor: status === 'idle' ? 'pointer' : 'not-allowed',
              opacity: status === 'idle' ? 1 : 0.5,
              transition: 'all 0.2s',
            }}
          >
            💬 Yazılı
          </button>
        </div>

        {/* Voice Button */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Pulse rings */}
          {(status === 'listening' || status === 'speaking') && (
            <>
              <div style={{
                position: 'absolute',
                width: 180,
                height: 180,
                borderRadius: '50%',
                border: `2px solid ${STATUS_COLOR[status]}`,
                opacity: 0.3,
                animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
              }} />
              <div style={{
                position: 'absolute',
                width: 155,
                height: 155,
                borderRadius: '50%',
                border: `2px solid ${STATUS_COLOR[status]}`,
                opacity: 0.15,
                animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite 0.4s',
              }} />
            </>
          )}

          {/* Glow backdrop */}
          <div style={{
            position: 'absolute',
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: isActive ? `${STATUS_COLOR[status]}18` : 'transparent',
            filter: 'blur(24px)',
            transition: 'all 0.4s ease',
          }} />

          {/* Main button */}
          <button
            id="voice-btn"
            onClick={isActive ? stop : start}
            style={{
              width: 130,
              height: 130,
              borderRadius: '50%',
              border: `2px solid ${STATUS_COLOR[status]}`,
              background: status === 'idle'
                ? 'radial-gradient(circle at 30% 30%, #1e293b, #0a1220)'
                : `radial-gradient(circle at 30% 30%, ${STATUS_COLOR[status]}22, #0a1220)`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              boxShadow: isActive
                ? `0 0 40px ${STATUS_COLOR[status]}33, inset 0 0 20px ${STATUS_COLOR[status]}11`
                : '0 8px 32px rgba(0,0,0,0.4)',
              fontSize: '2.8rem',
              outline: 'none',
              position: 'relative',
              zIndex: 1,
            }}
            aria-label={isActive ? 'Durdur' : 'Başlat'}
          >
            {STATUS_ICON[status]}
          </button>
        </div>

        {/* Status */}
        <div style={{
          fontSize: '0.95rem',
          color: STATUS_COLOR[status],
          fontWeight: 500,
          minHeight: '1.5rem',
          transition: 'color 0.3s',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {status !== 'idle' && (
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: STATUS_COLOR[status],
              display: 'inline-block',
              animation: isActive ? 'pulse-ring 1.5s ease infinite' : 'none',
            }} />
          )}
          {STATUS_LABEL[status]}
        </div>
        {status === 'error' && errorMsg && (
          <div style={{
            fontSize: '0.8rem',
            color: '#f87171',
            textAlign: 'center',
            maxWidth: '100%',
            lineHeight: 1.45,
            padding: '0 0.5rem',
          }}>
            {errorMsg}
          </div>
        )}

        {/* Text Input */}
        {mode === 'text' && isActive && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!textInput.trim() || !sessionRef.current) return
              sessionRef.current.sendText(textInput.trim())
              addTranscript('user', textInput.trim())
              setTextInput('')
            }}
            style={{ display: 'flex', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}
          >
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Mesajınızı yazın..."
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(15, 23, 42, 0.6)',
                color: '#fff',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!textInput.trim()}
              style={{
                padding: '0 1.25rem',
                borderRadius: '12px',
                background: textInput.trim() ? '#3b82f6' : '#334155',
                color: '#fff',
                border: 'none',
                cursor: textInput.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 600,
              }}
            >
              Gönder
            </button>
          </form>
        )}

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="glass-card" style={{
            width: '100%',
            maxHeight: 300,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
            animation: 'fadeIn 0.3s ease',
          }}>
            {transcript.map((entry) => (
              <div
                key={entry.id}
                style={{
                  textAlign: entry.role === 'model' ? 'left' : 'right',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  animation: 'slideIn 0.2s ease',
                }}
              >
                <span style={{
                  display: 'inline-block',
                  background: entry.role === 'model'
                    ? 'rgba(30,41,59,0.95)'
                    : 'rgba(59,130,246,0.9)',
                  color: '#f8fafc',
                  padding: '0.45rem 0.85rem',
                  borderRadius: entry.role === 'model' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                  maxWidth: '88%',
                  border: `1px solid ${entry.role === 'model' ? 'rgba(167,139,250,0.15)' : 'rgba(96,165,250,0.15)'}`,
                }}>
                  {entry.text}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Info cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.75rem',
          width: '100%',
        }}>
          {[
            { icon: '📅', label: 'Randevu\nOluştur' },
            { icon: '❓', label: 'Bilgi\nAl' },
          ].map((item, i) => (
            <div key={i} className="glass-card" style={{
              padding: '1rem',
              textAlign: 'center',
              transition: 'all 0.2s',
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>{item.icon}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, whiteSpace: 'pre-line', lineHeight: 1.4 }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
