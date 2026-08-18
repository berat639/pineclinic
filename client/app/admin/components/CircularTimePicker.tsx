import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Moon, Sun } from 'lucide-react'

interface CircularTimePickerProps {
  range: [number, number] // [startHour, endHour] from 0 to 24
  onChange: (val: [number, number]) => void
}

const formatTime = (hour: number) => {
  const h = Math.floor(hour)
  const m = Math.round((hour % 1) * 60)
  const displayH = h === 24 ? 0 : h
  return {
    time: `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
    ampm: ''
  }
}

export default function CircularTimePicker({ range, onChange }: CircularTimePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null)

  const size = 300
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = 32
  const radius = (size - strokeWidth) / 2 - 10

  // 0 is Top (12 AM), increases clockwise
  const hourToAngle = (h: number) => (h / 24) * 2 * Math.PI - Math.PI / 2
  const angleToHour = (angle: number) => {
    let a = angle + Math.PI / 2
    if (a < 0) a += 2 * Math.PI
    return (a / (2 * Math.PI)) * 24
  }

  const polarToCartesian = (angle: number) => ({
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  })

  const getAngleFromEvent = (e: React.PointerEvent | PointerEvent) => {
    if (!containerRef.current) return 0
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - cx
    const y = e.clientY - rect.top - cy
    return Math.atan2(y, x)
  }

  const handlePointerDown = (e: React.PointerEvent, type: 'start' | 'end') => {
    setIsDragging(type);
    (e.target as Element).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging) return
    const angle = getAngleFromEvent(e)
    let newHour = angleToHour(angle)
    // snap to 15 mins (0.25)
    newHour = Math.round(newHour * 4) / 4

    let [s, eHour] = range
    if (isDragging === 'start') {
      s = newHour
    } else {
      eHour = newHour
    }
    
    // Prevent overlapping if they are too close
    if (Math.abs(eHour - s) < 0.25) return
    
    onChange([s, eHour])
  }, [isDragging, range, onChange])

  const handlePointerUp = useCallback(() => {
    setIsDragging(null)
  }, [])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging, handlePointerMove, handlePointerUp])

  const startAngle = hourToAngle(range[0])
  const endAngle = hourToAngle(range[1])
  
  const startPos = polarToCartesian(startAngle)
  const endPos = polarToCartesian(endAngle)

  // Calculate SVG Arc
  let largeArcFlag = 0
  if (range[1] >= range[0]) {
    largeArcFlag = (range[1] - range[0]) > 12 ? 1 : 0
  } else {
    largeArcFlag = (range[1] + 24 - range[0]) > 12 ? 1 : 0
  }
  
  // If exact 24 hours
  if (Math.abs(range[1] - range[0]) === 24) largeArcFlag = 1

  const arcPath = `M ${startPos.x} ${startPos.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endPos.x} ${endPos.y}`

  const ticks = Array.from({ length: 24 }).map((_, i) => {
    const a = hourToAngle(i)
    const isMain = i % 6 === 0
    const innerR = radius - (isMain ? 16 : 8)
    const outerR = radius - 4
    return (
      <line
        key={i}
        x1={cx + innerR * Math.cos(a)}
        y1={cy + innerR * Math.sin(a)}
        x2={cx + outerR * Math.cos(a)}
        y2={cy + outerR * Math.sin(a)}
        stroke="var(--foreground-3)"
        strokeWidth={isMain ? 2 : 1}
        opacity={0.4}
      />
    )
  })

  // Diff in hours
  let diff = range[1] - range[0]
  if (diff < 0) diff += 24
  const diffH = Math.floor(diff)
  const diffM = Math.round((diff % 1) * 60)

  const startFmt = formatTime(range[0])
  const endFmt = formatTime(range[1])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'sans-serif' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 20px', marginBottom: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--foreground-3)', fontWeight: 600, textTransform: 'uppercase' }}>Vardiya Başı</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--foreground)' }}>
            {startFmt.time}<span style={{ fontSize: 12, marginLeft: 2 }}>{startFmt.ampm}</span>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--foreground-3)', fontWeight: 600, textTransform: 'uppercase' }}>Vardiya Sonu</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--foreground)' }}>
            {endFmt.time}<span style={{ fontSize: 12, marginLeft: 2 }}>{endFmt.ampm}</span>
          </div>
        </div>
      </div>

      <div ref={containerRef} style={{ position: 'relative', width: size, height: size, touchAction: 'none' }}>
        <svg width={size} height={size} style={{ transform: 'rotate(0deg)' }}>
          {/* Background Track */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(150,150,150,0.15)" strokeWidth={strokeWidth} />
          
          {/* Ticks inside */}
          <g>{ticks}</g>
          
          {/* Inner Labels */}
          <text x={cx} y={cy - radius + 40} fill="var(--foreground)" fontSize={12} fontWeight={600} textAnchor="middle">00:00</text>
          <text x={cx} y={cy + radius - 30} fill="var(--foreground)" fontSize={12} fontWeight={600} textAnchor="middle">12:00</text>
          <text x={cx + radius - 40} y={cy + 4} fill="var(--foreground)" fontSize={12} fontWeight={600} textAnchor="middle">06:00</text>
          <text x={cx - radius + 40} y={cy + 4} fill="var(--foreground)" fontSize={12} fontWeight={600} textAnchor="middle">18:00</text>
          
          {/* Active Range Arc */}
          <path d={arcPath} fill="none" stroke="#f59e0b" strokeWidth={strokeWidth} strokeLinecap="round" />
          
          {/* Start Handle */}
          <g 
            transform={`translate(${startPos.x}, ${startPos.y})`} 
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => handlePointerDown(e, 'start')}
          >
            <circle cx={0} cy={0} r={strokeWidth/2} fill="#f59e0b" />
            <circle cx={0} cy={0} r={strokeWidth/2 - 3} fill="#1f2937" />
            {/* Simple moon/bed icon proxy */}
            <path d="M-3,-4 A 5 5 0 0 1 3,2 A 5 5 0 0 0 -4,1 Z" fill="#f59e0b" />
          </g>
          
          {/* End Handle */}
          <g 
            transform={`translate(${endPos.x}, ${endPos.y})`} 
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => handlePointerDown(e, 'end')}
          >
            <circle cx={0} cy={0} r={strokeWidth/2} fill="#f59e0b" />
            <circle cx={0} cy={0} r={strokeWidth/2 - 3} fill="#1f2937" />
            {/* Simple sun/bell icon proxy */}
            <circle cx={0} cy={0} r={3} fill="#f59e0b" />
            <path d="M0,-5 L0,-7 M0,5 L0,7 M-5,0 L-7,0 M5,0 L7,0" stroke="#f59e0b" strokeWidth={1.5} />
          </g>
        </svg>

        {/* Center Icons */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', pointerEvents: 'none', opacity: 0.8 }}>
           <Moon size={20} color="#8b5cf6" />
           <Sun size={20} color="#f59e0b" />
        </div>
      </div>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)' }}>
          {diffH} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground-3)' }}>SAAT</span> {diffM > 0 && <>{diffM} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground-3)' }}>DK</span></>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--foreground-3)', marginTop: 4 }}>
          Toplam Vardiya Süresi
        </div>
      </div>

    </div>
  )
}
