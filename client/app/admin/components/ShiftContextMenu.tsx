import React, { useState, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { CalendarOff, Clock, Repeat, Trash2, Edit3, X } from 'lucide-react'

export interface ShiftContextMenuProps {
  x: number
  y: number
  doctorId?: string
  doctorName?: string
  date: string
  initialStartTime?: string
  initialEndTime?: string
  existingShiftId?: string
  users?: { id: string; name: string }[]
  onClose: () => void
  onSave?: (shift: {
    userId: string
    date: string
    startTime: string
    endTime: string
    shiftType: string
    repeatMode?: 'daily' | 'weekly' | 'monthly'
  }) => void
  onDeleteShift?: (shiftId: string) => void
  onOpenEditModal?: () => void
  onOpenLeaveModal?: (doctorId: string, date: string) => void
}

function toMins(t: string): number {
  const [h, m] = (t || '09:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function fromMins(m: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, m))
  if (clamped >= 24 * 60) return '24:00'
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0')
  const mm = String(clamped % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function ShiftContextMenu({
  x,
  y,
  doctorId,
  doctorName,
  date,
  initialStartTime = '09:00',
  initialEndTime = '19:00',
  existingShiftId,
  users,
  onClose,
  onSave,
  onDeleteShift,
  onOpenEditModal,
  onOpenLeaveModal,
}: ShiftContextMenuProps) {
  const [selectedDoctorId, setSelectedDoctorId] = useState(doctorId || '')
  const [startTime, setStartTime] = useState(initialStartTime || '09:00')
  const [endTime, setEndTime] = useState(initialEndTime || '19:00')
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const safeLeft = typeof window !== 'undefined' ? Math.min(x, Math.max(12, window.innerWidth - 296)) : x
  const safeTop = typeof window !== 'undefined' ? Math.min(y, Math.max(12, window.innerHeight - 390)) : y

  const startPct = (toMins(startTime) / (24 * 60)) * 100
  const endPct = (toMins(endTime) / (24 * 60)) * 100

  const handleTrackMove = (clientX: number, thumb: 'start' | 'end') => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const snapped = Math.round((ratio * 24 * 60) / 30) * 30
    if (thumb === 'start') {
      setStartTime(fromMins(Math.min(23 * 60 + 30, snapped)))
    } else {
      setEndTime(fromMins(Math.max(30, snapped)))
    }
  }

  const startDrag = (thumb: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(thumb)
    const onMove = (ev: PointerEvent) => handleTrackMove(ev.clientX, thumb)
    const onUp = () => {
      setDragging(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handleApply = (repeatMode: 'daily' | 'weekly' | 'monthly') => {
    if (!selectedDoctorId) {
      toast.error('Lütfen bir personel seçin')
      return
    }
    if (!startTime || !endTime) {
      toast.error('Lütfen başlangıç ve bitiş saati seçin')
      return
    }
    onSave?.({
      userId: selectedDoctorId,
      date,
      startTime,
      endTime,
      shiftType: repeatMode === 'daily' ? 'Günlük Mesai' : repeatMode === 'weekly' ? 'Haftalık Mesai' : 'Aylık Mesai',
      repeatMode,
    })
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: safeTop,
        left: safeLeft,
        zIndex: 100005,
        background: 'var(--card-bg, #ffffff)',
        border: '1.5px solid var(--input-border, #cbd5e1)',
        borderRadius: 14,
        padding: 14,
        boxShadow: 'var(--pc-modal-shadow)',
        width: 280,
        color: 'var(--foreground)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--foreground)' }}>
            {doctorName || 'Mesai & İzin İşlemleri'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', fontWeight: 600 }}>
            {new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            border: '1px solid var(--input-border)',
            background: 'var(--card-inner)',
            color: 'var(--foreground-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={13} />
        </button>
      </div>

      {!doctorId && users && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--foreground-2)', marginBottom: 4 }}>Personel Seç</div>
          <select
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 9px',
              borderRadius: 9,
              border: '1.5px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--foreground)',
              fontSize: '0.78rem',
              fontWeight: 600,
              boxShadow: 'var(--pc-neo-inset)',
              outline: 'none',
            }}
          >
            <option value="">Seçiniz...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {onSave && (
        <>
          <div
            style={{
              padding: '10px 11px',
              borderRadius: 10,
              background: 'var(--card-inner)',
              border: '1px solid var(--input-border)',
              boxShadow: 'var(--pc-neo-subcard)',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--foreground-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} color="#2563eb" /> Mesai Saati (Sürükle / Seç)
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: 'var(--badge-clinic-text, #1d4ed8)',
                  background: 'var(--badge-clinic-bg, #e0f2fe)',
                  border: '1px solid var(--badge-clinic-border, #bae6fd)',
                  padding: '2px 7px',
                  borderRadius: 999,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {startTime} – {endTime}
              </span>
            </div>

            {/* Interactive Mini Range Slider */}
            <div style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center', marginBottom: 8, userSelect: 'none' }}>
              <div
                ref={trackRef}
                onClick={(e) => {
                  if (!trackRef.current) return
                  const rect = trackRef.current.getBoundingClientRect()
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                  const clickedMin = Math.round((ratio * 24 * 60) / 30) * 30
                  const distStart = Math.abs(clickedMin - toMins(startTime))
                  const distEnd = Math.abs(clickedMin - toMins(endTime))
                  handleTrackMove(e.clientX, distStart <= distEnd ? 'start' : 'end')
                }}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 8,
                  borderRadius: 999,
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  boxShadow: 'var(--pc-neo-inset)',
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
              >
                {endPct >= startPct ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${startPct}%`,
                      width: `${Math.max(2, endPct - startPct)}%`,
                      background: 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)',
                      borderRadius: 999,
                    }}
                  />
                ) : (
                  <>
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${startPct}%`,
                        right: 0,
                        background: 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: `${endPct}%`,
                        background: 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)',
                      }}
                    />
                  </>
                )}
              </div>

              <div
                onPointerDown={startDrag('start')}
                style={{
                  position: 'absolute',
                  left: `calc(${startPct}% - 9px)`,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                  border: '2px solid #ffffff',
                  boxShadow: '0 2px 5px rgba(29, 78, 216, 0.35)',
                  cursor: dragging === 'start' ? 'grabbing' : 'grab',
                  zIndex: 2,
                }}
              />
              <div
                onPointerDown={startDrag('end')}
                style={{
                  position: 'absolute',
                  left: `calc(${endPct}% - 9px)`,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                  border: '2px solid #ffffff',
                  boxShadow: '0 2px 5px rgba(29, 78, 216, 0.35)',
                  cursor: dragging === 'end' ? 'grabbing' : 'grab',
                  zIndex: 2,
                }}
              />
            </div>

            {/* Quick Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {[
                { label: '08-20', s: '08:00', e: '20:00' },
                { label: '09-18', s: '09:00', e: '18:00' },
                { label: '09-13', s: '09:00', e: '13:00' },
                { label: '13-19', s: '13:00', e: '19:00' },
              ].map((p) => {
                const active = startTime === p.s && endTime === p.e
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setStartTime(p.s)
                      setEndTime(p.e)
                    }}
                    className={active ? 'btn-clinic-primary' : 'btn-clinic-outline'}
                    style={{
                      padding: '4px 4px',
                      borderRadius: 6,
                      fontSize: '0.66rem',
                      fontWeight: 750,
                      border: active ? '1px solid #1d4ed8' : '1px solid var(--btn-clinic-outline-border, #93c5fd)',
                      background: active ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--btn-clinic-outline-bg, #eff6ff)',
                      color: active ? '#ffffff' : 'var(--btn-clinic-outline-text, #1d4ed8)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ color: active ? '#ffffff' : 'inherit' }}>{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              type="button"
              onClick={() => handleApply('daily')}
              className="btn-clinic-primary"
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 11px',
                borderRadius: 9,
                border: '1px solid #1d4ed8',
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 700,
                boxShadow: 'var(--pc-clay-primary)',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: '#ffffff' }}>Bugün Ata (Günlük)</span>
              <span style={{ color: '#ffffff', opacity: 0.9, fontSize: '0.7rem' }}>
                {startTime}–{endTime}
              </span>
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                type="button"
                onClick={() => handleApply('weekly')}
                className="btn-clinic-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '7px 8px',
                  borderRadius: 9,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  boxShadow: 'var(--pc-clay-btn)',
                  cursor: 'pointer',
                }}
                title="Bu haftanın iş günlerine (Pzt–Cmt) aynı saat aralığını uygular"
              >
                <Repeat size={12} /> Bu Hafta Ata
              </button>
              <button
                type="button"
                onClick={() => handleApply('monthly')}
                className="btn-clinic-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '7px 8px',
                  borderRadius: 9,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  boxShadow: 'var(--pc-clay-btn)',
                  cursor: 'pointer',
                }}
                title="Bu ayın iş günlerine (Pzt–Cmt) aynı saat aralığını uygular"
              >
                <Repeat size={12} /> Bu Ay Ata
              </button>
            </div>
          </div>
        </>
      )}

      {(onOpenEditModal || (existingShiftId && onDeleteShift) || onOpenLeaveModal) && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--input-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {onOpenEditModal && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenEditModal()
              }}
              className="btn-clinic-outline"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '7px 10px',
                borderRadius: 9,
                fontSize: '0.73rem',
                fontWeight: 700,
                boxShadow: 'var(--pc-clay-btn)',
                cursor: 'pointer',
              }}
            >
              <Edit3 size={13} /> Detaylı Mesai Düzenle
            </button>
          )}

          {existingShiftId && onDeleteShift && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onDeleteShift(existingShiftId)
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '7px 10px',
                borderRadius: 9,
                border: '1px solid var(--danger, #ef4444)',
                background: 'var(--card-inner)',
                color: 'var(--danger, #ef4444)',
                fontSize: '0.73rem',
                fontWeight: 700,
                boxShadow: 'var(--pc-clay-btn)',
                cursor: 'pointer',
              }}
            >
              <Trash2 size={13} /> Bu Mesaiyi Sil
            </button>
          )}

          {onOpenLeaveModal && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenLeaveModal(selectedDoctorId, date)
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '7px 10px',
                borderRadius: 9,
                border: '1px solid var(--danger, #ef4444)',
                background: 'var(--card-inner)',
                color: 'var(--danger, #ef4444)',
                fontSize: '0.73rem',
                fontWeight: 700,
                boxShadow: 'var(--pc-clay-btn)',
                cursor: 'pointer',
              }}
            >
              <CalendarOff size={13} /> İzinli Yap / Saat Kapat
            </button>
          )}
        </div>
      )}
    </div>
  )
}
