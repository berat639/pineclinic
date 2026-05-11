'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import StatsBar from './components/StatsBar'
import AppointmentsTab from './components/AppointmentsTab'
import RecordingsTab from './components/RecordingsTab'
import KnowledgeTab from './components/KnowledgeTab'
import ToastContainer from './components/ToastContainer'

interface Appointment {
  id: string; createdAt: string; customerName?: string; phone?: string
  type: 'service' | 'test_drive' | 'gallery_visit' | 'other'
  vehicleInfo?: string; issueOrRequest?: string; date: string; time: string
}

type Tab = 'appointments' | 'recordings' | 'knowledge'

export default function AdminPage() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('appointments')

  const logout = async () => {
    await fetch('/api/admin-auth', { method: 'DELETE' })
    router.push('/admin-login')
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/appointments')
      if (!r.ok) throw new Error()
      setAppointments((await r.json()).reverse())
    } catch { setError('Sunucuya bağlanılamadı.') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'appointments', label: 'Randevular', icon: '📅' },
    { key: 'recordings', label: 'Ses Kayıtları', icon: '🎙️' },
    { key: 'knowledge', label: 'Bilgi Bankası', icon: '🧠' },
  ]

  return (
    <div style={{ minHeight: '100vh' }}>
      <ToastContainer onNewAppointment={load} />
      {/* Navbar */}
      <nav style={{ width: '100%', padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(5,10,20,0.9)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="/logo.svg" alt="Hyundai" style={{ height: 28, filter: 'brightness(0) invert(1)' }} />
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />
          <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 500, letterSpacing: '0.05em' }}>ADMİN PANELİ</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={load} className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
            ↺ Yenile
          </button>
          <Link href="/" className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
            🏠 Ana Sayfa
          </Link>
          <button onClick={logout} className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
            🚪 Çıkış
          </button>
        </div>
      </nav>

      <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Yönetim Paneli</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Randevular, ses kayıtları ve aktif görüşmeleri yönetin</p>
        </div>

        {/* Stats — always visible, polls every 3s */}
        <StatsBar />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '0.5rem' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '7px 18px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, transition: 'all 0.2s',
              background: tab === t.key ? 'rgba(96,165,250,0.12)' : 'transparent',
              color: tab === t.key ? '#60a5fa' : '#64748b',
              borderBottom: tab === t.key ? '2px solid #60a5fa' : '2px solid transparent',
            }}>
              {t.icon} {t.label}
              {t.key === 'appointments' && !loading && (
                <span style={{ marginLeft: 8, background: 'rgba(96,165,250,0.2)', color: '#60a5fa', fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>
                  {appointments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'appointments' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>⏳ Yükleniyor...</div>
          ) : error ? (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ color: '#ef4444', marginBottom: '1rem' }}>⚠️ {error}</div>
              <button onClick={load} className="btn btn-primary">Tekrar Dene</button>
            </div>
          ) : (
            <AppointmentsTab
              appointments={appointments}
              onDelete={id => setAppointments(prev => prev.filter(a => a.id !== id))}
            />
          )
        )}

        {tab === 'recordings' && <RecordingsTab />}

        {tab === 'knowledge' && <KnowledgeTab />}
      </div>
    </div>
  )
}
