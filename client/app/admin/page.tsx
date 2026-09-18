'use client'

import { useEffect, useState, useCallback, type CSSProperties } from 'react'
import PatientsTab from './components/PatientsTab'
import StatsBar from './components/StatsBar'
import ToastContainer from './components/ToastContainer'
import CalendarTab from './components/CalendarTab'
import PaymentsTab from './components/PaymentsTab'
import UsersTab from './components/UsersTab'
import KnowledgeTab from './components/KnowledgeTab'
import IntegrationsTab from './components/IntegrationsTab'
import PhonebookManager from './components/PhonebookManager'
import { ThemeToggle } from '../theme-provider'

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'calendar' | 'patients' | 'payments' | 'knowledge' | 'settings' | 'users' | 'integrations'

interface Appointment {
  id: string; createdAt: string; customerName?: string; phone?: string
  type: string
  issueOrRequest?: string; date: string; time: string
  extraFields?: Record<string, string> | null
}

type CalendarStatus = {
  connected: boolean
  authType: 'oauth2' | 'service_account' | null
  email: string | null
  calendarId: string | null
  hasRefreshToken: boolean
}

type CalendarItem = { id: string; name: string; isPrimary: boolean }

type KnowledgeDoc = {
  id: string
  category: string
  title: string
  content: string
  active: boolean
  embeddedAt: string
  createdAt: string
  updatedAt: string
}

// ── SVG Icons ──────────────────────────────────────────────────────────────

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IconDot({ active }: { active?: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10">
      <circle cx="5" cy="5" r="5" fill="currentColor" opacity={active ? 1 : 0.3} />
    </svg>
  )
}

function IconUnlink() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.84 12.25l1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
      <path d="M5.17 11.75l-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
      <line x1="8" y1="2" x2="8" y2="5" /><line x1="2" y1="8" x2="5" y2="8" />
      <line x1="16" y1="19" x2="16" y2="22" /><line x1="19" y1="16" x2="22" y2="16" />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.71 19.71 0 0 1 4.22-5.19" />
      <path d="M22.54 16.88A19.62 19.62 0 0 0 23 12s-4-8-11-8a10.94 10.94 0 0 0-4 .77" />
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function GoogleLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 24, height: 24,
      border: '2px solid rgba(255,255,255,0.08)',
      borderTopColor: '#0369A1',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

// ── Tab definitions ────────────────────────────────────────────────────────

interface KbCategoryDef {
  id: string
  slug: string
  label: string
  icon: string
  color: string
  sortOrder: number
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'calendar', label: 'Takvim' },
  { id: 'patients', label: 'Hastalar' },
  { id: 'payments', label: 'Ödemeler' },
  { id: 'knowledge', label: 'Bilgi Tabanı' },
  { id: 'settings', label: 'Ayarlar' },
  { id: 'integrations', label: 'Entegrasyonlar' },
  { id: 'users', label: 'Kullanıcılar' },
]

const AI_MODEL_META: Record<string, { label: string; tagline: string; tier: 'Premium' | 'Dengeli' | 'Ekonomik' }> = {
  'gemini-3.8-live': {
    label: 'Gemini 3.8 Live',
    tagline: 'Kararlı, düşük gecikmeli gerçek zamanlı ses modeli.',
    tier: 'Premium',
  },
}

const AI_TIER_COLOR: Record<'Premium' | 'Dengeli' | 'Ekonomik', string> = {
  Premium: '#a78bfa',
  Dengeli: '#60a5fa',
  Ekonomik: '#34d399',
}

// ── VoIP / Call Center meta ────────────────────────────────────────────────
type VoipMode = 'local' | 'cloud'
type CloudProvider = 'netgsm' | 'twilio' | 'vonage' | 'custom'
type SipTransport = 'UDP' | 'TCP' | 'TLS' | 'WS' | 'WSS'
type DtmfMode = 'rfc2833' | 'info' | 'inband'
type AfterHours = 'voicemail' | 'mobile' | 'close'

const SIP_TRANSPORTS: SipTransport[] = ['UDP', 'TCP', 'TLS', 'WS', 'WSS']
const SIP_CODECS = ['OPUS', 'G.722', 'G.711 (PCMU)', 'G.711 (PCMA)', 'G.729'] as const

const voipLabelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--foreground-3)',
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
}

const voipInputStyle: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: 8,
  color: 'var(--foreground)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

const voipGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
  gap: 12,
}

const voipTwoColPanels: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
  gap: 16,
  alignItems: 'stretch',
}

const voipPanelStyle: CSSProperties = {
  padding: 14,
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  borderRadius: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
}

const voipSectionTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--foreground-3)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 2,
  paddingBottom: 8,
  borderBottom: '1px solid var(--divider)',
}

const voipEyeBtnStyle: CSSProperties = {
  position: 'absolute',
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--foreground-3)',
  padding: 4,
  display: 'inline-flex',
  alignItems: 'center',
}

function VoipToggle({
  label, value, onChange, hint,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '8px 12px',
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: 10,
        cursor: 'pointer',
        color: 'inherit',
      }}
    >
      <span style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative',
        background: value ? '#22c55e' : 'var(--input-border)',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: 'white', transition: 'left 0.2s',
        }} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: value ? 'var(--foreground)' : 'var(--foreground-2)' }}>
          {label}
        </span>
        {hint && (
          <span style={{ fontSize: 10.5, color: 'var(--foreground-3)', marginTop: 2 }}>
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}

const CLOUD_PROVIDER_META: Record<CloudProvider, {
  label: string
  baseUrl: string
  userLabel: string
  passLabel: string
  fromHint: string
}> = {
  netgsm: {
    label: 'Netgsm',
    baseUrl: 'https://api.netgsm.com.tr/voice/v1/',
    userLabel: 'Kullanıcı kodu (usercode)',
    passLabel: 'API parolası',
    fromHint: 'örn. 8503xxxxxxx',
  },
  twilio: {
    label: 'Twilio',
    baseUrl: 'https://api.twilio.com/2010-04-01/',
    userLabel: 'Account SID',
    passLabel: 'Auth Token',
    fromHint: 'örn. +14155551234',
  },
  vonage: {
    label: 'Vonage',
    baseUrl: 'https://api.nexmo.com/',
    userLabel: 'API Key',
    passLabel: 'API Secret',
    fromHint: 'örn. 905551234567',
  },
  custom: {
    label: 'Diğer (Özel)',
    baseUrl: 'https://api.ornek.com/',
    userLabel: 'Kullanıcı / Account ID',
    passLabel: 'Parola / Token',
    fromHint: 'Caller ID / numara',
  },
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('patients')

  // Appointments
  const [appointments, setAppointments] = useState<Appointment[]>([])

  const [calStatus, setCalStatus] = useState<CalendarStatus | null>(null)
  const [calendars, setCalendars] = useState<CalendarItem[]>([])
  const [selectedCalId, setSelectedCalId] = useState('')
  const [calLoading, setCalLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // AI Model (Ayarlar tab)
  const [aiModel, setAiModel] = useState<string>('')
  const [aiAvailable, setAiAvailable] = useState<string[]>([])
  const [aiDefault, setAiDefault] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(true)
  const [aiSaving, setAiSaving] = useState(false)

  // Karşılama Mesajı (Ayarlar tab)
  const [greetingText, setGreetingText] = useState('')
  const [greetingLoading, setGreetingLoading] = useState(false)
  const [greetingSaving, setGreetingSaving] = useState(false)

  const handleSaveGreeting = async () => {
    try {
      setGreetingSaving(true)
      await fetch('/api/settings/greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ greeting: greetingText })
      })
    } catch (err) { }
    finally { setGreetingSaving(false) }
  }

  // Connection Mode (Bağlantı Modu)
  const [connMode, setConnMode] = useState<'server' | 'direct'>('server')
  const [connModeLoading, setConnModeLoading] = useState(true)
  const [connModeSaving, setConnModeSaving] = useState(false)

  // Inline action toast (for calendar actions)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Appointments ──────────────────────────────────────────────────────────

  const fetchAppointments = useCallback(async () => {
    try {
      const res = await fetch('/api/appointments')
      const data = await res.json()
      if (Array.isArray(data)) setAppointments(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchAppointments() }, [fetchAppointments])



  // ── Calendar ──────────────────────────────────────────────────────────────

  const fetchCalStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings/calendar/status')
      const data = await res.json()
      setCalStatus(data)
      if (data.calendarId) setSelectedCalId(data.calendarId)
    } catch { showToast('error', 'Takvim durumu alınamadı') }
    finally { setCalLoading(false) }
  }, [])

  const fetchCalendars = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings/calendar/calendars')
      const data = await res.json()
      if (data.calendars) setCalendars(data.calendars)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchCalStatus()
    const params = new URLSearchParams(window.location.search)
    const cal = params.get('calendar')
    if (cal === 'connected') {
      showToast('success', 'Google Calendar başarıyla bağlandı')
      window.history.replaceState({}, '', '/admin')
    } else if (cal === 'error') {
      showToast('error', `Bağlantı hatası: ${params.get('reason') ?? 'bilinmeyen'}`)
      window.history.replaceState({}, '', '/admin')
    }
  }, [fetchCalStatus])

  useEffect(() => {
    if (calStatus?.connected && calStatus.authType === 'oauth2') fetchCalendars()
  }, [calStatus, fetchCalendars])

  // ── AI Model ──────────────────────────────────────────────────────────────

  const fetchAiSettings = useCallback(async () => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/admin/settings/ai')
      const data = await res.json() as { current?: string; default?: string; available?: string[] }
      if (data.current) setAiModel(data.current)
      if (data.default) setAiDefault(data.default)
      if (Array.isArray(data.available)) setAiAvailable(data.available)
    } catch { showToast('error', 'Yapay zeka ayarı alınamadı') }
    finally { setAiLoading(false) }
  }, [])

  useEffect(() => { fetchAiSettings() }, [fetchAiSettings])

  const handleSaveAiModel = async (model: string) => {
    if (!model || aiSaving || model === aiModel) return
    setAiSaving(true)
    try {
      const res = await fetch('/api/admin/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error || 'Kaydedilemedi')
      }
      setAiModel(model)
      showToast('success', 'Yapay zeka modeli güncellendi (sonraki çağrılarda devreye girer)')
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Model kaydedilemedi')
    }
    finally { setAiSaving(false) }
  }

  // ── Connection Mode (Bağlantı Modu) ──────────────────────────────────────
  const fetchConnMode = useCallback(async () => {
    setConnModeLoading(true)
    try {
      const res = await fetch('/api/admin/settings/connection-mode')
      const data = await res.json() as { mode?: string }
      if (data.mode === 'direct' || data.mode === 'server') setConnMode(data.mode)
    } catch { /* ignore */ }
    finally { setConnModeLoading(false) }
  }, [])

  useEffect(() => { fetchConnMode() }, [fetchConnMode])

  const handleSaveConnMode = async (mode: 'server' | 'direct') => {
    if (connModeSaving || mode === connMode) return
    setConnModeSaving(true)
    try {
      const res = await fetch('/api/admin/settings/connection-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) throw new Error('Kaydedilemedi')
      setConnMode(mode)
      showToast('success', `Bağlantı modu "${mode === 'server' ? 'Sunucu' : 'Doğrudan'}" olarak güncellendi`)
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Mod kaydedilemedi')
    }
    finally { setConnModeSaving(false) }
  }

  const handleCalConnect = async () => {
    const res = await fetch('/api/admin/settings/calendar/auth')
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else showToast('error', 'OAuth URL alınamadı: ' + (data.error ?? ''))
  }

  const handleCalDisconnect = async () => {
    await fetch('/api/admin/settings/calendar/disconnect', { method: 'DELETE' })
    showToast('success', 'Bağlantı kesildi')
    setCalendars([])
    fetchCalStatus()
  }

  const handleSaveCalendar = async () => {
    if (!selectedCalId) return
    setSaving(true)
    try {
      await fetch('/api/admin/settings/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: selectedCalId }),
      })
      showToast('success', 'Takvim kaydedildi')
      fetchCalStatus()
    } finally { setSaving(false) }
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    await fetch('/api/admin-auth', { method: 'DELETE' })
    window.location.href = '/admin-login'
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .tab-btn:hover { color: var(--foreground) !important; }
        .btn-connect:hover { background: #f9fafb !important; }
        .cal-select:focus { border-color: rgba(3,105,161,0.5) !important; outline: none; }
        details summary::-webkit-details-marker { display: none; }
      `}</style>

      {/* SSE toast notifications (bottom-right) */}
      <ToastContainer onNewAppointment={fetchAppointments} />

      {/* Action toast (top-right) */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 15px',
          background: toast.type === 'success' ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)'}`,
          borderRadius: 10,
          color: toast.type === 'success' ? '#4ade80' : '#f87171',
          fontSize: 13, fontWeight: 500,
          animation: 'fadeSlideIn 0.2s ease',
          backdropFilter: 'blur(12px)',
        }}>
          {toast.type === 'success' ? <IconCheck /> : <IconX />}
          {toast.text}
        </div>
      )}

      <div className="admin-content" style={{ minHeight: '100vh', padding: '24px clamp(20px, 3.5vw, 56px)', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '100%', margin: '0 auto', width: '100%' }}>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 24, flexWrap: 'wrap', gap: 12, width: '100%', maxWidth: '100%'
          }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
                Admin Panel
              </h1>
              <p style={{ fontSize: 12, color: 'var(--foreground-3)', margin: '3px 0 0' }}>
                Müşteri Rezervasyon Yönetim Sistemi
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <ThemeToggle />
              <button
                onClick={handleLogout}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 13, fontWeight: 500,
                  transition: 'background 0.2s',
                }}
              >
                <IconLogout />
                Çıkış Yap
              </button>
            </div>
          </div>

          {/* ── Stats Bar ───────────────────────────────────────────────── */}
          <StatsBar />

          {/* ── Tab navigation ──────────────────────────────────────────── */}
          <div style={{
            display: 'flex', gap: 2,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            marginBottom: 24,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            whiteSpace: 'nowrap',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box'
          }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                className="tab-btn"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '9px 18px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === tab.id ? '#60a5fa' : 'transparent'}`,
                  color: activeTab === tab.id ? 'var(--foreground)' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  transition: 'color 0.2s, border-color 0.2s',
                  marginBottom: -1,
                  flexShrink: 0,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Takvim ──────────────────────────────────────────── */}
          {activeTab === 'calendar' && <CalendarTab />}

          {/* ── Tab: Hastalar ─────────────────────────────────────────── */}
          {activeTab === 'patients' && (
            <PatientsTab />
          )}

          {/* ── Tab: Bilgi Tabanı ───────────────────────────────────────── */}
          {activeTab === 'knowledge' && <KnowledgeTab />}

          {/* ── Tab: Ödemeler ───────────────────────────────────────────── */}
          {activeTab === 'payments' && <PaymentsTab />}


          {/* ── Tab: Kullanıcılar ───────────────────────────────────────── */}
          {activeTab === 'users' && <UsersTab />}

          {/* ── Tab: Ayarlar ────────────────────────────────────────────── */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: 800 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <h2 style={{ fontSize: 16, marginBottom: 20 }}>Sistem Ayarları</h2>

                {/* AI Model Settings */}
                <div style={{ marginBottom: 24 }}>
                  <div style={voipLabelStyle}>Yapay Zeka Modeli</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={aiModel}
                      onChange={e => setAiModel(e.target.value)}
                      style={{ ...voipInputStyle, flex: 1 }}
                    >
                      {aiAvailable.map(m => (
                        <option key={m} value={m}>{AI_MODEL_META[m]?.label ?? m}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleSaveAiModel(aiModel)}
                      disabled={aiSaving || aiLoading}
                      className="btn btn-primary"
                    >
                      {aiSaving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                  </div>
                </div>
              </div>

              <PhonebookManager />

              {/* Alt satır: Karşılama Mesajı (sol) + Konuşma Akışı (sağ) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>

                {/* Karşılama Mesajı card */}
                <div className="glass-card" style={{ padding: 24 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 18, paddingBottom: 14,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground-2)' }}>
                      Karşılama Mesajı
                    </span>
                    {greetingLoading ? <Spinner /> : (
                      <span style={{
                        fontSize: 11, color: 'rgba(240,244,255,0.45)',
                        padding: '3px 9px', background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
                      }}>
                        Sesli AI Açılış
                      </span>
                    )}
                  </div>

                  {!greetingLoading && (
                    <>
                      <p style={{ fontSize: 12, color: 'rgba(240,244,255,0.45)', marginBottom: 14, lineHeight: 1.6 }}>
                        Müşteri bağlandığında AI asistanın söyleyeceği ilk karşılama mesajı. Değişiklik sonraki çağrılarda geçerli olur.
                      </p>

                      <textarea
                        value={greetingText}
                        onChange={(e) => setGreetingText(e.target.value)}
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          fontSize: 13,
                          lineHeight: 1.6,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8,
                          color: '#f0f4ff',
                          resize: 'vertical',
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                        placeholder="Merhaba, hoş geldiniz!..."
                      />

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                        <button
                          type="button"
                          onClick={handleSaveGreeting}
                          disabled={greetingSaving || !greetingText.trim()}
                          style={{
                            padding: '8px 18px',
                            fontSize: 12,
                            fontWeight: 600,
                            background: greetingSaving ? 'rgba(255,255,255,0.05)' : 'rgba(52,211,153,0.15)',
                            border: '1px solid rgba(52,211,153,0.3)',
                            borderRadius: 8,
                            color: '#34d399',
                            cursor: greetingSaving ? 'wait' : 'pointer',
                          }}
                        >
                          {greetingSaving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                      </div>
                    </>
                  )}
                </div>

              </div>{/* alt grid sonu */}

            </div>
          )}


          {/* ── Tab: Ödemeler ───────────────────────────────────────────── */}
          {activeTab === 'payments' && <PaymentsTab />}

          {/* ── Tab: Ayarlar ────────────────────────────────────────────── */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: 1100, width: '100%' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                gap: 12,
                marginBottom: 12,
                alignItems: 'start',
              }}>
                <div className="glass-card" style={{ padding: 24, marginBottom: 0 }}>
                  {/* Card header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 20, paddingBottom: 14,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground-2)' }}>
                      Google Calendar
                    </span>
                    {calLoading ? (
                      <Spinner />
                    ) : (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 11px',
                        background: calStatus?.connected ? 'rgba(22,163,74,0.1)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${calStatus?.connected ? 'rgba(22,163,74,0.28)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 20, fontSize: 12, fontWeight: 500,
                        color: calStatus?.connected ? '#4ade80' : 'rgba(240,244,255,0.38)',
                      }}>
                        <IconDot active={calStatus?.connected} />
                        {calStatus?.connected ? 'Bağlı' : 'Bağlı Değil'}
                      </div>
                    )}
                  </div>

                  {!calLoading && (
                    <>
                      {calStatus?.connected ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {calStatus.email && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
                            }}>
                              <GoogleLogo />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#f0f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {calStatus.email}
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(240,244,255,0.35)', marginTop: 2 }}>
                                  {calStatus.authType === 'oauth2' ? 'OAuth 2.0 ile bağlı' : 'Servis hesabı'}
                                </div>
                              </div>
                            </div>
                          )}
                          {calStatus.calendarId && (
                            <div>
                              <div style={{ fontSize: 11, color: 'rgba(240,244,255,0.35)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Aktif Takvim
                              </div>
                              <code style={{
                                display: 'block', padding: '8px 12px',
                                background: 'rgba(3,105,161,0.08)', border: '1px solid rgba(3,105,161,0.18)',
                                borderRadius: 8, fontSize: 12, color: '#7dd3fc', wordBreak: 'break-all', lineHeight: 1.5,
                              }}>
                                {calStatus.calendarId}
                              </code>
                            </div>
                          )}
                          {calStatus.authType === 'oauth2' && calendars.length > 0 && (
                            <div>
                              <div style={{ fontSize: 11, color: 'rgba(240,244,255,0.35)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Takvim Seç
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <select
                                  className="cal-select"
                                  value={selectedCalId}
                                  onChange={e => setSelectedCalId(e.target.value)}
                                  style={{
                                    flex: 1, padding: '9px 12px',
                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 8, color: '#f0f4ff', fontSize: 13, cursor: 'pointer',
                                  }}
                                >
                                  <option value="" style={{ background: '#1e293b' }}>-- Takvim seçin --</option>
                                  {calendars.map(c => (
                                    <option key={c.id} value={c.id} style={{ background: '#1e293b' }}>
                                      {c.name}{c.isPrimary ? ' (Ana Takvim)' : ''}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={handleSaveCalendar}
                                  disabled={saving || !selectedCalId}
                                  className="btn btn-primary"
                                >
                                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                                </button>
                              </div>
                            </div>
                          )}
                          {calStatus.authType === 'oauth2' && (
                            <div>
                              <button
                                onClick={handleCalDisconnect}
                                className="btn btn-danger"
                                style={{ fontSize: 13 }}
                              >
                                <IconUnlink />
                                Bağlantıyı Kes
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize: 14, color: 'rgba(240,244,255,0.45)', marginBottom: 20, lineHeight: 1.65 }}>
                            Firma Google hesabıyla giriş yaparak takvime randevu ekleme izni verin.
                          </p>
                          <button
                            className="btn-connect"
                            onClick={handleCalConnect}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 10,
                              padding: '10px 20px',
                              background: '#ffffff', color: '#1f2937',
                              border: 'none', borderRadius: 8, cursor: 'pointer',
                              fontSize: 14, fontWeight: 500,
                              boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                              transition: 'background 0.15s',
                            }}
                          >
                            <GoogleLogo />
                            Google ile Bağlan
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* AI Model card */}
                <div className="glass-card" style={{ padding: 24, marginBottom: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 18, paddingBottom: 14,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground-2)' }}>
                      Yapay Zeka Modeli
                    </span>
                    {aiLoading ? <Spinner /> : (
                      <span style={{
                        fontSize: 11, color: 'rgba(240,244,255,0.45)',
                        padding: '3px 9px', background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
                      }}>
                        Sesli AI API
                      </span>
                    )}
                  </div>

                  {!aiLoading && (
                    <>
                      <p style={{ fontSize: 12, color: 'rgba(240,244,255,0.45)', marginBottom: 14, lineHeight: 1.6 }}>
                        Yalnızca gerçek-zamanlı sesli oturumu destekleyen modeller listelenir.
                      </p>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                        gap: 10,
                      }}>
                        {aiAvailable.map(model => {
                          const meta = AI_MODEL_META[model]
                          const isActive = aiModel === model
                          const tier = meta?.tier ?? 'Dengeli'
                          const tierColor = AI_TIER_COLOR[tier]
                          return (
                            <button
                              key={model}
                              type="button"
                              onClick={() => handleSaveAiModel(model)}
                              disabled={aiSaving}
                              style={{
                                textAlign: 'left',
                                display: 'flex', alignItems: 'flex-start', gap: 12,
                                padding: '12px 14px',
                                background: isActive ? `rgba(${hexToRgb(tierColor)}, 0.10)` : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${isActive ? `rgba(${hexToRgb(tierColor)}, 0.45)` : 'rgba(255,255,255,0.07)'}`,
                                borderRadius: 10,
                                cursor: aiSaving ? 'wait' : 'pointer',
                                transition: 'background 0.15s, border-color 0.15s',
                                opacity: aiSaving && !isActive ? 0.5 : 1,
                                color: 'inherit',
                              }}
                            >
                              <span style={{
                                marginTop: 3, flexShrink: 0,
                                width: 16, height: 16, borderRadius: '50%',
                                border: `2px solid ${isActive ? tierColor : 'rgba(255,255,255,0.2)'}`,
                                background: isActive ? tierColor : 'transparent',
                                boxShadow: isActive ? `0 0 0 3px rgba(${hexToRgb(tierColor)}, 0.18)` : 'none',
                                transition: 'all 0.15s',
                              }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: '#f0f4ff' }}>
                                    {meta?.label ?? model}
                                  </span>
                                  <span style={{
                                    fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                                    padding: '2px 7px', borderRadius: 4,
                                    background: `rgba(${hexToRgb(tierColor)}, 0.15)`,
                                    border: `1px solid rgba(${hexToRgb(tierColor)}, 0.3)`,
                                    color: tierColor,
                                  }}>
                                    {tier.toUpperCase()}
                                  </span>
                                  {model === aiDefault && (
                                    <span style={{
                                      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                                      padding: '2px 7px', borderRadius: 4,
                                      background: 'rgba(148,163,184,0.1)',
                                      border: '1px solid rgba(148,163,184,0.2)',
                                      color: 'rgba(148,163,184,0.85)',
                                    }}>
                                      VARSAYILAN
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: 'rgba(240,244,255,0.55)', lineHeight: 1.5 }}>
                                  {meta?.tagline ?? '—'}
                                </div>
                              </div>
                              {aiSaving && isActive && <Spinner />}
                            </button>
                          )
                        })}
                      </div>

                      <p style={{ fontSize: 11, color: 'rgba(240,244,255,0.35)', marginTop: 14, lineHeight: 1.6 }}>
                        Değişiklik yalnızca <strong>sonraki çağrılar</strong> için geçerlidir; o anki aktif oturumlar etkilenmez.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Entegrasyonlar ──────────────────────────────────────── */}
          {activeTab === 'integrations' && <IntegrationsTab />}

          {/* ── Tab: Kullanıcılar ───────────────────────────────────────── */}
          {activeTab === 'users' && <UsersTab />}

        </div>
      </div>
    </>
  )
}
