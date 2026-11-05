'use client'

import EvolutionWhatsAppCard from './EvolutionWhatsAppCard'
import { termLabel } from '@/lib/ui-glossary'
import N8nMetaWhatsAppCard from './N8nMetaWhatsAppCard'
import BillingIntegrationsCard from './BillingIntegrationsCard'
import { useEffect, useState, type ReactNode } from 'react'
import styles from './IntegrationsTab.module.css'

type CloudProvider = 'netgsm' | 'twilio' | 'vonage' | 'custom'
type ClinicPhone = { id: string; phoneNumber: string; label: string | null; isActive: boolean; isPrimary: boolean }
type IntegrationTest = { id?: string; status: string; confirmed_at?: string | null; message?: string | null } | null
type IntegrationState = {
  configured: boolean
  enabled: boolean
  revision?: number
  health: string
  checkedAt: string | null
  test: IntegrationTest
  numbers: string[]
  callerId: string | null
  senderId: string | null
  fromAddress: string | null
  config?: {
    username?: string
    hasPassword?: boolean
    numbers?: string[]
    callerId?: string
    transferNumber?: string
    senderId?: string
    host?: string
    port?: number
    secure?: 'tls' | 'ssl'
    fromName?: string
    fromAddress?: string
  } | null
}
type IntegrationOverview = { phone: IntegrationState; sms: IntegrationState; smtp: IntegrationState }
const emptyIntegrationState = (): IntegrationState => ({
  configured: false,
  enabled: false,
  revision: 0,
  health: 'unknown',
  checkedAt: null,
  test: null,
  numbers: [],
  callerId: null,
  senderId: null,
  fromAddress: null,
  config: null,
})
const emptyIntegrationOverview = (): IntegrationOverview => ({ phone: emptyIntegrationState(), sms: emptyIntegrationState(), smtp: emptyIntegrationState() })

const roleTabs = [
  { id: 'calendar', label: 'Takvim' },
  { id: 'patients', label: 'Hastalar' },
  { id: 'payments', label: 'Ödemeler ve Finans' },
  { id: 'stok', label: 'Stok ve Bakım' },
  { id: 'knowledge', label: termLabel('knowledgeBlock') },
  { id: 'klinik', label: 'Klinik Personeli' },
]

type NotificationChannelKey = 'whatsapp' | 'sms' | 'email' | 'assistant_call'

interface NotificationPolicyState {
  channelPriority: NotificationChannelKey[]
  enabledChannels: Record<NotificationChannelKey, boolean>
  confirmationWaitHours: number
  recallWaitHours: number
  reminderLeadHours: number
  instantAppointmentNotify: boolean
  quietHoursEnabled: boolean
  quietHoursStart: string
  quietHoursEnd: string
}

const DEFAULT_NOTIFICATION_POLICY_STATE: NotificationPolicyState = {
  channelPriority: ['whatsapp', 'sms', 'email', 'assistant_call'],
  enabledChannels: {
    whatsapp: true,
    sms: true,
    email: true,
    assistant_call: true,
  },
  confirmationWaitHours: 4,
  recallWaitHours: 48,
  reminderLeadHours: 24,
  instantAppointmentNotify: true,
  quietHoursEnabled: true,
  quietHoursStart: '21:00',
  quietHoursEnd: '09:00',
}

const CHANNEL_META: Record<NotificationChannelKey, { title: string; desc: string }> = {
  whatsapp: {
    title: '💬 WhatsApp (Etkileşimli Mesaj ve Onay Bağlantısı)',
    desc: 'Ücretsiz ve hızlı kanal. Hasta "Geleceğim / Ertele / Gelmiyorum" yanıtı verebilir.',
  },
  sms: {
    title: '📱 Kısa Mesaj (NetGSM ve Onay Bağlantısı)',
    desc: 'Yüksek ulaşım oranı. WhatsApp iletilemezse veya izin yoksa devreye girer.',
  },
  email: {
    title: '✉️ E-Posta (Bilgilendirme ve Onay Bağlantısı)',
    desc: 'Detaylı randevu özeti ve tek tıkla yanıt bağlantısı gönderir.',
  },
  assistant_call: {
    title: '📞 Asistan ile Sesli Arama (Sesli Teyit)',
    desc: 'Son kademe. Yazılı kanallardan yanıt alınamazsa sesli asistan arayarak teyit alır.',
  },
}

function SettingsCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className={styles.card}>
    <h3 className={styles.cardTitle}>{title}</h3>
    <p className={styles.cardDescription}>{description}</p>
    {children}
  </section>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}>
    <span className={styles.fieldLabel}>{label}</span>
    {children}
  </label>
}

function Spinner() {
  return <div className={styles.spinner} aria-label="Yükleniyor" />
}

function statusFor(service: 'phone' | 'sms' | 'smtp', state: IntegrationState) {
  if (!state.configured) return { label: 'Yapılandırılmadı', detail: 'Aşağıdaki "Bağlantı Ayarlarını Düzenle" butonundan kurulumu yapabilirsiniz.', tone: 'warning' as const, attention: true }
  if (!state.enabled) return { label: 'Etkin değil', detail: 'Ayarlar kaydedilmiş; test ve etkinleştirme bekleniyor.', tone: 'warning' as const, attention: true }
  if (service === 'phone') {
    if (state.health === 'registered') return { label: 'Etkin · Bağlı', detail: state.callerId ? `Birincil numara: ${state.callerId}` : 'Telefon hattı kaydı aktif.', tone: 'success' as const, attention: false }
    if (state.health === 'unregistered') return { label: 'Etkin · Bağlantı koptu', detail: 'Telefon hattı kaydı alınamadı. SIP bilgilerini kontrol edin.', tone: 'danger' as const, attention: true }
    return { label: 'Etkin · Durum kontrol ediliyor', detail: 'Son hat bağlantı kontrolü güncel değil.', tone: 'warning' as const, attention: true }
  }
  if (state.test?.status === 'failed') return { label: 'Etkin · Son test başarısız', detail: state.test.message || 'Sağlayıcı bağlantısını kontrol edin.', tone: 'danger' as const, attention: true }
  if (state.test?.status === 'confirmed' || state.test?.status === 'accepted') return { label: 'Etkin · Hazır', detail: service === 'sms' ? `Başlık: ${state.senderId || state.config?.senderId || '—'}` : `Gönderici: ${state.fromAddress || state.config?.fromAddress || '—'}`, tone: 'success' as const, attention: false }
  return { label: 'Etkin · Hazır', detail: service === 'sms' ? `Başlık: ${state.senderId || state.config?.senderId || '—'}` : `Gönderici: ${state.fromAddress || state.config?.fromAddress || '—'}`, tone: 'success' as const, attention: false }
}

function ManagedIntegrationCard({
  title,
  service,
  state,
  numbers,
  apiPrefix,
  onRefresh,
  onToast,
}: {
  title: string
  service: 'phone' | 'sms' | 'smtp'
  state: IntegrationState
  numbers?: boolean
  apiPrefix: string
  onRefresh: () => Promise<void>
  onToast: (type: 'success' | 'error', text: string) => void
}) {
  const status = statusFor(service, state)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // SMTP form state
  const [smtpHost, setSmtpHost] = useState(state.config?.host || 'mx-out03.natrohost.com')
  const [smtpPort, setSmtpPort] = useState(String(state.config?.port || 465))
  const [smtpUsername, setSmtpUsername] = useState(state.config?.username || state.fromAddress || '')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpFromName, setSmtpFromName] = useState(state.config?.fromName || '')
  const [smtpFromAddress, setSmtpFromAddress] = useState(state.config?.fromAddress || state.fromAddress || '')
  const [smtpTarget, setSmtpTarget] = useState('')

  // SMS form state
  const [smsUsername, setSmsUsername] = useState(state.config?.username || '')
  const [smsPassword, setSmsPassword] = useState('')
  const [smsSenderId, setSmsSenderId] = useState(state.config?.senderId || state.senderId || '')
  const [smsTarget, setSmsTarget] = useState('')

  // Phone form state
  const [sipUsername, setSipUsername] = useState(state.config?.username || '')
  const [sipPassword, setSipPassword] = useState('')
  const [phoneNumbersText, setPhoneNumbersText] = useState((state.config?.numbers || state.numbers || []).join(', '))
  const [callerId, setCallerId] = useState(state.config?.callerId || state.callerId || '')
  const [transferNumber, setTransferNumber] = useState(state.config?.transferNumber || '')

  useEffect(() => {
    if (service === 'smtp') {
      if (state.config?.host) setSmtpHost(state.config.host)
      if (state.config?.port) setSmtpPort(String(state.config.port))
      if (state.config?.username) setSmtpUsername(state.config.username)
      if (state.config?.fromName) setSmtpFromName(state.config.fromName)
      if (state.config?.fromAddress || state.fromAddress) setSmtpFromAddress(state.config?.fromAddress || state.fromAddress || '')
    } else if (service === 'sms') {
      if (state.config?.username) setSmsUsername(state.config.username)
      if (state.config?.senderId || state.senderId) setSmsSenderId(state.config?.senderId || state.senderId || '')
    } else if (service === 'phone') {
      if (state.config?.username) setSipUsername(state.config.username)
      const nums = state.config?.numbers?.length ? state.config.numbers : state.numbers
      if (nums?.length) setPhoneNumbersText(nums.join(', '))
      if (state.config?.callerId || state.callerId) setCallerId(state.config?.callerId || state.callerId || '')
      if (state.config?.transferNumber) setTransferNumber(state.config.transferNumber)
    }
  }, [service, state])

  const detail = numbers && state.numbers.length
    ? `Atanmış: ${state.numbers.join(', ')}${state.callerId ? ` · Birincil: ${state.callerId}` : ''}`
    : status.detail

  const handleSaveConfig = async () => {
    setBusy(true)
    try {
      let payload: Record<string, unknown> = {
        revision: state.revision,
        autoActivate: true,
      }
      if (service === 'smtp') {
        const portNum = Number(smtpPort) || 465
        payload = {
          ...payload,
          host: smtpHost.trim(),
          port: portNum,
          secure: portNum === 465 ? 'ssl' : 'tls',
          username: smtpUsername.trim(),
          ...(smtpPassword.trim() ? { password: smtpPassword.trim() } : {}),
          fromName: smtpFromName.trim() || 'Klinik',
          fromAddress: (smtpFromAddress.trim() || smtpUsername.trim()),
        }
      } else if (service === 'sms') {
        payload = {
          ...payload,
          username: smsUsername.trim(),
          ...(smsPassword.trim() ? { password: smsPassword.trim() } : {}),
          senderId: smsSenderId.trim(),
        }
      } else {
        const parsedNums = phoneNumbersText
          .split(/[\s,;]+/)
          .map(s => s.trim())
          .filter(Boolean)
        payload = {
          ...payload,
          username: sipUsername.trim(),
          ...(sipPassword.trim() ? { password: sipPassword.trim() } : {}),
          numbers: parsedNums,
          callerId: callerId.trim() || parsedNums[0] || '',
          transferNumber: transferNumber.trim(),
        }
      }
      const res = await fetch(`${apiPrefix}/${service}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Ayarlar kaydedilemedi.')
      setSmtpPassword('')
      setSmsPassword('')
      setSipPassword('')
      await onRefresh()
      onToast('success', `${title} ayarları kaydedildi ve etkinleştirildi.`)
    } catch (err: any) {
      onToast('error', err.message || 'Kaydetme hatası')
    } finally {
      setBusy(false)
    }
  }

  const handleTest = async () => {
    const target = service === 'smtp' ? smtpTarget.trim() : smsTarget.trim()
    if (!target) {
      onToast('error', service === 'smtp' ? 'Lütfen test alıcı e-posta adresini girin.' : 'Lütfen test alıcı cep telefonu numarasını girin.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`${apiPrefix}/${service}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          revision: state.revision,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Test gönderimi başarısız.')
      if (data.status === 'failed') {
        throw new Error(data.message || 'Test gönderimi başarısız oldu.')
      }
      if (data.id && data.status === 'accepted') {
        await fetch(`${apiPrefix}/${service}/tests/${data.id}/confirm`, { method: 'POST' }).catch(() => {})
      }
      await onRefresh()
      onToast('success', service === 'smtp' ? `Test e-postası (${target}) başarıyla gönderildi ve doğrulandı.` : `Test SMS mesajı (${target}) başarıyla gönderildi ve doğrulandı.`)
    } catch (err: any) {
      await onRefresh()
      onToast('error', err.message || 'Test başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title={title}
      description={
        service === 'smtp'
          ? 'Randevu bilgilendirmeleri, personel davetleri ve onay bağlantıları için kullanılan kurumsal e-posta (SMTP) bağlantısı.'
          : service === 'sms'
            ? 'Randevu hatırlatma ve onay mesajları için kullanılan NetGSM kısa mesaj (SMS) bağlantısı.'
            : numbers
              ? 'Kliniğe tanımlı gelen/giden santral telefon numaraları ve birincil arayan numara (Caller ID).'
              : 'Sesli asistan ve çağrı merkezi için NetGSM / SIP santral bağlantısı.'
      }
    >
      <div className={styles.integrationStatus}>
        <span className={`${styles.statusBadge} ${styles[`status${status.tone[0].toUpperCase()}${status.tone.slice(1)}`]}`}>{status.label}</span>
        <p>{detail}</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => setOpen(v => !v)}
        >
          {open ? '▲ Ayarları Gizle' : '⚙️ Bağlantı Ayarlarını Düzenle / Test Et'}
        </button>
      </div>

      {open && (
        <div className={styles.policyRulesBox} style={{ marginTop: 14 }}>
          {service === 'smtp' && (
            <>
              <div className={styles.grid}>
                <Field label="SMTP Sunucu Adresi (Host)">
                  <input
                    value={smtpHost}
                    onChange={e => setSmtpHost(e.target.value)}
                    placeholder="mx-out03.natrohost.com veya smtp.gmail.com"
                  />
                </Field>
                <Field label="Port (465 SSL Önerilen / 587 STARTTLS)">
                  <input
                    inputMode="numeric"
                    value={smtpPort}
                    onChange={e => setSmtpPort(e.target.value)}
                    placeholder="465"
                  />
                </Field>
                <Field label="SMTP Kullanıcı Adı (E-Posta)">
                  <input
                    value={smtpUsername}
                    onChange={e => {
                      setSmtpUsername(e.target.value)
                      if (!smtpFromAddress) setSmtpFromAddress(e.target.value)
                    }}
                    placeholder="ornek@klinik.com"
                  />
                </Field>
                <Field label={state.config?.hasPassword ? 'SMTP Parolası (Kayıtlı — değiştirmek için yazın)' : 'SMTP Parolası / Uygulama Şifresi'}>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={smtpPassword}
                    onChange={e => setSmtpPassword(e.target.value)}
                    placeholder={state.config?.hasPassword ? '•••••••• (Kayıtlı)' : 'SMTP parolası'}
                  />
                </Field>
                <Field label="Gönderici Adı (From Name)">
                  <input
                    value={smtpFromName}
                    onChange={e => setSmtpFromName(e.target.value)}
                    placeholder="Klinik Adı"
                  />
                </Field>
                <Field label="Gönderici E-Posta Adresi (From Address)">
                  <input
                    type="email"
                    value={smtpFromAddress}
                    onChange={e => setSmtpFromAddress(e.target.value)}
                    placeholder="ornek@klinik.com"
                  />
                </Field>
              </div>
              <div className={styles.grid} style={{ marginTop: 10 }}>
                <Field label="Test Alıcı E-Posta Adresi">
                  <input
                    type="email"
                    value={smtpTarget}
                    onChange={e => setSmtpTarget(e.target.value)}
                    placeholder="test@ornek.com"
                  />
                </Field>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                <button type="button" className={styles.saveButton} disabled={busy} onClick={handleSaveConfig}>
                  {busy ? 'Kaydediliyor...' : '💾 Kaydet ve Etkinleştir'}
                </button>
                <button type="button" className={styles.saveButton} disabled={busy} onClick={handleTest}>
                  {busy ? 'Gönderiliyor...' : '📨 Test E-Postası Gönder'}
                </button>
              </div>
            </>
          )}

          {service === 'sms' && (
            <>
              <div className={styles.grid}>
                <Field label="NetGSM API Kullanıcı Kodu / Abone No">
                  <input
                    value={smsUsername}
                    onChange={e => setSmsUsername(e.target.value)}
                    placeholder="8503096119"
                  />
                </Field>
                <Field label={state.config?.hasPassword ? 'NetGSM API Parolası (Kayıtlı — değiştirmek için yazın)' : 'NetGSM API Parolası'}>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={smsPassword}
                    onChange={e => setSmsPassword(e.target.value)}
                    placeholder={state.config?.hasPassword ? '•••••••• (Kayıtlı)' : 'API Şifresi'}
                  />
                </Field>
                <Field label="Onaylı Gönderici Başlığı (MsgHeader)">
                  <input
                    value={smsSenderId}
                    onChange={e => setSmsSenderId(e.target.value)}
                    placeholder="Örn: PINECLINIC"
                  />
                </Field>
                <Field label="Test Alıcı Cep Telefonu (+905...)">
                  <input
                    value={smsTarget}
                    onChange={e => setSmsTarget(e.target.value)}
                    placeholder="+905551234567"
                  />
                </Field>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                <button type="button" className={styles.saveButton} disabled={busy} onClick={handleSaveConfig}>
                  {busy ? 'Kaydediliyor...' : '💾 Kaydet ve Etkinleştir'}
                </button>
                <button type="button" className={styles.saveButton} disabled={busy} onClick={handleTest}>
                  {busy ? 'Gönderiliyor...' : '📲 Test SMS Gönder'}
                </button>
              </div>
            </>
          )}

          {service === 'phone' && (
            <>
              <div className={styles.grid}>
                <Field label="SIP Kullanıcı Adı (Abone No)">
                  <input
                    value={sipUsername}
                    onChange={e => setSipUsername(e.target.value)}
                    placeholder="8503096119"
                  />
                </Field>
                <Field label={state.config?.hasPassword ? 'SIP Parolası (Kayıtlı — değiştirmek için yazın)' : 'SIP Parolası'}>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={sipPassword}
                    onChange={e => setSipPassword(e.target.value)}
                    placeholder={state.config?.hasPassword ? '•••••••• (Kayıtlı)' : 'SIP Şifresi'}
                  />
                </Field>
                <Field label="Klinik Telefon Numaraları (+90850... virgülle ayırın)">
                  <input
                    value={phoneNumbersText}
                    onChange={e => setPhoneNumbersText(e.target.value)}
                    placeholder="+908503096119"
                  />
                </Field>
                <Field label="Birincil Çıkış Numarası (Caller ID)">
                  <input
                    value={callerId}
                    onChange={e => setCallerId(e.target.value)}
                    placeholder="+908503096119"
                  />
                </Field>
                <Field label="Çağrı Aktarım Numarası (Transfer - Opsiyonel)">
                  <input
                    value={transferNumber}
                    onChange={e => setTransferNumber(e.target.value)}
                    placeholder="+905551234567"
                  />
                </Field>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                <button type="button" className={styles.saveButton} disabled={busy} onClick={handleSaveConfig}>
                  {busy ? 'Kaydediliyor...' : '💾 Santral ve Numara Ayarlarını Kaydet'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </SettingsCard>
  )
}

export default function IntegrationsTab({ apiPrefix = '/api/admin/integrations' }: { apiPrefix?: string }) {
  // VoIP States
  const [voipProvider, setVoipProvider] = useState<CloudProvider>('netgsm')
  const [voipLabel, setVoipLabel] = useState('Netgsm Bulut Santral')
  const [voipBaseUrl, setVoipBaseUrl] = useState('https://api.netgsm.com.tr/voice/v1/')
  const [voipTrunkHost, setVoipTrunkHost] = useState('')
  const [clinicPhones, setClinicPhones] = useState<ClinicPhone[]>([])
  const [newPhone, setNewPhone] = useState('')
  const [newPhoneLabel, setNewPhoneLabel] = useState('')

  // SMS States
  const [smsUsercode, setSmsUsercode] = useState('')
  const [smsPassword, setSmsPassword] = useState('')
  const [smsSenderId, setSmsSenderId] = useState('')

  // SMTP States
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpSecure, setSmtpSecure] = useState('none')

  // Branding / Logo State
  const [brandingLogoUrl, setBrandingLogoUrl] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoPreviewError, setLogoPreviewError] = useState(false)

  // Role Permissions State
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({
    hekim: ['calendar', 'patients', 'knowledge'],
    sekreter: ['calendar', 'patients', 'payments'],
    asistan: ['calendar', 'patients']
  })

  // Notification Policy State
  const [notificationPolicy, setNotificationPolicy] = useState<NotificationPolicyState>(DEFAULT_NOTIFICATION_POLICY_STATE)
  const [savingPolicy, setSavingPolicy] = useState(false)

  // Klinik Personeli Granular Permissions State
  type StaffPermItem = {
    viewShiftPlanner: boolean
    editShifts: boolean
    manageLeaves: boolean
    editClinicWorkingHours: boolean
    manageStaff: boolean
  }
  const [staffPermissions, setStaffPermissions] = useState<{ hekim: StaffPermItem; host: StaffPermItem }>({
    hekim: {
      viewShiftPlanner: true,
      editShifts: false,
      manageLeaves: true,
      editClinicWorkingHours: false,
      manageStaff: false,
    },
    host: {
      viewShiftPlanner: true,
      editShifts: true,
      manageLeaves: true,
      editClinicWorkingHours: false,
      manageStaff: false,
    },
  })
  const [savingStaffPerms, setSavingStaffPerms] = useState(false)

  const [loading, setLoading] = useState(true)
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationOverview>(emptyIntegrationOverview)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const refreshIntegrations = async () => {
    try {
      const res = await fetch(apiPrefix, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (data.phone && data.sms && data.smtp) {
        setIntegrationStatus(data as IntegrationOverview)
      }
    } catch {}
  }

  useEffect(() => {
    fetch(apiPrefix)
      .then(res => res.json())
      .then(data => {
        if (data.phone && data.sms && data.smtp) setIntegrationStatus(data as IntegrationOverview)
        if (data.voipProvider) setVoipProvider(data.voipProvider as CloudProvider)
        if (data.voipLabel) setVoipLabel(data.voipLabel)
        if (data.voipBaseUrl) setVoipBaseUrl(data.voipBaseUrl)
        if (data.voipTrunkHost) setVoipTrunkHost(data.voipTrunkHost)
        
        if (data.smtpHost) setSmtpHost(data.smtpHost)
        if (data.smtpPort) setSmtpPort(data.smtpPort)
        if (data.smtpUser) setSmtpUser(data.smtpUser)
        if (data.smtpPass) setSmtpPass(data.smtpPass)
        if (data.smtpSecure) setSmtpSecure(data.smtpSecure)

        if (data.smsUsercode) setSmsUsercode(data.smsUsercode)
        if (data.smsPassword) setSmsPassword(data.smsPassword)
        if (data.smsSenderId) setSmsSenderId(data.smsSenderId)


      })
      .catch(() => showToast('error', 'Bağlantı bilgileri alınamadı'))
      .finally(() => setLoading(false))

    fetch('/api/admin/settings/roles')
      .then(r => r.json())
      .then(data => { if (data && Object.keys(data).length) setRolePermissions(data) })
      .catch(() => {})

    fetch('/api/admin/settings/branding')
      .then(r => r.json())
      .then(data => { if (data.logoUrl) setBrandingLogoUrl(data.logoUrl) })
      .catch(() => {})

    fetch('/api/admin/settings/notification-policy')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data.channelPriority)) {
          setNotificationPolicy({ ...DEFAULT_NOTIFICATION_POLICY_STATE, ...data })
        }
      })
      .catch(() => {})

    fetch('/api/admin/settings/staff-permissions')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.hekim && data?.host) {
          setStaffPermissions({ hekim: data.hekim, host: data.host })
        }
      })
      .catch(() => {})
  }, [apiPrefix])

  const saveRoleAndStaffPermissions = async () => {
    setSavingStaffPerms(true)
    try {
      const [rolesRes, staffRes] = await Promise.all([
        fetch('/api/admin/settings/roles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rolePermissions),
        }),
        fetch('/api/admin/settings/staff-permissions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(staffPermissions),
        }),
      ])
      const staffData = await staffRes.json().catch(() => null)
      if (!rolesRes.ok || !staffRes.ok || !staffData) {
        throw new Error(staffData?.error || 'Rol ve yetki izinleri kaydedilemedi')
      }
      if (staffData.permissions) setStaffPermissions(staffData.permissions)
      showToast('success', 'Rol bazlı sekme ve Klinik Personeli işlem yetkileri güncellendi')
    } catch (err: any) {
      showToast('error', err.message || 'Yetkiler kaydedilemedi')
    } finally {
      setSavingStaffPerms(false)
    }
  }

  const moveChannelPriority = (index: number, direction: -1 | 1) => {
    setNotificationPolicy(prev => {
      const next = [...prev.channelPriority]
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= next.length) return prev
      const temp = next[index]
      next[index] = next[targetIndex]
      next[targetIndex] = temp
      return { ...prev, channelPriority: next }
    })
  }

  const togglePolicyChannel = (channel: NotificationChannelKey) => {
    setNotificationPolicy(prev => ({
      ...prev,
      enabledChannels: {
        ...prev.enabledChannels,
        [channel]: !prev.enabledChannels[channel],
      },
    }))
  }

  const saveNotificationPolicy = async () => {
    setSavingPolicy(true)
    try {
      const res = await fetch('/api/admin/settings/notification-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPolicy),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Bildirim önceliği kaydedilemedi')
      if (data.policy) setNotificationPolicy(data.policy)
      showToast('success', 'Bildirim kanal önceliği ve otomasyon kuralları kaydedildi')
    } catch (err: any) {
      showToast('error', err.message || 'Bildirim ayarları kaydedilemedi')
    } finally {
      setSavingPolicy(false)
    }
  }

  const addClinicPhone = async () => {
    if (!newPhone.trim()) return
    const res = await fetch('/api/yonetici/telephony-numbers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: newPhone, label: newPhoneLabel, isPrimary: clinicPhones.length === 0 }),
    })
    const data = await res.json()
    if (!res.ok) return showToast('error', data.error || 'Telefon eklenemedi')
    setClinicPhones(prev => [...prev, data]); setNewPhone(''); setNewPhoneLabel('')
    showToast('success', 'Telefon numarası kliniğe bağlandı')
  }

  const toggleClinicPhone = async (phone: ClinicPhone) => {
    const res = await fetch(`/api/yonetici/telephony-numbers/${phone.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !phone.isActive }),
    })
    if (!res.ok) return showToast('error', 'Telefon durumu güncellenemedi')
    setClinicPhones(prev => prev.map(x => x.id === phone.id ? { ...x, isActive: !phone.isActive } : x))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const [rolesRes, policyRes, staffPermRes] = await Promise.all([
        fetch('/api/admin/settings/roles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rolePermissions)
        }),
        fetch('/api/admin/settings/notification-policy', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notificationPolicy)
        }),
        fetch('/api/admin/settings/staff-permissions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(staffPermissions)
        }),
      ])

      if (!rolesRes.ok || !policyRes.ok || !staffPermRes.ok) throw new Error('Kaydedilemedi')
      showToast('success', 'Rol, yetki ve bildirim önceliği ayarları başarıyla kaydedildi')
    } catch (err: any) {
      showToast('error', err.message || 'Hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/settings/logo-upload', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Yükleme hatası')
      setBrandingLogoUrl(data.logoUrl)
      setLogoPreviewError(false)
      showToast('success', 'Amblem başarıyla yüklendi')
    } catch (err: any) {
      showToast('error', err.message || 'Amblem yüklenemedi')
    } finally {
      setUploadingLogo(false)
    }
  }

  if (loading) return <div className={styles.loading}><Spinner /></div>

  return (
    <div className={styles.page}>
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`} role="status">
          {toast.text}
        </div>
      )}

      {/* Marka / Logo Ayarları */}
      <SettingsCard title="Marka ve Görünüm" description="Sistemde, özellikle hasta ekranlarında ve panelde görünecek kurum amblemi.">
        <div className={styles.logoRow}>
          <div className={styles.logoPreview}>
            {brandingLogoUrl && !logoPreviewError ? (
              <img
                src={brandingLogoUrl}
                alt="Amblem"
                onError={() => setLogoPreviewError(true)}
              />
            ) : (
              <span className={styles.logoPlaceholder}>🖼️</span>
            )}
          </div>
          <div className={styles.logoActions}>
            <label
              className={styles.uploadButton}
              style={{ background: '#2563eb', color: '#ffffff' }}
            >
              <span style={{ color: '#ffffff' }}>
                {uploadingLogo ? 'Yükleniyor...' : 'Amblem Seç ve Yükle'}
              </span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} disabled={uploadingLogo} />
            </label>
            <p className={styles.helperText}>
              PNG, JPG veya WEBP formatlarında, maksimum 2 MB boyutunda görsel yükleyebilirsiniz.
            </p>
          </div>
        </div>
      </SettingsCard>

      {/* Yönetici Bildirim Kanal Önceliği ve Otomatik Kurallar */}
      <SettingsCard
        title="🔔 Bildirim Kanal Önceliği ve Otomatik Kurallar"
        description="Randevu bilgilendirmesi, 24 saat öncesi onay (Geleceğim, Gelmiyorum veya Ertele) ve periyodik kontrol hatırlatmalarında kullanılacak kanalların öncelik sırasını belirleyin. Sistem, hastanın iletişim izinleriyle bu sırayı birleştirir. Üst sıradaki kanaldan ulaşıldığında veya onay alındığında alt sıradaki ücretli kanallar kullanılmaz."
      >
        <div className={styles.priorityList}>
          {notificationPolicy.channelPriority.map((ch, idx) => {
            const meta = CHANNEL_META[ch] || { title: ch, desc: '' }
            const isEnabled = notificationPolicy.enabledChannels[ch] !== false
            return (
              <div
                key={ch}
                className={`${styles.priorityItem} ${!isEnabled ? styles.priorityItemDisabled : ''}`}
              >
                <div className={styles.priorityLeft}>
                  <span className={styles.priorityOrderBadge}>{idx + 1}.</span>
                  <div className={styles.priorityInfo}>
                    <span className={styles.priorityTitle}>{meta.title}</span>
                    <span className={styles.priorityDesc}>{meta.desc}</span>
                  </div>
                </div>
                <div className={styles.priorityControls}>
                  <button
                    type="button"
                    className={styles.orderBtn}
                    disabled={idx === 0}
                    onClick={() => moveChannelPriority(idx, -1)}
                    title="Önceliği Yükselt (Yukarı Taşı)"
                    aria-label="Yukarı taşı"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.orderBtn}
                    disabled={idx === notificationPolicy.channelPriority.length - 1}
                    onClick={() => moveChannelPriority(idx, 1)}
                    title="Önceliği Düşür (Aşağı Taşı)"
                    aria-label="Aşağı taşı"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePolicyChannel(ch)}
                    className={`${styles.channelToggleBtn} ${isEnabled ? styles.channelToggleActive : styles.channelToggleInactive}`}
                  >
                    {isEnabled ? '✓ Aktif' : '✕ Pasif'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className={styles.policyRulesBox}>
          <div className={styles.grid}>
            <Field label="Randevu Öncesi Teyit Zamanı (Saat)">
              <input
                type="number"
                min={1}
                max={168}
                value={notificationPolicy.reminderLeadHours}
                onChange={e => setNotificationPolicy(prev => ({
                  ...prev,
                  reminderLeadHours: Math.max(1, Math.min(168, Number(e.target.value) || 24)),
                }))}
              />
            </Field>
            <Field label="Randevu Onayı Kademe Bekleme (Saat)">
              <input
                type="number"
                min={1}
                max={48}
                value={notificationPolicy.confirmationWaitHours}
                onChange={e => setNotificationPolicy(prev => ({
                  ...prev,
                  confirmationWaitHours: Math.max(1, Math.min(48, Number(e.target.value) || 4)),
                }))}
              />
            </Field>
          </div>

          <div className={styles.policyCheckRow}>
            <label className={styles.permission}>
              <input
                type="checkbox"
                checked={notificationPolicy.instantAppointmentNotify}
                onChange={e => setNotificationPolicy(prev => ({ ...prev, instantAppointmentNotify: e.target.checked }))}
              />
              Randevu oluşturulduğunda veya saati değiştiğinde anında bilgilendirme gönder
            </label>
            <label className={styles.permission}>
              <input
                type="checkbox"
                checked={notificationPolicy.quietHoursEnabled}
                onChange={e => setNotificationPolicy(prev => ({ ...prev, quietHoursEnabled: e.target.checked }))}
              />
              Sessiz saat koruması ({notificationPolicy.quietHoursStart} – {notificationPolicy.quietHoursEnd} arası bildirimleri sabah 09:00&apos;a ertele)
            </label>
          </div>
        </div>

        <div className={styles.policyActionRow}>
          <p className={styles.policyHint}>
            💡 Hasta onay linkinden veya WhatsApp veya sesli asistan üzerinden <strong>&quot;Geleceğim&quot;</strong>, <strong>&quot;Ertele&quot;</strong> veya <strong>&quot;Gelmiyorum&quot;</strong> dediğinde Etkileşimli takvim otomatik güncellenir.
          </p>
          <button
            type="button"
            className={styles.saveButton}
            disabled={savingPolicy}
            onClick={saveNotificationPolicy}
          >
            {savingPolicy ? 'Kaydediliyor...' : 'Bildirim Sırasını Kaydet'}
          </button>
        </div>
      </SettingsCard>

      <>
        <ManagedIntegrationCard title="Çağrı Merkezi / Santral" service="phone" state={integrationStatus.phone} apiPrefix={apiPrefix} onRefresh={refreshIntegrations} onToast={showToast} />
        <ManagedIntegrationCard title="Klinik Telefon Numaraları" service="phone" state={integrationStatus.phone} numbers apiPrefix={apiPrefix} onRefresh={refreshIntegrations} onToast={showToast} />
        <ManagedIntegrationCard title="Kısa Mesaj Ayarları (NetGSM)" service="sms" state={integrationStatus.sms} apiPrefix={apiPrefix} onRefresh={refreshIntegrations} onToast={showToast} />
        <ManagedIntegrationCard title="E-Posta (SMTP)" service="smtp" state={integrationStatus.smtp} apiPrefix={apiPrefix} onRefresh={refreshIntegrations} onToast={showToast} />
      </>

      <EvolutionWhatsAppCard />

      <N8nMetaWhatsAppCard />

      <BillingIntegrationsCard />

      {/* Rol Bazlı Sekme İzinleri & Klinik Personeli Alt Yetkileri (Tek Başlık Altında) */}
      <section className={styles.card}>
        <div className={styles.roleHeading}>
          <div className={styles.roleIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          </div>
          <div>
            <h3 className={styles.cardTitle}>Rol Bazlı Sekme İzinleri</h3>
            <p className={styles.cardDescription}>
              Alt kullanıcıların görebileceği sekmeleri ve Klinik Personeli sekmesi içindeki işlem yetkilerini belirleyin. Yönetici rolü her zaman tüm yetkilere sahiptir.
            </p>
          </div>
        </div>

        <div className={styles.roleList}>
          {['hekim', 'sekreter', 'asistan'].map(role => {
            const staffRoleKey: 'hekim' | 'host' | null =
              role === 'hekim' ? 'hekim' : role === 'sekreter' ? 'host' : null
            const perms = staffRoleKey ? staffPermissions[staffRoleKey] : null
            const permDefs: Array<{ k: keyof StaffPermItem; label: string }> = [
              { k: 'viewShiftPlanner', label: 'Mesai Planla Sekmesini Görüntüleyebilir' },
              { k: 'editShifts', label: 'Mesai ekleyebilir, düzenleyebilir veya silebilir' },
              { k: 'manageLeaves', label: 'İzin ve kapalı saat ekleyebilir veya kaldırabilir' },
              { k: 'editClinicWorkingHours', label: 'Klinik Genel Mesai Saatini Değiştirebilir' },
              { k: 'manageStaff', label: 'Personel davet edebilir veya hesap dondurabilir' },
            ]

            return (
              <div key={role} className={styles.roleGroup}>
                <div className={styles.roleName}>
                  {role === 'hekim'
                    ? 'Hekim Rolü'
                    : role === 'sekreter'
                    ? 'Sekreter / Kayıt Personeli Rolü'
                    : 'Asistan Rolü'}
                </div>

                {/* Görünür Panel Sekmeleri */}
                <div className={styles.permissionList}>
                  {roleTabs.map(tab => {
                    const isChecked = rolePermissions[role]?.includes(tab.id) || false
                    return (
                      <label key={tab.id} className={styles.permission}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            setRolePermissions(prev => {
                              const current = prev[role] || []
                              return {
                                ...prev,
                                [role]: e.target.checked ? [...current, tab.id] : current.filter(id => id !== tab.id)
                              }
                            })
                          }}
                        />
                        {tab.label}
                      </label>
                    )
                  })}
                </div>

                {/* Klinik Personeli Sekmesi İçi Alt Yetkiler (Aynı Kart ve Rol Kutusu İçinde) */}
                {staffRoleKey && perms && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: '1px solid var(--integration-border)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: 'var(--integration-text-muted)',
                        marginBottom: 8,
                      }}
                    >
                      🛡️ Klinik Personeli Sekmesi İşlem Yetkileri
                    </div>
                    <div className={styles.permissionList}>
                      {permDefs.map((def) => (
                        <label key={def.k} className={styles.permission}>
                          <input
                            type="checkbox"
                            checked={Boolean(perms[def.k])}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setStaffPermissions((prev) => ({
                                ...prev,
                                [staffRoleKey]: {
                                  ...prev[staffRoleKey],
                                  [def.k]: checked,
                                },
                              }))
                            }}
                          />
                          {def.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className={styles.policyActionRow} style={{ marginTop: 12 }}>
          <p className={styles.policyHint}>
            🔒 Klinik yöneticisi dışındaki kullanıcılar yalnızca burada izin verdiğiniz sekmeleri ve işlem butonlarını görür.
          </p>
          <button
            type="button"
            className={styles.saveButton}
            disabled={savingStaffPerms}
            onClick={saveRoleAndStaffPermissions}
          >
            {savingStaffPerms ? 'Kaydediliyor...' : 'Rol ve Yetki İzinlerini Kaydet'}
          </button>
        </div>
      </section>

      <div className={styles.footer}>
        <button
          onClick={handleSave}
          disabled={saving}
          className={styles.saveButton}
        >
          {saving ? 'Kaydediliyor...' : 'Tümünü Kaydet'}
        </button>
      </div>
    </div>
  )
}
