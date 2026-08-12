'use client'

import { useState } from 'react'
import { useAuth } from '../../../lib/auth-context'

export default function ProfilPage() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [msg, setMsg] = useState('')

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const res = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    })
    if (res.ok) { setMsg('Şifre güncellendi'); setCurrentPw(''); setNewPw('') }
    else { const d = await res.json(); setMsg(d.error || 'Hata') }
  }

  if (!user) return null
  const roleLabel = user.role === 'yonetici' ? 'Yönetici' : user.role === 'hekim' ? 'Hekim' : 'Resepsiyon'

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--foreground)', marginBottom: 24 }}>Profil</h1>

      <div style={{ padding: 20, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: 'var(--foreground-3)' }}>E-posta</div>
        <div style={{ fontSize: 15, color: 'var(--foreground)', marginBottom: 12 }}>{user.email}</div>
        <div style={{ fontSize: 14, color: 'var(--foreground-3)' }}>Rol</div>
        <div style={{ fontSize: 15, color: 'var(--foreground)' }}>{roleLabel}</div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--foreground)', marginBottom: 12 }}>Şifre Değiştir</h2>
      <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="password" placeholder="Mevcut şifre" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required
          style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 14 }} />
        <input type="password" placeholder="Yeni şifre (min 6 karakter)" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={6}
          style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 14 }} />
        <button type="submit" style={{ padding: '10px 0', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, cursor: 'pointer' }}>Güncelle</button>
        {msg && <div style={{ fontSize: 13, color: msg.includes('güncellendi') ? '#10b981' : '#ef4444' }}>{msg}</div>}
      </form>
    </div>
  )
}
