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
        className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className={`fixed top-0 right-0 bottom-0 w-full sm:w-[420px] bg-card border-l border-divider z-[9999] flex flex-col shadow-2xl transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-divider">
          <h2 className="m-0 text-lg font-bold text-foreground flex items-center gap-2">👥 Hastalar</h2>
          <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-xl text-foreground-3 hover:text-foreground transition-colors">✕</button>
        </div>

        <div className="p-4 border-b border-divider bg-glass-bg">
          <input 
            type="text" 
            placeholder="Hasta adı veya telefon ara..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input-border bg-input-bg text-foreground focus:outline-none focus:border-brand transition-colors text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {paginatedPatients.length === 0 ? (
            <div className="p-6 text-center text-foreground-3 text-sm">Kayıt bulunamadı.</div>
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
