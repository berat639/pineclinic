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

export default function IntegrationsTab() {
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

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    fetch('/api/admin/integrations')
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
        
        if (data.smsUsercode) setSmsUsercode(data.smsUsercode)
        if (data.smsPassword) setSmsPassword(data.smsPassword)
        if (data.smsSenderId) setSmsSenderId(data.smsSenderId)
      })
      .catch(() => showToast('error', 'Veriler alınamadı'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voipProvider, voipLabel, voipBaseUrl, voipTrunkHost,
          smtpHost, smtpPort, smtpUser, smtpPass,
          smsUsercode, smsPassword, smsSenderId
        })
      })
      if (!res.ok) throw new Error('Kaydedilemedi')
      showToast('success', 'Entegrasyon ayarları başarıyla kaydedildi')
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
