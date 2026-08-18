import React from 'react'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'

interface FancyHourPickerProps {
  range: [number, number]
  onChange: (val: [number, number]) => void
}

export default function FancyHourPicker({ range, onChange }: FancyHourPickerProps) {
  const formatTime = (val: number) => {
    const h = Math.floor(val).toString().padStart(2, '0')
    const m = (val % 1 === 0.5) ? '30' : '00'
    return `${h}:${m}`
  }

  return (
    <div style={{ position: 'relative', padding: '16px 12px', background: 'linear-gradient(145deg, var(--glass-bg), rgba(255,255,255,0.02))', borderRadius: 16, border: '1px solid var(--glass-border)', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)' }}>
      {/* Time Display */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, padding: '0 4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontSize: 10, color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Başlangıç</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6', textShadow: '0 0 10px rgba(59,130,246,0.3)' }}>{formatTime(range[0])}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 10, color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Bitiş</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#ec4899', textShadow: '0 0 10px rgba(236,72,153,0.3)' }}>{formatTime(range[1])}</span>
        </div>
      </div>

      {/* Slider */}
      <div style={{ padding: '0 8px' }}>
        <Slider
          range
          min={6} max={24} step={0.5}
          value={range}
          onChange={(val) => onChange(val as [number, number])}
          allowCross={false}
          styles={{
            rail: { 
              backgroundColor: 'rgba(255,255,255,0.08)',
              height: 8,
              borderRadius: 4
            },
            track: { 
              background: 'linear-gradient(90deg, #3b82f6, #ec4899)', 
              height: 8,
              borderRadius: 4,
              boxShadow: '0 0 12px rgba(236,72,153,0.4)'
            },
            handle: { 
              borderColor: 'transparent',
              height: 24,
              width: 24,
              marginTop: -8,
              backgroundColor: '#fff',
              boxShadow: '0 2px 10px rgba(0,0,0,0.3), 0 0 0 4px rgba(255,255,255,0.1)',
              opacity: 1
            }
          }}
        />
      </div>
      
      {/* Decorative Glow */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '80%', height: '50%', background: 'linear-gradient(90deg, rgba(59,130,246,0.15), rgba(236,72,153,0.15))', filter: 'blur(20px)', zIndex: -1, borderRadius: '50%' }} />
    </div>
  )
}
