'use client'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { IMaskInput } from 'react-imask'
import ConfirmModal from '../../../admin/components/ConfirmModal'
import N8nMetaWhatsAppCard from '../../../admin/components/N8nMetaWhatsAppCard'
import PlatformSystemPrompts from './PlatformSystemPrompts'
import styles from './PlatformClinicsTab.module.css'

type Clinic = { id: string; name: string; hostname: string; isActive?: boolean }; type Test = { id: string; kind: string; status: string; message: string | null; revision: number; expiresAt?: string }; type State = { configured: boolean; enabled: boolean; revision: number; health: string; test: Test | null; tests?: Test[]; config?: Record<string, unknown> }; type Integrations = { phone: State; sms: State; smtp: State; connection: { ip: string; port: number; protocol: string } }; type Wa = { connectionState: string; expectedPhone: string | null; linkedPhone?: string | null; numberVerifiedAt: string | null; enabled?: boolean; setupStatus?: string }
type GeminiKeyInfo = { configured: boolean; source: 'clinic' | 'shared' | 'missing'; last4: string | null; updatedAt: string | null; conflict?: boolean }
type ClinicAdmin = { id: string; email: string; name: string; phone: string | null; role: string; active: boolean; isPlatformAdmin: boolean; createdAt: string }
type ClinicAdminInvite = { id: string; email: string; name: string; role: string; status: string; expiresAt: string; createdAt: string }
type ClinicAdminsPayload = { clinicId: string; clinicName: string; clinicIsActive: boolean; primaryHostname: string; admins: ClinicAdmin[]; invitations: ClinicAdminInvite[]; smtpStatus: { configured: boolean; enabled: boolean; ready: boolean; fromAddress: string | null; message: string } }
type PhoneForm = { username: string; password: string; numbers: string[]; callerId: string; transferNumber: string; target: string }
const digits = (v: string) => v.replace(/\D/g, ''); const national = (v: string) => { let n = digits(v); if (n.startsWith('90')) n = n.slice(2); if (n.startsWith('0')) n = n.slice(1); return n.slice(0, 10) }; const e164 = (v: string) => `+90${national(v)}`; const validPhone = (v: string) => /^[1-9]\d{9}$/.test(national(v)); const validMobile = (v: string) => /^5\d{9}$/.test(national(v)); const mask = '+{90} (000) 000 00 00'
const PhoneInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <IMaskInput mask={mask} unmask value={`90${national(value)}`} placeholder="+90 (___) ___ __ __" inputMode="tel" autoComplete="tel" onAccept={v => onChange(national(String(v)))} />
const Field = ({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) => <label className={styles.field}><span>{label}</span>{children}{help && <small>{help}</small>}</label>
const PhoneList = ({ values, onChange, onRemoveLast, canRemoveLast }: { values: string[]; onChange: (values: string[]) => void; onRemoveLast?: () => void; canRemoveLast?: boolean }) => <div className={styles.phoneList}>{values.map((value, index) => <div className={styles.phoneRow} key={index}><PhoneInput value={value} onChange={next => onChange(values.map((item, i) => i === index ? next : item))} />{(values.length > 1 || Boolean(value) || canRemoveLast) && <button type="button" className={styles.removeButton} onClick={() => { if (values.length > 1) { onChange(values.filter((_, i) => i !== index)) } else if (onRemoveLast && canRemoveLast) { onRemoveLast() } else { onChange(['']) } }}>Sil</button>}</div>)}<button type="button" className={styles.secondaryButton} onClick={() => onChange([...values, ''])}>Numara ekle</button></div>
async function api<T>(url: string, init?: RequestInit) { const r = await fetch(url, { cache: 'no-store', ...init }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'İşlem tamamlanamadı'); return d as T }
const current = (s: State, kind: string) => { const t = s.tests?.find(t => t.revision === s.revision && t.kind === kind); return t && ['pending', 'accepted'].includes(t.status) && t.expiresAt && Date.parse(t.expiresAt) <= Date.now() ? { ...t, status: 'expired' } : t }; const done = (s: State, kind: string) => current(s, kind)?.status === 'confirmed'

function parseDiagnostic(raw: string, service?: 'phone' | 'sms' | 'smtp', smtpState?: { host: string; port: string }): { cause: string; suggestion: string } {
  const parts = raw.split(/💡\s*Öneri:\s*/i)
  if (parts.length > 1) {
    return { cause: parts[0].trim(), suggestion: parts.slice(1).join(' ').trim() }
  }
  const lower = raw.toLowerCase()
  if (lower.includes('saniye bekleyin') || lower.includes('429')) {
    return {
      cause: raw,
      suggestion: 'Üst üste test isteği gönderildi. Ayarlarda değişiklik yaptıysanız önce "1. Bilgileri kaydedin → Kaydet" butonuna basın, ardından tekrar "Test gönder" deyin.',
    }
  }
  if (service === 'smtp') {
    if (smtpState?.port === '587') {
      return {
        cause: raw,
        suggestion: 'Natro ve birçok kurumsal e-posta sunucusunda Port 587 (STARTTLS) zaman aşımına uğrayabilir veya sertifika uyuşmazlığı yaşayabilir. Port değerini 465 (SSL) yapıp (Natro için sunucu: mx-out03.natrohost.com) tekrar Kaydet → Test gönder adımlarını uygulayın.',
      }
    }
    return {
      cause: raw,
      suggestion: '1) Sunucu adresini (Natro için mx-out03.natrohost.com) ve Port 465 (SSL) değerini kontrol edin. 2) Kullanıcı ve Gönderici e-posta alanlarına tam e-posta adresinizi (örn. app@thinpine.com) yazın. 3) Gmail/Yandex kullanıyorsanız normal şifre yerine Uygulama Şifresi girin.',
    }
  }
  if (service === 'sms') {
    return {
      cause: raw,
      suggestion: '1) NetGSM API kullanıcı kodu (örn. 312... / 850...) ve alt kullanıcı parolasını kontrol edin. 2) Başlık (MsgHeader) değerinin NetGSM panelindeki onaylı başlığınızla birebir aynı olduğundan emin olun. 3) NetGSM panelinde API erişiminin açık olduğunu doğrulayın.',
    }
  }
  if (service === 'phone') {
    return {
      cause: raw,
      suggestion: '1) SIP kullanıcı adı ve SIP şifresinin doğru olduğundan emin olun. 2) Çıkış numarasının Gelen numaralar listesinde yer aldığını ve test numarasının geçerli bir telefon numarası olduğunu kontrol edin.',
    }
  }
  return {
    cause: raw,
    suggestion: 'Bağlantı bilgilerini kontrol edip "1. Bilgileri kaydedin → Kaydet" butonuna bastıktan sonra işlemi tekrar deneyin.',
  }
}

function DiagnosticAlert({ message, service, smtpState, onQuickFix }: { message: string; service?: 'phone' | 'sms' | 'smtp'; smtpState?: { host: string; port: string; username: string; fromAddress: string }; onQuickFix?: (patch: Partial<{ host: string; port: string; secure: string; fromAddress: string }>) => void }) {
  const { cause, suggestion } = parseDiagnostic(message, service, smtpState)
  const showPort465Fix = service === 'smtp' && smtpState && smtpState.port !== '465' && onQuickFix
  const showNatroHostFix = service === 'smtp' && smtpState && (smtpState.host.includes('thinpine.com') || !smtpState.host.includes('natrohost.com')) && onQuickFix
  const showFromMatchFix = service === 'smtp' && smtpState && smtpState.username && smtpState.fromAddress !== smtpState.username && onQuickFix

  return (
    <div className={styles.diagnosticBox} role="alert">
      <div className={styles.diagnosticTitle}>
        <span>⚠️</span>
        <span>Hata Nedeni: {cause}</span>
      </div>
      <div className={styles.suggestionBox}>
        <strong>💡 Çözüm Önerisi:</strong> {suggestion}
        {(showPort465Fix || showNatroHostFix || showFromMatchFix) && (
          <div className={styles.quickFixRow}>
            {showPort465Fix && (
              <button type="button" className={styles.quickFixButton} onClick={() => onQuickFix({ port: '465', secure: 'ssl' })}>
                ⚡ Portu 465 (SSL) Yap
              </button>
            )}
            {showNatroHostFix && (
              <button type="button" className={styles.quickFixButton} onClick={() => onQuickFix({ host: 'mx-out03.natrohost.com', port: '465', secure: 'ssl' })}>
                ⚡ Natro Sunucusu (mx-out03.natrohost.com · Port 465) Uygula
              </button>
            )}
            {showFromMatchFix && (
              <button type="button" className={styles.quickFixButton} onClick={() => onQuickFix({ fromAddress: smtpState.username })}>
                ⚡ Gönderici E-postayı ({smtpState.username}) Eşitle
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Step({ complete, title, detail, action, disabled, onClick, onCancel, alwaysShowAction }: { complete: boolean; title: string; detail: string; action: string; disabled?: boolean; onClick: () => void; onCancel?: () => void; alwaysShowAction?: boolean }) { const waiting = action === 'Bağlantı bekleniyor'; return <div className={`${styles.step} ${complete ? styles.stepComplete : ''}`}><div><strong>{complete ? `${title} (Kayıtlı)` : title}</strong><p>{detail}</p></div>{(!complete || alwaysShowAction) && <div className={styles.stepActions}>{onCancel && <button type="button" className={styles.removeButton} disabled={disabled} onClick={onCancel}>Testi iptal et</button>}<button type="button" className={waiting ? styles.removeButton : styles.secondaryButton} disabled={waiting ? false : disabled} onClick={onClick}>{waiting ? 'Testi iptal et' : action}</button></div>}</div> }

export default function PlatformClinicsTab() {
  const [clinics, setClinics] = useState<Clinic[]>([]), [selected, setSelected] = useState<string | null>(null), [ints, setInts] = useState<Integrations | null>(null), [wa, setWa] = useState<Wa | null>(null), [geminiKey, setGeminiKey] = useState<GeminiKeyInfo | null>(null), [geminiKeyInput, setGeminiKeyInput] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState(''), [name, setName] = useState(''), [host, setHost] = useState(''), [zone, setZone] = useState('Europe/Istanbul'), [waPhone, setWaPhone] = useState(''), [qr, setQr] = useState<string | null>(null)
  const [clinicAdmins, setClinicAdmins] = useState<ClinicAdmin[]>([]), [adminInvites, setAdminInvites] = useState<ClinicAdminInvite[]>([]), [adminSmtp, setAdminSmtp] = useState<{ ready: boolean; message: string }>({ ready: false, message: '' }), [adminMode, setAdminMode] = useState<'seed' | 'invite'>('seed'), [adminForm, setAdminForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [confirmFreezeClinic, setConfirmFreezeClinic] = useState<Clinic | null>(null), [confirmFreezeAdmin, setConfirmFreezeAdmin] = useState<ClinicAdmin | null>(null), [confirmRemoveKey, setConfirmRemoveKey] = useState(false)
  const [phone, setPhone] = useState<PhoneForm>({ username: '', password: '', numbers: [''], callerId: '', transferNumber: '', target: '' }), [sms, setSms] = useState({ username: '', password: '', senderId: '', target: '' }), [smtp, setSmtp] = useState({ host: '', port: '465', username: '', password: '', secure: 'ssl', fromName: '', fromAddress: '', target: '' }); const serial = useRef(0)
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı') } finally { setBusy(false) } }
  const load = useCallback(async () => setClinics(await api<Clinic[]>('/api/platform/clinics')), [])
  const loadClinicAdmins = useCallback(async (id: string) => {
    const a = await api<ClinicAdminsPayload>(`/api/platform/clinics/${id}/admins`)
    setClinicAdmins(a.admins || [])
    setAdminInvites((a.invitations || []).filter(inv => inv.status === 'pending'))
    setAdminSmtp({ ready: Boolean(a.smtpStatus?.ready), message: a.smtpStatus?.message || '' })
  }, [])
  const loadClinic = useCallback(async (id: string) => { const req = ++serial.current; const [i, w, a, gk] = await Promise.all([api<Integrations>(`/api/platform/clinics/${id}/integrations`), api<Wa>(`/api/platform/clinics/${id}/whatsapp`), api<ClinicAdminsPayload>(`/api/platform/clinics/${id}/admins`), api<GeminiKeyInfo>(`/api/platform/clinics/${id}/gemini-key`).catch(() => ({ configured: false, source: 'missing' as const, last4: null, updatedAt: null }))]); if (req !== serial.current) return; setInts(i); setWa(w); setGeminiKey(gk); setGeminiKeyInput(''); setClinicAdmins(a.admins || []); setAdminInvites((a.invitations || []).filter(inv => inv.status === 'pending')); setAdminSmtp({ ready: Boolean(a.smtpStatus?.ready), message: a.smtpStatus?.message || '' }); setWaPhone(national(w.expectedPhone || '')); const p = i.phone.config || {}, s = i.sms.config || {}, m = i.smtp.config || {}; setPhone(x => ({ ...x, password: '', username: String(p.username || ''), numbers: Array.isArray(p.numbers) && p.numbers.length ? p.numbers.map(v => national(String(v))) : [''], callerId: national(String(p.callerId || '')), transferNumber: national(String(p.transferNumber || '')) })); setSms(x => ({ ...x, password: '', username: String(s.username || ''), senderId: String(s.senderId || '') })); setSmtp(x => ({ ...x, password: '', host: String(m.host || ''), port: String(m.port || 465), username: String(m.username || ''), secure: String(m.secure || (Number(m.port || 465) === 465 ? 'ssl' : 'tls')), fromName: String(m.fromName || ''), fromAddress: String(m.fromAddress || '') })) }, [])
  useEffect(() => { void load().catch(e => setError(e.message)) }, [load]); const choose = (id: string) => { setSelected(id); setInts(null); setQr(null); void loadClinic(id).catch(e => setError(e.message)) }
  // Refresh status without resetting unsaved configuration or WhatsApp state.
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    let running = false
    const timer = setInterval(async () => {
      if (running) return
      running = true
      const req = serial.current
      try {
        const next = await api<Integrations>(`/api/platform/clinics/${selected}/integrations`)
        if (!cancelled && req === serial.current) setInts(next)
        if (qr || wa?.connectionState === 'connecting') {
          const nextWa = await api<Wa>(`/api/platform/clinics/${selected}/whatsapp`)
          if (!cancelled && req === serial.current) {
            setWa(nextWa)
            if (nextWa.expectedPhone && !waPhone) setWaPhone(national(nextWa.expectedPhone))
            if (nextWa.connectionState === 'open' && qr) {
              setQr(null)
              setNotice('WhatsApp karekodu okutuldu ve bağlantı kuruldu. "Gönderimleri etkinleştir" butonuna basabilirsiniz.')
            }
          }
        }
      } catch {
      } finally {
        running = false
      }
    }, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selected, qr, wa?.connectionState, waPhone])
  const save = async (service: 'phone' | 'sms' | 'smtp', body: Record<string, unknown>) => { if (!selected || !ints) return; await api(`/api/platform/clinics/${selected}/integrations/${service}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, revision: ints[service].revision }) }); await loadClinic(selected); setNotice('Kaydedildi. Sıradaki test adımına geçebilirsiniz.') }
  const cancelActiveTest = async (service: 'phone' | 'sms' | 'smtp', testId: string) => { if (!selected) return; await api(`/api/platform/clinics/${selected}/integrations/${service}/tests/${testId}/cancel`, { method: 'POST' }); await loadClinic(selected); setNotice('Bekleyen test iptal edildi. Yeni test başlatabilirsiniz.') }
  const test = async (service: 'phone' | 'sms' | 'smtp', target: string, kind = 'delivery') => {
    if (!selected || !ints) return
    const active = current(ints[service], kind)
    if (active?.status === 'accepted') { await cancelActiveTest(service, active.id); return }
    if (service === 'sms' && !validMobile(target)) throw new Error('Test için kendi cep telefonunuzu +90 (5__) ___ __ __ biçiminde girin.')
    if (service === 'phone' && !validPhone(target)) throw new Error('Test için geçerli bir telefon numarasını +90 (___) ___ __ __ biçiminde girin.')
    let currentRevision = ints[service].revision
    if (service === 'smtp') {
      const m = ints.smtp.config || {}
      const smtpDirty =
        Boolean(smtp.password.trim()) ||
        smtp.host.trim() !== String(m.host || '') ||
        String(Number(smtp.port || 465)) !== String(m.port || 465) ||
        smtp.username.trim() !== String(m.username || '') ||
        (smtp.fromAddress.trim() || smtp.username.trim()) !== String(m.fromAddress || '') ||
        smtp.fromName.trim() !== String(m.fromName || '')
      if (smtpDirty) {
        const saved = await api<{ ok: boolean; revision?: number }>(`/api/platform/clinics/${selected}/integrations/smtp`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...smtp,
            port: Number(smtp.port),
            secure: Number(smtp.port) === 465 ? 'ssl' : 'tls',
            fromAddress: smtp.fromAddress || smtp.username,
            revision: currentRevision,
          }),
        })
        if (typeof saved.revision === 'number') currentRevision = saved.revision
        else currentRevision += 1
      }
    } else if (service === 'sms') {
      const s = ints.sms.config || {}
      const smsDirty =
        Boolean(sms.password.trim()) ||
        sms.username.trim() !== String(s.username || '') ||
        sms.senderId.trim() !== String(s.senderId || '')
      if (smsDirty) {
        const saved = await api<{ ok: boolean; revision?: number }>(`/api/platform/clinics/${selected}/integrations/sms`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...sms, revision: currentRevision }),
        })
        if (typeof saved.revision === 'number') currentRevision = saved.revision
        else currentRevision += 1
      }
    }
    const r = await api<Test>(`/api/platform/clinics/${selected}/integrations/${service}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: currentRevision, target: service === 'smtp' ? target : e164(target), kind, operationId: crypto.randomUUID() }) })
    await loadClinic(selected)
    if (r.status === 'failed') setError(r.message || 'Test başarısız oldu.')
    else setNotice(r.message || 'Test başlatıldı.')
  }
  const confirm = async (service: 'phone' | 'sms' | 'smtp', id: string) => { if (!selected) return; await api(`/api/platform/clinics/${selected}/integrations/${service}/tests/${id}/confirm`, { method: 'POST' }); await loadClinic(selected); setNotice('Test doğrulandı. Sıradaki adıma geçebilirsiniz.') }; const toggle = async (service: 'phone' | 'sms' | 'smtp') => { if (!selected || !ints) return; const active = !ints[service].enabled; await api(`/api/platform/clinics/${selected}/integrations/${service}/${active ? 'activate' : 'deactivate'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: ints[service].revision }) }); await loadClinic(selected); setNotice(active ? 'Entegrasyon etkinleştirildi.' : 'Yeni kullanım kapatıldı.') }; const removeIntegration = async (service: 'phone' | 'sms' | 'smtp') => { if (!selected) return; await api(`/api/platform/clinics/${selected}/integrations/${service}`, { method: 'DELETE' }); if (service === 'phone') setPhone({ username: '', password: '', numbers: [''], callerId: '', transferNumber: '', target: '' }); await loadClinic(selected); setNotice('Klinik telefon numarası ve bağlantısı silindi. Numarayı başka bir kliniğe ekleyebilirsiniz.') }
  const executeClinicStatusChange = async (targetClinic: Clinic, nextActive: boolean) => {
    await run(async () => {
      const updated = await api<Clinic>(`/api/platform/clinics/${targetClinic.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      })
      setClinics(prev => prev.map(item => item.id === updated.id ? { ...item, isActive: updated.isActive } : item))
      setConfirmFreezeClinic(null)
      setNotice(nextActive ? `"${updated.name}" kliniği yeniden aktifleştirildi.` : `"${updated.name}" kliniği donduruldu ve klinik kullanıcılarının aktif oturumları sonlandırıldı.`)
    })
  }
  const submitClinicAdminForm = (e: FormEvent) => {
    e.preventDefault()
    if (!selected) return
    void run(async () => {
      if (adminMode === 'seed') {
        await api(`/api/platform/clinics/${selected}/admins/seed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: adminForm.name.trim(),
            email: adminForm.email.trim(),
            password: adminForm.password,
            phone: adminForm.phone ? e164(adminForm.phone) : undefined,
          }),
        })
        setAdminForm({ name: '', email: '', password: '', phone: '' })
        await loadClinicAdmins(selected)
        setNotice('Klinik için Seed User (Yönetici) başarıyla atandı.')
      } else {
        await api(`/api/platform/clinics/${selected}/admins/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: adminForm.name.trim(),
            email: adminForm.email.trim(),
          }),
        })
        setAdminForm({ name: '', email: '', password: '', phone: '' })
        await loadClinicAdmins(selected)
        setNotice('Klinik yöneticisi (Seed User) davet e-postası gönderildi.')
      }
    })
  }
  const revokeAdminInvitation = (invitationId: string) => {
    if (!selected) return
    void run(async () => {
      await api(`/api/platform/clinics/${selected}/admins/invitations/${invitationId}`, { method: 'DELETE' })
      await loadClinicAdmins(selected)
      setNotice('Bekleyen yönetici daveti iptal edildi.')
    })
  }
  const executeAdminStatusChange = async (targetAdmin: ClinicAdmin, nextActive: boolean) => {
    if (!selected) return
    await run(async () => {
      await api(`/api/platform/clinics/${selected}/admins/${targetAdmin.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      })
      setConfirmFreezeAdmin(null)
      await loadClinicAdmins(selected)
      setNotice(nextActive ? `"${targetAdmin.name}" yönetici hesabı yeniden aktifleştirildi.` : `"${targetAdmin.name}" yönetici hesabı donduruldu ve oturumları kapatıldı.`)
    })
  }
  const create = (e: FormEvent) => { e.preventDefault(); void run(async () => { const c = await api<Clinic>('/api/platform/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, hostname: host, timezone: zone }) }); setClinics(v => [c, ...v]); setName(''); setHost(''); choose(c.id); setNotice('Klinik oluşturuldu.') }) }; const clinic = clinics.find(c => c.id === selected); const phoneSaved = Boolean(ints?.phone.config?.hasPassword), smsSaved = Boolean(ints?.sms.config?.hasPassword), smtpSaved = Boolean(ints?.smtp.config?.hasPassword); const inbound = ints && current(ints.phone, 'inbound'), outbound = ints && current(ints.phone, 'outbound'), transfer = ints && current(ints.phone, 'transfer'); const phoneValid = Boolean(phone.username && (phone.password || phoneSaved) && phone.numbers.length && phone.numbers.every(validPhone) && validPhone(phone.callerId) && phone.numbers.some(n => national(n) === national(phone.callerId)) && (!phone.transferNumber || validPhone(phone.transferNumber)))
  const phoneFailedMsg = [inbound, outbound, transfer].find(t => t?.status === 'failed')?.message || null
  return <div className={styles.page}>
    <section className={styles.card}><h2 className={styles.title}>Yeni Klinik</h2><form className={styles.form} onSubmit={create}><Field label="Klinik adı"><input value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Hostname / subdomain"><input value={host} onChange={e => setHost(e.target.value.toLowerCase())} /></Field><Field label="Saat dilimi"><input value={zone} onChange={e => setZone(e.target.value)} /></Field><button className={styles.button} disabled={busy}>Kliniği oluştur</button></form></section>{notice && <div className={styles.notice}>{notice}</div>}{error && <DiagnosticAlert message={error} smtpState={smtp} onQuickFix={patch => { setSmtp(v => ({ ...v, ...patch })); setError(''); setNotice('Önerilen SMTP ayarları forma uygulandı. "1. Bilgileri kaydedin → Kaydet" butonuna basıp tekrar test edin.') }} />}
    <section className={styles.card}>
      <h2 className={styles.title}>Klinikler</h2>
      <div className={styles.list}>
        {clinics.map(c => {
          const isClinicActive = c.isActive !== false
          return (
            <div className={styles.row} key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <small>{c.hostname}</small>
              </div>
              <div className={styles.rowMeta}>
                <span className={isClinicActive ? styles.badgeActive : styles.badgeFrozen}>
                  {isClinicActive ? '● Klinik Aktif' : '❄ Klinik Donduruldu'}
                </span>
              </div>
              <div className={styles.rowActions}>
                {isClinicActive ? (
                  <button
                    type="button"
                    className={styles.removeButton}
                    disabled={busy}
                    onClick={() => setConfirmFreezeClinic(c)}
                  >
                    Kliniği Dondur
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.button}
                    disabled={busy}
                    onClick={() => void executeClinicStatusChange(c, true)}
                  >
                    Kliniği Aktifleştir
                  </button>
                )}
                <button className={styles.secondaryButton} onClick={() => choose(c.id)}>
                  {selected === c.id ? 'Seçildi' : 'Kurulumu aç'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
    {selected && ints && <>
      <section className={styles.card}>
        <div className={styles.setupHeading}>
          <div>
            <h2 className={styles.title}>{clinic?.name} · Klinik Durumu & Erişim Kontrolü</h2>
            <p className={styles.description}>
              Hostname: <strong>{clinic?.hostname || '—'}</strong> · Klinik dondurulduğunda o kliniğe bağlı yönetici, hekim ve personel hesaplarının erişimi askıya alınır ve aktif oturumları kapatılır.
            </p>
          </div>
          <div className={styles.rowActions}>
            <span className={clinic?.isActive !== false ? styles.badgeActive : styles.badgeFrozen}>
              {clinic?.isActive !== false ? '● Klinik Aktif' : '❄ Klinik Donduruldu'}
            </span>
            {clinic && (clinic.isActive !== false ? (
              <button
                type="button"
                className={styles.removeButton}
                disabled={busy}
                onClick={() => setConfirmFreezeClinic(clinic)}
              >
                Kliniği Dondur
              </button>
            ) : (
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={() => void executeClinicStatusChange(clinic, true)}
              >
                Kliniği Aktifleştir
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>{clinic?.name} · Klinik Yöneticisi (Seed User) Atama & E-posta Daveti</h2>
        <p className={styles.description}>
          Bu alanda yalnızca ilgili kliniğin <strong>Yönetici (Seed User)</strong> hesabı atanabilir, e-posta ile davet gönderilebilir veya mevcut yönetici hesabı dondurulabilir. Hekim ve resepsiyon personelleri klinik içindeki Personel sekmesinden yönetilir.
        </p>

        <div className={styles.modeTabs} role="tablist" aria-label="Yönetici atama yöntemi">
          <button
            type="button"
            role="tab"
            aria-selected={adminMode === 'seed'}
            className={`${styles.modeTab} ${adminMode === 'seed' ? styles.modeTabActive : ''}`}
            onClick={() => setAdminMode('seed')}
          >
            Seed User (Yönetici) Ata
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminMode === 'invite'}
            className={`${styles.modeTab} ${adminMode === 'invite' ? styles.modeTabActive : ''}`}
            onClick={() => setAdminMode('invite')}
          >
            E-posta ile Yönetici Daveti Gönder
          </button>
        </div>

        {adminMode === 'invite' && !adminSmtp.ready && (
          <div className={styles.hintBanner} style={{ marginBottom: 14 }}>
            <span>
              ⚠️ <strong>Bilgi:</strong> {adminSmtp.message || 'Bu klinik için E-posta / SMTP kurulumu henüz etkinleştirilmemiş.'} E-posta daveti göndermek için aşağıdaki <strong>E-posta / SMTP</strong> bölümünü etkinleştirin veya doğrudan <strong>Seed User (Yönetici) Ata</strong> sekmesini kullanın.
            </span>
          </div>
        )}

        <form className={styles.form} onSubmit={submitClinicAdminForm}>
          <Field label="Yönetici Ad Soyad">
            <input
              required
              placeholder="Örn: Dr. Selin Kaya"
              value={adminForm.name}
              onChange={e => setAdminForm(v => ({ ...v, name: e.target.value }))}
            />
          </Field>
          <Field label="Yönetici E-posta">
            <input
              type="email"
              required
              placeholder="yonetici@klinik.com"
              value={adminForm.email}
              onChange={e => setAdminForm(v => ({ ...v, email: e.target.value.toLowerCase() }))}
            />
          </Field>
          {adminMode === 'seed' && (
            <>
              <Field label="Başlangıç Şifresi" help="En az 6 karakter">
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="En az 6 karakter"
                  value={adminForm.password}
                  onChange={e => setAdminForm(v => ({ ...v, password: e.target.value }))}
                />
              </Field>
              <Field label="Telefon (Opsiyonel)">
                <PhoneInput
                  value={adminForm.phone}
                  onChange={phoneVal => setAdminForm(v => ({ ...v, phone: phoneVal }))}
                />
              </Field>
            </>
          )}
          <Field label="Atanacak Rol">
            <input value="Yönetici (Seed User)" disabled />
          </Field>
          <button
            type="submit"
            className={styles.button}
            disabled={busy || (adminMode === 'invite' && !adminSmtp.ready)}
          >
            {adminMode === 'seed' ? 'Seed Yönetici Ata' : 'E-posta ile Davet Gönder'}
          </button>
        </form>

        {adminInvites.length > 0 && (
          <div className={styles.adminSubSection}>
            <h3 className={styles.subTitle}>Bekleyen Yönetici E-posta Davetleri ({adminInvites.length})</h3>
            <div className={styles.list}>
              {adminInvites.map(inv => (
                <div className={styles.row} key={inv.id}>
                  <div>
                    <strong>{inv.name}</strong>
                    <small>{inv.email}</small>
                  </div>
                  <div className={styles.rowMeta}>
                    <span className={styles.badgePlatform}>Yönetici Daveti · Onay Bekliyor</span>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.removeButton}
                      disabled={busy}
                      onClick={() => revokeAdminInvitation(inv.id)}
                    >
                      Daveti İptal Et
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.adminSubSection}>
          <h3 className={styles.subTitle}>Klinik Yöneticileri ({clinicAdmins.length})</h3>
          <div className={styles.list}>
            {clinicAdmins.map(adm => (
              <div className={styles.row} key={adm.id}>
                <div>
                  <strong>{adm.name}</strong>
                  <small>{adm.email}{adm.phone ? ` · ${adm.phone}` : ''}</small>
                </div>
                <div className={styles.rowMeta}>
                  <span className={styles.badgePlatform}>
                    {adm.isPlatformAdmin ? 'Satışçı / Platform Hesabı' : 'Klinik Yöneticisi (Seed User)'}
                  </span>
                  <span className={adm.active ? styles.badgeActive : styles.badgeFrozen}>
                    {adm.active ? '● Aktif' : '❄ Donduruldu'}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  {adm.isPlatformAdmin ? (
                    <small>Satışçı ana hesabı (korumalı)</small>
                  ) : adm.active ? (
                    <button
                      type="button"
                      className={styles.removeButton}
                      disabled={busy}
                      onClick={() => setConfirmFreezeAdmin(adm)}
                    >
                      Yöneticiyi Dondur
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.button}
                      disabled={busy}
                      onClick={() => void executeAdminStatusChange(adm, true)}
                    >
                      Yöneticiyi Aktifleştir
                    </button>
                  )}
                </div>
              </div>
            ))}
            {clinicAdmins.length === 0 && (
              <div className={styles.empty}>Bu klinik için henüz atanmış bir yönetici bulunmuyor.</div>
            )}
          </div>
        </div>
      </section>
      <section className={styles.card}><h2 className={styles.title}>{clinic?.name} · Netgsm telefon</h2><p className={styles.description}>Netgsm paneline: {ints.connection.ip || 'IP yapılandırılmamış'} · {ints.connection.port} · {ints.connection.protocol}</p><div className={styles.setupGrid}><Field label="SIP kullanıcı adı"><input value={phone.username} onChange={e => setPhone(v => ({ ...v, username: e.target.value }))} /></Field><Field label="SIP parolası" help={phoneSaved ? 'Parola kayıtlıdır. Değiştirmek istemiyorsanız boş bırakın.' : 'Netgsm SIP parolasını girin.'}><input type="password" autoComplete="new-password" placeholder={phoneSaved ? 'Parola kayıtlı — değiştirmek için yazın' : 'SIP parolası'} value={phone.password} onChange={e => setPhone(v => ({ ...v, password: e.target.value }))} /></Field><Field label="Gelen numaralar" help="0850 sabit hat veya mobil numara girin. Örnek: +90 (850) 309 61 19."><PhoneList values={phone.numbers} canRemoveLast={ints.phone.configured} onRemoveLast={() => void run(() => removeIntegration('phone'))} onChange={numbers => setPhone(v => { const nextCaller = numbers.some(n => national(n) === national(v.callerId)) ? v.callerId : (numbers.find(Boolean) || ''); return { ...v, numbers, callerId: nextCaller } })} /></Field><Field label="Çıkış numarası" help="Gelen numaralardan biri olmalı; arayanlarda görünecek klinik hattıdır."><PhoneInput value={phone.callerId} onChange={callerId => setPhone(v => ({ ...v, callerId }))} /></Field><Field label="Aktarım numarası" help="Flow Builder hedefiyle aynı olmalı; 0850 veya mobil numara olabilir, zorunlu değildir."><PhoneInput value={phone.transferNumber} onChange={transferNumber => setPhone(v => ({ ...v, transferNumber }))} /></Field><Field label="Test numarası" help="Test araması yapılacak cep veya sabit telefon numarasını girin (+90 5XX... önerilir)."><PhoneInput value={phone.target} onChange={target => setPhone(v => ({ ...v, target }))} /></Field></div>{phoneFailedMsg && <DiagnosticAlert message={phoneFailedMsg} service="phone" />}<div className={styles.steps}><Step complete={ints.phone.configured} alwaysShowAction title="1. Bilgileri kaydedin" detail={phoneValid ? 'Ayarlar kaydedildi; değişiklik yaptıysanız tekrar kaydedebilir veya çağrı testini başlatabilirsiniz.' : 'Tüm telefon numaralarını eksiksiz girin.'} action={ints.phone.configured ? 'Güncelle / Kaydet' : 'Kaydet'} disabled={busy || !phoneValid} onClick={() => void run(() => save('phone', { ...phone, numbers: phone.numbers.map(e164), callerId: e164(phone.callerId), transferNumber: phone.transferNumber ? e164(phone.transferNumber) : '' }))} /><Step complete={Boolean(inbound?.status === 'confirmed')} title="2. Gelen çağrıyı test edin" detail={inbound?.status === 'accepted' ? '15 dakika içinde test telefonundan klinik hattını arayın. Bağlantı otomatik doğrulanır.' : 'Gelen çağrı testini başlatıp klinik hattını arayın.'} action={inbound?.status === 'accepted' ? 'Bağlantı bekleniyor' : 'Gelen çağrı testi başlat'} disabled={busy || inbound?.status === 'accepted' || !ints.phone.configured || !validPhone(phone.target)} onClick={() => void run(() => test('phone', phone.target, 'inbound'))} /><Step complete={Boolean(outbound?.status === 'confirmed')} title="3. Giden çağrıyı test edin" detail={outbound?.status === 'accepted' ? 'Telefonunuz çaldığında açın. Bağlantı otomatik doğrulanır.' : 'Klinik hattından test numarasına giden aramayı başlatın.'} action={outbound?.status === 'accepted' ? 'Bağlantı bekleniyor' : 'Giden çağrı testi başlat'} disabled={busy || outbound?.status === 'accepted' || !ints.phone.configured || !validPhone(phone.target)} onClick={() => void run(() => test('phone', phone.target, 'outbound'))} />{phone.transferNumber && <Step complete={Boolean(transfer?.status === 'confirmed')} title="4. Aktarımı test edin" detail={transfer?.status === 'accepted' ? 'Aktarım hedefi cevapladığında bağlantı otomatik doğrulanır.' : 'Canlı aktarım testini başlatın.'} action={transfer?.status === 'accepted' ? 'Bağlantı bekleniyor' : 'Aktarım testi başlat'} disabled={busy || transfer?.status === 'accepted' || !ints.phone.configured || !validPhone(phone.target)} onClick={() => void run(() => test('phone', phone.target, 'transfer'))} />}<Step complete={ints.phone.enabled} title="5. Telefonu etkinleştirin" detail={ints.phone.health === 'registered' ? 'SIP kaydı aktif; hattı canlı kullanıma açabilirsiniz.' : 'SIP kaydı veya test doğrulandıktan sonra canlı kullanımı açın.'} action="Etkinleştir" disabled={busy || ints.phone.enabled || !ints.phone.configured || (ints.phone.health !== 'registered' && !done(ints.phone, 'inbound') && !done(ints.phone, 'outbound'))} onClick={() => void run(() => toggle('phone'))} /></div>{ints.phone.configured && <div className={styles.actions}>{ints.phone.enabled && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void run(() => toggle('phone'))}>Hattı devre dışı bırak</button>}<button type="button" className={styles.removeButton} disabled={busy} onClick={() => void run(() => removeIntegration('phone'))}>Telefon bağlantısını kaldır (Numarayı boşa çıkar)</button></div>}</section>
      {(['sms', 'smtp'] as const).map(service => { const s = ints[service], delivery = current(s, 'delivery'), isSms = service === 'sms', configured = isSms ? Boolean(sms.username && (sms.password || smsSaved) && sms.senderId) : Boolean(smtp.host && smtp.port && smtp.username && (smtp.password || smtpSaved) && (smtp.fromAddress || smtp.username)), target = isSms ? sms.target : smtp.target; const showNatroHint = !isSms && (smtp.host.toLowerCase().includes('thinpine.com') || (smtp.host.toLowerCase().includes('natro') && smtp.port === '587')); return <section className={styles.card} key={service}><h2 className={styles.title}>{isSms ? 'SMS / Netgsm' : 'E-posta / SMTP'}</h2><div className={styles.setupGrid}>{isSms ? <><Field label="API kullanıcı kodu"><input value={sms.username} onChange={e => setSms(v => ({ ...v, username: e.target.value }))} /></Field><Field label="API parolası" help={smsSaved ? 'Parola kayıtlıdır. Değiştirmek istemiyorsanız boş bırakın.' : undefined}><input type="password" autoComplete="new-password" placeholder={smsSaved ? 'Parola kayıtlı — değiştirmek için yazın' : 'API parolası'} value={sms.password} onChange={e => setSms(v => ({ ...v, password: e.target.value }))} /></Field><Field label="Başlık"><input value={sms.senderId} onChange={e => setSms(v => ({ ...v, senderId: e.target.value }))} /></Field><Field label="Test alıcısı" help="Teslimatı doğrulamak için kendi cep telefonunuzu +90 (5__) ___ __ __ biçiminde girin."><PhoneInput value={sms.target} onChange={target => setSms(v => ({ ...v, target }))} /></Field></> : <><Field label="Sunucu" help="Natro için mx-out03.natrohost.com önerilir."><input value={smtp.host} onChange={e => setSmtp(v => ({ ...v, host: e.target.value }))} /></Field><Field label="Port" help="SSL için 465 (Önerilen), STARTTLS için 587."><input inputMode="numeric" value={smtp.port} onChange={e => { const port = e.target.value; setSmtp(v => ({ ...v, port, secure: port.trim() === '465' ? 'ssl' : 'tls' })) }} /></Field><Field label="Kullanıcı"><input value={smtp.username} onChange={e => setSmtp(v => ({ ...v, username: e.target.value, fromAddress: v.fromAddress || e.target.value }))} /></Field><Field label="Parola" help={smtpSaved ? 'Parola kayıtlıdır. Değiştirmek istemiyorsanız boş bırakın.' : undefined}><input type="password" autoComplete="new-password" placeholder={smtpSaved ? 'Parola kayıtlı — değiştirmek için yazın' : 'SMTP parolası'} value={smtp.password} onChange={e => setSmtp(v => ({ ...v, password: e.target.value }))} /></Field><Field label="Gönderici adı"><input value={smtp.fromName} onChange={e => setSmtp(v => ({ ...v, fromName: e.target.value }))} /></Field><Field label="Gönderici e-posta"><input type="email" value={smtp.fromAddress} onChange={e => setSmtp(v => ({ ...v, fromAddress: e.target.value }))} /></Field><Field label="Test alıcısı"><input type="email" value={smtp.target} onChange={e => setSmtp(v => ({ ...v, target: e.target.value }))} /></Field></>}</div>{showNatroHint && <div className={styles.hintBanner}><span>💡 <strong>Natro Kurumsal E-posta İpucu:</strong> <code>mail.thinpine.com</code> ve Port <code>587</code> paylaşımlı SSL/zaman aşımı nedeniyle takılabilir. Natro giden sunucusu <code>mx-out03.natrohost.com</code> ve Port <code>465 (SSL)</code> ile doğrudan çalışır.</span><button type="button" className={styles.quickFixButton} onClick={() => setSmtp(v => ({ ...v, host: 'mx-out03.natrohost.com', port: '465', secure: 'ssl', fromAddress: v.fromAddress || v.username }))}>⚡ Önerilen Ayarı Uygula (mx-out03.natrohost.com : 465)</button></div>}{delivery?.status === 'failed' && delivery.message && <DiagnosticAlert message={delivery.message} service={service} smtpState={!isSms ? smtp : undefined} onQuickFix={!isSms ? patch => { setSmtp(v => ({ ...v, ...patch })); setNotice('Önerilen SMTP ayarları forma uygulandı. "1. Bilgileri kaydedin → Kaydet" butonuna basıp tekrar test edin.') } : undefined} />}<div className={styles.steps}><Step complete={s.configured} alwaysShowAction title="1. Bilgileri kaydedin" detail="Bağlantı bilgilerini kaydedin veya güncelleyin." action={s.configured ? 'Güncelle / Kaydet' : 'Kaydet'} disabled={busy || !configured} onClick={() => void run(() => save(service, isSms ? sms : { ...smtp, port: Number(smtp.port), secure: Number(smtp.port) === 465 ? 'ssl' : 'tls', fromAddress: smtp.fromAddress || smtp.username }))} /><Step complete={Boolean(delivery?.status === 'confirmed')} title="2. Test gönderin ve doğrulayın" detail={delivery?.status === 'accepted' ? 'Mesajı/e-postayı aldıktan sonra doğrulayın.' : (delivery?.status === 'failed' ? 'Son test başarısız oldu; yukarıdaki çözüm önerisini inceleyip tekrar deneyin.' : 'Kaydedilen bilgilerle test gönderin.')} action={delivery?.status === 'accepted' ? 'Teslimatı doğrula' : 'Test gönder'} disabled={busy || !s.configured || (delivery?.status !== 'accepted' && (isSms ? !validMobile(target) : !/^\S+@\S+\.\S+$/.test(target)))} onClick={() => void run(() => delivery?.status === 'accepted' ? confirm(service, delivery.id) : test(service, target))} onCancel={delivery?.status === 'accepted' ? () => void run(() => cancelActiveTest(service, delivery.id)) : undefined} /><Step complete={s.enabled} title="3. Etkinleştirin" detail="Doğrulanan bağlantıyı canlı kullanıma açın." action="Etkinleştir" disabled={busy || s.enabled || !done(s, 'delivery')} onClick={() => void run(() => toggle(service))} /></div></section> })}
      <section className={styles.card}>
        <div className={styles.setupHeading}>
          <div>
            <h2 className={styles.title}>{clinic?.name} · WhatsApp Kurulumu</h2>
            <p className={styles.description}>
              Klinik telefon numarasını kaydedip karekod (QR) oluşturun; okutulduktan sonra gönderimleri etkinleştirin.
            </p>
          </div>
          <div className={styles.rowActions}>
            <span className={wa?.connectionState === 'open' ? styles.badgeActive : wa?.connectionState === 'connecting' ? styles.badgePlatform : styles.badgeFrozen}>
              {wa?.connectionState === 'open'
                ? (wa?.enabled ? '● Bağlı ve Gönderimler Aktif' : '● QR Bağlı (Etkinleştirme Bekliyor)')
                : wa?.connectionState === 'connecting'
                  ? '● Bağlanıyor…'
                  : '○ Bağlı Değil'}
            </span>
          </div>
        </div>
        <Field label="Klinik WhatsApp telefonu" help="WhatsApp hesabına bağlı cep telefonu: +90 (5__) ___ __ __. Boş bırakılırsa QR okutulduğunda bağlanan numara otomatik alınır.">
          <PhoneInput value={waPhone} onChange={setWaPhone} />
        </Field>
        <div className={styles.actions}>
          <button
            className={styles.button}
            disabled={busy || !validMobile(waPhone)}
            onClick={() => void run(async () => {
              if (!selected) return
              setWa(await api<Wa>(`/api/platform/clinics/${selected}/whatsapp`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expectedPhone: e164(waPhone) }),
              }))
              setNotice('Telefon kaydedildi. Şimdi "QR göster" butonuna basabilirsiniz.')
            })}
          >
            Telefonu kaydet
          </button>
          <button
            className={styles.button}
            disabled={busy}
            onClick={() => void run(async () => {
              if (!selected) return
              if (validMobile(waPhone) && e164(waPhone) !== wa?.expectedPhone) {
                const savedWa = await api<Wa>(`/api/platform/clinics/${selected}/whatsapp`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ expectedPhone: e164(waPhone) }),
                })
                setWa(savedWa)
              }
              const r = await api<{ clinic?: Wa; qrcode: string | null; connectionState?: string }>(
                `/api/platform/clinics/${selected}/whatsapp/connect`,
                { method: 'POST' },
              )
              if (r.clinic) setWa(r.clinic)
              setQr(r.qrcode)
              if (r.connectionState === 'open') {
                setNotice('WhatsApp zaten bağlı. Gönderimleri etkinleştirebilirsiniz.')
              } else if (r.qrcode) {
                setNotice('WhatsApp karekodu hazır. Klinik telefonundan okutun.')
              } else {
                setNotice('Bağlantı isteği gönderildi; durum kontrol ediliyor.')
              }
            })}
          >
            {qr ? 'QR yenile' : 'QR göster'}
          </button>
          <button
            className={styles.button}
            disabled={busy || wa?.connectionState !== 'open'}
            onClick={() => void run(async () => {
              if (!selected) return
              setWa(await api<Wa>(`/api/platform/clinics/${selected}/whatsapp/activate`, { method: 'POST' }))
              setNotice('WhatsApp etkinleştirildi.')
            })}
          >
            Gönderimleri etkinleştir
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={() => void run(async () => {
              if (!selected) return
              const refreshed = await api<Wa>(`/api/platform/clinics/${selected}/whatsapp`)
              setWa(refreshed)
              if (refreshed.expectedPhone) setWaPhone(national(refreshed.expectedPhone))
              if (refreshed.connectionState === 'open') setQr(null)
              setNotice('WhatsApp bağlantı durumu güncellendi.')
            })}
          >
            Durumu yenile
          </button>
          {Boolean(wa?.expectedPhone || waPhone) && (
            <button
              type="button"
              className={styles.removeButton}
              disabled={busy}
              onClick={() => void run(async () => {
                if (!selected) return
                setWa(await api<Wa>(`/api/platform/clinics/${selected}/whatsapp`, { method: 'DELETE' }))
                setWaPhone('')
                setQr(null)
                setNotice('Klinik WhatsApp numarası silindi.')
              })}
            >
              Numarayı sil
            </button>
          )}
        </div>
        {qr && (
          <div className={styles.qr}>
            <img src={qr} width={240} height={240} alt="WhatsApp QR" />
          </div>
        )}
      </section>
      <N8nMetaWhatsAppCard clinicId={selected} />
      <section className={styles.card}>
        <div className={styles.setupHeading}>
          <div>
            <h2 className={styles.title}>{clinic?.name} · Yapay Zeka API Anahtarı</h2>
            <p className={styles.description}>
              Her klinik kendine ait ayrı bir anahtar kullanmalıdır (1 anahtar = 1 klinik). Tanımlandığında sesli asistan, yazışma asistanı ve bilgi bankası işlemleri bu anahtarla çalışır; tanımlanmazsa ortak yedek anahtar kullanılır.
            </p>
          </div>
          <div className={styles.rowActions}>
            <span className={geminiKey?.source === 'clinic' ? styles.badgeActive : geminiKey?.source === 'shared' ? styles.badgePlatform : styles.badgeFrozen}>
              {geminiKey?.source === 'clinic'
                ? `● Kliniğe Özel Anahtar (••••${geminiKey.last4 || ''})`
                : geminiKey?.source === 'shared'
                ? '● Ortak Platform Anahtarı'
                : '⚠ Anahtar Tanımlı Değil'}
            </span>
          </div>
        </div>
        {geminiKey?.conflict && <div className={styles.error}>Bu anahtar başka bir klinikle çakışıyor, lütfen yeni anahtar tanımlayın.</div>}
        <Field
          label="Yapay Zeka API Anahtarı"
          help={
            geminiKey?.configured
              ? `Kayıtlı anahtar: ••••${geminiKey.last4 || ''}${geminiKey.updatedAt ? ` · Son güncelleme: ${new Date(geminiKey.updatedAt).toLocaleString('tr-TR')}` : ''}. Değiştirmek istemiyorsanız boş bırakabilirsiniz.`
              : 'Yapay zeka hizmet sağlayıcısından alınan API anahtarını girin.'
          }
        >
          <input
            type="password"
            autoComplete="new-password"
            placeholder={geminiKey?.configured ? `Kayıtlı (••••${geminiKey.last4 || ''}) — değiştirmek için yeni anahtar yazın` : 'AIzaSy...'}
            value={geminiKeyInput}
            onChange={e => setGeminiKeyInput(e.target.value)}
          />
        </Field>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            disabled={busy || geminiKeyInput.trim().length < 20}
            onClick={() => void run(async () => {
              if (!selected) return
              const saved = await api<{ ok: boolean; configured: boolean; source: 'clinic'; last4: string | null; updatedAt: string | null }>(`/api/platform/clinics/${selected}/gemini-key`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: geminiKeyInput.trim() }),
              })
              setGeminiKey({ configured: saved.configured, source: saved.source, last4: saved.last4, updatedAt: saved.updatedAt })
              setGeminiKeyInput('')
              setNotice('Kliniğe özel API anahtarı doğrulandı ve kaydedildi.')
            })}
          >
            Anahtarı doğrula ve kaydet
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy || (!geminiKeyInput.trim() && !geminiKey?.configured && geminiKey?.source === 'missing')}
            onClick={() => void run(async () => {
              if (!selected) return
              const res = await api<{ ok: boolean; latencyMs: number; source: 'clinic' | 'shared' | 'input' }>(`/api/platform/clinics/${selected}/gemini-key/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiKeyInput.trim() ? { apiKey: geminiKeyInput.trim() } : {}),
              })
              setNotice(`API anahtarı testi başarılı (${res.latencyMs} ms).`)
            })}
          >
            Anahtarı test et
          </button>
          {geminiKey?.configured && (
            <button
              type="button"
              className={styles.removeButton}
              disabled={busy}
              onClick={() => setConfirmRemoveKey(true)}
            >
              Özel anahtarı kaldır
            </button>
          )}
        </div>
      </section>
    </>}
    <PlatformSystemPrompts clinics={clinics} />
    {confirmRemoveKey && (
      <ConfirmModal
        isOpen={true}
        title="Özel Anahtarı Kaldır"
        message="Kliniğe özel anahtar kaldırılacak. Bu klinik, yeni anahtar tanımlanana kadar ortak yedek anahtarla çalışır."
        confirmText="Evet, Kaldır"
        cancelText="Vazgeç"
        variant="warning"
        onConfirm={() => void run(async () => {
          if (!selected) return
          const next = await api<GeminiKeyInfo>(`/api/platform/clinics/${selected}/gemini-key`, { method: 'DELETE' })
          setGeminiKey(next)
          setGeminiKeyInput('')
          setConfirmRemoveKey(false)
          setNotice('Kliniğe özel anahtar kaldırıldı; klinik ortak yedek anahtarla çalışıyor.')
        })}
        onClose={() => setConfirmRemoveKey(false)}
      />
    )}
    {confirmFreezeClinic && (
      <ConfirmModal
        isOpen={true}
        title="Kliniği Dondur"
        message={`"${confirmFreezeClinic.name}" (${confirmFreezeClinic.hostname}) kliniğini dondurmak istediğinize emin misiniz? Klinik dondurulduğunda o kliniğe bağlı yönetici, hekim ve personellerin aktif oturumları kapatılır ve klinik tekrar aktifleştirilene kadar sisteme giriş yapamazlar.`}
        confirmText="Evet, Kliniği Dondur"
        cancelText="Vazgeç"
        variant="danger"
        onConfirm={() => void executeClinicStatusChange(confirmFreezeClinic, false)}
        onClose={() => setConfirmFreezeClinic(null)}
      />
    )}
    {confirmFreezeAdmin && (
      <ConfirmModal
        isOpen={true}
        title="Klinik Yöneticisini (Seed User) Dondur"
        message={`"${confirmFreezeAdmin.name}" (${confirmFreezeAdmin.email}) yönetici hesabını dondurmak istediğinize emin misiniz? Yöneticinin aktif oturumları derhal sonlandırılır ve tekrar aktifleştirilene kadar panele giriş yapamaz.`}
        confirmText="Evet, Yöneticiyi Dondur"
        cancelText="Vazgeç"
        variant="warning"
        onConfirm={() => void executeAdminStatusChange(confirmFreezeAdmin, false)}
        onClose={() => setConfirmFreezeAdmin(null)}
      />
    )}
  </div>
}
