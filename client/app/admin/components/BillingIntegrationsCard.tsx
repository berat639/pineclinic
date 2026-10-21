'use client'

import { useEffect, useState } from 'react'
import styles from './IntegrationsTab.module.css'

type BillingSettings = {
  legalName?: string | null
  taxNumber?: string | null
  taxOffice?: string | null
  mersisNumber?: string | null
  address?: string | null
  email?: string | null
  invoicePrefix?: string
  eDocumentProvider?: string
}
type ProviderState = {
  provider: string
  enabled: boolean
  merchantId: string | null
  hasApiKey: boolean
  hasSecret: boolean
  hasWebhookSecret: boolean
}

const emptySettings: BillingSettings = { invoicePrefix: 'KLC', eDocumentProvider: 'none' }
const providerNames: Record<string, string> = { iyzico: 'Iyzico', paytr: 'PayTR', stripe: 'Stripe' }

export default function BillingIntegrationsCard() {
  const [settings, setSettings] = useState<BillingSettings>(emptySettings)
  const [providers, setProviders] = useState<Record<string, ProviderState>>({})
  const [form, setForm] = useState({ provider: 'iyzico', merchantId: '', apiKey: '', secret: '', webhookSecret: '', enabled: false })
  const [saving, setSaving] = useState<'billing' | 'provider' | null>(null)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)

  const load = async () => {
    try {
      const [settingsResponse, providersResponse] = await Promise.all([
        fetch('/api/finance/settings', { credentials: 'include' }),
        fetch('/api/finance/online-providers', { credentials: 'include' }),
      ])
      if (settingsResponse.ok) setSettings({ ...emptySettings, ...await settingsResponse.json() })
      if (providersResponse.ok) {
        const rows = await providersResponse.json() as ProviderState[]
        const next = Object.fromEntries(rows.map(row => [row.provider, row])) as Record<string, ProviderState>
        setProviders(next)
        const current = next.iyzico
        if (current) setForm(value => ({ ...value, merchantId: current.merchantId || '', enabled: current.enabled }))
      }
    } catch { setNotice({ error: true, text: 'Faturalandırma entegrasyon ayarları yüklenemedi.' }) }
  }
  useEffect(() => { void load() }, [])

  const saveBilling = async () => {
    setSaving('billing'); setNotice(null)
    try {
      const response = await fetch('/api/finance/settings', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kaydedilemedi')
      setSettings({ ...emptySettings, ...data })
      setNotice({ error: false, text: 'e-Belge hazırlık bilgileri kaydedildi.' })
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : 'Kaydedilemedi' }) }
    finally { setSaving(null) }
  }

  const chooseProvider = (provider: string) => {
    const current = providers[provider]
    setForm({ provider, merchantId: current?.merchantId || '', apiKey: '', secret: '', webhookSecret: '', enabled: current?.enabled || false })
  }
  const saveProvider = async () => {
    setSaving('provider'); setNotice(null)
    try {
      const response = await fetch(`/api/finance/online-providers/${form.provider}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kaydedilemedi')
      setProviders(current => ({ ...current, [data.provider]: data }))
      setForm(current => ({ ...current, apiKey: '', secret: '', webhookSecret: '', merchantId: data.merchantId || '' }))
      setNotice({ error: false, text: `${providerNames[data.provider] || data.provider} ayarı şifreli olarak kaydedildi.` })
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : 'Kaydedilemedi' }) }
    finally { setSaving(null) }
  }

  const update = (field: keyof BillingSettings, value: string) => setSettings(current => ({ ...current, [field]: value }))
  const providerState = providers[form.provider]
  return <>
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>e-Belge ve Fatura Entegrasyonu</h3>
      <p className={styles.cardDescription}>Bu alan e-Belge entegratörü için hazırlık bilgilerini tutar. Sağlayıcı onayı olmadan oluşturulan kayıtlar hukuki fatura değildir.</p>
      <div className={styles.grid}>
        {([
          ['legalName', 'Unvan'], ['taxNumber', 'VKN / TCKN'], ['taxOffice', 'Vergi dairesi'], ['mersisNumber', 'MERSİS'], ['email', 'E-posta'], ['invoicePrefix', 'Belge öneki'],
        ] as const).map(([field, label]) => <label key={field} className={styles.field}><span className={styles.fieldLabel}>{label}</span><input value={settings[field] || ''} onChange={event => update(field, event.target.value)} /></label>)}
        <label className={styles.field}><span className={styles.fieldLabel}>e-Belge sağlayıcısı</span><select value={settings.eDocumentProvider || 'none'} onChange={event => update('eDocumentProvider', event.target.value)}><option value="none">Henüz bağlı değil</option><option value="gib">GİB / özel entegratör</option><option value="logo">Logo</option><option value="mikro">Mikro</option><option value="other">Diğer</option></select></label>
        <label className={styles.field} style={{ gridColumn: '1 / -1' }}><span className={styles.fieldLabel}>Fatura adresi</span><input value={settings.address || ''} onChange={event => update('address', event.target.value)} /></label>
      </div>
      <button type="button" className={styles.saveButton} disabled={saving !== null} onClick={() => void saveBilling()}>{saving === 'billing' ? 'Kaydediliyor…' : 'Fatura bilgilerini kaydet'}</button>
    </section>

    <section className={styles.card}>
      <h3 className={styles.cardTitle}>Online Tahsilat Entegrasyonu</h3>
      <p className={styles.cardDescription}>Iyzico, PayTR ve Stripe yapılandırması burada saklanır. Anahtarlar şifrelenir, daha sonra tekrar görüntülenmez; canlı tahsilat için sağlayıcı hesabı ve webhook doğrulaması gerekir.</p>
      <div className={styles.grid}>
        <label className={styles.field}><span className={styles.fieldLabel}>Sağlayıcı</span><select value={form.provider} onChange={event => chooseProvider(event.target.value)}>{Object.entries(providerNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Mağaza / Merchant ID</span><input value={form.merchantId} onChange={event => setForm(current => ({ ...current, merchantId: event.target.value }))} /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>API anahtarı</span><input type="password" autoComplete="new-password" placeholder={providerState?.hasApiKey ? 'Kayıtlı — değiştirmek için girin' : 'Henüz girilmedi'} value={form.apiKey} onChange={event => setForm(current => ({ ...current, apiKey: event.target.value }))} /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Gizli anahtar</span><input type="password" autoComplete="new-password" placeholder={providerState?.hasSecret ? 'Kayıtlı — değiştirmek için girin' : 'Henüz girilmedi'} value={form.secret} onChange={event => setForm(current => ({ ...current, secret: event.target.value }))} /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Webhook imza anahtarı</span><input type="password" autoComplete="new-password" placeholder={providerState?.hasWebhookSecret ? 'Kayıtlı — değiştirmek için girin' : 'İsteğe bağlı'} value={form.webhookSecret} onChange={event => setForm(current => ({ ...current, webhookSecret: event.target.value }))} /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Durum</span><span style={{ color: 'var(--integration-text-muted)', fontSize: 13 }}><input type="checkbox" checked={form.enabled} onChange={event => setForm(current => ({ ...current, enabled: event.target.checked }))} /> Etkin</span></label>
      </div>
      <button type="button" className={styles.saveButton} disabled={saving !== null} onClick={() => void saveProvider()}>{saving === 'provider' ? 'Kaydediliyor…' : 'Sağlayıcıyı kaydet'}</button>
    </section>
    {notice && <p style={{ margin: 0, color: notice.error ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{notice.text}</p>}
  </>
}
