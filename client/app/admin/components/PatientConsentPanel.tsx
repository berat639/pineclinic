import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, FileText, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { consentAllows, NOTIFICATION_CHANNELS, notificationLabels as labels, type NotificationChannel } from '../../../lib/notification-channels'
import PlanDialog from './PlanDialog'
import styles from './PineTreatmentPlan.module.css'

type Delivery = Exclude<NotificationChannel, 'assistant_call'>
type Contact = { phone: string | null; email: string | null }
type ConsentState = { patient: Contact & { smsOptOut: boolean; whatsappOptOut: boolean; emailOptOut: boolean }; preferences: { channel: string; status: string; textVersion: string }[]; requests: { id: string; status: string; deliveryChannel: string }[] }
type Settings = { text: string; version: string | null; canEdit: boolean }
type Props = {
  patientId: string
  compact?: boolean
  selectedChannels?: NotificationChannel[]
  onChannelsChange?: (channels: NotificationChannel[]) => void
  onContactChange?: (contact: Contact) => void
  periodic?: boolean
  periodDays?: number
  onOpenReminder?: () => void
}

function ChannelIcon({ channel }: { channel: NotificationChannel }) {
  if (channel === 'sms') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--pc-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M16 10h.01" />
      </svg>
    )
  }
  if (channel === 'whatsapp') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
        <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
      </svg>
    )
  }
  if (channel === 'email') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--pc-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    )
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--pc-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

export default function PatientConsentPanel({ patientId, compact, selectedChannels = [], onChannelsChange, onContactChange, periodic, periodDays, onOpenReminder }: Props) {
  const [consent, setConsent] = useState<ConsentState | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [delivery, setDelivery] = useState<Delivery>('sms')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<'text' | 'contact' | null>(null)
  const [formText, setFormText] = useState('')
  const [contact, setContact] = useState<Contact>({ phone: '', email: '' })
  const [pendingChannel, setPendingChannel] = useState<NotificationChannel | null>(null)
  const [error, setError] = useState('')
  const [dialogError, setDialogError] = useState('')
  const requestKey = useRef<string | null>(null)
  const pending = useRef(false)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const responses = await Promise.all([
        fetch(`/api/dental/patients/${patientId}/consent`, { cache: 'no-store', signal }),
        fetch('/api/dental/consent-settings', { cache: 'no-store', signal }),
      ])
      if (responses.some(response => !response.ok)) throw new Error('Bildirim izinleri yüklenemedi.')
      const [nextConsent, nextSettings] = await Promise.all(responses.map(response => response.json()))
      if (signal?.aborted) return
      setConsent(nextConsent); setSettings(nextSettings); setError('')
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Bildirim izinleri yüklenemedi.') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [patientId])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setConsent(null); requestKey.current = null
    void refresh(controller.signal)
    const onFocus = () => { void refresh(controller.signal) }
    window.addEventListener('focus', onFocus)
    return () => { controller.abort(); window.removeEventListener('focus', onFocus) }
  }, [refresh])
  const allowed = NOTIFICATION_CHANNELS.filter(channel => consent && consentAllows(channel, consent.preferences, settings?.version, consent.patient))
  const blocked = (channel: Delivery) => !!consent && (
    (channel === 'sms' && consent.patient.smsOptOut) || (channel === 'whatsapp' && consent.patient.whatsappOptOut) || (channel === 'email' && consent.patient.emailOptOut) ||
    consent.preferences.some(item => item.channel === channel && ['refused', 'revoked'].includes(item.status)))
  const missingContact = (channel: NotificationChannel, state = consent) => channel === 'email' ? !state?.patient.email?.trim() : !state?.patient.phone?.trim()
  const openContact = (channel: NotificationChannel) => {
    setPendingChannel(channel); setContact({ phone: consent?.patient.phone || '', email: consent?.patient.email || '' }); setDialogError(''); setDialog('contact')
  }
  async function send() {
    if (pending.current || blocked(delivery)) return
    if (missingContact(delivery)) { openContact(delivery); return }
    pending.current = true; setBusy(true); requestKey.current ||= crypto.randomUUID()
    try {
      const response = await fetch(`/api/dental/patients/${patientId}/consent-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliveryChannel: delivery, requestKey: requestKey.current }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) { requestKey.current = null; throw new Error(result.error || 'Form gönderilemedi.') }
      if (!['sent', 'responded'].includes(result.status)) throw new Error('Gönderim doğrulanamadı. Yeniden kontrol edin.')
      requestKey.current = null; toast.success('Form gönderildi; hasta yanıtı bekleniyor.'); await refresh()
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Form gönderilemedi.') }
    finally { pending.current = false; setBusy(false) }
  }
  async function approveInClinic() {
    if (pending.current) return
    pending.current = true; setBusy(true); setDialogError('')
    try {
      const response = await fetch(`/api/dental/patients/${patientId}/consent-in-clinic`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Klinik içi onam kaydedilemedi.')
      await refresh()
      if (!selectedChannels.length && onChannelsChange) {
        const defaultChannel: NotificationChannel = consent?.patient.phone?.trim() ? 'sms' : consent?.patient.email?.trim() ? 'email' : 'sms'
        onChannelsChange([defaultChannel])
      }
      setDialog(null)
      toast.success('Hasta bildirim onamı klinikte onaylandı.')
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : 'Klinik içi onam kaydedilemedi.')
    } finally {
      pending.current = false; setBusy(false)
    }
  }
  async function saveDialog(event: React.FormEvent) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true; setBusy(true); setDialogError('')
    try {
      const editingText = dialog === 'text'
      const response = await fetch(editingText ? '/api/dental/consent-settings' : `/api/dental/patients/${patientId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingText ? { text: formText } : { phone: contact.phone?.trim() || null, email: contact.email?.trim() || null }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Kaydedilemedi.')
      if (!editingText) {
        onContactChange?.({ phone: contact.phone?.trim() || null, email: contact.email?.trim() || null })
        if (pendingChannel && allowed.includes(pendingChannel) && !selectedChannels.includes(pendingChannel)) onChannelsChange?.([...selectedChannels, pendingChannel])
      }
      await refresh(); setDialog(null); setPendingChannel(null)
      toast.success(editingText ? 'Onam metni kaydedildi.' : 'İletişim bilgileri kaydedildi.')
    } catch (reason) { setDialogError(reason instanceof Error ? reason.message : 'Kaydedilemedi.') }
    finally { pending.current = false; setBusy(false) }
  }
  const closeDialog = () => { if (!busy) { setDialog(null); setPendingChannel(null) } }
  return <section className={`${styles.consent} ${!compact ? styles.consentStacked : ''}`} aria-label="Hasta bildirimleri">
    <div className={styles.consentRow}>
    {onOpenReminder && (
      <button
        type="button"
        className={`${styles.button} ${periodic ? styles.pale : ''} ${styles.consentReminderBtn}`}
        onClick={onOpenReminder}
        title="Periyodik kontrol hatırlatması ayarla"
      >
        <Bell size={14} />
        <span>{periodic ? `Hatırlatma · ${periodDays} gün` : 'Hatırlatma'}</span>
      </button>
    )}
    <div className={styles.consentTitle}><ShieldCheck size={15} /><strong>{allowed.length ? 'Bildirim yöntemi' : 'Bildirim onamı'}</strong>
      {!allowed.length && <span>{loading ? 'Yükleniyor…' : error ? 'Yüklenemedi' : consent?.requests[0]?.status === 'sent' ? 'Yanıt bekleniyor' : 'Onam yok'}</span>}
    </div>
    {error ? <div role="alert" className={styles.consentActions}>{error}<button type="button" className={styles.button} onClick={() => void refresh()}>Yeniden dene</button></div> : allowed.length ?
      <div className={styles.consentActions} role="group" aria-label="Bildirim yöntemleri (birden fazla seçilebilir)">
        {NOTIFICATION_CHANNELS.map(channel => <label key={channel} className={styles.consentPill} title={allowed.includes(channel) ? labels[channel] : 'Bu kanal için hasta izni bulunmuyor'}>
          <input type="checkbox" disabled={busy || !allowed.includes(channel) || !onChannelsChange} checked={allowed.includes(channel) && selectedChannels.includes(channel)} onChange={event => {
            if (event.target.checked && missingContact(channel)) { openContact(channel); return }
            onChannelsChange?.(event.target.checked ? [...selectedChannels, channel] : selectedChannels.filter(value => value !== channel))
          }} /><ChannelIcon channel={channel} />{labels[channel]}
        </label>)}
      </div> : <div className={styles.consentActions}>
        <select className={styles.select} aria-label="Onam formu gönderim kanalı" disabled={busy || loading} value={delivery} onChange={event => {
          const nextDelivery = event.target.value as Delivery
          setDelivery(nextDelivery)
          requestKey.current = null
          if (consent && missingContact(nextDelivery, consent)) openContact(nextDelivery)
        }}>
          {(['sms', 'whatsapp', 'email'] as const).map(channel => <option key={channel} value={channel} disabled={blocked(channel)}>{labels[channel]}{blocked(channel) ? ' · İletişim kapalı' : ''}</option>)}
        </select>
        <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy || loading || blocked(delivery)} onClick={() => void send()}><Send size={13} />{busy ? 'Gönderiliyor…' : 'Form gönder'}</button>
      </div>}
      <button type="button" className={styles.consentTextButton} disabled={loading || !!error} onClick={() => { setFormText(settings?.text || ''); setDialogError(''); setDialog('text') }}><FileText size={13} />Onam metni</button>
    </div>
    {dialog && <PlanDialog title={dialog === 'text' ? 'Bildirim onam metni' : 'Hasta kaydını güncelle'} onClose={closeDialog}>
      <form onSubmit={saveDialog}>
        {dialog === 'text' ? <>
          <p className={styles.dialogDescription}>Hasta bu metni okuyarak kanallar için ayrı ayrı izin verir. Form göndermek izin verildiği anlamına gelmez.</p>
          <label htmlFor="notification-consent-text">Onam metni</label>
          <textarea id="notification-consent-text" className={styles.textarea} rows={8} required minLength={20} maxLength={10000} readOnly={!settings?.canEdit} value={formText} onChange={event => setFormText(event.target.value)} />
          <p className={styles.dialogDescription}>{settings?.canEdit ? 'Metin değişirse mevcut izinler yeni metin için yenilenmelidir.' : 'Metni klinik yöneticisi düzenleyebilir.'}</p>
        </> : <>
          <p className={styles.dialogDescription}>{pendingChannel === 'email' ? 'E-posta bildirimi için hastanın e-posta adresi kayıtlı değil. Hasta kaydını güncelleyin.' : `${pendingChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} bildirimi için hastanın cep telefonu numarası kayıtlı değil. Hasta kaydını güncelleyin.`}</p>
          <label htmlFor="consent-phone">Cep telefonu numarası</label><input id="consent-phone" autoFocus={pendingChannel !== 'email'} className={styles.input} type="tel" autoComplete="tel" placeholder="05XX XXX XX XX" pattern="[+0-9 ()-]{10,20}" required={pendingChannel !== 'email'} value={contact.phone || ''} onChange={event => setContact({ ...contact, phone: event.target.value })} />
          <label htmlFor="consent-email">E-posta adresi</label><input id="consent-email" autoFocus={pendingChannel === 'email'} className={styles.input} type="email" autoComplete="email" placeholder="ornek@eposta.com" required={pendingChannel === 'email'} value={contact.email || ''} onChange={event => setContact({ ...contact, email: event.target.value })} />
        </>}
        {dialogError && <p role="alert">{dialogError}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={busy} onClick={closeDialog}>Kapat</button>
          {dialog === 'text' && !allowed.length && (
            <button type="button" className={`${styles.button} ${styles.pale}`} disabled={busy} onClick={() => void approveInClinic()}>
              <ShieldCheck size={14} />
              <span>{busy ? 'Onaylanıyor…' : 'Klinikte Onaylandı Olarak İşaretle'}</span>
            </button>
          )}
          {(dialog !== 'text' || settings?.canEdit) && <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>}
        </div>
      </form>
    </PlanDialog>}
  </section>
}
