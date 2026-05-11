'use client'

import { useState } from 'react'
import { useVoiceAI, type VoiceStatus } from '@/hooks/useVoiceAI'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws'

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

export default function Home() {
  const { status, transcript, start, stop } = useVoiceAI(WS_URL)
  const [phone, setPhone] = useState('')
  const isActive = status !== 'idle' && status !== 'error'

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      gap: '2rem',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '0.4rem',
        }}>
          🚗 Otomotiv AI Danışmanı
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
          Servis randevusu ve araç danışmanlığı
        </p>
      </div>

      {/* Phone Input */}
      <div className="phone-input-container">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefon numaranızı girin"
          disabled={status !== 'idle'}
          className="phone-input"
        />
      </div>

      {/* Voice Button */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Pulse rings */}
        {(status === 'listening' || status === 'speaking') && (
          <>
            <div style={{
              position: 'absolute',
              width: 160,
              height: 160,
              borderRadius: '50%',
              border: `2px solid ${STATUS_COLOR[status]}`,
              opacity: 0.4,
              animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
            }} />
            <div style={{
              position: 'absolute',
              width: 140,
              height: 140,
              borderRadius: '50%',
              border: `2px solid ${STATUS_COLOR[status]}`,
              opacity: 0.2,
              animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite 0.3s',
            }} />
          </>
        )}

        {/* Main button */}
        <button
          onClick={isActive ? stop : () => start(phone)}
          disabled={!isActive && !phone}
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            border: `3px solid ${STATUS_COLOR[status]}`,
            background: status === 'idle'
              ? 'radial-gradient(circle, #1e293b, #0f172a)'
              : `radial-gradient(circle, ${STATUS_COLOR[status]}22, #0f172a)`,
            cursor: (!isActive && !phone) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease',
            boxShadow: isActive ? `0 0 30px ${STATUS_COLOR[status]}44` : 'none',
            fontSize: '2.5rem',
            outline: 'none',
            opacity: (!isActive && !phone) ? 0.4 : 1,
          }}
        >
          {status === 'speaking' ? '🔊' : status === 'listening' ? '🎙️' : status === 'connecting' ? '⏳' : '🎙️'}
        </button>
      </div>

      {/* Status */}
      <div style={{
        fontSize: '1rem',
        color: STATUS_COLOR[status],
        fontWeight: 500,
        minHeight: '1.5rem',
        transition: 'color 0.3s',
      }}>
        {STATUS_LABEL[status]}
      </div>

      {/* Transcript */}
      {transcript.length > 0 && (
        <div style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: 280,
          overflowY: 'auto',
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid #1e293b',
          borderRadius: 16,
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}>
          {transcript.map((entry) => (
            <div
              key={entry.id}
              style={{
                textAlign: entry.role === 'model' ? 'left' : 'right',
                fontSize: '0.875rem',
                lineHeight: 1.5,
              }}
            >
              <span style={{
                display: 'inline-block',
                background: entry.role === 'model' ? '#1e293b' : '#1e3a5f',
                color: entry.role === 'model' ? '#a78bfa' : '#60a5fa',
                padding: '0.4rem 0.75rem',
                borderRadius: entry.role === 'model' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                maxWidth: '85%',
              }}>
                {entry.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
    </main>
  )
}
