import React, { useState } from 'react'
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

const TIME_OPTIONS = Array.from({ length: 48 }, (_, idx) => {
  const total = idx * 30
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
})

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

  const safeLeft = typeof window !== 'undefined' ? Math.min(x, Math.max(12, window.innerWidth - 280)) : x
  const safeTop = typeof window !== 'undefined' ? Math.min(y, Math.max(12, window.innerHeight - 360)) : y

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
        boxShadow: 'var(--pc-neo-card)',
        width: 264,
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
              padding: '9px 10px',
              borderRadius: 10,
              background: 'var(--card-inner)',
              border: '1px solid var(--input-border)',
              boxShadow: 'var(--pc-neo-subcard)',
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--foreground-2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} color="var(--accent, #0284c7)" /> Mesai Saat Aralığı
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 5 }}>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{
                  padding: '5px 6px',
                  borderRadius: 8,
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--foreground)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  boxShadow: 'var(--pc-neo-inset)',
                }}
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={`ctx-s-${t}`} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-3)' }}>–</span>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{
                  padding: '5px 6px',
                  borderRadius: 8,
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--foreground)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  boxShadow: 'var(--pc-neo-inset)',
                }}
              >
                {[...TIME_OPTIONS.slice(1), '24:00'].map((t) => (
                  <option key={`ctx-e-${t}`} value={t}>
                    {t}
                  </option>
                ))}
              </select>
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
                border: '1px solid #0284c7',
                background: 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)',
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
