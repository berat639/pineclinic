'use client'

import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../../../lib/auth-context'
import ConfirmModal from '../../../admin/components/ConfirmModal'
import { Pencil, Trash2, User as UserIcon, Lock, Check, X } from 'lucide-react'
import { useBackdropDismiss } from '../../../../hooks/useBackdropDismiss'
import { PhoneMaskedInput } from '@/lib/phone-mask'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface User { id: string; email: string; name: string; role: string; active: boolean; phone?: string; specialty?: string; color?: string }

const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13, width: '100%', boxSizing: 'border-box' }
const btnStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }

export default function KullanicilarTab() {
  const { user } = useAuth()
  const editUserBackdropDismiss = useBackdropDismiss(() => setEditingUser(null))
  const [users, setUsers] = useState<User[]>([])
  const activeAdminCount = users.filter((x) => x.role === 'yonetici' && x.active !== false).length
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'hekim', phone: '', specialty: '', color: '#60a5fa' })
  const [error, setError] = useState('')

  // Edit states
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

  const fetchUsers = () => {
    fetch(`/api/admin/users`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setUsers).catch(() => { })
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch(`/api/yonetici/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers([...users, { ...data, active: true }]);
      setShowForm(false);
      setForm({ email: '', name: '', password: '', role: 'hekim', phone: '', specialty: '', color: '#60a5fa' });
      fetchUsers();
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
    if (editingUser.id === user?.id && !editForm.active) {
      const msg = 'Güvenlik Uyarısı: Kendi yönetici hesabınızı donduramazsınız.'
      setEditError(msg)
      toast.error(msg)
      return
    }
    if (editingUser.role === 'yonetici' && editingUser.active !== false && activeAdminCount <= 1 && (!editForm.active || editForm.role !== 'yonetici')) {
      const msg = 'Güvenlik Uyarısı: Klinikteki tek aktif yönetici hesabı dondurulamaz veya yetkisi düşürülemez.'
      setEditError(msg)
      toast.error(msg)
      return
    }
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
      if (!editForm.active && editingUser.active && Number(data.unassignedAppointmentsCount) > 0) {
        toast.success(`${editForm.name} hesabı donduruldu. Gelecekteki ${data.unassignedAppointmentsCount} randevu boşa çıkarıldı (Atama Bekliyor).`)
      } else {
        toast.success('Kullanıcı bilgileri güncellendi.')
      }
      fetchUsers()
    } catch (err: any) {
      setEditError(err.message || 'Hata oluştu')
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
      if (!res.ok) throw new Error('Silinemedi')
      setUsers(prev => prev.filter(x => x.id !== u.id))
      setEditingUser(null)
      setConfirmDeleteUser(null)
      fetchUsers()
    } catch (err: any) {
      alert(err.message || 'Silme işlemi başarısız')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--foreground)' }}>Kullanıcı Yönetimi</h1>
        <button onClick={() => setShowForm(!showForm)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer' }}>
          {showForm ? 'İptal' : '+ Kullanıcı Ekle'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addUser} style={{ padding: 16, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 540 }}>
          <input placeholder="İsim *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
          <input placeholder="E-posta *" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required style={inputStyle} />
          <input placeholder="Şifre *" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} style={inputStyle} />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle}>
            <option value="hekim">Hekim</option>
            <option value="host">Resepsiyon</option>
          </select>
          <PhoneMaskedInput placeholder="Telefon — 0 (5XX) XXX XX XX (opsiyonel)" value={form.phone} onValueChange={phone => setForm({ ...form, phone })} style={inputStyle} />
          {form.role === 'hekim' && (
            <>
              <input placeholder="Uzmanlık (ör. Ortodonti)" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} style={inputStyle} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--foreground-2)' }}>Renk:</span>
                <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: 32, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
              </div>
            </>
          )}
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="submit" style={btnStyle}>Oluştur</button>
          </div>
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
              <td style={{ padding: '10px 12px', fontSize: 14, color: 'var(--foreground)', borderBottom: '1px solid var(--divider)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {u.color && <span style={{ width: 10, height: 10, borderRadius: '50%', background: u.color, display: 'inline-block' }} />}
                  <span style={{ fontWeight: 500 }}>{u.name}</span>
                </div>
              </td>
              <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--foreground-2)', borderBottom: '1px solid var(--divider)' }}>{u.email}</td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--divider)' }}>
                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: u.role === 'yonetici' ? 'rgba(239,68,68,0.1)' : u.role === 'hekim' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)', color: u.role === 'yonetici' ? 'var(--danger)' : u.role === 'hekim' ? 'var(--accent)' : 'var(--success)', fontWeight: 600 }}>
                  {u.role === 'yonetici' ? 'Yönetici' : u.role === 'hekim' ? 'Hekim' : 'Resepsiyon'}
                </span>
              </td>
              <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--divider)' }}>
                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: u.active ? 'rgba(34, 197, 94, 0.12)' : 'rgba(148, 163, 184, 0.12)', color: u.active ? '#22c55e' : '#94a3b8', fontWeight: 600 }}>
                  {u.active ? 'Aktif' : 'Pasif'}
                </span>
              </td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--divider)' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => openEditModal(u)}
                    style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--foreground)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Pencil size={12} /> Düzenle
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && <p style={{ color: 'var(--foreground-3)', fontSize: 14, marginTop: 16 }}>Kullanıcı bulunamadı.</p>}

      {/* Edit User Modal (Yeni Randevu 460px Standardı) */}
      {editingUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: 16
          }}
          {...editUserBackdropDismiss}
        >
          <form
            role="dialog"
            aria-modal="true"
            onSubmit={handleUpdateUser}
            onClick={e => e.stopPropagation()}
            style={{
              width: 'calc(100vw - 24px)',
              maxWidth: 460,
              maxHeight: '90vh',
              background: 'var(--card-bg)',
              borderRadius: 14,
              border: '1.5px solid var(--input-border)',
              boxShadow: 'var(--pc-modal-shadow)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#2563eb', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--pc-clay-primary)', flexShrink: 0 }}>
                  <UserIcon size={17} color="#ffffff" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2 }}>Personel Düzenle</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginTop: 2 }}>{editingUser.email}</div>
                </div>
              </div>
              <button type="button" onClick={() => setEditingUser(null)} aria-label="Kapat" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'var(--pc-clay-btn)' }}>
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 20px', flex: 1, overflowY: 'auto', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--card-inner)', padding: 14, borderRadius: 10, border: '1px solid var(--input-border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--foreground)' }}>Personel Bilgileri</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>Ad Soyad *</label>
                    <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>E-posta *</label>
                    <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} required style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>Telefon</label>
                    <PhoneMaskedInput placeholder="0 (5XX) XXX XX XX" value={editForm.phone} onValueChange={phone => setEditForm({ ...editForm, phone })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>Rol</label>
                    {editingUser.role === 'yonetici' ? (
                      <input value="Yönetici (Seed User)" disabled style={{ ...inputStyle, opacity: 0.75, cursor: 'not-allowed' }} />
                    ) : (
                      <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} style={inputStyle}>
                        <option value="hekim">Hekim</option>
                        <option value="host">Resepsiyon</option>
                      </select>
                    )}
                  </div>
                </div>

                {editForm.role === 'hekim' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>Uzmanlık</label>
                      <input value={editForm.specialty} onChange={e => setEditForm({ ...editForm, specialty: e.target.value })} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>Renk</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34 }}>
                        <input type="color" value={editForm.color} onChange={e => setEditForm({ ...editForm, color: e.target.value })} style={{ width: 40, height: 30, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                        <span style={{ fontSize: 12, color: 'var(--foreground-2)' }}>{editForm.color}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--input-border)' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--foreground)' }}>Hesap Durumu</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (editingUser.role === 'yonetici') {
                        toast.error('⚠️ Yönetici hesabı yalnızca satışçı tarafından Klinikler sekmesinden dondurulabilir.')
                        return
                      }
                      setEditForm({ ...editForm, active: !editForm.active })
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: editForm.active ? '1px solid var(--btn-mint-border, #86efac)' : '1px solid var(--danger, #ef4444)',
                      background: editForm.active ? 'var(--btn-mint-bg, #f0fdf4)' : 'var(--card-inner)',
                      color: editForm.active ? 'var(--btn-mint-text, #15803d)' : 'var(--danger, #ef4444)',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    {editForm.active ? <Check size={12} /> : <X size={12} />}
                    {editForm.active ? 'Aktif' : 'Donduruldu'}
                  </button>
                </div>
              </div>

              {editError && <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 700 }}>{editError}</div>}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
              {editingUser.role !== 'yonetici' ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteUser(editingUser)}
                  style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--danger)', background: 'var(--card-bg)', color: 'var(--danger)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, boxShadow: 'var(--pc-clay-btn)' }}
                >
                  <Trash2 size={13} /> Sil
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setEditingUser(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--card-bg)', color: 'var(--foreground)', fontSize: '0.86rem', fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--pc-clay-btn)' }}>İptal</button>
                <button type="submit" disabled={isSavingUser} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#ffffff', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--pc-clay-primary)' }}><span style={{ color: '#ffffff' }}>{isSavingUser ? 'Kaydediliyor...' : 'Kaydet'}</span></button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDeleteUser && (
        <ConfirmModal
          isOpen={true}
          title="Kullanıcıyı Sil"
          message={`"${confirmDeleteUser.name}" adlı personeli silmek istediğinize emin misiniz?`}
          confirmText="Evet, Sil"
          cancelText="Vazgeç"
          variant="danger"
          onConfirm={() => handleDeleteUser(confirmDeleteUser)}
          onClose={() => setConfirmDeleteUser(null)}
        />
      )}
    </div>
  )
}
