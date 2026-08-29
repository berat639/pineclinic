'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '../../../lib/auth-context'
import { ThemeToggle } from '../../theme-provider'

import CalendarTab from '../../admin/components/CalendarTab'
import PatientsTab from '../../admin/components/PatientsTab'
import PaymentsTab from '../../admin/components/PaymentsTab'
import StatsBar from '../../admin/components/StatsBar'
import KnowledgeTab from '../../admin/components/KnowledgeTab'
import IntegrationsTab from '../../admin/components/IntegrationsTab'

const FinansalTab = dynamic(() => import('./tabs/FinansalTab'), { ssr: false })
const StokTab = dynamic(() => import('./tabs/StokTab'), { ssr: false })
const KlinikPersonelTab = dynamic(() => import('./tabs/KlinikPersonelTab'), { ssr: false })

type Tab = 'calendar' | 'patients' | 'payments' | 'stok' | 'knowledge' | 'klinik' | 'integrations'

const TABS: { id: Tab; label: string }[] = [
  { id: 'calendar', label: 'Takvim' },
  { id: 'patients', label: 'Hastalar' },
  { id: 'payments', label: 'Ödemeler & Finans' },
  { id: 'stok', label: 'Stok & Bakım' },
  { id: 'knowledge', label: 'Bilgi Tabanı' },
  { id: 'klinik', label: 'Klinik Personeli' },
  { id: 'integrations', label: 'Entegrasyonlar (Ayarlar)' },
]

export default function YoneticiPage() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState<Tab | null>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  const [allowedTabs, setAllowedTabs] = useState<Tab[] | null>(null)

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
  const fetchAppts = useCallback(() => {
    fetch(`/api/appointments`).then(r => r.ok ? r.json() : []).then(setAppointments).catch(() => {})
  }, [])
  useEffect(() => { fetchAppts() }, [fetchAppts])

  useEffect(() => {
    if (!user) return
    if (user.role === 'yonetici') {
      setAllowedTabs(TABS.map(t => t.id))
      if (!tab) setTab('calendar')
    } else {
      fetch('/api/admin/settings/roles')
        .then(r => r.json())
        .then(perms => {
          const rolePerms = perms[user.role] || ['calendar']
          setAllowedTabs(rolePerms)
          if (!tab) setTab(rolePerms[0] || 'calendar')
        })
        .catch(() => {
          setAllowedTabs(['calendar'])
          if (!tab) setTab('calendar')
        })
    }
  }, [user, tab])

  const visibleTabs = TABS.filter(t => allowedTabs?.includes(t.id))

  return (
    <div className="admin-content" style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px clamp(20px, 3.5vw, 56px)', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'clamp(1rem, 2.6vw, 1.25rem)', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
          {user?.role === 'yonetici' ? 'Yönetici Paneli' : 'Klinik Paneli'}
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--foreground-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</span>
          <ThemeToggle />
          <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--foreground-3)' }}>Çıkış</button>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '100%', marginBottom: 16 }}>
        <StatsBar />
      </div>

      <div style={{ width: '100%', maxWidth: '100%' }}>
        <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--glass-border)', paddingBottom: 6, width: '100%' }}>
          {allowedTabs === null ? (
            <div style={{ padding: 10, fontSize: 13, color: 'var(--foreground-3)' }}>Yükleniyor...</div>
          ) : (
            visibleTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 14px', fontSize: '0.82rem', fontWeight: tab === t.id ? 600 : 500,
                color: tab === t.id ? 'var(--foreground)' : 'var(--foreground-3)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                borderRadius: 8,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {t.label}
              </button>
            ))
          )}
        </div>

        <div style={{ width: '100%' }}>
          {tab === 'calendar' && <CalendarTab />}
          {tab === 'patients' && <PatientsTab />}
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
