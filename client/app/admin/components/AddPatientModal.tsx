'use client'
import React, { useState, useEffect } from 'react'
import { UserRoundPlus, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'
import { PhoneMaskedInput } from '@/lib/phone-mask'
import PatientConsentPanel from './PatientConsentPanel'

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
  const [createdPatientId, setCreatedPatientId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const backdropDismiss = useBackdropDismiss(onClose)

  useEffect(() => {
    if (isOpen) {
      setNewPatient(initialPatientState)
      setCreatedPatientId('')
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

  const ensurePatientSaved = async (): Promise<string | null> => {
    const fullName = `${newPatient.firstName.trim()} ${newPatient.lastName.trim()}`.trim()
    if (!fullName) {
      toast.error('Onam formu göndermek için önce hasta adını ve soyadını girin.')
      return null
    }
    if (createdPatientId) {
      await fetch(`/api/dental/patients/${createdPatientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPatient,
          name: fullName,
        }),
      }).catch(() => {})
      return createdPatientId
    }
    const res = await fetch('/api/dental/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newPatient,
        name: fullName,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error('Hata: ' + (err.error || 'Hasta kaydedilemedi'))
      return null
    }
    const data = await res.json()
    setCreatedPatientId(data.id)
    onSuccess?.(data)
    return data.id
  }

  const handleAddPatient = async () => {
    const fullName = `${newPatient.firstName.trim()} ${newPatient.lastName.trim()}`.trim()
    if (!fullName) {
      toast.error('Hasta adı zorunludur.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(createdPatientId ? `/api/dental/patients/${createdPatientId}` : '/api/dental/patients', {
        method: createdPatientId ? 'PUT' : 'POST',
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
        setCreatedPatientId('')
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
            <PhoneMaskedInput
              placeholder="0 (5XX) XXX XX XX"
              value={newPatient.phone}
              onValueChange={(phone) => setNewPatient({ ...newPatient, phone })}
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

          <div style={{ marginTop: 4 }}>
            <PatientConsentPanel
              patientId={createdPatientId || undefined}
              onEnsurePatient={ensurePatientSaved}
              unsavedContact={{
                phone: newPatient.phone,
                email: newPatient.email,
                smsOptOut: newPatient.smsOptOut,
                emailOptOut: newPatient.emailOptOut,
                whatsappOptOut: newPatient.whatsappOptOut,
              }}
              onContactChange={(contact) => {
                setNewPatient(prev => ({
                  ...prev,
                  phone: contact.phone ?? prev.phone,
                  email: contact.email ?? prev.email,
                }))
              }}
              onConsentChange={(nextOptOuts) => {
                setNewPatient(prev => ({
                  ...prev,
                  ...nextOptOuts,
                }))
              }}
            />
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
