'use client'

import { useEffect, useState } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface User { id: string; email: string; name: string; role: string; active: boolean; phone?: string; specialty?: string; color?: string }

const inputStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none', fontFamily: 'inherit', width: '100%' }
const btnStyle: React.CSSProperties = { padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }
const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }
const tdStyle: React.CSSProperties = { padding: '12px 14px', color: 'var(--foreground-2)', fontSize: '0.8rem' }

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  yonetici: { label: 'Yönetici', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  hekim: { label: 'Hekim', color: 'var(--accent)', bg: 'rgba(59,130,246,0.1)' },
  host: { label: 'Resepsiyon', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
}

export default function UsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'host', phone: '', specialty: '', color: '#60a5fa' })
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`/api/admin/users`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setUsers).catch(() => {})
  }, [])

  const filtered = search
    ? users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    : users

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    
    if (editingUserId) {
      const { password, ...rest } = form
      const body = password ? { ...rest, password } : rest
      const res = await fetch(`/api/yonetici/users/${editingUserId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setUsers(users.map(u => u.id === editingUserId ? { ...u, ...data } : u))
        setShowForm(false)
        setEditingUserId(null)
        setForm({ email: '', name: '', password: '', role: 'host', phone: '', specialty: '', color: '#60a5fa' })
      } else setError(data.error || 'Hata')
    } else {
      const res = await fetch(`/api/yonetici/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        setUsers([...users, { ...data, active: true }])
        setShowForm(false)
        setForm({ email: '', name: '', password: '', role: 'host', phone: '', specialty: '', color: '#60a5fa' })
      } else setError(data.error || 'Hata')
    }
  }

  function handleEditClick(u: User) {
    setForm({
      email: u.email,
      name: u.name,
      password: '', // Boş bırak, sadece değiştirmek istenirse doldurulur
      role: u.role,
      phone: u.phone || '',
      specialty: u.specialty || '',
      color: u.color || '#60a5fa'
    })
    setEditingUserId(u.id)
    setShowForm(true)
    setError('')
  }

  async function toggleActive(u: User) {
    const res = await fetch(`/api/yonetici/users/${u.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ active: !u.active }),
    })
    if (res.ok) setUsers(users.map(x => x.id === u.id ? { ...x, active: !x.active } : x))
  }

  return (
    <div style={{ maxWidth: 1100, width: '100%' }}>
      {/* Header */}
      <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Kullanıcı ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 150, width: 'auto' }}
        />
        <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', padding: '0 8px' }}>
          {users.length} kullanıcı · {users.filter(u => u.role === 'hekim').length} hekim
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditingUserId(null); setForm({ email: '', name: '', password: '', role: 'host', phone: '', specialty: '', color: '#60a5fa' }); setError('') }} style={btnStyle}>
          {showForm && !editingUserId ? 'İptal' : '+ Kullanıcı Ekle'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={submitForm} className="glass-card" style={{ padding: 16, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
          <div style={{ gridColumn: '1 / -1', fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>
            {editingUserId ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı'}
          </div>
          <input placeholder="İsim *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
          <input placeholder="E-posta *" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required style={inputStyle} />
          <input placeholder={editingUserId ? "Şifre (Değiştirmek için)" : "Şifre * (min 6)"} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!editingUserId} minLength={6} style={inputStyle} />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="host">Resepsiyon</option>
            <option value="hekim">Hekim</option>
            <option value="yonetici">Yönetici</option>
          </select>
          <input placeholder="Telefon" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
          {form.role === 'hekim' && (
            <>
              <input placeholder="Uzmanlık (ör. Ortodonti)" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} style={inputStyle} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--foreground-3)' }}>Takvim Rengi:</span>
                <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: 34, height: 30, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
              </div>
            </>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={() => { setShowForm(false); setEditingUserId(null); }} style={{ ...btnStyle, background: 'var(--glass-bg)', color: 'var(--foreground-2)', border: '1px solid var(--glass-border)' }}>Vazgeç</button>
            <button type="submit" style={btnStyle}>{editingUserId ? 'Güncelle' : 'Oluştur'}</button>
          </div>
          {error && <div style={{ gridColumn: '1/-1', fontSize: '0.75rem', color: 'var(--danger)', padding: '4px 0' }}>{error}</div>}
        </form>
      )}

      {/* Users Table (responsive) */}
      <div className="glass-card" style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
              <th style={thStyle}>Kullanıcı</th>
              <th style={thStyle}>Rol</th>
              <th style={{ ...thStyle, display: 'none', '@media(minWidth:768px)': { display: 'table-cell' } } as any}>Uzmanlık</th>
              <th style={thStyle}>Durum</th>
              <th style={{ ...thStyle, width: 80 }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const role = ROLE_META[u.role] || ROLE_META.host
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {u.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.color, flexShrink: 0 }} />}
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '0.82rem' }}>{u.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', marginTop: 1 }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600, background: role.bg, color: role.color }}>
                      {role.label}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--foreground-3)', fontSize: '0.75rem' }}>{u.specialty || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block', background: u.active ? '#10b981' : 'var(--foreground-3)', marginRight: 5 }} />
                    <span style={{ fontSize: '0.72rem', color: u.active ? '#10b981' : 'var(--foreground-3)' }}>{u.active ? 'Aktif' : 'Pasif'}</span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={() => toggleActive(u)} style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: 6, background: u.active ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', border: `1px solid ${u.active ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`, color: u.active ? '#ef4444' : '#10b981', cursor: 'pointer', fontWeight: 500 }}>
                        {u.active ? 'Deaktif' : 'Aktif Et'}
                      </button>
                      <button onClick={() => handleEditClick(u)} style={{ fontSize: '0.68rem', padding: '4px 10px', borderRadius: 6, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--foreground)', cursor: 'pointer', fontWeight: 500 }}>
                        Düzenle
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--foreground-3)', fontSize: '0.8rem' }}>
                {search ? 'Aramayla eşleşen kullanıcı yok' : 'Henüz kullanıcı yok'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
