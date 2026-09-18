'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './EvolutionWhatsAppCard.module.css'

type Config = {
  clinicId: string
  clinicName: string
  baseUrl: string
  instanceName: string
  hasApiKey: boolean
  enabled: boolean
  aiEnabled: boolean
  connectionState: string
  evolutionMode: 'managed' | 'manual'
}
const API = '/api/admin/whatsapp'
const states: Record<string, string> = { open: 'Bağlı', close: 'Bağlantı kesildi', connecting: 'Bağlanıyor', unconfigured: 'Kurulum gerekli', unknown: 'Durum bilinmiyor' }

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
  return data as T
}

export default function EvolutionWhatsAppCard() {
  const [configs, setConfigs] = useState<Config[]>([])
  const [form, setForm] = useState<Config | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api<Config[]>('/').then(async rows => {
      if (!active) return
      const initial = rows[0] || null
      setConfigs(rows)
      setForm(initial)
      setLoading(false)
      if (!initial || initial.evolutionMode !== 'managed' || initial.connectionState === 'open') return

      setBusy(true)
      try {
        const result = await api<{ qrcode: string | null; connectionState: string }>(`/${initial.clinicId}/connect`, 'POST')
        if (!active) return
        setQr(result.qrcode)
        setForm(current => current?.clinicId === initial.clinicId ? { ...current, connectionState: result.connectionState } : current)
        setConfigs(current => current.map(config => config.clinicId === initial.clinicId
          ? { ...config, connectionState: result.connectionState }
          : config))
        if (!result.qrcode) setNotice('WhatsApp bağlantısı hazırlandı. Bağlantı durumu kontrol ediliyor.')
      } catch (connectError) {
        if (active) setError(connectError instanceof Error ? connectError.message : 'WhatsApp QR kodu hazırlanamadı.')
      } finally {
        if (active) setBusy(false)
      }
    })
      .catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await operation() } catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.') } finally { setBusy(false) }
  }
  const save = async () => {
    if (!form) return
    const updated = await api<Config>(`/${form.clinicId}`, 'PUT', {
      baseUrl: form.baseUrl, instanceName: form.instanceName, enabled: form.enabled, aiEnabled: form.aiEnabled,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    })
    setForm(updated); setApiKey(''); setConfigs(rows => rows.map(c => c.clinicId === updated.clinicId ? updated : c))
    return updated
  }
  const checkStatus = useCallback(async () => {
    if (!form) return
    const result = await api<{ connectionState: string }>(`/${form.clinicId}/status`)
    setForm(current => current?.clinicId === form.clinicId ? { ...current, connectionState: result.connectionState } : current)
    if (result.connectionState === 'open') { setQr(null); setNotice('WhatsApp bağlantısı kuruldu.') }
  }, [form?.clinicId])

  useEffect(() => {
    if (!form || (!qr && form.connectionState !== 'connecting')) return
    const timer = setInterval(() => { void checkStatus().catch(() => { }) }, 5000)
    return () => clearInterval(timer)
  }, [qr, form?.connectionState, checkStatus])

  const patch = (change: Partial<Config>) => setForm(current => current ? { ...current, ...change } : current)
  const connectionClass = form?.connectionState === 'open'
    ? styles.connected
    : form?.connectionState === 'connecting'
      ? styles.connecting
      : form?.connectionState === 'close'
        ? styles.disconnected
        : ''

  return <section className={styles.card} aria-labelledby="evolution-heading">
    <div className={styles.heading}>
      <div><h3 id="evolution-heading">WhatsApp · API</h3><p className={styles.description}>AI ile mesajları yanıtlayın ve randevu taleplerini yönetin.</p></div>
      {form && <span className={`${styles.badge} ${connectionClass}`}>{states[form.connectionState] || 'Durum bilinmiyor'}</span>}
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading ? <p>WhatsApp ayarları yükleniyor…</p> : !form ? <p>WhatsApp bağlamak için önce bir klinik kaydı oluşturun.</p> : <>
      {configs.length > 1 && <label className={styles.field}>Klinik<select value={form.clinicId} disabled={busy} onChange={e => {
        setForm(configs.find(c => c.clinicId === e.target.value) || null); setApiKey(''); setQr(null)
      }}>{configs.map(c => <option key={c.clinicId} value={c.clinicId}>{c.clinicName}</option>)}</select></label>}
      {form.evolutionMode === 'managed' && <p className={styles.managedInfo}>Evolution altyapısı merkezi olarak güvenli biçimde yönetiliyor. Bu kliniğe yalnızca kendi WhatsApp bağlantısı ve QR kodu gösterilir.</p>}
      <div className={styles.grid}>
        {form.evolutionMode === 'manual' && <>
          <label className={styles.field}>WhatsApp sunucu adresi<input type="url" placeholder="https://whatsapp.ornek.com" value={form.baseUrl} onChange={e => patch({ baseUrl: e.target.value })} /></label>
          <label className={styles.field}>Bağlantı adı (instance)<input placeholder="klinik-whatsapp" value={form.instanceName} onChange={e => patch({ instanceName: e.target.value })} /></label>
          <label className={styles.field}>WhatsApp API anahtarı<input type="password" autoComplete="new-password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={form.hasApiKey ? 'Kayıtlı. Değiştirmek için yeni anahtarı girin.' : 'WhatsApp sunucunuzun API anahtarı'} /><small>Anahtar kaydedildikten sonra ekranda gösterilmez.</small></label>
        </>}
        <div className={styles.checks}>
          <label><input type="checkbox" checked={form.enabled} onChange={e => patch({ enabled: e.target.checked })} /> WhatsApp gönderimleri açık</label>
          <label><input type="checkbox" checked={form.aiEnabled} onChange={e => patch({ aiEnabled: e.target.checked })} /> AI otomatik yanıtları açık</label>
        </div>
      </div>
      <div className={styles.actions}>
        <button disabled={busy} onClick={() => run(async () => { await save(); setNotice('WhatsApp ayarları kaydedildi.') })}>Ayarları kaydet</button>
        <button disabled={busy} onClick={() => run(async () => {
          const saved = await save(); if (!saved) return
          const result = await api<{ qrcode: string | null; connectionState: string }>(`/${saved.clinicId}/connect`, 'POST')
          setQr(result.qrcode); patch({ connectionState: result.connectionState })
          if (!result.qrcode) { await checkStatus(); setNotice('Bağlantı isteği gönderildi. Gerekirse QR kodunu yenileyin.') }
        })}>{qr ? 'QR kodunu yenile' : 'WhatsApp bağla / QR göster'}</button>
        <button className={styles.secondary} disabled={busy || !form.hasApiKey} onClick={() => run(checkStatus)}>Durumu kontrol et</button>
      </div>
      {qr && <div className={styles.qr}><img src={qr} width={240} height={240} alt="WhatsApp bağlantısı için QR kodu" /><p>Telefonunda WhatsApp → Bağlı cihazlar → Cihaz bağla yolunu açıp kodu okut.</p></div>}
      {form.evolutionMode === 'manual' && <details className={styles.guide}><summary>API anahtarını nasıl alırım?</summary><p>Kendi sunucunu kullanıyorsan anahtar, kurulum sırasında belirlenen <code>AUTHENTICATION_API_KEY</code> değeridir. Bir hizmet sağlayıcı kullanıyorsan anahtarı sağlayıcının panelinden edin. Sunucu adresi ve bağlantı adıyla birlikte yukarıya girip kaydet; ardından QR kodunu okut.</p></details>}
    </>}
  </section>
}
