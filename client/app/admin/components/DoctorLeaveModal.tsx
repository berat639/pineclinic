'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import {
  CalendarOff,
  X,
  Trash2,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  UserCheck,
  UserX,
  Check,
} from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { tr } from 'date-fns/locale'
import 'react-day-picker/dist/style.css'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'

export interface DoctorLeaveItem {
  id: string
  doctorId: string
  doctorName?: string
  doctorColor?: string
  substituteDoctorId?: string | null
  substituteDoctorName?: string | null
  date: string
  startTime: string
  endTime: string
  isFullDay: boolean
  reason?: string | null
  notes?: string | null
  createdAt?: string
}

interface DoctorLeaveModalProps {
  isOpen: boolean
  onClose: () => void
  doctors: { id: string; name: string; specialty?: string; color?: string }[]
  events?: any[]
  shifts?: any[]
  initialDoctorId?: string
  initialDate?: string
  initialStartTime?: string
  initialEndTime?: string
  onSaved?: () => void
  onSuccess?: () => void
}

const PRESET_REASONS = [
  'Yıllık İzin',
  'Mazeret İzni',
  'Seminer / Eğitim',
  'Mola / Dinlenme',
  'Hastalık / Rapor',
  'Kişisel İzin',
]

function parseYmd(value: string): Date {
  const [y, m, d] = (value || '').split('-').map(Number)
  if (!y || !m || !d) return new Date()
  return new Date(y, m - 1, d, 12, 0, 0)
}

function toYmd(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getLocalYmdFromIso(isoOrStr: string): string {
  if (!isoOrStr) return ''
  try {
    return new Date(isoOrStr).toLocaleDateString('sv')
  } catch {
    return String(isoOrStr).slice(0, 10)
  }
}

function toMins(t: string): number {
  const [h, m] = (t || '09:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function fromMins(m: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, m))
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0')
  const mm = String(clamped % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function DoctorLeaveModal({
  isOpen,
  onClose,
  doctors,
  events = [],
  shifts = [],
  initialDoctorId,
  initialDate,
  initialStartTime,
  initialEndTime,
  onSaved,
  onSuccess,
}: DoctorLeaveModalProps) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const [selectedDoctorId, setSelectedDoctorId] = useState(initialDoctorId || '')
  const [date, setDate] = useState(initialDate || new Date().toISOString().slice(0, 10))
  const [isFullDay, setIsFullDay] = useState(false)
  const [startTime, setStartTime] = useState(initialStartTime || '09:00')
  const [endTime, setEndTime] = useState(initialEndTime || '18:00')
  const [reason, setReason] = useState('Yıllık İzin')
  const [customReason, setCustomReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Conflicting appointments management states
  const [fetchedDayAppointments, setFetchedDayAppointments] = useState<any[]>([])
  const [removedAppointmentIds, setRemovedAppointmentIds] = useState<string[]>([])
  const [removingApptId, setRemovingApptId] = useState<string | null>(null)
  const [substituteDoctorId, setSubstituteDoctorId] = useState<string>('')
  const [cancelAppointments, setCancelAppointments] = useState<boolean>(true)
  const [unassignAppointments, setUnassignAppointments] = useState<boolean>(false)
  const [deletingLeaveId, setDeletingLeaveId] = useState<string | null>(null)

  const [showDatePopover, setShowDatePopover] = useState(false)
  const [datePopoverCoords, setDatePopoverCoords] = useState<{ top: number; left: number }>({
    top: 160,
    left: 160,
  })
  const dateTriggerRef = useRef<HTMLButtonElement>(null)
  const datePopoverRef = useRef<HTMLDivElement>(null)
  const [calendarMonth, setCalendarMonth] = useState<Date>(() =>
    parseYmd(initialDate || new Date().toISOString().slice(0, 10))
  )
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const [existingLeaves, setExistingLeaves] = useState<DoctorLeaveItem[]>([])

  useEffect(() => {
    if (initialDoctorId !== undefined) setSelectedDoctorId(initialDoctorId || '')
    if (initialDate) {
      setDate(initialDate)
      setCalendarMonth(parseYmd(initialDate))
    }
    if (initialStartTime) setStartTime(initialStartTime)
    if (initialEndTime) setEndTime(initialEndTime)
    setShowDatePopover(false)
  }, [initialDoctorId, initialDate, initialStartTime, initialEndTime, isOpen])

  useEffect(() => {
    setSubstituteDoctorId('')
    setCancelAppointments(true)
    setUnassignAppointments(false)
    setRemovedAppointmentIds([])
  }, [selectedDoctorId, isOpen])

  useEffect(() => {
    if (!showDatePopover) return
    const updatePosition = () => {
      const rect = dateTriggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const popW = 284
      const popH = 335
      let left = rect.left
      if (left + popW > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - popW - 12)
      }
      let top = rect.bottom + 6
      if (top + popH > window.innerHeight - 12) {
        top = Math.max(12, rect.top - popH - 6)
      }
      setDatePopoverCoords({ top, left })
    }
    updatePosition()

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        datePopoverRef.current &&
        !datePopoverRef.current.contains(target) &&
        dateTriggerRef.current &&
        !dateTriggerRef.current.contains(target)
      ) {
        setShowDatePopover(false)
      }
    }
    window.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('resize', updatePosition)
    }
  }, [showDatePopover])

  const fetchLeaves = async () => {
    try {
      const res = await fetch('/api/dental/doctors/leaves', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setExistingLeaves(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error('Error fetching doctor leaves:', e)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchLeaves()
    }
  }, [isOpen, selectedDoctorId])

  useEffect(() => {
    if (!isOpen || !date) return
    let cancelled = false
    fetch(`/api/dental/appointments?date=${encodeURIComponent(date)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (!cancelled) {
          setFetchedDayAppointments(Array.isArray(list) ? list : [])
        }
      })
      .catch(() => {
        if (!cancelled) setFetchedDayAppointments([])
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, date])

  const displayedLeaves = useMemo(() => {
    if (!selectedDoctorId) return existingLeaves
    return existingLeaves.filter((l) => l.doctorId === selectedDoctorId)
  }, [existingLeaves, selectedDoctorId])

  const activeDateLeaves = useMemo(() => {
    if (!date) return []
    return existingLeaves.filter(
      (l) => l.date === date && (!selectedDoctorId || l.doctorId === selectedDoctorId)
    )
  }, [existingLeaves, date, selectedDoctorId])

  const conflictingAppointments = useMemo(() => {
    if (!selectedDoctorId || !date) return []
    const removedSet = new Set(removedAppointmentIds)
    const map = new Map<string, any>()
    for (const ev of events || []) {
      if (ev?.id && !removedSet.has(ev.id)) map.set(ev.id, ev)
    }
    for (const ev of fetchedDayAppointments || []) {
      if (ev?.id && !removedSet.has(ev.id)) map.set(ev.id, ev)
    }
    const all = Array.from(map.values())
    const leaveStartMin = isFullDay ? 0 : toMins(startTime)
    const leaveEndMin = isFullDay ? 1440 : toMins(endTime)

    return all
      .filter((ev) => {
        if (!ev || ev.doctorId !== selectedDoctorId) return false
        if (
          ev.status === 'cancelled' ||
          ev.status === 'completed' ||
          ev.patientResponseStatus === 'cancelled'
        ) {
          return false
        }
        const evDate = getLocalYmdFromIso(ev.startTime)
        if (evDate !== date) return false
        if (isFullDay) return true
        const sDt = new Date(ev.startTime)
        const eDt = ev.endTime ? new Date(ev.endTime) : new Date(sDt.getTime() + 30 * 60000)
        const evStart = sDt.getHours() * 60 + sDt.getMinutes()
        const rawEnd = eDt.getHours() * 60 + eDt.getMinutes()
        const evEnd = rawEnd > evStart ? rawEnd : evStart + 30
        return evStart < leaveEndMin && evEnd > leaveStartMin
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [selectedDoctorId, date, events, fetchedDayAppointments, removedAppointmentIds, isFullDay, startTime, endTime])

  if (!isOpen) return null

  const startPct = (toMins(startTime) / (24 * 60)) * 100
  const endPct = (toMins(endTime) / (24 * 60)) * 100

  const handleTrackMove = (clientX: number, thumb: 'start' | 'end') => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const snapped = Math.round((ratio * 24 * 60) / 30) * 30
    if (thumb === 'start') {
      const nextStart = Math.min(toMins(endTime) - 30, Math.max(0, snapped))
      setStartTime(fromMins(nextStart))
    } else {
      const nextEnd = Math.max(
        toMins(startTime) + 30,
        Math.min(23 * 60 + 59, snapped >= 24 * 60 ? 23 * 60 + 59 : snapped)
      )
      setEndTime(fromMins(nextEnd))
    }
  }

  const startDrag = (thumb: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(thumb)
    const onMove = (ev: PointerEvent) => handleTrackMove(ev.clientX, thumb)
    const onUp = () => {
      setDragging(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const cancelOrDeleteAppointmentById = async (apptId: string) => {
    const delRes = await fetch(`/api/dental/appointments/${apptId}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => null)
    if (delRes && delRes.ok) return true
    const putRes = await fetch(`/api/dental/appointments/${apptId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'cancelled', doctorId: null }),
    }).catch(() => null)
    return Boolean(putRes && putRes.ok)
  }

  const handleRemoveSingleConflictingAppt = async (apptId: string) => {
    if (!apptId || removingApptId) return
    setRemovingApptId(apptId)
    try {
      const ok = await cancelOrDeleteAppointmentById(apptId)
      if (ok) {
        setRemovedAppointmentIds((prev) => [...prev, apptId])
        setFetchedDayAppointments((prev) => prev.filter((a) => a.id !== apptId))
        toast.success('Çakışan randevu iptal edildi ve takvimden kaldırıldı')
        if (onSaved) onSaved()
        if (onSuccess) onSuccess()
      } else {
        toast.error('Randevu kaldırılamadı')
      }
    } catch {
      toast.error('Randevu kaldırılırken hata oluştu')
    } finally {
      setRemovingApptId(null)
    }
  }

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedDoctorId) {
      toast.error('Lütfen bir hekim seçin')
      return
    }
    if (!date) {
      toast.error('Lütfen bir tarih seçin')
      return
    }

    const finalStartTime = isFullDay ? '00:00' : startTime
    const finalEndTime = isFullDay ? '23:59' : endTime

    if (!isFullDay && finalStartTime >= finalEndTime) {
      toast.error('Başlangıç saati bitiş saatinden önce olmalıdır')
      return
    }

    const finalReason = reason === 'Diğer' ? customReason.trim() : reason
    const shouldCancelAppts = Boolean(cancelAppointments && !substituteDoctorId)
    const shouldUnassignAppts = Boolean((unassignAppointments || cancelAppointments) && !substituteDoctorId)
    const targetAppts = [...conflictingAppointments]

    setSaving(true)
    try {
      const res = await fetch('/api/dental/doctors/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          substituteDoctorId: substituteDoctorId || null,
          cancelAppointments: shouldCancelAppts,
          unassignAppointments: shouldUnassignAppts,
          appointmentIds: targetAppts.map((a) => a.id),
          date,
          startTime: finalStartTime,
          endTime: finalEndTime,
          isFullDay,
          reason: finalReason || null,
          notes: notes.trim() || null,
        }),
      })

      if (res.ok) {
        if (shouldCancelAppts && targetAppts.length > 0) {
          await Promise.all(targetAppts.map((a) => cancelOrDeleteAppointmentById(a.id)))
        }

        if (substituteDoctorId && targetAppts.length > 0) {
          const subDoc = doctors.find((d) => d.id === substituteDoctorId)
          toast.success(
            `Hekim izni kaydedildi ve ${targetAppts.length} randevu ${subDoc?.name || 'vekil hekime'} devredildi`
          )
        } else if (shouldCancelAppts && targetAppts.length > 0) {
          toast.success(
            `Hekim izni kaydedildi ve çakışan ${targetAppts.length} randevu iptal edilerek kaldırıldı`
          )
        } else if (shouldUnassignAppts && targetAppts.length > 0) {
          toast.success(
            `Hekim izni kaydedildi ve ${targetAppts.length} randevu Atama Bekleyenlere aktarıldı`
          )
        } else {
          toast.success('Hekim izni başarıyla kaydedildi')
        }
        window.dispatchEvent(new CustomEvent('doctorLeavesUpdated'))
        if (onSaved) onSaved()
        if (onSuccess) onSuccess()
        fetchLeaves()
        setReason('Yıllık İzin')
        setCustomReason('')
        setNotes('')
        setSubstituteDoctorId('')
        setCancelAppointments(true)
        setUnassignAppointments(false)
        onClose()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error('Hata: ' + (err.error || 'İzin kaydedilemedi'))
      }
    } catch (e) {
      console.error(e)
      toast.error('İzin kaydedilirken bir hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLeave = async (leaveId: string) => {
    if (!leaveId || deletingLeaveId) return
    setDeletingLeaveId(leaveId)
    try {
      const res = await fetch(`/api/dental/doctors/leaves/${leaveId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        toast.success('Hekim izni kaldırıldı, çalışma saatleri yeniden açıldı')
        setExistingLeaves((prev) => prev.filter((l) => l.id !== leaveId))
        window.dispatchEvent(new CustomEvent('doctorLeavesUpdated'))
        if (onSaved) onSaved()
        if (onSuccess) onSuccess()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'İzin kaldırılamadı')
      }
    } catch {
      toast.error('İzin kaldırılırken hata oluştu')
    } finally {
      setDeletingLeaveId(null)
    }
  }

  const cardBg = 'var(--card-bg)'
  const subCardBg = 'var(--card-inner, var(--background-2))'
  const borderCol = 'var(--input-border)'
  const textCol = 'var(--foreground)'
  const labelCol = 'var(--foreground-2)'
  const mutedCol = 'var(--foreground-3)'
  const inputBg = 'var(--input-bg)'
  const brandBlue = '#2563eb'
  const brandBlueBorder = '#1d4ed8'
  const brandBlueGradient = 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'

  const inputStyle: React.CSSProperties = {
    padding: '9px 12px',
    borderRadius: '10px',
    border: `1.5px solid ${borderCol}`,
    background: inputBg,
    color: textCol,
    boxShadow: 'var(--pc-neo-inset)',
    fontSize: '0.84rem',
    fontWeight: 600,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: labelCol,
    marginBottom: 4,
    display: 'block',
    fontWeight: 700,
  }

  const selectOptionStyle: React.CSSProperties = {
    background: cardBg,
    color: textCol,
  }

  const formattedDate = parseYmd(date).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const substituteCandidateDoctors = doctors.filter((d) => d.id !== selectedDoctorId)

  return (
    <>
      <style>{`
        .clinic-rdp .rdp {
          --rdp-cell-size: 32px;
          --rdp-accent-color: #2563eb;
          --rdp-background-color: var(--badge-clinic-bg, #e0f2fe);
          margin: 0 !important;
          width: 100%;
        }
        .clinic-rdp .rdp-months,
        .clinic-rdp .rdp-month,
        .clinic-rdp .rdp-table {
          width: 100%;
          max-width: 100%;
          table-layout: fixed;
        }
        .clinic-rdp .rdp-caption_label {
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--foreground);
          text-transform: capitalize;
        }
        .clinic-rdp .rdp-nav_button {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          background: var(--card-bg);
          border: 1px solid var(--input-border);
          box-shadow: var(--pc-clay-btn);
          color: var(--foreground);
        }
        .clinic-rdp .rdp-head_cell {
          font-size: 0.67rem;
          font-weight: 700;
          color: var(--foreground-3);
          text-transform: uppercase;
        }
        .clinic-rdp .rdp-day {
          width: 32px;
          height: 32px;
          font-size: 0.77rem;
          border-radius: 8px;
          color: var(--foreground);
          font-weight: 600;
          margin: 0 auto;
        }
        .clinic-rdp .rdp-day_selected {
          background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%) !important;
          color: #ffffff !important;
          box-shadow: var(--pc-clay-primary);
          font-weight: 800;
        }
        .clinic-rdp .rdp-day_today:not(.rdp-day_selected) {
          border: 1.5px solid #2563eb;
          color: var(--badge-clinic-text, #1d4ed8);
          font-weight: 800;
        }
        .dlm-help-wrap {
          position: static;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          cursor: help;
          outline: none;
        }
        .dlm-help-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--badge-clinic-bg, #e0f2fe);
          border: 1px solid var(--badge-clinic-border, #93c5fd);
          color: var(--badge-clinic-text, #0369a1);
          font-size: 0.68rem;
          font-weight: 800;
          line-height: 1;
          user-select: none;
          box-shadow: var(--pc-clay-btn);
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .dlm-help-wrap:hover .dlm-help-icon,
        .dlm-help-wrap:focus-visible .dlm-help-icon,
        .dlm-help-wrap:focus-within .dlm-help-icon {
          background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
          border-color: #1d4ed8;
          color: #ffffff !important;
        }
        .dlm-help-popup {
          position: absolute;
          top: calc(100% + 5px);
          left: 0;
          z-index: 60;
          width: 280px;
          max-width: 100%;
          padding: 8px 11px;
          border-radius: 9px;
          background: var(--card-bg);
          border: 1.5px solid var(--badge-clinic-border, #93c5fd);
          color: var(--foreground);
          font-size: 0.72rem;
          font-weight: 600;
          line-height: 1.45;
          text-align: left;
          white-space: normal;
          box-shadow: var(--pc-modal-shadow);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 0.15s ease, visibility 0.15s ease;
        }
        .dlm-help-wrap:hover .dlm-help-popup,
        .dlm-help-wrap:focus-visible .dlm-help-popup,
        .dlm-help-wrap:focus-within .dlm-help-popup {
          opacity: 1;
          visibility: visible;
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100020,
          background: 'var(--modal-overlay, rgba(15, 23, 42, 0.6))',
        }}
        {...backdropDismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hekim İzni ve Kapalı Saat"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(460px, calc(100vw - 24px))',
          maxWidth: '460px',
          background: cardBg,
          border: `1.5px solid ${borderCol}`,
          borderRadius: '14px',
          boxShadow: 'var(--pc-modal-shadow)',
          zIndex: 100021,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header (Yeni Randevu Boyutunda & Stilinde) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '15px 20px',
            borderBottom: `1px solid ${borderCol}`,
            background: subCardBg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: brandBlueGradient,
                boxShadow: 'var(--pc-clay-primary)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CalendarOff size={17} color="#ffffff" />
            </div>
            <div>
              <div
                style={{
                  fontSize: '1.02rem',
                  fontWeight: 700,
                  color: textCol,
                  lineHeight: 1.2,
                }}
              >
                İzin / Kapalı Saat Ekle
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: mutedCol,
                  marginTop: '2px',
                }}
              >
                Tarih: {formattedDate}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            style={{
              background: inputBg,
              border: `1px solid ${borderCol}`,
              borderRadius: '6px',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: textCol,
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Switcher: Saat Aralığı Kapat | Tüm Gün İzinli */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 20px',
            borderBottom: `1px solid ${borderCol}`,
            background: subCardBg,
          }}
        >
          <button
            type="button"
            onClick={() => setIsFullDay(false)}
            className={!isFullDay ? 'btn-clinic-primary' : ''}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '9px',
              fontSize: '0.83rem',
              fontWeight: 750,
              cursor: 'pointer',
              border: !isFullDay ? `1px solid ${brandBlueBorder}` : `1px solid ${borderCol}`,
              background: !isFullDay ? brandBlueGradient : cardBg,
              color: !isFullDay ? '#ffffff' : textCol,
              boxShadow: !isFullDay ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
            }}
          >
            <span style={{ color: !isFullDay ? '#ffffff' : 'inherit' }}>Saat Aralığı Kapat</span>
          </button>
          <button
            type="button"
            onClick={() => setIsFullDay(true)}
            className={isFullDay ? 'btn-clinic-primary' : ''}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '9px',
              fontSize: '0.83rem',
              fontWeight: 750,
              cursor: 'pointer',
              border: isFullDay ? `1px solid ${brandBlueBorder}` : `1px solid ${borderCol}`,
              background: isFullDay ? brandBlueGradient : cardBg,
              color: isFullDay ? '#ffffff' : textCol,
              boxShadow: isFullDay ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
            }}
          >
            <span style={{ color: isFullDay ? '#ffffff' : 'inherit' }}>Tüm Gün İzinli</span>
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '18px 20px',
            flex: 1,
            overflowY: 'auto',
            background: cardBg,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Seçili Tarihte Mevcut İzin Varsa Üst Uyarı & Hızlı İzin Kaldırma Bandı */}
          {activeDateLeaves.length > 0 && (
            <div
              style={{
                background: subCardBg,
                padding: '12px 14px',
                borderRadius: '11px',
                border: '1.5px solid var(--danger, #ef4444)',
                boxShadow: 'var(--pc-neo-subcard)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  color: 'var(--danger, #ef4444)',
                }}
              >
                <CalendarOff size={15} />
                <span>Seçili Tarihte Aktif İzin Bulunuyor ({formattedDate})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeDateLeaves.map((l) => {
                  const docName =
                    l.doctorName || doctors.find((d) => d.id === l.doctorId)?.name || 'Hekim'
                  return (
                    <div
                      key={`active-banner-${l.id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: cardBg,
                        border: `1px solid ${borderCol}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 750, color: textCol }}>
                          {docName} · {l.isFullDay ? 'Tüm Gün İzinli' : `${l.startTime} – ${l.endTime}`}
                        </div>
                        {(l.reason || l.notes) && (
                          <div style={{ fontSize: '0.7rem', color: mutedCol }}>
                            {l.reason || ''}
                            {l.notes ? ` (${l.notes})` : ''}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={deletingLeaveId === l.id}
                        onClick={() => handleDeleteLeave(l.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 7,
                          border: '1.5px solid var(--danger, #ef4444)',
                          background: cardBg,
                          color: 'var(--danger, #ef4444)',
                          boxShadow: 'var(--pc-clay-btn)',
                          cursor: deletingLeaveId === l.id ? 'wait' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: '0.73rem',
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        <Trash2 size={13} />
                        <span>{deletingLeaveId === l.id ? 'Kaldırılıyor...' : 'İzni Kaldır / İptal Et'}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div
            style={{
              background: subCardBg,
              padding: '14px',
              borderRadius: '12px',
              border: `1px solid ${borderCol}`,
              boxShadow: 'var(--pc-neo-subcard)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '0.86rem', fontWeight: 750, color: textCol }}>
              İzin Bilgileri
            </div>

            {/* Hekim */}
            <div>
              <label style={labelStyle}>
                Hekim <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                style={inputStyle}
              >
                <option value="" style={selectOptionStyle}>
                  Hekim Seçiniz...
                </option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id} style={selectOptionStyle}>
                    {d.name} {d.specialty ? `(${d.specialty})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Hekim Seçimi Altında Çakışan Randevu Yönetimi */}
            {selectedDoctorId && conflictingAppointments.length > 0 && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '11px',
                  background: cardBg,
                  border: `1.5px solid var(--badge-clinic-border, #93c5fd)`,
                  boxShadow: 'var(--pc-neo-subcard)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      color: textCol,
                    }}
                  >
                    <AlertTriangle size={14} color="#d97706" />
                    <span>Randevu Çakışma Yönetimi</span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'var(--badge-clinic-bg, #e0f2fe)',
                      border: '1px solid var(--badge-clinic-border, #bae6fd)',
                      color: 'var(--badge-clinic-text, #0369a1)',
                    }}
                  >
                    {conflictingAppointments.length} Randevu Mevcut
                  </span>
                </div>

                {/* Çakışan Randevuların Özeti */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    maxHeight: 112,
                    overflowY: 'auto',
                    padding: '6px 8px',
                    borderRadius: 8,
                    background: subCardBg,
                    border: `1px solid ${borderCol}`,
                    boxShadow: 'var(--pc-neo-inset)',
                  }}
                >
                  {conflictingAppointments.map((appt) => {
                    const sStr = new Date(appt.startTime).toLocaleTimeString('tr-TR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                    const eStr = appt.endTime
                      ? new Date(appt.endTime).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''
                    return (
                      <div
                        key={appt.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          fontSize: '0.72rem',
                          fontWeight: 650,
                          color: textCol,
                        }}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {appt.title || 'Randevu'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.69rem',
                            fontWeight: 750,
                            color: 'var(--badge-clinic-text, #1d4ed8)',
                            flexShrink: 0,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {sStr}
                          {eStr ? ` – ${eStr}` : ''}
                        </span>
                        <button
                          type="button"
                          disabled={removingApptId === appt.id}
                          onClick={() => handleRemoveSingleConflictingAppt(appt.id)}
                          title="Bu randevuyu iptal et ve takvimden kaldır"
                          style={{
                            padding: '2px 7px',
                            borderRadius: 5,
                            border: '1px solid var(--danger, #ef4444)',
                            background: cardBg,
                            color: 'var(--danger, #ef4444)',
                            fontSize: '0.66rem',
                            fontWeight: 750,
                            cursor: removingApptId === appt.id ? 'wait' : 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          {removingApptId === appt.id ? 'Siliniyor...' : 'Randevuyu Kaldır'}
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* 1. Opsiyonel Input: Yerine Bakacak Hekim Seçimi */}
                <div>
                  <div
                    style={{
                      ...labelStyle,
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      marginBottom: 5,
                    }}
                  >
                    <UserCheck size={13} color={brandBlue} />
                    <span>Yerine Bakacak Hekim Seçimi</span>
                    <span
                      className="dlm-help-wrap"
                      tabIndex={0}
                      role="button"
                      aria-label="Yerine bakacak hekim seçimi açıklaması"
                    >
                      <span className="dlm-help-icon" aria-hidden="true">
                        ?
                      </span>
                      <span className="dlm-help-popup" role="tooltip">
                        Randevuları Devret: İzin saatlerindeki {conflictingAppointments.length} randevu
                        ve ilişkili tedavi planları seçilen vekil hekime devredilir.
                      </span>
                    </span>
                  </div>
                  <select
                    value={substituteDoctorId}
                    onChange={(e) => {
                      const val = e.target.value
                      setSubstituteDoctorId(val)
                      if (val) {
                        setCancelAppointments(false)
                        setUnassignAppointments(false)
                      } else {
                        setCancelAppointments(true)
                        setUnassignAppointments(false)
                      }
                    }}
                    style={inputStyle}
                  >
                    <option value="" style={selectOptionStyle}>
                      Hekim Seçiniz (Devretme Yok)...
                    </option>
                    {substituteCandidateDoctors.map((d) => {
                      const docShift = (shifts || []).find(
                        (s: any) => s.userId === d.id && s.date === date
                      )
                      return (
                        <option key={d.id} value={d.id} style={selectOptionStyle}>
                          {d.name}
                          {d.specialty ? ` (${d.specialty})` : ''}
                          {docShift
                            ? ` · Vardiya: ${docShift.startTime}-${docShift.endTime}`
                            : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* 2. Vekil Hekim Seçilmediğinde Çakışan Randevu İşlemi */}
                {!substituteDoctorId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div
                      style={{
                        ...labelStyle,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        marginBottom: 2,
                      }}
                    >
                      <UserX size={13} color="#d97706" />
                      <span>Çakışan Randevular İçin İşlem Seçin</span>
                      <span
                        className="dlm-help-wrap"
                        tabIndex={0}
                        role="button"
                        aria-label="Çakışan randevu işlemi açıklaması"
                      >
                        <span className="dlm-help-icon" aria-hidden="true">
                          ?
                        </span>
                        <span className="dlm-help-popup" role="tooltip">
                          İzin saatlerindeki {conflictingAppointments.length} randevuyu tamamen iptal
                          ederek takvimden kaldırabilir veya yalnızca hekim atamasını kaldırıp
                          &quot;Atama Bekliyor&quot; durumuna düşürebilirsiniz.
                        </span>
                      </span>
                    </div>

                    {/* Seçenek 1: Randevuları İptal Et / Takvimden Kaldır (Varsayılan) */}
                    <button
                      type="button"
                      onClick={() => {
                        setCancelAppointments(true)
                        setUnassignAppointments(false)
                        setSubstituteDoctorId('')
                      }}
                      className={cancelAppointments ? 'btn-clinic-primary' : ''}
                      style={{
                        width: '100%',
                        padding: '9px 11px',
                        borderRadius: 10,
                        border: cancelAppointments
                          ? `1.5px solid ${brandBlueBorder}`
                          : `1.5px solid ${borderCol}`,
                        background: cancelAppointments ? brandBlueGradient : inputBg,
                        color: cancelAppointments ? '#ffffff' : textCol,
                        boxShadow: cancelAppointments
                          ? 'var(--pc-clay-primary)'
                          : 'var(--pc-clay-btn)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        textAlign: 'left',
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: cancelAppointments
                            ? '1.5px solid #ffffff'
                            : `1.5px solid ${borderCol}`,
                          background: cancelAppointments ? '#ffffff' : cardBg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {cancelAppointments && <Check size={12} color={brandBlue} strokeWidth={3} />}
                      </div>
                      <span
                        style={{
                          fontSize: '0.77rem',
                          fontWeight: 750,
                          color: cancelAppointments ? '#ffffff' : textCol,
                        }}
                      >
                        Randevuları İptal Et / Takvimden Kaldır
                      </span>
                    </button>

                    {/* Seçenek 2: Yalnızca Hekim Atamasını Kaldır (Atama Bekliyor'a Düşür) */}
                    <button
                      type="button"
                      onClick={() => {
                        setUnassignAppointments(true)
                        setCancelAppointments(false)
                        setSubstituteDoctorId('')
                      }}
                      className={unassignAppointments && !cancelAppointments ? 'btn-clinic-primary' : ''}
                      style={{
                        width: '100%',
                        padding: '9px 11px',
                        borderRadius: 10,
                        border:
                          unassignAppointments && !cancelAppointments
                            ? `1.5px solid ${brandBlueBorder}`
                            : `1.5px solid ${borderCol}`,
                        background:
                          unassignAppointments && !cancelAppointments ? brandBlueGradient : inputBg,
                        color: unassignAppointments && !cancelAppointments ? '#ffffff' : textCol,
                        boxShadow:
                          unassignAppointments && !cancelAppointments
                            ? 'var(--pc-clay-primary)'
                            : 'var(--pc-clay-btn)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        textAlign: 'left',
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border:
                            unassignAppointments && !cancelAppointments
                              ? '1.5px solid #ffffff'
                              : `1.5px solid ${borderCol}`,
                          background:
                            unassignAppointments && !cancelAppointments ? '#ffffff' : cardBg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {unassignAppointments && !cancelAppointments && (
                          <Check size={12} color={brandBlue} strokeWidth={3} />
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '0.77rem',
                          fontWeight: 750,
                          color: unassignAppointments && !cancelAppointments ? '#ffffff' : textCol,
                        }}
                      >
                        Yalnızca Hekim Atamasını Kaldır (Atama Bekliyor&apos;a Düşür)
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tarih (Özel DatePicker Popover) & İzin Nedeni */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
              }}
            >
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Tarih</label>
                <button
                  ref={dateTriggerRef}
                  type="button"
                  onClick={() => setShowDatePopover((prev) => !prev)}
                  style={{
                    ...inputStyle,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>{formattedDate}</span>
                  <CalendarIcon size={14} color={brandBlue} />
                </button>
                {showDatePopover && (
                  <div
                    ref={datePopoverRef}
                    style={{
                      position: 'fixed',
                      top: datePopoverCoords.top,
                      left: datePopoverCoords.left,
                      zIndex: 100060,
                      width: 280,
                      padding: 12,
                      borderRadius: 14,
                      background: cardBg,
                      border: `1.5px solid ${borderCol}`,
                      boxShadow: 'var(--pc-modal-shadow)',
                    }}
                  >
                    <div className="clinic-rdp">
                      <DayPicker
                        mode="single"
                        locale={tr}
                        weekStartsOn={1}
                        month={calendarMonth}
                        onMonthChange={setCalendarMonth}
                        selected={parseYmd(date)}
                        onSelect={(d) => {
                          if (d) {
                            setDate(toYmd(d))
                            setShowDatePopover(false)
                          }
                        }}
                        showOutsideDays
                      />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: `1px solid ${borderCol}`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const todayStr = toYmd(new Date())
                          setDate(todayStr)
                          setCalendarMonth(parseYmd(todayStr))
                          setShowDatePopover(false)
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 7,
                          fontSize: '0.72rem',
                          fontWeight: 750,
                          border: '1px solid var(--btn-clinic-outline-border, #93c5fd)',
                          background: 'var(--btn-clinic-outline-bg, #eff6ff)',
                          color: 'var(--btn-clinic-outline-text, #1d4ed8)',
                          boxShadow: 'var(--pc-clay-btn)',
                          cursor: 'pointer',
                        }}
                      >
                        Bugün
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDatePopover(false)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 7,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          border: `1px solid ${borderCol}`,
                          background: subCardBg,
                          color: textCol,
                          boxShadow: 'var(--pc-clay-btn)',
                          cursor: 'pointer',
                        }}
                      >
                        Kapat
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>İzin Nedeni</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={inputStyle}
                >
                  {PRESET_REASONS.map((r) => (
                    <option key={r} value={r} style={selectOptionStyle}>
                      {r}
                    </option>
                  ))}
                  <option value="Diğer" style={selectOptionStyle}>
                    Diğer (Özel)
                  </option>
                </select>
              </div>
            </div>

            {/* Saat Aralığı Slider (Tüm gün değilse) */}
            {!isFullDay && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 10,
                  background: cardBg,
                  border: `1px solid ${borderCol}`,
                  boxShadow: 'var(--pc-neo-inset)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 750, color: labelCol, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={13} color={brandBlue} /> Kapalı Saat Aralığı
                  </span>
                  <span
                    style={{
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      color: 'var(--badge-clinic-text, #1d4ed8)',
                      background: 'var(--badge-clinic-bg, #e0f2fe)',
                      border: '1px solid var(--badge-clinic-border, #bae6fd)',
                      padding: '2px 9px',
                      borderRadius: 999,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {startTime} – {endTime}
                  </span>
                </div>

                {/* Başlangıç / Bitiş Doğrudan Saat Inputları */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: '0.67rem', fontWeight: 700, color: mutedCol }}>Başlangıç</span>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v) setStartTime(v)
                      }}
                      style={{
                        ...inputStyle,
                        padding: '6px 9px',
                        fontSize: '0.79rem',
                        fontWeight: 750,
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: '0.67rem', fontWeight: 700, color: mutedCol }}>Bitiş</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v) setEndTime(v)
                      }}
                      style={{
                        ...inputStyle,
                        padding: '6px 9px',
                        fontSize: '0.79rem',
                        fontWeight: 750,
                      }}
                    />
                  </label>
                </div>

                {/* Dual-Thumb Slider */}
                <div style={{ position: 'relative', height: 24, display: 'flex', alignItems: 'center', marginBottom: 8, userSelect: 'none' }}>
                  <div
                    ref={trackRef}
                    onClick={(e) => {
                      if (!trackRef.current) return
                      const rect = trackRef.current.getBoundingClientRect()
                      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                      const clickedMin = Math.round((ratio * 24 * 60) / 30) * 30
                      const distStart = Math.abs(clickedMin - toMins(startTime))
                      const distEnd = Math.abs(clickedMin - toMins(endTime))
                      handleTrackMove(e.clientX, distStart <= distEnd ? 'start' : 'end')
                    }}
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: 8,
                      borderRadius: 999,
                      background: subCardBg,
                      border: `1px solid ${borderCol}`,
                      cursor: 'pointer',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${startPct}%`,
                        width: `${Math.max(2, endPct - startPct)}%`,
                        background: brandBlueGradient,
                        borderRadius: 999,
                      }}
                    />
                  </div>
                  <div
                    onPointerDown={startDrag('start')}
                    style={{
                      position: 'absolute',
                      left: `calc(${startPct}% - 9px)`,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: brandBlueGradient,
                      border: '2px solid #ffffff',
                      boxShadow: '0 2px 5px rgba(29, 78, 216, 0.35)',
                      cursor: dragging === 'start' ? 'grabbing' : 'grab',
                      zIndex: 2,
                    }}
                  />
                  <div
                    onPointerDown={startDrag('end')}
                    style={{
                      position: 'absolute',
                      left: `calc(${endPct}% - 9px)`,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: brandBlueGradient,
                      border: '2px solid #ffffff',
                      boxShadow: '0 2px 5px rgba(29, 78, 216, 0.35)',
                      cursor: dragging === 'end' ? 'grabbing' : 'grab',
                      zIndex: 2,
                    }}
                  />
                </div>

                {/* Quick Leave Presets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                  {[
                    { label: 'Öğle (12-13)', s: '12:00', e: '13:00' },
                    { label: 'Sabah (09-13)', s: '09:00', e: '13:00' },
                    { label: 'Öğleden S. (13-18)', s: '13:00', e: '18:00' },
                    { label: 'Mesai (09-18)', s: '09:00', e: '18:00' },
                  ].map((p) => {
                    const active = startTime === p.s && endTime === p.e
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setStartTime(p.s)
                          setEndTime(p.e)
                        }}
                        className={active ? 'btn-clinic-primary' : 'btn-clinic-outline'}
                        style={{
                          padding: '4px 4px',
                          borderRadius: 6,
                          fontSize: '0.66rem',
                          fontWeight: 750,
                          border: active ? `1px solid ${brandBlueBorder}` : '1px solid var(--btn-clinic-outline-border, #93c5fd)',
                          background: active ? brandBlueGradient : 'var(--btn-clinic-outline-bg, #eff6ff)',
                          color: active ? '#ffffff' : 'var(--btn-clinic-outline-text, #1d4ed8)',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ color: active ? '#ffffff' : 'inherit' }}>{p.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {reason === 'Diğer' && (
              <div>
                <label style={labelStyle}>Özel İzin Nedeni</label>
                <input
                  type="text"
                  placeholder="Özel izin nedeni giriniz..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {/* Kısa Not */}
            <div>
              <label style={labelStyle}>Not (İsteğe Bağlı)</label>
              <input
                type="text"
                placeholder="Örn: Yerine Dr. Ayşe bakacak..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Seçili Hekimin (veya Tüm Hekimlerin) Mevcut İzinleri */}
          {displayedLeaves.length > 0 && (
            <div
              style={{
                background: subCardBg,
                padding: '12px 14px',
                borderRadius: '10px',
                border: `1px solid ${borderCol}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: textCol }}>
                {selectedDoctorId ? 'Seçili Hekimin Mevcut İzinleri' : 'Kayıtlı Hekim İzinleri'} ({displayedLeaves.length})
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: '160px',
                  overflowY: 'auto',
                }}
              >
                {displayedLeaves.map((l) => {
                  const docName =
                    l.doctorName || doctors.find((d) => d.id === l.doctorId)?.name || 'Hekim'
                  return (
                    <div
                      key={l.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        background: inputBg,
                        borderRadius: '8px',
                        border: `1px solid ${borderCol}`,
                        fontSize: '0.76rem',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: textCol }}>
                          {!selectedDoctorId ? `${docName} · ` : ''}
                          {l.date} · {l.isFullDay ? 'Tüm Gün' : `${l.startTime}–${l.endTime}`}
                        </div>
                        {(l.reason || l.substituteDoctorName || l.notes) && (
                          <div style={{ fontSize: '0.7rem', color: mutedCol }}>
                            {l.reason || ''}
                            {l.substituteDoctorName
                              ? `${l.reason ? ' · ' : ''}Yerine: ${l.substituteDoctorName}`
                              : ''}
                            {l.notes ? ` (${l.notes})` : ''}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={deletingLeaveId === l.id}
                        onClick={() => handleDeleteLeave(l.id)}
                        style={{
                          padding: '5px 10px',
                          background: cardBg,
                          border: '1px solid var(--danger, #ef4444)',
                          borderRadius: '6px',
                          color: 'var(--danger, #ef4444)',
                          boxShadow: 'var(--pc-clay-btn)',
                          cursor: deletingLeaveId === l.id ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.71rem',
                          fontWeight: 750,
                          flexShrink: 0,
                        }}
                      >
                        <Trash2 size={12} />
                        <span>{deletingLeaveId === l.id ? 'Kaldırılıyor...' : 'İzni Kaldır'}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${borderCol}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            background: subCardBg,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: `1px solid ${borderCol}`,
              background: cardBg,
              color: textCol,
              boxShadow: 'var(--pc-clay-btn)',
              cursor: 'pointer',
              fontSize: '0.86rem',
              fontWeight: 600,
            }}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || !selectedDoctorId}
            className="btn-clinic-primary"
            style={{
              padding: '9px 24px',
              borderRadius: '8px',
              background: brandBlueGradient,
              color: '#ffffff',
              border: `1px solid ${brandBlueBorder}`,
              boxShadow: 'var(--pc-clay-primary)',
              cursor: saving || !selectedDoctorId ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '0.86rem',
              opacity: saving || !selectedDoctorId ? 0.5 : 1,
            }}
          >
            <span style={{ color: '#ffffff' }}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</span>
          </button>
        </div>
      </div>
    </>
  )
}
