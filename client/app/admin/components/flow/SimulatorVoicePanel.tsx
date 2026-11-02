'use client'

import type { Edge, Node } from '@xyflow/react'
import { useSimulatorVoice, type SimulatorVoiceStatus } from '@/hooks/useSimulatorVoice'

export interface SimulatorVoicePanelProps {
  direction: 'inbound' | 'outbound'
  nodes: Node[]
  edges: Edge[]
  callerProfile: { kayitli: 'true' | 'false' }
  onTranscript: (e: { role: 'user' | 'assistant'; text: string }) => void
  onNodeVisited: (nodeId: string) => void
  onFieldsChanged: (fields: Record<string, string>) => void
}

const STATUS_LABELS: Record<SimulatorVoiceStatus, string> = {
  idle: 'Hazır',
  connecting: 'Bağlanıyor…',
  listening: 'Dinliyor',
  speaking: 'Konuşuyor',
  error: 'Hata',
}

const STATUS_COLORS: Record<SimulatorVoiceStatus, string> = {
  idle: 'var(--foreground-3)',
  connecting: '#0284c7',
  listening: '#15803d',
  speaking: '#0284c7',
  error: 'var(--danger)',
}

/**
 * Canlı Test sekmesindeki "Sesli" mod. Mikrofon bu bileşen açıkken çalışır;
 * bileşen kapanınca (veya yazılı moda geçilince) mikrofon kapanır.
 * Transkriptler `onTranscript` ile yazılı loga düşer; log burada tutulmaz.
 */
export default function SimulatorVoicePanel(props: SimulatorVoicePanelProps) {
  const { status, error, start, stop } = useSimulatorVoice(props)
  const active = status === 'connecting' || status === 'listening' || status === 'speaking'

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1.5px solid var(--input-border)',
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: 'var(--pc-neo-subcard)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>🎙️ Sesli Simülasyon</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: STATUS_COLORS[status],
            background: 'var(--card-inner)',
            border: '1px solid var(--input-border)',
            borderRadius: 999,
            padding: '3px 10px',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[status] }} />
          {STATUS_LABELS[status]}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--foreground-2)' }}>
        Taslak akışınız hasta olarak mikrofonunuzla denenir. Konuşmalar yazılı kayda eklenir. Yayındaki akış ve telefon hattı etkilenmez; hiçbir gerçek kayıt oluşturulmaz.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            background: 'var(--card-inner)',
            border: '1.5px solid var(--danger)',
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--foreground)',
          }}
        >
          {error}
        </div>
      )}

      {active ? (
        <button
          type="button"
          onClick={stop}
          style={{
            background: 'var(--card-bg)',
            color: 'var(--danger)',
            border: '1.5px solid var(--danger)',
            borderRadius: 10,
            padding: '9px 14px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: 'var(--pc-clay-btn)',
          }}
        >
          ⏹ Görüşmeyi Bitir
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          style={{
            background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#ffffff',
            border: '1px solid #1d4ed8',
            borderRadius: 10,
            padding: '9px 14px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: 'var(--pc-clay-primary)',
          }}
        >
          🎙️ Sesli Görüşmeyi Başlat
        </button>
      )}
    </div>
  )
}
