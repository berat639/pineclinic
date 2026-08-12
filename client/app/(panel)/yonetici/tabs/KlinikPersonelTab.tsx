'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../../../lib/auth-context'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface User { id: string; email: string; name: string; role: string; active: boolean; phone?: string; specialty?: string; color?: string }
interface ShiftItem { id: string; userId: string; userName: string; date: string; startTime: string; endTime: string; shiftType: string }

const inputStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none', fontFamily: 'inherit', width: '100%' }
const btnStyle: React.CSSProperties = { padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  yonetici: { label: 'Yönetici', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  hekim: { label: 'Hekim', color: 'var(--accent)', bg: 'rgba(59,130,246,0.1)' },
  host: { label: 'Resepsiyon', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
}

export default function KlinikPersonelTab() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [shifts, setShifts] = useState<ShiftItem[]>([])
  const [showUserForm, setShowUserForm] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'host', phone: '', specialty: '', color: '#60a5fa' })
  const [error, setError] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [shiftForm, setShiftForm] = useState({ userId: '', date: '', startTime: '09:00', endTime: '18:00' })
  const [showShiftForm, setShowShiftForm] = useState(false)

  const fetchData = useCallback(() => {
    fetch(`/api/admin/users`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setUsers).catch(() => {})
    fetch(`/api/shifts`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setShifts).catch(() => {})
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  async function addUser(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const res = await fetch(`/api/yonetici/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) })
    const data = await res.json()
    if (res.ok) { setUsers([...users, { ...data, active: true }]); setShowUserForm(false); setForm({ email: '', name: '', password: '', role: 'host', phone: '', specialty: '', color: '#60a5fa' }) }
    else setError(data.error || 'Hata')
  }

  async function toggleActive(u: User) {
    const res = await fetch(`/api/yonetici/users/${u.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !u.active }) })
    if (res.ok) setUsers(users.map(x => x.id === u.id ? { ...x, active: !x.active } : x))
  }

  async function createShift(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/shifts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(shiftForm) })
    if (res.ok) { fetchData(); setShowShiftForm(false) }
  }

  async function deleteShift(id: string) {
    await fetch(`/api/shifts/${id}`, { method: 'DELETE', credentials: 'include' })
    setShifts(shifts.filter(s => s.id !== id))
  }

  // Week days
  const startOfWeek = new Date()
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1 + weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(startOfWeek); d.setDate(d.getDate() + i); return d.toISOString().split('T')[0]! })

  return (
    <div style={{ width: '100%' }}>
      {/* ── Personel Listesi ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Personel</h2>
        <span style={{ fontSize: '0.68rem', color: 'var(--foreground-3)' }}>{users.length} kişi</span>
        <button onClick={() => setShowUserForm(!showUserForm)} style={btnStyle}>{showUserForm ? 'İptal' : '+ Ekle'}</button>
      </div>

      {showUserForm && (
        <form onSubmit={addUser} className="glass-card" style={{ padding: 14, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 8 }}>
          <input placeholder="İsim *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
          <input placeholder="E-posta *" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required style={inputStyle} />
          <input placeholder="Şifre *" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} style={inputStyle} />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="host">Resepsiyon</option><option value="hekim">Hekim</option><option value="yonetici">Yönetici</option>
          </select>
          {form.role === 'hekim' && <>
            <input placeholder="Uzmanlık" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} style={inputStyle} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>Renk:</span><input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: 30, height: 26, border: 'none', borderRadius: 4, cursor: 'pointer' }} /></div>
          </>}
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="submit" style={btnStyle}>Oluştur</button>
          </div>
          {error && <div style={{ gridColumn: '1/-1', fontSize: '0.72rem', color: 'var(--danger)' }}>{error}</div>}
        </form>
      )}

      {/* User cards - responsive grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 8, marginBottom: 32 }}>
        {users.map(u => {
          const role = ROLE_META[u.role] || ROLE_META.host
          return (
            <div key={u.id} className="glass-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {u.color && <span style={{ width: 10, height: 10, borderRadius: '50%', background: u.color, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--foreground-3)' }}>{u.email}</div>
              </div>
              <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: 4, background: role.bg, color: role.color, fontWeight: 600, flexShrink: 0 }}>{role.label}</span>
              <button onClick={() => toggleActive(u)} style={{ fontSize: '0.62rem', padding: '3px 7px', borderRadius: 4, background: u.active ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)', border: `1px solid ${u.active ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}`, color: u.active ? '#ef4444' : '#10b981', cursor: 'pointer', flexShrink: 0 }}>
                {u.active ? 'Deaktif' : 'Aktif'}
              </button>
            </div>
          )
        })}
      </div>

      {/* ── Shift Takvimi ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Vardiya Takvimi</h2>
        <button onClick={() => setShowShiftForm(!showShiftForm)} style={btnStyle}>{showShiftForm ? 'İptal' : '+ Vardiya'}</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 4, padding: '3px 8px', color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.75rem' }}>◀</button>
          <span style={{ fontSize: '0.72rem', color: 'var(--foreground-2)', minWidth: 140, textAlign: 'center' }}>
            {new Date(days[0]! + 'T00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} – {new Date(days[6]! + 'T00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 4, padding: '3px 8px', color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.75rem' }}>▶</button>
        </div>
      </div>

      {showShiftForm && (
        <form onSubmit={createShift} className="glass-card" style={{ padding: 12, marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select value={shiftForm.userId} onChange={e => setShiftForm({ ...shiftForm, userId: e.target.value })} required style={{ ...inputStyle, width: 'auto', minWidth: 140 }}>
            <option value="">Kişi seç</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}{!u.active ? ' (deaktif)' : ''}</option>)}
          </select>
          <input type="date" value={shiftForm.date} onChange={e => setShiftForm({ ...shiftForm, date: e.target.value })} required style={{ ...inputStyle, width: 'auto' }} />
          <input type="time" value={shiftForm.startTime} onChange={e => setShiftForm({ ...shiftForm, startTime: e.target.value })} style={{ ...inputStyle, width: 80 }} />
          <input type="time" value={shiftForm.endTime} onChange={e => setShiftForm({ ...shiftForm, endTime: e.target.value })} style={{ ...inputStyle, width: 80 }} />
          <button type="submit" style={{ ...btnStyle, background: 'var(--success)' }}>Kaydet</button>
        </form>
      )}

      {/* Week grid - responsive */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 6 }}>
        {days.map(d => {
          const dayShifts = shifts.filter(s => s.date === d)
          const isToday = d === new Date().toISOString().split('T')[0]
          return (
            <div key={d} className="glass-card" style={{ padding: 10, minHeight: 90, borderLeft: isToday ? '3px solid var(--accent)' : undefined }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--foreground)', marginBottom: 6 }}>
                {new Date(d + 'T00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
              </div>
              {dayShifts.length === 0 ? (
                <div style={{ fontSize: '0.65rem', color: 'var(--foreground-3)' }}>—</div>
              ) : dayShifts.map(s => (
                <div key={s.id} style={{ fontSize: '0.68rem', padding: '3px 5px', marginBottom: 3, borderRadius: 4, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.15)' }}>
                  <div style={{ fontWeight: 500, color: 'var(--foreground)' }}>{s.userName}</div>
                  <div style={{ color: 'var(--foreground-3)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{s.startTime}–{s.endTime}</span>
                    <button onClick={() => deleteShift(s.id)} style={{ fontSize: '0.6rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
