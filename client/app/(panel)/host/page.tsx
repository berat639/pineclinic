'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '../../../lib/auth-context'
import { ThemeToggle } from '../../theme-provider'

const DashboardTab = dynamic(() => import('./tabs/DashboardTab'), { ssr: false })
const TakvimTab = dynamic(() => import('./tabs/TakvimTab'), { ssr: false })
const HastalarTab = dynamic(() => import('./tabs/HastalarTab'), { ssr: false })
const OdemeTab = dynamic(() => import('./tabs/OdemeTab'), { ssr: false })
const BeklemeTab = dynamic(() => import('./tabs/BeklemeTab'), { ssr: false })

type Tab = 'dashboard' | 'takvim' | 'hastalar' | 'odeme' | 'bekleme'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'takvim', label: 'Takvim' },
  { id: 'hastalar', label: 'Hastalar' },
  { id: 'odeme', label: 'Ödeme' },
  { id: 'bekleme', label: 'Bekleme' },
]

export default function HostPage() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(0.8rem, 2vw, 1.5rem) clamp(0.7rem, 2vw, 1rem)' }}>
      <div style={{ width: '100%', maxWidth: 1200, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'clamp(1rem, 2.6vw, 1.1rem)', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Resepsiyon</h1>
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
          {tab === 'hastalar' && <HastalarTab />}
          {tab === 'odeme' && <OdemeTab />}
          {tab === 'bekleme' && <BeklemeTab />}
        </div>
      </div>
    </div>
  )
}
