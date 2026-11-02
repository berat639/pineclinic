'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './EvolutionWhatsAppCard.module.css'

type TemplateItem = {
  name: string
  language: string
  category?: string
  bodyPreview?: string
}

type N8nConfig = {
  clinicId: string
  clinicName: string
  provider: 'evolution' | 'n8n_meta'
  enabled: boolean
  aiEnabled: boolean
  n8nSendWebhookUrl: string
  metaPhoneNumberId: string
  inboundWebhookPath: string
  statusWebhookPath: string
  hasInboundSecret: boolean
  inboundSecretPreview: string | null
  revealedInboundSecret: string | null
  templates: TemplateItem[]
}

const API = '/api/admin/whatsapp'

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

export default function N8nMetaWhatsAppCard() {
  const [config, setConfig] = useState<N8nConfig | null>(null)
  const [provider, setProvider] = useState<'evolution' | 'n8n_meta'>('evolution')
  const [sendWebhookUrl, setSendWebhookUrl] = useState('')
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(false)
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [newTplName, setNewTplName] = useState('')
  const [newTplLang, setNewTplLang] = useState('tr')
  const [newTplCategory, setNewTplCategory] = useState('appointment_reminder')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const applyConfig = (c: N8nConfig) => {
    setConfig(c)
    setProvider(c.provider)
    setSendWebhookUrl(c.n8nSendWebhookUrl || '')
    setMetaPhoneNumberId(c.metaPhoneNumberId || '')
    setEnabled(c.enabled)
    setAiEnabled(c.aiEnabled)
    setTemplates(Array.isArray(c.templates) ? c.templates : [])
  }

  const load = useCallback(async () => {
    try {
      const rows = await api<Array<{ clinicId: string }>>('/')
      const first = rows[0]
      if (!first) {
        setLoading(false)
        return
      }
      const detail = await api<N8nConfig>(`/${first.clinicId}/n8n`)
      applyConfig(detail)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'n8n ve Meta WhatsApp ayarları yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (rotateSecret = false) => {
    if (!config) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const updated = await api<N8nConfig>(`/${config.clinicId}/n8n`, 'PUT', {
        provider,
        n8nSendWebhookUrl: sendWebhookUrl,
        metaPhoneNumberId,
        enabled,
        aiEnabled: enabled ? aiEnabled : false,
        rotateSecret,
        templates,
      })
      applyConfig(updated)
      setNotice(
        rotateSecret
          ? 'Yeni imza anahtarı üretildi. Lütfen n8n ayarlarınıza kopyalayın (yalnızca bir kez tam gösterilir).'
          : 'n8n ve Meta WhatsApp ayarları kaydedildi.',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ayarlar kaydedilemedi.')
    } finally {
      setBusy(false)
    }
  }

  const testWebhook = async () => {
    if (!config) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await api<{ ok: boolean; status: number; message: string }>(`/${config.clinicId}/n8n/test`, 'POST')
      if (res.ok) setNotice(res.message)
      else setError(res.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'n8n bağlantı testi başarısız.')
    } finally {
      setBusy(false)
    }
  }

  const addTemplate = () => {
    const clean = newTplName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    if (!clean) return
    if (templates.some(t => t.name === clean && t.language === newTplLang)) return
    setTemplates(prev => [...prev, { name: clean, language: newTplLang.trim() || 'tr', category: newTplCategory }])
    setNewTplName('')
  }

  const removeTemplate = (idx: number) => {
    setTemplates(prev => prev.filter((_, i) => i !== idx))
  }

  const copyText = (value: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(value)
      setNotice(`${label} panoya kopyalandı.`)
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const isN8nActive = provider === 'n8n_meta'
  const isConfigured = Boolean(sendWebhookUrl.trim() && config?.hasInboundSecret)

  return (
    <section className={styles.card} aria-labelledby="n8n-meta-wa-heading">
      <div className={styles.heading}>
        <div>
          <h3 id="n8n-meta-wa-heading">WhatsApp — n8n ve Resmi Meta Bağlantısı</h3>
          <p className={styles.description}>
            QR ile kurulan mevcut bağlantıyı koruyarak, n8n üzerinden resmi Meta WhatsApp Business hesabıyla engellenme riski olmadan mesajlaşmayı ve 24 saatlik süreye uyumlu şablon gönderimini sağlar.
          </p>
        </div>
        {config && (
          <span className={`${styles.badge} ${isN8nActive && isConfigured ? styles.connected : ''}`}>
            {isN8nActive ? (isConfigured ? 'n8n ve Meta Aktif' : 'n8n Kurulumu Eksik') : 'QR Bağlantısı Seçili'}
          </span>
        )}
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {loading ? (
        <p>n8n ve Meta WhatsApp ayarları yükleniyor…</p>
      ) : !config ? (
        <p>Klinik bilgisi bulunamadı.</p>
      ) : (
        <>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Kullanılacak WhatsApp Bağlantısı</span>
              <select
                value={provider}
                disabled={busy}
                onChange={e => setProvider(e.target.value as 'evolution' | 'n8n_meta')}
              >
                <option value="evolution">Mevcut QR Bağlantısı</option>
                <option value="n8n_meta">n8n ve Resmi Meta WhatsApp Bağlantısı</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Meta Telefon Numarası Kimliği</span>
              <input
                type="text"
                value={metaPhoneNumberId}
                disabled={busy}
                placeholder="Örn: 109876543210123"
                onChange={e => setMetaPhoneNumberId(e.target.value)}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>n8n Giden Mesaj Bağlantı Adresi</span>
            <input
              type="url"
              value={sendWebhookUrl}
              disabled={busy}
              placeholder="https://n8n.ornekklinik.com/webhook/voiceai-whatsapp-send"
              onChange={e => setSendWebhookUrl(e.target.value)}
            />
          </label>

          <div className={styles.grid}>
            <div className={styles.field}>
              <span>VoiceAI Gelen Mesaj Bağlantı Adresi</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={`${origin}${config.inboundWebhookPath}`}
                />
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => copyText(`${origin}${config.inboundWebhookPath}`, 'Gelen mesaj bağlantı adresi')}
                >
                  Kopyala
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <span>İmza Anahtarı (n8n doğrulaması için)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={config.revealedInboundSecret || config.inboundSecretPreview || 'Henüz üretilmedi'}
                />
                {config.revealedInboundSecret && (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => copyText(config.revealedInboundSecret!, 'İmza anahtarı')}
                  >
                    Kopyala
                  </button>
                )}
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => void save(true)}
                >
                  Yeni Anahtar Üret
                </button>
              </div>
            </div>
          </div>

          {isN8nActive && (
            <div className={styles.preferences} aria-label="n8n ve Meta WhatsApp tercihleri">
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={busy}
                  onChange={e => {
                    const next = e.target.checked
                    setEnabled(next)
                    if (!next) setAiEnabled(false)
                  }}
                />
                <span>
                  <strong>n8n ve Meta Gönderimleri Aktif</strong>
                  <small>Randevu bildirimleri ve yanıtları n8n ve Meta bağlantısı üzerinden gönderilir.</small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  disabled={busy || !enabled}
                  onChange={e => setAiEnabled(e.target.checked)}
                />
                <span>
                  <strong>Otomatik Yanıtlar (Konuşma Akışı ve Bilgi Bankası)</strong>
                  <small>Gelen mesajlara 24 saatlik süre içinde yapay zeka ve konuşma akışıyla otomatik yanıt üretir.</small>
                </span>
              </label>
            </div>
          )}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1.5px solid var(--input-border)' }}>
            <strong style={{ fontSize: 13 }}>Onaylı Meta Şablonları (24 Saatlik Süre Dışı Bildirimler İçin)</strong>
            <p className={styles.description} style={{ margin: '4px 0 10px' }}>
              Son müşteri mesajından 24 saat geçtiyse Meta serbest metin gönderimini engeller; burada tanımlı onaylı şablon otomatik kullanılır.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input
                type="text"
                placeholder="Şablon adı (örn: randevu_hatirlatma)"
                value={newTplName}
                onChange={e => setNewTplName(e.target.value)}
                style={{ flex: '2 1 200px', minHeight: 38, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', boxShadow: 'var(--pc-neo-inset)' }}
              />
              <input
                type="text"
                placeholder="Dil (örn: tr)"
                value={newTplLang}
                onChange={e => setNewTplLang(e.target.value)}
                style={{ width: 80, minHeight: 38, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', boxShadow: 'var(--pc-neo-inset)' }}
              />
              <select
                value={newTplCategory}
                onChange={e => setNewTplCategory(e.target.value)}
                style={{ minHeight: 38, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', boxShadow: 'var(--pc-neo-inset)' }}
              >
                <option value="appointment_reminder">Randevu Hatırlatma</option>
                <option value="general">Genel Bildirim</option>
              </select>
              <button type="button" className={styles.secondary} onClick={addTemplate}>
                + Şablon Ekle
              </button>
            </div>
            {templates.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {templates.map((tpl, idx) => (
                  <span key={`${tpl.name}-${idx}`} className={styles.badge} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <code>{tpl.name}</code> ({tpl.language}) · {tpl.category === 'appointment_reminder' ? 'Randevu' : 'Genel'}
                    <button
                      type="button"
                      onClick={() => removeTemplate(idx)}
                      style={{ background: 'var(--card-bg)', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                      aria-label={`${tpl.name} şablonunu kaldır`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <button disabled={busy} onClick={() => void save(false)}>
              {busy ? 'Kaydediliyor…' : 'n8n ve Meta Ayarlarını Kaydet'}
            </button>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy || !sendWebhookUrl.trim()}
              onClick={() => void testWebhook()}
            >
              Bağlantıyı Test Et
            </button>
          </div>
        </>
      )}
    </section>
  )
}

