'use client'

import EvolutionWhatsAppCard from './EvolutionWhatsAppCard'
import { useEffect, useState, type ReactNode } from 'react'
import styles from './IntegrationsTab.module.css'

type CloudProvider = 'netgsm' | 'twilio' | 'vonage' | 'custom'
type ClinicPhone = { id: string; phoneNumber: string; label: string | null; isActive: boolean; isPrimary: boolean }

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
      const rolesRes = await fetch('/api/admin/settings/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rolePermissions)
      })

      if (!rolesRes.ok) throw new Error('Kaydedilemedi')
      showToast('success', 'Rol ayarları başarıyla kaydedildi')
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
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} disabled={uploadingLogo} />
            </label>
            <p className={styles.helperText}>
              PNG, JPG veya WEBP formatlarında, maksimum 2 MB boyutunda görsel yükleyebilirsiniz.
            </p>
          </div>
        </div>
      </SettingsCard>

      {['Çağrı Merkezi / Santral (VoIP)', 'Klinik Telefon Numaraları', 'SMS Ayarları (NetGSM)', 'E-Posta (SMTP)'].map(title => <SettingsCard key={title} title={title} description="Bu entegrasyon satış ekibi tarafından Klinikler ekranından yönetilir. Burada yalnızca durum görüntülenir."><button type="button" className={styles.saveButton} onClick={() => showToast('error', 'Talep oluşturma özelliği henüz kullanıma açık değil.')}>Talep oluştur</button></SettingsCard>)}

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
