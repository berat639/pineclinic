'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface RevenuePoint { date: string; total: number }
interface Expense { id: string; itemName: string; quantity: number; totalCost: number; date: string; category?: string; notes?: string | null }
interface IncomeExpensePoint { date: string; gelir: number; gider: number }
interface FinanceSettings {
  legalName?: string | null; taxNumber?: string | null; taxOffice?: string | null; mersisNumber?: string | null
  address?: string | null; email?: string | null; invoicePrefix?: string; eDocumentProvider?: string
}
interface FinancialDocument {
  id: string; documentNumber: string; issueDate: string; recipientName: string; recipientIdentifier?: string | null
  documentType: string; status: string; subtotal: number; taxTotal: number; grandTotal: number; currency: string
}

export default function FinansalTab() {
  const [revenue, setRevenue] = useState<RevenuePoint[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [chartData, setChartData] = useState<IncomeExpensePoint[]>([])
  const [pl, setPl] = useState<{ revenue: number; expenses: number; net: number } | null>(null)
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [accountingMonth, setAccountingMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings>({ invoicePrefix: 'KLC', eDocumentProvider: 'none' })
  const [documents, setDocuments] = useState<FinancialDocument[]>([])
  const [showDocumentForm, setShowDocumentForm] = useState(false)
  const [savingFinance, setSavingFinance] = useState(false)
  const [financeNotice, setFinanceNotice] = useState('')
  const [providerForm, setProviderForm] = useState({ provider: 'iyzico', merchantId: '', apiKey: '', secret: '', webhookSecret: '', enabled: false })
  const [documentForm, setDocumentForm] = useState({ recipientName: '', recipientIdentifier: '', recipientAddress: '', description: 'Sağlık hizmeti', amount: '', quantity: '1', taxRate: '0', issueDate: new Date().toISOString().slice(0, 10), notes: '' })

  useEffect(() => {
    fetch(`/api/yonetici/finance/revenue?period=${period}`, { credentials: 'include' }).then(r => r.json()).then(setRevenue).catch(() => {})
    fetch(`/api/yonetici/finance/expenses`, { credentials: 'include' }).then(r => r.json()).then(setExpenses).catch(() => {})
    fetch(`/api/yonetici/finance/income-expense-chart?period=${period}`, { credentials: 'include' }).then(r => r.json()).then(setChartData).catch(() => {})
    fetch(`/api/yonetici/finance/profit-loss`, { credentials: 'include' }).then(r => r.json()).then(setPl).catch(() => {})
    fetch('/api/finance/settings', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(data => { if (data) setFinanceSettings(data) }).catch(() => {})
    fetch('/api/finance/documents?limit=20', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setDocuments).catch(() => {})
  }, [period])

  const downloadAccountingExport = async () => {
    const response = await fetch(`/api/finance/accounting-export?month=${accountingMonth}`, { credentials: 'include' })
    if (!response.ok) { setFinanceNotice('Muhasebe dışa aktarımı hazırlanamadı.'); return }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `muhasebe-${accountingMonth}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const saveFinanceSettings = async () => {
    setSavingFinance(true); setFinanceNotice('')
    try {
      const response = await fetch('/api/finance/settings', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(financeSettings) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setFinanceSettings(data); setFinanceNotice('Faturalandırma bilgileri kaydedildi.')
    } catch (error: any) { setFinanceNotice(error?.message || 'Faturalandırma bilgileri kaydedilemedi.') }
    setSavingFinance(false)
  }

  const createDocumentDraft = async () => {
    setSavingFinance(true); setFinanceNotice('')
    try {
      const response = await fetch('/api/finance/documents', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...documentForm, amount: Number(documentForm.amount), quantity: Number(documentForm.quantity), taxRate: Number(documentForm.taxRate) }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setDocuments(previous => [data, ...previous])
      setShowDocumentForm(false)
      setDocumentForm(previous => ({ ...previous, recipientName: '', recipientIdentifier: '', recipientAddress: '', amount: '', notes: '' }))
      setFinanceNotice('Fatura/e-Arşiv taslağı oluşturuldu. Entegratör onayı olmadan hukuki fatura değildir.')
    } catch (error: any) { setFinanceNotice(error?.message || 'Taslak oluşturulamadı.') }
    setSavingFinance(false)
  }

  const saveOnlineProvider = async () => {
    setSavingFinance(true); setFinanceNotice('')
    try {
      const response = await fetch(`/api/finance/online-providers/${providerForm.provider}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(providerForm) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setProviderForm(previous => ({ ...previous, apiKey: '', secret: '', webhookSecret: '' }))
      setFinanceNotice(`${data.provider} sağlayıcı ayarı şifrelenerek kaydedildi.`)
    } catch (error: any) { setFinanceNotice(error?.message || 'Online ödeme sağlayıcısı kaydedilemedi.') }
    setSavingFinance(false)
  }

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

      <section style={{ marginBottom: 20, padding: 16, border: '1px solid var(--input-border)', borderRadius: 10, background: 'var(--card-bg)' }}>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--foreground)' }}>Faturalandırma ve mali müşavir</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--foreground-3)' }}>Tahsilat, fatura taslağı ve KDV kayıtları ayrıdır. Taslaklar, e-Belge entegratörünün onayı olmadan hukuki fatura sayılmaz.</p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input aria-label="Muhasebe dönemi" type="month" value={accountingMonth} onChange={event => setAccountingMonth(event.target.value)} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }} />
            <button type="button" onClick={downloadAccountingExport} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--input-bg)', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Muhasebe CSV indir</button>
            <button type="button" onClick={() => setShowDocumentForm(open => !open)} style={{ padding: '7px 10px', borderRadius: 7, border: 0, background: 'var(--accent)', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>{showDocumentForm ? 'Vazgeç' : '+ Fatura taslağı'}</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
          {([
            ['legalName', 'Unvan'], ['taxNumber', 'VKN / TCKN'], ['taxOffice', 'Vergi dairesi'], ['mersisNumber', 'MERSİS'], ['email', 'E-posta'], ['invoicePrefix', 'Belge öneki'],
          ] as const).map(([field, label]) => (
            <label key={field} style={{ display: 'grid', gap: 4, fontSize: '0.68rem', color: 'var(--foreground-3)' }}>{label}
              <input value={financeSettings[field] || ''} onChange={event => setFinanceSettings(previous => ({ ...previous, [field]: event.target.value }))} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }} />
            </label>
          ))}
          <label style={{ display: 'grid', gap: 4, fontSize: '0.68rem', color: 'var(--foreground-3)' }}>e-Belge sağlayıcısı
            <select value={financeSettings.eDocumentProvider || 'none'} onChange={event => setFinanceSettings(previous => ({ ...previous, eDocumentProvider: event.target.value }))} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }}><option value="none">Henüz bağlı değil</option><option value="gib">GİB / özel entegratör</option><option value="logo">Logo</option><option value="mikro">Mikro</option><option value="other">Diğer</option></select>
          </label>
        </div>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.68rem', color: 'var(--foreground-3)', marginBottom: 8 }}>Fatura adresi
          <input value={financeSettings.address || ''} onChange={event => setFinanceSettings(previous => ({ ...previous, address: event.target.value }))} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }} />
        </label>
        <button type="button" disabled={savingFinance} onClick={saveFinanceSettings} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--input-bg)', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>{savingFinance ? 'Kaydediliyor…' : 'Fatura bilgilerini kaydet'}</button>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--input-border)' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Online tahsilat sağlayıcısı</div>
          <p style={{ margin: '0 0 8px', fontSize: '0.68rem', color: 'var(--foreground-3)' }}>Anahtarlar sadece şifreli saklanır ve tekrar görüntülenmez. Iyzico, PayTR ve Stripe için işlem altyapısı hazırdır; canlı tahsilat bağlantısı sağlayıcının hesabı ve webhook doğrulaması ile etkinleştirilir.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: '0.68rem', color: 'var(--foreground-3)' }}>Sağlayıcı<select value={providerForm.provider} onChange={event => setProviderForm(previous => ({ ...previous, provider: event.target.value }))} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }}><option value="iyzico">Iyzico</option><option value="paytr">PayTR</option><option value="stripe">Stripe</option></select></label>
            <label style={{ display: 'grid', gap: 4, fontSize: '0.68rem', color: 'var(--foreground-3)' }}>Mağaza / Merchant ID<input value={providerForm.merchantId} onChange={event => setProviderForm(previous => ({ ...previous, merchantId: event.target.value }))} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }} /></label>
            <label style={{ display: 'grid', gap: 4, fontSize: '0.68rem', color: 'var(--foreground-3)' }}>API anahtarı<input type="password" autoComplete="new-password" value={providerForm.apiKey} onChange={event => setProviderForm(previous => ({ ...previous, apiKey: event.target.value }))} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }} /></label>
            <label style={{ display: 'grid', gap: 4, fontSize: '0.68rem', color: 'var(--foreground-3)' }}>Gizli anahtar<input type="password" autoComplete="new-password" value={providerForm.secret} onChange={event => setProviderForm(previous => ({ ...previous, secret: event.target.value }))} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }} /></label>
            <label style={{ display: 'grid', gap: 4, fontSize: '0.68rem', color: 'var(--foreground-3)' }}>Webhook imza anahtarı<input type="password" autoComplete="new-password" value={providerForm.webhookSecret} onChange={event => setProviderForm(previous => ({ ...previous, webhookSecret: event.target.value }))} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }} /></label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 32, fontSize: '0.72rem', color: 'var(--foreground-2)' }}><input type="checkbox" checked={providerForm.enabled} onChange={event => setProviderForm(previous => ({ ...previous, enabled: event.target.checked }))} /> Etkin</label>
            <button type="button" disabled={savingFinance} onClick={saveOnlineProvider} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--input-bg)', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Sağlayıcıyı kaydet</button>
          </div>
        </div>

        {showDocumentForm && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--input-border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {([
            ['recipientName', 'Alıcı / Cari *', 'text'], ['recipientIdentifier', 'VKN / TCKN', 'text'], ['description', 'Hizmet açıklaması *', 'text'], ['amount', 'Birim tutar (₺) *', 'number'], ['quantity', 'Miktar', 'number'], ['taxRate', 'KDV oranı (%)', 'number'], ['issueDate', 'Belge tarihi', 'date'],
          ] as const).map(([field, label, type]) => <label key={field} style={{ display: 'grid', gap: 4, fontSize: '0.68rem', color: 'var(--foreground-3)' }}>{label}<input type={type} value={documentForm[field]} onChange={event => setDocumentForm(previous => ({ ...previous, [field]: event.target.value }))} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }} /></label>)}
          <label style={{ display: 'grid', gap: 4, fontSize: '0.68rem', color: 'var(--foreground-3)', gridColumn: '1 / -1' }}>Alıcı adresi<input value={documentForm.recipientAddress} onChange={event => setDocumentForm(previous => ({ ...previous, recipientAddress: event.target.value }))} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.75rem' }} /></label>
          <button type="button" disabled={savingFinance} onClick={createDocumentDraft} style={{ justifySelf: 'start', padding: '7px 10px', borderRadius: 7, border: 0, background: 'var(--accent)', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>{savingFinance ? 'Oluşturuluyor…' : 'Taslak oluştur'}</button>
        </div>}
        {financeNotice && <p style={{ margin: '10px 0 0', color: 'var(--foreground-2)', fontSize: '0.72rem' }}>{financeNotice}</p>}
        {documents.length > 0 && <div style={{ marginTop: 12, overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}><thead><tr>{['Tarih', 'Belge no', 'Alıcı', 'Matrah', 'KDV', 'Toplam', 'Durum'].map(title => <th key={title} style={{ padding: 7, textAlign: 'left', color: 'var(--foreground-3)', borderBottom: '1px solid var(--input-border)' }}>{title}</th>)}</tr></thead><tbody>{documents.map(doc => <tr key={doc.id}><td style={{ padding: 7, color: 'var(--foreground-2)' }}>{doc.issueDate}</td><td style={{ padding: 7, color: 'var(--foreground-2)' }}>{doc.documentNumber}</td><td style={{ padding: 7, color: 'var(--foreground-2)' }}>{doc.recipientName}</td><td style={{ padding: 7, color: 'var(--foreground-2)' }}>{doc.subtotal.toLocaleString('tr-TR')} ₺</td><td style={{ padding: 7, color: 'var(--foreground-2)' }}>{doc.taxTotal.toLocaleString('tr-TR')} ₺</td><td style={{ padding: 7, color: 'var(--foreground)', fontWeight: 600 }}>{doc.grandTotal.toLocaleString('tr-TR')} ₺</td><td style={{ padding: 7, color: 'var(--foreground-2)' }}>{doc.status === 'draft' ? 'Taslak' : doc.status}</td></tr>)}</tbody></table></div>}
      </section>

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
