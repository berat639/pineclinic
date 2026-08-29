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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '0.75rem', marginBottom: '1.5rem', width: '100%' }}>
      {cards.map((c, i) => (
        <div key={i} style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--card-bg, #1e293b)', borderRadius: 14, border: '1px solid var(--input-border, #334155)', minWidth: 0 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: `${c.color}18`, border: `1px solid ${c.color}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0,
          }}>{c.icon}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', marginTop: 3, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</div>
          </div>
          {c.pulse && (
            <span style={{ marginLeft: 'auto', background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(34,197,94,0.3)', flexShrink: 0 }}>
              CANLI
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
