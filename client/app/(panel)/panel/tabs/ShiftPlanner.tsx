'use client'

import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { tr } from 'date-fns/locale'
import { Calendar, CalendarOff, Check, ChevronLeft, ChevronRight, Clock, Plus, RotateCcw, Search, Users, X } from 'lucide-react'

type Staff = { id: string; name: string; role: string; active: boolean; color?: string }
type Shift = { id: string; userId: string; userName: string; userColor?: string; date: string; startTime: string; endTime: string; shiftType: string }
type Leave = { doctorId: string; date: string; isFullDay: boolean; startTime: string; endTime: string; reason?: string | null }
type View = 'day' | 'week' | 'month'
type Repeat = 'once' | 'week' | 'month' | 'range'
type PreviewRow = { userId: string; date: string; existingId?: string; state: 'create' | 'same' | 'existing' | 'leave'; leaveReason?: string | null }

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const total = index * 30
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})
const END_TIME_OPTIONS = [...TIME_OPTIONS.slice(1), '24:00', ...TIME_OPTIONS.slice(1, 17)]
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const localDate = (key: string) => new Date(`${key}T12:00:00`)
const addDays = (key: string, days: number) => { const d = localDate(key); d.setDate(d.getDate() + days); return dateKey(d) }
const monday = (key: string) => { const d = localDate(key); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateKey(d) }
const monthEnd = (key: string) => { const d = localDate(key); return dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)) }
const label = (key: string, options: Intl.DateTimeFormatOptions) => localDate(key).toLocaleDateString('tr-TR', options)

function useCompactLayout() {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setCompact(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return compact
}

const surface = { background: 'var(--card-bg)', border: '1px solid var(--input-border)', borderRadius: 12 }
const secondaryButton = { minHeight: 40, padding: '0 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', cursor: 'pointer', fontWeight: 650 }

export default function ShiftPlanner({ users, shifts, onChanged, onOpenLeave }: { users: Staff[]; shifts: Shift[]; onChanged: () => void; onOpenLeave: (userId: string, date: string) => void }) {
  const [view, setView] = useState<View>('week')
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
  const [editor, setEditor] = useState<{ userIds: string[]; date: string; shift?: Shift; defaultStartTime?: string; defaultEndTime?: string } | null>(null)
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
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.startTime) setClinicStartTime(data.startTime)
        if (data?.endTime) setClinicEndTime(data.endTime)
      })
      .catch(() => {})
  }, [])

  const saveClinicWorkingHours = async (overrideStart?: string, overrideEnd?: string) => {
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
      setSuccessNotice(`Klinik genel mesai saatleri ${data.startTime} – ${data.endTime}${data.isOvernight ? ' (Gece / Ertesi Gün)' : ''} olarak güncellendi. Takvim saat aralıkları buna göre ayarlandı.`)
    } catch {
      setUndoError('Klinik genel mesai saatleri kaydedilirken bağlantı hatası oluştu.')
    } finally {
      setClinicHoursSaving(false)
    }
  }

  useEffect(() => { fetch('/api/shifts/plan/latest', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(setLastOperation).catch(() => {}) }, [])
  useEffect(() => {
    const startDate = view === 'day' ? selectedDate : view === 'week' ? monday(selectedDate) : `${selectedDate.slice(0, 7)}-01`
    const endDate = view === 'day' ? selectedDate : view === 'week' ? addDays(startDate, 6) : monthEnd(selectedDate)
    fetch(`/api/dental/doctors/leaves?startDate=${startDate}&endDate=${endDate}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setLeaves).catch(() => {})
  }, [selectedDate, view])

  const staff = useMemo(() => users.filter(person => person.active !== false)
    .filter(person => role === 'all' || person.role === role)
    .filter(person => person.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))), [users, role, search])
  const navigate = (direction: number) => setSelectedDate(current => view === 'day' ? addDays(current, direction) : view === 'week' ? addDays(current, direction * 7) : (() => { const d = localDate(current); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + direction); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return dateKey(d) })())
  const displayDate = view === 'day' ? label(selectedDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : view === 'week' ? `${label(monday(selectedDate), { day: 'numeric', month: 'short' })} – ${label(addDays(monday(selectedDate), 6), { day: 'numeric', month: 'short', year: 'numeric' })}` : label(selectedDate, { month: 'long', year: 'numeric' })
  const undo = async () => {
    if (!lastOperation) return
    setUndoError('')
    try {
      const response = await fetch(`/api/shifts/plan/${lastOperation.id}/undo`, { method: 'POST', credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return setUndoError(data.error || 'Mesai işlemi geri alınamadı.')
      setLastOperation(null); setSuccessNotice('Mesai işlemi geri alındı.'); onChanged()
    } catch { setUndoError('Bağlantı kurulamadı; geri alma işlemi uygulanmadı.') }
  }

  return <section style={{ ...surface, padding: 18 }}>
    {/* Klinik Genel Mesai Saatleri (Takvim Saat Aralığı) */}
    <div style={{ ...surface, background: 'var(--card-inner)', padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Clock size={17} color="var(--accent)" />
            <strong style={{ fontSize: 14, color: 'var(--foreground)' }}>Klinik Genel Mesai Saatleri (Takvim Saat Aralığı)</strong>
            {(() => {
              const sH = parseInt(clinicStartTime.split(':')[0] || '8', 10)
              const eH = parseInt(clinicEndTime.split(':')[0] || '20', 10)
              const overnight = clinicEndTime !== '24:00' && eH <= sH
              return overnight ? (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--badge-clinic-bg, #e0f2fe)', border: '1px solid var(--badge-clinic-border, #bae6fd)', color: 'var(--badge-clinic-text, #0369a1)' }}>
                  🌙 Gece Mesaisi ({clinicStartTime} – Ertesi Gün {clinicEndTime})
                </span>
              ) : null
            })()}
          </div>
          <span style={{ fontSize: 12, color: 'var(--foreground-2)' }}>
            Hekim bazlı vardiyalara ek olarak kliniğin genel açılış-kapanış saatlerini belirleyin (örn. Sabah 08:00 – Gece 02:00). İnteraktif takvimdeki saat dilimleri bu aralığa göre oluşturulur.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            ['08:00', '20:00', '08:00 – 20:00'],
            ['08:00', '02:00', 'Sabah 08:00 – Gece 02:00'],
            ['09:00', '19:00', '09:00 – 19:00'],
            ['00:00', '24:00', '24 Saat Açık'],
          ] as [string, string, string][]).map(([pStart, pEnd, pLabel]) => {
            const active = clinicStartTime === pStart && clinicEndTime === pEnd
            return (
              <button
                key={`${pStart}-${pEnd}`}
                type="button"
                onClick={() => {
                  setClinicStartTime(pStart)
                  setClinicEndTime(pEnd)
                  saveClinicWorkingHours(pStart, pEnd)
                }}
                style={{
                  minHeight: 32,
                  padding: '0 10px',
                  borderRadius: 7,
                  border: active ? '1px solid var(--accent)' : '1px solid var(--input-border)',
                  background: active ? 'var(--accent)' : 'var(--input-bg)',
                  color: active ? '#ffffff' : 'var(--foreground)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {pLabel}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 650, color: 'var(--foreground-2)', minWidth: 150 }}>
          Klinik Açılış Saati
          <select value={clinicStartTime} onChange={e => setClinicStartTime(e.target.value)} style={input}>
            {TIME_OPTIONS.map(t => (
              <option key={`clinic-start-${t}`} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 650, color: 'var(--foreground-2)', minWidth: 180 }}>
          Klinik Kapanış Saati
          <select value={clinicEndTime} onChange={e => setClinicEndTime(e.target.value)} style={input}>
            {Array.from(new Set([...TIME_OPTIONS.slice(1), '24:00'])).map(t => {
              const sH = parseInt(clinicStartTime.split(':')[0] || '8', 10)
              const eH = parseInt(t.split(':')[0] || '20', 10)
              const isOvernightOption = t !== '24:00' && eH <= sH
              return (
                <option key={`clinic-end-${t}`} value={t}>
                  {t}{isOvernightOption ? ' (Gece / Ertesi Gün)' : ''}
                </option>
              )
            })}
          </select>
        </label>
        <button
          type="button"
          disabled={clinicHoursSaving}
          onClick={() => saveClinicWorkingHours()}
          style={{
            minHeight: 40,
            padding: '0 16px',
            borderRadius: 8,
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: '#ffffff',
            fontWeight: 700,
            cursor: clinicHoursSaving ? 'wait' : 'pointer',
          }}
        >
          {clinicHoursSaving ? 'Kaydediliyor…' : 'Genel Mesai Saatini Kaydet'}
        </button>
        <button
          type="button"
          onClick={() => {
            const doctorIds = staff.filter(p => p.role === 'hekim').map(p => p.id)
            setEditor({
              userIds: doctorIds.length > 0 ? doctorIds : staff.map(p => p.id),
              date: selectedDate,
              defaultStartTime: clinicStartTime,
              defaultEndTime: clinicEndTime === '24:00' ? '23:30' : clinicEndTime,
            })
          }}
          style={secondaryButton}
        >
          Tüm Hekimlere Bu Saatleri Planla
        </button>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', border: '1px solid var(--input-border)', borderRadius: 9, overflow: 'hidden' }}>
          {([['day', 'Günlük'], ['week', 'Haftalık'], ['month', 'Aylık']] as [View, string][]).map(([item, text]) => <button key={item} onClick={() => setView(item)} aria-pressed={view === item} style={{ minHeight: 40, padding: '0 12px', border: 'none', borderRight: item === 'month' ? 'none' : '1px solid var(--input-border)', background: view === item ? 'var(--accent)' : 'var(--input-bg)', color: view === item ? 'var(--btn-clinic-primary-fg)' : 'var(--foreground)', fontWeight: 700, cursor: 'pointer' }}>{text}</button>)}
        </div>
        <button onClick={() => navigate(-1)} aria-label={`Önceki ${view === 'day' ? 'gün' : view === 'week' ? 'hafta' : 'ay'}`} style={secondaryButton}><ChevronLeft size={18} /></button>
        <strong style={{ minWidth: 180, textAlign: 'center', color: 'var(--foreground)' }}>{displayDate}</strong>
        <input aria-label="Seçili tarih" type="date" value={selectedDate} onChange={event => { setSelectedDate(event.target.value); setMonthFocus(event.target.value) }} style={{ ...input, width: 142 }} />
        <button onClick={() => navigate(1)} aria-label={`Sonraki ${view === 'day' ? 'gün' : view === 'week' ? 'hafta' : 'ay'}`} style={secondaryButton}><ChevronRight size={18} /></button>
        <button onClick={() => setSelectedDate(dateKey(new Date()))} style={secondaryButton}>Bugün</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {lastOperation && <button onClick={undo} style={{ ...secondaryButton, color: 'var(--accent)' }}><RotateCcw size={16} /> Son eklemeyi geri al ({lastOperation.count})</button>}
        <button onClick={() => onOpenLeave('', selectedDate)} style={{ ...secondaryButton, display: 'inline-flex', alignItems: 'center', gap: 6 }}><CalendarOff size={16} /> İzin / Kapalı Saat Ekle</button>
        <button onClick={() => setEditor({ userIds: [], date: selectedDate })} style={{ minHeight: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--btn-clinic-primary-fg)', fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}><Plus size={17} /> Mesai Ekle</button>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: 12, marginBottom: 14, ...surface, background: 'var(--card-inner)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '1 1 220px', minHeight: 40, padding: '0 9px', border: '1px solid var(--input-border)', borderRadius: 8, background: 'var(--input-bg)' }}><Search size={16} color="var(--foreground-2)" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Personel ara" style={{ border: 'none', outline: 'none', background: 'var(--input-bg)', color: 'var(--foreground)', width: '100%' }} /></label>
      <select value={role} onChange={event => setRole(event.target.value)} style={{ ...secondaryButton, minWidth: 150 }}><option value="all">Tüm roller</option><option value="hekim">Hekimler</option><option value="host">Resepsiyon</option><option value="yonetici">Yöneticiler</option></select>
    </div>

    {(successNotice || undoError) && <div role="status" style={{ ...surface, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 14, background: 'var(--card-inner)', color: undoError ? 'var(--danger)' : 'var(--foreground)' }}><span>{undoError || successNotice}</span>{lastOperation && !undoError && <button onClick={undo} style={secondaryButton}>Geri al</button>}</div>}

    {view === 'day' && <DayView date={selectedDate} staff={staff} shifts={shifts} leaves={leaves} onOpen={(userId, shift) => setEditor({ userIds: [userId], date: selectedDate, shift })} />}
    {view === 'week' && <WeekView date={selectedDate} staff={staff} shifts={shifts} onOpen={(userId, date, shift) => setEditor({ userIds: [userId], date, shift })} />}
    {view === 'month' && <MonthView date={selectedDate} selectedDate={monthFocus} staff={staff} shifts={shifts.filter(item => staff.some(person => person.id === item.userId))} onSelect={setMonthFocus} onOpen={(userId, date, shift) => setEditor({ userIds: userId ? [userId] : [], date, shift })} />}
    {editor && <ShiftEditor users={staff} initial={editor} onClose={() => setEditor(null)} onSaved={operation => { setEditor(null); setLastOperation(operation); setSuccessNotice(`${operation.count} mesai eklendi.`); onChanged() }} />}
  </section>
}

function DayView({ date, staff, shifts, leaves, onOpen }: { date: string; staff: Staff[]; shifts: Shift[]; leaves: Leave[]; onOpen: (userId: string, shift?: Shift) => void }) {
  const byUser = new Map(shifts.filter(item => item.date === date).map(item => [item.userId, item]))
  return <div style={{ display: 'grid', gap: 8 }}>{staff.map(person => { const shift = byUser.get(person.id); const leave = leaves.find(item => item.doctorId === person.id && item.date === date); return <button key={person.id} onClick={() => !leave && onOpen(person.id, shift)} disabled={!!leave} style={{ ...surface, background: shift ? 'var(--card-inner)' : 'var(--input-bg)', minHeight: 56, padding: '10px 12px', cursor: leave ? 'not-allowed' : 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--foreground)' }}><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 10, height: 10, background: person.color || 'var(--accent)', borderRadius: 999 }} />{person.name}</span><span style={{ color: shift ? 'var(--foreground)' : leave ? 'var(--danger)' : 'var(--foreground-3)', fontWeight: shift || leave ? 700 : 500 }}>{shift ? `${shift.startTime}–${shift.endTime} · ${shift.shiftType}` : leave ? `İzinli${leave.reason ? ` · ${leave.reason}` : ''}` : 'Mesai eklenmemiş'}</span></button> })}{staff.length === 0 && <Empty />}</div>
}

function WeekView({ date, staff, shifts, onOpen }: { date: string; staff: Staff[]; shifts: Shift[]; onOpen: (userId: string, date: string, shift?: Shift) => void }) {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(monday(date), index))
  const compact = useCompactLayout()
  const [dayIndex, setDayIndex] = useState(0)
  useEffect(() => setDayIndex(0), [date])
  const totalHours = (userId: string) => shifts.filter(item => item.userId === userId && dates.includes(item.date)).reduce((total, item) => {
    const [startHour, startMinute] = item.startTime.split(':').map(Number)
    const [endHour, endMinute] = item.endTime.split(':').map(Number)
    const startTotal = startHour * 60 + startMinute
    let endTotal = endHour * 60 + endMinute
    if (endTotal <= startTotal) endTotal += 1440
    return total + Math.max(0, endTotal - startTotal)
  }, 0) / 60
  if (compact) {
    const activeDate = dates[dayIndex]
    return <div><div role="tablist" aria-label="Haftanın günleri" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(44px, 1fr))', gap: 5, overflowX: 'auto', marginBottom: 10 }}>{dates.map((day, index) => <button key={day} role="tab" aria-selected={dayIndex === index} onClick={() => setDayIndex(index)} style={{ ...secondaryButton, minHeight: 48, padding: 4, background: dayIndex === index ? 'var(--accent)' : 'var(--input-bg)', color: dayIndex === index ? 'var(--btn-clinic-primary-fg)' : 'var(--foreground)' }}>{DAYS[index]}<br /><small>{localDate(day).getDate()}</small></button>)}</div><strong style={{ display: 'block', margin: '10px 0', color: 'var(--foreground)' }}>{label(activeDate, { weekday: 'long', day: 'numeric', month: 'long' })}</strong><div style={{ display: 'grid', gap: 7 }}>{staff.map(person => { const shift = shifts.find(item => item.userId === person.id && item.date === activeDate); return <button key={person.id} onClick={() => onOpen(person.id, activeDate, shift)} style={{ ...surface, minHeight: 56, padding: '8px 10px', background: shift ? 'var(--card-inner)' : 'var(--input-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--foreground)', cursor: 'pointer', textAlign: 'left' }}><span>{person.name}</span><span style={{ color: shift ? 'var(--accent)' : 'var(--foreground-3)' }}>{shift ? `${shift.startTime}–${shift.endTime}` : 'Mesai yok'}</span></button> })}</div>{staff.length === 0 && <Empty />}</div>
  }
  return <div style={{ overflowX: 'auto' }}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.2fr) repeat(7, minmax(118px, 1fr))', minWidth: 980, gap: 1, background: 'var(--input-border)', border: '1px solid var(--input-border)', borderRadius: 10, overflow: 'hidden' }}><div style={{ padding: 10, background: 'var(--card-inner)' }}>Personel</div>{dates.map((day, index) => <div key={day} style={{ padding: 10, background: 'var(--card-inner)', textAlign: 'center', fontWeight: 700, color: 'var(--foreground)' }}>{DAYS[index]}<br /><small style={{ color: 'var(--foreground-2)' }}>{label(day, { day: 'numeric', month: 'short' })}</small></div>)}{staff.map(person => <Fragment key={person.id}><div style={{ padding: 10, background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 3, color: 'var(--foreground)', fontWeight: 650 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 9, height: 9, background: person.color || 'var(--accent)', borderRadius: 999 }} />{person.name}</span><small style={{ color: 'var(--foreground-2)', fontWeight: 500 }}>{totalHours(person.id)} saat planlı</small></div>{dates.map(day => { const shift = shifts.find(item => item.userId === person.id && item.date === day); return <button key={`${person.id}-${day}`} onClick={() => onOpen(person.id, day, shift)} style={{ minHeight: 68, background: shift ? 'var(--card-inner)' : 'var(--input-bg)', border: 'none', color: shift ? 'var(--foreground)' : 'var(--foreground-3)', cursor: 'pointer', textAlign: 'center', fontWeight: shift ? 700 : 500 }}>{shift ? <>{shift.startTime}–{shift.endTime}<br /><small>{shift.shiftType}</small></> : '+ Mesai'}</button>})}</Fragment>)}</div>{staff.length === 0 && <Empty />}</div>
}

function MonthView({ date, selectedDate, staff, shifts, onSelect, onOpen }: { date: string; selectedDate: string; staff: Staff[]; shifts: Shift[]; onSelect: (date: string) => void; onOpen: (userId: string, date: string, shift?: Shift) => void }) {
  const month = localDate(date); const first = new Date(month.getFullYear(), month.getMonth(), 1, 12); const start = addDays(dateKey(first), -((first.getDay() + 6) % 7)); const days = Array.from({ length: 42 }, (_, index) => addDays(start, index))
  const focusedShifts = shifts.filter(item => item.date === selectedDate)
  return <div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>{DAYS.map(day => <strong key={day} style={{ textAlign: 'center', color: 'var(--foreground-2)', fontSize: 13 }}>{day}</strong>)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>{days.map(day => { const rows = shifts.filter(item => item.date === day); const inMonth = localDate(day).getMonth() === month.getMonth(); return <button key={day} onClick={() => onSelect(day)} aria-pressed={selectedDate === day} style={{ ...surface, minHeight: 94, padding: 8, background: selectedDate === day ? 'var(--card-inner)' : inMonth ? 'var(--card-bg)' : 'var(--input-bg)', cursor: 'pointer', textAlign: 'left', color: 'var(--foreground)' }}><strong>{localDate(day).getDate()}</strong><div style={{ marginTop: 8, color: rows.length ? 'var(--accent)' : 'var(--foreground-3)', fontSize: 12, fontWeight: 650 }}>{rows.length ? `${rows.length} planlı personel` : 'Mesai yok'}</div>{rows.slice(0, 2).map(item => <div key={item.id} style={{ fontSize: 11, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.userName.split(' ')[0]} · {item.startTime}</div>)}</button> })}</div><section style={{ ...surface, padding: 12, marginTop: 14, background: 'var(--card-inner)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}><strong>{label(selectedDate, { day: 'numeric', month: 'long', weekday: 'long' })}</strong><button onClick={() => onOpen('', selectedDate)} style={secondaryButton}>Mesai Ekle</button></div><div style={{ display: 'grid', gap: 6 }}>{staff.map(person => { const shift = focusedShifts.find(item => item.userId === person.id); return <button key={person.id} onClick={() => onOpen(person.id, selectedDate, shift)} style={{ ...surface, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, padding: '7px 10px', background: 'var(--card-bg)', color: 'var(--foreground)', cursor: 'pointer', textAlign: 'left' }}><span>{person.name}</span><span style={{ color: shift ? 'var(--accent)' : 'var(--foreground-3)' }}>{shift ? `${shift.startTime}–${shift.endTime}` : 'Mesai yok'}</span></button> })}</div>{staff.length === 0 && <Empty />}</section></div>
}

function ShiftEditor({ users, initial, onClose, onSaved }: { users: Staff[]; initial: { userIds: string[]; date: string; shift?: Shift; defaultStartTime?: string; defaultEndTime?: string }; onClose: () => void; onSaved: (operation: { id: string; count: number }) => void }) {
  const [userIds, setUserIds] = useState(initial.userIds)
  const [startDate, setStartDate] = useState(initial.date)
  const [repeat, setRepeat] = useState<Repeat>('once')
  const [endDate, setEndDate] = useState(initial.date)
  const [weekdays, setWeekdays] = useState<number[]>([Math.max(0, (localDate(initial.date).getDay() + 6) % 7)])
  const [startTime, setStartTime] = useState(initial.shift?.startTime || initial.defaultStartTime || '09:00')
  const [endTime, setEndTime] = useState(initial.shift?.endTime || initial.defaultEndTime || '18:00')
  const [shiftType, setShiftType] = useState(initial.shift?.shiftType || 'Mesai')
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; summary: Record<string, number> } | null>(null)
  const [overwriteIds, setOverwriteIds] = useState<string[]>(initial.shift ? [initial.shift.id] : [])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [requestId] = useState(() => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

  const plan = useMemo(() => ({
    userIds,
    startDate,
    endDate: repeat === 'once' ? startDate : repeat === 'week' ? addDays(monday(startDate), 6) : repeat === 'month' ? monthEnd(startDate) : endDate,
    weekdays: repeat === 'once' ? [((localDate(startDate).getDay() + 6) % 7)] : weekdays,
    startTime,
    endTime,
    shiftType,
    overwriteShiftIds: overwriteIds,
  }), [userIds, startDate, endDate, repeat, weekdays, startTime, endTime, shiftType, overwriteIds])

  const months = useMemo(() => Array.from({ length: 25 }, (_, index) => {
    const month = localDate(startDate); month.setDate(1); month.setMonth(month.getMonth() + index - 12)
    return { value: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`, text: month.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) }
  }), [startDate])

  useEffect(() => { setPreview(null); setError('') }, [userIds, startDate, endDate, repeat, weekdays, startTime, endTime, shiftType])

  const requestPreview = async () => {
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/shifts/plan/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(plan),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return setError(data.error || 'Önizleme alınamadı.')
      setPreview(data)
    } catch {
      setError('Önizleme için bağlantı kurulamadı.')
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (!preview) return requestPreview()
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/shifts/plan/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId, plan }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return setError(data.error || 'Mesailer kaydedilemedi.')
      onSaved({ id: data.operationId, count: data.count ?? data.created + data.updated })
    } catch {
      setError('Bağlantı kesildi. Aynı panelden tekrar deneyebilirsiniz.')
    } finally {
      setSaving(false)
    }
  }

  const selectedExisting = preview?.rows.filter(row => row.state === 'existing') || []
  const count = (preview?.summary.create || 0) + selectedExisting.filter(row => overwriteIds.includes(row.existingId!)).length
  const setMonth = (value: string) => {
    const [year, month] = value.split('-').map(Number)
    const day = Math.min(localDate(startDate).getDate(), new Date(year, month, 0).getDate())
    setStartDate(`${value}-${String(day).padStart(2, '0')}`)
  }

  // Calculate shift duration & overnight status
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

  const roleLabel = (r: string) => r === 'hekim' ? 'Hekim' : r === 'host' ? 'Resepsiyon' : r === 'yonetici' ? 'Yönetici' : 'Personel'

  const SHIFT_PRESETS: { label: string; sub: string; start: string; end: string; type: string }[] = [
    { label: 'Gündüz', sub: '09:00 – 18:00', start: '09:00', end: '18:00', type: 'Mesai' },
    { label: 'Sabahçı', sub: '08:00 – 16:00', start: '08:00', end: '16:00', type: 'Sabahçı' },
    { label: 'Tam Gün', sub: '08:00 – 20:00', start: '08:00', end: '20:00', type: 'Tam Gün' },
    { label: 'Gece Nöbeti', sub: '08:00 – 02:00', start: '08:00', end: '02:00', type: 'Gece Nöbeti' },
  ]

  const SHIFT_TYPES = ['Mesai', 'Sabahçı', 'Öğlenci', 'Tam Gün', 'Gece Nöbeti']

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100020,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <aside
        role="dialog"
        aria-label="Mesai planla"
        onClick={e => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card-bg)',
          borderLeft: '1px solid var(--input-border)',
          boxShadow: '-12px 0 36px rgba(15, 23, 42, 0.28)',
          boxSizing: 'border-box',
          color: 'var(--foreground)',
        }}
      >
        {/* Sticky Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--input-border)',
            background: 'var(--card-bg)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Clock size={19} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.2 }}>
                Mesai planla
              </h2>
              <p style={{ margin: '3px 0 0', color: 'var(--foreground-2)', fontSize: 12, fontWeight: 500 }}>
                Tarihi, vardiya saatlerini ve uygulanacak personeli seçin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            title="Kapat"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--foreground-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
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
          <div style={{ ...surface, background: 'var(--card-inner)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={15} color="#2563eb" />
                <strong style={{ fontSize: 13, color: 'var(--foreground)' }}>Personel</strong>
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
                  {userIds.length} / {users.length} seçili
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    const docIds = users.filter(u => u.role === 'hekim').map(u => u.id)
                    setUserIds(docIds)
                  }}
                  style={{
                    minHeight: 26,
                    padding: '0 8px',
                    borderRadius: 6,
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--foreground-2)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Sadece Hekimler
                </button>
                <button
                  type="button"
                  onClick={() => setUserIds(userIds.length === users.length ? [] : users.map(u => u.id))}
                  style={{
                    minHeight: 26,
                    padding: '0 8px',
                    borderRadius: 6,
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--accent)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {userIds.length === users.length ? 'Temizle' : 'Tümünü Seç'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, maxHeight: 176, overflowY: 'auto' }}>
              {users.map(person => {
                const selected = userIds.includes(person.id)
                return (
                  <label
                    key={person.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: selected ? '1.5px solid #2563eb' : '1px solid var(--input-border)',
                      background: selected ? 'var(--card-bg)' : 'var(--input-bg)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => setUserIds(current => current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id])}
                      style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          background: person.color || '#2563eb',
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {person.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {person.name}
                        </div>
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--foreground-2)' }}>
                          {roleLabel(person.role)}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        border: selected ? '1px solid #2563eb' : '1px solid var(--input-border)',
                        background: selected ? '#2563eb' : 'var(--card-inner)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {selected && <Check size={12} color="#ffffff" strokeWidth={3} />}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* 2. Saat Seçici & Hazır Vardiya Şablonları */}
          <div style={{ ...surface, background: 'var(--card-inner)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={15} color="#2563eb" />
                <strong style={{ fontSize: 13, color: 'var(--foreground)' }}>Saat seçici & Vardiya Şablonu</strong>
              </div>
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
                {shiftDurationInfo.isOvernight ? `🌙 Gece Mesaisi · ${shiftDurationInfo.hours} saat` : `⏱️ ${shiftDurationInfo.hours} saat vardiya`}
              </span>
            </div>

            {/* Quick Shift Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 12 }}>
              {SHIFT_PRESETS.map(preset => {
                const isActive = startTime === preset.start && endTime === preset.end
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setStartTime(preset.start)
                      setEndTime(preset.end)
                      setShiftType(preset.type)
                    }}
                    style={{
                      padding: '7px 6px',
                      borderRadius: 8,
                      border: isActive ? '1px solid #2563eb' : '1px solid var(--input-border)',
                      background: isActive ? '#2563eb' : 'var(--input-bg)',
                      color: isActive ? '#ffffff' : 'var(--foreground)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: isActive ? '#ffffff' : 'var(--foreground)' }}>{preset.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? '#ffffff' : 'var(--foreground-2)' }}>{preset.sub}</span>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <TimeSelect label="Başlangıç" value={startTime} onChange={setStartTime} />
              <TimeSelect label="Bitiş" value={endTime} onChange={setEndTime} isEnd startTime={startTime} />
            </div>

            {/* Mesai Türü */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--foreground-2)' }}>Mesai türü</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {SHIFT_TYPES.map(t => {
                    const active = shiftType === t
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setShiftType(t)}
                        style={{
                          padding: '2px 7px',
                          borderRadius: 6,
                          border: active ? '1px solid #2563eb' : '1px solid var(--input-border)',
                          background: active ? '#2563eb' : 'var(--input-bg)',
                          color: active ? '#ffffff' : 'var(--foreground-2)',
                          fontSize: 10.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>
              <input
                aria-label="Mesai türü"
                value={shiftType}
                onChange={event => setShiftType(event.target.value)}
                placeholder="Örn: Mesai, Sabahçı, Gece Nöbeti"
                style={input}
              />
            </div>
          </div>

          {/* 3. Tekrarlama & Tarih Seçici */}
          <div style={{ ...surface, background: 'var(--card-inner)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={15} color="#2563eb" />
                <strong style={{ fontSize: 13, color: 'var(--foreground)' }}>Tarih seçici & Tekrarlama</strong>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {([
                  ['Bugün', dateKey(new Date())],
                  ['Yarın', addDays(dateKey(new Date()), 1)],
                ] as [string, string][]).map(([lbl, dVal]) => {
                  const active = startDate === dVal
                  return (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setStartDate(dVal)}
                      style={{
                        minHeight: 25,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: active ? '1px solid #2563eb' : '1px solid var(--input-border)',
                        background: active ? '#2563eb' : 'var(--input-bg)',
                        color: active ? '#ffffff' : 'var(--foreground-2)',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {lbl}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Segmented Repeat Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 4,
                padding: 4,
                borderRadius: 10,
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                marginBottom: 10,
              }}
            >
              {([
                ['once', 'Yalnızca bu gün'],
                ['week', 'Bu hafta'],
                ['month', 'Seçilen ay'],
                ['range', 'Tarih aralığı'],
              ] as [Repeat, string][]).map(([value, text]) => {
                const active = repeat === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRepeat(value)}
                    aria-pressed={active}
                    style={{
                      minHeight: 34,
                      padding: '0 6px',
                      borderRadius: 7,
                      border: 'none',
                      background: active ? '#2563eb' : 'transparent',
                      color: active ? '#ffffff' : 'var(--foreground-2)',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {text}
                  </button>
                )
              })}
            </div>

            {repeat === 'week' && (
              <div style={{ ...surface, marginBottom: 10, padding: '8px 10px', background: 'var(--input-bg)', fontSize: 12.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--foreground-2)' }}>Seçili hafta:</span>
                <strong style={{ color: 'var(--foreground)' }}>
                  {label(monday(startDate), { day: 'numeric', month: 'long' })} – {label(addDays(monday(startDate), 6), { day: 'numeric', month: 'long' })}
                </strong>
              </div>
            )}

            {repeat === 'month' && (
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 650, color: 'var(--foreground-2)', marginBottom: 10 }}>
                Mesai uygulanacak ay
                <select aria-label="Mesai uygulanacak ay" value={startDate.slice(0, 7)} onChange={event => setMonth(event.target.value)} style={input}>
                  {months.map(month => <option key={month.value} value={month.value}>{month.text}</option>)}
                </select>
              </label>
            )}

            {repeat === 'range' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 650, color: 'var(--foreground-2)' }}>
                  Başlangıç tarihi
                  <input aria-label="Başlangıç tarihi" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} style={input} />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 650, color: 'var(--foreground-2)' }}>
                  Bitiş tarihi
                  <input aria-label="Bitiş tarihi" type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)} style={input} />
                </label>
              </div>
            )}

            {/* Compact Styled Calendar UI Kit */}
            <div style={{ ...surface, background: 'var(--input-bg)', padding: '8px 10px', display: 'flex', justifyContent: 'center' }}>
              <style>{`
                .shift-date-picker .rdp {
                  --rdp-cell-size: 34px;
                  --rdp-accent-color: #2563eb;
                  --rdp-background-color: var(--card-inner);
                  margin: 0;
                  color: var(--foreground);
                  font-size: 12.5px;
                }
                .shift-date-picker .rdp-months {
                  justify-content: center;
                }
                .shift-date-picker .rdp-caption_label {
                  font-size: 13px;
                  font-weight: 800;
                  color: var(--foreground);
                  text-transform: capitalize;
                }
                .shift-date-picker .rdp-head_cell {
                  font-size: 11px;
                  font-weight: 700;
                  color: var(--foreground-2);
                }
                .shift-date-picker .rdp-day {
                  color: var(--foreground);
                  border-radius: 8px;
                  font-weight: 600;
                }
                .shift-date-picker .rdp-day_selected:not([disabled]),
                .shift-date-picker .rdp-day_selected:hover:not([disabled]) {
                  background: #2563eb !important;
                  color: #ffffff !important;
                  font-weight: 800;
                }
                .shift-date-picker .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
                  background: var(--card-inner);
                }
              `}</style>
              <div className="shift-date-picker">
                <DayPicker
                  mode="single"
                  locale={tr}
                  selected={localDate(startDate)}
                  onSelect={value => value && setStartDate(dateKey(value))}
                />
              </div>
            </div>

            {repeat !== 'once' && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground-2)' }}>Uygulanacak Günler</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setWeekdays([0, 1, 2, 3, 4])}
                      style={{
                        minHeight: 25,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--foreground)',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Hafta içi
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}
                      style={{
                        minHeight: 25,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--foreground)',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Her gün
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
                  {DAYS.map((day, index) => {
                    const active = weekdays.includes(index)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setWeekdays(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index])}
                        style={{
                          minHeight: 36,
                          padding: 2,
                          borderRadius: 8,
                          border: active ? '1px solid #2563eb' : '1px solid var(--input-border)',
                          background: active ? '#2563eb' : 'var(--input-bg)',
                          color: active ? '#ffffff' : 'var(--foreground)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 4. Önizleme & Çakışma Özeti */}
          {preview && (
            <div style={{ ...surface, padding: 14, background: 'var(--card-inner)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: 13, color: 'var(--foreground)' }}>Planlama Önizlemesi</strong>
                <span style={{ fontSize: 11.5, color: 'var(--foreground-2)', fontWeight: 600 }}>
                  {preview.summary.create} yeni · {preview.summary.same} aynı · {preview.summary.existing} mevcut · {preview.summary.leave} izin çakışması
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {([
                  ['Yeni', preview.summary.create || 0, '#2563eb'],
                  ['Mevcut', preview.summary.existing || 0, 'var(--foreground)'],
                  ['Aynı', preview.summary.same || 0, 'var(--foreground-2)'],
                  ['İzinli', preview.summary.leave || 0, 'var(--danger)'],
                ] as [string, number, string][]).map(([lbl, val, clr]) => (
                  <div
                    key={lbl}
                    style={{
                      padding: '8px 6px',
                      borderRadius: 8,
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 800, color: clr }}>{val}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--foreground-2)' }}>{lbl}</div>
                  </div>
                ))}
              </div>
              {selectedExisting.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--input-border)' }}>
                  <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: 'var(--foreground-2)' }}>
                    Değiştirmek istediğiniz mevcut mesailer:
                  </div>
                  <div style={{ display: 'grid', gap: 5, maxHeight: 120, overflowY: 'auto' }}>
                    {selectedExisting.map(row => {
                      const personName = users.find(u => u.id === row.userId)?.name || ''
                      return (
                        <label
                          key={row.existingId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 7,
                            background: 'var(--input-bg)',
                            border: '1px solid var(--input-border)',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={overwriteIds.includes(row.existingId!)}
                            onChange={() => setOverwriteIds(current => current.includes(row.existingId!) ? current.filter(id => id !== row.existingId) : [...current, row.existingId!])}
                          />
                          <span style={{ fontWeight: 650 }}>{row.date}</span>
                          {personName && <span style={{ color: 'var(--foreground-2)' }}>· {personName}</span>}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p
              role="alert"
              style={{
                margin: 0,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--card-inner)',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {error}
            </p>
          )}
        </div>

        {/* Sticky Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--input-border)',
            background: 'var(--card-bg)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <button type="button" onClick={onClose} disabled={saving} style={secondaryButton}>
            Vazgeç
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {preview && (
              <button type="button" onClick={requestPreview} disabled={saving} style={secondaryButton}>
                Yeniden Önizle
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                minHeight: 40,
                padding: '0 18px',
                borderRadius: 8,
                border: '1px solid #2563eb',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              {saving ? 'Kaydediliyor…' : preview ? `${count} mesai ekle` : 'Önizle'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

const input: CSSProperties = { minHeight: 40, padding: '0 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', boxSizing: 'border-box', width: '100%', fontSize: 13, fontWeight: 600 }

const TimeSelect = ({ label, value, onChange, isEnd, startTime }: { label: string; value: string; onChange: (value: string) => void; isEnd?: boolean; startTime?: string }) => {
  const options = isEnd ? Array.from(new Set([...TIME_OPTIONS.slice(1), '24:00', ...TIME_OPTIONS.slice(1, 17)])) : TIME_OPTIONS
  return (
    <label style={{ display: 'grid', gap: 5, color: 'var(--foreground-2)', fontSize: 12, fontWeight: 650 }}>
      {label}
      <select value={value} onChange={event => onChange(event.target.value)} style={input}>
        {options.map(time => {
          const sH = startTime ? parseInt(startTime.split(':')[0] || '8', 10) : 8
          const eH = parseInt(time.split(':')[0] || '20', 10)
          const overnight = isEnd && time !== '24:00' && eH <= sH
          return (
            <option key={time} value={time}>
              {time}{overnight ? ' (Gece / Ertesi Gün)' : ''}
            </option>
          )
        })}
      </select>
    </label>
  )
}

const Empty = () => <div style={{ padding: 24, color: 'var(--foreground-3)', textAlign: 'center' }}><Users size={22} style={{ marginBottom: 6 }} /><br />Gösterilecek aktif personel yok.</div>
