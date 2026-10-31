import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, FileText, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { consentAllows, NOTIFICATION_CHANNELS, notificationLabels as labels, type NotificationChannel } from '../../../lib/notification-channels'
import { PhoneMaskedInput } from '@/lib/phone-mask'
import PlanDialog from './PlanDialog'
import styles from './PineTreatmentPlan.module.css'

type Delivery = Exclude<NotificationChannel, 'assistant_call'>
type Contact = { phone: string | null; email: string | null }
type OptOutState = { smsOptOut: boolean; emailOptOut: boolean; whatsappOptOut: boolean }
type UnsavedContact = {
  phone?: string | null
  email?: string | null
  smsOptOut?: boolean
  emailOptOut?: boolean
  whatsappOptOut?: boolean
}
type ConsentState = { patient: Contact & { smsOptOut: boolean; whatsappOptOut: boolean; emailOptOut: boolean }; preferences: { channel: string; status: string; textVersion: string }[]; requests: { id: string; status: string; deliveryChannel: string }[] }
type Settings = { text: string; version: string | null; canEdit: boolean; canManageConsent?: boolean }
type Props = {
  patientId: string
  compact?: boolean
  selectedChannels?: NotificationChannel[]
  onChannelsChange?: (channels: NotificationChannel[]) => void
  onContactChange?: (contact: Contact) => void
  onConsentChange?: (optOuts: OptOutState) => void
  unsavedContact?: UnsavedContact
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

export default function PatientConsentPanel({ patientId, compact, selectedChannels = [], onChannelsChange, onContactChange, onConsentChange, unsavedContact, periodic, periodDays, onOpenReminder }: Props) {
  const [consent, setConsent] = useState<ConsentState | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [delivery, setDelivery] = useState<Delivery>('sms')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<'text' | 'contact' | null>(null)
  const [formText, setFormText] = useState('')
  const [dialogChannels, setDialogChannels] = useState<NotificationChannel[]>([...NOTIFICATION_CHANNELS])
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
  const effectivePatient = consent ? {
    ...consent.patient,
    phone: unsavedContact?.phone !== undefined ? unsavedContact.phone : consent.patient.phone,
    email: unsavedContact?.email !== undefined ? unsavedContact.email : consent.patient.email,
    smsOptOut: unsavedContact?.smsOptOut !== undefined ? unsavedContact.smsOptOut : consent.patient.smsOptOut,
    emailOptOut: unsavedContact?.emailOptOut !== undefined ? unsavedContact.emailOptOut : consent.patient.emailOptOut,
    whatsappOptOut: unsavedContact?.whatsappOptOut !== undefined ? unsavedContact.whatsappOptOut : consent.patient.whatsappOptOut,
  } : null
  const allowed = NOTIFICATION_CHANNELS.filter(channel => consent && effectivePatient && consentAllows(channel, consent.preferences, settings?.version, effectivePatient))
  const canManageConsent = settings ? settings.canManageConsent !== false : true
  const blocked = (channel: Delivery) => !!effectivePatient && (
    (channel === 'sms' && effectivePatient.smsOptOut) || (channel === 'whatsapp' && effectivePatient.whatsappOptOut) || (channel === 'email' && effectivePatient.emailOptOut) ||
    (!unsavedContact && !!consent && consent.preferences.some(item => item.channel === channel && ['refused', 'revoked'].includes(item.status))))
  const missingContact = (channel: NotificationChannel, state = consent) => {
    if (channel === 'assistant_call') {
      const phoneVal = unsavedContact?.phone !== undefined ? unsavedContact.phone : state?.patient.phone
      return !phoneVal?.trim()
    }
    const phoneVal = unsavedContact?.phone !== undefined ? unsavedContact.phone : state?.patient.phone
    const emailVal = unsavedContact?.email !== undefined ? unsavedContact.email : state?.patient.email
    return channel === 'email' ? !emailVal?.trim() : !phoneVal?.trim()
  }
  const openContact = (channel: NotificationChannel) => {
    setPendingChannel(channel)
    setContact({
      phone: (unsavedContact?.phone !== undefined ? unsavedContact.phone : consent?.patient.phone) || '',
      email: (unsavedContact?.email !== undefined ? unsavedContact.email : consent?.patient.email) || '',
    })
    setDialogError('')
    setDialog('contact')
  }
  async function syncUnsavedIfNeeded() {
    if (!unsavedContact || !consent) return
    const nextPhone = unsavedContact.phone?.trim() || null
    const nextEmail = unsavedContact.email?.trim() || null
    const needsSync =
      (unsavedContact.phone !== undefined && nextPhone !== (consent.patient.phone?.trim() || null)) ||
      (unsavedContact.email !== undefined && nextEmail !== (consent.patient.email?.trim() || null)) ||
      (unsavedContact.smsOptOut !== undefined && unsavedContact.smsOptOut !== consent.patient.smsOptOut) ||
      (unsavedContact.emailOptOut !== undefined && unsavedContact.emailOptOut !== consent.patient.emailOptOut) ||
      (unsavedContact.whatsappOptOut !== undefined && unsavedContact.whatsappOptOut !== consent.patient.whatsappOptOut)
    if (!needsSync) return
    const res = await fetch(`/api/dental/patients/${patientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(unsavedContact.phone !== undefined ? { phone: nextPhone } : {}),
        ...(unsavedContact.email !== undefined ? { email: nextEmail } : {}),
        ...(unsavedContact.smsOptOut !== undefined ? { smsOptOut: unsavedContact.smsOptOut } : {}),
        ...(unsavedContact.emailOptOut !== undefined ? { emailOptOut: unsavedContact.emailOptOut } : {}),
        ...(unsavedContact.whatsappOptOut !== undefined ? { whatsappOptOut: unsavedContact.whatsappOptOut } : {}),
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Hasta iletişim bilgileri güncellenemedi.')
    }
  }
  async function send() {
    if (pending.current || blocked(delivery)) return
    if (missingContact(delivery)) { openContact(delivery); return }
    pending.current = true; setBusy(true); requestKey.current ||= crypto.randomUUID()
    try {
      await syncUnsavedIfNeeded()
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
  async function saveClinicConsent(nextChannels: NotificationChannel[], closeOnSuccess = false) {
    if (pending.current) return
    pending.current = true; setBusy(true); setDialogError('')
    try {
      await syncUnsavedIfNeeded()
      const response = await fetch(`/api/dental/patients/${patientId}/consent-in-clinic`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels: nextChannels }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Klinik içi onam kaydedilemedi.')
      await refresh()
      onConsentChange?.({
        smsOptOut: !nextChannels.includes('sms'),
        emailOptOut: !nextChannels.includes('email'),
        whatsappOptOut: !nextChannels.includes('whatsapp'),
      })
      if (onChannelsChange) {
        const filteredSelected = selectedChannels.filter(ch => nextChannels.includes(ch))
        if (filteredSelected.length > 0) {
          onChannelsChange(filteredSelected)
        } else if (nextChannels.length > 0) {
          const preferred: NotificationChannel = nextChannels.includes('sms') && effectivePatient?.phone?.trim()
            ? 'sms'
            : nextChannels.includes('email') && effectivePatient?.email?.trim()
            ? 'email'
            : nextChannels[0]
          onChannelsChange([preferred])
        } else {
          onChannelsChange([])
        }
      }
      if (closeOnSuccess) setDialog(null)
      toast.success(nextChannels.length > 0 ? 'Hasta bildirim izinleri güncellendi.' : 'Hasta bildirim onamı kaldırıldı.')
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : 'Klinik içi onam kaydedilemedi.'
      if (dialog) setDialogError(msg)
      else toast.error(msg)
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
      const targetChannel = pendingChannel
      if (!editingText) {
        onContactChange?.({ phone: contact.phone?.trim() || null, email: contact.email?.trim() || null })
      }
      await refresh(); setDialog(null); setPendingChannel(null)
      toast.success(editingText ? 'Onam metni kaydedildi.' : 'İletişim bilgileri kaydedildi.')
      if (!editingText && targetChannel) {
        if (!allowed.includes(targetChannel) && canManageConsent) {
          pending.current = false
          const nextAllowed = Array.from(new Set([...allowed, targetChannel]))
          await saveClinicConsent(nextAllowed)
          if (onChannelsChange && !selectedChannels.includes(targetChannel)) {
            onChannelsChange([...selectedChannels, targetChannel])
          }
          return
        }
        if (allowed.includes(targetChannel) && !selectedChannels.includes(targetChannel)) {
          onChannelsChange?.([...selectedChannels, targetChannel])
        }
      }
    } catch (reason) { setDialogError(reason instanceof Error ? reason.message : 'Kaydedilemedi.') }
    finally { pending.current = false; setBusy(false) }
  }
  const openTextDialog = () => {
    setFormText(settings?.text || '')
    setDialogChannels(allowed.length > 0 ? [...allowed] : [...NOTIFICATION_CHANNELS])
    setDialogError('')
    setDialog('text')
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
    {error ? <div role="alert" className={styles.consentActions}>{error}<button type="button" className={styles.button} onClick={() => void refresh()}>Yeniden dene</button></div> : loading ? null : allowed.length > 0 ?
      <div className={styles.consentActions} role="group" aria-label="Bildirim yöntemleri (birden fazla seçilebilir)">
        {NOTIFICATION_CHANNELS.map(channel => {
          const isAllowed = allowed.includes(channel)
          const isChecked = onChannelsChange ? (isAllowed && selectedChannels.includes(channel)) : isAllowed
          const isDisabled = busy || (!isAllowed && !canManageConsent) || (!onChannelsChange && !canManageConsent)
          return (
            <label key={channel} className={styles.consentPill} title={isAllowed ? labels[channel] : (canManageConsent ? `${labels[channel]} iznini aktif et` : 'Bu kanal için hasta izni bulunmuyor')}>
              <input
                type="checkbox"
                disabled={isDisabled}
                checked={isChecked}
                onChange={event => {
                  const checked = event.target.checked
                  if (checked && missingContact(channel)) { openContact(channel); return }
                  if (!onChannelsChange) {
                    const nextAllowed = checked
                      ? Array.from(new Set([...allowed, channel]))
                      : allowed.filter(value => value !== channel)
                    void saveClinicConsent(nextAllowed)
                    return
                  }
                  if (checked && !isAllowed && canManageConsent) {
                    const nextAllowed = Array.from(new Set([...allowed, channel]))
                    void saveClinicConsent(nextAllowed)
                    onChannelsChange(Array.from(new Set([...selectedChannels, channel])))
                    return
                  }
                  onChannelsChange(checked ? Array.from(new Set([...selectedChannels, channel])) : selectedChannels.filter(value => value !== channel))
                }}
              />
              <ChannelIcon channel={channel} />{labels[channel]}
            </label>
          )
        })}
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
      <button type="button" className={styles.consentTextButton} disabled={loading || !!error} onClick={openTextDialog}><FileText size={13} />Onam metni</button>
    </div>
    {dialog && <PlanDialog title={dialog === 'text' ? 'Bildirim onam metni ve izinler' : 'Hasta kaydını güncelle'} onClose={closeDialog}>
      <form onSubmit={saveDialog}>
        {dialog === 'text' ? <>
          <p className={styles.dialogDescription}>Hasta bu metni okuyarak kanallar için ayrı ayrı izin verir. Yetkili personel klinik içinde alınan onam tercihlerini aşağıdan güncelleyebilir.</p>
          {canManageConsent && (
            <div style={{ padding: '12px', borderRadius: 10, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.82rem', color: 'var(--foreground, #ffffff)' }}>Klinik İçi Kanal Onam İzinleri (Yetkili Düzenleme)</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className={styles.button}
                    style={{ minHeight: 26, padding: '3px 8px', fontSize: '0.72rem' }}
                    disabled={busy}
                    onClick={() => setDialogChannels([...NOTIFICATION_CHANNELS])}
                  >
                    Tümünü Seç
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    style={{ minHeight: 26, padding: '3px 8px', fontSize: '0.72rem' }}
                    disabled={busy}
                    onClick={() => setDialogChannels([])}
                  >
                    Tümünü Kaldır
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {NOTIFICATION_CHANNELS.map(channel => {
                  const checked = dialogChannels.includes(channel)
                  return (
                    <label key={channel} className={styles.consentPill}>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={checked}
                        onChange={event => {
                          setDialogChannels(prev =>
                            event.target.checked
                              ? Array.from(new Set([...prev, channel]))
                              : prev.filter(item => item !== channel)
                          )
                        }}
                      />
                      <ChannelIcon channel={channel} />
                      {labels[channel]}
                    </label>
                  )
                })}
              </div>
            </div>
          )}
          <label htmlFor="notification-consent-text">Onam metni</label>
          <textarea id="notification-consent-text" className={styles.textarea} rows={7} required minLength={20} maxLength={10000} readOnly={!settings?.canEdit} value={formText} onChange={event => setFormText(event.target.value)} />
          <p className={styles.dialogDescription}>{settings?.canEdit ? 'Metin değişirse mevcut izinler yeni metin için yenilenmelidir.' : 'Metni klinik yöneticisi düzenleyebilir.'}</p>
        </> : <>
          <p className={styles.dialogDescription}>{pendingChannel === 'email' ? 'E-posta bildirimi için hastanın e-posta adresi kayıtlı değil. Hasta kaydını güncelleyin.' : `${pendingChannel === 'whatsapp' ? 'WhatsApp' : pendingChannel === 'assistant_call' ? 'Asistan araması' : 'SMS'} bildirimi için hastanın cep telefonu numarası kayıtlı değil. Hasta kaydını güncelleyin.`}</p>
          <label htmlFor="consent-phone">Cep telefonu numarası</label><PhoneMaskedInput id="consent-phone" autoFocus={pendingChannel !== 'email'} className={styles.input} placeholder="0 (5XX) XXX XX XX" pattern="[+0-9 ()-]{10,20}" required={pendingChannel !== 'email'} value={contact.phone || ''} onValueChange={phone => setContact({ ...contact, phone })} />
          <label htmlFor="consent-email">E-posta adresi</label><input id="consent-email" autoFocus={pendingChannel === 'email'} className={styles.input} type="email" autoComplete="email" placeholder="ornek@eposta.com" required={pendingChannel === 'email'} value={contact.email || ''} onChange={event => setContact({ ...contact, email: event.target.value })} />
        </>}
        {dialogError && <p role="alert">{dialogError}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={busy} onClick={closeDialog}>Kapat</button>
          {dialog === 'text' && canManageConsent && (
            <button type="button" className={`${styles.button} ${styles.pale}`} disabled={busy} onClick={() => void saveClinicConsent(dialogChannels, true)}>
              <ShieldCheck size={14} />
              <span>{busy ? 'Kaydediliyor…' : allowed.length > 0 ? 'Onam İzinlerini Güncelle' : 'Klinikte Onaylandı Olarak İşaretle'}</span>
            </button>
          )}
          {(dialog !== 'text' || settings?.canEdit) && <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy}>{busy ? 'Kaydediliyor…' : (dialog === 'text' ? 'Metni Kaydet' : 'Kaydet')}</button>}
        </div>
      </form>
    </PlanDialog>}
  </section>
}
