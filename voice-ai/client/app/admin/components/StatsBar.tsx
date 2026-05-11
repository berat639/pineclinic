'use client'
import { useEffect, useState } from 'react'

interface Stats { accounts?: { active: number }; tokens?: { today: number }; concurrent?: { active: number } }

export default function StatsBar() {
  const [stats, setStats] = useState<Stats>({})

  useEffect(() => {
    const fetch_ = () =>
      fetch('/api/admin/stats').then(r => r.json()).then(setStats).catch(() => {})
    fetch_()
    const t = setInterval(fetch_, 5000)
    return () => clearInterval(t)
  }, [])

  const activeSessions = stats.concurrent?.active ?? 0
  const activeAccounts = stats.accounts?.active ?? 0
  const tokensToday = stats.tokens?.today ?? 0

  const cards = [
    { label: 'Aktif Görüşme', value: activeSessions, icon: '🟢', color: '#22c55e', pulse: activeSessions > 0 },
    { label: 'Aktif Hesap', value: activeAccounts, icon: '☁️', color: '#60a5fa', pulse: false },
    { label: 'Token (bugün)', value: tokensToday.toLocaleString('tr-TR'), icon: '⚡', color: '#a78bfa', pulse: false },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
      {cards.map((c, i) => (
        <div key={i} className="glass-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: `${c.color}18`, border: `1px solid ${c.color}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0,
          }}>{c.icon}</div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3, fontWeight: 500 }}>{c.label}</div>
          </div>
          {c.pulse && (
            <span style={{ marginLeft: 'auto', background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(34,197,94,0.3)' }}>
              CANLI
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
