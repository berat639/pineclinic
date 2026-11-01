'use client'

import React, { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { CalendarOff, X, Trash2, Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { tr } from 'date-fns/locale'
import 'react-day-picker/dist/style.css'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'

export interface DoctorLeaveItem {
  id: string
  doctorId: string
  doctorName?: string
  doctorColor?: string
  date: string
  startTime: string
  endTime: string
  isFullDay: boolean
  reason?: string | null
  notes?: string | null
  createdAt?: string
}

interface DoctorLeaveModalProps {
  isOpen: boolean
  onClose: () => void
  doctors: { id: string; name: string; specialty?: string; color?: string }[]
  initialDoctorId?: string
  initialDate?: string
  initialStartTime?: string
  initialEndTime?: string
  onSaved?: () => void
  onSuccess?: () => void
}

const PRESET_REASONS = [
  'Yıllık İzin',
  'Mazeret İzni',
  'Seminer / Eğitim',
  'Mola / Dinlenme',
  'Hastalık / Rapor',
  'Kişisel İzin',
]

function parseYmd(value: string): Date {
  const [y, m, d] = (value || '').split('-').map(Number)
  if (!y || !m || !d) return new Date()
  return new Date(y, m - 1, d, 12, 0, 0)
}

function toYmd(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toMins(t: string): number {
  const [h, m] = (t || '09:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function fromMins(m: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 30, m))
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0')
  const mm = String(clamped % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function DoctorLeaveModal({
  isOpen,
  onClose,
  doctors,
  initialDoctorId,
  initialDate,
  initialStartTime,
  initialEndTime,
  onSaved,
  onSuccess,
}: DoctorLeaveModalProps) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const [selectedDoctorId, setSelectedDoctorId] = useState(initialDoctorId || '')
  const [date, setDate] = useState(initialDate || new Date().toISOString().slice(0, 10))
  const [isFullDay, setIsFullDay] = useState(false)
  const [startTime, setStartTime] = useState(initialStartTime || '09:00')
  const [endTime, setEndTime] = useState(initialEndTime || '18:00')
  const [reason, setReason] = useState('Yıllık İzin')
  const [customReason, setCustomReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [showDatePopover, setShowDatePopover] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => parseYmd(initialDate || new Date().toISOString().slice(0, 10)))
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const [existingLeaves, setExistingLeaves] = useState<DoctorLeaveItem[]>([])

  useEffect(() => {
    if (initialDoctorId !== undefined) setSelectedDoctorId(initialDoctorId || '')
    if (initialDate) {
      setDate(initialDate)
      setCalendarMonth(parseYmd(initialDate))
    }
    if (initialStartTime) setStartTime(initialStartTime)
    if (initialEndTime) setEndTime(initialEndTime)
  }, [initialDoctorId, initialDate, initialStartTime, initialEndTime, isOpen])

  const fetchLeaves = async () => {
    if (!selectedDoctorId) {
      setExistingLeaves([])
      return
    }
    try {
      const res = await fetch(`/api/dental/doctors/leaves?doctorId=${selectedDoctorId}`)
      if (res.ok) {
        const data = await res.json()
        setExistingLeaves(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error('Error fetching doctor leaves:', e)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchLeaves()
    }
  }, [isOpen, selectedDoctorId])

  if (!isOpen) return null

  const startPct = (toMins(startTime) / (24 * 60)) * 100
  const endPct = (toMins(endTime) / (24 * 60)) * 100

  const handleTrackMove = (clientX: number, thumb: 'start' | 'end') => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const snapped = Math.round((ratio * 24 * 60) / 30) * 30
    if (thumb === 'start') {
      const nextStart = Math.min(toMins(endTime) - 30, Math.max(0, snapped))
      setStartTime(fromMins(nextStart))
    } else {
      const nextEnd = Math.max(toMins(startTime) + 30, Math.min(23 * 60 + 30, snapped))
      setEndTime(fromMins(nextEnd))
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

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedDoctorId) {
      toast.error('Lütfen bir hekim seçin')
      return
    }
    if (!date) {
      toast.error('Lütfen bir tarih seçin')
      return
    }

    const finalStartTime = isFullDay ? '00:00' : startTime
    const finalEndTime = isFullDay ? '23:59' : endTime

    if (!isFullDay && finalStartTime >= finalEndTime) {
      toast.error('Başlangıç saati bitiş saatinden önce olmalıdır')
      return
    }

    const finalReason = reason === 'Diğer' ? customReason.trim() : reason

    setSaving(true)
    try {
      const res = await fetch('/api/dental/doctors/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          date,
          startTime: finalStartTime,
          endTime: finalEndTime,
          isFullDay,
          reason: finalReason || null,
          notes: notes.trim() || null,
        }),
      })

      if (res.ok) {
        toast.success('Hekim izni başarıyla kaydedildi')
        if (onSaved) onSaved()
        if (onSuccess) onSuccess()
        fetchLeaves()
        setReason('Yıllık İzin')
        setCustomReason('')
        setNotes('')
        onClose()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error('Hata: ' + (err.error || 'İzin kaydedilemedi'))
      }
    } catch (e) {
      console.error(e)
      toast.error('İzin kaydedilirken bir hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLeave = async (leaveId: string) => {
    try {
      const res = await fetch(`/api/dental/doctors/leaves/${leaveId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('İzin silindi, saatler yeniden açıldı')
        setExistingLeaves((prev) => prev.filter((l) => l.id !== leaveId))
        if (onSaved) onSaved()
        if (onSuccess) onSuccess()
      } else {
        toast.error('İzin silinemedi')
      }
    } catch {
      toast.error('İzin silinirken hata oluştu')
    }
  }

  const cardBg = 'var(--card-bg)'
  const subCardBg = 'var(--card-inner, var(--background-2))'
  const borderCol = 'var(--input-border)'
  const textCol = 'var(--foreground)'
  const labelCol = 'var(--foreground-2)'
  const mutedCol = 'var(--foreground-3)'
  const inputBg = 'var(--input-bg)'
  const brandBlue = '#2563eb'
  const brandBlueBorder = '#1d4ed8'
  const brandBlueGradient = 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'

  const inputStyle: React.CSSProperties = {
    padding: '9px 12px',
    borderRadius: '10px',
    border: `1.5px solid ${borderCol}`,
    background: inputBg,
    color: textCol,
    boxShadow: 'var(--pc-neo-inset)',
    fontSize: '0.84rem',
    fontWeight: 600,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: labelCol,
    marginBottom: 4,
    display: 'block',
    fontWeight: 700,
  }

  const selectOptionStyle: React.CSSProperties = {
    background: cardBg,
    color: textCol,
  }

  const formattedDate = parseYmd(date).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100020,
          background: 'rgba(15, 23, 42, 0.6)',
        }}
        {...backdropDismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hekim İzni ve Kapalı Saat"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'calc(100vw - 24px)',
          maxWidth: '460px',
          background: cardBg,
          border: `1.5px solid ${borderCol}`,
          borderRadius: '14px',
          boxShadow: 'var(--pc-modal-shadow)',
          zIndex: 100021,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header (Yeni Randevu Boyutunda & Stilinde) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '15px 20px',
            borderBottom: `1px solid ${borderCol}`,
            background: subCardBg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: brandBlueGradient,
                boxShadow: 'var(--pc-clay-primary)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CalendarOff size={17} color="#ffffff" />
            </div>
            <div>
              <div
                style={{
                  fontSize: '1.02rem',
                  fontWeight: 700,
                  color: textCol,
                  lineHeight: 1.2,
                }}
              >
                İzin / Kapalı Saat Ekle
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: mutedCol,
                  marginTop: '2px',
                }}
              >
                Tarih: {formattedDate}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            style={{
              background: inputBg,
              border: `1px solid ${borderCol}`,
              borderRadius: '8px',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: textCol,
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Switcher: Saat Aralığı Kapat | Tüm Gün İzinli */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 20px',
            borderBottom: `1px solid ${borderCol}`,
            background: subCardBg,
          }}
        >
          <button
            type="button"
            onClick={() => setIsFullDay(false)}
            className={!isFullDay ? 'btn-clinic-primary' : ''}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '9px',
              fontSize: '0.83rem',
              fontWeight: 750,
              cursor: 'pointer',
              border: !isFullDay ? `1px solid ${brandBlueBorder}` : `1px solid ${borderCol}`,
              background: !isFullDay ? brandBlueGradient : cardBg,
              color: !isFullDay ? '#ffffff' : textCol,
              boxShadow: !isFullDay ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
            }}
          >
            <span style={{ color: !isFullDay ? '#ffffff' : 'inherit' }}>Saat Aralığı Kapat</span>
          </button>
          <button
            type="button"
            onClick={() => setIsFullDay(true)}
            className={isFullDay ? 'btn-clinic-primary' : ''}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '9px',
              fontSize: '0.83rem',
              fontWeight: 750,
              cursor: 'pointer',
              border: isFullDay ? `1px solid ${brandBlueBorder}` : `1px solid ${borderCol}`,
              background: isFullDay ? brandBlueGradient : cardBg,
              color: isFullDay ? '#ffffff' : textCol,
              boxShadow: isFullDay ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
            }}
          >
            <span style={{ color: isFullDay ? '#ffffff' : 'inherit' }}>Tüm Gün İzinli</span>
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '18px 20px',
            flex: 1,
            overflowY: 'auto',
            background: cardBg,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              background: subCardBg,
              padding: '14px',
              borderRadius: '12px',
              border: `1px solid ${borderCol}`,
              boxShadow: 'var(--pc-neo-subcard)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '0.86rem', fontWeight: 750, color: textCol }}>
              İzin Bilgileri
            </div>

            {/* Hekim */}
            <div>
              <label style={labelStyle}>
                Hekim <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                style={inputStyle}
              >
                <option value="" style={selectOptionStyle}>
                  Hekim Seçiniz...
                </option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id} style={selectOptionStyle}>
                    {d.name} {d.specialty ? `(${d.specialty})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Tarih (Özel DatePicker Popover) & İzin Nedeni */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
              }}
            >
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Tarih</label>
                <button
                  type="button"
                  onClick={() => setShowDatePopover((prev) => !prev)}
                  style={{
                    ...inputStyle,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>{formattedDate}</span>
                  <CalendarIcon size={14} color={brandBlue} />
                </button>
                {showDatePopover && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      zIndex: 100050,
                      width: 280,
                      padding: 12,
                      borderRadius: 14,
                      background: cardBg,
                      border: `1.5px solid ${borderCol}`,
                      boxShadow: 'var(--pc-modal-shadow)',
                    }}
                  >
                    <div className="clinic-rdp">
                      <DayPicker
                        mode="single"
                        locale={tr}
                        weekStartsOn={1}
                        month={calendarMonth}
                        onMonthChange={setCalendarMonth}
                        selected={parseYmd(date)}
                        onSelect={(d) => {
                          if (d) {
                            setDate(toYmd(d))
                            setShowDatePopover(false)
                          }
                        }}
                        showOutsideDays
                      />
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>İzin Nedeni</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={inputStyle}
                >
                  {PRESET_REASONS.map((r) => (
                    <option key={r} value={r} style={selectOptionStyle}>
                      {r}
                    </option>
                  ))}
                  <option value="Diğer" style={selectOptionStyle}>
                    Diğer (Özel)
                  </option>
                </select>
              </div>
            </div>

            {/* Saat Aralığı Slider (Tüm gün değilse) */}
            {!isFullDay && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 10,
                  background: cardBg,
                  border: `1px solid ${borderCol}`,
                  boxShadow: 'var(--pc-neo-inset)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 750, color: labelCol, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={13} color={brandBlue} /> Kapalı Saat Aralığı
                  </span>
                  <span
                    style={{
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      color: 'var(--badge-clinic-text, #1d4ed8)',
                      background: 'var(--badge-clinic-bg, #e0f2fe)',
                      border: '1px solid var(--badge-clinic-border, #bae6fd)',
                      padding: '2px 9px',
                      borderRadius: 999,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {startTime} – {endTime}
                  </span>
                </div>

                {/* Dual-Thumb Slider */}
                <div style={{ position: 'relative', height: 24, display: 'flex', alignItems: 'center', marginBottom: 8, userSelect: 'none' }}>
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
                      background: subCardBg,
                      border: `1px solid ${borderCol}`,
                      cursor: 'pointer',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${startPct}%`,
                        width: `${Math.max(2, endPct - startPct)}%`,
                        background: brandBlueGradient,
                        borderRadius: 999,
                      }}
                    />
                  </div>
                  <div
                    onPointerDown={startDrag('start')}
                    style={{
                      position: 'absolute',
                      left: `calc(${startPct}% - 9px)`,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: brandBlueGradient,
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
                      background: brandBlueGradient,
                      border: '2px solid #ffffff',
                      boxShadow: '0 2px 5px rgba(29, 78, 216, 0.35)',
                      cursor: dragging === 'end' ? 'grabbing' : 'grab',
                      zIndex: 2,
                    }}
                  />
                </div>

                {/* Quick Leave Presets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                  {[
                    { label: 'Öğle (12-13)', s: '12:00', e: '13:00' },
                    { label: 'Sabah (09-13)', s: '09:00', e: '13:00' },
                    { label: 'Öğleden S. (13-18)', s: '13:00', e: '18:00' },
                    { label: 'Mesai (09-18)', s: '09:00', e: '18:00' },
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
                          border: active ? `1px solid ${brandBlueBorder}` : '1px solid var(--btn-clinic-outline-border, #93c5fd)',
                          background: active ? brandBlueGradient : 'var(--btn-clinic-outline-bg, #eff6ff)',
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
            )}

            {reason === 'Diğer' && (
              <div>
                <label style={labelStyle}>Özel İzin Nedeni</label>
                <input
                  type="text"
                  placeholder="Özel izin nedeni giriniz..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {/* Kısa Not */}
            <div>
              <label style={labelStyle}>Not (İsteğe Bağlı)</label>
              <input
                type="text"
                placeholder="Örn: Yerine Dr. Ayşe bakacak..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Seçili Hekimin Mevcut İzinleri */}
          {selectedDoctorId && existingLeaves.length > 0 && (
            <div
              style={{
                background: subCardBg,
                padding: '12px 14px',
                borderRadius: '10px',
                border: `1px solid ${borderCol}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: textCol }}>
                Kayıtlı İzinler ({existingLeaves.length})
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: '130px',
                  overflowY: 'auto',
                }}
              >
                {existingLeaves.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: inputBg,
                      borderRadius: '8px',
                      border: `1px solid ${borderCol}`,
                      fontSize: '0.76rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: textCol }}>
                        {l.date} · {l.isFullDay ? 'Tüm Gün' : `${l.startTime}–${l.endTime}`}
                      </div>
                      {l.reason && (
                        <div style={{ fontSize: '0.7rem', color: mutedCol }}>
                          {l.reason}
                          {l.notes ? ` (${l.notes})` : ''}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteLeave(l.id)}
                      style={{
                        padding: '4px 8px',
                        background: cardBg,
                        border: '1px solid var(--danger, #ef4444)',
                        borderRadius: '6px',
                        color: 'var(--danger, #ef4444)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                      }}
                    >
                      <Trash2 size={12} /> Aç
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${borderCol}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            background: subCardBg,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn-clinic-outline"
            style={{
              padding: '9px 18px',
              borderRadius: '9px',
              border: '1px solid var(--btn-clinic-outline-border, #93c5fd)',
              background: 'var(--btn-clinic-outline-bg, #eff6ff)',
              color: 'var(--btn-clinic-outline-text, #1d4ed8)',
              boxShadow: 'var(--pc-clay-btn)',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: 700,
            }}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || !selectedDoctorId}
            className="btn-clinic-primary"
            style={{
              padding: '9px 24px',
              borderRadius: '9px',
              background: brandBlueGradient,
              color: '#ffffff',
              border: `1px solid ${brandBlueBorder}`,
              boxShadow: 'var(--pc-clay-primary)',
              cursor: saving || !selectedDoctorId ? 'not-allowed' : 'pointer',
              fontWeight: 750,
              fontSize: '0.84rem',
              opacity: saving || !selectedDoctorId ? 0.5 : 1,
            }}
          >
            <span style={{ color: '#ffffff' }}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</span>
          </button>
        </div>
      </div>
    </>
  )
}
