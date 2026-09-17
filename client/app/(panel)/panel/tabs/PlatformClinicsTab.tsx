'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import styles from './PlatformClinicsTab.module.css'

type Clinic = {
  id: string
  name: string
  hostname: string
  isActive: boolean
  createdAt: string
}

export default function PlatformClinicsTab() {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [name, setName] = useState('')
  const [hostname, setHostname] = useState('')
  const [timezone, setTimezone] = useState('Europe/Istanbul')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/platform/clinics', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Klinikler alınamadı.')
      setClinics(data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Klinikler alınamadı.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const createClinic = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/platform/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hostname, timezone }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Klinik oluşturulamadı.')
      setClinics(current => [data, ...current])
      setName('')
      setHostname('')
      setNotice(`${data.name} oluşturuldu. DNS uygulamaya yönlendirildikten sonra platform yöneticisi bu domain üzerinden giriş yapabilir.`)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Klinik oluşturulamadı.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <h2 className={styles.title}>Yeni Klinik</h2>
        <p className={styles.description}>Klinik, domain eşlemesi ve başlangıç ayarları tek işlemde oluşturulur. Mevcut kliniklerden hasta, logo, entegrasyon veya bilgi tabanı verisi kopyalanmaz.</p>
        {notice && <div className={styles.notice} role="status">{notice}</div>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        <form className={styles.form} onSubmit={createClinic}>
          <label className={styles.field}>
            <span>Klinik adı</span>
            <input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={120} required placeholder="Örnek Diş Kliniği" />
          </label>
          <label className={styles.field}>
            <span>Hostname / subdomain</span>
            <input value={hostname} onChange={event => setHostname(event.target.value.toLowerCase())} minLength={3} maxLength={253} required placeholder="ornek.voiceai.com" />
          </label>
          <label className={styles.field}>
            <span>Saat dilimi</span>
            <input value={timezone} onChange={event => setTimezone(event.target.value)} required placeholder="Europe/Istanbul" />
          </label>
          <button className={styles.button} type="submit" disabled={saving}>{saving ? 'Oluşturuluyor…' : 'Kliniği oluştur'}</button>
        </form>
      </section>

      <section className={styles.card}>
        <h2 className={styles.title}>Klinikler</h2>
        <p className={styles.description}>Sistemde tanımlı tenant ve birincil domain eşleşmeleri.</p>
        {loading ? <p className={styles.empty}>Klinikler yükleniyor…</p> : (
          <div className={styles.list}>
            {clinics.length === 0 && <p className={styles.empty}>Henüz klinik bulunmuyor.</p>}
            {clinics.map(clinic => (
              <div className={styles.row} key={clinic.id}>
                <div><strong>{clinic.name}</strong><small>{clinic.id}</small></div>
                <div className={styles.domain}>{clinic.hostname || 'Birincil domain tanımlı değil'}</div>
                <span className={styles.status}>{clinic.isActive ? 'Aktif' : 'Pasif'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
