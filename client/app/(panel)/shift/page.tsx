'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../../../lib/auth-context'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface ShiftItem {
  id: string
  userId: string
  userName: string
  userRole: string
  date: string
  startTime: string
  endTime: string
  shiftType: string
  notes: string | null
}

export default function ShiftPage() {
  const { user } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const [shifts, setShifts] = useState<ShiftItem[]>([])
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formDate, setFormDate] = useState('')
  const [formUser, setFormUser] = useState('')
  const [formStart, setFormStart] = useState('09:00')
  const [formEnd, setFormEnd] = useState('18:00')
  const [formWeekly, setFormWeekly] = useState(false)

  const startOfWeek = new Date()
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1 + weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek)
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]!
  })
  const weekLabel = `${new Date(days[0]! + 'T00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} - ${new Date(days[6]! + 'T00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}`

  useEffect(() => {
    fetch(`/api/shifts`, { credentials: 'include' }).then(r => r.json()).then(setShifts).catch(() => {})
    if (user?.role === 'yonetici') {
      fetch(`/api/admin/users`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setUsers).catch(() => {})
    }
  }, [user])

  async function createShift(e: React.FormEvent) {
    e.preventDefault()
    
    if (formWeekly) {
      const baseDate = new Date(formDate)
      for (let i = 0; i < 7; i++) {
        const d = new Date(baseDate)
        d.setDate(d.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]!
        
        const res = await fetch(`/api/shifts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ userId: formUser, date: dateStr, startTime: formStart, endTime: formEnd }),
        })
        if (res.ok) {
          const s = await res.json()
          setShifts(prev => [...prev, s])
        }
      }
      setShowForm(false)
      setFormWeekly(false)
    } else {
      const res = await fetch(`/api/shifts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ userId: formUser, date: formDate, startTime: formStart, endTime: formEnd }),
      })
      if (res.ok) { 
        const s = await res.json()
        setShifts(prev => [...prev, s])
        setShowForm(false) 
      }
    }
  }

  async function deleteShift(id: string) {
    await fetch(`/api/shifts/${id}`, { method: 'DELETE', credentials: 'include' })
    setShifts(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--foreground)' }}>Shift Yönetimi</h1>
        {user?.role === 'yonetici' && (
          <button onClick={() => setShowForm(!showForm)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer' }}>+ Vardiya Ekle</button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 4, padding: '4px 10px', color: 'var(--foreground)', cursor: 'pointer' }}>◀</button>
          <span style={{ fontSize: 13, color: 'var(--foreground-2)', minWidth: 180, textAlign: 'center' }}>{weekLabel}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 4, padding: '4px 10px', color: 'var(--foreground)', cursor: 'pointer' }}>▶</button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createShift} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <select value={formUser} onChange={e => setFormUser(e.target.value)} required style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }}>
            <option value="">Kişi seç</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
          <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }} />
          <input type="time" value={formStart} onChange={e => setFormStart(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13, width: 90 }} />
          <input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13, width: 90 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--foreground)', fontSize: 13, cursor: 'pointer', padding: '0 8px' }}>
            <input type="checkbox" checked={formWeekly} onChange={e => setFormWeekly(e.target.checked)} />
            Haftalık Şablon (7 Gün)
          </label>
          <button type="submit" style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--success)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>Kaydet</button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {days.map(d => {
          const dayShifts = shifts.filter(s => s.date === d)
          return (
            <div key={d} style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', minHeight: 120 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}>
                {new Date(d + 'T00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
              </div>
              {dayShifts.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--foreground-3)' }}>—</div>
              ) : dayShifts.map(s => (
                <div key={s.id} style={{ fontSize: 11, padding: '4px 6px', marginBottom: 4, borderRadius: 4, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                  <div style={{ fontWeight: 500, color: 'var(--foreground)' }}>{s.userName || 'Bilinmiyor'}</div>
                  <div style={{ color: 'var(--foreground-3)' }}>{s.startTime}–{s.endTime}</div>
                  {user?.role === 'yonetici' && <button onClick={() => deleteShift(s.id)} style={{ fontSize: 10, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 2 }}>Sil</button>}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
