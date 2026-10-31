'use client'
import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function OptOutContent() {
  const searchParams = useSearchParams()
  const patientId = searchParams.get('p')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const [prefs, setPrefs] = useState({
    smsOptOut: false,
    emailOptOut: false,
    whatsappOptOut: false,
    name: ''
  })
  const [original, setOriginal] = useState({ smsOptOut: false, emailOptOut: false, whatsappOptOut: false })

  useEffect(() => {
    if (!patientId) {
      setError('Geçersiz veya eksik bağlantı.')
      setLoading(false)
      return
    }

    fetch(`/api/public/optout/${patientId}`)
      .then(res => {
        if (!res.ok) throw new Error('Hasta bulunamadı')
        return res.json()
      })
      .then(data => {
        setOriginal({ smsOptOut: !!data.smsOptOut, emailOptOut: !!data.emailOptOut, whatsappOptOut: !!data.whatsappOptOut })
        setPrefs({
          smsOptOut: !!data.smsOptOut,
          emailOptOut: !!data.emailOptOut,
          whatsappOptOut: !!data.whatsappOptOut,
          name: data.name || 'Değerli Hastamız'
        })
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Bir hata oluştu.')
        setLoading(false)
      })
  }, [patientId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) return
    setSaving(true)
    setError('')
    setSuccess(false)
    
    try {
      const res = await fetch(`/api/public/optout/${patientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smsOptOut: prefs.smsOptOut,
          emailOptOut: prefs.emailOptOut,
          whatsappOptOut: prefs.whatsappOptOut
        })
      })

      if (!res.ok) throw new Error('Güncellenirken hata oluştu')
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'İşlem başarısız')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={styles.container}><div style={styles.card}>Yükleniyor...</div></div>
  }

  if (error) {
    return <div style={styles.container}><div style={styles.card}><div style={{color: 'red', fontWeight: 600}}>{error}</div></div></div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Bildirim Tercihleri</h1>
        <p style={styles.greeting}>Merhaba,</p>
        <p style={styles.subtitle}>Aşağıdan kliniğimizden almak istemediğiniz bildirim türlerini seçebilirsiniz. İşaretlediğiniz kanallardan size bildirim <b>gönderilmeyecektir</b>.</p>
        <p style={styles.subtitle}>Kapatılmış bir kanalı tekrar açmak için klinikten yeni tercih formu isteyin.</p>

        <form onSubmit={handleSave} style={styles.form}>
          <label style={styles.label}>
            <input 
              type="checkbox" 
              disabled={original.smsOptOut}
              checked={prefs.smsOptOut} 
              onChange={e => setPrefs({...prefs, smsOptOut: e.target.checked})}
              style={styles.checkbox}
            />
            <span>SMS almak istemiyorum</span>
          </label>

          <label style={styles.label}>
            <input 
              type="checkbox" 
              disabled={original.whatsappOptOut}
              checked={prefs.whatsappOptOut} 
              onChange={e => setPrefs({...prefs, whatsappOptOut: e.target.checked})}
              style={styles.checkbox}
            />
            <span>WhatsApp mesajı almak istemiyorum</span>
          </label>

          <label style={styles.label}>
            <input 
              type="checkbox" 
              disabled={original.emailOptOut}
              checked={prefs.emailOptOut} 
              onChange={e => setPrefs({...prefs, emailOptOut: e.target.checked})}
              style={styles.checkbox}
            />
            <span>E-posta almak istemiyorum</span>
          </label>

          {success && <div style={styles.successBox}>Tercihleriniz başarıyla güncellendi!</div>}

          <button type="submit" disabled={saving} style={styles.button}>
            {saving ? 'Kaydediliyor...' : 'Tercihlerimi Kaydet'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function OptOutPage() {
  return (
    <Suspense fallback={<div style={{padding: 40, textAlign: 'center'}}>Yükleniyor...</div>}>
      <OptOutContent />
    </Suspense>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'var(--background)',
    padding: 20,
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
  },
  card: {
    background: 'var(--card-bg)',
    color: 'var(--foreground)',
    padding: '30px 40px',
    borderRadius: 16,
    border: '1px solid var(--input-border)',
    width: '100%',
    maxWidth: 450
  },
  title: {
    margin: '0 0 20px 0',
    fontSize: '1.4rem',
    color: 'var(--foreground)',
    textAlign: 'center'
  },
  greeting: {
    margin: '0 0 10px 0',
    fontSize: '1.1rem',
    color: 'var(--foreground-2)'
  },
  subtitle: {
    margin: '0 0 24px 0',
    fontSize: '0.9rem',
    color: 'var(--foreground-2)',
    lineHeight: 1.5
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: '0.95rem',
    color: 'var(--foreground)',
    cursor: 'pointer',
    padding: '12px 16px',
    border: '1px solid var(--input-border)',
    background: 'var(--card-inner)',
    borderRadius: 8,
    transition: 'background 0.2s'
  },
  checkbox: {
    width: 18,
    height: 18,
    cursor: 'pointer',
    accentColor: 'var(--accent)'
  },
  button: {
    marginTop: 10,
    padding: '12px',
    background: 'var(--btn-clinic-primary-bg)',
    color: 'var(--btn-clinic-primary-fg)',
    border: 'none',
    borderRadius: 8,
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  successBox: {
    padding: '10px 14px',
    background: 'var(--card-inner)',
    color: 'var(--foreground)',
    borderRadius: 8,
    fontSize: '0.85rem',
    textAlign: 'center',
    border: '1px solid var(--input-border)'
  }
}
