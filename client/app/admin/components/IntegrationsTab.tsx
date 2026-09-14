'use client'

import EvolutionWhatsAppCard from './EvolutionWhatsAppCard'
import { useEffect, useState, type CSSProperties } from 'react'

type CloudProvider = 'netgsm' | 'twilio' | 'vonage' | 'custom'

const voipLabelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--foreground-3)',
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
}

const voipInputStyle: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: 8,
  color: 'var(--foreground)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

const voipGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
  gap: 12,
}

function Spinner() {
  return (
    <div style={{
      width: 24, height: 24,
      border: '2px solid #334155',
      borderTopColor: '#0369A1',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
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
  }, [])

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

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div style={{ maxWidth: 1100, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          padding: '10px 15px',
          background: toast.type === 'success' ? '#14532d' : '#7f1d1d',
          border: `1px solid ${toast.type === 'success' ? '#15803d' : '#b91c1c'}`,
          borderRadius: 10,
          color: toast.type === 'success' ? '#4ade80' : '#f87171',
          fontSize: 13, fontWeight: 500,
        }}>
          {toast.text}
        </div>
      )}

      {/* Marka / Logo Ayarları */}
      <div style={{ background: '#0f172a', border: '1px solid #334155', padding: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 16, color: 'var(--foreground)' }}>Marka ve Görünüm</h3>
        <p style={{ fontSize: 13, color: 'var(--foreground-3)', marginBottom: 20 }}>
          Sistemde (özellikle hasta ekranlarında veya panelde) görünecek kurum logonuz.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 12, background: 'var(--input-bg)',
            border: '1px solid var(--input-border)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden'
          }}>
            {brandingLogoUrl && !logoPreviewError ? (
              <img
                src={brandingLogoUrl}
                alt="Logo"
                onError={() => setLogoPreviewError(true)}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontSize: 24, color: 'var(--foreground-3)' }}>🖼️</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <label className="btn btn-primary" style={{ cursor: 'pointer', padding: '8px 16px', fontSize: 13, display: 'inline-block' }}>
              {uploadingLogo ? 'Yükleniyor...' : 'Logo Seç ve Yükle'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} disabled={uploadingLogo} />
            </label>
            <p style={{ fontSize: 12, color: 'var(--foreground-3)', marginTop: 8 }}>
              PNG, JPG veya SVG formatlarında, maksimum 2MB boyutunda görsel yükleyebilirsiniz.
            </p>
          </div>
        </div>
      </div>

      {/* VoIP Card */}
      <div style={{ background: '#0f172a', border: '1px solid #334155', padding: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 16, color: 'var(--foreground)' }}>Çağrı Merkezi / Santral (VoIP)</h3>
        <p style={{ fontSize: 13, color: 'var(--foreground-3)', marginBottom: 20 }}>
          Yapay zeka asistanının aramaları karşılayıp arama yapabilmesi için SIP Trunk ayarları.
        </p>
        <div style={voipGridStyle}>
          <div>
            <div style={voipLabelStyle}>Sağlayıcı</div>
            <select value={voipProvider} onChange={e => setVoipProvider(e.target.value as CloudProvider)} style={voipInputStyle}>
              <option value="netgsm">NetGSM</option>
              <option value="twilio">Twilio</option>
              <option value="vonage">Vonage</option>
              <option value="custom">Diğer (Özel)</option>
            </select>
          </div>
          <div>
            <div style={voipLabelStyle}>Görünen Ad</div>
            <input value={voipLabel} onChange={e => setVoipLabel(e.target.value)} placeholder="Örn. NetGSM Santral" style={voipInputStyle} />
          </div>
          <div>
            <div style={voipLabelStyle}>API Base URL</div>
            <input value={voipBaseUrl} onChange={e => setVoipBaseUrl(e.target.value)} placeholder="https://api.netgsm.com.tr/voice/v1/" style={voipInputStyle} />
          </div>
          <div>
            <div style={voipLabelStyle}>SIP Trunk Host</div>
            <input value={voipTrunkHost} onChange={e => setVoipTrunkHost(e.target.value)} placeholder="sip.netgsm.com.tr" style={voipInputStyle} />
          </div>
        </div>
      </div>

      {/* SMS Card */}
      <div style={{ background: '#0f172a', border: '1px solid #334155', padding: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 16, color: 'var(--foreground)' }}>SMS Ayarları (NetGSM)</h3>
        <p style={{ fontSize: 13, color: 'var(--foreground-3)', marginBottom: 20 }}>
          Hastalara randevu hatırlatıcılarını SMS ile göndermek için NetGSM API bilgileri.
        </p>
        <div style={voipGridStyle}>
          <div>
            <div style={voipLabelStyle}>NetGSM Kullanıcı Kodu</div>
            <input value={smsUsercode} onChange={e => setSmsUsercode(e.target.value)} placeholder="850xxxxxxx veya 53xxxxxxxx" style={voipInputStyle} />
          </div>
          <div>
            <div style={voipLabelStyle}>NetGSM API Şifresi</div>
            <input type="password" value={smsPassword} onChange={e => setSmsPassword(e.target.value)} placeholder="••••••••" style={voipInputStyle} />
          </div>
          <div>
            <div style={voipLabelStyle}>Onaylı Mesaj Başlığı (Sender ID)</div>
            <input value={smsSenderId} onChange={e => setSmsSenderId(e.target.value)} placeholder="Örn. CLINIC" style={voipInputStyle} />
          </div>
        </div>
      </div>

      {/* SMTP Card */}
      <div style={{ background: '#0f172a', border: '1px solid #334155', padding: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 16, color: 'var(--foreground)' }}>E-Posta (SMTP) Ayarları</h3>
        <p style={{ fontSize: 13, color: 'var(--foreground-3)', marginBottom: 20 }}>
          Sistem üzerinden hastalarınıza bilgilendirme e-postaları göndermek için SMTP ayarları.
        </p>
        <div style={voipGridStyle}>
          <div>
            <div style={voipLabelStyle}>SMTP Sunucu (Host)</div>
            <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" style={voipInputStyle} />
          </div>
          <div>
            <div style={voipLabelStyle}>SMTP Port</div>
            <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587 veya 465" style={voipInputStyle} />
          </div>
          <div>
            <div style={voipLabelStyle}>Kullanıcı Adı (Email)</div>
            <input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="ornek@firma.com" style={voipInputStyle} />
          </div>
          <div>
            <div style={voipLabelStyle}>Şifre</div>
            <input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••" style={voipInputStyle} />
          </div>
          <div>
            <div style={voipLabelStyle}>Şifreleme Türü</div>
            <select value={smtpSecure} onChange={e => setSmtpSecure(e.target.value)} style={voipInputStyle}>
              <option value="none">Yok (veya Otomatik)</option>
              <option value="ssl">SSL (Port 465)</option>
              <option value="tls">TLS / STARTTLS (Port 587)</option>
            </select>
          </div>
        </div>
      </div>

      <EvolutionWhatsAppCard />

      {/* Role-based Tab Permissions */}
      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#2e1065', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--foreground)' }}>Rol Bazlı Sekme İzinleri</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--foreground-3)' }}>Alt kullanıcıların görebileceği sekmeleri belirleyin.</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {['hekim', 'sekreter', 'asistan'].map(role => (
            <div key={role} style={{ padding: 16, background: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', textTransform: 'capitalize', marginBottom: 12 }}>
                {role} Rolü
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {[
                  { id: 'calendar', label: 'Takvim' },
                  { id: 'patients', label: 'Hastalar' },
                  { id: 'payments', label: 'Ödemeler & Finans' },
                  { id: 'stok', label: 'Stok & Bakım' },
                  { id: 'knowledge', label: 'Bilgi Tabanı' },
                  { id: 'klinik', label: 'Klinik Personeli' },
                ].map(tab => {
                  const isChecked = rolePermissions[role]?.includes(tab.id) || false
                  return (
                    <label key={tab.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--foreground-2)' }}>
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
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      {tab.label}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
          style={{ fontSize: 14, padding: '10px 24px' }}
        >
          {saving ? 'Kaydediliyor...' : 'Tümünü Kaydet'}
        </button>
      </div>
    </div>
  )
}
