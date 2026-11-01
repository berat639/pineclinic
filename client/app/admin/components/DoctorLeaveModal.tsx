'use client'

import React, { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { CalendarOff, X, Trash2 } from 'lucide-react'
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

  const [existingLeaves, setExistingLeaves] = useState<DoctorLeaveItem[]>([])
  const [loadingLeaves, setLoadingLeaves] = useState(false)

  useEffect(() => {
    if (initialDoctorId !== undefined) setSelectedDoctorId(initialDoctorId || '')
    if (initialDate) setDate(initialDate)
    if (initialStartTime) setStartTime(initialStartTime)
    if (initialEndTime) setEndTime(initialEndTime)
  }, [initialDoctorId, initialDate, initialStartTime, initialEndTime, isOpen])

  const fetchLeaves = async () => {
    if (!selectedDoctorId) {
      setExistingLeaves([])
      return
    }
    setLoadingLeaves(true)
    try {
      const res = await fetch(`/api/dental/doctors/leaves?doctorId=${selectedDoctorId}`)
      if (res.ok) {
        const data = await res.json()
        setExistingLeaves(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error('Error fetching doctor leaves:', e)
    } finally {
      setLoadingLeaves(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchLeaves()
    }
  }, [isOpen, selectedDoctorId])

  if (!isOpen) return null

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

  const inputStyle: React.CSSProperties = {
    padding: '9px 12px',
    borderRadius: '8px',
    border: `1.5px solid ${borderCol}`,
    background: inputBg,
    color: textCol,
    boxShadow: 'var(--pc-neo-inset)',
    fontSize: '0.85rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: labelCol,
    marginBottom: 4,
    display: 'block',
    fontWeight: 600,
  }

  const selectOptionStyle: React.CSSProperties = {
    background: cardBg,
    color: textCol,
  }

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
          boxShadow: 'var(--pc-neo-card)',
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
                background: brandBlue,
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
                Tarih: {date}
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
              borderRadius: '6px',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: textCol,
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
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '0.83rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: !isFullDay
                ? `1px solid ${brandBlue}`
                : `1px solid ${borderCol}`,
              background: !isFullDay ? brandBlue : cardBg,
              color: !isFullDay ? '#ffffff' : textCol,
              transition: 'all 0.15s ease',
            }}
          >
            Saat Aralığı Kapat
          </button>
          <button
            type="button"
            onClick={() => setIsFullDay(true)}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '0.83rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: isFullDay
                ? `1px solid ${brandBlue}`
                : `1px solid ${borderCol}`,
              background: isFullDay ? brandBlue : cardBg,
              color: isFullDay ? '#ffffff' : textCol,
              transition: 'all 0.15s ease',
            }}
          >
            Tüm Gün İzinli
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
              borderRadius: '10px',
              border: `1px solid ${borderCol}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{
                fontSize: '0.86rem',
                fontWeight: 700,
                color: textCol,
              }}
            >
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

            {/* Tarih & İzin Nedeni */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
              }}
            >
              <div>
                <label style={labelStyle}>Tarih</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={inputStyle}
                />
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

            {/* Saat Aralığı (Tüm gün değilse) */}
            {!isFullDay && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                }}
              >
                <div>
                  <label style={labelStyle}>Başlangıç Saati</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Bitiş Saati</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={inputStyle}
                  />
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
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: textCol,
                }}
              >
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
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: `1px solid ${borderCol}`,
              background: cardBg,
              color: textCol,
              cursor: 'pointer',
              fontSize: '0.86rem',
              fontWeight: 600,
            }}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || !selectedDoctorId}
            style={{
              padding: '9px 24px',
              borderRadius: '8px',
              background: brandBlue,
              color: '#ffffff',
              border: 'none',
              cursor: saving || !selectedDoctorId ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '0.86rem',
              opacity: saving || !selectedDoctorId ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </>
  )
}
