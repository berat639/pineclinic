'use client'
import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'

interface AddPatientModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (newPatient: any) => void
}

const initialPatientState = {
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
    if (!newPatient.name.trim()) {
      toast.error('Hasta adı zorunludur.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/dental/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPatient)
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
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      {...backdropDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card-bg, #1e293b)',
          padding: '1.5rem',
          borderRadius: 14,
          border: '1px solid var(--input-border, #334155)',
          width: 440,
          maxWidth: '92vw',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, color: 'var(--foreground, #ffffff)', fontSize: '1.1rem', fontWeight: 700 }}>
            Yeni Hasta Ekle
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--foreground-3, #94a3b8)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>
              Ad Soyad <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="Ad Soyad (Zorunlu)"
              value={newPatient.name}
              onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '9px 16px',
              background: 'transparent',
              border: '1px solid var(--input-border, #334155)',
              borderRadius: 8,
              color: 'var(--foreground, #ffffff)',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleAddPatient}
            disabled={loading}
            style={{
              padding: '9px 18px',
              background: 'var(--brand-color, #2563eb)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              fontWeight: 600,
              fontSize: '0.85rem'
            }}
          >
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
