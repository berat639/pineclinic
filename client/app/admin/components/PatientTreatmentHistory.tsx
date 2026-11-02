'use client'

import React, { useMemo, useState } from 'react'
import { getTreatmentColorTheme } from './FastScheduleModal'

interface Props {
  patient: any
  doctors?: any[]
  shifts?: any[]
  doctorLeaves?: any[]
  onFocusAppointment?: (appointmentId: string, startTime: string) => void
  onPlanTreatment?: (treatment: any, patient: any) => void
}

export function getReadOnlyTreatmentStatusBadge(status?: string | null) {
  const s = (status || 'planned').toLowerCase()
  if (s === 'completed' || s === 'yapıldı' || s === '✓ tamamlandı') {
    return {
      label: '✓ Yapıldı',
      bg: 'var(--btn-clinic-mint-bg, #f0fdf4)',
      border: '1px solid var(--btn-clinic-mint-border, #86efac)',
      color: 'var(--btn-clinic-mint-text, #15803d)',
      isCompleted: true,
    }
  }
  if (s === 'in_progress' || s === 'devam ediyor') {
    return {
      label: 'Devam Ediyor',
      bg: 'var(--card-inner, #f1f5f9)',
      border: '1px solid #d97706',
      color: '#d97706',
      isCompleted: false,
    }
  }
  return {
    label: 'Planlandı',
    bg: 'var(--badge-clinic-bg, #e0f2fe)',
    border: '1px solid var(--badge-clinic-border, #bae6fd)',
    color: 'var(--badge-clinic-text, #0369a1)',
    isCompleted: false,
  }
}

export default function PatientTreatmentHistory({ patient, doctors = [] }: Props) {
  const [data, setData] = useState<{ groups: any[]; ungrouped: any[]; treatments?: any[] } | null>(null)
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    if (!patient?.id) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/dental/patients/${patient.id}/treatments`)
      .then(r => (r.ok ? r.json() : { groups: [], ungrouped: [], treatments: [] }))
      .then(next => {
        if (!cancelled) setData(next)
      })
      .catch(() => {
        if (!cancelled) setData({ groups: [], ungrouped: [], treatments: [] })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patient?.id])

  const allGroups = useMemo(() => {
    const groups = (data?.groups || []).map(group => ({
      ...group,
      label: group.name || 'Tedavi Grubu',
      treatments: group.treatments || [],
    }))
    const ungrouped =
      data?.ungrouped?.length
        ? data.ungrouped
        : (data?.treatments || []).filter((t: any) => !t.groupId)

    return [
      ...groups.filter(g => g.treatments.length > 0),
      ...(ungrouped.length ? [{ id: 'ungrouped', label: 'Tedavi İşlemleri', treatments: ungrouped }] : []),
    ]
  }, [data])

  const resolveDoctorName = (treatment: any): string => {
    if (treatment.doctorName) return treatment.doctorName
    const ids: string[] = Array.isArray(treatment.doctorIds)
      ? treatment.doctorIds
      : Array.isArray(treatment.metadata?.doctorIds)
        ? treatment.metadata.doctorIds
        : treatment.doctorId
          ? [treatment.doctorId]
          : []
    const names = ids
      .map(id => doctors.find((d: any) => d.id === id)?.name)
      .filter(Boolean)
    return names.join(', ')
  }

  if (loading || !data) {
    return (
      <div style={{ padding: 14, color: 'var(--foreground-3)', fontSize: '0.78rem' }}>
        Tedavi planı yükleniyor…
      </div>
    )
  }

  if (allGroups.length === 0) {
    return (
      <div style={{ padding: 14, color: 'var(--foreground-3)', fontSize: '0.78rem' }}>
        Tedavi planı bulunmuyor.
      </div>
    )
  }

  return (
    <div style={{ padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-2)' }}>
        🦷 Tedavi Planları (Salt-Okunur Bilgi Kartı)
      </div>
      {allGroups.map(group => (
        <section
          key={group.id}
          style={{
            border: '1px solid var(--input-border, #cbd5e1)',
            borderRadius: 9,
            overflow: 'hidden',
            background: 'var(--card-bg, #ffffff)',
          }}
        >
          <div
            style={{
              padding: '8px 10px',
              background: 'var(--card-inner, #f1f5f9)',
              borderBottom: '1px solid var(--input-border, #cbd5e1)',
              color: 'var(--foreground)',
              fontSize: '0.75rem',
              fontWeight: 800,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              {group.label}{' '}
              <span style={{ color: 'var(--foreground-3)', fontWeight: 600 }}>
                ({group.treatments.length})
              </span>
            </span>
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {group.treatments.map((treatment: any, idx: number) => {
              const session = treatment.sessions
                ?.slice()
                .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0]
              const scheduledAt = session?.startTime || treatment.plannedDate
              const badge = getReadOnlyTreatmentStatusBadge(treatment.status)
              const tTheme = getTreatmentColorTheme(
                treatment.color || treatment.metadata?.color || treatment.procedureName,
                idx
              )
              const costVal = Number(treatment.cost ?? treatment.price ?? 0)
              const docName = resolveDoctorName(treatment)

              return (
                <article
                  key={treatment.id || idx}
                  style={{
                    padding: '9px 11px',
                    border: badge.isCompleted
                      ? '1px solid var(--btn-clinic-mint-border, #86efac)'
                      : '1px solid var(--input-border, #cbd5e1)',
                    borderLeft: badge.isCompleted ? '4px solid #10b981' : `4px solid ${tTheme.accent}`,
                    borderRadius: 8,
                    background: 'var(--input-bg, #ffffff)',
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
                      {treatment.toothNumber && (
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
                          #{treatment.toothNumber}
                        </span>
                      )}
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--foreground)' }}>
                        {treatment.procedureName}
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
                    <span style={{ color: 'var(--foreground-3)', fontWeight: 600 }}>
                      📅{' '}
                      {scheduledAt
                        ? new Date(scheduledAt).toLocaleString('tr-TR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Randevu tarihi yok'}
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
