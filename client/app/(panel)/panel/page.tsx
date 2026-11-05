'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../lib/auth-context'
import { ThemeToggle } from '../../theme-provider'

import CalendarTab from '../../admin/components/CalendarTab'
import PatientsTab from '../../admin/components/PatientsTab'
import PaymentsTab from '../../admin/components/PaymentsTab'
import StatsBar from '../../admin/components/StatsBar'
import KnowledgeTab from '../../admin/components/KnowledgeTab'
import IntegrationsTab from '../../admin/components/IntegrationsTab'
import FinansalTab from './tabs/FinansalTab'
import StokTab from './tabs/StokTab'
import KlinikPersonelTab from './tabs/KlinikPersonelTab'
import VipAssistantTab from './tabs/VipAssistantTab'
import PlatformClinicsTab from './tabs/PlatformClinicsTab'

type Tab = 'calendar' | 'patients' | 'payments' | 'stok' | 'knowledge' | 'klinik' | 'integrations' | 'vip' | 'platform-clinics'

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'calendar', label: 'Takvim' },
  { id: 'patients', label: 'Hastalar' },
  { id: 'payments', label: 'Ödemeler & Finans' },
  { id: 'stok', label: 'Stok & Bakım' },
  { id: 'knowledge', label: 'Bilgi Tabanı' },
  { id: 'klinik', label: 'Klinik Personeli' },
  { id: 'integrations', label: 'Entegrasyonlar (Ayarlar)' },
]

const PANEL_TAB_STORAGE_KEY = 'voiceai_panel_active_tab'

function resolveInitialPanelTab(allowed: Tab[], defaultTab: Tab): Tab {
  if (typeof window !== 'undefined') {
    const urlTab = new URLSearchParams(window.location.search).get('tab') as Tab | null
    if (urlTab && allowed.includes(urlTab)) return urlTab
    const sessionTab = window.sessionStorage.getItem(PANEL_TAB_STORAGE_KEY) as Tab | null
    if (sessionTab && allowed.includes(sessionTab)) return sessionTab
    const localTab = window.localStorage.getItem(PANEL_TAB_STORAGE_KEY) as Tab | null
    if (localTab && allowed.includes(localTab)) return localTab
  }
  return allowed.includes(defaultTab) ? defaultTab : (allowed[0] || 'calendar')
}

export default function YoneticiPage() {
  const { user, logout } = useAuth()
  const [tab, setTabState] = useState<Tab | null>(null)
  const [allowedTabs, setAllowedTabs] = useState<Tab[] | null>(null)

  const setTab = useCallback((nextTab: Tab) => {
    setTabState(nextTab)
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(PANEL_TAB_STORAGE_KEY, nextTab)
        window.localStorage.setItem(PANEL_TAB_STORAGE_KEY, nextTab)
        const url = new URL(window.location.href)
        url.searchParams.set('tab', nextTab)
        window.history.replaceState(null, '', url.toString())
      } catch {}
    }
  }, [])

  const isModerator = user?.role === 'moderator' || user?.email === 'moderator@klinik.com'

  const roleTabs = isModerator
    ? [{ id: 'vip' as Tab, label: '🌟 Özel Asistan (VIP)' }, ...BASE_TABS]
    : BASE_TABS
  const tabsList = user?.canManagePlatform
    ? [{ id: 'platform-clinics' as Tab, label: 'Klinikler' }, ...roleTabs]
    : roleTabs

  useEffect(() => {
    if (!user) return
    if (isModerator) {
      const allowed: Tab[] = [
        ...(user.canManagePlatform ? ['platform-clinics' as Tab] : []),
        'vip', 'knowledge', 'calendar',
      ]
      setAllowedTabs(allowed)
      setTabState(prev => {
        const next = prev && allowed.includes(prev) ? prev : resolveInitialPanelTab(allowed, 'vip')
        if (typeof window !== 'undefined') {
          try {
            window.sessionStorage.setItem(PANEL_TAB_STORAGE_KEY, next)
            window.localStorage.setItem(PANEL_TAB_STORAGE_KEY, next)
            const url = new URL(window.location.href)
            if (url.searchParams.get('tab') !== next) {
              url.searchParams.set('tab', next)
              window.history.replaceState(null, '', url.toString())
            }
          } catch {}
        }
        return next
      })
    } else if (user.role === 'yonetici') {
      const allowed: Tab[] = [
        ...(user.canManagePlatform ? ['platform-clinics' as Tab] : []),
        ...BASE_TABS.map(t => t.id),
      ]
      setAllowedTabs(allowed)
      setTabState(prev => {
        const next = prev && allowed.includes(prev) ? prev : resolveInitialPanelTab(allowed, 'calendar')
        if (typeof window !== 'undefined') {
          try {
            window.sessionStorage.setItem(PANEL_TAB_STORAGE_KEY, next)
            window.localStorage.setItem(PANEL_TAB_STORAGE_KEY, next)
            const url = new URL(window.location.href)
            if (url.searchParams.get('tab') !== next) {
              url.searchParams.set('tab', next)
              window.history.replaceState(null, '', url.toString())
            }
          } catch {}
        }
        return next
      })
    } else {
      fetch('/api/admin/settings/roles')
        .then(r => r.json())
        .then(perms => {
          const rolePerms: Tab[] = perms[user.role] || ['calendar']
          setAllowedTabs(rolePerms)
          setTabState(prev => {
            const next = prev && rolePerms.includes(prev) ? prev : resolveInitialPanelTab(rolePerms, rolePerms[0] || 'calendar')
            if (typeof window !== 'undefined') {
              try {
                window.sessionStorage.setItem(PANEL_TAB_STORAGE_KEY, next)
                window.localStorage.setItem(PANEL_TAB_STORAGE_KEY, next)
                const url = new URL(window.location.href)
                if (url.searchParams.get('tab') !== next) {
                  url.searchParams.set('tab', next)
                  window.history.replaceState(null, '', url.toString())
                }
              } catch {}
            }
            return next
          })
        })
        .catch(() => {
          const fallback: Tab[] = ['calendar']
          setAllowedTabs(fallback)
          setTabState(prev => prev && fallback.includes(prev) ? prev : 'calendar')
        })
    }
  }, [user, isModerator])

  useEffect(() => {
    if (typeof window === 'undefined' || !allowedTabs) return
    const handlePopState = () => {
      const urlTab = new URLSearchParams(window.location.search).get('tab') as Tab | null
      if (urlTab && allowedTabs.includes(urlTab)) {
        setTabState(urlTab)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [allowedTabs])

  const visibleTabs = tabsList.filter(t => allowedTabs?.includes(t.id))

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
          {tab === 'calendar' && <CalendarTab onNavigateToClinicStaff={() => setTab('klinik')} />}
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
          {tab === 'vip' && <VipAssistantTab />}
          {tab === 'platform-clinics' && user?.canManagePlatform && <PlatformClinicsTab />}
        </div>
      </div>
    </div>
  )
}
