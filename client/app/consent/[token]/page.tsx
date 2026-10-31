'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import styles from './page.module.css'

type Channel = 'sms' | 'whatsapp' | 'email' | 'assistant_call'
const channels: { id: Channel; label: string }[] = [
  { id: 'sms', label: 'SMS bildirimleri' },
  { id: 'whatsapp', label: 'WhatsApp bildirimleri' },
  { id: 'email', label: 'E-posta bildirimleri' },
  { id: 'assistant_call', label: 'Asistan tarafından aranma' },
]

export default function ConsentPage() {
  const params = useParams<{ token: string }>()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [answers, setAnswers] = useState<Record<Channel, boolean | null>>({ sms: null, whatsapp: null, email: null, assistant_call: null })

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/public/patient-consent/${encodeURIComponent(params.token)}`, { signal: controller.signal, cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Form açılamadı.')
        setText(data.text)
      })
      .catch(reason => { if (reason.name !== 'AbortError') setError(reason.message || 'Form açılamadı.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [params.token])

  async function submit() {
    if (saving || channels.some(channel => answers[channel.id] === null)) {
      setError('Lütfen her iletişim kanalı için bir seçim yapın.')
      return
    }
    setError(''); setSaving(true)
    try {
      const response = await fetch(`/api/public/patient-consent/${encodeURIComponent(params.token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }), referrerPolicy: 'no-referrer',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Yanıt kaydedilemedi.')
      setComplete(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Yanıt kaydedilemedi.') }
    finally { setSaving(false) }
  }

  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="consent-title">
      <h1 id="consent-title">Bildirim tercihleri</h1>
      {loading ? <p role="status">Form yükleniyor…</p> : complete ? <p role="status">Tercihleriniz kaydedildi. Bu pencereyi kapatabilirsiniz.</p> : <>
        {text && <>
          <p className={styles.text}>{text}</p>
          <p>Her kanal için ayrı bir seçim yapın.</p>
          {channels.map(channel => <fieldset className={styles.channel} key={channel.id}>
            <legend>{channel.label}</legend>
            <label><input type="radio" name={channel.id} checked={answers[channel.id] === true} onChange={() => setAnswers(previous => ({ ...previous, [channel.id]: true }))} /> İzin veriyorum</label>
            <label><input type="radio" name={channel.id} checked={answers[channel.id] === false} onChange={() => setAnswers(previous => ({ ...previous, [channel.id]: false }))} /> İzin vermiyorum</label>
          </fieldset>)}
          <button className={styles.primary} type="button" disabled={saving} onClick={() => void submit()}>{saving ? 'Kaydediliyor…' : 'Tercihleri kaydet'}</button>
        </>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </>}
    </section>
  </main>
}
