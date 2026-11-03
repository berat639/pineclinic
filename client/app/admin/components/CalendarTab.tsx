import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import { Plus, X, Search, Filter, Calendar, CalendarOff, Clock, User, Phone, PhoneCall, Link2, LogOut, LayoutDashboard, CalendarDays, Users, Stethoscope, BriefcaseMedical, Settings, ChevronLeft, ChevronRight, Pencil, Trash2, FolderKanban, ChevronDown, ChevronUp, ArrowUpRight, AlertTriangle } from 'lucide-react'
import ShiftContextMenu from "./ShiftContextMenu"
import DoctorLeaveModal, { DoctorLeaveItem } from './DoctorLeaveModal'
import DentalCalendar from './DentalCalendar'
import { ToothChip, inputStyle } from './ToothChip'
import PatientSidePanel from './PatientSidePanel'
import AdvancedTedaviModal from './AdvancedTedaviModal';
import QuickCreatePopover from './QuickCreatePopover';
import MiniCalendar from './MiniCalendar';
import PatientProfileCard from './PatientProfileCard';
import PatientRecordsTimeline from './PatientRecordsTimeline';
import FastScheduleModal, { getTreatmentColorTheme } from './FastScheduleModal';
import TreatmentDoctorMultiSelect from './TreatmentDoctorMultiSelect';
import ConfirmModal from './ConfirmModal';
import AddPatientModal from './AddPatientModal';
import PatientConsentPanel from './PatientConsentPanel';
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'
import { PhoneMaskedInput, matchesPhoneSearch } from '@/lib/phone-mask'

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
    <div style={{ padding: '8px 10px', background: 'var(--input-bg)', borderRadius: 8, border: '1px solid var(--input-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Başlangıç:</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--foreground)' }}>{startHH}:{startMM}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Bitiş:</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--foreground)' }}>{endHH}:{endMM}</span>
        </div>
      </div>
      <div style={{ padding: '2px 4px 0' }}>
        <Slider
          range
          min={0}
          max={1440}
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
          pushable={30}
          styles={{
            track: { backgroundColor: 'var(--accent)', height: 6, borderRadius: 3 },
            rail: { backgroundColor: 'var(--input-border)', height: 6, borderRadius: 3 },
            handle: {
              border: '2.5px solid var(--accent)',
              backgroundColor: 'var(--card-bg)',
              opacity: 1,
              width: 14,
              height: 14,
              marginTop: -4,
              borderRadius: '50%',
              boxShadow: 'none'
            }
          }}
        />
      </div>
    </div>
  );
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: '🕒 Yanıt Bekliyor (Planlandı)',
  confirmed: '✅ Gelecek (Onaylandı)',
  arrived_unconfirmed: '🚶 Teyitsiz Geldi',
  waiting_in_clinic: '🏥 Klinikte Bekliyor',
  in_progress: '🔄 Devam Ediyor',
  completed: '✓ Tamamlandı',
  cancelled: '❌ Gelmiyor / İptal',
  pending_assignment: '⚠️ Atama Bekliyor',
  pending_review: '⚠️ Doğrulama Bekliyor',
  postponed: '⏳ Erteleme Talebi / Ertelendi',
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
  patientId: string | null
  doctorId: string | null
  title: string
  startTime: string
  endTime: string
  status: string
  type: string
  notes?: string
  timeConfirmed?: boolean
  complaint?: string
  intakeSource?: string | null
  intakePatientName?: string | null
  intakePatientPhone?: string | null
  reviewStatus?: string | null
  patientResponseStatus?: string | null
  patientResponseNote?: string | null
  patientPreferredDate?: string | null
  patientRespondedAt?: string | null
  patientResponseChannel?: string | null
}

interface Patient {
  id: string
  name: string
  phone: string | null
  email?: string | null
  balance: number
}

export default function CalendarTab({ onNavigateToClinicStaff }: { onNavigateToClinicStaff?: () => void }) {
  const panelBackdropDismiss = useBackdropDismiss(() => { setPanelOpen(false); setPatientProfileId(null) })
  const unassignedBackdropDismiss = useBackdropDismiss(() => setUnassignedListMenu(null))
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>([])
  const initializedDocsRef = React.useRef(false)

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [shifts, setShifts] = useState<any[]>([])
  const [workingHours, setWorkingHours] = useState<{
    startTime: string
    endTime: string
    isOvernight?: boolean
    slotStartHour: number
    slotEndHour: number
  }>({
    startTime: '08:00',
    endTime: '20:00',
    isOvernight: false,
    slotStartHour: 8,
    slotEndHour: 20,
  })
  const [workingHoursSaving, setWorkingHoursSaving] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [patientPanelOpen, setPatientPanelOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [shiftContextMenu, setShiftContextMenu] = useState<{ x: number, y: number, doctorId: string, date: string } | null>(null)
  const [eventContextMenu, setEventContextMenu] = useState<{ x: number, y: number, event: any, doctorId: string, date: string, startTime: string, endTime: string } | null>(null)
  const [doctorLeaves, setDoctorLeaves] = useState<DoctorLeaveItem[]>([])
  const [leaveModalState, setLeaveModalState] = useState<{ isOpen: boolean; doctorId?: string; date?: string }>({ isOpen: false })
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
    onConfirm: () => { }
  });

  const [quickCreateMenu, setQuickCreateMenu] = useState<{ start: string, end: string, doctorId: string | null, x: number, y: number, isCentered?: boolean } | null>(null)
  const [showAddPatientModal, setShowAddPatientModal] = useState(false)

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
  const hasDoctors = doctors.length > 0
  const noDoctorsTooltip = 'Hekim bulunamadı'

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

  const handleTreatmentStatusChange = async (treatmentId: string, treatmentName: string, newStatus: string) => {
    const pid = selectedEvent?.patientId || patientInfo?.id;
    if (!pid || !selectedEvent) return;
    try {
      const res = await fetch(`/api/dental/treatments/${treatmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        toast.error('Durum güncellenemedi');
        return;
      }
      const dRes = await fetch(`/api/dental/patients/${pid}/treatments`);
      const d = dRes.ok ? await dRes.json() : { treatments: [], groups: [] };
      const updatedTreatments = d?.treatments || [];
      setPatientTreatments(updatedTreatments);
      setTreatmentGroups(d?.groups || []);

      if (newStatus === 'completed' && updatedTreatments.length > 0) {
        const allCompleted = updatedTreatments.every((tr: any) => tr.status === 'completed');
        if (allCompleted && selectedEvent.status !== 'completed') {
          const apptRes = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' }),
          });
          if (apptRes.ok) {
            const updatedAppt = await apptRes.json();
            setEvents(prev => prev.map(ev => ev.id === updatedAppt.id ? { ...ev, ...updatedAppt, status: 'completed' } : ev));
            setSelectedEvent(prev => prev ? { ...prev, ...updatedAppt, status: 'completed' } : null);
            toast.success(`🎉 Tüm tedavi planı tamamlandı! Randevu durumu otomatik olarak "Tamamlandı"ya alındı.`);
            return;
          }
        }
        toast.success(`✅ "${treatmentName}" yapıldı olarak işaretlendi`);
      } else {
        toast.success('Durum güncellendi');
      }
    } catch {
      toast.error('Durum güncellenirken hata oluştu');
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
  const [expandedMergedKeys, setExpandedMergedKeys] = useState<Record<string, boolean>>({})
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
  const [aiReviewModal, setAiReviewModal] = useState<CalendarEvent | null>(null)
  const [aiReviewPatientId, setAiReviewPatientId] = useState('')
  const [aiReviewPatientQuery, setAiReviewPatientQuery] = useState('')
  const [aiReviewName, setAiReviewName] = useState('')
  const [aiReviewPhone, setAiReviewPhone] = useState('')
  const [aiReviewComplaint, setAiReviewComplaint] = useState('')
  const [aiReviewDoctorId, setAiReviewDoctorId] = useState('')
  const [aiReviewStart, setAiReviewStart] = useState('')
  const [aiReviewEnd, setAiReviewEnd] = useState('')
  const [aiReviewCreatePatient, setAiReviewCreatePatient] = useState(false)
  const [aiReviewRejectReason, setAiReviewRejectReason] = useState('')
  const [aiReviewSaving, setAiReviewSaving] = useState(false)

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

    const [docs, evts, shiftsData, invs, pats, leavesData, workingHoursData] = await Promise.all([
      fetchSafe('/api/dental/doctors'),
      fetchSafe('/api/dental/appointments'),
      fetchSafe('/api/shifts'),
      fetchSafe('/api/yonetici/inventory'),
      fetchSafe('/api/dental/patients'),
      fetchSafe('/api/dental/doctors/leaves'),
      fetchSafe('/api/dental/working-hours'),
    ])

    if (docs) {
      setDoctors(docs)
      const validDocIds = new Set(docs.map((d: any) => d.id))
      if (!initializedDocsRef.current && docs.length > 0) {
        setSelectedDoctorIds(docs.map((d: any) => d.id))
        initializedDocsRef.current = true
      } else {
        setSelectedDoctorIds(prev => {
          const kept = prev.filter(id => validDocIds.has(id))
          return kept.length > 0 ? kept : docs.map((d: any) => d.id)
        })
      }
    }
    if (evts) {
      setEvents(evts)
      setSelectedEvent(prev => prev ? (evts.find((e: any) => e.id === prev.id) || prev) : null)
    }
    if (shiftsData) setShifts(shiftsData)
    if (invs) setInventoryItems(invs)
    if (pats) setPatients(pats.filter((patient: { isArchived?: boolean }) => !patient.isArchived))
    if (leavesData) setDoctorLeaves(leavesData)
    if (workingHoursData && typeof workingHoursData.slotStartHour === 'number') {
      setWorkingHours(workingHoursData)
    }
  }, [currentDate])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const onHoursUpdated = (evt: Event) => {
      const customEvt = evt as CustomEvent
      if (customEvt.detail && typeof customEvt.detail.slotStartHour === 'number') {
        setWorkingHours(customEvt.detail)
      } else {
        fetchData()
      }
    }
    window.addEventListener('clinicWorkingHoursUpdated', onHoursUpdated)
    return () => window.removeEventListener('clinicWorkingHoursUpdated', onHoursUpdated)
  }, [fetchData])

  const handleSaveClinicWorkingHours = async (nextStartTime: string, nextEndTime: string) => {
    setWorkingHoursSaving(true)
    try {
      const res = await fetch('/api/admin/settings/working-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime: nextStartTime, endTime: nextEndTime }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) throw new Error(data?.error || 'Klinik mesai saatleri kaydedilemedi')
      setWorkingHours(data)
      window.dispatchEvent(new CustomEvent('clinicWorkingHoursUpdated', { detail: data }))
      toast.success(`🕒 Klinik genel mesai saatleri güncellendi: ${data.startTime} – ${data.endTime}${data.isOvernight ? ' (Ertesi Gün)' : ''}`)
    } catch (err: any) {
      toast.error(err.message || 'Klinik mesai saatleri kaydedilemedi')
    } finally {
      setWorkingHoursSaving(false)
    }
  }

  // Real-time SSE listener for patient responses (Geleceğim / Ertele / Gelmiyorum) & AI appointments
  useEffect(() => {
    let es: EventSource | null = null
    try {
      es = new EventSource('/api/events')
      es.onmessage = (msg) => {
        try {
          const payload = JSON.parse(msg.data)
          if (payload.type === 'appointment_updated') {
            const action = payload.action
            const updatedAppt = payload.appointment
            if (action === 'doctor_frozen') {
              fetchData()
            } else if (updatedAppt?.id) {
              setEvents(prev => prev.map(ev => ev.id === updatedAppt.id ? { ...ev, ...updatedAppt } : ev))
              setSelectedEvent(prev => prev && prev.id === updatedAppt.id ? { ...prev, ...updatedAppt } : prev)
            } else {
              fetchData()
            }
            if (action === 'confirm') {
              toast.success(`✅ Hasta randevuyu onayladı: ${updatedAppt?.title || 'Randevu'}`)
            } else if (action === 'postpone') {
              toast(`⏳ Hasta erteleme talep etti: ${updatedAppt?.title || 'Randevu'}`, { icon: '⏳', duration: 6000 })
            } else if (action === 'cancel') {
              toast.error(`❌ Hasta gelemeyeceğini bildirdi (İptal): ${updatedAppt?.title || 'Randevu'}`, { duration: 6000 })
            }
          } else if (payload.type === 'new_appointment') {
            fetchData()
          }
        } catch { }
      }
    } catch { }
    return () => {
      if (es) es.close()
    }
  }, [fetchData])

  const handleQuickPatientResponse = async (appointmentId: string, action: 'confirm' | 'postpone' | 'cancel', note?: string) => {
    try {
      const res = await fetch(`/api/dental/appointments/${appointmentId}/patient-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Hasta yanıtı kaydedilemedi')
      if (body.appointment) {
        setEvents(prev => prev.map(ev => ev.id === body.appointment.id ? { ...ev, ...body.appointment } : ev))
        setSelectedEvent(prev => prev && prev.id === body.appointment.id ? { ...prev, ...body.appointment } : prev)
      }
      if (action === 'confirm') toast.success('✅ Randevu "Gelecek (Onaylandı)" olarak işaretlendi')
      else if (action === 'postpone') toast('⏳ Randevu "Erteleme Talebi" olarak işaretlendi', { icon: '⏳' })
      else toast.error('❌ Randevu "Gelmeyecek (İptal)" olarak işaretlendi')
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Durum güncellenemedi')
    }
  }

  const patientActionAlerts = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    return events.filter(ev => {
      const dateStr = (ev.startTime || '').slice(0, 10)
      if (dateStr < todayStr) return false
      return (
        ev.status === 'postponed' ||
        ev.patientResponseStatus === 'postponed' ||
        ev.patientResponseStatus === 'cancelled'
      )
    })
  }, [events])

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // Ignore right clicks or simulated right clicks (Ctrl+Click on Mac)
      if (e.button !== 0 || e.ctrlKey) return;

      // Don't close if clicking inside a context menu or its trigger button
      const target = e.target as HTMLElement;
      if (target.closest('.context-menu-container') || target.closest('.shift-context-trigger')) return;

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

  const loadPatientContextForEvent = useCallback((event: CalendarEvent | null) => {
    if (!event) return;
    let targetPatientId = event.patientId;
    if (!targetPatientId && patients.length > 0) {
      const candidateName = (event.intakePatientName || event.title?.split(' - ')[0] || '').trim().toLocaleLowerCase('tr-TR');
      const phoneDigits = String(event.intakePatientPhone || '').replace(/\D/g, '').slice(-10);
      const matched = patients.find((p: any) => {
        if (phoneDigits.length === 10 && String(p?.phone || '').replace(/\D/g, '').endsWith(phoneDigits)) return true;
        return candidateName && p?.name?.trim().toLocaleLowerCase('tr-TR') === candidateName;
      });
      if (matched?.id) {
        targetPatientId = matched.id;
        setSelectedEvent(prev => prev && prev.id === event.id && !prev.patientId ? { ...prev, patientId: matched.id } : prev);
        setEvents(prev => prev.map((ev: any) => ev.id === event.id && !ev.patientId ? { ...ev, patientId: matched.id } : ev));
        void fetch(`/api/dental/appointments/${event.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId: matched.id }),
        }).catch(() => {});
      }
    }
    if (!targetPatientId) return;
    const cachedPatient = patients.find((p: any) => p.id === targetPatientId);
    if (cachedPatient) setPatientInfo(prev => prev?.id === targetPatientId ? prev : cachedPatient);
    fetch(`/api/dental/patients/${targetPatientId}`).then(r => r.ok ? r.json() : null).then(d => d && setPatientInfo(d)).catch(() => { });
    Promise.all([
      fetch(`/api/dental/patients/${targetPatientId}/treatments`).then(r => r.ok ? r.json() : { treatments: [], groups: [] }),
      fetch(`/api/dental/appointments/${event.id}/treatments`).then(r => r.ok ? r.json() : []),
    ]).then(([d, linkedSessions]) => {
      const allTreatments = d?.treatments || [];
      const allGroups = d?.groups || [];
      const linkedIds = new Set((linkedSessions || []).map((session: any) => session.treatmentPlanId));
      // Keep all treatments of the patient in state so treatments scheduled on other dates never disappear from the plan card,
      // and annotate which ones are directly linked to the currently open appointment.
      const annotatedTreatments = allTreatments.map((t: any) => ({
        ...t,
        isLinkedToCurrentAppt:
          linkedIds.has(t.id) ||
          (Array.isArray(t.sessions) && t.sessions.some((s: any) => s.appointmentId === event.id)),
      }));
      setPatientTreatments(annotatedTreatments);
      setTreatmentGroups(allGroups);
    }).catch(() => { });
    fetch(`/api/dental/patients/${targetPatientId}/payments`).then(r => r.ok ? r.json() : []).then(setPatientPayments).catch(() => { });
  }, [patients]);

  useEffect(() => {
    if (panelOpen && selectedEvent) {
      loadPatientContextForEvent(selectedEvent);
    }
  }, [panelOpen, selectedEvent?.id, selectedEvent?.patientId, loadPatientContextForEvent]);

  const handleEventClick = (eventId: string, event: CalendarEvent) => {
    setShiftContextMenu(null);
    setEventContextMenu(null);
    setSelectedEvent(event)
    setPanelOpen(true)
    setPatientTreatments([]); setTreatmentGroups([])
    setPatientPayments([])
    setPatientInfo(null)
    loadPatientContextForEvent(event)
  }

  const openAiReview = (event: CalendarEvent) => {
    setAiReviewModal(event)
    setAiReviewPatientId('')
    setAiReviewPatientQuery('')
    setAiReviewName(event.intakePatientName || event.title.split(' - ')[0] || '')
    setAiReviewPhone(event.intakePatientPhone || '')
    setAiReviewComplaint(event.complaint || '')
    setAiReviewDoctorId(event.doctorId || '')
    setAiReviewStart(new Date(event.startTime).toISOString().slice(0, 16))
    setAiReviewEnd(new Date(event.endTime).toISOString().slice(0, 16))
    setAiReviewCreatePatient(false)
    setAiReviewRejectReason('')
  }

  const approveAiReview = async () => {
    if (!aiReviewModal || (!aiReviewPatientId && !aiReviewCreatePatient)) {
      toast.error('Mevcut bir hasta seçin veya yeni hasta oluşturun')
      return
    }
    setAiReviewSaving(true)
    try {
      const res = await fetch(`/api/dental/appointments/${aiReviewModal.id}/approve-ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: aiReviewCreatePatient ? undefined : aiReviewPatientId,
          newPatient: aiReviewCreatePatient ? { name: aiReviewName, phone: aiReviewPhone } : undefined,
          patientUpdate: !aiReviewCreatePatient && aiReviewPatientId ? { name: aiReviewName, phone: aiReviewPhone } : undefined,
          doctorId: aiReviewDoctorId || null, startTime: new Date(aiReviewStart).toISOString(), endTime: new Date(aiReviewEnd).toISOString(), complaint: aiReviewComplaint,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Onay kaydedilemedi')
      toast.success(aiReviewDoctorId ? 'AI randevusu onaylandı ve planlandı' : 'AI randevusu onaylandı; doktor ataması bekliyor')
      setAiReviewModal(null); setPanelOpen(false); setSelectedEvent(null); fetchData()
    } catch (error: any) { toast.error(error.message || 'Onay sırasında hata oluştu') }
    finally { setAiReviewSaving(false) }
  }

  const rejectAiReview = async () => {
    if (!aiReviewModal || !aiReviewRejectReason.trim()) { toast.error('İptal nedeni zorunludur'); return }
    setAiReviewSaving(true)
    try {
      const res = await fetch(`/api/dental/appointments/${aiReviewModal.id}/reject-ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: aiReviewRejectReason }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'İptal kaydedilemedi')
      toast.success('AI randevu talebi iptal edildi')
      setAiReviewModal(null); setPanelOpen(false); setSelectedEvent(null); fetchData()
    } catch (error: any) { toast.error(error.message || 'İptal sırasında hata oluştu') }
    finally { setAiReviewSaving(false) }
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
    const d = new Date(`${currentDate}T12:00:00`)
    if (view === 'day') d.setDate(d.getDate() + offset)
    else if (view === 'week') d.setDate(d.getDate() + offset * 7)
    else {
      const selectedDay = d.getDate()
      d.setDate(1)
      d.setMonth(d.getMonth() + offset)
      d.setDate(Math.min(selectedDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
    }
    setCurrentDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  const navigationCopy = view === 'day'
    ? { previous: 'Önceki gün', next: 'Sonraki gün', current: 'Günlük görünüm' }
    : view === 'week'
      ? { previous: 'Önceki hafta', next: 'Sonraki hafta', current: 'Haftalık görünüm' }
      : { previous: 'Önceki ay', next: 'Sonraki ay', current: 'Aylık görünüm' }

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
      const phoneMatch = matchesPhoneSearch(person.phone, patientSearchQuery);
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
    ? events.filter(e => {
      const q = patientSearchQuery.toLowerCase();
      if (e.title?.toLowerCase().includes(q) || matchesPhoneSearch((e as any).phone, patientSearchQuery)) return true;
      if (e.patientId) {
        const p = patients.find(pt => pt.id === e.patientId);
        if (p && (p.name?.toLowerCase().includes(q) || matchesPhoneSearch(p.phone, patientSearchQuery))) return true;
      }
      return false;
    })
    : events;

  return (
    <div className="cal-root-container">
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
        .cal-root-container {
          display: flex;
          gap: 20px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          margin: 0 auto;
          position: relative;
          align-items: flex-start;
          box-sizing: border-box;
        }
        .cal-sidebar {
          width: 250px;
          max-width: 100%;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-sizing: border-box;
        }
        .cal-mobile-toggle-btn {
          display: none;
          width: 100%;
          max-width: 100%;
          margin-bottom: 8px;
          box-sizing: border-box;
        }
        .cal-main-area {
          flex: 1;
          min-width: 0;
          max-width: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
          width: 100%;
          overflow: hidden;
          box-sizing: border-box;
        }
        .cal-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          flex-wrap: nowrap;
          gap: 16px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .cal-header-top-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: nowrap;
          min-width: 0;
          flex-shrink: 0;
        }
        .cal-view-tabs {
          display: flex;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--input-border);
          flex-shrink: 0;
        }
        .cal-header-controls {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: nowrap;
          min-width: 0;
          flex-shrink: 0;
        }
        .cal-nav-group {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex-shrink: 0;
        }
        .cal-actions-group {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-shrink: 0;
        }
        @media (max-width: 1024px) {
          .cal-root-container {
            flex-direction: column;
            gap: 12px;
          }
          .cal-mobile-toggle-btn {
            display: flex !important;
          }
          .cal-sidebar {
            width: 100% !important;
            max-width: 100% !important;
            display: none;
            background: var(--card-bg, #1e293b);
            padding: 16px;
            border-radius: 12px;
            border: 1px solid var(--input-border, #334155);
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          }
          .cal-sidebar.is-open {
            display: flex !important;
          }
        }
        @media (max-width: 768px) {
          .cal-header-bar {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .cal-header-top-row {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
            width: 100%;
          }
          .cal-header-top-row h3 {
            font-size: 1rem !important;
          }
          .cal-view-tabs {
            width: 100% !important;
            display: flex !important;
          }
          .cal-view-tabs button {
            flex: 1 !important;
            text-align: center !important;
            padding: 8px 4px !important;
          }
          .cal-header-controls {
            display: flex;
            flex-direction: column;
            width: 100%;
            gap: 8px;
          }
          .cal-nav-group {
            width: 100%;
            display: flex;
            justify-content: space-between;
          }
          .cal-nav-group input[type="date"] {
            flex: 1;
            text-align: center;
            min-width: 0;
          }
          .cal-actions-group {
            width: 100%;
            display: flex;
            gap: 8px;
          }
          .cal-actions-group button {
            flex: 1 !important;
            justify-content: center !important;
            padding: 9px 8px !important;
            font-size: 0.82rem !important;
          }
        }
        @media (max-width: 640px) {
          .cal-responsive-panel {
            max-width: 100% !important;
            left: 0 !important;
            right: 0 !important;
            padding: 16px !important;
          }
        }
      `}</style>

      {/* Mobile Toggle Button for Filters & Mini Calendar */}
      <div className="cal-mobile-toggle-btn">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(prev => !prev)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '11px 16px',
            borderRadius: 10,
            border: '1px solid var(--input-border)',
            background: 'var(--card-bg, #1e293b)',
            color: 'var(--foreground)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} color="var(--accent, #3b82f6)" />
            <span>Mini Takvim & Hekim Filtresi</span>
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontWeight: 700 }}>
              {selectedDoctorIds.length}/{doctors.length} Hekim
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--foreground-3)' }}>
            {mobileSidebarOpen ? '▲ Kapat' : '▼ Göster'}
          </span>
        </button>
      </div>

      {/* Left Sidebar */}
      <div className={`cal-sidebar ${mobileSidebarOpen ? 'is-open' : ''}`}>
        {React.createElement(MiniCalendar as any, {
          currentDate,
          onDateSelect: setCurrentDate,
          onStepDate: goDate,
          onToday: () => {
            setView('day');
            setCurrentDate(new Date().toISOString().slice(0, 10));
          },
          navigationCopy,
          doctorLeaves,
          selectedDoctorIds,
        })}

        <div style={{ position: 'relative', zIndex: 100 }}>
          <div style={{
            background: 'var(--input-bg)',
            padding: '9px 12px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--input-border)',
            boxShadow: 'var(--pc-neo-inset)',
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
                width: '100%',
                maxWidth: '100%',
                zIndex: 1000,
                background: 'var(--card-bg, #1e293b)',
                border: '1px solid var(--input-border, #334155)',
                borderRadius: '12px',
                boxShadow: '0 16px 40px -10px rgba(0,0,0,0.6)',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Hekimlerim</h4>
            <span title={hasDoctors ? undefined : noDoctorsTooltip} style={{ display: 'inline-flex' }}>
              <button
                type="button"
                onClick={() => hasDoctors && setLeaveModalState({ isOpen: true, date: currentDate })}
                disabled={!hasDoctors}
                title={hasDoctors ? 'Hekimlerin izinli veya kapalı olduğu saatleri yönetin' : undefined}
                className="btn-clinic-blue"
                style={{
                  padding: '5px 9px',
                  borderRadius: 7,
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  cursor: hasDoctors ? 'pointer' : 'not-allowed',
                  opacity: hasDoctors ? 1 : 0.6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap',
                }}
              >
                <CalendarOff size={13} />
                <span>İzin / Kapalı Saat</span>
              </button>
            </span>
          </div>
          {(view === 'week' || view === 'month') && hasDoctors && (
            <div style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="btn-clinic-primary shift-context-trigger"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const rect = e.currentTarget.getBoundingClientRect()
                  setShiftContextMenu(prev =>
                    prev && prev.doctorId === '' && prev.date === currentDate
                      ? null
                      : {
                        x: Math.round(rect.right + 8),
                        y: Math.round(rect.top),
                        doctorId: '',
                        date: currentDate,
                      }
                  )
                }}
                title="Haftalık veya aylık görünümde hızlı mesai eklemek için tıklayın"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid #1d4ed8',
                  background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: 'var(--pc-clay-primary)',
                }}
              >
                <Clock size={13} color="#ffffff" />
                <span style={{ color: '#ffffff' }}>Hızlı Mesai Ekle</span>
              </button>
            </div>
          )}
          {hasDoctors && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => {
                  if (selectedDoctorIds.length === doctors.length) {
                    setSelectedDoctorIds([])
                  } else {
                    setSelectedDoctorIds(doctors.map(d => d.id))
                  }
                }}
                style={{ background: 'transparent', border: 'none', fontSize: '0.73rem', color: 'var(--brand)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                {selectedDoctorIds.length === doctors.length ? 'Temizle' : 'Tümünü Seç'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!hasDoctors && onNavigateToClinicStaff && (
              <div style={{ padding: 12, border: '1px solid var(--input-border)', borderRadius: 8, background: 'var(--card-inner)', display: 'grid', gap: 8 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--foreground-2)' }}>Takvimi kullanmak için önce bir hekim ekleyin.</span>
                <button
                  type="button"
                  onClick={onNavigateToClinicStaff}
                  style={{ minHeight: 36, padding: '0 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--btn-clinic-primary-fg)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}
                >
                  Klinik Personeli Ekle
                </button>
              </div>
            )}
            {doctors.map(doc => {
              const isSelected = selectedDoctorIds.includes(doc.id);
              const hasShiftOnCurrentDate = (shifts || []).some(
                (s: any) => s.userId === doc.id && String(s.date || '').slice(0, 10) === currentDate
              );
              const showAddShiftButton = view === 'week' || view === 'month' || !hasShiftOnCurrentDate;
              return (
                <div
                  key={doc.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setShiftContextMenu({ x: e.clientX, y: e.clientY, doctorId: doc.id, date: currentDate });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <label
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
                      userSelect: 'none',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `2px solid ${doc.color || 'var(--brand, #3b82f6)'}`,
                      background: isSelected ? (doc.color || 'var(--brand, #3b82f6)') : 'var(--calendar-checkbox-bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                    }}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                    </div>
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.name}>{doc.name}</span>
                  </label>
                  {showAddShiftButton && (
                    <button
                      type="button"
                      className="btn-clinic-blue shift-context-trigger"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setShiftContextMenu(prev =>
                          prev && prev.doctorId === doc.id && prev.date === currentDate
                            ? null
                            : { x: Math.round(rect.right + 8), y: Math.round(rect.top), doctorId: doc.id, date: currentDate }
                        );
                      }}
                      title={`${doc.name} için hızlı mesai ekle`}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      <Clock size={11} />
                      <span>Mesai Ekle</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div className="cal-main-area">
        {/* Header */}
        <div className="cal-header-bar">
          <div className="cal-header-top-row">
            <div className="cal-view-tabs">
              {(['day', 'week', 'month'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{ padding: '6px 14px', fontSize: '0.75rem', fontWeight: 600, border: 'none', background: view === v ? 'var(--accent)' : 'var(--input-bg)', color: view === v ? 'white' : 'var(--foreground-2)', cursor: 'pointer', borderRight: v !== 'month' ? '1px solid var(--input-border)' : 'none' }}>
                  {v === 'day' ? 'Günlük' : v === 'week' ? 'Haftalık' : 'Aylık'}
                </button>
              ))}
            </div>
          </div>

          <div className="cal-header-controls">
            {/* Action buttons */}
            <div className="cal-actions-group">
              <button
                className="btn btn-primary"
                style={{ padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => {
                  setPatientPanelOpen(true)
                  setPanelOpen(false)
                }}
              >
                <Users size={16} /> Hastalar
              </button>
              <span title={hasDoctors ? undefined : noDoctorsTooltip} style={{ display: 'inline-flex' }}>
                <button
                  onClick={() => {
                    if (!hasDoctors) return
                    const nowHour = new Date().getHours()
                    const minH = typeof workingHours?.slotStartHour === 'number' ? workingHours.slotStartHour : 8
                    const maxH = typeof workingHours?.slotEndHour === 'number' ? Math.min(23, workingHours.slotEndHour - 1) : 19
                    const startH = (nowHour >= minH && nowHour <= maxH) ? nowHour : Math.max(9, minH)
                    const t1 = `${startH.toString().padStart(2, '0')}:00`
                    const t2 = `${startH.toString().padStart(2, '0')}:30`
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
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: hasDoctors ? 'none' : '1px solid var(--input-border)',
                    background: hasDoctors ? 'var(--accent)' : 'var(--input-bg)',
                    color: hasDoctors ? 'var(--btn-clinic-primary-fg)' : 'var(--foreground-3)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: hasDoctors ? 'pointer' : 'not-allowed',
                    opacity: hasDoctors ? 1 : 0.65,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                  disabled={!hasDoctors}
                >
                  <Plus size={16} /> Randevu Ekle
                </button>
              </span>
              <button
                onClick={() => {
                  setShowAddPatientModal(true)
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                <Plus size={16} /> Yeni Hasta Ekle
              </button>
            </div>
          </div>
        </div>


        <DentalCalendar
          doctors={doctors.filter(d => selectedDoctorIds.includes(d.id))}
          events={filteredEvents.filter(
            ev =>
              ev.status !== 'cancelled' &&
              ev.status !== 'no_show' &&
              ev.patientResponseStatus !== 'cancelled' &&
              (!ev.doctorId || !doctors.some(d => d.id === ev.doctorId) || selectedDoctorIds.includes(ev.doctorId))
          )}
          shifts={shifts}
          doctorLeaves={doctorLeaves}
          workingHours={workingHours}
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
            if (!hasDoctors) return
            setQuickCreateMenu({ start, end, doctorId, x, y })
          }}
          onEventUpdate={(updatedEvent, options) => {
            const persistMove = () => {
              const newStatus = updatedEvent.doctorId ? 'scheduled' : 'pending_assignment';
              const previousEvent = events.find(ev => ev.id === updatedEvent.id);
              const optimisticEvent: CalendarEvent = {
                ...updatedEvent,
                doctorId: updatedEvent.doctorId || null,
                status: newStatus,
              };

              // 1. Optimistic UI: Anında (0ms) state'i güncelle — geri sıçrama ve FPS kaybını önler
              setEvents(prev => prev.map(ev => ev.id === updatedEvent.id ? { ...ev, ...optimisticEvent } : ev));
              setSelectedEvent(prev => prev && prev.id === updatedEvent.id ? { ...prev, ...optimisticEvent } : prev);

              // 2. Arka planda (Non-Blocking Async) API kaydı — 7'li ağır fetchData() çağrılmaz
              void (async () => {
                try {
                  const response = await fetch(`/api/dental/appointments/${updatedEvent.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      startTime: updatedEvent.startTime,
                      endTime: updatedEvent.endTime,
                      doctorId: updatedEvent.doctorId || null,
                      status: newStatus
                    })
                  });
                  const body = await response.json().catch(() => ({}));
                  if (!response.ok) throw new Error(body.error || 'Randevu taşınamadı');

                  if (body && body.id) {
                    setEvents(prev => prev.map(ev => ev.id === body.id ? { ...ev, ...body } : ev));
                    setSelectedEvent(prev => prev && prev.id === body.id ? { ...prev, ...body } : prev);
                  }
                  toast.success(options?.keepUnassigned ? 'Atanmamış randevu taşındı' : 'Randevu güncellendi');
                } catch (error: any) {
                  // Hata durumunda önceki konuma geri al (Rollback)
                  if (previousEvent) {
                    setEvents(prev => prev.map(ev => ev.id === previousEvent.id ? previousEvent : ev));
                    setSelectedEvent(prev => prev && prev.id === previousEvent.id ? previousEvent : prev);
                  }
                  toast.error(error.message || 'Randevu güncellenemedi');
                }
              })();
            }

            if (options?.requiresAssignmentConfirmation && updatedEvent.doctorId) {
              const doctor = doctors.find(d => d.id === updatedEvent.doctorId)
              const start = new Date(updatedEvent.startTime).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
              setConfirmModal({
                isOpen: true,
                title: 'Doktor atamasını onayla',
                message: `${updatedEvent.title} randevusunu ${doctor?.name || 'seçilen hekim'} için ${start} saatine atamak istiyor musunuz? Vardiya ve izin uygunluğu doğrulandı.`,
                confirmText: 'Atamayı Onayla',
                cancelText: 'Vazgeç',
                variant: 'primary',
                onConfirm: persistMove,
              })
              return
            }

            persistMove()
          }}
          onEventClick={handleEventClick}
          view={view}
        />
      </div>

      {/* Backdrop for click outside (shared) */}
      {(panelOpen || patientProfileId) && (
        <div
          {...panelBackdropDismiss}
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)', display: showTedaviForm ? 'none' : 'block' }}
        />
      )}

      {/* Left Panel — Patient Profile */}
      {patientProfileId && (
        <div
          className="cal-responsive-panel"
          style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, width: '100%', maxWidth: '500px',
            backgroundColor: 'var(--card-bg, #1e293b)', borderRight: '1px solid var(--divider)',
            zIndex: 9999, padding: '24px', overflowY: 'auto',
            boxShadow: '4px 0 20px rgba(0,0,0,0.3)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Hasta Detayı</h3>
            <button onClick={() => setPatientProfileId(null)} style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', fontSize: '1.25rem', cursor: 'pointer' }}>✕</button>
          </div>

          {profileLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-3)' }}>Profil yükleniyor...</div>
          ) : patientProfileData ? (
            <PatientProfileCard profile={patientProfileData} doctors={doctors} />
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>Profil yüklenemedi.</div>
          )}
        </div>
      )}

      {/* Right Panel — Event Detail */}
      {panelOpen && selectedEvent && (
        <>
          <div
            className="cal-responsive-panel"
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '435px',
              backgroundColor: 'var(--card-bg, #1e293b)', borderLeft: '1px solid var(--divider)',
              zIndex: 9999, padding: '24px', overflowY: 'auto',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Randevu Detayı</h3>
              <button onClick={() => setPanelOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--foreground-3)', fontSize: '1.25rem', cursor: 'pointer' }}>✕</button>
            </div>

            {(() => {
              const displayPatient = patientInfo || patients.find((p: any) =>
                (selectedEvent.patientId && p.id === selectedEvent.patientId) ||
                (p.name || '').trim().toLocaleLowerCase('tr-TR') === (selectedEvent.intakePatientName || selectedEvent.title?.split(' - ')[0] || '').trim().toLocaleLowerCase('tr-TR')
              );
              const displayPatientId = displayPatient?.id || selectedEvent.patientId || null;
              const displayName = displayPatient?.name || selectedEvent.intakePatientName || selectedEvent.title?.split(' - ')[0] || 'İsimsiz Hasta';
              const displayPhone = displayPatient?.phone || selectedEvent.intakePatientPhone || '';
              const displayEmail = displayPatient?.email || '';
              const initials = displayName
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((part: string) => part[0]?.toLocaleUpperCase('tr-TR'))
                .join('') || 'HK';

              const refreshTreatmentsList = () => {
                fetchData();
                if (displayPatientId) {
                  loadPatientContextForEvent({ ...selectedEvent, patientId: displayPatientId });
                }
              };

              const activeDoctorIdSet = new Set(doctors.map((d: any) => d.id));
              const getTreatmentDoctorIds = (t: any): string[] => {
                let rawIds: string[] = [];
                if (Array.isArray(t.doctorIds) && t.doctorIds.length > 0) {
                  rawIds = t.doctorIds.filter(Boolean);
                } else if (Array.isArray(t.metadata?.doctorIds) && t.metadata.doctorIds.length > 0) {
                  rawIds = t.metadata.doctorIds.filter(Boolean);
                } else if (t.doctorId) {
                  rawIds = [t.doctorId];
                }
                if (t.status === 'completed') return rawIds;
                return rawIds.filter((id) => activeDoctorIdSet.has(id));
              };

              const handleBatchDoctorChange = async (items: any[], nextDocIds: string[], apptTime?: string | null) => {
                const targetApptTime = apptTime || selectedEvent?.startTime;
                if (nextDocIds.length > 0 && targetApptTime) {
                  const apptDateStr = new Date(targetApptTime).toLocaleDateString('sv');
                  const startMin = new Date(targetApptTime).getHours() * 60 + new Date(targetApptTime).getMinutes();
                  for (const docId of nextDocIds) {
                    const docShifts = (shifts || []).filter((s: any) => s.userId === docId && s.date === apptDateStr);
                    const docObj = doctors.find((d: any) => d.id === docId);
                    const docName = docObj?.name || 'Hekim';
                    if (docShifts.length === 0) {
                      toast.error(`⚠️ ${docName} için bu tarihte (${apptDateStr}) vardiya bulunmuyor!`);
                      return;
                    }
                    const isCovered = docShifts.some((s: any) => {
                      const [sH, sM] = (s.startTime || '00:00').split(':').map(Number);
                      const [eH, eM] = (s.endTime || '23:59').split(':').map(Number);
                      const sStart = sH * 60 + (sM || 0);
                      let sEnd = eH * 60 + (eM || 0);
                      if (sEnd <= sStart) sEnd += 1440;
                      let checkMin = startMin;
                      if (sEnd > 1440 && checkMin < sStart) checkMin += 1440;
                      return checkMin >= sStart && checkMin <= sEnd;
                    });
                    if (!isCovered) {
                      const shiftRanges = docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ');
                      toast.error(`⚠️ Randevu saati ${docName} vardiyası (${shiftRanges}) dışındadır!`);
                      return;
                    }
                  }
                }

                try {
                  const primaryDoctorId = nextDocIds[0] || null;
                  await Promise.all(
                    items.map(item =>
                      fetch(`/api/dental/treatments/${item.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ doctorId: primaryDoctorId, doctorIds: nextDocIds }),
                      })
                    )
                  );
                  refreshTreatmentsList();
                } catch {
                  toast.error('Hekim güncellenemedi');
                }
              };

              const handleBatchStatusChange = async (items: any[], newStatus: string) => {
                if (items.length === 1) {
                  await handleTreatmentStatusChange(items[0].id, items[0].procedureName, newStatus);
                  return;
                }
                const pid = selectedEvent?.patientId || patientInfo?.id;
                if (!pid || !selectedEvent) return;
                try {
                  const results = await Promise.all(
                    items.map(item =>
                      fetch(`/api/dental/treatments/${item.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus }),
                      })
                    )
                  );
                  if (results.some(r => !r.ok)) {
                    toast.error('Bazı işlemlerin durumu güncellenemedi');
                  } else {
                    toast.success(
                      newStatus === 'completed'
                        ? `✅ ${items.length} işlem yapıldı olarak işaretlendi`
                        : `${items.length} işlemin durumu güncellendi`
                    );
                  }
                  refreshTreatmentsList();
                } catch {
                  toast.error('Durum güncellenirken hata oluştu');
                }
              };

              const renderTreatmentItemCard = (t: any, g?: any, idx = 0) => {
                const apptTime = t.sessions?.[0]?.startTime || t.plannedDate;
                const isCompleted = t.status === 'completed';
                const costVal = Number(t.cost || 0);
                const docIds = getTreatmentDoctorIds(t);
                const tTheme = getTreatmentColorTheme(t.color || t.metadata?.color || t.procedureName, idx);

                return (
                  <div
                    id={`treatment-${t.id}`}
                    key={t.id}
                    onClick={() => handleTreatmentCardClick(t, g)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                      padding: '9px 11px',
                      borderRadius: 8,
                      background: 'var(--input-bg, #ffffff)',
                      border: isCompleted ? '1px solid var(--btn-clinic-mint-border, #86efac)' : '1px solid var(--input-border, #cbd5e1)',
                      borderLeft: isCompleted ? '4px solid #10b981' : `4px solid ${tTheme.accent}`,
                      fontSize: '0.76rem',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease',
                      boxSizing: 'border-box',
                    }}
                    title="Takvimde bu tedavi / randevu tarihine git"
                  >
                    {/* 1. Satır: Diş No + Tedavi Adı + Fiyat + Sil Butonu */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
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
                          <span style={{
                            padding: '2px 7px',
                            borderRadius: 5,
                            background: isCompleted ? 'var(--btn-clinic-mint-bg, #f0fdf4)' : tTheme.badgeBg,
                            border: isCompleted ? '1px solid var(--btn-clinic-mint-border, #86efac)' : `1px solid ${tTheme.softBorder}`,
                            color: isCompleted ? 'var(--btn-clinic-mint-text, #15803d)' : tTheme.badgeText,
                            fontWeight: 800,
                            fontSize: '0.72rem',
                            flexShrink: 0,
                          }}>
                            #{t.toothNumber}
                          </span>
                        )}
                        <span style={{
                          fontWeight: 700,
                          color: 'var(--foreground)',
                          fontSize: '0.81rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }} title={t.procedureName}>
                          {t.procedureName}
                        </span>
                        {t.dcmUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDcmUrl(`${process.env.NEXT_PUBLIC_API_URL || ''}${t.dcmUrl}`);
                            }}
                            style={{
                              fontSize: '0.64rem',
                              padding: '2px 6px',
                              borderRadius: 4,
                              border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                              background: 'var(--btn-clinic-secondary-bg, #eff6ff)',
                              color: 'var(--btn-clinic-secondary-text, #0284c7)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            Röntgen
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {costVal > 0 && (
                          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
                            {costVal.toLocaleString('tr-TR')} ₺
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setConfirmModal({
                              isOpen: true,
                              title: 'İşlemi Sil',
                              message: `"${t.toothNumber ? `#${t.toothNumber} ` : ''}${t.procedureName}" işlemini silmek istediğinize emin misiniz?`,
                              confirmText: 'Evet, Sil',
                              variant: 'danger',
                              onConfirm: async () => {
                                await fetch(`/api/dental/treatments/${t.id}`, { method: 'DELETE' });
                                refreshTreatmentsList();
                              },
                            });
                          }}
                          style={{
                            background: 'var(--card-inner, #f1f5f9)',
                            border: '1px solid var(--input-border, #cbd5e1)',
                            borderRadius: 6,
                            color: 'var(--danger, #ef4444)',
                            cursor: 'pointer',
                            padding: '4px 6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                          title="İşlemi Sil"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* 2. Satır: Durum (dar) ve Çoklu Hekim Seçici (geniş) */}
                    <div onClick={e => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: '108px 1fr', gap: 6 }}>
                      <select
                        value={t.status || 'planned'}
                        onChange={(e) => handleTreatmentStatusChange(t.id, t.procedureName, e.target.value)}
                        style={{
                          width: '100%',
                          fontSize: '0.73rem',
                          padding: '5px 6px',
                          borderRadius: 6,
                          border: isCompleted ? '1px solid var(--btn-clinic-mint-border, #86efac)' : '1px solid var(--input-border, #cbd5e1)',
                          background: isCompleted ? 'var(--btn-clinic-mint-bg, #f0fdf4)' : 'var(--card-inner, #f1f5f9)',
                          color: isCompleted ? 'var(--btn-clinic-mint-text, #15803d)' : (t.status === 'in_progress' ? '#d97706' : 'var(--foreground)'),
                          fontWeight: 600,
                          cursor: 'pointer',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      >
                        <option value="planned">Planlandı</option>
                        <option value="in_progress">Devam Ediyor</option>
                        <option value="completed">✓ Yapıldı</option>
                      </select>

                      <TreatmentDoctorMultiSelect
                        doctors={doctors}
                        selectedDoctorIds={docIds}
                        onChange={(nextDocIds) => handleBatchDoctorChange([t], nextDocIds, apptTime)}
                        shifts={shifts}
                        targetApptTime={apptTime || selectedEvent?.startTime}
                        disabled={isCompleted}
                        placeholder="Hekim Seç"
                      />
                    </div>

                    {/* 3. Satır: Tarih / Randevu Butonu (Planlandı = Mavi, Yapıldı = Yeşil) */}
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
                          background: isCompleted
                            ? 'var(--btn-clinic-mint-bg, #f0fdf4)'
                            : apptTime
                              ? 'var(--btn-clinic-secondary-bg, #eff6ff)'
                              : 'var(--card-inner, #f1f5f9)',
                          border: isCompleted
                            ? '1px solid var(--btn-clinic-mint-border, #86efac)'
                            : apptTime
                              ? '1px solid var(--btn-clinic-secondary-border, #93c5fd)'
                              : '1px dashed var(--accent, #0284c7)',
                          color: isCompleted
                            ? 'var(--btn-clinic-mint-text, #15803d)'
                            : 'var(--btn-clinic-secondary-text, #0284c7)',
                          borderRadius: 6,
                          cursor: 'pointer',
                          padding: '5px 10px',
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxSizing: 'border-box',
                        }}
                        title="Tarih / Saat Belirle veya Değiştir"
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <CalendarDays size={13} />
                          <span>
                            {apptTime
                              ? new Date(apptTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                              : 'Tarih / Randevu Belirle'}
                          </span>
                        </span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                          {apptTime ? <>Değiştir <ArrowUpRight size={12} /></> : '+ Planla'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              };

              const renderSmartGroupedTreatments = (items: any[], g?: any, scopePrefix = 'grp') => {
                const buckets: Array<{ key: string; items: any[] }> = [];
                const bucketMap = new Map<string, { key: string; items: any[] }>();

                for (const t of items) {
                  const apptTime = t.sessions?.[0]?.startTime || t.plannedDate || '';
                  const apptKey = apptTime ? new Date(apptTime).toISOString() : 'no-date';
                  const docKey = [...getTreatmentDoctorIds(t)].sort().join(',') || 'no-doc';
                  const procKey = (t.procedureName || '').trim().toLocaleLowerCase('tr-TR');
                  const statusKey = t.status || 'planned';
                  const key = `${scopePrefix}::${procKey}::${statusKey}::${docKey}::${apptKey}`;

                  let b = bucketMap.get(key);
                  if (!b) {
                    b = { key, items: [] };
                    bucketMap.set(key, b);
                    buckets.push(b);
                  }
                  b.items.push(t);
                }

                return buckets.map((bucket, idx) => {
                  const sortedItems = [...bucket.items].sort((a, b) =>
                    String(a.toothNumber || '').localeCompare(String(b.toothNumber || ''), 'tr-TR', { numeric: true })
                  );

                  if (sortedItems.length === 1) {
                    return renderTreatmentItemCard(sortedItems[0], g, idx);
                  }

                  const isExpanded = !!expandedMergedKeys[bucket.key];
                  const first = sortedItems[0];
                  const apptTime = first.sessions?.[0]?.startTime || first.plannedDate;
                  const isCompleted = first.status === 'completed';
                  const totalCost = sortedItems.reduce((sum, item) => sum + Number(item.cost || 0), 0);
                  const docIds = getTreatmentDoctorIds(first);
                  const firstTheme = getTreatmentColorTheme(first.color || first.metadata?.color || first.procedureName, idx);

                  if (isExpanded) {
                    return (
                      <div
                        key={bucket.key}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          padding: 7,
                          borderRadius: 9,
                          background: 'var(--card-inner, #f1f5f9)',
                          border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '2px 4px',
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--btn-clinic-secondary-text, #0284c7)' }}>
                            🦷 {sortedItems.map(i => i.toothNumber ? `#${i.toothNumber}` : '').filter(Boolean).join(', ')} · Tekil Düzenleme ({sortedItems.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedMergedKeys(prev => ({ ...prev, [bucket.key]: false }))}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                              padding: '2px 8px',
                              borderRadius: 6,
                              border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                              background: 'var(--input-bg, #ffffff)',
                              color: 'var(--btn-clinic-secondary-text, #0284c7)',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            <ChevronUp size={12} /> Birleştir
                          </button>
                        </div>
                        {sortedItems.map((item, subIdx) => renderTreatmentItemCard(item, g, idx + subIdx))}
                      </div>
                    );
                  }

                  return (
                    <div
                      id={`treatment-${first.id}`}
                      key={bucket.key}
                      onClick={() => handleTreatmentCardClick(first, g)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: '10px 11px',
                        borderRadius: 8,
                        background: 'var(--input-bg, #ffffff)',
                        border: isCompleted ? '1px solid var(--btn-clinic-mint-border, #86efac)' : '1px solid var(--input-border, #cbd5e1)',
                        borderLeft: isCompleted ? '4px solid #10b981' : `4px solid ${firstTheme.accent}`,
                        fontSize: '0.76rem',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                      title="Takvimde bu tedavi / randevu tarihine git"
                    >
                      {/* 1. Satır: Birleşik Diş Rozetleri + İşlem Adı + Toplam Fiyat + Ayır / Sil */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: isCompleted ? '#10b981' : firstTheme.accent,
                              flexShrink: 0,
                            }}
                          />
                          {sortedItems.map(item => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedMergedKeys(prev => ({ ...prev, [bucket.key]: true }));
                              }}
                              title={`#${item.toothNumber} dişini tekil düzenlemek için tıklayın`}
                              style={{
                                padding: '2px 6px',
                                borderRadius: 5,
                                background: isCompleted ? 'var(--btn-clinic-mint-bg, #f0fdf4)' : firstTheme.badgeBg,
                                border: isCompleted ? '1px solid var(--btn-clinic-mint-border, #86efac)' : `1px solid ${firstTheme.softBorder}`,
                                color: isCompleted ? 'var(--btn-clinic-mint-text, #15803d)' : firstTheme.badgeText,
                                fontWeight: 800,
                                fontSize: '0.71rem',
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              {item.toothNumber ? `#${item.toothNumber}` : 'Genel'}
                            </button>
                          ))}
                          <span
                            style={{
                              fontWeight: 700,
                              color: 'var(--foreground)',
                              fontSize: '0.82rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={first.procedureName}
                          >
                            {first.procedureName}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          {totalCost > 0 && (
                            <span
                              style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}
                              title={`${sortedItems.length} × ${(totalCost / sortedItems.length).toLocaleString('tr-TR')} ₺`}
                            >
                              {totalCost.toLocaleString('tr-TR')} ₺
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedMergedKeys(prev => ({ ...prev, [bucket.key]: true }))}
                            title="Dişleri ayırarak tek tek düzenle"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 2,
                              padding: '3px 7px',
                              borderRadius: 6,
                              border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                              background: 'var(--btn-clinic-secondary-bg, #eff6ff)',
                              color: 'var(--btn-clinic-secondary-text, #0284c7)',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            <ChevronDown size={12} /> Ayır
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Birleşik İşlemleri Sil',
                                message: `Seçili ${sortedItems.length} dişe (${sortedItems.map(i => `#${i.toothNumber}`).join(', ')}) ait "${first.procedureName}" işlemlerini silmek istediğinize emin misiniz?`,
                                confirmText: 'Evet, Tümünü Sil',
                                variant: 'danger',
                                onConfirm: async () => {
                                  await Promise.all(sortedItems.map(item => fetch(`/api/dental/treatments/${item.id}`, { method: 'DELETE' })));
                                  refreshTreatmentsList();
                                },
                              });
                            }}
                            style={{
                              background: 'var(--card-inner, #f1f5f9)',
                              border: '1px solid var(--input-border, #cbd5e1)',
                              borderRadius: 6,
                              color: 'var(--danger, #ef4444)',
                              cursor: 'pointer',
                              padding: '4px 6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            title="Grubu Sil"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* 2. Satır: Toplu Durum ve Çoklu Hekim Seçici */}
                      <div onClick={e => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: '108px 1fr', gap: 6 }}>
                        <select
                          value={first.status || 'planned'}
                          onChange={e => handleBatchStatusChange(sortedItems, e.target.value)}
                          style={{
                            width: '100%',
                            fontSize: '0.73rem',
                            padding: '5px 6px',
                            borderRadius: 6,
                            border: isCompleted ? '1px solid var(--btn-clinic-mint-border, #86efac)' : '1px solid var(--input-border, #cbd5e1)',
                            background: isCompleted ? 'var(--btn-clinic-mint-bg, #f0fdf4)' : 'var(--card-inner, #f1f5f9)',
                            color: isCompleted ? 'var(--btn-clinic-mint-text, #15803d)' : (first.status === 'in_progress' ? '#d97706' : 'var(--foreground)'),
                            fontWeight: 600,
                            cursor: 'pointer',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        >
                          <option value="planned">Planlandı</option>
                          <option value="in_progress">Devam Ediyor</option>
                          <option value="completed">✓ Yapıldı</option>
                        </select>

                        <TreatmentDoctorMultiSelect
                          doctors={doctors}
                          selectedDoctorIds={docIds}
                          onChange={nextDocIds => handleBatchDoctorChange(sortedItems, nextDocIds, apptTime)}
                          shifts={shifts}
                          targetApptTime={apptTime || selectedEvent?.startTime}
                          disabled={isCompleted}
                          placeholder="Hekim Seç"
                        />
                      </div>

                      {/* 3. Satır: Ortak Randevu / Tarih Butonu */}
                      <div onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFastScheduleTreatment({ ...first, batchTreatments: sortedItems });
                          }}
                          style={{
                            width: '100%',
                            background: isCompleted
                              ? 'var(--btn-clinic-mint-bg, #f0fdf4)'
                              : apptTime
                                ? 'var(--btn-clinic-secondary-bg, #eff6ff)'
                                : 'var(--card-inner, #f1f5f9)',
                            border: isCompleted
                              ? '1px solid var(--btn-clinic-mint-border, #86efac)'
                              : apptTime
                                ? '1px solid var(--btn-clinic-secondary-border, #93c5fd)'
                                : '1px dashed var(--accent, #0284c7)',
                            color: isCompleted
                              ? 'var(--btn-clinic-mint-text, #15803d)'
                              : 'var(--btn-clinic-secondary-text, #0284c7)',
                            borderRadius: 6,
                            cursor: 'pointer',
                            padding: '5px 10px',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            boxSizing: 'border-box',
                          }}
                          title="Bu gruptaki tüm işlemler için ortak randevu saati belirle"
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <CalendarDays size={13} />
                            <span>
                              {apptTime
                                ? new Date(apptTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                                : 'Tarih / Randevu Belirle'}
                            </span>
                          </span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                            {apptTime ? <>Değiştir <ArrowUpRight size={12} /></> : '+ Planla'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                });
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* ── Hasta Bilgisi & Bildirim Onamı ── */}
                  <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-inner, #f1f5f9)', border: '1px solid var(--input-border, #cbd5e1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hasta Bilgisi</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {Boolean(displayPatientId || selectedEvent) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setShowPastTreatmentsModal(true);
                            }}
                            style={{
                              background: 'var(--btn-clinic-secondary-bg, #eff6ff)',
                              border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                              color: 'var(--btn-clinic-secondary-text, #0284c7)',
                              borderRadius: 6,
                              padding: '3px 8px',
                              cursor: 'pointer',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}
                          >
                            📋 Tüm Kayıtlar
                          </button>
                        )}
                        {displayPatientId && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setPatientProfileId(displayPatientId);
                            }}
                            style={{
                              background: 'var(--btn-clinic-secondary-bg, #eff6ff)',
                              border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                              color: 'var(--btn-clinic-secondary-text, #0284c7)',
                              borderRadius: 6,
                              padding: '3px 8px',
                              cursor: 'pointer',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}
                          >
                            Profile Git ↗
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: 'var(--badge-clinic-bg, #e0f2fe)',
                        border: '1px solid var(--badge-clinic-border, #bae6fd)',
                        color: 'var(--badge-clinic-text, #0369a1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        flexShrink: 0,
                      }}>
                        {initials}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {displayName}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 3 }}>
                          <span style={{ fontSize: '0.75rem', color: displayPhone ? 'var(--foreground-2)' : 'var(--foreground-3)', fontWeight: 500 }}>
                            📞 {displayPhone || 'Telefon kayıtlı değil'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: displayEmail ? 'var(--foreground-2)' : 'var(--foreground-3)', fontWeight: 500 }}>
                            ✉️ {displayEmail || 'E-posta kayıtlı değil'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {displayPatientId && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--input-border, #cbd5e1)' }}>
                        <PatientConsentPanel
                          patientId={displayPatientId}
                          onContactChange={(contact) => {
                            setPatientInfo((prev: any) => prev ? { ...prev, ...contact } : prev);
                            fetchData();
                          }}
                          onConsentChange={(nextOptOuts) => {
                            setPatientInfo((prev: any) => prev ? { ...prev, ...nextOptOuts } : prev);
                            fetchData();
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* ── Randevu Bilgisi (Tarih/Saat Değiştir en altta entegre) ── */}
                  <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-inner, #f1f5f9)', border: '1px solid var(--input-border, #cbd5e1)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--foreground-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Randevu Bilgisi</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        {(() => {
                          const hasActiveAssignedDoctor = Boolean(selectedEvent.doctorId && activeDoctorIdSet.has(selectedEvent.doctorId));
                          const isDoctorUnassigned = !hasActiveAssignedDoctor || selectedEvent.status === 'pending_assignment';
                          return (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                                <div style={{ fontSize: '0.68rem', color: 'var(--foreground-2)', fontWeight: 600 }}>
                                  İlgili Doktor
                                </div>
                                {isDoctorUnassigned && (
                                  <span
                                    title="Doktor ayrıldı, atama bekliyor"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      padding: '2px 7px',
                                      borderRadius: 5,
                                      background: 'var(--calendar-unassigned-bg, #ffedd5)',
                                      border: '1px solid var(--calendar-unassigned-border, #ea580c)',
                                      color: 'var(--calendar-unassigned-text, #9a3412)',
                                      fontSize: '0.66rem',
                                      fontWeight: 800,
                                      cursor: 'help',
                                    }}
                                  >
                                    <AlertTriangle size={11} color="#ea580c" style={{ flexShrink: 0 }} />
                                    <span>Doktor ayrıldı, atama bekliyor</span>
                                  </span>
                                )}
                              </div>
                              <select
                                value={hasActiveAssignedDoctor ? (selectedEvent.doctorId || '') : ''}
                                onChange={async (e) => {
                                  const val = e.target.value;
                                  const newStatus = val ? (selectedEvent.status === 'pending_assignment' ? 'scheduled' : selectedEvent.status) : 'pending_assignment';
                                  try {
                                    const res = await fetch(`/api/dental/appointments/${selectedEvent.id}`, {
                                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ doctorId: val || null, status: newStatus })
                                    });
                                    if (res.ok) {
                                      const updated = await res.json();
                                      const nextEv = { ...selectedEvent, ...updated, doctorId: val || null, status: newStatus };
                                      setEvents(prev => prev.map(ev => ev.id === updated.id ? nextEv : ev));
                                      setSelectedEvent(nextEv);
                                      if (val) {
                                        toast.success('👨‍⚕️ İlgili doktor güncellendi');
                                      } else {
                                        toast('ℹ️ İlgili doktor seçimi kaldırıldı', { icon: 'ℹ️' });
                                      }
                                      fetchData();
                                      loadPatientContextForEvent(nextEv);
                                    }
                                  } catch {
                                    toast.error('Doktor atanırken hata oluştu');
                                  }
                                }}
                                style={{
                                  width: '100%',
                                  fontSize: '0.78rem',
                                  padding: '6px 8px',
                                  borderRadius: 6,
                                  border: isDoctorUnassigned ? '1.5px solid var(--calendar-unassigned-border, #ea580c)' : '1px solid var(--input-border, #cbd5e1)',
                                  background: isDoctorUnassigned ? 'var(--calendar-unassigned-bg, #ffedd5)' : 'var(--input-bg, #ffffff)',
                                  color: isDoctorUnassigned ? 'var(--calendar-unassigned-text, #9a3412)' : 'var(--foreground)',
                                  fontWeight: 700,
                                }}
                              >
                                <option value="">⚠️ Boşa Çıktı — Hekim Seçiniz (Atama Bekliyor)</option>
                                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                            </>
                          );
                        })()}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--foreground-2)', marginBottom: 3, fontWeight: 600 }}>Tür</div>
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
                          style={{ width: '100%', fontSize: '0.78rem', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--input-border, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--foreground)', fontWeight: 500 }}
                        >
                          <option value="kontrol">Kontrol</option>
                          <option value="general">Normal</option>
                          <option value="urgent">Acil</option>
                          <option value="priority">Öncelikli</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--foreground-2)', marginBottom: 3, fontWeight: 600 }}>Durum</div>
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
                          style={{ width: '100%', fontSize: '0.78rem', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--input-border, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--foreground)', fontWeight: 500 }}
                        >
                          <option value="scheduled">🕒 Yanıt Bekliyor (Planlandı)</option>
                          <option value="confirmed">✅ Gelecek (Onaylandı)</option>
                          <option value="arrived_unconfirmed">🚶 Teyitsiz Geldi</option>
                          <option value="waiting_in_clinic">🏥 Klinikte Bekliyor</option>
                          <option value="in_progress">🔄 Devam Ediyor</option>
                          <option value="completed">✓ Tamamlandı</option>
                          <option value="postponed">⏳ Erteleme Talebi / Ertelendi</option>
                          <option value="cancelled">❌ Gelmiyor / İptal</option>
                          <option value="no_show">🚫 Gelmedi</option>
                          <option value="pending_assignment">⚠️ Atama Bekliyor</option>
                          <option value="pending_review">⚠️ Doğrulama Bekliyor</option>
                        </select>
                      </div>
                    </div>

                    {(selectedEvent.patientPreferredDate || selectedEvent.patientResponseNote) && (
                      <div style={{ marginTop: 8, padding: '7px 9px', borderRadius: 6, background: 'var(--input-bg, #ffffff)', border: '1px solid var(--input-border, #cbd5e1)', fontSize: '0.73rem', color: 'var(--foreground)' }}>
                        {selectedEvent.patientPreferredDate && (
                          <div style={{ fontWeight: 700, color: '#d97706' }}>
                            📅 Talep Edilen Yeni Tarih: {selectedEvent.patientPreferredDate}
                          </div>
                        )}
                        {selectedEvent.patientResponseNote && (
                          <div style={{ color: 'var(--foreground-2)', marginTop: selectedEvent.patientPreferredDate ? 2 : 0 }}>
                            💬 Hasta Notu: {selectedEvent.patientResponseNote}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--foreground-2)', marginBottom: 3, fontWeight: 600 }}>Hasta Şikayeti / İlk Talep</div>
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
                        style={{ width: '100%', fontSize: '0.76rem', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--input-border, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--foreground)', minHeight: 38, resize: 'vertical', boxSizing: 'border-box' }}
                      />
                    </div>

                    {selectedEvent.notes && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--foreground-2)', marginTop: 8, borderTop: '1px solid var(--input-border, #cbd5e1)', paddingTop: 6 }}>
                        📝 Randevu Notu: {selectedEvent.notes}
                      </div>
                    )}

                    {/* ── Tarih / Saat Değiştir (Randevu Bilgisi içinde en altta) ── */}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--input-border, #cbd5e1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <label htmlFor="edit-date" style={{ fontSize: '0.72rem', color: 'var(--foreground-2)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          📅 Tarih / Saat Değiştir
                        </label>
                        <input
                          type="date"
                          value={selectedEvent?.startTime ? new Date(selectedEvent.startTime).toLocaleDateString('sv') : ''}
                          id="edit-date"
                          onChange={async (e) => {
                            const dateVal = e.target.value;
                            if (!dateVal) return;
                            const sDate = new Date(selectedEvent.startTime);
                            const eDate = new Date(selectedEvent.endTime);
                            const startHH = String(sDate.getHours()).padStart(2, '0');
                            const startMM = String(sDate.getMinutes()).padStart(2, '0');
                            const endHH = String(eDate.getHours()).padStart(2, '0');
                            const endMM = String(eDate.getMinutes()).padStart(2, '0');
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
                                setCurrentDate(dateVal);
                                fetchData();
                                focusAppointmentOnCalendar(updated.id, updated.startTime, true);
                                toast.success(`📅 Randevu ${new Date(dateVal).toLocaleDateString('tr-TR')} tarihine taşındı`);
                              } else {
                                toast.error('Tarih güncellenemedi');
                              }
                            } catch {
                              toast.error('Tarih güncellenirken hata oluştu');
                            }
                          }}
                          style={{
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--input-border, #cbd5e1)',
                            background: 'var(--input-bg, #ffffff)',
                            color: 'var(--foreground)',
                            width: 145,
                          }}
                        />
                      </div>
                      <TimeRangeEditor
                        selectedEvent={selectedEvent}
                        onSave={async (startHH: string, startMM: string, endHH: string, endMM: string) => {
                          const dateEl = document.getElementById('edit-date') as HTMLInputElement;
                          const dateVal = dateEl?.value || (selectedEvent?.startTime ? new Date(selectedEvent.startTime).toLocaleDateString('sv') : '');
                          if (!dateVal) return;
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
                              setCurrentDate(dateVal);
                              fetchData();
                              focusAppointmentOnCalendar(updated.id, updated.startTime, true);
                              toast.success(`⏰ Randevu saati ${startHH}:${startMM} - ${endHH}:${endMM} olarak güncellendi`);
                            } else {
                              toast.error('Saat güncellenemedi');
                            }
                          } catch {
                            toast.error('Saat güncellenirken hata oluştu');
                          }
                        }}
                      />
                    </div>

                    {selectedEvent.status === 'pending_review' && (
                      <button onClick={() => openAiReview(selectedEvent)} style={{ marginTop: 10, width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--button-text, #ffffff)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                        Randevuyu Doğrula
                      </button>
                    )}
                  </div>

                  {/* ── Tedavi Planı ── */}
                  <div style={{ padding: 12, borderRadius: 10, background: 'var(--card-inner, #f1f5f9)', border: '1px solid var(--input-border, #cbd5e1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tedavi Planı</span>
                        {patientTreatments.length > 0 && (
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: 999,
                            background: 'var(--badge-clinic-bg, #e0f2fe)',
                            border: '1px solid var(--badge-clinic-border, #bae6fd)',
                            color: 'var(--badge-clinic-text, #0369a1)',
                          }}>
                            {patientTreatments.length}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {Boolean(displayPatientId || selectedEvent) && (
                          <button
                            onClick={() => setShowPastTreatmentsModal(true)}
                            style={{
                              fontSize: '0.73rem',
                              fontWeight: 600,
                              padding: '6px 10px',
                              borderRadius: 8,
                              border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                              background: 'var(--btn-clinic-secondary-bg, #eff6ff)',
                              color: 'var(--btn-clinic-secondary-text, #0284c7)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            📋 Tüm Kayıtlar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setTreatmentDeleteError(null);
                            setShiftContextMenu(null);
                            setEventContextMenu(null);
                            setEditingGroup(null);
                            setShowTedaviForm(true);
                          }}
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            padding: '7px 14px',
                            borderRadius: 8,
                            border: '1px solid var(--btn-clinic-primary-border, #0284c7)',
                            background: 'var(--btn-clinic-primary-bg, #0284c7)',
                            color: '#ffffff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.2)',
                          }}
                        >
                          + Tedavi Ekle
                        </button>
                      </div>
                    </div>

                    {treatmentDeleteError && (
                      <div style={{ fontSize: '0.72rem', color: '#ef4444', marginBottom: 8, fontWeight: 600 }}>
                        ⚠️ {treatmentDeleteError}
                      </div>
                    )}

                    {patientTreatments.length === 0 ? (
                      <div style={{
                        fontSize: '0.76rem',
                        color: 'var(--foreground-2)',
                        padding: '16px 14px',
                        background: 'var(--input-bg, #ffffff)',
                        borderRadius: 8,
                        textAlign: 'center',
                        border: '1px dashed var(--input-border, #cbd5e1)',
                      }}>
                        Hastaya ait aktif tedavi planı bulunmuyor.<br />
                        Yukarıdaki <strong style={{ color: 'var(--accent, #0284c7)' }}>+ Tedavi Ekle</strong> butonundan yeni tedavi planı oluşturabilirsiniz.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {Array.isArray(treatmentGroups) && treatmentGroups.map((g: any) => {
                          const groupTreatments = patientTreatments.filter((t: any) => t.groupId === g.id);
                          if (groupTreatments.length === 0) return null;
                          const completedCount = groupTreatments.filter((t: any) => t.status === 'completed').length;
                          const groupTotal = groupTreatments.reduce((sum: number, t: any) => sum + Number(t.cost || 0), 0);
                          const uniqueGroupDocIds = Array.from(new Set(groupTreatments.flatMap((t: any) => getTreatmentDoctorIds(t))));
                          const progressPct = Math.round((completedCount / groupTreatments.length) * 100);

                          return (
                            <div key={g.id} style={{ background: 'var(--card-bg, #ffffff)', borderRadius: 10, border: '1px solid var(--input-border, #cbd5e1)', overflow: 'hidden' }}>
                              <div
                                onClick={() => handleGroupHeaderClick(g)}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 6,
                                  padding: '9px 11px',
                                  background: 'var(--input-bg, #ffffff)',
                                  borderBottom: '1px solid var(--input-border, #cbd5e1)',
                                  cursor: 'pointer',
                                }}
                                title="Takvimde bu plan tarihine git"
                              >
                                {/* Üst Satır: Klasör İkonu + Grup Adı + Düzenle / Sil */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                    <FolderKanban size={15} style={{ color: 'var(--accent, #0284c7)', flexShrink: 0 }} />
                                    <span
                                      style={{
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        color: 'var(--foreground)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                      title={g.name}
                                    >
                                      {g.name}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setEditingGroup({ ...g, treatments: groupTreatments });
                                        setShowTedaviForm(true);
                                      }}
                                      style={{
                                        background: 'var(--btn-clinic-secondary-bg, #eff6ff)',
                                        border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                                        color: 'var(--btn-clinic-secondary-text, #0284c7)',
                                        borderRadius: 6,
                                        padding: '4px 8px',
                                        cursor: 'pointer',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                      }}
                                      title="Planı Düzenle"
                                    >
                                      <Pencil size={11} /> Düzenle
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
                                            refreshTreatmentsList();
                                          },
                                        });
                                      }}
                                      style={{
                                        background: 'var(--card-inner, #f1f5f9)',
                                        border: '1px solid var(--input-border, #cbd5e1)',
                                        color: 'var(--danger, #ef4444)',
                                        borderRadius: 6,
                                        padding: '4px 7px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                      title="Grubu Sil"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* Alt Satır: İşlem Sayısı + Katılan Hekim Sayısı + Toplam Tutar */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{
                                      fontSize: '0.67rem',
                                      padding: '2px 8px',
                                      borderRadius: 999,
                                      background: completedCount === groupTreatments.length ? 'var(--btn-clinic-mint-bg, #f0fdf4)' : 'var(--badge-clinic-bg, #e0f2fe)',
                                      border: completedCount === groupTreatments.length ? '1px solid var(--btn-clinic-mint-border, #86efac)' : '1px solid var(--badge-clinic-border, #bae6fd)',
                                      color: completedCount === groupTreatments.length ? 'var(--btn-clinic-mint-text, #15803d)' : 'var(--badge-clinic-text, #0369a1)',
                                      fontWeight: 700,
                                    }}>
                                      {completedCount > 0 ? `${completedCount}/${groupTreatments.length} Yapıldı` : `${groupTreatments.length} İşlem`}
                                    </span>
                                    {uniqueGroupDocIds.length > 1 && (
                                      <span style={{
                                        fontSize: '0.66rem',
                                        padding: '2px 7px',
                                        borderRadius: 999,
                                        background: 'var(--card-inner, #f1f5f9)',
                                        border: '1px solid var(--input-border, #cbd5e1)',
                                        color: 'var(--foreground-2)',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 3,
                                      }}>
                                        <Users size={11} /> {uniqueGroupDocIds.length} Hekim
                                      </span>
                                    )}
                                  </div>
                                  {groupTotal > 0 && (
                                    <span style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--accent, #0284c7)' }}>
                                      {groupTotal.toLocaleString('tr-TR')} ₺
                                    </span>
                                  )}
                                </div>

                                {completedCount > 0 && (
                                  <div style={{ height: 4, borderRadius: 999, background: 'var(--card-inner, #e2e8f0)', overflow: 'hidden' }}>
                                    <div
                                      style={{
                                        width: `${progressPct}%`,
                                        height: '100%',
                                        background: completedCount === groupTreatments.length ? '#10b981' : 'var(--accent, #0284c7)',
                                        transition: 'width 0.25s ease',
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {renderSmartGroupedTreatments(groupTreatments, g, g.id)}
                              </div>
                            </div>
                          );
                        })}

                        {/* Ungrouped treatments if any */}
                        {renderSmartGroupedTreatments(patientTreatments.filter((t: any) => !t.groupId), undefined, 'ungrouped')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                  style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #f59e0b', background: 'var(--card-inner)', color: '#d97706', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  ⚠️ Saati Onayla
                </button>
              )}
              <button onClick={handleDeleteEvent} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--danger, #ef4444)', background: 'var(--card-inner)', color: 'var(--danger, #ef4444)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                Randevuyu Sil
              </button>
            </div>
          </div>
        </>
      )}
      {/* Hızlı Randevu / Tarih Atama Modalı (Modern DayPicker & Seçilen Hekim Günlük Takvim Görünümü) */}
      {fastScheduleTreatment && selectedEvent && (
        <FastScheduleModal
          treatment={fastScheduleTreatment}
          patientTreatments={patientTreatments}
          patientInfo={patientInfo || patientProfileData?.patient || { name: selectedEvent.title?.split(' - ')[0] }}
          selectedEvent={selectedEvent.patientId ? selectedEvent : { ...selectedEvent, patientId: patientInfo?.id || selectedEvent.patientId || null }}
          doctors={doctors}
          shifts={shifts}
          existingEvents={events}
          doctorLeaves={doctorLeaves}
          workingHours={workingHours}
          onClose={() => setFastScheduleTreatment(null)}
          onSuccess={(targetAppt, targetDate) => {
            setFastScheduleTreatment(null);
            if (targetAppt?.doctorId) {
              setSelectedDoctorIds((prev: string[]) =>
                prev.includes(targetAppt.doctorId) ? prev : [...prev, targetAppt.doctorId]
              );
            }
            fetchData();
            fetch('/api/dental/appointments')
              .then(r => r.json())
              .then(d => {
                setEvents(d);
                if (targetAppt) {
                  const freshAppt = d.find((ev: any) => ev.id === targetAppt.id) || targetAppt;
                  if (freshAppt?.doctorId) {
                    setSelectedDoctorIds((prev: string[]) =>
                      prev.includes(freshAppt.doctorId) ? prev : [...prev, freshAppt.doctorId]
                    );
                  }
                  setSelectedEvent(freshAppt);
                  loadPatientContextForEvent({
                    ...freshAppt,
                    patientId: freshAppt.patientId || selectedEvent.patientId || patientInfo?.id || null,
                  });
                  if (targetDate) setCurrentDate(targetDate);
                  focusAppointmentOnCalendar(freshAppt.id, freshAppt.startTime);
                } else {
                  loadPatientContextForEvent({
                    ...selectedEvent,
                    patientId: selectedEvent.patientId || patientInfo?.id || null,
                  });
                  if (targetDate) setCurrentDate(targetDate);
                }
              });
          }}
        />
      )}

      {/* Tedavi Ekle Modal */}
      {showTedaviForm && selectedEvent && (
        <AdvancedTedaviModal
          selectedEvent={selectedEvent.patientId ? selectedEvent : { ...selectedEvent, patientId: patientInfo?.id || selectedEvent.patientId || null }}
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
            loadPatientContextForEvent({ ...selectedEvent, patientId: selectedEvent.patientId || patientInfo?.id || null });
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

      {/* Tüm Kayıtlar & İşlem Geçmişi Modalı */}
      {showPastTreatmentsModal && (() => {
        const displayPatientId =
          patientInfo?.id ||
          selectedEvent?.patientId ||
          patients.find((p: any) =>
            (p.name || '').trim().toLocaleLowerCase('tr-TR') ===
            (selectedEvent?.intakePatientName || selectedEvent?.title?.split(' - ')[0] || '').trim().toLocaleLowerCase('tr-TR')
          )?.id ||
          null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'var(--modal-overlay, rgba(15, 23, 42, 0.6))', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100002, padding: 16 }}>
            <div style={{ width: 'min(680px, calc(100vw - 24px))', maxWidth: 680, padding: 20, borderRadius: 14, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', border: '1.5px solid var(--input-border)', boxShadow: 'var(--pc-modal-shadow)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--input-border)' }}>
                <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: 'var(--foreground)' }}>📋 Tüm Kayıtlar & İşlem Geçmişi</h3>
                <button onClick={() => setShowPastTreatmentsModal(false)} style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, width: 28, height: 28, color: 'var(--foreground-2)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
                <PatientRecordsTimeline
                  patientId={displayPatientId}
                  appointments={events.filter(e => e.patientId === displayPatientId)}
                  treatments={patientTreatments}
                  doctors={doctors}
                />
              </div>
            </div>
          </div>
        );
      })()}

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
          shifts={shifts}
          doctorLeaves={doctorLeaves}
          onClose={() => {
            setQuickCreateMenu(null);
            window.dispatchEvent(new Event('clear-calendar-draft'));
          }}
          onSave={async (data) => {
            const apptDate = quickCreateMenu.start.slice(0, 10);
            const targetDocId = data.doctorId !== undefined ? data.doctorId : (quickCreateMenu.doctorId || null);
            const sTime = data.startTime || quickCreateMenu.start.slice(11, 16);
            const eTime = data.endTime || quickCreateMenu.end.slice(11, 16);
            const [sH, sM] = String(sTime || '00:00').split(':').map(Number);
            const [eH, eM] = String(eTime || '00:00').split(':').map(Number);
            const startMin = (sH || 0) * 60 + (sM || 0);
            const endMin = (eH || 0) * 60 + (eM || 0);

            const isShiftCoveringRange = (shift: any) => {
              const [shH, shM] = String(shift.startTime || '00:00').split(':').map(Number);
              const [ehH, ehM] = String(shift.endTime || '23:59').split(':').map(Number);
              const shiftStartMin = (shH || 0) * 60 + (shM || 0);
              let shiftEndMin = (ehH || 0) * 60 + (ehM || 0);
              if (shiftEndMin <= shiftStartMin) shiftEndMin += 1440;
              let evStart = startMin;
              let evEnd = endMin;
              if (evEnd <= evStart) evEnd += 1440;
              if (shiftEndMin > 1440 && evStart < shiftStartMin) {
                evStart += 1440;
                evEnd += 1440;
              }
              return evStart >= shiftStartMin && evEnd <= shiftEndMin;
            };

            const findDoctorLeaveConflict = (docId: string) => {
              return (doctorLeaves || []).find((l: any) => {
                if (l.doctorId !== docId || String(l.date || '').slice(0, 10) !== apptDate) return false;
                if (l.isFullDay) return true;
                const [lSH, lSM] = String(l.startTime || '00:00').split(':').map(Number);
                const [lEH, lEM] = String(l.endTime || '23:59').split(':').map(Number);
                const lStart = (lSH || 0) * 60 + (lSM || 0);
                const lEnd = (lEH || 0) * 60 + (lEM || 0);
                return startMin < lEnd && endMin > lStart;
              });
            };

            if (targetDocId) {
              const docObj = doctors.find(d => d.id === targetDocId);
              const docName = docObj?.name ? `Dr. ${docObj.name}` : 'Seçilen hekim';
              const docShifts = (shifts || []).filter(
                (s: any) => s.userId === targetDocId && String(s.date || '').slice(0, 10) === apptDate
              );
              if (docShifts.length === 0) {
                toast.error(`⚠️ ${docName} için bu tarihte (${apptDate}) tanımlı vardiya bulunmamaktadır. Randevu eklenemez!`);
                return;
              }
              if (!docShifts.some(isShiftCoveringRange)) {
                const shiftRanges = docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ');
                toast.error(`⚠️ Seçilen randevu saati (${sTime} - ${eTime}), ${docName} vardiya saatleri (${shiftRanges}) dışındadır. Randevu eklenemez!`);
                return;
              }
              const conflictLeave = findDoctorLeaveConflict(targetDocId);
              if (conflictLeave) {
                const rangeText = conflictLeave.isFullDay ? 'Tüm gün' : `${conflictLeave.startTime} - ${conflictLeave.endTime}`;
                toast.error(`⚠️ ${docName} bu saatlerde (${rangeText}) izinlidir. Randevu eklenemez!`);
                return;
              }
            } else {
              const dayShifts = (shifts || []).filter(
                (s: any) => String(s.date || '').slice(0, 10) === apptDate
              );
              if (dayShifts.length === 0) {
                toast.error(`⚠️ Bu tarihte (${apptDate}) tanımlı vardiya bulunmamaktadır. Vardiya olmadan randevu eklenemez!`);
                return;
              }
              const coveringShifts = dayShifts.filter(isShiftCoveringRange);
              if (coveringShifts.length === 0) {
                const shiftRanges = Array.from(new Set(dayShifts.map((s: any) => `${s.startTime}-${s.endTime}`))).join(', ');
                toast.error(`⚠️ Seçilen randevu saati (${sTime} - ${eTime}), bu tarihteki vardiya saatleri (${shiftRanges}) dışındadır. Randevu eklenemez!`);
                return;
              }
              const hasAvailableShiftDoctor = coveringShifts.some((s: any) => !s.userId || !findDoctorLeaveConflict(s.userId));
              if (!hasAvailableShiftDoctor) {
                toast.error(`⚠️ Seçilen saat aralığında (${sTime} - ${eTime}) vardiyası olan hekim(ler) izinlidir. Randevu eklenemez!`);
                return;
              }
            }

            if (data.type === 'patient_appointment') {
              let pId = data.patientId;
              if (!pId) {
                // 1. Create Patient
                try {
                  const ptRes = await fetch('/api/dental/patients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      firstName: data.firstName,
                      lastName: data.lastName,
                      name: data.name,
                      phone: data.phone,
                      tcIdentity: data.tcIdentity || data.tc || '',
                      email: data.email,
                      gender: data.gender || '',
                      birthDate: data.birthDate || '',
                      smsOptOut: Boolean(data.smsOptOut),
                      emailOptOut: Boolean(data.emailOptOut),
                      whatsappOptOut: Boolean(data.whatsappOptOut),
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
                } catch { }
              }

              if (!pId) {
                toast.error('Lütfen geçerli bir hasta seçin veya ekleyin');
                return;
              }

              // 1. Hücreye Randevuyu Oluştur
              try {
                const apptDate = quickCreateMenu.start.slice(0, 10);
                const startStr = data.startTime ? `${apptDate}T${data.startTime}:00+03:00` : (quickCreateMenu.start.includes('+') ? quickCreateMenu.start : `${quickCreateMenu.start}+03:00`);
                const endStr = data.endTime ? `${apptDate}T${data.endTime}:00+03:00` : (quickCreateMenu.end.includes('+') ? quickCreateMenu.end : `${quickCreateMenu.end}+03:00`);
                const apptDoctorId = data.doctorId !== undefined ? data.doctorId : (quickCreateMenu.doctorId || null);
                await fetch('/api/dental/appointments', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    patientId: pId,
                    doctorId: apptDoctorId,
                    title: data.title || 'Muayene',
                    startTime: startStr,
                    endTime: endStr,
                    type: 'Muayene',
                    status: apptDoctorId ? 'scheduled' : 'pending_assignment'
                  })
                });
              } catch {
                console.error('Randevu oluşturulurken hata');
              }

              // 2. Ödemeyi Kaydet
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
                toast.success('Randevu ve ödeme başarıyla kaydedildi');
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
          style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
          onClick={() => setEventContextMenu(null)}
          onContextMenu={e => {
            e.preventDefault()
            setEventContextMenu(null)
          }}
          onWheel={e => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <div
            className="context-menu-container"
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: eventContextMenu.y, left: eventContextMenu.x, zIndex: 99999,
              background: 'var(--card-bg)', border: '1.5px solid var(--input-border)',
              borderRadius: 10, padding: 12, boxShadow: 'var(--pc-modal-shadow, 0 10px 40px rgba(0,0,0,0.5))', width: 220
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12 }}>Randevu Ata</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 4 }}>İlgili Doktor</div>
              <select
                value={eventContextMenu.doctorId}
                onChange={e => setEventContextMenu({ ...eventContextMenu, doctorId: e.target.value })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
              >
                <option value="">İlgili Doktor Seçiniz (Opsiyonel)</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 4 }}>Tarih / Saat Aralığı</div>
              <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                <input
                  type="date"
                  value={eventContextMenu.date}
                  onChange={e => setEventContextMenu({ ...eventContextMenu, date: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="time"
                    value={eventContextMenu.startTime}
                    onChange={e => setEventContextMenu({ ...eventContextMenu, startTime: e.target.value })}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
                  />
                  <input
                    type="time"
                    value={eventContextMenu.endTime}
                    onChange={e => setEventContextMenu({ ...eventContextMenu, endTime: e.target.value })}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button onClick={() => setEventContextMenu(null)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--card-inner)', color: 'var(--foreground-2)', cursor: 'pointer', fontSize: '0.8rem' }}>İptal</button>
              <button onClick={async () => {
                const startTime = new Date(`${eventContextMenu.date}T${eventContextMenu.startTime}:00+03:00`)
                const endTime = new Date(`${eventContextMenu.date}T${eventContextMenu.endTime}:00+03:00`)
                const newStatus = eventContextMenu.doctorId ? 'scheduled' : 'pending_assignment'
                await fetch(`/api/dental/appointments/${eventContextMenu.event.id}`, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ doctorId: eventContextMenu.doctorId || null, startTime: startTime.toISOString(), endTime: endTime.toISOString(), status: newStatus })
                })
                setEventContextMenu(null)
                fetchData()
              }} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#ffffff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}><span style={{ color: '#ffffff' }}>Kaydet</span></button>
            </div>
          </div>
        </div>
      )}

      {unassignedListMenu && (
        <div
          {...unassignedBackdropDismiss}
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

      {(!showTedaviForm && shiftContextMenu) && (() => {
        const activeDoctorShift = shiftContextMenu.doctorId
          ? shifts.find((s: any) => s.userId === shiftContextMenu.doctorId && s.date === shiftContextMenu.date)
          : undefined
        return (
          <div className="context-menu-container">
            <ShiftContextMenu
              x={shiftContextMenu.x}
              y={shiftContextMenu.y}
              doctorId={shiftContextMenu.doctorId}
              doctorName={doctors.find(d => d.id === shiftContextMenu.doctorId)?.name}
              date={shiftContextMenu.date}
              initialStartTime={activeDoctorShift?.startTime || workingHours?.startTime || '09:00'}
              initialEndTime={activeDoctorShift?.endTime || (workingHours?.endTime === '24:00' ? '20:00' : workingHours?.endTime) || '19:00'}
              existingShiftId={activeDoctorShift?.id}
              users={doctors}
              onClose={() => setShiftContextMenu(null)}
              onDeleteShift={async (shiftId) => {
                try {
                  const res = await fetch(`/api/shifts/${shiftId}`, { method: 'DELETE' })
                  if (!res.ok) throw new Error('Mesai silinemedi')
                  setShiftContextMenu(null)
                  toast.success('Mesai silindi')
                  fetchData()
                } catch {
                  toast.error('Mesai silinemedi')
                }
              }}
              onOpenLeaveModal={(docId, dt) => {
                setLeaveModalState({ isOpen: true, doctorId: docId, date: dt })
              }}
              onSave={async (shift) => {
                try {
                  if (shift.repeatMode === 'weekly' || shift.repeatMode === 'monthly') {
                    const base = new Date(`${shift.date}T12:00:00`)
                    let rangeStart = shift.date
                    let rangeEnd = shift.date
                    if (shift.repeatMode === 'weekly') {
                      const day = base.getDay()
                      const diffToMon = (day + 6) % 7
                      const mon = new Date(base)
                      mon.setDate(base.getDate() - diffToMon)
                      const sun = new Date(mon)
                      sun.setDate(mon.getDate() + 6)
                      rangeStart = mon.toISOString().slice(0, 10)
                      rangeEnd = sun.toISOString().slice(0, 10)
                    } else {
                      const first = new Date(base.getFullYear(), base.getMonth(), 1, 12, 0, 0)
                      const last = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12, 0, 0)
                      rangeStart = first.toISOString().slice(0, 10)
                      rangeEnd = last.toISOString().slice(0, 10)
                    }
                    await fetch('/api/shifts/plan/apply', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        doctorIds: [shift.userId],
                        startDate: rangeStart,
                        endDate: rangeEnd,
                        daysOfWeek: [1, 2, 3, 4, 5, 6],
                        slots: [{ startTime: shift.startTime, endTime: shift.endTime, shiftType: shift.shiftType }],
                        overwriteAll: true,
                      }),
                    })
                  } else {
                    await fetch('/api/shifts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(shift),
                    })
                  }
                  setShiftContextMenu(null)
                  toast.success('Mesai güncellendi')
                  fetchData()
                } catch {
                  toast.error('Mesai kaydedilemedi')
                }
              }}
            />
          </div>
        )
      })()}

      {aiReviewModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-modal="true" style={{ width: 'calc(100vw - 24px)', maxWidth: 460, maxHeight: '90vh', background: 'var(--card-bg)', border: '1.5px solid var(--input-border)', borderRadius: 14, boxShadow: 'var(--pc-modal-shadow)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header (Yeni Randevu Standardı) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#2563eb', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', boxShadow: 'var(--pc-clay-primary)', flexShrink: 0 }}>📅</div>
                <div>
                  <div style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2 }}>Randevu Doğrulama</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginTop: 2 }}>Kaynak: {aiReviewModal.intakeSource || 'AI'} · Geçici rezervasyonu doğrulayın</div>
                </div>
              </div>
              <button onClick={() => setAiReviewModal(null)} aria-label="Kapat" style={{ width: 28, height: 28, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--pc-clay-btn)' }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 20px', flex: 1, overflowY: 'auto', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--card-inner)', padding: 14, borderRadius: 10, border: '1px solid var(--input-border)', display: 'grid', gap: 12 }}>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--foreground)' }}>Hasta ve Randevu Bilgileri</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>Hasta Eşleştir</label>
                  <input value={aiReviewPatientQuery} onChange={e => setAiReviewPatientQuery(e.target.value)} placeholder="Ad veya telefon ile ara" style={{ ...inputStyle, width: '100%' }} />
                  <select value={aiReviewCreatePatient ? '__new__' : aiReviewPatientId} onChange={e => {
                    const value = e.target.value; setAiReviewCreatePatient(value === '__new__'); setAiReviewPatientId(value === '__new__' ? '' : value)
                    const patient = patients.find(p => p.id === value); if (patient) { setAiReviewName(patient.name || ''); setAiReviewPhone(patient.phone || '') }
                  }} style={{ ...inputStyle, width: '100%' }}>
                    <option value="">Hasta seçin</option>
                    <option value="__new__">+ Yeni hasta oluştur</option>
                    {patients.filter(p => {
                      const query = aiReviewPatientQuery.trim().toLocaleLowerCase('tr-TR')
                      return !query || `${p.name || ''} ${p.phone || ''}`.toLocaleLowerCase('tr-TR').includes(query) || matchesPhoneSearch(p.phone, aiReviewPatientQuery)
                    }).map(p => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` · ${p.phone}` : ''}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>Ad Soyad<input value={aiReviewName} onChange={e => setAiReviewName(e.target.value)} style={{ ...inputStyle, width: '100%', marginTop: 4 }} /></label>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>Telefon<PhoneMaskedInput value={aiReviewPhone} onValueChange={setAiReviewPhone} placeholder="0 (5XX) XXX XX XX" style={{ ...inputStyle, width: '100%', marginTop: 4 }} /></label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>Başlangıç<input type="datetime-local" value={aiReviewStart} onChange={e => setAiReviewStart(e.target.value)} style={{ ...inputStyle, width: '100%', marginTop: 4 }} /></label>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>Bitiş<input type="datetime-local" value={aiReviewEnd} onChange={e => setAiReviewEnd(e.target.value)} style={{ ...inputStyle, width: '100%', marginTop: 4 }} /></label>
                </div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>Doktor (opsiyonel)<select value={aiReviewDoctorId} onChange={e => setAiReviewDoctorId(e.target.value)} style={{ ...inputStyle, width: '100%', marginTop: 4 }}><option value="">Atama bekliyor</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>Hasta şikâyeti / talebi<textarea value={aiReviewComplaint} onChange={e => setAiReviewComplaint(e.target.value)} style={{ ...inputStyle, width: '100%', minHeight: 60, marginTop: 4, resize: 'vertical' }} /></label>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)' }}>İptal nedeni <input value={aiReviewRejectReason} onChange={e => setAiReviewRejectReason(e.target.value)} placeholder="Yalnızca iptal edilecekse zorunlu" style={{ ...inputStyle, width: '100%', marginTop: 4 }} /></label>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
              <button disabled={aiReviewSaving} onClick={rejectAiReview} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--danger)', background: 'var(--card-bg)', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700, boxShadow: 'var(--pc-clay-btn)' }}>İptal Et</button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setAiReviewModal(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--card-bg)', color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600, boxShadow: 'var(--pc-clay-btn)' }}>Vazgeç</button>
                <button disabled={aiReviewSaving} onClick={approveAiReview} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#ffffff', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 700, boxShadow: 'var(--pc-clay-primary)' }}><span style={{ color: '#ffffff' }}>Onayla</span></button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PatientSidePanel
        isOpen={patientPanelOpen}
        onClose={() => setPatientPanelOpen(false)}
        patients={patients}
        doctors={doctors}
        shifts={shifts}
        onFocusAppointment={(appointmentId, startTime) => {
          const event = events.find(candidate => candidate.id === appointmentId)
          if (!event) { toast.error('Bağlı randevu bulunamadı'); return }
          setPatientPanelOpen(false)
          handleEventClick(appointmentId, event)
          focusAppointmentOnCalendar(appointmentId, startTime)
        }}
        onPlanTreatment={(treatment, patient) => {
          const startTime = treatment.plannedDate || `${currentDate}T10:00:00+03:00`
          setPatientInfo(patient)
          setSelectedEvent({
            id: `draft-${treatment.id}`,
            patientId: patient.id,
            doctorId: treatment.doctorId || null,
            title: `${patient.name} - ${treatment.procedureName}`,
            startTime,
            endTime: new Date(new Date(startTime).getTime() + 30 * 60000).toISOString(),
            status: 'pending_assignment',
            type: 'Tedavi',
          })
          setFastScheduleTreatment(treatment)
        }}
      />

      <DoctorLeaveModal
        isOpen={leaveModalState.isOpen}
        onClose={() => setLeaveModalState({ isOpen: false })}
        doctors={doctors}
        events={events}
        shifts={shifts}
        initialDoctorId={leaveModalState.doctorId}
        initialDate={leaveModalState.date || currentDate}
        onSuccess={() => {
          fetchData()
          if (selectedEvent) {
            loadPatientContextForEvent({
              ...selectedEvent,
              patientId: selectedEvent.patientId || patientInfo?.id || null,
            })
          }
        }}
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

      <AddPatientModal
        isOpen={showAddPatientModal}
        onClose={() => setShowAddPatientModal(false)}
        onSuccess={(created) => {
          if (created) {
            setPatients(prev => [created, ...(prev || [])])
          }
          fetch('/api/dental/patients')
            .then(r => r.ok ? r.json() : null)
            .then(pats => {
              if (pats && Array.isArray(pats)) setPatients(pats.filter((patient: { isArchived?: boolean }) => !patient.isArchived))
            })
            .catch(() => { })
        }}
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
