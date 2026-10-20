'use client'
import React, { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { Trash2, X, AlertCircle } from 'lucide-react'
import PatientProfileCard from './PatientProfileCard'
import Pagination from './Pagination'
import AddPatientModal from './AddPatientModal'
import ConfirmModal from './ConfirmModal'

interface Patient {
  id: string
  name: string
  phone: string | null
  email: string | null
  tcIdentity: string | null
  gender: string | null
  birthDate: string | null
  birthYear: number | null
  balance: number
  createdAt: string
  smsOptOut?: boolean
  emailOptOut?: boolean
  whatsappOptOut?: boolean
}

// Split full name into first name and last name
export const splitFullName = (fullName: string | null | undefined): { firstName: string, lastName: string } => {
  if (!fullName) return { firstName: '—', lastName: '' }
  const clean = fullName.trim()
  const lastSpaceIndex = clean.lastIndexOf(' ')
  if (lastSpaceIndex === -1) {
    return { firstName: clean, lastName: '' }
  }
  return {
    firstName: clean.slice(0, lastSpaceIndex).trim(),
    lastName: clean.slice(lastSpaceIndex + 1).trim()
  }
}

export default function PatientsTab() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  
  // Selection for bulk delete
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([])
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)

  // Confirm Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmText?: string
    variant?: 'danger' | 'warning' | 'primary'
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Evet, Sil',
    variant: 'danger',
    onConfirm: () => {}
  })

  const [showAddModal, setShowAddModal] = useState(false)
  const [excelErrors, setExcelErrors] = useState<string[]>([])
  const [showAllErrors, setShowAllErrors] = useState(false)

  // Edit patient modal state
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [editFormData, setEditFormData] = useState<{
    firstName: string
    lastName: string
    name: string
    phone: string
    email: string
    tcIdentity: string
    gender: string
    birthDate: string
    smsOptOut: boolean
    emailOptOut: boolean
    whatsappOptOut: boolean
  }>({
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
  })

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

  // Helper to normalize header keys for flexible matching
  const normalizeHeader = (str: string) => {
    return str
      .toLocaleLowerCase('tr-TR')
      .replace(/[^a-z0-9]/g, '')
  }

  // Helper to find value from row using multiple potential candidate keys
  const findRowValue = (row: Record<string, any>, candidateKeys: string[]) => {
    const normCandidates = candidateKeys.map(k => normalizeHeader(k))
    for (const rawKey of Object.keys(row)) {
      const normKey = normalizeHeader(rawKey)
      if (normCandidates.includes(normKey)) {
        const val = row[rawKey]
        if (val !== undefined && val !== null) {
          return val
        }
      }
    }
    return undefined
  }

  // Check if an Excel row is completely blank
  const isRowEmpty = (row: Record<string, any>) => {
    if (!row || typeof row !== 'object') return true
    return Object.values(row).every(v => {
      if (v === null || v === undefined) return true
      const s = String(v).trim()
      return s === '' || s === '—' || s === '-' || s.toLowerCase() === 'null'
    })
  }

  const isMeaningfulCellValue = (value: any) => {
    if (value === null || value === undefined) return false
    const text = String(value).trim().toLowerCase()
    return text !== '' && text !== '—' && text !== '-' && text !== 'null' && text !== 'undefined'
  }

  // Safe date parser: supports JS Date, Excel date serials, DD.MM.YYYY, DD/MM/YYYY, ISO strings
  const parseSafeDate = (raw: any): string | null => {
    if (!isMeaningfulCellValue(raw)) return null
    const currentYear = new Date().getFullYear()
    const isValidDate = (date: Date) => !isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= currentYear
    if (raw instanceof Date) {
      return isValidDate(raw) ? raw.toISOString() : null
    }
    // Excel date serial number (e.g. 44197 -> 2021-01-01)
    if (typeof raw === 'number' && raw > 10000 && raw < 100000) {
      const jsDate = new Date(Math.round((raw - 25569) * 86400 * 1000))
      return isValidDate(jsDate) ? jsDate.toISOString() : null
    }
    const str = String(raw).trim()
    if (/^\d{4}$/.test(str)) return null
    // Match Turkish date format DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
    const dmy = str.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/)
    if (dmy) {
      const day = parseInt(dmy[1], 10)
      const month = parseInt(dmy[2], 10) - 1
      const year = parseInt(dmy[3], 10)
      const d = new Date(year, month, day)
      return isValidDate(d) && d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d.toISOString() : null
    }
    const d = new Date(str)
    return isValidDate(d) ? d.toISOString() : null
  }

  const parseBirthYear = (raw: any): number | null => {
    if (!isMeaningfulCellValue(raw)) return null
    const text = String(raw).trim()
    if (!/^\d{4}$/.test(text)) return null
    const year = Number(text)
    return year >= 1900 && year <= new Date().getFullYear() ? year : null
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const bstr = evt.target?.result
      if (!bstr) return
      try {
        // SheetJS is browser-only and pulls a Node `process` shim when loaded
        // at module evaluation time. Keep it out of the panel's initial bundle;
        // the parser is needed only after the user explicitly picks a file.
        const XLSX = await import('xlsx')
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws, { defval: null }) as any[]
        
        setExcelErrors([])
        setShowAllErrors(false)
        const errors: string[] = []
        const mappedPatients: any[] = []

        data.forEach((row, index) => {
          // Entirely blank rows are skipped silently
          if (isRowEmpty(row)) return

          // 1. Separate First Name and Last Name candidate keys
          const rawFirstName = findRowValue(row, [
            'AD', 'Ad', 'Adı', 'Adi', 'FirstName', 'First Name', 'İsim', 'Isim'
          ])
          const rawLastName = findRowValue(row, [
            'SOYAD', 'Soyad', 'Soyadı', 'Soyadi', 'LastName', 'Last Name'
          ])
          const rawFullName = findRowValue(row, [
            'AD SOYAD', 'Ad Soyad', 'Adı Soyadı', 'Hasta Adı', 'Hasta Adı Soyadı',
            'FullName', 'hastaAdiSoyadi'
          ])

          let name = ''
          if (rawFirstName || rawLastName) {
            const f = rawFirstName ? String(rawFirstName).trim() : ''
            const l = rawLastName ? String(rawLastName).trim() : ''
            name = `${f} ${l}`.trim()
          } else if (rawFullName) {
            name = String(rawFullName).trim()
          }

          // Other fields
          const rawPhone = findRowValue(row, [
            'TELEFON', 'Telefon', 'Telefon No', 'Tel', 'GSM', 'Cep', 'Phone', 'Mobile', 'hastaTelefonu'
          ])
          const phoneStr = rawPhone ? String(rawPhone).trim() : ''
          const phone = (phoneStr && phoneStr !== '—' && phoneStr !== '-' && phoneStr.toLowerCase() !== 'null') ? phoneStr : null

          const rawTc = findRowValue(row, [
            'TC KİMLİK', 'TC Kimlik', 'TC Kimlik No', 'TCKİMLİK', 'TCKIMLIK', 'TC NO', 'TC', 'TCKN', 'tcIdentity'
          ])
          const tcStr = rawTc ? String(rawTc).trim() : ''
          const tcIdentity = (tcStr && tcStr !== '—' && tcStr !== '-' && tcStr.toLowerCase() !== 'null') ? tcStr : null

          const rawEmail = findRowValue(row, [
            'E-POSTA', 'Eposta', 'E-Posta', 'Email', 'E-mail', 'Mail'
          ])
          const emailStr = rawEmail ? String(rawEmail).trim() : ''
          const email = (emailStr && emailStr !== '—' && emailStr !== '-' && emailStr.toLowerCase() !== 'null') ? emailStr : null

          const rawGender = findRowValue(row, [
            'CİNSİYET', 'Cinsiyet', 'Cinsiyeti', 'Gender'
          ])
          let gender: string | null = null
          if (rawGender) {
            const gClean = String(rawGender).trim().toLocaleLowerCase('tr-TR')
            if (gClean === 'e' || gClean === 'erkek' || gClean === 'm' || gClean === 'male') gender = 'E'
            else if (gClean === 'k' || gClean === 'kadın' || gClean === 'kadin' || gClean === 'f' || gClean === 'female') gender = 'K'
            else if (gClean !== '—' && gClean !== '-' && gClean !== 'null' && gClean !== '') gender = String(rawGender).trim()
          }

          const rawBirthDate = findRowValue(row, [
            'DOĞUM TARİHİ', 'Doğum Tarihi', 'Dogum Tarihi', 'Doğum Tarih', 'D.Tarihi', 'BirthDate', 'Birth Date'
          ])
          const rawBirthYear = findRowValue(row, [
            'DOĞUM YILI', 'Doğum Yılı', 'Dogum Yili', 'D. Yılı', 'D.Yılı', 'BirthYear', 'Birth Year'
          ])
          let birthDate: string | null | undefined
          let birthYear: number | null | undefined
          if (isMeaningfulCellValue(rawBirthDate)) {
            birthDate = parseSafeDate(rawBirthDate)
            if (birthDate) {
              birthYear = null
            } else {
              errors.push(`${index + 2}. satır: Geçersiz doğum tarihi`)
            }
          } else if (isMeaningfulCellValue(rawBirthYear)) {
            birthYear = parseBirthYear(rawBirthYear)
            if (birthYear) {
              birthDate = null
            } else {
              errors.push(`${index + 2}. satır: Geçersiz doğum yılı`)
            }
          }

          const rawCreatedAt = findRowValue(row, [
            'KAYIT', 'Kayıt', 'Kayıt Tarihi', 'KAYIT TARİHİ', 'Kayit Tarihi', 'Registration Date', 'Tarih', 'CreatedAt'
          ])
          const createdAt = parseSafeDate(rawCreatedAt)

          // CRITICAL EMPTY CHECK:
          // If there is no name:
          if (!name || name === '—' || name === '-' || name.toLowerCase() === 'null') {
            // Only report error if the row has some other meaningful data (phone, tc, email, birthDate)
            const hasOtherData = Boolean(phone || tcIdentity || email || birthDate || birthYear)
            if (hasOtherData) {
              errors.push(`${index + 2}. Satır: İletişim/Kimlik bilgisi var ancak Ad Soyad eksik`)
            }
            // If the row has no name AND no other data, it is just trailing Excel blank rows: skip silently!
            return
          }

          mappedPatients.push({
            name,
            phone,
            tcIdentity,
            email,
            gender,
            ...(birthDate !== undefined || birthYear !== undefined ? { birthDate, birthYear } : {}),
            sourceRow: index + 2,
            ...(createdAt ? { createdAt } : {})
          })
        })

        setExcelErrors(errors)

        if (mappedPatients.length === 0) {
          toast.error('Excel dosyasında geçerli hasta kaydı bulunamadı. Lütfen "AD" veya "AD SOYAD" sütununu kontrol edin.')
          return
        }

        const res = await fetch('/api/dental/patients/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patients: mappedPatients })
        })

        if (res.ok) {
          const result = await res.json()
          const importErrors = Array.isArray(result?.errors) ? result.errors : []
          if (importErrors.length > 0) setExcelErrors([...errors, ...importErrors])
          const ins = result?.insertedCount ?? mappedPatients.length
          const upd = result?.updatedCount ?? 0
          if (ins > 0 && upd > 0) {
            toast.success(`${ins} yeni hasta eklendi, ${upd} mevcut hasta güncellendi!`)
          } else if (ins > 0) {
            toast.success(`${ins} yeni hasta başarıyla eklendi!`)
          } else if (upd > 0) {
            toast.success(`${upd} mevcut hasta güncellendi (mükerrer kopya eklenmedi).`)
          } else {
            toast.success('Kayıtlar incelendi; tüm hastalar zaten güncel olarak mevcut.')
          }
          if (importErrors.length > 0) toast.error(`${importErrors.length} satır güvenlik nedeniyle içe aktarılmadı.`)
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

  // Genel kliniklere uygun Excel şablonu indirme
  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet([
      {
        'AD': 'Sergen',
        'SOYAD': 'Güney',
        'TC KİMLİK': '',
        'TELEFON': '05076652367',
        'CİNSİYET': '',
        'DOĞUM TARİHİ': '',
        'E-POSTA': '',
        'KAYIT': '18.09.2026'
      },
      {
        'AD': 'Ahmet',
        'SOYAD': 'Yılmaz',
        'TC KİMLİK': '12345678901',
        'TELEFON': '05321234567',
        'CİNSİYET': 'Erkek',
        'DOĞUM TARİHİ': '15.05.1990',
        'E-POSTA': 'ahmet@klinik.com',
        'KAYIT': '18.09.2026'
      },
      {
        'AD': 'Ayşe',
        'SOYAD': 'Demir',
        'TC KİMLİK': '98765432109',
        'TELEFON': '05051234567',
        'CİNSİYET': 'Kadın',
        'DOĞUM TARİHİ': '22.11.1985',
        'E-POSTA': 'ayse@klinik.com',
        'KAYIT': '18.09.2026'
      }
    ])
    // Column widths
    ws['!cols'] = [
      { wch: 18 }, // AD
      { wch: 18 }, // SOYAD
      { wch: 16 }, // TC KİMLİK
      { wch: 16 }, // TELEFON
      { wch: 12 }, // CİNSİYET
      { wch: 14 }, // DOĞUM TARİHİ
      { wch: 22 }, // E-POSTA
      { wch: 14 }  // KAYIT
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Klinik_Hasta_Sablon')
    XLSX.writeFile(wb, 'Genel_Klinik_Hasta_Sablonu.xlsx')
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
    const q = searchTerm.toLowerCase()
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q)) ||
      (p.tcIdentity && p.tcIdentity.includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q))
    )
  })

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / pageSize) || 1
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const fmtDate = (d: any) => {
    if (!d) return '—'
    try {
      const dt = new Date(d)
      if (isNaN(dt.getTime())) return '—'
      return dt.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch {
      return '—'
    }
  }

  const fmtBirthInfo = (patient: Patient) => patient.birthDate ? fmtDate(patient.birthDate) : patient.birthYear ? String(patient.birthYear) : '—'

  // Selection toggle
  const toggleSelectPatient = (id: string) => {
    setSelectedPatientIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    const pageIds = paginated.map(p => p.id)
    const isAllSelected = pageIds.every(id => selectedPatientIds.includes(id))
    if (isAllSelected) {
      setSelectedPatientIds(prev => prev.filter(id => !pageIds.includes(id)))
    } else {
      setSelectedPatientIds(prev => Array.from(new Set([...prev, ...pageIds])))
    }
  }

  // Toplu silme işlemi
  const handleBulkDelete = async (ids: string[]) => {
    if (!ids || ids.length === 0) return
    setIsDeletingBulk(true)
    try {
      const res = await fetch('/api/dental/patients/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientIds: ids })
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.deletedCount || ids.length} hasta başarıyla silindi.`)
        setSelectedPatientIds(prev => prev.filter(id => !ids.includes(id)))
        loadPatients()
        if (selectedPatientId && ids.includes(selectedPatientId)) {
          setSelectedPatientId(null)
          setProfileData(null)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error('Hata: ' + (err.error || 'Silme işlemi yapılamadı'))
      }
    } catch (err) {
      console.error(err)
      toast.error('Hastalar silinirken hata oluştu.')
    } finally {
      setIsDeletingBulk(false)
      setConfirmModal(prev => ({ ...prev, isOpen: false }))
    }
  }

  const handleOpenEditModal = (p: Patient) => {
    setEditingPatient(p)
    let bDate = ''
    if (p.birthDate) {
      try {
        bDate = new Date(p.birthDate).toISOString().split('T')[0]
      } catch {
        bDate = String(p.birthDate).slice(0, 10)
      }
    }
    const { firstName, lastName } = splitFullName(p.name)
    setEditFormData({
      firstName,
      lastName,
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
    const fullName = `${editFormData.firstName.trim()} ${editFormData.lastName.trim()}`.trim()
    if (!fullName) {
      toast.error('Hasta adı zorunludur.')
      return
    }

    try {
      const res = await fetch(`/api/dental/patients/${editingPatient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editFormData,
          name: fullName
        })
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

  const isCurrentPageAllSelected = paginated.length > 0 && paginated.every(p => selectedPatientIds.includes(p.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--foreground, #ffffff)', margin: 0 }}>
            Hastalar Yönetimi
          </h2>
          <span className="badge-clinic" style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: 12, fontWeight: 600 }}>
            {patients.length} kayıt
          </span>
        </div>
        
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
            className="btn-clinic-blue"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            title="Genel kliniklere uygun Excel şablonunu indirin"
          >
            ⬇️ Şablon İndir
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-clinic-mint"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            title="Excel dosyasından toplu hasta aktarın"
          >
            📊 Excel İçe Aktar
          </button>
          
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-clinic-primary"
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            ➕ Yeni Hasta Ekle
          </button>

          <input
            type="text"
            placeholder="Ad, soyad, telefon veya TC Kimlik..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1) }}
            style={{
              padding: '8px 12px',
              background: 'var(--input-bg, #0f172a)',
              border: '1px solid var(--input-border, #334155)',
              borderRadius: 8,
              color: 'var(--foreground, #ffffff)',
              fontSize: '0.82rem',
              outline: 'none',
              minWidth: 260
            }}
          />
        </div>
      </div>

      {/* ── Toplu Silme Barı ── */}
      {selectedPatientIds.length > 0 && (
        <div style={{
          padding: '10px 16px',
          background: 'var(--card-bg, #1e293b)',
          border: '1px solid var(--danger, #ef4444)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground, #f8fafc)' }}>
            <span style={{ color: 'var(--danger, #ef4444)', fontWeight: 700 }}>✓</span>
            <span>Toplam <strong>{selectedPatientIds.length}</strong> hasta seçildi.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setSelectedPatientIds([])}
              className="btn-clinic-blue"
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Seçimi Temizle
            </button>
            <button
              type="button"
              disabled={isDeletingBulk}
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  title: 'Toplu Hasta Silme',
                  message: `Seçilen ${selectedPatientIds.length} hastayı ve bu hastalara ait tüm randevu/tedavi geçmişini kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
                  confirmText: `Evet, ${selectedPatientIds.length} Hastayı Sil`,
                  variant: 'danger',
                  onConfirm: () => handleBulkDelete(selectedPatientIds)
                })
              }}
              style={{
                padding: '6px 14px',
                background: '#dc2626',
                border: 'none',
                borderRadius: 6,
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: isDeletingBulk ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Trash2 size={14} />
              {isDeletingBulk ? 'Siliniyor...' : `Seçilen (${selectedPatientIds.length}) Hastayı Sil`}
            </button>
          </div>
        </div>
      )}

      {/* ── Kompakt & UX Uyumlu Hata Bildirim Alanı ── */}
      {excelErrors.length > 0 && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--card-bg, #1e293b)',
          border: '1px solid var(--input-border, #334155)',
          borderLeft: '4px solid var(--danger, #ef4444)',
          borderRadius: 8,
          color: 'var(--foreground, #f8fafc)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} color="var(--danger, #ef4444)" />
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--danger, #ef4444)' }}>
                Excel İçe Aktarma Uyarısı:
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--foreground-2, #cbd5e1)' }}>
                {excelErrors.length} satır eksik bilgi nedeniyle atlandı.
              </span>
            </div>
            <button
              type="button"
              onClick={() => { setExcelErrors([]); setShowAllErrors(false); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3, #94a3b8)', cursor: 'pointer', fontSize: '1rem', padding: '2px 6px', borderRadius: 4 }}
              title="Kapat"
            >
              ✕
            </button>
          </div>

          {/* İlk 5 hata */}
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.8rem', color: 'var(--danger, #f87171)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {excelErrors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
          </ul>

          {/* 5'ten fazla hata varsa açılır/kapanır buton */}
          {excelErrors.length > 5 && (
            <div>
              <button
                type="button"
                onClick={() => setShowAllErrors(!showAllErrors)}
                className="btn-clinic-blue"
                style={{
                  fontSize: '0.74rem',
                  padding: '4px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {showAllErrors ? (
                  <>▲ Hata Listesini Daralt</>
                ) : (
                  <>▼ Kalan {excelErrors.length - 5} Satır Uyarısını Göster</>
                )}
              </button>

              {showAllErrors && (
                <div style={{
                  maxHeight: 180,
                  overflowY: 'auto',
                  padding: '8px 12px',
                  background: 'var(--input-bg, #0f172a)',
                  borderRadius: 6,
                  border: '1px solid var(--input-border, #334155)',
                  marginTop: 6
                }}>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.8rem', color: 'var(--danger, #f87171)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {excelErrors.slice(5).map((err, i) => <li key={i + 5}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--foreground-3, #94a3b8)' }}>Yükleniyor...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--foreground-3, #94a3b8)', background: 'var(--card-bg, #1e293b)', borderRadius: 12, border: '1px solid var(--input-border, #334155)' }}>
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
                    <th style={{ padding: '0.8rem 0.5rem 0.8rem 1rem', width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isCurrentPageAllSelected}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer' }}
                        title="Sayfadaki tüm hastaları seç/kaldır"
                      />
                    </th>
                    <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-2, #cbd5e1)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Ad</th>
                    <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-2, #cbd5e1)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Soyad</th>
                    <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-2, #cbd5e1)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>TC Kimlik</th>
                    <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-2, #cbd5e1)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Telefon</th>
                    <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-2, #cbd5e1)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Cinsiyet</th>
                    <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-2, #cbd5e1)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Doğum Bilgisi</th>
                    <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-2, #cbd5e1)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Kayıt</th>
                    <th style={{ padding: '0.8rem 1rem', textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-2, #cbd5e1)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((p, i) => {
                    const { firstName, lastName } = splitFullName(p.name)
                    const isSelected = selectedPatientIds.includes(p.id)

                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedPatientId(selectedPatientId === p.id ? null : p.id)}
                        style={{
                          borderBottom: i < paginated.length - 1 ? '1px solid var(--divider, #334155)' : 'none',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                          background: isSelected 
                            ? 'rgba(239, 68, 68, 0.12)' 
                            : selectedPatientId === p.id 
                              ? 'rgba(59, 130, 246, 0.12)' 
                              : 'transparent'
                        }}
                      >
                        <td style={{ padding: '0.8rem 0.5rem 0.8rem 1rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectPatient(p.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '0.8rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground, #ffffff)' }}>
                          {firstName}
                        </td>
                        <td style={{ padding: '0.8rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent, #3b82f6)' }}>
                          {lastName || '—'}
                        </td>
                        <td style={{ padding: '0.8rem 0.75rem', fontSize: '0.84rem', color: 'var(--foreground-3, #94a3b8)' }}>
                          {p.tcIdentity || '—'}
                        </td>
                        <td style={{ padding: '0.8rem 0.75rem', fontSize: '0.84rem', color: 'var(--foreground-3, #94a3b8)' }}>
                          {p.phone || '—'}
                        </td>
                        <td style={{ padding: '0.8rem 0.75rem', fontSize: '0.84rem', color: 'var(--foreground-3, #94a3b8)' }}>
                          {p.gender === 'E' ? 'Erkek' : p.gender === 'K' ? 'Kadın' : p.gender || '—'}
                        </td>
                        <td style={{ padding: '0.8rem 0.75rem', fontSize: '0.84rem', color: 'var(--foreground-3, #94a3b8)' }}>
                          {fmtBirthInfo(p)}
                        </td>
                        <td style={{ padding: '0.8rem 0.75rem', fontSize: '0.84rem', color: 'var(--foreground-3, #94a3b8)' }}>
                          {fmtDate(p.createdAt)}
                        </td>
                        <td style={{ padding: '0.8rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(p)}
                            className="btn-clinic-blue"
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              marginRight: 6
                            }}
                          >
                            ✏️ Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Hastayı Sil',
                                message: `"${p.name}" isimli hastayı ve bu hastaya ait tüm geçmiş kayıtları silmek istediğinizden emin misiniz?`,
                                confirmText: 'Evet, Sil',
                                variant: 'danger',
                                onConfirm: () => handleBulkDelete([p.id])
                              })
                            }}
                            style={{
                              padding: '4px 8px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: 6,
                              color: '#f87171',
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              marginRight: 8
                            }}
                            title="Hastayı kalıcı olarak sil"
                          >
                            <Trash2 size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                          </button>
                          <span 
                            onClick={() => setSelectedPatientId(selectedPatientId === p.id ? null : p.id)}
                            style={{ fontSize: '0.78rem', color: '#60a5fa', fontWeight: 500, cursor: 'pointer' }}
                          >
                            Detay &rarr;
                          </span>
                        </td>
                      </tr>
                    )
                  })}
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
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--foreground, #ffffff)', margin: 0 }}>Hasta Detayı</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {profileData?.patient && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(profileData.patient)}
                      className="btn-clinic-blue"
                      style={{
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
                    style={{ background: 'none', border: 'none', color: 'var(--foreground-3, #94a3b8)', cursor: 'pointer', fontSize: '1.1rem' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              
              <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {profileLoading ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-3, #94a3b8)' }}>Profil yükleniyor...</div>
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

      {/* ── Hasta Düzenle Modalı (Ad ve Soyad Ayrı) ─────────────────────────── */}
      {editingPatient && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg, #1e293b)', padding: '1.5rem', borderRadius: 14, border: '1px solid var(--input-border, #334155)', width: 440, maxWidth: '92vw', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: 'var(--foreground, #ffffff)', fontSize: '1.1rem', fontWeight: 700 }}>Hasta Bilgilerini Düzenle</h3>
              <button
                type="button"
                onClick={() => setEditingPatient(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.1rem' }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>
                    Ad <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ad"
                    value={editFormData.firstName}
                    onChange={e => setEditFormData({...editFormData, firstName: e.target.value})}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground, #ffffff)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>
                    Soyad <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Soyad"
                    value={editFormData.lastName}
                    onChange={e => setEditFormData({...editFormData, lastName: e.target.value})}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground, #ffffff)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
              
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>Telefon</label>
                <input type="text" placeholder="05XXXXXXXXX" value={editFormData.phone} onChange={e => setEditFormData({...editFormData, phone: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground, #ffffff)', fontSize: '0.85rem' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>TC Kimlik No</label>
                <input type="text" placeholder="TC Kimlik No" value={editFormData.tcIdentity} onChange={e => setEditFormData({...editFormData, tcIdentity: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground, #ffffff)', fontSize: '0.85rem' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>E-posta</label>
                <input type="email" placeholder="ornek@email.com" value={editFormData.email} onChange={e => setEditFormData({...editFormData, email: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground, #ffffff)', fontSize: '0.85rem' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>Cinsiyet</label>
                <select value={editFormData.gender} onChange={e => setEditFormData({...editFormData, gender: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground, #ffffff)', fontSize: '0.85rem' }}>
                  <option value="">Belirtilmedi</option>
                  <option value="Erkek">Erkek</option>
                  <option value="Kadın">Kadın</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-3, #94a3b8)', marginBottom: 4, display: 'block', fontWeight: 500 }}>Doğum Tarihi</label>
                <input type="date" value={editFormData.birthDate} onChange={e => setEditFormData({...editFormData, birthDate: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--input-border, #334155)', background: 'var(--input-bg, #0f172a)', color: 'var(--foreground, #ffffff)', fontSize: '0.85rem' }} />
              </div>
              
              <div style={{ padding: '12px', borderRadius: 8, border: '1px solid var(--divider, #334155)', background: 'var(--background-2, #0f172a)', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground, #ffffff)' }}>İletişim İzinleri (KVKK)</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2, #cbd5e1)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!editFormData.smsOptOut} onChange={e => setEditFormData({...editFormData, smsOptOut: !e.target.checked})} />
                  SMS ile bilgilendirilmek istiyorum
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2, #cbd5e1)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!editFormData.emailOptOut} onChange={e => setEditFormData({...editFormData, emailOptOut: !e.target.checked})} />
                  E-posta ile bilgilendirilmek istiyorum
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--foreground-2, #cbd5e1)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!editFormData.whatsappOptOut} onChange={e => setEditFormData({...editFormData, whatsappOptOut: !e.target.checked})} />
                  WhatsApp ile bilgilendirilmek istiyorum
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setEditingPatient(null)} className="btn-clinic-blue" style={{ padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>İptal</button>
              <button onClick={handleSaveEditPatient} className="btn-clinic-primary" style={{ padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Değişiklikleri Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Onay Modalı (Tekil veya Toplu Silme) ── */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
