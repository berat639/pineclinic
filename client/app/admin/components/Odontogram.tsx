'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// ── FDI Tooth Numbers & Layout ─────────────────────────────────────────────
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38]
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]

export type ToothCondition =
  | 'healthy'
  | 'missing'
  | 'decayed'
  | 'filled'
  | 'crown'
  | 'bridge'
  | 'implant'
  | 'root_canal'
  | 'extraction_planned'

interface ToothRecord {
  id?: string
  toothNumber: number
  condition: ToothCondition
  surface?: string
  notes?: string
}

interface OdontogramProps {
  patientId: string | null
  records: ToothRecord[]
  onUpdateTooth: (toothNumber: number, condition: ToothCondition, notes?: string) => void
  loading?: boolean
}

const CONDITIONS: { value: ToothCondition; label: string; color: string; icon: string }[] = [
  { value: 'healthy', label: 'Sağlıklı', color: '#22c55e', icon: '✓' },
  { value: 'missing', label: 'Eksik', color: '#6b7280', icon: '✕' },
  { value: 'decayed', label: 'Çürük', color: '#ef4444', icon: '●' },
  { value: 'filled', label: 'Dolgulu', color: '#3b82f6', icon: '◆' },
  { value: 'crown', label: 'Kuron', color: '#f59e0b', icon: '♛' },
  { value: 'bridge', label: 'Köprü', color: '#8b5cf6', icon: '⌢' },
  { value: 'implant', label: 'İmplant', color: '#06b6d4', icon: '⬡' },
  { value: 'root_canal', label: 'Kanal Tedavisi', color: '#ec4899', icon: '⊕' },
  { value: 'extraction_planned', label: 'Çekim Planlanmış', color: '#f97316', icon: '⚠' },
]

function getConditionInfo(condition: ToothCondition) {
  return CONDITIONS.find(c => c.value === condition) || CONDITIONS[0]!
}

// ── Tooth shapes (simplified SVG paths) ────────────────────────────────────
function isIncisor(num: number) {
  const n = num % 10
  return n === 1 || n === 2
}
function isCanine(num: number) {
  return num % 10 === 3
}
function isPremolar(num: number) {
  const n = num % 10
  return n === 4 || n === 5
}
function isMolar(num: number) {
  const n = num % 10
  return n >= 6 && n <= 8
}

function ToothShape({ num, isUpper }: { num: number; isUpper: boolean }) {
  // Simple tooth shapes
  if (isIncisor(num)) {
    return isUpper
      ? <path d="M8 2 C8 2 4 4 4 12 L4 28 C4 30 6 32 10 32 L22 32 C26 32 28 30 28 28 L28 12 C28 4 24 2 24 2 Z" />
      : <path d="M8 30 C8 30 4 28 4 20 L4 4 C4 2 6 0 10 0 L22 0 C26 0 28 2 28 4 L28 20 C28 28 24 30 24 30 Z" />
  }
  if (isCanine(num)) {
    return isUpper
      ? <path d="M10 0 C10 0 4 6 4 14 L4 28 C4 30 6 32 10 32 L22 32 C26 32 28 30 28 28 L28 14 C28 6 22 0 22 0 Z" />
      : <path d="M10 32 C10 32 4 26 4 18 L4 4 C4 2 6 0 10 0 L22 0 C26 0 28 2 28 4 L28 18 C28 26 22 32 22 32 Z" />
  }
  if (isPremolar(num)) {
    return isUpper
      ? <path d="M6 4 C6 2 8 0 12 0 L20 0 C24 0 26 2 26 4 L26 26 C26 30 22 32 16 32 C10 32 6 30 6 26 Z" />
      : <path d="M6 28 C6 30 8 32 12 32 L20 32 C24 32 26 30 26 28 L26 6 C26 2 22 0 16 0 C10 0 6 2 6 6 Z" />
  }
  // Molar
  return isUpper
    ? <path d="M4 6 C4 2 8 0 12 0 L22 0 C26 0 30 2 30 6 L30 24 C30 29 26 32 20 32 L14 32 C8 32 4 29 4 24 Z" />
    : <path d="M4 26 C4 30 8 32 12 32 L22 32 C26 32 30 30 30 26 L30 8 C30 3 26 0 20 0 L14 0 C8 0 4 3 4 8 Z" />
}

// ── Single Tooth Component ─────────────────────────────────────────────────
function Tooth({
  num,
  isUpper,
  condition,
  onContextMenu,
  onClick,
}: {
  num: number
  isUpper: boolean
  condition: ToothCondition
  onContextMenu: (e: React.MouseEvent) => void
  onClick: () => void
}) {
  const info = getConditionInfo(condition)
  const isMissing = condition === 'missing'
  const w = isMolar(num) ? 34 : isPremolar(num) ? 32 : isCanine(num) ? 32 : 32
  const h = 36

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onContextMenu={onContextMenu}
      onClick={onClick}
    >
      {isUpper && (
        <span style={{ fontSize: 9, color: 'var(--foreground-3)', fontWeight: 500, fontFamily: 'monospace' }}>
          {num}
        </span>
      )}
      <div style={{ position: 'relative', width: w, height: h }}>
        <svg
          width={w}
          height={h}
          viewBox="0 0 32 32"
          style={{
            filter: isMissing ? 'grayscale(1) opacity(0.3)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <g
            fill={isMissing ? 'var(--glass-bg)' : info.color + '30'}
            stroke={info.color}
            strokeWidth={1.5}
          >
            <ToothShape num={num} isUpper={isUpper} />
          </g>
        </svg>
        {/* Condition indicator */}
        {condition !== 'healthy' && !isMissing && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 12,
              fontWeight: 700,
              color: info.color,
              textShadow: '0 0 3px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}
          >
            {info.icon}
          </div>
        )}
        {isMissing && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 16,
              fontWeight: 700,
              color: info.color,
              pointerEvents: 'none',
            }}
          >
            ✕
          </div>
        )}
      </div>
      {!isUpper && (
        <span style={{ fontSize: 9, color: 'var(--foreground-3)', fontWeight: 500, fontFamily: 'monospace' }}>
          {num}
        </span>
      )}
    </div>
  )
}

// ── Context Menu Component ─────────────────────────────────────────────────
function ContextMenu({
  x,
  y,
  toothNumber,
  currentCondition,
  onSelect,
  onClose,
}: {
  x: number
  y: number
  toothNumber: number
  currentCondition: ToothCondition
  onSelect: (condition: ToothCondition) => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [noteMode, setNoteMode] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 220)
  const adjustedY = Math.min(y, window.innerHeight - 400)

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 10000,
        background: 'var(--card-bg, #1e293b)',
        border: '1px solid var(--input-border, #334155)',
        borderRadius: 10,
        padding: '6px 0',
        minWidth: 200,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div style={{
        padding: '6px 14px 8px',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--foreground-2)',
        borderBottom: '1px solid var(--input-border, #334155)',
        marginBottom: 4,
      }}>
        Diş #{toothNumber} — Durum Belirle
      </div>
      {CONDITIONS.map((c) => (
        <button
          key={c.value}
          onClick={() => onSelect(c.value)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '7px 14px',
            background: currentCondition === c.value ? c.color + '20' : 'transparent',
            border: 'none',
            color: 'var(--foreground)',
            fontSize: 12,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = c.color + '15')}
          onMouseLeave={e => (e.currentTarget.style.background = currentCondition === c.value ? c.color + '20' : 'transparent')}
        >
          <span style={{ color: c.color, fontSize: 14, width: 18, textAlign: 'center' }}>{c.icon}</span>
          <span>{c.label}</span>
          {currentCondition === c.value && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: c.color }}>●</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Legend Component ────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px 14px',
      padding: '8px 12px',
      borderRadius: 8,
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      marginTop: 12,
    }}>
      {CONDITIONS.map(c => (
        <div key={c.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--foreground-2)' }}>
          <span style={{ color: c.color, fontSize: 12 }}>{c.icon}</span>
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Odontogram Component ──────────────────────────────────────────────
export default function Odontogram({ patientId, records, onUpdateTooth, loading }: OdontogramProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; toothNumber: number } | null>(null)

  const getCondition = useCallback((num: number): ToothCondition => {
    const record = records.find(r => r.toothNumber === num)
    return (record?.condition as ToothCondition) || 'healthy'
  }, [records])

  const handleContextMenu = useCallback((e: React.MouseEvent, num: number) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, toothNumber: num })
  }, [])

  const handleSelect = useCallback((condition: ToothCondition) => {
    if (contextMenu) {
      onUpdateTooth(contextMenu.toothNumber, condition)
      setContextMenu(null)
    }
  }, [contextMenu, onUpdateTooth])

  if (!patientId) {
    return (
      <div style={{
        padding: 24,
        borderRadius: 12,
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🦷</div>
        <div style={{ fontSize: 13, color: 'var(--foreground-3)' }}>
          Odontogramı görüntülemek için bir hasta seçin
        </div>
      </div>
    )
  }

  const renderRow = (teeth: number[], isUpper: boolean) => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: 3,
    }}>
      {teeth.map(num => (
        <Tooth
          key={num}
          num={num}
          isUpper={isUpper}
          condition={getCondition(num)}
          onContextMenu={(e) => handleContextMenu(e, num)}
          onClick={() => handleContextMenu({ preventDefault: () => {}, clientX: 0, clientY: 0 } as any, num)}
        />
      ))}
    </div>
  )

  return (
    <div style={{
      padding: '16px 12px',
      borderRadius: 12,
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>🦷</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>Odontogram</span>
        <span style={{ fontSize: 10, color: 'var(--foreground-3)', marginLeft: 'auto' }}>Sağ tıklayarak diş durumunu belirleyin</span>
        {loading && <span style={{ fontSize: 10, color: 'var(--accent)' }}>Yükleniyor...</span>}
      </div>

      {/* Upper Jaw */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 4,
      }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {UPPER_RIGHT.map(num => (
            <Tooth key={num} num={num} isUpper condition={getCondition(num)} onContextMenu={(e) => handleContextMenu(e, num)} onClick={() => {}} />
          ))}
        </div>
        <div style={{ width: 2, background: 'var(--glass-border)', borderRadius: 1, alignSelf: 'stretch' }} />
        <div style={{ display: 'flex', gap: 3 }}>
          {UPPER_LEFT.map(num => (
            <Tooth key={num} num={num} isUpper condition={getCondition(num)} onContextMenu={(e) => handleContextMenu(e, num)} onClick={() => {}} />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--glass-border), var(--accent)30, var(--glass-border), transparent)',
        margin: '6px 0',
      }} />

      {/* Lower Jaw */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        marginTop: 4,
      }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {LOWER_RIGHT.map(num => (
            <Tooth key={num} num={num} isUpper={false} condition={getCondition(num)} onContextMenu={(e) => handleContextMenu(e, num)} onClick={() => {}} />
          ))}
        </div>
        <div style={{ width: 2, background: 'var(--glass-border)', borderRadius: 1, alignSelf: 'stretch' }} />
        <div style={{ display: 'flex', gap: 3 }}>
          {LOWER_LEFT.map(num => (
            <Tooth key={num} num={num} isUpper={false} condition={getCondition(num)} onContextMenu={(e) => handleContextMenu(e, num)} onClick={() => {}} />
          ))}
        </div>
      </div>

      <Legend />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          toothNumber={contextMenu.toothNumber}
          currentCondition={getCondition(contextMenu.toothNumber)}
          onSelect={handleSelect}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
