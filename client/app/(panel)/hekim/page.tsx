'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '../../../lib/auth-context'
import { ThemeToggle } from '../../theme-provider'

const DashboardTab = dynamic(() => import('./tabs/DashboardTab'), { ssr: false })
const TakvimTab = dynamic(() => import('./tabs/TakvimTab'), { ssr: false })
const HastalarimTab = dynamic(() => import('./tabs/HastalarimTab'), { ssr: false })
const TedaviTab = dynamic(() => import('./tabs/TedaviTab'), { ssr: false })
const StokTab = dynamic(() => import('./tabs/StokTab'), { ssr: false })
const IstatistikTab = dynamic(() => import('./tabs/IstatistikTab'), { ssr: false })

type Tab = 'dashboard' | 'takvim' | 'hastalarim' | 'tedavi' | 'stok' | 'istatistik'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'takvim', label: 'Takvim' },
  { id: 'hastalarim', label: 'Hastalarım' },
  { id: 'tedavi', label: 'Tedavi' },
  { id: 'stok', label: 'Stok' },
  { id: 'istatistik', label: 'İstatistik' },
]

export default function HekimPage() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(0.8rem, 2vw, 1.5rem) clamp(0.7rem, 2vw, 1rem)' }}>
      <div style={{ width: '100%', maxWidth: 1200, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'clamp(1rem, 2.6vw, 1.1rem)', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Hekim Paneli</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</span>
          <ThemeToggle />
          <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--foreground-3)' }}>Çıkış</button>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 1200 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--glass-border)', paddingBottom: 6 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 12px', fontSize: '0.76rem', fontWeight: tab === t.id ? 600 : 500,
              color: tab === t.id ? 'var(--foreground)' : 'var(--foreground-3)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              borderRadius: 8,
            }}>{t.label}</button>
          ))}
        </div>

        <div>
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'takvim' && <TakvimTab />}
          {tab === 'hastalarim' && <HastalarimTab />}
          {tab === 'tedavi' && <TedaviTab />}
          {tab === 'stok' && <StokTab />}
          {tab === 'istatistik' && <IstatistikTab />}
        </div>
      </div>
    </div>
  )
}
