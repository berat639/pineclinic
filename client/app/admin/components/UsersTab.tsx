'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { PhoneMaskedInput } from '@/lib/phone-mask'
import { Mail, ShieldAlert, Snowflake, Play, Trash2, Pencil, X, Send } from 'lucide-react'

interface User {
  id: string
  email: string
  name: string
  role: string
  active: boolean
  phone?: string
  specialty?: string
  color?: string
}

interface SmtpStatus {
  configured: boolean
  enabled: boolean
  ready: boolean
  fromAddress: string | null
  message: string
}

const inputStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 10,
  border: '1.5px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--foreground)',
  boxShadow: 'var(--pc-neo-inset)',
  fontSize: '0.8rem',
  fontWeight: 600,
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

const btnStyle: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  border: '1px solid #1d4ed8',
  background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  boxShadow: 'var(--pc-clay-primary)',
  fontSize: '0.8rem',
  fontWeight: 750,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const outlineBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid var(--btn-clinic-outline-border, #93c5fd)',
  background: 'var(--btn-clinic-outline-bg, #eff6ff)',
  color: 'var(--btn-clinic-outline-text, #1d4ed8)',
  boxShadow: 'var(--pc-clay-btn)',
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'var(--foreground-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '12px 14px', color: 'var(--foreground-2)', fontSize: '0.8rem' }

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  yonetici: { label: 'Yönetici', color: '#0369a1', bg: 'var(--badge-clinic-bg, #e0f2fe)' },
  hekim: { label: 'Hekim', color: '#0284c7', bg: 'var(--badge-clinic-bg, #e0f2fe)' },
  host: { label: 'Kayıt / Resepsiyon', color: '#15803d', bg: 'var(--btn-mint-bg, #f0fdf4)' },
}

export default function UsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [smtpStatus, setSmtpStatus] = useState<SmtpStatus>({
    configured: true,
    enabled: true,
    ready: true,
    fromAddress: null,
    message: '',
  })
  const [showModal, setShowModal] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', name: '', role: 'host', phone: '', specialty: '', color: '#0284c7' })
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(() => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => {})

    fetch('/api/yonetici/users/invitations', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.smtpStatus) setSmtpStatus(data.smtpStatus)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filtered = search
    ? users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    : users

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      if (editingUserId) {
        const res = await fetch(`/api/yonetici/users/${editingUserId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(form),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setShowModal(false)
          setEditingUserId(null)
          toast.success('Personel bilgileri güncellendi')
          loadData()
        } else {
          setError(data.error || 'Hata')
        }
      } else {
        if (!smtpStatus.ready) {
          setError(smtpStatus.message || 'E-Posta (SMTP) entegrasyonu tamamlanmadan personel daveti gönderilemez.')
          return
        }
        const res = await fetch('/api/yonetici/users/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(form),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setShowModal(false)
          setForm({ email: '', name: '', role: 'host', phone: '', specialty: '', color: '#0284c7' })
          toast.success('KVKK uyumlu davet e-postası gönderildi')
          loadData()
        } else {
          setError(data.error || 'Davet gönderilemedi')
        }
      }
    } finally {
      setSaving(false)
    }
  }

  function handleEditClick(u: User) {
    setForm({
      email: u.email,
      name: u.name,
      role: u.role,
      phone: u.phone || '',
      specialty: u.specialty || '',
      color: u.color || '#0284c7',
    })
    setEditingUserId(u.id)
    setShowModal(true)
    setError('')
  }

  async function toggleActive(u: User) {
    const res = await fetch(`/api/yonetici/users/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ active: !u.active }),
    })
    if (res.ok) {
      setUsers(users.map((x) => (x.id === u.id ? { ...x, active: !u.active } : x)))
      toast.success(!u.active ? 'Hesap yeniden aktifleştirildi' : 'Hesap donduruldu')
    }
  }

  async function removeUserKvkk(u: User) {
    const res = await fetch(`/api/yonetici/users/${u.id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      toast.success(data.message || 'Personel KVKK uyumlu kaldırıldı')
      loadData()
    } else {
      toast.error(data.error || 'İşlem başarısız')
    }
  }

  return (
    <div style={{ maxWidth: 1100, width: '100%' }}>
      {!smtpStatus.ready && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            marginBottom: 14,
            borderRadius: 12,
            background: 'var(--card-inner)',
            border: '1.5px solid var(--danger, #ef4444)',
            boxShadow: 'var(--pc-neo-subcard)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--danger, #ef4444)',
            fontSize: '0.8rem',
            fontWeight: 700,
          }}
        >
          <ShieldAlert size={18} />
          <span>{smtpStatus.message || 'E-Posta (SMTP) entegrasyonu tamamlanmadan personel daveti gönderilemez.'}</span>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          marginBottom: 14,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          background: 'var(--card-bg)',
          border: '1.5px solid var(--input-border)',
          borderRadius: 14,
          boxShadow: 'var(--pc-neo-card)',
        }}
      >
        <input
          placeholder="Kullanıcı ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 150, width: 'auto' }}
        />
        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--foreground-3)', padding: '0 8px' }}>
          {users.length} kullanıcı · {users.filter((u) => u.role === 'hekim').length} hekim
        </div>
        <button
          onClick={() => {
            setShowModal(true)
            setEditingUserId(null)
            setForm({ email: '', name: '', role: 'hekim', phone: '', specialty: '', color: '#0284c7' })
            setError('')
          }}
          className="btn-clinic-primary"
          style={btnStyle}
        >
          <Mail size={15} color="#ffffff" />
          <span style={{ color: '#ffffff' }}>+ E-Posta ile Davet Et</span>
        </button>
      </div>

      {/* Modal (Yeni Randevu 460px Standart Modal) */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            zIndex: 100020,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <form
            onSubmit={submitForm}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 460,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--card-bg)',
              borderRadius: 14,
              border: '1.5px solid var(--input-border)',
              boxShadow: 'var(--pc-modal-shadow)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--foreground)' }}>
                {editingUserId ? 'Personel Düzenle' : 'KVKK Uyumlu Personel Daveti'}
              </div>
              <button type="button" onClick={() => setShowModal(false)} style={{ ...outlineBtnStyle, padding: 6 }}>
                <X size={15} />
              </button>
            </div>
            <input placeholder="Ad Soyad *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
            <input placeholder="E-posta *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required style={inputStyle} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="hekim">Hekim</option>
              <option value="host">Kayıt / Resepsiyon</option>
              <option value="yonetici">Yönetici</option>
            </select>
            <PhoneMaskedInput placeholder="Telefon — 0 (5XX) XXX XX XX" value={form.phone} onValueChange={(phone) => setForm({ ...form, phone })} style={inputStyle} />
            {form.role === 'hekim' && (
              <>
                <input placeholder="Uzmanlık (ör. Ortodonti)" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} style={inputStyle} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground-2)' }}>Takvim Rengi:</span>
                  <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ width: 38, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                </div>
              </>
            )}
            {error && <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--danger)' }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setShowModal(false)} style={outlineBtnStyle}>
                Vazgeç
              </button>
              <button type="submit" disabled={saving} className="btn-clinic-primary" style={btnStyle}>
                <Send size={14} color="#ffffff" />
                <span style={{ color: '#ffffff' }}>{editingUserId ? 'Güncelle' : 'Davet Gönder'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1.5px solid var(--input-border)',
          borderRadius: 14,
          boxShadow: 'var(--pc-neo-card)',
          overflow: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
              <th style={thStyle}>Personel</th>
              <th style={thStyle}>Rol</th>
              <th style={thStyle}>Uzmanlık</th>
              <th style={thStyle}>Durum</th>
              <th style={{ ...thStyle, width: 180 }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const role = ROLE_META[u.role] || ROLE_META.host
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--input-border)' }}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {u.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.color, flexShrink: 0 }} />}
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '0.82rem' }}>{u.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', marginTop: 1 }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, background: role.bg, color: role.color }}>
                      {role.label}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--foreground-3)', fontSize: '0.75rem' }}>{u.specialty || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: u.active ? '#15803d' : 'var(--danger)' }}>
                      {u.active ? 'Aktif' : 'Donduruldu'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={() => toggleActive(u)} style={{ ...outlineBtnStyle, padding: '4px 8px', fontSize: '0.68rem' }}>
                        {u.active ? <Snowflake size={12} /> : <Play size={12} />}
                        {u.active ? 'Dondur' : 'Aktifleştir'}
                      </button>
                      <button onClick={() => handleEditClick(u)} style={{ ...outlineBtnStyle, padding: '4px 8px', fontSize: '0.68rem' }}>
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => removeUserKvkk(u)}
                        style={{ ...outlineBtnStyle, padding: '4px 8px', fontSize: '0.68rem', border: '1px solid var(--danger)', color: 'var(--danger)' }}
                        title="KVKK Uyumlu Kaldır"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--foreground-3)', fontSize: '0.8rem' }}>
                  {search ? 'Aramayla eşleşen kullanıcı yok' : 'Henüz kullanıcı yok'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
