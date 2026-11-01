'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import styles from './page.module.css'

type AppointmentInfo = {
  clinicName: string
  patientName: string
  doctorName: string | null
  doctorSpecialty: string | null
  startTime: string
  endTime: string
  status: string
  timeConfirmed: boolean
  patientResponseStatus: string | null
  patientResponseNote: string | null
  patientPreferredDate: string | null
  patientRespondedAt: string | null
  treatments: { procedureName: string; toothNumber: string | null }[]
}

export default function PublicAppointmentResponsePage() {
  const params = useParams<{ token: string }>()
  const [info, setInfo] = useState<AppointmentInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeMode, setActiveMode] = useState<'none' | 'postpone' | 'cancel'>('none')
  const [preferredDate, setPreferredDate] = useState('')
  const [note, setNote] = useState('')
  const [doneMessage, setDoneMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/public/appointment/${encodeURIComponent(params.token)}`, {
      signal: controller.signal,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Randevu bilgisi alınamadı.')
        setInfo(data)
      })
      .catch(err => {
        if (err.name !== 'AbortError') setError(err.message || 'Randevu bilgisi alınamadı.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [params.token])

  async function submitAction(action: 'confirm' | 'postpone' | 'cancel') {
    if (saving) return
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/public/appointment/${encodeURIComponent(params.token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          preferredDate: action === 'postpone' ? preferredDate : undefined,
          note: note.trim() || undefined,
        }),
        referrerPolicy: 'no-referrer',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Yanıtınız kaydedilemedi.')
      setInfo(prev =>
        prev
          ? {
              ...prev,
              status: data.status,
              patientResponseStatus: data.patientResponseStatus,
              patientResponseNote: note.trim() || prev.patientResponseNote,
              patientPreferredDate: action === 'postpone' ? preferredDate : prev.patientPreferredDate,
            }
          : prev,
      )
      setActiveMode('none')
      setDoneMessage(
        action === 'confirm'
          ? '✅ Randevunuza geleceğiniz onaylandı ve klinik takvimine işlendi. Teşekkür ederiz!'
          : action === 'postpone'
            ? '📅 Tarih değişikliği (erteleme) talebiniz kliniğimize iletildi. Ekibimiz yeni randevu saati için sizinle iletişime geçecektir.'
            : '❌ Randevuya gelemeyeceğiniz kliniğimize bildirildi ve randevu saatiniz iptal edildi.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yanıtınız kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  const formattedDate = info
    ? new Date(info.startTime).toLocaleDateString('tr-TR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''
  const formattedTime = info
    ? `${new Date(info.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - ${new Date(info.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
    : ''

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="appt-title">
        {loading ? (
          <p role="status">Randevu bilgileri yükleniyor…</p>
        ) : !info ? (
          <div className={styles.error} role="alert">
            {error || 'Randevu bağlantısı bulunamadı.'}
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <div>
                <h1 id="appt-title" className={styles.title}>
                  Randevu Durumu ve Onay
                </h1>
                <p className={styles.subtitle}>Sayın {info.patientName}, randevu detaylarınız aşağıdadır.</p>
              </div>
              <span className={styles.clinicBadge}>🏥 {info.clinicName}</span>
            </div>

            <div className={styles.detailsBox}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Tarih</span>
                <span className={styles.detailValue}>{formattedDate}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Saat</span>
                <span className={styles.detailValue}>{formattedTime}</span>
              </div>
              {info.doctorName && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Hekim</span>
                  <span className={styles.detailValue}>
                    {info.doctorName}
                    {info.doctorSpecialty ? ` (${info.doctorSpecialty})` : ''}
                  </span>
                </div>
              )}
              {info.treatments.length > 0 && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Planlanan İşlemler</span>
                  <div className={styles.treatmentPills}>
                    {info.treatments.map((t, idx) => (
                      <span key={idx} className={styles.treatmentPill}>
                        {t.toothNumber && /^[1-4][1-8]$/.test(t.toothNumber) ? `#${t.toothNumber} ` : ''}
                        {t.procedureName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Mevcut Durum</span>
                <span className={styles.detailValue}>
                  {info.status === 'confirmed'
                    ? '✅ Onaylandı (Geleceğim)'
                    : info.status === 'postponed'
                      ? '⏳ Erteleme Talebi İletildi'
                      : info.status === 'cancelled'
                        ? '❌ İptal Edildi (Gelemeyeceğim)'
                        : '📅 Planlandı (Yanıt Bekleniyor)'}
                </span>
              </div>
            </div>

            {doneMessage && (
              <div className={styles.statusBanner} role="status">
                {doneMessage}
              </div>
            )}

            <div className={styles.actionsGrid}>
              <button
                type="button"
                className={styles.btnConfirm}
                disabled={saving}
                onClick={() => void submitAction('confirm')}
              >
                <span>✅ Randevuma Geleceğim (Onayla)</span>
              </button>

              <button
                type="button"
                className={styles.btnPostpone}
                disabled={saving}
                onClick={() => setActiveMode(prev => (prev === 'postpone' ? 'none' : 'postpone'))}
              >
                <span>📅 Gelemeyeceğim · Başka Tarih Talep Et</span>
              </button>

              {activeMode === 'postpone' && (
                <div className={styles.subForm}>
                  <label className={styles.field}>
                    <span>Tercih Ettiğiniz Yeni Tarih / Saat Aralığı</span>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="Örn: Haftaya Salı öğleden sonra veya 15 Kasım"
                      value={preferredDate}
                      onChange={e => setPreferredDate(e.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Notunuz / Mazeretiniz (Opsiyonel)</span>
                    <textarea
                      rows={2}
                      className={styles.textarea}
                      placeholder="Kliniğe iletmek istediğiniz not..."
                      value={note}
                      onChange={e => setNote(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.btnConfirm}
                    disabled={saving}
                    onClick={() => void submitAction('postpone')}
                  >
                    <span>{saving ? 'Gönderiliyor…' : 'Erteleme Talebini Gönder'}</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                className={styles.btnCancel}
                disabled={saving}
                onClick={() => setActiveMode(prev => (prev === 'cancel' ? 'none' : 'cancel'))}
              >
                <span>❌ Gelemeyeceğim · Randevuyu İptal Et</span>
              </button>

              {activeMode === 'cancel' && (
                <div className={styles.subForm}>
                  <label className={styles.field}>
                    <span>İptal Nedeni (Opsiyonel)</span>
                    <textarea
                      rows={2}
                      className={styles.textarea}
                      placeholder="Gelememe nedeninizi kısaca belirtebilirsiniz..."
                      value={note}
                      onChange={e => setNote(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.btnCancel}
                    disabled={saving}
                    onClick={() => void submitAction('cancel')}
                  >
                    <span>{saving ? 'İşleniyor…' : 'Randevuyu Kesin Olarak İptal Et'}</span>
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
