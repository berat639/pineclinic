'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Giriş başarısız'); return }
      router.push('/panel')
    } catch { setError('Sunucuya bağlanılamadı') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 380, padding: 32, borderRadius: 12, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, color: 'var(--foreground)', textAlign: 'center' }}>Giriş Yap</h1>

        {error && <div style={{ padding: '8px 12px', marginBottom: 16, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--foreground-2)', marginBottom: 4, display: 'block' }}>E-posta</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: 14, outline: 'none' }} />
        </label>

        <label style={{ display: 'block', marginBottom: 24 }}>
          <span style={{ fontSize: 13, color: 'var(--foreground-2)', marginBottom: 4, display: 'block' }}>Şifre</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: 14, outline: 'none' }} />
        </label>

        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 500, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Giriş yapılıyor...' : 'Giriş'}
        </button>
      </form>
    </div>
  )
}
