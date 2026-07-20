'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ThemeToggle } from './theme-provider'
import { GeminiLiveSession, type LiveChatCallbacks } from '@/lib/gemini-live'
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
  const [currentModel, setCurrentModel] = useState('')
  const [greetingText, setGreetingText] = useState('')

  const sessionRef = useRef<GeminiLiveSession | null>(null)
  const playerRef = useRef<AudioStreamPlayer | null>(null)
  const micRef = useRef<MicrophoneCapture | null>(null)
  const textBufferRef = useRef('')
  const isActive = status !== 'idle' && status !== 'error'

  // Fetch API key, current model, and greeting on mount
  useEffect(() => {
    // Get API key
    fetch('/api/direct-session')
      .then(r => r.json())
      .then((d: { apiKey?: string }) => { if (d.apiKey) setApiKey(d.apiKey) })
      .catch(() => {})

    // Get current model from admin settings
    fetch('/api/admin/settings/ai')
      .then(r => r.json())
      .then((d: { current?: string }) => { if (d.current) setCurrentModel(d.current) })
      .catch(() => {})

    // Get greeting text from settings
    fetch('/api/admin/settings/greeting')
      .then(r => r.json())
      .then((d: { greeting?: string }) => { if (d.greeting) setGreetingText(d.greeting) })
      .catch(() => {})
  }, [])

  const addTranscript = useCallback((role: 'user' | 'model', text: string) => {
    setTranscript(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, role, text }])
  }, [])

  const start = useCallback(async () => {
    if (!apiKey) {
      setStatus('error')
      setErrorMsg('API key bulunamadı. Server ayarlarını kontrol edin.')
      return
    }

    setStatus('connecting')
    setErrorMsg('')
    setTranscript([])

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
      },
      onTurnComplete: () => {
        if (textBufferRef.current.trim()) {
          addTranscript('model', textBufferRef.current.trim())
          textBufferRef.current = ''
        }
        setStatus('listening')
      },
      onConnectionChange: (connected) => {
        if (!connected && sessionRef.current) {
          setStatus('idle')
        }
      },
      onError: (err) => {
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

    const session = new GeminiLiveSession(callbacks)
    sessionRef.current = session

    try {
      await session.connect(apiKey, currentModel || undefined)
      setStatus('listening')

      // Send greeting text to start the conversation automatically
      if (greetingText) {
        session.sendText(greetingText)
      }

      const mic = new MicrophoneCapture()
      micRef.current = mic
      await mic.start((pcm) => {
        session.sendAudio(pcm)
      })
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Bağlantı hatası')
    }
  }, [apiKey, currentModel, greetingText, addTranscript])

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
          <img
            src="/logo-skoda.svg"
            alt="Skoda"
            style={{ height: 24, width: 'auto', filter: 'var(--logo-filter)' }}
          />
          <div style={{
            width: 1,
            height: 20,
            background: 'rgba(255,255,255,0.15)',
          }} />
          <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 500, letterSpacing: '0.05em' }}>
            AI DANIŞMAN
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeToggle />
          {/* Admin link */}
          <Link
            href="/admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.8rem',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            Admin Panel
          </Link>
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
            AI Sesli Asistan
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 400 }}>
            Randevu · Bilgi · Danışmanlık
          </p>
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
                    ? 'rgba(30,41,59,0.8)'
                    : 'rgba(0,44,95,0.5)',
                  color: entry.role === 'model' ? '#a78bfa' : '#60a5fa',
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
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.75rem',
          width: '100%',
        }}>
          {[
            { icon: '�', label: 'Randevu\nOluştur' },
            { icon: '❓', label: 'Bilgi\nAl' },
            { icon: '💬', label: 'Danışmanlık\nİste' },
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
