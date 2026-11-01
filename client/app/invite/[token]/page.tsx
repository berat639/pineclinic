'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PhoneMaskedInput } from '@/lib/phone-mask'
import { ShieldCheck, Lock, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'

interface InviteDetails {
  email: string
  name: string
  role: string
  phone?: string | null
  specialty?: string | null
  color?: string | null
  clinicName: string
  expiresAt: string
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1.5px solid var(--input-border, #cbd5e1)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--foreground, #0f172a)',
  boxShadow: 'var(--pc-neo-inset)',
  fontSize: '0.84rem',
  fontWeight: 600,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

export default function StaffInviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params?.token || ''

  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [loadError, setLoadError] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [kvkkConsent, setKvkkConsent] = useState(false)
  const [showKvkkText, setShowKvkkText] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/staff-invite/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Davet bağlantısı geçersiz veya süresi dolmuş.')
        }
        setInvite(data)
        if (data.phone) setPhone(data.phone)
      })
      .catch((err: any) => {
        setLoadError(err.message || 'Davet bilgisi alınamadı.')
      })
      .finally(() => setLoading(false))
  }, [token])

  const roleLabel = (role?: string) => {
    if (role === 'hekim') return 'Hekim'
    if (role === 'yonetici') return 'Klinik Yöneticisi'
    return 'Kayıt / Resepsiyon Personeli'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')

    if (password.trim().length < 6) {
      setSubmitError('Şifreniz en az 6 karakter olmalıdır.')
      return
    }
    if (password !== confirmPassword) {
      setSubmitError('Girdiğiniz şifreler birbiriyle eşleşmiyor.')
      return
    }
    if (!kvkkConsent) {
      setSubmitError('Hesabınızı oluşturmak için KVKK Aydınlatma ve Açık Rıza metnini onaylamanız gerekmektedir.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/staff-invite/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          phone,
          kvkkConsent: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(data.error || 'Hesap oluşturulamadı.')
        return
      }
      setAccepted(true)
    } catch {
      setSubmitError('Sunucu ile bağlantı kurulamadı. Lütfen tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--background, #f1f5f9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'var(--card-bg, #ffffff)',
          borderRadius: 14,
          border: '1.5px solid var(--input-border, #cbd5e1)',
          boxShadow: 'var(--pc-neo-card)',
          padding: 22,
          color: 'var(--foreground, #0f172a)',
          boxSizing: 'border-box',
        }}
      >
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--foreground-2)', fontWeight: 700 }}>
            Davet bilgileri doğrulanıyor…
          </div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: '12px 4px' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'var(--card-inner)',
                border: '1px solid var(--danger, #ef4444)',
                color: 'var(--danger, #ef4444)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <AlertTriangle size={24} />
            </div>
            <h1 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 800 }}>Davet Geçersiz veya Süresi Dolmuş</h1>
            <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: 'var(--foreground-2)', lineHeight: 1.5 }}>{loadError}</p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="btn-clinic-primary"
              style={{
                padding: '9px 18px',
                borderRadius: 10,
                border: '1px solid #1d4ed8',
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                boxShadow: 'var(--pc-clay-primary)',
                fontWeight: 750,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: '#ffffff' }}>Giriş Ekranına Dön</span>
            </button>
          </div>
        ) : accepted ? (
          <div style={{ textAlign: 'center', padding: '12px 4px' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'var(--btn-mint-bg, #f0fdf4)',
                border: '1px solid var(--btn-mint-border, #86efac)',
                color: 'var(--btn-mint-text, #15803d)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <CheckCircle2 size={25} />
            </div>
            <h1 style={{ margin: '0 0 8px', fontSize: '1.08rem', fontWeight: 800 }}>Hesabınız Aktifleştirildi!</h1>
            <p style={{ margin: '0 0 18px', fontSize: '0.82rem', color: 'var(--foreground-2)', lineHeight: 1.5 }}>
              KVKK onayınız kaydedildi ve şifreniz oluşturuldu. Artık <strong>{invite?.email}</strong> adresinizle klinik paneline giriş yapabilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="btn-clinic-primary"
              style={{
                width: '100%',
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid #1d4ed8',
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                boxShadow: 'var(--pc-clay-primary)',
                fontWeight: 750,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span style={{ color: '#ffffff' }}>Panele Giriş Yap</span>
              <ArrowRight size={15} color="#ffffff" />
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                  boxShadow: 'var(--pc-clay-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ShieldCheck size={20} color="#ffffff" />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--foreground)' }}>
                  {invite?.clinicName} — Personel Daveti
                </h1>
                <div style={{ fontSize: '0.75rem', color: 'var(--foreground-2)' }}>
                  KVKK uyumlu hesap oluşturma ve şifre belirleme
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-inner)',
                border: '1px solid var(--input-border)',
                borderRadius: 12,
                boxShadow: 'var(--pc-neo-subcard)',
                padding: 12,
                marginBottom: 14,
                fontSize: '0.78rem',
                display: 'grid',
                gap: 4,
              }}
            >
              <div>
                <span style={{ color: 'var(--foreground-2)', fontWeight: 600 }}>Ad Soyad: </span>
                <strong style={{ color: 'var(--foreground)' }}>{invite?.name}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--foreground-2)', fontWeight: 600 }}>E-Posta: </span>
                <strong style={{ color: 'var(--foreground)' }}>{invite?.email}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--foreground-2)', fontWeight: 600 }}>Atanan Rol: </span>
                <strong style={{ color: 'var(--accent, #0284c7)' }}>
                  {roleLabel(invite?.role)}
                  {invite?.specialty ? ` (${invite.specialty})` : ''}
                </strong>
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>
                  Telefon Numaranız
                </label>
                <PhoneMaskedInput
                  placeholder="0 (5XX) XXX XX XX"
                  value={phone}
                  onValueChange={setPhone}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground-2)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <Lock size={12} /> Şifre Belirleyin *
                  </label>
                  <input
                    type="password"
                    placeholder="En az 6 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>
                    Şifre Tekrar *
                  </label>
                  <input
                    type="password"
                    placeholder="Şifreyi doğrulayın"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* KVKK Aydınlatma ve Açık Rıza Kutusu */}
              <div
                style={{
                  background: 'var(--card-inner)',
                  border: '1px solid var(--input-border)',
                  borderRadius: 12,
                  boxShadow: 'var(--pc-neo-subcard)',
                  padding: 12,
                }}
              >
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: '0.76rem', lineHeight: 1.45, fontWeight: 650 }}>
                  <input
                    type="checkbox"
                    checked={kvkkConsent}
                    onChange={(e) => setKvkkConsent(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <strong>6698 Sayılı KVKK Aydınlatma Metni</strong>&apos;ni okudum; kimlik, iletişim ve mesleki verilerimin klinik yönetim sistemi kapsamında işlenmesine açık rıza veriyorum.
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowKvkkText(!showKvkkText)}
                  style={{
                    marginTop: 6,
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent, #0284c7)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {showKvkkText ? 'Aydınlatma Metnini Gizle ▲' : 'KVKK Aydınlatma Metnini Oku ▼'}
                </button>

                {showKvkkText && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 8,
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      fontSize: '0.71rem',
                      color: 'var(--foreground-2)',
                      lineHeight: 1.5,
                      maxHeight: 130,
                      overflowY: 'auto',
                    }}
                  >
                    <strong>Klinik Personeli KVKK Aydınlatma Metni:</strong> 6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca; ad-soyad, e-posta, telefon, uzmanlık ve vardiya/randevu işlem kayıtlarınız yalnızca klinik randevu planlaması, hasta bilgilendirme süreçleri ve yasal sağlık mevzuatı yükümlülüklerinin yerine getirilmesi amacıyla işlenmektedir. Şifreniz tek yönlü kriptografik özet (hash) olarak saklanır ve klinik yöneticisi dahil hiçbir üçüncü kişi tarafından görüntülenemez.
                  </div>
                )}
              </div>

              {submitError && (
                <div
                  role="alert"
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    background: 'var(--card-inner)',
                    border: '1px solid var(--danger)',
                    color: 'var(--danger)',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                  }}
                >
                  ⚠️ {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-clinic-primary"
                style={{
                  width: '100%',
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid #0284c7',
                  background: 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)',
                  color: '#ffffff',
                  boxShadow: 'var(--pc-clay-primary)',
                  fontWeight: 750,
                  fontSize: '0.84rem',
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                <span style={{ color: '#ffffff' }}>
                  {submitting ? 'Hesabınız Oluşturuluyor…' : 'KVKK Onayla ve Hesabımı Oluştur'}
                </span>
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}

