'use client'
import { useState } from 'react'

export default function AdminLoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'same-origin',
      })

      if (res.ok) {
        // Cookie'nin tarayıcıya yazıldığından ve middleware'in yeni
        // cookie'yi alacağından emin olmak için soft navigation yerine
        // full reload (router.push Chrome'da bazen cookie'yi okumadan
        // redirect ediyor).
        window.location.assign('/admin')
        return
      }

      const data = await res.json()
      setError(data.error || 'Hata oluştu')
    } catch {
      setError('Sunucuya bağlanılamadı')
    }

    setLoading(false)
  }

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: 380,
        padding: '2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.75rem',
        animation: 'fadeIn 0.4s ease',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Admin Paneli</h1>
          <p style={{ color: '#64748b', fontSize: '0.82rem' }}>Devam etmek için şifrenizi girin</p>
        </div>

        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              type="password"
              placeholder="Şifre"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px 12px 40px',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 10,
                color: '#f0f4ff',
                fontSize: '0.95rem',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{ color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="btn btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '12px',
              fontSize: '0.9rem',
              fontWeight: 600,
              opacity: loading || !password ? 0.6 : 1,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </main>
  )
}
