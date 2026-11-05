import React, { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import PatientConsentPanel from './PatientConsentPanel'
import PatientRecordsTimeline from './PatientRecordsTimeline'
import { getTreatmentColorTheme } from './FastScheduleModal'
import { getReadOnlyTreatmentStatusBadge } from './PatientTreatmentHistory'

interface PatientProfileCardProps {
  profile: any
  doctors?: any[]
  onEdit?: (patient: any) => void
  calendarHistoryMode?: boolean
  onConsentChange?: (field: 'smsOptOut' | 'emailOptOut' | 'whatsappOptOut', value: boolean) => void
  onRefresh?: () => void
}

export default function PatientProfileCard({
  profile,
  doctors = [],
  onEdit,
  calendarHistoryMode = false,
  onConsentChange,
  onRefresh,
}: PatientProfileCardProps) {
  const [deletedTreatmentIds, setDeletedTreatmentIds] = useState<Set<string>>(new Set())
  const [deletingTreatmentId, setDeletingTreatmentId] = useState<string | null>(null)

  if (!profile) return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--foreground-3)' }}>
      Yükleniyor...
    </div>
  )

  const { patient, treatments, payments, consultations, diseases, completedWorks, doctorNotes, toothRecords, materialUsages } = profile

  const visibleTreatments = useMemo(() => {
    return (Array.isArray(treatments) ? treatments : []).filter(
      (t: any) => t && t.status !== 'cancelled' && !deletedTreatmentIds.has(t.id)
    )
  }, [treatments, deletedTreatmentIds])

  const filteredProfile = useMemo(() => {
    if (!profile) return profile
    return {
      ...profile,
      treatments: visibleTreatments,
    }
  }, [profile, visibleTreatments])

  const handleDeleteTreatment = async (treatment: any) => {
    if (!treatment?.id || deletingTreatmentId) return
    setDeletingTreatmentId(treatment.id)
    try {
      const res = await fetch(`/api/dental/treatments/${treatment.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Tedavi silinemedi')
      }
      setDeletedTreatmentIds(prev => {
        const next = new Set(prev)
        next.add(treatment.id)
        return next
      })
      toast.success('Tedavi kaydı silindi')
      if (onRefresh) onRefresh()
    } catch (e: any) {
      toast.error(e.message || 'Tedavi silinirken hata oluştu')
    } finally {
      setDeletingTreatmentId(null)
    }
  }

  const cardStyle = {
    background: 'var(--card-bg, #1e293b)',
    border: '1px solid var(--input-border, #334155)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
  }

  const headerStyle = {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--foreground-2)',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
    borderBottom: '1px solid var(--divider, #334155)',
    paddingBottom: 4
  }

  const formatDate = (iso: string) => {
    if (!iso) return '-'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const resolveDoctorName = (t: any): string => {
    if (t.doctorName) return t.doctorName
    if (t.doctor_name) return t.doctor_name
    const ids: string[] = Array.isArray(t.doctorIds)
      ? t.doctorIds
      : Array.isArray(t.metadata?.doctorIds)
        ? t.metadata.doctorIds
        : t.doctorId
          ? [t.doctorId]
          : t.doctor_id
            ? [t.doctor_id]
            : []
    const names = ids
      .map(id => doctors.find((d: any) => d.id === id)?.name)
      .filter(Boolean)
    return names.join(', ')
  }

  return (
    <div style={{ padding: '16px', background: 'var(--card-bg, #1e293b)', fontSize: '0.85rem', color: 'var(--foreground)' }}>

      {/* Demografik */}
      <div style={cardStyle}>
        <div style={{ ...headerStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📋 Demografik Bilgiler</span>
          {onEdit && (
            <button
              onClick={() => onEdit(patient)}
              style={{
                background: 'var(--btn-clinic-secondary-bg, #eff6ff)',
                border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                color: 'var(--btn-clinic-secondary-text, #0284c7)',
                borderRadius: 6,
                padding: '2px 8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              ✏️ Düzenle
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <div><span style={{ color: 'var(--foreground-3)' }}>Ad:</span> {patient.name}</div>
          {patient.tcIdentity && <div><span style={{ color: 'var(--foreground-3)' }}>TC:</span> {patient.tcIdentity}</div>}
          {patient.phone && <div><span style={{ color: 'var(--foreground-3)' }}>Tel:</span> {patient.phone}</div>}
          {patient.email && <div><span style={{ color: 'var(--foreground-3)' }}>E-posta:</span> {patient.email}</div>}
          {patient.gender && <div><span style={{ color: 'var(--foreground-3)' }}>Cinsiyet:</span> {patient.gender === 'E' ? 'Erkek' : patient.gender === 'K' ? 'Kadın' : patient.gender}</div>}
          {patient.birthDate && <div><span style={{ color: 'var(--foreground-3)' }}>D. Tarihi:</span> {formatDate(patient.birthDate)}</div>}
          {!patient.birthDate && patient.birthYear && <div><span style={{ color: 'var(--foreground-3)' }}>D. Yılı:</span> {patient.birthYear}</div>}
          <div><span style={{ color: 'var(--foreground-3)' }}>Kayıt:</span> {formatDate(patient.createdAt)}</div>
          {payments && payments.length > 0 && <div><span style={{ color: 'var(--foreground-3)' }}>Son Ödeme:</span> {formatDate(payments[0].date)}</div>}
        </div>
      </div>

      {/* İletişim İzinleri (KVKK) */}
      {patient?.id && (
        <PatientConsentPanel
          patientId={patient.id}
          onConsentChange={(nextOptOuts) => {
            if (onConsentChange) {
              if (nextOptOuts.smsOptOut !== Boolean(patient.smsOptOut)) onConsentChange('smsOptOut', nextOptOuts.smsOptOut)
              if (nextOptOuts.emailOptOut !== Boolean(patient.emailOptOut)) onConsentChange('emailOptOut', nextOptOuts.emailOptOut)
              if (nextOptOuts.whatsappOptOut !== Boolean(patient.whatsappOptOut)) onConsentChange('whatsappOptOut', nextOptOuts.whatsappOptOut)
            }
          }}
        />
      )}

      {/* Hastalıklar & Alerjiler */}
      {diseases && diseases.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>🩺 Hastalıklar & Alerjiler ({diseases.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {diseases.map((d: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--glass-border)', paddingBottom: 2 }}>
                <span>{d.name}</span>
                <span style={{ color: d.status === 'active' ? '#ef4444' : '#10b981' }}>{d.status === 'active' ? 'Aktif' : 'Pasif'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tamamlanan İşlemler */}
      {completedWorks && completedWorks.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>✅ Tamamlanan İşlemler ({completedWorks.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {completedWorks.map((w: any) => (
              <div key={w.id} style={{ background: 'var(--input-bg)', padding: 8, borderRadius: 6 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>
                  {w.doctorName || 'Doktor'} - {formatDate(w.date)}
                </div>
                <div>{w.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hekim Notları */}
      {doctorNotes && doctorNotes.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>✍️ Hekim Notları ({doctorNotes.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {doctorNotes.map((n: any) => (
              <div key={n.id} style={{ background: 'var(--input-bg)', padding: 8, borderRadius: 6 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>
                  {n.doctorName || 'Doktor'} - {formatDate(n.createdAt)}
                </div>
                <div>{n.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ağız & Diş Kayıtları */}
      {toothRecords && toothRecords.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>🦷 Ağız & Diş Kayıtları ({toothRecords.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {toothRecords.map((tr: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--glass-border)', paddingBottom: 2 }}>
                <span>Diş #{tr.toothNumber} {tr.surface ? `(${tr.surface})` : ''}</span>
                <span style={{ color: 'var(--foreground-2)' }}>{tr.condition}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kullanılan Malzemeler */}
      {materialUsages && materialUsages.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>📦 Kullanılan Malzemeler ({materialUsages.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {materialUsages.map((m: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--glass-border)', paddingBottom: 2 }}>
                <span>{m.itemName}</span>
                <span style={{ color: 'var(--foreground-2)' }}>{m.quantity} Adet</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Salt-Okunur (Read-Only) Tedavi Planı Kartlığı */}
      {!calendarHistoryMode && visibleTreatments.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>🦷 Tedavi Planları ({visibleTreatments.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {visibleTreatments.map((t: any, idx: number) => {
              const badge = getReadOnlyTreatmentStatusBadge(t.status)
              const tTheme = getTreatmentColorTheme(t.color || t.metadata?.color || t.procedureName, idx)
              const costVal = Number(t.cost ?? t.price ?? 0)
              const docName = resolveDoctorName(t)
              const sessionDate = t.sessions?.[0]?.startTime || null
              const isDeleting = deletingTreatmentId === t.id

              return (
                <div
                  key={t.id || idx}
                  style={{
                    padding: '9px 11px',
                    borderRadius: 8,
                    background: 'var(--input-bg, #ffffff)',
                    border: badge.isCompleted
                      ? '1px solid var(--btn-clinic-mint-border, #86efac)'
                      : '1px solid var(--input-border, #cbd5e1)',
                    borderLeft: badge.isCompleted ? '4px solid #10b981' : `4px solid ${tTheme.accent}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: badge.isCompleted ? '#10b981' : tTheme.accent,
                          flexShrink: 0,
                        }}
                      />
                      {t.toothNumber && (
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: 5,
                            background: badge.isCompleted ? 'var(--btn-clinic-mint-bg, #f0fdf4)' : tTheme.badgeBg,
                            border: badge.isCompleted
                              ? '1px solid var(--btn-clinic-mint-border, #86efac)'
                              : `1px solid ${tTheme.softBorder}`,
                            color: badge.isCompleted ? 'var(--btn-clinic-mint-text, #15803d)' : tTheme.badgeText,
                            fontWeight: 800,
                            fontSize: '0.71rem',
                            flexShrink: 0,
                          }}
                        >
                          #{t.toothNumber}
                        </span>
                      )}
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--foreground)' }}>
                        {t.procedureName}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {costVal > 0 && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--foreground)' }}>
                          {costVal.toLocaleString('tr-TR')} ₺
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: badge.bg,
                          border: badge.border,
                          color: badge.color,
                        }}
                      >
                        {badge.label}
                      </span>
                      {t.id && (
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleDeleteTreatment(t)
                          }}
                          title="Tedavi Kaydını Sil"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 7px',
                            borderRadius: 6,
                            border: '1px solid var(--danger, #ef4444)',
                            background: 'var(--card-inner, #f1f5f9)',
                            color: 'var(--danger, #ef4444)',
                            fontSize: '0.67rem',
                            fontWeight: 700,
                            cursor: isDeleting ? 'wait' : 'pointer',
                            opacity: isDeleting ? 0.6 : 1,
                          }}
                        >
                          <Trash2 size={12} />
                          <span>Sil</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      fontSize: '0.71rem',
                      color: 'var(--foreground-2)',
                    }}
                  >
                    <span>
                      👨‍⚕️ İlgili Doktor: <strong style={{ color: 'var(--foreground)' }}>{docName || 'Belirtilmedi'}</strong>
                    </span>
                    {sessionDate && (
                      <span style={{ color: 'var(--foreground-3)', fontWeight: 600 }}>
                        📅 {formatDate(sessionDate)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tüm Kayıtlar & İşlem Geçmişi */}
      <div style={cardStyle}>
        <div style={headerStyle}>📋 Tüm Kayıtlar & İşlem Geçmişi</div>
        <PatientRecordsTimeline profile={filteredProfile} doctors={doctors} compact onRefresh={onRefresh} />
      </div>

      {/* Ödemeler */}
      {payments && payments.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>💳 Ödeme Tarihleri ({payments.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {payments.map((p: any, idx: number) => (
              <span key={idx} style={{ background: '#ecfdf5', color: '#065f46', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', border: '1px solid #a7f3d0' }}>
                {formatDate(p.date)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Konsültasyonlar */}
      {consultations && consultations.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>📝 Konsültasyonlar ({consultations.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {consultations.map((c: any) => (
              <div key={c.id} style={{ background: 'var(--input-bg)', padding: 8, borderRadius: 6 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>
                  {c.doctorName || 'Doktor'} - {formatDate(c.createdAt)}
                </div>
                <div>{c.consultationNote}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
