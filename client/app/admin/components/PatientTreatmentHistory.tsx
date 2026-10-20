'use client'

import React, { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'

interface Props {
  patient: any
  doctors: any[]
  shifts: any[]
  onFocusAppointment: (appointmentId: string, startTime: string) => void
  onPlanTreatment: (treatment: any, patient: any) => void
}

export default function PatientTreatmentHistory({ patient, doctors, shifts, onFocusAppointment, onPlanTreatment }: Props) {
  const [data, setData] = useState<{ groups: any[]; ungrouped: any[] } | null>(null)
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/dental/patients/${patient.id}/treatments`)
      .then(r => r.ok ? r.json() : { groups: [], ungrouped: [] })
      .then(next => { if (!cancelled) setData(next) })
      .catch(() => { if (!cancelled) setData({ groups: [], ungrouped: [] }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [patient.id])

  const allGroups = useMemo(() => [
    ...(data?.groups || []).map(group => ({ ...group, label: group.name, treatments: group.treatments || [] })),
    ...(data?.ungrouped?.length ? [{ id: 'ungrouped', label: 'Diğer İşlemler', treatments: data.ungrouped }] : []),
  ], [data])

  const refresh = async () => {
    const response = await fetch(`/api/dental/patients/${patient.id}/treatments`)
    if (response.ok) setData(await response.json())
  }

  const updateTreatment = async (treatment: any, patch: Record<string, unknown>) => {
    const response = await fetch(`/api/dental/treatments/${treatment.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      toast.error(body.error || 'Tedavi güncellenemedi')
      return
    }
    toast.success('Tedavi güncellendi')
    refresh()
  }

  if (loading || !data) return <div style={{ padding: 14, color: 'var(--foreground-3)', fontSize: '0.78rem' }}>Tedavi geçmişi yükleniyor…</div>
  if (allGroups.length === 0) return <div style={{ padding: 14, color: 'var(--foreground-3)', fontSize: '0.78rem' }}>Tedavi planı bulunmuyor.</div>

  return <div style={{ padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)' }}>📋 Tedavi Planlama Geçmişi · Bir işleme basarak ilgili randevuya gidin.</div>
    {allGroups.map(group => <section key={group.id} style={{ border: '1px solid var(--input-border)', borderRadius: 9, overflow: 'hidden', background: 'var(--card-bg)' }}>
      <div style={{ padding: '8px 10px', background: 'var(--modal-section-bg)', color: 'var(--foreground)', fontSize: '0.75rem', fontWeight: 800 }}>{group.label} <span style={{ color: 'var(--foreground-3)', fontWeight: 600 }}>({group.treatments.length})</span></div>
      <div style={{ padding: 7, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {group.treatments.map((treatment: any) => {
          const session = treatment.sessions?.slice().sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0]
          const scheduledAt = session?.startTime || treatment.plannedDate
          const isCompleted = treatment.status === 'completed'
          const appointmentDate = scheduledAt ? new Date(scheduledAt).toLocaleDateString('sv') : ''
          return <article key={treatment.id} style={{ padding: 9, border: '1px solid var(--input-border)', borderRadius: 7, background: 'var(--input-bg)' }}>
            <button type="button" onClick={() => session?.appointmentId ? onFocusAppointment(session.appointmentId, session.startTime) : onPlanTreatment(treatment, patient)} style={{ width: '100%', border: 0, padding: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: 'var(--foreground)' }} title={session?.appointmentId ? 'Takvimde randevuya git' : 'İleri tarihe planla'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: 700, fontSize: '0.8rem' }}><span>{treatment.toothNumber ? `#${treatment.toothNumber} ` : ''}{treatment.procedureName}</span><span style={{ color: isCompleted ? 'var(--success)' : 'var(--accent)', fontSize: '0.68rem' }}>{isCompleted ? '✓ Yapıldı' : session ? '📅 Planlı' : '+ Planla'}</span></div>
              <div style={{ marginTop: 4, color: 'var(--foreground-3)', fontSize: '0.68rem' }}>{scheduledAt ? new Date(scheduledAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Randevu tarihi yok'}</div>
            </button>
            <div onClick={event => event.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 5, marginTop: 8 }}>
              <select value={treatment.status || 'planned'} onChange={e => updateTreatment(treatment, { status: e.target.value })} style={selectStyle}>
                <option value="planned">Planlandı</option><option value="in_progress">Devam ediyor</option><option value="completed">Yapıldı</option>
              </select>
              <select value={treatment.doctorId || ''} onChange={e => updateTreatment(treatment, { doctorId: e.target.value || null })} style={selectStyle}>
                <option value="">Doktor seç</option>
                {doctors.map(doctor => {
                  const hasShift = !appointmentDate || shifts.some(shift => shift.userId === doctor.id && shift.date === appointmentDate)
                  return <option key={doctor.id} value={doctor.id} disabled={!hasShift}>{doctor.name}{hasShift ? '' : ' · vardiya yok'}</option>
                })}
              </select>
              <button type="button" onClick={async () => {
                if (!window.confirm(`“${treatment.procedureName}” işlemi silinsin mi?`)) return
                const response = await fetch(`/api/dental/treatments/${treatment.id}`, { method: 'DELETE' })
                if (!response.ok) { toast.error('Tedavi silinemedi'); return }
                toast.success('Tedavi silindi'); refresh()
              }} style={{ border: '1px solid var(--danger)', borderRadius: 6, background: 'var(--card-bg)', color: 'var(--danger)', cursor: 'pointer', padding: '0 7px' }} title="Tedaviyi sil">🗑</button>
            </div>
          </article>
        })}
      </div>
    </section>)}
  </div>
}

const selectStyle: React.CSSProperties = { width: '100%', minWidth: 0, padding: '5px', border: '1px solid var(--input-border)', borderRadius: 6, background: 'var(--card-bg)', color: 'var(--foreground)', fontSize: '0.67rem' }
