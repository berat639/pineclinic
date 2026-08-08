'use client'

import { useState, useEffect, useCallback } from 'react'
import DentalCalendar from '../../calendar/components/DentalCalendar'
import PatientSheet from '../../calendar/components/PatientSheet'

interface Doctor {
  id: string
  name: string
  specialty: string
  color: string
}

interface CalendarEvent {
  id: string
  patientId: string
  doctorId: string
  title: string
  startTime: string
  endTime: string
  status: string
  type: string
  notes?: string
}

interface Patient {
  id: string
  name: string
  phone: string | null
  balance: number
}

export default function CalendarTab() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Form state
  const [formDoctor, setFormDoctor] = useState('')
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formTime, setFormTime] = useState('09:00')
  const [formDuration, setFormDuration] = useState('30')
  const [formType, setFormType] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [docRes, evtRes] = await Promise.all([
        fetch('/api/dental/doctors'),
        fetch(`/api/dental/appointments?date=${currentDate}`),
      ])
      if (docRes.ok) setDoctors(await docRes.json())
      if (evtRes.ok) setEvents(await evtRes.json())
    } catch (e) {
      console.error('Calendar fetch error:', e)
    }
  }, [currentDate])

  useEffect(() => { fetchData() }, [fetchData])

  const handleEventClick = async (patientId: string) => {
    try {
      const res = await fetch(`/api/dental/patients/${patientId}`)
      if (res.ok) {
        setSelectedPatient(await res.json())
        setSheetOpen(true)
      }
    } catch (e) {
      console.error('Patient fetch error:', e)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formDoctor || !formName || !formTime) return
    setFormSaving(true)
    try {
      const startTime = new Date(`${currentDate}T${formTime}:00+03:00`)
      const endTime = new Date(startTime.getTime() + parseInt(formDuration) * 60_000)

      // Create patient first
      const pRes = await fetch('/api/dental/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, phone: formPhone || undefined }),
      })
      if (!pRes.ok) throw new Error('Patient creation failed')
      const patient = await pRes.json()

      // Create appointment
      const aRes = await fetch('/api/dental/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          doctorId: formDoctor,
          title: `${formName} - ${formType || 'Randevu'}`,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          type: formType || 'general',
          notes: formNotes || undefined,
        }),
      })
      if (aRes.ok) {
        setShowForm(false)
        setFormName(''); setFormPhone(''); setFormType(''); setFormNotes('')
        fetchData()
      }
    } catch (err) {
      console.error('Appointment create error:', err)
    } finally {
      setFormSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 1200, width: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
          Günlük Randevu Takvimi
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--foreground)',
              fontSize: '0.85rem',
            }}
          />
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Randevu Ekle
          </button>
        </div>
      </div>

      {/* Doctor chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {doctors.map(d => (
          <span key={d.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 6,
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            fontSize: '0.75rem', color: 'var(--foreground)',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
            {d.name}
            <span style={{ color: 'var(--foreground-3)', fontSize: '0.7rem' }}>({d.specialty})</span>
          </span>
        ))}
      </div>

      {/* Appointment Form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          padding: 16, marginBottom: 16, borderRadius: 10,
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        }}>
          <select
            value={formDoctor} onChange={e => setFormDoctor(e.target.value)} required
            style={inputStyle}
          >
            <option value="">Doktor Seç...</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>)}
          </select>
          <input placeholder="Hasta Adı *" value={formName} onChange={e => setFormName(e.target.value)} required style={inputStyle} />
          <input placeholder="Telefon" value={formPhone} onChange={e => setFormPhone(e.target.value)} style={inputStyle} />
          <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} required style={inputStyle} />
          <select value={formDuration} onChange={e => setFormDuration(e.target.value)} style={inputStyle}>
            <option value="15">15 dk</option>
            <option value="30">30 dk</option>
            <option value="45">45 dk</option>
            <option value="60">1 saat</option>
            <option value="90">1.5 saat</option>
            <option value="120">2 saat</option>
          </select>
          <input placeholder="İşlem Türü (ör. Dolgu, İmplant)" value={formType} onChange={e => setFormType(e.target.value)} style={inputStyle} />
          <input placeholder="Not (opsiyonel)" value={formNotes} onChange={e => setFormNotes(e.target.value)} style={{ ...inputStyle, gridColumn: '1/-1' }} />
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowForm(false)} style={{ ...btnStyle, background: 'var(--glass-bg)', color: 'var(--foreground-2)' }}>İptal</button>
            <button type="submit" disabled={formSaving} style={btnStyle}>
              {formSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      )}

      <DentalCalendar
        doctors={doctors}
        events={events}
        currentDate={currentDate}
        onEventClick={handleEventClick}
      />

      <PatientSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        patient={selectedPatient}
        doctors={doctors}
      />
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--foreground)',
  fontSize: '0.8rem',
  outline: 'none',
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
}
