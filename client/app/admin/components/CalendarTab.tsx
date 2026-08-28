import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import { Plus, X, Search, Filter, Calendar, Clock, User, Phone, PhoneCall, Link2, LogOut, LayoutDashboard, CalendarDays, Users, Stethoscope, BriefcaseMedical, Settings } from 'lucide-react'
import ShiftContextMenu from "./ShiftContextMenu"
import DentalCalendar from './DentalCalendar'
import { ToothChip, inputStyle } from './ToothChip'
import PatientSidePanel from './PatientSidePanel'
import AdvancedTedaviModal from './AdvancedTedaviModal';
import QuickCreatePopover from './QuickCreatePopover';
import MiniCalendar from './MiniCalendar';
import PatientProfileCard from './PatientProfileCard';
import FastScheduleModal from './FastScheduleModal';
import ConfirmModal from './ConfirmModal';

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
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>([])
  const initializedDocsRef = React.useRef(false)

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [shifts, setShifts] = useState<any[]>([])
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [patientPanelOpen, setPatientPanelOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [shiftContextMenu, setShiftContextMenu] = useState<{ x: number, y: number, doctorId: string, date: string } | null>(null)
  const [eventContextMenu, setEventContextMenu] = useState<{ x: number, y: number, event: any, doctorId: string, date: string, startTime: string, endTime: string } | null>(null)
  const [unassignedListMenu, setUnassignedListMenu] = useState<{ x: number, y: number } | null>(null)

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Evet, Sil',
    variant: 'danger',
    onConfirm: () => {}
  });

  const [quickCreateMenu, setQuickCreateMenu] = useState<{ start: string, end: string, doctorId: string | null, x: number, y: number, isCentered?: boolean } | null>(null)

  const [showPatientSearchDropdown, setShowPatientSearchDropdown] = useState(false)

  const [showDocForm, setShowDocForm] = useState(false)
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [patientSearchQuery, setPatientSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'appointment' | 'info' | 'treatment'>('appointment')

  const [selectedDcmUrl, setSelectedDcmUrl] = useState<string | null>(null)
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [patientTreatments, setPatientTreatments] = useState<any[]>([])
  const [treatmentGroups, setTreatmentGroups] = useState<any[]>([])
  const [patientPayments, setPatientPayments] = useState<any[]>([])
  const [patientInfo, setPatientInfo] = useState<Patient | null>(null)

  const [patientProfileId, setPatientProfileId] = useState<string | null>(null)
  const [patientProfileData, setPatientProfileData] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    if (patientProfileId) {
      setProfileLoading(true)
      fetch(`/api/dental/patients/${patientProfileId}/profile`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) setPatientProfileData(data)
          setProfileLoading(false)
        })
        .catch(err => {
          console.error(err)
          setProfileLoading(false)
        })
    } else {
      setPatientProfileData(null)
    }
  }, [patientProfileId])

  useEffect(() => {
    if (panelOpen && selectedEvent) {
      const allTreatments = [
        ...(patientTreatments || []),
        ...(treatmentGroups || []).flatMap((g: any) => g.treatments || [])
      ];
      const linkedTreatment = allTreatments.find((t: any) => t.sessions?.some((s: any) => s.appointmentId === selectedEvent.id));
      if (linkedTreatment) {
        const timer = setTimeout(() => {
          const el = document.getElementById(`treatment-${linkedTreatment.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.transition = 'all 0.4s ease';
            el.style.boxShadow = '0 0 16px rgba(59, 130, 246, 0.6)';
            setTimeout(() => {
              if (el) el.style.boxShadow = 'none';
            }, 1500);
          }
        }, 250);
        return () => clearTimeout(timer);
      }
    }
  }, [panelOpen, selectedEvent?.id, patientTreatments?.length, treatmentGroups?.length])

  const focusAppointmentOnCalendar = (eventId: string, startTime: string, openPanel = true) => {
    try {
      const eventDate = new Date(startTime).toLocaleDateString('sv');
      setCurrentDate(eventDate);
      if (view === 'month') {
        setView('day');
      }
      
      const targetEvt = events.find(ev => ev.id === eventId);
      if (targetEvt) {
        setSelectedEvent(targetEvt);
        if (targetEvt.doctorId) {
          setSelectedDoctorIds(prev => prev.includes(targetEvt.doctorId!) ? prev : [...prev, targetEvt.doctorId!]);
        }
      }

      if (openPanel && targetEvt) {
        setPanelOpen(true);
      }

      let attempts = 0;
      const maxAttempts = 15;
      const interval = setInterval(() => {
        attempts++;
        const el = document.getElementById(`cal-event-${eventId}`);
        if (el) {
          clearInterval(interval);
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          el.classList.add('pulse-highlight-cal');
          setTimeout(() => el.classList.remove('pulse-highlight-cal'), 3200);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
        }
      }, 70);
    } catch (e) {
      console.error(e);
    }
  };

  const parseDateFromString = (str: string): string | null => {
    if (!str) return null;
    const matchTR = str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (matchTR) {
      const [, d, m, y] = matchTR;
      return `${y}-${m}-${d}`;
    }
    const matchISO = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (matchISO) {
      return matchISO[0];
    }
    return null;
  };

  const handleTreatmentCardClick = (t: any, g?: any) => {
    const apptTime = t?.sessions?.[0]?.startTime || t?.plannedDate;

    // 1. If has sessions/appointment, match valid event from events list
    if (t?.sessions && t.sessions.length > 0) {
      const sessionWithAppt = t.sessions.find((s: any) => s.appointmentId && events.some(ev => ev.id === s.appointmentId)) || t.sessions[0];
      if (sessionWithAppt?.appointmentId && sessionWithAppt?.startTime) {
        focusAppointmentOnCalendar(sessionWithAppt.appointmentId, sessionWithAppt.startTime);
        import('react-hot-toast').then(mod =>
          mod.toast.success(`📅 ${new Date(sessionWithAppt.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} randevusuna gidildi`)
        );
        return;
      }
    }

    // 2. If apptTime exists (e.g. plannedDate or session startTime)
    if (apptTime) {
      const targetTimeMs = new Date(apptTime).getTime();
      const targetDateStr = new Date(apptTime).toLocaleDateString('sv');
      setCurrentDate(targetDateStr);

      // Find all appointments for this patient on this day
      const patientEvtsOnDate = events.filter(ev => 
        (ev.patientId === selectedEvent?.patientId || (selectedEvent?.title && ev.title?.includes(selectedEvent.title.split(' - ')[0]))) && 
        new Date(ev.startTime).toLocaleDateString('sv') === targetDateStr
      );

      if (patientEvtsOnDate.length > 0) {
        // Sort by closest start time to apptTime so 14:30 matches the 14:30 event, not 11:30!
        patientEvtsOnDate.sort((a, b) => 
          Math.abs(new Date(a.startTime).getTime() - targetTimeMs) - 
          Math.abs(new Date(b.startTime).getTime() - targetTimeMs)
        );
        const bestMatch = patientEvtsOnDate[0];
        focusAppointmentOnCalendar(bestMatch.id, bestMatch.startTime);
        import('react-hot-toast').then(mod =>
          mod.toast.success(`📅 ${new Date(bestMatch.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} randevusuna gidildi`)
        );
        return;
      }
    }

    // 3. Fallback: Parse date from group name (e.g., "Tedavi Planı - 28.08.2026")
    let targetDate = g?.name ? parseDateFromString(g.name) : null;
    if (!targetDate && t?.procedureName) targetDate = parseDateFromString(t.procedureName);
    if (!targetDate && t?.createdAt) targetDate = new Date(t.createdAt).toLocaleDateString('sv');

    if (targetDate) {
      setCurrentDate(targetDate);
      const patientEvtOnDate = events.find(ev => 
        (ev.patientId === selectedEvent?.patientId || (selectedEvent?.title && ev.title?.includes(selectedEvent.title.split(' - ')[0]))) && 
        new Date(ev.startTime).toLocaleDateString('sv') === targetDate
      );
      if (patientEvtOnDate) {
        focusAppointmentOnCalendar(patientEvtOnDate.id, patientEvtOnDate.startTime);
        import('react-hot-toast').then(mod =>
          mod.toast.success(`📅 ${new Date(targetDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihindeki randevuya gidildi`)
        );
      } else {
        import('react-hot-toast').then(mod =>
          mod.toast(`📅 Takvim ${new Date(targetDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine yönlendirildi.`, { icon: '📅' })
        );
      }
    }
  };

  const handleGroupHeaderClick = (g: any) => {
    const targetDate = parseDateFromString(g?.name || '');
    if (targetDate) {
      setCurrentDate(targetDate);
      const patientEvtOnDate = events.find(ev => 
        (ev.patientId === selectedEvent?.patientId || (selectedEvent?.title && ev.title?.includes(selectedEvent.title.split(' - ')[0]))) && 
        new Date(ev.startTime).toLocaleDateString('sv') === targetDate
      );
      if (patientEvtOnDate) {
        focusAppointmentOnCalendar(patientEvtOnDate.id, patientEvtOnDate.startTime);
        import('react-hot-toast').then(mod =>
          mod.toast.success(`📁 ${g.name} plan tarihindeki randevuya gidildi`)
        );
      } else {
        import('react-hot-toast').then(mod =>
          mod.toast(`📁 Takvim ${g.name} tarihine yönlendirildi.`, { icon: '📅' })
        );
      }
    }
  };

  // Fast Schedule Treatment State
  const [fastScheduleTreatment, setFastScheduleTreatment] = useState<any>(null)
  const [fsDate, setFsDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
  })
  const [fsTime, setFsTime] = useState('10:00')

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
  const [patients, setPatients] = useState<any[]>([])

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

    if (docs) {
      setDoctors(docs)
      if (!initializedDocsRef.current && docs.length > 0) {
        setSelectedDoctorIds(docs.map((d: any) => d.id))
        initializedDocsRef.current = true
      }
    }
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
      setEventContextMenu(null);
    }

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      // Don't close if scrolling INSIDE the context menu itself
      if (target.closest && target.closest('.context-menu-container')) return;
      setShiftContextMenu(null);
      setEventContextMenu(null);
    }

    const handleClearDraft = () => {
      window.dispatchEvent(new Event('clear-calendar-draft'));
    }

    const closeAll = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShiftContextMenu(null)
        setEventContextMenu(null)
        setQuickCreateMenu(null)
        handleClearDraft()
      }
    }

    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', closeAll);
    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', closeAll);
    }
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
      fetch(`/api/dental/patients/${event.patientId}/treatments`).then(r => r.ok ? r.json() : { treatments: [], groups: [] }).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); }).catch(() => { })
      fetch(`/api/dental/patients/${event.patientId}/payments`).then(r => r.ok ? r.json() : []).then(setPatientPayments).catch(() => { })
    }
    const docQuery = event.doctorId ? `?doctorId=${event.doctorId}` : ''

  }

  const handleDeleteEvent = () => {
    if (!selectedEvent) return;
    setConfirmModal({
      isOpen: true,
      title: 'Randevuyu Sil',
      message: `"${selectedEvent.title}" randevusunu silmek istediğinizden emin misiniz? Randevuya bağlı tedavi planları korunacaktır.`,
      confirmText: 'Evet, Sil',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await fetch(`/api/dental/appointments/${selectedEvent.id}`, { method: 'DELETE' });
          setPanelOpen(false);
          setSelectedEvent(null);
          fetchData();
        } catch { }
      }
    });
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

  const searchResults = useMemo(() => {
    const q = patientSearchQuery.trim().toLowerCase();
    if (q.length < 1) return [];

    const personMap = new Map<string, {
      name: string;
      phone: string | null;
      patientIds: Set<string>;
      appointments: CalendarEvent[];
    }>();

    // 1. Scan patients
    patients.forEach((p: any) => {
      if (!p?.name) return;
      const cleanName = p.name.trim();
      const normalizedName = cleanName.toLowerCase();
      const pPhone = p.phone?.trim() || null;
      const key = `${normalizedName}_${pPhone || ''}`;

      if (!personMap.has(key)) {
        personMap.set(key, {
          name: cleanName,
          phone: pPhone,
          patientIds: new Set(p.id ? [p.id] : []),
          appointments: []
        });
      } else {
        const existing = personMap.get(key)!;
        if (p.id) existing.patientIds.add(p.id);
        if (!existing.phone && pPhone) existing.phone = pPhone;
      }
    });

    // 2. Associate appointments
    events.forEach(ev => {
      if (!ev) return;
      let matchedPersonKey: string | null = null;

      // Match by patientId
      if (ev.patientId) {
        for (const [key, person] of personMap.entries()) {
          if (person.patientIds.has(ev.patientId)) {
            matchedPersonKey = key;
            break;
          }
        }
      }

      // Match by title
      if (!matchedPersonKey && ev.title) {
        const titleLower = ev.title.toLowerCase();
        for (const [key, person] of personMap.entries()) {
          if (titleLower.includes(person.name.toLowerCase())) {
            matchedPersonKey = key;
            break;
          }
        }
      }

      // Extract name if not found
      if (!matchedPersonKey && ev.title) {
        const candidateName = ev.title.split(' - ')[0].trim();
        if (candidateName.length >= 2) {
          const key = `${candidateName.toLowerCase()}_`;
          if (!personMap.has(key)) {
            personMap.set(key, {
              name: candidateName,
              phone: null,
              patientIds: new Set(ev.patientId ? [ev.patientId] : []),
              appointments: []
            });
          }
          matchedPersonKey = key;
        }
      }

      if (matchedPersonKey && personMap.has(matchedPersonKey)) {
        const person = personMap.get(matchedPersonKey)!;
        if (!person.appointments.some(a => a.id === ev.id)) {
          person.appointments.push(ev);
        }
      }
    });

    // 3. Filter by search query
    const results = Array.from(personMap.values()).filter(person => {
      const nameMatch = person.name.toLowerCase().includes(q);
      const phoneMatch = person.phone ? person.phone.includes(q) : false;
      const apptMatch = person.appointments.some(a => a.title?.toLowerCase().includes(q));
      return nameMatch || phoneMatch || apptMatch;
    });

    // 4. Sort appointments inside each person descending by start time
    results.forEach(p => {
      p.appointments.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    });

    return results.slice(0, 15);
  }, [patients, events, patientSearchQuery]);

  const filteredEvents = patientSearchQuery
    ? events.filter(e => e.title?.toLowerCase().includes(patientSearchQuery.toLowerCase()))
    : events;

  return (
    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', width: '100%', maxWidth: '1200px', margin: '0 auto', position: 'relative', alignItems: 'flex-start' }}>
      <style>{`
        @keyframes pulseCalGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.8), 0 0 15px rgba(59, 130, 246, 0.6);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(59, 130, 246, 0), 0 0 25px rgba(59, 130, 246, 0.9);
            transform: scale(1.03);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0), 0 0 15px rgba(59, 130, 246, 0.4);
            transform: scale(1);
          }
        }
        .pulse-highlight-cal {
          animation: pulseCalGlow 0.9s ease-in-out infinite alternate !important;
          z-index: 9999 !important;
          outline: 2.5px solid #3b82f6 !important;
          outline-offset: 1px !important;
        }
      `}</style>
      {/* Left Sidebar */}
      <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button 
            onClick={() => { setView('day'); setCurrentDate(new Date().toISOString().slice(0, 10)); }} 
            style={{ padding: '6px 16px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--input-border)', borderRadius: 8, background: 'var(--input-bg)', color: 'var(--foreground)', cursor: 'pointer', flex: 1 }}>
            Bugün
          </button>
        </div>

        <MiniCalendar currentDate={currentDate} onDateSelect={setCurrentDate} />

        <div style={{ position: 'relative', zIndex: 100 }}>
          <div style={{
            background: 'var(--input-bg)',
            padding: '9px 12px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--input-border)'
          }}>
            <Users size={18} color="var(--foreground-3)" />
            <input
              type="text"
              placeholder="Kişi arayın"
              value={patientSearchQuery}
              onChange={(e) => {
                setPatientSearchQuery(e.target.value);
                setShowPatientSearchDropdown(true);
              }}
              onFocus={() => setShowPatientSearchDropdown(true)}
              onBlur={() => setTimeout(() => setShowPatientSearchDropdown(false), 250)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                width: '100%',
                fontSize: '0.9rem',
                color: 'var(--foreground)'
              }}
              autoComplete="off"
            />
            {patientSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setPatientSearchQuery('');
                  setShowPatientSearchDropdown(false);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
              >
                <X size={15} />
              </button>
            )}
          </div>
          {showPatientSearchDropdown && patientSearchQuery.trim().length >= 1 && (
            <div 
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: 'absolute',
                top: '100%',
                marginTop: '8px',
                left: 0,
                width: '320px',
                zIndex: 1000,
                background: 'var(--card-bg, #0f172a)',
                border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
                borderRadius: '12px',
                boxShadow: '0 16px 40px -10px rgba(0,0,0,0.6), 0 0 0 1px var(--glass-border, rgba(255,255,255,0.08))',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                maxHeight: '400px',
                overflowY: 'auto',
                padding: '6px'
              }}
            >
              {searchResults.length > 0 ? (
                searchResults.map((person, idx) => (
                  <div
                    key={`${person.name}_${idx}`}
                    style={{
                      marginBottom: '8px',
                      paddingBottom: '8px',
                      borderBottom: idx === searchResults.length - 1 ? 'none' : '1px solid var(--divider, rgba(255,255,255,0.06))'
                    }}
                  >
                    {/* Person Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {person.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--foreground)' }}>
                            {person.name}
                          </div>
                          {person.phone && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)' }}>
                              📞 {person.phone}
                            </div>
                          )}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: person.appointments.length > 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                        color: person.appointments.length > 0 ? '#60a5fa' : 'var(--foreground-3)'
                      }}>
                        {person.appointments.length} Randevu
                      </span>
                    </div>

                    {/* Appointments List for this person */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', paddingLeft: '4px' }}>
                      {person.appointments.length > 0 ? (
                        person.appointments.map((appt) => {
                          const doc = doctors.find(d => d.id === appt.doctorId);
                          const apptDate = new Date(appt.startTime);
                          const isInvalidDate = isNaN(apptDate.getTime());
                          const dateStr = isInvalidDate ? '' : apptDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' });
                          const timeStr = isInvalidDate ? '' : `${apptDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - ${new Date(appt.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

                          return (
                            <div
                              key={appt.id}
                              onClick={() => {
                                focusAppointmentOnCalendar(appt.id, appt.startTime, true);
                                setShowPatientSearchDropdown(false);
                                setPatientSearchQuery(person.name);
                                import('react-hot-toast').then(mod =>
                                  mod.toast.success(`📅 ${person.name} (${dateStr} ${timeStr}) randevusuna gidildi`)
                                );
                              }}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '8px',
                                background: 'var(--input-bg, rgba(255,255,255,0.04))',
                                border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '3px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.15)';
                                e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--input-bg, rgba(255,255,255,0.04))';
                                e.currentTarget.style.borderColor = 'var(--glass-border, rgba(255,255,255,0.08))';
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>📅</span> {dateStr}
                                </span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>
                                  {timeStr}
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--foreground-3)' }}>
                                <span>{doc ? `Dr. ${doc.name}` : 'Doktor Atanmadı'}</span>
                                <span style={{ color: 'var(--foreground-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                                  {appt.title?.includes(' - ') ? appt.title.split(' - ')[1] : (appt.title || 'Randevu')}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', padding: '4px 8px', fontStyle: 'italic' }}>
                          Kayıtlı randevusu bulunmuyor
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '16px', fontSize: '0.82rem', color: 'var(--foreground-3)', textAlign: 'center' }}>
                  "{patientSearchQuery}" ile eşleşen kişi bulunamadı
                </div>
              )}
            </div>
          )}
        </div>

        {/* Takvimlerim (Doctor Filter) */}
        <div style={{ marginTop: 8, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>Hekimlerim</h4>
            <button
              onClick={() => {
                if (selectedDoctorIds.length === doctors.length) {
                  setSelectedDoctorIds([]) // clear all
                } else {
                  setSelectedDoctorIds(doctors.map(d => d.id)) // select all
                }
              }}
              style={{ background: 'transparent', border: 'none', fontSize: '0.75rem', color: 'var(--brand)', cursor: 'pointer', fontWeight: 500 }}
            >
              {selectedDoctorIds.length === doctors.length ? 'Temizle' : 'Tümünü Seç'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {doctors.map(doc => {
              const isSelected = selectedDoctorIds.includes(doc.id);
              return (
                <label
                  key={doc.id}
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedDoctorIds(prev =>
                      prev.includes(doc.id)
                        ? prev.filter(id => id !== doc.id)
                        : [...prev, doc.id]
                    );
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: 'var(--foreground)',
                    userSelect: 'none'
                  }}
                >
                  <div style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: `2px solid ${doc.color || 'var(--brand, #3b82f6)'}`,
                    background: isSelected ? (doc.color || 'var(--brand, #3b82f6)') : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </div>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Günlük Randevu Takvimi
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
              className="btn btn-primary"
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem' }}
              onClick={() => {
                setPatientPanelOpen(true)
                setPanelOpen(false)
              }}
            >
              <Users size={16} /> Hastalar
            </button>
            <button
              onClick={() => {
                const now = new Date()
                const t1 = `${now.getHours().toString().padStart(2, '0')}:00`
                const t2 = `${(now.getHours() + 1).toString().padStart(2, '0')}:00`
                setQuickCreateMenu({ 
                  start: `${currentDate}T${t1}:00+03:00`, 
                  end: `${currentDate}T${t2}:00+03:00`, 
                  doctorId: null, 
                  x: 0, 
                  y: 0, 
                  isCentered: true 
                })
              }}
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


        <DentalCalendar
          doctors={doctors.filter(d => selectedDoctorIds.includes(d.id))}
          events={filteredEvents.filter(ev => !ev.doctorId || selectedDoctorIds.includes(ev.doctorId))}
          shifts={shifts}
          currentDate={currentDate}
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
          onEmptySlotSelect={(start, end, doctorId, x, y) => {
            setQuickCreateMenu({ start, end, doctorId, x, y })
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
          onEventClick={handleEventClick}
          view={view}
        />
      </div>

      {/* Backdrop for click outside (shared) */}
      {(panelOpen || patientProfileId) && (
          <div
            onClick={() => { setPanelOpen(false); setPatientProfileId(null); }}
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: showTedaviForm ? 'none' : 'block' }}
          />
      )}

        {/* Left Panel — Patient Profile */}
        {patientProfileId && (
            <div
              style={{
                position: 'fixed', top: 0, left: 0, bottom: 0, width: '100%', maxWidth: '500px',
                backgroundColor: 'var(--card-bg)', borderRight: '1px solid var(--divider)',
                zIndex: 9999, padding: '24px', overflowY: 'auto',
                boxShadow: '4px 0 20px rgba(0,0,0,0.19)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Hasta Detayı</h3>
                <button onClick={() => setPatientProfileId(null)} style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', fontSize: '1.25rem', cursor: 'pointer' }}>✕</button>
              </div>

              {profileLoading ? (
                 <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-3)' }}>Profil yükleniyor...</div>
              ) : patientProfileData ? (
                 <PatientProfileCard profile={patientProfileData} />
              ) : (
                 <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>Profil yüklenemedi.</div>
              )}
            </div>
        )}

        {/* Right Panel — Event Detail */}
        {panelOpen && selectedEvent && (
          <>
            <div
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '380px',
                backgroundColor: 'var(--card-bg)', borderLeft: '1px solid var(--divider)',
                zIndex: 9999, padding: '24px', overflowY: 'auto',
                boxShadow: '-4px 0 20px rgba(0,0,0,0.19)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Randevu Detayı</h3>
                <button onClick={() => setPanelOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', fontSize: '1.25rem', cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* ── Hasta Bilgisi ── */}
                <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hasta Bilgisi</div>
                    {patientInfo && (
                       <button 
                         onClick={(e) => {
                           e.preventDefault();
                           setPatientProfileId(patientInfo.id);
                         }} 
                         style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.65rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                       >
                         Profile Git ↗
                       </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>{patientInfo?.name || selectedEvent.title.split(' - ')[0]}</div>
                  {patientInfo?.phone && <div style={{ fontSize: '0.75rem', color: 'var(--foreground-2)', marginTop: 2 }}>📞 {patientInfo.phone}</div>}
                </div>

                {/* ── Doktor Atanmadı Uyarısı ── */}
                {!selectedEvent.doctorId && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245, 158, 11, 0.14)', border: '1.5px solid #f59e0b', color: '#f59e0b', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 2px 10px rgba(245, 158, 11, 0.15)' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                    <div>
                      <div>Doktor Atanmadı!</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--foreground-2)', marginTop: 2 }}>Bu randevuyu gerçekleştirecek hekimi lütfen aşağıdan seçiniz.</div>
                    </div>
                  </div>
                )}

                {/* ── Randevu Bilgisi ── */}
                <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Randevu Bilgisi</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: !selectedEvent.doctorId ? '#f59e0b' : 'var(--foreground-3)', marginBottom: 2, fontWeight: !selectedEvent.doctorId ? 700 : 500 }}>
                        {!selectedEvent.doctorId ? '⚠️ Doktor (Atanmadı)' : 'Doktor'}
                      </div>
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
                        style={{
                          width: '100%',
                          fontSize: '0.8rem',
                          padding: '4px 6px',
                          borderRadius: 6,
                          border: !selectedEvent.doctorId ? '1.5px solid #f59e0b' : '1px solid var(--glass-border)',
                          background: !selectedEvent.doctorId ? 'rgba(245, 158, 11, 0.08)' : 'var(--background)',
                          color: !selectedEvent.doctorId ? '#f59e0b' : 'var(--foreground)',
                          fontWeight: !selectedEvent.doctorId ? 700 : 500
                        }}
                      >
                        <option value="">⚠️ Doktor Seçiniz (Atanmamış)</option>
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
                  {/* ── UNIFIED TEDAVİ PLANI & GRUPLARI ── */}
                  {patientTreatments.filter((t: any) => t.status !== 'completed').length === 0 ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', padding: '14px', background: 'rgba(255,255,255,0.015)', borderRadius: 8, textAlign: 'center', border: '1px dashed var(--glass-border)' }}>
                      Hastaya ait aktif tedavi planı bulunmuyor.<br />
                      Yukarıdaki <strong style={{ color: 'var(--brand)' }}>"+ Tedavi Ekle"</strong> butonundan yeni tedavi planı oluşturabilirsiniz.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {Array.isArray(treatmentGroups) && treatmentGroups.map((g: any) => {
                        const groupTreatments = patientTreatments.filter((t: any) => t.status !== 'completed' && t.groupId === g.id);
                        if (groupTreatments.length === 0) return null;
                        return (
                          <div key={g.id} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
                            <div 
                              onClick={() => handleGroupHeaderClick(g)}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'all 0.15s ease' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.2)'}
                              title="Takvimde bu plan tarihine git"
                            >
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>📁</span>
                                <span>{g.name}</span>
                                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: 'var(--foreground-2)' }}>
                                  {groupTreatments.length}
                                </span>
                              </span>
                              <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditingGroup({ ...g, treatments: patientTreatments.filter((t: any) => t.groupId === g.id) });
                                    setShowTedaviForm(true);
                                  }}
                                  style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.7rem' }}
                                  title="Düzenle"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setConfirmModal({
                                      isOpen: true,
                                      title: 'Tedavi Grubunu Sil',
                                      message: `"${g.name}" tedavi grubunun ve içindeki tüm işlemlerin silinmesini onaylıyor musunuz?`,
                                      confirmText: 'Evet, Sil',
                                      variant: 'danger',
                                      onConfirm: async () => {
                                        await fetch(`/api/dental/treatment-groups/${g.id}`, { method: 'DELETE' });
                                        fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); });
                                      }
                                    });
                                  }}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem' }}
                                  title="Sil"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                            <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {groupTreatments.map((t: any) => {
                                const apptTime = t.sessions?.[0]?.startTime || t.plannedDate;
                                return (
                                  <div 
                                    id={`treatment-${t.id}`} 
                                    key={t.id} 
                                    onClick={() => handleTreatmentCardClick(t, g)}
                                    style={{ 
                                      display: 'flex', 
                                      flexDirection: 'column',
                                      gap: 8, 
                                      padding: '10px 11px', 
                                      borderRadius: 8, 
                                      background: 'rgba(255,255,255,0.03)', 
                                      border: '1px solid var(--glass-border)', 
                                      fontSize: '0.75rem', 
                                      cursor: 'pointer', 
                                      transition: 'all 0.15s ease',
                                      boxSizing: 'border-box'
                                    }}
                                    onMouseEnter={e => {
                                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)';
                                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.35)';
                                    }}
                                    onMouseLeave={e => {
                                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                      e.currentTarget.style.borderColor = 'var(--glass-border)';
                                    }}
                                    title="Takvimde bu tedavi / randevu tarihine git"
                                  >
                                    {/* 1. Satır: Diş No + Tedavi Adı + Sil Butonu */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                        {t.toothNumber && (
                                          <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 700, fontSize: '0.72rem', flexShrink: 0 }}>
                                            #{t.toothNumber}
                                          </span>
                                        )}
                                        <span style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.procedureName}>
                                          {t.procedureName}
                                        </span>
                                        {t.dcmUrl && (
                                          <button onClick={(e) => { e.stopPropagation(); setSelectedDcmUrl(process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}${t.dcmUrl}` : `http://localhost:3001${t.dcmUrl}`); }} style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: 4, border: '1px solid #3b82f6', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', cursor: 'pointer', flexShrink: 0 }}>
                                            Röntgen
                                          </button>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setConfirmModal({
                                            isOpen: true,
                                            title: 'İşlemi Sil',
                                            message: `"${t.procedureName}" işlemini silmek istediğinize emin misiniz?`,
                                            confirmText: 'Evet, Sil',
                                            variant: 'danger',
                                            onConfirm: async () => {
                                              await fetch(`/api/dental/treatments/${t.id}`, { method: 'DELETE' });
                                              fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); });
                                            }
                                          });
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: '0.75rem', opacity: 0.7, flexShrink: 0 }}
                                        title="Sil"
                                      >
                                        🗑️
                                      </button>
                                    </div>

                                    {/* 2. Satır: Durum ve Doktor (Yan yana 2 eşit sütunlu Grid) */}
                                    <div onClick={e => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                      <select 
                                        defaultValue={t.status} 
                                        onChange={(e) => {
                                          fetch(`/api/dental/treatments/${t.id}`, {
                                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ status: e.target.value })
                                          }).then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); })).catch(() => { })
                                        }} 
                                        style={{ width: '100%', fontSize: '0.7rem', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground-2)', cursor: 'pointer', outline: 'none', boxSizing: 'border-box' }}
                                      >
                                        <option value="planned">Planlandı</option>
                                        <option value="in_progress">Devam Ediyor</option>
                                        <option value="completed">Yapıldı ✓</option>
                                      </select>

                                      <select 
                                         value={t.doctorId || ''} 
                                         onChange={(e) => {
                                           const newDocId = e.target.value || null;
                                           const targetApptTime = apptTime || selectedEvent?.startTime;
                                           if (newDocId && targetApptTime) {
                                             const apptDateStr = new Date(targetApptTime).toLocaleDateString('sv');
                                             const docShifts = (shifts || []).filter((s: any) => s.userId === newDocId && s.date === apptDateStr);
                                             const docObj = doctors.find((d: any) => d.id === newDocId);
                                             const docName = docObj?.name || 'Hekim';

                                             if (docShifts.length === 0) {
                                               e.target.value = t.doctorId || '';
                                               import('react-hot-toast').then(mod => mod.toast.error(`⚠️ ${docName} için bu tarihte (${apptDateStr}) vardiya bulunmuyor!`));
                                               return;
                                             }

                                             const startMin = new Date(targetApptTime).getHours() * 60 + new Date(targetApptTime).getMinutes();
                                             const isCovered = docShifts.some((s: any) => {
                                               const [sH, sM] = (s.startTime || '00:00').split(':').map(Number);
                                               const [eH, eM] = (s.endTime || '23:59').split(':').map(Number);
                                               return startMin >= (sH * 60 + (sM || 0)) && startMin <= (eH * 60 + (eM || 0));
                                             });

                                             if (!isCovered) {
                                               e.target.value = t.doctorId || '';
                                               const shiftRanges = docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ');
                                               import('react-hot-toast').then(mod => mod.toast.error(`⚠️ Randevu saati ${docName} vardiyası (${shiftRanges}) dışındadır!`));
                                               return;
                                             }
                                           }

                                           fetch(`/api/dental/treatments/${t.id}`, {
                                             method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                             body: JSON.stringify({ doctorId: newDocId })
                                           }).then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); })).catch(() => { })
                                         }} 
                                         style={{ width: '100%', fontSize: '0.7rem', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: t.doctorId ? 'var(--foreground-2)' : '#f59e0b', cursor: 'pointer', outline: 'none', boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                       >
                                         <option value="">👤 Doktor Seç</option>
                                         {doctors.map((d: any) => {
                                           const targetApptTime = apptTime || selectedEvent?.startTime;
                                           const apptDateStr = targetApptTime ? new Date(targetApptTime).toLocaleDateString('sv') : '';
                                           const docShifts = (shifts || []).filter((s: any) => s.userId === d.id && s.date === apptDateStr);
                                           const hasShift = docShifts.length > 0;
                                           const shiftText = hasShift ? `(🟢 ${docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ')})` : (apptDateStr ? `(Vardiya Yok ⚠️)` : '');
                                           return (
                                             <option 
                                               key={d.id} 
                                               value={d.id} 
                                               disabled={apptDateStr ? !hasShift : false}
                                               style={{ color: !hasShift && apptDateStr ? '#ef4444' : 'inherit' }}
                                             >
                                               {d.name} {shiftText}
                                             </option>
                                           );
                                         })}
                                       </select>
                                    </div>

                                    {/* 3. Satır: Tarih / Randevu Butonu (Tam Genişlikte) */}
                                    <div onClick={e => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setFastScheduleTreatment(t);
                                        }}
                                        style={{
                                          width: '100%',
                                          background: apptTime ? 'rgba(34, 197, 94, 0.08)' : 'rgba(59, 130, 246, 0.06)',
                                          border: apptTime ? '1px solid rgba(34, 197, 94, 0.3)' : '1px dashed rgba(59, 130, 246, 0.3)',
                                          color: apptTime ? '#22c55e' : '#60a5fa',
                                          borderRadius: 6,
                                          cursor: 'pointer',
                                          padding: '5px 8px',
                                          fontSize: '0.7rem',
                                          fontWeight: 600,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          transition: 'all 0.15s ease',
                                          boxSizing: 'border-box'
                                        }}
                                        onMouseEnter={e => {
                                          e.currentTarget.style.background = apptTime ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.12)';
                                        }}
                                        onMouseLeave={e => {
                                          e.currentTarget.style.background = apptTime ? 'rgba(34, 197, 94, 0.08)' : 'rgba(59, 130, 246, 0.06)';
                                        }}
                                        title="Tarih / Saat Belirle veya Değiştir"
                                      >
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                          <span>📅</span>
                                          <span>{apptTime ? new Date(apptTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Tarih / Randevu Belirle'}</span>
                                        </span>
                                        <span style={{ fontSize: '0.65rem', opacity: 0.85 }}>{apptTime ? 'Değiştir ↗' : '+ Planla'}</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {/* Ungrouped treatments if any */}
                      {patientTreatments.filter((t: any) => t.status !== 'completed' && !t.groupId).map((t: any) => {
                        const apptTime = t.sessions?.[0]?.startTime || t.plannedDate;
                        return (
                          <div 
                            id={`treatment-${t.id}`} 
                            key={t.id} 
                            onClick={() => handleTreatmentCardClick(t)}
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column',
                              gap: 8, 
                              padding: '10px 11px', 
                              borderRadius: 8, 
                              background: 'rgba(255,255,255,0.03)', 
                              border: '1px solid var(--glass-border)', 
                              fontSize: '0.75rem', 
                              cursor: 'pointer', 
                              transition: 'all 0.15s ease',
                              boxSizing: 'border-box'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)';
                              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.35)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                              e.currentTarget.style.borderColor = 'var(--glass-border)';
                            }}
                            title="Takvimde bu tedavi / randevu tarihine git"
                          >
                            {/* 1. Satır: Diş No + Tedavi Adı + Sil Butonu */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                {t.toothNumber && (
                                  <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 700, fontSize: '0.72rem', flexShrink: 0 }}>
                                    #{t.toothNumber}
                                  </span>
                                )}
                                <span style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.procedureName}>
                                  {t.procedureName}
                                </span>
                                {t.dcmUrl && (
                                  <button onClick={(e) => { e.stopPropagation(); setSelectedDcmUrl(process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}${t.dcmUrl}` : `http://localhost:3001${t.dcmUrl}`); }} style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: 4, border: '1px solid #3b82f6', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', cursor: 'pointer', flexShrink: 0 }}>
                                    Röntgen
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setConfirmModal({
                                    isOpen: true,
                                    title: 'İşlemi Sil',
                                    message: `"${t.procedureName}" işlemini silmek istediğinize emin misiniz?`,
                                    confirmText: 'Evet, Sil',
                                    variant: 'danger',
                                    onConfirm: async () => {
                                      await fetch(`/api/dental/treatments/${t.id}`, { method: 'DELETE' });
                                      fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); });
                                    }
                                  });
                                }}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: '0.75rem', opacity: 0.7, flexShrink: 0 }}
                                title="Sil"
                              >
                                🗑️
                              </button>
                            </div>

                            {/* 2. Satır: Durum ve Doktor (Yan yana 2 eşit sütunlu Grid) */}
                            <div onClick={e => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                              <select 
                                defaultValue={t.status} 
                                onChange={(e) => {
                                  fetch(`/api/dental/treatments/${t.id}`, {
                                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ status: e.target.value })
                                  }).then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); })).catch(() => { })
                                }} 
                                style={{ width: '100%', fontSize: '0.7rem', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground-2)', cursor: 'pointer', outline: 'none', boxSizing: 'border-box' }}
                              >
                                <option value="planned">Planlandı</option>
                                <option value="in_progress">Devam Ediyor</option>
                                <option value="completed">Yapıldı ✓</option>
                              </select>

                              <select 
                                value={t.doctorId || ''} 
                                onChange={(e) => {
                                  const newDocId = e.target.value || null;
                                  const targetApptTime = apptTime || selectedEvent?.startTime;
                                  if (newDocId && targetApptTime) {
                                    const apptDateStr = new Date(targetApptTime).toLocaleDateString('sv');
                                    const docShifts = (shifts || []).filter((s: any) => s.userId === newDocId && s.date === apptDateStr);
                                    const docObj = doctors.find((d: any) => d.id === newDocId);
                                    const docName = docObj?.name || 'Hekim';

                                    if (docShifts.length === 0) {
                                      e.target.value = t.doctorId || '';
                                      import('react-hot-toast').then(mod => mod.toast.error(`⚠️ ${docName} için bu tarihte (${apptDateStr}) vardiya bulunmuyor!`));
                                      return;
                                    }

                                    const startMin = new Date(targetApptTime).getHours() * 60 + new Date(targetApptTime).getMinutes();
                                    const isCovered = docShifts.some((s: any) => {
                                      const [sH, sM] = (s.startTime || '00:00').split(':').map(Number);
                                      const [eH, eM] = (s.endTime || '23:59').split(':').map(Number);
                                      return startMin >= (sH * 60 + (sM || 0)) && startMin <= (eH * 60 + (eM || 0));
                                    });

                                    if (!isCovered) {
                                      e.target.value = t.doctorId || '';
                                      const shiftRanges = docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ');
                                      import('react-hot-toast').then(mod => mod.toast.error(`⚠️ Randevu saati ${docName} vardiyası (${shiftRanges}) dışındadır!`));
                                      return;
                                    }
                                  }

                                  fetch(`/api/dental/treatments/${t.id}`, {
                                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ doctorId: newDocId })
                                  }).then(() => fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`).then(r => r.json()).then(d => { setPatientTreatments(d?.treatments || []); setTreatmentGroups(d?.groups || []); })).catch(() => { })
                                }} 
                                style={{ width: '100%', fontSize: '0.7rem', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: t.doctorId ? 'var(--foreground-2)' : '#f59e0b', cursor: 'pointer', outline: 'none', boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis' }}
                              >
                                <option value="">👤 Doktor Seç</option>
                                {doctors.map((d: any) => {
                                  const targetApptTime = apptTime || selectedEvent?.startTime;
                                  const apptDateStr = targetApptTime ? new Date(targetApptTime).toLocaleDateString('sv') : '';
                                  const docShifts = (shifts || []).filter((s: any) => s.userId === d.id && s.date === apptDateStr);
                                  const hasShift = docShifts.length > 0;
                                  const shiftText = hasShift ? `(🟢 ${docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ')})` : (apptDateStr ? `(Vardiya Yok ⚠️)` : '');
                                  return (
                                    <option 
                                      key={d.id} 
                                      value={d.id} 
                                      disabled={apptDateStr ? !hasShift : false}
                                      style={{ color: !hasShift && apptDateStr ? '#ef4444' : 'inherit' }}
                                    >
                                      {d.name} {shiftText}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            {/* 3. Satır: Tarih / Randevu Butonu (Tam Genişlikte) */}
                            <div onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setFastScheduleTreatment(t);
                                }}
                                style={{
                                  width: '100%',
                                  background: apptTime ? 'rgba(34, 197, 94, 0.08)' : 'rgba(59, 130, 246, 0.06)',
                                  border: apptTime ? '1px solid rgba(34, 197, 94, 0.3)' : '1px dashed rgba(59, 130, 246, 0.3)',
                                  color: apptTime ? '#22c55e' : '#60a5fa',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  padding: '5px 8px',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  transition: 'all 0.15s ease',
                                  boxSizing: 'border-box'
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.background = apptTime ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.12)';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.background = apptTime ? 'rgba(34, 197, 94, 0.08)' : 'rgba(59, 130, 246, 0.06)';
                                }}
                                title="Tarih / Saat Belirle veya Değiştir"
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span>📅</span>
                                  <span>{apptTime ? new Date(apptTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Tarih / Randevu Belirle'}</span>
                                </span>
                                <span style={{ fontSize: '0.65rem', opacity: 0.85 }}>{apptTime ? 'Değiştir ↗' : '+ Planla'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
          </>
        )}
        {/* Hızlı Randevu / Tarih Atama Modalı (Modern DayPicker & Interaktif Saat Seçici) */}
        {fastScheduleTreatment && selectedEvent && (
          <FastScheduleModal
            treatment={fastScheduleTreatment}
            patientInfo={patientProfileData?.patient || { name: selectedEvent.title?.split(' - ')[0] }}
            selectedEvent={selectedEvent}
            doctors={doctors}
            shifts={shifts}
            existingEvents={events}
            onClose={() => setFastScheduleTreatment(null)}
            onSuccess={(targetAppt, targetDate) => {
              setFastScheduleTreatment(null);
              fetchData();
              if (selectedEvent.patientId) {
                fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`)
                  .then(r => r.json())
                  .then(d => {
                    setPatientTreatments(d?.treatments || []);
                    setTreatmentGroups(d?.groups || []);
                  });
              }
              fetch('/api/dental/appointments')
                .then(r => r.json())
                .then(d => {
                  setEvents(d);
                  if (targetAppt) {
                    const freshAppt = d.find((ev: any) => ev.id === targetAppt.id) || targetAppt;
                    setSelectedEvent(freshAppt);
                    if (targetDate) setCurrentDate(targetDate);
                    focusAppointmentOnCalendar(freshAppt.id, freshAppt.startTime);
                  } else if (targetDate) {
                    setCurrentDate(targetDate);
                  }
                });
            }}
          />
        )}

        {/* Tedavi Ekle Modal */}
        {showTedaviForm && selectedEvent && (
          <AdvancedTedaviModal
            selectedEvent={selectedEvent}
            patientInfo={patientInfo}
            clinicId={clinicId}
            doctors={doctors}
            shifts={shifts}
            editingGroup={editingGroup}
            onClose={() => {
              setShowTedaviForm(false);
              setEditingGroup(null);
            }}
            onSaved={() => {
              setShowTedaviForm(false);
              setEditingGroup(null);
              fetchData();
              if (selectedEvent) {
                fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`)
                  .then(r => r.json())
                  .then(d => {
                    setPatientTreatments(d?.treatments || []);
                    setTreatmentGroups(d?.groups || []);
                  }).catch(() => {});
              }
            }}
          />
        )}

        {/* Ödeme Bilgisi Modal */}
        {showPaymentModal && selectedEvent && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100002 }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 480, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
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
                        toast.success('Ödeme silindi')
                      }).catch(() => {
                        toast.error('Ödeme silinemedi')
                      })
                    }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Sil</button>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    <button onClick={() => { setShowPaymentModal(false); setPaymentIdBeingEdited(null); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }}>İptal</button>
                    <button onClick={async () => {
                      if (!paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
                        toast.error('Lütfen geçerli bir tutar girin')
                        return
                      }
                      if (!paymentDate) {
                        toast.error('Lütfen ödeme tarihini girin')
                        return
                      }
                      const endpoint = paymentIdBeingEdited
                        ? `/api/dental/payments/${paymentIdBeingEdited}`
                        : `/api/dental/patients/${selectedEvent.patientId}/payments`
                      const method = paymentIdBeingEdited ? 'PUT' : 'POST'

                      try {
                        const res = await fetch(endpoint, {
                          method,
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            amount: Math.round(Number(paymentAmount)),
                            date: paymentDate,
                            method: paymentMethod || 'Nakit',
                            status: paymentStatus || 'completed',
                            dueDate: paymentDueDate || null,
                            notes: paymentNote || null,
                            treatmentPlanId: paymentTreatmentId || undefined
                          })
                        })
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}))
                          toast.error(err.error || 'Ödeme kaydedilemedi')
                          return
                        }
                        toast.success('Ödeme başarıyla kaydedildi')
                        setShowPaymentModal(false); setPaymentIdBeingEdited(null);
                        setPaymentAmount(''); setPaymentTreatmentId(''); setPaymentNote('');
                        setPaymentMethod('Nakit'); setPaymentStatus('completed'); setPaymentDueDate('');
                        fetch(`/api/dental/patients/${selectedEvent.patientId}/payments`).then(r => r.json()).then(setPatientPayments)
                      } catch {
                        toast.error('İşlem sırasında bir hata oluştu')
                      }
                    }} style={{ padding: '8px 16px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Kaydet</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Geçmiş İşlemler Modalı */}
        {showPastTreatmentsModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100002 }}>
            <div style={{ width: '90%', maxWidth: 700, padding: 24, borderRadius: 16, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1px solid var(--glass-border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
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
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--glass-border)', transition: 'background 0.2s', cursor: 'default' }}>
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

        {quickCreateMenu && (
          <QuickCreatePopover
            x={quickCreateMenu.x}
            y={quickCreateMenu.y}
            isCentered={quickCreateMenu.isCentered}
            defaultDate={quickCreateMenu.start.slice(0, 10)}
            defaultStartTime={quickCreateMenu.start.slice(11, 16)}
            defaultEndTime={quickCreateMenu.end.slice(11, 16)}
            doctorId={quickCreateMenu.doctorId}
            patients={patients}
            doctors={doctors}
            events={events}
            onClose={() => {
              setQuickCreateMenu(null);
              window.dispatchEvent(new Event('clear-calendar-draft'));
            }}
            onSave={async (data) => {
              if (data.type === 'patient_appointment') {
                let pId = data.patientId;
                if (!pId) {
                  // 1. Create Patient
                  try {
                    const ptRes = await fetch('/api/dental/patients', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: data.name,
                        phone: data.phone,
                        email: data.email,
                      })
                    });
                    if (!ptRes.ok) {
                      toast.error('Hasta oluşturulamadı');
                      return;
                    }
                    const pt = await ptRes.json();
                    pId = pt.id;
                  } catch {
                    toast.error('Hasta oluşturulurken hata oluştu');
                    return;
                  }
                }
                if (pId) {
                  // 2. Create Appointment
                  try {
                    const apptDate = quickCreateMenu.start.slice(0, 10);
                    const startStr = data.startTime ? `${apptDate}T${data.startTime}:00+03:00` : (quickCreateMenu.start.includes('+') ? quickCreateMenu.start : `${quickCreateMenu.start}+03:00`);
                    const endStr = data.endTime ? `${apptDate}T${data.endTime}:00+03:00` : (quickCreateMenu.end.includes('+') ? quickCreateMenu.end : `${quickCreateMenu.end}+03:00`);
                    const res = await fetch('/api/dental/appointments', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        patientId: pId,
                        doctorId: data.doctorId,
                        title: data.title,
                        startTime: startStr,
                        endTime: endStr,
                        type: 'Muayene',
                        status: data.doctorId ? 'scheduled' : 'pending_assignment'
                      })
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      toast.error(err.error || 'Randevu oluşturulamadı');
                      return;
                    }
                    toast.success('Randevu başarıyla oluşturuldu');
                  } catch {
                    toast.error('Randevu oluşturulurken bir hata oluştu');
                    return;
                  }
                }
              } else if (data.type === 'payment') {
                let pId = data.patientId;
                if (!pId && data.name) {
                  try {
                    const ptRes = await fetch('/api/dental/patients', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: data.name,
                        phone: data.phone,
                        email: data.email,
                      })
                    });
                    if (ptRes.ok) {
                      const pt = await ptRes.json();
                      pId = pt.id;
                    }
                  } catch {}
                }

                if (!pId) {
                  toast.error('Lütfen geçerli bir hasta seçin veya ekleyin');
                  return;
                }

                try {
                  const res = await fetch(`/api/dental/patients/${pId}/payments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      amount: Math.round(Number(data.amount)),
                      date: data.paymentDate,
                      method: data.paymentMethod || 'Nakit',
                      status: data.paymentStatus || 'completed',
                      dueDate: data.plannedDate || null,
                      notes: data.paymentNote || null,
                    })
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    toast.error(err.error || 'Ödeme kaydedilemedi');
                    return;
                  }
                  toast.success('Ödeme başarıyla kaydedildi');
                } catch {
                  toast.error('Ödeme işlemi sırasında bir hata oluştu');
                  return;
                }
              }
              setQuickCreateMenu(null);
              window.dispatchEvent(new Event('clear-calendar-draft'));
              fetchData();
            }}
          />
        )}

        {selectedDcmUrl && (
          <DicomViewer isModal={true} dcmUrl={selectedDcmUrl} onClose={() => setSelectedDcmUrl(null)} />
        )}
        {/* --- FLOATING CONTEXT MENUS --- */}
        {eventContextMenu && (
          <div
            className="context-menu-container"
            style={{
              position: 'fixed', top: eventContextMenu.y, left: eventContextMenu.x, zIndex: 99999,
              background: 'var(--card-bg)', border: '1px solid var(--glass-border)',
              borderRadius: 8, padding: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', width: 220
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
                position: 'fixed', top: Math.min(unassignedListMenu.y, window.innerHeight - 340), left: Math.min(unassignedListMenu.x, window.innerWidth - 280), zIndex: 9999,
                background: 'var(--card-bg, #ffffff)', border: '1px solid var(--glass-border)',
                borderRadius: 10, padding: 14, boxShadow: '0 12px 30px rgba(0,0,0,0.25)', width: 280, maxHeight: 340, overflowY: 'auto'
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>⚠️ Bekleyen Randevular</span>
                <button onClick={() => setUnassignedListMenu(null)} style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1rem', padding: '2px 6px' }}>✕</button>
              </div>
              {events.filter(e => !e.doctorId).length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--foreground-3)', textAlign: 'center', padding: '12px 0' }}>Bekleyen randevu yok.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {events.filter(e => !e.doctorId).map(e => {
                    const apptDate = new Date(e.startTime);
                    const isInvalidDate = isNaN(apptDate.getTime());
                    const dateStr = isInvalidDate ? '' : apptDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
                    const timeStr = isInvalidDate ? '' : apptDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div
                        key={e.id}
                        onClick={() => {
                          focusAppointmentOnCalendar(e.id, e.startTime, true);
                          setUnassignedListMenu(null);
                          toast.success(`📅 ${e.title} (${dateStr} ${timeStr}) randevusuna gidildi`);
                        }}
                        style={{
                          padding: '9px 12px', borderRadius: 8, border: '1px solid var(--glass-border)',
                          background: 'var(--input-bg)', cursor: 'pointer', fontSize: '0.8rem',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={ev => {
                          ev.currentTarget.style.background = 'var(--glass-bg-hover, rgba(37,99,235,0.08))';
                          ev.currentTarget.style.borderColor = 'var(--accent, #3b82f6)';
                        }}
                        onMouseLeave={ev => {
                          ev.currentTarget.style.background = 'var(--input-bg)';
                          ev.currentTarget.style.borderColor = 'var(--glass-border)';
                        }}
                      >
                        <div style={{ fontWeight: 700, color: 'var(--foreground)', marginBottom: 2 }}>{e.title}</div>
                        <div style={{ color: 'var(--foreground-3)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>🕒 {dateStr} {timeStr}</span>
                        </div>
                      </div>
                    );
                  })}
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

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
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
