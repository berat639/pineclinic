import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileCheck2, FileText, Printer, ShieldAlert, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import {
  buildOfficialConsentDataFromPlan,
  downloadOfficialDentalConsentPdf,
  printOfficialDentalConsent,
  resolveRelevantConsentClauses,
  type OfficialConsentDocumentData,
} from '../../../lib/official-dental-consent'

export interface OfficialDentalConsentModalProps {
  open: boolean
  mode?: 'preview' | 'save-warning'
  patientName?: string
  patient?: any
  event?: any
  doctors?: any[]
  groupedRows?: any[]
  subtotalFormatted?: string
  discountFormatted?: string
  totalFormatted?: string
  saving?: boolean
  onClose: () => void
  onConfirmAndSave: (options?: { consentObtained: boolean; actionTaken: 'pdf' | 'print' | 'confirmed' | 'skipped' }) => void
}

export default function OfficialDentalConsentModal({
  open,
  mode = 'save-warning',
  patientName,
  patient,
  event,
  doctors,
  groupedRows,
  subtotalFormatted,
  discountFormatted,
  totalFormatted,
  saving = false,
  onClose,
  onConfirmAndSave,
}: OfficialDentalConsentModalProps) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)

  const initialData = useMemo(
    () =>
      buildOfficialConsentDataFromPlan({
        patientName,
        patient,
        event,
        doctors,
        groupedRows,
        subtotalFormatted,
        discountFormatted,
        totalFormatted,
      }),
    [patientName, patient, event, doctors, groupedRows, subtotalFormatted, discountFormatted, totalFormatted]
  )

  const [formData, setFormData] = useState<OfficialConsentDocumentData>(initialData)
  const [consentActionCompleted, setConsentActionCompleted] = useState(false)
  const [lastDownloadedFile, setLastDownloadedFile] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setFormData(initialData)
    }
  }, [open, initialData])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const activeClauses = resolveRelevantConsentClauses(
    formData.treatments,
    formData.includeAllMinistryClauses
  )

  const handleDownloadPdf = () => {
    const fileName = downloadOfficialDentalConsentPdf(formData)
    setConsentActionCompleted(true)
    setLastDownloadedFile(fileName)
    toast.success(`Resmi Aydınlatılmış Onam Belgesi (PDF) indirildi: ${fileName}`, {
      id: 'official-consent-pdf-toast',
    })
  }

  const handlePrintForm = () => {
    const ok = printOfficialDentalConsent(formData)
    setConsentActionCompleted(true)
    if (ok) {
      toast.success('Resmi Aydınlatılmış Onam (Rıza) Belgesi yazdırma penceresi açıldı.', {
        id: 'official-consent-print-toast',
      })
    } else {
      toast.error('Yazdırma penceresi açılamadı. Lütfen PDF İndir seçeneğini kullanın.')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 33,
    padding: '5px 10px',
    borderRadius: 8,
    border: '1px solid var(--input-border, #cbd5e1)',
    background: 'var(--input-bg, #ffffff)',
    color: 'var(--foreground, #0f172a)',
    boxShadow: 'var(--pc-neo-inset)',
    fontSize: 12.5,
    fontWeight: 600,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11.5,
    fontWeight: 700,
    color: 'var(--foreground-2, #475569)',
    marginBottom: 4,
  }

  return (
    <div
      role="presentation"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100020,
        background: 'var(--modal-overlay, rgba(15, 23, 42, 0.6))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14px',
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          width: 'min(920px, calc(100vw - 24px))',
          maxWidth: 920,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 16,
          background: 'var(--card-bg, #ffffff)',
          color: 'var(--foreground, #0f172a)',
          border: '1.5px solid var(--input-border, #cbd5e1)',
          boxShadow: 'var(--pc-modal-shadow)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 18px',
            background: 'var(--pc-surface, var(--card-bg))',
            borderBottom: '1px solid var(--pc-border, var(--input-border))',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--pc-clay-primary)',
                flexShrink: 0,
              }}
            >
              <FileText size={19} style={{ color: '#ffffff' }} />
            </div>
            <div>
              <h2
                id={titleId}
                style={{
                  margin: 0,
                  fontSize: '1.02rem',
                  fontWeight: 800,
                  color: 'var(--foreground)',
                  lineHeight: 1.25,
                }}
              >
                T.C. Sağlık Bakanlığı Uyumlu Diş Hekimliği Aydınlatılmış Onam (Rıza) Belgesi
              </h2>
              <div style={{ fontSize: 12, color: 'var(--foreground-2)', fontWeight: 600, marginTop: 2 }}>
                Doküman Kodu: {formData.documentCode} · Protokol: {formData.protocolNo} · Hasta: {formData.patientName}
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Onam penceresini kapat"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: 'var(--pc-clay-btn)',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Warning Banner Before Accepting / Saving Treatment */}
        <div
          role="region"
          aria-label="Tedavi öncesi resmi onam uyarısı"
          style={{
            margin: '12px 18px 0',
            padding: '11px 14px',
            borderRadius: 12,
            background: 'var(--pc-tint, #eff6ff)',
            border: '1.5px solid var(--pc-blue, #2563eb)',
            boxShadow: 'var(--pc-neo-subcard)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 11,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            {mode === 'save-warning' ? (
              <AlertTriangle size={16} style={{ color: '#ffffff' }} />
            ) : (
              <ShieldAlert size={16} style={{ color: '#ffffff' }} />
            )}
          </div>
          <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45, color: 'var(--foreground)' }}>
            <div style={{ fontWeight: 800, color: 'var(--pc-tint-fg, var(--foreground))', marginBottom: 2 }}>
              ⚠️ Tedaviyi Kabul Etmeden / Kaydetmeden Önce Aydınlatılmış Onam (Rıza Belgesi) Uyarısı
            </div>
            <div style={{ color: 'var(--foreground-2)' }}>
              T.C. Sağlık Bakanlığı Hasta Hakları Yönetmeliği (Madde 22–31) ve 1219 sayılı Kanun gereğince, diş hekimliği girişimsel işlem ve tedavilerine başlamadan önce hastadan ıslak imzalı{' '}
              <strong style={{ color: 'var(--foreground)' }}>Aydınlatılmış Rıza Belgesi (Onam Formu)</strong> alınması zorunludur. Aşağıdan hastanın tedavi planına göre otomatik doldurulmuş resmi formu{' '}
              <strong style={{ color: 'var(--foreground)' }}>PDF olarak indirebilir</strong> veya{' '}
              <strong style={{ color: 'var(--foreground)' }}>doğrudan yazdırabilirsiniz</strong>.
            </div>
            {consentActionCompleted && (
              <div
                style={{
                  marginTop: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  color: '#15803d',
                  fontWeight: 700,
                  fontSize: 11.5,
                }}
              >
                <CheckCircle2 size={13} />
                <span>
                  {lastDownloadedFile
                    ? `Resmi Onam PDF hazırlandı (${lastDownloadedFile})`
                    : 'Resmi Onam Formu yazdırma / indirme işlemi gerçekleştirildi'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Body: Quick Form Inputs + Official Ministry Document Preview */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 18px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Editable Quick Metadata Bar */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: 'var(--card-inner, var(--pc-surface))',
              border: '1px solid var(--pc-border, var(--input-border))',
              boxShadow: 'var(--pc-neo-subcard)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <strong style={{ fontSize: 12.5, color: 'var(--foreground)' }}>
                Belge Üzerinde Yer Alacak Hasta ve Klinik Bilgileri (İsteğe Bağlı Düzenlenebilir)
              </strong>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--pc-tint-fg)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(formData.includeAllMinistryClauses)}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      includeAllMinistryClauses: e.target.checked,
                    }))
                  }
                />
                <span>Tüm Branş Aydınlatma Maddelerini Göster (Tam Metin)</span>
              </label>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
                gap: 10,
              }}
            >
              <div>
                <label htmlFor="consent-tc-input" style={labelStyle}>
                  T.C. Kimlik / Pasaport No
                </label>
                <input
                  id="consent-tc-input"
                  type="text"
                  maxLength={14}
                  placeholder="Örn: 12345678901"
                  style={inputStyle}
                  value={formData.tcKimlikNo}
                  onChange={e => setFormData(prev => ({ ...prev, tcKimlikNo: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="consent-phone-input" style={labelStyle}>
                  Hasta Telefon Numarası
                </label>
                <input
                  id="consent-phone-input"
                  type="text"
                  placeholder="Örn: 0532 000 00 00"
                  style={inputStyle}
                  value={formData.phone}
                  onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="consent-doctor-input" style={labelStyle}>
                  Aydınlatan / Sorumlu Diş Hekimi
                </label>
                <input
                  id="consent-doctor-input"
                  type="text"
                  placeholder="Diş Hekimi Adı Soyadı"
                  style={inputStyle}
                  value={formData.doctorName}
                  onChange={e => setFormData(prev => ({ ...prev, doctorName: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="consent-clinic-input" style={labelStyle}>
                  Sağlık Kuruluşu / Poliklinik Adı
                </label>
                <input
                  id="consent-clinic-input"
                  type="text"
                  placeholder="Ağız ve Diş Sağlığı Polikliniği"
                  style={inputStyle}
                  value={formData.clinicName}
                  onChange={e => setFormData(prev => ({ ...prev, clinicName: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="consent-medical-input" style={labelStyle}>
                  Sistemik Hastalık / Anamnez Beyanı
                </label>
                <input
                  id="consent-medical-input"
                  type="text"
                  placeholder="Sistemik hastalık bilgisi"
                  style={inputStyle}
                  value={formData.medicalConditions}
                  onChange={e => setFormData(prev => ({ ...prev, medicalConditions: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="consent-allergy-input" style={labelStyle}>
                  İlaç / Lokal Anestezik Alerjisi
                </label>
                <input
                  id="consent-allergy-input"
                  type="text"
                  placeholder="Alerji durumu"
                  style={inputStyle}
                  value={formData.allergies}
                  onChange={e => setFormData(prev => ({ ...prev, allergies: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="consent-guardian-input" style={labelStyle}>
                  Yasal Temsilci / Veli Adı (Gerekliyse)
                </label>
                <input
                  id="consent-guardian-input"
                  type="text"
                  placeholder="18 yaş altı ise Veli/Vasi"
                  style={inputStyle}
                  value={formData.guardianName}
                  onChange={e => setFormData(prev => ({ ...prev, guardianName: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="consent-notes-input" style={labelStyle}>
                  Hekim Özel Notu / Ek Açıklama
                </label>
                <input
                  id="consent-notes-input"
                  type="text"
                  placeholder="Varsa özel klinik not"
                  style={inputStyle}
                  value={formData.specialNotes}
                  onChange={e => setFormData(prev => ({ ...prev, specialNotes: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Official Ministry Document A4 Preview Card */}
          <div
            aria-label="Resmi Rıza Belgesi Önizlemesi"
            style={{
              padding: '16px 18px',
              borderRadius: 12,
              background: 'var(--card-bg)',
              border: '2px solid var(--input-border)',
              boxShadow: 'var(--pc-neo-card)',
              fontSize: 12,
              lineHeight: 1.48,
              color: 'var(--foreground)',
            }}
          >
            {/* Official Ministry Header Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.1fr 2.2fr 1.1fr',
                border: '1.5px solid var(--input-border)',
                borderRadius: 8,
                overflow: 'hidden',
                marginBottom: 10,
                background: 'var(--card-inner, var(--pc-surface))',
              }}
            >
              <div
                style={{
                  padding: '10px',
                  borderRight: '1px solid var(--input-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: '1.5px solid #dc2626',
                    color: '#dc2626',
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: '0.03em',
                    marginBottom: 4,
                  }}
                >
                  T.C. SAĞLIK BAKANLIĞI SKS
                </span>
                <strong style={{ fontSize: 11.5, color: 'var(--foreground)' }}>{formData.clinicName}</strong>
                <span style={{ fontSize: 10.5, color: 'var(--foreground-2)' }}>Ağız ve Diş Sağlığı Hizmetleri</span>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRight: '1px solid var(--input-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--pc-tint-fg)' }}>
                  T.C. SAĞLIK BAKANLIĞI &amp; TDB STANDARTLARINA UYGUN
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--foreground)', margin: '2px 0' }}>
                  DİŞ HEKİMLİĞİ AYDINLATILMIŞ ONAM (RIZA) BELGESİ
                </div>
                <div style={{ fontSize: 11, color: 'var(--foreground-2)', fontWeight: 600 }}>
                  Genel Muayene, Lokal Anestezi ve Girişimsel Diş Tedavileri Hasta Rıza Formu
                </div>
              </div>

              <div style={{ padding: '8px 10px', fontSize: 11, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
                <div>
                  <strong style={{ color: 'var(--foreground-2)' }}>Doküman No:</strong>{' '}
                  <strong style={{ color: 'var(--foreground)' }}>{formData.documentCode}</strong>
                </div>
                <div>
                  <strong style={{ color: 'var(--foreground-2)' }}>Yayın Tarihi:</strong>{' '}
                  <span>{formData.publishDate}</span>
                </div>
                <div>
                  <strong style={{ color: 'var(--foreground-2)' }}>Revizyon:</strong>{' '}
                  <span>{formData.revisionNo}</span>
                </div>
                <div>
                  <strong style={{ color: 'var(--foreground-2)' }}>Protokol No:</strong>{' '}
                  <strong style={{ color: 'var(--foreground)' }}>{formData.protocolNo}</strong>
                </div>
              </div>
            </div>

            {/* Bölüm 1 & 2 Summary Grid */}
            <div
              style={{
                padding: '6px 10px',
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 11.5,
                borderRadius: '6px 6px 0 0',
              }}
            >
              BÖLÜM 1 &amp; 2 — HASTA KİMLİK VE TIBBİ ANAMNEZ BİLGİLERİ
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                border: '1px solid var(--input-border)',
                borderTop: 'none',
                marginBottom: 10,
                background: 'var(--pc-surface)',
              }}
            >
              <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--input-border)', borderRight: '1px solid var(--input-border)' }}>
                <span style={{ color: 'var(--foreground-2)', fontWeight: 700 }}>Hasta Adı Soyadı: </span>
                <strong style={{ color: 'var(--foreground)' }}>{formData.patientName}</strong>
              </div>
              <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--input-border)', borderRight: '1px solid var(--input-border)' }}>
                <span style={{ color: 'var(--foreground-2)', fontWeight: 700 }}>T.C. Kimlik No: </span>
                <strong style={{ color: 'var(--foreground)' }}>{formData.tcKimlikNo || 'Belirtilmedi'}</strong>
              </div>
              <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--input-border)' }}>
                <span style={{ color: 'var(--foreground-2)', fontWeight: 700 }}>Telefon: </span>
                <strong style={{ color: 'var(--foreground)' }}>{formData.phone || 'Belirtilmedi'}</strong>
              </div>
              <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--input-border)', borderRight: '1px solid var(--input-border)' }}>
                <span style={{ color: 'var(--foreground-2)', fontWeight: 700 }}>Sorumlu Diş Hekimi: </span>
                <strong style={{ color: 'var(--foreground)' }}>{formData.doctorName}</strong>
              </div>
              <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--input-border)', borderRight: '1px solid var(--input-border)' }}>
                <span style={{ color: 'var(--foreground-2)', fontWeight: 700 }}>Sistemik Anamnez: </span>
                <span>{formData.medicalConditions}</span>
              </div>
              <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--input-border)' }}>
                <span style={{ color: 'var(--foreground-2)', fontWeight: 700 }}>Alerji Durumu: </span>
                <span>{formData.allergies}</span>
              </div>
            </div>

            {/* Bölüm 3 — Planned Dental Procedures Table */}
            <div
              style={{
                padding: '6px 10px',
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 11.5,
                borderRadius: '6px 6px 0 0',
              }}
            >
              BÖLÜM 3 — PLANLANAN DİŞ HEKİMLİĞİ TANI VE TEDAVİ İŞLEMLERİ TABLOSU ({formData.treatments.length} Kalem)
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: '1px solid var(--input-border)',
                  fontSize: 11.5,
                }}
              >
                <thead>
                  <tr style={{ background: 'var(--card-inner, var(--pc-surface))' }}>
                    <th style={{ padding: '6px 8px', border: '1px solid var(--input-border)', textAlign: 'center', width: 38 }}>No</th>
                    <th style={{ padding: '6px 8px', border: '1px solid var(--input-border)', textAlign: 'left' }}>Diş No / Bölge</th>
                    <th style={{ padding: '6px 8px', border: '1px solid var(--input-border)', textAlign: 'left' }}>Tanı / Endikasyon</th>
                    <th style={{ padding: '6px 8px', border: '1px solid var(--input-border)', textAlign: 'left' }}>Planlanan İşlem / Tedavi</th>
                    <th style={{ padding: '6px 8px', border: '1px solid var(--input-border)', textAlign: 'left' }}>Sorumlu Hekim</th>
                    <th style={{ padding: '6px 8px', border: '1px solid var(--input-border)', textAlign: 'right' }}>Tahmini Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.treatments.length > 0 ? (
                    formData.treatments.map((row, idx) => (
                      <tr key={`${row.toothLabel}-${row.procedureName}-${idx}`}>
                        <td style={{ padding: '6px 8px', border: '1px solid var(--input-border)', textAlign: 'center', fontWeight: 700 }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '6px 8px', border: '1px solid var(--input-border)', fontWeight: 700 }}>
                          {row.toothLabel}
                        </td>
                        <td style={{ padding: '6px 8px', border: '1px solid var(--input-border)' }}>
                          {row.indications}
                        </td>
                        <td style={{ padding: '6px 8px', border: '1px solid var(--input-border)', fontWeight: 700 }}>
                          {row.procedureName}
                        </td>
                        <td style={{ padding: '6px 8px', border: '1px solid var(--input-border)' }}>
                          {row.doctorName}
                        </td>
                        <td style={{ padding: '6px 8px', border: '1px solid var(--input-border)', textAlign: 'right', fontWeight: 700 }}>
                          {row.amountFormatted}
                          {row.unitNote && (
                            <div style={{ fontSize: 10, color: 'var(--foreground-2)', fontWeight: 500 }}>({row.unitNote})</div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: '10px', textAlign: 'center', color: 'var(--foreground-2)' }}>
                        Genel Diş Hekimliği Muayene ve Tedavi Planlaması
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--card-inner, var(--pc-surface))' }}>
                    <td colSpan={5} style={{ padding: '7px 10px', border: '1px solid var(--input-border)', textAlign: 'right', fontWeight: 700 }}>
                      Ara Toplam: {formData.subtotalFormatted}
                      {formData.discountFormatted && formData.discountFormatted !== '0 ₺'
                        ? ` · Toplam İskonto: −${formData.discountFormatted}`
                        : ''}{' '}
                      · <strong>GENEL TOPLAM:</strong>
                    </td>
                    <td style={{ padding: '7px 10px', border: '1px solid var(--input-border)', textAlign: 'right', fontWeight: 900, fontSize: 12.5 }}>
                      {formData.totalFormatted}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Bölüm 4 — Official Ministry Clauses */}
            <div
              style={{
                padding: '6px 10px',
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 11.5,
                borderRadius: '6px 6px 0 0',
              }}
            >
              BÖLÜM 4 — T.C. SAĞLIK BAKANLIĞI STANDART RIZA BELGESİ TIBBİ AYDINLATMA MADDELERİ ({activeClauses.length} Bölüm)
            </div>
            <div
              style={{
                border: '1px solid var(--input-border)',
                borderTop: 'none',
                padding: '8px 10px',
                marginBottom: 10,
                background: 'var(--pc-surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {activeClauses.map(clause => (
                <div
                  key={clause.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--card-bg)',
                    border: '1px solid var(--pc-border, var(--input-border))',
                    fontSize: 11.3,
                  }}
                >
                  <div style={{ fontWeight: 800, color: 'var(--pc-tint-fg)', marginBottom: 4 }}>
                    {clause.code} — {clause.title}
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    <strong>• İşlemin Amacı ve Yöntemi:</strong> {clause.purposeAndMethod}
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    <strong>• Alternatif Tedavi Seçenekleri:</strong> {clause.alternatives}
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    <strong>• Olası Risk ve Komplikasyonlar:</strong> {clause.risksAndComplications}
                  </div>
                  <div>
                    <strong>• Tedaviyi Reddetme / Erteleme Durumunda Olası Riskler:</strong> {clause.refusalConsequences}
                  </div>
                </div>
              ))}
            </div>

            {/* Bölüm 5 — Consent Declaration & Wet Signature Block Preview */}
            <div
              style={{
                padding: '6px 10px',
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 11.5,
                borderRadius: '6px 6px 0 0',
              }}
            >
              BÖLÜM 5 — HASTA / YASAL TEMSİLCİ AYDINLATILMIŞ RIZA BEYANI VE ISLAK İMZA ALANI
            </div>
            <div
              style={{
                border: '1px solid var(--input-border)',
                borderTop: 'none',
                padding: '10px 12px',
                background: 'var(--pc-surface)',
                fontSize: 11.3,
              }}
            >
              <p style={{ margin: '0 0 8px' }}>
                <strong>AYDINLATILMIŞ RIZA BEYANI:</strong> Yukarıda kimlik bilgileri yer alan ben (veya yasal temsilcisi olduğum hasta adına), diş hekimim{' '}
                <strong>{formData.doctorName}</strong> tarafından muayenem sonucunda tespit edilen tanı/endikasyonlar, Bölüm 3&apos;te listelenen planlanan diş hekimliği tedavileri, uygulanacak lokal anestezi ve girişimsel işlemlerin amacı, yöntemi, alternatifleri, olası tıbbi risk/komplikasyonları, tahmini maliyeti ve tedaviyi reddetmem halinde oluşabilecek sağlık riskleri hakkında anlayabileceğim açık ve sade bir dille bilgilendirildim. Tüm sorularım yanıtlandı. Hiçbir baskı altında kalmadan, kendi hür irademle yukarıda belirtilen tedavilerin uygulanmasına{' '}
                <strong>ONAY VERİYORUM.</strong>
              </p>

              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1.5px dashed var(--input-border)',
                  background: 'var(--card-bg)',
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--foreground-2)' }}>
                  HASTA EL YAZISI BEYANI (&quot;Okudum, anladım, önerilen tedavinin uygulanmasını kendi hür irademle kabul ediyorum.&quot;):
                </div>
                <div style={{ height: 18, borderBottom: '1px dotted var(--input-border)', marginTop: 4 }} />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                  gap: 8,
                }}
              >
                <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--card-bg)' }}>
                  <div style={{ fontWeight: 800, fontSize: 11, color: 'var(--pc-tint-fg)', marginBottom: 4 }}>HASTA ADI SOYADI &amp; İMZA</div>
                  <div>Ad Soyad: <strong>{formData.patientName}</strong></div>
                  <div>Tarih: {formData.dateTime}</div>
                  <div style={{ marginTop: 10, color: 'var(--foreground-2)', fontWeight: 700 }}>İmza: ........................</div>
                </div>

                <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--card-bg)' }}>
                  <div style={{ fontWeight: 800, fontSize: 11, color: 'var(--pc-tint-fg)', marginBottom: 4 }}>YASAL TEMSİLCİ (VELİ/VASİ)</div>
                  <div>Ad Soyad: {formData.guardianName || '........................'}</div>
                  <div>Yakınlık: {formData.guardianRelation || '........................'}</div>
                  <div style={{ marginTop: 10, color: 'var(--foreground-2)', fontWeight: 700 }}>İmza: ........................</div>
                </div>

                <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--card-bg)' }}>
                  <div style={{ fontWeight: 800, fontSize: 11, color: 'var(--pc-tint-fg)', marginBottom: 4 }}>AYDINLATAN DİŞ HEKİMİ</div>
                  <div>Hekim: <strong>{formData.doctorName}</strong></div>
                  <div>Tarih: {formData.dateTime}</div>
                  <div style={{ marginTop: 10, color: 'var(--foreground-2)', fontWeight: 700 }}>Kaşe / İmza: .................</div>
                </div>

                <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--card-bg)' }}>
                  <div style={{ fontWeight: 800, fontSize: 11, color: 'var(--pc-tint-fg)', marginBottom: 4 }}>ŞAHİT / KLİNİK PERSONELİ</div>
                  <div>Ad Soyad: {formData.witnessName || '........................'}</div>
                  <div>Tarih: {formData.dateTime}</div>
                  <div style={{ marginTop: 10, color: 'var(--foreground-2)', fontWeight: 700 }}>İmza: ........................</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer with PDF Download, Print, and Accept/Save Actions */}
        <div
          style={{
            padding: '12px 18px',
            background: 'var(--pc-surface, var(--card-bg))',
            borderTop: '1px solid var(--pc-border, var(--input-border))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {/* Left Group: Official PDF Download & Print Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={handleDownloadPdf}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                minHeight: 36,
                padding: '7px 14px',
                borderRadius: 10,
                border: '1.5px solid #86efac',
                background: '#f0fdf4',
                color: '#15803d',
                fontWeight: 800,
                fontSize: 12.5,
                cursor: 'pointer',
                boxShadow: 'var(--pc-clay-btn)',
              }}
            >
              <Download size={15} />
              <span>Resmi Onam Formu (PDF) İndir</span>
            </button>

            <button
              type="button"
              onClick={handlePrintForm}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                minHeight: 36,
                padding: '7px 14px',
                borderRadius: 10,
                border: '1.5px solid var(--pc-border, #93c5fd)',
                background: 'var(--pc-tint, #eff6ff)',
                color: 'var(--pc-tint-fg, #0284c7)',
                fontWeight: 800,
                fontSize: 12.5,
                cursor: 'pointer',
                boxShadow: 'var(--pc-clay-pale)',
              }}
            >
              <Printer size={15} />
              <span>Onam Formunu Yazdır</span>
            </button>
          </div>

          {/* Right Group: Save / Accept Treatment Plan Actions */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => onConfirmAndSave({ consentObtained: false, actionTaken: 'skipped' })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 36,
                padding: '7px 12px',
                borderRadius: 10,
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--foreground-2)',
                fontWeight: 700,
                fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--pc-clay-btn)',
              }}
            >
              <span>Onam Yazdırmadan Kaydet</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onConfirmAndSave({
                  consentObtained: true,
                  actionTaken: consentActionCompleted ? 'pdf' : 'confirmed',
                })
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                minHeight: 36,
                padding: '7px 16px',
                borderRadius: 10,
                border: '1.5px solid #1d4ed8',
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 12.5,
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--pc-clay-primary)',
              }}
            >
              <FileCheck2 size={15} style={{ color: '#ffffff' }} />
              <span style={{ color: '#ffffff' }}>
                {saving ? 'Kaydediliyor…' : 'Onam Formu Alındı — Tedaviyi Kabul Et ve Kaydet'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
