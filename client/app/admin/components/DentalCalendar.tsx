'use client'

import { useMemo } from 'react'

interface Doctor {
  id: string
  name: string
  specialty?: string
  color: string
}

interface CalendarEvent {
  id: string
  patientId: string
  doctorId: string | null
  title: string
  startTime: string
  endTime: string
  status: string
  type: string
  notes?: string
  timeConfirmed?: boolean
}

interface ShiftItem {
  id: string
  userId: string
  userName: string
  date: string
  startTime: string
  endTime: string
  shiftType: string
}

interface Props {
  doctors: Doctor[]
  events: CalendarEvent[]
  shifts?: ShiftItem[]
  currentDate: string
  onEventClick: (eventId: string, event: CalendarEvent) => void
  view?: 'day' | 'week' | 'month'
}

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  scheduled: { bg: 'rgba(59,130,246,0.15)', border: '#3b82f6' },
  confirmed: { bg: 'rgba(16,185,129,0.18)', border: '#10b981' },
  in_progress: { bg: 'rgba(245,158,11,0.18)', border: '#f59e0b' },
  completed: { bg: 'rgba(99,102,241,0.12)', border: '#6366f1' },
  cancelled: { bg: 'rgba(239,68,68,0.1)', border: '#ef4444' },
  pending_assignment: { bg: 'rgba(156,163,175,0.18)', border: '#9ca3af' },
}

const TIME_WARNING_STYLE = { bg: 'rgba(245,158,11,0.2)', border: '#f59e0b' }

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function generateTimeSlots(start: number, end: number): string[] {
  const slots: string[] = []
  for (let h = start; h < end; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`)
    slots.push(`${h.toString().padStart(2, '0')}:30`)
  }
  return slots
}

function getWeekDays(dateStr: string): { label: string; date: string; isToday: boolean }[] {
  const d = new Date(dateStr)
  const today = new Date().toISOString().slice(0, 10)
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const curr = new Date(monday)
    curr.setDate(monday.getDate() + i)
    const date = curr.toISOString().slice(0, 10)
    return { label: `${DAYS_TR[i]} ${curr.getDate()}`, date, isToday: date === today }
  })
}

function getMonthWeeks(dateStr: string): { label: string; startDate: string; endDate: string }[] {
  const d = new Date(dateStr)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const weeks: { label: string; startDate: string; endDate: string }[] = []
  let n = 1
  while (start <= last || weeks.length < 4) {
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    weeks.push({ label: `${n}. Hafta (${start.getDate()}-${end.getDate()})`, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) })
    start.setDate(start.getDate() + 7)
    n++
    if (weeks.length >= 6) break
  }
  return weeks
}

function eventPosition(startTime: string, endTime: string, slotStartHour: number) {
  const s = new Date(startTime), e = new Date(endTime)
  const startMin = s.getHours() * 60 + s.getMinutes()
  const endMin = e.getHours() * 60 + e.getMinutes()
  const top = ((startMin - slotStartHour * 60) / 30) * 48
  const height = Math.max(((endMin - startMin) / 30) * 48, 22)
  return { top, height }
}

export default function DentalCalendar({ doctors, events, shifts, currentDate, onEventClick, view = 'day' }: Props) {
  const slots = generateTimeSlots(9, 22)

  // ── DAY VIEW ──
  if (view === 'day') {
    const dayShifts = shifts?.filter(s => s.date === currentDate) || []
    let displayDoctors = doctors.filter(d => 
      dayShifts.some(s => s.userId === d.id) || events.some(e => e.doctorId === d.id)
    )
    
    if (displayDoctors.length === 0) {
      displayDoctors = doctors
    }

    const unassigned = events.filter(e => !e.doctorId)
    const hasUnassigned = unassigned.length > 0
    const cols = displayDoctors.length || 1
    return (
      <div className="rc-wrap">
        <div className="rc-header" style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}>
          <div className="rc-corner" />
          {displayDoctors.map(d => {
            const shift = dayShifts.find(s => s.userId === d.id)
            return (
              <div key={d.id} className="rc-col-head" style={{ borderBottomColor: d.color }}>
                <div className="rc-col-title">{d.name}</div>
                {shift ? (
                  <div className="rc-col-sub" style={{ color: '#10b981', fontWeight: 600 }}>Vardiya: {shift.startTime}-{shift.endTime}</div>
                ) : (
                  d.specialty && <div className="rc-col-sub">{d.specialty}</div>
                )}
              </div>
            )
          })}
          {hasUnassigned && (
            <>
              <div className="rc-corner" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', backgroundColor: 'rgba(255,255,255,0.02)' }} />
              <div className="rc-col-head" style={{ gridColumn: '2 / -1', borderTop: '1px solid rgba(0,0,0,0.05)', backgroundColor: 'rgba(255,255,255,0.02)', borderBottomColor: '#9ca3af', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '4px' }}>
                <div className="rc-col-title" style={{ color: '#9ca3af', fontSize: '0.8rem', margin: 0 }}>⚠️ Atanmamış</div>
                <div className="rc-col-sub" style={{ margin: 0 }}>({unassigned.length} bekliyor)</div>
              </div>
            </>
          )}
        </div>
        <div className="rc-body">
          <div className="rc-grid" style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}>
            {slots.map(slot => (
              <div key={slot} style={{ display: 'contents' }}>
                <div className="rc-time">{slot}</div>
                {Array.from({ length: cols }).map((_, i) => <div key={`${slot}-${i}`} className="rc-cell" />)}
              </div>
            ))}
          </div>
          {/* Assigned events in doctor columns */}
          {displayDoctors.map((d, colIdx) =>
            events.filter(e => e.doctorId === d.id).map(e => {
              const { top, height } = eventPosition(e.startTime, e.endTime, 9)
              const isTimeWarning = e.timeConfirmed === false
              const colors = isTimeWarning ? TIME_WARNING_STYLE : (STATUS_COLORS[e.status] || STATUS_COLORS.scheduled)
              const offsetCol = colIdx
              const left = `calc(56px + (100% - 56px) * ${offsetCol} / ${cols} + 2px)`
              const width = `calc((100% - 56px) / ${cols} - 4px)`
              const isShort = height < 36
              return (
                <div key={e.id} className="rc-event" style={{ top, height, left, width, background: colors.bg, borderLeftColor: colors.border }} onClick={() => onEventClick(e.id, e)} title={e.title}>
                  <span className="rc-ev-title">{isTimeWarning ? '⚠️ ' : ''}{e.title}</span>
                  {!isShort && <span className="rc-ev-time">{new Date(e.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-{new Date(e.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
                  {height > 56 && <span className="rc-ev-doc">{d.name}</span>}
                </div>
              )
            })
          )}
          {/* Unassigned events spanning all columns */}
          {hasUnassigned && unassigned.map(e => {
            const { top, height } = eventPosition(e.startTime, e.endTime, 9)
            const colors = STATUS_COLORS.pending_assignment
            const left = `calc(56px + 2px)`
            const width = `calc(100% - 56px - 4px)`
            return (
              <div key={e.id} className="rc-event" style={{ top, height, left, width, background: colors.bg, borderLeftColor: colors.border, borderStyle: 'dashed', zIndex: 10, opacity: 0.9 }} onClick={() => onEventClick(e.id, e)} title={`${e.title} — Atanmamış`}>
                <span className="rc-ev-title">⚠️ {e.title}</span>
                {height > 36 && <span className="rc-ev-time">{new Date(e.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-{new Date(e.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── WEEK VIEW ──
  if (view === 'week') {
    const weekDays = getWeekDays(currentDate)
    const cols = weekDays.length
    return (
      <div className="rc-wrap">
        <div className="rc-header" style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}>
          <div className="rc-corner" />
          {weekDays.map(d => (
            <div key={d.date} className="rc-col-head" style={{ borderBottomColor: d.isToday ? '#3b82f6' : 'transparent' }}>
              <div className="rc-col-title" style={d.isToday ? { color: '#3b82f6' } : {}}>{d.label}</div>
              <div className="rc-col-sub">{events.filter(e => e.startTime.slice(0, 10) === d.date).length} randevu</div>
              {shifts && shifts.filter(s => s.date === d.date).map(s => (
                <div key={s.id} style={{ fontSize: '0.65rem', color: '#10b981', marginTop: 4, background: 'rgba(16,185,129,0.1)', padding: '2px 4px', borderRadius: 4 }}>
                  👨‍⚕️ {s.userName} ({s.startTime}-{s.endTime})
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="rc-body">
          <div className="rc-grid" style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}>
            {slots.map(slot => (
              <div key={slot} style={{ display: 'contents' }}>
                <div className="rc-time">{slot}</div>
                {weekDays.map(d => <div key={`${slot}-${d.date}`} className="rc-cell" />)}
              </div>
            ))}
          </div>
          {weekDays.map((day, colIdx) =>
            events.filter(e => e.startTime.slice(0, 10) === day.date).map(e => {
              const { top, height } = eventPosition(e.startTime, e.endTime, 9)
              const isTimeWarning = e.timeConfirmed === false
              const isUnassigned = !e.doctorId
              const colors = isUnassigned ? STATUS_COLORS.pending_assignment : isTimeWarning ? TIME_WARNING_STYLE : (STATUS_COLORS[e.status] || STATUS_COLORS.scheduled)
              const left = `calc(56px + (100% - 56px) * ${colIdx} / ${cols} + 1px)`
              const width = `calc((100% - 56px) / ${cols} - 2px)`
              const doc = doctors.find(d => d.id === e.doctorId)
              return (
                <div key={e.id} className="rc-event" style={{ top, height, left, width, background: colors.bg, borderLeftColor: doc?.color || colors.border, borderStyle: isUnassigned ? 'dashed' : undefined }} onClick={() => onEventClick(e.id, e)} title={e.title}>
                  <span className="rc-ev-title">{(isUnassigned || isTimeWarning) ? '⚠️ ' : ''}{e.title}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // ── MONTH VIEW ──
  const weeks = getMonthWeeks(currentDate)
  return (
    <div className="rc-wrap rc-month">
      {weeks.map(week => {
        const weekEvents = events.filter(e => { const d = e.startTime.slice(0, 10); return d >= week.startDate && d <= week.endDate })
        return (
          <div key={week.startDate} className="rc-week-row">
            <div className="rc-week-label">{week.label}</div>
            <div className="rc-week-events">
              {weekEvents.length === 0 && (!shifts || shifts.filter(s => s.date >= week.startDate && s.date <= week.endDate).length === 0) && <span className="rc-empty">Randevu/Vardiya yok</span>}
              {shifts && shifts.filter(s => s.date >= week.startDate && s.date <= week.endDate).map(s => (
                <div key={`shift-${s.id}`} className="rc-month-ev" style={{ background: 'rgba(16,185,129,0.1)', borderLeftColor: '#10b981' }} title="Vardiya">
                  <span className="rc-ev-title">👨‍⚕️ Vardiya: {s.userName}</span>
                  <span className="rc-ev-time">{new Date(s.date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })} {s.startTime}-{s.endTime}</span>
                </div>
              ))}
              {weekEvents.slice(0, 10).map(e => {
                const isTimeWarning = e.timeConfirmed === false
                const isUnassigned = !e.doctorId
                const colors = isUnassigned ? STATUS_COLORS.pending_assignment : isTimeWarning ? TIME_WARNING_STYLE : (STATUS_COLORS[e.status] || STATUS_COLORS.scheduled)
                const doc = doctors.find(d => d.id === e.doctorId)
                return (
                  <div key={e.id} className="rc-month-ev" style={{ background: colors.bg, borderLeftColor: doc?.color || colors.border, borderStyle: isUnassigned ? 'dashed' : undefined }} onClick={() => onEventClick(e.id, e)}>
                    <span className="rc-ev-title">{(isUnassigned || isTimeWarning) ? '⚠️ ' : ''}{e.title}</span>
                    <span className="rc-ev-time">{new Date(e.startTime).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })} {new Date(e.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )
              })}
              {weekEvents.length > 10 && <span className="rc-more">+{weekEvents.length - 10} daha</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
