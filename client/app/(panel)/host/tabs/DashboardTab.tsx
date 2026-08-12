'use client'

import { useEffect, useState } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

export default function DashboardTab() {
  const [appointments, setAppointments] = useState<any[]>([])
  const [doctors, setDoctors] = useState<any[]>([])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    Promise.all([
      fetch(`/api/dental/appointments?date=${today}`).then(r => r.json()),
      fetch(`/api/dental/doctors`).then(r => r.json()),
    ]).then(([appts, docs]) => { setAppointments(appts); setDoctors(docs) }).catch(() => {})
  }, [])

  const pending = appointments.filter(a => a.status === 'pending_assignment')
  const overdue = appointments.filter(a => new Date(a.startTime) < new Date() && a.status === 'scheduled')

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Bugünkü Randevular" value={appointments.length} />
        <StatCard label="Bekleyen Onay" value={pending.length} color="#f59e0b" />
        <StatCard label="Geciken Hasta" value={overdue.length} color="#ef4444" />
        <StatCard label="Doktor Sayısı" value={doctors.length} />
      </div>

      {pending.length > 0 && (
        <>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f59e0b', marginBottom: 8 }}>⚠️ AI Onay Bekleyen</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {pending.map(a => (
              <div key={a.id} className="glass-card" style={{ padding: '10px 14px', borderLeft: '3px solid #f59e0b' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--foreground)' }}>{a.title}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>{new Date(a.startTime).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {overdue.length > 0 && (
        <>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>🚨 Geciken Hastalar</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {overdue.map(a => (
              <div key={a.id} className="glass-card" style={{ padding: '10px 14px', borderLeft: '3px solid #ef4444' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--foreground)' }}>{a.title}</div>
                <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>Randevu: {new Date(a.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="glass-card" style={{ padding: '14px 18px' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: color || 'var(--foreground)' }}>{value}</div>
    </div>
  )
}
