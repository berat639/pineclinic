import React, { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'

interface ShiftContextMenuProps {
  x: number
  y: number
  doctorId?: string
  date: string
  users?: { id: string, name: string }[]
  onClose: () => void
  onSave: (shift: { userId: string, date: string, startTime: string, endTime: string, shiftType: string }) => void
}

const DEFAULT_TEMPLATES = [
  { name: 'Sabahçı', start: 9, end: 19 },
  { name: 'Öğlenci', start: 12, end: 20 },
  { name: 'Tam Gün', start: 9, end: 20 },
]

export default function ShiftContextMenu({ x, y, doctorId, date, users, onClose, onSave }: ShiftContextMenuProps) {
  const [selectedDoctorId, setSelectedDoctorId] = useState(doctorId || '')
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES)

  useEffect(() => {
    const loadTemplates = () => {
      try {
        const stored = localStorage.getItem('shiftTemplates')
        if (stored) setTemplates(JSON.parse(stored))
      } catch {}
    }
    loadTemplates()
    window.addEventListener('shiftTemplatesUpdated', loadTemplates)
    return () => window.removeEventListener('shiftTemplatesUpdated', loadTemplates)
  }, [])

  const formatTime = (val: number) => {
    const h = Math.floor(val).toString().padStart(2, '0')
    const m = (val % 1 === 0.5) ? '30' : '00'
    return `${h}:${m}`
  }

  const handleSelectTemplate = (t: { name: string, start: number, end: number }) => {
    if (!selectedDoctorId) {
      toast.error("Lütfen bir personel seçin")
      return
    }
    onSave({
      userId: selectedDoctorId,
      date,
      startTime: formatTime(t.start),
      endTime: formatTime(t.end),
      shiftType: t.name
    })
  }

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', top: y, left: x, zIndex: 100005,
        background: 'var(--card-bg)', border: '1px solid var(--glass-border)',
        borderRadius: 8, padding: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        width: 220,
      }}
      
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12 }}>Vardiya Ata ({new Date(date).toLocaleDateString('tr-TR')})</div>
      
      {(!doctorId && users) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 4 }}>Personel Seç</div>
          <select 
            value={selectedDoctorId} 
            onChange={e => setSelectedDoctorId(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
          >
            <option value="">Seçiniz...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 4 }}>Şablon Seç & Kaydet</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {templates.map(t => (
          <button
            key={t.name}
            onClick={() => handleSelectTemplate(t)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderRadius: 6, border: '1px solid var(--glass-border)',
              background: 'var(--input-bg)', color: 'var(--foreground)',
              fontSize: 11, cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-bg-hover)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--input-bg)'; e.currentTarget.style.borderColor = 'var(--glass-border)' }}
          >
            <span style={{ fontWeight: 600 }}>{t.name}</span>
            <span style={{ color: 'var(--foreground-3)' }}>{formatTime(t.start)}-{formatTime(t.end)}</span>
          </button>
        ))}
      </div>

    </div>
  )
}
