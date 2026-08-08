'use client'

import FullCalendar from '@fullcalendar/react'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'

interface Doctor {
  id: string
  name: string
  specialty?: string
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
}

interface Props {
  doctors: Doctor[]
  events: CalendarEvent[]
  currentDate: string
  onEventClick: (patientId: string) => void
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  scheduled: { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a5f' },
  confirmed: { bg: '#d1fae5', border: '#10b981', text: '#064e3b' },
  in_progress: { bg: '#fef3c7', border: '#f59e0b', text: '#78350f' },
  completed: { bg: '#e0e7ff', border: '#6366f1', text: '#312e81' },
  cancelled: { bg: '#fee2e2', border: '#ef4444', text: '#7f1d1d' },
}

export default function DentalCalendar({ doctors, events, currentDate, onEventClick }: Props) {
  const resources = doctors.map((d) => ({
    id: d.id,
    title: d.name,
    extendedProps: { specialty: d.specialty },
    eventColor: d.color,
  }))

  const calendarEvents = events.map((e) => {
    const colors = STATUS_COLORS[e.status] || STATUS_COLORS.scheduled
    return {
      id: e.id,
      resourceId: e.doctorId,
      title: e.title,
      start: e.startTime,
      end: e.endTime,
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      extendedProps: { patientId: e.patientId, status: e.status, type: e.type },
    }
  })

  return (
    <div className="dental-calendar-wrapper">
      <FullCalendar
        plugins={[resourceTimeGridPlugin]}
        initialView="resourceTimeGridDay"
        initialDate={currentDate}
        key={currentDate}
        resources={resources}
        events={calendarEvents}
        slotMinTime="09:00:00"
        slotMaxTime="20:00:00"
        slotDuration="00:30:00"
        slotLabelInterval="00:30:00"
        allDaySlot={false}
        headerToolbar={false}
        locale="tr"
        height="auto"
        expandRows={true}
        resourceLabelContent={(arg) => (
          <div style={{ fontWeight: 600, fontSize: '0.85rem', padding: '4px 0', textAlign: 'center' }}>
            <div>{arg.resource.title}</div>
            {arg.resource.extendedProps?.specialty && (
              <div style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--foreground-3)', marginTop: 2 }}>
                {arg.resource.extendedProps.specialty}
              </div>
            )}
          </div>
        )}
        eventContent={(arg) => (
          <div className="fc-event-inner">
            <span className="fc-event-title">{arg.event.title}</span>
          </div>
        )}
        eventClick={(info) => {
          const patientId = info.event.extendedProps.patientId
          if (patientId) onEventClick(patientId)
        }}
      />

      <style jsx global>{`
        .dental-calendar-wrapper {
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid var(--glass-border);
          background: var(--glass-bg);
        }
        .dental-calendar-wrapper .fc {
          font-family: 'Inter', sans-serif;
        }
        .dental-calendar-wrapper .fc-theme-standard td,
        .dental-calendar-wrapper .fc-theme-standard th {
          border-color: var(--divider);
        }
        .dental-calendar-wrapper .fc-theme-standard .fc-scrollgrid {
          border-color: var(--divider);
        }
        .dental-calendar-wrapper .fc-col-header-cell {
          background: var(--glass-bg);
          padding: 10px 0;
        }
        .dental-calendar-wrapper .fc-col-header-cell-cushion {
          color: var(--foreground);
          font-weight: 600;
          font-size: 0.85rem;
        }
        .dental-calendar-wrapper .fc-timegrid-slot-label-cushion {
          color: var(--foreground-2);
          font-size: 0.75rem;
        }
        .dental-calendar-wrapper .fc-timegrid-slot {
          height: 48px;
        }
        .dental-calendar-wrapper .fc-event {
          border-radius: 6px;
          border-left-width: 3px;
          padding: 4px 6px;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.1s;
        }
        .dental-calendar-wrapper .fc-event:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .fc-event-inner {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .fc-event-title {
          font-size: 0.75rem;
          font-weight: 500;
          line-height: 1.3;
          white-space: normal;
          word-break: break-word;
        }
        .dental-calendar-wrapper .fc-resource-header {
          background: var(--glass-bg);
        }
        .dental-calendar-wrapper .fc-timegrid-col {
          background: transparent;
        }
        @media (max-width: 768px) {
          .dental-calendar-wrapper .fc-event {
            padding: 2px 4px;
          }
          .fc-event-title {
            font-size: 0.65rem;
          }
        }
      `}</style>
    </div>
  )
}
