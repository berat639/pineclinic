import React, { useState, useEffect, useCallback } from 'react'
import { Plus, X, Search, Filter, Calendar, Clock, User, Phone, PhoneCall, Link2, LogOut, LayoutDashboard, CalendarDays, Users, Stethoscope, BriefcaseMedical, Settings } from 'lucide-react'
import DentalCalendar from './DentalCalendar'

const ToothChip = ({ number, selected, onClick }: any) => (
  <button
    onClick={onClick}
    title={`Diş ${number}`}
    style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      background: selected ? 'var(--accent)' : 'transparent',
      border: `1px solid ${selected ? 'var(--accent)' : 'var(--glass-border)'}`,
      borderRadius: 6, padding: '3px 2px', cursor: 'pointer',
      color: selected ? '#fff' : 'var(--foreground-2)',
      minWidth: 22, width: 22, flexShrink: 0,
      transition: 'all 0.15s'
    }}
  >
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
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [patientTreatments, setPatientTreatments] = useState<any[]>([])
  const [patientPayments, setPatientPayments] = useState<any[]>([])
  const [patientInfo, setPatientInfo] = useState<Patient | null>(null)
  
  // Treatment Form state
  const [showTedaviForm, setShowTedaviForm] = useState(false)
  const [tedaviName, setTedaviName] = useState('')
  const [selectedTooth, setSelectedTooth] = useState<string>('')
  const [tedaviIndication, setTedaviIndication] = useState('')
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
      const [docRes, evtRes, shiftRes] = await Promise.all([
        fetch('/api/dental/doctors'),
        fetch('/api/dental/appointments'),
        fetch('/api/shifts'),
      ])
      if (docRes.ok) setDoctors(await docRes.json())
      if (evtRes.ok) setEvents(await evtRes.json())
      if (shiftRes.ok) setShifts(await shiftRes.json())
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
                <button onClick={() => { setTreatmentDeleteError(null); setShowTedaviForm(true); }} style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: 4, border: '1px dashed var(--glass-border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}>
                  + Tedavi Ekle
                </button>
              </div>
              {treatmentDeleteError && (
                <div style={{ fontSize: '0.7rem', color: '#ef4444', marginBottom: 8, fontWeight: 600 }}>
                  ⚠️ {treatmentDeleteError}
                </div>
              )}
              {patientTreatments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {patientTreatments.map((t: any) => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: 'var(--foreground)' }}>
                          {t.toothNumber ? <span style={{color: 'var(--accent)', fontWeight: 600, marginRight: 4}}>#{t.toothNumber}</span> : null}
                          {t.procedureName}
                        </span>
                        {t.indication && <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', marginTop: 2 }}>Endikasyon: {t.indication}</span>}
                      </div>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          <div style={{ background: 'var(--background)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 500, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)' }}>Yeni Tedavi Ekle</h3>
              <button onClick={() => { setShowTedaviForm(false); setSelectedTooth(''); setTedaviName(''); setTedaviIndication(''); }} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
            </div>

            {/* Odontogram Tooth Selector */}
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 12, textAlign: 'center' }}>İşlem Yapılacak Dişi Seçin (İsteğe Bağlı)</div>
              
              {/* Compact 2-row grid: Upper & Lower jaws */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Upper jaw label */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                  {[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28].map(n => (
                    <ToothChip key={n} number={n} selected={selectedTooth===String(n)} onClick={() => setSelectedTooth(selectedTooth===String(n)?'':String(n))} />
                  ))}
                </div>
                <div style={{ height: 1, background: 'var(--glass-border)', margin: '0 4px' }} />
                {/* Lower jaw */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                  {[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38].map(n => (
                    <ToothChip key={n} number={n} selected={selectedTooth===String(n)} onClick={() => setSelectedTooth(selectedTooth===String(n)?'':String(n))} />
                  ))}
                </div>
              </div>
            </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>İşlem Adı</label>
                <input type="text" value={tedaviName} onChange={e => setTedaviName(e.target.value)} placeholder="Örn: Kompozit Dolgu..." style={{ ...inputStyle, width: '100%' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Endikasyon (Teşhis / Sebep)</label>
                <input type="text" value={tedaviIndication} onChange={e => setTedaviIndication(e.target.value)} placeholder="Örn: Derin çürük, kırık..." style={{ ...inputStyle, width: '100%' }} />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--foreground-2)', cursor: 'pointer', marginBottom: isPeriodic ? 12 : 0 }}>
                  <input type="checkbox" checked={isPeriodic} onChange={e => setIsPeriodic(e.target.checked)} />
                  Bu periyodik bir işlem mi? (Kontrol/Tekrar)
                </label>
                
                {isPeriodic && (
                  <div style={{ padding: 12, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Hatırlatma Periyodu</label>
                      <select value={periodDays} onChange={e => setPeriodDays(Number(e.target.value))} style={{ ...inputStyle, width: '100%' }}>
                        <option value={30}>1 Ay Sonra</option>
                        <option value={90}>3 Ay Sonra</option>
                        <option value={180}>6 Ay Sonra</option>
                        <option value={365}>1 Yıl Sonra</option>
                      </select>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={notifyPatient} onChange={e => setNotifyPatient(e.target.checked)} />
                      Zamanı gelince hastaya bildirim yapılsın
                    </label>

                    {notifyPatient && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Bildirim Yöntemi</label>
                        <select value={notificationType} onChange={e => setNotificationType(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                          <option value="sms">Sadece SMS</option>
                          <option value="email">Sadece E-posta</option>
                          <option value="both">İkisi de</option>
                        </select>
                        
                        {( (notificationType === 'sms' || notificationType === 'both') && !patientInfo?.phone || (notificationType === 'email' || notificationType === 'both') && !patientInfo?.email ) && (
                          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>
                              ⚠️ Seçilen bildirim yöntemi için hastanın iletişim bilgisi eksik. Lütfen ekleyin:
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {(notificationType === 'sms' || notificationType === 'both') && !patientInfo?.phone && (
                                <input type="tel" placeholder="Telefon Numarası (örn: 5xxxxxxxxx)" value={missingPhone} onChange={e => setMissingPhone(e.target.value)} style={{ ...inputStyle, width: '100%', borderColor: 'rgba(239,68,68,0.3)' }} />
                              )}
                              {(notificationType === 'email' || notificationType === 'both') && !patientInfo?.email && (
                                <input type="email" placeholder="E-posta Adresi" value={missingEmail} onChange={e => setMissingEmail(e.target.value)} style={{ ...inputStyle, width: '100%', borderColor: 'rgba(239,68,68,0.3)' }} />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button onClick={() => { setShowTedaviForm(false); setSelectedTooth(''); setTedaviName(''); setTedaviIndication(''); setIsPeriodic(false); setNotifyPatient(false); setMissingPhone(''); setMissingEmail(''); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }}>İptal</button>
                <button onClick={async () => {
                  if (!tedaviName) return
                  
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

                  fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      procedureName: tedaviName, 
                      toothNumber: selectedTooth || undefined, 
                      indication: tedaviIndication || undefined, 
                      cost: 0, 
                      status: 'planned',
                      isPeriodic,
                      periodDays,
                      notifyPatient,
                      notificationType,
                      nextNotificationDate,
                      clinicId: clinicId || undefined
                    })
                  }).then(r => {
                    if (r.ok) {
                      setTedaviName(''); setSelectedTooth(''); setTedaviIndication(''); setShowTedaviForm(false);
                      setIsPeriodic(false); setNotifyPatient(false); setMissingPhone(''); setMissingEmail('');
                      fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(setPatientTreatments)
                    }
                  }).catch(() => {})
                }} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Kaydet</button>
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
