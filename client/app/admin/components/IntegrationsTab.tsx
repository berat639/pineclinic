'use client'

import EvolutionWhatsAppCard from './EvolutionWhatsAppCard'
import { useEffect, useState, type ReactNode } from 'react'
import styles from './IntegrationsTab.module.css'

type CloudProvider = 'netgsm' | 'twilio' | 'vonage' | 'custom'

const roleTabs = [
  { id: 'calendar', label: 'Takvim' },
  { id: 'patients', label: 'Hastalar' },
  { id: 'payments', label: 'Ödemeler & Finans' },
  { id: 'stok', label: 'Stok & Bakım' },
  { id: 'knowledge', label: 'Bilgi Tabanı' },
  { id: 'klinik', label: 'Klinik Personeli' },
]

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

export default function IntegrationsTab({ apiPrefix = '/api/admin/integrations' }: { apiPrefix?: string }) {
  // VoIP States
  const [voipProvider, setVoipProvider] = useState<CloudProvider>('netgsm')
  const [voipLabel, setVoipLabel] = useState('Netgsm Bulut Santral')
  const [voipBaseUrl, setVoipBaseUrl] = useState('https://api.netgsm.com.tr/voice/v1/')
  const [voipTrunkHost, setVoipTrunkHost] = useState('')

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

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    fetch(apiPrefix)
      .then(res => res.json())
      .then(data => {
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
      .catch(() => showToast('error', 'Entegrasyon verileri alınamadı'))
      .finally(() => setLoading(false))

    fetch('/api/admin/settings/roles')
      .then(r => r.json())
      .then(data => { if (data && Object.keys(data).length) setRolePermissions(data) })
      .catch(() => {})

    fetch('/api/admin/settings/branding')
      .then(r => r.json())
      .then(data => { if (data.logoUrl) setBrandingLogoUrl(data.logoUrl) })
      .catch(() => {})
  }, [apiPrefix])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(apiPrefix, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voipProvider, voipLabel, voipBaseUrl, voipTrunkHost,
          smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure,
          smsUsercode, smsPassword, smsSenderId,
        })
      })
      
      const rolesRes = await fetch('/api/admin/settings/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rolePermissions)
      })

      if (!res.ok || !rolesRes.ok) throw new Error('Kaydedilemedi')
      showToast('success', 'Entegrasyon ve rol ayarları başarıyla kaydedildi')
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
      showToast('success', 'Logo başarıyla yüklendi')
    } catch (err: any) {
      showToast('error', err.message || 'Logo yüklenemedi')
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
      <SettingsCard title="Marka ve Görünüm" description="Sistemde, özellikle hasta ekranlarında ve panelde görünecek kurum logonuz.">
        <div className={styles.logoRow}>
          <div className={styles.logoPreview}>
            {brandingLogoUrl && !logoPreviewError ? (
              <img
                src={brandingLogoUrl}
                alt="Logo"
                onError={() => setLogoPreviewError(true)}
              />
            ) : (
              <span className={styles.logoPlaceholder}>🖼️</span>
            )}
          </div>
          <div className={styles.logoActions}>
            <label className={styles.uploadButton}>
              {uploadingLogo ? 'Yükleniyor...' : 'Logo Seç ve Yükle'}
              <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
            </label>
            <p className={styles.helperText}>
              PNG, JPG veya SVG formatlarında, maksimum 2MB boyutunda görsel yükleyebilirsiniz.
            </p>
          </div>
        </div>
      </SettingsCard>

      {/* VoIP Card */}
      <SettingsCard title="Çağrı Merkezi / Santral (VoIP)" description="Yapay zeka asistanının aramaları karşılayıp arama yapabilmesi için SIP Trunk ayarları.">
        <div className={styles.grid}>
          <Field label="Sağlayıcı">
            <select value={voipProvider} onChange={e => setVoipProvider(e.target.value as CloudProvider)}>
              <option value="netgsm">NetGSM</option>
              <option value="twilio">Twilio</option>
              <option value="vonage">Vonage</option>
              <option value="custom">Diğer (Özel)</option>
            </select>
          </Field>
          <Field label="Görünen Ad"><input value={voipLabel} onChange={e => setVoipLabel(e.target.value)} placeholder="Örn. NetGSM Santral" /></Field>
          <Field label="API Base URL"><input value={voipBaseUrl} onChange={e => setVoipBaseUrl(e.target.value)} placeholder="https://api.netgsm.com.tr/voice/v1/" /></Field>
          <Field label="SIP Trunk Host"><input value={voipTrunkHost} onChange={e => setVoipTrunkHost(e.target.value)} placeholder="sip.netgsm.com.tr" /></Field>
        </div>
      </SettingsCard>

      {/* SMS Card */}
      <SettingsCard title="SMS Ayarları (NetGSM)" description="Hastalara randevu hatırlatıcılarını SMS ile göndermek için NetGSM API bilgileri.">
        <div className={styles.grid}>
          <Field label="NetGSM Kullanıcı Kodu"><input value={smsUsercode} onChange={e => setSmsUsercode(e.target.value)} placeholder="850xxxxxxx veya 53xxxxxxxx" /></Field>
          <Field label="NetGSM API Şifresi"><input type="password" value={smsPassword} onChange={e => setSmsPassword(e.target.value)} placeholder="••••••••" /></Field>
          <Field label="Onaylı Mesaj Başlığı (Sender ID)"><input value={smsSenderId} onChange={e => setSmsSenderId(e.target.value)} placeholder="Örn. CLINIC" /></Field>
        </div>
      </SettingsCard>

      {/* SMTP Card */}
      <SettingsCard title="E-Posta (SMTP) Ayarları" description="Sistem üzerinden hastalarınıza bilgilendirme e-postaları göndermek için SMTP ayarları.">
        <div className={styles.grid}>
          <Field label="SMTP Sunucu (Host)"><input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" /></Field>
          <Field label="SMTP Port"><input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587 veya 465" /></Field>
          <Field label="Kullanıcı Adı (Email)"><input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="ornek@firma.com" /></Field>
          <Field label="Şifre"><input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••" /></Field>
          <Field label="Şifreleme Türü">
            <select value={smtpSecure} onChange={e => setSmtpSecure(e.target.value)}>
              <option value="none">Yok (veya Otomatik)</option>
              <option value="ssl">SSL (Port 465)</option>
              <option value="tls">TLS / STARTTLS (Port 587)</option>
            </select>
          </Field>
        </div>
      </SettingsCard>

      <EvolutionWhatsAppCard />

      {/* Role-based Tab Permissions */}
      <section className={styles.card}>
        <div className={styles.roleHeading}>
          <div className={styles.roleIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          </div>
          <div>
            <h3 className={styles.cardTitle}>Rol Bazlı Sekme İzinleri</h3>
            <p className={styles.cardDescription}>Alt kullanıcıların görebileceği sekmeleri belirleyin.</p>
          </div>
        </div>
        
        <div className={styles.roleList}>
          {['hekim', 'sekreter', 'asistan'].map(role => (
            <div key={role} className={styles.roleGroup}>
              <div className={styles.roleName}>{role} Rolü</div>
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
            </div>
          ))}
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
