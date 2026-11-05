'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { tr } from 'date-fns/locale'
import {
  Calendar as CalendarIcon,
  CalendarOff,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import ShiftContextMenu from '../../../admin/components/ShiftContextMenu'

export type Staff = { id: string; name: string; role: string; active: boolean; color?: string }
export type Shift = { id: string; userId: string; userName: string; userColor?: string; date: string; startTime: string; endTime: string; shiftType: string }
type Leave = { id: string; doctorId: string; doctorName?: string; date: string; isFullDay: boolean; startTime: string; endTime: string; reason?: string | null }
type View = 'day' | 'week' | 'month'
type RepeatMode = 'once' | 'week' | 'month'

export interface StaffPlannerPermissions {
  viewShiftPlanner: boolean
  editShifts: boolean
  manageLeaves: boolean
  editClinicWorkingHours: boolean
  manageStaff: boolean
}

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const total = index * 30
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})
const END_TIME_OPTIONS = [...TIME_OPTIONS.slice(1), '24:00']

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const localDate = (key: string) => new Date(`${key}T12:00:00`)
const addDays = (key: string, days: number) => {
  const d = localDate(key)
  d.setDate(d.getDate() + days)
  return dateKey(d)
}
const monday = (key: string) => {
  const d = localDate(key)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dateKey(d)
}
const monthStart = (key: string) => `${key.slice(0, 7)}-01`
const monthEnd = (key: string) => {
  const d = localDate(key)
  return dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12))
}
const label = (key: string, options: Intl.DateTimeFormatOptions) => localDate(key).toLocaleDateString('tr-TR', options)

const timeToSteps = (timeStr: string): number => {
  if (timeStr === '24:00') return 96
  const [h, m] = (timeStr || '08:00').split(':').map(Number)
  const totalMins = (h || 0) * 60 + (m || 0)
  return Math.max(0, Math.min(96, Math.round(totalMins / 15)))
}

const stepsToTime = (steps: number): string => {
  const clamped = Math.max(0, Math.min(96, Math.round(steps)))
  if (clamped === 96) return '24:00'
  const totalMins = clamped * 15
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function useCompactLayout() {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setCompact(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return compact
}

const neoCard: CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: 14,
  boxShadow: 'var(--pc-neo-card)',
}

const neoSubCard: CSSProperties = {
  background: 'var(--card-inner)',
  border: '1px solid var(--input-border)',
  borderRadius: 12,
  boxShadow: 'var(--pc-neo-subcard)',
}

const neoInput: CSSProperties = {
  minHeight: 38,
  padding: '0 11px',
  borderRadius: 10,
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--foreground)',
  boxShadow: 'var(--pc-neo-inset)',
  boxSizing: 'border-box',
  width: '100%',
  fontSize: 13,
  fontWeight: 650,
  outline: 'none',
}

const claySecondaryButton: CSSProperties = {
  minHeight: 38,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid var(--btn-clinic-blue-border, #93c5fd)',
  background: 'var(--btn-clinic-blue-bg, #ffffff)',
  color: 'var(--btn-clinic-blue-fg, #1d4ed8)',
  boxShadow: 'var(--pc-clay-btn)',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 12.5,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
}

const clayNeutralButton: CSSProperties = {
  minHeight: 38,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--foreground)',
  boxShadow: 'var(--pc-clay-btn)',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 12.5,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
}

const clayPrimaryButton: CSSProperties = {
  minHeight: 38,
  padding: '0 15px',
  borderRadius: 10,
  border: '1px solid #1d4ed8',
  background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  boxShadow: 'var(--pc-clay-primary)',
  cursor: 'pointer',
  fontWeight: 750,
  fontSize: 12.5,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
}

const CALENDAR_POPOVER_CSS = `
  .clinic-rdp {
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }
  .clinic-rdp .rdp {
    --rdp-cell-size: 33px !important;
    --rdp-accent-color: #2563eb !important;
    --rdp-background-color: var(--card-inner);
    margin: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    color: var(--foreground);
    font-size: 12.5px;
  }
  .clinic-rdp .rdp-months,
  .clinic-rdp .rdp-month,
  .clinic-rdp .rdp-table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed !important;
    justify-content: center;
  }
  .clinic-rdp .rdp-caption {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 0 2px 8px !important;
  }
  .clinic-rdp .rdp-caption_label {
    font-size: 13.5px;
    font-weight: 800;
    color: var(--foreground);
    text-transform: capitalize;
  }
  .clinic-rdp .rdp-nav {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
  }
  .clinic-rdp .rdp-nav_button {
    width: 28px !important;
    height: 28px !important;
    border-radius: 8px !important;
    border: 1px solid var(--input-border) !important;
    background: var(--input-bg) !important;
    color: var(--foreground) !important;
    box-shadow: var(--pc-clay-btn);
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 0 !important;
  }
  .clinic-rdp .rdp-head_cell {
    font-size: 11px;
    font-weight: 700;
    color: var(--foreground-2);
    text-transform: uppercase;
    padding-bottom: 4px;
    text-align: center;
  }
  .clinic-rdp .rdp-cell {
    padding: 1px;
    text-align: center;
  }
  .clinic-rdp .rdp-day {
    width: 32px !important;
    height: 32px !important;
    color: var(--foreground);
    border-radius: 8px;
    font-size: 0.78rem;
    font-weight: 650;
    margin: 0 auto;
    transition: all 0.12s ease;
  }
  .clinic-rdp .rdp-day_outside {
    color: var(--foreground-3) !important;
    opacity: 0.45 !important;
  }
  .clinic-rdp .rdp-day_today:not(.rdp-day_selected) {
    background: var(--badge-clinic-bg, #e0f2fe) !important;
    border: 1.5px solid var(--accent, #0284c7) !important;
    color: var(--badge-clinic-fg, #0369a1) !important;
    font-weight: 800 !important;
    box-shadow: var(--pc-clay-pale) !important;
  }
  .clinic-rdp .rdp-day_selected:not([disabled]),
  .clinic-rdp .rdp-day_selected:hover:not([disabled]) {
    background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%) !important;
    border: 1px solid #1d4ed8 !important;
    color: #ffffff !important;
    font-weight: 800;
    box-shadow: var(--pc-clay-primary);
  }
  .clinic-rdp .rdp-day_selected * {
    color: #ffffff !important;
  }
  .clinic-rdp .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
    background: var(--card-inner) !important;
  }
`

/**
 * Modern Dribbble-Style DatePicker Popover Button (Replaces ugly browser <input type="date" />)
 */
function ClinicDatePickerButton({
  value,
  onChange,
  ariaLabel = 'Seçili tarih',
}: {
  value: string
  onChange: (nextDate: string) => void
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <style>{CALENDAR_POPOVER_CSS}</style>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        style={{
          ...clayNeutralButton,
          padding: '0 12px',
          minWidth: 148,
          justifyContent: 'space-between',
          border: open ? '1.5px solid #2563eb' : '1px solid var(--input-border)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <CalendarIcon size={15} color="#2563eb" />
          <span style={{ fontWeight: 750, fontSize: 12.5, color: 'var(--foreground)' }}>
            {label(value, { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </span>
        <ChevronDown size={14} color="var(--foreground-2)" />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 100040,
            background: 'var(--card-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: 14,
            padding: 12,
            boxShadow: 'var(--pc-modal-shadow)',
            minWidth: 284,
          }}
        >
          <div className="clinic-rdp">
            <DayPicker
              mode="single"
              locale={tr}
              weekStartsOn={1}
              showOutsideDays
              selected={localDate(value)}
              onSelect={(d) => {
                if (d) {
                  onChange(dateKey(d))
                  setOpen(false)
                }
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 8,
              marginTop: 8,
              borderTop: '1px solid var(--input-border)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                onChange(dateKey(new Date()))
                setOpen(false)
              }}
              style={{
                ...claySecondaryButton,
                minHeight: 30,
                padding: '0 10px',
                fontSize: 11.5,
              }}
            >
              Bugün
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                ...clayNeutralButton,
                minHeight: 30,
                padding: '0 10px',
                fontSize: 11.5,
              }}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Wide, High-Precision (15-min step) Interactive Dual-Thumb 24h Range Slider
 * No dropdown buttons or popup grids — direct smooth dragging & arrow key precision.
 */
function InteractiveTimeRangePicker({
  startTime,
  endTime,
  onChange,
  disabled,
}: {
  startTime: string
  endTime: string
  onChange: (nextStart: string, nextEnd: string) => void
  disabled?: boolean
  compact?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)

  const startStep = timeToSteps(startTime)
  const endStep = timeToSteps(endTime)
  const isOvernight = endTime !== '24:00' && endStep <= startStep

  const durationHours = useMemo(() => {
    let diff = endStep - startStep
    if (diff <= 0) diff += 96
    return Math.round((diff / 4) * 100) / 100
  }, [startStep, endStep])

  useEffect(() => {
    if (!dragging || disabled) return
    const handleMove = (clientX: number) => {
      if (!trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const step = Math.round(ratio * 96)
      if (dragging === 'start') {
        const clampedStep = Math.min(95, Math.max(0, step))
        onChange(stepsToTime(clampedStep), endTime)
      } else {
        const clampedStep = Math.min(96, Math.max(1, step))
        onChange(startTime, stepsToTime(clampedStep))
      }
    }
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX)
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) handleMove(e.touches[0].clientX)
    }
    const onUp = () => setDragging(null)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging, disabled, startTime, endTime, onChange])

  const startPct = (startStep / 96) * 100
  const endPct = (endStep / 96) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', minWidth: 280 }}>
      {/* Live Time Summary Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 8,
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              boxShadow: 'var(--pc-neo-inset)',
              fontSize: 12.5,
              fontWeight: 800,
              color: '#1d4ed8',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {startTime} – {endTime}
            {isOvernight ? ' (Gece)' : ''}
          </span>
        </div>

        <span
          style={{
            fontSize: 11.5,
            fontWeight: 800,
            padding: '3px 10px',
            borderRadius: 999,
            background: 'var(--badge-clinic-bg, #e0f2fe)',
            border: '1px solid var(--badge-clinic-border, #bae6fd)',
            color: 'var(--badge-clinic-fg, #1d4ed8)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isOvernight ? `🌙 ${durationHours} saat` : `⏱️ ${durationHours} saat`}
        </span>
      </div>

      {/* Wide High-Precision Slider Track */}
      <div style={{ padding: '6px 10px 2px' }}>
        <div
          ref={trackRef}
          onMouseDown={(e) => {
            if (disabled || !trackRef.current) return
            const rect = trackRef.current.getBoundingClientRect()
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            const clickedStep = Math.round(ratio * 96)
            const distStart = Math.abs(clickedStep - startStep)
            const distEnd = Math.abs(clickedStep - endStep)
            if (distStart <= distEnd) {
              onChange(stepsToTime(Math.min(95, Math.max(0, clickedStep))), endTime)
              setDragging('start')
            } else {
              onChange(startTime, stepsToTime(Math.min(96, Math.max(1, clickedStep))))
              setDragging('end')
            }
          }}
          style={{
            position: 'relative',
            height: 14,
            borderRadius: 999,
            background: 'var(--input-bg)',
            border: '1.5px solid var(--input-border)',
            boxShadow: 'var(--pc-neo-inset)',
            cursor: disabled ? 'default' : 'pointer',
            userSelect: 'none',
          }}
        >
          {/* Subtle Hour Tick Marks inside Track */}
          {Array.from({ length: 23 }, (_, idx) => {
            const pct = ((idx + 1) / 24) * 100
            const isMajor = (idx + 1) % 3 === 0
            return (
              <div
                key={`tick-${idx}`}
                style={{
                  position: 'absolute',
                  left: `${pct}%`,
                  top: isMajor ? 2 : 4,
                  bottom: isMajor ? 2 : 4,
                  width: 1,
                  background: 'var(--input-border)',
                  opacity: isMajor ? 0.65 : 0.35,
                  pointerEvents: 'none',
                }}
              />
            )
          })}

          {!isOvernight ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${startPct}%`,
                width: `${Math.max(1.5, endPct - startPct)}%`,
                borderRadius: 999,
                background: 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)',
              }}
            />
          ) : (
            <>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${startPct}%`,
                  right: 0,
                  borderRadius: '999px 0 0 999px',
                  background: 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${endPct}%`,
                  borderRadius: '0 999px 999px 0',
                  background: 'linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%)',
                }}
              />
            </>
          )}

          {/* Start Thumb */}
          <div
            role="slider"
            aria-label="Başlangıç saati kaydırıcı"
            aria-valuemin={0}
            aria-valuemax={24}
            aria-valuenow={startStep / 4}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (disabled) return
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                onChange(stepsToTime(Math.max(0, startStep - 1)), endTime)
              } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                onChange(stepsToTime(Math.min(95, startStep + 1)), endTime)
              }
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              if (!disabled) setDragging('start')
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
              if (!disabled) setDragging('start')
            }}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${startPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 22,
              height: 22,
              borderRadius: 999,
              background: '#ffffff',
              border: '3.5px solid #1d4ed8',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.32)',
              cursor: disabled ? 'default' : dragging === 'start' ? 'grabbing' : 'grab',
              zIndex: dragging === 'start' ? 4 : 3,
            }}
            title={`Açılış: ${startTime}`}
          />

          {/* End Thumb */}
          <div
            role="slider"
            aria-label="Bitiş saati kaydırıcı"
            aria-valuemin={0}
            aria-valuemax={24}
            aria-valuenow={endStep / 4}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (disabled) return
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                onChange(startTime, stepsToTime(Math.max(1, endStep - 1)))
              } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                onChange(startTime, stepsToTime(Math.min(96, endStep + 1)))
              }
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              if (!disabled) setDragging('end')
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
              if (!disabled) setDragging('end')
            }}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${endPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 22,
              height: 22,
              borderRadius: 999,
              background: '#1d4ed8',
              border: '3px solid #ffffff',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.32)',
              cursor: disabled ? 'default' : dragging === 'end' ? 'grabbing' : 'grab',
              zIndex: dragging === 'end' ? 4 : 3,
            }}
            title={`Kapanış: ${endTime}`}
          />
        </div>

        {/* 24-Hour Scale Labels */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            fontWeight: 750,
            color: 'var(--foreground-3)',
            marginTop: 6,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>00:00</span>
          <span>03:00</span>
          <span>06:00</span>
          <span>09:00</span>
          <span>12:00</span>
          <span>15:00</span>
          <span>18:00</span>
          <span>21:00</span>
          <span>24:00</span>
        </div>
      </div>
    </div>
  )
}

export default function ShiftPlanner({
  users,
  shifts,
  onChanged,
  onOpenLeave,
  permissions,
}: {
  users: Staff[]
  shifts: Shift[]
  onChanged: () => void
  onOpenLeave: (userId: string, date: string) => void
  permissions?: StaffPlannerPermissions
}) {
  const canEditShifts = permissions?.editShifts !== false
  const canManageLeaves = permissions?.manageLeaves !== false
  const canEditClinicHours = permissions?.editClinicWorkingHours !== false

  const [view, setView] = useState<View>('week')
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
  const [editor, setEditor] = useState<{
    userIds: string[]
    date: string
    shift?: Shift
    defaultStartTime?: string
    defaultEndTime?: string
    defaultRepeat?: RepeatMode
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    userId: string
    userName: string
    date: string
    shift?: Shift
  } | null>(null)
  const [lastOperation, setLastOperation] = useState<{ id: string; count: number } | null>(null)
  const [successNotice, setSuccessNotice] = useState('')
  const [undoError, setUndoError] = useState('')
  const [monthFocus, setMonthFocus] = useState(selectedDate)
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [clinicStartTime, setClinicStartTime] = useState('08:00')
  const [clinicEndTime, setClinicEndTime] = useState('20:00')
  const [clinicWorkingDays, setClinicWorkingDays] = useState<number[]>([0, 1, 2, 3, 4, 5])
  const [clinicHoursSaving, setClinicHoursSaving] = useState(false)

  useEffect(() => {
    fetch('/api/dental/working-hours', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.startTime) setClinicStartTime(data.startTime)
        if (data?.endTime) setClinicEndTime(data.endTime)
        if (Array.isArray(data?.workingDays) && data.workingDays.length > 0) {
          setClinicWorkingDays(data.workingDays)
        }
      })
      .catch(() => {})
  }, [])

  const saveClinicWorkingHours = async (overrideStart?: string, overrideEnd?: string) => {
    if (!canEditClinicHours) return
    const nextStart = overrideStart ?? clinicStartTime
    const nextEnd = overrideEnd ?? clinicEndTime
    setClinicHoursSaving(true)
    setUndoError('')
    try {
      const response = await fetch('/api/admin/settings/working-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startTime: nextStart,
          endTime: nextEnd,
          workingDays: clinicWorkingDays,
        }),
      })
      const data = await response.json().catch(() => null)
      const resolved = data?.workingHours || data
      if (!response.ok || !resolved) {
        setUndoError(data?.error || 'Klinik genel mesai saatleri kaydedilemedi.')
        return
      }
      if (resolved.startTime) setClinicStartTime(resolved.startTime)
      if (resolved.endTime) setClinicEndTime(resolved.endTime)
      if (Array.isArray(resolved.workingDays)) setClinicWorkingDays(resolved.workingDays)
      window.dispatchEvent(new CustomEvent('clinicWorkingHoursUpdated', { detail: resolved }))
      setSuccessNotice(
        `Klinik genel mesai saatleri ${resolved.startTime} – ${resolved.endTime}${resolved.isOvernight ? ' (Gece / Ertesi Gün)' : ''} olarak güncellendi. Takvim saat aralığı otomatik eşitlendi.`
      )
    } catch {
      setUndoError('Klinik genel mesai saatleri kaydedilirken bağlantı hatası oluştu.')
    } finally {
      setClinicHoursSaving(false)
    }
  }

  useEffect(() => {
    fetch('/api/shifts/plan/latest', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setLastOperation)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const startDate = view === 'day' ? selectedDate : view === 'week' ? monday(selectedDate) : monthStart(selectedDate)
    const endDate = view === 'day' ? selectedDate : view === 'week' ? addDays(startDate, 6) : monthEnd(selectedDate)
    const loadLeaves = () => {
      fetch(`/api/dental/doctors/leaves?startDate=${startDate}&endDate=${endDate}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setLeaves(Array.isArray(data) ? data : []))
        .catch(() => {})
    }
    loadLeaves()
    window.addEventListener('doctorLeavesUpdated', loadLeaves)
    return () => window.removeEventListener('doctorLeavesUpdated', loadLeaves)
  }, [selectedDate, view, shifts])

  const staff = useMemo(
    () =>
      users
        .filter((person) => person.active !== false)
        .filter((person) => role === 'all' || person.role === role)
        .filter((person) => person.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))),
    [users, role, search]
  )

  const navigate = (direction: number) =>
    setSelectedDate((current) =>
      view === 'day'
        ? addDays(current, direction)
        : view === 'week'
          ? addDays(current, direction * 7)
          : (() => {
              const d = localDate(current)
              const day = d.getDate()
              d.setDate(1)
              d.setMonth(d.getMonth() + direction)
              d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
              return dateKey(d)
            })()
    )

  const displayDate =
    view === 'day'
      ? label(selectedDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${label(monday(selectedDate), { day: 'numeric', month: 'short' })} – ${label(addDays(monday(selectedDate), 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : label(selectedDate, { month: 'long', year: 'numeric' })

  const undo = async () => {
    if (!lastOperation || !canEditShifts) return
    setUndoError('')
    try {
      const response = await fetch(`/api/shifts/plan/${lastOperation.id}/undo`, { method: 'POST', credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return setUndoError(data.error || 'Mesai işlemi geri alınamadı.')
      setLastOperation(null)
      setSuccessNotice('Son mesai işlemi geri alındı.')
      onChanged()
    } catch {
      setUndoError('Bağlantı kurulamadı; geri alma işlemi uygulanmadı.')
    }
  }

  const handleDeleteSingleShift = async (shiftId: string) => {
    if (!canEditShifts) return
    setUndoError('')
    try {
      const res = await fetch(`/api/shifts/${shiftId}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        setUndoError('Mesai silinemedi.')
        return
      }
      setSuccessNotice('Mesai kaydı kaldırıldı.')
      onChanged()
    } catch {
      setUndoError('Mesai silinirken hata oluştu.')
    }
  }

  const handleDeleteLeave = async (leaveId: string) => {
    if (!canManageLeaves || !leaveId) return
    setUndoError('')
    try {
      const res = await fetch(`/api/dental/doctors/leaves/${leaveId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setUndoError(err.error || 'Hekim izni kaldırılamadı.')
        return
      }
      setLeaves((prev) => prev.filter((item) => item.id !== leaveId))
      setSuccessNotice('Hekim izni kaldırıldı ve çalışma saatleri yeniden açıldı.')
      window.dispatchEvent(new CustomEvent('doctorLeavesUpdated'))
      onChanged()
    } catch {
      setUndoError('Hekim izni kaldırılırken bağlantı hatası oluştu.')
    }
  }

  const handleQuickContextApply = async (payload: {
    userId: string
    date: string
    startTime: string
    endTime: string
    shiftType: string
    repeatMode?: 'daily' | 'weekly' | 'monthly'
  }) => {
    if (!canEditShifts) return
    setUndoError('')
    try {
      const mode = payload.repeatMode || 'daily'
      const rangeStart = mode === 'daily' ? payload.date : mode === 'weekly' ? monday(payload.date) : monthStart(payload.date)
      const rangeEnd = mode === 'daily' ? payload.date : mode === 'weekly' ? addDays(monday(payload.date), 6) : monthEnd(payload.date)
      const weekdays = mode === 'daily' ? [(localDate(payload.date).getDay() + 6) % 7] : [0, 1, 2, 3, 4, 5]

      const res = await fetch('/api/shifts/plan/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan: {
            userIds: [payload.userId],
            startDate: rangeStart,
            endDate: rangeEnd,
            weekdays,
            startTime: payload.startTime,
            endTime: payload.endTime,
            shiftType: payload.shiftType,
            overwriteAll: true,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUndoError(data.error || 'Mesai atanamadı.')
        return
      }
      setContextMenu(null)
      if (data.operationId) {
        setLastOperation({ id: data.operationId, count: data.count ?? (data.created || 0) + (data.updated || 0) })
      }
      setSuccessNotice(`${data.count ?? 1} mesai planlandı.`)
      onChanged()
    } catch {
      setUndoError('Mesai kaydedilirken bağlantı hatası oluştu.')
    }
  }

  return (
    <section style={{ ...neoCard, padding: 18 }}>
      {/* Klinik Genel Mesai Barı (Geniş Hassas Slider + Haftanın Günleri + Kaydet) */}
      <div
        style={{
          ...neoSubCard,
          padding: '14px 16px',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                boxShadow: 'var(--pc-clay-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Clock size={18} color="#ffffff" />
            </div>
            <div>
              <strong style={{ fontSize: 13.5, color: 'var(--foreground)', display: 'block' }}>
                Klinik Genel Mesai (Takvim Saat Aralığı & Açık Günler)
              </strong>
              <span style={{ fontSize: 11.5, color: 'var(--foreground-2)' }}>
                İnteraktif takvim saat cetveli ve çalışma günleri bu aralığa göre otomatik ayarlanır.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {DAYS.map((day, idx) => {
                const active = clinicWorkingDays.includes(idx)
                return (
                  <button
                    key={`clinic-day-${day}`}
                    type="button"
                    disabled={!canEditClinicHours || clinicHoursSaving}
                    onClick={() => {
                      setClinicWorkingDays((curr) => {
                        if (curr.includes(idx)) {
                          return curr.length > 1 ? curr.filter((x) => x !== idx) : curr
                        }
                        return [...curr, idx].sort((a, b) => a - b)
                      })
                    }}
                    style={{
                      minHeight: 32,
                      padding: '0 9px',
                      borderRadius: 8,
                      border: active ? '1px solid #1d4ed8' : '1px solid var(--input-border)',
                      background: active ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--input-bg)',
                      color: active ? '#ffffff' : 'var(--foreground)',
                      boxShadow: active ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                      fontSize: 11.5,
                      fontWeight: 750,
                      cursor: !canEditClinicHours || clinicHoursSaving ? 'default' : 'pointer',
                    }}
                  >
                    <span style={{ color: active ? '#ffffff' : 'inherit' }}>{day}</span>
                  </button>
                )
              })}
            </div>

            {canEditClinicHours && (
              <button
                type="button"
                disabled={clinicHoursSaving}
                onClick={() => saveClinicWorkingHours()}
                className="btn-clinic-primary"
                style={{ ...clayPrimaryButton, minHeight: 34 }}
              >
                <span style={{ color: '#ffffff' }}>{clinicHoursSaving ? 'Kaydediliyor…' : 'Kaydet'}</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ width: '100%' }}>
          <InteractiveTimeRangePicker
            startTime={clinicStartTime}
            endTime={clinicEndTime}
            disabled={!canEditClinicHours || clinicHoursSaving}
            onChange={(nextS, nextE) => {
              setClinicStartTime(nextS)
              setClinicEndTime(nextE)
            }}
          />
        </div>
      </div>

      {/* Üst Navigasyon ve Hızlı Aksiyonlar */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: 3,
              borderRadius: 11,
              background: 'var(--card-inner)',
              border: '1px solid var(--input-border)',
              boxShadow: 'var(--pc-neo-inset)',
              gap: 3,
            }}
          >
            {(
              [
                ['day', 'Günlük'],
                ['week', 'Haftalık'],
                ['month', 'Aylık'],
              ] as [View, string][]
            ).map(([item, text]) => {
              const active = view === item
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setView(item)}
                  aria-pressed={active}
                  style={{
                    minHeight: 34,
                    padding: '0 13px',
                    borderRadius: 8,
                    border: active ? '1px solid #1d4ed8' : '1px solid transparent',
                    background: active ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'transparent',
                    color: active ? '#ffffff' : 'var(--foreground-2)',
                    boxShadow: active ? 'var(--pc-clay-primary)' : 'none',
                    fontWeight: 750,
                    fontSize: 12.5,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ color: active ? '#ffffff' : 'inherit' }}>{text}</span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={`Önceki ${view === 'day' ? 'gün' : view === 'week' ? 'hafta' : 'ay'}`}
            style={clayNeutralButton}
          >
            <ChevronLeft size={17} />
          </button>

          <strong style={{ minWidth: 165, textAlign: 'center', color: 'var(--foreground)', fontSize: 13.5 }}>{displayDate}</strong>

          {/* Özel Tasarım DatePicker Popover */}
          <ClinicDatePickerButton
            value={selectedDate}
            onChange={(nextDate) => {
              setSelectedDate(nextDate)
              setMonthFocus(nextDate)
            }}
          />

          <button
            type="button"
            onClick={() => navigate(1)}
            aria-label={`Sonraki ${view === 'day' ? 'gün' : view === 'week' ? 'hafta' : 'ay'}`}
            style={clayNeutralButton}
          >
            <ChevronRight size={17} />
          </button>
          <button type="button" onClick={() => setSelectedDate(dateKey(new Date()))} style={claySecondaryButton}>
            Bugün
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {lastOperation && canEditShifts && (
            <button type="button" onClick={undo} style={claySecondaryButton}>
              <RotateCcw size={15} /> Son İşlemi Geri Al ({lastOperation.count})
            </button>
          )}
          {canManageLeaves && (
            <button type="button" onClick={() => onOpenLeave('', selectedDate)} style={clayNeutralButton}>
              <CalendarOff size={15} /> İzin / Kapalı Saat
            </button>
          )}
          {canEditShifts && (
            <button
              type="button"
              onClick={() =>
                setEditor({
                  userIds: staff[0] ? [staff[0].id] : [],
                  date: selectedDate,
                  defaultStartTime: clinicStartTime,
                  defaultEndTime: clinicEndTime === '24:00' ? '20:00' : clinicEndTime,
                  defaultRepeat: view === 'month' ? 'month' : view === 'week' ? 'week' : 'once',
                })
              }
              className="btn-clinic-primary"
              style={clayPrimaryButton}
            >
              <Plus size={16} color="#ffffff" />
              <span style={{ color: '#ffffff' }}>Mesai Planla</span>
            </button>
          )}
        </div>
      </div>

      {/* Arama ve Rol Filtresi */}
      <div
        style={{
          ...neoSubCard,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          padding: 10,
          marginBottom: 14,
          alignItems: 'center',
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: '1 1 220px',
            minHeight: 38,
            padding: '0 10px',
            border: '1px solid var(--input-border)',
            borderRadius: 10,
            background: 'var(--input-bg)',
            boxShadow: 'var(--pc-neo-inset)',
          }}
        >
          <Search size={15} color="var(--foreground-2)" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Personel ara..."
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--foreground)', width: '100%', fontSize: 13 }}
          />
        </label>
        <select value={role} onChange={(event) => setRole(event.target.value)} style={{ ...neoInput, width: 'auto', minWidth: 160 }}>
          <option value="all">Tüm Roller</option>
          <option value="hekim">Hekimler</option>
          <option value="host">Kayıt / Resepsiyon</option>
          <option value="yonetici">Yöneticiler</option>
        </select>
        <span style={{ fontSize: 11.5, color: 'var(--foreground-3)', fontWeight: 600 }}>
          💡 Hücreye tıklayarak sağ yan panelden düzenleyebilir, sağ tıklayarak hızlıca <strong>Günlük / Haftalık / Aylık</strong> atayabilirsiniz.
        </span>
      </div>

      {(successNotice || undoError) && (
        <div
          role="status"
          style={{
            ...neoSubCard,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            marginBottom: 14,
            color: undoError ? 'var(--danger)' : 'var(--foreground)',
            fontSize: 13,
            fontWeight: 650,
          }}
        >
          <span>{undoError || successNotice}</span>
          {lastOperation && !undoError && canEditShifts && (
            <button type="button" onClick={undo} style={claySecondaryButton}>
              <RotateCcw size={14} /> Geri Al
            </button>
          )}
        </div>
      )}

      {view === 'day' && (
        <DayView
          date={selectedDate}
          staff={staff}
          shifts={shifts}
          leaves={leaves}
          canEdit={canEditShifts}
          onDeleteLeave={canManageLeaves ? handleDeleteLeave : undefined}
          onOpenLeave={canManageLeaves ? onOpenLeave : undefined}
          onOpen={(userId, shift) =>
            canEditShifts &&
            setEditor({
              userIds: [userId],
              date: selectedDate,
              shift,
              defaultStartTime: clinicStartTime,
              defaultEndTime: clinicEndTime === '24:00' ? '20:00' : clinicEndTime,
              defaultRepeat: 'once',
            })
          }
          onContextMenu={(e, person, shift) => {
            e.preventDefault()
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              userId: person.id,
              userName: person.name,
              date: selectedDate,
              shift,
            })
          }}
        />
      )}

      {view === 'week' && (
        <WeekView
          date={selectedDate}
          staff={staff}
          shifts={shifts}
          leaves={leaves}
          canEdit={canEditShifts}
          onDeleteLeave={canManageLeaves ? handleDeleteLeave : undefined}
          onOpenLeave={canManageLeaves ? onOpenLeave : undefined}
          onOpen={(userId, day, shift) =>
            canEditShifts &&
            setEditor({
              userIds: [userId],
              date: day,
              shift,
              defaultStartTime: clinicStartTime,
              defaultEndTime: clinicEndTime === '24:00' ? '20:00' : clinicEndTime,
              defaultRepeat: 'once',
            })
          }
          onAssignRepeat={(userId, day, repeatMode) =>
            canEditShifts &&
            setEditor({
              userIds: [userId],
              date: day,
              defaultStartTime: clinicStartTime,
              defaultEndTime: clinicEndTime === '24:00' ? '20:00' : clinicEndTime,
              defaultRepeat: repeatMode,
            })
          }
          onContextMenu={(e, person, day, shift) => {
            e.preventDefault()
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              userId: person.id,
              userName: person.name,
              date: day,
              shift,
            })
          }}
        />
      )}

      {view === 'month' && (
        <MonthView
          date={selectedDate}
          selectedDate={monthFocus}
          staff={staff}
          shifts={shifts.filter((item) => staff.some((person) => person.id === item.userId))}
          leaves={leaves}
          canEdit={canEditShifts}
          onDeleteLeave={canManageLeaves ? handleDeleteLeave : undefined}
          onOpenLeave={canManageLeaves ? onOpenLeave : undefined}
          onSelect={setMonthFocus}
          onOpen={(userId, day, shift) =>
            canEditShifts &&
            setEditor({
              userIds: userId ? [userId] : staff[0] ? [staff[0].id] : [],
              date: day,
              shift,
              defaultStartTime: clinicStartTime,
              defaultEndTime: clinicEndTime === '24:00' ? '20:00' : clinicEndTime,
              defaultRepeat: userId ? 'once' : 'month',
            })
          }
          onContextMenu={(e, person, day, shift) => {
            e.preventDefault()
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              userId: person.id,
              userName: person.name,
              date: day,
              shift,
            })
          }}
        />
      )}

      {/* Sağ Tık Hızlı Menü */}
      {contextMenu && (
        <ShiftContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          doctorId={contextMenu.userId}
          doctorName={contextMenu.userName}
          date={contextMenu.date}
          initialStartTime={contextMenu.shift?.startTime || clinicStartTime}
          initialEndTime={contextMenu.shift?.endTime || (clinicEndTime === '24:00' ? '20:00' : clinicEndTime)}
          existingShiftId={contextMenu.shift?.id}
          onClose={() => setContextMenu(null)}
          onSave={canEditShifts ? handleQuickContextApply : undefined}
          onDeleteShift={canEditShifts ? handleDeleteSingleShift : undefined}
          onOpenEditModal={
            canEditShifts
              ? () =>
                  setEditor({
                    userIds: [contextMenu.userId],
                    date: contextMenu.date,
                    shift: contextMenu.shift,
                    defaultStartTime: clinicStartTime,
                    defaultEndTime: clinicEndTime === '24:00' ? '20:00' : clinicEndTime,
                    defaultRepeat: 'once',
                  })
              : undefined
          }
          onOpenLeaveModal={canManageLeaves ? (docId, dt) => onOpenLeave(docId, dt) : undefined}
        />
      )}

      {/* Mesai Planla Sağ Sidebar (Drawer) Akışı */}
      {editor && (
        <ShiftEditorSidebar
          users={staff}
          initial={editor}
          onClose={() => setEditor(null)}
          onDeleteShift={
            editor.shift
              ? async (id) => {
                  await handleDeleteSingleShift(id)
                  setEditor(null)
                }
              : undefined
          }
          onSaved={(operation) => {
            setEditor(null)
            setLastOperation(operation)
            setSuccessNotice(`${operation.count} mesai kaydedildi.`)
            onChanged()
          }}
        />
      )}
    </section>
  )
}

function DayView({
  date,
  staff,
  shifts,
  leaves,
  canEdit,
  onDeleteLeave,
  onOpenLeave,
  onOpen,
  onContextMenu,
}: {
  date: string
  staff: Staff[]
  shifts: Shift[]
  leaves: Leave[]
  canEdit: boolean
  onDeleteLeave?: (leaveId: string) => void
  onOpenLeave?: (userId: string, date: string) => void
  onOpen: (userId: string, shift?: Shift) => void
  onContextMenu: (e: React.MouseEvent, person: Staff, shift?: Shift) => void
}) {
  const byUser = new Map(shifts.filter((item) => item.date === date).map((item) => [item.userId, item]))
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {staff.map((person) => {
        const shift = byUser.get(person.id)
        const leave = leaves.find((item) => item.doctorId === person.id && item.date === date)
        return (
          <button
            key={person.id}
            type="button"
            onClick={() => {
              if (leave) {
                onOpenLeave?.(person.id, date)
              } else if (canEdit) {
                onOpen(person.id, shift)
              }
            }}
            onContextMenu={(e) => onContextMenu(e, person, shift)}
            style={{
              ...neoSubCard,
              background: shift ? 'var(--card-inner)' : 'var(--input-bg)',
              minHeight: 54,
              padding: '10px 14px',
              cursor: (leave && onOpenLeave) || (!leave && canEdit) ? 'pointer' : 'default',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: 'var(--foreground)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}>
              <span style={{ width: 10, height: 10, background: person.color || '#2563eb', borderRadius: 999 }} />
              {person.name}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: shift ? 'var(--badge-clinic-bg, #e0f2fe)' : 'var(--card-bg)',
                  border: shift ? '1px solid var(--badge-clinic-border, #bae6fd)' : '1px solid var(--input-border)',
                  color: shift ? 'var(--badge-clinic-fg, #0369a1)' : leave ? 'var(--danger)' : 'var(--foreground-3)',
                  boxShadow: shift ? 'var(--pc-clay-pale)' : 'none',
                  fontWeight: shift || leave ? 750 : 600,
                  fontSize: 12.5,
                }}
              >
                {shift
                  ? `${shift.startTime} – ${shift.endTime}`
                  : leave
                    ? `İzinli (${leave.isFullDay ? 'Tüm Gün' : `${leave.startTime}–${leave.endTime}`})${leave.reason ? ` · ${leave.reason}` : ''}`
                    : '+ Mesai Ekle'}
              </span>
              {leave && onDeleteLeave && leave.id && (
                <span
                  role="button"
                  tabIndex={0}
                  title="Hekim iznini kaldır"
                  aria-label="Hekim iznini kaldır"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteLeave(leave.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      onDeleteLeave(leave.id)
                    }
                  }}
                  style={{
                    padding: '4px 9px',
                    borderRadius: 7,
                    border: '1px solid var(--danger, #ef4444)',
                    background: 'var(--card-bg)',
                    color: 'var(--danger, #ef4444)',
                    boxShadow: 'var(--pc-clay-btn)',
                    fontSize: 11.5,
                    fontWeight: 750,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Trash2 size={12} />
                  <span>İzni Kaldır</span>
                </span>
              )}
            </span>
          </button>
        )
      })}
      {staff.length === 0 && <Empty />}
    </div>
  )
}

function WeekView({
  date,
  staff,
  shifts,
  leaves,
  canEdit,
  onDeleteLeave,
  onOpenLeave,
  onOpen,
  onAssignRepeat,
  onContextMenu,
}: {
  date: string
  staff: Staff[]
  shifts: Shift[]
  leaves: Leave[]
  canEdit: boolean
  onDeleteLeave?: (leaveId: string) => void
  onOpenLeave?: (userId: string, date: string) => void
  onOpen: (userId: string, date: string, shift?: Shift) => void
  onAssignRepeat: (userId: string, date: string, repeatMode: RepeatMode) => void
  onContextMenu: (e: React.MouseEvent, person: Staff, date: string, shift?: Shift) => void
}) {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(monday(date), index))
  const compact = useCompactLayout()
  const [dayIndex, setDayIndex] = useState(0)
  useEffect(() => setDayIndex(0), [date])

  const totalHours = (userId: string) =>
    Math.round(
      (shifts
        .filter((item) => item.userId === userId && dates.includes(item.date))
        .reduce((total, item) => {
          const [startHour, startMinute] = item.startTime.split(':').map(Number)
          const [endHour, endMinute] = item.endTime.split(':').map(Number)
          const startTotal = startHour * 60 + startMinute
          let endTotal = endHour * 60 + endMinute
          if (endTotal <= startTotal) endTotal += 1440
          return total + Math.max(0, endTotal - startTotal)
        }, 0) /
        60) *
        10
    ) / 10

  if (compact) {
    const activeDate = dates[dayIndex]
    return (
      <div>
        <div role="tablist" aria-label="Haftanın günleri" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(44px, 1fr))', gap: 5, overflowX: 'auto', marginBottom: 10 }}>
          {dates.map((day, index) => (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={dayIndex === index}
              onClick={() => setDayIndex(index)}
              style={{
                ...clayNeutralButton,
                minHeight: 48,
                padding: 4,
                border: dayIndex === index ? '1px solid #1d4ed8' : '1px solid var(--input-border)',
                background: dayIndex === index ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--input-bg)',
                color: dayIndex === index ? '#ffffff' : 'var(--foreground)',
              }}
            >
              <span style={{ color: dayIndex === index ? '#ffffff' : 'inherit' }}>
                {DAYS[index]}
                <br />
                <small>{localDate(day).getDate()}</small>
              </span>
            </button>
          ))}
        </div>
        <strong style={{ display: 'block', margin: '10px 0', color: 'var(--foreground)' }}>
          {label(activeDate, { weekday: 'long', day: 'numeric', month: 'long' })}
        </strong>
        <div style={{ display: 'grid', gap: 7 }}>
          {staff.map((person) => {
            const shift = shifts.find((item) => item.userId === person.id && item.date === activeDate)
            const leave = leaves.find((item) => item.doctorId === person.id && item.date === activeDate)
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => {
                  if (leave) {
                    onOpenLeave?.(person.id, activeDate)
                  } else if (canEdit) {
                    onOpen(person.id, activeDate, shift)
                  }
                }}
                onContextMenu={(e) => onContextMenu(e, person, activeDate, shift)}
                style={{
                  ...neoSubCard,
                  minHeight: 54,
                  padding: '8px 12px',
                  background: shift ? 'var(--card-inner)' : 'var(--input-bg)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  color: 'var(--foreground)',
                  cursor: (leave && onOpenLeave) || (!leave && canEdit) ? 'pointer' : 'default',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 700 }}>{person.name}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: shift ? '#2563eb' : leave ? 'var(--danger)' : 'var(--foreground-3)', fontWeight: 700 }}>
                    {shift ? `${shift.startTime}–${shift.endTime}` : leave ? 'İzinli' : '+ Mesai'}
                  </span>
                  {leave && onDeleteLeave && leave.id && (
                    <span
                      role="button"
                      tabIndex={0}
                      title="İzni kaldır"
                      aria-label="İzni kaldır"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteLeave(leave.id)
                      }}
                      style={{
                        padding: '3px 7px',
                        borderRadius: 6,
                        border: '1px solid var(--danger, #ef4444)',
                        background: 'var(--card-bg)',
                        color: 'var(--danger, #ef4444)',
                        fontSize: 11,
                        fontWeight: 750,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <X size={11} /> Kaldır
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
        {staff.length === 0 && <Empty />}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(205px, 1.4fr) repeat(7, minmax(112px, 1fr))',
          minWidth: 980,
          gap: 1,
          background: 'var(--input-border)',
          border: '1px solid var(--input-border)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: 'var(--pc-neo-subcard)',
        }}
      >
        <div style={{ padding: '10px 14px', background: 'var(--card-inner)', fontWeight: 800, fontSize: 12.5, color: 'var(--foreground)' }}>
          Personel & Tekrarlı Plan
        </div>
        {dates.map((day, index) => (
          <div key={day} style={{ padding: '8px 6px', background: 'var(--card-inner)', textAlign: 'center', fontWeight: 750, fontSize: 12.5, color: 'var(--foreground)' }}>
            {DAYS[index]}
            <br />
            <small style={{ color: 'var(--foreground-2)', fontWeight: 600 }}>{label(day, { day: 'numeric', month: 'short' })}</small>
          </div>
        ))}
        {staff.map((person) => {
          const plannedHours = totalHours(person.id)
          return (
            <Fragment key={person.id}>
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--card-bg)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  gap: 7,
                  color: 'var(--foreground)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 750, fontSize: 13 }}>
                    <span style={{ width: 9, height: 9, background: person.color || '#2563eb', borderRadius: 999, flexShrink: 0 }} />
                    {person.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 750,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: plannedHours > 0 ? 'var(--badge-clinic-bg, #e0f2fe)' : 'var(--card-inner)',
                      border: plannedHours > 0 ? '1px solid var(--badge-clinic-border, #bae6fd)' : '1px solid var(--input-border)',
                      color: plannedHours > 0 ? 'var(--badge-clinic-fg, #0369a1)' : 'var(--foreground-3)',
                    }}
                  >
                    {plannedHours} sa
                  </span>
                </div>

                {canEdit && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%' }}>
                    <button
                      type="button"
                      onClick={() => onAssignRepeat(person.id, date, 'week')}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 7,
                        border: '1px solid var(--btn-clinic-blue-border, #93c5fd)',
                        background: 'var(--btn-clinic-blue-bg, #eff6ff)',
                        color: 'var(--btn-clinic-blue-fg, #1d4ed8)',
                        boxShadow: 'var(--pc-clay-btn)',
                        fontSize: 11,
                        fontWeight: 750,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}
                      title="Bu personele haftalık tekrarlı mesai planla"
                    >
                      <Repeat size={11} color="#1d4ed8" />
                      <span>Haftalık</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAssignRepeat(person.id, date, 'month')}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 7,
                        border: '1px solid var(--btn-clinic-blue-border, #93c5fd)',
                        background: 'var(--btn-clinic-blue-bg, #eff6ff)',
                        color: 'var(--btn-clinic-blue-fg, #1d4ed8)',
                        boxShadow: 'var(--pc-clay-btn)',
                        fontSize: 11,
                        fontWeight: 750,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}
                      title="Bu personele aylık tekrarlı mesai planla"
                    >
                      <Repeat size={11} color="#1d4ed8" />
                      <span>Aylık</span>
                    </button>
                  </div>
                )}
              </div>

              {dates.map((day) => {
                const shift = shifts.find((item) => item.userId === person.id && item.date === day)
                const leave = leaves.find((item) => item.doctorId === person.id && item.date === day)
                return (
                  <button
                    key={`${person.id}-${day}`}
                    type="button"
                    onClick={() => {
                      if (leave) {
                        onOpenLeave?.(person.id, day)
                      } else if (canEdit) {
                        onOpen(person.id, day, shift)
                      }
                    }}
                    onContextMenu={(e) => onContextMenu(e, person, day, shift)}
                    style={{
                      minHeight: 68,
                      padding: 6,
                      background: shift ? 'var(--card-inner)' : 'var(--input-bg)',
                      border: 'none',
                      color: shift ? 'var(--foreground)' : leave ? 'var(--danger)' : 'var(--foreground-3)',
                      cursor: (leave && onOpenLeave) || (!leave && canEdit) ? 'pointer' : 'default',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                    }}
                  >
                    {shift ? (
                      <div
                        style={{
                          padding: '5px 8px',
                          borderRadius: 8,
                          background: 'var(--badge-clinic-bg, #e0f2fe)',
                          border: '1px solid var(--badge-clinic-border, #bae6fd)',
                          color: 'var(--badge-clinic-fg, #0369a1)',
                          boxShadow: 'var(--pc-clay-pale)',
                          fontWeight: 750,
                          fontSize: 11.5,
                          lineHeight: 1.25,
                        }}
                      >
                        {shift.startTime}–{shift.endTime}
                      </div>
                    ) : leave ? (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 7px',
                          borderRadius: 7,
                          background: 'var(--card-bg)',
                          border: '1px solid var(--danger, #ef4444)',
                          color: 'var(--danger, #ef4444)',
                          fontSize: 11,
                          fontWeight: 750,
                        }}
                      >
                        <span>İzinli</span>
                        {onDeleteLeave && leave.id && (
                          <span
                            role="button"
                            tabIndex={0}
                            title="İzni kaldır"
                            aria-label="İzni kaldır"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteLeave(leave.id)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                e.stopPropagation()
                                onDeleteLeave(leave.id)
                              }
                            }}
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 4,
                              background: 'var(--input-bg)',
                              border: '1px solid var(--danger, #ef4444)',
                              color: 'var(--danger, #ef4444)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            <X size={11} />
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11.5, fontWeight: 600 }}>+ Mesai</span>
                    )}
                  </button>
                )
              })}
            </Fragment>
          )
        })}
      </div>
      {staff.length === 0 && <Empty />}
    </div>
  )
}

function MonthView({
  date,
  selectedDate,
  staff,
  shifts,
  leaves = [],
  canEdit,
  onDeleteLeave,
  onOpenLeave,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  date: string
  selectedDate: string
  staff: Staff[]
  shifts: Shift[]
  leaves?: Leave[]
  canEdit: boolean
  onDeleteLeave?: (leaveId: string) => void
  onOpenLeave?: (userId: string, date: string) => void
  onSelect: (date: string) => void
  onOpen: (userId: string, date: string, shift?: Shift) => void
  onContextMenu: (e: React.MouseEvent, person: Staff, date: string, shift?: Shift) => void
}) {
  const month = localDate(date)
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  const start = addDays(dateKey(first), -((first.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index))
  const focusedShifts = shifts.filter((item) => item.date === selectedDate)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {DAYS.map((day) => (
          <strong key={day} style={{ textAlign: 'center', color: 'var(--foreground-2)', fontSize: 12.5 }}>
            {day}
          </strong>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
        {days.map((day) => {
          const rows = shifts.filter((item) => item.date === day)
          const inMonth = localDate(day).getMonth() === month.getMonth()
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-pressed={selectedDate === day}
              style={{
                ...neoSubCard,
                minHeight: 88,
                padding: 8,
                background: selectedDate === day ? 'var(--card-inner)' : inMonth ? 'var(--card-bg)' : 'var(--input-bg)',
                border: selectedDate === day ? '1.5px solid #1d4ed8' : '1px solid var(--input-border)',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--foreground)',
              }}
            >
              <strong style={{ fontSize: 12.5 }}>{localDate(day).getDate()}</strong>
              <div style={{ marginTop: 6, color: rows.length ? '#2563eb' : 'var(--foreground-3)', fontSize: 11.5, fontWeight: 700 }}>
                {rows.length ? `${rows.length} personel` : 'Mesai yok'}
              </div>
              {rows.slice(0, 2).map((item) => (
                <div key={item.id} style={{ fontSize: 10.5, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--foreground-2)' }}>
                  {item.userName.split(' ')[0]} · {item.startTime}
                </div>
              ))}
            </button>
          )
        })}
      </div>

      <section style={{ ...neoSubCard, padding: 14, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ fontSize: 13.5, color: 'var(--foreground)' }}>
            {label(selectedDate, { day: 'numeric', month: 'long', weekday: 'long' })}
          </strong>
          {canEdit && (
            <button type="button" onClick={() => onOpen('', selectedDate)} className="btn-clinic-primary" style={clayPrimaryButton}>
              <Plus size={15} color="#ffffff" />
              <span style={{ color: '#ffffff' }}>Bu Aya Planla</span>
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {staff.map((person) => {
            const shift = focusedShifts.find((item) => item.userId === person.id)
            const leave = leaves.find((item) => item.doctorId === person.id && item.date === selectedDate)
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => {
                  if (leave) {
                    onOpenLeave?.(person.id, selectedDate)
                  } else if (canEdit) {
                    onOpen(person.id, selectedDate, shift)
                  }
                }}
                onContextMenu={(e) => onContextMenu(e, person, selectedDate, shift)}
                style={{
                  ...neoSubCard,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minHeight: 44,
                  padding: '8px 12px',
                  background: 'var(--card-bg)',
                  color: 'var(--foreground)',
                  cursor: (leave && onOpenLeave) || (!leave && canEdit) ? 'pointer' : 'default',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 13 }}>{person.name}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: shift ? '#2563eb' : leave ? 'var(--danger)' : 'var(--foreground-3)', fontWeight: 700, fontSize: 12.5 }}>
                    {shift
                      ? `${shift.startTime}–${shift.endTime}`
                      : leave
                        ? `İzinli (${leave.isFullDay ? 'Tüm Gün' : `${leave.startTime}–${leave.endTime}`})`
                        : '+ Mesai Ekle'}
                  </span>
                  {leave && onDeleteLeave && leave.id && (
                    <span
                      role="button"
                      tabIndex={0}
                      title="İzni kaldır"
                      aria-label="İzni kaldır"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteLeave(leave.id)
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--danger, #ef4444)',
                        background: 'var(--input-bg)',
                        color: 'var(--danger, #ef4444)',
                        fontSize: 11,
                        fontWeight: 750,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <Trash2 size={11} /> İzni Kaldır
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
        {staff.length === 0 && <Empty />}
      </section>
    </div>
  )
}

/**
 * Sağdan Açılan Mesai Planla Sidebar (Drawer) Akışı:
 * - Side bar akışı korundu (`aside`, `justifyContent: 'flex-end'`, `width: 480px`, `height: '100vh'`)
 * - Tüm aktif butonlar ve seçili günler tutarlı Koyu Mavi (`#2563eb` -> `#1d4ed8`)
 * - İnteraktif Dual-Handle Saat Slider + Saat Pill Seçici
 * - Özel Tasarım Gömülü Takvim (`DayPicker`) DatePicker
 */
function ShiftEditorSidebar({
  users,
  initial,
  onClose,
  onDeleteShift,
  onSaved,
}: {
  users: Staff[]
  initial: {
    userIds: string[]
    date: string
    shift?: Shift
    defaultStartTime?: string
    defaultEndTime?: string
    defaultRepeat?: RepeatMode
  }
  onClose: () => void
  onDeleteShift?: (shiftId: string) => Promise<void>
  onSaved: (operation: { id: string; count: number }) => void
}) {
  const [userIds, setUserIds] = useState<string[]>(initial.userIds.length > 0 ? initial.userIds : users[0] ? [users[0].id] : [])
  const [startDate, setStartDate] = useState(initial.date)
  const [repeat, setRepeat] = useState<RepeatMode>(initial.defaultRepeat || 'once')
  const [weekdays, setWeekdays] = useState<number[]>(() => {
    if (initial.defaultRepeat === 'week' || initial.defaultRepeat === 'month') {
      return [0, 1, 2, 3, 4, 5] // Pzt-Cmt varsayılan
    }
    return [Math.max(0, (localDate(initial.date).getDay() + 6) % 7)]
  })
  const [startTime, setStartTime] = useState(initial.shift?.startTime || initial.defaultStartTime || '09:00')
  const [endTime, setEndTime] = useState(initial.shift?.endTime || initial.defaultEndTime || '19:00')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [requestId] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`))

  const computedPlan = useMemo(() => {
    const selectedWeekday = weekdays[0] ?? Math.max(0, (localDate(startDate).getDay() + 6) % 7)
    const singleDayDate = addDays(monday(startDate), selectedWeekday)
    const rangeStart = repeat === 'once' ? singleDayDate : repeat === 'week' ? monday(startDate) : monthStart(startDate)
    const rangeEnd = repeat === 'once' ? singleDayDate : repeat === 'week' ? addDays(monday(startDate), 6) : monthEnd(startDate)
    const activeWeekdays = repeat === 'once' ? [selectedWeekday] : weekdays
    return {
      userIds,
      startDate: rangeStart,
      endDate: rangeEnd,
      weekdays: activeWeekdays,
      startTime,
      endTime,
      shiftType: repeat === 'once' ? 'Günlük Mesai' : repeat === 'week' ? 'Haftalık Mesai' : 'Aylık Mesai',
      overwriteAll: true,
    }
  }, [userIds, startDate, repeat, weekdays, startTime, endTime])

  const handleSave = async () => {
    if (userIds.length === 0) {
      setError('Lütfen en az bir personel seçin.')
      return
    }
    if (repeat !== 'once' && weekdays.length === 0) {
      setError('Lütfen en az bir gün seçin.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/shifts/plan/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId, plan: computedPlan }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'Mesailer kaydedilemedi.')
        return
      }
      onSaved({ id: data.operationId, count: data.count ?? (data.created || 0) + (data.updated || 0) })
    } catch {
      setError('Bağlantı kurulamadı. Lütfen tekrar deneyin.')
    } finally {
      setSaving(false)
    }
  }

  const SHIFT_PRESETS: Array<{ label: string; start: string; end: string }> = [
    { label: '09:00 – 18:00', start: '09:00', end: '18:00' },
    { label: '08:00 – 20:00', start: '08:00', end: '20:00' },
    { label: '09:00 – 19:00', start: '09:00', end: '19:00' },
    { label: '08:00 – 02:00 (Gece)', start: '08:00', end: '02:00' },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100020,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <style>{CALENDAR_POPOVER_CSS}</style>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Mesai Planla"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card-bg)',
          borderLeft: '1px solid var(--input-border)',
          boxShadow: 'var(--pc-modal-shadow)',
          color: 'var(--foreground)',
          boxSizing: 'border-box',
        }}
      >
        {/* Sticky Drawer Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--input-border)',
            background: 'var(--card-inner)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                boxShadow: 'var(--pc-clay-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Clock size={18} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.2 }}>
                {initial.shift ? 'Mesai Düzenle' : 'Mesai Planla'}
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--foreground-2)', fontWeight: 550 }}>
                Günlük, haftalık veya aylık tekrarlı vardiya atayın
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--foreground-2)',
              boxShadow: 'var(--pc-clay-btn)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Drawer Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* 1. Personel Seçimi */}
          <div style={{ ...neoSubCard, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 750, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={15} color="#2563eb" /> Personel ({userIds.length} seçili)
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setUserIds(users.filter((u) => u.role === 'hekim').map((u) => u.id))}
                  style={{ ...claySecondaryButton, minHeight: 28, padding: '0 9px', fontSize: 11 }}
                >
                  Hekimler
                </button>
                <button
                  type="button"
                  onClick={() => setUserIds(userIds.length === users.length ? [] : users.map((u) => u.id))}
                  style={{ ...claySecondaryButton, minHeight: 28, padding: '0 9px', fontSize: 11 }}
                >
                  {userIds.length === users.length ? 'Temizle' : 'Tümü'}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, maxHeight: 148, overflowY: 'auto' }}>
              {users.map((person) => {
                const selected = userIds.includes(person.id)
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() =>
                      setUserIds((curr) => (curr.includes(person.id) ? curr.filter((id) => id !== person.id) : [...curr, person.id]))
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: selected ? '1.5px solid #1d4ed8' : '1px solid var(--input-border)',
                      background: selected ? 'var(--card-bg)' : 'var(--input-bg)',
                      boxShadow: selected ? 'var(--pc-clay-pale)' : 'none',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 12.5, fontWeight: 700 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: person.color || '#2563eb', flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.name}</span>
                    </span>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        background: selected ? '#1d4ed8' : 'var(--card-inner)',
                        border: selected ? '1px solid #1d4ed8' : '1px solid var(--input-border)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {selected && <Check size={12} color="#ffffff" strokeWidth={3} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Çalışma Saat Aralığı (Geniş Hassas Slider) */}
          <div style={{ ...neoSubCard, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 750, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={15} color="#2563eb" /> Çalışma Saat Aralığı
              </span>
              <span style={{ fontSize: 11, color: 'var(--foreground-2)', fontWeight: 650 }}>
                15 dk hassasiyetle kaydırarak ayarlayın
              </span>
            </div>

            <InteractiveTimeRangePicker
              startTime={startTime}
              endTime={endTime}
              onChange={(nextS, nextE) => {
                setStartTime(nextS)
                setEndTime(nextE)
              }}
            />
          </div>

          {/* 3. Planlama Dönemi & Haftanın Günleri */}
          <div style={{ ...neoSubCard, padding: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 750, color: 'var(--foreground)', marginBottom: 10 }}>
              Planlama Dönemi (Tekrarlı Vardiya)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
              {(
                [
                  ['once', 'Günlük (Tek Gün)'],
                  ['week', 'Haftalık Plan'],
                  ['month', 'Aylık Plan'],
                ] as [RepeatMode, string][]
              ).map(([val, txt]) => {
                const active = repeat === val
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setRepeat(val)
                      if (val === 'once') {
                        setWeekdays((curr) => [curr[0] ?? Math.max(0, (localDate(startDate).getDay() + 6) % 7)])
                      } else if (weekdays.length <= 1) {
                        setWeekdays([0, 1, 2, 3, 4, 5])
                      }
                    }}
                    style={{
                      minHeight: 36,
                      padding: '0 8px',
                      borderRadius: 9,
                      border: active ? '1px solid #1d4ed8' : '1px solid var(--input-border)',
                      background: active ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--input-bg)',
                      color: active ? '#ffffff' : 'var(--foreground)',
                      boxShadow: active ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                      fontSize: 11.5,
                      fontWeight: 750,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ color: active ? '#ffffff' : 'inherit' }}>{txt}</span>
                  </button>
                )
              })}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 750, color: 'var(--foreground-2)' }}>
                  Haftanın Günleri ({label(monday(startDate), { day: 'numeric', month: 'short' })} – {label(addDays(monday(startDate), 6), { day: 'numeric', month: 'short' })})
                </span>
                {repeat !== 'once' && (
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button
                      type="button"
                      onClick={() => setWeekdays([0, 1, 2, 3, 4])}
                      style={{ ...claySecondaryButton, minHeight: 26, padding: '0 8px', fontSize: 11 }}
                    >
                      Hafta İçi
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}
                      style={{ ...claySecondaryButton, minHeight: 26, padding: '0 8px', fontSize: 11 }}
                    >
                      Her Gün
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
                {DAYS.map((day, idx) => {
                  const active = weekdays.includes(idx)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        if (repeat === 'once') {
                          setWeekdays([idx])
                        } else {
                          setWeekdays((curr) => (curr.includes(idx) ? curr.filter((x) => x !== idx) : [...curr, idx]))
                        }
                      }}
                      style={{
                        minHeight: 36,
                        borderRadius: 8,
                        border: active ? '1px solid #1d4ed8' : '1px solid var(--input-border)',
                        background: active ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--input-bg)',
                        color: active ? '#ffffff' : 'var(--foreground)',
                        boxShadow: active ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                        fontSize: 11.5,
                        fontWeight: 750,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ color: active ? '#ffffff' : 'inherit' }}>{day}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--card-inner)',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Sticky Drawer Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--input-border)',
            background: 'var(--card-inner)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {initial.shift && onDeleteShift ? (
            <button
              type="button"
              onClick={() => onDeleteShift(initial.shift!.id)}
              style={{
                ...clayNeutralButton,
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
              }}
            >
              <Trash2 size={14} /> Mesaiyi Sil
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} disabled={saving} style={clayNeutralButton}>
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-clinic-primary"
              style={clayPrimaryButton}
            >
              <span style={{ color: '#ffffff' }}>
                {saving ? 'Kaydediliyor…' : repeat === 'once' ? 'Mesaiyi Kaydet' : repeat === 'week' ? 'Haftalık Planı Kaydet' : 'Aylık Planı Kaydet'}
              </span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

const Empty = () => (
  <div style={{ padding: 24, color: 'var(--foreground-3)', textAlign: 'center' }}>
    <Users size={22} style={{ marginBottom: 6 }} />
    <br />
    Gösterilecek aktif personel yok.
  </div>
)
