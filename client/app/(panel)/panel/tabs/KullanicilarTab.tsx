'use client'

import { useEffect, useState } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface User { id: string; email: string; name: string; role: string; active: boolean; phone?: string; specialty?: string; color?: string }

export default function KullanicilarTab() {
  const [users, setUsers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'host', phone: '', specialty: '', color: '#60a5fa' })
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/admin/users`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setUsers).catch(() => {})
  }, [])

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch(`/api/yonetici/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok) { setUsers([...users, { ...data, active: true }]); setShowForm(false); setForm({ email: '', name: '', password: '', role: 'host', phone: '', specialty: '', color: '#60a5fa' }) }
    else setError(data.error || 'Hata')
  }

  async function toggleActive(u: User) {
    const res = await fetch(`/api/yonetici/users/${u.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ active: !u.active }),
    })
    if (res.ok) setUsers(users.map(x => x.id === u.id ? { ...x, active: !x.active } : x))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--foreground)' }}>Kullanıcı Yönetimi</h1>
        <button onClick={() => setShowForm(!showForm)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer' }}>+ Kullanıcı Ekle</button>
      </div>

      {showForm && (
        <form onSubmit={addUser} style={{ padding: 16, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 500 }}>
          <input placeholder="İsim" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }} />
          <input placeholder="E-posta" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }} />
          <input placeholder="Şifre" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }} />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }}>
            <option value="host">Resepsiyon</option>
            <option value="hekim">Hekim</option>
            <option value="yonetici">Yönetici</option>
          </select>
          <input placeholder="Telefon (opsiyonel)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }} />
          {form.role === 'hekim' && (
            <>
              <input placeholder="Uzmanlık (ör. Ortodonti)" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--foreground-2)' }}>Renk:</span>
                <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: 32, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
              </div>
            </>
          )}
          <button type="submit" style={{ padding: '8px 14px', borderRadius: 6, background: 'var(--success)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>Oluştur</button>
          {error && <div style={{ gridColumn: '1/-1', fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{['İsim', 'E-posta', 'Rol', 'Durum', 'İşlem'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--foreground-3)', borderBottom: '1px solid var(--divider)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td style={{ padding: '10px 12px', fontSize: 14, color: 'var(--foreground)', borderBottom: '1px solid var(--divider)' }}>{u.name}</td>
              <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--foreground-2)', borderBottom: '1px solid var(--divider)' }}>{u.email}</td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--divider)' }}>
                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: u.role === 'yonetici' ? 'rgba(239,68,68,0.1)' : u.role === 'hekim' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)', color: u.role === 'yonetici' ? 'var(--danger)' : u.role === 'hekim' ? 'var(--accent)' : 'var(--success)' }}>
                  {u.role === 'yonetici' ? 'Yönetici' : u.role === 'hekim' ? 'Hekim' : 'Resepsiyon'}
                </span>
              </td>
              <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--divider)', color: u.active ? 'var(--success)' : 'var(--foreground-3)' }}>{u.active ? 'Aktif' : 'Pasif'}</td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--divider)' }}>
                <button onClick={() => toggleActive(u)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                  {u.active ? 'Deaktif Et' : 'Aktif Et'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && <p style={{ color: 'var(--foreground-3)', fontSize: 14, marginTop: 16 }}>Kullanıcı bulunamadı.</p>}
    </div>
  )
}
