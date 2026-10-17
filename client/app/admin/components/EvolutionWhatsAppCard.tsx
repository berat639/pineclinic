'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './EvolutionWhatsAppCard.module.css'

type Config = {
  clinicId: string; clinicName: string; connectionState: string; setupStatus: string
  expectedPhone: string | null; testPhone: string | null; enabled: boolean; aiEnabled: boolean
}
const API = '/api/admin/whatsapp'
const states: Record<string, string> = { open: 'Bağlı', close: 'Bağlantı kesildi', connecting: 'Bağlanıyor', unconfigured: 'Kurulum gerekli', unknown: 'Durum bilinmiyor' }

async function api<T>(path: string, method = 'GET'): Promise<T> {
  const response = await fetch(`${API}${path}`, { method })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
  return data as T
}

export default function EvolutionWhatsAppCard() {
  const [config, setConfig] = useState<Config | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (quiet = false) => {
    try {
      const rows = await api<Config[]>('/')
      const next = rows[0] || null
      setConfig(next)
      if (next?.connectionState === 'open') setQr(null)
    } catch (cause) { if (!quiet) setError(cause instanceof Error ? cause.message : 'WhatsApp ayarları yüklenemedi.') }
    finally { if (!quiet) setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!config || (!qr && config.connectionState !== 'connecting')) return
    const timer = setInterval(() => { void api<{ connectionState: string; setupStatus: string }>(`/${config.clinicId}/status`).then(result => {
      setConfig(current => current ? { ...current, ...result } : current)
      if (result.connectionState === 'open') { setQr(null); setNotice('WhatsApp bağlantısı kuruldu.') }
    }).catch(() => {}) }, 5_000)
    return () => clearInterval(timer)
  }, [config, qr])

  const connect = async () => {
    if (!config) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api<{ qrcode: string | null; connectionState: string }>(`/${config.clinicId}/connect`, 'POST')
      setQr(result.qrcode); setConfig(current => current ? { ...current, connectionState: result.connectionState } : current)
      setNotice(result.qrcode ? 'QR kodu hazır. Bu klinik telefonundan okutun.' : 'Bağlantı isteği gönderildi; durum kontrol ediliyor.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'WhatsApp QR kodu hazırlanamadı.') }
    finally { setBusy(false) }
  }
  const connectionClass = config?.connectionState === 'open' ? styles.connected : config?.connectionState === 'connecting' ? styles.connecting : config?.connectionState === 'close' ? styles.disconnected : ''

  return <section className={styles.card} aria-labelledby="evolution-heading">
    <div className={styles.heading}><div><h3 id="evolution-heading">WhatsApp bağlantısı</h3><p className={styles.description}>Bu kliniğin WhatsApp hattı merkezi platform tarafından yönetilir.</p></div>{config && <span className={`${styles.badge} ${connectionClass}`}>{states[config.connectionState] || states.unknown}</span>}</div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading ? <p>WhatsApp ayarları yükleniyor…</p> : !config ? <p>WhatsApp bağlantısı için önce merkez panelden klinik kurulumu tamamlanmalıdır.</p> : <>
      <p className={styles.managedInfo}>Klinik telefonu: <strong>{config.expectedPhone || 'Merkez panelden tanımlanmadı'}</strong><br />Gönderimler: <strong>{config.enabled ? 'Açık' : 'Kapalı'}</strong> · AI otomatik yanıtları: <strong>{config.aiEnabled ? 'Açık' : 'Kapalı'}</strong></p>
      <div className={styles.actions}><button disabled={busy || !config.expectedPhone} onClick={connect}>{qr ? 'QR kodunu yenile' : 'WhatsApp bağla / QR göster'}</button><button className={styles.secondary} disabled={busy} onClick={() => { setError(''); void load() }}>Durumu yenile</button></div>
      {qr && <div className={styles.qr}><img src={qr} width={240} height={240} alt={`${config.clinicName} WhatsApp bağlantı QR kodu`} /><p>Telefonunda WhatsApp → Bağlı cihazlar → Cihaz bağla yolunu açıp kodu okut.</p></div>}
    </>}
  </section>
}
