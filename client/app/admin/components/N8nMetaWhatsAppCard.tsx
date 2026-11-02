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
      setError(cause instanceof Error ? cause.message : 'n8n Meta WhatsApp ayarları yüklenemedi.')
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
          ? 'Yeni HMAC sırrı üretildi. Lütfen n8n ortam değişkenlerinize kopyalayın (yalnızca bir kez tam gösterilir).'
          : 'n8n + Meta WhatsApp Cloud API ayarları kaydedildi.',
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
      setError(cause instanceof Error ? cause.message : 'n8n webhook testi başarısız.')
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
          <h3 id="n8n-meta-wa-heading">WhatsApp — n8n + Resmi Meta Cloud API Köprüsü</h3>
          <p className={styles.description}>
            Evolution API (QR) bağlantısını koruyarak, n8n üzerinden resmi Meta WhatsApp Business Cloud API ile ban riski olmadan mesajlaşma ve 24 saat penceresi uyumlu şablon gönderimi sağlar.
          </p>
        </div>
        {config && (
          <span className={`${styles.badge} ${isN8nActive && isConfigured ? styles.connected : ''}`}>
            {isN8nActive ? (isConfigured ? 'n8n Meta Aktif' : 'n8n Yapılandırma Eksik') : 'Evolution (QR) Seçili'}
          </span>
        )}
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {loading ? (
        <p>n8n Meta WhatsApp ayarları yükleniyor…</p>
      ) : !config ? (
        <p>Klinik bilgisi bulunamadı.</p>
      ) : (
        <>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Aktif WhatsApp Sağlayıcısı</span>
              <select
                value={provider}
                disabled={busy}
                onChange={e => setProvider(e.target.value as 'evolution' | 'n8n_meta')}
              >
                <option value="evolution">Evolution API (Mevcut QR Bağlantısı)</option>
                <option value="n8n_meta">n8n + Resmi Meta WhatsApp Cloud API</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Meta Phone Number ID</span>
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
            <span>n8n Gönderim (Outbound) Webhook URL</span>
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
              <span>VoiceAI Gelen Mesaj (Inbound) Webhook Adresi</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={`${origin}${config.inboundWebhookPath}`}
                />
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => copyText(`${origin}${config.inboundWebhookPath}`, 'Inbound Webhook URL')}
                >
                  Kopyala
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <span>HMAC İmza Sırrı (X-VoiceAI-Signature)</span>
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
                    onClick={() => copyText(config.revealedInboundSecret!, 'HMAC sırrı')}
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
                  Yeni Sır Üret
                </button>
              </div>
            </div>
          </div>

          {isN8nActive && (
            <div className={styles.preferences} aria-label="n8n Meta WhatsApp tercihleri">
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
                  <strong>n8n Meta Gönderimleri Aktif</strong>
                  <small>Randevu bildirimleri ve yanıtları n8n Meta Cloud API köprüsü üzerinden gönderilir.</small>
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
                  <strong>AI Otomatik Yanıtları (Flow + Bilgi Tabanı)</strong>
                  <small>Gelen mesajlara 24 saatlik pencere içinde AI ve Flow Builder akışıyla otomatik yanıt üretir.</small>
                </span>
              </label>
            </div>
          )}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--integration-border, var(--glass-border))' }}>
            <strong style={{ fontSize: 13 }}>Onaylı Meta Şablonları (24 Saatlik Pencere Dışı Bildirimler İçin)</strong>
            <p className={styles.description} style={{ margin: '4px 0 10px' }}>
              Son müşteri mesajından 24 saat geçtiyse Meta serbest metin gönderimini engeller; burada tanımlı onaylı şablon (mode=&quot;template&quot;) otomatik kullanılır.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input
                type="text"
                placeholder="Şablon adı (örn: randevu_hatirlatma)"
                value={newTplName}
                onChange={e => setNewTplName(e.target.value)}
                style={{ flex: '2 1 200px', minHeight: 38, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--integration-border-strong, var(--input-border))', background: 'var(--integration-surface, var(--input-bg))', color: 'var(--integration-text, var(--foreground))' }}
              />
              <input
                type="text"
                placeholder="Dil (tr)"
                value={newTplLang}
                onChange={e => setNewTplLang(e.target.value)}
                style={{ width: 80, minHeight: 38, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--integration-border-strong, var(--input-border))', background: 'var(--integration-surface, var(--input-bg))', color: 'var(--integration-text, var(--foreground))' }}
              />
              <select
                value={newTplCategory}
                onChange={e => setNewTplCategory(e.target.value)}
                style={{ minHeight: 38, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--integration-border-strong, var(--input-border))', background: 'var(--integration-surface, var(--input-bg))', color: 'var(--integration-text, var(--foreground))' }}
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
                      style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontWeight: 700 }}
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
              {busy ? 'Kaydediliyor…' : 'n8n Meta Ayarlarını Kaydet'}
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

