'use client'

import React, { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { X, Trash2 } from 'lucide-react'

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
  'Kişisel İzin'
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
  onSuccess
}: DoctorLeaveModalProps) {
  const [selectedDoctorId, setSelectedDoctorId] = useState(initialDoctorId || '')
  const [date, setDate] = useState(initialDate || new Date().toISOString().slice(0, 10))
  const [isFullDay, setIsFullDay] = useState(false)
  const [startTime, setStartTime] = useState(initialStartTime || '09:00')
  const [endTime, setEndTime] = useState(initialEndTime || '18:00')
  const [reason, setReason] = useState('Yıllık İzin')
  const [customReason, setCustomReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Existing leaves for doctor on this date
  const [existingLeaves, setExistingLeaves] = useState<DoctorLeaveItem[]>([])
  const [loadingLeaves, setLoadingLeaves] = useState(false)

  useEffect(() => {
    if (initialDoctorId) setSelectedDoctorId(initialDoctorId)
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
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
          notes: notes.trim() || null
        })
      })

      if (res.ok) {
        toast.success('Hekim izni başarıyla kaydedildi')
        if (onSaved) onSaved()
        if (onSuccess) onSuccess()
        fetchLeaves()
        // Reset time/reason
        setReason('Yıllık İzin')
        setCustomReason('')
        setNotes('')
      } else {
        const err = await res.json()
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
        method: 'DELETE'
      })
      if (res.ok) {
        toast.success('İzin silindi, saatler yeniden açıldı')
        setExistingLeaves(prev => prev.filter(l => l.id !== leaveId))
        if (onSaved) onSaved()
        if (onSuccess) onSuccess()
      } else {
        toast.error('İzin silinemedi')
      }
    } catch (e) {
      toast.error('İzin silinirken hata oluştu')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 100005,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card-bg, #1e293b)',
          border: '1px solid var(--input-border, #334155)',
          borderRadius: 14,
          width: 520,
          maxWidth: '96vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          padding: '1.5rem',
          boxSizing: 'border-box'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--input-border, #334155)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.25rem' }}>🏖️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--foreground, #ffffff)' }}>
                Hekim İzni & Saat Kapatma
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--foreground-2, #94a3b8)' }}>
                İzinli saatler takvimde bloklanır ve bu saatlere randevu alınamaz.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--foreground-3, #94a3b8)',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: 4
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Doctor selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: 6 }}>
              Hekim (Zorunlu)
            </label>
            <select
              value={selectedDoctorId}
              onChange={e => setSelectedDoctorId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--input-border, #334155)',
                background: 'var(--input-bg, #0f172a)',
                color: 'var(--foreground, #ffffff)',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            >
              <option value="">Hekim Seçiniz...</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.specialty ? `(${d.specialty})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date and Full Day toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: 6 }}>
                Tarih
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--input-border, #334155)',
                  background: 'var(--input-bg, #0f172a)',
                  color: 'var(--foreground, #ffffff)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ paddingBottom: 6 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.82rem',
                  color: 'var(--foreground, #e2e8f0)',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                <input
                  type="checkbox"
                  checked={isFullDay}
                  onChange={e => setIsFullDay(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#3b82f6' }}
                />
                Tüm Gün İzinli
              </label>
            </div>
          </div>

          {/* Time range (if not full day) */}
          {!isFullDay && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: 6 }}>
                  Başlangıç Saati
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  required={!isFullDay}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--input-border, #334155)',
                    background: 'var(--input-bg, #0f172a)',
                    color: 'var(--foreground, #ffffff)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: 6 }}>
                  Bitiş Saati
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  required={!isFullDay}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--input-border, #334155)',
                    background: 'var(--input-bg, #0f172a)',
                    color: 'var(--foreground, #ffffff)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: 6 }}>
              İzin Nedeni
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {PRESET_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={reason === r ? 'btn-clinic-primary' : 'btn-clinic-blue'}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setReason('Diğer')}
                className={reason === 'Diğer' ? 'btn-clinic-primary' : 'btn-clinic-blue'}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Diğer (Özel)
              </button>
            </div>

            {reason === 'Diğer' && (
              <input
                type="text"
                placeholder="Özel izin nedeni giriniz..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--input-border, #334155)',
                  background: 'var(--input-bg, #0f172a)',
                  color: 'var(--foreground, #ffffff)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: 4 }}>
              Ek Not (İsteğe Bağlı)
            </label>
            <input
              type="text"
              placeholder="Örn: Yerine Dr. Ayşe bakacak..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--input-border, #334155)',
                background: 'var(--input-bg, #0f172a)',
                color: 'var(--foreground, #ffffff)',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-clinic-blue"
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-clinic-primary"
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              {saving ? 'Kaydediliyor...' : 'İzni Kaydet & Saatleri Kapat'}
            </button>
          </div>
        </form>

        {/* Existing leaves section */}
        {selectedDoctorId && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--input-border, #334155)', paddingTop: 14 }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground, #e2e8f0)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📋</span> Bu Hekimin Kayıtlı İzinleri ({existingLeaves.length})
            </h4>

            {loadingLeaves ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--foreground-3, #94a3b8)' }}>Yükleniyor...</div>
            ) : existingLeaves.length === 0 ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--foreground-3, #64748b)' }}>Kayıtlı aktif izin bulunmuyor.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {existingLeaves.map(l => (
                  <div
                    key={l.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--card-inner, #0f172a)',
                      borderRadius: 8,
                      border: '1px solid var(--input-border, #334155)',
                      fontSize: '0.8rem'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--danger, #f87171)' }}>
                        📅 {l.date} &nbsp;|&nbsp; ⏰ {l.isFullDay ? 'Tüm Gün' : `${l.startTime} - ${l.endTime}`}
                      </div>
                      {l.reason && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--foreground-2, #94a3b8)', marginTop: 2 }}>
                          {l.reason} {l.notes ? `(${l.notes})` : ''}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteLeave(l.id)}
                      title="İzni Sil / Saati Aç"
                      style={{
                        padding: '4px 8px',
                        background: 'var(--card-inner, #334155)',
                        border: '1px solid var(--danger, #ef4444)',
                        borderRadius: 6,
                        color: 'var(--danger, #f87171)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.72rem',
                        fontWeight: 600
                      }}
                    >
                      <Trash2 size={12} /> Saati Aç
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
