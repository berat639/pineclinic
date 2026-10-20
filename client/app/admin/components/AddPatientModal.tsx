'use client'
import React, { useState, useEffect } from 'react'
import { UserRoundPlus, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'

interface AddPatientModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (newPatient: any) => void
}

const initialPatientState = {
  firstName: '',
  lastName: '',
  name: '',
  phone: '',
  email: '',
  tcIdentity: '',
  gender: '',
  birthDate: '',
  smsOptOut: false,
  emailOptOut: false,
  whatsappOptOut: false
}

export default function AddPatientModal({ isOpen, onClose, onSuccess }: AddPatientModalProps) {
  const [newPatient, setNewPatient] = useState(initialPatientState)
  const [loading, setLoading] = useState(false)
  const backdropDismiss = useBackdropDismiss(onClose)

  useEffect(() => {
    if (isOpen) {
      setNewPatient(initialPatientState)
      setLoading(false)
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleAddPatient = async () => {
    const fullName = `${newPatient.firstName.trim()} ${newPatient.lastName.trim()}`.trim()
    if (!fullName) {
      toast.error('Hasta adı zorunludur.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/dental/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPatient,
          name: fullName
        })
      })

      if (res.ok) {
        const data = await res.json()
        toast.success('Hasta başarıyla eklendi!')
        setNewPatient(initialPatientState)
        onSuccess?.(data)
        onClose()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error('Hata: ' + (err.error || 'Bilinmeyen hata'))
      }
    } catch (err) {
      console.error('Hasta ekleme hatası:', err)
      toast.error('Hasta eklenirken bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="reference-modal-overlay"
      {...backdropDismiss}
    >
      <div
        className="reference-modal reference-modal--patient"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reference-modal-header">
          <div className="reference-modal-heading">
            <span className="reference-modal-icon"><UserRoundPlus size={26} /></span>
            <div>
              <h3>Yeni Hasta Ekle</h3>
              <p>Hasta bilgilerini kaydedin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="reference-modal-close"
            aria-label="Modalı kapat"
          >
            <X size={24} />
          </button>
        </div>

        <div className="reference-modal-body">
          <section className="reference-modal-section">
            <div className="reference-section-title">
              <span>1</span>
              <h4>Hasta Bilgileri</h4>
            </div>
            <div className="reference-modal-fields">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>
                Ad <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Örn: Ahmet"
                value={newPatient.firstName}
                onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--input-border, #334155)',
                  background: 'var(--input-bg, #0f172a)',
                  color: 'var(--foreground, #ffffff)',
                  fontSize: '0.85rem'
                }}
                autoFocus
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>
                Soyad <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Örn: Yılmaz"
                value={newPatient.lastName}
                onChange={(e) => setNewPatient({ ...newPatient, lastName: e.target.value })}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--input-border, #334155)',
                  background: 'var(--input-bg, #0f172a)',
                  color: 'var(--foreground, #ffffff)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>
              Telefon
            </label>
            <input
              type="text"
              placeholder="05XXXXXXXXX"
              value={newPatient.phone}
              onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--input-border, #334155)',
                background: 'var(--input-bg, #0f172a)',
                color: 'var(--foreground, #ffffff)',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>
              TC Kimlik No
            </label>
            <input
              type="text"
              placeholder="TC Kimlik No"
              value={newPatient.tcIdentity}
              onChange={(e) => setNewPatient({ ...newPatient, tcIdentity: e.target.value })}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--input-border, #334155)',
                background: 'var(--input-bg, #0f172a)',
                color: 'var(--foreground, #ffffff)',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>
              E-posta
            </label>
            <input
              type="email"
              placeholder="ornek@email.com"
              value={newPatient.email}
              onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--input-border, #334155)',
                background: 'var(--input-bg, #0f172a)',
                color: 'var(--foreground, #ffffff)',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>
              Cinsiyet
            </label>
            <select
              value={newPatient.gender}
              onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--input-border, #334155)',
                background: 'var(--input-bg, #0f172a)',
                color: 'var(--foreground, #ffffff)',
                fontSize: '0.85rem'
              }}
            >
              <option value="">Cinsiyet (İsteğe Bağlı)</option>
              <option value="Erkek">Erkek</option>
              <option value="Kadın">Kadın</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--foreground-2, #94a3b8)', paddingLeft: 4, fontWeight: 500 }}>
              Doğum Tarihi (İsteğe Bağlı)
            </label>
            <input
              type="date"
              value={newPatient.birthDate}
              onChange={(e) => setNewPatient({ ...newPatient, birthDate: e.target.value })}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--input-border, #334155)',
                background: 'var(--input-bg, #0f172a)',
                color: 'var(--foreground, #ffffff)',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div
            className="reference-consent-card"
            style={{
              padding: '12px',
              borderRadius: 8,
              border: '1px solid var(--divider, #334155)',
              background: 'var(--background-2, #0f172a)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 4
            }}
          >
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground, #ffffff)' }}>
              İletişim İzinleri (KVKK)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2, #94a3b8)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!newPatient.smsOptOut}
                onChange={(e) => setNewPatient({ ...newPatient, smsOptOut: !e.target.checked })}
              />
              SMS ile bilgilendirilmek istiyorum
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2, #94a3b8)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!newPatient.emailOptOut}
                onChange={(e) => setNewPatient({ ...newPatient, emailOptOut: !e.target.checked })}
              />
              E-posta ile bilgilendirilmek istiyorum
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2, #94a3b8)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!newPatient.whatsappOptOut}
                onChange={(e) => setNewPatient({ ...newPatient, whatsappOptOut: !e.target.checked })}
              />
              WhatsApp ile bilgilendirilmek istiyorum
            </label>
          </div>
            </div>
          </section>
        </div>

        <div className="reference-modal-footer">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn-clinic-blue"
            style={{ cursor: 'pointer' }}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleAddPatient}
            disabled={loading}
            className="btn-clinic-primary"
            style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
