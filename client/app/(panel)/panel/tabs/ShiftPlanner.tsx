'use client'

import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { tr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Search, Umbrella, Users } from 'lucide-react'

type Staff = { id: string; name: string; role: string; active: boolean; color?: string }
type Shift = { id: string; userId: string; userName: string; userColor?: string; date: string; startTime: string; endTime: string; shiftType: string }
type Leave = { doctorId: string; date: string; isFullDay: boolean; startTime: string; endTime: string; reason?: string | null }
type View = 'day' | 'week' | 'month'
type Repeat = 'once' | 'week' | 'month' | 'range'
type PreviewRow = { userId: string; date: string; existingId?: string; state: 'create' | 'same' | 'existing' | 'leave'; leaveReason?: string | null }

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const TIME_OPTIONS = Array.from({ length: 31 }, (_, index) => {
  const total = 6 * 60 + index * 30
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})
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
  const [editor, setEditor] = useState<{ userIds: string[]; date: string; shift?: Shift } | null>(null)
  const [lastOperation, setLastOperation] = useState<{ id: string; count: number } | null>(null)
  const [successNotice, setSuccessNotice] = useState('')
  const [undoError, setUndoError] = useState('')
  const [monthFocus, setMonthFocus] = useState(selectedDate)
  const [leaves, setLeaves] = useState<Leave[]>([])

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
        <button onClick={() => onOpenLeave('', selectedDate)} style={secondaryButton}><Umbrella size={17} /> İzin Ekle</button>
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
    return total + Math.max(0, endHour * 60 + endMinute - startHour * 60 - startMinute)
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

function ShiftEditor({ users, initial, onClose, onSaved }: { users: Staff[]; initial: { userIds: string[]; date: string; shift?: Shift }; onClose: () => void; onSaved: (operation: { id: string; count: number }) => void }) {
  const [userIds, setUserIds] = useState(initial.userIds)
  const [startDate, setStartDate] = useState(initial.date)
  const [repeat, setRepeat] = useState<Repeat>('once')
  const [endDate, setEndDate] = useState(initial.date)
  const [weekdays, setWeekdays] = useState<number[]>([Math.max(0, (localDate(initial.date).getDay() + 6) % 7)])
  const [startTime, setStartTime] = useState(initial.shift?.startTime || '09:00')
  const [endTime, setEndTime] = useState(initial.shift?.endTime || '18:00')
  const [shiftType, setShiftType] = useState(initial.shift?.shiftType || 'Mesai')
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; summary: Record<string, number> } | null>(null)
  const [overwriteIds, setOverwriteIds] = useState<string[]>(initial.shift ? [initial.shift.id] : [])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [requestId] = useState(() => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
  const plan = useMemo(() => ({ userIds, startDate, endDate: repeat === 'once' ? startDate : repeat === 'week' ? addDays(monday(startDate), 6) : repeat === 'month' ? monthEnd(startDate) : endDate, weekdays: repeat === 'once' ? [((localDate(startDate).getDay() + 6) % 7)] : weekdays, startTime, endTime, shiftType, overwriteShiftIds: overwriteIds }), [userIds, startDate, endDate, repeat, weekdays, startTime, endTime, shiftType, overwriteIds])
  const months = useMemo(() => Array.from({ length: 25 }, (_, index) => {
    const month = localDate(startDate); month.setDate(1); month.setMonth(month.getMonth() + index - 12)
    return { value: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`, text: month.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) }
  }), [startDate])
  useEffect(() => { setPreview(null); setError('') }, [userIds, startDate, endDate, repeat, weekdays, startTime, endTime, shiftType])
  const requestPreview = async () => { setSaving(true); setError(''); try { const response = await fetch('/api/shifts/plan/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(plan) }); const data = await response.json().catch(() => ({})); if (!response.ok) return setError(data.error || 'Önizleme alınamadı.'); setPreview(data) } catch { setError('Önizleme için bağlantı kurulamadı.') } finally { setSaving(false) } }
  const save = async () => { if (!preview) return requestPreview(); setSaving(true); setError(''); try { const response = await fetch('/api/shifts/plan/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ requestId, plan }) }); const data = await response.json().catch(() => ({})); if (!response.ok) return setError(data.error || 'Mesailer kaydedilemedi.'); onSaved({ id: data.operationId, count: data.count ?? data.created + data.updated }) } catch { setError('Bağlantı kesildi. Aynı panelden tekrar deneyebilirsiniz.') } finally { setSaving(false) } }
  const selectedExisting = preview?.rows.filter(row => row.state === 'existing') || []
  const count = (preview?.summary.create || 0) + selectedExisting.filter(row => overwriteIds.includes(row.existingId!)).length
  const setMonth = (value: string) => { const [year, month] = value.split('-').map(Number); const day = Math.min(localDate(startDate).getDate(), new Date(year, month, 0).getDate()); setStartDate(`${value}-${String(day).padStart(2, '0')}`) }
  return <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 100020, pointerEvents: 'none' }}><aside role="dialog" aria-label="Mesai planla" style={{ width: 610, maxWidth: '100vw', height: '100%', overflowY: 'auto', pointerEvents: 'auto', background: 'var(--card-bg)', borderLeft: '1px solid var(--input-border)', padding: 22, boxSizing: 'border-box', color: 'var(--foreground)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}><div><h2 style={{ margin: 0, fontSize: 20 }}>Mesai planla</h2><p style={{ margin: '4px 0 0', color: 'var(--foreground-2)', fontSize: 13 }}>Tarihi, saatleri ve uygulanacak günleri tek ekranda seçin.</p></div><button onClick={onClose} style={secondaryButton}>Kapat</button></div><EditorField label="Personel"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 7, maxHeight: 154, overflowY: 'auto' }}>{users.map(person => <label key={person.id} style={{ ...surface, display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, padding: '0 9px', background: userIds.includes(person.id) ? 'var(--card-inner)' : 'var(--input-bg)', cursor: 'pointer' }}><input type="checkbox" checked={userIds.includes(person.id)} onChange={() => setUserIds(current => current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id])} />{person.name}</label>)}</div></EditorField><EditorField label="Tarih seçici"><div style={{ ...surface, background: 'var(--card-inner)', padding: 10 }}><style>{`.shift-date-picker .rdp { --rdp-accent-color: var(--accent); --rdp-background-color: var(--card-inner); margin: 0; color: var(--foreground); } .shift-date-picker .rdp-caption_label, .shift-date-picker .rdp-head_cell, .shift-date-picker .rdp-day { color: var(--foreground); } .shift-date-picker .rdp-day_selected:not([disabled]) { background: var(--accent) !important; color: var(--btn-clinic-primary-fg) !important; } .shift-date-picker .rdp-button:hover:not([disabled]):not(.rdp-day_selected) { background: var(--input-bg); }`}</style><div className="shift-date-picker"><DayPicker mode="single" locale={tr} selected={localDate(startDate)} onSelect={value => value && setStartDate(dateKey(value))} /></div></div></EditorField><EditorField label="Saat seçici"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><TimeSelect label="Başlangıç" value={startTime} onChange={setStartTime} /><TimeSelect label="Bitiş" value={endTime} onChange={setEndTime} /></div></EditorField><EditorField label="Tekrarlama"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>{([['once', 'Yalnızca bu gün'], ['week', 'Bu hafta'], ['month', 'Seçilen ay'], ['range', 'Tarih aralığı']] as [Repeat,string][]).map(([value, text]) => <button key={value} onClick={() => setRepeat(value)} aria-pressed={repeat === value} style={{ ...secondaryButton, minHeight: 44, background: repeat === value ? 'var(--accent)' : 'var(--input-bg)', color: repeat === value ? 'var(--btn-clinic-primary-fg)' : 'var(--foreground)' }}>{text}</button>)}</div>{repeat === 'week' && <div style={{ ...surface, marginTop: 9, padding: '9px 10px', background: 'var(--card-inner)', fontSize: 13 }}>Seçili hafta: <strong>{label(monday(startDate), { day: 'numeric', month: 'long' })} – {label(addDays(monday(startDate), 6), { day: 'numeric', month: 'long' })}</strong></div>}{repeat === 'month' && <select aria-label="Mesai uygulanacak ay" value={startDate.slice(0, 7)} onChange={event => setMonth(event.target.value)} style={{ ...input, marginTop: 9 }}>{months.map(month => <option key={month.value} value={month.value}>{month.text}</option>)}</select>}{repeat === 'range' && <input aria-label="Bitiş tarihi" type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)} style={{ ...input, marginTop: 9 }} />}{repeat !== 'once' && <><div style={{ display: 'flex', gap: 6, marginTop: 10 }}><button onClick={() => setWeekdays([0,1,2,3,4])} style={secondaryButton}>Hafta içi</button><button onClick={() => setWeekdays([0,1,2,3,4,5,6])} style={secondaryButton}>Her gün</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginTop: 8 }}>{DAYS.map((day,index) => <button key={day} onClick={() => setWeekdays(current => current.includes(index) ? current.filter(item => item !== index) : [...current,index])} style={{ ...secondaryButton, minHeight: 40, padding: 2, background: weekdays.includes(index) ? 'var(--accent)' : 'var(--input-bg)', color: weekdays.includes(index) ? 'var(--btn-clinic-primary-fg)' : 'var(--foreground)' }}>{day}</button>)}</div></>}</EditorField><EditorField label="Mesai türü"><input value={shiftType} onChange={event => setShiftType(event.target.value)} style={input} /></EditorField>{preview && <div style={{ ...surface, padding: 12, background: 'var(--card-inner)', fontSize: 13 }}><strong>{preview.summary.create} yeni · {preview.summary.same} aynı · {preview.summary.existing} mevcut · {preview.summary.leave} izin çakışması</strong>{selectedExisting.length > 0 && <div style={{ marginTop: 10 }}><div style={{ marginBottom: 6 }}>Değiştirmek istediğiniz mevcut mesailer:</div>{selectedExisting.map(row => <label key={row.existingId} style={{ display: 'block', marginTop: 5 }}><input type="checkbox" checked={overwriteIds.includes(row.existingId!)} onChange={() => setOverwriteIds(current => current.includes(row.existingId!) ? current.filter(id => id !== row.existingId) : [...current, row.existingId!])} /> {row.date}</label>)}</div>}</div>}{error && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 650 }}>{error}</p>}<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}><button onClick={onClose} disabled={saving} style={secondaryButton}>Vazgeç</button><button onClick={save} disabled={saving} style={{ ...secondaryButton, background: 'var(--accent)', color: 'var(--btn-clinic-primary-fg)', borderColor: 'var(--accent)' }}>{saving ? 'Kaydediliyor…' : preview ? `${count} mesai ekle` : 'Önizle'}</button></div></aside></div>
}
const input: CSSProperties = { minHeight: 40, padding: '0 9px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', boxSizing: 'border-box', width: '100%' }
const TimeSelect = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => <label style={{ display: 'grid', gap: 5, color: 'var(--foreground-2)', fontSize: 12, fontWeight: 650 }}>{label}<select value={value} onChange={event => onChange(event.target.value)} style={input}>{TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}</select></label>
const EditorField = ({ label, children }: { label: string; children: ReactNode }) => <div style={{ marginTop: 18 }}><strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>{label}</strong>{children}</div>
const Empty = () => <div style={{ padding: 24, color: 'var(--foreground-3)', textAlign: 'center' }}><Users size={22} style={{ marginBottom: 6 }} /><br />Gösterilecek aktif personel yok.</div>
