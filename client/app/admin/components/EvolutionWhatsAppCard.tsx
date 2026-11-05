'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './EvolutionWhatsAppCard.module.css'

type Config = {
  clinicId: string
  clinicName: string
  configured?: boolean
  baseUrl?: string
  instanceName?: string
  hasApiKey?: boolean
  connectionState: string
  setupStatus: string
  expectedPhone: string | null
  linkedPhone?: string | null
  testPhone: string | null
  enabled: boolean
  aiEnabled: boolean
}
const API = '/api/admin/whatsapp'
const states: Record<string, string> = {
  open: 'Bağlı',
  close: 'Bağlantı kesildi',
  connecting: 'Bağlanıyor',
  unconfigured: 'Kurulum gerekli',
  unknown: 'Durum bilinmiyor',
}

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
  return data as T
}

export default function EvolutionWhatsAppCard() {
  const [config, setConfig] = useState<Config | null>(null)
  const [expectedPhoneInput, setExpectedPhoneInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [instanceNameInput, setInstanceNameInput] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const syncFields = useCallback((next: Config | null) => {
    setConfig(next)
    if (!next) return
    setExpectedPhoneInput(prev => prev || next.expectedPhone || next.linkedPhone || '')
    setBaseUrlInput(prev => prev || next.baseUrl || '')
    setInstanceNameInput(prev => prev || next.instanceName || `voiceai-${next.clinicId}`)
  }, [])

  const load = useCallback(async (quiet = false) => {
    try {
      const rows = await api<Config[]>('/')
      const next = rows[0] || null
      syncFields(next)
      if (next?.connectionState === 'open') setQr(null)
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : 'WhatsApp ayarları yüklenemedi.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [syncFields])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!config || (!qr && config.connectionState !== 'connecting')) return
    const timer = setInterval(() => {
      void api<Config>(`/${config.clinicId}/status`).then(result => {
        setConfig(current => current ? { ...current, ...result } : current)
        if (result.expectedPhone) setExpectedPhoneInput(result.expectedPhone)
        if (result.connectionState === 'open') {
          setQr(null)
          setNotice('WhatsApp bağlantısı kuruldu. Gönderimleri ve yapay zeka yanıtlarını aşağıdan açabilirsiniz.')
        }
      }).catch(() => {})
    }, 4_000)
    return () => clearInterval(timer)
  }, [config, qr])

  const saveServerSettings = async () => {
    if (!config) return
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await api<Config>(`/${config.clinicId}`, 'PUT', {
        baseUrl: baseUrlInput.trim(),
        instanceName: instanceNameInput.trim() || `voiceai-${config.clinicId}`,
        apiKey: apiKeyInput.trim() || undefined,
        expectedPhone: expectedPhoneInput.trim(),
        enabled: config.enabled,
        aiEnabled: config.aiEnabled,
      })
      setConfig(updated)
      setApiKeyInput('')
      if (updated.expectedPhone) setExpectedPhoneInput(updated.expectedPhone)
      setNotice('WhatsApp sunucu ve numara ayarları kaydedildi.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sunucu ayarları kaydedilemedi.')
    } finally {
      setBusy(false)
    }
  }

  const connect = async () => {
    if (!config) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api<{ qrcode: string | null; connectionState: string; clinic?: Config }>(
        `/${config.clinicId}/connect`,
        'POST',
        {
          expectedPhone: expectedPhoneInput.trim() || undefined,
          baseUrl: baseUrlInput.trim() || undefined,
          apiKey: apiKeyInput.trim() || undefined,
          instanceName: instanceNameInput.trim() || undefined,
        },
      )
      setQr(result.qrcode)
      if (result.clinic) {
        setConfig(result.clinic)
        if (result.clinic.expectedPhone) setExpectedPhoneInput(result.clinic.expectedPhone)
      } else {
        setConfig(current => current ? { ...current, connectionState: result.connectionState } : current)
      }
      setApiKeyInput('')
      setNotice(
        result.connectionState === 'open'
          ? 'WhatsApp bağlantısı zaten açık ve doğrulandı.'
          : result.qrcode
            ? 'Karekod hazır. Klinik telefonundan WhatsApp → Bağlı Cihazlar → Cihaz Bağla adımıyla okutun.'
            : 'Bağlantı isteği gönderildi; durum kontrol ediliyor.',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'WhatsApp karekodu hazırlanamadı.')
    } finally {
      setBusy(false)
    }
  }

  const updatePreferences = async (next: Pick<Config, 'enabled' | 'aiEnabled'>) => {
    if (!config) return
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await api<Config>(`/${config.clinicId}/preferences`, 'PATCH', next)
      setConfig(updated)
      setNotice('WhatsApp tercihleri güncellendi.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'WhatsApp tercihleri güncellenemedi.')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!config) return
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await api<Config>(`/${config.clinicId}/disconnect`, 'DELETE')
      setConfig(updated); setQr(null); setConfirmDisconnect(false)
      setNotice('WhatsApp bağlantısı kesildi. Yeniden bağlamak için karekod oluşturabilirsiniz.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'WhatsApp bağlantısı kesilemedi.')
    } finally {
      setBusy(false)
    }
  }

  const refreshStatus = async () => {
    if (!config) return
    setBusy(true); setError(''); setNotice('')
    try {
      const refreshed = await api<Config>(`/${config.clinicId}/status`)
      setConfig(current => current ? { ...current, ...refreshed } : refreshed)
      if (refreshed.expectedPhone) setExpectedPhoneInput(refreshed.expectedPhone)
      if (refreshed.connectionState === 'open') setQr(null)
      setNotice(`Durum güncellendi: ${states[refreshed.connectionState] || states.unknown}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'WhatsApp durumu sorgulanamadı.')
    } finally {
      setBusy(false)
    }
  }

  const connectionClass =
    config?.connectionState === 'open'
      ? styles.connected
      : config?.connectionState === 'connecting'
        ? styles.connecting
        : config?.connectionState === 'close'
          ? styles.disconnected
          : ''

  return (
    <section className={styles.card} aria-labelledby="evolution-heading">
      <div className={styles.heading}>
        <div>
          <h3 id="evolution-heading">WhatsApp Bağlantısı (Evolution QR)</h3>
          <p className={styles.description}>
            Klinik WhatsApp hattınızı karekod (QR) ile bağlayarak randevu bildirimlerini ve yapay zeka yanıtlarını yönetebilirsiniz.
          </p>
        </div>
        {config && (
          <span className={`${styles.badge} ${connectionClass}`}>
            {states[config.connectionState] || states.unknown}
          </span>
        )}
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {loading ? (
        <p>WhatsApp ayarları yükleniyor…</p>
      ) : !config ? (
        <p>WhatsApp bağlantısı için klinik kaydı bulunamadı.</p>
      ) : (
        <>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Beklenen Klinik WhatsApp Numarası</span>
              <input
                type="tel"
                value={expectedPhoneInput}
                disabled={busy}
                placeholder="Örn: +90 555 111 22 33"
                onChange={e => setExpectedPhoneInput(e.target.value)}
              />
              <small>
                {config.linkedPhone
                  ? `Bağlı cihaz numarası: ${config.linkedPhone}`
                  : 'Boş bırakılırsa karekod okutulduğunda bağlanan numara otomatik kaydedilir.'}
              </small>
            </label>

            <div className={styles.field}>
              <span>Bağlantı Durumu ve Doğrulama</span>
              <div className={styles.managedInfo} style={{ margin: 0 }}>
                <strong>
                  {config.connectionState === 'open'
                    ? `● Aktif Bağlantı (${config.linkedPhone || config.expectedPhone || 'Numara doğrulandı'})`
                    : config.setupStatus === 'phone_mismatch'
                      ? '⚠ Farklı numara algılandı — karekodu klinik telefonuyla yenileyin'
                      : '○ Cihaz henüz bağlı değil — karekod oluşturup telefonunuzdan okutun'}
                </strong>
              </div>
            </div>
          </div>

          <div className={styles.preferences} aria-label="WhatsApp tercihleri">
            <label>
              <input
                type="checkbox"
                checked={config.enabled}
                disabled={busy || config.connectionState !== 'open'}
                onChange={event =>
                  void updatePreferences({
                    enabled: event.target.checked,
                    aiEnabled: event.target.checked ? config.aiEnabled : false,
                  })
                }
              />
              <span>
                <strong>Gönderimler</strong>
                <small>Randevu ve bilgilendirme mesajlarını WhatsApp üzerinden gönderir.</small>
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={config.aiEnabled}
                disabled={busy || config.connectionState !== 'open'}
                onChange={event =>
                  void updatePreferences({
                    enabled: event.target.checked ? true : config.enabled,
                    aiEnabled: event.target.checked,
                  })
                }
              />
              <span>
                <strong>Yapay zeka otomatik yanıtları</strong>
                <small>Gelen WhatsApp mesajlarına yapay zekanın yanıt vermesini sağlar.</small>
              </span>
            </label>
          </div>

          <div className={styles.actions}>
            {config.connectionState !== 'open' && (
              <button disabled={busy} onClick={() => void connect()}>
                {qr ? 'Karekodu Yenile' : 'WhatsApp Kurulumunu Başlat / QR Oluştur'}
              </button>
            )}
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => void refreshStatus()}
            >
              Durumu Yenile
            </button>
            {config.connectionState === 'open' && (
              <button
                type="button"
                className={styles.danger}
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
              >
                Bağlantıyı Kes
              </button>
            )}
          </div>

          {confirmDisconnect && (
            <div className={styles.confirm} role="alertdialog" aria-modal="true" aria-label="WhatsApp bağlantısını kes">
              <strong>WhatsApp bağlantısı kesilsin mi?</strong>
              <p>Gönderimler ve yapay zeka otomatik yanıtları kapatılır. Yeniden bağlamak için karekodu tekrar okutmanız gerekir.</p>
              <div className={styles.actions}>
                <button className={styles.danger} disabled={busy} onClick={() => void disconnect()}>
                  Bağlantıyı Kes
                </button>
                <button className={styles.secondary} disabled={busy} onClick={() => setConfirmDisconnect(false)}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}

          {qr && (
            <div className={styles.qr}>
              <img src={qr} width={240} height={240} alt={`${config.clinicName} WhatsApp bağlantı karekodu`} />
              <p>Telefonunuzda WhatsApp → Bağlı Cihazlar → Cihaz Bağla yolunu açıp karekodu okutun.</p>
            </div>
          )}

          <details className={styles.guide} open={!config.configured}>
            <summary>⚙️ Sunucu Bağlantı Ayarları (Evolution API)</summary>
            <p style={{ marginTop: 8, marginBottom: 12 }}>
              Merkezi Evolution sunucusu kullanıyorsanız bu alanlar otomatik doldurulur. Özel bir Evolution API sunucusu kullanmak isterseniz bağlantı bilgilerini aşağıdan kaydedebilirsiniz.
            </p>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span>Sunucu Adresi (Base URL)</span>
                <input
                  type="url"
                  value={baseUrlInput}
                  disabled={busy}
                  placeholder="http://voiceai-evolution:8080"
                  onChange={e => setBaseUrlInput(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>API Anahtarı (API Key)</span>
                <input
                  type="password"
                  value={apiKeyInput}
                  disabled={busy}
                  placeholder={config.hasApiKey ? 'Kayıtlı — değiştirmek için yeni anahtar girin' : 'Evolution API anahtarını girin'}
                  onChange={e => setApiKeyInput(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Örnek Adı (Instance Name)</span>
                <input
                  type="text"
                  value={instanceNameInput}
                  disabled={busy}
                  placeholder={`voiceai-${config.clinicId}`}
                  onChange={e => setInstanceNameInput(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Klinik WhatsApp Numarası</span>
                <input
                  type="tel"
                  value={expectedPhoneInput}
                  disabled={busy}
                  placeholder="+90 555 111 22 33"
                  onChange={e => setExpectedPhoneInput(e.target.value)}
                />
              </label>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => void saveServerSettings()}>
                Sunucu Ayarlarını Kaydet
              </button>
            </div>
          </details>
        </>
      )}
    </section>
  )
}

