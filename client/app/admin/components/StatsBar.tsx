'use client'
import { useEffect, useState } from 'react'
import InfoTooltip from './ui/InfoTooltip'

interface Stats {
  accounts?: { active: number }
  keySource?: 'clinic' | 'shared' | 'missing'
  costTry?: {
    today: number
    month: number
    bySource?: Record<string, number>
  }
  concurrent?: { active: number }
}

const TRY_FORMAT = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

const SOURCE_LABELS: Record<string, string> = {
  live_phone: 'Telefon',
  live_web: 'Web sesli görüşme',
  whatsapp: 'WhatsApp',
  embedding: 'Bilgi bankası',
  simulator: 'Simülatör',
}

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
  const keySourceLabel =
    stats.keySource === 'clinic'
      ? 'Kliniğe Özel Anahtar'
      : stats.keySource === 'shared'
      ? 'Ortak Anahtar'
      : undefined

  const tl = (n: number) => TRY_FORMAT.format(Number.isFinite(n) ? n : 0)
  const spendToday = stats.costTry?.today ?? 0
  const spendMonth = stats.costTry?.month ?? 0
  const spendBySource = Object.entries(stats.costTry?.bySource ?? {}).filter(([, v]) => v > 0)

  const cards = [
    { label: 'Aktif Görüşme', value: String(activeSessions), subtext: undefined as string | undefined, info: undefined as React.ReactNode, icon: '🟢', color: '#16a34a', pulse: activeSessions > 0 },
    { label: 'Aktif Hesap', value: String(activeAccounts), subtext: keySourceLabel, info: undefined as React.ReactNode, icon: '☁️', color: '#2563eb', pulse: false },
    {
      label: 'Yapay zeka harcaması',
      value: tl(spendToday),
      subtext: `Bu ay ${tl(spendMonth)}`,
      info: (
        <div style={{ display: 'grid', gap: 4 }}>
          <div>Bugünkü harcamanın kanal dağılımı:</div>
          {spendBySource.length === 0 ? (
            <div>Bugün henüz harcama yok.</div>
          ) : (
            spendBySource.map(([src, v]) => (
              <div key={src} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>{SOURCE_LABELS[src] ?? src}</span>
                <strong>{tl(v)}</strong>
              </div>
            ))
          )}
        </div>
      ),
      icon: '💳',
      color: '#7c3aed',
      pulse: false,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '0.75rem', marginBottom: '1.5rem', width: '100%' }}>
      {cards.map((c, i) => (
        <div key={i} style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--input-border)', boxShadow: 'var(--pc-neo-card)', minWidth: 0 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'var(--card-inner)', border: `1px solid ${c.color}`, boxShadow: 'var(--pc-clay-pale)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0,
          }}>{c.icon}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', marginTop: 3, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>{c.label}{c.info && (<span style={{ marginLeft: 6 }}><InfoTooltip title={c.label}>{c.info}</InfoTooltip></span>)}</div>
            {c.subtext && (
              <div style={{ fontSize: '0.64rem', color: 'var(--foreground-3)', opacity: 0.8, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subtext}</div>
            )}
          </div>
          {c.pulse && (
            <span style={{ marginLeft: 'auto', background: 'var(--card-inner)', color: '#16a34a', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid #16a34a', boxShadow: 'var(--pc-clay-pale)', flexShrink: 0 }}>
              CANLI
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
