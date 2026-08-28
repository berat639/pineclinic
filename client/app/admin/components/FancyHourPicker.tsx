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
      padding: '16px 14px', 
      background: '#0f172a', 
      borderRadius: '10px', 
      border: '1px solid #334155' 
    }}>
      {/* Time Display */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', padding: '0 4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Başlangıç</span>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#60a5fa' }}>{formatTime(range[0])}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Bitiş</span>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f472b6' }}>{formatTime(range[1])}</span>
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
          styles={{
            rail: { 
              backgroundColor: '#334155',
              height: 8,
              borderRadius: 4
            },
            track: { 
              background: '#2563eb', 
              height: 8,
              borderRadius: 4
            },
            handle: { 
              borderColor: '#2563eb',
              height: 22,
              width: 22,
              marginTop: -7,
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              opacity: 1
            }
          }}
        />
      </div>
    </div>
  )
}
