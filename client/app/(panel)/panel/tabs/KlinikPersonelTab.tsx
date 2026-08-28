'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../../../lib/auth-context'
import ShiftContextMenu from '../../../admin/components/ShiftContextMenu'
import ConfirmModal from '../../../admin/components/ConfirmModal'
import { User as UserIcon, Mail, Phone, Shield, Palette, Lock, Check, X, Pencil, Trash2 } from 'lucide-react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface User { id: string; email: string; name: string; role: string; active: boolean; phone?: string; specialty?: string; color?: string }
interface ShiftItem { id: string; userId: string; userName: string; date: string; startTime: string; endTime: string; shiftType: string }

const inputStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const btnStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }

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
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'hekim', phone: '', specialty: '', color: '#60a5fa' })
  const [error, setError] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [shiftForm, setShiftForm] = useState({ userId: '', date: '', startTime: '09:00', endTime: '18:00' })
  const [showShiftForm, setShowShiftForm] = useState(false)
  const [shiftContextMenu, setShiftContextMenu] = useState<{ x: number, y: number, doctorId: string, date: string } | null>(null)
  
  // Edit user states
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<{
    name: string
    email: string
    phone: string
    role: string
    specialty: string
    color: string
    active: boolean
    password?: string
  }>({ name: '', email: '', phone: '', role: 'hekim', specialty: '', color: '#60a5fa', active: true, password: '' })
  const [editError, setEditError] = useState('')
  const [isSavingUser, setIsSavingUser] = useState(false)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null)

  const [shiftTemplates, setShiftTemplates] = useState<{name: string, start: number, end: number}[]>([])
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateRange, setNewTemplateRange] = useState<[number, number]>([9, 17])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('shiftTemplates')
      if (stored) setShiftTemplates(JSON.parse(stored))
      else setShiftTemplates([
        { name: 'Sabahçı', start: 9, end: 19 },
        { name: 'Öğlenci', start: 12, end: 20 },
        { name: 'Tam Gün', start: 9, end: 20 }
      ])
    } catch {}
  }, [])

  const saveTemplates = (t: {name: string, start: number, end: number}[]) => {
    setShiftTemplates(t)
    localStorage.setItem('shiftTemplates', JSON.stringify(t))
    window.dispatchEvent(new Event('shiftTemplatesUpdated'))
  }

  const fetchData = useCallback(() => {
    fetch(`/api/admin/users`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setUsers).catch(() => {})
    fetch(`/api/shifts`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setShifts).catch(() => {})
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  async function addUser(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const res = await fetch(`/api/yonetici/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) })
    const data = await res.json()
    if (res.ok) { 
      setUsers([...users, { ...data, active: true }]); 
      setShowUserForm(false); 
      setForm({ email: '', name: '', password: '', role: 'hekim', phone: '', specialty: '', color: '#60a5fa' })
      import('react-hot-toast').then(m => m.toast.success('Yeni kullanıcı oluşturuldu'))
      fetchData()
    }
    else setError(data.error || 'Hata')
  }

  const openEditModal = (u: User) => {
    setEditingUser(u)
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role || 'hekim',
      specialty: u.specialty || '',
      color: u.color || '#60a5fa',
      active: u.active ?? true,
      password: ''
    })
    setEditError('')
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser) return
    setIsSavingUser(true)
    setEditError('')
    try {
      const payload: any = {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
        specialty: editForm.role === 'hekim' ? editForm.specialty : null,
        color: editForm.role === 'hekim' ? editForm.color : null,
        active: editForm.active
      }
      if (editForm.password && editForm.password.trim().length >= 6) {
        payload.password = editForm.password.trim()
      }
      const res = await fetch(`/api/yonetici/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Güncelleme başarısız')
      
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...payload } : u))
      setEditingUser(null)
      import('react-hot-toast').then(m => m.toast.success('Kullanıcı güncellendi'))
      fetchData()
    } catch (err: any) {
      setEditError(err.message || 'Hata oluştu')
      import('react-hot-toast').then(m => m.toast.error(err.message || 'Hata oluştu'))
    } finally {
      setIsSavingUser(false)
    }
  }

  async function handleDeleteUser(u: User) {
    try {
      const res = await fetch(`/api/yonetici/users/${u.id}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Silinemedi')
      }
      setUsers(prev => prev.filter(x => x.id !== u.id))
      setEditingUser(null)
      setConfirmDeleteUser(null)
      import('react-hot-toast').then(m => m.toast.success('Kullanıcı başarıyla silindi'))
      fetchData()
    } catch (err: any) {
      import('react-hot-toast').then(m => m.toast.error(err.message || 'Silme işlemi başarısız'))
    }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Klinik Personeli</h2>
        <span style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', background: 'var(--glass-bg)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
          {users.length} kişi
        </span>
        <button onClick={() => setShowUserForm(!showUserForm)} style={btnStyle}>
          {showUserForm ? 'İptal' : '+ Yeni Personel Ekle'}
        </button>
      </div>

      {showUserForm && (
        <form onSubmit={addUser} className="glass-card" style={{ padding: 18, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, borderRadius: 12 }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Ad Soyad *</label>
            <input placeholder="Örn: Dr. Ahmet Yılmaz" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>E-posta *</label>
            <input placeholder="ahmet@klinik.com" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Şifre * (En az 6 karakter)</label>
            <input placeholder="••••••••" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Telefon</label>
            <input placeholder="05xxxxxxxxx" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Rol *</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="hekim">Hekim</option>
              <option value="host">Resepsiyon</option>
              <option value="yonetici">Yönetici</option>
            </select>
          </div>
          {form.role === 'hekim' && (
            <>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Uzmanlık</label>
                <input placeholder="Örn: Ortodonti, Çene Cerrahisi" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Takvim Rengi</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: 44, height: 34, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--foreground-2)' }}>{form.color}</span>
                </div>
              </div>
            </>
          )}
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
            <button type="button" onClick={() => setShowUserForm(false)} style={{ ...btnStyle, background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--foreground)' }}>Vazgeç</button>
            <button type="submit" style={btnStyle}>Personeli Kaydet</button>
          </div>
          {error && <div style={{ gridColumn: '1/-1', fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>{error}</div>}
        </form>
      )}

      {/* User cards - responsive modern grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12, marginBottom: 36 }}>
        {users.map(u => {
          const role = ROLE_META[u.role] || ROLE_META.host
          return (
            <div 
              key={u.id} 
              className="glass-card" 
              onClick={() => openEditModal(u)}
              style={{ 
                padding: '14px 16px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-bg)',
                position: 'relative'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--glass-border)'
                e.currentTarget.style.transform = 'none'
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setShiftContextMenu({ x: e.clientX, y: e.clientY, doctorId: u.id, date: new Date().toISOString().split('T')[0] })
              }}
            >
              {/* Avatar / Color Indicator */}
              <div style={{ 
                width: 36, 
                height: 36, 
                borderRadius: '50%', 
                background: u.color ? `${u.color}22` : 'rgba(59, 130, 246, 0.12)', 
                border: `2px solid ${u.color || 'var(--accent)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: u.color || 'var(--accent)',
                fontWeight: 700,
                fontSize: '0.85rem',
                flexShrink: 0
              }}>
                {u.name?.charAt(0)?.toUpperCase() || 'P'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.name}
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {u.email}
                </div>
                {u.specialty && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--accent)', marginTop: 2, fontWeight: 500 }}>
                    {u.specialty}
                  </div>
                )}
              </div>

              {/* Status & Role Badges */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 6, background: role.bg, color: role.color, fontWeight: 700 }}>
                    {role.label}
                  </span>
                  <span style={{ 
                    fontSize: '0.65rem', 
                    padding: '2px 6px', 
                    borderRadius: 6, 
                    background: u.active ? 'rgba(34, 197, 94, 0.12)' : 'rgba(148, 163, 184, 0.12)', 
                    color: u.active ? '#22c55e' : '#94a3b8',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: u.active ? '#22c55e' : '#94a3b8' }} />
                    {u.active ? 'Aktif' : 'Pasif'}
                  </span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    openEditModal(u)
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--foreground-3)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 4px',
                    borderRadius: 4,
                    transition: 'color 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--foreground-3)'}
                >
                  <Pencil size={12} /> Düzenle
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Kullanıcı Düzenleme Modalı ── */}
      {editingUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: 16
          }}
          onClick={() => setEditingUser(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'var(--background-2, #0f172a)',
              borderRadius: 16,
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.12))',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              padding: 24,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: editForm.color ? `${editForm.color}22` : 'rgba(59, 130, 246, 0.12)',
                  border: `2px solid ${editForm.color || 'var(--accent)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: editForm.color || 'var(--accent)'
                }}>
                  <UserIcon size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--foreground)' }}>Personel Düzenle</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)' }}>{editingUser.email}</div>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Ad Soyad *</label>
                  <input
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>E-posta *</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Telefon</label>
                  <input
                    value={editForm.phone}
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="05xxxxxxxxx"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Rol</label>
                  <select
                    value={editForm.role}
                    onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="hekim">Hekim</option>
                    <option value="host">Resepsiyon</option>
                    <option value="yonetici">Yönetici</option>
                  </select>
                </div>
              </div>

              {editForm.role === 'hekim' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Uzmanlık</label>
                    <input
                      value={editForm.specialty}
                      onChange={e => setEditForm({ ...editForm, specialty: e.target.value })}
                      placeholder="Örn: Ortodonti, Pedodonti"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Takvim Rengi</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                      <input
                        type="color"
                        value={editForm.color}
                        onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                        style={{ width: 44, height: 34, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--foreground-2)', fontWeight: 600 }}>{editForm.color}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Password Reset (Optional) */}
              <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Lock size={14} color="var(--foreground-3)" /> Yeni Şifre Belirle <span style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', fontWeight: 400 }}>(İsteğe bağlı, boş bırakılırsa değişmez)</span>
                </label>
                <input
                  type="password"
                  placeholder="En az 6 karakterli yeni şifre"
                  value={editForm.password || ''}
                  onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                  style={inputStyle}
                  minLength={6}
                />
              </div>

              {/* Active Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>Hesap Durumu</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>Pasif yapılan personel sisteme giriş yapamaz.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, active: !editForm.active })}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: editForm.active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: editForm.active ? '#22c55e' : '#ef4444',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {editForm.active ? <Check size={14} /> : <X size={14} />}
                  {editForm.active ? 'Aktif' : 'Pasif'}
                </button>
              </div>

              {editError && (
                <div style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 600, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)' }}>
                  ⚠️ {editError}
                </div>
              )}

              {/* Footer Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteUser(editingUser)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.08)',
                    color: '#ef4444',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Trash2 size={14} /> Kullanıcıyı Sil
                </button>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid var(--glass-border)',
                      background: 'transparent',
                      color: 'var(--foreground-2)',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingUser}
                    style={{
                      ...btnStyle,
                      padding: '8px 20px',
                      background: 'var(--accent)',
                      opacity: isSavingUser ? 0.7 : 1
                    }}
                  >
                    {isSavingUser ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteUser && (
        <ConfirmModal
          isOpen={true}
          title="Kullanıcıyı Sil"
          message={`"${confirmDeleteUser.name}" adlı kullanıcıyı sistemden kalıcı olarak silmek istediğinize emin misiniz?`}
          confirmText="Evet, Sil"
          cancelText="Vazgeç"
          variant="danger"
          onConfirm={() => handleDeleteUser(confirmDeleteUser)}
          onClose={() => setConfirmDeleteUser(null)}
        />
      )}

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
      {shiftContextMenu && (
        <ShiftContextMenu
          x={shiftContextMenu.x}
          y={shiftContextMenu.y}
          doctorId={shiftContextMenu.doctorId}
          users={users}
          date={shiftContextMenu.date}
          onClose={() => setShiftContextMenu(null)}
          onSave={async (shift) => {
            await fetch('/api/shifts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(shift)
            })
            setShiftContextMenu(null)
            fetchData()
          }}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 6 }}>
        {days.map(d => {
          const dayShifts = shifts.filter(s => s.date === d)
          const isToday = d === new Date().toISOString().split('T')[0]
          return (
            <div 
            key={d} 
            className="glass-card" 
            style={{ padding: 10, minHeight: 90, borderLeft: isToday ? '3px solid var(--accent)' : undefined, cursor: 'context-menu' }}
            onContextMenu={(e) => {
              e.preventDefault();
              setShiftContextMenu({ x: e.clientX, y: e.clientY, doctorId: '', date: d })
            }}
            >
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

      {/* Vardiya Türleri (Şablon) Yönetimi */}
      <div style={{ marginTop: 32, padding: 20, background: 'var(--glass-bg)', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: 16 }}>Vardiya Şablonları</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          
          {/* List */}
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--foreground-3)', marginBottom: 8 }}>Mevcut Şablonlar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shiftTemplates.map((t, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>{t.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)' }}>
                      {Math.floor(t.start).toString().padStart(2, '0')}:{(t.start % 1 === 0.5) ? '30' : '00'} - {Math.floor(t.end).toString().padStart(2, '0')}:{(t.end % 1 === 0.5) ? '30' : '00'}
                    </div>
                  </div>
                  <button 
                    onClick={() => saveTemplates(shiftTemplates.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem' }}
                  >Sil</button>
                </div>
              ))}
            </div>
          </div>

          {/* Add Form */}
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--foreground-3)', marginBottom: 8 }}>Yeni Şablon Ekle</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input 
                placeholder="Şablon Adı (Örn: Nöbetçi)" 
                value={newTemplateName} 
                onChange={e => setNewTemplateName(e.target.value)} 
                style={inputStyle} 
              />
              
              <div style={{ padding: '0 8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--foreground-2)', marginBottom: 8 }}>
                  <span>Başlangıç: {newTemplateRange[0]}:00</span>
                  <span>Bitiş: {newTemplateRange[1]}:00</span>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <input 
                    type="range" 
                    min={0} 
                    max={23} 
                    value={newTemplateRange[0]} 
                    onChange={e => setNewTemplateRange([Math.min(Number(e.target.value), newTemplateRange[1] - 1), newTemplateRange[1]])}
                    style={{ flex: 1, accentColor: 'var(--accent)' }}
                  />
                  <input 
                    type="range" 
                    min={1} 
                    max={24} 
                    value={newTemplateRange[1]} 
                    onChange={e => setNewTemplateRange([newTemplateRange[0], Math.max(Number(e.target.value), newTemplateRange[0] + 1)])}
                    style={{ flex: 1, accentColor: 'var(--accent)' }}
                  />
                </div>
              </div>

              <button 
                onClick={() => {
                  if (!newTemplateName.trim()) return
                  saveTemplates([...shiftTemplates, { name: newTemplateName.trim(), start: newTemplateRange[0], end: newTemplateRange[1] }])
                  setNewTemplateName('')
                  setNewTemplateRange([9, 17])
                }}
                style={{ ...btnStyle, marginTop: 4, width: 'fit-content' }}
              >
                + Şablonu Kaydet
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
