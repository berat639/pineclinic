'use client'

import { useEffect, useState } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

export default function DashboardTab() {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/admin/stats`).then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard label="Aktif Hesaplar" value={stats?.accounts?.active ?? '—'} />
        <StatCard label="Bugünkü Token" value={stats?.tokens?.today ? `${(stats.tokens.today / 1000).toFixed(0)}K` : '—'} />
        <StatCard label="Aktif Oturum" value={stats?.concurrent?.active ?? '—'} />
        <StatCard label="Kuyruk" value={stats?.queue?.waiting ?? '—'} />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--foreground)' }}>{value}</div>
    </div>
  )
}
