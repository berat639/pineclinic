import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { tr } from 'date-fns/locale';
import { format } from 'date-fns';
import {
  Calendar as CalendarIcon,
  Clock,
  X,
  User,
  Check,
  Lock,
  CalendarOff,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
  Link2,
  Layers,
} from 'lucide-react';
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss';
import TreatmentDoctorMultiSelect from './TreatmentDoctorMultiSelect';
import type { DoctorLeaveItem } from './DoctorLeaveModal';

export interface TreatmentColorTheme {
  accent: string;
  softBg: string;
  softBorder: string;
  badgeBg: string;
  chipBg: string;
  badgeText: string;
  darkBg: string;
  darkText: string;
}

export const CLINICAL_TREATMENT_PALETTE: TreatmentColorTheme[] = [
  {
    // 0: Dolgu / Restoratif — Medikal Mavi
    accent: '#0284c7',
    softBg: '#e0f2fe',
    softBorder: '#7dd3fc',
    badgeBg: '#bae6fd',
    chipBg: '#e0f2fe',
    badgeText: '#0369a1',
    darkBg: '#0c4a6e',
    darkText: '#e0f2fe',
  },
  {
    // 1: Kanal / Endodonti — Klinik Mor
    accent: '#8b5cf6',
    softBg: '#f3e8ff',
    softBorder: '#c4b5fd',
    badgeBg: '#ede9fe',
    chipBg: '#f3e8ff',
    badgeText: '#6d28d9',
    darkBg: '#3b0764',
    darkText: '#ede9fe',
  },
  {
    // 2: Çekim / Cerrahi — Mercan Kırmızı
    accent: '#ef4444',
    softBg: '#fee2e2',
    softBorder: '#fca5a5',
    badgeBg: '#fecaca',
    chipBg: '#fee2e2',
    badgeText: '#b91c1c',
    darkBg: '#450a0a',
    darkText: '#fee2e2',
  },
  {
    // 3: İmplantoloji — Turkuaz / Teal
    accent: '#0d9488',
    softBg: '#ccfbf1',
    softBorder: '#5eead4',
    badgeBg: '#99f6e4',
    chipBg: '#ccfbf1',
    badgeText: '#0f766e',
    darkBg: '#134e4a',
    darkText: '#ccfbf1',
  },
  {
    // 4: Zirkonyum / Protez / Kuron — Kehribar / Amber
    accent: '#d97706',
    softBg: '#fef3c7',
    softBorder: '#fcd34d',
    badgeBg: '#fde68a',
    chipBg: '#fef3c7',
    badgeText: '#b45309',
    darkBg: '#451a03',
    darkText: '#fef3c7',
  },
  {
    // 5: Detartraj / Temizlik / Perio — Nane Yeşili
    accent: '#16a34a',
    softBg: '#dcfce7',
    softBorder: '#86efac',
    badgeBg: '#bbf7d0',
    chipBg: '#dcfce7',
    badgeText: '#15803d',
    darkBg: '#052e16',
    darkText: '#dcfce7',
  },
  {
    // 6: Muayene / Ortodonti / Röntgen — İndigo
    accent: '#6366f1',
    softBg: '#e0e7ff',
    softBorder: '#a5b4fc',
    badgeBg: '#c7d2fe',
    chipBg: '#e0e7ff',
    badgeText: '#4338ca',
    darkBg: '#1e1b4b',
    darkText: '#e0e7ff',
  },
  {
    // 7: Pedodonti / Estetik — Gül Kurusu
    accent: '#db2777',
    softBg: '#fce7f3',
    softBorder: '#f9a8d4',
    badgeBg: '#fbcfe8',
    chipBg: '#fce7f3',
    badgeText: '#be185d',
    darkBg: '#500724',
    darkText: '#fce7f3',
  },
];

function mixHexColors(hex: string, targetHex: string, weight: number): string {
  const clean1 = hex.replace('#', '');
  const clean2 = targetHex.replace('#', '');
  const r1 = parseInt(clean1.slice(0, 2), 16) || 0;
  const g1 = parseInt(clean1.slice(2, 4), 16) || 0;
  const b1 = parseInt(clean1.slice(4, 6), 16) || 0;
  const r2 = parseInt(clean2.slice(0, 2), 16) || 0;
  const g2 = parseInt(clean2.slice(2, 4), 16) || 0;
  const b2 = parseInt(clean2.slice(4, 6), 16) || 0;
  const r = Math.round(r1 * (1 - weight) + r2 * weight);
  const g = Math.round(g1 * (1 - weight) + g2 * weight);
  const b = Math.round(b1 * (1 - weight) + b2 * weight);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function deriveThemeFromHex(rawHex: string): TreatmentColorTheme {
  const norm = rawHex.trim().toLowerCase();
  const exactMatch = CLINICAL_TREATMENT_PALETTE.find((p) => p.accent.toLowerCase() === norm);
  if (exactMatch) return exactMatch;

  // Bilinen klinik renk eşleştirmeleri
  if (norm === '#2563eb' || norm === '#3b82f6' || norm === '#0ea5e9' || norm === '#075cff') {
    return { ...CLINICAL_TREATMENT_PALETTE[0], accent: rawHex };
  }
  if (norm === '#7c3aed' || norm === '#a855f7' || norm === '#9333ea') {
    return { ...CLINICAL_TREATMENT_PALETTE[1], accent: rawHex };
  }
  if (norm === '#dc2626' || norm === '#f43f5e' || norm === '#e11d48') {
    return { ...CLINICAL_TREATMENT_PALETTE[2], accent: rawHex };
  }
  if (norm === '#14b8a6' || norm === '#06b6d4' || norm === '#0891b2') {
    return { ...CLINICAL_TREATMENT_PALETTE[3], accent: rawHex };
  }
  if (norm === '#f59e0b' || norm === '#ea580c' || norm === '#f97316') {
    return { ...CLINICAL_TREATMENT_PALETTE[4], accent: rawHex };
  }
  if (norm === '#10b981' || norm === '#22c55e' || norm === '#059669') {
    return { ...CLINICAL_TREATMENT_PALETTE[5], accent: rawHex };
  }
  if (norm === '#4f46e5') {
    return { ...CLINICAL_TREATMENT_PALETTE[6], accent: rawHex };
  }
  if (norm === '#ec4899') {
    return { ...CLINICAL_TREATMENT_PALETTE[7], accent: rawHex };
  }

  const softBg = mixHexColors(norm, '#ffffff', 0.86);
  const badgeBg = mixHexColors(norm, '#ffffff', 0.76);
  const softBorder = mixHexColors(norm, '#ffffff', 0.45);
  const badgeText = mixHexColors(norm, '#0f172a', 0.35);
  const darkBg = mixHexColors(norm, '#0f172a', 0.72);
  const darkText = mixHexColors(norm, '#ffffff', 0.82);

  return {
    accent: rawHex,
    softBg,
    softBorder,
    badgeBg,
    chipBg: softBg,
    badgeText,
    darkBg,
    darkText,
  };
}

export function getTreatmentColorTheme(
  nameOrTreatment?: any,
  fallbackIdx = 0
): TreatmentColorTheme {
  // 1. Açıkça belirtilmiş hex renk kodu kontrolü
  const explicitColor =
    typeof nameOrTreatment === 'string' && /^#[0-9a-fA-F]{6}$/.test(nameOrTreatment.trim())
      ? nameOrTreatment.trim()
      : typeof nameOrTreatment === 'object' && nameOrTreatment !== null
        ? nameOrTreatment.color ||
        nameOrTreatment.metadata?.color ||
        nameOrTreatment.procedureColor ||
        null
        : null;

  if (typeof explicitColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(explicitColor.trim())) {
    return deriveThemeFromHex(explicitColor.trim());
  }

  // 2. İşlem adına göre anahtar kelime eşleştirmesi
  const rawName =
    typeof nameOrTreatment === 'string'
      ? nameOrTreatment
      : nameOrTreatment?.procedureName ||
      nameOrTreatment?.name ||
      nameOrTreatment?.title ||
      '';
  const lower = String(rawName).trim().toLocaleLowerCase('tr-TR');

  if (lower) {
    if (
      lower.includes('dolgu') ||
      lower.includes('kompozit') ||
      lower.includes('amalgam') ||
      lower.includes('inley') ||
      lower.includes('onley') ||
      lower.includes('restorasyon')
    ) {
      return CLINICAL_TREATMENT_PALETTE[0]; // #0284c7
    }
    if (
      lower.includes('kanal') ||
      lower.includes('endo') ||
      lower.includes('kuafaj') ||
      lower.includes('devital') ||
      lower.includes('retreatment')
    ) {
      return CLINICAL_TREATMENT_PALETTE[1]; // #8b5cf6
    }
    if (
      lower.includes('çekim') ||
      lower.includes('cekim') ||
      lower.includes('cerrahi') ||
      lower.includes('gömülü') ||
      lower.includes('gomulu') ||
      lower.includes('rezeksiyon') ||
      lower.includes('kist') ||
      lower.includes('biyopsi')
    ) {
      return CLINICAL_TREATMENT_PALETTE[2]; // #ef4444
    }
    if (
      lower.includes('implant') ||
      lower.includes('greft') ||
      lower.includes('sinüs') ||
      lower.includes('sinus') ||
      lower.includes('membran') ||
      lower.includes('abutment')
    ) {
      return CLINICAL_TREATMENT_PALETTE[3]; // #0d9488
    }
    if (
      lower.includes('zirkon') ||
      lower.includes('protez') ||
      lower.includes('kuron') ||
      lower.includes('kron') ||
      lower.includes('köprü') ||
      lower.includes('kopru') ||
      lower.includes('lamina') ||
      lower.includes('veneer') ||
      lower.includes('porselen') ||
      lower.includes('iskelet') ||
      lower.includes('plağı')
    ) {
      return CLINICAL_TREATMENT_PALETTE[4]; // #d97706
    }
    if (
      lower.includes('detartraj') ||
      lower.includes('temizlik') ||
      lower.includes('küretaj') ||
      lower.includes('kuretaj') ||
      lower.includes('polisaj') ||
      lower.includes('perio') ||
      lower.includes('diş taşı') ||
      lower.includes('beyazlatma') ||
      lower.includes('bleaching') ||
      lower.includes('flor')
    ) {
      return CLINICAL_TREATMENT_PALETTE[5]; // #16a34a
    }
    if (
      lower.includes('muayene') ||
      lower.includes('kontrol') ||
      lower.includes('konsültasyon') ||
      lower.includes('röntgen') ||
      lower.includes('panoramik') ||
      lower.includes('tomografi') ||
      lower.includes('ortodonti')
    ) {
      return CLINICAL_TREATMENT_PALETTE[6]; // #6366f1
    }
    if (
      lower.includes('pedodonti') ||
      lower.includes('fissür') ||
      lower.includes('yer tutucu') ||
      lower.includes('amputasyon')
    ) {
      return CLINICAL_TREATMENT_PALETTE[7]; // #db2777
    }

    let hash = 0;
    for (let i = 0; i < lower.length; i++) {
      hash = (hash * 31 + lower.charCodeAt(i)) >>> 0;
    }
    return CLINICAL_TREATMENT_PALETTE[hash % CLINICAL_TREATMENT_PALETTE.length];
  }

  return CLINICAL_TREATMENT_PALETTE[Math.abs(fallbackIdx) % CLINICAL_TREATMENT_PALETTE.length];
}

interface FastScheduleModalProps {
  treatment: any;
  patientTreatments?: any[];
  patientInfo: any;
  selectedEvent: any;
  doctors: any[];
  shifts?: any[];
  existingEvents?: any[];
  doctorLeaves?: DoctorLeaveItem[];
  workingHours?: {
    startTime?: string;
    endTime?: string;
    slotStartHour?: number;
    slotEndHour?: number;
  };
  onClose: () => void;
  onSuccess: (newAppt?: any, targetDate?: string) => void;
}

function getLocalYMD(dateStrOrObj: string | Date): string {
  if (!dateStrOrObj) return '';
  try {
    return new Date(dateStrOrObj).toLocaleDateString('sv');
  } catch {
    return String(dateStrOrObj).slice(0, 10);
  }
}

function parseHHMMToMinutes(hhmm: string | undefined | null, fallback = 0): number {
  if (!hhmm) return fallback;
  const [hStr, mStr] = String(hhmm).split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h)) return fallback;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function minutesToHHMM(mins: number): string {
  const norm = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 1 saat = 120px (1 dakika = 2px) -> 1 dakikalık tam esnek ve akıcı piksel hassasiyeti
const HOUR_HEIGHT = 120;
const HALF_HOUR_HEIGHT = 60;
const PX_PER_MINUTE = HOUR_HEIGHT / 60; // 2 px / dakika
const MIN_DURATION_MIN = 5; // 5 dakikaya kadar esnek küçültülebilir

interface FreeInterval {
  startMin: number;
  endMin: number;
}

export default function FastScheduleModal({
  treatment,
  patientTreatments = [],
  patientInfo,
  selectedEvent,
  doctors,
  shifts = [],
  existingEvents = [],
  doctorLeaves = [],
  workingHours,
  onClose,
  onSuccess,
}: FastScheduleModalProps) {
  const backdropDismiss = useBackdropDismiss(onClose);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineCanvasRef = useRef<HTMLDivElement>(null);

  // 120 FPS doğrudan DOM referansları (sürükleme sırasında React re-render tetiklemez)
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  const selectionTitleRef = useRef<HTMLSpanElement>(null);
  const selectionBadgeRef = useRef<HTMLSpanElement>(null);
  const selectionMergeBadgeRef = useRef<HTMLSpanElement>(null);
  const summaryTimeRef = useRef<HTMLDivElement>(null);
  const footerTimeRef = useRef<HTMLElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const hoverGuideRef = useRef<HTMLDivElement>(null);
  const hoverGuideLabelRef = useRef<HTMLSpanElement>(null);

  const initialBatchList: any[] = useMemo(() => {
    if (Array.isArray(treatment?.batchTreatments) && treatment.batchTreatments.length > 0) {
      return treatment.batchTreatments;
    }
    return treatment ? [treatment] : [];
  }, [treatment]);

  const availablePatientTreatments = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of initialBatchList) {
      if (item?.id) map.set(item.id, item);
    }
    if (Array.isArray(patientTreatments)) {
      for (const pt of patientTreatments) {
        if (!pt?.id) continue;
        if (pt.status === 'completed' && !map.has(pt.id)) continue;
        if (!map.has(pt.id)) {
          map.set(pt.id, pt);
        }
      }
    }
    return Array.from(map.values());
  }, [initialBatchList, patientTreatments]);

  const [selectedTreatmentIds, setSelectedTreatmentIds] = useState<string[]>(() =>
    initialBatchList.map((t: any) => t?.id).filter(Boolean)
  );

  const batchList: any[] = useMemo(() => {
    const selected = availablePatientTreatments.filter((t) => selectedTreatmentIds.includes(t.id));
    return selected.length > 0 ? selected : initialBatchList;
  }, [availablePatientTreatments, selectedTreatmentIds, initialBatchList]);

  const primaryTreatment = batchList[0] || treatment;
  const primaryTheme = useMemo(
    () => getTreatmentColorTheme(primaryTreatment, 0),
    [primaryTreatment]
  );

  const activePatientId =
    selectedEvent?.patientId ||
    patientInfo?.id ||
    primaryTreatment?.patientId ||
    null;

  const currentLinkedAppointmentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of batchList) {
      if (Array.isArray(item?.sessions)) {
        for (const s of item.sessions) {
          if (s?.appointmentId) ids.add(s.appointmentId);
        }
      }
    }
    return ids;
  }, [batchList]);

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (treatment?.prefillDate) return new Date(`${treatment.prefillDate}T12:00:00`);
    const sessionTime = primaryTreatment?.sessions?.[0]?.startTime;
    if (sessionTime) return new Date(sessionTime);
    if (primaryTreatment?.plannedDate) return new Date(primaryTreatment.plannedDate);
    if (selectedEvent?.startTime) return new Date(selectedEvent.startTime);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });

  // Seçilen başlangıç ve bitiş dakikaları [startMin, endMin] (1 dk hassasiyetli)
  const [selectedRange, setSelectedRange] = useState<[number, number]>(() => {
    if (treatment?.prefillTime) {
      const s = parseHHMMToMinutes(treatment.prefillTime, 600);
      const e = treatment?.prefillEndTime
        ? Math.max(s + MIN_DURATION_MIN, parseHHMMToMinutes(treatment.prefillEndTime, s + 30))
        : s + 30;
      return [s, e];
    }
    const session = primaryTreatment?.sessions?.[0];
    if (session?.startTime) {
      const sDt = new Date(session.startTime);
      const sMin = sDt.getHours() * 60 + sDt.getMinutes();
      if (session?.endTime) {
        const eDt = new Date(session.endTime);
        const eMin = eDt.getHours() * 60 + eDt.getMinutes();
        if (eMin > sMin) return [sMin, eMin];
      }
      return [sMin, sMin + 30];
    }
    if (primaryTreatment?.plannedDate) {
      const sDt = new Date(primaryTreatment.plannedDate);
      const sMin = sDt.getHours() * 60 + sDt.getMinutes();
      return [sMin, sMin + 30];
    }
    if (selectedEvent?.startTime) {
      const sDt = new Date(selectedEvent.startTime);
      const sMin = sDt.getHours() * 60 + sDt.getMinutes();
      if (selectedEvent?.endTime) {
        const eDt = new Date(selectedEvent.endTime);
        const eMin = eDt.getHours() * 60 + eDt.getMinutes();
        if (eMin > sMin) return [sMin, eMin];
      }
      return [sMin, sMin + 30];
    }
    return [600, 630];
  });

  const liveRangeRef = useRef<[number, number]>(selectedRange);
  useEffect(() => {
    liveRangeRef.current = selectedRange;
  }, [selectedRange]);

  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>(() => {
    if (Array.isArray(treatment?.prefillDoctorIds) && treatment.prefillDoctorIds.length > 0) {
      return treatment.prefillDoctorIds;
    }
    const isRealAppt = Boolean(
      selectedEvent?.id && !String(selectedEvent.id).startsWith('draft-')
    );
    const trDocIds =
      Array.isArray(primaryTreatment?.doctorIds) && primaryTreatment.doctorIds.length > 0
        ? primaryTreatment.doctorIds
        : Array.isArray(primaryTreatment?.metadata?.doctorIds) &&
          primaryTreatment.metadata.doctorIds.length > 0
          ? primaryTreatment.metadata.doctorIds
          : [];

    if (
      isRealAppt &&
      selectedEvent?.status === 'pending_assignment' &&
      !selectedEvent?.doctorId &&
      trDocIds.length === 0 &&
      !primaryTreatment?.doctorId
    ) {
      return [];
    }

    if (isRealAppt && selectedEvent?.doctorId) {
      if (trDocIds.includes(selectedEvent.doctorId)) {
        return trDocIds;
      }
      return [selectedEvent.doctorId];
    }

    if (trDocIds.length > 0) {
      return trDocIds;
    }
    const fallbackDoc = primaryTreatment?.doctorId || selectedEvent?.doctorId;
    return fallbackDoc ? [fallbackDoc] : doctors[0]?.id ? [doctors[0].id] : [];
  });

  const [mobileActivePane, setMobileActivePane] = useState<'schedule' | 'calendar'>('schedule');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const formattedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const displayDateStr = format(selectedDate, 'd MMMM yyyy, EEEE', { locale: tr });
  const primaryDoctorId = selectedDoctorIds[0] || '';
  const primaryDoctor = useMemo(
    () => doctors.find((d: any) => d.id === primaryDoctorId) || null,
    [doctors, primaryDoctorId]
  );

  const slotStartHour = typeof workingHours?.slotStartHour === 'number' ? workingHours.slotStartHour : 8;
  const slotEndHour =
    typeof workingHours?.slotEndHour === 'number'
      ? Math.max(workingHours.slotEndHour, slotStartHour + 1)
      : 20;
  const dayStartMin = slotStartHour * 60;
  const dayEndMin = slotEndHour * 60;
  const totalTimelineHeight = (slotEndHour - slotStartHour) * HOUR_HEIGHT;

  const teethSummary = useMemo(
    () =>
      batchList
        .map((item) => (item.toothNumber ? `#${item.toothNumber}` : ''))
        .filter(Boolean)
        .join(', '),
    [batchList]
  );

  const halfHourRows = useMemo(() => {
    const rows: { time: string; startMin: number; endMin: number; isHourStart: boolean }[] = [];
    for (let h = slotStartHour; h < slotEndHour; h++) {
      rows.push({
        time: `${String(h).padStart(2, '0')}:00`,
        startMin: h * 60,
        endMin: h * 60 + 30,
        isHourStart: true,
      });
      rows.push({
        time: `${String(h).padStart(2, '0')}:30`,
        startMin: h * 60 + 30,
        endMin: (h + 1) * 60,
        isHourStart: false,
      });
    }
    return rows;
  }, [slotStartHour, slotEndHour]);

  const selectedDoctorsShiftsOnDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const docId of selectedDoctorIds) {
      map[docId] = (shifts || []).filter((s: any) => s.userId === docId && s.date === formattedDateStr);
    }
    return map;
  }, [shifts, selectedDoctorIds, formattedDateStr]);

  const dayLeavesForSelectedDoctors = useMemo(() => {
    return (doctorLeaves || []).filter(
      (l) => selectedDoctorIds.includes(l.doctorId) && l.date === formattedDateStr
    );
  }, [doctorLeaves, selectedDoctorIds, formattedDateStr]);

  const doctorLeaveDatesSet = useMemo(() => {
    const set = new Set<string>();
    for (const l of doctorLeaves || []) {
      if (!l?.date) continue;
      if (selectedDoctorIds.length === 0 || selectedDoctorIds.includes(l.doctorId)) {
        set.add(l.date);
      }
    }
    return set;
  }, [doctorLeaves, selectedDoctorIds]);

  const activeSubstituteLeave = useMemo(() => {
    return dayLeavesForSelectedDoctors.find((l) => Boolean(l.substituteDoctorId)) || null;
  }, [dayLeavesForSelectedDoctors]);

  const dayAppointmentsForSelectedDoctors = useMemo(() => {
    return (existingEvents || [])
      .filter((ev: any) => {
        if (!ev?.startTime || ev.status === 'cancelled') return false;
        const evDate = getLocalYMD(ev.startTime);
        if (evDate !== formattedDateStr) return false;
        if (ev.doctorId && selectedDoctorIds.includes(ev.doctorId)) return true;
        if (!ev.doctorId) {
          const isLinked = currentLinkedAppointmentIds.has(ev.id);
          const isSamePat =
            Boolean(activePatientId && ev.patientId && ev.patientId === activePatientId) ||
            (Boolean(patientInfo?.name) &&
              !ev.patientId &&
              String(ev.title || '')
                .toLocaleLowerCase('tr-TR')
                .startsWith(String(patientInfo.name).trim().toLocaleLowerCase('tr-TR')));
          return isLinked || isSamePat;
        }
        return false;
      })
      .map((ev: any) => {
        const sDt = new Date(ev.startTime);
        const eDt = ev.endTime ? new Date(ev.endTime) : new Date(sDt.getTime() + 30 * 60000);
        const startMin = sDt.getHours() * 60 + sDt.getMinutes();
        const rawEndMin = eDt.getHours() * 60 + eDt.getMinutes();
        const endMin = rawEndMin > startMin ? rawEndMin : startMin + 30;
        const isCurrentTreatmentAppt = currentLinkedAppointmentIds.has(ev.id);
        const isSamePatient =
          Boolean(activePatientId && ev.patientId && ev.patientId === activePatientId) ||
          (Boolean(patientInfo?.name) &&
            !ev.patientId &&
            String(ev.title || '')
              .toLocaleLowerCase('tr-TR')
              .startsWith(String(patientInfo.name).trim().toLocaleLowerCase('tr-TR')));
        const docObj = doctors.find((d: any) => d.id === ev.doctorId);
        return {
          ...ev,
          startMin,
          endMin,
          startHHMM: minutesToHHMM(startMin),
          endHHMM: minutesToHHMM(endMin),
          isCurrentTreatmentAppt,
          isSamePatient,
          doctorName: docObj?.name || '',
          doctorColor: docObj?.color || '#2563eb',
          colIndex: 0,
          totalCols: 1,
        };
      })
      .sort((a: any, b: any) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));
  }, [
    existingEvents,
    formattedDateStr,
    selectedDoctorIds,
    currentLinkedAppointmentIds,
    activePatientId,
    patientInfo,
    doctors,
  ]);

  // Çakışan randevuları yan yana sütunlara (colIndex / totalCols) yerleştir ki arkadaki seans asla kapanmasın
  const layoutDayAppointments = useMemo(() => {
    const visible = dayAppointmentsForSelectedDoctors
      .filter((ev: any) => !ev.isCurrentTreatmentAppt)
      .map((ev: any) => ({ ...ev }));

    let i = 0;
    while (i < visible.length) {
      const cluster: any[] = [visible[i]];
      let clusterMaxEnd = visible[i].endMin;
      let j = i + 1;
      while (j < visible.length && visible[j].startMin < clusterMaxEnd) {
        cluster.push(visible[j]);
        if (visible[j].endMin > clusterMaxEnd) {
          clusterMaxEnd = visible[j].endMin;
        }
        j++;
      }

      const colEndMins: number[] = [];
      for (const item of cluster) {
        let placedCol = -1;
        for (let c = 0; c < colEndMins.length; c++) {
          if (colEndMins[c] <= item.startMin) {
            placedCol = c;
            colEndMins[c] = item.endMin;
            break;
          }
        }
        if (placedCol === -1) {
          placedCol = colEndMins.length;
          colEndMins.push(item.endMin);
        }
        item.colIndex = placedCol;
      }
      const totalCols = Math.max(1, colEndMins.length);
      for (const item of cluster) {
        item.totalCols = totalCols;
      }

      i = j;
    }

    return visible;
  }, [dayAppointmentsForSelectedDoctors]);

  const [preferredMergeApptId, setPreferredMergeApptId] = useState<string | null>(null);
  const preferredMergeApptIdRef = useRef<string | null>(null);
  useEffect(() => {
    preferredMergeApptIdRef.current = preferredMergeApptId;
  }, [preferredMergeApptId]);

  const formatApptShortLabel = useCallback((ev: any) => {
    if (!ev) return '';
    const rawTitle = String(ev.title || '').trim();
    const afterDash = rawTitle.includes(' - ')
      ? rawTitle.split(' - ').slice(1).join(' - ').trim()
      : rawTitle;
    const shortName = afterDash.length > 22 ? `${afterDash.slice(0, 22)}…` : afterDash;
    return `${ev.startHHMM}–${ev.endHHMM}${shortName ? ` · ${shortName}` : ''}`;
  }, []);

  const findOverlappingSamePatientAppts = useCallback(
    (sMin: number, eMin: number) => {
      return layoutDayAppointments.filter(
        (ev: any) =>
          ev.isSamePatient &&
          !ev.isCurrentTreatmentAppt &&
          sMin < ev.endMin &&
          eMin > ev.startMin
      );
    },
    [layoutDayAppointments]
  );

  const findOverlappingSamePatientAppt = useCallback(
    (sMin: number, eMin: number, explicitPreferredId?: string | null) => {
      const matches = findOverlappingSamePatientAppts(sMin, eMin);
      if (matches.length === 0) return null;
      const prefId = explicitPreferredId !== undefined ? explicitPreferredId : preferredMergeApptIdRef.current;
      if (prefId) {
        const preferred = matches.find((ev: any) => ev.id === prefId);
        if (preferred) return preferred;
      }
      // En yüksek kesişim süresine ve başlangıç yakınlığına göre en uygun seansı seç
      return [...matches].sort((a: any, b: any) => {
        const overlapA = Math.min(eMin, a.endMin) - Math.max(sMin, a.startMin);
        const overlapB = Math.min(eMin, b.endMin) - Math.max(sMin, b.startMin);
        if (overlapB !== overlapA) return overlapB - overlapA;
        return Math.abs(a.startMin - sMin) - Math.abs(b.startMin - sMin);
      })[0];
    },
    [findOverlappingSamePatientAppts]
  );

  // 1 dakikalık tam hassasiyetle seçilen hekim(ler)in o günkü müsait boşluk aralıkları (freeIntervals)
  const freeIntervals = useMemo<FreeInterval[]>(() => {
    if (selectedDoctorIds.length === 0) return [];
    const intervals: FreeInterval[] = [];
    let currentStart: number | null = null;

    for (let m = dayStartMin; m < dayEndMin; m += 1) {
      const mEnd = m + 1;

      let inShift = true;
      for (const docId of selectedDoctorIds) {
        const docShifts = selectedDoctorsShiftsOnDay[docId] || [];
        const covered = docShifts.some((s: any) => {
          const sStart = parseHHMMToMinutes(s.startTime, 0);
          let sEnd = parseHHMMToMinutes(s.endTime, 1440);
          if (sEnd <= sStart) sEnd += 1440;
          return m >= sStart && mEnd <= sEnd;
        });
        if (!covered) {
          inShift = false;
          break;
        }
      }

      const onLeave =
        inShift &&
        dayLeavesForSelectedDoctors.some((l) => {
          if (l.isFullDay) return true;
          const lStart = parseHHMMToMinutes(l.startTime, 0);
          const lEnd = parseHHMMToMinutes(l.endTime, 1440);
          return m < lEnd && mEnd > lStart;
        });

      const occupiedByDifferentPatient =
        inShift &&
        !onLeave &&
        dayAppointmentsForSelectedDoctors.some((ev: any) => {
          if (ev.isCurrentTreatmentAppt || ev.isSamePatient) return false;
          return m < ev.endMin && mEnd > ev.startMin;
        });

      const isFree = inShift && !onLeave && !occupiedByDifferentPatient;
      if (isFree) {
        if (currentStart === null) currentStart = m;
      } else {
        if (currentStart !== null) {
          if (m - currentStart >= MIN_DURATION_MIN) {
            intervals.push({ startMin: currentStart, endMin: m });
          }
          currentStart = null;
        }
      }
    }

    if (currentStart !== null && dayEndMin - currentStart >= MIN_DURATION_MIN) {
      intervals.push({ startMin: currentStart, endMin: dayEndMin });
    }

    return intervals;
  }, [
    selectedDoctorIds,
    dayStartMin,
    dayEndMin,
    selectedDoctorsShiftsOnDay,
    dayLeavesForSelectedDoctors,
    dayAppointmentsForSelectedDoctors,
  ]);

  const isRangeValid = useCallback(
    (s: number, e: number) => {
      const sRound = Math.round(s);
      const eRound = Math.round(e);
      if (eRound - sRound < MIN_DURATION_MIN) return false;
      return freeIntervals.some((iv) => sRound >= iv.startMin && eRound <= iv.endMin);
    },
    [freeIntervals]
  );

  const findContainingOrNearestInterval = useCallback(
    (targetMin: number, minRequiredDuration = MIN_DURATION_MIN): FreeInterval | null => {
      const containing = freeIntervals.find(
        (iv) =>
          targetMin >= iv.startMin &&
          targetMin <= iv.endMin &&
          iv.endMin - iv.startMin >= minRequiredDuration
      );
      if (containing) return containing;

      let best: FreeInterval | null = null;
      let bestDist = Infinity;
      for (const iv of freeIntervals) {
        if (iv.endMin - iv.startMin < minRequiredDuration) continue;
        const dist =
          targetMin < iv.startMin
            ? iv.startMin - targetMin
            : targetMin > iv.endMin
              ? targetMin - iv.endMin
              : 0;
        if (dist < bestDist) {
          bestDist = dist;
          best = iv;
        }
      }
      return best;
    },
    [freeIntervals]
  );

  // Tarih veya hekim değiştiğinde mevcut aralık geçersizse ilk uygun boşluğa yerleştir
  useEffect(() => {
    const [curS, curE] = liveRangeRef.current;
    const curDuration = Math.max(MIN_DURATION_MIN, Math.round(curE - curS));
    if (!isRangeValid(curS, curE)) {
      const firstIv = freeIntervals[0];
      if (firstIv) {
        const nextS = firstIv.startMin;
        const nextE = Math.min(firstIv.endMin, nextS + Math.max(30, curDuration));
        setSelectedRange([nextS, nextE]);
      }
    }
  }, [formattedDateStr, selectedDoctorIds, freeIntervals, isRangeValid]);

  // Günlük görünüm açıldığında seçili saate kaydır
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!timelineScrollRef.current) return;
      const targetMin = liveRangeRef.current[0] || dayStartMin;
      const topPx = Math.max(0, (targetMin - dayStartMin) * PX_PER_MINUTE - HOUR_HEIGHT * 0.8);
      timelineScrollRef.current.scrollTo({ top: topPx, behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [formattedDateStr, primaryDoctorId, dayStartMin, mobileActivePane]);

  // Sürükleme sırasında DOM'u 120 FPS doğrudan (piksel-hassas + 1 dk çözünürlükle) güncelleyen fonksiyon
  const applyLiveRangeToDOM = useCallback(
    (rawStartMin: number, rawEndMin: number) => {
      const sMin = Math.round(rawStartMin);
      const eMin = Math.max(sMin + MIN_DURATION_MIN, Math.round(rawEndMin));
      liveRangeRef.current = [sMin, eMin];

      // Piksel konumunu kesirli dakikadan hesapla -> sıfır atlama / yağ gibi akıcı hareket
      const topPx = (rawStartMin - dayStartMin) * PX_PER_MINUTE;
      const heightPx = Math.max(
        MIN_DURATION_MIN * PX_PER_MINUTE,
        (rawEndMin - rawStartMin) * PX_PER_MINUTE
      );

      const startStr = minutesToHHMM(sMin);
      const endStr = minutesToHHMM(eMin);
      const timeLabel = `${startStr} – ${endStr}`;
      const durMin = Math.max(MIN_DURATION_MIN, eMin - sMin);
      const overlapSame = findOverlappingSamePatientAppt(sMin, eMin);

      if (selectionBoxRef.current) {
        selectionBoxRef.current.style.display = 'flex';
        selectionBoxRef.current.style.top = `${topPx}px`;
        selectionBoxRef.current.style.height = `${heightPx}px`;
      }
      if (selectionTitleRef.current) {
        selectionTitleRef.current.textContent = timeLabel;
      }
      if (selectionBadgeRef.current) {
        selectionBadgeRef.current.textContent = `${durMin} dk`;
      }
      if (selectionMergeBadgeRef.current) {
        if (overlapSame) {
          selectionMergeBadgeRef.current.style.display = 'inline-flex';
          selectionMergeBadgeRef.current.textContent = `🔗 Birleştir: ${formatApptShortLabel(overlapSame)}`;
        } else {
          selectionMergeBadgeRef.current.style.display = 'none';
        }
      }
      if (timelineCanvasRef.current) {
        const cards = timelineCanvasRef.current.querySelectorAll<HTMLElement>('[data-same-patient-appt-id]');
        cards.forEach((card) => {
          const cardId = card.getAttribute('data-same-patient-appt-id');
          const isTarget = Boolean(overlapSame && cardId === overlapSame.id);
          const borderSpec = isTarget ? '2px solid #0d9488' : '1.5px dashed #0d9488';
          card.style.borderTop = borderSpec;
          card.style.borderRight = borderSpec;
          card.style.borderBottom = borderSpec;
          card.style.borderLeft = '4px solid #0d9488';
          card.style.background = isTarget ? '#ccfbf1' : '#f0fdf4';
          card.style.boxShadow = isTarget
            ? '0 0 0 2px rgba(13, 148, 136, 0.25)'
            : 'var(--pc-clay-btn)';
          const badgeEl = card.querySelector<HTMLElement>('[data-merge-badge-label]');
          if (badgeEl) {
            badgeEl.textContent = isTarget ? '✅ Bu Seansla Birleşecek' : 'Aynı Hasta · Birleştir';
          }
        });
      }
      if (summaryTimeRef.current) {
        summaryTimeRef.current.textContent = `${displayDateStr} · ${timeLabel} (${durMin} dk)`;
      }
      if (footerTimeRef.current) {
        footerTimeRef.current.textContent = `${timeLabel} (${durMin} dk)`;
      }
      if (startInputRef.current && document.activeElement !== startInputRef.current) {
        startInputRef.current.value = startStr;
      }
      if (endInputRef.current && document.activeElement !== endInputRef.current) {
        endInputRef.current.value = endStr;
      }
    },
    [dayStartMin, displayDateStr, findOverlappingSamePatientAppt, formatApptShortLabel]
  );

  // Sürükleme & Boyutlandırma Durumu (window event'leri ile %100 kesintisiz ve 120 FPS)
  const dragStateRef = useRef<{
    mode: 'create' | 'move' | 'resize-top' | 'resize-bottom';
    startClientY: number;
    anchorExactMin: number;
    initialStartMin: number;
    initialEndMin: number;
    activeInterval: FreeInterval;
    hasMoved: boolean;
  } | null>(null);

  const clientYToExactMinutes = useCallback(
    (clientY: number): number => {
      const rect = timelineCanvasRef.current?.getBoundingClientRect();
      if (!rect) return dayStartMin;
      const relY = clientY - rect.top;
      const exactMinutes = dayStartMin + relY / PX_PER_MINUTE;
      return Math.max(dayStartMin, Math.min(dayEndMin, exactMinutes));
    },
    [dayStartMin, dayEndMin]
  );

  // Window üzerinde kesintisiz pointermove & pointerup dinleyicisi
  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      const st = dragStateRef.current;
      if (!st) return;

      const deltaY = e.clientY - st.startClientY;
      if (Math.abs(deltaY) > 2) {
        st.hasMoved = true;
      }

      const deltaExactMin = deltaY / PX_PER_MINUTE;
      const iv = st.activeInterval;

      if (st.mode === 'create') {
        if (!st.hasMoved) return;
        const curExactMin = clientYToExactMinutes(e.clientY);
        const clampedCur = Math.max(iv.startMin, Math.min(iv.endMin, curExactMin));
        let nextS = Math.min(st.anchorExactMin, clampedCur);
        let nextE = Math.max(st.anchorExactMin, clampedCur);
        if (nextE - nextS < MIN_DURATION_MIN) {
          if (nextS + MIN_DURATION_MIN <= iv.endMin) {
            nextE = nextS + MIN_DURATION_MIN;
          } else {
            nextS = Math.max(iv.startMin, nextE - MIN_DURATION_MIN);
          }
        }
        applyLiveRangeToDOM(nextS, nextE);
      } else if (st.mode === 'resize-bottom') {
        const rawEnd = st.initialEndMin + deltaExactMin;
        const clampedEnd = Math.max(
          st.initialStartMin + MIN_DURATION_MIN,
          Math.min(iv.endMin, rawEnd)
        );
        applyLiveRangeToDOM(st.initialStartMin, clampedEnd);
      } else if (st.mode === 'resize-top') {
        const rawStart = st.initialStartMin + deltaExactMin;
        const clampedStart = Math.min(
          st.initialEndMin - MIN_DURATION_MIN,
          Math.max(iv.startMin, rawStart)
        );
        applyLiveRangeToDOM(clampedStart, st.initialEndMin);
      } else if (st.mode === 'move') {
        const duration = st.initialEndMin - st.initialStartMin;
        const rawStart = st.initialStartMin + deltaExactMin;

        const targetIv =
          findContainingOrNearestInterval(rawStart + duration / 2, MIN_DURATION_MIN) || iv;
        if (targetIv.endMin - targetIv.startMin >= MIN_DURATION_MIN) {
          const fitDur = Math.min(duration, targetIv.endMin - targetIv.startMin);
          const clampedStart = Math.max(
            targetIv.startMin,
            Math.min(targetIv.endMin - fitDur, rawStart)
          );
          applyLiveRangeToDOM(clampedStart, clampedStart + fitDur);
        }
      }
    };

    const onWindowPointerUp = () => {
      const st = dragStateRef.current;
      if (!st) return;
      dragStateRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      if (st.mode === 'create' && !st.hasMoved) {
        // Sürüklemeden tek tıklama: mevcut süreyi koruyarak tıklanan dakikaya taşı
        const iv = st.activeInterval;
        const prevDur = Math.max(30, st.initialEndMin - st.initialStartMin);
        const fitDur = Math.min(prevDur, iv.endMin - iv.startMin);
        const clickedRound = Math.round(st.anchorExactMin);
        const nextS = Math.max(iv.startMin, Math.min(iv.endMin - fitDur, clickedRound));
        const nextE = nextS + fitDur;
        applyLiveRangeToDOM(nextS, nextE);
        setSelectedRange([nextS, nextE]);
        return;
      }

      const [finalS, finalE] = liveRangeRef.current;
      applyLiveRangeToDOM(finalS, finalE);
      setSelectedRange([finalS, finalE]);
    };

    window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, [clientYToExactMinutes, applyLiveRangeToDOM, findContainingOrNearestInterval]);

  // 1. Boşluk üzerinde tıklama veya sürükleyerek yeni esnek aralık oluşturma (create)
  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (freeIntervals.length === 0) {
      import('react-hot-toast').then((mod) =>
        mod.toast.error('⚠️ Seçilen hekimin bu tarihte müsait vardiya boşluğu bulunmuyor.')
      );
      return;
    }

    const exactMin = clientYToExactMinutes(e.clientY);
    const containingIv = freeIntervals.find(
      (iv) => exactMin >= iv.startMin && exactMin < iv.endMin
    );

    if (!containingIv) {
      import('react-hot-toast').then((mod) =>
        mod.toast.error('🔒 Sadece hekimin vardiya saatleri içindeki boş alanlar üzerinde seçim yapabilirsiniz.')
      );
      return;
    }

    const [prevS, prevE] = liveRangeRef.current;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    dragStateRef.current = {
      mode: 'create',
      startClientY: e.clientY,
      anchorExactMin: exactMin,
      initialStartMin: prevS,
      initialEndMin: prevE,
      activeInterval: containingIv,
      hasMoved: false,
    };
  };

  // 2. Seçili bloğu taşıma (move) veya alt/üst kenardan esnek boyutlandırma (resize-top / resize-bottom)
  const startBlockInteraction = (
    e: React.PointerEvent<HTMLElement>,
    mode: 'move' | 'resize-top' | 'resize-bottom'
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    e.preventDefault();

    const [curS, curE] = liveRangeRef.current;
    const iv = findContainingOrNearestInterval(curS, MIN_DURATION_MIN);
    if (!iv) return;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ns-resize';

    dragStateRef.current = {
      mode,
      startClientY: e.clientY,
      anchorExactMin: curS,
      initialStartMin: curS,
      initialEndMin: curE,
      activeInterval: iv,
      hasMoved: false,
    };
  };

  // Fare gezinirken 120 FPS canlı saat kılavuz çizgisi
  const handleCanvasPointerMoveHover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hoverGuideRef.current || !hoverGuideLabelRef.current) return;
    if (dragStateRef.current) {
      hoverGuideRef.current.style.display = 'none';
      return;
    }
    const exactMin = clientYToExactMinutes(e.clientY);
    const roundedMin = Math.round(exactMin);
    const inFree = freeIntervals.some((iv) => roundedMin >= iv.startMin && roundedMin <= iv.endMin);
    if (!inFree) {
      hoverGuideRef.current.style.display = 'none';
      return;
    }
    const topPx = (roundedMin - dayStartMin) * PX_PER_MINUTE;
    hoverGuideRef.current.style.display = 'flex';
    hoverGuideRef.current.style.top = `${topPx}px`;
    hoverGuideLabelRef.current.textContent = minutesToHHMM(roundedMin);
  };

  const handleCanvasPointerLeave = () => {
    if (hoverGuideRef.current) {
      hoverGuideRef.current.style.display = 'none';
    }
  };

  // Sol paneldeki Başlangıç / Bitiş saat inputlarından doğrudan dakika değiştirme
  const handleManualTimeInput = (which: 'start' | 'end', value: string) => {
    const mins = parseHHMMToMinutes(value, -1);
    if (mins < 0) return;
    const [curS, curE] = liveRangeRef.current;
    let nextS = which === 'start' ? mins : curS;
    let nextE = which === 'end' ? mins : curE;
    if (which === 'start' && nextE < nextS + MIN_DURATION_MIN) {
      nextE = nextS + Math.max(MIN_DURATION_MIN, curE - curS);
    } else if (which === 'end' && nextE < nextS + MIN_DURATION_MIN) {
      nextS = Math.max(dayStartMin, nextE - MIN_DURATION_MIN);
    }
    const iv = findContainingOrNearestInterval(nextS, MIN_DURATION_MIN);
    if (iv) {
      nextS = Math.max(iv.startMin, Math.min(iv.endMin - MIN_DURATION_MIN, nextS));
      nextE = Math.max(nextS + MIN_DURATION_MIN, Math.min(iv.endMin, nextE));
    }
    applyLiveRangeToDOM(nextS, nextE);
    setSelectedRange([nextS, nextE]);
  };

  const [selectedStartMin, selectedEndMin] = selectedRange;
  const selectedStartHHMM = minutesToHHMM(selectedStartMin);
  const selectedEndHHMM = minutesToHHMM(selectedEndMin);
  const selectedDurationMin = Math.max(MIN_DURATION_MIN, Math.round(selectedEndMin - selectedStartMin));
  const isCurrentSelectionValid = isRangeValid(selectedStartMin, selectedEndMin);

  const overlappingSamePatientAppts = useMemo(
    () => findOverlappingSamePatientAppts(selectedStartMin, selectedEndMin),
    [findOverlappingSamePatientAppts, selectedStartMin, selectedEndMin]
  );

  const overlappingSamePatientAppt = useMemo(
    () => findOverlappingSamePatientAppt(selectedStartMin, selectedEndMin, preferredMergeApptId),
    [findOverlappingSamePatientAppt, selectedStartMin, selectedEndMin, preferredMergeApptId]
  );

  const toggleTreatmentSelection = (treatmentId: string) => {
    setSelectedTreatmentIds((prev) => {
      if (prev.includes(treatmentId)) {
        if (prev.length <= 1) {
          import('react-hot-toast').then((mod) =>
            mod.toast('En az bir tedavi seçili olmalıdır.', { icon: 'ℹ️' })
          );
          return prev;
        }
        return prev.filter((id) => id !== treatmentId);
      }
      return [...prev, treatmentId];
    });
  };

  const totalFreeMinutes = useMemo(
    () => freeIntervals.reduce((acc, iv) => acc + (iv.endMin - iv.startMin), 0),
    [freeIntervals]
  );

  const isMinuteInShift = useCallback(
    (min: number) => {
      if (selectedDoctorIds.length === 0) return false;
      for (const docId of selectedDoctorIds) {
        const docShifts = selectedDoctorsShiftsOnDay[docId] || [];
        const covered = docShifts.some((s: any) => {
          const sStart = parseHHMMToMinutes(s.startTime, 0);
          let sEnd = parseHHMMToMinutes(s.endTime, 1440);
          if (sEnd <= sStart) sEnd += 1440;
          return min >= sStart && min + 30 <= sEnd;
        });
        if (!covered) return false;
      }
      return true;
    },
    [selectedDoctorIds, selectedDoctorsShiftsOnDay]
  );

  const handleSave = async () => {
    const [finalStartMin, finalEndMin] = liveRangeRef.current;
    if (batchList.length === 0 || !selectedEvent) return;
    if (selectedDoctorIds.length === 0) {
      import('react-hot-toast').then((mod) => mod.toast.error('⚠️ Lütfen en az bir hekim seçiniz!'));
      return;
    }
    if (!isRangeValid(finalStartMin, finalEndMin)) {
      import('react-hot-toast').then((mod) =>
        mod.toast.error(
          '⚠️ Seçilen saat aralığı müsait değil. Lütfen günlük programdaki boş alan üzerinde seçim yapın!'
        )
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const overlapTarget = findOverlappingSamePatientAppt(finalStartMin, finalEndMin);
      let effectiveStartMin = finalStartMin;
      let effectiveEndMin = finalEndMin;

      if (overlapTarget) {
        const unionStart = Math.min(finalStartMin, overlapTarget.startMin);
        const unionEnd = Math.max(finalEndMin, overlapTarget.endMin);
        if (isRangeValid(unionStart, unionEnd)) {
          effectiveStartMin = unionStart;
          effectiveEndMin = unionEnd;
        }
      }

      const startHHMM = minutesToHHMM(effectiveStartMin);
      const endHHMM = minutesToHHMM(effectiveEndMin);
      const startDt = new Date(`${formattedDateStr}T${startHHMM}:00+03:00`);
      const endDt = new Date(`${formattedDateStr}T${endHHMM}:00+03:00`);

      const patientLabel = patientInfo?.name || 'Hasta';
      const batchProcLabels = Array.from(
        new Set(
          batchList
            .map((t) =>
              t.toothNumber
                ? `#${t.toothNumber} ${t.procedureName || ''}`.trim()
                : t.procedureName || ''
            )
            .filter(Boolean)
        )
      );
      let titleStr = `${patientLabel} - ${batchProcLabels.join(', ') || primaryTreatment?.procedureName || 'Tedavi'
        }`;

      let targetAppt: any = null;

      const batchIdSet = new Set<string>(batchList.map((t: any) => t?.id).filter(Boolean));
      const isSelectedRealAppt = Boolean(
        selectedEvent?.id && !String(selectedEvent.id).startsWith('draft-')
      );
      const selectedApptYMD = selectedEvent?.startTime ? getLocalYMD(selectedEvent.startTime) : '';

      // Determine all source appointments that currently hold the treatments in batchList
      const sourceApptIds = new Set<string>(Array.from(currentLinkedAppointmentIds));
      if (isSelectedRealAppt && sourceApptIds.size === 0) {
        // If batchList has no linked session yet, check if it belongs to the currently open selectedEvent
        const belongsToSelectedEvent = batchList.some((item) => {
          const pDate = item?.plannedDate ? getLocalYMD(item.plannedDate) : '';
          return !pDate || pDate === selectedApptYMD;
        });
        if (belongsToSelectedEvent) {
          sourceApptIds.add(selectedEvent.id);
        }
      }

      // Check remaining treatments on each source appointment (both DB links and same-day unlinked items)
      const remainingByApptId = new Map<string, any[]>();
      for (const srcApptId of sourceApptIds) {
        let linkedList: any[] = [];
        try {
          const remRes = await fetch(`/api/dental/appointments/${srcApptId}/treatments`);
          if (remRes.ok) {
            const data = await remRes.json();
            if (Array.isArray(data)) linkedList = data;
          }
        } catch { }

        const remLinked = linkedList.filter(
          (r: any) => !batchIdSet.has(r.treatmentPlanId || r.id) && r.status !== 'cancelled'
        );

        // Also check patientTreatments for any other active treatments belonging to this same appointment/day
        const srcApptObj =
          srcApptId === selectedEvent?.id
            ? selectedEvent
            : (existingEvents || []).find((ev: any) => ev.id === srcApptId);
        const srcYMD = srcApptObj?.startTime ? getLocalYMD(srcApptObj.startTime) : '';

        const extraSameAppt = (patientTreatments || []).filter((pt: any) => {
          if (!pt?.id || batchIdSet.has(pt.id) || pt.status === 'cancelled') return false;
          if (remLinked.some((r: any) => (r.treatmentPlanId || r.id) === pt.id)) return false;
          const ptSessions = Array.isArray(pt.sessions) ? pt.sessions : [];
          if (ptSessions.some((s: any) => s.appointmentId === srcApptId)) return true;
          if (ptSessions.length === 0 && srcYMD && pt.plannedDate && getLocalYMD(pt.plannedDate) === srcYMD) {
            return true;
          }
          return false;
        });

        // Ensure any unlinked same-day remaining treatments are linked to srcApptId so they don't get orphaned
        for (const extraPt of extraSameAppt) {
          const ptSessions = Array.isArray(extraPt.sessions) ? extraPt.sessions : [];
          if (!ptSessions.some((s: any) => s.appointmentId === srcApptId)) {
            await fetch(`/api/dental/appointments/${srcApptId}/treatments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ treatmentPlanId: extraPt.id, sessionNumber: 1 }),
            }).catch(() => { });
          }
        }

        remainingByApptId.set(srcApptId, [...remLinked, ...extraSameAppt]);
      }

      // If not merging into an overlapTarget, see if there is a single source appointment with 0 remaining treatments that we can move in-place
      const singleReusableApptId =
        !overlapTarget && sourceApptIds.size === 1
          ? Array.from(sourceApptIds).find((id) => (remainingByApptId.get(id) || []).length === 0) || null
          : null;

      if (overlapTarget) {
        const existingSuffix = String(overlapTarget.title || '').includes(' - ')
          ? String(overlapTarget.title).split(' - ').slice(1).join(' - ').trim()
          : '';
        const combinedParts = Array.from(
          new Set(
            [
              ...(existingSuffix ? existingSuffix.split(',').map((s) => s.trim()) : []),
              ...batchProcLabels,
            ].filter(Boolean)
          )
        );
        if (combinedParts.length > 0) {
          titleStr = `${patientLabel} - ${combinedParts.join(', ')}`;
        }

        const updRes = await fetch(`/api/dental/appointments/${overlapTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctorId: primaryDoctorId || null,
            title: titleStr,
            startTime: startDt.toISOString(),
            endTime: endDt.toISOString(),
            status: primaryDoctorId ? 'scheduled' : 'pending_assignment',
          }),
        });
        targetAppt = updRes.ok ? await updRes.json() : overlapTarget;
      } else if (singleReusableApptId) {
        // Move the existing appointment in-place so no ghost/old appointment remains at the old date/time
        const updRes = await fetch(`/api/dental/appointments/${singleReusableApptId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctorId: primaryDoctorId || null,
            title: titleStr,
            startTime: startDt.toISOString(),
            endTime: endDt.toISOString(),
            status: primaryDoctorId ? 'scheduled' : 'pending_assignment',
          }),
        });
        if (!updRes.ok) throw new Error('Randevu güncellenemedi');
        targetAppt = await updRes.json();
      } else {
        const apptRes = await fetch('/api/dental/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: activePatientId,
            doctorId: primaryDoctorId || null,
            title: titleStr,
            startTime: startDt.toISOString(),
            endTime: endDt.toISOString(),
            type: 'Tedavi',
            status: primaryDoctorId ? 'scheduled' : 'pending_assignment',
          }),
        });

        if (!apptRes.ok) throw new Error('Randevu oluşturulamadı');
        targetAppt = await apptRes.json();
      }

      const oldApptIdsToCheck = new Set<string>();
      for (const srcId of sourceApptIds) {
        if (srcId !== targetAppt.id) {
          oldApptIdsToCheck.add(srcId);
        }
      }
      for (const item of batchList) {
        if (item.sessions && Array.isArray(item.sessions)) {
          for (const oldS of item.sessions) {
            if (oldS.appointmentId && oldS.appointmentId !== targetAppt.id) {
              oldApptIdsToCheck.add(oldS.appointmentId);
              await fetch(`/api/dental/appointments/${oldS.appointmentId}/treatments/${item.id}`, {
                method: 'DELETE',
              }).catch(() => { });
            }
          }
        }
        if (
          selectedEvent?.id &&
          !String(selectedEvent.id).startsWith('draft-') &&
          selectedEvent.id !== targetAppt.id
        ) {
          await fetch(`/api/dental/appointments/${selectedEvent.id}/treatments/${item.id}`, {
            method: 'DELETE',
          }).catch(() => { });
        }

        await fetch(`/api/dental/appointments/${targetAppt.id}/treatments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ treatmentPlanId: item.id, sessionNumber: 1 }),
        });

        await fetch(`/api/dental/treatments/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctorId: primaryDoctorId || null,
            doctorIds: selectedDoctorIds,
            plannedDate: startDt.toISOString(),
          }),
        });
      }

      for (const oldApptId of oldApptIdsToCheck) {
        try {
          const remRes = await fetch(`/api/dental/appointments/${oldApptId}/treatments`);
          if (remRes.ok) {
            const remList = await remRes.json();
            const activeRemList = Array.isArray(remList)
              ? remList.filter((r: any) => r.status !== 'cancelled' && !batchIdSet.has(r.treatmentPlanId || r.id))
              : [];
            const fallbackRem = remainingByApptId.get(oldApptId) || [];
            const finalRem = activeRemList.length > 0 ? activeRemList : fallbackRem;

            if (finalRem.length === 0) {
              await fetch(`/api/dental/appointments/${oldApptId}`, { method: 'DELETE' }).catch(() => { });
            } else {
              // Update old appointment's title so the moved treatment no longer appears on the old appointment card
              const remLabels = Array.from(
                new Set(
                  finalRem
                    .map((r: any) =>
                      r.toothNumber
                        ? `#${r.toothNumber} ${r.procedureName || ''}`.trim()
                        : r.procedureName || ''
                    )
                    .filter(Boolean)
                )
              );
              if (remLabels.length > 0) {
                const nextOldTitle = `${patientLabel} - ${remLabels.join(', ')}`;
                await fetch(`/api/dental/appointments/${oldApptId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: nextOldTitle }),
                }).catch(() => { });
              }
            }
          }
        } catch { }
      }

      import('react-hot-toast').then((mod) =>
        mod.toast.success(
          overlapTarget
            ? `🔗 Mevcut seansla birleştirildi (${format(startDt, 'd MMMM', { locale: tr })} ${startHHMM} – ${endHHMM})`
            : `Randevu ${format(startDt, 'd MMMM', { locale: tr })} ${startHHMM} – ${endHHMM} aralığına planlandı!`
        )
      );
      onSuccess(targetAppt, formattedDateStr);
    } catch (err) {
      console.error(err);
      import('react-hot-toast').then((mod) => mod.toast.error('Bir hata oluştu!'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const primaryDocShifts = selectedDoctorsShiftsOnDay[primaryDoctorId] || [];
  const shiftSummaryText =
    primaryDocShifts.length > 0
      ? `Vardiya: ${primaryDocShifts.map((s: any) => `${s.startTime} - ${s.endTime}`).join(', ')}`
      : 'Bu tarihte vardiya tanımlanmamış';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal-overlay, rgba(15, 23, 42, 0.6))',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
      }}
      {...backdropDismiss}
    >
      <style>{`
        .fs-modal-shell {
          --pc-surface: #f4f8fe;
          --pc-border: #d8e5f6;
          --pc-muted: #526e98;
          --pc-tint: #edf5ff;
          --pc-blue: #075cff;
          --pc-tint-fg: #0759da;
          background: var(--card-bg, #ffffff);
          width: min(920px, calc(100vw - 24px));
          max-width: 920px;
          height: min(690px, 90vh);
          max-height: 90vh;
          border-radius: 14px;
          border: 1.5px solid var(--input-border, var(--pc-border));
          box-shadow: var(--pc-modal-shadow, 0 25px 60px -15px rgba(0, 0, 0, 0.45));
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: scaleUp 0.18s ease-out;
        }
        [data-theme="dark"] .fs-modal-shell {
          --pc-surface: #0f172a;
          --pc-border: #334155;
          --pc-muted: #cbd5e1;
          --pc-tint: #132b4b;
          --pc-blue: #2563eb;
          --pc-tint-fg: #93c5fd;
        }
        .fs-modal-body {
          display: grid;
          grid-template-columns: 310px 1fr;
          flex: 1;
          min-height: 0;
          overflow: hidden;
          background: var(--pc-surface);
        }
        .fs-left-pane {
          padding: 14px;
          border-right: 1px solid var(--pc-border);
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          background: var(--pc-surface);
        }
        .fs-neo-card {
          background: var(--card-bg, #ffffff);
          border: 1px solid var(--pc-border);
          border-radius: 12px;
          padding: 11px 12px;
          box-shadow: var(--pc-neo-subcard);
        }
        .fs-neo-inset {
          background: var(--pc-surface);
          border: 1px solid var(--pc-border);
          border-radius: 10px;
          box-shadow: var(--pc-neo-inset);
        }
        .fs-clay-btn {
          background: var(--card-bg, #ffffff);
          border: 1px solid var(--pc-border);
          border-radius: 8px;
          color: var(--foreground);
          box-shadow: var(--pc-clay-btn);
          cursor: pointer;
          transition: transform 0.1s ease, border-color 0.12s ease;
        }
        .fs-clay-btn:hover:not(:disabled) {
          border-color: var(--pc-blue);
        }
        .fs-clay-btn:active:not(:disabled) {
          transform: translateY(1px);
        }
        .fs-clay-pale {
          background: var(--pc-tint);
          border: 1px solid var(--pc-border);
          color: var(--pc-tint-fg);
          box-shadow: var(--pc-clay-pale);
        }
        .fs-right-pane {
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: var(--card-bg, #ffffff);
          overflow: hidden;
        }
        .fs-mobile-tabs {
          display: none;
          padding: 8px 14px;
          gap: 8px;
          background: var(--pc-surface);
          border-bottom: 1px solid var(--pc-border);
        }
        .fs-resize-handle {
          position: absolute;
          left: 0;
          right: 0;
          height: 14px;
          cursor: ns-resize;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 20;
          touch-action: none;
        }
        .fs-resize-pill {
          width: 36px;
          height: 4px;
          border-radius: 999px;
          background: ${primaryTheme.accent};
          opacity: 0.55;
          transition: transform 0.1s ease, opacity 0.1s ease;
        }
        .fs-resize-handle:hover .fs-resize-pill {
          opacity: 1;
          transform: scaleX(1.25) scaleY(1.15);
        }
        .simple-picker .rdp {
          --rdp-cell-size: 33px;
          --rdp-accent-color: #2563eb;
          --rdp-background-color: var(--pc-tint);
          margin: 0;
        }
        .simple-picker .rdp-caption_label {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--foreground);
          text-transform: capitalize;
        }
        .simple-picker .rdp-nav_button {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          background: var(--card-bg, #ffffff);
          border: 1px solid var(--pc-border);
          box-shadow: var(--pc-clay-btn);
          color: var(--foreground);
        }
        .simple-picker .rdp-head_cell {
          font-size: 0.66rem;
          font-weight: 700;
          color: var(--pc-muted);
          text-transform: uppercase;
        }
        .simple-picker .rdp-day {
          font-size: 0.76rem;
          border-radius: 7px;
          color: var(--foreground);
          font-weight: 600;
        }
        .simple-picker .rdp-day_selected {
          background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%) !important;
          color: #ffffff !important;
          box-shadow: var(--pc-clay-primary);
          font-weight: 800;
        }
        .simple-picker .rdp-day_today:not(.rdp-day_selected) {
          border: 1.5px solid var(--pc-blue);
          color: var(--pc-tint-fg);
          font-weight: 800;
        }
        .simple-picker .rdp-day.fs-rdp-day-leave:not(.rdp-day_selected) {
          background: var(--card-inner, #fef2f2);
          border: 1.5px dashed var(--danger, #ef4444);
          color: var(--danger, #ef4444);
          font-weight: 800;
        }
        @media (max-width: 768px) {
          .fs-modal-shell {
            width: calc(100vw - 16px);
            height: auto;
            max-height: 92vh;
          }
          .fs-mobile-tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }
          .fs-modal-body {
            display: flex;
            flex-direction: column;
            overflow-y: auto;
          }
          .fs-left-pane {
            border-right: none;
            border-bottom: 1px solid var(--pc-border);
            padding: 12px;
            overflow-y: visible;
          }
          .fs-right-pane {
            min-height: 400px;
            flex: 1;
          }
          .fs-hide-mobile {
            display: none !important;
          }
        }
      `}</style>

      <div className="fs-modal-shell" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            padding: '13px 18px',
            borderBottom: '1px solid var(--input-border, #cbd5e1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            background: 'var(--card-inner, #f1f5f9)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                flexShrink: 0,
                borderRadius: 9,
                background: 'var(--badge-clinic-bg, #e0f2fe)',
                border: '1px solid var(--badge-clinic-border, #bae6fd)',
                color: 'var(--badge-clinic-text, #0369a1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--pc-clay-pale)',
              }}
            >
              <CalendarIcon size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '0.94rem',
                  fontWeight: 800,
                  color: 'var(--foreground)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {batchList.length > 1
                  ? `Toplu Randevu Planla (${batchList.length} İşlem)`
                  : 'Randevu Tarihi ve Hekim Planla'}
              </h3>
              <div
                style={{
                  fontSize: '0.73rem',
                  color: 'var(--foreground-2)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {teethSummary ? `${teethSummary} · ` : ''}
                {primaryTreatment?.procedureName}
                {patientInfo?.name ? ` · ${patientInfo.name}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              style={{
                background: 'var(--input-bg, #ffffff)',
                border: '1px solid var(--input-border, #cbd5e1)',
                borderRadius: '50%',
                width: 30,
                height: 30,
                color: 'var(--foreground-2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Mobil Sekme Geçişi */}
        <div className="fs-mobile-tabs">
          <button
            type="button"
            onClick={() => setMobileActivePane('schedule')}
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              border:
                mobileActivePane === 'schedule'
                  ? '1px solid #1d4ed8'
                  : '1px solid var(--input-border, #cbd5e1)',
              background:
                mobileActivePane === 'schedule'
                  ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                  : 'var(--card-bg)',
              color: mobileActivePane === 'schedule' ? '#ffffff' : 'var(--foreground-2)',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: mobileActivePane === 'schedule' ? '#ffffff' : 'inherit' }}>
              🕒 Hekim Günlük Planı
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMobileActivePane('calendar')}
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              border:
                mobileActivePane === 'calendar'
                  ? '1px solid #1d4ed8'
                  : '1px solid var(--input-border, #cbd5e1)',
              background:
                mobileActivePane === 'calendar'
                  ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                  : 'var(--card-bg)',
              color: mobileActivePane === 'calendar' ? '#ffffff' : 'var(--foreground-2)',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: mobileActivePane === 'calendar' ? '#ffffff' : 'inherit' }}>
              📅 Tarih & Hekim Değiştir
            </span>
          </button>
        </div>

        {/* Body */}
        <div className="fs-modal-body">
          {/* SOL SÜTUN: Neomorfik & Claymorfik Kontrol Paneli */}
          <div className={`fs-left-pane ${mobileActivePane === 'schedule' ? 'fs-hide-mobile' : ''}`}>
            {/* 1. Katılan Hekimler Kartı */}
            <div className="fs-neo-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 7,
                }}
              >
                <label
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: 'var(--foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <User size={13} style={{ color: 'var(--pc-blue)' }} />
                  <span>Hekim Seçimi</span>
                </label>
                {selectedDoctorIds.length === 0 ? (
                  <span style={{ fontSize: '0.67rem', color: '#d97706', fontWeight: 700 }}>
                    ⚠️ Hekim Seçin (Atama Bekliyor)
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      color: primaryDocShifts.length > 0 ? '#15803d' : '#d97706',
                    }}
                  >
                    {primaryDocShifts.length > 0
                      ? `${primaryDocShifts[0].startTime} – ${primaryDocShifts[0].endTime}`
                      : 'Vardiya Yok'}
                  </span>
                )}
              </div>
              <TreatmentDoctorMultiSelect
                doctors={doctors}
                selectedDoctorIds={selectedDoctorIds}
                onChange={setSelectedDoctorIds}
                shifts={shifts}
                doctorLeaves={doctorLeaves}
                targetApptTime={`${formattedDateStr}T${selectedStartHHMM}:00`}
                placeholder="Hekim Seçiniz"
                enforceAvailability={false}
              />
              {activeSubstituteLeave && activeSubstituteLeave.substituteDoctorId && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeSubstituteLeave.substituteDoctorId) {
                      setSelectedDoctorIds([activeSubstituteLeave.substituteDoctorId]);
                    }
                  }}
                  className="fs-clay-btn fs-clay-pale"
                  style={{
                    marginTop: 7,
                    width: '100%',
                    padding: '6px 9px',
                    borderRadius: 8,
                    fontSize: '0.7rem',
                    fontWeight: 750,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <span>
                    🔄 Yerine bakan hekime geç:{' '}
                    <strong>
                      {activeSubstituteLeave.substituteDoctorName ||
                        doctors.find((d: any) => d.id === activeSubstituteLeave.substituteDoctorId)
                          ?.name ||
                        'Vekil Hekim'}
                    </strong>
                  </span>
                  <ChevronRight size={13} />
                </button>
              )}
            </div>

            {/* 2. Tarih Seçimi Kartı (DayPicker) */}
            <div className="fs-neo-card" style={{ padding: '10px 10px 8px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                  padding: '0 2px',
                }}
              >
                <label
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: 'var(--foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <CalendarIcon size={13} style={{ color: 'var(--pc-blue)' }} />
                  <span>Randevu Tarihi</span>
                </label>
                <span
                  className="fs-clay-pale"
                  style={{
                    fontSize: '0.67rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  {format(selectedDate, 'd MMM yyyy', { locale: tr })}
                </span>
              </div>

              <div
                className="fs-neo-inset"
                style={{
                  padding: '6px 4px',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <div className="simple-picker">
                  <DayPicker
                    mode="single"
                    weekStartsOn={1}
                    showOutsideDays
                    selected={selectedDate}
                    onSelect={(d) => {
                      if (d) {
                        setSelectedDate(d);
                        setMobileActivePane('schedule');
                      }
                    }}
                    modifiers={{
                      onLeave: (d: Date) => doctorLeaveDatesSet.has(format(d, 'yyyy-MM-dd')),
                    }}
                    modifiersClassNames={{
                      onLeave: 'fs-rdp-day-leave',
                    }}
                    locale={tr}
                    defaultMonth={selectedDate}
                  />
                </div>
              </div>
            </div>

            {/* 3. Saat Aralığı Kartı (Neomorfik Inputlar + Claymorfik Süre Rozeti) */}
            <div className="fs-neo-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: isCurrentSelectionValid ? 'var(--foreground)' : 'var(--danger, #ef4444)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Clock size={13} style={{ color: isCurrentSelectionValid ? 'var(--pc-blue)' : 'var(--danger)' }} />
                  <span>{isCurrentSelectionValid ? 'Saat Aralığı' : 'Saat Uygun Değil'}</span>
                </span>
                <span
                  className="fs-clay-pale"
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  {selectedDurationMin} dk
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--pc-muted)' }}>
                    Başlangıç
                  </span>
                  <input
                    ref={startInputRef}
                    type="time"
                    step={60}
                    defaultValue={selectedStartHHMM}
                    key={`start-${selectedStartHHMM}`}
                    onChange={(e) => handleManualTimeInput('start', e.target.value)}
                    className="fs-neo-inset"
                    style={{
                      padding: '6px 8px',
                      color: 'var(--foreground)',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      outline: 'none',
                    }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--pc-muted)' }}>
                    Bitiş
                  </span>
                  <input
                    ref={endInputRef}
                    type="time"
                    step={60}
                    defaultValue={selectedEndHHMM}
                    key={`end-${selectedEndHHMM}`}
                    onChange={(e) => handleManualTimeInput('end', e.target.value)}
                    className="fs-neo-inset"
                    style={{
                      padding: '6px 8px',
                      color: 'var(--foreground)',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      outline: 'none',
                    }}
                  />
                </label>
              </div>
              <div ref={summaryTimeRef} style={{ display: 'none' }} />
            </div>
          </div>

          {/* SAĞ SÜTUN: Seçilen Hekimin Günlük Takvim Görünümü */}
          <div className={`fs-right-pane ${mobileActivePane === 'calendar' ? 'fs-hide-mobile' : ''}`}>
            {/* Günlük Takvim Başlığı */}
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--card-bg, #ffffff)',
                borderBottom: '1px solid var(--pc-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <button
                  type="button"
                  className="fs-clay-btn"
                  onClick={() => {
                    const prev = new Date(selectedDate);
                    prev.setDate(prev.getDate() - 1);
                    setSelectedDate(prev);
                  }}
                  title="Önceki Gün"
                  style={{
                    width: 28,
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  className="fs-clay-btn"
                  onClick={() => {
                    const next = new Date(selectedDate);
                    next.setDate(next.getDate() + 1);
                    setSelectedDate(next);
                  }}
                  title="Sonraki Gün"
                  style={{
                    width: 28,
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ChevronRight size={14} />
                </button>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.84rem',
                      fontWeight: 800,
                      color: 'var(--foreground)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: primaryDoctor?.color || '#2563eb',
                        flexShrink: 0,
                      }}
                    />
                    <span>{primaryDoctor ? primaryDoctor.name : 'Hekim Seçilmedi'}</span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: 'var(--pc-muted)',
                      }}
                    >
                      · {format(selectedDate, 'd MMMM EEEE', { locale: tr })}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  className="fs-clay-pale"
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}
                >
                  {Math.round((totalFreeMinutes / 60) * 10) / 10} Saat Müsait
                </span>
              </div>
            </div>

            {/* Seansa Dahil Tedaviler (Grupla) Yatay Claymorfik Bar */}
            {availablePatientTreatments.length > 0 && (
              <div
                style={{
                  padding: '8px 14px',
                  background: 'var(--pc-surface)',
                  borderBottom: '1px solid var(--pc-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      color: 'var(--pc-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      marginRight: 2,
                    }}
                  >
                    <Layers size={12} style={{ color: 'var(--pc-blue)' }} />
                    <span>Seans İşlemleri:</span>
                  </span>

                  {availablePatientTreatments.map((item: any, idx: number) => {
                    const isChecked = selectedTreatmentIds.includes(item.id);
                    const itemTheme = getTreatmentColorTheme(item, idx);
                    return (
                      <button
                        key={item.id || idx}
                        type="button"
                        onClick={() => item.id && toggleTreatmentSelection(item.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 9px',
                          borderRadius: 8,
                          background: isChecked ? itemTheme.softBg : 'var(--card-bg, #ffffff)',
                          border: isChecked
                            ? `1.5px solid ${itemTheme.accent}`
                            : '1px solid var(--pc-border)',
                          boxShadow: 'var(--pc-clay-btn)',
                          cursor: 'pointer',
                          fontSize: '0.71rem',
                          fontWeight: 700,
                          color: isChecked ? itemTheme.badgeText : 'var(--foreground-2)',
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: itemTheme.accent,
                            flexShrink: 0,
                          }}
                        />
                        <span>
                          {item.toothNumber ? `#${item.toothNumber} ` : ''}
                          {item.procedureName}
                        </span>
                        {isChecked && <Check size={11} style={{ color: itemTheme.badgeText }} />}
                      </button>
                    );
                  })}
                </div>

                {availablePatientTreatments.length > 1 && (
                  <button
                    type="button"
                    className="fs-clay-btn fs-clay-pale"
                    onClick={() => {
                      const allIds = availablePatientTreatments.map((t) => t.id).filter(Boolean);
                      if (selectedTreatmentIds.length === allIds.length) {
                        const firstId = initialBatchList[0]?.id || allIds[0];
                        setSelectedTreatmentIds(firstId ? [firstId] : []);
                      } else {
                        setSelectedTreatmentIds(allIds);
                      }
                    }}
                    style={{
                      padding: '4px 9px',
                      borderRadius: 7,
                      fontSize: '0.67rem',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {selectedTreatmentIds.length === availablePatientTreatments.length
                      ? 'Sadece İlk İşlem'
                      : `Tümünü Birleştir (${availablePatientTreatments.length})`}
                  </button>
                )}
              </div>
            )}

            {/* Günlük Zaman Çizelgesi */}
            <div
              ref={timelineScrollRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                position: 'relative',
                background: 'var(--card-bg, #ffffff)',
                userSelect: 'none',
              }}
            >
              <div
                ref={timelineCanvasRef}
                onPointerDown={handleTimelinePointerDown}
                onPointerMove={handleCanvasPointerMoveHover}
                onPointerLeave={handleCanvasPointerLeave}
                style={{
                  position: 'relative',
                  height: totalTimelineHeight,
                  cursor: freeIntervals.length > 0 ? 'crosshair' : 'not-allowed',
                }}
              >
                {/* Arka Plan Saat Izgarası */}
                {halfHourRows.map((row) => {
                  const inShift = isMinuteInShift(row.startMin);
                  return (
                    <div
                      key={row.time}
                      style={{
                        height: HALF_HOUR_HEIGHT,
                        display: 'grid',
                        gridTemplateColumns: '58px 1fr',
                        borderBottom: row.isHourStart
                          ? '1px dashed var(--input-border, #cbd5e1)'
                          : '1px solid var(--input-border, #cbd5e1)',
                        background: inShift
                          ? 'var(--card-bg, #ffffff)'
                          : 'repeating-linear-gradient(135deg, var(--card-inner, #f1f5f9), var(--card-inner, #f1f5f9) 8px, var(--card-bg, #ffffff) 8px, var(--card-bg, #ffffff) 16px)',
                        boxSizing: 'border-box',
                        pointerEvents: 'none',
                      }}
                    >
                      <div
                        style={{
                          borderRight: '1px solid var(--input-border, #cbd5e1)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'center',
                          paddingTop: 4,
                          fontSize: '0.71rem',
                          fontWeight: row.isHourStart ? 700 : 600,
                          color: inShift ? 'var(--foreground-2)' : 'var(--foreground-3)',
                          background: 'var(--card-inner, #f1f5f9)',
                        }}
                      >
                        {row.time}
                      </div>

                      <div
                        style={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 12px',
                        }}
                      >
                        {!inShift && (
                          <span
                            style={{
                              fontSize: '0.67rem',
                              fontWeight: 600,
                              color: 'var(--foreground-3)',
                            }}
                          >
                            Mesai Dışı
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Canlı Fare Saat Kılavuz Çizgisi (120 FPS Hover Guide) */}
                <div
                  ref={hoverGuideRef}
                  style={{
                    display: 'none',
                    position: 'absolute',
                    left: 58,
                    right: 0,
                    height: 0,
                    borderTop: '1.5px dashed #3b82f6',
                    pointerEvents: 'none',
                    zIndex: 8,
                    alignItems: 'center',
                  }}
                >
                  <span
                    ref={hoverGuideLabelRef}
                    style={{
                      position: 'absolute',
                      left: -52,
                      top: -10,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: '#2563eb',
                      color: '#ffffff',
                      fontSize: '0.66rem',
                      fontWeight: 800,
                    }}
                  >
                    10:00
                  </span>
                </div>

                {/* İzinli / Kapalı Bloklar (Salt-Okunur) */}
                {dayLeavesForSelectedDoctors.map((l) => {
                  const lStart = l.isFullDay ? dayStartMin : parseHHMMToMinutes(l.startTime, dayStartMin);
                  const lEnd = l.isFullDay ? dayEndMin : parseHHMMToMinutes(l.endTime, dayEndMin);
                  const clampedStart = Math.max(dayStartMin, lStart);
                  const clampedEnd = Math.min(dayEndMin, Math.max(clampedStart + 15, lEnd));
                  const top = (clampedStart - dayStartMin) * PX_PER_MINUTE + 1;
                  const height = Math.max(22, (clampedEnd - clampedStart) * PX_PER_MINUTE - 2);

                  return (
                    <div
                      key={`leave-${l.id}`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        import('react-hot-toast').then((mod) =>
                          mod.toast.error('🏖️ Hekim bu saat aralığında izinlidir. Randevu planlanamaz.')
                        );
                      }}
                      style={{
                        position: 'absolute',
                        top,
                        left: 62,
                        right: 8,
                        height,
                        borderRadius: 8,
                        background: 'var(--card-inner, #f1f5f9)',
                        border: '1.5px dashed var(--danger, #ef4444)',
                        padding: '4px 10px',
                        boxSizing: 'border-box',
                        cursor: 'not-allowed',
                        zIndex: 5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <CalendarOff size={13} style={{ color: 'var(--danger, #ef4444)', flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: '0.73rem',
                            fontWeight: 700,
                            color: 'var(--foreground)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          Kapalı · İzinli ({l.isFullDay ? 'Tüm Gün' : `${l.startTime} - ${l.endTime}`})
                          {l.reason ? ` — ${l.reason}` : ''}
                          {l.substituteDoctorName ? ` · Yerine: ${l.substituteDoctorName}` : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {l.substituteDoctorId && (
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (l.substituteDoctorId) {
                                setSelectedDoctorIds([l.substituteDoctorId]);
                              }
                            }}
                            className="fs-clay-btn fs-clay-pale"
                            style={{
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            Vekil Hekime Geç ({l.substituteDoctorName || 'Hekim'})
                          </button>
                        )}
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            color: 'var(--danger, #ef4444)',
                            flexShrink: 0,
                          }}
                        >
                          İzinli
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Hekimin O Günkü Mevcut Randevuları (Çakışanlar yan yana sütunlarda gösterilir, arkadaki seans asla kapanmaz) */}
                {layoutDayAppointments.map((ev: any) => {
                  const clampedStart = Math.max(dayStartMin, ev.startMin);
                  const clampedEnd = Math.min(dayEndMin, Math.max(clampedStart + 10, ev.endMin));
                  if (clampedEnd <= dayStartMin || clampedStart >= dayEndMin) return null;

                  const top = (clampedStart - dayStartMin) * PX_PER_MINUTE + 1;
                  const height = Math.max(24, (clampedEnd - clampedStart) * PX_PER_MINUTE - 2);
                  const isSamePatientOtherAppt = Boolean(ev.isSamePatient);
                  const isActiveMergeTarget =
                    isSamePatientOtherAppt && overlappingSamePatientAppt?.id === ev.id;

                  const totalCols = ev.totalCols || 1;
                  const colIndex = ev.colIndex || 0;
                  const colGapPx = 4;
                  const leftCalc =
                    totalCols === 1
                      ? '62px'
                      : `calc(62px + (100% - 70px) * ${colIndex / totalCols} + ${colIndex * (colGapPx / 2)}px)`;
                  const widthCalc =
                    totalCols === 1
                      ? 'calc(100% - 70px)'
                      : `calc((100% - 70px) / ${totalCols} - ${((totalCols - 1) * colGapPx) / totalCols}px)`;

                  return (
                    <div
                      key={`ev-${ev.id}`}
                      data-same-patient-appt-id={isSamePatientOtherAppt ? ev.id : undefined}
                      onPointerDown={(e) => {
                        if (isSamePatientOtherAppt) {
                          setPreferredMergeApptId(ev.id);
                          return;
                        }
                        e.stopPropagation();
                        import('react-hot-toast').then((mod) =>
                          mod.toast.error(
                            '🔒 Bu randevu başka bir hastaya aittir. Bir hekim aynı anda iki farklı hastaya bakamaz.'
                          )
                        );
                      }}
                      title={`${ev.startHHMM} - ${ev.endHHMM} · ${ev.title}`}
                      style={{
                        position: 'absolute',
                        top,
                        left: leftCalc,
                        width: widthCalc,
                        height,
                        borderRadius: 8,
                        background: isActiveMergeTarget
                          ? '#ccfbf1'
                          : isSamePatientOtherAppt
                            ? '#f0fdf4'
                            : 'var(--pc-surface, #f1f5f9)',
                        borderTop: isActiveMergeTarget
                          ? '2px solid #0d9488'
                          : isSamePatientOtherAppt
                            ? '1.5px dashed #0d9488'
                            : '1px solid var(--pc-border, #cbd5e1)',
                        borderRight: isActiveMergeTarget
                          ? '2px solid #0d9488'
                          : isSamePatientOtherAppt
                            ? '1.5px dashed #0d9488'
                            : '1px solid var(--pc-border, #cbd5e1)',
                        borderBottom: isActiveMergeTarget
                          ? '2px solid #0d9488'
                          : isSamePatientOtherAppt
                            ? '1.5px dashed #0d9488'
                            : '1px solid var(--pc-border, #cbd5e1)',
                        borderLeft: `4px solid ${isSamePatientOtherAppt ? '#0d9488' : ev.doctorColor || '#64748b'
                          }`,
                        boxShadow: isActiveMergeTarget
                          ? '0 0 0 2px rgba(13, 148, 136, 0.25)'
                          : 'var(--pc-clay-btn)',
                        padding: '5px 8px',
                        boxSizing: 'border-box',
                        cursor: isSamePatientOtherAppt ? 'pointer' : 'not-allowed',
                        pointerEvents: isSamePatientOtherAppt ? 'none' : 'auto',
                        zIndex: isActiveMergeTarget ? 7 : isSamePatientOtherAppt ? 5 : 6,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 6,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            color: isSamePatientOtherAppt ? '#0f766e' : 'var(--foreground)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {ev.title}
                        </div>
                        <div
                          style={{
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            color: isSamePatientOtherAppt ? '#115e59' : 'var(--pc-muted)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ev.startHHMM} – {ev.endHHMM}
                          {selectedDoctorIds.length > 1 && ev.doctorName ? ` · ${ev.doctorName}` : ''}
                        </div>
                      </div>

                      <button
                        type="button"
                        onPointerDown={(e) => {
                          if (!isSamePatientOtherAppt) return;
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          if (!isSamePatientOtherAppt) return;
                          e.stopPropagation();
                          setPreferredMergeApptId(ev.id);
                          preferredMergeApptIdRef.current = ev.id;
                          const [curS, curE] = liveRangeRef.current;
                          const overlapsNow = curS < ev.endMin && curE > ev.startMin;
                          if (!overlapsNow) {
                            const dur = Math.max(MIN_DURATION_MIN, curE - curS);
                            const nextS = ev.startMin;
                            const nextE = Math.min(dayEndMin, Math.max(ev.endMin, nextS + dur));
                            applyLiveRangeToDOM(nextS, nextE);
                            setSelectedRange([nextS, nextE]);
                          } else {
                            applyLiveRangeToDOM(curS, curE);
                          }
                        }}
                        title={
                          isSamePatientOtherAppt
                            ? `Bu seansla (${ev.startHHMM}–${ev.endHHMM}) birleştirmek için tıklayın`
                            : 'Başka hastaya ait randevu'
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 7px',
                          borderRadius: 999,
                          fontSize: '0.63rem',
                          fontWeight: 800,
                          flexShrink: 0,
                          pointerEvents: isSamePatientOtherAppt ? 'auto' : 'none',
                          cursor: isSamePatientOtherAppt ? 'pointer' : 'not-allowed',
                          background: isActiveMergeTarget
                            ? '#0d9488'
                            : isSamePatientOtherAppt
                              ? '#ccfbf1'
                              : 'var(--card-bg, #ffffff)',
                          border: isSamePatientOtherAppt
                            ? '1px solid #0d9488'
                            : '1px solid var(--pc-border, #cbd5e1)',
                          color: isActiveMergeTarget
                            ? '#ffffff'
                            : isSamePatientOtherAppt
                              ? '#0f766e'
                              : 'var(--pc-muted)',
                          boxShadow: 'var(--pc-clay-btn)',
                        }}
                      >
                        {isSamePatientOtherAppt ? (
                          <>
                            <Link2
                              size={10}
                              style={{ color: isActiveMergeTarget ? '#ffffff' : '#0f766e' }}
                            />
                            <span
                              data-merge-badge-label
                              style={{ color: isActiveMergeTarget ? '#ffffff' : '#0f766e' }}
                            >
                              {isActiveMergeTarget
                                ? '✅ Bu Seansla Birleşecek'
                                : 'Aynı Hasta · Birleştir'}
                            </span>
                          </>
                        ) : (
                          <>
                            <Lock size={10} />
                            <span>Dolu</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}

                {/* İnteraktif Seçilen Yeni Randevu Bloğu (Yumuşak Klinik Pastel + İşlem Renk Kimlikli) */}
                <div
                  ref={selectionBoxRef}
                  onPointerDown={(e) => startBlockInteraction(e, 'move')}
                  style={{
                    display: isCurrentSelectionValid ? 'flex' : 'none',
                    position: 'absolute',
                    top: (selectedStartMin - dayStartMin) * PX_PER_MINUTE,
                    left: 62,
                    right: 8,
                    height: Math.max(
                      MIN_DURATION_MIN * PX_PER_MINUTE,
                      (selectedEndMin - selectedStartMin) * PX_PER_MINUTE
                    ),
                    borderRadius: 8,
                    background: primaryTheme.softBg,
                    borderTop: `1.5px solid ${primaryTheme.accent}`,
                    borderRight: `1.5px solid ${primaryTheme.accent}`,
                    borderBottom: `1.5px solid ${primaryTheme.accent}`,
                    borderLeft: `5px solid ${primaryTheme.accent}`,
                    boxShadow: '0 4px 12px -2px rgba(15, 23, 42, 0.14)',
                    padding: '4px 10px',
                    boxSizing: 'border-box',
                    zIndex: 12,
                    cursor: 'grab',
                    touchAction: 'none',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    overflow: 'hidden',
                    willChange: 'top, height',
                  }}
                >
                  {/* Üst Boyutlandırma Tutamacı */}
                  <div
                    className="fs-resize-handle"
                    style={{ top: 0 }}
                    onPointerDown={(e) => startBlockInteraction(e, 'resize-top')}
                    title="Başlangıç saatini dakika hassasiyetiyle değiştirmek için sürükleyin"
                  >
                    <div className="fs-resize-pill" />
                  </div>

                  <div
                    style={{
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap',
                      pointerEvents: 'none',
                      overflow: 'hidden',
                    }}
                  >
                    <GripHorizontal
                      size={14}
                      style={{ color: primaryTheme.badgeText, flexShrink: 0 }}
                    />
                    <span
                      ref={selectionTitleRef}
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        color: primaryTheme.badgeText,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {selectedStartHHMM} – {selectedEndHHMM}
                    </span>

                    {batchList.map((item: any, idx: number) => {
                      const itemTheme = getTreatmentColorTheme(item, idx);
                      const pillLabel = `${item.toothNumber ? `#${item.toothNumber} ` : ''}${item.procedureName || 'Tedavi'
                        }`;
                      return (
                        <span
                          key={item.id || idx}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '1px 7px',
                            borderRadius: 6,
                            background: '#ffffff',
                            border: `1px solid ${itemTheme.accent}`,
                            color: itemTheme.badgeText,
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: itemTheme.accent,
                              flexShrink: 0,
                            }}
                          />
                          <span>{pillLabel}</span>
                        </span>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      flexShrink: 0,
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      ref={selectionMergeBadgeRef}
                      style={{
                        display: overlappingSamePatientAppt ? 'inline-flex' : 'none',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        color: '#0f766e',
                        background: '#ccfbf1',
                        border: '1px solid #0d9488',
                        padding: '2px 7px',
                        borderRadius: 999,
                      }}
                    >
                      {overlappingSamePatientAppt
                        ? `🔗 Birleştir: ${formatApptShortLabel(overlappingSamePatientAppt)}`
                        : '🔗 Mevcut Seansla Birleştir'}
                    </span>
                    <span
                      ref={selectionBadgeRef}
                      style={{
                        fontSize: '0.67rem',
                        fontWeight: 800,
                        color: primaryTheme.badgeText,
                        background: primaryTheme.badgeBg,
                        border: `1px solid ${primaryTheme.accent}`,
                        padding: '2px 8px',
                        borderRadius: 999,
                        flexShrink: 0,
                      }}
                    >
                      {selectedDurationMin} dk
                    </span>
                  </div>

                  {/* Alt Boyutlandırma Tutamacı */}
                  <div
                    className="fs-resize-handle"
                    style={{ bottom: 0 }}
                    onPointerDown={(e) => startBlockInteraction(e, 'resize-bottom')}
                    title="Bitiş saatini dakika hassasiyetiyle değiştirmek için sürükleyin"
                  >
                    <div className="fs-resize-pill" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--input-border, #cbd5e1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            background: 'var(--card-inner, #f1f5f9)',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: isCurrentSelectionValid ? 'var(--foreground-2)' : 'var(--danger, #ef4444)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {isCurrentSelectionValid ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Clock size={14} style={{ color: 'var(--accent, #0284c7)' }} />
                <span>
                  {overlappingSamePatientAppt
                    ? `Birleştirilecek Seans (${formatApptShortLabel(overlappingSamePatientAppt)}): `
                    : 'Planlanacak: '}
                  <strong style={{ color: 'var(--foreground)' }}>{displayDateStr}</strong>{' '}
                  <strong ref={footerTimeRef} style={{ color: 'var(--accent, #0284c7)' }}>
                    {selectedStartHHMM} – {selectedEndHHMM} ({selectedDurationMin} dk)
                  </strong>
                </span>
                {overlappingSamePatientAppts.length > 1 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--pc-muted)' }}>Hedef Seans:</span>
                    {overlappingSamePatientAppts.map((ap: any) => {
                      const isActive = overlappingSamePatientAppt?.id === ap.id;
                      return (
                        <button
                          key={ap.id}
                          type="button"
                          onClick={() => setPreferredMergeApptId(ap.id)}
                          className="fs-clay-btn"
                          style={{
                            padding: '2px 7px',
                            borderRadius: 999,
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            background: isActive ? '#0d9488' : 'var(--card-bg)',
                            color: isActive ? '#ffffff' : '#0f766e',
                            border: '1px solid #0d9488',
                          }}
                        >
                          <span style={{ color: isActive ? '#ffffff' : '#0f766e' }}>
                            {ap.startHHMM}–{ap.endHHMM}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <>
                <AlertCircle size={14} />
                <span>Seçilen tarihte uygun boş saat aralığı bulunamadı</span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                background: 'var(--btn-clinic-secondary-bg, #eff6ff)',
                color: 'var(--btn-clinic-secondary-text, #0284c7)',
                boxShadow: 'var(--pc-clay-btn)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || !isCurrentSelectionValid}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: '1px solid #1d4ed8',
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                boxShadow: 'var(--pc-clay-primary)',
                color: '#ffffff',
                cursor: isSubmitting || !isCurrentSelectionValid ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: isSubmitting || !isCurrentSelectionValid ? 0.55 : 1,
              }}
            >
              {overlappingSamePatientAppt ? (
                <Link2 size={15} style={{ color: '#ffffff' }} />
              ) : (
                <Check size={15} style={{ color: '#ffffff' }} />
              )}
              <span style={{ color: '#ffffff' }}>
                {isSubmitting
                  ? 'Planlanıyor...'
                  : overlappingSamePatientAppt
                    ? '🔗 Mevcut Seansla Birleştir'
                    : batchList.length > 1
                      ? `Seansı Planla (${batchList.length} Tedavi)`
                      : 'Oluştur ve Planla'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
