import React, { useState, useMemo, useEffect } from 'react'
import Pagination from './Pagination'
import PatientListItem from './PatientListItem'
import PatientProfileCard from './PatientProfileCard'

interface PatientSidePanelProps {
  isOpen: boolean
  onClose: () => void
  patients: any[]
}

export default function PatientSidePanel({ isOpen, onClose, patients }: PatientSidePanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Record<string, any>>({})

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
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)', opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none', transition: 'opacity 0.3s' }}
      />
      
      <div 
        style={{ 
          position: 'fixed', top: 0, left: 0, bottom: 0, width: '100%', maxWidth: '420px', 
          backgroundColor: 'var(--card-bg)', borderRight: '1px solid var(--divider)', 
          zIndex: 100000, display: 'flex', flexDirection: 'column', 
          boxShadow: '4px 0 25px rgba(0,0,0,0.2)',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease-in-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--divider)' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '8px' }}>👥 Hastalar</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--foreground-3)' }}>✕</button>
        </div>

        <div style={{ padding: '16px', borderBottom: '1px solid var(--divider)', background: 'var(--glass-bg)' }}>
          <input 
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
                  <PatientProfileCard profile={profiles[p.id]} />
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
