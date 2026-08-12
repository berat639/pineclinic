'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '../../../lib/auth-context'
import { ThemeToggle } from '../../theme-provider'

import CalendarTab from '../../admin/components/CalendarTab'
import AppointmentsTab from '../../admin/components/AppointmentsTab'
import PaymentsTab from '../../admin/components/PaymentsTab'
import StatsBar from '../../admin/components/StatsBar'
import KnowledgeTab from '../../admin/components/KnowledgeTab'
import IntegrationsTab from '../../admin/components/IntegrationsTab'

const FinansalTab = dynamic(() => import('./tabs/FinansalTab'), { ssr: false })
const StokTab = dynamic(() => import('./tabs/StokTab'), { ssr: false })
const KlinikPersonelTab = dynamic(() => import('./tabs/KlinikPersonelTab'), { ssr: false })

type Tab = 'calendar' | 'appointments' | 'payments' | 'stok' | 'knowledge' | 'klinik' | 'integrations'

const TABS: { id: Tab; label: string }[] = [
  { id: 'calendar', label: 'Takvim' },
  { id: 'appointments', label: 'Randevular' },
  { id: 'payments', label: 'Ödemeler & Finans' },
  { id: 'stok', label: 'Stok & Bakım' },
  { id: 'knowledge', label: 'Bilgi Tabanı' },
  { id: 'klinik', label: 'Klinik Personeli' },
  { id: 'integrations', label: 'Entegrasyonlar (Ayarlar)' },
]

export default function YoneticiPage() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('calendar')
  const [appointments, setAppointments] = useState<any[]>([])

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
  const fetchAppts = useCallback(() => {
    fetch(`${BACKEND}/api/appointments`).then(r => r.ok ? r.json() : []).then(setAppointments).catch(() => {})
  }, [])
  useEffect(() => { fetchAppts() }, [fetchAppts])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(0.8rem, 2vw, 1.5rem) clamp(0.7rem, 2vw, 1rem)' }}>
      <div style={{ width: '100%', maxWidth: 1200, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'clamp(1rem, 2.6vw, 1.1rem)', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Yönetici Paneli</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</span>
          <ThemeToggle />
          <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--foreground-3)' }}>Çıkış</button>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 1200, marginBottom: 16 }}>
        <StatsBar />
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
          {tab === 'calendar' && <CalendarTab />}
          {tab === 'appointments' && <AppointmentsTab appointments={appointments} onDelete={id => setAppointments(prev => prev.filter(a => a.id !== id))} />}
          {tab === 'payments' && (
            <div style={{ width: '100%' }}>
              <PaymentsTab />
              <div style={{ marginTop: 32 }}><FinansalTab /></div>
            </div>
          )}
          {tab === 'stok' && <StokTab />}
          {tab === 'knowledge' && <KnowledgeTab />}
          {tab === 'klinik' && <KlinikPersonelTab />}
          {tab === 'integrations' && <IntegrationsTab apiPrefix="/api/yonetici/integrations" />}
        </div>
      </div>
    </div>
  )
}
