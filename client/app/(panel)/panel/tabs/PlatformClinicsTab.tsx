'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import styles from './PlatformClinicsTab.module.css'

type WhatsAppConfig = {
  clinicId: string; clinicName: string; connectionState: string
  setupStatus: 'not_started' | 'ready' | 'phone_verifying' | 'phone_mismatch' | 'phone_verified' | 'test_pending' | 'test_verified' | 'active' | string
  expectedPhone: string | null; linkedPhone: string | null; numberVerifiedAt: string | null; testPhone: string | null; enabled: boolean
}
type Clinic = { id: string; name: string; hostname: string; isActive: boolean; createdAt: string }
const setupLabels: Record<string, string> = { not_started: 'Kurulum bekliyor', ready: 'QR bağlantısı bekliyor', phone_verifying: 'Telefon doğrulanıyor', phone_mismatch: 'Yanlış telefon bağlandı', phone_verified: 'Mesaj testi bekliyor', test_pending: 'Mesaj testi bekliyor', test_verified: 'Etkinleştirme bekliyor', active: 'Gönderimler açık' }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', ...init })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
  return data as T
}

export default function PlatformClinicsTab() {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [config, setConfig] = useState<WhatsAppConfig | null>(null)
  const [name, setName] = useState(''); const [hostname, setHostname] = useState(''); const [timezone, setTimezone] = useState('Europe/Istanbul')
  const [expectedPhone, setExpectedPhone] = useState(''); const [testPhone, setTestPhone] = useState(''); const [qr, setQr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setClinics(await request<Clinic[]>('/api/platform/clinics')) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Klinikler alınamadı.') }
    finally { setLoading(false) }
  }, [])
  const loadWhatsApp = useCallback(async (clinicId: string, quiet = false) => {
    try {
      const next = await request<WhatsAppConfig>(`/api/platform/clinics/${clinicId}/whatsapp`)
      setConfig(next); setExpectedPhone(next.expectedPhone || ''); setTestPhone(next.testPhone || '')
      if (next.connectionState === 'open') setQr(null)
      return next
    } catch (cause) { if (!quiet) setError(cause instanceof Error ? cause.message : 'WhatsApp durumu alınamadı.'); return null }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!selectedId || (!qr && config?.connectionState !== 'connecting' && config?.setupStatus !== 'phone_verifying')) return
    const timer = setInterval(() => { void loadWhatsApp(selectedId, true) }, 5_000)
    return () => clearInterval(timer)
  }, [selectedId, qr, config?.connectionState, loadWhatsApp])

  const run = async (operation: () => Promise<void>) => {
    setSaving(true); setError(''); setNotice('')
    try { await operation() } catch (cause) { setError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı.') } finally { setSaving(false) }
  }
  const selectClinic = (clinicId: string) => { setSelectedId(clinicId); setConfig(null); setQr(null); setError(''); setNotice(''); void loadWhatsApp(clinicId) }
  const createClinic = async (event: FormEvent) => { event.preventDefault(); await run(async () => {
    const clinic = await request<Clinic>('/api/platform/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, hostname, timezone }) })
    setClinics(current => [clinic, ...current]); setName(''); setHostname(''); setNotice(`${clinic.name} oluşturuldu.`); selectClinic(clinic.id)
  }) }
  const saveSetup = () => run(async () => {
    if (!selectedId) return
    const next = await request<WhatsAppConfig>(`/api/platform/clinics/${selectedId}/whatsapp`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedPhone, testPhone }) })
    setConfig(next); setQr(null); setNotice('Klinik ve test telefonu kaydedildi. QR kodunu hazırlayabilirsiniz.')
  })
  const connect = () => run(async () => {
    if (!selectedId || !config?.expectedPhone || !config.testPhone) throw new Error('Önce klinik ve test telefonu kaydedin.')
    const result = await request<{ clinic: WhatsAppConfig; qrcode: string; connectionState: string }>(`/api/platform/clinics/${selectedId}/whatsapp/connect`, { method: 'POST' })
    setQr(result.qrcode); setConfig(current => current ? { ...current, connectionState: result.connectionState } : result.clinic); setNotice('QR yalnız seçili klinik için oluşturuldu.')
  })
  const sendTest = () => run(async () => { if (!selectedId) return; setConfig(await request<WhatsAppConfig>(`/api/platform/clinics/${selectedId}/whatsapp/test`, { method: 'POST' })); setNotice('Doğrulama kodu test telefonuna gönderildi. Kodu WhatsApp üzerinden yanıtlayın.') })
  const activate = () => run(async () => { if (!selectedId) return; setConfig(await request<WhatsAppConfig>(`/api/platform/clinics/${selectedId}/whatsapp/activate`, { method: 'POST' })); setNotice('WhatsApp gönderimleri etkinleştirildi. AI otomatik yanıtları kapalı bırakıldı.') })
  const selectedClinic = clinics.find(clinic => clinic.id === selectedId)

  return <div className={styles.page}>
    <section className={styles.card}><h2 className={styles.title}>Yeni Klinik</h2><p className={styles.description}>Klinik, domain eşlemesi ve başlangıç ayarları tek işlemde oluşturulur.</p>
      <form className={styles.form} onSubmit={createClinic}>
        <label className={styles.field}><span>Klinik adı</span><input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={120} required placeholder="Örnek Diş Kliniği" /></label>
        <label className={styles.field}><span>Hostname / subdomain</span><input value={hostname} onChange={event => setHostname(event.target.value.toLowerCase())} minLength={3} maxLength={253} required placeholder="ornek.voiceai.com" /></label>
        <label className={styles.field}><span>Saat dilimi</span><input value={timezone} onChange={event => setTimezone(event.target.value)} required /></label>
        <button className={styles.button} type="submit" disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kliniği oluştur'}</button>
      </form>
    </section>
    {notice && <div className={styles.notice} role="status">{notice}</div>}{error && <div className={styles.error} role="alert">{error}</div>}
    <section className={styles.card}><h2 className={styles.title}>Klinikler ve WhatsApp kurulumu</h2><p className={styles.description}>Kliniği seçin; merkezi altyapı için sunucu adresi veya API anahtarı girmeniz gerekmez.</p>
      {loading ? <p className={styles.empty}>Klinikler yükleniyor…</p> : <div className={styles.list}>{clinics.length === 0 && <p className={styles.empty}>Henüz klinik bulunmuyor.</p>}{clinics.map(clinic => <div className={styles.row} key={clinic.id}><div><strong>{clinic.name}</strong><small>{clinic.id}</small></div><div className={styles.domain}>{clinic.hostname || 'Birincil domain tanımlı değil'}</div><button className={styles.secondaryButton} type="button" onClick={() => selectClinic(clinic.id)} disabled={saving}>{selectedId === clinic.id ? 'Seçildi' : 'WhatsApp kur'}</button></div>)}</div>}
    </section>
    {selectedClinic && <section className={styles.card} aria-labelledby="whatsapp-setup-heading"><div className={styles.setupHeading}><div><h2 className={styles.title} id="whatsapp-setup-heading">{selectedClinic.name} · WhatsApp kurulumu</h2><p className={styles.description}>Her klinik kendi instance’ını ve QR kodunu kullanır.</p></div><span className={styles.status}>{setupLabels[config?.setupStatus || 'not_started'] || 'Kurulum bekliyor'}</span></div>
      <div className={styles.setupGrid}><label className={styles.field}><span>Klinik WhatsApp telefonu</span><input value={expectedPhone} disabled={saving} onChange={event => setExpectedPhone(event.target.value)} placeholder="0555 111 22 33" /><small>QR bu telefonla okutulmalıdır.</small></label><label className={styles.field}><span>Satışçı test telefonu</span><input value={testPhone} disabled={saving} onChange={event => setTestPhone(event.target.value)} placeholder="0555 111 22 33" /><small>Doğrulama kodu bu numaraya gönderilir.</small></label></div>
      <div className={styles.actions}><button className={styles.button} type="button" onClick={saveSetup} disabled={saving}>1. Numaraları kaydet</button><button className={styles.button} type="button" onClick={connect} disabled={saving || !config?.expectedPhone || !config.testPhone}>2. QR göster</button><button className={styles.secondaryButton} type="button" onClick={() => run(async () => { if (selectedId) await loadWhatsApp(selectedId) })} disabled={saving}>Bağlantıyı kontrol et</button><button className={styles.button} type="button" onClick={sendTest} disabled={saving || config?.connectionState !== 'open' || !config.numberVerifiedAt}>3. Mesaj testi gönder</button><button className={styles.button} type="button" onClick={activate} disabled={saving || config?.setupStatus !== 'test_verified'}>4. Gönderimleri etkinleştir</button></div>
      <p className={styles.connectionText}>Bağlantı: {config?.connectionState === 'open' ? 'Açık' : config?.connectionState === 'connecting' ? 'QR okutulması bekleniyor' : 'Henüz bağlı değil'}. {config?.setupStatus === 'phone_mismatch' ? `Bağlanan ${config.linkedPhone || 'telefon'}, seçilen klinik numarasıyla eşleşmiyor.` : config?.linkedPhone ? `Doğrulanan telefon: ${config.linkedPhone}.` : 'AI otomatik yanıtları bu akışta açılmaz.'}</p>
      {qr && <div className={styles.qr}><img src={qr} width={240} height={240} alt={`${selectedClinic.name} WhatsApp bağlantı QR kodu`} /><p>{expectedPhone} numaralı telefonda WhatsApp → Bağlı cihazlar → Cihaz bağla yolunu açıp bu kodu okutun.</p></div>}
    </section>}
  </div>
}
