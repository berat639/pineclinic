'use client'

import { useAuth } from '../../../lib/auth-context'
import { ThemeToggle } from '../../theme-provider'

export default function HekimPage() {
  const { user, logout } = useAuth()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(0.8rem, 2vw, 1.5rem) clamp(0.7rem, 2vw, 1rem)' }}>
      <div style={{ width: '100%', maxWidth: 1200, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'clamp(1rem, 2.6vw, 1.1rem)', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Hekim Paneli</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</span>
          <ThemeToggle />
          <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--foreground-3)' }}>Çıkış</button>
        </div>
      </div>

      <div style={{ padding: 40, textAlign: 'center', color: 'var(--foreground-3)', fontSize: '0.9rem' }}>
        Ekranlar tamamen boşaltıldı. Tüm işlemler Yönetici panelinde toplanmıştır.
      </div>
    </div>
  )
}
