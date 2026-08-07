'use client'

import { useState, useEffect, useCallback } from 'react'
import DentalCalendar from '../../calendar/components/DentalCalendar'
import PatientSheet from '../../calendar/components/PatientSheet'

interface Doctor {
  id: string
  name: string
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
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().slice(0, 10))

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

  return (
    <div style={{ maxWidth: 1200, width: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
          Günlük Randevu Takvimi
        </h3>
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
      </div>

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
