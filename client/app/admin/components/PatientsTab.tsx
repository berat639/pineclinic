'use client'
import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'react-hot-toast'
import PatientProfileCard from './PatientProfileCard'
import Pagination from './Pagination'
import AddPatientModal from './AddPatientModal'

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

  const [editingPatient, setEditingPatient] = useState<any | null>(null)
  const [editFormData, setEditFormData] = useState({ name: '', phone: '', email: '', tcIdentity: '', gender: '', birthDate: '', smsOptOut: false, emailOptOut: false, whatsappOptOut: false })

  const handleOpenEditModal = (p: any) => {
    setEditingPatient(p)
    let bDate = ''
    if (p.birthDate) {
      try {
        bDate = new Date(p.birthDate).toISOString().split('T')[0]
      } catch {
        bDate = String(p.birthDate).slice(0, 10)
      }
    }
    setEditFormData({
      name: p.name || '',
      phone: p.phone || '',
      email: p.email || '',
      tcIdentity: p.tcIdentity || '',
      gender: p.gender || '',
      birthDate: bDate,
      smsOptOut: Boolean(p.smsOptOut),
      emailOptOut: Boolean(p.emailOptOut),
      whatsappOptOut: Boolean(p.whatsappOptOut),
    })
  }

  const handleSaveEditPatient = async () => {
    if (!editingPatient) return
    if (!editFormData.name.trim()) {
      toast.error('Hasta adı zorunludur.')
      return
    }

    try {
      const res = await fetch(`/api/dental/patients/${editingPatient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      })

      if (res.ok) {
        toast.success('Hasta bilgileri başarıyla güncellendi!')
        setEditingPatient(null)
        loadPatients()
        if (selectedPatientId === editingPatient.id) {
          fetch(`/api/dental/patients/${selectedPatientId}/profile`)
            .then(r => r.json())
            .then(d => { if (!d.error) setProfileData(d) })
            .catch(() => {})
        }
      } else {
        const err = await res.json()
        toast.error('Hata: ' + (err.error || 'Güncelleme yapılamadı'))
      }
    } catch (err) {
      console.error(err)
      toast.error('Hasta güncellenirken bir hata oluştu.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Hastalar Yönetimi</h2>
        
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
              padding: '8px 14px', background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 8,
              color: '#60a5fa', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            ⬇️ Şablon İndir
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '8px 14px', background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 8,
              color: '#4ade80', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
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
              color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
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
              padding: '8px 12px', background: 'var(--input-bg, #0f172a)',
              border: '1px solid var(--input-border, #334155)', borderRadius: 8,
              color: 'var(--foreground)', fontSize: '0.82rem', outline: 'none',
              minWidth: 260
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
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--foreground-3)', background: 'var(--card-bg, #1e293b)', borderRadius: 12, border: '1px solid var(--input-border, #334155)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
          <div>Hasta bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedPatientId ? '1fr 420px' : '1fr', gap: '1.25rem', alignItems: 'start' }}>
          
          <div style={{ background: 'var(--card-bg, #1e293b)', borderRadius: 12, border: '1px solid var(--input-border, #334155)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--divider, #334155)', background: 'var(--background-2, #0f172a)' }}>
                    {['Ad Soyad', 'TC Kimlik', 'Telefon', 'Cinsiyet', 'Doğum Tarihi', 'Kayıt', 'İşlemler'].map((h, i) => (
                      <th key={i} style={{ padding: '0.8rem 1rem', textAlign: h === 'İşlemler' ? 'right' : 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-2)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((p, i) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPatientId(selectedPatientId === p.id ? null : p.id)}
                      style={{
                        borderBottom: i < paginated.length - 1 ? '1px solid var(--divider, #334155)' : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                        background: selectedPatientId === p.id ? 'rgba(59,130,246,0.12)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '0.8rem 1rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
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
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenEditModal(p)
                          }}
                          style={{
                            padding: '4px 10px',
                            background: 'rgba(59,130,246,0.15)',
                            border: '1px solid rgba(59,130,246,0.3)',
                            borderRadius: 6,
                            color: '#60a5fa',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginRight: 8
                          }}
                        >
                          ✏️ Düzenle
                        </button>
                        <span style={{ fontSize: '0.78rem', color: '#60a5fa', fontWeight: 500 }}>Detay &rarr;</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ padding: '1rem', borderTop: '1px solid var(--divider, #334155)', display: 'flex', justifyContent: 'center' }}>
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={setPageSize} />
            </div>
          </div>

          {selectedPatientId && (
            <div style={{ background: 'var(--card-bg, #1e293b)', borderRadius: 12, border: '1px solid var(--input-border, #334155)', padding: '1.2rem', position: 'sticky', top: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--divider, #334155)', paddingBottom: 10 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Hasta Detayı</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {profileData?.patient && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(profileData.patient)}
                      style={{
                        background: 'rgba(59,130,246,0.15)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        color: '#60a5fa',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      ✏️ Düzenle
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedPatientId(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.1rem' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              
              <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {profileLoading ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-3)' }}>Profil yükleniyor...</div>
                ) : profileData ? (
                  <PatientProfileCard profile={profileData} onEdit={handleOpenEditModal} />
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>Profil yüklenemedi.</div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Yeni Hasta Ekle Modalı ─────────────────────────────────────────── */}
      <AddPatientModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => loadPatients()}
      />

      {/* ── Hasta Düzenle Modalı ─────────────────────────────────────────── */}
      {editingPatient && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg, #1e293b)', padding: '1.5rem', borderRadius: 14, border: '1px solid var(--input-border, #334155)', width: 440, maxWidth: '92vw', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--foreground)', fontSize: '1.1rem', fontWeight: 700 }}>Hasta Bilgilerini Düzenle</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4, display: 'block', fontWeight: 500 }}>Ad Soyad (Zorunlu)</label>
                <input type="text" placeholder="Ad Soyad" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground)', fontSize: '0.85rem' }} />
              </div>
              
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4, display: 'block', fontWeight: 500 }}>Telefon</label>
                <input type="text" placeholder="05XXXXXXXXX" value={editFormData.phone} onChange={e => setEditFormData({...editFormData, phone: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground)', fontSize: '0.85rem' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4, display: 'block', fontWeight: 500 }}>TC Kimlik No</label>
                <input type="text" placeholder="TC Kimlik No" value={editFormData.tcIdentity} onChange={e => setEditFormData({...editFormData, tcIdentity: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground)', fontSize: '0.85rem' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4, display: 'block', fontWeight: 500 }}>E-posta</label>
                <input type="email" placeholder="ornek@email.com" value={editFormData.email} onChange={e => setEditFormData({...editFormData, email: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground)', fontSize: '0.85rem' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4, display: 'block', fontWeight: 500 }}>Cinsiyet</label>
                <select value={editFormData.gender} onChange={e => setEditFormData({...editFormData, gender: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground)', fontSize: '0.85rem' }}>
                  <option value="">Belirtilmedi</option>
                  <option value="Erkek">Erkek</option>
                  <option value="Kadın">Kadın</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4, display: 'block', fontWeight: 500 }}>Doğum Tarihi</label>
                <input type="date" value={editFormData.birthDate} onChange={e => setEditFormData({...editFormData, birthDate: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground)', fontSize: '0.85rem' }} />
              </div>
              
              <div style={{ padding: '12px', borderRadius: 8, border: '1px solid var(--divider, #334155)', background: 'var(--background-2, #0f172a)', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>İletişim İzinleri (KVKK)</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!editFormData.smsOptOut} onChange={e => setEditFormData({...editFormData, smsOptOut: !e.target.checked})} />
                  SMS ile bilgilendirilmek istiyorum
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!editFormData.emailOptOut} onChange={e => setEditFormData({...editFormData, emailOptOut: !e.target.checked})} />
                  E-posta ile bilgilendirilmek istiyorum
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!editFormData.whatsappOptOut} onChange={e => setEditFormData({...editFormData, whatsappOptOut: !e.target.checked})} />
                  WhatsApp ile bilgilendirilmek istiyorum
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setEditingPatient(null)} style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--input-border, #334155)', borderRadius: 8, color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.85rem' }}>İptal</button>
              <button onClick={handleSaveEditPatient} style={{ padding: '9px 18px', background: 'var(--brand-color, #2563eb)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Değişiklikleri Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
