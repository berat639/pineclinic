import React, { useState, useEffect, useCallback } from 'react'
import { Plus, X, Search, Filter, Calendar, Clock, User, Phone, PhoneCall, Link2, LogOut, LayoutDashboard, CalendarDays, Users, Stethoscope, BriefcaseMedical, Settings } from 'lucide-react'
import DentalCalendar from './DentalCalendar'
import ThreeDicomViewer from './ThreeDicomViewer'

const ToothChip = ({ number, selected, onClick, onDragOver, onDrop, hasDraft }: any) => (
  <button
    onClick={onClick}
    onDragOver={onDragOver}
    onDrop={onDrop}
    title={`Diş ${number}`}
    style={{
      position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      background: selected ? 'var(--accent)' : 'transparent',
      border: `1px solid ${selected ? 'var(--accent)' : 'var(--glass-border)'}`,
      borderRadius: 6, padding: '3px 2px', cursor: 'pointer',
      color: selected ? '#fff' : 'var(--foreground-2)',
      minWidth: 22, width: 22, flexShrink: 0,
      transition: 'all 0.15s'
    }}
  >
    {hasDraft && <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#ef4444', border: '1px solid var(--background)' }} />}
    <svg width="12" height="14" viewBox="0 0 24 28" fill={selected ? 'rgba(255,255,255,0.6)' : 'rgba(100,120,180,0.3)'} stroke={selected ? '#fff' : '#6b7fc4'} strokeWidth="2">
      <path d="M6 2C3 2 2 5 2 8s1 8 2 16c.3 1.5 1 2 2.5 2s2.3-1 2.5-2.5v-4h6v4c.2 1.5 1 2.5 2.5 2.5S20 24.5 20 23c1-8 2-13 2-16 0-3-1-6-4-6-2.5 0-4 2-5 3.5C12 3 10.5 2 8 2z"/>
    </svg>
    <span style={{ fontSize: 8, fontWeight: 700, lineHeight: 1 }}>{number}</span>
  </button>
)

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

const UPPER_TEETH = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER_TEETH = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

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
  const [panelOpen, setPanelOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [activeTab, setActiveTab] = useState<'appointment' | 'info' | 'treatment'>('appointment')
  
  const [selectedDcmUrl, setSelectedDcmUrl] = useState<string | null>(null)
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [patientTreatments, setPatientTreatments] = useState<any[]>([])
  const [patientPayments, setPatientPayments] = useState<any[]>([])
  const [patientInfo, setPatientInfo] = useState<Patient | null>(null)
  
  // Treatment Form state
  const [showTedaviForm, setShowTedaviForm] = useState(false)
  const [tedaviNames, setTedaviNames] = useState<string[]>([''])
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([])
  const [lastSelectedTooth, setLastSelectedTooth] = useState<string | null>(null)
  const [tedaviIndications, setTedaviIndications] = useState<string[]>([''])
  
  // Single DICOM file for the entire treatment
  const [treatmentDcmFile, setTreatmentDcmFile] = useState<File | null>(null)
  
  // Drag and Drop States
  const [procTemplates, setProcTemplates] = useState<{name: string, price: number, materialId?: string}[]>([
    { name: "Kompozit Dolgu", price: 500 },
    { name: "Kanal Tedavisi", price: 1500 },
    { name: "Çekim", price: 300 },
    { name: "Detertraj", price: 400 },
    { name: "İmplant", price: 5000 }
  ])
  const [indTemplates, setIndTemplates] = useState<string[]>(["Derin Çürük", "Kırık", "Apikal Lezyon", "Kök Kırığı", "Ağrı"])
  const [toothDrafts, setToothDrafts] = useState<Record<string, { procedures: {name: string, price: number, materialId?: string}[], indications: string[], cost: number }>>({})
  const [newTemplateInput, setNewTemplateInput] = useState('')
  const [newTemplatePrice, setNewTemplatePrice] = useState<number>(0)
  const [newTemplateMaterial, setNewTemplateMaterial] = useState<string>('')
  const [newTemplateType, setNewTemplateType] = useState<'procedure' | 'indication'>('procedure')
  const [discount, setDiscount] = useState<number>(0)
  const [discountType, setDiscountType] = useState<'amount'|'percentage'>('amount')
  const [inventoryItems, setInventoryItems] = useState<any[]>([])

  const handleToothClick = (n: number, e: React.MouseEvent) => {
    const toothStr = String(n);
    if (e.shiftKey && lastSelectedTooth) {
      const upperIndex1 = UPPER_TEETH.indexOf(Number(lastSelectedTooth));
      const upperIndex2 = UPPER_TEETH.indexOf(n);
      const lowerIndex1 = LOWER_TEETH.indexOf(Number(lastSelectedTooth));
      const lowerIndex2 = LOWER_TEETH.indexOf(n);

      let range: number[] = [];
      if (upperIndex1 !== -1 && upperIndex2 !== -1) {
        const start = Math.min(upperIndex1, upperIndex2);
        const end = Math.max(upperIndex1, upperIndex2);
        range = UPPER_TEETH.slice(start, end + 1);
      } else if (lowerIndex1 !== -1 && lowerIndex2 !== -1) {
        const start = Math.min(lowerIndex1, lowerIndex2);
        const end = Math.max(lowerIndex1, lowerIndex2);
        range = LOWER_TEETH.slice(start, end + 1);
      }

      if (range.length > 0) {
        const rangeStrs = range.map(String);
        setSelectedTeeth(prev => Array.from(new Set([...prev, ...rangeStrs])));
      } else {
        setSelectedTeeth(prev => prev.includes(toothStr) ? prev.filter(t => t !== toothStr) : [...prev, toothStr]);
      }
    } else {
      setSelectedTeeth(prev => prev.includes(toothStr) ? prev.filter(t => t !== toothStr) : [...prev, toothStr]);
    }
    setLastSelectedTooth(toothStr);
  };
  const [showPastTreatmentsModal, setShowPastTreatmentsModal] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])
  
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
  const [formDoctor, setFormDoctor] = useState('')
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formTime, setFormTime] = useState('09:00')
  const [formDuration, setFormDuration] = useState('30')
  const [formType, setFormType] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // Doctor form state
  const [docName, setDocName] = useState('')
  const [docSpecialty, setDocSpecialty] = useState('')
  const [docColor, setDocColor] = useState('#60a5fa')
  const [docSaving, setDocSaving] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [docRes, evtRes, shiftRes, invRes] = await Promise.all([
        fetch('/api/dental/doctors'),
        fetch('/api/dental/appointments'),
        fetch('/api/shifts'),
        fetch('/api/yonetici/inventory')
      ])
      if (docRes.ok) setDoctors(await docRes.json())
      if (evtRes.ok) setEvents(await evtRes.json())
      if (shiftRes.ok) setShifts(await shiftRes.json())
      if (invRes.ok) setInventoryItems(await invRes.json())
    } catch (e) {
      console.error('Calendar fetch error:', e)
    }
  }, [currentDate])

  useEffect(() => { fetchData() }, [fetchData])

  const handleEventClick = (eventId: string, event: CalendarEvent) => {
    setSelectedEvent(event)
    setPanelOpen(true)
    setPatientTreatments([])
    setPatientPayments([])
    setPatientInfo(null)
    if (event.patientId) {
      fetch(`/api/dental/patients/${event.patientId}`).then(r => r.ok ? r.json() : null).then(d => d && setPatientInfo(d)).catch(() => {})
      fetch(`/api/dental/patients/${event.patientId}/treatments`).then(r => r.ok ? r.json() : []).then(setPatientTreatments).catch(() => {})
      fetch(`/api/dental/patients/${event.patientId}/payments`).then(r => r.ok ? r.json() : []).then(setPatientPayments).catch(() => {})
    }
    const docQuery = event.doctorId ? `?doctorId=${event.doctorId}` : ''
    fetch(`/api/hekim/templates${docQuery}`).then(r => r.ok ? r.json() : []).then(setTemplates).catch(() => {})
  }

  const handleDeleteEvent = async () => {
    if (!selectedEvent || !confirm('Bu randevuyu silmek istediğinizden emin misiniz?')) return
    try {
      await fetch(`/api/dental/appointments/${selectedEvent.id}`, { method: 'DELETE' })
      setPanelOpen(false)
      setSelectedEvent(null)
      fetchData()
    } catch {}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formDoctor || !formName || !formTime) return
    setFormSaving(true)
    try {
      const startTime = new Date(`${currentDate}T${formTime}:00+03:00`)
      const endTime = new Date(startTime.getTime() + parseInt(formDuration) * 60_000)

      // Create patient first
      const pRes = await fetch('/api/dental/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, phone: formPhone || undefined }),
      })
      if (!pRes.ok) throw new Error('Patient creation failed')
      const patient = await pRes.json()

      // Create appointment
      const aRes = await fetch('/api/dental/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
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
        setFormName(''); setFormPhone(''); setFormType(''); setFormNotes('')
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

      {/* Doctor chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {doctors.map(d => (
          <span key={d.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 6,
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            fontSize: '0.75rem', color: 'var(--foreground)',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
            {d.name}
            <span style={{ color: 'var(--foreground-3)', fontSize: '0.7rem' }}>({d.specialty})</span>
          </span>
        ))}
      </div>

      {/* Appointment Form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          padding: 16, marginBottom: 16, borderRadius: 10,
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {!doctors.some(d => shifts.some(s => s.userId === d.id && s.date === currentDate)) && (
              <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 600 }}>⚠️ Bu tarihte vardiyalı doktor yok</span>
            )}
            <select
              value={formDoctor} onChange={e => setFormDoctor(e.target.value)} required
              style={inputStyle}
            >
              <option value="">Doktor Seç...</option>
              {doctors
                .filter(d => shifts.some(s => s.userId === d.id && s.date === currentDate))
                .map(d => <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>)
              }
            </select>
          </div>
          <input placeholder="Hasta Adı *" value={formName} onChange={e => setFormName(e.target.value)} required style={inputStyle} />
          <input placeholder="Telefon" value={formPhone} onChange={e => setFormPhone(e.target.value)} style={inputStyle} />
          <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} required style={inputStyle} />
          <select value={formDuration} onChange={e => setFormDuration(e.target.value)} style={inputStyle}>
            <option value="15">15 dk</option>
            <option value="30">30 dk</option>
            <option value="45">45 dk</option>
            <option value="60">1 saat</option>
            <option value="90">1.5 saat</option>
            <option value="120">2 saat</option>
          </select>
          <input placeholder="İşlem Türü (ör. Dolgu, İmplant)" value={formType} onChange={e => setFormType(e.target.value)} style={inputStyle} />
          <input placeholder="Not (opsiyonel)" value={formNotes} onChange={e => setFormNotes(e.target.value)} style={{ ...inputStyle, gridColumn: '1/-1' }} />
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
                  <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)' }}>Doktor</div>
                  <div style={{ fontSize: '0.8rem', color: selectedEvent.doctorId ? 'var(--foreground)' : '#9ca3af', fontStyle: selectedEvent.doctorId ? 'normal' : 'italic' }}>
                    {doctors.find(d => d.id === selectedEvent.doctorId)?.name || '⚠️ Atanmamış'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)' }}>Tür</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--foreground)' }}>{selectedEvent.type}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)' }}>Tarih</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--foreground)' }}>{new Date(selectedEvent.startTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)' }}>Saat</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--foreground)' }}>{new Date(selectedEvent.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedEvent.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)' }}>Durum</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--foreground)' }}>{STATUS_LABELS[selectedEvent.status] || selectedEvent.status}</div>
                </div>
              </div>
              {selectedEvent.notes && <div style={{ fontSize: '0.75rem', color: 'var(--foreground-2)', marginTop: 8, borderTop: '1px solid var(--glass-border)', paddingTop: 6 }}>📝 {selectedEvent.notes}</div>}
            </div>

            {/* ── Ödeme Bilgisi ── */}
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ödeme Bilgisi</div>
                <button onClick={() => { setPaymentIdBeingEdited(null); setPaymentDate(new Date().toISOString().slice(0, 10)); setPaymentMethod('Nakit'); setPaymentStatus('completed'); setPaymentDueDate(''); setPaymentTreatmentId(''); setPaymentNote(''); setPaymentAmount(''); setShowPaymentModal(true); }} style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: 4, border: '1px dashed var(--glass-border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}>+ Ödeme Ekle</button>
              </div>

              {patientPayments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {patientPayments.map((p: any) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--foreground-2)' }}>{p.date}</span>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: '#10b981', fontWeight: 600 }}>{p.amount} ₺</span>
                        <span style={{ color: 'var(--foreground-3)', fontSize: '0.65rem' }}>{p.method}</span>
                        <button onClick={(e) => {
                          e.preventDefault();
                          setPaymentIdBeingEdited(p.id);
                          setPaymentAmount(p.amount.toString());
                          setPaymentDate(p.date);
                          setPaymentMethod(p.method);
                          setPaymentStatus(p.status || 'completed');
                          setPaymentDueDate(p.dueDate || '');
                          setPaymentTreatmentId(p.treatmentPlanId || '');
                          setPaymentNote(p.notes || '');
                          setShowPaymentModal(true);
                        }} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '2px', fontSize: '0.85rem' }} title="Düzelt">✏️</button>
                        <button onClick={(e) => {
                          e.preventDefault();
                          fetch(`/api/dental/payments/${p.id}`, { method: 'DELETE' })
                            .then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/payments`).then(r => r.json()).then(setPatientPayments))
                            .catch(() => {})
                        }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', fontSize: '0.85rem' }} title="Sil">🗑️</button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>Ödeme kaydı yok</div>}
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
                  <button onClick={() => { setTreatmentDeleteError(null); setShowTedaviForm(true); }} style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: 4, border: '1px dashed var(--glass-border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {patientTreatments.filter((t: any) => t.status !== 'completed').map((t: any) => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: 'var(--foreground)' }}>
                          {t.toothNumber ? <span style={{color: 'var(--accent)', fontWeight: 600, marginRight: 4}}>#{t.toothNumber}</span> : null}
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
                          }).then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(setPatientTreatments)).catch(() => {})
                        }} style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 4, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                          <option value="planned">Planlandı</option>
                          <option value="in_progress">Devam Ediyor</option>
                          <option value="completed">Yapıldı</option>
                        </select>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setTreatmentDeleteError(null);
                            const hasLinkedPayment = patientPayments.some((p: any) => p.treatmentPlanId === t.id);
                            if (hasLinkedPayment) {
                              setTreatmentDeleteError('Bu tedaviyi silmek için önce ilgili ödemeyi siliniz.');
                              return;
                            }
                            fetch(`/api/dental/treatments/${t.id}`, { method: 'DELETE' })
                              .then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(setPatientTreatments))
                              .catch(() => {})
                          }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}
                          title="Sil"
                        >
                          🗑️
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>Tedavi planı yok</div>}
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Doctor assignment + date/time change */}
            <div style={{ padding: 12, borderRadius: 8, background: selectedEvent.doctorId ? 'var(--glass-bg)' : 'rgba(156,163,175,0.1)', border: selectedEvent.doctorId ? '1px solid var(--glass-border)' : '1px dashed #9ca3af' }}>
              <div style={{ fontSize: '0.7rem', color: selectedEvent.doctorId ? 'var(--foreground-3)' : '#9ca3af', marginBottom: 6, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{selectedEvent.doctorId ? '👨‍⚕️ Doktor Değiştir' : '⚠️ Doktor Ata'}</span>
                {!doctors.some(d => shifts.some(s => s.userId === d.id && s.date === new Date(selectedEvent.startTime).toLocaleDateString('sv'))) && (
                  <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>⚠️ Vardiyalı doktor yok</span>
                )}
              </div>
              <select
                defaultValue={selectedEvent.doctorId || ""}
                onChange={async (e) => {
                  const doctorId = e.target.value || null
                  try {
                    const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ doctorId }),
                    })
                    if (res.ok) {
                      setPanelOpen(false); setSelectedEvent(null); fetchData()
                    }
                  } catch {}
                }}
                style={inputStyle}
              >
                <option value="">Atanmamış (Boş Bırak)</option>
                {doctors
                  .filter(d => {
                    const evtDate = new Date(selectedEvent.startTime).toLocaleDateString('sv')
                    const hasShift = shifts.some(s => s.userId === d.id && s.date === evtDate)
                    return hasShift || d.id === selectedEvent.doctorId
                  })
                  .map(d => <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>)
                }
              </select>
            </div>
            {/* Date/time edit */}
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', marginBottom: 6, fontWeight: 600 }}>📅 Tarih/Saat Değiştir</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="datetime-local"
                  defaultValue={selectedEvent.startTime.slice(0, 16)}
                  id="edit-datetime"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={async () => {
                    const el = document.getElementById('edit-datetime') as HTMLInputElement
                    if (!el?.value) return
                    const startTime = new Date(el.value + ':00+03:00')
                    const duration = new Date(selectedEvent.endTime).getTime() - new Date(selectedEvent.startTime).getTime()
                    const endTime = new Date(startTime.getTime() + duration)
                    try {
                      const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ startTime: startTime.toISOString(), endTime: endTime.toISOString(), timeConfirmed: true }),
                      })
                      if (res.ok) { setPanelOpen(false); setSelectedEvent(null); fetchData() }
                    } catch {}
                  }}
                  style={btnStyle}
                >Kaydet</button>
              </div>
            </div>
            {/* Status select */}
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3)', marginBottom: 6, fontWeight: 600 }}>📋 Durum</div>
              <select
                defaultValue={selectedEvent.status}
                onChange={async (e) => {
                  const status = e.target.value
                  try {
                    const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status }),
                    })
                    if (res.ok) { setPanelOpen(false); setSelectedEvent(null); fetchData() }
                  } catch {}
                }}
                style={inputStyle}
              >
                <option value="scheduled">📅 Planlandı</option>
                <option value="confirmed">✅ Onaylandı</option>
                <option value="in_progress">🔄 Devam Ediyor</option>
                <option value="completed">✓ Tamamlandı</option>
                <option value="cancelled">❌ İptal</option>
                <option value="pending_assignment">⚠️ Atama Bekliyor</option>
                <option value="postponed">⏳ Ertelendi</option>
                <option value="no_show">🚫 Gelmedi</option>
              </select>
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
                  } catch {}
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--background)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 1000, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--foreground)' }}>Tedavi Planı Oluştur</h3>
              <button onClick={() => { setShowTedaviForm(false); setSelectedTeeth([]); setLastSelectedTooth(null); setTedaviNames(['']); setTedaviIndications(['']); setToothDrafts({}); setNewTemplateInput(''); setDiscount(0); }} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.5rem' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              
              {/* LEFT COLUMN: Odontogram and Templates AND Viewer */}
              <div style={{ width: '40%', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', paddingRight: 8 }}>
                
                    {/* Odontogram Tooth Selector */}
                    <div style={{ padding: 16, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                      <div style={{ fontSize: 12, color: 'var(--foreground-3)', marginBottom: 12, textAlign: 'center', fontWeight: 500 }}>Hedef Dişleri Seçin veya İşlemi Üzerine Sürükleyin</div>
                  
                  {/* Compact 2-row grid: Upper & Lower jaws */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Upper jaw label */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                      {UPPER_TEETH.map(n => (
                        <ToothChip 
                          key={n} 
                          number={n} 
                          selected={selectedTeeth.includes(String(n))} 
                          hasDraft={!!toothDrafts[String(n)]}
                          onClick={(e: React.MouseEvent) => handleToothClick(n, e)}
                          onDragOver={(e: React.DragEvent) => e.preventDefault()}
                          onDrop={(e: React.DragEvent) => {
                            e.preventDefault();
                            const type = e.dataTransfer.getData("type");
                            const val = e.dataTransfer.getData("value");
                            if (!val) return;
                            const targetTeeth = selectedTeeth.includes(String(n)) ? selectedTeeth : [String(n)];
                            
                            setToothDrafts(prev => {
                              const next = { ...prev };
                              targetTeeth.forEach(t => {
                                if (!next[t]) next[t] = { procedures: [], indications: [], cost: 0 };
                                if (type === 'procedure') {
                                  const parsed = JSON.parse(val);
                                  if (!next[t].procedures.find((p: any) => p.name === parsed.name)) {
                                    next[t].procedures = [...next[t].procedures, parsed];
                                  }
                                }
                                if (type === 'indication' && !next[t].indications.includes(val)) {
                                  next[t].indications = [...next[t].indications, val];
                                }
                              });
                              return next;
                            });
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ height: 1, background: 'var(--glass-border)', margin: '0 4px' }} />
                    {/* Lower jaw */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                      {LOWER_TEETH.map(n => (
                        <ToothChip 
                          key={n} 
                          number={n} 
                          selected={selectedTeeth.includes(String(n))} 
                          hasDraft={!!toothDrafts[String(n)]}
                          onClick={(e: React.MouseEvent) => handleToothClick(n, e)}
                          onDragOver={(e: React.DragEvent) => e.preventDefault()}
                          onDrop={(e: React.DragEvent) => {
                            e.preventDefault();
                            const type = e.dataTransfer.getData("type");
                            const val = e.dataTransfer.getData("value");
                            if (!val) return;
                            const targetTeeth = selectedTeeth.includes(String(n)) ? selectedTeeth : [String(n)];
                            
                            setToothDrafts(prev => {
                              const next = { ...prev };
                              targetTeeth.forEach(t => {
                                if (!next[t]) next[t] = { procedures: [], indications: [], cost: 0 };
                                if (type === 'procedure') {
                                  const parsed = JSON.parse(val);
                                  if (!next[t].procedures.find((p: any) => p.name === parsed.name)) {
                                    next[t].procedures = [...next[t].procedures, parsed];
                                  }
                                }
                                if (type === 'indication' && !next[t].indications.includes(val)) {
                                  next[t].indications = [...next[t].indications, val];
                                }
                              });
                              return next;
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Templates Pool */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      Sık Kullanılan İşlemler
                      <span style={{ fontSize: 10, color: 'var(--foreground-3)', fontWeight: 400 }}>(Sürükle bırak)</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {procTemplates.map((proc, i) => (
                        <div 
                          key={i} 
                          draggable 
                          onDragStart={(e) => { e.dataTransfer.setData("type", "procedure"); e.dataTransfer.setData("value", JSON.stringify(proc)); }}
                          style={{ padding: '6px 12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, fontSize: '0.8rem', color: 'var(--foreground)', cursor: 'grab', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {proc.name} <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>{proc.price}₺</span>
                          {proc.materialId && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', display: 'inline-block', marginLeft: 2 }} title="Stoka Bağlı" />}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      Sık Kullanılan Endikasyonlar
                      <span style={{ fontSize: 10, color: 'var(--foreground-3)', fontWeight: 400 }}>(Sürükle bırak)</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {indTemplates.map((ind, i) => (
                        <div 
                          key={i} 
                          draggable 
                          onDragStart={(e) => { e.dataTransfer.setData("type", "indication"); e.dataTransfer.setData("value", ind); }}
                          style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, fontSize: '0.8rem', color: '#ef4444', cursor: 'grab' }}>
                          {ind}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Yeni Şablon Ekleme */}
                  <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px dashed var(--glass-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 8 }}>Yeni Şablon Ekle</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select value={newTemplateType} onChange={e => setNewTemplateType(e.target.value as 'procedure'|'indication')} style={{ ...inputStyle, width: 100, fontSize: '0.8rem', padding: '6px' }}>
                          <option value="procedure">İşlem</option>
                          <option value="indication">Endikasyon</option>
                        </select>
                        <input type="text" value={newTemplateInput} onChange={e => setNewTemplateInput(e.target.value)} placeholder="Şablon Adı" style={{ ...inputStyle, flex: 1, fontSize: '0.8rem', padding: '6px' }} />
                      </div>
                      
                      {newTemplateType === 'procedure' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input type="number" value={newTemplatePrice || ''} onChange={e => setNewTemplatePrice(Number(e.target.value))} placeholder="Fiyat (₺)" style={{ ...inputStyle, width: 100, fontSize: '0.8rem', padding: '6px' }} />
                          <select value={newTemplateMaterial} onChange={e => setNewTemplateMaterial(e.target.value)} style={{ ...inputStyle, flex: 1, fontSize: '0.8rem', padding: '6px' }}>
                            <option value="">-- Stok Malzemesi Bağla (Opsiyonel) --</option>
                            {inventoryItems.map((item: any) => (
                              <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit} mevcut)</option>
                            ))}
                          </select>
                        </div>
                      )}
                      
                      <button 
                        onClick={() => {
                          if (!newTemplateInput.trim()) return;
                          if (newTemplateType === 'procedure') {
                            setProcTemplates(prev => [...prev, { name: newTemplateInput.trim(), price: newTemplatePrice, materialId: newTemplateMaterial || undefined }]);
                          } else {
                            setIndTemplates(prev => Array.from(new Set([...prev, newTemplateInput.trim()])));
                          }
                          setNewTemplateInput('');
                          setNewTemplatePrice(0);
                          setNewTemplateMaterial('');
                        }}
                        style={{ padding: '6px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
                      >
                        Şablonu Ekle
                      </button>
                    </div>
                  </div>
                </div>

                {/* Single DICOM Upload and Inline Viewer */}
                <div style={{ padding: 16, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-2)' }}>
                    Genel Tedavi Röntgeni Yükle (.dcm)
                  </div>
                  <label style={{ display: 'inline-block', cursor: 'pointer', padding: '8px 12px', background: treatmentDcmFile ? 'rgba(59, 130, 246, 0.2)' : 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, fontSize: '0.8rem', color: treatmentDcmFile ? '#3b82f6' : 'var(--foreground-2)', textAlign: 'center' }}>
                    {treatmentDcmFile ? treatmentDcmFile.name : 'Dosya Seç (Tüm tedavi için)'}
                    <input type="file" accept=".dcm" style={{ display: 'none' }} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && file.size > 20 * 1024 * 1024) {
                        alert('Dosya boyutu 20 MB\'dan büyük olamaz');
                        e.target.value = '';
                        return;
                      }
                      if (file) setTreatmentDcmFile(file);
                    }} />
                  </label>
                  {treatmentDcmFile && (
                    <div style={{ height: 400, borderRadius: 8, overflow: 'hidden', position: 'relative', marginTop: 8 }}>
                      <ThreeDicomViewer file={treatmentDcmFile} inline={true} onClose={() => setTreatmentDcmFile(null)} />
                    </div>
                  )}
                </div>

              </div>

              {/* RIGHT COLUMN: Cart Table & Save */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, borderLeft: '1px solid var(--glass-border)', paddingLeft: 24, overflowY: 'auto' }}>
                
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🛒 Atanan İşlemler Sepeti
                    {Object.keys(toothDrafts).length > 0 && <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10 }}>{Object.keys(toothDrafts).length} Diş</span>}
                  </div>
                  
                  {Object.keys(toothDrafts).length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground-3)', fontSize: '0.85rem', textAlign: 'center', padding: 20 }}>
                      <BriefcaseMedical size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                      İşlem ve endikasyon şablonlarını dişlerin üzerine sürükleyip bırakarak sepetinize ekleyin.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: 8, background: 'var(--glass-bg)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                          <thead style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--foreground-2)' }}>
                            <tr>
                              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)' }}>Diş</th>
                              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)' }}>İşlem</th>
                              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)' }}>Endikasyon</th>
                              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)', width: 100, textAlign: 'right' }}>Ücret (₺)</th>
                              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)', width: 40, textAlign: 'center' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(toothDrafts).map(([tooth, draft]) => {
                              const toothPrice = draft.procedures.reduce((s, p: any) => s + p.price, 0);
                              return (
                                <tr key={tooth} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--accent)' }}>#{tooth}</td>
                                  <td style={{ padding: '8px 12px', color: 'var(--foreground)' }}>
                                    {draft.procedures.length > 0 ? draft.procedures.map(p => p.name).join(', ') : <span style={{ color: 'var(--foreground-3)' }}>-</span>}
                                  </td>
                                  <td style={{ padding: '8px 12px', color: 'var(--foreground)' }}>
                                    {draft.indications.length > 0 ? draft.indications.join(', ') : <span style={{ color: 'var(--foreground-3)' }}>-</span>}
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>
                                    {toothPrice} ₺
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                    <button onClick={() => {
                                      setToothDrafts(prev => {
                                        const next = { ...prev };
                                        delete next[tooth];
                                        return next;
                                      });
                                    }} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Financial Summary */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ width: 250, padding: 16, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--foreground-2)' }}>
                            <span>Ara Toplam:</span>
                            <span>{Object.values(toothDrafts).reduce((sum, draft) => sum + draft.procedures.reduce((s, p: any) => s + p.price, 0), 0)} ₺</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--foreground-2)' }}>
                            <span>İskonto:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 120 }}>
                              <input type="number" value={discount || ''} onChange={e => setDiscount(Number(e.target.value))} placeholder="0" style={{ ...inputStyle, width: '100%', padding: '4px 8px', fontSize: '0.8rem', textAlign: 'right' }} />
                              <select value={discountType} onChange={e => setDiscountType(e.target.value as 'amount'|'percentage')} style={{ ...inputStyle, padding: '4px', fontSize: '0.8rem', background: 'var(--glass-bg)', border: 'none', cursor: 'pointer' }}>
                                <option value="amount">₺</option>
                                <option value="percentage">%</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ height: 1, background: 'var(--glass-border)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                            <span>Genel Toplam:</span>
                            <span>{Math.max(0, Object.values(toothDrafts).reduce((sum, draft) => sum + draft.procedures.reduce((s, p: any) => s + p.price, 0), 0) - (discountType === 'percentage' ? (Object.values(toothDrafts).reduce((sum, draft) => sum + draft.procedures.reduce((s, p: any) => s + p.price, 0), 0) * (discount / 100)) : discount))} ₺</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--foreground-2)', cursor: 'pointer', marginBottom: isPeriodic ? 12 : 0 }}>
                    <input type="checkbox" checked={isPeriodic} onChange={e => setIsPeriodic(e.target.checked)} />
                    Bu periyodik bir işlem mi? (Kontrol/Tekrar)
                  </label>
                  
                  {isPeriodic && (
                    <div style={{ padding: 12, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Hatırlatma Periyodu</label>
                        <select value={periodDays} onChange={e => setPeriodDays(Number(e.target.value))} style={{ ...inputStyle, width: '100%', fontSize: '0.8rem', padding: '6px' }}>
                          <option value={30}>1 Ay Sonra</option>
                          <option value={90}>3 Ay Sonra</option>
                          <option value={180}>6 Ay Sonra</option>
                          <option value={365}>1 Yıl Sonra</option>
                        </select>
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={notifyPatient} onChange={e => setNotifyPatient(e.target.checked)} />
                        Zamanı gelince bildirim yapılsın
                      </label>

                      {notifyPatient && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Bildirim Yöntemi</label>
                          <select value={notificationType} onChange={e => setNotificationType(e.target.value)} style={{ ...inputStyle, width: '100%', fontSize: '0.8rem', padding: '6px' }}>
                            <option value="sms">Sadece SMS</option>
                            <option value="email">Sadece E-posta</option>
                            <option value="both">İkisi de</option>
                          </select>
                          
                          {( (notificationType === 'sms' || notificationType === 'both') && !patientInfo?.phone || (notificationType === 'email' || notificationType === 'both') && !patientInfo?.email ) && (
                            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                              <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>
                                ⚠️ Eksik İletişim Bilgisi
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {(notificationType === 'sms' || notificationType === 'both') && !patientInfo?.phone && (
                                  <input type="tel" placeholder="Telefon Numarası" value={missingPhone} onChange={e => setMissingPhone(e.target.value)} style={{ ...inputStyle, width: '100%', borderColor: 'rgba(239,68,68,0.3)', padding: '6px', fontSize: '0.8rem' }} />
                                )}
                                {(notificationType === 'email' || notificationType === 'both') && !patientInfo?.email && (
                                  <input type="email" placeholder="E-posta" value={missingEmail} onChange={e => setMissingEmail(e.target.value)} style={{ ...inputStyle, width: '100%', borderColor: 'rgba(239,68,68,0.3)', padding: '6px', fontSize: '0.8rem' }} />
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button onClick={() => { setShowTedaviForm(false); setSelectedTeeth([]); setLastSelectedTooth(null); setTedaviNames(['']); setTedaviIndications(['']); setToothDrafts({}); setIsPeriodic(false); setNotifyPatient(false); setMissingPhone(''); setMissingEmail(''); setDiscount(0); setTreatmentDcmFile(null); }} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer', fontWeight: 600 }}>İptal</button>
                    <button onClick={async () => {
                      if (Object.keys(toothDrafts).length === 0) {
                        alert('Lütfen önce dişlere işlem veya endikasyon atayın.');
                        return;
                      }

                      // Check if any draft is missing procedure
                      const hasMissingProc = Object.values(toothDrafts).some(d => d.procedures.length === 0);
                      if (hasMissingProc) {
                        if (!confirm('Bazı dişlere sadece endikasyon atanmış (işlem adı yok). Yine de devam etmek istiyor musunuz?')) return;
                      }
                      
                      const isPhoneMissing = notifyPatient && (notificationType === 'sms' || notificationType === 'both') && !patientInfo?.phone
                      const isEmailMissing = notifyPatient && (notificationType === 'email' || notificationType === 'both') && !patientInfo?.email

                      if (isPhoneMissing && !missingPhone.trim()) {
                        alert('Lütfen eksik olan telefon numarasını giriniz.');
                        return;
                      }
                      if (isEmailMissing && !missingEmail.trim()) {
                        alert('Lütfen eksik olan e-posta adresini giriniz.');
                        return;
                      }

                      if (notifyPatient && (missingPhone.trim() || missingEmail.trim())) {
                        try {
                          await fetch(`/api/dental/patients/${selectedEvent.patientId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              phone: missingPhone.trim() || undefined,
                              email: missingEmail.trim() || undefined
                            })
                          })
                          setPatientInfo(prev => prev ? { ...prev, phone: missingPhone.trim() || prev.phone, email: missingEmail.trim() || prev.email } : prev)
                        } catch (err) {}
                      }
                      
                      let nextNotificationDate: string | undefined = undefined
                      if (isPeriodic && notifyPatient) {
                        const d = new Date()
                        d.setDate(d.getDate() + periodDays)
                        nextNotificationDate = d.toISOString().slice(0, 10)
                      }
                      
                      // Calculate Discount Factor
                      const subtotal = Object.values(toothDrafts).reduce((sum, draft) => sum + draft.procedures.reduce((s, p: any) => s + p.price, 0), 0);
                      
                      let actualDiscount = 0;
                      if (discountType === 'percentage') {
                        actualDiscount = subtotal * (Math.min(100, discount) / 100);
                      } else {
                        actualDiscount = Math.min(discount, subtotal); // prevent discount > subtotal
                      }
                      
                      const discountFactor = subtotal > 0 ? (subtotal - actualDiscount) / subtotal : 1;

                      // Upload Global DCM file once
                      let uploadedDcmUrl = undefined;
                      if (treatmentDcmFile) {
                        const formData = new FormData();
                        formData.append('file', treatmentDcmFile);
                        try {
                          const uploadRes = await fetch('/api/dental/upload-dcm', {
                            method: 'POST',
                            body: formData
                          });
                          if (uploadRes.ok) {
                            const upData = await uploadRes.json();
                            uploadedDcmUrl = upData.url;
                          }
                        } catch (e) {
                          console.error('DCM Upload Error:', e);
                        }
                      }

                      // Save all drafts
                      try {
                        for (const [tooth, draft] of Object.entries(toothDrafts)) {
                          
                          const toothOriginalPrice = draft.procedures.reduce((s, p: any) => s + p.price, 0);
                          const toothFinalPrice = Math.round(toothOriginalPrice * discountFactor);
                          
                          const res = await fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                              procedureName: draft.procedures.length > 0 ? draft.procedures.map((p:any) => p.name).join(', ') : 'Belirtilmedi', 
                              toothNumber: tooth, 
                              indication: draft.indications.length > 0 ? draft.indications.join(', ') : undefined, 
                              cost: toothFinalPrice, 
                              status: 'planned',
                              dcmUrl: uploadedDcmUrl,
                              isPeriodic,
                              periodDays,
                              notifyPatient,
                              notificationType,
                              nextNotificationDate,
                              clinicId: clinicId || undefined
                            })
                          });
                          if (!res.ok) {
                            console.error('Kayıt hatası:', await res.text());
                            throw new Error('Kayıt başarısız');
                          }
                          
                          // Handle Inventory Deductions
                          for (const p of draft.procedures) {
                            if (p.materialId) {
                              try {
                                await fetch('/api/hekim/material-usage', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    patientId: selectedEvent.patientId,
                                    appointmentId: selectedEvent.id,
                                    inventoryItemId: p.materialId,
                                    quantity: 1
                                  })
                                });
                              } catch (invErr) {
                                console.error('Stok düşümü hatası:', invErr);
                              }
                            }
                          }
                        }
                        
                        setTedaviNames(['']); setSelectedTeeth([]); setLastSelectedTooth(null); setTedaviIndications(['']); setToothDrafts({}); setShowTedaviForm(false);
                        setIsPeriodic(false); setNotifyPatient(false); setMissingPhone(''); setMissingEmail(''); setDiscount(0);
                        fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(setPatientTreatments)
                      } catch (err) {
                        alert('Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.');
                      }
                    }} style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, flex: 1 }}>Kaydet</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
                    }).catch(() => {})
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
        <ThreeDicomViewer dcmUrl={selectedDcmUrl} onClose={() => setSelectedDcmUrl(null)} />
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--foreground)',
  fontSize: '0.8rem',
  outline: 'none',
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
