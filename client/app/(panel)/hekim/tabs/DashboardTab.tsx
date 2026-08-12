'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../../../../lib/auth-context'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

export default function DashboardTab() {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<any[]>([])

  useEffect(() => {
    if (!user) return
    const today = new Date().toISOString().split('T')[0]
    fetch(`${BACKEND}/api/dental/appointments?date=${today}`)
      .then(r => r.json())
      .then(data => {
        const mine = user.role === 'hekim' ? data.filter((a: any) => a.doctorId === user.id) : data
        setAppointments(mine)
      })
      .catch(() => {})
  }, [user])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Bugünkü Randevular" value={appointments.length} />
        <StatCard label="Bekleyen" value={appointments.filter(a => a.status === 'scheduled').length} />
        <StatCard label="Devam Eden" value={appointments.filter(a => a.status === 'in_progress').length} />
        <StatCard label="Tamamlanan" value={appointments.filter(a => a.status === 'completed').length} />
      </div>

      <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: 12 }}>Bugünkü Hastalar</h2>
      {appointments.length === 0 ? (
        <p style={{ color: 'var(--foreground-3)', fontSize: '0.8rem' }}>Bugün randevu yok.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {appointments.map(a => (
            <div key={a.id} className="glass-card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--foreground)' }}>{a.title}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>{new Date(a.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - {new Date(a.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <span style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: 6, background: 'rgba(96,165,250,0.1)', color: 'var(--accent)' }}>{a.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass-card" style={{ padding: '14px 18px' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--foreground)' }}>{value}</div>
    </div>
  )
}
