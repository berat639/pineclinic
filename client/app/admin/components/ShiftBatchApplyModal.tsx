'use client'

import React, { useState, useMemo } from 'react'
import { X, Calendar, CalendarDays, Zap, Users, Check, AlertCircle, Sparkles, Clock, RefreshCw } from 'lucide-react'
import { WeeklyShiftTemplate, MonthlyShiftTemplate, DailyShiftTemplate, DAY_SHORT_TR } from '../types/shiftTemplates'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'

interface User {
  id: string
  name: string
  role: string
  active: boolean
  color?: string
}

interface Props {
  isOpen: boolean
  users: User[]
  weeklyTemplates: WeeklyShiftTemplate[]
  monthlyTemplates: MonthlyShiftTemplate[]
  dailyTemplates: DailyShiftTemplate[]
  currentWeekStart: string // YYYY-MM-DD
  currentMonth: string // YYYY-MM
  initialUserId?: string
  initialMode?: 'weekly' | 'monthly' | 'daily'
  initialWeeklyTemplateId?: string
  initialMonthlyTemplateId?: string
  onClose: () => void
  onSuccess: () => void
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

export default function ShiftBatchApplyModal({
  isOpen,
  users,
  weeklyTemplates,
  monthlyTemplates,
  dailyTemplates,
  currentWeekStart,
  currentMonth,
  initialUserId,
  initialMode = 'weekly',
  initialWeeklyTemplateId,
  initialMonthlyTemplateId,
  onClose,
  onSuccess
}: Props) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const [mode, setMode] = useState<'weekly' | 'monthly' | 'daily'>(initialMode)

  // Target Personnel: 'all' | 'hekim' | 'selected'
  const [targetType, setTargetType] = useState<'all' | 'hekim' | 'single' | 'custom'>(
    initialUserId ? 'single' : 'all'
  )
  const [selectedSingleUserId, setSelectedSingleUserId] = useState(initialUserId || users[0]?.id || '')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(initialUserId ? [initialUserId] : users.map(u => u.id))

  // Template choices
  const [selectedWeeklyTemplateId, setSelectedWeeklyTemplateId] = useState(initialWeeklyTemplateId || weeklyTemplates[0]?.id || '')
  const [selectedMonthlyTemplateId, setSelectedMonthlyTemplateId] = useState(initialMonthlyTemplateId || monthlyTemplates[0]?.id || '')
  const [selectedDailyTemplateName, setSelectedDailyTemplateName] = useState(dailyTemplates[0]?.name || 'Sabahçı')

  // Weekly period settings
  const [weeklyScope, setWeeklyScope] = useState<'current_week' | 'next_week' | 'month_weeks' | 'custom_week'>('current_week')
  const [customWeekStartDate, setCustomWeekStartDate] = useState(currentWeekStart)

  // Monthly period settings
  const [targetMonth, setTargetMonth] = useState(currentMonth || new Date().toISOString().slice(0, 7))

  // Daily period settings
  const [dailyStartDate, setDailyStartDate] = useState(currentWeekStart)
  const [dailyEndDate, setDailyEndDate] = useState(() => {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() + 6)
    return d.toISOString().split('T')[0]!
  })
  const [dailyIncludedDays, setDailyIncludedDays] = useState<Record<number, boolean>>({
    0: true, 1: true, 2: true, 3: true, 4: true, 5: false, 6: false
  })
  const [dailyStartTime, setDailyStartTime] = useState('09:00')
  const [dailyEndTime, setDailyEndTime] = useState('18:00')

  // Conflict option
  const [overwrite, setOverwrite] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  // Active target users computed
  const activeTargetUsers = useMemo(() => {
    const activeUsers = users.filter(u => u.active !== false)
    if (targetType === 'all') return activeUsers
    if (targetType === 'hekim') return activeUsers.filter(u => u.role === 'hekim')
    if (targetType === 'single') return activeUsers.filter(u => u.id === selectedSingleUserId)
    if (targetType === 'custom') return activeUsers.filter(u => selectedUserIds.includes(u.id))
    return activeUsers
  }, [users, targetType, selectedSingleUserId, selectedUserIds])

  // Calculated shifts list generator
  const generatedShifts = useMemo(() => {
    const shiftList: Array<{
      userId: string
      userName: string
      date: string
      startTime: string
      endTime: string
      shiftType: string
    }> = []

    if (activeTargetUsers.length === 0) return shiftList

    if (mode === 'weekly') {
      const selectedWTemplate = weeklyTemplates.find(w => w.id === selectedWeeklyTemplateId) || weeklyTemplates[0]
      if (!selectedWTemplate) return shiftList

      // Determine week start dates
      let startDates: string[] = []
      if (weeklyScope === 'current_week') {
        startDates = [currentWeekStart]
      } else if (weeklyScope === 'next_week') {
        const d = new Date(currentWeekStart + 'T00:00')
        d.setDate(d.getDate() + 7)
        startDates = [d.toISOString().split('T')[0]!]
      } else if (weeklyScope === 'month_weeks') {
        // Find all Monday start dates of the current month
        const [yearStr, monthStr] = targetMonth.split('-')
        const y = parseInt(yearStr || '2026', 10)
        const m = parseInt(monthStr || '8', 10) - 1
        const firstDay = new Date(y, m, 1)
        // Find first Monday on or before firstDay
        const d = new Date(firstDay)
        const dayOfWeek = (d.getDay() + 6) % 7 // 0=Mon
        d.setDate(d.getDate() - dayOfWeek)

        for (let i = 0; i < 5; i++) {
          const wStart = new Date(d)
          wStart.setDate(wStart.getDate() + i * 7)
          // check if week overlaps with month
          const wEnd = new Date(wStart)
          wEnd.setDate(wEnd.getDate() + 6)
          if (wStart.getMonth() === m || wEnd.getMonth() === m) {
            startDates.push(wStart.toISOString().split('T')[0]!)
          }
        }
      } else if (weeklyScope === 'custom_week') {
        startDates = [customWeekStartDate]
      }

      for (const wStartStr of startDates) {
        const baseDate = new Date(wStartStr + 'T00:00')
        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
          const dayPlan = selectedWTemplate.days[dayIdx as keyof typeof selectedWTemplate.days]
          if (dayPlan && dayPlan.active) {
            const shiftDate = new Date(baseDate)
            shiftDate.setDate(shiftDate.getDate() + dayIdx)
            const dateStr = shiftDate.toISOString().split('T')[0]!

            for (const u of activeTargetUsers) {
              shiftList.push({
                userId: u.id,
                userName: u.name,
                date: dateStr,
                startTime: dayPlan.startTime,
                endTime: dayPlan.endTime,
                shiftType: dayPlan.templateName || 'Vardiya'
              })
            }
          }
        }
      }
    } else if (mode === 'monthly') {
      const selectedMTemplate = monthlyTemplates.find(m => m.id === selectedMonthlyTemplateId) || monthlyTemplates[0]
      if (!selectedMTemplate) return shiftList

      const [yearStr, monthStr] = targetMonth.split('-')
      const y = parseInt(yearStr || '2026', 10)
      const m = parseInt(monthStr || '8', 10) - 1

      // Number of days in this month
      const daysInMonth = new Date(y, m + 1, 0).getDate()

      if (selectedMTemplate.mode === 'rule_based') {
        const { weekdayShift, saturdayShift, sundayShift } = selectedMTemplate
        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(y, m, day)
          const dayOfWeek = (d.getDay() + 6) % 7 // 0=Mon, 5=Sat, 6=Sun
          const dateStr = `${targetMonth}-${String(day).padStart(2, '0')}`

          let shiftRule: { active: boolean; startTime: string; endTime: string; shiftType: string } | undefined
          if (dayOfWeek >= 0 && dayOfWeek <= 4) {
            shiftRule = weekdayShift
          } else if (dayOfWeek === 5) {
            shiftRule = saturdayShift
          } else if (dayOfWeek === 6) {
            shiftRule = sundayShift
          }

          if (shiftRule && shiftRule.active) {
            for (const u of activeTargetUsers) {
              shiftList.push({
                userId: u.id,
                userName: u.name,
                date: dateStr,
                startTime: shiftRule.startTime,
                endTime: shiftRule.endTime,
                shiftType: shiftRule.shiftType || 'Vardiya'
              })
            }
          }
        }
      } else if (selectedMTemplate.mode === 'weekly_rotation') {
        const rot = selectedMTemplate.weeklyRotation || ['wt-1', 'wt-1', 'wt-1', 'wt-1']
        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(y, m, day)
          const dayOfWeek = (d.getDay() + 6) % 7 // 0=Mon
          const dateStr = `${targetMonth}-${String(day).padStart(2, '0')}`

          // Determine week index in month (0, 1, 2, 3)
          const weekIdx = Math.min(Math.floor((day - 1) / 7), 3)
          const wTplId = rot[weekIdx] || rot[0]
          const wTpl = weeklyTemplates.find(w => w.id === wTplId) || weeklyTemplates[0]

          if (wTpl) {
            const dayPlan = wTpl.days[dayOfWeek as keyof typeof wTpl.days]
            if (dayPlan && dayPlan.active) {
              for (const u of activeTargetUsers) {
                shiftList.push({
                  userId: u.id,
                  userName: u.name,
                  date: dateStr,
                  startTime: dayPlan.startTime,
                  endTime: dayPlan.endTime,
                  shiftType: dayPlan.templateName || 'Vardiya'
                })
              }
            }
          }
        }
      }
    } else if (mode === 'daily') {
      const dt = dailyTemplates.find(d => d.name === selectedDailyTemplateName)
      let sTime = dailyStartTime
      let eTime = dailyEndTime
      if (dt) {
        sTime = `${Math.floor(dt.start).toString().padStart(2, '0')}:${dt.start % 1 === 0.5 ? '30' : '00'}`
        eTime = `${Math.floor(dt.end).toString().padStart(2, '0')}:${dt.end % 1 === 0.5 ? '30' : '00'}`
      }

      const start = new Date(dailyStartDate + 'T00:00')
      const end = new Date(dailyEndDate + 'T00:00')
      const cur = new Date(start)

      while (cur <= end) {
        const dayOfWeek = (cur.getDay() + 6) % 7
        if (dailyIncludedDays[dayOfWeek]) {
          const dateStr = cur.toISOString().split('T')[0]!
          for (const u of activeTargetUsers) {
            shiftList.push({
              userId: u.id,
              userName: u.name,
              date: dateStr,
              startTime: sTime,
              endTime: eTime,
              shiftType: selectedDailyTemplateName || 'Vardiya'
            })
          }
        }
        cur.setDate(cur.getDate() + 1)
      }
    }

    return shiftList
  }, [
    mode,
    activeTargetUsers,
    weeklyTemplates,
    monthlyTemplates,
    dailyTemplates,
    selectedWeeklyTemplateId,
    selectedMonthlyTemplateId,
    selectedDailyTemplateName,
    weeklyScope,
    customWeekStartDate,
    targetMonth,
    dailyStartDate,
    dailyEndDate,
    dailyIncludedDays,
    dailyStartTime,
    dailyEndTime,
    currentWeekStart
  ])

  const handleApply = async () => {
    if (generatedShifts.length === 0) {
      setError('Uygulanacak vardiya bulunamadı')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const payload = {
        shifts: generatedShifts.map(s => ({
          userId: s.userId,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          shiftType: s.shiftType
        })),
        overwrite
      }

      const res = await fetch('/api/shifts/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Vardiyalar uygulanamadı')
      }

      const hotToast = await import('react-hot-toast')
      hotToast.toast.success(`${data.count || generatedShifts.length} vardiya başarıyla uygulandı!`)

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Hata oluştu')
    } finally {
      setIsSubmitting(false)
    }
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
          maxWidth: 680,
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
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent, #3b82f6)'
            }}>
              <Zap size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--foreground)' }}>
                Vardiya Şablonu Uygula
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)' }}>
                Haftalık veya aylık şablonları personele toplu olarak atayın
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

        {/* Mode Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 10, border: '1px solid var(--glass-border)' }}>
          <button
            type="button"
            onClick={() => setMode('weekly')}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: mode === 'weekly' ? 'var(--accent, #3b82f6)' : 'transparent',
              color: mode === 'weekly' ? '#fff' : 'var(--foreground-2)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            <Calendar size={14} /> Haftalık Şablon
          </button>

          <button
            type="button"
            onClick={() => setMode('monthly')}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: mode === 'monthly' ? '#a855f7' : 'transparent',
              color: mode === 'monthly' ? '#fff' : 'var(--foreground-2)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            <CalendarDays size={14} /> Aylık Şablon
          </button>

          <button
            type="button"
            onClick={() => setMode('daily')}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: mode === 'daily' ? '#10b981' : 'transparent',
              color: mode === 'daily' ? '#fff' : 'var(--foreground-2)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            <Clock size={14} /> Hızlı Günlük Yay
          </button>
        </div>

        {/* 1. Şablon Seçimi */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 10, border: '1px solid var(--glass-border)' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 6 }}>
            {mode === 'weekly' && 'Uygulanacak Haftalık Şablon'}
            {mode === 'monthly' && 'Uygulanacak Aylık Şablon'}
            {mode === 'daily' && 'Uygulanacak Günlük Şablon'}
          </label>

          {mode === 'weekly' && (
            <select
              value={selectedWeeklyTemplateId}
              onChange={e => setSelectedWeeklyTemplateId(e.target.value)}
              style={inputStyle}
            >
              {weeklyTemplates.map(w => (
                <option key={w.id} value={w.id}>{w.name} {w.description ? `(${w.description})` : ''}</option>
              ))}
            </select>
          )}

          {mode === 'monthly' && (
            <select
              value={selectedMonthlyTemplateId}
              onChange={e => setSelectedMonthlyTemplateId(e.target.value)}
              style={inputStyle}
            >
              {monthlyTemplates.map(m => (
                <option key={m.id} value={m.id}>{m.name} {m.description ? `(${m.description})` : ''}</option>
              ))}
            </select>
          )}

          {mode === 'daily' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 8, alignItems: 'center' }}>
              <select
                value={selectedDailyTemplateName}
                onChange={e => setSelectedDailyTemplateName(e.target.value)}
                style={inputStyle}
              >
                {dailyTemplates.map(d => (
                  <option key={d.id} value={d.name}>{d.name} ({d.start}:00 - {d.end}:00)</option>
                ))}
              </select>
              <input
                type="time"
                value={dailyStartTime}
                onChange={e => setDailyStartTime(e.target.value)}
                style={{ ...inputStyle, textAlign: 'center' }}
              />
              <input
                type="time"
                value={dailyEndTime}
                onChange={e => setDailyEndTime(e.target.value)}
                style={{ ...inputStyle, textAlign: 'center' }}
              />
            </div>
          )}
        </div>

        {/* 2. Hedef Personel */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 10, border: '1px solid var(--glass-border)' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 6 }}>
            Hedef Personel
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6, marginBottom: 10 }}>
            {[
              { id: 'all', label: `Tüm Personel (${users.filter(u => u.active !== false).length})` },
              { id: 'hekim', label: `Hekimler (${users.filter(u => u.role === 'hekim' && u.active !== false).length})` },
              { id: 'single', label: 'Tek Kişi Seç' },
              { id: 'custom', label: 'Özel Çoklu Seçim' },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTargetType(t.id as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: `1px solid ${targetType === t.id ? 'var(--accent, #3b82f6)' : 'var(--glass-border)'}`,
                  background: targetType === t.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                  color: targetType === t.id ? 'var(--foreground)' : 'var(--foreground-3)',
                  fontSize: '0.75rem',
                  fontWeight: targetType === t.id ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {targetType === 'single' && (
            <select
              value={selectedSingleUserId}
              onChange={e => setSelectedSingleUserId(e.target.value)}
              style={inputStyle}
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role}) {!u.active ? '— (Pasif)' : ''}
                </option>
              ))}
            </select>
          )}

          {targetType === 'custom' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto', padding: 4 }}>
              {users.map(u => {
                const isSelected = selectedUserIds.includes(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) setSelectedUserIds(prev => prev.filter(id => id !== u.id))
                      else setSelectedUserIds(prev => [...prev, u.id])
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: `1px solid ${isSelected ? 'var(--accent, #3b82f6)' : 'var(--glass-border)'}`,
                      background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.02)',
                      color: isSelected ? 'var(--foreground)' : 'var(--foreground-3)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.color || 'var(--accent)' }} />
                    {u.name}
                    {isSelected && <Check size={12} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 3. Hedef Dönem / Tarih */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 10, border: '1px solid var(--glass-border)' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 6 }}>
            Hedef Zaman / Dönem
          </label>

          {mode === 'weekly' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
                {[
                  { id: 'current_week', label: 'Görüntülenen Hafta' },
                  { id: 'next_week', label: 'Önümüzdeki Hafta' },
                  { id: 'month_weeks', label: 'Tüm Aya Uygula (4-5 Hafta)' },
                  { id: 'custom_week', label: 'Belirli Bir Hafta' },
                ].map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setWeeklyScope(s.id as any)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${weeklyScope === s.id ? 'var(--accent, #3b82f6)' : 'var(--glass-border)'}`,
                      background: weeklyScope === s.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                      color: weeklyScope === s.id ? 'var(--foreground)' : 'var(--foreground-3)',
                      fontSize: '0.72rem',
                      fontWeight: weeklyScope === s.id ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {weeklyScope === 'custom_week' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--foreground-2)' }}>Hafta Başlangıç Tarihi (Pzt):</span>
                  <input
                    type="date"
                    value={customWeekStartDate}
                    onChange={e => setCustomWeekStartDate(e.target.value)}
                    style={{ ...inputStyle, width: 'auto' }}
                  />
                </div>
              )}

              {weeklyScope === 'month_weeks' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--foreground-2)' }}>Hedef Ay:</span>
                  <input
                    type="month"
                    value={targetMonth}
                    onChange={e => setTargetMonth(e.target.value)}
                    style={{ ...inputStyle, width: 'auto' }}
                  />
                </div>
              )}
            </div>
          )}

          {mode === 'monthly' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--foreground-2)' }}>Hedef Ay Seçimi:</span>
              <input
                type="month"
                value={targetMonth}
                onChange={e => setTargetMonth(e.target.value)}
                style={{ ...inputStyle, width: 'auto' }}
              />
            </div>
          )}

          {mode === 'daily' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 2 }}>Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={dailyStartDate}
                    onChange={e => setDailyStartDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 2 }}>Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={dailyEndDate}
                    onChange={e => setDailyEndDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Uygulanacak Günler</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 1, 2, 3, 4, 5, 6].map(dIdx => {
                    const active = dailyIncludedDays[dIdx]
                    return (
                      <button
                        key={dIdx}
                        type="button"
                        onClick={() => setDailyIncludedDays(prev => ({ ...prev, [dIdx]: !prev[dIdx] }))}
                        style={{
                          flex: 1,
                          padding: '5px 0',
                          borderRadius: 6,
                          border: `1px solid ${active ? '#10b981' : 'var(--glass-border)'}`,
                          background: active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.02)',
                          color: active ? '#10b981' : 'var(--foreground-3)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {DAY_SHORT_TR[dIdx]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Çakışma Yönetimi */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground)' }}>
              Mevcut Vardiyaları Güncelle / Üzerine Yaz
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>
              Açıkken çakışan günlerdeki eski saatler güncellenir, kapalıyken sadece boş günlere eklenir.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOverwrite(!overwrite)}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: 'none',
              background: overwrite ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
              color: overwrite ? 'var(--accent, #60a5fa)' : 'var(--foreground-3)',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {overwrite ? 'Üzerine Yaz' : 'Koru & Atla'}
          </button>
        </div>

        {/* 5. Özet & Önizleme */}
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} color="var(--accent)" />
            <div style={{ fontSize: '0.78rem', color: 'var(--foreground)' }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{activeTargetUsers.length} personel</span> için toplam{' '}
              <span style={{ fontWeight: 700, color: '#22c55e' }}>{generatedShifts.length} vardiya</span> oluşturulacak.
            </div>
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
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
            type="button"
            onClick={handleApply}
            disabled={isSubmitting || generatedShifts.length === 0}
            className="btn-clinic-primary"
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: isSubmitting || generatedShifts.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isSubmitting || generatedShifts.length === 0 ? 0.6 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={14} className="animate-spin" /> Kaydediliyor...
              </>
            ) : (
              <>
                <Zap size={14} /> Şablonu Uygula ve Takvime İşle
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
