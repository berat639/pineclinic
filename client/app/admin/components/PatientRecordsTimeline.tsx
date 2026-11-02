'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { getTreatmentColorTheme } from './FastScheduleModal'

export interface PatientRecordsTimelineProps {
  patientId?: string | null
  profile?: any
  appointments?: any[]
  treatments?: any[]
  activityLogs?: any[]
  doctors?: any[]
  compact?: boolean
}

export const RECORD_STATUS_LABELS: Record<string, string> = {
  scheduled: '🕒 Yanıt Bekliyor (Planlandı)',
  confirmed: '✅ Gelecek (Onaylandı)',
  arrived_unconfirmed: '🚶 Teyitsiz Geldi',
  waiting_in_clinic: '🏥 Klinikte Bekliyor',
  in_progress: '🔄 Devam Ediyor',
  completed: '✓ Tamamlandı',
  postponed: '⏳ Erteleme Talebi / Ertelendi',
  cancelled: '❌ Gelmiyor / İptal',
  no_show: '🚫 Gelmedi',
  pending_assignment: '⚠️ Atama Bekliyor',
  pending_review: '⚠️ Doğrulama Bekliyor',
  planned: '📅 Planlandı',
}

export function getTurkishStatusBadgeStyle(status?: string | null): {
  bg: string
  border: string
  color: string
  label: string
} {
  const key = (status || 'scheduled').toLowerCase()
  const label = RECORD_STATUS_LABELS[key] || status || '📅 Planlandı'

  if (key === 'completed' || key === 'confirmed' || key === 'yapıldı') {
    return {
      bg: 'var(--btn-clinic-mint-bg, #f0fdf4)',
      border: '1px solid var(--btn-clinic-mint-border, #86efac)',
      color: 'var(--btn-clinic-mint-text, #15803d)',
      label: key === 'yapıldı' ? '✓ Tamamlandı' : label,
    }
  }
  if (key === 'cancelled' || key === 'no_show') {
    return {
      bg: 'var(--card-inner, #f1f5f9)',
      border: '1px solid var(--danger, #ef4444)',
      color: 'var(--danger, #ef4444)',
      label,
    }
  }
  if (key === 'postponed' || key === 'in_progress' || key === 'pending_assignment' || key === 'pending_review' || key === 'arrived_unconfirmed') {
    return {
      bg: 'var(--card-inner, #f1f5f9)',
      border: '1px solid #d97706',
      color: '#d97706',
      label,
    }
  }
  return {
    bg: 'var(--badge-clinic-bg, #e0f2fe)',
    border: '1px solid var(--badge-clinic-border, #bae6fd)',
    color: 'var(--badge-clinic-text, #0369a1)',
    label,
  }
}

export function getActorBadgeInfo(actorType?: string | null, actorName?: string | null): {
  label: string
  bg: string
  border: string
  color: string
} {
  const role = (actorType || '').toLowerCase()
  const cleanName = actorName ? ` · ${actorName}` : ''
  if (role === 'patient' || role === 'hasta') {
    return {
      label: `👤 Hasta${cleanName}`,
      bg: 'var(--btn-clinic-mint-bg, #f0fdf4)',
      border: '1px solid var(--btn-clinic-mint-border, #86efac)',
      color: 'var(--btn-clinic-mint-text, #15803d)',
    }
  }
  if (role === 'doctor' || role === 'hekim') {
    return {
      label: `👨‍⚕️ Hekim${cleanName}`,
      bg: 'var(--badge-clinic-bg, #e0f2fe)',
      border: '1px solid var(--badge-clinic-border, #bae6fd)',
      color: 'var(--badge-clinic-text, #0369a1)',
    }
  }
  if (role === 'desk' || role === 'danışma' || role === 'reception' || role === 'secretary') {
    return {
      label: `🛎️ Danışma${cleanName}`,
      bg: 'var(--btn-clinic-secondary-bg, #eff6ff)',
      border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
      color: 'var(--btn-clinic-secondary-text, #0284c7)',
    }
  }
  if (role === 'admin' || role === 'yönetici' || role === 'owner') {
    return {
      label: `🛡️ Yönetici${cleanName}`,
      bg: 'var(--btn-clinic-secondary-bg, #eff6ff)',
      border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
      color: 'var(--btn-clinic-secondary-text, #0284c7)',
    }
  }
  if (role === 'system' || role === 'ai' || role === 'voice' || role === 'whatsapp') {
    return {
      label: `🤖 Sistem / AI${cleanName}`,
      bg: 'var(--card-inner, #f1f5f9)',
      border: '1px solid var(--input-border, #cbd5e1)',
      color: 'var(--foreground-2)',
    }
  }
  return {
    label: actorName ? `🛎️ ${actorName}` : '🛎️ Klinik Kaydı',
    bg: 'var(--card-inner, #f1f5f9)',
    border: '1px solid var(--input-border, #cbd5e1)',
    color: 'var(--foreground-2)',
  }
}

function formatDateTimeTR(iso?: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateOnlyTR(iso?: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function PatientRecordsTimeline({
  patientId,
  profile: externalProfile,
  appointments: externalAppointments,
  treatments: externalTreatments,
  activityLogs: externalActivityLogs,
  doctors = [],
  compact = false,
}: PatientRecordsTimelineProps) {
  const [fetchedProfile, setFetchedProfile] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'all' | 'logs' | 'appointments' | 'treatments'>('all')

  const effectiveProfile = externalProfile || fetchedProfile

  useEffect(() => {
    if (externalProfile) {
      setFetchedProfile(null)
      return
    }
    if (!patientId) return

    let cancelled = false
    setLoading(true)
    fetch(`/api/dental/patients/${patientId}/profile`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data && !data.error) {
          setFetchedProfile(data)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [patientId, externalProfile])

  const doctorNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of doctors || []) {
      if (d?.id && d?.name) map.set(d.id, d.name)
    }
    return map
  }, [doctors])

  const resolveDoctorName = (item: any): string => {
    if (!item) return ''
    if (item.doctorName) return item.doctorName
    if (item.doctor_name) return item.doctor_name
    const docIds: string[] = Array.isArray(item.doctorIds)
      ? item.doctorIds
      : Array.isArray(item.metadata?.doctorIds)
        ? item.metadata.doctorIds
        : item.doctorId
          ? [item.doctorId]
          : item.doctor_id
            ? [item.doctor_id]
            : []
    const names = docIds.map(id => doctorNameMap.get(id)).filter(Boolean)
    if (names.length > 0) return names.join(', ')
    return ''
  }

  const mergedAppointments = useMemo(() => {
    const map = new Map<string, any>()
    const listA = Array.isArray(effectiveProfile?.appointments) ? effectiveProfile.appointments : []
    const listB = Array.isArray(externalAppointments) ? externalAppointments : []
    for (const item of [...listA, ...listB]) {
      if (item && item.id) {
        map.set(item.id, { ...map.get(item.id), ...item })
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.startTime || b.createdAt || 0).getTime() - new Date(a.startTime || a.createdAt || 0).getTime()
    )
  }, [effectiveProfile?.appointments, externalAppointments])

  const mergedTreatments = useMemo(() => {
    const map = new Map<string, any>()
    const listA = Array.isArray(effectiveProfile?.treatments) ? effectiveProfile.treatments : []
    const listB = Array.isArray(externalTreatments) ? externalTreatments : []
    for (const item of [...listA, ...listB]) {
      if (item && item.id) {
        map.set(item.id, { ...map.get(item.id), ...item })
      }
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.plannedDate || b.createdAt || 0).getTime() - new Date(a.plannedDate || a.createdAt || 0).getTime()
    )
  }, [effectiveProfile?.treatments, externalTreatments])

  const mergedLogs = useMemo(() => {
    const rawLogs: any[] = [
      ...(Array.isArray(effectiveProfile?.activityLogs) ? effectiveProfile.activityLogs : []),
      ...(Array.isArray(effectiveProfile?.logs) ? effectiveProfile.logs : []),
      ...(Array.isArray(externalActivityLogs) ? externalActivityLogs : []),
    ]

    const seenIds = new Set<string>()
    const normalized: any[] = []

    for (const log of rawLogs) {
      if (!log) continue
      const id = String(log.id || `${log.actionType || log.action_type}-${log.createdAt || log.created_at}-${normalized.length}`)
      if (seenIds.has(id)) continue
      seenIds.add(id)
      normalized.push(log)
    }

    // If an appointment has patient response or cancellation/postponement and isn't already represented in rawLogs, synthesize a log entry
    for (const appt of mergedAppointments) {
      const hasPatientResponse = Boolean(
        appt.patientResponseStatus ||
        appt.patientResponseNote ||
        appt.patientPreferredDate ||
        appt.patientRespondedAt
      )
      if (hasPatientResponse) {
        const synthId = `synth-resp-${appt.id}`
        const alreadyLogged = normalized.some(
          l =>
            (l.appointmentId === appt.id || l.appointment_id === appt.id || l.entityId === appt.id) &&
            (l.actorType === 'patient' || l.actor_type === 'patient')
        )
        if (!alreadyLogged && !seenIds.has(synthId)) {
          seenIds.add(synthId)
          normalized.push({
            id: synthId,
            entityType: 'appointment',
            appointmentId: appt.id,
            actorType: 'patient',
            actorName: effectiveProfile?.patient?.name || appt.title?.split(' - ')[0] || 'Hasta',
            actionType: 'patient_response',
            oldStatus: 'scheduled',
            newStatus: appt.patientResponseStatus || appt.status,
            patientResponseNote: appt.patientResponseNote,
            patientPreferredDate: appt.patientPreferredDate,
            appointmentStartTime: appt.startTime,
            createdAt: appt.patientRespondedAt || appt.updatedAt || appt.startTime,
          })
        }
      }
    }

    return normalized.sort(
      (a, b) =>
        new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime()
    )
  }, [effectiveProfile?.activityLogs, effectiveProfile?.logs, effectiveProfile?.patient?.name, externalActivityLogs, mergedAppointments])

  const counts = {
    all: mergedLogs.length + mergedAppointments.length + mergedTreatments.length,
    logs: mergedLogs.length,
    appointments: mergedAppointments.length,
    treatments: mergedTreatments.length,
  }

  const tabs: Array<{ id: 'all' | 'logs' | 'appointments' | 'treatments'; label: string; count: number }> = [
    { id: 'all', label: 'Tümü', count: counts.all },
    { id: 'logs', label: 'Değişiklik & Loglar', count: counts.logs },
    { id: 'appointments', label: 'Randevular', count: counts.appointments },
    { id: 'treatments', label: 'Tedaviler', count: counts.treatments },
  ]

  if (loading && !effectiveProfile && mergedAppointments.length === 0 && mergedTreatments.length === 0) {
    return (
      <div style={{ padding: 18, textAlign: 'center', color: 'var(--foreground-3)', fontSize: '0.8rem' }}>
        Kayıtlar yükleniyor...
      </div>
    )
  }

  const renderLogItem = (log: any, idx: number) => {
    const actorType = log.actorType || log.actor_type || log.source || (log.patientResponseNote ? 'patient' : 'desk')
    const actorName = log.actorName || log.actor_name || ''
    const actorBadge = getActorBadgeInfo(actorType, actorName)

    const oldStatus = log.oldStatus || log.old_status || log.previousStatus || log.metadata?.oldStatus
    const newStatus = log.newStatus || log.new_status || log.status || log.metadata?.newStatus

    const oldDate = log.oldStartTime || log.old_start_time || log.oldDate || log.metadata?.oldStartTime
    const newDate = log.newStartTime || log.new_start_time || log.newDate || log.metadata?.newStartTime

    const oldDoctor =
      log.oldDoctorName ||
      log.old_doctor_name ||
      (log.oldDoctorId || log.old_doctor_id ? doctorNameMap.get(log.oldDoctorId || log.old_doctor_id) : '') ||
      log.metadata?.oldDoctorName
    const newDoctor =
      log.newDoctorName ||
      log.new_doctor_name ||
      (log.newDoctorId || log.new_doctor_id ? doctorNameMap.get(log.newDoctorId || log.new_doctor_id) : '') ||
      log.metadata?.newDoctorName

    const prefDate = log.patientPreferredDate || log.patient_preferred_date || log.preferredDate || log.metadata?.patientPreferredDate
    const responseNote = log.patientResponseNote || log.patient_response_note || log.note || log.reason || log.metadata?.patientResponseNote
    const description = log.description || log.summary || log.message || log.title || ''
    const createdAt = log.createdAt || log.created_at || log.timestamp

    const oldStatusLabel = oldStatus ? RECORD_STATUS_LABELS[String(oldStatus).toLowerCase()] || oldStatus : null
    const newStatusBadge = newStatus ? getTurkishStatusBadgeStyle(newStatus) : null

    return (
      <div
        key={log.id || `log-${idx}`}
        style={{
          padding: compact ? '9px 10px' : '11px 13px',
          borderRadius: 8,
          background: 'var(--input-bg, #ffffff)',
          border: '1px solid var(--input-border, #cbd5e1)',
          borderLeft: '4px solid var(--accent, #0284c7)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: actorBadge.bg,
                border: actorBadge.border,
                color: actorBadge.color,
              }}
            >
              {actorBadge.label}
            </span>
            <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--foreground)' }}>
              {description ||
                (oldStatus && newStatus
                  ? 'Durum Değişikliği'
                  : oldDate && newDate
                    ? 'Tarih / Saat Değişikliği'
                    : oldDoctor || newDoctor
                      ? 'İlgili Doktor Değişikliği'
                      : 'İşlem / Güncelleme Kaydı')}
            </span>
          </div>
          {createdAt && (
            <span style={{ fontSize: '0.68rem', color: 'var(--foreground-3)', fontWeight: 600 }}>
              {formatDateTimeTR(createdAt)}
            </span>
          )}
        </div>

        {(oldStatus || newStatus) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: '0.73rem' }}>
            <span style={{ color: 'var(--foreground-3)', fontWeight: 600 }}>Durum:</span>
            {oldStatusLabel && (
              <>
                <span
                  style={{
                    padding: '2px 7px',
                    borderRadius: 6,
                    background: 'var(--card-inner, #f1f5f9)',
                    border: '1px solid var(--input-border, #cbd5e1)',
                    color: 'var(--foreground-2)',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                  }}
                >
                  {oldStatusLabel}
                </span>
                <span style={{ color: 'var(--foreground-3)', fontWeight: 700 }}>→</span>
              </>
            )}
            {newStatusBadge && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: newStatusBadge.bg,
                  border: newStatusBadge.border,
                  color: newStatusBadge.color,
                  fontSize: '0.69rem',
                  fontWeight: 700,
                }}
              >
                {newStatusBadge.label}
              </span>
            )}
          </div>
        )}

        {(oldDate || newDate) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--foreground-2)' }}>
            <span style={{ color: 'var(--foreground-3)', fontWeight: 600 }}>Tarih/Saat:</span>
            {oldDate && <span>{formatDateTimeTR(oldDate)}</span>}
            {oldDate && newDate && <span style={{ color: 'var(--foreground-3)', fontWeight: 700 }}>→</span>}
            {newDate && <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>{formatDateTimeTR(newDate)}</span>}
          </div>
        )}

        {(oldDoctor || newDoctor) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--foreground-2)' }}>
            <span style={{ color: 'var(--foreground-3)', fontWeight: 600 }}>İlgili Hekim:</span>
            <span>{oldDoctor || 'Atanmamış'}</span>
            <span style={{ color: 'var(--foreground-3)', fontWeight: 700 }}>→</span>
            <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>{newDoctor || 'Atanmamış'}</span>
          </div>
        )}

        {(prefDate || responseNote) && (
          <div
            style={{
              padding: '6px 9px',
              borderRadius: 6,
              background: 'var(--card-inner, #f1f5f9)',
              border: '1px solid var(--input-border, #cbd5e1)',
              fontSize: '0.72rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            {prefDate && (
              <div style={{ fontWeight: 700, color: '#d97706' }}>
                📅 Tercih Edilen Yeni Tarih: {prefDate}
              </div>
            )}
            {responseNote && (
              <div style={{ color: 'var(--foreground-2)' }}>
                💬 Not: {responseNote}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderAppointmentItem = (appt: any, idx: number) => {
    const effectiveStatus =
      appt.patientResponseStatus === 'cancelled'
        ? 'cancelled'
        : appt.patientResponseStatus === 'postponed' && appt.status === 'scheduled'
          ? 'postponed'
          : appt.status || 'scheduled'

    const statusBadge = getTurkishStatusBadgeStyle(effectiveStatus)
    const docName = resolveDoctorName(appt)
    const startDate = appt.startTime ? new Date(appt.startTime) : null
    const endDate = appt.endTime ? new Date(appt.endTime) : null
    const dateStr = startDate && !isNaN(startDate.getTime())
      ? startDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'short' })
      : '-'
    const timeStr =
      startDate && !isNaN(startDate.getTime())
        ? `${startDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}${
            endDate && !isNaN(endDate.getTime())
              ? ` - ${endDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
              : ''
          }`
        : ''

    const actorBadge = appt.intakeSource === 'ai' || appt.intakeSource === 'voice'
      ? getActorBadgeInfo('system', 'AI Asistan')
      : appt.patientRespondedAt
        ? getActorBadgeInfo('patient')
        : null

    return (
      <div
        key={appt.id || `appt-${idx}`}
        style={{
          padding: compact ? '9px 10px' : '11px 13px',
          borderRadius: 8,
          background: 'var(--input-bg, #ffffff)',
          border: '1px solid var(--input-border, #cbd5e1)',
          borderLeft:
            effectiveStatus === 'cancelled' || effectiveStatus === 'no_show'
              ? '4px solid var(--danger, #ef4444)'
              : effectiveStatus === 'completed' || effectiveStatus === 'confirmed'
                ? '4px solid #10b981'
                : '4px solid var(--accent, #0284c7)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground)' }}>
              📅 {dateStr}
            </span>
            {timeStr && (
              <span
                style={{
                  fontSize: '0.71rem',
                  fontWeight: 700,
                  padding: '1px 7px',
                  borderRadius: 6,
                  background: 'var(--card-inner, #f1f5f9)',
                  border: '1px solid var(--input-border, #cbd5e1)',
                  color: 'var(--foreground-2)',
                }}
              >
                🕒 {timeStr}
              </span>
            )}
          </div>
          <span
            style={{
              fontSize: '0.69rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 999,
              background: statusBadge.bg,
              border: statusBadge.border,
              color: statusBadge.color,
            }}
          >
            {statusBadge.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: '0.73rem' }}>
          <span style={{ color: 'var(--foreground-2)', fontWeight: 600 }}>
            👨‍⚕️ İlgili Doktor: <strong style={{ color: 'var(--foreground)' }}>{docName || 'Belirtilmedi (Opsiyonel)'}</strong>
          </span>
          {actorBadge && (
            <span
              style={{
                fontSize: '0.66rem',
                fontWeight: 700,
                padding: '1px 7px',
                borderRadius: 999,
                background: actorBadge.bg,
                border: actorBadge.border,
                color: actorBadge.color,
              }}
            >
              {actorBadge.label}
            </span>
          )}
        </div>

        {(appt.complaint || appt.notes || appt.patientPreferredDate || appt.patientResponseNote) && (
          <div
            style={{
              padding: '6px 9px',
              borderRadius: 6,
              background: 'var(--card-inner, #f1f5f9)',
              border: '1px solid var(--input-border, #cbd5e1)',
              fontSize: '0.72rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            {appt.complaint && (
              <div style={{ color: 'var(--foreground-2)' }}>
                🩺 <strong>Şikayet / Talep:</strong> {appt.complaint}
              </div>
            )}
            {appt.notes && (
              <div style={{ color: 'var(--foreground-2)' }}>
                📝 <strong>Not:</strong> {appt.notes}
              </div>
            )}
            {appt.patientPreferredDate && (
              <div style={{ fontWeight: 700, color: '#d97706' }}>
                📅 <strong>Tercih Edilen Yeni Tarih:</strong> {appt.patientPreferredDate}
              </div>
            )}
            {appt.patientResponseNote && (
              <div style={{ color: 'var(--foreground-2)' }}>
                💬 <strong>Hasta Yanıt Notu:</strong> {appt.patientResponseNote}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderTreatmentItem = (t: any, idx: number) => {
    const isCompleted = t.status === 'completed' || t.status === 'yapıldı' || t.status === '✓ Tamamlandı'
    const isInProgress = t.status === 'in_progress'
    const statusLabel = isCompleted ? '✓ Yapıldı' : isInProgress ? '🔄 Devam Ediyor' : '📅 Planlandı'
    const tTheme = getTreatmentColorTheme(t.color || t.metadata?.color || t.procedureName, idx)
    const docName = resolveDoctorName(t)
    const costVal = Number(t.cost ?? t.price ?? 0)
    const sessionStart = t.sessions?.[0]?.startTime || t.plannedDate || t.createdAt

    return (
      <div
        key={t.id || `trt-${idx}`}
        style={{
          padding: compact ? '9px 10px' : '10px 12px',
          borderRadius: 8,
          background: 'var(--input-bg, #ffffff)',
          border: isCompleted ? '1px solid var(--btn-clinic-mint-border, #86efac)' : '1px solid var(--input-border, #cbd5e1)',
          borderLeft: isCompleted ? '4px solid #10b981' : `4px solid ${tTheme.accent}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isCompleted ? '#10b981' : tTheme.accent,
                flexShrink: 0,
              }}
            />
            {t.toothNumber && (
              <span
                style={{
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: isCompleted ? 'var(--btn-clinic-mint-bg, #f0fdf4)' : tTheme.badgeBg,
                  border: isCompleted ? '1px solid var(--btn-clinic-mint-border, #86efac)' : `1px solid ${tTheme.softBorder}`,
                  color: isCompleted ? 'var(--btn-clinic-mint-text, #15803d)' : tTheme.badgeText,
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
                background: isCompleted
                  ? 'var(--btn-clinic-mint-bg, #f0fdf4)'
                  : isInProgress
                    ? 'var(--card-inner, #f1f5f9)'
                    : 'var(--badge-clinic-bg, #e0f2fe)',
                border: isCompleted
                  ? '1px solid var(--btn-clinic-mint-border, #86efac)'
                  : isInProgress
                    ? '1px solid #d97706'
                    : '1px solid var(--badge-clinic-border, #bae6fd)',
                color: isCompleted
                  ? 'var(--btn-clinic-mint-text, #15803d)'
                  : isInProgress
                    ? '#d97706'
                    : 'var(--badge-clinic-text, #0369a1)',
              }}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--foreground-2)' }}>
          <span>
            👨‍⚕️ İlgili Doktor: <strong style={{ color: 'var(--foreground)' }}>{docName || 'Belirtilmedi'}</strong>
          </span>
          {sessionStart && (
            <span style={{ color: 'var(--foreground-3)', fontWeight: 600 }}>
              📅 {formatDateOnlyTR(sessionStart)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}>
      {/* Sekmeler (Filtreler) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: 4,
          borderRadius: 9,
          background: 'var(--card-inner, #f1f5f9)',
          border: '1px solid var(--input-border, #cbd5e1)',
        }}
      >
        {tabs.map(tab => {
          const isActive = activeFilter === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              style={{
                flex: '1 1 auto',
                padding: compact ? '5px 8px' : '6px 11px',
                borderRadius: 7,
                border: isActive ? '1px solid #1d4ed8' : '1px solid transparent',
                background: isActive ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--foreground-2)',
                fontSize: compact ? '0.7rem' : '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: isActive ? '#ffffff' : 'inherit' }}>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: isActive ? 'rgba(255,255,255,0.22)' : 'var(--badge-clinic-bg, #e0f2fe)',
                  color: isActive ? '#ffffff' : 'var(--badge-clinic-text, #0369a1)',
                  fontWeight: 800,
                }}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Kayıt Listesi */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 7 : 9 }}>
        {(activeFilter === 'all' || activeFilter === 'logs') && mergedLogs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeFilter === 'all' && (
              <div style={{ fontSize: '0.71rem', fontWeight: 800, color: 'var(--foreground-2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                🔄 Değişiklik & İşlem Logları ({mergedLogs.length})
              </div>
            )}
            {mergedLogs.map((log, idx) => renderLogItem(log, idx))}
          </div>
        )}

        {(activeFilter === 'all' || activeFilter === 'appointments') && mergedAppointments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeFilter === 'all' && (
              <div style={{ fontSize: '0.71rem', fontWeight: 800, color: 'var(--foreground-2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: mergedLogs.length > 0 ? 4 : 0 }}>
                📅 Tüm Randevu Kayıtları ({mergedAppointments.length})
              </div>
            )}
            {mergedAppointments.map((appt, idx) => renderAppointmentItem(appt, idx))}
          </div>
        )}

        {(activeFilter === 'all' || activeFilter === 'treatments') && mergedTreatments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeFilter === 'all' && (
              <div style={{ fontSize: '0.71rem', fontWeight: 800, color: 'var(--foreground-2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: (mergedLogs.length > 0 || mergedAppointments.length > 0) ? 4 : 0 }}>
                🦷 Tedavi Kayıtları ({mergedTreatments.length})
              </div>
            )}
            {mergedTreatments.map((t, idx) => renderTreatmentItem(t, idx))}
          </div>
        )}

        {((activeFilter === 'all' && counts.all === 0) ||
          (activeFilter === 'logs' && counts.logs === 0) ||
          (activeFilter === 'appointments' && counts.appointments === 0) ||
          (activeFilter === 'treatments' && counts.treatments === 0)) && (
          <div
            style={{
              padding: '18px 14px',
              borderRadius: 8,
              background: 'var(--input-bg, #ffffff)',
              border: '1px dashed var(--input-border, #cbd5e1)',
              textAlign: 'center',
              color: 'var(--foreground-3)',
              fontSize: '0.78rem',
            }}
          >
            Bu kategoride henüz kayıt bulunmuyor.
          </div>
        )}
      </div>
    </div>
  )
}
