'use client'

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
      border: '2px solid rgba(255,255,255,0.08)',
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

  // WhatsApp States
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('')
  const [waAccessToken, setWaAccessToken] = useState('')
  const [waVerifyToken, setWaVerifyToken] = useState('')
  const [waEnabled, setWaEnabled] = useState(false)
  const [waShowToken, setWaShowToken] = useState(false)
  const [waCopied, setWaCopied] = useState(false)

  // Role Permissions State
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({
    hekim: ['calendar', 'patients', 'knowledge'],
    sekreter: ['calendar', 'patients', 'payments'],
    asistan: ['calendar', 'patients']
  })

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin.replace(':3000', ':3001')}/api/whatsapp/webhook`
    : '/api/whatsapp/webhook'

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

        // WhatsApp
        if (data.whatsappPhoneNumberId) setWaPhoneNumberId(data.whatsappPhoneNumberId)
        if (data.whatsappAccessToken) setWaAccessToken(data.whatsappAccessToken)
        if (data.whatsappVerifyToken) setWaVerifyToken(data.whatsappVerifyToken)
        if (data.whatsappEnabled !== undefined) setWaEnabled(!!data.whatsappEnabled)
      })
      .catch(() => showToast('error', 'Veriler alınamadı'))
      .finally(() => setLoading(false))

    fetch('/api/admin/settings/roles')
      .then(r => r.json())
      .then(data => { if (data && Object.keys(data).length) setRolePermissions(data) })
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
          whatsappPhoneNumberId: waPhoneNumberId,
          whatsappAccessToken: waAccessToken,
          whatsappVerifyToken: waVerifyToken,
          whatsappEnabled: waEnabled,
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div style={{ maxWidth: 1100, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          padding: '10px 15px',
          background: toast.type === 'success' ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)'}`,
          borderRadius: 10,
          color: toast.type === 'success' ? '#4ade80' : '#f87171',
          fontSize: 13, fontWeight: 500,
          backdropFilter: 'blur(12px)',
        }}>
          {toast.text}
        </div>
      )}

      {/* VoIP Card */}
      <div className="glass-card" style={{ padding: 24 }}>
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
      <div className="glass-card" style={{ padding: 24 }}>
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
      <div className="glass-card" style={{ padding: 24 }}>
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

      {/* WhatsApp Business API Card */}
      <div className="glass-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ fontSize: 16, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>💬</span> WhatsApp Business API
          </h3>
          {/* Enable Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--foreground-3)' }}>
              {waEnabled ? 'Aktif' : 'Pasif'}
            </span>
            <div
              onClick={() => setWaEnabled(!waEnabled)}
              style={{
                width: 42, height: 24, borderRadius: 12, cursor: 'pointer', transition: 'background 0.2s',
                background: waEnabled ? '#16a34a' : 'rgba(255,255,255,0.1)',
                position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, transition: 'left 0.2s',
                left: waEnabled ? 20 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
              }} />
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--foreground-3)', marginBottom: 20, lineHeight: 1.5 }}>
          Hastalara proaktif WhatsApp mesajı göndermek ve gelen WhatsApp mesajlarını yapay zeka ile yanıtlamak için Meta Business API bilgileri.
        </p>

        <div style={voipGridStyle}>
          <div>
            <div style={voipLabelStyle}>Phone Number ID</div>
            <input
              value={waPhoneNumberId}
              onChange={e => setWaPhoneNumberId(e.target.value)}
              placeholder="Örn. 123456789012345"
              style={voipInputStyle}
            />
            <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginTop: 4 }}>Meta Developer Console &gt; WhatsApp &gt; API Setup</div>
          </div>
          <div>
            <div style={voipLabelStyle}>Access Token</div>
            <div style={{ position: 'relative' }}>
              <input
                type={waShowToken ? 'text' : 'password'}
                value={waAccessToken}
                onChange={e => setWaAccessToken(e.target.value)}
                placeholder="••••••••••••••••"
                style={{ ...voipInputStyle, paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setWaShowToken(!waShowToken)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: 14,
                }}
              >
                {waShowToken ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <div>
            <div style={voipLabelStyle}>Verify Token (Kendiniz Belirleyin)</div>
            <input
              value={waVerifyToken}
              onChange={e => setWaVerifyToken(e.target.value)}
              placeholder="Örn. pineclinic_wa_2024"
              style={voipInputStyle}
            />
            <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginTop: 4 }}>Meta webhook kurulumunda bu token'ı kullanın</div>
          </div>
          <div>
            <div style={voipLabelStyle}>Webhook URL (Meta'ya Girin)</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                readOnly
                value={webhookUrl}
                style={{ ...voipInputStyle, color: '#60a5fa', cursor: 'text', flex: 1 }}
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl)
                  setWaCopied(true)
                  setTimeout(() => setWaCopied(false), 2000)
                }}
                style={{
                  padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: waCopied ? 'rgba(22,163,74,0.15)' : 'rgba(59,130,246,0.12)',
                  border: `1px solid ${waCopied ? 'rgba(22,163,74,0.3)' : 'rgba(59,130,246,0.25)'}`,
                  color: waCopied ? '#4ade80' : '#60a5fa',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {waCopied ? '✓ Kopyalandı' : 'Kopyala'}
              </button>
            </div>
          </div>
        </div>

        {/* Setup Guide */}
        <div style={{
          marginTop: 16, padding: '12px 14px', borderRadius: 8,
          background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#60a5fa', marginBottom: 6 }}>📋 Kurulum Adımları</div>
          <ol style={{ fontSize: 12, color: 'var(--foreground-3)', lineHeight: 1.8, margin: 0, paddingLeft: 16 }}>
            <li>Meta for Developers &gt; Uygulamanız &gt; WhatsApp &gt; Configuration</li>
            <li>Webhook URL alanına yukarıdaki URL'yi girin</li>
            <li>Verify Token alanına belirlediğiniz token'ı girin</li>
            <li>"messages" subscription'ını aktif edin</li>
            <li>Buradaki bilgileri kaydedin ve WhatsApp entegrasyonu hazır!</li>
          </ol>
        </div>
      </div>

      {/* Role-based Tab Permissions */}
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--foreground)' }}>Rol Bazlı Sekme İzinleri</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--foreground-3)' }}>Alt kullanıcıların görebileceği sekmeleri belirleyin.</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {['hekim', 'sekreter', 'asistan'].map(role => (
            <div key={role} style={{ padding: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
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
