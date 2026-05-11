'use client'

import { useEffect, useState, useCallback } from 'react'
import AppointmentsTab from './components/AppointmentsTab'
import StatsBar from './components/StatsBar'
import ToastContainer from './components/ToastContainer'
import RecordingsTab from './components/RecordingsTab'

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'appointments' | 'knowledge' | 'recordings' | 'settings'

interface Appointment {
  id: string; createdAt: string; customerName?: string; phone?: string
  type: 'service' | 'test_drive' | 'gallery_visit' | 'other'
  vehicleInfo?: string; issueOrRequest?: string; date: string; time: string
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
  id: string; name: string; fileType: string; chunkCount: number; createdAt: string
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
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
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

const TABS: { id: Tab; label: string }[] = [
  { id: 'appointments', label: 'Randevular' },
  { id: 'knowledge',    label: 'Bilgi Tabanı' },
  { id: 'recordings',   label: 'Kayıtlar' },
  { id: 'settings',     label: 'Ayarlar' },
]

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('appointments')

  // Appointments
  const [appointments, setAppointments] = useState<Appointment[]>([])

  // Calendar (Ayarlar tab)
  const [calStatus, setCalStatus] = useState<CalendarStatus | null>(null)
  const [calendars, setCalendars] = useState<CalendarItem[]>([])
  const [selectedCalId, setSelectedCalId] = useState('')
  const [calLoading, setCalLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Knowledge (Bilgi Tabanı tab)
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([])
  const [kbName, setKbName] = useState('')
  const [kbText, setKbText] = useState('')
  const [kbFile, setKbFile] = useState<File | null>(null)
  const [kbUploading, setKbUploading] = useState(false)

  // Inline action toast (for KB / calendar actions)
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

  // ── Knowledge ─────────────────────────────────────────────────────────────

  const fetchKnowledgeDocs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/knowledge')
      const data = await res.json()
      if (Array.isArray(data)) setKnowledgeDocs(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchKnowledgeDocs() }, [fetchKnowledgeDocs])

  const handleKbUpload = async () => {
    if (!kbText.trim() && !kbFile) return
    setKbUploading(true)
    try {
      const form = new FormData()
      if (kbName.trim()) form.append('name', kbName.trim())
      if (kbFile) form.append('file', kbFile)
      else form.append('text', kbText.trim())
      const res = await fetch('/api/admin/knowledge/upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error('Yükleme başarısız')
      showToast('success', 'Belge başarıyla indekslendi')
      setKbName(''); setKbText(''); setKbFile(null)
      fetchKnowledgeDocs()
    } catch { showToast('error', 'Belge yüklenemedi') }
    finally { setKbUploading(false) }
  }

  const handleKbDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showToast('success', 'Belge silindi')
      fetchKnowledgeDocs()
    } catch { showToast('error', 'Belge silinemedi') }
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
        .tab-btn:hover { color: #f0f4ff !important; }
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

      <div style={{ minHeight: '100vh', padding: '32px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 24,
          }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f0f4ff', margin: 0 }}>
                Admin Panel
              </h1>
              <p style={{ fontSize: 12, color: 'rgba(240,244,255,0.35)', margin: '3px 0 0' }}>
                Araç Servisi Yönetim Paneli
              </p>
            </div>
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

          {/* ── Stats Bar ───────────────────────────────────────────────── */}
          <StatsBar />

          {/* ── Tab navigation ──────────────────────────────────────────── */}
          <div style={{
            display: 'flex', gap: 2,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            marginBottom: 24,
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
                  color: activeTab === tab.id ? '#f0f4ff' : '#64748b',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  transition: 'color 0.2s, border-color 0.2s',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Randevular ─────────────────────────────────────────── */}
          {activeTab === 'appointments' && (
            <AppointmentsTab
              appointments={appointments}
              onDelete={id => setAppointments(prev => prev.filter(a => a.id !== id))}
            />
          )}

          {/* ── Tab: Bilgi Tabanı ───────────────────────────────────────── */}
          {activeTab === 'knowledge' && (
            <div style={{ maxWidth: 640 }}>

              {/* Upload card */}
              <div className="glass-card" style={{ padding: 24, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(240,244,255,0.7)', marginBottom: 14 }}>
                  Belge Ekle
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input
                    type="text"
                    placeholder="Belge adı (opsiyonel)"
                    value={kbName}
                    onChange={e => setKbName(e.target.value)}
                    disabled={kbUploading}
                    style={{
                      padding: '9px 12px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8, color: '#f0f4ff', fontSize: 13, outline: 'none',
                      opacity: kbUploading ? 0.5 : 1,
                    }}
                  />
                  <textarea
                    placeholder="Metin içeriğini buraya yapıştırın..."
                    value={kbText}
                    onChange={e => { setKbText(e.target.value); if (e.target.value) setKbFile(null) }}
                    disabled={kbUploading || !!kbFile}
                    rows={5}
                    style={{
                      padding: '9px 12px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8, color: '#f0f4ff', fontSize: 13, outline: 'none',
                      resize: 'vertical', fontFamily: 'inherit',
                      opacity: kbUploading || !!kbFile ? 0.5 : 1,
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'rgba(240,244,255,0.38)', whiteSpace: 'nowrap' }}>
                      veya dosya yükle
                    </span>
                    <label style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '7px 13px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      cursor: kbUploading || !!kbText.trim() ? 'not-allowed' : 'pointer',
                      fontSize: 12, color: 'rgba(240,244,255,0.6)',
                      opacity: kbUploading || !!kbText.trim() ? 0.4 : 1,
                    }}>
                      <input
                        type="file"
                        accept=".txt,.md,.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.mp4,.mp3,.wav,.m4a"
                        disabled={kbUploading || !!kbText.trim()}
                        onChange={e => { const f = e.target.files?.[0] ?? null; setKbFile(f); if (f) setKbText('') }}
                        style={{ display: 'none' }}
                      />
                      {kbFile ? kbFile.name : 'Dosya seç (PDF, görsel, ses, video, metin)'}
                    </label>
                    {kbFile && (
                      <button
                        onClick={() => setKbFile(null)}
                        style={{ background: 'transparent', border: 'none', color: 'rgba(248,113,113,0.7)', cursor: 'pointer', fontSize: 12 }}
                      >
                        Kaldır
                      </button>
                    )}
                  </div>
                  <div>
                    <button
                      onClick={handleKbUpload}
                      disabled={kbUploading || (!kbText.trim() && !kbFile)}
                      className="btn btn-primary"
                    >
                      {kbUploading ? (
                        <>
                          <Spinner />
                          İndeksleniyor...
                        </>
                      ) : 'İndeksle'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Document list */}
              <div className="glass-card" style={{ overflow: 'hidden' }}>
                {knowledgeDocs.length === 0 ? (
                  <div style={{ padding: '28px 24px', textAlign: 'center', fontSize: 13, color: 'rgba(240,244,255,0.3)' }}>
                    Henüz belge yüklenmedi
                  </div>
                ) : (
                  <>
                    {knowledgeDocs.map((doc, idx) => (
                      <div
                        key={doc.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 18px',
                          borderBottom: idx < knowledgeDocs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#f0f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: '2px 7px',
                              background: 'rgba(3,105,161,0.15)', border: '1px solid rgba(3,105,161,0.25)',
                              borderRadius: 4, color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.05em',
                            }}>
                              {doc.fileType}
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(240,244,255,0.35)' }}>{doc.chunkCount} parça</span>
                            <span style={{ fontSize: 11, color: 'rgba(240,244,255,0.25)' }}>
                              {new Date(doc.createdAt).toLocaleDateString('tr-TR')}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleKbDelete(doc.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 30, height: 30,
                            background: 'transparent', border: '1px solid rgba(248,113,113,0.2)',
                            borderRadius: 7, color: 'rgba(248,113,113,0.6)', cursor: 'pointer',
                            transition: 'background 0.2s', flexShrink: 0,
                          }}
                          title="Sil"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>

            </div>
          )}

          {/* ── Tab: Kayıtlar ───────────────────────────────────────────── */}
          {activeTab === 'recordings' && <RecordingsTab />}

          {/* ── Tab: Ayarlar ────────────────────────────────────────────── */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: 520 }}>

              <div className="glass-card" style={{ padding: 24, marginBottom: 12 }}>
                {/* Card header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 20, paddingBottom: 14,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(240,244,255,0.75)' }}>
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

              {/* Setup details (collapsed) */}
              <details style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 10,
              }}>
                <summary style={{
                  padding: '11px 16px', fontSize: 13, color: 'rgba(240,244,255,0.35)',
                  cursor: 'pointer', userSelect: 'none',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  <IconInfo />
                  Kurulum bilgileri
                </summary>
                <div style={{ padding: '0 16px 16px' }}>
                  <p style={{ fontSize: 12, color: 'rgba(240,244,255,0.35)', marginBottom: 8 }}>
                    Gerekli environment değişkenleri:
                  </p>
                  <pre style={{
                    background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 7, padding: '10px 14px',
                    fontSize: 12, color: '#7dd3fc', overflowX: 'auto', margin: '0 0 10px', lineHeight: 1.6,
                  }}>{`GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
APP_URL=http://localhost:3001
CLIENT_APP_URL=http://localhost:3000`}</pre>
                  <p style={{ fontSize: 12, color: 'rgba(240,244,255,0.3)', lineHeight: 1.7 }}>
                    GCP Console → APIs &amp; Services → Credentials → OAuth 2.0 Client ID<br />
                    Redirect URI:{' '}
                    <code style={{ color: '#7dd3fc', fontSize: 11 }}>
                      APP_URL/api/admin/settings/calendar/callback
                    </code>
                  </p>
                </div>
              </details>

            </div>
          )}

        </div>
      </div>
    </>
  )
}
