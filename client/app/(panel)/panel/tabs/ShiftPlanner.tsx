'use client'

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CalendarOff, Check, ChevronLeft, ChevronRight, Clock, Plus, Repeat, RotateCcw, Search, Trash2, Users, X } from 'lucide-react'
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
  border: '1.5px solid var(--input-border)',
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
  padding: '0 10px',
  borderRadius: 10,
  border: '1.5px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--foreground)',
  boxShadow: 'var(--pc-neo-inset)',
  boxSizing: 'border-box',
  width: '100%',
  fontSize: 13,
  fontWeight: 650,
  outline: 'none',
}

const clayOutlineButton: CSSProperties = {
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
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #0284c7',
  background: 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)',
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

  const isOvernightClinic = useMemo(() => {
    const sH = parseInt(clinicStartTime.split(':')[0] || '8', 10)
    const eH = parseInt(clinicEndTime.split(':')[0] || '20', 10)
    return clinicEndTime !== '24:00' && eH <= sH
  }, [clinicStartTime, clinicEndTime])

  return (
    <section style={{ ...neoCard, padding: 18 }}>
      {/* Sadeleştirilmiş Tek Satır Klinik Genel Mesai Barı */}
      <div
        style={{
          ...neoSubCard,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)',
              boxShadow: 'var(--pc-clay-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Clock size={17} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 13.5, color: 'var(--foreground)' }}>Klinik Genel Mesai (Takvim Saat Aralığı)</strong>
              {isOvernightClinic && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--badge-clinic-bg, #e0f2fe)',
                    border: '1px solid var(--badge-clinic-border, #bae6fd)',
                    color: 'var(--badge-clinic-text, #0369a1)',
                  }}
                >
                  🌙 Gece Vardiyası ({clinicStartTime} – {clinicEndTime})
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--foreground-2)' }}>
              İnteraktif takvim saat cetveli bu açılış-kapanış aralığına göre otomatik ayarlanır.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground-2)' }}>Açılış:</span>
            <select
              aria-label="Klinik açılış saati"
              value={clinicStartTime}
              disabled={!canEditClinicHours || clinicHoursSaving}
              onChange={(e) => setClinicStartTime(e.target.value)}
              style={{ ...neoInput, width: 100, minHeight: 36 }}
            >
              {TIME_OPTIONS.map((t) => (
                <option key={`clinic-start-${t}`} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <span style={{ fontWeight: 700, color: 'var(--foreground-3)' }}>–</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground-2)' }}>Kapanış:</span>
            <select
              aria-label="Klinik kapanış saati"
              value={clinicEndTime}
              disabled={!canEditClinicHours || clinicHoursSaving}
              onChange={(e) => setClinicEndTime(e.target.value)}
              style={{ ...neoInput, width: 145, minHeight: 36 }}
            >
              {Array.from(new Set([...TIME_OPTIONS.slice(1), '24:00'])).map((t) => {
                const sH = parseInt(clinicStartTime.split(':')[0] || '8', 10)
                const eH = parseInt(t.split(':')[0] || '20', 10)
                const isOvernightOption = t !== '24:00' && eH <= sH
                return (
                  <option key={`clinic-end-${t}`} value={t}>
                    {t}
                    {isOvernightOption ? ' (Gece)' : ''}
                  </option>
                )
              })}
            </select>
          </div>

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
                    padding: '0 12px',
                    borderRadius: 8,
                    border: active ? '1px solid #0284c7' : '1px solid transparent',
                    background: active ? 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)' : 'transparent',
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
            style={clayOutlineButton}
          >
            <ChevronLeft size={17} />
          </button>
          <strong style={{ minWidth: 165, textAlign: 'center', color: 'var(--foreground)', fontSize: 13.5 }}>{displayDate}</strong>
          <input
            aria-label="Seçili tarih"
            type="date"
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value)
              setMonthFocus(event.target.value)
            }}
            style={{ ...neoInput, width: 142, minHeight: 38 }}
          />
          <button
            type="button"
            onClick={() => navigate(1)}
            aria-label={`Sonraki ${view === 'day' ? 'gün' : view === 'week' ? 'hafta' : 'ay'}`}
            style={clayOutlineButton}
          >
            <ChevronRight size={17} />
          </button>
          <button type="button" onClick={() => setSelectedDate(dateKey(new Date()))} style={clayOutlineButton}>
            Bugün
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {lastOperation && canEditShifts && (
            <button type="button" onClick={undo} style={{ ...clayOutlineButton, color: 'var(--accent)' }}>
              <RotateCcw size={15} /> Son İşlemi Geri Al ({lastOperation.count})
            </button>
          )}
          {canManageLeaves && (
            <button type="button" onClick={() => onOpenLeave('', selectedDate)} style={clayOutlineButton}>
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
            border: '1.5px solid var(--input-border)',
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
        <select value={role} onChange={(event) => setRole(event.target.value)} style={{ ...neoInput, width: 'auto', minWidth: 155 }}>
          <option value="all">Tüm Roller</option>
          <option value="hekim">Hekimler</option>
          <option value="host">Kayıt / Resepsiyon</option>
          <option value="yonetici">Yöneticiler</option>
        </select>
        <span style={{ fontSize: 11.5, color: 'var(--foreground-3)', fontWeight: 600 }}>
          💡 Hücreye tıklayarak düzenleyebilir, sağ tıklayarak hızlıca <strong>Günlük / Haftalık / Aylık</strong> atayabilirsiniz.
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
            <button type="button" onClick={undo} style={clayOutlineButton}>
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

      {/* Yeni Randevu (QuickCreatePopover) Standart 460px Modal Mimarisiyle Mesai Planla */}
      {editor && (
        <ShiftEditorModal
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
              <span style={{ width: 10, height: 10, background: person.color || 'var(--accent)', borderRadius: 999 }} />
              {person.name}
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                background: shift ? 'var(--badge-clinic-bg, #e0f2fe)' : 'var(--card-bg)',
                border: shift ? '1px solid var(--badge-clinic-border, #bae6fd)' : '1px solid var(--input-border)',
                color: shift ? 'var(--badge-clinic-text, #0369a1)' : leave ? 'var(--danger)' : 'var(--foreground-3)',
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
                ...clayOutlineButton,
                minHeight: 48,
                padding: 4,
                background: dayIndex === index ? 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)' : 'var(--input-bg)',
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
                <span style={{ color: shift ? 'var(--accent)' : 'var(--foreground-3)', fontWeight: 700 }}>
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
          gridTemplateColumns: 'minmax(195px, 1.35fr) repeat(7, minmax(112px, 1fr))',
          minWidth: 980,
          gap: 1,
          background: 'var(--input-border)',
          border: '1.5px solid var(--input-border)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: 'var(--pc-neo-subcard)',
        }}
      >
        <div style={{ padding: '10px 12px', background: 'var(--card-inner)', fontWeight: 800, fontSize: 12.5, color: 'var(--foreground)' }}>
          Personel & Tekrarlı Plan
        </div>
        {dates.map((day, index) => (
          <div key={day} style={{ padding: '8px 6px', background: 'var(--card-inner)', textAlign: 'center', fontWeight: 750, fontSize: 12.5, color: 'var(--foreground)' }}>
            {DAYS[index]}
            <br />
            <small style={{ color: 'var(--foreground-2)', fontWeight: 600 }}>{label(day, { day: 'numeric', month: 'short' })}</small>
          </div>
        ))}
        {staff.map((person) => (
          <Fragment key={person.id}>
            <div
              style={{
                padding: '10px 12px',
                background: 'var(--card-bg)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: 6,
                color: 'var(--foreground)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 750, fontSize: 13 }}>
                  <span style={{ width: 9, height: 9, background: person.color || 'var(--accent)', borderRadius: 999, flexShrink: 0 }} />
                  {person.name}
                </span>
                <small style={{ color: 'var(--foreground-2)', fontWeight: 700, fontSize: 11 }}>{totalHours(person.id)} sa</small>
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 5, width: '100%' }}>
                  <button
                    type="button"
                    onClick={() => onAssignRepeat(person.id, date, 'week')}
                    className="btn-clinic-outline"
                    style={{
                      flex: 1,
                      padding: '3px 6px',
                      borderRadius: 6,
                      fontSize: 10.5,
                      fontWeight: 700,
                      boxShadow: 'var(--pc-clay-btn)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                    }}
                    title="Bu personele haftalık tekrarlı mesai planla"
                  >
                    <Repeat size={10} /> Haftalık
                  </button>
                  <button
                    type="button"
                    onClick={() => onAssignRepeat(person.id, date, 'month')}
                    className="btn-clinic-outline"
                    style={{
                      flex: 1,
                      padding: '3px 6px',
                      borderRadius: 6,
                      fontSize: 10.5,
                      fontWeight: 700,
                      boxShadow: 'var(--pc-clay-btn)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                    }}
                    title="Bu personele aylık tekrarlı mesai planla"
                  >
                    <Repeat size={10} /> Aylık
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
                        color: 'var(--badge-clinic-text, #0369a1)',
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
        ))}
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
                border: selectedDate === day ? '1.5px solid #0284c7' : '1px solid var(--input-border)',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--foreground)',
              }}
            >
              <strong style={{ fontSize: 12.5 }}>{localDate(day).getDate()}</strong>
              <div style={{ marginTop: 6, color: rows.length ? 'var(--accent)' : 'var(--foreground-3)', fontSize: 11.5, fontWeight: 700 }}>
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
                <span style={{ color: shift ? 'var(--accent)' : 'var(--foreground-3)', fontWeight: 700, fontSize: 12.5 }}>
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
 * Yeni Randevu (`QuickCreatePopover`) standart modal mimarisi:
 * - maxWidth: 460px, borderRadius: 14px, solid var(--card-bg)
 * - Backdrop: rgba(15, 23, 42, 0.6)
 * - Tedavi Planlama Neomorphism & Claymorphism oranı
 * - Günlük / Haftalık / Aylık tek tıkla kayıt (2 aşamalı Önizle -> Ekle kaldırıldı)
 */
function ShiftEditorModal({
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

  const shiftDurationInfo = useMemo(() => {
    const [sH, sM] = startTime.split(':').map(Number)
    const [eH, eM] = endTime.split(':').map(Number)
    const sMin = sH * 60 + sM
    let eMin = eH * 60 + eM
    const isOvernight = endTime !== '24:00' && eMin <= sMin
    if (eMin <= sMin) eMin += 1440
    const diffHours = Math.round(((eMin - sMin) / 60) * 10) / 10
    return { hours: diffHours, isOvernight }
  }, [startTime, endTime])

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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100020,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mesai Planla"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--card-bg)',
          borderRadius: 14,
          border: '1.5px solid var(--input-border)',
          padding: 20,
          boxShadow: 'var(--pc-neo-card)',
          color: 'var(--foreground)',
          boxSizing: 'border-box',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)',
                boxShadow: 'var(--pc-clay-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock size={17} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--foreground)' }}>
                {initial.shift ? 'Mesai Düzenle' : 'Mesai Planla'}
              </h3>
              <div style={{ fontSize: '0.73rem', color: 'var(--foreground-2)' }}>
                Günlük, haftalık veya aylık tekrarlı vardiya atayın
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: '1px solid var(--input-border)',
              background: 'var(--card-inner)',
              color: 'var(--foreground-2)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 1. Personel Seçimi */}
          <div style={{ ...neoSubCard, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 750, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={14} color="var(--accent)" /> Personel ({userIds.length} seçili)
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setUserIds(users.filter((u) => u.role === 'hekim').map((u) => u.id))}
                  style={{ ...clayOutlineButton, minHeight: 26, padding: '0 8px', fontSize: 11 }}
                >
                  Hekimler
                </button>
                <button
                  type="button"
                  onClick={() => setUserIds(userIds.length === users.length ? [] : users.map((u) => u.id))}
                  style={{ ...clayOutlineButton, minHeight: 26, padding: '0 8px', fontSize: 11, color: 'var(--accent)' }}
                >
                  {userIds.length === users.length ? 'Temizle' : 'Tümü'}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, maxHeight: 132, overflowY: 'auto' }}>
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
                      padding: '7px 9px',
                      borderRadius: 9,
                      border: selected ? '1.5px solid #0284c7' : '1px solid var(--input-border)',
                      background: selected ? 'var(--card-bg)' : 'var(--input-bg)',
                      boxShadow: selected ? 'var(--pc-clay-pale)' : 'none',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 12, fontWeight: 700 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: person.color || '#0284c7', flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.name}</span>
                    </span>
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 5,
                        background: selected ? '#0284c7' : 'var(--card-inner)',
                        border: selected ? '1px solid #0284c7' : '1px solid var(--input-border)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {selected && <Check size={11} color="#ffffff" strokeWidth={3} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Saat Aralığı */}
          <div style={{ ...neoSubCard, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 750, color: 'var(--foreground)' }}>Çalışma Saat Aralığı</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--badge-clinic-bg, #e0f2fe)',
                  border: '1px solid var(--badge-clinic-border, #bae6fd)',
                  color: 'var(--badge-clinic-text, #0369a1)',
                }}
              >
                {shiftDurationInfo.isOvernight ? `🌙 Gece · ${shiftDurationInfo.hours} sa` : `⏱️ ${shiftDurationInfo.hours} saat`}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--foreground-2)' }}>
                Başlangıç
                <select value={startTime} onChange={(e) => setStartTime(e.target.value)} style={neoInput}>
                  {TIME_OPTIONS.map((t) => (
                    <option key={`mod-s-${t}`} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--foreground-2)' }}>
                Bitiş
                <select value={endTime} onChange={(e) => setEndTime(e.target.value)} style={neoInput}>
                  {Array.from(new Set([...TIME_OPTIONS.slice(1), '24:00', ...TIME_OPTIONS.slice(1, 17)])).map((t) => {
                    const sH = parseInt(startTime.split(':')[0] || '8', 10)
                    const eH = parseInt(t.split(':')[0] || '20', 10)
                    const overnight = t !== '24:00' && eH <= sH
                    return (
                      <option key={`mod-e-${t}`} value={t}>
                        {t}
                        {overnight ? ' (Gece)' : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
            </div>
          </div>

          {/* 3. Tekrarlı Planlama (Günlük / Haftalık / Aylık) */}
          <div style={{ ...neoSubCard, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--foreground)', marginBottom: 8 }}>
              Planlama Dönemi (Tekrarlı Vardiya)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 6,
                marginBottom: 10,
              }}
            >
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
                      border: active ? '1px solid #0284c7' : '1px solid var(--input-border)',
                      background: active ? 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)' : 'var(--input-bg)',
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

            <label style={{ display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--foreground-2)', marginBottom: repeat !== 'once' ? 10 : 0 }}>
              {repeat === 'once' ? 'Mesai Tarihi' : repeat === 'week' ? 'Hafta Seçimi (Herhangi Bir Gün)' : 'Ay Seçimi (Herhangi Bir Gün)'}
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={neoInput} />
            </label>

            {repeat !== 'once' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--foreground-2)' }}>
                    {repeat === 'week'
                      ? `${label(monday(startDate), { day: 'numeric', month: 'short' })} – ${label(addDays(monday(startDate), 6), { day: 'numeric', month: 'short' })} Günleri`
                      : `${label(startDate, { month: 'long', year: 'numeric' })} Boyunca Çalışma Günleri`}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => setWeekdays([0, 1, 2, 3, 4])}
                      style={{ ...clayOutlineButton, minHeight: 24, padding: '0 7px', fontSize: 10.5 }}
                    >
                      Hafta İçi
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}
                      style={{ ...clayOutlineButton, minHeight: 24, padding: '0 7px', fontSize: 10.5 }}
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
                          minHeight: 34,
                          borderRadius: 8,
                          border: active ? '1px solid #0284c7' : '1px solid var(--input-border)',
                          background: active ? 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)' : 'var(--input-bg)',
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
                padding: '9px 12px',
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

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {initial.shift && onDeleteShift ? (
              <button
                type="button"
                onClick={() => onDeleteShift(initial.shift!.id)}
                style={{
                  ...clayOutlineButton,
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
              <button type="button" onClick={onClose} disabled={saving} style={clayOutlineButton}>
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
        </div>
      </div>
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
