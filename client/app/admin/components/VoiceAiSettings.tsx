'use client'

import { useEffect, useRef, useState } from 'react'
import InfoTooltip from './ui/InfoTooltip'
import { checkBrowserAudioSupport, runMicrophoneTest, type BrowserAudioSupport } from '../../../lib/browser-audio-support'

type Tab = 'model' | 'voice' | 'conversation' | 'telephony'
type VoiceSettings = {
  model: 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking'
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  voiceName: string
  startWaitSeconds: number
  turnDetectionMode: 'semantic' | 'standard'
  noiseFilterMode: 'rnnoise' | 'off'
  callSilenceTimeout: number
  callSilenceCloseTimeout: number
  callMaxDuration: number
  maxActivePhoneCalls: number
}

const DEFAULTS: VoiceSettings = {
  model: 'gemini-3.8-live', thinkingLevel: 'LOW', voiceName: 'Aoede',
  startWaitSeconds: 0.4, turnDetectionMode: 'semantic', noiseFilterMode: 'rnnoise',
  callSilenceTimeout: 30, callSilenceCloseTimeout: 15,
  callMaxDuration: 600, maxActivePhoneCalls: 3,
}

const VOICES: Array<[string, string]> = [
  ['Zephyr', 'kadın, parlak'], ['Puck', 'erkek, neşeli'], ['Charon', 'erkek, bilgilendirici'], ['Kore', 'kadın, kararlı'],
  ['Fenrir', 'erkek, coşkulu'], ['Leda', 'kadın, genç'], ['Orus', 'erkek, kararlı'], ['Aoede', 'kadın, rahat'],
  ['Callirrhoe', 'kadın, rahat tavırlı'], ['Autonoe', 'kadın, parlak'], ['Enceladus', 'erkek, yumuşak soluklu'], ['Iapetus', 'erkek, net'],
  ['Umbriel', 'erkek, rahat tavırlı'], ['Algieba', 'erkek, akıcı'], ['Despina', 'kadın, akıcı'], ['Erinome', 'kadın, net'],
  ['Algenib', 'erkek, tok'], ['Rasalgethi', 'erkek, bilgilendirici'], ['Laomedeia', 'kadın, neşeli'], ['Achernar', 'kadın, yumuşak'],
  ['Alnilam', 'erkek, kararlı'], ['Schedar', 'erkek, dengeli'], ['Gacrux', 'kadın, olgun'], ['Pulcherrima', 'kadın, atılgan'],
  ['Achird', 'erkek, samimi'], ['Zubenelgenubi', 'erkek, sade'], ['Vindemiatrix', 'kadın, nazik'], ['Sadachbia', 'erkek, canlı'],
  ['Sadaltager', 'erkek, bilgili'], ['Sulafat', 'kadın, sıcak'],
]

const FIELD_TAB: Record<string, Tab> = {
  model: 'model', thinkingLevel: 'model', voiceName: 'voice',
  startWaitSeconds: 'conversation', turnDetectionMode: 'conversation', noiseFilterMode: 'conversation',
  callSilenceTimeout: 'telephony', callSilenceCloseTimeout: 'telephony', callMaxDuration: 'telephony', maxActivePhoneCalls: 'telephony',
}

const card = { background: 'var(--card-bg)', border: '1.5px solid var(--input-border)', borderRadius: 14, boxShadow: 'var(--pc-neo-card)' }
const subCard = { background: 'var(--card-inner)', border: '1px solid var(--input-border)', borderRadius: 10, boxShadow: 'var(--pc-neo-subcard)' }
const clayBtn = { padding: '7px 12px', borderRadius: 8, color: 'var(--accent)', background: 'var(--card-bg)', border: '1px solid var(--input-border)', boxShadow: 'var(--pc-clay-btn)', fontSize: 11, fontWeight: 650 } as const
const primaryBtn = { padding: '7px 14px', borderRadius: 8, color: '#ffffff', background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)', border: '1px solid #1d4ed8', boxShadow: 'var(--pc-clay-primary)', fontSize: 11, fontWeight: 700 } as const
const errorText = { display: 'block', marginTop: 4, fontSize: 11, fontWeight: 600, color: 'var(--danger)' } as const

const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 12, color: 'var(--foreground)', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, boxShadow: 'var(--pc-neo-inset)' } as const
const labelStyle = { display: 'block', fontSize: 12, color: 'var(--foreground-2)' } as const
const hintStyle = { margin: 0, fontSize: 11, color: 'var(--foreground-3)' } as const

function CheckRow({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  const color = ok === null ? 'var(--foreground-3)' : ok ? 'var(--success, #15803d)' : 'var(--danger)'
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--foreground-2)' }}>
    <span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#ffffff', background: ok === null ? 'var(--foreground-3)' : ok ? '#15803d' : 'var(--danger)', flexShrink: 0 }}>{ok === null ? '?' : ok ? '✓' : '✕'}</span>
    <strong style={{ color: 'var(--foreground)' }}>{label}</strong>
    <span style={{ color }}>{detail}</span>
  </div>
}

function BrowserSupportCard({ noiseFilterEnabled }: { noiseFilterEnabled: boolean }) {
  const [support, setSupport] = useState<BrowserAudioSupport | null>(null)
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const [suppressedNow, setSuppressedNow] = useState(false)
  const [testMessage, setTestMessage] = useState('')
  const mounted = useRef(true)

  const refresh = () => { void checkBrowserAudioSupport().then(result => { if (mounted.current) setSupport(result) }) }
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false } }, [])

  const testMicrophone = async () => {
    setTesting(true); setTestMessage(''); setSuppressedNow(false)
    try {
      const { peak, suppressedCount } = await runMicrophoneTest(
        (value, meta) => {
          if (mounted.current) {
            setLevel(value)
            setSuppressedNow(Boolean(meta?.suppressed))
          }
        },
        3500,
        { noiseFilter: noiseFilterEnabled },
      )
      if (mounted.current) {
        const filterSummary = noiseFilterEnabled && suppressedCount > 0
          ? ` (${suppressedCount} anlık darbe/öksürük süzüldü)`
          : ''
        setTestMessage(
          peak > 0.05
            ? `Mikrofon çalışıyor, konuşma sesiniz net algılandı${filterSummary}.`
            : suppressedCount > 0
              ? `Yalnızca anlık darbe/öksürük algılandı ve süzgeç tarafından bastırıldı${filterSummary}. Normal konuşarak tekrar deneyin.`
              : 'Mikrofona erişildi ancak ses algılanmadı. Mikrofonunuzun açık olduğundan emin olun.',
        )
      }
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      if (mounted.current) setTestMessage(denied ? 'Mikrofon izni verilmedi. Tarayıcının adres çubuğundan izin verip tekrar deneyin.' : 'Mikrofon açılamadı. Cihazınızın bağlı olduğunu kontrol edin.')
    } finally {
      if (mounted.current) { setTesting(false); setLevel(0); setSuppressedNow(false); refresh() }
    }
  }

  const permissionLabel = !support ? '' : support.microphonePermission === 'granted' ? 'Verildi' : support.microphonePermission === 'denied' ? 'Engellendi' : support.microphonePermission === 'prompt' ? 'İlk kullanımda sorulacak' : 'Denemeden anlaşılamıyor'
  return <div style={{ ...subCard, padding: 14, marginBottom: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ fontSize: 12, color: 'var(--foreground)' }}>Tarayıcı Uygunluğu ve Mikrofon Sınaması</strong>
        <InfoTooltip title="Bu kart ne işe yarar?">Sesli görüşme için tarayıcınızın güvenli bağlantı, mikrofon ve ses işleme özelliklerini denetler. Mikrofonu denerken gürültü ve öksürük süzgecinin etkisini canlı görebilirsiniz.</InfoTooltip>
      </div>
      <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: 'var(--pc-tint, #e0f2fe)', color: 'var(--pc-tint-fg, #0369a1)', border: '1px solid var(--input-border)', boxShadow: 'var(--pc-clay-pale)' }}>
        {noiseFilterEnabled ? 'Gürültü ve Öksürük Süzgeci: Açık' : 'Gürültü ve Öksürük Süzgeci: Kapalı'}
      </span>
    </div>
    {support ? <div style={{ display: 'grid', gap: 7 }}>
      <CheckRow ok label="Tarayıcı" detail={support.browserName} />
      <CheckRow ok={support.secureContext} label="Güvenli bağlantı" detail={support.secureContext ? 'Uygun' : 'Sayfa güvenli adresten açılmalı'} />
      <CheckRow ok={support.microphoneApi} label="Mikrofon erişimi" detail={support.microphoneApi ? 'Destekleniyor' : 'Bu tarayıcıda desteklenmiyor'} />
      <CheckRow ok={support.audioProcessing} label="Ses işleme desteği" detail={support.audioProcessing ? 'Destekleniyor' : 'Tarayıcınızı güncelleyin'} />
      <CheckRow ok={support.microphonePermission === 'granted' ? true : support.microphonePermission === 'denied' ? false : null} label="Mikrofon izni" detail={permissionLabel} />
    </div> : <p style={hintStyle}>Denetleniyor…</p>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => void testMicrophone()} disabled={testing} style={{ ...primaryBtn, cursor: testing ? 'wait' : 'pointer' }}>{testing ? 'Dinleniyor… (3,5 sn)' : 'Mikrofonu dene'}</button>
      <div role="meter" aria-label="Ses seviyesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} style={{ flex: 1, minWidth: 120, height: 10, borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', boxShadow: 'var(--pc-neo-inset)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(level * 100)}%`, height: '100%', background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)', transition: 'width 80ms linear' }} />
      </div>
      {testing && suppressedNow && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>Darbe/öksürük süzüldü</span>}
    </div>
    {testMessage && <p style={{ ...hintStyle, marginTop: 8, color: 'var(--foreground-2)' }}>{testMessage}</p>}
  </div>
}

export default function VoiceAiSettings({ onToast }: { onToast: (message: string, type?: 'success' | 'error') => void }) {
  const [tab, setTab] = useState<Tab>('model')
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const patch = (values: Partial<VoiceSettings>) => {
    setFieldErrors({})
    setSettings(current => ({ ...current, ...values }))
  }

  useEffect(() => {
    fetch('/api/admin/settings/voice').then(async response => {
      if (!response.ok) throw new Error('Ayarlar alınamadı')
      const data = await response.json()
      setSettings({ ...DEFAULTS, ...data })
    }).catch(() => onToast('Sesli yapay zeka ayarları yüklenemedi', 'error')).finally(() => setLoading(false))
  }, [onToast])

  const persistSettings = async (target: VoiceSettings, toastMessage = 'Sesli yapay zeka ayarları kaydedildi') => {
    setSaving(true)
    setFieldErrors({})
    try {
      const response = await fetch('/api/admin/settings/voice', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(target) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (result?.fieldErrors && typeof result.fieldErrors === 'object') {
          const errors = result.fieldErrors as Record<string, string>
          setFieldErrors(errors)
          const firstField = Object.keys(errors).find(key => FIELD_TAB[key])
          if (firstField) setTab(FIELD_TAB[firstField])
        }
        throw new Error(result.error || 'Kayıt başarısız')
      }
      if (result?.settings) {
        setSettings({ ...DEFAULTS, ...result.settings })
      }
      onToast(toastMessage)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Kayıt başarısız', 'error')
    } finally { setSaving(false) }
  }

  const save = () => void persistSettings(settings)
  const resetToDefaults = () => {
    setSettings(DEFAULTS)
    void persistSettings(DEFAULTS, 'Sesli yapay zeka ayarları hızlı ve akıcı varsayılanlara sıfırlandı')
  }

  const tabs: Array<[Tab, string]> = [['model', 'Model'], ['voice', 'Ses ve Türkçe'], ['conversation', 'Konuşma'], ['telephony', 'Telefon ve Çağrı']]
  const tabHasError = (id: Tab) => Object.keys(fieldErrors).some(key => FIELD_TAB[key] === id)
  const FieldError = ({ name }: { name: string }) => fieldErrors[name] ? <span role="alert" style={errorText}>{fieldErrors[name]}</span> : null
  if (loading) return <div style={{ ...card, padding: 20, color: 'var(--foreground-3)' }}>Sesli yapay zeka ayarları yükleniyor…</div>

  return <div style={{ ...card, padding: 20 }}>
    <div style={{ borderBottom: '1px solid var(--input-border)', paddingBottom: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Gelişmiş Sesli Yapay Zeka ve Çağrı Ayarları</div>
      <p style={{ fontSize: 11, color: 'var(--foreground-3)', margin: '3px 0 0' }}>Tüm değişiklikler yeni web ve telefon görüşmelerinde uygulanır.</p>
    </div>

    <BrowserSupportCard noiseFilterEnabled={settings.noiseFilterMode !== 'off'} />

    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, padding: 5, borderRadius: 10, background: 'var(--input-bg)', border: '1px solid var(--input-border)', boxShadow: 'var(--pc-neo-inset)' }}>
      {tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} style={tab === id ? { ...primaryBtn, cursor: 'pointer' } : { ...clayBtn, cursor: 'pointer', borderColor: tabHasError(id) ? 'var(--danger)' : 'var(--input-border)' }}>{label}{tabHasError(id) ? ' •' : ''}</button>)}
    </div>

    {tab === 'model' && <div style={{ display: 'grid', gap: 10 }}>
      {([
        ['gemini-3.8-live', 'Hızlı mod', 'Günlük klinik görüşmelerinde en hızlı ve doğal konuşma sırası.'],
        ['gemini-3.8-live-extended-thinking', 'Derin düşünen mod', 'Karmaşık talepleri ve çok adımlı işlemleri arka planda değerlendirir.'],
      ] as const).map(([id, title, description]) => <label key={id} style={{ display: 'block', padding: 13, border: `1.5px solid ${settings.model === id ? '#2563eb' : 'var(--input-border)'}`, borderRadius: 10, background: settings.model === id ? 'var(--pc-pale-bg, var(--card-inner))' : 'var(--card-inner)', boxShadow: 'var(--pc-neo-subcard)', cursor: 'pointer' }}>
        <input type="radio" name="live-model" checked={settings.model === id} onChange={() => patch({ model: id })} style={{ marginRight: 8 }} />
        <strong style={{ color: 'var(--foreground)', fontSize: 12 }}>{title}</strong>
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--foreground-3)' }}>{description}</span>
      </label>)}
      <FieldError name="model" />
      {settings.model === 'gemini-3.8-live-extended-thinking' && <label style={labelStyle}>Düşünme seviyesi
        <select value={settings.thinkingLevel} onChange={event => patch({ thinkingLevel: event.target.value as VoiceSettings['thinkingLevel'] })} style={{ ...inputStyle, marginTop: 6 }}>
          <option value="LOW">Düşük — önerilen; daha seri</option><option value="MEDIUM">Orta — dengeli</option><option value="HIGH">Yüksek — en ayrıntılı</option>
        </select>
        <FieldError name="thinkingLevel" />
      </label>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={hintStyle}>Derin düşünen mod hakkında</span>
        <InfoTooltip title="Derin düşünen mod">İşlem sürerken doğal kısa ara cümleler kullanır; konuşma bitti sanılıp çağrı zaman aşımına düşmez.</InfoTooltip>
      </div>
    </div>}

    {tab === 'voice' && <div>
      <label style={labelStyle}>Asistan sesi
        <select value={settings.voiceName} onChange={event => patch({ voiceName: event.target.value })} style={{ ...inputStyle, marginTop: 6 }}>{VOICES.map(([voice, desc]) => <option key={voice} value={voice}>{voice} — {desc}{voice === 'Aoede' ? ' (varsayılan)' : ''}</option>)}</select>
        <FieldError name="voiceName" />
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <span style={hintStyle}>Türkçe konuşma davranışı</span>
        <InfoTooltip title="Türkçe konuşma davranışı">Kısa cümle, tek soru, normal hız ve seçili sesi koruma davranışı hem web hem telefon oturumuna otomatik uygulanır.</InfoTooltip>
      </div>
    </div>}

    {tab === 'conversation' && <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <strong style={{ fontSize: 12, color: 'var(--foreground)' }}>Konuşma Sırası Algılama Modu</strong>
          <InfoTooltip title="Akıllı konuşma sırası nasıl çalışır?">Akıllı modda asistan, hastanın cümlesinin anlam olarak bitip bitmediğini değerlendirir. Bağlaçlardan (&quot;ve&quot;, &quot;ama&quot;, &quot;yani&quot;, &quot;şey&quot;) veya yarım kalan telefon numaralarından sonraki düşünme duraksamalarında araya girmez; hem web hem telefon görüşmelerinde çalışır.</InfoTooltip>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {([
            ['semantic', 'Akıllı Sıra Algılama (Önerilen)', 'Cümlenin anlam olarak tamamlanmasını bekler; düşünme duraksamalarında sözü kesmez.'],
            ['standard', 'Standart Algılama', 'Klasik süre tabanlı ses algılama; kısa sessizlikte hemen yanıt üretir.'],
          ] as const).map(([id, title, description]) => <label key={id} style={{ display: 'block', padding: 12, border: `1.5px solid ${settings.turnDetectionMode === id ? '#2563eb' : 'var(--input-border)'}`, borderRadius: 10, background: settings.turnDetectionMode === id ? 'var(--pc-pale-bg, var(--card-inner))' : 'var(--card-inner)', boxShadow: 'var(--pc-neo-subcard)', cursor: 'pointer' }}>
            <input type="radio" name="turn-detection-mode" checked={settings.turnDetectionMode === id} onChange={() => patch({ turnDetectionMode: id })} style={{ marginRight: 8 }} />
            <strong style={{ color: 'var(--foreground)', fontSize: 12 }}>{title}</strong>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--foreground-3)' }}>{description}</span>
          </label>)}
        </div>
        <FieldError name="turnDetectionMode" />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <strong style={{ fontSize: 12, color: 'var(--foreground)' }}>Gürültü ve Öksürük Süzgeci</strong>
          <InfoTooltip title="Gürültü ve öksürük süzgeci ne yapar?">Mikrofondan gelen öksürük, hapşırık, boğaz temizleme, masa tıklaması ve arka plan uğultusunu ses yapay zekaya ulaşmadan önce süzer. Böylece asistan öksürük sesini konuşma sanıp sözünüzü kesmez veya yanlış yanıt vermez.</InfoTooltip>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {([
            ['rnnoise', 'Açık — Gürültü ve Öksürük Süzgeci (Önerilen)', 'Öksürük, hapşırık, nefes patlaması ve arka plan uğultusunu yapay zekaya göndermeden önce süzer.'],
            ['off', 'Kapalı — Ham Mikrofon Sesi', 'Mikrofon sesini ek süzgeç olmadan doğrudan iletir.'],
          ] as const).map(([id, title, description]) => <label key={id} style={{ display: 'block', padding: 12, border: `1.5px solid ${settings.noiseFilterMode === id ? '#2563eb' : 'var(--input-border)'}`, borderRadius: 10, background: settings.noiseFilterMode === id ? 'var(--pc-pale-bg, var(--card-inner))' : 'var(--card-inner)', boxShadow: 'var(--pc-neo-subcard)', cursor: 'pointer' }}>
            <input type="radio" name="noise-filter-mode" checked={settings.noiseFilterMode === id} onChange={() => patch({ noiseFilterMode: id })} style={{ marginRight: 8 }} />
            <strong style={{ color: 'var(--foreground)', fontSize: 12 }}>{title}</strong>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--foreground-3)' }}>{description}</span>
          </label>)}
        </div>
        <FieldError name="noiseFilterMode" />
      </div>

      <div>
        <label style={labelStyle}>Konuşmaya başlamadan önce bekleme: {settings.startWaitSeconds} sn
          <input type="range" min="0" max="2" step="0.1" value={settings.startWaitSeconds} onChange={event => patch({ startWaitSeconds: Number(event.target.value) })} style={{ width: '100%', marginTop: 6 }} />
          <FieldError name="startWaitSeconds" />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <span style={hintStyle}>Önerilen ayar 0,4 sn</span>
          <InfoTooltip title="Bekleme süresi">Çok düşük değer karşı tarafın ilk hecesini kesebilir. 0 ile 2 saniye arasında seçebilirsiniz.</InfoTooltip>
        </div>
      </div>
    </div>}

    {tab === 'telephony' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {([
        ['callSilenceTimeout', 'Sessizlik uyarısı (saniye)', '5 – 120 saniye arası (varsayılan: 30 sn)'],
        ['callSilenceCloseTimeout', 'Uyarı sonrası kapanış (saniye)', '5 – 120 saniye arası (varsayılan: 15 sn)'],
      ] as const).map(([name, label, hint]) => <label key={name} style={labelStyle}>{label}
        <div style={{ position: 'relative', marginTop: 6 }}>
          <input type="number" min="5" max="120" value={settings[name]} onChange={event => patch({ [name]: Number(event.target.value) })} style={{ ...inputStyle, paddingRight: 38 }} />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 700, color: 'var(--foreground-3)', pointerEvents: 'none' }}>sn</span>
        </div>
        <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: 'var(--foreground-3)' }}>{hint}</span>
        <FieldError name={name} />
      </label>)}
      <label style={labelStyle}>Maksimum görüşme süresi
        <select value={settings.callMaxDuration} onChange={event => patch({ callMaxDuration: Number(event.target.value) })} style={{ ...inputStyle, marginTop: 6 }}>{Array.from({ length: 13 }, (_, i) => i + 3).map(minutes => <option key={minutes} value={minutes * 60}>{minutes} dakika</option>)}</select>
        <FieldError name="callMaxDuration" />
      </label>
      <label style={labelStyle}>Telefon yapay zeka kapasitesi
        <select value={settings.maxActivePhoneCalls} onChange={event => patch({ maxActivePhoneCalls: Number(event.target.value) })} style={{ ...inputStyle, marginTop: 6 }}>{[2, 3, 4, 5].map(count => <option key={count} value={count}>{count} aktif çağrı</option>)}</select>
        <FieldError name="maxActivePhoneCalls" />
      </label>
    </div>}

    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
      <button type="button" onClick={resetToDefaults} disabled={saving} style={{ ...clayBtn, cursor: saving ? 'wait' : 'pointer' }}>Hızlı ve akıcı ayara sıfırla</button>
      <button type="button" onClick={save} disabled={saving} style={{ ...primaryBtn, cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
    </div>
  </div>
}
