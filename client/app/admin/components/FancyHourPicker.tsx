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
    <div style={{ 
      position: 'relative', 
      padding: '18px 16px',
      background: 'var(--card-inner)',
      borderRadius: '10px',
      border: '1px solid var(--input-border)'
    }}>
      {/* Time Display */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px', padding: '0 4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Başlangıç</span>
          <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--foreground)' }}>{formatTime(range[0])}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Bitiş</span>
          <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--foreground)' }}>{formatTime(range[1])}</span>
        </div>
      </div>

      {/* Slider */}
      <div style={{ padding: '0 6px' }}>
        <Slider
          range
          min={6} max={24} step={0.5}
          value={range}
          onChange={(val) => onChange(val as [number, number])}
          allowCross={false}
          pushable={0.5}
          styles={{
            rail: { 
              backgroundColor: 'var(--input-border)',
              height: 8,
              borderRadius: 4
            },
            track: { 
              background: 'var(--accent)',
              height: 8,
              borderRadius: 4
            },
            handle: { 
              border: '3px solid var(--accent)',
              height: 18,
              width: 18,
              marginTop: -5,
              backgroundColor: 'var(--card-bg)',
              boxShadow: 'none',
              opacity: 1
            }
          }}
        />
      </div>
    </div>
  )
}
