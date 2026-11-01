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
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import ShiftContextMenu from '../../../admin/components/ShiftContextMenu'

export type Staff = { id: string; name: string; role: string; active: boolean; color?: string }
export type Shift = { id: string; userId: string; userName: string; userColor?: string; date: string; startTime: string; endTime: string; shiftType: string }
type Leave = { doctorId: string; date: string; isFullDay: boolean; startTime: string; endTime: string; reason?: string | null }
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
  if (timeStr === '24:00') return 48
  const [h, m] = timeStr.split(':').map(Number)
  return Math.max(0, Math.min(48, (h || 0) * 2 + ((m || 0) >= 30 ? 1 : 0)))
}

const stepsToTime = (steps: number): string => {
  const clamped = Math.max(0, Math.min(48, Math.round(steps)))
  if (clamped === 48) return '24:00'
  const h = Math.floor(clamped / 2)
  const m = clamped % 2 === 1 ? '30' : '00'
  return `${String(h).padStart(2, '0')}:${m}`
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
  .clinic-rdp .rdp {
    --rdp-cell-size: 34px;
    --rdp-accent-color: #1d4ed8;
    --rdp-background-color: var(--card-inner);
    margin: 0;
    color: var(--foreground);
    font-size: 12.5px;
  }
  .clinic-rdp .rdp-months {
    justify-content: center;
  }
  .clinic-rdp .rdp-caption_label {
    font-size: 13.5px;
    font-weight: 800;
    color: var(--foreground);
    text-transform: capitalize;
  }
  .clinic-rdp .rdp-nav_button {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid var(--input-border) !important;
    background: var(--input-bg) !important;
    color: var(--foreground) !important;
  }
  .clinic-rdp .rdp-head_cell {
    font-size: 11px;
    font-weight: 700;
    color: var(--foreground-2);
    text-transform: uppercase;
  }
  .clinic-rdp .rdp-day {
    color: var(--foreground);
    border-radius: 9px;
    font-weight: 650;
    transition: all 0.12s ease;
  }
  .clinic-rdp .rdp-day_today:not(.rdp-day_selected) {
    border: 1.5px solid #2563eb !important;
    color: #2563eb !important;
    font-weight: 800;
  }
  .clinic-rdp .rdp-day_selected:not([disabled]),
  .clinic-rdp .rdp-day_selected:hover:not([disabled]) {
    background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%) !important;
    color: #ffffff !important;
    font-weight: 800;
    box-shadow: var(--pc-clay-primary);
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
            minWidth: 276,
          }}
        >
          <div className="clinic-rdp">
            <DayPicker
              mode="single"
              locale={tr}
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
 * Modern Interactive Dual-Thumb Hour Range Slider + Popover Hour Picker
 * Used in both the Klinik Genel Mesai top bar and the ShiftEditor sidebar.
 */
function InteractiveTimeRangePicker({
  startTime,
  endTime,
  onChange,
  disabled,
  compact = false,
}: {
  startTime: string
  endTime: string
  onChange: (nextStart: string, nextEnd: string) => void
  disabled?: boolean
  compact?: boolean
}) {
  const [openPopover, setOpenPopover] = useState<'start' | 'end' | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)

  const startStep = timeToSteps(startTime)
  const endStep = timeToSteps(endTime)
  const isOvernight = endTime !== '24:00' && endStep <= startStep

  const durationHours = useMemo(() => {
    let diff = endStep - startStep
    if (diff <= 0) diff += 48
    return Math.round((diff / 2) * 10) / 10
  }, [startStep, endStep])

  useEffect(() => {
    if (!openPopover) return
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpenPopover(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [openPopover])

  useEffect(() => {
    if (!dragging || disabled) return
    const handleMove = (clientX: number) => {
      if (!trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const step = Math.round(ratio * 48)
      if (dragging === 'start') {
        const clampedStep = Math.min(47, Math.max(0, step))
        onChange(stepsToTime(clampedStep), endTime)
      } else {
        const clampedStep = Math.min(48, Math.max(1, step))
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

  const startPct = (startStep / 48) * 100
  const endPct = (endStep / 48) * 100

  const HOUR_PILLS_START = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
  const HOUR_PILLS_END = [...Array.from({ length: 23 }, (_, i) => `${String(i + 1).padStart(2, '0')}:00`), '24:00']

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10, width: compact ? 'auto' : '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Start Time Pill */}
        <button
          type="button"
          disabled={disabled}
          aria-label="Klinik açılış saati"
          onClick={() => setOpenPopover((p) => (p === 'start' ? null : 'start'))}
          style={{
            minHeight: 36,
            padding: '0 11px',
            borderRadius: 10,
            border: openPopover === 'start' ? '1.5px solid #2563eb' : '1px solid var(--input-border)',
            background: 'var(--input-bg)',
            color: 'var(--foreground)',
            boxShadow: 'var(--pc-clay-btn)',
            cursor: disabled ? 'default' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            fontWeight: 750,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 650, color: 'var(--foreground-2)' }}>Açılış</span>
          <strong style={{ color: '#2563eb', fontSize: 13 }}>{startTime}</strong>
          <ChevronDown size={13} color="var(--foreground-2)" />
        </button>

        {/* Interactive Visual Slider Track */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            minWidth: compact ? 180 : 210,
            flex: compact ? '0 1 200px' : 1,
            padding: '0 6px',
          }}
        >
          <div
            ref={trackRef}
            onMouseDown={(e) => {
              if (disabled || !trackRef.current) return
              const rect = trackRef.current.getBoundingClientRect()
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
              const clickedStep = Math.round(ratio * 48)
              const distStart = Math.abs(clickedStep - startStep)
              const distEnd = Math.abs(clickedStep - endStep)
              if (distStart <= distEnd) {
                onChange(stepsToTime(Math.min(47, Math.max(0, clickedStep))), endTime)
                setDragging('start')
              } else {
                onChange(startTime, stepsToTime(Math.min(48, Math.max(1, clickedStep))))
                setDragging('end')
              }
            }}
            style={{
              position: 'relative',
              height: 10,
              borderRadius: 999,
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              boxShadow: 'var(--pc-neo-inset)',
              cursor: disabled ? 'default' : 'pointer',
              userSelect: 'none',
            }}
          >
            {!isOvernight ? (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${startPct}%`,
                  width: `${Math.max(2, endPct - startPct)}%`,
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
              aria-valuenow={startStep / 2}
              tabIndex={disabled ? -1 : 0}
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
                width: 18,
                height: 18,
                borderRadius: 999,
                background: '#ffffff',
                border: '3px solid #1d4ed8',
                boxShadow: '0 2px 5px rgba(15, 23, 42, 0.28)',
                cursor: disabled ? 'default' : 'grab',
                zIndex: 2,
              }}
              title={`Başlangıç: ${startTime}`}
            />

            {/* End Thumb */}
            <div
              role="slider"
              aria-label="Bitiş saati kaydırıcı"
              aria-valuemin={0}
              aria-valuemax={24}
              aria-valuenow={endStep / 2}
              tabIndex={disabled ? -1 : 0}
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
                width: 18,
                height: 18,
                borderRadius: 999,
                background: '#1d4ed8',
                border: '2.5px solid #ffffff',
                boxShadow: '0 2px 5px rgba(15, 23, 42, 0.28)',
                cursor: disabled ? 'default' : 'grab',
                zIndex: 2,
              }}
              title={`Bitiş: ${endTime}`}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, color: 'var(--foreground-3)', padding: '0 2px' }}>
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>

        {/* End Time Pill */}
        <button
          type="button"
          disabled={disabled}
          aria-label="Klinik kapanış saati"
          onClick={() => setOpenPopover((p) => (p === 'end' ? null : 'end'))}
          style={{
            minHeight: 36,
            padding: '0 11px',
            borderRadius: 10,
            border: openPopover === 'end' ? '1.5px solid #2563eb' : '1px solid var(--input-border)',
            background: 'var(--input-bg)',
            color: 'var(--foreground)',
            boxShadow: 'var(--pc-clay-btn)',
            cursor: disabled ? 'default' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            fontWeight: 750,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 650, color: 'var(--foreground-2)' }}>Kapanış</span>
          <strong style={{ color: '#2563eb', fontSize: 13 }}>
            {endTime}
            {isOvernight ? ' (Gece)' : ''}
          </strong>
          <ChevronDown size={13} color="var(--foreground-2)" />
        </button>

        {/* Duration Badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 750,
            padding: '4px 9px',
            borderRadius: 999,
            background: 'var(--badge-clinic-bg, #e0f2fe)',
            border: '1px solid var(--badge-clinic-border, #bae6fd)',
            color: 'var(--badge-clinic-fg, #0369a1)',
            whiteSpace: 'nowrap',
          }}
        >
          {isOvernight ? `🌙 ${durationHours} sa` : `⏱️ ${durationHours} sa`}
        </span>
      </div>

      {/* Tactile Hour Grid Popover */}
      {openPopover && !disabled && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 100045,
            width: 310,
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--card-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: 14,
            padding: 14,
            boxShadow: 'var(--pc-modal-shadow)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 12.5, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <SlidersHorizontal size={14} color="#2563eb" />
              {openPopover === 'start' ? 'Başlangıç / Açılış Saati Seçin' : 'Bitiş / Kapanış Saati Seçin'}
            </strong>
            <button
              type="button"
              onClick={() => setOpenPopover(null)}
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                border: '1px solid var(--input-border)',
                background: 'var(--card-inner)',
                color: 'var(--foreground-2)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5, marginBottom: 10 }}>
            {(
              [
                ['08:00', '20:00', '08:00 – 20:00 (Standart)'],
                ['09:00', '19:00', '09:00 – 19:00 (Gündüz)'],
                ['08:00', '02:00', '08:00 – 02:00 (Gece)'],
                ['00:00', '24:00', '00:00 – 24:00 (24 Saat)'],
              ] as [string, string, string][]
            ).map(([pS, pE, pLbl]) => {
              const activePreset = startTime === pS && endTime === pE
              return (
                <button
                  key={pLbl}
                  type="button"
                  onClick={() => {
                    onChange(pS, pE)
                    setOpenPopover(null)
                  }}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: activePreset ? '1px solid #1d4ed8' : '1px solid var(--input-border)',
                    background: activePreset ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--card-inner)',
                    color: activePreset ? '#ffffff' : 'var(--foreground)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ color: activePreset ? '#ffffff' : 'inherit' }}>{pLbl}</span>
                </button>
              )
            })}
          </div>

          {/* 24-Hour Tactile Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, maxHeight: 190, overflowY: 'auto' }}>
            {(openPopover === 'start' ? HOUR_PILLS_START : HOUR_PILLS_END).map((t) => {
              const currentVal = openPopover === 'start' ? startTime : endTime
              const isSelected = currentVal === t
              const halfHour = t !== '24:00' ? `${t.slice(0, 2)}:30` : null
              const isHalfSelected = halfHour && currentVal === halfHour
              return (
                <Fragment key={`grid-${openPopover}-${t}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (openPopover === 'start') {
                        onChange(t, endTime)
                        setOpenPopover('end')
                      } else {
                        onChange(startTime, t)
                        setOpenPopover(null)
                      }
                    }}
                    style={{
                      padding: '6px 4px',
                      borderRadius: 8,
                      border: isSelected ? '1px solid #1d4ed8' : '1px solid var(--input-border)',
                      background: isSelected ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--input-bg)',
                      color: isSelected ? '#ffffff' : 'var(--foreground)',
                      fontSize: 11.5,
                      fontWeight: 750,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ color: isSelected ? '#ffffff' : 'inherit' }}>{t}</span>
                  </button>
                  {halfHour && (
                    <button
                      type="button"
                      onClick={() => {
                        if (openPopover === 'start') {
                          onChange(halfHour, endTime)
                          setOpenPopover('end')
                        } else {
                          onChange(startTime, halfHour)
                          setOpenPopover(null)
                        }
                      }}
                      style={{
                        padding: '6px 4px',
                        borderRadius: 8,
                        border: isHalfSelected ? '1px solid #1d4ed8' : '1px solid var(--input-border)',
                        background: isHalfSelected ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--card-inner)',
                        color: isHalfSelected ? '#ffffff' : 'var(--foreground-2)',
                        fontSize: 11,
                        fontWeight: 650,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ color: isHalfSelected ? '#ffffff' : 'inherit' }}>{halfHour}</span>
                    </button>
                  )}
                </Fragment>
              )
            })}
          </div>
        </div>
      )}
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
  const [clinicHoursSaving, setClinicHoursSaving] = useState(false)

  useEffect(() => {
    fetch('/api/dental/working-hours', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.startTime) setClinicStartTime(data.startTime)
        if (data?.endTime) setClinicEndTime(data.endTime)
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
        body: JSON.stringify({ startTime: nextStart, endTime: nextEnd }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) {
        setUndoError(data?.error || 'Klinik genel mesai saatleri kaydedilemedi.')
        return
      }
      setClinicStartTime(data.startTime)
      setClinicEndTime(data.endTime)
      window.dispatchEvent(new CustomEvent('clinicWorkingHoursUpdated', { detail: data }))
      setSuccessNotice(
        `Klinik genel mesai saatleri ${data.startTime} – ${data.endTime}${data.isOvernight ? ' (Gece / Ertesi Gün)' : ''} olarak güncellendi. Takvim saat aralığı otomatik eşitlendi.`
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
    fetch(`/api/dental/doctors/leaves?startDate=${startDate}&endDate=${endDate}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setLeaves)
      .catch(() => {})
  }, [selectedDate, view])

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
      {/* Klinik Genel Mesai Barı (İnteraktif Slider + Saat Seçici + Kaydet) */}
      <div
        style={{
          ...neoSubCard,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
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
              Klinik Genel Mesai (Takvim Saat Aralığı)
            </strong>
            <span style={{ fontSize: 11.5, color: 'var(--foreground-2)' }}>
              İnteraktif takvim saat cetveli bu açılış-kapanış aralığına göre otomatik ayarlanır.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <InteractiveTimeRangePicker
            compact
            startTime={clinicStartTime}
            endTime={clinicEndTime}
            disabled={!canEditClinicHours || clinicHoursSaving}
            onChange={(nextS, nextE) => {
              setClinicStartTime(nextS)
              setClinicEndTime(nextE)
            }}
          />

          {canEditClinicHours && (
            <button
              type="button"
              disabled={clinicHoursSaving}
              onClick={() => saveClinicWorkingHours()}
              className="btn-clinic-primary"
              style={{ ...clayPrimaryButton, minHeight: 36 }}
            >
              <span style={{ color: '#ffffff' }}>{clinicHoursSaving ? 'Kaydediliyor…' : 'Kaydet'}</span>
            </button>
          )}
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
          canEdit={canEditShifts}
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
  onOpen,
  onContextMenu,
}: {
  date: string
  staff: Staff[]
  shifts: Shift[]
  leaves: Leave[]
  canEdit: boolean
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
            onClick={() => !leave && canEdit && onOpen(person.id, shift)}
            onContextMenu={(e) => onContextMenu(e, person, shift)}
            style={{
              ...neoSubCard,
              background: shift ? 'var(--card-inner)' : 'var(--input-bg)',
              minHeight: 54,
              padding: '10px 14px',
              cursor: leave || !canEdit ? 'default' : 'pointer',
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
                  ? `İzinli${leave.reason ? ` · ${leave.reason}` : ''}`
                  : '+ Mesai Ekle'}
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
  onOpen,
  onAssignRepeat,
  onContextMenu,
}: {
  date: string
  staff: Staff[]
  shifts: Shift[]
  leaves: Leave[]
  canEdit: boolean
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
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => canEdit && onOpen(person.id, activeDate, shift)}
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
                  cursor: canEdit ? 'pointer' : 'default',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 700 }}>{person.name}</span>
                <span style={{ color: shift ? '#2563eb' : 'var(--foreground-3)', fontWeight: 700 }}>
                  {shift ? `${shift.startTime}–${shift.endTime}` : '+ Mesai'}
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
                    onClick={() => !leave && canEdit && onOpen(person.id, day, shift)}
                    onContextMenu={(e) => onContextMenu(e, person, day, shift)}
                    style={{
                      minHeight: 68,
                      padding: 6,
                      background: shift ? 'var(--card-inner)' : 'var(--input-bg)',
                      border: 'none',
                      color: shift ? 'var(--foreground)' : leave ? 'var(--danger)' : 'var(--foreground-3)',
                      cursor: leave || !canEdit ? 'default' : 'pointer',
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
                      <span style={{ fontSize: 11, fontWeight: 750, color: 'var(--danger)' }}>İzinli</span>
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
  canEdit,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  date: string
  selectedDate: string
  staff: Staff[]
  shifts: Shift[]
  canEdit: boolean
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
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => canEdit && onOpen(person.id, selectedDate, shift)}
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
                  cursor: canEdit ? 'pointer' : 'default',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 13 }}>{person.name}</span>
                <span style={{ color: shift ? '#2563eb' : 'var(--foreground-3)', fontWeight: 700, fontSize: 12.5 }}>
                  {shift ? `${shift.startTime}–${shift.endTime}` : '+ Mesai Ekle'}
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
    const rangeStart = repeat === 'once' ? startDate : repeat === 'week' ? monday(startDate) : monthStart(startDate)
    const rangeEnd = repeat === 'once' ? startDate : repeat === 'week' ? addDays(monday(startDate), 6) : monthEnd(startDate)
    const activeWeekdays = repeat === 'once' ? [(localDate(startDate).getDay() + 6) % 7] : weekdays
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

          {/* 2. Çalışma Saat Aralığı (Slider HourPicker + Hızlı Saat Blokları) */}
          <div style={{ ...neoSubCard, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 750, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={15} color="#2563eb" /> Çalışma Saat Aralığı
              </span>
              <span style={{ fontSize: 11, color: 'var(--foreground-2)', fontWeight: 650 }}>
                Kaydırarak veya saate tıklayarak seçin
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

            {/* Quick Shift Hour Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginTop: 12 }}>
              {SHIFT_PRESETS.map((preset) => {
                const isActive = startTime === preset.start && endTime === preset.end
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setStartTime(preset.start)
                      setEndTime(preset.end)
                    }}
                    style={{
                      padding: '6px 6px',
                      borderRadius: 8,
                      border: isActive ? '1px solid #1d4ed8' : '1px solid var(--btn-clinic-blue-border, #93c5fd)',
                      background: isActive ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--btn-clinic-blue-bg, #ffffff)',
                      color: isActive ? '#ffffff' : 'var(--btn-clinic-blue-fg, #1d4ed8)',
                      boxShadow: isActive ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                      fontSize: 10.5,
                      fontWeight: 750,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ color: isActive ? '#ffffff' : 'inherit' }}>{preset.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Planlama Dönemi & Özel DatePicker */}
          <div style={{ ...neoSubCard, padding: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 750, color: 'var(--foreground)', marginBottom: 10 }}>
              Planlama Dönemi (Tekrarlı Vardiya)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
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
                      if (val !== 'once' && weekdays.length <= 1) {
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

            {/* Embedded Modern Clinical DatePicker Card */}
            <div
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: 12,
                padding: '10px 12px',
                marginBottom: repeat !== 'once' ? 12 : 0,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--foreground-2)' }}>
                  {repeat === 'once'
                    ? `Seçili Gün: ${label(startDate, { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : repeat === 'week'
                      ? `Hafta: ${label(monday(startDate), { day: 'numeric', month: 'short' })} – ${label(addDays(monday(startDate), 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : `Ay: ${label(startDate, { month: 'long', year: 'numeric' })}`}
                </span>
                <button
                  type="button"
                  onClick={() => setStartDate(dateKey(new Date()))}
                  style={{ ...claySecondaryButton, minHeight: 25, padding: '0 8px', fontSize: 10.5 }}
                >
                  Bugün
                </button>
              </div>
              <div className="clinic-rdp" style={{ display: 'flex', justifyContent: 'center' }}>
                <DayPicker
                  mode="single"
                  locale={tr}
                  selected={localDate(startDate)}
                  onSelect={(val) => val && setStartDate(dateKey(val))}
                />
              </div>
            </div>

            {repeat !== 'once' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 750, color: 'var(--foreground-2)' }}>
                    Çalışma Günleri
                  </span>
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
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
                  {DAYS.map((day, idx) => {
                    const active = weekdays.includes(idx)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setWeekdays((curr) => (curr.includes(idx) ? curr.filter((x) => x !== idx) : [...curr, idx]))
                        }
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
            )}
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
