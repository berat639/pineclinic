'use client'
import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'react-hot-toast'
import PatientProfileCard from './PatientProfileCard'
import Pagination from './Pagination'

interface Patient {
  id: string
  name: string
  phone: string | null
  email: string | null
  tcIdentity: string | null
  gender: string | null
  birthDate: string | null
  balance: number
  createdAt: string
}

export default function PatientsTab() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [newPatient, setNewPatient] = useState({ name: '', phone: '', email: '', tcIdentity: '', gender: '', birthDate: '', smsOptOut: false, emailOptOut: false, whatsappOptOut: false })
  const [excelErrors, setExcelErrors] = useState<string[]>([])

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadPatients = () => {
    fetch('/api/dental/patients')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPatients(data)
        setLoading(false)
      })
      .catch(err => {
        console.error("Failed to fetch patients:", err)
        setLoading(false)
      })
  }

  useEffect(() => {
    loadPatients()
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const bstr = evt.target?.result
      if (!bstr) return
      try {
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws) as any[]
        
        setExcelErrors([])
        const errors: string[] = []
        
        const mappedPatients = data.map((row, index) => {
          const name = row['Ad Soyad'] || row['Name'] || row['Adı Soyadı'] || row['hastaAdiSoyadi']
          if (!name) {
            errors.push(`${index + 2}. Satır: Ad Soyad eksik`)
            return null
          }
          return {
            name,
            phone: row['Telefon'] || row['Phone'] || row['hastaTelefonu'],
            tcIdentity: String(row['TC Kimlik'] || row['TC'] || row['TC Kimlik No'] || row['tcKimlikNo'] || ''),
            gender: row['Cinsiyet'] || row['Gender'] || '',
            birthDate: row['Doğum Tarihi'] || row['BirthDate'] || null,
          }
        }).filter(Boolean) as any[]

        setExcelErrors(errors)

        if (mappedPatients.length === 0) {
          toast.error('Excel dosyasında geçerli hasta kaydı bulunamadı. Lütfen "Ad Soyad" sütunu olduğundan emin olun.')
          return
        }

        const res = await fetch('/api/dental/patients/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patients: mappedPatients })
        })

        if (res.ok) {
          toast.success(`${mappedPatients.length} hasta başarıyla eklendi!`)
          loadPatients()
        } else {
          const err = await res.json()
          toast.error('Hata: ' + (err.error || 'Bilinmeyen hata'))
        }
      } catch (err) {
        console.error('Excel parse error:', err)
        toast.error('Excel dosyası okunurken bir hata oluştu.')
      }
    }
    reader.readAsBinaryString(file)
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAddPatient = async () => {
    if (!newPatient.name.trim()) {
      toast.error('Hasta adı zorunludur.')
      return
    }
    
    try {
      const res = await fetch('/api/dental/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPatient)
      })
      if (res.ok) {
        toast.success('Hasta başarıyla eklendi!')
        setShowAddModal(false)
        setNewPatient({ name: '', phone: '', email: '', tcIdentity: '', gender: '', birthDate: '', smsOptOut: false, emailOptOut: false, whatsappOptOut: false })
        loadPatients()
      } else {
        const err = await res.json()
        toast.error('Hata: ' + (err.error || 'Bilinmeyen hata'))
      }
    } catch (err) {
      console.error(err)
      toast.error('Hasta eklenirken bir hata oluştu.')
    }
  }

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 'Ad Soyad': 'Ahmet Yılmaz', 'TC Kimlik': '12345678901', 'Telefon': '05321234567', 'Cinsiyet': 'E', 'Doğum Tarihi': '1990-01-01' }
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sablon')
    XLSX.writeFile(wb, 'Hasta_Sablon.xlsx')
  }

  useEffect(() => {
    if (selectedPatientId) {
      setProfileLoading(true)
      fetch(`/api/dental/patients/${selectedPatientId}/profile`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) setProfileData(data)
          setProfileLoading(false)
        })
        .catch(err => {
          console.error(err)
          setProfileLoading(false)
        })
    } else {
      setProfileData(null)
    }
  }, [selectedPatientId])



  const filtered = patients.filter(p => {
    const term = searchTerm.toLowerCase()
    return (
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.phone && p.phone.toLowerCase().includes(term)) ||
      (p.tcIdentity && p.tcIdentity.toLowerCase().includes(term))
    )
  })

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Hastalar Yönetimi</h2>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={handleDownloadTemplate}
            style={{
              padding: '8px 16px', background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 8,
              color: '#60a5fa', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            ⬇️ Şablon İndir
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '8px 16px', background: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 8,
              color: '#4ade80', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            📊 Excel İçe Aktar
          </button>
          
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '8px 16px', background: 'var(--brand-color, #2563eb)',
              border: 'none', borderRadius: 8,
              color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            ➕ Yeni Hasta Ekle
          </button>

          <input
            type="text"
            placeholder="Hasta adı, telefon veya TC Kimlik..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1) }}
            style={{
              padding: '8px 12px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              color: 'var(--foreground)', fontSize: '0.85rem', outline: 'none',
              minWidth: 280
            }}
          />
        </div>
      </div>

      {excelErrors.length > 0 && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, color: '#f87171' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>⚠️ Excel Yükleme Hataları (Bu satırlar atlandı):</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem' }}>
            {excelErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--foreground-3)' }}>Yükleniyor...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--foreground-3)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
          <div>Hasta bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedPatientId ? '1fr 400px' : '1fr', gap: '1rem', alignItems: 'start' }}>
          
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Ad Soyad', 'TC Kimlik', 'Telefon', 'Cinsiyet', 'Doğum Tarihi', 'Kayıt', ''].map((h, i) => (
                      <th key={i} style={{ padding: '0.8rem 1rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-3)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((p, i) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPatientId(selectedPatientId === p.id ? null : p.id)}
                      style={{
                        borderBottom: i < paginated.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                        background: selectedPatientId === p.id ? 'rgba(96,165,250,0.1)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '0.8rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--foreground)' }}>
                        {p.name}
                      </td>
                      <td style={{ padding: '0.8rem 1rem', fontSize: '0.84rem', color: 'var(--foreground-3)' }}>
                        {p.tcIdentity || '—'}
                      </td>
                      <td style={{ padding: '0.8rem 1rem', fontSize: '0.84rem', color: 'var(--foreground-3)' }}>
                        {p.phone || '—'}
                      </td>
                      <td style={{ padding: '0.8rem 1rem', fontSize: '0.84rem', color: 'var(--foreground-3)' }}>
                        {p.gender === 'E' ? 'Erkek' : p.gender === 'K' ? 'Kadın' : p.gender || '—'}
                      </td>
                      <td style={{ padding: '0.8rem 1rem', fontSize: '0.84rem', color: 'var(--foreground-3)' }}>
                        {fmtDate(p.birthDate)}
                      </td>
                      <td style={{ padding: '0.8rem 1rem', fontSize: '0.84rem', color: 'var(--foreground-3)' }}>
                        {fmtDate(p.createdAt)}
                      </td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>
                        <span style={{ fontSize: '0.8rem', color: '#60a5fa' }}>Detay &rarr;</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'center' }}>
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={setPageSize} />
            </div>
          </div>

          {selectedPatientId && (
            <div className="glass-card" style={{ padding: '1.2rem', position: 'sticky', top: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)' }}>Hasta Detayı</h3>
                <button
                  onClick={() => setSelectedPatientId(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.1rem' }}
                >
                  ✕
                </button>
              </div>
              
              <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {profileLoading ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-3)' }}>Profil yükleniyor...</div>
                ) : profileData ? (
                  <PatientProfileCard profile={profileData} />
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>Profil yüklenemedi.</div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--glass-border)', width: 400, maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--foreground)' }}>Yeni Hasta Ekle</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input type="text" placeholder="Ad Soyad (Zorunlu)" value={newPatient.name} onChange={e => setNewPatient({...newPatient, name: e.target.value})} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)' }} />
              <input type="text" placeholder="Telefon (İsteğe Bağlı)" value={newPatient.phone} onChange={e => setNewPatient({...newPatient, phone: e.target.value})} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)' }} />
              <input type="text" placeholder="TC Kimlik No (İsteğe Bağlı)" value={newPatient.tcIdentity} onChange={e => setNewPatient({...newPatient, tcIdentity: e.target.value})} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)' }} />
              <input type="email" placeholder="E-posta (İsteğe Bağlı)" value={newPatient.email} onChange={e => setNewPatient({...newPatient, email: e.target.value})} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)' }} />
              <select value={newPatient.gender} onChange={e => setNewPatient({...newPatient, gender: e.target.value})} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)' }}>
                <option value="">Cinsiyet (İsteğe Bağlı)</option>
                <option value="Erkek">Erkek</option>
                <option value="Kadın">Kadın</option>
              </select>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-2)', paddingLeft: 4 }}>Doğum Tarihi (İsteğe Bağlı)</label>
                <input type="date" value={newPatient.birthDate} onChange={e => setNewPatient({...newPatient, birthDate: e.target.value})} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)' }} />
              </div>
              
              <div style={{ padding: '12px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>İletişim İzinleri (KVKK)</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!newPatient.smsOptOut} onChange={e => setNewPatient({...newPatient, smsOptOut: !e.target.checked})} />
                  SMS ile bilgilendirilmek istiyorum
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!newPatient.emailOptOut} onChange={e => setNewPatient({...newPatient, emailOptOut: !e.target.checked})} />
                  E-posta ile bilgilendirilmek istiyorum
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!newPatient.whatsappOptOut} onChange={e => setNewPatient({...newPatient, whatsappOptOut: !e.target.checked})} />
                  WhatsApp ile bilgilendirilmek istiyorum
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button onClick={() => setShowAddModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--foreground)', cursor: 'pointer' }}>İptal</button>
              <button onClick={handleAddPatient} style={{ padding: '8px 16px', background: 'var(--brand-color, #2563eb)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
