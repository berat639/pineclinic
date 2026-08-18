'use client'

import { useMemo, useState, useEffect, useRef } from 'react'

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
  onHeaderContextMenu?: (e: React.MouseEvent, doctorId: string) => void
  onEventContextMenu?: (e: React.MouseEvent, event: CalendarEvent) => void
  onEventUpdate?: (updatedEvent: CalendarEvent) => void
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

function calculateEventLayout(events: CalendarEvent[]) {
  const sorted = [...events].sort((a, b) => {
    const sA = new Date(a.startTime).getTime();
    const sB = new Date(b.startTime).getTime();
    if (sA !== sB) return sA - sB;
    return new Date(b.endTime).getTime() - new Date(a.endTime).getTime();
  });

  let currentGroup: CalendarEvent[] = [];
  let maxEndTime = 0;
  const groups: CalendarEvent[][] = [];
  const result: { event: CalendarEvent, col: number, maxCol: number }[] = [];

  for (const ev of sorted) {
    const s = new Date(ev.startTime).getTime();
    if (s >= maxEndTime) {
      if (currentGroup.length > 0) groups.push([...currentGroup]);
      currentGroup = [ev];
      maxEndTime = new Date(ev.endTime).getTime();
    } else {
      currentGroup.push(ev);
      maxEndTime = Math.max(maxEndTime, new Date(ev.endTime).getTime());
    }
  }
  if (currentGroup.length > 0) groups.push([...currentGroup]);

  groups.forEach(group => {
    const cols: CalendarEvent[][] = [];
    group.forEach(ev => {
      const s = new Date(ev.startTime).getTime();
      let placed = false;
      for (let i = 0; i < cols.length; i++) {
        const lastInCol = cols[i][cols[i].length - 1];
        if (new Date(lastInCol.endTime).getTime() <= s) {
          cols[i].push(ev);
          placed = true;
          break;
        }
      }
      if (!placed) cols.push([ev]);
    });

    cols.forEach((col, colIdx) => {
      col.forEach(ev => {
        result.push({ event: ev, col: colIdx, maxCol: cols.length });
      });
    });
  });

  return result;
}

export default function DentalCalendar({ doctors, events, shifts, currentDate, onEventClick, view = 'day', onHeaderContextMenu, onEventContextMenu, onEventUpdate, onUnassignedHeaderContextMenu }: Props & { onUnassignedHeaderContextMenu?: (e: React.MouseEvent) => void }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<{
    eventId: string, type: 'move' | 'resize-top' | 'resize-bottom',
    startY: number, startX: number,
    initialStartTime: string, initialEndTime: string,
    initialColIdx: number,
    deltaMins: number, deltaCols: number
  } | null>(null);

  useEffect(() => {
    if (!interaction) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - interaction.startY;
      // 48px = 30mins -> 1.6px = 1min
      const rawMins = deltaY / 1.6;
      
      let deltaMins = 0;
      if (interaction.type === 'resize-top') {
        const s = new Date(interaction.initialStartTime);
        const startMinsOfDay = s.getHours() * 60 + s.getMinutes();
        const rawNewStartMins = startMinsOfDay + rawMins;
        deltaMins = Math.round(rawNewStartMins / 15) * 15 - startMinsOfDay;
      } else if (interaction.type === 'resize-bottom') {
        const eTime = new Date(interaction.initialEndTime);
        const endMinsOfDay = eTime.getHours() * 60 + eTime.getMinutes();
        const rawNewEndMins = endMinsOfDay + rawMins;
        deltaMins = Math.round(rawNewEndMins / 15) * 15 - endMinsOfDay;
      } else {
        const s = new Date(interaction.initialStartTime);
        const startMinsOfDay = s.getHours() * 60 + s.getMinutes();
        const rawNewStartMins = startMinsOfDay + rawMins;
        deltaMins = Math.round(rawNewStartMins / 15) * 15 - startMinsOfDay;
      }
      
      let deltaCols = 0;
      if (gridRef.current && interaction.type === 'move') {
        const gridRect = gridRef.current.getBoundingClientRect();
        const availableWidth = gridRect.width - 56; // minus time column
        const numCols = view === 'day' ? (doctors.length || 1) : 7;
        const colWidthPx = availableWidth / numCols;
        
        const mouseXRelative = e.clientX - (gridRect.left + 56);
        let currentMouseCol = Math.floor(mouseXRelative / colWidthPx);
        
        if (mouseXRelative < -10 || mouseXRelative > availableWidth + 10 || e.clientY < gridRect.top - 10 || e.clientY > gridRect.bottom + 10) {
          deltaCols = -999;
        } else {
          currentMouseCol = Math.max(0, Math.min(numCols - 1, currentMouseCol));
          deltaCols = currentMouseCol - interaction.initialColIdx;
        }
      }

      setInteraction(prev => prev ? { ...prev, deltaMins, deltaCols } : null);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!interaction) return;
      // Calculate final
      if (onEventUpdate && (interaction.deltaMins !== 0 || interaction.deltaCols !== 0)) {
        const targetEvent = events.find(ev => ev.id === interaction.eventId);
        if (targetEvent) {
          const s = new Date(interaction.initialStartTime);
          const e = new Date(interaction.initialEndTime);
          
          let newStartTime = new Date(s);
          let newEndTime = new Date(e);
          let newDoctorId = targetEvent.doctorId;
          let newDate = targetEvent.startTime.slice(0, 10);

          if (interaction.type === 'move') {
            newStartTime = new Date(s.getTime() + interaction.deltaMins * 60000);
            newEndTime = new Date(e.getTime() + interaction.deltaMins * 60000);
            
            if (interaction.deltaCols === -999) {
              newDoctorId = null;
            } else {
              const numCols = view === 'day' ? (doctors.length || 1) : 7;
              const finalCol = Math.max(0, Math.min(numCols - 1, interaction.initialColIdx + interaction.deltaCols));
              
              if (view === 'day') {
                newDoctorId = doctors[finalCol]?.id || null;
              } else if (view === 'week') {
                const weekDays = getWeekDays(currentDate);
                newDate = weekDays[finalCol]?.date || newDate;
                // adjust date part of start/endTime
                const datePart = newDate;
                newStartTime = new Date(`${datePart}T${newStartTime.toISOString().slice(11, 16)}:00+03:00`);
                newEndTime = new Date(`${datePart}T${newEndTime.toISOString().slice(11, 16)}:00+03:00`);
              }
            }
          } else if (interaction.type === 'resize-top') {
            newStartTime = new Date(s.getTime() + interaction.deltaMins * 60000);
            if (newStartTime.getTime() >= newEndTime.getTime() - 5 * 60000) {
              newStartTime = new Date(newEndTime.getTime() - 5 * 60000); // min 5 mins
            }
          } else if (interaction.type === 'resize-bottom') {
            newEndTime = new Date(e.getTime() + interaction.deltaMins * 60000);
            if (newEndTime.getTime() <= newStartTime.getTime() + 5 * 60000) {
              newEndTime = new Date(newStartTime.getTime() + 5 * 60000);
            }
          }

          onEventUpdate({
            ...targetEvent,
            startTime: newStartTime.toISOString(),
            endTime: newEndTime.toISOString(),
            doctorId: newDoctorId
          });
        }
      }
      setInteraction(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [interaction, events, onEventUpdate, view, doctors, currentDate]);
  const slots = generateTimeSlots(9, 22)

  const globalUnassigned = events.filter(e => !e.doctorId)

  // ── DAY VIEW ──
  if (view === 'day') {
    const dayShifts = shifts?.filter(s => s.date === currentDate) || []
    let displayDoctors = doctors;

    const dayEvents = events.filter(e => e.startTime.slice(0, 10) === currentDate);
    const unassigned = dayEvents.filter(e => !e.doctorId)
    const hasUnassigned = globalUnassigned.length > 0 || unassigned.length > 0
    const cols = displayDoctors.length || 1
    return (
      <div className="rc-wrap">
        <div className="rc-header" style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}>
          <div className="rc-corner" />
          {displayDoctors.map(d => {
            const shift = dayShifts.find(s => s.userId === d.id)
            const isPast = shift ? new Date(`${shift.date}T${shift.endTime}:00+03:00`).getTime() < Date.now() : false;
            return (
              <div key={d.id} className="rc-col-head" style={{ borderBottomColor: d.color }} onContextMenu={(e) => { e.preventDefault(); console.log("HEADER NATIVE", d.id); if(onHeaderContextMenu) onHeaderContextMenu(e, d.id); }}>
                <div className="rc-col-title">{d.name}</div>
                {shift ? (
                  <div className="rc-col-sub" style={{ color: isPast ? '#6b7280' : '#10b981', fontWeight: 600 }}>
                    {isPast ? `Tamamlandı: ${shift.startTime}-${shift.endTime}` : `Vardiya: ${shift.startTime}-${shift.endTime}`}
                  </div>
                ) : (
                  d.specialty && <div className="rc-col-sub">{d.specialty}</div>
                )}
              </div>
            )
          })}
          {hasUnassigned && (
            <>
              <div className="rc-corner" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', backgroundColor: 'rgba(255,255,255,0.02)' }} />
              <div className="rc-col-head" 
                style={{ gridColumn: '2 / -1', borderTop: '1px solid rgba(0,0,0,0.05)', backgroundColor: 'rgba(255,255,255,0.02)', borderBottomColor: '#9ca3af', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '4px', cursor: 'pointer' }}
                onContextMenu={(e) => { e.preventDefault(); if (onUnassignedHeaderContextMenu) onUnassignedHeaderContextMenu(e); }}
                onClick={(e) => { if (onUnassignedHeaderContextMenu) onUnassignedHeaderContextMenu(e); }}
              >
                <div className="rc-col-title" style={{ color: '#9ca3af', fontSize: '0.8rem', margin: 0 }}>⚠️ Atanmamış</div>
                <div className="rc-col-sub" style={{ margin: 0 }}>({globalUnassigned.length} bekliyor)</div>
              </div>
            </>
          )}
        </div>
        <div className="rc-body">
          <div className="rc-grid" ref={gridRef} style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}>
            {slots.map(slot => (
              <div key={slot} style={{ display: 'contents' }}>
                <div className="rc-time">{slot}</div>
                {Array.from({ length: cols }).map((_, i) => <div key={`${slot}-${i}`} className="rc-cell" />)}
              </div>
            ))}
          </div>
          {/* Assigned events in doctor columns */}
          {displayDoctors.map((d, colIdx) => {
            const docEvents = dayEvents.filter(e => e.doctorId === d.id);
            const layout = calculateEventLayout(docEvents);
            return layout.map(({ event: e, col, maxCol }) => {
              const isInteracting = interaction?.eventId === e.id;
              
              let currentStartTime = e.startTime;
              let currentEndTime = e.endTime;
              let currentOffsetCol = colIdx;
              
              let isUnassigning = false;
              if (isInteracting) {
                const s = new Date(interaction.initialStartTime);
                const end = new Date(interaction.initialEndTime);
                if (interaction.type === 'move') {
                  currentStartTime = new Date(s.getTime() + interaction.deltaMins * 60000).toISOString();
                  currentEndTime = new Date(end.getTime() + interaction.deltaMins * 60000).toISOString();
                  if (interaction.deltaCols === -999) {
                    isUnassigning = true;
                  } else {
                    currentOffsetCol = Math.max(0, Math.min(cols - 1, interaction.initialColIdx + interaction.deltaCols));
                  }
                } else if (interaction.type === 'resize-top') {
                  currentStartTime = new Date(s.getTime() + interaction.deltaMins * 60000).toISOString();
                  if (new Date(currentStartTime).getTime() >= end.getTime() - 5*60000) currentStartTime = new Date(end.getTime() - 5*60000).toISOString();
                } else if (interaction.type === 'resize-bottom') {
                  currentEndTime = new Date(end.getTime() + interaction.deltaMins * 60000).toISOString();
                  if (new Date(currentEndTime).getTime() <= s.getTime() + 5*60000) currentEndTime = new Date(s.getTime() + 5*60000).toISOString();
                }
              }

              const { top, height } = eventPosition(currentStartTime, currentEndTime, 9)
              const isTimeWarning = e.timeConfirmed === false
              const colors = isTimeWarning ? TIME_WARNING_STYLE : (isUnassigning ? STATUS_COLORS.pending_assignment : (STATUS_COLORS[e.status] || STATUS_COLORS.scheduled))
              
              const colWidth = `((100% - 56px) / ${cols})`
              let left = `calc(56px + (100% - 56px) * ${currentOffsetCol} / ${cols} + 2px + (${colWidth} - 4px) / ${maxCol} * ${col})`
              let width = `calc((${colWidth} - 4px) / ${maxCol})`
              
              if (isUnassigning) {
                left = `calc(56px + 2px)`;
                width = `calc(100% - 56px - 4px)`;
              }
              
              const isShort = height < 36
              
              return (
                <div key={e.id} className="rc-event" style={{ top, height, left, width, background: colors.bg, borderLeftColor: colors.border, zIndex: isInteracting ? 50 : undefined, opacity: isInteracting ? 0.8 : 1, transition: isInteracting ? 'none' : undefined }} 
                     onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0) return; onEventClick(e.id, e); }} 
                     onContextMenu={(evt) => { evt.preventDefault(); console.log("EVENT NATIVE", e.title); if(onEventContextMenu) onEventContextMenu(evt, e); }} 
                     title={e.title}
                     onMouseDown={(evt) => {
                       if (evt.button !== 0) return;
                       evt.stopPropagation();
                       setInteraction({ eventId: e.id, type: 'move', startY: evt.clientY, startX: evt.clientX, initialStartTime: e.startTime, initialEndTime: e.endTime, initialColIdx: colIdx, deltaMins: 0, deltaCols: 0 });
                     }}
                >
                  {true && (
                    <div 
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }}
                      onMouseDown={(evt) => {
                        if (evt.button !== 0) return;
                        evt.stopPropagation();
                        setInteraction({ eventId: e.id, type: 'resize-top', startY: evt.clientY, startX: evt.clientX, initialStartTime: e.startTime, initialEndTime: e.endTime, initialColIdx: colIdx, deltaMins: 0, deltaCols: 0 });
                      }}
                    />
                  )}
                  <span className="rc-ev-title" style={{ pointerEvents: 'none' }}>{isTimeWarning ? '⚠️ ' : ''}{e.title}</span>
                  {!isShort && <span className="rc-ev-time" style={{ pointerEvents: 'none' }}>{new Date(currentStartTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-{new Date(currentEndTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
                  {height > 56 && <span className="rc-ev-doc" style={{ pointerEvents: 'none' }}>{displayDoctors[currentOffsetCol]?.name || d.name}</span>}
                  
                  {true && (
                    <div 
                      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }}
                      onMouseDown={(evt) => {
                        if (evt.button !== 0) return;
                        evt.stopPropagation();
                        setInteraction({ eventId: e.id, type: 'resize-bottom', startY: evt.clientY, startX: evt.clientX, initialStartTime: e.startTime, initialEndTime: e.endTime, initialColIdx: colIdx, deltaMins: 0, deltaCols: 0 });
                      }}
                    />
                  )}
                </div>
              )
            })
          })}
          {/* Unassigned events spanning all columns */}
          {hasUnassigned && calculateEventLayout(unassigned).map(({ event: e, col, maxCol }) => {
            const isInteracting = interaction?.eventId === e.id;
            
            let currentStartTime = e.startTime;
            let currentEndTime = e.endTime;
            let left = `calc(56px + 2px + ((100% - 56px - 4px) / ${maxCol}) * ${col})`;
            let width = `calc((100% - 56px - 4px) / ${maxCol})`;
            let currentOffsetCol = 0;
            let isUnassigning = true;
            
            if (isInteracting) {
              const s = new Date(interaction.initialStartTime);
              const end = new Date(interaction.initialEndTime);
              if (interaction.type === 'move') {
                currentStartTime = new Date(s.getTime() + interaction.deltaMins * 60000).toISOString();
                currentEndTime = new Date(end.getTime() + interaction.deltaMins * 60000).toISOString();
                if (interaction.deltaCols !== -999) {
                  isUnassigning = false;
                  currentOffsetCol = Math.max(0, Math.min(cols - 1, interaction.initialColIdx + interaction.deltaCols));
                }
              }
              
              if (!isUnassigning) {
                const colWidth = `((100% - 56px) / ${cols})`;
                left = `calc(56px + (100% - 56px) * ${currentOffsetCol} / ${cols} + 2px)`;
                width = `calc(${colWidth} - 4px)`;
              }
            }
            
            const { top, height } = eventPosition(currentStartTime, currentEndTime, 9);
            const isTimeWarning = e.timeConfirmed === false;
            const colors = isTimeWarning ? TIME_WARNING_STYLE : STATUS_COLORS.pending_assignment;
            
            return (
              <div key={e.id} className="rc-event" style={{ top, height, left, width, background: colors.bg, borderLeftColor: colors.border, borderStyle: 'dashed', zIndex: isInteracting ? 50 : 10, opacity: isInteracting ? 0.8 : 0.9, transition: isInteracting ? 'none' : undefined }} 
                   onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0) return; onEventClick(e.id, e); }} 
                   onContextMenu={(evt) => { evt.preventDefault(); console.log("EVENT NATIVE", e.title); if(onEventContextMenu) onEventContextMenu(evt, e); }} 
                   title={`${e.title} — Atanmamış`}
                   onMouseDown={(evt) => {
                     if (evt.button !== 0) return;
                     evt.stopPropagation();
                     let initialColIdx = 0;
                     if (gridRef.current) {
                       const gridRect = gridRef.current.getBoundingClientRect();
                       const availableWidth = gridRect.width - 56;
                       const colWidthPx = availableWidth / cols;
                       const mouseXRelative = evt.clientX - (gridRect.left + 56);
                       initialColIdx = Math.floor(mouseXRelative / colWidthPx);
                       initialColIdx = Math.max(0, Math.min(cols - 1, initialColIdx));
                     }
                     setInteraction({ eventId: e.id, type: 'move', startY: evt.clientY, startX: evt.clientX, initialStartTime: e.startTime, initialEndTime: e.endTime, initialColIdx, deltaMins: 0, deltaCols: 0 });
                   }}
              >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => { if (evt.button !== 0) return; evt.stopPropagation(); setInteraction({ eventId: e.id, type: 'resize-top', startY: evt.clientY, startX: evt.clientX, initialStartTime: e.startTime, initialEndTime: e.endTime, initialColIdx: 0, deltaMins: 0, deltaCols: 0 }); }} />
                <span className="rc-ev-title">⚠️ {e.title}</span>
                {height > 36 && <span className="rc-ev-time">{new Date(currentStartTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-{new Date(currentEndTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => { if (evt.button !== 0) return; evt.stopPropagation(); setInteraction({ eventId: e.id, type: 'resize-bottom', startY: evt.clientY, startX: evt.clientX, initialStartTime: e.startTime, initialEndTime: e.endTime, initialColIdx: 0, deltaMins: 0, deltaCols: 0 }); }} />
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
          <div className="rc-corner" style={{ position: 'relative' }}>
            {globalUnassigned.length > 0 && (
              <div 
                style={{ position: 'absolute', top: 4, left: 4, right: 4, background: 'var(--accent)', color: '#fff', fontSize: '0.65rem', padding: '4px', borderRadius: 4, textAlign: 'center', cursor: 'pointer', fontWeight: 600, zIndex: 10 }}
                onContextMenu={(e) => { e.preventDefault(); if (onUnassignedHeaderContextMenu) onUnassignedHeaderContextMenu(e); }}
                onClick={(e) => { if (onUnassignedHeaderContextMenu) onUnassignedHeaderContextMenu(e); }}
              >
                ⚠️ Bekleyen ({globalUnassigned.length})
              </div>
            )}
          </div>
          {weekDays.map(d => (
            <div key={d.date} className="rc-col-head" style={{ borderBottomColor: d.isToday ? '#3b82f6' : 'transparent' }}>
              <div className="rc-col-title" style={d.isToday ? { color: '#3b82f6' } : {}}>{d.label}</div>
              <div className="rc-col-sub">{events.filter(e => e.startTime.slice(0, 10) === d.date).length} randevu</div>
              {shifts && shifts.filter(s => s.date === d.date).map(s => {
                const isPast = new Date(`${s.date}T${s.endTime}:00+03:00`).getTime() < Date.now();
                return (
                  <div key={s.id} style={{ fontSize: '0.65rem', color: isPast ? '#6b7280' : '#10b981', marginTop: 4, background: isPast ? 'rgba(107,114,128,0.1)' : 'rgba(16,185,129,0.1)', padding: '2px 4px', borderRadius: 4 }}>
                    👨‍⚕️ {s.userName} {isPast ? '(Tamamlandı)' : `(${s.startTime}-${s.endTime})`}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="rc-body">
          <div className="rc-grid" ref={gridRef} style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}>
            {slots.map(slot => (
              <div key={slot} style={{ display: 'contents' }}>
                <div className="rc-time">{slot}</div>
                {weekDays.map(d => <div key={`${slot}-${d.date}`} className="rc-cell" />)}
              </div>
            ))}
          </div>
          {weekDays.map((day, colIdx) => {
            const dayEvents = events.filter(e => e.startTime.slice(0, 10) === day.date);
            const layout = calculateEventLayout(dayEvents);
            return layout.map(({ event: e, col, maxCol }) => {
              const isInteracting = interaction?.eventId === e.id;
              
              let currentStartTime = e.startTime;
              let currentEndTime = e.endTime;
              let currentOffsetCol = colIdx;
              
              let isUnassigning = false;
              if (isInteracting) {
                const s = new Date(interaction.initialStartTime);
                const end = new Date(interaction.initialEndTime);
                if (interaction.type === 'move') {
                  currentStartTime = new Date(s.getTime() + interaction.deltaMins * 60000).toISOString();
                  currentEndTime = new Date(end.getTime() + interaction.deltaMins * 60000).toISOString();
                  if (interaction.deltaCols === -999) {
                    isUnassigning = true;
                  } else {
                    currentOffsetCol = Math.max(0, Math.min(cols - 1, interaction.initialColIdx + interaction.deltaCols));
                  }
                } else if (interaction.type === 'resize-top') {
                  currentStartTime = new Date(s.getTime() + interaction.deltaMins * 60000).toISOString();
                  if (new Date(currentStartTime).getTime() >= end.getTime() - 5*60000) currentStartTime = new Date(end.getTime() - 5*60000).toISOString();
                } else if (interaction.type === 'resize-bottom') {
                  currentEndTime = new Date(end.getTime() + interaction.deltaMins * 60000).toISOString();
                  if (new Date(currentEndTime).getTime() <= s.getTime() + 5*60000) currentEndTime = new Date(s.getTime() + 5*60000).toISOString();
                }
              }

              const { top, height } = eventPosition(currentStartTime, currentEndTime, 9)
              const isTimeWarning = e.timeConfirmed === false
              const isUnassigned = !e.doctorId || isUnassigning
              const colors = isTimeWarning ? TIME_WARNING_STYLE : (isUnassigned ? STATUS_COLORS.pending_assignment : (STATUS_COLORS[e.status] || STATUS_COLORS.scheduled))
              
              const colWidth = `((100% - 56px) / ${cols})`
              const left = `calc(56px + (100% - 56px) * ${currentOffsetCol} / ${cols} + 1px + (${colWidth} - 2px) / ${maxCol} * ${col})`
              const width = `calc((${colWidth} - 2px) / ${maxCol})`
              
              const doc = doctors.find(d => d.id === e.doctorId)

              return (
                <div key={e.id} className="rc-event" style={{ top, height, left, width, background: colors.bg, borderLeftColor: doc?.color || colors.border, borderStyle: isUnassigned ? 'dashed' : undefined, zIndex: isInteracting ? 50 : undefined, opacity: isInteracting ? 0.8 : 1, transition: isInteracting ? 'none' : undefined }} 
                     onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0) return; onEventClick(e.id, e); }} 
                     onContextMenu={(evt) => { evt.preventDefault(); console.log("EVENT NATIVE", e.title); if(onEventContextMenu) onEventContextMenu(evt, e); }} 
                     title={e.title}
                     onMouseDown={(evt) => {
                       if (evt.button !== 0) return;
                       evt.stopPropagation();
                       setInteraction({ eventId: e.id, type: 'move', startY: evt.clientY, startX: evt.clientX, initialStartTime: e.startTime, initialEndTime: e.endTime, initialColIdx: colIdx, deltaMins: 0, deltaCols: 0 });
                     }}
                >
                  {true && (
                    <div 
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }}
                      onMouseDown={(evt) => {
                        if (evt.button !== 0) return;
                        evt.stopPropagation();
                        setInteraction({ eventId: e.id, type: 'resize-top', startY: evt.clientY, startX: evt.clientX, initialStartTime: e.startTime, initialEndTime: e.endTime, initialColIdx: colIdx, deltaMins: 0, deltaCols: 0 });
                      }}
                    />
                  )}
                  <span className="rc-ev-title" style={{ pointerEvents: 'none' }}>{(isUnassigned || isTimeWarning) ? '⚠️ ' : ''}{e.title}</span>
                  {true && (
                    <div 
                      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }}
                      onMouseDown={(evt) => {
                        if (evt.button !== 0) return;
                        evt.stopPropagation();
                        setInteraction({ eventId: e.id, type: 'resize-bottom', startY: evt.clientY, startX: evt.clientX, initialStartTime: e.startTime, initialEndTime: e.endTime, initialColIdx: colIdx, deltaMins: 0, deltaCols: 0 });
                      }}
                    />
                  )}
                </div>
              )
            })
          })}
        </div>
      </div>
    )
  }

  // ── MONTH VIEW ──
  const weeks = getMonthWeeks(currentDate)
  return (
    <div className="rc-wrap rc-month" style={{ position: 'relative' }}>
      {globalUnassigned.length > 0 && (
        <div 
          style={{ position: 'absolute', top: 12, right: 16, background: 'var(--accent)', color: '#fff', fontSize: '0.7rem', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
          onContextMenu={(e) => { e.preventDefault(); if (onUnassignedHeaderContextMenu) onUnassignedHeaderContextMenu(e); }}
          onClick={(e) => { if (onUnassignedHeaderContextMenu) onUnassignedHeaderContextMenu(e); }}
        >
          ⚠️ Bekleyen ({globalUnassigned.length})
        </div>
      )}
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
                const colors = isTimeWarning ? TIME_WARNING_STYLE : (isUnassigned ? STATUS_COLORS.pending_assignment : (STATUS_COLORS[e.status] || STATUS_COLORS.scheduled))
                const doc = doctors.find(d => d.id === e.doctorId)
                return (
                  <div key={e.id} className="rc-month-ev" style={{ background: colors.bg, borderLeftColor: doc?.color || colors.border, borderStyle: isUnassigned ? 'dashed' : undefined }} onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0) return; onEventClick(e.id, e); }}>
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
