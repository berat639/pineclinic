'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../../../../lib/auth-context'
import ShiftContextMenu from '../../../admin/components/ShiftContextMenu'
import DoctorLeaveModal from '../../../admin/components/DoctorLeaveModal'
import ConfirmModal from '../../../admin/components/ConfirmModal'
import ShiftPlanner from './ShiftPlanner'
import WeeklyTemplateModal from '../../../admin/components/WeeklyTemplateModal'
import MonthlyTemplateModal from '../../../admin/components/MonthlyTemplateModal'
import ShiftBatchApplyModal from '../../../admin/components/ShiftBatchApplyModal'
import { useBackdropDismiss } from '../../../../hooks/useBackdropDismiss'
import {
  DailyShiftTemplate,
  WeeklyShiftTemplate,
  MonthlyShiftTemplate,
  DEFAULT_DAILY_TEMPLATES,
  DEFAULT_WEEKLY_TEMPLATES,
  DEFAULT_MONTHLY_TEMPLATES,
  DAY_NAMES_TR,
  DAY_SHORT_TR
} from '../../../admin/types/shiftTemplates'
import {
  User as UserIcon,
  Mail,
  Phone,
  Shield,
  Palette,
  Lock,
  Check,
  X,
  Pencil,
  Trash2,
  Calendar,
  CalendarDays,
  Clock,
  Zap,
  Layers,
  Sliders,
  Plus,
  Filter,
  Sparkles,
  RotateCcw
} from 'lucide-react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface User {
  id: string
  email: string
  name: string
  role: string
  active: boolean
  phone?: string
  specialty?: string
  color?: string
}

interface ShiftItem {
  id: string
  userId: string
  userName: string
  userRole?: string
  userColor?: string
  date: string
  startTime: string
  endTime: string
  shiftType: string
  notes?: string | null
}

const inputStyle: React.CSSProperties = {
  padding: '9px 12px',
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

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--accent, #3b82f6)',
  color: '#fff',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6
}

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  yonetici: { label: 'Yönetici', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  hekim: { label: 'Hekim', color: 'var(--accent, #3b82f6)', bg: 'rgba(59,130,246,0.1)' },
  host: { label: 'Resepsiyon', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
}

export default function KlinikPersonelTab() {
  const editUserBackdropDismiss = useBackdropDismiss(() => setEditingUser(null))
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [shifts, setShifts] = useState<ShiftItem[]>([])
  const [showUserForm, setShowUserForm] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'hekim', phone: '', specialty: '', color: '#60a5fa' })
  const [error, setError] = useState('')
  const [workspace, setWorkspace] = useState<'planner' | 'people' | 'templates'>('planner')

  // Calendar View & Navigation state
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [doctorFilter, setDoctorFilter] = useState('all')

  // Single shift form state
  const [shiftForm, setShiftForm] = useState({ userId: '', date: '', startTime: '09:00', endTime: '18:00', shiftType: 'Tam Gün' })
  const [showShiftForm, setShowShiftForm] = useState(false)
  const [shiftContextMenu, setShiftContextMenu] = useState<{ x: number, y: number, doctorId: string, date: string } | null>(null)
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
  const [leaveDoctorId, setLeaveDoctorId] = useState<string | undefined>(undefined)
  const [leaveDate, setLeaveDate] = useState<string | undefined>(undefined)

  // Edit user state
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<{
    name: string
    email: string
    phone: string
    role: string
    specialty: string
    color: string
    active: boolean
    password?: string
  }>({ name: '', email: '', phone: '', role: 'hekim', specialty: '', color: '#60a5fa', active: true, password: '' })
  const [editError, setEditError] = useState('')
  const [isSavingUser, setIsSavingUser] = useState(false)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null)

  // Templates Management State
  const [templatesTab, setTemplatesTab] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [dailyTemplates, setDailyTemplates] = useState<DailyShiftTemplate[]>(DEFAULT_DAILY_TEMPLATES)
  const [weeklyTemplates, setWeeklyTemplates] = useState<WeeklyShiftTemplate[]>(DEFAULT_WEEKLY_TEMPLATES)
  const [monthlyTemplates, setMonthlyTemplates] = useState<MonthlyShiftTemplate[]>(DEFAULT_MONTHLY_TEMPLATES)

  // Daily template form
  const [newDailyName, setNewDailyName] = useState('')
  const [newDailyRange, setNewDailyRange] = useState<[number, number]>([9, 17])

  // Modals for creating/editing templates and batch assignment
  const [isWeeklyModalOpen, setIsWeeklyModalOpen] = useState(false)
  const [editingWeeklyTemplate, setEditingWeeklyTemplate] = useState<WeeklyShiftTemplate | null>(null)

  const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState(false)
  const [editingMonthlyTemplate, setEditingMonthlyTemplate] = useState<MonthlyShiftTemplate | null>(null)

  const [isBatchApplyOpen, setIsBatchApplyOpen] = useState(false)
  const [batchModalConfig, setBatchModalConfig] = useState<{
    initialUserId?: string
    initialMode?: 'weekly' | 'monthly' | 'daily'
    initialWeeklyTemplateId?: string
    initialMonthlyTemplateId?: string
  }>({})

  // Clear shifts confirm
  const [confirmClearModal, setConfirmClearModal] = useState<{ isOpen: boolean; title: string; startDate: string; endDate: string } | null>(null)

  // Load templates from localStorage
  useEffect(() => {
    try {
      const storedDaily = localStorage.getItem('shiftDailyTemplates') || localStorage.getItem('shiftTemplates')
      if (storedDaily) {
        const parsed = JSON.parse(storedDaily)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // normalize format if old format {name, start, end}
          setDailyTemplates(parsed.map((p, idx) => ({
            id: p.id || `dt-${idx + 1}`,
            name: p.name,
            start: p.start,
            end: p.end,
            color: p.color || '#3b82f6'
          })))
        }
      }

      const storedWeekly = localStorage.getItem('shiftWeeklyTemplates')
      if (storedWeekly) {
        const parsed = JSON.parse(storedWeekly)
        if (Array.isArray(parsed) && parsed.length > 0) setWeeklyTemplates(parsed)
      }

      const storedMonthly = localStorage.getItem('shiftMonthlyTemplates')
      if (storedMonthly) {
        const parsed = JSON.parse(storedMonthly)
        if (Array.isArray(parsed) && parsed.length > 0) setMonthlyTemplates(parsed)
      }
    } catch {}
  }, [])

  const saveDailyTemplates = (t: DailyShiftTemplate[]) => {
    setDailyTemplates(t)
    localStorage.setItem('shiftDailyTemplates', JSON.stringify(t))
    localStorage.setItem('shiftTemplates', JSON.stringify(t))
    window.dispatchEvent(new Event('shiftTemplatesUpdated'))
  }

  const saveWeeklyTemplates = (t: WeeklyShiftTemplate[]) => {
    setWeeklyTemplates(t)
    localStorage.setItem('shiftWeeklyTemplates', JSON.stringify(t))
  }

  const saveMonthlyTemplates = (t: MonthlyShiftTemplate[]) => {
    setMonthlyTemplates(t)
    localStorage.setItem('shiftMonthlyTemplates', JSON.stringify(t))
  }

  const fetchData = useCallback(() => {
    fetch(`/api/admin/users`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setUsers)
      .catch(() => {})

    fetch(`/api/shifts`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setShifts)
      .catch(() => {})
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // User Actions
  async function addUser(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const res = await fetch(`/api/yonetici/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (res.ok) {
      setUsers([...users, { ...data, active: true }])
      setShowUserForm(false)
      setForm({ email: '', name: '', password: '', role: 'hekim', phone: '', specialty: '', color: '#60a5fa' })
      import('react-hot-toast').then(m => m.toast.success('Yeni kullanıcı oluşturuldu'))
      fetchData()
    } else {
      setError(data.error || 'Hata')
    }
  }

  const openEditModal = (u: User) => {
    setEditingUser(u)
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role || 'hekim',
      specialty: u.specialty || '',
      color: u.color || '#60a5fa',
      active: u.active ?? true,
      password: ''
    })
    setEditError('')
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser) return
    setIsSavingUser(true)
    setEditError('')
    try {
      const payload: any = {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
        specialty: editForm.role === 'hekim' ? editForm.specialty : null,
        color: editForm.role === 'hekim' ? editForm.color : null,
        active: editForm.active
      }
      if (editForm.password && editForm.password.trim().length >= 6) {
        payload.password = editForm.password.trim()
      }
      const res = await fetch(`/api/yonetici/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Güncelleme başarısız')

      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...payload } : u))
      setEditingUser(null)
      import('react-hot-toast').then(m => m.toast.success('Kullanıcı güncellendi'))
      fetchData()
    } catch (err: any) {
      setEditError(err.message || 'Hata oluştu')
      import('react-hot-toast').then(m => m.toast.error(err.message || 'Hata oluştu'))
    } finally {
      setIsSavingUser(false)
    }
  }

  async function handleDeleteUser(u: User) {
    try {
      const res = await fetch(`/api/yonetici/users/${u.id}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Silinemedi')
      }
      setUsers(prev => prev.filter(x => x.id !== u.id))
      setEditingUser(null)
      setConfirmDeleteUser(null)
      import('react-hot-toast').then(m => m.toast.success('Kullanıcı başarıyla silindi'))
      fetchData()
    } catch (err: any) {
      import('react-hot-toast').then(m => m.toast.error(err.message || 'Silme işlemi başarısız'))
    }
  }

  // Single Shift Actions
  async function createShift(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(shiftForm)
    })
    if (res.ok) {
      fetchData()
      setShowShiftForm(false)
      import('react-hot-toast').then(m => m.toast.success('Vardiya kaydedildi'))
    } else {
      const d = await res.json()
      import('react-hot-toast').then(m => m.toast.error(d.error || 'Vardiya kaydedilemedi'))
    }
  }

  async function deleteShift(id: string) {
    await fetch(`/api/shifts/${id}`, { method: 'DELETE', credentials: 'include' })
    setShifts(shifts.filter(s => s.id !== id))
    import('react-hot-toast').then(m => m.toast.success('Vardiya silindi'))
  }

  async function handleClearShifts(startDate: string, endDate: string) {
    try {
      const res = await fetch('/api/shifts/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startDate,
          endDate,
          userId: doctorFilter !== 'all' ? doctorFilter : undefined
        })
      })
      if (res.ok) {
        fetchData()
        setConfirmClearModal(null)
        import('react-hot-toast').then(m => m.toast.success('Belirtilen dönemdeki vardiyalar temizlendi'))
      }
    } catch {
      import('react-hot-toast').then(m => m.toast.error('Temizleme işlemi başarısız oldu'))
    }
  }

  // Week View Calculations
  const startOfWeek = useMemo(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) + weekOffset * 7
    const result = new Date(d.setDate(diff))
    return result
  }, [weekOffset])

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek)
      d.setDate(d.getDate() + i)
      return d.toISOString().split('T')[0]!
    })
  }, [startOfWeek])

  const currentWeekStartStr = weekDays[0]!

  // Month View Calculations
  const activeMonthDate = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + monthOffset)
    return d
  }, [monthOffset])

  const currentMonthStr = useMemo(() => {
    return `${activeMonthDate.getFullYear()}-${String(activeMonthDate.getMonth() + 1).padStart(2, '0')}`
  }, [activeMonthDate])

  const monthGridDays = useMemo(() => {
    const year = activeMonthDate.getFullYear()
    const month = activeMonthDate.getMonth()

    const firstDayOfMonth = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7 // 0=Mon, 6=Sun

    const prevMonthDays = new Date(year, month, 0).getDate()

    const grid = []

    // Previous month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i
      const d = new Date(year, month - 1, dayNum)
      grid.push({
        dateStr: d.toISOString().split('T')[0]!,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]
      })
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i)
      grid.push({
        dateStr: d.toISOString().split('T')[0]!,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]
      })
    }

    // Next month padding to fill grid to multiple of 7
    const remaining = 7 - (grid.length % 7)
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i)
        grid.push({
          dateStr: d.toISOString().split('T')[0]!,
          dayNumber: i,
          isCurrentMonth: false,
          isToday: d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]
        })
      }
    }

    return grid
  }, [activeMonthDate])

  // Filtered shifts
  const displayShifts = useMemo(() => {
    if (doctorFilter === 'all') return shifts
    return shifts.filter(s => s.userId === doctorFilter)
  }, [shifts, doctorFilter])

  // Quick Open Batch Modal with pre-config
  const openBatchModal = (config: {
    initialUserId?: string
    initialMode?: 'weekly' | 'monthly' | 'daily'
    initialWeeklyTemplateId?: string
    initialMonthlyTemplateId?: string
  } = {}) => {
    setBatchModalConfig(config)
    setIsBatchApplyOpen(true)
  }

  return (
    <div style={{ width: '100%' }}>
      <nav aria-label="Klinik personeli bölümleri" style={{ display: 'flex', gap: 4, marginBottom: 18, padding: 4, width: 'fit-content', borderRadius: 10, background: 'var(--card-inner)', border: '1px solid var(--input-border)' }}>
        {([['planner', 'Mesai Planı'], ['people', 'Personeller'], ['templates', 'Şablonlar']] as const).map(([id, text]) => <button key={id} onClick={() => setWorkspace(id)} aria-pressed={workspace === id} style={{ minHeight: 40, padding: '0 14px', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, background: workspace === id ? 'var(--accent)' : 'var(--input-bg)', color: workspace === id ? 'var(--btn-clinic-primary-fg)' : 'var(--foreground-2)' }}>{text}</button>)}
      </nav>
      {workspace === 'planner' && <ShiftPlanner users={users} shifts={shifts} onChanged={fetchData} onOpenLeave={(userId, date) => { setLeaveDoctorId(userId || users[0]?.id); setLeaveDate(date); setIsLeaveModalOpen(true) }} />}
      {workspace === 'people' && <>
      {/* ── Personel Listesi ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Klinik Personeli</h2>
        <span style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', background: 'var(--glass-bg)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
          {users.length} kişi
        </span>
        <button onClick={() => setShowUserForm(!showUserForm)} style={btnStyle}>
          {showUserForm ? 'İptal' : '+ Yeni Personel Ekle'}
        </button>
        <button
          onClick={() => {
            setLeaveDoctorId(undefined)
            setLeaveDate(new Date().toISOString().split('T')[0])
            setIsLeaveModalOpen(true)
          }}
          style={{
            ...btnStyle,
            background: 'var(--card-bg, #1e293b)',
            border: '1px solid var(--input-border, #334155)',
            color: 'var(--foreground, #ffffff)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
          title="Hekimlerin izinli veya kapalı olduğu saatleri yönetin"
        >
          🏖️ Hekim İzin / Kapalı Saat Yönetimi
        </button>
      </div>

      {showUserForm && (
        <form onSubmit={addUser} className="glass-card" style={{ padding: 18, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, borderRadius: 12 }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Ad Soyad *</label>
            <input placeholder="Örn: Dr. Ahmet Yılmaz" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>E-posta *</label>
            <input placeholder="ahmet@klinik.com" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Şifre * (En az 6 karakter)</label>
            <input placeholder="••••••••" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Telefon</label>
            <input placeholder="05xxxxxxxxx" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Rol *</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="hekim">Hekim</option>
              <option value="host">Resepsiyon</option>
              <option value="yonetici">Yönetici</option>
            </select>
          </div>
          {form.role === 'hekim' && (
            <>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Uzmanlık</label>
                <input placeholder="Örn: Ortodonti, Çene Cerrahisi" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Takvim Rengi</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: 44, height: 34, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--foreground-2)' }}>{form.color}</span>
                </div>
              </div>
            </>
          )}
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
            <button type="button" onClick={() => setShowUserForm(false)} style={{ ...btnStyle, background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--foreground)' }}>Vazgeç</button>
            <button type="submit" style={btnStyle}>Personeli Kaydet</button>
          </div>
          {error && <div style={{ gridColumn: '1/-1', fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>{error}</div>}
        </form>
      )}

      {/* User cards - responsive modern grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12, marginBottom: 36 }}>
        {users.map(u => {
          const role = ROLE_META[u.role] || ROLE_META.host
          return (
            <div
              key={u.id}
              className="glass-card"
              onClick={() => openEditModal(u)}
              style={{
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-bg)',
                position: 'relative'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--glass-border)'
                e.currentTarget.style.transform = 'none'
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setShiftContextMenu({ x: e.clientX, y: e.clientY, doctorId: u.id, date: new Date().toISOString().split('T')[0]! })
              }}
            >
              {/* Avatar / Color Indicator */}
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: u.color ? `${u.color}22` : 'rgba(59, 130, 246, 0.12)',
                border: `2px solid ${u.color || 'var(--accent)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: u.color || 'var(--accent)',
                fontWeight: 700,
                fontSize: '0.85rem',
                flexShrink: 0
              }}>
                {u.name?.charAt(0)?.toUpperCase() || 'P'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.name}
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {u.email}
                </div>
                {u.specialty && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--accent)', marginTop: 2, fontWeight: 500 }}>
                    {u.specialty}
                  </div>
                )}
              </div>

              {/* Status & Role Badges */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 6, background: role.bg, color: role.color, fontWeight: 700 }}>
                    {role.label}
                  </span>
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '2px 6px',
                    borderRadius: 6,
                    background: u.active ? 'rgba(34, 197, 94, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                    color: u.active ? '#22c55e' : '#94a3b8',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: u.active ? '#22c55e' : '#94a3b8' }} />
                    {u.active ? 'Aktif' : 'Pasif'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openBatchModal({ initialUserId: u.id, initialMode: 'weekly' })
                    }}
                    title="Bu personele şablon ata"
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      color: 'var(--accent, #60a5fa)',
                      fontSize: '0.68rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 6px',
                      borderRadius: 4
                    }}
                  >
                    <Zap size={11} /> Şablon Ata
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditModal(u)
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--foreground-3)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 4px',
                      borderRadius: 4
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Kullanıcı Düzenleme Modalı ── */}
      {editingUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: 16
          }}
          {...editUserBackdropDismiss}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 520,
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: editForm.color ? `${editForm.color}22` : 'rgba(59, 130, 246, 0.12)',
                  border: `2px solid ${editForm.color || 'var(--accent)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: editForm.color || 'var(--accent)'
                }}>
                  <UserIcon size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--foreground)' }}>Personel Düzenle</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)' }}>{editingUser.email}</div>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Ad Soyad *</label>
                  <input
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>E-posta *</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Telefon</label>
                  <input
                    value={editForm.phone}
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="05xxxxxxxxx"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Rol</label>
                  <select
                    value={editForm.role}
                    onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="hekim">Hekim</option>
                    <option value="host">Resepsiyon</option>
                    <option value="yonetici">Yönetici</option>
                  </select>
                </div>
              </div>

              {editForm.role === 'hekim' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Uzmanlık</label>
                    <input
                      value={editForm.specialty}
                      onChange={e => setEditForm({ ...editForm, specialty: e.target.value })}
                      placeholder="Örn: Ortodonti, Pedodonti"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'block', marginBottom: 4 }}>Takvim Rengi</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                      <input
                        type="color"
                        value={editForm.color}
                        onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                        style={{ width: 44, height: 34, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--foreground-2)', fontWeight: 600 }}>{editForm.color}</span>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Lock size={14} color="var(--foreground-3)" /> Yeni Şifre Belirle <span style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', fontWeight: 400 }}>(İsteğe bağlı, boş bırakılırsa değişmez)</span>
                </label>
                <input
                  type="password"
                  placeholder="En az 6 karakterli yeni şifre"
                  value={editForm.password || ''}
                  onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                  style={inputStyle}
                  minLength={6}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>Hesap Durumu</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>Pasif yapılan personel sisteme giriş yapamaz.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, active: !editForm.active })}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: editForm.active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: editForm.active ? '#22c55e' : '#ef4444',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {editForm.active ? <Check size={14} /> : <X size={14} />}
                  {editForm.active ? 'Aktif' : 'Pasif'}
                </button>
              </div>

              {editError && (
                <div style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 600, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)' }}>
                  ⚠️ {editError}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteUser(editingUser)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.08)',
                    color: '#ef4444',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Trash2 size={14} /> Kullanıcıyı Sil
                </button>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid var(--glass-border)',
                      background: 'transparent',
                      color: 'var(--foreground-2)',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingUser}
                    style={{
                      ...btnStyle,
                      padding: '8px 20px',
                      background: 'var(--accent)',
                      opacity: isSavingUser ? 0.7 : 1
                    }}
                  >
                    {isSavingUser ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteUser && (
        <ConfirmModal
          isOpen={true}
          title="Kullanıcıyı Sil"
          message={`"${confirmDeleteUser.name}" adlı kullanıcıyı sistemden kalıcı olarak silmek istediğinize emin misiniz?`}
          confirmText="Evet, Sil"
          cancelText="Vazgeç"
          variant="danger"
          onConfirm={() => handleDeleteUser(confirmDeleteUser)}
          onClose={() => setConfirmDeleteUser(null)}
        />
      )}
      </>}

      {/* ── Shift Takvimi Bölümü ── */}
      <div style={{ display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          {/* Sol Başlık ve Görünüm Seçimi */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--foreground)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={18} color="var(--accent)" /> Vardiya Takvimi
            </h2>

            {/* View Switch: Haftalık / Aylık */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 8, border: '1px solid var(--glass-border)' }}>
              <button
                onClick={() => setCalendarView('week')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: calendarView === 'week' ? 'var(--accent, #3b82f6)' : 'transparent',
                  color: calendarView === 'week' ? '#fff' : 'var(--foreground-3)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Calendar size={12} /> Haftalık
              </button>
              <button
                onClick={() => setCalendarView('month')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: calendarView === 'month' ? 'var(--accent, #3b82f6)' : 'transparent',
                  color: calendarView === 'month' ? '#fff' : 'var(--foreground-3)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <CalendarDays size={12} /> Aylık
              </button>
            </div>

            {/* Personel Filtresi */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={13} color="var(--foreground-3)" />
              <select
                value={doctorFilter}
                onChange={e => setDoctorFilter(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--glass-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--foreground)',
                  fontSize: '0.75rem',
                  outline: 'none'
                }}
              >
                <option value="all">Tüm Personel</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sağ Aksiyonlar & Navigasyon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => openBatchModal({ initialMode: calendarView === 'month' ? 'monthly' : 'weekly' })}
              style={{
                ...btnStyle,
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                boxShadow: '0 2px 10px rgba(59, 130, 246, 0.3)'
              }}
            >
              <Zap size={14} /> ⚡ Şablon Uygula
            </button>

            <button
              onClick={() => setShowShiftForm(!showShiftForm)}
              style={{
                ...btnStyle,
                background: showShiftForm ? 'rgba(239, 68, 68, 0.15)' : 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                color: showShiftForm ? '#ef4444' : 'var(--foreground)'
              }}
            >
              {showShiftForm ? '✕ İptal' : '+ Tekil Vardiya'}
            </button>

            <button
              onClick={() => {
                setLeaveDoctorId(doctorFilter !== 'all' ? doctorFilter : undefined)
                setLeaveDate(new Date().toISOString().split('T')[0])
                setIsLeaveModalOpen(true)
              }}
              style={{
                ...btnStyle,
                background: 'var(--card-bg, #1e293b)',
                border: '1px solid var(--input-border, #334155)',
                color: 'var(--foreground, #ffffff)',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
              title="Hekimlerin izinli veya kapalı olduğu saatleri yönetin"
            >
              🏖️ İzin / Kapalı Saat
            </button>

          </div>
        </div>

        {/* Tekil Vardiya Ekleme Formu */}
        {showShiftForm && (
          <form onSubmit={createShift} className="glass-card" style={{ padding: 14, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
            <select
              value={shiftForm.userId}
              onChange={e => setShiftForm({ ...shiftForm, userId: e.target.value })}
              required
              style={{ ...inputStyle, width: 'auto', minWidth: 150 }}
            >
              <option value="">Personel Seç *</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}{!u.active ? ' (deaktif)' : ''}</option>)}
            </select>

            <input
              type="date"
              value={shiftForm.date}
              onChange={e => setShiftForm({ ...shiftForm, date: e.target.value })}
              required
              style={{ ...inputStyle, width: 'auto' }}
            />

            {/* Quick Template Picker */}
            <select
              value={shiftForm.shiftType}
              onChange={e => {
                const found = dailyTemplates.find(d => d.name === e.target.value)
                if (found) {
                  const sh = Math.floor(found.start).toString().padStart(2, '0')
                  const sm = found.start % 1 === 0.5 ? '30' : '00'
                  const eh = Math.floor(found.end).toString().padStart(2, '0')
                  const em = found.end % 1 === 0.5 ? '30' : '00'
                  setShiftForm({ ...shiftForm, shiftType: found.name, startTime: `${sh}:${sm}`, endTime: `${eh}:${em}` })
                } else {
                  setShiftForm({ ...shiftForm, shiftType: e.target.value })
                }
              }}
              style={{ ...inputStyle, width: 'auto' }}
            >
              {dailyTemplates.map(d => (
                <option key={d.id} value={d.name}>{d.name} ({d.start}:00-{d.end}:00)</option>
              ))}
              <option value="Özel">Özel Saat</option>
            </select>

            <input
              type="time"
              value={shiftForm.startTime}
              onChange={e => setShiftForm({ ...shiftForm, startTime: e.target.value })}
              style={{ ...inputStyle, width: 90 }}
            />
            <input
              type="time"
              value={shiftForm.endTime}
              onChange={e => setShiftForm({ ...shiftForm, endTime: e.target.value })}
              style={{ ...inputStyle, width: 90 }}
            />

            <button type="submit" style={{ ...btnStyle, background: 'var(--success, #10b981)' }}>
              Kaydet
            </button>
          </form>
        )}

        {/* ── HAFTALIK GÖRÜNÜM (Week View Grid) ── */}
        {calendarView === 'week' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8 }}>
            {weekDays.map(d => {
              const dayShifts = displayShifts.filter(s => s.date === d)
              const isToday = d === new Date().toISOString().split('T')[0]
              return (
                <div
                  key={d}
                  className="glass-card"
                  style={{
                    padding: 10,
                    minHeight: 110,
                    borderRadius: 10,
                    border: isToday ? '1px solid var(--accent)' : '1px solid var(--glass-border)',
                    borderLeft: isToday ? '3px solid var(--accent)' : undefined,
                    cursor: 'context-menu',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setShiftContextMenu({ x: e.clientX, y: e.clientY, doctorId: doctorFilter !== 'all' ? doctorFilter : '', date: d })
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--foreground)' }}>
                      {new Date(d + 'T00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </span>
                    <button
                      onClick={() => {
                        setShiftForm({ ...shiftForm, date: d })
                        setShowShiftForm(true)
                      }}
                      title="Bu güne vardiya ekle"
                      style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 2 }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dayShifts.length === 0 ? (
                      <div style={{ fontSize: '0.68rem', color: 'var(--foreground-3)', fontStyle: 'italic', padding: '4px 0' }}>—</div>
                    ) : (
                      dayShifts.map(s => {
                        const doc = users.find(u => u.id === s.userId)
                        const tagColor = doc?.color || s.userColor || 'var(--accent)'
                        return (
                          <div
                            key={s.id}
                            style={{
                              fontSize: '0.68rem',
                              padding: '4px 6px',
                              borderRadius: 6,
                              background: `${tagColor}18`,
                              border: `1px solid ${tagColor}40`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {s.userName}
                              </span>
                              <button
                                onClick={() => deleteShift(s.id)}
                                title="Vardiyayı Sil"
                                style={{ fontSize: '0.65rem', color: 'var(--danger, #ef4444)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                              >
                                ✕
                              </button>
                            </div>
                            <div style={{ color: 'var(--foreground-3)', fontSize: '0.65rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>{s.startTime}–{s.endTime}</span>
                              <span style={{ color: tagColor, fontWeight: 600 }}>{s.shiftType}</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── AYLIK GÖRÜNÜM (Month View Matrix) ── */}
        {calendarView === 'month' && (
          <div>
            {/* Weekday headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
              {DAY_SHORT_TR.map((dName, idx) => (
                <div
                  key={idx}
                  style={{
                    textAlign: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: idx === 5 || idx === 6 ? '#f59e0b' : 'var(--foreground-2)',
                    padding: '4px 0'
                  }}
                >
                  {dName}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {monthGridDays.map((item, idx) => {
                const dayShifts = displayShifts.filter(s => s.date === item.dateStr)
                return (
                  <div
                    key={idx}
                    className="glass-card"
                    style={{
                      minHeight: 85,
                      padding: 6,
                      borderRadius: 8,
                      border: item.isToday ? '1px solid var(--accent)' : '1px solid var(--glass-border)',
                      background: item.isCurrentMonth ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.005)',
                      opacity: item.isCurrentMonth ? 1 : 0.45,
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'context-menu'
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setShiftContextMenu({ x: e.clientX, y: e.clientY, doctorId: doctorFilter !== 'all' ? doctorFilter : '', date: item.dateStr })
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: item.isToday ? 700 : 500,
                        color: item.isToday ? '#fff' : (item.isCurrentMonth ? 'var(--foreground)' : 'var(--foreground-3)'),
                        background: item.isToday ? 'var(--accent)' : 'transparent',
                        padding: item.isToday ? '1px 5px' : 0,
                        borderRadius: 4
                      }}>
                        {item.dayNumber}
                      </span>

                      <button
                        onClick={() => {
                          setShiftForm({ ...shiftForm, date: item.dateStr })
                          setShowShiftForm(true)
                        }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 0 }}
                        title="Vardiya Ekle"
                      >
                        <Plus size={10} />
                      </button>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', maxHeight: 60 }}>
                      {dayShifts.map(s => {
                        const doc = users.find(u => u.id === s.userId)
                        const tagColor = doc?.color || s.userColor || 'var(--accent)'
                        return (
                          <div
                            key={s.id}
                            style={{
                              fontSize: '0.62rem',
                              padding: '2px 4px',
                              borderRadius: 4,
                              background: `${tagColor}20`,
                              border: `1px solid ${tagColor}40`,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                            title={`${s.userName}: ${s.startTime}-${s.endTime} (${s.shiftType})`}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 65 }}>
                              {s.userName.split(' ')[0]}
                            </span>
                            <span style={{ color: 'var(--foreground-3)', fontSize: '0.58rem' }}>
                              {s.startTime.split(':')[0]}h
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── VARDIYA ŞABLONLARI YÖNETİM BÖLÜMÜ ── */}
      <div style={{ display: workspace === 'templates' ? undefined : 'none', marginTop: 0, padding: 20, background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--input-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={16} color="var(--accent)" /> Mesai Şablonları
            </h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginTop: 2 }}>
              Günlük saat blokları, haftalık planlar ve aylık mesai şablonları
            </div>
          </div>

          {/* Sub Tabs */}
          <div style={{ display: 'flex', background: 'var(--card-inner)', padding: 3, borderRadius: 8, border: '1px solid var(--input-border)' }}>
            <button
              onClick={() => setTemplatesTab('weekly')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: templatesTab === 'weekly' ? 'var(--accent)' : 'var(--input-bg)',
                color: templatesTab === 'weekly' ? 'var(--btn-clinic-primary-fg)' : 'var(--foreground-3)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <Calendar size={13} /> 📅 Haftalık Şablonlar ({weeklyTemplates.length})
            </button>
            <button
              onClick={() => setTemplatesTab('monthly')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: templatesTab === 'monthly' ? 'var(--accent)' : 'var(--input-bg)',
                color: templatesTab === 'monthly' ? 'var(--btn-clinic-primary-fg)' : 'var(--foreground-3)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <CalendarDays size={13} /> 🗓️ Aylık Şablonlar ({monthlyTemplates.length})
            </button>
            <button
              onClick={() => setTemplatesTab('daily')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: templatesTab === 'daily' ? 'var(--accent)' : 'var(--input-bg)',
                color: templatesTab === 'daily' ? 'var(--btn-clinic-primary-fg)' : 'var(--foreground-3)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <Clock size={13} /> ⏱️ Günlük Saatler ({dailyTemplates.length})
            </button>
          </div>
        </div>

        {/* ── TAB 1: HAFTALIK ŞABLONLAR ── */}
        {templatesTab === 'weekly' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--foreground-2)' }}>
                7 günlük çalışma ve izin düzenini içeren şablonlar. Bir personele veya tüm ekibe tek tıkla uygulanabilir.
              </div>
              <button
                onClick={() => {
                  setEditingWeeklyTemplate(null)
                  setIsWeeklyModalOpen(true)
                }}
                style={btnStyle}
              >
                + Yeni Haftalık Şablon
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 12 }}>
              {weeklyTemplates.map((wt) => (
                <div
                  key={wt.id}
                  style={{
                    padding: 14,
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 10,
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--foreground)' }}>
                        {wt.name}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => {
                            setEditingWeeklyTemplate(wt)
                            setIsWeeklyModalOpen(true)
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 2 }}
                          title="Düzenle"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => saveWeeklyTemplates(weeklyTemplates.filter(w => w.id !== wt.id))}
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger, #ef4444)', cursor: 'pointer', padding: 2 }}
                          title="Sil"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {wt.description && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', marginBottom: 10 }}>
                        {wt.description}
                      </div>
                    )}

                    {/* 7 Days Preview Badges */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginTop: 8 }}>
                      {[0, 1, 2, 3, 4, 5, 6].map(dIdx => {
                        const plan = wt.days[dIdx as keyof typeof wt.days]
                        const isOff = !plan || !plan.active
                        return (
                          <div
                            key={dIdx}
                            style={{
                              padding: '4px 2px',
                              borderRadius: 4,
                              textAlign: 'center',
                              background: isOff ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                              border: `1px solid ${isOff ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)'}`
                            }}
                            title={`${DAY_NAMES_TR[dIdx]}: ${isOff ? 'İzinli' : `${plan.startTime}-${plan.endTime} (${plan.templateName || ''})`}`}
                          >
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: isOff ? '#ef4444' : 'var(--foreground)' }}>
                              {DAY_SHORT_TR[dIdx]}
                            </div>
                            <div style={{ fontSize: '0.58rem', color: isOff ? '#ef4444' : 'var(--accent)' }}>
                              {isOff ? 'İzin' : plan.startTime.split(':')[0] + 'h'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <button
                    onClick={() => openBatchModal({ initialMode: 'weekly', initialWeeklyTemplateId: wt.id })}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: 'var(--accent, #60a5fa)',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <Zap size={13} /> Bu Şablonu Personele Uygula
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 2: AYLIK ŞABLONLAR ── */}
        {templatesTab === 'monthly' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--foreground-2)' }}>
                Tüm ayı kapsayan 4 haftalık rotasyonlar veya kural tabanlı aylık çalışma modelleri.
              </div>
              <button
                onClick={() => {
                  setEditingMonthlyTemplate(null)
                  setIsMonthlyModalOpen(true)
                }}
                style={{ ...btnStyle, background: '#a855f7' }}
              >
                + Yeni Aylık Şablon
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 12 }}>
              {monthlyTemplates.map((mt) => (
                <div
                  key={mt.id}
                  style={{
                    padding: 14,
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 10,
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--foreground)' }}>
                        {mt.name}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => {
                            setEditingMonthlyTemplate(mt)
                            setIsMonthlyModalOpen(true)
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 2 }}
                          title="Düzenle"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => saveMonthlyTemplates(monthlyTemplates.filter(m => m.id !== mt.id))}
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger, #ef4444)', cursor: 'pointer', padding: 2 }}
                          title="Sil"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {mt.description && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', marginBottom: 8 }}>
                        {mt.description}
                      </div>
                    )}

                    <div style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)', fontSize: '0.72rem', color: 'var(--foreground-2)' }}>
                      {mt.mode === 'weekly_rotation' ? (
                        <div>
                          <span style={{ fontWeight: 600, color: '#a855f7' }}>4 Haftalık Rotasyon:</span>{' '}
                          4 haftalık döngü ile haftalık şablonları ardışık uygular.
                        </div>
                      ) : (
                        <div>
                          <span style={{ fontWeight: 600, color: '#a855f7' }}>Kural Tabanlı:</span>{' '}
                          Hafta içi: {mt.weekdayShift?.startTime}–{mt.weekdayShift?.endTime} ({mt.weekdayShift?.shiftType})
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => openBatchModal({ initialMode: 'monthly', initialMonthlyTemplateId: mt.id })}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'rgba(168, 85, 247, 0.15)',
                      color: '#c084fc',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <Zap size={13} /> Bu Şablonu Aya Uygula
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 3: GÜNLÜK SAAT ŞABLONLARI ── */}
        {templatesTab === 'daily' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {/* List */}
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--foreground-3)', marginBottom: 8 }}>Mevcut Günlük Saat Şablonları</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dailyTemplates.map((t, idx) => (
                  <div
                    key={t.id || idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 8,
                      border: '1px solid var(--glass-border)'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || 'var(--accent)' }} />
                        {t.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)' }}>
                        {Math.floor(t.start).toString().padStart(2, '0')}:{(t.start % 1 === 0.5) ? '30' : '00'} – {Math.floor(t.end).toString().padStart(2, '0')}:{(t.end % 1 === 0.5) ? '30' : '00'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={() => openBatchModal({ initialMode: 'daily' })}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        Personele Yay
                      </button>
                      <button
                        onClick={() => saveDailyTemplates(dailyTemplates.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.78rem' }}
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add Form */}
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--foreground-3)', marginBottom: 8 }}>Yeni Saat Şablonu Ekle</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  placeholder="Şablon Adı (Örn: Nöbetçi, Yarım Gün)"
                  value={newDailyName}
                  onChange={e => setNewDailyName(e.target.value)}
                  style={inputStyle}
                />

                <div style={{ padding: '0 8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--foreground-2)', marginBottom: 8 }}>
                    <span>Başlangıç: {newDailyRange[0]}:00</span>
                    <span>Bitiş: {newDailyRange[1]}:00</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <input
                      type="range"
                      min={0}
                      max={23}
                      value={newDailyRange[0]}
                      onChange={e => setNewDailyRange([Math.min(Number(e.target.value), newDailyRange[1] - 1), newDailyRange[1]])}
                      style={{ flex: 1, accentColor: 'var(--accent)' }}
                    />
                    <input
                      type="range"
                      min={1}
                      max={24}
                      value={newDailyRange[1]}
                      onChange={e => setNewDailyRange([newDailyRange[0], Math.max(Number(e.target.value), newDailyRange[0] + 1)])}
                      style={{ flex: 1, accentColor: 'var(--accent)' }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!newDailyName.trim()) return
                    saveDailyTemplates([
                      ...dailyTemplates,
                      {
                        id: `dt-${Date.now()}`,
                        name: newDailyName.trim(),
                        start: newDailyRange[0],
                        end: newDailyRange[1],
                        color: '#3b82f6'
                      }
                    ])
                    setNewDailyName('')
                    setNewDailyRange([9, 17])
                  }}
                  style={{ ...btnStyle, marginTop: 4, width: 'fit-content' }}
                >
                  + Şablonu Kaydet
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {/* Context Menu for assigning shift */}
      {shiftContextMenu && (
        <ShiftContextMenu
          x={shiftContextMenu.x}
          y={shiftContextMenu.y}
          doctorId={shiftContextMenu.doctorId}
          users={users}
          date={shiftContextMenu.date}
          onClose={() => setShiftContextMenu(null)}
          onOpenLeaveModal={(docId, dt) => {
            setLeaveDoctorId(docId)
            setLeaveDate(dt)
            setIsLeaveModalOpen(true)
          }}
          onSave={async (shift) => {
            await fetch('/api/shifts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(shift)
            })
            setShiftContextMenu(null)
            fetchData()
          }}
        />
      )}

      {/* Hekim İzin / Kapalı Saat Modalı */}
      <DoctorLeaveModal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        doctors={users.map(u => ({ id: u.id, name: u.name, specialty: u.specialty, color: u.color }))}
        initialDoctorId={leaveDoctorId}
        initialDate={leaveDate || new Date().toISOString().split('T')[0]}
        onSuccess={() => fetchData()}
      />

      {/* Haftalık Şablon Oluşturma/Düzenleme Modalı */}
      {isWeeklyModalOpen && (
        <WeeklyTemplateModal
          isOpen={isWeeklyModalOpen}
          template={editingWeeklyTemplate}
          dailyTemplates={dailyTemplates}
          onClose={() => {
            setIsWeeklyModalOpen(false)
            setEditingWeeklyTemplate(null)
          }}
          onSave={(updated) => {
            if (editingWeeklyTemplate) {
              saveWeeklyTemplates(weeklyTemplates.map(w => w.id === updated.id ? updated : w))
            } else {
              saveWeeklyTemplates([...weeklyTemplates, updated])
            }
            import('react-hot-toast').then(m => m.toast.success('Haftalık şablon kaydedildi'))
          }}
        />
      )}

      {/* Aylık Şablon Oluşturma/Düzenleme Modalı */}
      {isMonthlyModalOpen && (
        <MonthlyTemplateModal
          isOpen={isMonthlyModalOpen}
          template={editingMonthlyTemplate}
          weeklyTemplates={weeklyTemplates}
          dailyTemplates={dailyTemplates}
          onClose={() => {
            setIsMonthlyModalOpen(false)
            setEditingMonthlyTemplate(null)
          }}
          onSave={(updated) => {
            if (editingMonthlyTemplate) {
              saveMonthlyTemplates(monthlyTemplates.map(m => m.id === updated.id ? updated : m))
            } else {
              saveMonthlyTemplates([...monthlyTemplates, updated])
            }
            import('react-hot-toast').then(m => m.toast.success('Aylık şablon kaydedildi'))
          }}
        />
      )}

      {/* Toplu Şablon Uygulama Modalı */}
      {isBatchApplyOpen && (
        <ShiftBatchApplyModal
          isOpen={isBatchApplyOpen}
          users={users}
          weeklyTemplates={weeklyTemplates}
          monthlyTemplates={monthlyTemplates}
          dailyTemplates={dailyTemplates}
          currentWeekStart={currentWeekStartStr}
          currentMonth={currentMonthStr}
          initialUserId={batchModalConfig.initialUserId}
          initialMode={batchModalConfig.initialMode}
          initialWeeklyTemplateId={batchModalConfig.initialWeeklyTemplateId}
          initialMonthlyTemplateId={batchModalConfig.initialMonthlyTemplateId}
          onClose={() => setIsBatchApplyOpen(false)}
          onSuccess={() => fetchData()}
        />
      )}

      {/* Confirm Clear Modal */}
      {confirmClearModal && (
        <ConfirmModal
          isOpen={confirmClearModal.isOpen}
          title={confirmClearModal.title}
          message="Bu dönemdeki tüm seçili vardiyalar silinecek. Emin misiniz?"
          confirmText="Evet, Temizle"
          cancelText="Vazgeç"
          variant="danger"
          onConfirm={() => handleClearShifts(confirmClearModal.startDate, confirmClearModal.endDate)}
          onClose={() => setConfirmClearModal(null)}
        />
      )}
    </div>
  )
}
