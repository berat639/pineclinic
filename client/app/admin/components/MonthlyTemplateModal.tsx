'use client'

import React, { useState } from 'react'
import { X, CalendarDays, Layers, Sliders, Check } from 'lucide-react'
import { MonthlyShiftTemplate, WeeklyShiftTemplate, DailyShiftTemplate } from '../types/shiftTemplates'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'

interface Props {
  isOpen: boolean
  template?: MonthlyShiftTemplate | null
  weeklyTemplates: WeeklyShiftTemplate[]
  dailyTemplates: DailyShiftTemplate[]
  onSave: (template: MonthlyShiftTemplate) => void
  onClose: () => void
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--foreground)',
  fontSize: '0.82rem',
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box'
}

export default function MonthlyTemplateModal({ isOpen, template, weeklyTemplates, dailyTemplates, onSave, onClose }: Props) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [mode, setMode] = useState<'weekly_rotation' | 'rule_based'>(template?.mode || 'weekly_rotation')

  // Rotation mode: 4 weeks
  const defaultWId = weeklyTemplates[0]?.id || ''
  const [w1, setW1] = useState(template?.weeklyRotation?.[0] || defaultWId)
  const [w2, setW2] = useState(template?.weeklyRotation?.[1] || defaultWId)
  const [w3, setW3] = useState(template?.weeklyRotation?.[2] || defaultWId)
  const [w4, setW4] = useState(template?.weeklyRotation?.[3] || defaultWId)

  // Rule based mode
  const [weekdayShift, setWeekdayShift] = useState(template?.weekdayShift || {
    active: true,
    startTime: '09:00',
    endTime: '19:00',
    shiftType: 'Sabahçı'
  })
  const [saturdayShift, setSaturdayShift] = useState(template?.saturdayShift || {
    active: true,
    startTime: '10:00',
    endTime: '17:00',
    shiftType: 'Cumartesi'
  })
  const [sundayShift, setSundayShift] = useState(template?.sundayShift || {
    active: false,
    startTime: '09:00',
    endTime: '18:00',
    shiftType: 'İzinli'
  })

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const payload: MonthlyShiftTemplate = {
      id: template?.id || `mt-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      mode,
      weeklyRotation: mode === 'weekly_rotation' ? [w1, w2, w3, w4] : undefined,
      weekdayShift: mode === 'rule_based' ? weekdayShift : undefined,
      saturdayShift: mode === 'rule_based' ? saturdayShift : undefined,
      sundayShift: mode === 'rule_based' ? sundayShift : undefined,
    }

    onSave(payload)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: 16
      }}
      {...backdropDismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 580,
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'var(--card-bg, #1e293b)',
          borderRadius: 16,
          border: '1px solid var(--input-border, #334155)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          padding: 24,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(168, 85, 247, 0.15)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a855f7'
            }}>
              <CalendarDays size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--foreground)' }}>
                {template ? 'Aylık Şablonu Düzenle' : 'Yeni Aylık Vardiya Şablonu'}
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)' }}>
                Tüm ay için rotasyon veya çalışma kuralları belirleyin
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>
              Şablon Adı *
            </label>
            <input
              placeholder="Örn: Aylık Standart Plan, 2+2 Hafta Sabah/Öğlen Rotasyonu"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>
              Açıklama / Not
            </label>
            <input
              placeholder="Örn: 1. ve 3. hafta sabah, 2. ve 4. hafta öğlen vardiyası"
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Mode Selector */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 6 }}>
              Şablon Yapısı
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => setMode('weekly_rotation')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${mode === 'weekly_rotation' ? 'var(--accent, #3b82f6)' : 'var(--glass-border)'}`,
                  background: mode === 'weekly_rotation' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                  color: mode === 'weekly_rotation' ? 'var(--foreground)' : 'var(--foreground-3)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.8rem' }}>
                  <Layers size={14} color="var(--accent)" /> 4 Haftalık Döngü
                </div>
                <div style={{ fontSize: '0.7rem' }}>
                  Haftalık şablonları 1, 2, 3 ve 4. haftalara dağıtın
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('rule_based')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${mode === 'rule_based' ? 'var(--accent, #3b82f6)' : 'var(--glass-border)'}`,
                  background: mode === 'rule_based' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                  color: mode === 'rule_based' ? 'var(--foreground)' : 'var(--foreground-3)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.8rem' }}>
                  <Sliders size={14} color="var(--accent)" /> Kural Tabanlı
                </div>
                <div style={{ fontSize: '0.7rem' }}>
                  Hafta içi ve hafta sonu saatlerini tüm aya uygulayın
                </div>
              </button>
            </div>
          </div>

          {/* Mode 1: 4 Weekly Rotation */}
          {mode === 'weekly_rotation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 10, border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>
                Haftalık Şablon Eşleşmeleri (4 Hafta)
              </div>

              {[
                { label: '1. Hafta (1 - 7 Günler)', val: w1, set: setW1 },
                { label: '2. Hafta (8 - 14 Günler)', val: w2, set: setW2 },
                { label: '3. Hafta (15 - 21 Günler)', val: w3, set: setW3 },
                { label: '4. Hafta (22 - 31 Günler)', val: w4, set: setW4 },
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--foreground)', minWidth: 160, fontWeight: 500 }}>
                    {item.label}
                  </span>
                  <select
                    value={item.val}
                    onChange={e => item.set(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    {weeklyTemplates.map(wt => (
                      <option key={wt.id} value={wt.id}>{wt.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Mode 2: Rule based */}
          {mode === 'rule_based' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 10, border: '1px solid var(--glass-border)' }}>
              {/* Hafta İçi (Pzt - Cuma) */}
              <div style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  Hafta İçi (Pazartesi – Cuma)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 8, alignItems: 'center' }}>
                  <select
                    value={weekdayShift.shiftType}
                    onChange={e => {
                      const dt = dailyTemplates.find(d => d.name === e.target.value)
                      if (dt) {
                        setWeekdayShift({
                          active: true,
                          shiftType: dt.name,
                          startTime: `${Math.floor(dt.start).toString().padStart(2, '0')}:${dt.start % 1 === 0.5 ? '30' : '00'}`,
                          endTime: `${Math.floor(dt.end).toString().padStart(2, '0')}:${dt.end % 1 === 0.5 ? '30' : '00'}`
                        })
                      } else {
                        setWeekdayShift({ ...weekdayShift, shiftType: e.target.value })
                      }
                    }}
                    style={inputStyle}
                  >
                    {dailyTemplates.map(dt => (
                      <option key={dt.id} value={dt.name}>{dt.name} ({dt.start}:00-{dt.end}:00)</option>
                    ))}
                    <option value="Özel">Özel Saat</option>
                  </select>
                  <input
                    type="time"
                    value={weekdayShift.startTime}
                    onChange={e => setWeekdayShift({ ...weekdayShift, startTime: e.target.value })}
                    style={{ ...inputStyle, textAlign: 'center' }}
                  />
                  <input
                    type="time"
                    value={weekdayShift.endTime}
                    onChange={e => setWeekdayShift({ ...weekdayShift, endTime: e.target.value })}
                    style={{ ...inputStyle, textAlign: 'center' }}
                  />
                </div>
              </div>

              {/* Cumartesi */}
              <div style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground)' }}>Cumartesi Günü</div>
                  <button
                    type="button"
                    onClick={() => setSaturdayShift({ ...saturdayShift, active: !saturdayShift.active })}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: 'none',
                      background: saturdayShift.active ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: saturdayShift.active ? '#22c55e' : '#ef4444',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {saturdayShift.active ? 'Çalışıyor' : 'İzinli'}
                  </button>
                </div>
                {saturdayShift.active && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 8, alignItems: 'center' }}>
                    <select
                      value={saturdayShift.shiftType}
                      onChange={e => {
                        const dt = dailyTemplates.find(d => d.name === e.target.value)
                        if (dt) {
                          setSaturdayShift({
                            active: true,
                            shiftType: dt.name,
                            startTime: `${Math.floor(dt.start).toString().padStart(2, '0')}:${dt.start % 1 === 0.5 ? '30' : '00'}`,
                            endTime: `${Math.floor(dt.end).toString().padStart(2, '0')}:${dt.end % 1 === 0.5 ? '30' : '00'}`
                          })
                        } else {
                          setSaturdayShift({ ...saturdayShift, shiftType: e.target.value })
                        }
                      }}
                      style={inputStyle}
                    >
                      {dailyTemplates.map(dt => (
                        <option key={dt.id} value={dt.name}>{dt.name} ({dt.start}:00-{dt.end}:00)</option>
                      ))}
                      <option value="Özel">Özel Saat</option>
                    </select>
                    <input
                      type="time"
                      value={saturdayShift.startTime}
                      onChange={e => setSaturdayShift({ ...saturdayShift, startTime: e.target.value })}
                      style={{ ...inputStyle, textAlign: 'center' }}
                    />
                    <input
                      type="time"
                      value={saturdayShift.endTime}
                      onChange={e => setSaturdayShift({ ...saturdayShift, endTime: e.target.value })}
                      style={{ ...inputStyle, textAlign: 'center' }}
                    />
                  </div>
                )}
              </div>

              {/* Pazar */}
              <div style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground)' }}>Pazar Günü</div>
                  <button
                    type="button"
                    onClick={() => setSundayShift({ ...sundayShift, active: !sundayShift.active })}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: 'none',
                      background: sundayShift.active ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: sundayShift.active ? '#22c55e' : '#ef4444',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {sundayShift.active ? 'Çalışıyor' : 'İzinli'}
                  </button>
                </div>
                {sundayShift.active && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 8, alignItems: 'center' }}>
                    <select
                      value={sundayShift.shiftType}
                      onChange={e => {
                        const dt = dailyTemplates.find(d => d.name === e.target.value)
                        if (dt) {
                          setSundayShift({
                            active: true,
                            shiftType: dt.name,
                            startTime: `${Math.floor(dt.start).toString().padStart(2, '0')}:${dt.start % 1 === 0.5 ? '30' : '00'}`,
                            endTime: `${Math.floor(dt.end).toString().padStart(2, '0')}:${dt.end % 1 === 0.5 ? '30' : '00'}`
                          })
                        } else {
                          setSundayShift({ ...sundayShift, shiftType: e.target.value })
                        }
                      }}
                      style={inputStyle}
                    >
                      {dailyTemplates.map(dt => (
                        <option key={dt.id} value={dt.name}>{dt.name} ({dt.start}:00-{dt.end}:00)</option>
                      ))}
                      <option value="Özel">Özel Saat</option>
                    </select>
                    <input
                      type="time"
                      value={sundayShift.startTime}
                      onChange={e => setSundayShift({ ...sundayShift, startTime: e.target.value })}
                      style={{ ...inputStyle, textAlign: 'center' }}
                    />
                    <input
                      type="time"
                      value={sundayShift.endTime}
                      onChange={e => setSundayShift({ ...sundayShift, endTime: e.target.value })}
                      style={{ ...inputStyle, textAlign: 'center' }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-clinic-blue"
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="btn-clinic-primary"
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {template ? 'Değişiklikleri Kaydet' : 'Aylık Şablonu Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
