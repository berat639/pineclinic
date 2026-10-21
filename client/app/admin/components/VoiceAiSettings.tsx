'use client'

import { useEffect, useState } from 'react'

type Tab = 'model' | 'voice' | 'conversation' | 'telephony'
type VoiceSettings = {
  model: 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking'
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  voiceName: string
  startWaitSeconds: number
  callSilenceTimeout: number
  callSilenceCloseTimeout: number
  callMaxDuration: number
  maxActivePhoneCalls: number
}

const DEFAULTS: VoiceSettings = {
  model: 'gemini-3.8-live', thinkingLevel: 'LOW', voiceName: 'Aoede',
  startWaitSeconds: 0.4, callSilenceTimeout: 30, callSilenceCloseTimeout: 15,
  callMaxDuration: 600, maxActivePhoneCalls: 3,
}

const VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat']

const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 12, color: 'var(--foreground)', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 7 }

export default function VoiceAiSettings({ onToast }: { onToast: (message: string, type?: 'success' | 'error') => void }) {
  const [tab, setTab] = useState<Tab>('model')
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const patch = (values: Partial<VoiceSettings>) => setSettings(current => ({ ...current, ...values }))

  useEffect(() => {
    fetch('/api/admin/settings/voice').then(async response => {
      if (!response.ok) throw new Error('Ayarlar alınamadı')
      const data = await response.json()
      setSettings({ ...DEFAULTS, ...data })
    }).catch(() => onToast('Sesli AI ayarları yüklenemedi', 'error')).finally(() => setLoading(false))
  }, [onToast])

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/settings/voice', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Kayıt başarısız')
      onToast('Sesli AI ayarları kaydedildi')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Kayıt başarısız', 'error')
    } finally { setSaving(false) }
  }

  const tabs: Array<[Tab, string]> = [['model', 'Model'], ['voice', 'Ses ve Türkçe'], ['conversation', 'Konuşma'], ['telephony', 'Telephony']]
  if (loading) return <div className="glass-card" style={{ padding: 20, color: 'var(--foreground-3)' }}>Sesli AI ayarları yükleniyor…</div>

  return <div className="glass-card" style={{ padding: 20 }}>
    <div style={{ borderBottom: '1px solid var(--input-border)', paddingBottom: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>⚙️ Gelişmiş Sesli AI &amp; Telephony</div>
      <p style={{ fontSize: 11, color: 'var(--foreground-3)', margin: '3px 0 0' }}>Tüm değişiklikler yeni web ve telefon görüşmelerinde uygulanır.</p>
    </div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
      {tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} style={{ padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 650, color: tab === id ? '#fff' : 'var(--accent)', background: tab === id ? 'var(--accent)' : 'var(--card-inner)', border: '1px solid var(--input-border)' }}>{label}</button>)}
    </div>

    {tab === 'model' && <div style={{ display: 'grid', gap: 10 }}>
      {([
        ['gemini-3.8-live', 'Akıcı', 'Günlük klinik görüşmelerinde en hızlı, doğal sıra alma.'],
        ['gemini-3.8-live-extended-thinking', 'Düşünen', 'Karmaşık talepleri ve çok adımlı işlemleri arka planda değerlendirir.'],
      ] as const).map(([id, title, description]) => <label key={id} style={{ display: 'block', padding: 13, border: `1px solid ${settings.model === id ? 'var(--accent)' : 'var(--input-border)'}`, borderRadius: 8, background: 'var(--card-inner)', cursor: 'pointer' }}>
        <input type="radio" name="live-model" checked={settings.model === id} onChange={() => patch({ model: id })} style={{ marginRight: 8 }} />
        <strong style={{ color: 'var(--foreground)', fontSize: 12 }}>{title}</strong>
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--foreground-3)' }}>{description}</span>
      </label>)}
      {settings.model === 'gemini-3.8-live-extended-thinking' && <label style={{ fontSize: 12, color: 'var(--foreground-2)' }}>Düşünme seviyesi
        <select value={settings.thinkingLevel} onChange={event => patch({ thinkingLevel: event.target.value as VoiceSettings['thinkingLevel'] })} style={{ ...inputStyle, marginTop: 6 }}>
          <option value="LOW">Düşük — önerilen; daha seri</option><option value="MEDIUM">Orta — dengeli</option><option value="HIGH">Yüksek — en ayrıntılı</option>
        </select>
      </label>}
      <p style={{ margin: 0, fontSize: 11, color: 'var(--foreground-3)' }}>Düşünen mod, işlem sürerken doğal kısa ara cümleler kullanır; konuşma bitti sanılıp çağrı zaman aşımına düşmez.</p>
    </div>}

    {tab === 'voice' && <div>
      <label style={{ fontSize: 12, color: 'var(--foreground-2)' }}>Asistan sesi
        <select value={settings.voiceName} onChange={event => patch({ voiceName: event.target.value })} style={{ ...inputStyle, marginTop: 6 }}>{VOICES.map(voice => <option key={voice} value={voice}>{voice}{voice === 'Aoede' ? ' — varsayılan' : ''}</option>)}</select>
      </label>
      <p style={{ fontSize: 11, color: 'var(--foreground-3)' }}>Türkçe; kısa cümle, tek soru, normal hız ve seçili sesi koruma davranışı hem web hem telefon oturumuna otomatik uygulanır.</p>
    </div>}

    {tab === 'conversation' && <div style={{ display: 'grid', gap: 15 }}>
      <label style={{ fontSize: 12, color: 'var(--foreground-2)' }}>Konuşmaya başlamadan önce bekleme: {settings.startWaitSeconds} sn
        <input type="range" min="0" max="2" step="0.1" value={settings.startWaitSeconds} onChange={event => patch({ startWaitSeconds: Number(event.target.value) })} style={{ width: '100%', marginTop: 6 }} />
      </label>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--foreground-3)' }}>Önerilen ayar 0,4 sn’dir. Çok düşük değer karşı tarafın ilk hecesini kesebilir.</p>
    </div>}

    {tab === 'telephony' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      <label style={{ fontSize: 12, color: 'var(--foreground-2)' }}>Sessizlik uyarısı
        <input type="number" min="5" max="120" value={settings.callSilenceTimeout} onChange={event => patch({ callSilenceTimeout: Number(event.target.value) })} style={{ ...inputStyle, marginTop: 6 }} />
      </label>
      <label style={{ fontSize: 12, color: 'var(--foreground-2)' }}>Uyarı sonrası kapanış
        <input type="number" min="5" max="120" value={settings.callSilenceCloseTimeout} onChange={event => patch({ callSilenceCloseTimeout: Number(event.target.value) })} style={{ ...inputStyle, marginTop: 6 }} />
      </label>
      <label style={{ fontSize: 12, color: 'var(--foreground-2)' }}>Maksimum görüşme
        <select value={settings.callMaxDuration} onChange={event => patch({ callMaxDuration: Number(event.target.value) })} style={{ ...inputStyle, marginTop: 6 }}>{Array.from({ length: 13 }, (_, i) => i + 3).map(minutes => <option key={minutes} value={minutes * 60}>{minutes} dakika</option>)}</select>
      </label>
      <label style={{ fontSize: 12, color: 'var(--foreground-2)' }}>Telefon AI kapasitesi
        <select value={settings.maxActivePhoneCalls} onChange={event => patch({ maxActivePhoneCalls: Number(event.target.value) })} style={{ ...inputStyle, marginTop: 6 }}>{[2, 3, 4, 5].map(count => <option key={count} value={count}>{count} aktif çağrı</option>)}</select>
      </label>
    </div>}
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
      <button onClick={() => setSettings(DEFAULTS)} style={{ padding: '7px 10px', borderRadius: 7, color: 'var(--accent)', background: 'var(--card-inner)', border: '1px solid var(--input-border)', cursor: 'pointer', fontSize: 11 }}>Hızlı ve akıcı ayara sıfırla</button>
      <button onClick={save} disabled={saving} style={{ padding: '7px 12px', borderRadius: 7, color: '#fff', background: 'var(--accent)', border: '1px solid var(--accent)', cursor: saving ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700 }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
    </div>
  </div>
}
