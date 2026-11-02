'use client'

import React, { useState } from 'react'
import { X, Copy, Check, Sparkles, Clock, Calendar } from 'lucide-react'
import { WeeklyShiftTemplate, WeeklyDayPlan, DailyShiftTemplate, DAY_NAMES_TR, DAY_SHORT_TR } from '../types/shiftTemplates'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'

interface Props {
  isOpen: boolean
  template?: WeeklyShiftTemplate | null
  dailyTemplates: DailyShiftTemplate[]
  onSave: (template: WeeklyShiftTemplate) => void
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

export default function WeeklyTemplateModal({ isOpen, template, dailyTemplates, onSave, onClose }: Props) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [days, setDays] = useState<Record<number, WeeklyDayPlan>>(() => {
    if (template?.days) return { ...template.days }
    return {
      0: { active: true, startTime: '09:00', endTime: '19:00', templateName: 'Sabahçı' },
      1: { active: true, startTime: '09:00', endTime: '19:00', templateName: 'Sabahçı' },
      2: { active: true, startTime: '09:00', endTime: '19:00', templateName: 'Sabahçı' },
      3: { active: true, startTime: '09:00', endTime: '19:00', templateName: 'Sabahçı' },
      4: { active: true, startTime: '09:00', endTime: '19:00', templateName: 'Sabahçı' },
      5: { active: true, startTime: '12:00', endTime: '20:00', templateName: 'Öğlenci' },
      6: { active: false, startTime: '09:00', endTime: '18:00', templateName: 'İzinli' },
    }
  })

  if (!isOpen) return null

  const handleDayChange = (dayIdx: number, field: keyof WeeklyDayPlan, value: any) => {
    setDays(prev => ({
      ...prev,
      [dayIdx]: {
        ...prev[dayIdx],
        [field]: value
      }
    }))
  }

  const handleDailyTemplateSelect = (dayIdx: number, dailyTplName: string) => {
    const found = dailyTemplates.find(d => d.name === dailyTplName)
    if (found) {
      const sh = Math.floor(found.start).toString().padStart(2, '0')
      const sm = found.start % 1 === 0.5 ? '30' : '00'
      const eh = Math.floor(found.end).toString().padStart(2, '0')
      const em = found.end % 1 === 0.5 ? '30' : '00'
      setDays(prev => ({
        ...prev,
        [dayIdx]: {
          active: true,
          startTime: `${sh}:${sm}`,
          endTime: `${eh}:${em}`,
          templateName: found.name
        }
      }))
    } else if (dailyTplName === 'izin') {
      setDays(prev => ({
        ...prev,
        [dayIdx]: {
          ...prev[dayIdx],
          active: false,
          templateName: 'İzinli'
        }
      }))
    }
  }

  const copyMondayToWeekdays = () => {
    const mondayPlan = days[0]
    setDays(prev => ({
      ...prev,
      1: { ...mondayPlan },
      2: { ...mondayPlan },
      3: { ...mondayPlan },
      4: { ...mondayPlan },
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      id: template?.id || `wt-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      days: days as WeeklyShiftTemplate['days']
    })
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: 16
      }}
      {...backdropDismiss}
    >
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'calc(100vw - 24px)',
          maxWidth: 460,
          maxHeight: '90vh',
          background: 'var(--card-bg)',
          borderRadius: 14,
          border: '1.5px solid var(--input-border)',
          boxShadow: 'var(--pc-modal-shadow)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: 'var(--pc-clay-primary)',
              flexShrink: 0
            }}>
              <Calendar size={17} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2 }}>
                {template ? 'Haftalık Planı Düzenle' : 'Yeni Haftalık Vardiya Planı'}
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginTop: 2 }}>
                7 günlük çalışma ve izin düzeni belirleyin
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--pc-clay-btn)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', flex: 1, overflowY: 'auto', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>
              Şablon Adı *
            </label>
            <input
              placeholder="Örn: Standart Hafta İçi, Nöbetçi Rotasyonu A"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>
              Açıklama / Not (İsteğe bağlı)
            </label>
            <input
              placeholder="Örn: Hafta içi sabah 9-19, cumartesi yarım gün"
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* 7 Days Matrix Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--foreground)' }}>
              7 Günlük Program
            </span>
            <button
              type="button"
              onClick={copyMondayToWeekdays}
              style={{
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 6,
                color: 'var(--accent, #60a5fa)',
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '4px 10px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <Copy size={12} /> Pazartesi'yi Hafta İçi Tümüne Kopyala
            </button>
          </div>

          {/* Days list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 10, border: '1px solid var(--glass-border)' }}>
            {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => {
              const dayPlan = days[dayIdx] || { active: true, startTime: '09:00', endTime: '18:00' }
              const isWeekend = dayIdx === 5 || dayIdx === 6
              return (
                <div
                  key={dayIdx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 80px 1fr 70px 70px',
                    gap: 8,
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: dayPlan.active ? 'rgba(255, 255, 255, 0.03)' : 'rgba(239, 68, 68, 0.05)',
                    border: `1px solid ${dayPlan.active ? 'var(--glass-border)' : 'rgba(239, 68, 68, 0.2)'}`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: isWeekend ? '#f59e0b' : 'var(--foreground)'
                    }}>
                      {DAY_SHORT_TR[dayIdx]}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>
                      ({DAY_NAMES_TR[dayIdx].slice(0, 3)})
                    </span>
                  </div>

                  {/* Active Toggle Button */}
                  <button
                    type="button"
                    onClick={() => handleDayChange(dayIdx, 'active', !dayPlan.active)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: 'none',
                      background: dayPlan.active ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: dayPlan.active ? '#22c55e' : '#ef4444',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {dayPlan.active ? 'Çalışıyor' : 'İzinli'}
                  </button>

                  {/* Preset Selector */}
                  {dayPlan.active ? (
                    <select
                      value={dayPlan.templateName || ''}
                      onChange={e => handleDailyTemplateSelect(dayIdx, e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--foreground)',
                        fontSize: '0.75rem',
                        outline: 'none'
                      }}
                    >
                      <option value="">Özel Saat</option>
                      {dailyTemplates.map(dt => (
                        <option key={dt.id} value={dt.name}>{dt.name} ({dt.start}:00-{dt.end}:00)</option>
                      ))}
                      <option value="izin">🚫 İzinli Yap</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', fontStyle: 'italic' }}>
                      Dinlenme / Tatil Günü
                    </span>
                  )}

                  {/* Start Time */}
                  {dayPlan.active ? (
                    <input
                      type="time"
                      value={dayPlan.startTime}
                      onChange={e => handleDayChange(dayIdx, 'startTime', e.target.value)}
                      style={{
                        padding: '3px 4px',
                        borderRadius: 6,
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--foreground)',
                        fontSize: '0.75rem',
                        textAlign: 'center'
                      }}
                    />
                  ) : <div />}

                  {/* End Time */}
                  {dayPlan.active ? (
                    <input
                      type="time"
                      value={dayPlan.endTime}
                      onChange={e => handleDayChange(dayIdx, 'endTime', e.target.value)}
                      style={{
                        padding: '3px 4px',
                        borderRadius: 6,
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--foreground)',
                        fontSize: '0.75rem',
                        textAlign: 'center'
                      }}
                    />
                  ) : <div />}
                </div>
              )
            })}
          </div>

        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid var(--input-border)',
              background: 'var(--card-bg)',
              color: 'var(--foreground)',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            İptal
          </button>
          <button
            type="submit"
            style={{
              padding: '9px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: 'var(--pc-clay-primary)',
            }}
          >
            <span style={{ color: '#ffffff' }}>Kaydet</span>
          </button>
        </div>
      </form>
    </div>
  )
}
