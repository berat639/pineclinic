'use client'

import { useState, useEffect, useCallback } from 'react'
import DentalCalendar from './components/DentalCalendar'
import PatientSheet from './components/PatientSheet'

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

export default function CalendarPage() {
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
    <div className="calendar-page">
      <header className="calendar-header">
        <h1>Randevu Takvimi</h1>
        <input
          type="date"
          value={currentDate}
          onChange={(e) => setCurrentDate(e.target.value)}
          className="date-picker"
        />
      </header>

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

      <style jsx>{`
        .calendar-page {
          padding: 24px;
          min-height: 100vh;
          background: var(--background);
          color: var(--foreground);
        }
        .calendar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .calendar-header h1 {
          font-size: 1.5rem;
          font-weight: 700;
        }
        .date-picker {
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid var(--input-border);
          background: var(--input-bg);
          color: var(--foreground);
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  )
}
