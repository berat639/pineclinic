import React, { useState, useMemo, useEffect } from 'react'
import Pagination from './Pagination'
import PatientListItem from './PatientListItem'
import PatientProfileCard from './PatientProfileCard'
import PatientTreatmentHistory from './PatientTreatmentHistory'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'

interface PatientSidePanelProps {
  isOpen: boolean
  onClose: () => void
  patients: any[]
  doctors: any[]
  shifts: any[]
  onFocusAppointment: (appointmentId: string, startTime: string) => void
  onPlanTreatment: (treatment: any, patient: any) => void
}

export default function PatientSidePanel({ isOpen, onClose, patients, doctors, shifts, onFocusAppointment, onPlanTreatment }: PatientSidePanelProps) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Record<string, any>>({})
  const [showSortInfo, setShowSortInfo] = useState(false)

  const updateConsent = async (patientId: string, field: 'smsOptOut' | 'emailOptOut' | 'whatsappOptOut', value: boolean) => {
    const previous = profiles[patientId]
    setProfiles(current => ({ ...current, [patientId]: { ...current[patientId], patient: { ...current[patientId]?.patient, [field]: value } } }))
    try {
      const response = await fetch(`/api/dental/patients/${patientId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) })
      if (!response.ok) throw new Error('İzin kaydedilemedi')
    } catch (error) {
      setProfiles(current => ({ ...current, [patientId]: previous }))
      console.error(error)
    }
  }

  // Reset pagination on search
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  // Fetch profile when expanded
  useEffect(() => {
    if (expandedPatientId && !profiles[expandedPatientId]) {
      fetch(`/api/dental/patients/${expandedPatientId}/profile`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setProfiles(prev => ({ ...prev, [expandedPatientId]: data }))
          }
        })
        .catch(err => console.error('Error fetching profile:', err))
    }
  }, [expandedPatientId])

  const filteredPatients = useMemo(() => {
    if (!searchTerm) return patients
    const lower = searchTerm.toLowerCase()
    return patients.filter(p => 
      p.name.toLowerCase().includes(lower) || 
      (p.phone && p.phone.includes(searchTerm))
    )
  }, [patients, searchTerm])

  const totalPages = Math.ceil(filteredPatients.length / pageSize)
  const paginatedPatients = filteredPatients.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        {...backdropDismiss}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)', opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none', transition: 'opacity 0.3s' }}
      />
      
      <div 
        style={{ 
          position: 'fixed', top: 0, left: 0, bottom: 0, width: '100%', maxWidth: 'min(420px, 100vw)', 
          backgroundColor: 'var(--card-bg, #1e293b)', borderRight: '1px solid var(--divider)', 
          zIndex: 100000, display: 'flex', flexDirection: 'column', 
          boxShadow: '4px 0 25px rgba(0,0,0,0.3)',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease-in-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--divider)' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '8px' }}>👥 Hastalar</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--foreground-3)' }}>✕</button>
        </div>

        <div style={{ padding: '16px', borderBottom: '1px solid var(--divider)', background: 'var(--input-bg)', position: 'relative' }}>
          <div style={{ display: 'flex', gap: 7 }}><input
            type="text" 
            placeholder="Hasta adı veya telefon ara..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--foreground)',
              outline: 'none',
              fontSize: '0.875rem'
            }}
          />
          <button type="button" onClick={() => setShowSortInfo(open => !open)} aria-label="Sıralama bilgisi" title="Sıralama bilgisi" style={{ width: 36, border: '1px solid var(--input-border)', borderRadius: 6, background: 'var(--card-bg)', color: 'var(--accent)', cursor: 'pointer', fontWeight: 800 }}>⇅</button></div>
          {showSortInfo && <div style={{ position: 'absolute', zIndex: 2, top: 58, right: 16, left: 16, padding: 9, border: '1px solid var(--input-border)', borderRadius: 7, background: 'var(--card-bg)', color: 'var(--foreground-2)', fontSize: '0.72rem', boxShadow: '0 8px 18px var(--modal-shadow)' }}>Sıralama: son oluşturulan veya güncellenen randevunun hastası önce gösterilir. Randevusu olmayan hastalar listenin sonundadır.</div>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {paginatedPatients.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--foreground-3)', fontSize: '0.875rem' }}>Kayıt bulunamadı.</div>
          ) : (
            paginatedPatients.map(p => (
              <div key={p.id}>
                <PatientListItem 
                  patient={p} 
                  isExpanded={expandedPatientId === p.id} 
                  onClick={() => setExpandedPatientId(prev => prev === p.id ? null : p.id)} 
                />
                {expandedPatientId === p.id && (
                  <>
                    <PatientProfileCard profile={profiles[p.id]} calendarHistoryMode onConsentChange={(field, value) => updateConsent(p.id, field, value)} />
                    {profiles[p.id]?.patient && <PatientTreatmentHistory patient={profiles[p.id].patient} doctors={doctors} shifts={shifts} onFocusAppointment={onFocusAppointment} onPlanTreatment={onPlanTreatment} />}
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </>
  )
}
