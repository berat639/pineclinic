import React, { useState, useEffect, useCallback } from 'react'
import { Plus, X, Search, Filter, Calendar, Clock, User, Phone, PhoneCall, Link2, LogOut, LayoutDashboard, CalendarDays, Users, Stethoscope, BriefcaseMedical, Settings } from 'lucide-react'
import ShiftContextMenu from "./ShiftContextMenu"
import DentalCalendar from './DentalCalendar'
import { ToothChip, inputStyle } from './ToothChip'
import PatientSidePanel from './PatientSidePanel'
import AdvancedTedaviModal from './AdvancedTedaviModal';

import DicomViewer from './DicomViewer'

import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'

const TimeRangeEditor = ({ selectedEvent, onSave }: any) => {
  const [range, setRange] = useState([
    new Date(selectedEvent.startTime).getHours() * 60 + new Date(selectedEvent.startTime).getMinutes(),
    new Date(selectedEvent.endTime).getHours() * 60 + new Date(selectedEvent.endTime).getMinutes()
  ]);

  useEffect(() => {
    setRange([
      new Date(selectedEvent.startTime).getHours() * 60 + new Date(selectedEvent.startTime).getMinutes(),
      new Date(selectedEvent.endTime).getHours() * 60 + new Date(selectedEvent.endTime).getMinutes()
    ]);
  }, [selectedEvent.startTime, selectedEvent.endTime]);

  const startHH = String(Math.floor(range[0] / 60)).padStart(2, '0');
  const startMM = String(range[0] % 60).padStart(2, '0');
  const endHH = String(Math.floor(range[1] / 60)).padStart(2, '0');
  const endMM = String(range[1] % 60).padStart(2, '0');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--foreground)', fontSize: '0.85rem', fontWeight: 600 }}>
        <span>Başlangıç: <span style={{ color: 'var(--brand)' }}>{startHH}:{startMM}</span></span>
        <span>Bitiş: <span style={{ color: 'var(--brand)' }}>{endHH}:{endMM}</span></span>
      </div>
      <div style={{ padding: '0 10px' }}>
        <Slider 
          range
          min={480}
          max={1200}
          step={15}
          value={range}
          onChange={(val: any) => setRange(val)}
          onChangeComplete={(val: any) => {
             const sh = String(Math.floor(val[0] / 60)).padStart(2, '0');
             const sm = String(val[0] % 60).padStart(2, '0');
             const eh = String(Math.floor(val[1] / 60)).padStart(2, '0');
             const em = String(val[1] % 60).padStart(2, '0');
             onSave(sh, sm, eh, em);
          }}
          allowCross={false}
          pushable={15}
          styles={{
            track: { backgroundColor: 'var(--brand)', height: 6 },
            rail: { backgroundColor: 'rgba(156,163,175,0.2)', height: 6 },
            handle: { 
              borderColor: 'transparent', 
              backgroundColor: 'var(--brand)', 
              opacity: 1, 
              width: 8, 
              height: 18, 
              marginTop: -6, 
              borderRadius: 4,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }
          }}
        />
      </div>
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: '📅 Planlandı',
  confirmed: '✅ Onaylandı',
  in_progress: '🔄 Devam Ediyor',
  completed: '✓ Tamamlandı',
  cancelled: '❌ İptal',
  pending_assignment: '⚠️ Atama Bekliyor',
  postponed: '⏳ Ertelendi',
  no_show: '🚫 Gelmedi',
}



interface Doctor {
  id: string
  name: string
  specialty: string
  color: string
}

interface CalendarEvent {
  id: string
  patientId: string
  doctorId: string | null
  title: string
  startTime: string
  endTime: string
  status: string
  type: string
  notes?: string
  timeConfirmed?: boolean
  complaint?: string
}

interface Patient {
  id: string
  name: string
  phone: string | null
  email?: string | null
  balance: number
}

export default function CalendarTab() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [shifts, setShifts] = useState<any[]>([])
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [patientPanelOpen, setPatientPanelOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [shiftContextMenu, setShiftContextMenu] = useState<{ x: number, y: number, doctorId: string, date: string } | null>(null)
  const [eventContextMenu, setEventContextMenu] = useState<{ x: number, y: number, event: any, doctorId: string, date: string, startTime: string, endTime: string } | null>(null)
  const [unassignedListMenu, setUnassignedListMenu] = useState<{ x: number, y: number } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [activeTab, setActiveTab] = useState<'appointment' | 'info' | 'treatment'>('appointment')

  const [selectedDcmUrl, setSelectedDcmUrl] = useState<string | null>(null)
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [patientTreatments, setPatientTreatments] = useState<any[]>([])
  const [treatmentGroups, setTreatmentGroups] = useState<any[]>([])
  const [patientPayments, setPatientPayments] = useState<any[]>([])
  const [patientInfo, setPatientInfo] = useState<Patient | null>(null)

  // Treatment Form state
  const [showTedaviForm, setShowTedaviForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<any>(null)
  const [tedaviName, setTedaviName] = useState('')
  const [selectedTooth, setSelectedTooth] = useState<string>('')
  const [tedaviIndication, setTedaviIndication] = useState('')
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [showPastTreatmentsModal, setShowPastTreatmentsModal] = useState(false)

  // Periodic Treatment State
  const [isPeriodic, setIsPeriodic] = useState(false)
  const [notifyPatient, setNotifyPatient] = useState(false)
  const [notificationType, setNotificationType] = useState('sms')
  const [periodDays, setPeriodDays] = useState<number>(180)
  const [clinicId, setClinicId] = useState<string>('')
  const [missingPhone, setMissingPhone] = useState('')
  const [missingEmail, setMissingEmail] = useState('')

  // Payment Modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState('Nakit')
  const [paymentStatus, setPaymentStatus] = useState('completed')
  const [paymentDueDate, setPaymentDueDate] = useState('')
  const [paymentTreatmentId, setPaymentTreatmentId] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [paymentIdBeingEdited, setPaymentIdBeingEdited] = useState<string | null>(null)
  const [treatmentDeleteError, setTreatmentDeleteError] = useState<string | null>(null)

  // Appointment form state
  const [patients, setPatients] = useState<any[]>([])
  const [formPatientId, setFormPatientId] = useState('')
  const [formDoctor, setFormDoctor] = useState('')
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formTime, setFormTime] = useState('09:00')
  const [formEndTime, setFormEndTime] = useState('09:30')
  const [formType, setFormType] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // Doctor form state
  const [docName, setDocName] = useState('')
  const [docSpecialty, setDocSpecialty] = useState('')
  const [docColor, setDocColor] = useState('#60a5fa')
  const [docSaving, setDocSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const fetchSafe = async (url: string) => {
      try {
        const res = await fetch(url)
        if (res.ok) return await res.json()
        return null
      } catch (e) {
        console.warn(`Fetch error for ${url}:`, e)
        return null
      }
    }

    const [docs, evts, shiftsData, invs, pats] = await Promise.all([
      fetchSafe('/api/dental/doctors'),
      fetchSafe('/api/dental/appointments'),
      fetchSafe('/api/shifts'),
      fetchSafe('/api/yonetici/inventory'),
      fetchSafe('/api/dental/patients')
    ])

    if (docs) setDoctors(docs)
    if (evts) setEvents(evts)
    if (shiftsData) setShifts(shiftsData)
    if (invs) setInventoryItems(invs)
    if (pats) setPatients(pats)
  }, [currentDate])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // Ignore right clicks or simulated right clicks (Ctrl+Click on Mac)
      if (e.button !== 0 || e.ctrlKey) return;

      // Don't close if clicking inside a context menu
      const target = e.target as HTMLElement;
      if (target.closest('.context-menu-container')) return;

      setShiftContextMenu(null);
      // Let's not close eventContextMenu on global click because it contains inputs that need to be interacted with.
      // We will rely on its onClose or Cancel buttons for eventContextMenu.
    }
    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, [])

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('.context-menu-container')) return;
      setShiftContextMenu(null);
      setEventContextMenu(null);
    }

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      // Don't close if scrolling INSIDE the context menu itself
      if (target.closest && target.closest('.context-menu-container')) return;
      setShiftContextMenu(null);
      setEventContextMenu(null);
    }

    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('scroll', handleScroll, { capture: true });
    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [])

  const handleEventClick = (eventId: string, event: CalendarEvent) => {
    setShiftContextMenu(null);
    setEventContextMenu(null);
    setSelectedEvent(event)
    setPanelOpen(true)
    setPatientTreatments([]); setTreatmentGroups([])
    setPatientPayments([])
    setPatientInfo(null)
    if (event.patientId) {
      fetch(`/api/dental/patients/${event.patientId}`).then(r => r.ok ? r.json() : null).then(d => d && setPatientInfo(d)).catch(() => { })
      fetch(`/api/dental/patients/${event.patientId}/treatments`).then(r => r.ok ? r.json() : {treatments:[], groups:[]}).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); }).catch(() => { })
      fetch(`/api/dental/patients/${event.patientId}/payments`).then(r => r.ok ? r.json() : []).then(setPatientPayments).catch(() => { })
    }
    const docQuery = event.doctorId ? `?doctorId=${event.doctorId}` : ''

  }

  const handleDeleteEvent = async () => {
    if (!selectedEvent || !confirm('Bu randevuyu silmek istediğinizden emin misiniz?')) return
    try {
      await fetch(`/api/dental/appointments/${selectedEvent.id}`, { method: 'DELETE' })
      setPanelOpen(false)
      setSelectedEvent(null)
      fetchData()
    } catch { }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formDoctor || !formName || !formTime) return
    setFormSaving(true)
    try {
      const startTime = new Date(`${currentDate}T${formTime}:00+03:00`)
      const endTime = new Date(`${currentDate}T${formEndTime}:00+03:00`)

      let finalPatientId = formPatientId;

      if (!finalPatientId) {
        // Create patient first if not selected from autocomplete
        const pRes = await fetch('/api/dental/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, phone: formPhone || undefined }),
        })
        if (!pRes.ok) throw new Error('Patient creation failed')
        const patient = await pRes.json()
        finalPatientId = patient.id
      }

      // Create appointment
      const aRes = await fetch('/api/dental/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: finalPatientId,
          doctorId: formDoctor,
          title: `${formName} - ${formType || 'Randevu'}`,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          type: formType || 'general',
          notes: formNotes || undefined,
        }),
      })
      if (aRes.ok) {
        setShowForm(false)
        setFormName(''); setFormPatientId(''); setFormPhone(''); setFormType(''); setFormNotes('')
        fetchData()
      }
    } catch (err) {
      console.error('Appointment create error:', err)
    } finally {
      setFormSaving(false)
    }
  }

  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!docName || !docSpecialty) return
    setDocSaving(true)
    try {
      const res = await fetch('/api/dental/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: docName, specialty: docSpecialty, color: docColor }),
      })
      if (res.ok) {
        setShowDocForm(false)
        setDocName(''); setDocSpecialty('')
        fetchData()
      }
    } catch (err) {
      console.error('Doctor create error:', err)
    } finally {
      setDocSaving(false)
    }
  }

  const goDate = (offset: number) => {
    const d = new Date(currentDate)
    if (view === 'day') d.setDate(d.getDate() + offset)
    else if (view === 'week') d.setDate(d.getDate() + offset * 7)
    else d.setMonth(d.getMonth() + offset)
    setCurrentDate(d.toISOString().slice(0, 10))
  }

  return (
    <div style={{ maxWidth: 1200, width: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
          Günlük Randevu Takvimi
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View tabs */}
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--input-border)' }}>
            {(['day', 'week', 'month'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '5px 14px', fontSize: '0.75rem', fontWeight: 600, border: 'none', background: view === v ? 'var(--accent)' : 'var(--input-bg)', color: view === v ? 'white' : 'var(--foreground-2)', cursor: 'pointer', borderRight: v !== 'month' ? '1px solid var(--input-border)' : 'none' }}>
                {v === 'day' ? 'Günlük' : v === 'week' ? 'Haftalık' : 'Aylık'}
              </button>
            ))}
          </div>
          {/* Navigation */}
          <button onClick={() => goDate(-1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.75rem' }}>◀</button>
          <input
            type="date"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            style={{
              padding: '5px 10px',
              borderRadius: 8,
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--foreground)',
              fontSize: '0.8rem',
            }}
          />
          <button onClick={() => goDate(1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.75rem' }}>▶</button>
          <button
            onClick={() => setPatientPanelOpen(true)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid var(--glass-border)',
              background: 'var(--glass-bg)',
              color: 'var(--foreground)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            👥 Hastalar
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Randevu Ekle
          </button>
        </div>
      </div>

      {/* Appointment Form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          padding: 16, marginBottom: 16, borderRadius: 10,
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px 24px', alignItems: 'end'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Doktor Seçimi</span>
              {!doctors.some(d => shifts.some(s => s.userId === d.id && s.date === currentDate)) && (
                <span style={{ color: '#f59e0b', fontSize: '0.65rem' }}>⚠️ Vardiyalı hekim yok</span>
              )}
            </div>
            <select
              value={formDoctor} onChange={e => setFormDoctor(e.target.value)} required
              style={{...inputStyle, width: '100%'}}
            >
              <option value="">Doktor Seç...</option>
              {doctors
                .filter(d => shifts.some(s => s.userId === d.id && s.date === currentDate))
                .map(d => <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>)
              }
            </select>
          </div>

          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>Hasta Adı *</div>
            <input
              placeholder="İsim Soyisim"
              value={formName}
              onChange={e => {
                setFormName(e.target.value)
                setFormPatientId('')
              }}
              required
              style={{ ...inputStyle, width: '100%' }}
            />
            {formName && formName.length >= 2 && !formPatientId && patients.filter(p => p.name.toLowerCase().includes(formName.toLowerCase())).length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', marginTop: 4, backdropFilter: 'blur(10px)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {patients.filter(p => p.name.toLowerCase().includes(formName.toLowerCase())).map(p => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setFormName(p.name)
                      setFormPatientId(p.id)
                      if (p.phone) setFormPhone(p.phone)
                    }}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--foreground)' }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{p.name}</div>
                    {p.phone && <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)' }}>{p.phone}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>Telefon Numarası</div>
            <input placeholder="05XX XXX XX XX" value={formPhone} onChange={e => setFormPhone(e.target.value)} style={{...inputStyle, width: '100%'}} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>Randevu Saati (Başlangıç - Bitiş)</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} required style={{ ...inputStyle, flex: 1, width: '100%' }} />
              <input type="time" value={formEndTime} onChange={e => setFormEndTime(e.target.value)} required style={{ ...inputStyle, flex: 1, width: '100%' }} />
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={() => setShowForm(false)} style={{ ...btnStyle, background: 'var(--glass-bg)', color: 'var(--foreground-2)' }}>İptal</button>
            <button type="submit" disabled={formSaving} style={btnStyle}>
              {formSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      )}

      <DentalCalendar
        doctors={doctors}
        events={events}
        onHeaderContextMenu={(e, doctorId) => {
          e.preventDefault()
          setShiftContextMenu({ x: e.clientX, y: e.clientY, doctorId, date: currentDate })
        }}
        onUnassignedHeaderContextMenu={(e) => {
          e.preventDefault()
          setUnassignedListMenu({ x: e.clientX, y: e.clientY })
        }}
        onEventContextMenu={(e, event) => {
          console.log("Event right clicked!", event.title)
          e.preventDefault()
          const date = event.startTime.slice(0, 10)
          const startTime = new Date(event.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
          const endTime = new Date(event.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
          setEventContextMenu({ x: e.clientX, y: e.clientY, event, doctorId: event.doctorId || '', date, startTime, endTime })
        }}
        onEventUpdate={async (updatedEvent) => {
          console.log("Event updated via drag/resize", updatedEvent);
          try {
            await fetch(`/api/dental/appointments/${updatedEvent.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                startTime: updatedEvent.startTime,
                endTime: updatedEvent.endTime,
                doctorId: updatedEvent.doctorId
              })
            });
            fetchData();
          } catch (e) {
            console.error("Failed to update event", e);
          }
        }}
        shifts={shifts}
        currentDate={currentDate}
        onEventClick={handleEventClick}
        view={view}
      />

      {/* Right Panel — Event Detail */}
      {panelOpen && selectedEvent && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, background: 'var(--background-2)', borderLeft: '1px solid var(--divider)', zIndex: 1000, padding: 24, overflowY: 'auto', boxShadow: '-4px 0 20px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Randevu Detayı</h3>
            <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* ── Hasta Bilgisi ── */}
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hasta Bilgisi</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>{patientInfo?.name || selectedEvent.title.split(' - ')[0]}</div>
              {patientInfo?.phone && <div style={{ fontSize: '0.75rem', color: 'var(--foreground-2)', marginTop: 2 }}>📞 {patientInfo.phone}</div>}
            </div>

            {/* ── Randevu Bilgisi ── */}
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Randevu Bilgisi</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)', marginBottom: 2 }}>Doktor</div>
                  <select 
                    value={selectedEvent.doctorId || ''} 
                    onChange={async (e) => {
                      const val = e.target.value;
                      let newStatus = selectedEvent.status;
                      if (val && selectedEvent.status === 'pending_assignment') {
                        newStatus = 'scheduled';
                      }
                      const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ doctorId: val || null, status: newStatus })
                      });
                      if (res.ok) {
                        const updated = await res.json();
                        setEvents(prev => prev.map(ev => ev.id === updated.id ? { ...ev, ...updated } : ev));
                        setSelectedEvent(prev => prev ? { ...prev, ...updated } : null);
                      }
                    }}
                    style={{ width: '100%', fontSize: '0.8rem', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--glass-border)', background: 'var(--background)', color: selectedEvent.doctorId ? 'var(--foreground)' : '#9ca3af' }}
                  >
                    <option value="">⚠️ Atanmamış</option>
                    {doctors
                      .filter(d => {
                        const evtDate = new Date(selectedEvent.startTime).toLocaleDateString('sv')
                        const hasShift = shifts.some(s => s.userId === d.id && s.date === evtDate)
                        return hasShift || d.id === selectedEvent.doctorId
                      })
                      .map(d => <option key={d.id} value={d.id}>{d.name}</option>)
                    }
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)', marginBottom: 2 }}>Tür</div>
                  <select 
                    value={selectedEvent.type || 'general'} 
                    onChange={async (e) => {
                      const val = e.target.value;
                      const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type: val })
                      });
                      if (res.ok) {
                        const updated = await res.json();
                        setEvents(prev => prev.map(ev => ev.id === updated.id ? { ...ev, ...updated } : ev));
                        setSelectedEvent(prev => prev ? { ...prev, ...updated } : null);
                      }
                    }}
                    style={{ width: '100%', fontSize: '0.8rem', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--glass-border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  >
                    <option value="general">Normal</option>

                    <option value="urgent">Acil</option>
                    <option value="priority">Öncelikli</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)', marginBottom: 2 }}>Durum</div>
                  <select
                    value={selectedEvent.status}
                    onChange={async (e) => {
                      const status = e.target.value
                      try {
                        const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status }),
                        })
                        if (res.ok) { 
                           const updated = await res.json();
                           setEvents(prev => prev.map(ev => ev.id === updated.id ? { ...ev, ...updated } : ev));
                           setSelectedEvent(prev => prev ? { ...prev, ...updated } : null);
                        }
                      } catch { }
                    }}
                    style={{ width: '100%', fontSize: '0.8rem', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--glass-border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  >
                    <option value="scheduled">📅 Planlandı</option>
                    <option value="in_progress">🔄 Devam Ediyor</option>
                    <option value="completed">✓ Tamamlandı</option>
                    <option value="cancelled">❌ İptal</option>
                    <option value="postponed">⏳ Ertelendi</option>
                    <option value="no_show">🚫 Gelmedi</option>
                    <option value="pending_assignment">⚠️ Atama Bekliyor</option>
                    <option value="waiting_in_clinic">🏥 Klinikte Bekliyor</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1, padding: '8px 10px', background: 'rgba(156,163,175,0.05)', borderRadius: 6, border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)', marginBottom: 2 }}>Tarih</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--foreground)', fontWeight: 600 }}>{new Date(selectedEvent.startTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  </div>
                  <div style={{ flex: 1, padding: '8px 10px', background: 'rgba(156,163,175,0.05)', borderRadius: 6, border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)', marginBottom: 2 }}>Saat</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--foreground)', fontWeight: 600 }}>{new Date(selectedEvent.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedEvent.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>

              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Hasta Şikayeti / İlk Talep</div>
                <textarea 
                  defaultValue={selectedEvent.complaint || ''}
                  placeholder="Hastanın şikayetini veya talebini buraya girin (Opsiyonel)"
                  onBlur={async (e) => {
                    const val = e.target.value;
                    if (val === selectedEvent.complaint) return;
                    const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ complaint: val })
                    });
                    if (res.ok) {
                      const updated = await res.json();
                      setEvents(prev => prev.map(ev => ev.id === updated.id ? { ...ev, ...updated } : ev));
                      setSelectedEvent(prev => prev ? { ...prev, ...updated } : null);
                    }
                  }}
                  style={{ width: '100%', fontSize: '0.75rem', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'var(--foreground)', minHeight: 40, resize: 'vertical' }}
                />
              </div>
              {selectedEvent.notes && <div style={{ fontSize: '0.75rem', color: 'var(--foreground-2)', marginTop: 8, borderTop: '1px solid var(--glass-border)', paddingTop: 6 }}>📝 Randevu Notu: {selectedEvent.notes}</div>}
            </div>

            {/* ── Tedavi Planı & Odontogram ── */}
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tedavi Planı</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {patientTreatments.filter((t: any) => t.status === 'completed').length > 0 && (
                    <button onClick={() => setShowPastTreatmentsModal(true)} style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      🕒 Geçmiş
                    </button>
                  )}
                  <button onClick={() => { setTreatmentDeleteError(null); setShiftContextMenu(null); setEventContextMenu(null); setShowTedaviForm(true); }} style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: 4, border: '1px dashed var(--glass-border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}>
                    + Tedavi Ekle
                  </button>
                </div>
              </div>
              {treatmentDeleteError && (
                <div style={{ fontSize: '0.7rem', color: '#ef4444', marginBottom: 8, fontWeight: 600 }}>
                  ⚠️ {treatmentDeleteError}
                </div>
              )}
              {patientTreatments.filter((t: any) => t.status !== 'completed').length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Array.isArray(treatmentGroups) && treatmentGroups.map((g: any) => {
                    const groupTreatments = patientTreatments.filter((t: any) => t.status !== 'completed' && t.groupId === g.id);
                    if (groupTreatments.length === 0) return null;
                    return (
                      <div key={g.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--glass-border)' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>{g.name}</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                setEditingGroup({ ...g, treatments: patientTreatments.filter((t: any) => t.groupId === g.id) });
                                setShowTedaviForm(true);
                              }}
                              style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              ✏️ Düzenle
                            </button>
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                if (!confirm('Bu grubun tamamını silmek istediğinize emin misiniz?')) return;
                                await fetch(`/api/dental/treatment-groups/${g.id}`, { method: 'DELETE' });
                                fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); });
                              }}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              🗑️ Tüm Planı Sil
                            </button>
                          </div>
                        </div>
                        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {groupTreatments.map((t: any) => (
                            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', fontSize: '0.75rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ color: 'var(--foreground)' }}>
                                  {t.toothNumber ? <span style={{ color: 'var(--accent)', fontWeight: 600, marginRight: 4 }}>#{t.toothNumber}</span> : null}
                                  {t.procedureName}
                                </span>
                                {t.indication && <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', marginTop: 2 }}>Endikasyon: {t.indication}</span>}
                              </div>
                              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {t.dcmUrl && (
                                  <button onClick={() => setSelectedDcmUrl(process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}${t.dcmUrl}` : `http://localhost:3001${t.dcmUrl}`)} style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 4, border: '1px solid #3b82f6', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', cursor: 'pointer' }}>
                                    Röntgen
                                  </button>
                                )}
                                <select defaultValue={t.status} onChange={(e) => {
                                  fetch(`/api/dental/treatments/${t.id}`, {
                                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ status: e.target.value })
                                  }).then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); })).catch(() => { })
                                }} style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 4, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                                  <option value="planned">Planlandı</option>
                                  <option value="in_progress">Devam Ediyor</option>
                                  <option value="completed">Yapıldı</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    fetch(`/api/dental/treatments/${t.id}`, { method: 'DELETE' })
                                      .then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); }))
                                      .catch(() => { })
                                  }}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', fontSize: '0.85rem' }}
                                >🗑️</button>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  
                  {/* Ungrouped Treatments */}
                  {patientTreatments.filter((t: any) => t.status !== 'completed' && !t.groupId).map((t: any) => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: 'var(--foreground)' }}>
                          {t.toothNumber ? <span style={{ color: 'var(--accent)', fontWeight: 600, marginRight: 4 }}>#{t.toothNumber}</span> : null}
                          {t.procedureName}
                        </span>
                        {t.indication && <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', marginTop: 2 }}>Endikasyon: {t.indication}</span>}
                      </div>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {t.dcmUrl && (
                          <button onClick={() => setSelectedDcmUrl(process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}${t.dcmUrl}` : `http://localhost:3001${t.dcmUrl}`)} style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 4, border: '1px solid #3b82f6', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', cursor: 'pointer' }}>
                            Röntgen
                          </button>
                        )}
                        <select defaultValue={t.status} onChange={(e) => {
                          fetch(`/api/dental/treatments/${t.id}`, {
                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: e.target.value })
                          }).then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); })).catch(() => { })
                        }} style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 4, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                          <option value="planned">Planlandı</option>
                          <option value="in_progress">Devam Ediyor</option>
                          <option value="completed">Yapıldı</option>
                        </select>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            fetch(`/api/dental/treatments/${t.id}`, { method: 'DELETE' })
                              .then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); }))
                              .catch(() => { })
                          }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', fontSize: '0.85rem' }}
                        >🗑️</button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>Tedavi planı yok</div>}
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Date/time edit */}
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', marginBottom: 6, fontWeight: 600 }}>📅 Tarih/Saat Değiştir</div>
              <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                <input
                  type="date"
                  defaultValue={selectedEvent.startTime.slice(0, 10)}
                  id="edit-date"
                  onChange={async (e) => {
                    const dateVal = e.target.value;
                    if (!dateVal) return;
                    const startHH = String(new Date(selectedEvent.startTime).getHours()).padStart(2, '0');
                    const startMM = String(new Date(selectedEvent.startTime).getMinutes()).padStart(2, '0');
                    const endHH = String(new Date(selectedEvent.endTime).getHours()).padStart(2, '0');
                    const endMM = String(new Date(selectedEvent.endTime).getMinutes()).padStart(2, '0');
                    const startTime = new Date(`${dateVal}T${startHH}:${startMM}:00+03:00`);
                    const endTime = new Date(`${dateVal}T${endHH}:${endMM}:00+03:00`);
                    try {
                      const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ startTime: startTime.toISOString(), endTime: endTime.toISOString(), timeConfirmed: true }),
                      });
                      if (res.ok) {
                         const updated = await res.json();
                         setEvents(prev => prev.map(ev => ev.id === updated.id ? { ...ev, ...updated } : ev));
                         setSelectedEvent(prev => prev ? { ...prev, ...updated } : null);
                      }
                    } catch { }
                  }}
                  style={{ ...inputStyle, width: '100%' }}
                />
                <TimeRangeEditor 
                  selectedEvent={selectedEvent} 
                  onSave={async (startHH: string, startMM: string, endHH: string, endMM: string) => {
                    const dateEl = document.getElementById('edit-date') as HTMLInputElement
                    if (!dateEl?.value) return
                    const startTime = new Date(`${dateEl.value}T${startHH}:${startMM}:00+03:00`)
                    const endTime = new Date(`${dateEl.value}T${endHH}:${endMM}:00+03:00`)
                    try {
                      const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ startTime: startTime.toISOString(), endTime: endTime.toISOString(), timeConfirmed: true }),
                      })
                      if (res.ok) {
                         const updated = await res.json();
                         setEvents(prev => prev.map(ev => ev.id === updated.id ? { ...ev, ...updated } : ev));
                         setSelectedEvent(prev => prev ? { ...prev, ...updated } : null);
                      }
                    } catch { }
                  }} 
                />
              </div>
            </div>

            {/* Time confirmation for pending time appointments */}
            {selectedEvent.timeConfirmed === false && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ timeConfirmed: true }),
                    })
                    if (res.ok) {
                      setPanelOpen(false); setSelectedEvent(null); fetchData()
                    }
                  } catch { }
                }}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
              >
                ⚠️ Saati Onayla
              </button>
            )}
            <button onClick={handleDeleteEvent} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
              Sil
            </button>
          </div>
        </div>
      )}
      {/* Tedavi Ekle Modal */}
      {showTedaviForm && selectedEvent && (
        <AdvancedTedaviModal
          selectedEvent={selectedEvent}
          patientInfo={patientInfo}
          clinicId={clinicId}
          doctors={doctors}
          editingGroup={editingGroup}
          onClose={() => {
            setShowTedaviForm(false);
            setEditingGroup(null);
          }}
          onSaved={() => {
            setShowTedaviForm(false);
            setEditingGroup(null);
            fetchData();
          }}
        />
      )}

      {/* Ödeme Bilgisi Modal */}
      {showPaymentModal && selectedEvent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--background)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 480, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)' }}>{paymentIdBeingEdited ? 'Ödemeyi Düzenle' : 'Yeni Ödeme Ekle'}</h3>
              <button onClick={() => { setShowPaymentModal(false); setPaymentIdBeingEdited(null); }} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Tutar (₺) *</label>
                <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="Örn: 1500" style={{ ...inputStyle, width: '100%' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Ödeme Yöntemi</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value="Nakit">Nakit</option>
                  <option value="Kart">Kart</option>
                  <option value="Havale">Havale</option>
                  <option value="Taksit">Taksit</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Ödeme Tarihi *</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Durum</label>
                <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value="completed">✅ Yapıldı</option>
                  <option value="pending">⏳ Bekliyor</option>
                  <option value="cancelled">❌ İptal</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Planlanan Tarih</label>
                <input type="date" value={paymentDueDate} onChange={e => setPaymentDueDate(e.target.value)} placeholder="gg.aa.yyyy" style={{ ...inputStyle, width: '100%' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>İlgili Endikasyon (opsiyonel)</label>
                <select value={paymentTreatmentId} onChange={e => setPaymentTreatmentId(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value="">Seçiniz...</option>
                  {patientTreatments.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.toothNumber ? `#${t.toothNumber} ` : ''}{t.procedureName}{t.indication ? ` — ${t.indication}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Not (opsiyonel)</label>
                <input type="text" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} placeholder="Kısa not ekleyin" style={{ ...inputStyle, width: '100%' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                {paymentIdBeingEdited && (
                  <button onClick={() => {
                    fetch(`/api/dental/payments/${paymentIdBeingEdited}`, { method: 'DELETE' }).then(() => {
                      setShowPaymentModal(false); setPaymentIdBeingEdited(null);
                      fetch(`/api/dental/patients/${selectedEvent.patientId}/payments`).then(r => r.json()).then(setPatientPayments)
                    })
                  }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Sil</button>
                )}
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                  <button onClick={() => { setShowPaymentModal(false); setPaymentIdBeingEdited(null); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }}>İptal</button>
                  <button onClick={() => {
                    if (!paymentAmount) return
                    const endpoint = paymentIdBeingEdited
                      ? `/api/dental/payments/${paymentIdBeingEdited}`
                      : `/api/dental/patients/${selectedEvent.patientId}/payments`
                    const method = paymentIdBeingEdited ? 'PUT' : 'POST'

                    fetch(endpoint, {
                      method,
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        amount: Number(paymentAmount),
                        date: paymentDate,
                        method: paymentMethod,
                        status: paymentStatus,
                        dueDate: paymentDueDate || null,
                        notes: paymentNote || null,
                        treatmentPlanId: paymentTreatmentId || undefined
                      })
                    }).then(() => {
                      setShowPaymentModal(false); setPaymentIdBeingEdited(null);
                      setPaymentAmount(''); setPaymentTreatmentId(''); setPaymentNote('');
                      setPaymentMethod('Nakit'); setPaymentStatus('completed'); setPaymentDueDate('');
                      fetch(`/api/dental/patients/${selectedEvent.patientId}/payments`).then(r => r.json()).then(setPatientPayments)
                    }).catch(() => { })
                  }} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Kaydet</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Geçmiş İşlemler Modalı */}
      {showPastTreatmentsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)' }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: 700, padding: 24, borderRadius: 16, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)' }}>Geçmiş Tedaviler</h3>
              <button onClick={() => setShowPastTreatmentsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--foreground-3)' }}>
                    <th style={{ padding: '10px 8px', fontWeight: 500 }}>Tarih</th>
                    <th style={{ padding: '10px 8px', fontWeight: 500 }}>Diş No</th>
                    <th style={{ padding: '10px 8px', fontWeight: 500 }}>İşlem</th>
                    <th style={{ padding: '10px 8px', fontWeight: 500 }}>Endikasyon</th>
                    <th style={{ padding: '10px 8px', fontWeight: 500 }}>Statü</th>
                  </tr>
                </thead>
                <tbody>
                  {patientTreatments.filter((t: any) => t.status === 'completed').map((t: any) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s', cursor: 'default' }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 8px', color: 'var(--foreground-2)' }}>{new Date(t.createdAt).toLocaleDateString('tr-TR')}</td>
                      <td style={{ padding: '10px 8px' }}>
                        {t.toothNumber ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>#{t.toothNumber}</span> : '-'}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--foreground)' }}>{t.procedureName}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--foreground-2)' }}>{t.indication || '-'}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                          Yapıldı
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {patientTreatments.filter((t: any) => t.status === 'completed').length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--foreground-3)', fontSize: '0.85rem' }}>
                  Geçmiş bir işlem bulunmuyor.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedDcmUrl && (
        <DicomViewer isModal={true} dcmUrl={selectedDcmUrl} onClose={() => setSelectedDcmUrl(null)} />
      )}
      {/* --- FLOATING CONTEXT MENUS --- */}
      {eventContextMenu && (
        <div
          className="context-menu-container"
          style={{
            position: 'fixed', top: eventContextMenu.y, left: eventContextMenu.x, zIndex: 9999,
            background: 'var(--background-2)', border: '1px solid var(--glass-border)',
            borderRadius: 8, padding: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.2)', width: 220
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12 }}>Randevu Ata</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 4 }}>Doktor</div>
            <select
              value={eventContextMenu.doctorId}
              onChange={e => setEventContextMenu({ ...eventContextMenu, doctorId: e.target.value })}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
            >
              <option value="">Seçiniz...</option>
              {doctors
                .filter(d => shifts.some(s => s.userId === d.id && s.date === eventContextMenu.date))
                .map(d => <option key={d.id} value={d.id}>{d.name}</option>)
              }
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 4 }}>Tarih / Saat Aralığı</div>
            <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
              <input
                type="date"
                value={eventContextMenu.date}
                onChange={e => setEventContextMenu({ ...eventContextMenu, date: e.target.value })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="time"
                  value={eventContextMenu.startTime}
                  onChange={e => setEventContextMenu({ ...eventContextMenu, startTime: e.target.value })}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
                />
                <input
                  type="time"
                  value={eventContextMenu.endTime}
                  onChange={e => setEventContextMenu({ ...eventContextMenu, endTime: e.target.value })}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
                />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button onClick={() => setEventContextMenu(null)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '0.8rem' }}>İptal</button>
            <button onClick={async () => {
              const startTime = new Date(`${eventContextMenu.date}T${eventContextMenu.startTime}:00+03:00`)
              const endTime = new Date(`${eventContextMenu.date}T${eventContextMenu.endTime}:00+03:00`)
              await fetch(`/api/dental/appointments/${eventContextMenu.event.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doctorId: eventContextMenu.doctorId || null, startTime: startTime.toISOString(), endTime: endTime.toISOString() })
              })
              setEventContextMenu(null)
              fetchData()
            }} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}>Kaydet</button>
          </div>
        </div>
      )}

      {unassignedListMenu && (
        <div
          onClick={() => setUnassignedListMenu(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: Math.min(unassignedListMenu.y, window.innerHeight - 300), left: Math.min(unassignedListMenu.x, window.innerWidth - 250), zIndex: 9999,
              background: 'var(--background-2)', border: '1px solid var(--glass-border)',
              borderRadius: 8, padding: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.2)', width: 250, maxHeight: 300, overflowY: 'auto'
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>⚠️ Bekleyen Randevular</span>
              <button onClick={() => setUnassignedListMenu(null)} style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer' }}>✕</button>
            </div>
            {events.filter(e => !e.doctorId).length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--foreground-3)' }}>Bekleyen randevu yok.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {events.filter(e => !e.doctorId).map(e => (
                  <div
                    key={e.id}
                    onClick={() => {
                      setCurrentDate(e.startTime.slice(0, 10))
                      setView('day')
                      setUnassignedListMenu(null)
                    }}
                    style={{
                      padding: '8px 10px', borderRadius: 6, border: '1px solid var(--glass-border)',
                      background: 'var(--glass-bg)', cursor: 'pointer', fontSize: '0.8rem'
                    }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'var(--glass-bg)'}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--foreground)', marginBottom: 2 }}>{e.title}</div>
                    <div style={{ color: 'var(--foreground-3)', fontSize: '0.7rem' }}>
                      {new Date(e.startTime).toLocaleDateString('tr-TR')} {new Date(e.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(!showTedaviForm && shiftContextMenu) && (
        <div className="context-menu-container">
          <ShiftContextMenu
            x={shiftContextMenu.x}
            y={shiftContextMenu.y}
            doctorId={shiftContextMenu.doctorId}
            date={shiftContextMenu.date}
            onClose={() => setShiftContextMenu(null)}
            onSave={async (shift) => {
              await fetch('/api/shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(shift)
              })
              setShiftContextMenu(null)
              window.location.reload()
            }}
          />
        </div>
      )}

      <PatientSidePanel 
        isOpen={patientPanelOpen} 
        onClose={() => setPatientPanelOpen(false)} 
        patients={patients} 
      />

    </div>
  )
}



const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
}
