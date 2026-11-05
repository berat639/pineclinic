'use client'

import React, { useMemo, useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { AlertTriangle } from 'lucide-react'
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
  intakeSource?: string | null
  reviewStatus?: string | null
  patientResponseStatus?: string | null
  patientResponseNote?: string | null
  patientPreferredDate?: string | null
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

export interface ClinicWorkingHours {
  startTime: string
  endTime: string
  isOvernight?: boolean
  slotStartHour: number
  slotEndHour: number
}

export type UpcomingStatusBucket =
  | 'pending_assignment'
  | 'scheduled'
  | 'confirmed'
  | 'postponed'
  | 'pending_review'

export interface UpcomingStatusBarItem {
  id: UpcomingStatusBucket
  icon: string
  label: string
  count: number
  color: string
}

interface Props {
  doctors: Doctor[]
  events: CalendarEvent[]
  shifts?: ShiftItem[]
  doctorLeaves?: DoctorLeaveItem[]
  workingHours?: ClinicWorkingHours
  currentDate: string
  onEventClick: (eventId: string, event: CalendarEvent) => void
  view?: 'day' | 'week' | 'month'
  onHeaderContextMenu?: (e: React.MouseEvent, doctorId: string) => void
  onEventContextMenu?: (e: React.MouseEvent, event: CalendarEvent) => void
  onEventUpdate?: (updatedEvent: CalendarEvent, options?: { requiresAssignmentConfirmation?: boolean; keepUnassigned?: boolean }) => void
  statusBarItems?: UpcomingStatusBarItem[]
  activeStatusFilter?: UpcomingStatusBucket | null
  onStatusBarItemClick?: (e: React.MouseEvent, bucket: UpcomingStatusBucket) => void
  onClearStatusFilter?: () => void
}

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  scheduled: { bg: 'rgba(59,130,246,0.15)', border: '#3b82f6' },
  confirmed: { bg: 'rgba(16,185,129,0.18)', border: '#10b981' },
  in_progress: { bg: 'rgba(245,158,11,0.18)', border: '#f59e0b' },
  completed: { bg: 'rgba(99,102,241,0.12)', border: '#6366f1' },
  cancelled: { bg: 'rgba(239,68,68,0.1)', border: '#ef4444' },
  pending_assignment: { bg: 'var(--calendar-unassigned-bg, #ffedd5)', border: '#ea580c' },
  pending_review: { bg: 'var(--card-inner)', border: 'var(--accent)' },
}

const TIME_WARNING_STYLE = { bg: 'rgba(245,158,11,0.2)', border: '#f59e0b' }

function getPatientStatusVisual(e: CalendarEvent) {
  const status = e.status
  const resp = e.patientResponseStatus
  if (status === 'cancelled' || resp === 'cancelled') {
    return {
      prefix: '❌ ',
      badge: 'İPTAL / GELMİYOR',
      borderLeftColor: '#ef4444',
      borderStyle: 'dashed',
      bgOverride: 'rgba(239, 68, 68, 0.14)',
      strike: true,
    }
  }
  if (status === 'postponed' || resp === 'postponed' || resp === 'reschedule_requested') {
    return {
      prefix: '⏳ ',
      badge: 'ERTELEME TALEBİ',
      borderLeftColor: '#f59e0b',
      borderStyle: 'dashed',
      bgOverride: 'rgba(245, 158, 11, 0.18)',
      strike: false,
    }
  }
  if (status === 'confirmed' || resp === 'confirmed') {
    return {
      prefix: '✅ ',
      badge: 'ONAYLANDI',
      borderLeftColor: '#10b981',
      borderStyle: 'solid',
      bgOverride: null,
      strike: false,
    }
  }
  if (status === 'no_show') {
    return {
      prefix: '🚫 ',
      badge: 'GELMEDİ',
      borderLeftColor: '#ef4444',
      borderStyle: 'dashed',
      bgOverride: 'rgba(239, 68, 68, 0.12)',
      strike: true,
    }
  }
  if (status === 'waiting_in_clinic' || status === 'arrived_unconfirmed') {
    return {
      prefix: '🏥 ',
      badge: status === 'arrived_unconfirmed' ? 'TEYİTSİZ GELDİ' : 'KLİNİKTE BEKLİYOR',
      borderLeftColor: '#0ea5e9',
      borderStyle: 'solid',
      bgOverride: null,
      strike: false,
    }
  }
  if (status === 'in_progress') {
    return {
      prefix: '🔄 ',
      badge: 'TEDAVİDE / İŞLEMDE',
      borderLeftColor: '#f59e0b',
      borderStyle: 'solid',
      bgOverride: null,
      strike: false,
    }
  }
  if (status === 'completed') {
    return {
      prefix: '✓ ',
      badge: 'TAMAMLANDI',
      borderLeftColor: '#10b981',
      borderStyle: 'solid',
      bgOverride: null,
      strike: false,
    }
  }
  if (status === 'pending_review' || e.reviewStatus === 'pending_review') {
    return {
      prefix: '🤖 ',
      badge: 'ONAY BEKLİYOR',
      borderLeftColor: '#0284c7',
      borderStyle: 'dashed',
      bgOverride: null,
      strike: false,
    }
  }
  return null
}

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function generateTimeSlots(start: number, end: number): string[] {
  const slots: string[] = []
  for (let h = start; h < end; h++) {
    const normalizedH = ((h % 24) + 24) % 24
    slots.push(`${normalizedH.toString().padStart(2, '0')}:00`)
    slots.push(`${normalizedH.toString().padStart(2, '0')}:30`)
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

function eventPosition(startTime: string, endTime: string, slotStartHour: number, slotEndHour = 24) {
  const s = new Date(startTime), e = new Date(endTime)
  let startMin = s.getHours() * 60 + s.getMinutes()
  let endMin = e.getHours() * 60 + e.getMinutes()
  if (slotEndHour > 24 && startMin < slotStartHour * 60) {
    startMin += 1440
    endMin += 1440
  } else if (endMin <= startMin) {
    endMin += 1440
  }
  const top = Math.max(0, ((startMin - slotStartHour * 60) / 30) * 48)
  const height = Math.max(((endMin - startMin) / 30) * 48, 22)
  return { top, height }
}

function calculateEventLayout(events: CalendarEvent[]) {
  const sorted = [...events].sort((a, b) => {
    const sA = new Date(a.startTime).getTime();
    const sB = new Date(b.startTime).getTime();
    if (sA !== sB) return sA - sB;
    const eDiff = new Date(b.endTime).getTime() - new Date(a.endTime).getTime();
    if (eDiff !== 0) return eDiff;
    return String(a.id).localeCompare(String(b.id));
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

export default function DentalCalendar({ doctors, events, shifts, doctorLeaves = [], workingHours, currentDate, onEventClick, view = 'day', onHeaderContextMenu, onEventContextMenu, onEventUpdate, onUnassignedHeaderContextMenu, onEmptySlotSelect, statusBarItems = [], activeStatusFilter = null, onStatusBarItemClick, onClearStatusFilter }: Props & { onUnassignedHeaderContextMenu?: (e: React.MouseEvent) => void, onEmptySlotSelect?: (start: string, end: string, doctorId: string | null, x: number, y: number) => void }) {
  
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const slotStartHour = typeof workingHours?.slotStartHour === 'number' ? workingHours.slotStartHour : 8;
  const slotEndHour = typeof workingHours?.slotEndHour === 'number' ? Math.max(workingHours.slotEndHour, slotStartHour + 1) : 20;

  // Draft selection state for empty slot
  const [draftSelection, setDraftSelection] = useState<{
    startY: number;
    startX: number;
    top: number;
    height: number;
    colIdx: number;
    active: boolean;
  } | null>(null);
  
  // Calculate displayDoctors at the top so handleMouseUp and Day View use the exact same column list
  const dayShifts = shifts?.filter(s => s.date === currentDate) || [];
  const dayDoctorLeaves = useMemo(() => {
    return (doctorLeaves || []).filter(l => l.date === currentDate);
  }, [doctorLeaves, currentDate]);
  const displayDoctors = doctors;

  
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
  const draftActiveRef = useRef(false);
  const [isUnassignedDrag, setIsUnassignedDrag] = useState(false)

  const startInteraction = (evt: React.MouseEvent, e: CalendarEvent, type: 'move' | 'resize-top' | 'resize-bottom', initialColIdx: number) => {
    if (evt.button !== 0) return;
    evt.stopPropagation();
    hasDraggedRef.current = false;
    if (!e.doctorId && type === 'move') setIsUnassignedDrag(true);
    
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
    element.style.opacity = '0.88';
    element.style.transition = 'none';
    element.style.willChange = 'transform, top, height';
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
          state.element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
        } else if (state.type === 'resize-bottom') {
          state.element.style.height = `calc(${state.originalHeight} + ${deltaY}px)`;
        } else if (state.type === 'resize-top') {
          state.element.style.top = `calc(${state.originalTop} + ${deltaY}px)`;
          state.element.style.height = `calc(${state.originalHeight} - ${deltaY}px)`;
        }
        return;
      }

      if (!draftActiveRef.current) return;

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
      if (draftActiveRef.current) {
        draftActiveRef.current = false;
        setDraftSelection(prev => {
          if (prev && prev.active && gridRef.current) {
            // convert top & height to time
            const startMins = slotStartHour * 60 + Math.round(prev.top / 48 * 30);
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
              const norm = ((mins % 1440) + 1440) % 1440;
              const h = Math.floor(norm / 60);
              const m = norm % 60;
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
      }

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
      const keepUnassigned = Boolean(!targetEvent?.doctorId && (e.shiftKey || e.altKey));

      if (gridRef.current && state.type === 'move') {
        const gridRect = gridRef.current.getBoundingClientRect();
        const availableWidth = gridRect.width - 56;
        const mouseXRelative = e.clientX - (gridRect.left + 56);
        const horizontalDelta = Math.abs(e.clientX - state.startX);
        
        if (mouseXRelative < -10 || mouseXRelative > availableWidth + 10 || e.clientY < gridRect.top - 10 || e.clientY > gridRect.bottom + 10) {
          newDoctorId = null; // Unassign if dropped outside
        } else {
          if (view === 'day' && !keepUnassigned) {
            // Sadece dikey sürüklemede (yatay hareket < 20px) mevcut hekim sütununu koru
            if (targetEvent?.doctorId && horizontalDelta < 20) {
              newDoctorId = targetEvent.doctorId;
            } else {
              const numCols = displayDoctors.length || 1;
              const colWidthPx = availableWidth / numCols;
              const dropCol = Math.max(0, Math.min(numCols - 1, Math.floor(mouseXRelative / colWidthPx)));
              newDoctorId = displayDoctors[dropCol]?.id || null;
            }
          } else if (view === 'week') {
            if (horizontalDelta >= 20) {
              const numCols = 7;
              const colWidthPx = availableWidth / numCols;
              const dropCol = Math.max(0, Math.min(numCols - 1, Math.floor(mouseXRelative / colWidthPx)));
              const weekDays = getWeekDays(currentDate);
              newDate = weekDays[dropCol]?.date || newDate;
            }
          }
        }
      }

      // Cleanup DOM
      state.element.style.transform = '';
      if (state.type === 'resize-top' || state.type === 'resize-bottom') {
        state.element.style.height = state.originalHeight;
        state.element.style.top = state.originalTop;
      }
      state.element.style.zIndex = state.originalZIndex;
      state.element.style.opacity = state.originalOpacity;
      state.element.style.transition = '';
      state.element.style.willChange = '';
      document.body.style.userSelect = '';
      setIsUnassignedDrag(false)
      
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
              let shiftEndMin = eH * 60 + (eM || 0);
              if (shiftEndMin <= shiftStartMin) shiftEndMin += 1440;
              let evStart = startMinOfDay;
              let evEnd = endMinOfDay;
              if (evEnd <= evStart) evEnd += 1440;
              if (shiftEndMin > 1440 && evStart < shiftStartMin) {
                evStart += 1440;
                evEnd += 1440;
              }
              return evStart >= shiftStartMin && evEnd <= shiftEndMin;
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

            // Çakışma Kontrolü: Hedef hekimin aynı saatte başka aktif randevusu var mı?
            const newStartMs = newStartTime.getTime();
            const newEndMs = newEndTime.getTime();
            const conflictEvent = events.find(ev => {
              if (!ev || ev.id === targetEvent.id) return false;
              if (ev.doctorId !== newDoctorId) return false;
              if (ev.status === 'cancelled' || ev.patientResponseStatus === 'cancelled') return false;
              const evStartMs = new Date(ev.startTime).getTime();
              const evEndMs = new Date(ev.endTime).getTime();
              return newStartMs < evEndMs && newEndMs > evStartMs;
            });

            if (conflictEvent) {
              const cStart = new Date(conflictEvent.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
              const cEnd = new Date(conflictEvent.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
              toast.error(`⚠️ ${docName} için ${cStart}-${cEnd} saatinde başka bir randevu (${conflictEvent.title}) bulunuyor!`);
              return;
            }
          }

          onEventUpdate({
            ...targetEvent,
            startTime: newStartTime.toISOString(),
            endTime: newEndTime.toISOString(),
            doctorId: newDoctorId
          }, {
            requiresAssignmentConfirmation: Boolean(!targetEvent.doctorId && newDoctorId),
            keepUnassigned,
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
  }, [events, shifts, doctorLeaves, onEventUpdate, view, doctors, currentDate, onEmptySlotSelect, slotStartHour, slotEndHour]);

  // Expose method to clear draft
  useEffect(() => {
    const handleClearDraft = () => setDraftSelection(null);
    window.addEventListener('clear-calendar-draft', handleClearDraft);
    return () => window.removeEventListener('clear-calendar-draft', handleClearDraft);
  }, []);

  // Auto-scroll to current hour when opened in Daily or Weekly view
  const hasDoctorsLoaded = doctors.length > 0;
  useEffect(() => {
    if (view === 'day' || view === 'week') {
      const performScrollToCurrentTime = () => {
        const now = new Date();
        let currentHour = now.getHours() + now.getMinutes() / 60;
        if (slotEndHour > 24 && currentHour < slotStartHour) {
          currentHour += 24;
        }
        const clampedHour = Math.min(Math.max(currentHour, slotStartHour), Math.max(slotStartHour, slotEndHour - 0.5));
        const offsetHours = Math.max(0, clampedHour - slotStartHour);
        const top = offsetHours * 96; // 96px per hour (48px per 30 min)
        const targetScrollTop = Math.max(0, Math.round(top - 96)); // ~1 hour before current time

        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = targetScrollTop;
          return;
        }

        if (!gridRef.current) return;
        let parent = gridRef.current.parentElement;
        while (parent) {
          const style = window.getComputedStyle(parent);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            parent.scrollTop = targetScrollTop;
            break;
          }
          parent = parent.parentElement;
        }
      };

      const rafId = window.requestAnimationFrame(performScrollToCurrentTime);
      const timer1 = setTimeout(performScrollToCurrentTime, 60);
      const timer2 = setTimeout(performScrollToCurrentTime, 180);
      return () => {
        window.cancelAnimationFrame(rafId);
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [view, slotStartHour, slotEndHour, currentDate, hasDoctorsLoaded]);

  const slots = generateTimeSlots(slotStartHour, slotEndHour)

  const [warningTooltip, setWarningTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const UNASSIGNED_TOOLTIP_TEXT = 'Doktor ayrıldı, atama bekliyor'

  const showWarningTooltip = (evt: React.MouseEvent<HTMLElement>) => {
    const rect = evt.currentTarget.getBoundingClientRect()
    setWarningTooltip({
      x: rect.left,
      y: rect.top,
      text: UNASSIGNED_TOOLTIP_TEXT,
    })
  }

  const hideWarningTooltip = () => {
    setWarningTooltip(null)
  }

  const renderWarningTooltip = () =>
    warningTooltip ? (
      <div
        role="tooltip"
        className="rc-unassigned-tooltip"
        style={{
          position: 'fixed',
          left: Math.min(Math.max(12, warningTooltip.x), typeof window !== 'undefined' ? window.innerWidth - 240 : warningTooltip.x),
          top: Math.max(12, warningTooltip.y - 38),
          zIndex: 9999999,
          background: 'var(--card-bg, #0f172a)',
          color: 'var(--foreground, #ffffff)',
          border: '1.5px solid #ea580c',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: '0.74rem',
          fontWeight: 700,
          boxShadow: 'var(--pc-modal-shadow)',
          pointerEvents: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
        }}
      >
        <AlertTriangle size={13} color="#ea580c" style={{ flexShrink: 0 }} />
        <span>{warningTooltip.text}</span>
      </div>
    ) : null

  const isEventUnassigned = (e: CalendarEvent) =>
    !e.doctorId || e.status === 'pending_assignment' || !doctors.some((d) => d.id === e.doctorId)

  const isEventPastOrArrived = (e: CalendarEvent) => {
    const endMs = new Date(e.endTime || e.startTime).getTime()
    if (isNaN(endMs) || endMs < Date.now()) return true
    const st = (e.status || 'scheduled').toLowerCase()
    const rp = (e.patientResponseStatus || '').toLowerCase()
    return (
      st === 'completed' ||
      st === 'in_progress' ||
      st === 'waiting_in_clinic' ||
      st === 'arrived_unconfirmed' ||
      st === 'cancelled' ||
      st === 'no_show' ||
      rp === 'cancelled'
    )
  }

  const globalUnassigned = events.filter((e) => isEventUnassigned(e) && !isEventPastOrArrived(e))

  const renderStatusHeaderRow = () => {
    if (!statusBarItems || statusBarItems.length === 0) return null
    return (
      <>
        <div
          className="rc-corner"
          style={{
            borderTop: '1px solid var(--input-border, rgba(0,0,0,0.06))',
            backgroundColor: 'var(--card-inner, #f8fafc)',
          }}
        />
        <div
          className="rc-col-head"
          style={{
            gridColumn: '2 / -1',
            borderTop: '1px solid var(--input-border, rgba(0,0,0,0.06))',
            backgroundColor: 'var(--card-inner, #f8fafc)',
            borderBottomColor: activeStatusFilter ? '#2563eb' : '#9ca3af',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 8,
            padding: '5px 10px',
          }}
        >
          {statusBarItems.map((item) => {
            const isActive = activeStatusFilter === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (onStatusBarItemClick) onStatusBarItemClick(e, item.id)
                  else if (item.id === 'pending_assignment' && onUnassignedHeaderContextMenu) onUnassignedHeaderContextMenu(e)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (onStatusBarItemClick) onStatusBarItemClick(e, item.id)
                  else if (item.id === 'pending_assignment' && onUnassignedHeaderContextMenu) onUnassignedHeaderContextMenu(e)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 999,
                  border: isActive ? `1.5px solid ${item.color}` : '1px solid var(--input-border, #cbd5e1)',
                  background: isActive ? 'var(--card-bg, #ffffff)' : 'var(--input-bg, #ffffff)',
                  color: 'var(--foreground)',
                  fontSize: '0.76rem',
                  fontWeight: isActive ? 700 : 600,
                  cursor: 'pointer',
                  boxShadow: isActive ? `0 0 0 2px ${item.color}22` : 'none',
                }}
                title={`${item.label} (${item.count} gelecek randevu) — Görüntülemek ve filtrelemek için tıklayın`}
              >
                <span style={{ color: 'var(--foreground)' }}>{item.icon} {item.label}</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '0 6px',
                    borderRadius: 999,
                    background: item.count > 0 ? `${item.color}18` : 'var(--card-inner)',
                    color: item.count > 0 ? item.color : 'var(--foreground-3)',
                    border: `1px solid ${item.count > 0 ? `${item.color}40` : 'var(--input-border)'}`,
                  }}
                >
                  {item.count} bekliyor
                </span>
              </button>
            )
          })}
          {activeStatusFilter && onClearStatusFilter && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClearStatusFilter()
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 9px',
                borderRadius: 999,
                border: '1px solid var(--danger, #ef4444)',
                background: 'var(--card-bg, #ffffff)',
                color: 'var(--danger, #ef4444)',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✕ Filtreyi Kaldır
            </button>
          )}
        </div>
      </>
    )
  }

  // ── DAY VIEW ──
  if (view === 'day') {
    const dayShifts = shifts?.filter(s => s.date === currentDate) || []
    let displayDoctors = doctors;

    const dayEvents = events.filter(e => getLocalYMD(e.startTime) === currentDate);
    const unassigned = dayEvents.filter(e => isEventUnassigned(e))
    const hasUnassigned = globalUnassigned.length > 0 || unassigned.length > 0
    const cols = displayDoctors.length || 1
    const minDayWidth = cols <= 1 ? '100%' : `${cols * 220 + 56}px`
    return (
      <div ref={scrollContainerRef} className={`rc-scroll-container${isUnassignedDrag ? ' rc-unassigned-drag' : ''}`}>
        {renderWarningTooltip()}
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
          {renderStatusHeaderRow()}
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

            const startMins = slotStartHour * 60 + Math.round(top / 48 * 30);
            const endMins = startMins + 30;
            const doctorId = displayDoctors[colIdx]?.id || null;
            const formatTime = (mins: number) => {
              const norm = ((mins % 1440) + 1440) % 1440;
              const h = Math.floor(norm / 60);
              const m = norm % 60;
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
                const normStart = ((startMins % 1440) + 1440) % 1440;
                const normEnd = normStart + 30;
                return normStart < lEnd && normEnd > lStart;
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
            {slots.map((slot, slotIdx) => (
              <div key={`${slot}-${slotIdx}`} style={{ display: 'contents' }}>
                <div className="rc-time">{slot}</div>
                {Array.from({ length: cols }).map((_, i) => <div key={`${slot}-${slotIdx}-${i}`} className="rc-cell" />)}
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
                    const s = slotStartHour * 60 + Math.round(draftSelection.top / 48 * 30);
                    const e = s + Math.round(draftSelection.height / 48 * 30);
                    const f = (m: number) => {
                      const norm = ((m % 1440) + 1440) % 1440;
                      return `${Math.floor(norm/60).toString().padStart(2,'0')}:${(norm%60).toString().padStart(2,'0')}`;
                    };
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
                  const { top, height } = eventPosition(e.startTime, e.endTime, slotStartHour, slotEndHour)
                  const isTimeWarning = e.timeConfirmed === false
                  const doc = doctors.find(docItem => docItem.id === e.doctorId) || d
                  const docColor = doc?.color || '#3b82f6'
                  const patientVisual = getPatientStatusVisual(e)
                  
                  let bg = doc?.color ? (doc.color.startsWith('#') ? `${doc.color}22` : doc.color) : 'rgba(59,130,246,0.15)'
                  let borderLeftColor = docColor
                  let borderStyle = 'solid'

                  if (isTimeWarning) {
                    bg = TIME_WARNING_STYLE.bg
                    borderLeftColor = TIME_WARNING_STYLE.border
                  }
                  if (patientVisual) {
                    borderLeftColor = patientVisual.borderLeftColor
                    borderStyle = patientVisual.borderStyle
                    if (patientVisual.bgOverride) bg = patientVisual.bgOverride
                  }
                  
                  const colWidth = `((100% - 56px) / ${cols})`
                  const left = `calc(56px + (100% - 56px) * ${colIdx} / ${cols} + 2px + (${colWidth} - 4px) / ${maxCol} * ${col})`
                  const width = `calc((${colWidth} - 4px) / ${maxCol})`
                  
                  const isShort = height < 36
                  
                  return (
                    <div id={`cal-event-${e.id}`} key={e.id} className="rc-event" style={{ top, height, left, width, background: bg, borderLeftColor: borderLeftColor, borderStyle }} 
                         onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0 || hasDraggedRef.current) return; onEventClick(e.id, e); }} 
                         onContextMenu={(evt) => { evt.preventDefault(); if(onEventContextMenu) onEventContextMenu(evt, e); }} 
                         title={`${patientVisual ? `[${patientVisual.badge}] ` : ''}${e.title}`}
                         onMouseDown={(evt) => startInteraction(evt, e, 'move', colIdx)}
                    >
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => startInteraction(evt, e, 'resize-top', colIdx)} />
                      <span className="rc-ev-title" style={{ pointerEvents: 'none', textDecoration: patientVisual?.strike ? 'line-through' : 'none' }}>{patientVisual?.prefix || (isTimeWarning ? '⚠️ ' : '')}{e.title}</span>
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
                  const { top, height } = l.isFullDay
                    ? { top: 0, height: (slotEndHour - slotStartHour) * 96 }
                    : eventPosition(lStart, lEnd, slotStartHour, slotEndHour);
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
                        toast.error(`Dr. ${d.name} bu saatlerde izinlidir (${l.startTime} - ${l.endTime})${l.reason ? `: ${l.reason}` : ''}${l.substituteDoctorName ? ` · Yerine: ${l.substituteDoctorName}` : ''}. Randevu eklenemez!`);
                      }}
                      onDoubleClick={(evt) => {
                        evt.stopPropagation();
                        evt.preventDefault();
                        toast.error(`Dr. ${d.name} bu saatlerde izinlidir. Randevu eklenemez!`);
                      }}
                      title={`Dr. ${d.name} İzinli: ${l.startTime} - ${l.endTime}${l.reason ? ` (${l.reason})` : ''}${l.substituteDoctorName ? ` · Yerine: ${l.substituteDoctorName}` : ''}`}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.72rem', color: 'var(--foreground-2)', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                        <span>Kapalı · İzinli</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--foreground-3)', fontWeight: 600 }}>({l.isFullDay ? 'Tüm gün' : `${l.startTime} - ${l.endTime}`})</span>
                      </div>
                      {(l.reason || l.substituteDoctorName) && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--foreground-2, #94a3b8)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {l.reason || ''}
                          {l.substituteDoctorName ? `${l.reason ? ' · ' : ''}Yerine: ${l.substituteDoctorName}` : ''}
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
            const { top, height } = eventPosition(e.startTime, e.endTime, slotStartHour, slotEndHour);
            const patientVisual = getPatientStatusVisual(e);
            
            return (
              <div id={`cal-event-${e.id}`} key={e.id} className="rc-event rc-event-unassigned" style={{ top, height, left, width, maxWidth: `calc(100% - 56px - 4px - ((100% - 56px - 4px) / ${maxCol}) * ${col})`, minWidth: 0, background: 'var(--calendar-unassigned-bg, #ffedd5)', border: '1.5px solid var(--calendar-unassigned-border, #ea580c)', borderLeft: '4px solid #ea580c', boxShadow: '0 2px 10px rgba(234, 88, 12, 0.22)' }}
                   onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0 || hasDraggedRef.current) return; onEventClick(e.id, e); }} 
                   onContextMenu={(evt) => { evt.preventDefault(); if(onEventContextMenu) onEventContextMenu(evt, e); }} 
                   title={`${patientVisual ? `[${patientVisual.badge}] ` : ''}${e.title} — ${UNASSIGNED_TOOLTIP_TEXT}`}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, minWidth: 0, overflow: 'hidden' }}>
                  <span
                    className="rc-unassigned-warning-icon"
                    title={UNASSIGNED_TOOLTIP_TEXT}
                    onMouseEnter={showWarningTooltip}
                    onMouseLeave={hideWarningTooltip}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      background: '#ea580c',
                      color: '#ffffff',
                      flexShrink: 0,
                      pointerEvents: 'auto',
                      cursor: 'help',
                    }}
                  >
                    <AlertTriangle size={12} color="#ffffff" />
                  </span>
                  <span
                    className="rc-unassigned-badge"
                    title={UNASSIGNED_TOOLTIP_TEXT}
                    onMouseEnter={showWarningTooltip}
                    onMouseLeave={hideWarningTooltip}
                    style={{ pointerEvents: 'auto', cursor: 'help' }}
                  >
                    ATAMA BEKLİYOR
                  </span>
                </div>
                <span className="rc-ev-title" style={{ pointerEvents: 'none', fontWeight: 700, color: 'var(--calendar-unassigned-text, #9a3412)', textDecoration: patientVisual?.strike ? 'line-through' : 'none' }}>{patientVisual?.prefix || ''}{e.title}</span>
                {height > 44 && <span className="rc-ev-time" style={{ pointerEvents: 'none', color: 'var(--calendar-unassigned-subtext, #c2410c)', fontWeight: 600 }}>{new Date(e.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-{new Date(e.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
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
      <div ref={scrollContainerRef} className={`rc-scroll-container${isUnassignedDrag ? ' rc-unassigned-drag' : ''}`}>
        {renderWarningTooltip()}
        <div className="rc-wrap" style={{ minWidth: '840px', width: '100%' }}>
        <div className="rc-header" style={{ gridTemplateColumns: `56px repeat(${cols}, 1fr)` }}>
          <div className="rc-corner" style={{ position: 'relative' }}>
            {globalUnassigned.length > 0 && (
              <div 
                style={{ position: 'absolute', top: 4, left: 4, right: 4, background: '#ea580c', color: '#fff', fontSize: '0.65rem', padding: '4px', borderRadius: 4, textAlign: 'center', cursor: 'pointer', fontWeight: 700, zIndex: 10 }}
                title={UNASSIGNED_TOOLTIP_TEXT}
                onMouseEnter={showWarningTooltip}
                onMouseLeave={hideWarningTooltip}
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
          {renderStatusHeaderRow()}
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

            const startMins = slotStartHour * 60 + Math.round(top / 48 * 30);
            const endMins = startMins + 30;
            const dateStr = weekDays[colIdx]?.date || currentDate;
            const formatTime = (mins: number) => {
              const norm = ((mins % 1440) + 1440) % 1440;
              const h = Math.floor(norm / 60);
              const m = norm % 60;
              return `${dateStr}T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00+03:00`;
            };
            if (onEmptySlotSelect) {
              onEmptySlotSelect(formatTime(startMins), formatTime(endMins), null, cellX, cellY);
            }
          }}>
            {slots.map((slot, slotIdx) => (
              <div key={`${slot}-${slotIdx}`} style={{ display: 'contents' }}>
                <div className="rc-time">{slot}</div>
                {Array.from({ length: 7 }).map((_, i) => <div key={`${slot}-${slotIdx}-${i}`} className="rc-cell" />)}
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
                    const s = slotStartHour * 60 + Math.round(draftSelection.top / 48 * 30);
                    const e = s + Math.round(draftSelection.height / 48 * 30);
                    const f = (m: number) => {
                      const norm = ((m % 1440) + 1440) % 1440;
                      return `${Math.floor(norm/60).toString().padStart(2,'0')}:${(norm%60).toString().padStart(2,'0')}`;
                    };
                    return `${f(s)} - ${f(e)}`;
                  })()}
                </span>
              </div>
            )}
          </div>
          {weekDays.map((day, colIdx) => {
            const dayEvents = events.filter(e => getLocalYMD(e.startTime) === day.date);
            const layout = calculateEventLayout(dayEvents);
            const leaveBlocks = (doctorLeaves || []).filter(l => l.date === day.date).map(l => {
              const start = `${l.date}T${l.isFullDay ? '00:00' : l.startTime}:00+03:00`
              const end = `${l.date}T${l.isFullDay ? '23:59' : l.endTime}:00+03:00`
              const { top, height } = l.isFullDay
                ? { top: 0, height: (slotEndHour - slotStartHour) * 96 }
                : eventPosition(start, end, slotStartHour, slotEndHour)
              const left = `calc(56px + (100% - 56px) * ${colIdx} / ${cols} + 2px)`
              const width = `calc((100% - 56px) / ${cols} - 4px)`
              return <div key={`week-leave-${l.id}`} className="rc-doctor-leave" style={{ position: 'absolute', top, height, left, width, zIndex: 3, padding: '5px 7px', overflow: 'hidden', cursor: 'not-allowed' }} title={`Dr. ${l.doctorName || 'Hekim'} izinli: ${l.isFullDay ? 'Tüm gün' : `${l.startTime}-${l.endTime}`}${l.substituteDoctorName ? ` · Yerine: ${l.substituteDoctorName}` : ''}`}>
                <span className="rc-ev-title">Kapalı · {l.doctorName || 'Hekim'}</span>
                <span className="rc-ev-time">{l.isFullDay ? 'Tüm gün' : `${l.startTime}-${l.endTime}`}{l.substituteDoctorName ? ` · Yerine: ${l.substituteDoctorName}` : ''}</span>
              </div>
            })
            const eventBlocks = layout.map(({ event: e, col, maxCol }) => {
              const { top, height } = eventPosition(e.startTime, e.endTime, slotStartHour, slotEndHour)
              const doc = doctors.find(d => d.id === e.doctorId)
              const docColor = doc?.color || '#3b82f6'
              const isTimeWarning = e.timeConfirmed === false
              const isUnassigned = isEventUnassigned(e)
              const patientVisual = getPatientStatusVisual(e)

              let bg = isUnassigned ? 'var(--calendar-unassigned-bg, #ffedd5)' : (doc?.color ? (doc.color.startsWith('#') ? `${doc.color}22` : doc.color) : 'rgba(59,130,246,0.15)')
              let borderLeftColor = isUnassigned ? '#ea580c' : docColor
              let borderStyle = 'solid'
              
              if (!isUnassigned && isTimeWarning) {
                bg = TIME_WARNING_STYLE.bg
                borderLeftColor = TIME_WARNING_STYLE.border
              }
              if (!isUnassigned && patientVisual) {
                borderLeftColor = patientVisual.borderLeftColor
                borderStyle = patientVisual.borderStyle
                if (patientVisual.bgOverride) bg = patientVisual.bgOverride
              }

              const colWidth = `((100% - 56px) / ${cols})`
              const left = `calc(56px + (100% - 56px) * ${colIdx} / ${cols} + 1px + (${colWidth} - 2px) / ${maxCol} * ${col})`
              const width = `calc((${colWidth} - 2px) / ${maxCol})`

              return (
                <div id={`cal-event-${e.id}`} key={e.id} className="rc-event" style={{ top, height, left, width, background: bg, borderLeftColor: borderLeftColor, borderStyle, border: isUnassigned ? '1.5px solid var(--calendar-unassigned-border, #ea580c)' : undefined, borderLeft: isUnassigned ? '4px solid #ea580c' : undefined }} 
                     onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0 || hasDraggedRef.current) return; onEventClick(e.id, e); }} 
                     onContextMenu={(evt) => { evt.preventDefault(); if(onEventContextMenu) onEventContextMenu(evt, e); }} 
                     title={`${patientVisual ? `[${patientVisual.badge}] ` : ''}${e.title}${isUnassigned ? ` — ${UNASSIGNED_TOOLTIP_TEXT}` : ''}`}
                     onMouseDown={(evt) => startInteraction(evt, e, 'move', colIdx)}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => startInteraction(evt, e, 'resize-top', colIdx)} />
                  {isUnassigned ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span
                          className="rc-unassigned-warning-icon"
                          title={UNASSIGNED_TOOLTIP_TEXT}
                          onMouseEnter={showWarningTooltip}
                          onMouseLeave={hideWarningTooltip}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            background: '#ea580c',
                            color: '#ffffff',
                            flexShrink: 0,
                            pointerEvents: 'auto',
                            cursor: 'help',
                          }}
                        >
                          <AlertTriangle size={11} color="#ffffff" />
                        </span>
                        <span
                          className="rc-unassigned-badge"
                          title={UNASSIGNED_TOOLTIP_TEXT}
                          onMouseEnter={showWarningTooltip}
                          onMouseLeave={hideWarningTooltip}
                          style={{ fontSize: '0.56rem', padding: '1px 5px', pointerEvents: 'auto', cursor: 'help' }}
                        >
                          ATAMA BEKLİYOR
                        </span>
                      </div>
                      <span className="rc-ev-title" style={{ pointerEvents: 'none', fontWeight: 700, color: 'var(--calendar-unassigned-text, #9a3412)', textDecoration: patientVisual?.strike ? 'line-through' : 'none' }}>{patientVisual?.prefix || ''}{e.title}</span>
                    </div>
                  ) : (
                    <span className="rc-ev-title" style={{ pointerEvents: 'none', textDecoration: patientVisual?.strike ? 'line-through' : 'none' }}>{patientVisual?.prefix || (isTimeWarning ? '⚠️ ' : '')}{e.title}</span>
                  )}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(evt) => startInteraction(evt, e, 'resize-bottom', colIdx)} />
                </div>
              )
            })
            return <React.Fragment key={day.date}>{leaveBlocks}{eventBlocks}</React.Fragment>
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
      {renderWarningTooltip()}
      <div className="rc-wrap rc-month" style={{ minWidth: '700px', width: '100%', position: 'relative' }}>
      {globalUnassigned.length > 0 && (
        <div 
          style={{ position: 'absolute', top: 12, right: 16, background: '#ea580c', color: '#fff', fontSize: '0.7rem', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
          title={UNASSIGNED_TOOLTIP_TEXT}
          onMouseEnter={showWarningTooltip}
          onMouseLeave={hideWarningTooltip}
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
              {weekEvents.length === 0 && (!shifts || shifts.filter(s => s.date >= week.startDate && s.date <= week.endDate).length === 0) && <span className="rc-empty">Randevu/Vardiya/İzin yok</span>}
              {(doctorLeaves || []).filter(l => l.date >= week.startDate && l.date <= week.endDate).map(l => (
                <div key={`month-leave-${l.id}`} className="rc-month-ev rc-doctor-leave" title={`İzinli / kapalı saat${l.substituteDoctorName ? ` · Yerine: ${l.substituteDoctorName}` : ''}`}>
                  <span className="rc-ev-title">⛔ İzinli: {l.doctorName || 'Hekim'}{l.substituteDoctorName ? ` (Yerine: ${l.substituteDoctorName})` : ''}</span>
                  <span className="rc-ev-time">{new Date(`${l.date}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })} · {l.isFullDay ? 'Tüm gün' : `${l.startTime}-${l.endTime}`}</span>
                </div>
              ))}
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
                const isUnassigned = isEventUnassigned(e)
                const patientVisual = getPatientStatusVisual(e)

                let bg = isUnassigned ? 'var(--calendar-unassigned-bg, #ffedd5)' : (doc?.color ? (doc.color.startsWith('#') ? `${doc.color}22` : doc.color) : 'rgba(59,130,246,0.15)')
                let borderLeftColor = isUnassigned ? '#ea580c' : docColor
                let borderStyle = 'solid'
                
                if (!isUnassigned && isTimeWarning) {
                  bg = TIME_WARNING_STYLE.bg
                  borderLeftColor = TIME_WARNING_STYLE.border
                }
                if (!isUnassigned && patientVisual) {
                  borderLeftColor = patientVisual.borderLeftColor
                  borderStyle = patientVisual.borderStyle
                  if (patientVisual.bgOverride) bg = patientVisual.bgOverride
                }

                return (
                  <div id={`cal-event-${e.id}`} key={e.id} className="rc-month-ev" style={{ background: bg, borderLeftColor: borderLeftColor, borderStyle, border: isUnassigned ? '1px solid var(--calendar-unassigned-border, #ea580c)' : undefined, borderLeft: isUnassigned ? '4px solid #ea580c' : undefined }} title={isUnassigned ? `${e.title} — ${UNASSIGNED_TOOLTIP_TEXT}` : e.title} onClick={(evt) => { if(evt.ctrlKey || evt.button !== 0) return; onEventClick(e.id, e); }}>
                    <span className="rc-ev-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: isUnassigned ? 'var(--calendar-unassigned-text, #9a3412)' : undefined, fontWeight: isUnassigned ? 700 : undefined, textDecoration: patientVisual?.strike ? 'line-through' : 'none' }}>
                      {isUnassigned && (
                        <span
                          className="rc-unassigned-warning-icon"
                          title={UNASSIGNED_TOOLTIP_TEXT}
                          onMouseEnter={showWarningTooltip}
                          onMouseLeave={hideWarningTooltip}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            background: '#ea580c',
                            color: '#ffffff',
                            flexShrink: 0,
                            cursor: 'help',
                          }}
                        >
                          <AlertTriangle size={11} color="#ffffff" />
                        </span>
                      )}
                      <span>{patientVisual?.prefix || (!isUnassigned && isTimeWarning ? '⚠️ ' : '')}{e.title}</span>
                    </span>
                    <span className="rc-ev-time" style={{ color: isUnassigned ? 'var(--calendar-unassigned-subtext, #c2410c)' : undefined }}>{new Date(e.startTime).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })} {new Date(e.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
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
