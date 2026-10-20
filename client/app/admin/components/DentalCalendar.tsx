'use client'

import React, { useMemo, useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import type { DoctorLeaveItem } from './DoctorLeaveModal'

interface Doctor {
  id: string
  name: string
  specialty?: string
  color: string
}

interface CalendarEvent {
  id: string
  patientId: string | null
  doctorId: string | null
  title: string
  startTime: string
  endTime: string
  status: string
  type: string
  notes?: string
  timeConfirmed?: boolean
  hasTreatment?: boolean
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
  doctorLeaves?: DoctorLeaveItem[]
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
  pending_review: { bg: 'var(--card-inner)', border: 'var(--accent)' },
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

function getLocalYMD(dateStrOrObj: string | Date): string {
  if (!dateStrOrObj) return '';
  try {
    return new Date(dateStrOrObj).toLocaleDateString('sv');
  } catch {
    return String(dateStrOrObj).slice(0, 10);
  }
}

export default function DentalCalendar({ doctors, events, shifts, doctorLeaves = [], currentDate, onEventClick, view = 'day', onHeaderContextMenu, onEventContextMenu, onEventUpdate, onUnassignedHeaderContextMenu, onEmptySlotSelect }: Props & { onUnassignedHeaderContextMenu?: (e: React.MouseEvent) => void, onEmptySlotSelect?: (start: string, end: string, doctorId: string | null, x: number, y: number) => void }) {
  
  const gridRef = useRef<HTMLDivElement>(null);

  // Draft selection state for empty slot
  const [draftSelection, setDraftSelection] = useState<{
    startY: number;
    startX: number;
    top: number;
    height: number;
    colIdx: number;
    active: boolean;
  } | null>(null);
  
  // Calculate displayDoctors at the top so handleMouseUp can use it
  const dayShifts = shifts?.filter(s => s.date === currentDate) || [];
  const dayDoctorLeaves = useMemo(() => {
    return (doctorLeaves || []).filter(l => l.date === currentDate);
  }, [doctorLeaves, currentDate]);
  let displayDoctors = doctors;
  if (view === 'day' && dayShifts.length > 0) {
    const doctorsWithShift = dayShifts.map(s => s.userId);
    displayDoctors = doctors.filter(d => doctorsWithShift.includes(d.id));
  }

  
  const dragRef = useRef<{
    element: HTMLElement | null;
    type: 'move' | 'resize-top' | 'resize-bottom';
    startY: number;
    startX: number;
    initialStartTime: string;
    initialEndTime: string;
    initialColIdx: number;
    eventId: string;
    originalTop: string;
    originalHeight: string;
    originalLeft: string;
    originalZIndex: string;
    originalOpacity: string;
  }>({
    element: null, type: 'move', startY: 0, startX: 0,
    initialStartTime: '', initialEndTime: '', initialColIdx: 0, eventId: '',
    originalTop: '', originalHeight: '', originalLeft: '', originalZIndex: '', originalOpacity: ''
  });
  const hasDraggedRef = useRef(false);

  const startInteraction = (evt: React.MouseEvent, e: CalendarEvent, type: 'move' | 'resize-top' | 'resize-bottom', initialColIdx: number) => {
    if (evt.button !== 0) return;
    evt.stopPropagation();
    hasDraggedRef.current = false;
    
    const element = (evt.currentTarget as HTMLElement).closest('.rc-event') as HTMLElement;
    if (!element) return;

    dragRef.current = {
      element, type,
      startY: evt.clientY, startX: evt.clientX,
      initialStartTime: e.startTime, initialEndTime: e.endTime,
      initialColIdx, eventId: e.id,
      originalTop: element.style.top, originalHeight: element.style.height, originalLeft: element.style.left,
      originalZIndex: element.style.zIndex, originalOpacity: element.style.opacity
    };

    element.style.zIndex = '50';
    element.style.opacity = '0.8';
    element.style.transition = 'none';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Existing event drag logic
      const state = dragRef.current;
      if (state.element) {
        const deltaY = e.clientY - state.startY;
        const deltaX = e.clientX - state.startX;

        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
          hasDraggedRef.current = true;
        }

        if (state.type === 'move') {
          state.element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        } else if (state.type === 'resize-bottom') {
          state.element.style.height = `calc(${state.originalHeight} + ${deltaY}px)`;
        } else if (state.type === 'resize-top') {
          state.element.style.top = `calc(${state.originalTop} + ${deltaY}px)`;
          state.element.style.height = `calc(${state.originalHeight} - ${deltaY}px)`;
        }
        return;
      }

      // Draft selection logic for empty slot
      setDraftSelection(prev => {
        if (!prev || !prev.active) return prev;
        const deltaY = e.clientY - prev.startY;
        let top = prev.top;
        let height = prev.height;
        if (deltaY > 0) {
          height = deltaY;
        } else {
          top = prev.top + deltaY;
          height = Math.abs(deltaY);
        }
        return { ...prev, top, height: Math.max(22, height) };
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Draft selection logic
      setDraftSelection(prev => {
        if (prev && prev.active && gridRef.current) {
          const gridRect = gridRef.current.getBoundingClientRect();
          // convert top & height to time
          const startMins = 0 * 60 + Math.round(prev.top / 48 * 30);
          const endMins = startMins + Math.round(prev.height / 48 * 30);
          
          let doctorId: string | null = null;
          let dateStr = currentDate;
          
          if (view === 'day') {
            doctorId = displayDoctors[prev.colIdx]?.id || null;
          } else if (view === 'week') {
            const weekDays = getWeekDays(currentDate);
            dateStr = weekDays[prev.colIdx]?.date || dateStr;
          }

          const formatTime = (mins: number) => {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${dateStr}T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00+03:00`;
          };

          if (doctorId) {
            const conflictLeave = (doctorLeaves || []).find(l => {
              if (l.doctorId !== doctorId || l.date !== dateStr) return false;
              if (l.isFullDay) return true;
              const [sH, sM] = (l.startTime || '00:00').split(':').map(Number);
              const [eH, eM] = (l.endTime || '23:59').split(':').map(Number);
              const lStart = (sH || 0) * 60 + (sM || 0);
              const lEnd = (eH || 0) * 60 + (eM || 0);
              return startMins < lEnd && endMins > lStart;
            });
            if (conflictLeave) {
              const docObj = doctors.find(d => d.id === doctorId);
              toast.error(`⚠️ Dr. ${docObj?.name || 'Hekim'} bu saatlerde (${conflictLeave.startTime} - ${conflictLeave.endTime}) izinlidir. Randevu eklenemez!`);
              return null;
            }
          }

          if (onEmptySlotSelect) {
            onEmptySlotSelect(formatTime(startMins), formatTime(endMins), doctorId, e.clientX, e.clientY);
          }
          return { ...prev, active: false }; // keep it rendered but not active
        }
        return prev;
      });

      // Existing event drag logic
      const state = dragRef.current;
      if (!state.element) return;
      // ... rest of handleMouseUp
      const deltaY = e.clientY - state.startY;
      const rawMins = deltaY / 1.6;

      let deltaMins = 0;
      if (state.type === 'resize-top' || state.type === 'resize-bottom' || state.type === 'move') {
        const timeRef = new Date(state.type === 'resize-bottom' ? state.initialEndTime : state.initialStartTime);
        const minsOfDay = timeRef.getHours() * 60 + timeRef.getMinutes();
        const rawNewMins = minsOfDay + rawMins;
        deltaMins = Math.round(rawNewMins / 15) * 15 - minsOfDay;
      }

      const targetEvent = events.find(ev => ev.id === state.eventId);
      
      let newDoctorId = targetEvent ? targetEvent.doctorId : null;
      let newDate = targetEvent ? targetEvent.startTime.slice(0, 10) : currentDate;

      if (gridRef.current && state.type === 'move') {
        const gridRect = gridRef.current.getBoundingClientRect();
        const availableWidth = gridRect.width - 56;
        const mouseXRelative = e.clientX - (gridRect.left + 56);
        
        if (mouseXRelative < -10 || mouseXRelative > availableWidth + 10 || e.clientY < gridRect.top - 10 || e.clientY > gridRect.bottom + 10) {
          newDoctorId = null; // Unassign if dropped outside
        } else {
          if (view === 'day') {
            const numCols = displayDoctors.length || 1;
            const colWidthPx = availableWidth / numCols;
            const dropCol = Math.max(0, Math.min(numCols - 1, Math.floor(mouseXRelative / colWidthPx)));
            newDoctorId = displayDoctors[dropCol]?.id || null;
          } else if (view === 'week') {
            const numCols = 7;
            const colWidthPx = availableWidth / numCols;
            const dropCol = Math.max(0, Math.min(numCols - 1, Math.floor(mouseXRelative / colWidthPx)));
            const weekDays = getWeekDays(currentDate);
            newDate = weekDays[dropCol]?.date || newDate;
          }
        }
      }

      // Cleanup DOM
      state.element.style.transform = '';
      state.element.style.height = state.originalHeight;
      state.element.style.top = state.originalTop;
      state.element.style.zIndex = state.originalZIndex;
      state.element.style.opacity = state.originalOpacity;
      state.element.style.transition = '';
      document.body.style.userSelect = '';
      
      const wasDragged = hasDraggedRef.current;
      if (wasDragged) {
        setTimeout(() => {
          hasDraggedRef.current = false;
        }, 150);
      }

      const { type: t, initialStartTime: iStart, initialEndTime: iEnd } = state;
      state.element = null;

      if (wasDragged && onEventUpdate && targetEvent) {
        const timeChanged = deltaMins !== 0;
        const doctorChanged = targetEvent.doctorId !== newDoctorId;
        const dateChanged = targetEvent.startTime.slice(0, 10) !== newDate;

        if (timeChanged || doctorChanged || dateChanged || t === 'resize-top' || t === 'resize-bottom') {
          const s = new Date(iStart);
          const e_time = new Date(iEnd);
          let newStartTime = new Date(s);
          let newEndTime = new Date(e_time);

          if (t === 'move') {
            newStartTime = new Date(s.getTime() + deltaMins * 60000);
            newEndTime = new Date(e_time.getTime() + deltaMins * 60000);
            
            if (view === 'week') {
              const formatTime = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
              newStartTime = new Date(`${newDate}T${formatTime(newStartTime)}:00+03:00`);
              newEndTime = new Date(`${newDate}T${formatTime(newEndTime)}:00+03:00`);
            }
          } else if (t === 'resize-top') {
            newStartTime = new Date(s.getTime() + deltaMins * 60000);
            if (newStartTime.getTime() >= newEndTime.getTime() - 15 * 60000) {
              newStartTime = new Date(newEndTime.getTime() - 15 * 60000);
            }
          } else if (t === 'resize-bottom') {
            newEndTime = new Date(e_time.getTime() + deltaMins * 60000);
            if (newEndTime.getTime() <= newStartTime.getTime() + 15 * 60000) {
              newEndTime = new Date(newStartTime.getTime() + 15 * 60000);
            }
          }

          // Vardiya Kontrolü: Hedef hekimin o gün ve saatte vardiyası var mı?
          if (newDoctorId) {
            const targetDocShifts = (shifts || []).filter(s => s.userId === newDoctorId && s.date === newDate);
            const docObj = doctors.find(d => d.id === newDoctorId);
            const docName = docObj?.name || 'Seçilen hekimin';

            if (targetDocShifts.length === 0) {
              import('react-hot-toast').then(mod =>
                mod.toast.error(`⚠️ ${docName} için bu tarihte (${newDate}) vardiya bulunmuyor!`)
              );
              return;
            }

            const startMinOfDay = newStartTime.getHours() * 60 + newStartTime.getMinutes();
            const endMinOfDay = newEndTime.getHours() * 60 + newEndTime.getMinutes();

            const isCovered = targetDocShifts.some(shift => {
              const [sH, sM] = (shift.startTime || '00:00').split(':').map(Number);
              const [eH, eM] = (shift.endTime || '23:59').split(':').map(Number);
              const shiftStartMin = sH * 60 + (sM || 0);
              const shiftEndMin = eH * 60 + (eM || 0);
              return startMinOfDay >= shiftStartMin && endMinOfDay <= shiftEndMin;
            });

            if (!isCovered) {
              const shiftRanges = targetDocShifts.map(s => `${s.startTime}-${s.endTime}`).join(', ');
              import('react-hot-toast').then(mod =>
                mod.toast.error(`⚠️ Randevu saati ${docName} vardiya saatleri (${shiftRanges}) dışındadır!`)
              );
              return;
            }

            // İzin Kontrolü: Hedef hekim o gün ve saatte izinli mi?
            const conflictLeave = (doctorLeaves || []).find(l => {
              if (l.doctorId !== newDoctorId || l.date !== newDate) return false;
              if (l.isFullDay) return true;
              const [sH, sM] = (l.startTime || '00:00').split(':').map(Number);
              const [eH, eM] = (l.endTime || '23:59').split(':').map(Number);
              const lStartMin = (sH || 0) * 60 + (sM || 0);
              const lEndMin = (eH || 0) * 60 + (eM || 0);
              return startMinOfDay < lEndMin && endMinOfDay > lStartMin;
            });

            if (conflictLeave) {
              toast.error(`⚠️ ${docName} bu saatlerde (${conflictLeave.startTime}-${conflictLeave.endTime}) izinlidir. Randevu taşınamaz!`);
              return;
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
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [events, onEventUpdate, view, doctors, currentDate, onEmptySlotSelect]);

  // Expose method to clear draft
  useEffect(() => {
    const handleClearDraft = () => setDraftSelection(null);
    window.addEventListener('clear-calendar-draft', handleClearDraft);
    return () => window.removeEventListener('clear-calendar-draft', handleClearDraft);
  }, []);

  // Auto-scroll to current hour
  useEffect(() => {
    if (view === 'day' || view === 'week') {
      const timer = setTimeout(() => {
        if (!gridRef.current) return;
        const currentHour = new Date().getHours();
        const top = currentHour * 96; // 96px per hour (48px per 30 min)
        
        let parent = gridRef.current.parentElement;
        while (parent) {
          const style = window.getComputedStyle(parent);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            parent.scrollTo({ top: Math.max(0, top - 100), behavior: 'smooth' });
            break;
          }
          parent = parent.parentElement;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [view]);

  const slots = generateTimeSlots(0, 24)

  const globalUnassigned = events.filter(e => !e.doctorId)

  // ── DAY VIEW ──
  if (view === 'day') {
    const dayShifts = shifts?.filter(s => s.date === currentDate) || []
    let displayDoctors = doctors;

    const dayEvents = events.filter(e => getLocalYMD(e.startTime) === currentDate);
    const unassigned = dayEvents.filter(e => !e.doctorId)
    const hasUnassigned = globalUnassigned.length > 0 || unassigned.length > 0
    const cols = displayDoctors.length || 1
    const minDayWidth = cols <= 1 ? '100%' : `${cols * 220 + 56}px`
    return (
      <div className="rc-scroll-container">
        <div className="rc-wrap" style={{ minWidth: minDayWidth, width: '100%' }}>
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
          <div className="rc-grid" ref={gridRef} style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }} onDoubleClick={(e) => {
            if (e.button !== 0 || dragRef.current.element) return;
            const gridRect = gridRef.current?.getBoundingClientRect();
            if (!gridRect) return;
            const mouseX = e.clientX - gridRect.left - 56;
            const mouseY = e.clientY - gridRect.top;
            if (mouseX < 0) return; // clicked on time column
            
            const colWidthPx = (gridRect.width - 56) / cols;
            const colIdx = Math.max(0, Math.min(cols - 1, Math.floor(mouseX / colWidthPx)));
            
            // Quantize Y to 30 mins
            const rowHeight = 48; // 60 mins = 96px, 30 mins = 48px
            const top = Math.floor(mouseY / rowHeight) * rowHeight;
            
            const cellX = gridRect.left + window.scrollX + 56 + (colIdx * colWidthPx);
            const cellY = gridRect.top + window.scrollY + top;

            const startMins = 0 * 60 + Math.round(top / 48 * 30);
            const endMins = startMins + 30;
            const doctorId = displayDoctors[colIdx]?.id || null;
            const formatTime = (mins: number) => {
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              return `${currentDate}T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00+03:00`;
            };

            if (doctorId) {
              const conflictLeave = (doctorLeaves || []).find(l => {
                if (l.doctorId !== doctorId || l.date !== currentDate) return false;
                if (l.isFullDay) return true;
                const [sH, sM] = (l.startTime || '00:00').split(':').map(Number);
                const [eH, eM] = (l.endTime || '23:59').split(':').map(Number);
                const lStart = (sH || 0) * 60 + (sM || 0);
                const lEnd = (eH || 0) * 60 + (eM || 0);
                return startMins < lEnd && endMins > lStart;
              });
              if (conflictLeave) {
                const docName = displayDoctors[colIdx]?.name || 'Hekim';
                toast.error(`⚠️ Dr. ${docName} bu saatlerde (${conflictLeave.startTime}-${conflictLeave.endTime}) izinlidir. Randevu eklenemez!`);
                return;
              }
            }

            if (onEmptySlotSelect) {
              onEmptySlotSelect(formatTime(startMins), formatTime(endMins), doctorId, cellX, cellY);
            }
          }}>
            {slots.map(slot => (
              <div key={slot} style={{ display: 'contents' }}>
                <div className="rc-time">{slot}</div>
                {Array.from({ length: cols }).map((_, i) => <div key={`${slot}-${i}`} className="rc-cell" />)}
              </div>
            ))}
            
            {/* Draft Selection Ghost Event */}
            {draftSelection && (
              <div 
                className="rc-event" 
                style={{
                  top: draftSelection.top,
                  height: draftSelection.height,
                  left: `calc(56px + (100% - 56px) * ${draftSelection.colIdx} / ${cols} + 2px)`,
                  width: `calc(((100% - 56px) / ${cols}) - 4px)`,
                  background: 'rgba(59,130,246,0.1)',
                  borderLeftColor: '#3b82f6',
                  borderStyle: 'dashed',
                  pointerEvents: 'none',
                  zIndex: 40
                }}
              >
                <span className="rc-ev-title" style={{ color: '#3b82f6', opacity: 0.8 }}>(Başlıksız)</span>
                <span className="rc-ev-time" style={{ color: '#3b82f6', opacity: 0.8 }}>
                  {(() => {
                    const s = 0 * 60 + Math.round(draftSelection.top / 48 * 30);
                    const e = s + Math.round(draftSelection.height / 48 * 30);
                    const f = (m: number) => `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
                    return `${f(s)} - ${f(e)}`;
                  })()}
                </span>
              </div>
            )}
          </div>
          {/* Assigned events in doctor columns */}
          {displayDoctors.map((d, colIdx) => {
            const docEvents = dayEvents.filter(e => e.doctorId === d.id);
            const layout = calculateEventLayout(docEvents);
            const docLeaves = dayDoctorLeaves.filter(l => l.doctorId === d.id);

            return (
              <React.Fragment key={d.id}>
                {layout.map(({ event: e, col, maxCol }) => {
                  const { top, height } = eventPosition(e.startTime, e.endTime, 0)
                  const isTimeWarning = e.timeConfirmed === false
                  const doc = doctors.find(docItem => docItem.id === e.doctorId) || d
                  const docColor = doc?.color || '#3b82f6'
                  
                  let bg = doc?.color ? (doc.color.startsWith('#') ? `${doc.color}22` : doc.color) : 'rgba(59,130,246,0.15)'
                  let borderLeftColor = docColor
                  let borderStyle = 'solid'

                  if (isTimeWarning) {
                    bg = TIME_WARNING_STYLE.bg
                    borderLeftColor = TIME_WARNING_STYLE.border
                  }
                  
                  const colWidth = `((100% - 56px) / ${cols})`
                  const left = `calc(56px + (100% - 56px) * ${colIdx} / ${cols} + 2px + (${colWidth} - 4px) / ${maxCol} * ${col})`
                  const width = `calc((${colWidth} - 4px) / ${maxCol})`
                  
                  const isShort = height < 36
                  
                  return (
                    <div id={`cal-event-${e.id}`} key={e.id} className="rc-event" style={{ top, height, left, width, background: bg, borderLeftColor: borderLeftColor, borderStyle }} 
                         onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0 || hasDraggedRef.current) return; onEventClick(e.id, e); }} 
                         onContextMenu={(evt) => { evt.preventDefault(); if(onEventContextMenu) onEventContextMenu(evt, e); }} 
                         title={e.title}
                         onMouseDown={(evt) => startInteraction(evt, e, 'move', colIdx)}
                    >
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => startInteraction(evt, e, 'resize-top', colIdx)} />
                      <span className="rc-ev-title" style={{ pointerEvents: 'none' }}>{isTimeWarning ? '⚠️ ' : ''}{e.title}</span>
                      {!isShort && <span className="rc-ev-time" style={{ pointerEvents: 'none' }}>{new Date(e.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-{new Date(e.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
                      {height > 56 && <span className="rc-ev-doc" style={{ pointerEvents: 'none' }}>{d.name}</span>}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => startInteraction(evt, e, 'resize-bottom', colIdx)} />
                    </div>
                  )
                })}
                {/* Doctor Leaves (İzinli / Kapalı Saatler) */}
                {docLeaves.map(l => {
                  const lStart = `${l.date}T${l.isFullDay ? '00:00' : l.startTime}:00+03:00`;
                  const lEnd = `${l.date}T${l.isFullDay ? '23:59' : l.endTime}:00+03:00`;
                  const { top, height } = eventPosition(lStart, lEnd, 0);
                  const colWidth = `((100% - 56px) / ${cols})`;
                  const left = `calc(56px + (100% - 56px) * ${colIdx} / ${cols} + 2px)`;
                  const width = `calc(${colWidth} - 4px)`;

                  return (
                    <div
                      key={`leave-${l.id}`}
                      className="rc-doctor-leave"
                      style={{
                        position: 'absolute',
                        top,
                        height,
                        left,
                        width,
                        borderRadius: 6,
                        // Header (25) ve saat cetvelinin (15) altında kalır; kaydırırken başlıkları kapatmaz.
                        zIndex: 4,
                        padding: '6px 8px',
                        boxSizing: 'border-box',
                        cursor: 'not-allowed',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-start',
                        pointerEvents: 'auto'
                      }}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        evt.preventDefault();
                        toast.error(`Dr. ${d.name} bu saatlerde izinlidir (${l.startTime} - ${l.endTime})${l.reason ? `: ${l.reason}` : ''}. Randevu eklenemez!`);
                      }}
                      onDoubleClick={(evt) => {
                        evt.stopPropagation();
                        evt.preventDefault();
                        toast.error(`Dr. ${d.name} bu saatlerde izinlidir. Randevu eklenemez!`);
                      }}
                      title={`Dr. ${d.name} İzinli: ${l.startTime} - ${l.endTime}${l.reason ? ` (${l.reason})` : ''}`}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.72rem', color: 'var(--foreground-2)', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                        <span>Kapalı · İzinli</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--foreground-3)', fontWeight: 600 }}>({l.isFullDay ? 'Tüm gün' : `${l.startTime} - ${l.endTime}`})</span>
                      </div>
                      {l.reason && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--foreground-2, #94a3b8)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {l.reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
          {/* Unassigned events spanning all columns */}
          {hasUnassigned && calculateEventLayout(unassigned).map(({ event: e, col, maxCol }) => {
            const left = `calc(56px + 2px + ((100% - 56px - 4px) / ${maxCol}) * ${col})`;
            const width = `calc((100% - 56px - 4px) / ${maxCol})`;
            const { top, height } = eventPosition(e.startTime, e.endTime, 0);
            
            return (
              <div id={`cal-event-${e.id}`} key={e.id} className="rc-event rc-event-unassigned" style={{ top, height, left, width, maxWidth: `calc(100% - 56px - 4px - ((100% - 56px - 4px) / ${maxCol}) * ${col})`, minWidth: 0, background: 'rgba(245, 158, 11, 0.16)', border: '1.5px dashed #f59e0b', borderLeft: '4px solid #f59e0b', boxShadow: '0 2px 10px rgba(245, 158, 11, 0.15)' }}
                   onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0 || hasDraggedRef.current) return; onEventClick(e.id, e); }} 
                   onContextMenu={(evt) => { evt.preventDefault(); if(onEventContextMenu) onEventContextMenu(evt, e); }} 
                   title={`${e.title} — Doktor Atanmadı`}
                   onMouseDown={(evt) => {
                     let initialColIdx = 0;
                     if (gridRef.current) {
                       const gridRect = gridRef.current.getBoundingClientRect();
                       const colWidthPx = (gridRect.width - 56) / cols;
                       initialColIdx = Math.max(0, Math.min(cols - 1, Math.floor((evt.clientX - (gridRect.left + 56)) / colWidthPx)));
                     }
                     startInteraction(evt, e, 'move', initialColIdx);
                   }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => startInteraction(evt, e, 'resize-top', 0)} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: 4, background: '#f59e0b', color: '#181c24', fontWeight: 800, letterSpacing: '0.3px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ⚠️ DOKTOR ATANMADI
                  </span>
                </div>
                <span className="rc-ev-title" style={{ pointerEvents: 'none', fontWeight: 700, color: 'var(--foreground)' }}>{e.title}</span>
                {height > 44 && <span className="rc-ev-time" style={{ pointerEvents: 'none', color: 'var(--foreground-2)' }}>{new Date(e.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-{new Date(e.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => startInteraction(evt, e, 'resize-bottom', 0)} />
              </div>
            )
          })}
        </div>
        </div>
      </div>
    )
  }

  // ── WEEK VIEW ──
  if (view === 'week') {
    const weekDays = getWeekDays(currentDate)
    const cols = weekDays.length
    return (
      <div className="rc-scroll-container">
        <div className="rc-wrap" style={{ minWidth: '840px', width: '100%' }}>
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
              <div className="rc-col-sub">{events.filter(e => getLocalYMD(e.startTime) === d.date).length} randevu</div>
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
          <div className="rc-grid" ref={gridRef} style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }} onDoubleClick={(e) => {
            if (e.button !== 0 || dragRef.current.element) return;
            const gridRect = gridRef.current?.getBoundingClientRect();
            if (!gridRect) return;
            const mouseX = e.clientX - gridRect.left - 56;
            const mouseY = e.clientY - gridRect.top;
            if (mouseX < 0) return; // clicked on time column
            
            const colWidthPx = (gridRect.width - 56) / 7;
            const colIdx = Math.max(0, Math.min(6, Math.floor(mouseX / colWidthPx)));
            
            // Quantize Y to 30 mins
            const rowHeight = 48; // 60 mins = 96px, 30 mins = 48px
            const top = Math.floor(mouseY / rowHeight) * rowHeight;
            
            const cellX = gridRect.left + window.scrollX + 56 + (colIdx * colWidthPx);
            const cellY = gridRect.top + window.scrollY + top;

            const startMins = 0 * 60 + Math.round(top / 48 * 30);
            const endMins = startMins + 30;
            const dateStr = weekDays[colIdx]?.date || currentDate;
            const formatTime = (mins: number) => {
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              return `${dateStr}T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00+03:00`;
            };
            if (onEmptySlotSelect) {
              onEmptySlotSelect(formatTime(startMins), formatTime(endMins), null, cellX, cellY);
            }
          }}>
            {slots.map(slot => (
              <div key={slot} style={{ display: 'contents' }}>
                <div className="rc-time">{slot}</div>
                {Array.from({ length: 7 }).map((_, i) => <div key={`${slot}-${i}`} className="rc-cell" />)}
              </div>
            ))}
            
            {/* Draft Selection Ghost Event */}
            {draftSelection && (
              <div 
                className="rc-event" 
                style={{
                  top: draftSelection.top,
                  height: draftSelection.height,
                  left: `calc(56px + (100% - 56px) * ${draftSelection.colIdx} / 7 + 2px)`,
                  width: `calc(((100% - 56px) / 7) - 4px)`,
                  background: 'rgba(59,130,246,0.1)',
                  borderLeftColor: '#3b82f6',
                  borderStyle: 'dashed',
                  pointerEvents: 'none',
                  zIndex: 40
                }}
              >
                <span className="rc-ev-title" style={{ color: '#3b82f6', opacity: 0.8 }}>(Başlıksız)</span>
                <span className="rc-ev-time" style={{ color: '#3b82f6', opacity: 0.8 }}>
                  {(() => {
                    const s = 0 * 60 + Math.round(draftSelection.top / 48 * 30);
                    const e = s + Math.round(draftSelection.height / 48 * 30);
                    const f = (m: number) => `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
                    return `${f(s)} - ${f(e)}`;
                  })()}
                </span>
              </div>
            )}
          </div>
          {weekDays.map((day, colIdx) => {
            const dayEvents = events.filter(e => getLocalYMD(e.startTime) === day.date);
            const layout = calculateEventLayout(dayEvents);
            return layout.map(({ event: e, col, maxCol }) => {
              const { top, height } = eventPosition(e.startTime, e.endTime, 0)
              const doc = doctors.find(d => d.id === e.doctorId)
              const docColor = doc?.color || '#3b82f6'
              const isTimeWarning = e.timeConfirmed === false
              const isUnassigned = !e.doctorId

              let bg = isUnassigned ? 'rgba(245, 158, 11, 0.16)' : (doc?.color ? (doc.color.startsWith('#') ? `${doc.color}22` : doc.color) : 'rgba(59,130,246,0.15)')
              let borderLeftColor = isUnassigned ? '#f59e0b' : docColor
              let borderStyle = isUnassigned ? 'dashed' : 'solid'
              
              if (isTimeWarning) {
                bg = TIME_WARNING_STYLE.bg
                borderLeftColor = TIME_WARNING_STYLE.border
              }

              const colWidth = `((100% - 56px) / ${cols})`
              const left = `calc(56px + (100% - 56px) * ${colIdx} / ${cols} + 1px + (${colWidth} - 2px) / ${maxCol} * ${col})`
              const width = `calc((${colWidth} - 2px) / ${maxCol})`

              return (
                <div id={`cal-event-${e.id}`} key={e.id} className="rc-event" style={{ top, height, left, width, background: bg, borderLeftColor: borderLeftColor, borderStyle, border: isUnassigned ? '1.5px dashed #f59e0b' : undefined, borderLeft: isUnassigned ? '4px solid #f59e0b' : undefined }} 
                     onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0 || hasDraggedRef.current) return; onEventClick(e.id, e); }} 
                     onContextMenu={(evt) => { evt.preventDefault(); if(onEventContextMenu) onEventContextMenu(evt, e); }} 
                     title={`${e.title}${isUnassigned ? ' — Doktor Atanmadı' : ''}`}
                     onMouseDown={(evt) => startInteraction(evt, e, 'move', colIdx)}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => startInteraction(evt, e, 'resize-top', colIdx)} />
                  {isUnassigned ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, pointerEvents: 'none' }}>
                      <span style={{ fontSize: '0.58rem', color: '#f59e0b', fontWeight: 800 }}>⚠️ DOKTOR ATANMADI</span>
                      <span className="rc-ev-title" style={{ fontWeight: 600 }}>{e.title}</span>
                    </div>
                  ) : (
                    <span className="rc-ev-title" style={{ pointerEvents: 'none' }}>{isTimeWarning ? '⚠️ ' : ''}{e.title}</span>
                  )}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => startInteraction(evt, e, 'resize-bottom', colIdx)} />
                </div>
              )
            })
          })}
        </div>
        </div>
      </div>
    )
  }

  // ── MONTH VIEW ──
  const weeks = getMonthWeeks(currentDate)
  return (
    <div className="rc-scroll-container">
      <div className="rc-wrap rc-month" style={{ minWidth: '700px', width: '100%', position: 'relative' }}>
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
        const weekEvents = events.filter(e => { const d = getLocalYMD(e.startTime); return d >= week.startDate && d <= week.endDate })
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
                const doc = doctors.find(d => d.id === e.doctorId)
                const docColor = doc?.color || '#3b82f6'
                const isTimeWarning = e.timeConfirmed === false
                const isUnassigned = !e.doctorId

                let bg = isUnassigned ? 'rgba(245, 158, 11, 0.16)' : (doc?.color ? (doc.color.startsWith('#') ? `${doc.color}22` : doc.color) : 'rgba(59,130,246,0.15)')
                let borderLeftColor = isUnassigned ? '#f59e0b' : docColor
                let borderStyle = isUnassigned ? 'dashed' : 'solid'
                
                if (isTimeWarning) {
                  bg = TIME_WARNING_STYLE.bg
                  borderLeftColor = TIME_WARNING_STYLE.border
                }

                return (
                  <div id={`cal-event-${e.id}`} key={e.id} className="rc-month-ev" style={{ background: bg, borderLeftColor: borderLeftColor, borderStyle }} onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0) return; onEventClick(e.id, e); }}>
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
    </div>
  )
}
