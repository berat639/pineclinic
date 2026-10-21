'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface RevenuePoint { date: string; total: number }
interface Expense { id: string; itemName: string; quantity: number; totalCost: number; date: string; category?: string; notes?: string | null }
interface IncomeExpensePoint { date: string; gelir: number; gider: number }
export default function FinansalTab() {
  const [revenue, setRevenue] = useState<RevenuePoint[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [chartData, setChartData] = useState<IncomeExpensePoint[]>([])
  const [pl, setPl] = useState<{ revenue: number; expenses: number; net: number } | null>(null)
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  useEffect(() => {
    fetch(`/api/yonetici/finance/revenue?period=${period}`, { credentials: 'include' }).then(r => r.json()).then(setRevenue).catch(() => {})
    fetch(`/api/yonetici/finance/expenses`, { credentials: 'include' }).then(r => r.json()).then(setExpenses).catch(() => {})
    fetch(`/api/yonetici/finance/income-expense-chart?period=${period}`, { credentials: 'include' }).then(r => r.json()).then(setChartData).catch(() => {})
    fetch(`/api/yonetici/finance/profit-loss`, { credentials: 'include' }).then(r => r.json()).then(setPl).catch(() => {})
  }, [period])

  return (
    <div style={{ marginTop: 8 }}>
      <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: 16 }}>Gelir & Gider Özeti</h2>

      {pl && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, marginBottom: 20 }}>
          <div className="glass-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Gelir (bu ay)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success)' }}>{pl.revenue.toLocaleString('tr-TR')} ₺</div>
          </div>
          <div className="glass-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Toplam Gider (Stok + Cihaz + Bakım)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--danger)' }}>{pl.expenses.toLocaleString('tr-TR')} ₺</div>
          </div>
          <div className="glass-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Net</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: pl.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pl.net.toLocaleString('tr-TR')} ₺</div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--foreground)' }}>Gelir Gider Grafiği</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {(['daily', 'weekly', 'monthly'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--glass-border)', background: period === p ? 'var(--accent)' : 'var(--glass-bg)', color: period === p ? '#fff' : 'var(--foreground-2)', cursor: 'pointer' }}>
                {p === 'daily' ? 'Günlük' : p === 'weekly' ? 'Haftalık' : 'Aylık'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 280, background: 'var(--glass-bg)', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
          {chartData.length === 0 ? (
            <div style={{ color: 'var(--foreground-3)', fontSize: '0.75rem' }}>Henüz gelir/gider verisi yok</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip formatter={(value: any) => `${Number(value).toLocaleString('tr-TR')} ₺`} />
                <Legend />
                <Bar dataKey="gelir" name="Gelir" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gider" name="Gider" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {expenses.length > 0 && (
        <div>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: 8 }}>Son Stok / Cihaz / Bakım Hareketleri</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {expenses.slice(0, 10).map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--glass-bg)', fontSize: '0.72rem' }}>
                <span style={{ color: 'var(--foreground-2)' }}>
                  {e.date} · {e.itemName} × {e.quantity}
                  {e.category ? ` · ${e.category}` : ''}
                </span>
                <span style={{ color: e.totalCost < 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                  {e.totalCost.toLocaleString('tr-TR')} ₺
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
