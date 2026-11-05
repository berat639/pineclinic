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
  metaWabaId?: string
  hasMetaAccessToken?: boolean
  metaAccessTokenPreview?: string | null
  metaVerifyToken?: string
  businessPhone?: string
  n8nWebhookPath?: string
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

function buildReadyN8nWorkflowJson(params: {
  clinicId: string
  clinicName: string
  inboundWebhookUrl: string
  secret: string
  metaPhoneNumberId: string
  metaVerifyToken: string
}) {
  const phoneId = params.metaPhoneNumberId.trim() || 'META_PHONE_NUMBER_ID'
  const verifyToken = params.metaVerifyToken.trim() || 'META_VERIFY_TOKEN'
  return {
    name: `${params.clinicName} — WhatsApp Meta & Yapay Zeka Asistanı`,
    nodes: [
      {
        parameters: {
          httpMethod: 'GET',
          path: 'meta-whatsapp-inbound',
          responseMode: 'responseNode',
          options: {},
        },
        id: 'node-meta-verify-webhook',
        name: 'Meta Webhook Doğrulama (GET)',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [240, 140],
      },
      {
        parameters: {
          respondWith: 'text',
          responseBody: `={{ $json.query['hub.verify_token'] === '${verifyToken}' ? $json.query['hub.challenge'] : 'Forbidden' }}`,
          options: {
            responseCode: `={{ $json.query['hub.verify_token'] === '${verifyToken}' ? 200 : 403 }}`,
          },
        },
        id: 'node-meta-verify-respond',
        name: 'Doğrulama Yanıtı',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [520, 140],
      },
      {
        parameters: {
          httpMethod: 'POST',
          path: 'meta-whatsapp-inbound',
          responseMode: 'onReceived',
          options: {},
        },
        id: 'node-meta-inbound-webhook',
        name: 'Meta Gelen Mesaj Webhook (POST)',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [240, 320],
      },
      {
        parameters: {
          method: 'POST',
          url: params.inboundWebhookUrl,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: 'X-Webhook-Secret',
                value: params.secret,
              },
              {
                name: 'Content-Type',
                value: 'application/json',
              },
            ],
          },
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            '={\n  "from": "{{ $json.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || $json.from || \'\' }}",\n  "name": "{{ $json.body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || $json.name || \'\' }}",\n  "text": "{{ $json.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || $json.text || \'\' }}",\n  "messageId": "{{ $json.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id || $json.messageId || \'\' }}",\n  "phoneNumberId": "{{ $json.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || \'' + phoneId + '\' }}"\n}',
          options: {},
        },
        id: 'node-voiceai-assistant',
        name: 'Sistem Yapay Zeka Asistanına İlet',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [520, 320],
      },
      {
        parameters: {
          httpMethod: 'POST',
          path: 'voiceai-whatsapp-send',
          responseMode: 'responseNode',
          options: {},
        },
        id: 'node-voiceai-outbound-webhook',
        name: 'Sistem Giden Mesaj Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [240, 560],
      },
      {
        parameters: {
          jsCode: `const item = $input.first().json;\nconst body = item.body || item;\nconst phoneNumberId = body.phoneNumberId || '${phoneId}';\nconst accessToken = body.accessToken || $env.META_ACCESS_TOKEN || '';\n\nif (body.mode === 'ping' || body.test === true) {\n  return [{ json: { ok: true, statusCode: 200, messageId: 'ping-ok' } }];\n}\n\nlet graphPayload;\nif (body.mode === 'template' && body.template) {\n  graphPayload = {\n    messaging_product: 'whatsapp',\n    to: body.to,\n    type: 'template',\n    template: {\n      name: body.template.name,\n      language: { code: body.template.language || 'tr' },\n      components: body.template.components || []\n    }\n  };\n} else {\n  graphPayload = {\n    messaging_product: 'whatsapp',\n    recipient_type: 'individual',\n    to: body.to,\n    type: 'text',\n    text: { preview_url: false, body: body.text || '' }\n  };\n}\n\nconst res = await fetch('https://graph.facebook.com/v21.0/' + encodeURIComponent(phoneNumberId) + '/messages', {\n  method: 'POST',\n  headers: {\n    Authorization: 'Bearer ' + accessToken,\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify(graphPayload)\n});\nconst data = await res.json().catch(() => ({}));\nreturn [{ json: { ok: res.ok, statusCode: res.status, messageId: data?.messages?.[0]?.id || 'sent', error: data?.error?.message || null } }];`,
        },
        id: 'node-meta-cloud-send',
        name: 'Meta WhatsApp Cloud API Gönder',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [520, 560],
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify($json) }}',
          options: {
            responseCode: '={{ $json.statusCode || 200 }}',
          },
        },
        id: 'node-voiceai-outbound-respond',
        name: 'Mesaj Kimliği Yanıtı',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [800, 560],
      },
    ],
    connections: {
      'Meta Webhook Doğrulama (GET)': {
        main: [[{ node: 'Doğrulama Yanıtı', type: 'main', index: 0 }]],
      },
      'Meta Gelen Mesaj Webhook (POST)': {
        main: [[{ node: 'Sistem Yapay Zeka Asistanına İlet', type: 'main', index: 0 }]],
      },
      'Sistem Giden Mesaj Webhook': {
        main: [[{ node: 'Meta WhatsApp Cloud API Gönder', type: 'main', index: 0 }]],
      },
      'Meta WhatsApp Cloud API Gönder': {
        main: [[{ node: 'Mesaj Kimliği Yanıtı', type: 'main', index: 0 }]],
      },
    },
    settings: {
      executionOrder: 'v1',
    },
  }
}

export default function N8nMetaWhatsAppCard({ clinicId }: { clinicId?: string } = {}) {
  const [config, setConfig] = useState<N8nConfig | null>(null)
  const [provider, setProvider] = useState<'evolution' | 'n8n_meta'>('evolution')
  const [sendWebhookUrl, setSendWebhookUrl] = useState('')
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('')
  const [metaWabaId, setMetaWabaId] = useState('')
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [metaVerifyToken, setMetaVerifyToken] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
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
    setSendWebhookUrl(c.n8nSendWebhookUrl || 'http://voiceai-n8n:5678/webhook/voiceai-whatsapp-send')
    setMetaPhoneNumberId(c.metaPhoneNumberId || '')
    setMetaWabaId(c.metaWabaId || '')
    setMetaVerifyToken(c.metaVerifyToken || '')
    setBusinessPhone(c.businessPhone || '')
    setMetaAccessToken('')
    setEnabled(c.enabled)
    setAiEnabled(c.aiEnabled)
    setTemplates(Array.isArray(c.templates) ? c.templates : [])
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const detail = await api<N8nConfig>(clinicId ? `/${clinicId}/n8n` : '/n8n-meta')
      applyConfig(detail)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'n8n ve Meta WhatsApp ayarları yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [clinicId])

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
        metaWabaId,
        ...(metaAccessToken.trim() ? { metaAccessToken: metaAccessToken.trim() } : {}),
        metaVerifyToken,
        businessPhone,
        enabled,
        aiEnabled: enabled ? aiEnabled : false,
        rotateSecret,
        templates,
      })
      applyConfig(updated)
      setNotice(
        rotateSecret
          ? 'Yeni imza anahtarı üretildi. Lütfen n8n iş akışınızdaki X-Webhook-Secret başlığını güncelleyin.'
          : 'n8n ve Meta WhatsApp Business ayarları kaydedildi.',
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
      const res = await api<{ ok: boolean; status: number; message: string }>(
        `/${config.clinicId}/n8n/test`,
        'POST',
        {
          n8nSendWebhookUrl: sendWebhookUrl.trim(),
          metaPhoneNumberId: metaPhoneNumberId.trim() || undefined,
          metaWabaId: metaWabaId.trim() || undefined,
          metaAccessToken: metaAccessToken.trim() || undefined,
        },
      )
      if (res.ok) setNotice(res.message)
      else setError(res.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'n8n bağlantı testi başarısız.')
    } finally {
      setBusy(false)
    }
  }

  const fetchMetaTemplates = async () => {
    if (!config) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await api<{ ok: boolean; fetchedCount: number; config: N8nConfig }>(
        `/${config.clinicId}/n8n/fetch-templates`,
        'POST',
        {
          metaWabaId: metaWabaId.trim() || undefined,
          metaAccessToken: metaAccessToken.trim() || undefined,
        },
      )
      if (res.config) applyConfig(res.config)
      setNotice(`Meta hesabından ${res.fetchedCount} adet onaylı şablon başarıyla çekildi ve kaydedildi.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Meta şablonları çekilemedi.')
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
  const incomingN8nWebhookUrl = config
    ? `${origin}${config.n8nWebhookPath || `/api/whatsapp/n8n-webhook/${config.clinicId}`}`
    : ''
  const secretValue = config?.revealedInboundSecret || config?.inboundSecretPreview || ''
  const isN8nActive = provider === 'n8n_meta'
  const isConfigured = Boolean(sendWebhookUrl.trim() && config?.hasInboundSecret)

  const downloadWorkflowJson = () => {
    if (!config) return
    const wf = buildReadyN8nWorkflowJson({
      clinicId: config.clinicId,
      clinicName: config.clinicName,
      inboundWebhookUrl: incomingN8nWebhookUrl,
      secret: config.revealedInboundSecret || '',
      metaPhoneNumberId,
      metaVerifyToken,
    })
    const jsonString = JSON.stringify(wf, null, 2)
    if (typeof window !== 'undefined') {
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `n8n-whatsapp-${config.clinicId.slice(0, 8)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setNotice('Hazır n8n iş akışı (JSON) indirildi. n8n ekranında "Import from File" ile içe aktarabilirsiniz.')
    }
  }

  const copyWorkflowJson = () => {
    if (!config) return
    const wf = buildReadyN8nWorkflowJson({
      clinicId: config.clinicId,
      clinicName: config.clinicName,
      inboundWebhookUrl: incomingN8nWebhookUrl,
      secret: config.revealedInboundSecret || '',
      metaPhoneNumberId,
      metaVerifyToken,
    })
    copyText(JSON.stringify(wf, null, 2), 'Hazır n8n iş akışı (JSON)')
  }

  return (
    <section className={styles.card} aria-labelledby="n8n-meta-wa-heading">
      <div className={styles.heading}>
        <div>
          <h3 id="n8n-meta-wa-heading">WhatsApp Business — n8n ve Resmi Meta Cloud API Kurulumu</h3>
          <p className={styles.description}>
            QR ile kurulan mevcut bağlantıyı koruyarak, n8n ve resmi Meta WhatsApp Business Cloud API üzerinden engellenme riski olmadan kurumsal mesajlaşmayı ve 24 saatlik süreye uyumlu şablon gönderimini sağlar.
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
                <option value="evolution">Mevcut QR Bağlantısı (Evolution)</option>
                <option value="n8n_meta">n8n ve Resmi Meta WhatsApp Business Bağlantısı</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>İşletme WhatsApp Numarası (+90...)</span>
              <input
                type="tel"
                value={businessPhone}
                disabled={busy}
                placeholder="Örn: +905076652367"
                onChange={e => setBusinessPhone(e.target.value)}
              />
            </label>
          </div>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Meta Telefon Numarası Kimliği (Phone Number ID)</span>
              <input
                type="text"
                value={metaPhoneNumberId}
                disabled={busy}
                placeholder="Örn: 109876543210123"
                onChange={e => setMetaPhoneNumberId(e.target.value)}
              />
              <small>Meta Geliştirici Paneli → WhatsApp → API Kurulumu ekranındaki Phone Number ID.</small>
            </label>

            <label className={styles.field}>
              <span>WhatsApp Business Hesap Kimliği (WABA ID)</span>
              <input
                type="text"
                value={metaWabaId}
                disabled={busy}
                placeholder="Örn: 102938475610293"
                onChange={e => setMetaWabaId(e.target.value)}
              />
              <small>WhatsApp Business Account ID (şablonları otomatik çekmek ve hesap eşleştirmek için).</small>
            </label>
          </div>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span>
                Meta Kalıcı Erişim Anahtarı (System User Access Token){' '}
                {config.hasMetaAccessToken && (
                  <small style={{ color: 'var(--btn-clinic-mint-fg)', fontWeight: 700 }}>
                    (Kayıtlı: {config.metaAccessTokenPreview || '••••'})
                  </small>
                )}
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={metaAccessToken}
                disabled={busy}
                placeholder={
                  config.hasMetaAccessToken
                    ? 'Kayıtlı erişim anahtarı mevcut — değiştirmek için yeni token girin'
                    : 'EAAG... ile başlayan kalıcı Meta erişim anahtarınız'
                }
                onChange={e => setMetaAccessToken(e.target.value)}
              />
              <small>Meta Business Ayarları → Sistem Kullanıcıları bölümünden alınan kalıcı token.</small>
            </label>

            <div className={styles.field}>
              <span>Meta Webhook Doğrulama Anahtarı (Verify Token)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={metaVerifyToken}
                  disabled={busy}
                  placeholder="Örn: pine_verify_..."
                  onChange={e => setMetaVerifyToken(e.target.value)}
                />
                {metaVerifyToken && (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => copyText(metaVerifyToken, 'Meta Verify Token')}
                  >
                    Kopyala
                  </button>
                )}
              </div>
              <small>Meta Geliştirici Paneli → WhatsApp → Yapılandırma (Webhook) ekranına girilecek doğrulama kodu.</small>
            </div>
          </div>

          <label className={styles.field}>
            <span>n8n Giden Mesaj Webhook Adresi (Sistem → n8n)</span>
            <input
              type="url"
              value={sendWebhookUrl}
              disabled={busy}
              placeholder="http://voiceai-n8n:5678/webhook/voiceai-whatsapp-send"
              onChange={e => setSendWebhookUrl(e.target.value)}
            />
            <small>Sunucu içi varsayılan adres: <code>http://voiceai-n8n:5678/webhook/voiceai-whatsapp-send</code> (hazır kurulu).</small>
          </label>

          <div className={styles.grid}>
            <div className={styles.field}>
              <span>Gelen Mesaj Webhook Adresi (n8n veya Meta → Sistem)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={incomingN8nWebhookUrl}
                />
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => copyText(incomingN8nWebhookUrl, 'Gelen mesaj webhook adresi')}
                >
                  Kopyala
                </button>
              </div>
              <small>n8n iş akışının veya doğrudan Meta Webhook yapılandırmasının mesajları ileteceği adres.</small>
            </div>

            <div className={styles.field}>
              <span>Webhook Gizli Anahtarı (X-Webhook-Secret)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={secretValue || 'Henüz üretilmedi'}
                />
                {secretValue && (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => copyText(secretValue, 'Webhook gizli anahtarı')}
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
              <small>n8n HTTP Request başlığına X-Webhook-Secret olarak eklenir.</small>
            </div>
          </div>

          <div className={styles.managedInfo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>Hazır n8n İş Akışı Şablonu (Tek Tıkla Kurulum)</strong>
              <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                Sunucunuzdaki n8n servisinde iş akışları hazır aktif edilmiştir. Dilerseniz kliniğinize özel yapılandırılmış JSON dosyasını indirip özelleştirebilirsiniz.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={styles.secondary} onClick={downloadWorkflowJson}>
                📥 Hazır N8n İş Akışı (JSON) İndir
              </button>
              <button type="button" className={styles.secondary} onClick={copyWorkflowJson}>
                📋 İş Akışı JSON Kopyala
              </button>
            </div>
          </div>

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

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1.5px solid var(--input-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 13 }}>Onaylı Meta Şablonları (24 Saatlik Süre Dışı Bildirimler İçin)</strong>
                <p className={styles.description} style={{ margin: '4px 0 10px' }}>
                  Son müşteri mesajından 24 saat geçtiyse Meta serbest metin gönderimini engeller; burada tanımlı onaylı şablon otomatik kullanılır.
                </p>
              </div>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy || (!metaWabaId.trim() && !config.metaWabaId)}
                onClick={() => void fetchMetaTemplates()}
              >
                🔄 Meta&apos;dan Onaylı Şablonları Çek
              </button>
            </div>
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
              🔌 N8n Bağlantısını Test Et
            </button>
          </div>
        </>
      )}
    </section>
  )
}
