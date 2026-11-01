import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Sparkles,
  ExternalLink,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss';
import TreatmentDoctorMultiSelect from './TreatmentDoctorMultiSelect';
import type { DoctorLeaveItem } from './DoctorLeaveModal';

interface FastScheduleModalProps {
  treatment: any;
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
  onPickOnMainCalendar?: (targetDateStr: string, doctorIds: string[]) => void;
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
  const norm = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const ROW_HEIGHT = 44; // 30 dk satır yüksekliği (px)

export default function FastScheduleModal({
  treatment,
  patientInfo,
  selectedEvent,
  doctors,
  shifts = [],
  existingEvents = [],
  doctorLeaves = [],
  workingHours,
  onPickOnMainCalendar,
  onClose,
  onSuccess,
}: FastScheduleModalProps) {
  const backdropDismiss = useBackdropDismiss(onClose);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  const batchList: any[] =
    Array.isArray(treatment?.batchTreatments) && treatment.batchTreatments.length > 0
      ? treatment.batchTreatments
      : treatment
      ? [treatment]
      : [];
  const primaryTreatment = batchList[0] || treatment;

  // Bu tedavi grubunun şu an bağlı olduğu mevcut randevu ID'leri
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

  const [selectedTime, setSelectedTime] = useState<string>(() => {
    if (treatment?.prefillTime) return treatment.prefillTime;
    const sessionTime = primaryTreatment?.sessions?.[0]?.startTime;
    if (sessionTime) {
      return new Date(sessionTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    if (primaryTreatment?.plannedDate) {
      return new Date(primaryTreatment.plannedDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    if (selectedEvent?.startTime) {
      return new Date(selectedEvent.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    return '10:00';
  });

  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>(() => {
    if (Array.isArray(treatment?.prefillDoctorIds) && treatment.prefillDoctorIds.length > 0) {
      return treatment.prefillDoctorIds;
    }
    if (Array.isArray(primaryTreatment?.doctorIds) && primaryTreatment.doctorIds.length > 0) {
      return primaryTreatment.doctorIds;
    }
    if (Array.isArray(primaryTreatment?.metadata?.doctorIds) && primaryTreatment.metadata.doctorIds.length > 0) {
      return primaryTreatment.metadata.doctorIds;
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

  // Klinik çalışma saatleri sınırları
  const slotStartHour = typeof workingHours?.slotStartHour === 'number' ? workingHours.slotStartHour : 8;
  const slotEndHour =
    typeof workingHours?.slotEndHour === 'number'
      ? Math.max(workingHours.slotEndHour, slotStartHour + 1)
      : 20;

  // 30 dakikalık zaman dilimleri
  const timeSlots = useMemo(() => {
    const list: { time: string; startMin: number; endMin: number }[] = [];
    for (let h = slotStartHour; h < slotEndHour; h++) {
      for (const m of [0, 30]) {
        const startMin = h * 60 + m;
        const endMin = startMin + 30;
        list.push({
          time: minutesToHHMM(startMin),
          startMin,
          endMin,
        });
      }
    }
    return list;
  }, [slotStartHour, slotEndHour]);

  // Seçilen hekimlerin o günkü vardiyaları
  const selectedDoctorsShiftsOnDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const docId of selectedDoctorIds) {
      map[docId] = (shifts || []).filter((s: any) => s.userId === docId && s.date === formattedDateStr);
    }
    return map;
  }, [shifts, selectedDoctorIds, formattedDateStr]);

  // Seçilen hekimlerin o günkü izinleri
  const dayLeavesForSelectedDoctors = useMemo(() => {
    return (doctorLeaves || []).filter(
      (l) => selectedDoctorIds.includes(l.doctorId) && l.date === formattedDateStr
    );
  }, [doctorLeaves, selectedDoctorIds, formattedDateStr]);

  // Seçilen hekimlerin o günkü mevcut randevuları
  const dayAppointmentsForSelectedDoctors = useMemo(() => {
    return (existingEvents || [])
      .filter((ev: any) => {
        if (!ev?.startTime || ev.status === 'cancelled') return false;
        const evDate = getLocalYMD(ev.startTime);
        if (evDate !== formattedDateStr) return false;
        return ev.doctorId && selectedDoctorIds.includes(ev.doctorId);
      })
      .map((ev: any) => {
        const sDt = new Date(ev.startTime);
        const eDt = ev.endTime ? new Date(ev.endTime) : new Date(sDt.getTime() + 30 * 60000);
        const startMin = sDt.getHours() * 60 + sDt.getMinutes();
        const rawEndMin = eDt.getHours() * 60 + eDt.getMinutes();
        const endMin = rawEndMin > startMin ? rawEndMin : startMin + 30;
        const isCurrentTreatmentAppt = currentLinkedAppointmentIds.has(ev.id);
        const isSamePatient =
          Boolean(selectedEvent?.patientId) && ev.patientId === selectedEvent.patientId;
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
        };
      })
      .sort((a: any, b: any) => a.startMin - b.startMin);
  }, [existingEvents, formattedDateStr, selectedDoctorIds, currentLinkedAppointmentIds, selectedEvent, doctors]);

  // Her 30 dk dilimin durumunu hesapla (Boşluk / Dolu / İzinli / Mesai Dışı)
  const slotStatusMap = useMemo(() => {
    const map: Record<
      string,
      {
        available: boolean;
        reason?: 'no_doctor' | 'outside_shift' | 'on_leave' | 'occupied';
        reasonLabel?: string;
        samePatientAppt?: any;
        isCurrentTreatmentSlot?: boolean;
      }
    > = {};

    for (const slot of timeSlots) {
      if (selectedDoctorIds.length === 0) {
        map[slot.time] = {
          available: false,
          reason: 'no_doctor',
          reasonLabel: 'Önce hekim seçiniz',
        };
        continue;
      }

      // 1. Vardiya kontrolü (Katılan tüm hekimlerin bu saatte vardiyası olmalı)
      let shiftMissingDocName: string | null = null;
      for (const docId of selectedDoctorIds) {
        const docShifts = selectedDoctorsShiftsOnDay[docId] || [];
        const docName = doctors.find((d: any) => d.id === docId)?.name || 'Hekim';
        const isCovered = docShifts.some((s: any) => {
          const sStart = parseHHMMToMinutes(s.startTime, 0);
          let sEnd = parseHHMMToMinutes(s.endTime, 1440);
          if (sEnd <= sStart) sEnd += 1440;
          return slot.startMin >= sStart && slot.endMin <= sEnd;
        });
        if (!isCovered) {
          shiftMissingDocName = docName;
          break;
        }
      }

      if (shiftMissingDocName) {
        map[slot.time] = {
          available: false,
          reason: 'outside_shift',
          reasonLabel: 'Mesai Dışı',
        };
        continue;
      }

      // 2. İzin kontrolü
      const conflictLeave = dayLeavesForSelectedDoctors.find((l) => {
        if (l.isFullDay) return true;
        const lStart = parseHHMMToMinutes(l.startTime, 0);
        const lEnd = parseHHMMToMinutes(l.endTime, 1440);
        return slot.startMin < lEnd && slot.endMin > lStart;
      });

      if (conflictLeave) {
        map[slot.time] = {
          available: false,
          reason: 'on_leave',
          reasonLabel: conflictLeave.reason ? `İzinli (${conflictLeave.reason})` : 'İzinli / Kapalı',
        };
        continue;
      }

      // 3. Mevcut randevu çakışma kontrolü
      const overlappingAppts = dayAppointmentsForSelectedDoctors.filter(
        (ev: any) => slot.startMin < ev.endMin && slot.endMin > ev.startMin
      );

      // Başka bir hastanın randevusu varsa kesinlikle dolu / değiştirilemez!
      const otherPatientAppt = overlappingAppts.find((ev: any) => !ev.isSamePatient);
      if (otherPatientAppt) {
        map[slot.time] = {
          available: false,
          reason: 'occupied',
          reasonLabel: `Dolu · ${otherPatientAppt.title}`,
        };
        continue;
      }

      const samePatientAppt = overlappingAppts.find((ev: any) => ev.isSamePatient);
      const isCurrentTreatmentSlot = overlappingAppts.some((ev: any) => ev.isCurrentTreatmentAppt);

      map[slot.time] = {
        available: true,
        samePatientAppt,
        isCurrentTreatmentSlot,
      };
    }

    return map;
  }, [
    timeSlots,
    selectedDoctorIds,
    selectedDoctorsShiftsOnDay,
    doctors,
    dayLeavesForSelectedDoctors,
    dayAppointmentsForSelectedDoctors,
  ]);

  // Seçilen gün veya hekim değiştiğinde eğer mevcut selectedTime müsait değilse ilk boş saati otomatik seç
  useEffect(() => {
    const currentStatus = slotStatusMap[selectedTime];
    if (!currentStatus?.available) {
      const firstAvailable = timeSlots.find((s) => slotStatusMap[s.time]?.available);
      if (firstAvailable) {
        setSelectedTime(firstAvailable.time);
      }
    }
  }, [formattedDateStr, selectedDoctorIds, slotStatusMap, timeSlots, selectedTime]);

  // Günlük görünüm açıldığında veya tarih/hekim değiştiğinde vardiya başlangıcına / seçili saate kaydır
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!timelineScrollRef.current) return;
      const targetMin = parseHHMMToMinutes(selectedTime, slotStartHour * 60);
      const offsetSlots = Math.max(0, (targetMin - slotStartHour * 60) / 30);
      const scrollTop = Math.max(0, offsetSlots * ROW_HEIGHT - ROW_HEIGHT * 2);
      timelineScrollRef.current.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(timer);
  }, [formattedDateStr, primaryDoctorId, slotStartHour, mobileActivePane]);

  const availableSlotCount = useMemo(
    () => timeSlots.filter((s) => slotStatusMap[s.time]?.available).length,
    [timeSlots, slotStatusMap]
  );

  const selectedSlotInfo = slotStatusMap[selectedTime];
  const selectedStartMin = parseHHMMToMinutes(selectedTime, 600);
  const selectedEndTime = minutesToHHMM(selectedStartMin + 30);

  const handleSlotClick = (slotTime: string) => {
    const status = slotStatusMap[slotTime];
    if (!status) return;
    if (!status.available) {
      import('react-hot-toast').then((mod) => {
        if (status.reason === 'occupied') {
          mod.toast.error('🔒 Bu saatte hekimin başka bir randevusu bulunuyor. Sadece boşlukları seçebilirsiniz.');
        } else if (status.reason === 'on_leave') {
          mod.toast.error('🏖️ Seçilen hekim bu saat aralığında izinlidir.');
        } else if (status.reason === 'outside_shift') {
          mod.toast.error('⚠️ Bu saat dilimi hekimin vardiya saatleri dışındadır.');
        } else {
          mod.toast.error('Lütfen önce katılan hekimi seçin.');
        }
      });
      return;
    }
    setSelectedTime(slotTime);
  };

  const handleSave = async () => {
    if (batchList.length === 0 || !selectedEvent) return;
    if (selectedDoctorIds.length === 0) {
      import('react-hot-toast').then((mod) => mod.toast.error('⚠️ Lütfen en az bir hekim seçiniz!'));
      return;
    }
    if (!selectedSlotInfo?.available) {
      import('react-hot-toast').then((mod) =>
        mod.toast.error('⚠️ Seçilen saat dilimi müsait değil. Lütfen günlük programdan boş bir saat seçin!')
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const startDt = new Date(`${formattedDateStr}T${selectedTime}:00+03:00`);
      const endDt = new Date(startDt.getTime() + 30 * 60000);
      const titleStr = `${patientInfo?.name || 'Hasta'} - ${primaryTreatment.procedureName}`;

      // Vardiya & İzin & Doluluk Kontrolü
      for (const docId of selectedDoctorIds) {
        const targetDocShifts = (shifts || []).filter(
          (s: any) => s.userId === docId && s.date === formattedDateStr
        );
        const docObj = doctors.find((d: any) => d.id === docId);
        const docName = docObj?.name || 'Seçilen hekim';

        if (targetDocShifts.length === 0) {
          import('react-hot-toast').then((mod) =>
            mod.toast.error(`⚠️ ${docName} için bu tarihte (${formattedDateStr}) vardiya bulunmuyor!`)
          );
          setIsSubmitting(false);
          return;
        }

        const startMin = startDt.getHours() * 60 + startDt.getMinutes();
        const endMin = endDt.getHours() * 60 + endDt.getMinutes();
        const isCovered = targetDocShifts.some((s: any) => {
          const sStart = parseHHMMToMinutes(s.startTime, 0);
          let sEnd = parseHHMMToMinutes(s.endTime, 1440);
          if (sEnd <= sStart) sEnd += 1440;
          return startMin >= sStart && endMin <= sEnd;
        });

        if (!isCovered) {
          const shiftRanges = targetDocShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ');
          import('react-hot-toast').then((mod) =>
            mod.toast.error(
              `⚠️ Randevu saati (${selectedTime}) ${docName} vardiya saatleri (${shiftRanges}) dışındadır!`
            )
          );
          setIsSubmitting(false);
          return;
        }
      }

      let targetAppt: any = null;

      // 1. Aynı gün, saat ve hekimde bu hastaya ait mevcut bir randevu var mı kontrol et
      const existingPatientAppt = existingEvents?.find(
        (ev: any) =>
          ev.patientId === selectedEvent.patientId &&
          ev.status !== 'cancelled' &&
          new Date(ev.startTime).getTime() === startDt.getTime() &&
          (!primaryDoctorId || ev.doctorId === primaryDoctorId)
      );

      if (existingPatientAppt) {
        targetAppt = existingPatientAppt;
      } else {
        // Yeni randevu oluştur
        const apptRes = await fetch('/api/dental/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: selectedEvent.patientId,
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

      // 2. Gruptaki tüm işlemleri eski randevulardan çıkarıp yeni randevuya bağla ve güncelle
      const oldApptIdsToCheck = new Set<string>();
      for (const item of batchList) {
        if (item.sessions && Array.isArray(item.sessions)) {
          for (const oldS of item.sessions) {
            if (oldS.appointmentId && oldS.appointmentId !== targetAppt.id) {
              oldApptIdsToCheck.add(oldS.appointmentId);
              await fetch(`/api/dental/appointments/${oldS.appointmentId}/treatments/${item.id}`, {
                method: 'DELETE',
              }).catch(() => {});
            }
          }
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

      // Eski randevuda başka hiçbir tedavi kalmadıysa ve "Tedavi" tipindeyse yetim randevuyu temizle
      for (const oldApptId of oldApptIdsToCheck) {
        try {
          const remRes = await fetch(`/api/dental/appointments/${oldApptId}/treatments`);
          if (remRes.ok) {
            const remList = await remRes.json();
            if (Array.isArray(remList) && remList.length === 0) {
              await fetch(`/api/dental/appointments/${oldApptId}`, { method: 'DELETE' }).catch(() => {});
            }
          }
        } catch {}
      }

      import('react-hot-toast').then((mod) =>
        mod.toast.success(`Randevu ${format(startDt, 'd MMMM HH:mm', { locale: tr })} tarihine planlandı!`)
      );
      onSuccess(targetAppt, formattedDateStr);
    } catch (err) {
      console.error(err);
      import('react-hot-toast').then((mod) => mod.toast.error('Bir hata oluştu!'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const teethSummary = batchList
    .map((item) => (item.toothNumber ? `#${item.toothNumber}` : ''))
    .filter(Boolean)
    .join(', ');

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
          background: var(--card-bg, #ffffff);
          width: min(860px, calc(100vw - 24px));
          max-width: 860px;
          max-height: 90vh;
          border-radius: 14px;
          border: 1.5px solid var(--input-border, #cbd5e1);
          box-shadow: var(--pc-modal-shadow, 0 25px 60px -15px rgba(0, 0, 0, 0.45));
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: scaleUp 0.18s ease-out;
        }
        .fs-modal-body {
          display: grid;
          grid-template-columns: 315px 1fr;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .fs-left-pane {
          padding: 16px;
          border-right: 1px solid var(--input-border, #cbd5e1);
          display: flex;
          flex-direction: column;
          gap: 14px;
          overflow-y: auto;
          background: var(--card-bg, #ffffff);
        }
        .fs-right-pane {
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: var(--card-inner, #f1f5f9);
          overflow: hidden;
        }
        .fs-mobile-tabs {
          display: none;
          padding: 8px 14px;
          gap: 8px;
          background: var(--card-inner, #f1f5f9);
          border-bottom: 1px solid var(--input-border, #cbd5e1);
        }
        .fs-slot-row {
          transition: background 0.12s ease;
        }
        .fs-slot-row-available:hover {
          background: var(--btn-clinic-secondary-bg, #eff6ff) !important;
        }
        .fs-slot-row-available:hover .fs-slot-hint {
          opacity: 1 !important;
        }
        .simple-picker .rdp {
          --rdp-cell-size: 34px;
          --rdp-accent-color: #2563eb;
          --rdp-background-color: #dbeafe;
          margin: 0;
        }
        .simple-picker .rdp-caption_label {
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--foreground);
          text-transform: capitalize;
        }
        .simple-picker .rdp-head_cell {
          font-size: 0.68rem;
          font-weight: 700;
          color: var(--foreground-3);
          text-transform: uppercase;
        }
        .simple-picker .rdp-day {
          font-size: 0.78rem;
          border-radius: 7px;
          color: var(--foreground);
          font-weight: 600;
        }
        .simple-picker .rdp-day_selected {
          background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%) !important;
          color: #ffffff !important;
          font-weight: 800;
        }
        .simple-picker .rdp-day_today:not(.rdp-day_selected) {
          border: 1.5px solid #2563eb;
          color: var(--accent, #2563eb);
          font-weight: 800;
        }
        @media (max-width: 768px) {
          .fs-modal-shell {
            width: calc(100vw - 16px);
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
            border-bottom: 1px solid var(--input-border, #cbd5e1);
            padding: 12px 14px;
            overflow-y: visible;
          }
          .fs-right-pane {
            min-height: 360px;
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
            {onPickOnMainCalendar && (
              <button
                type="button"
                onClick={() => onPickOnMainCalendar(formattedDateStr, selectedDoctorIds)}
                title="Modalı kapatıp doğrudan büyük takvim tablosu üzerinden boş hücre seçin"
                style={{
                  padding: '6px 11px',
                  borderRadius: 8,
                  border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
                  background: 'var(--btn-clinic-secondary-bg, #eff6ff)',
                  color: 'var(--btn-clinic-secondary-text, #0284c7)',
                  boxShadow: 'var(--pc-clay-btn)',
                  cursor: 'pointer',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap',
                }}
              >
                <ExternalLink size={13} />
                <span>Ana Takvimde Seç</span>
              </button>
            )}
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

        {/* Mobil Sekme Geçişi (Yalnızca <=768px ekranlarda görünür) */}
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
              🕒 Hekim Günlük Planı ({availableSlotCount} Boş)
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

        {/* Body: 2 Sütunlu (Sol: Hekim + Takvim, Sağ: Seçilen Hekimin Günlük Görünümü) */}
        <div className="fs-modal-body">
          {/* SOL SÜTUN: Katılan Hekimler + Tarih Seçici + Seçim Özeti */}
          <div className={`fs-left-pane ${mobileActivePane === 'schedule' ? 'fs-hide-mobile' : ''}`}>
            {/* 1. Katılan Hekimler */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <label
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: 'var(--foreground-2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <User size={13} style={{ color: 'var(--accent, #0284c7)' }} />
                  <span>Katılan Hekimler</span>
                </label>
                {selectedDoctorIds.length === 0 && (
                  <span style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 700 }}>
                    ⚠️ Hekim Seçin
                  </span>
                )}
              </div>
              <TreatmentDoctorMultiSelect
                doctors={doctors}
                selectedDoctorIds={selectedDoctorIds}
                onChange={setSelectedDoctorIds}
                shifts={shifts}
                targetApptTime={`${formattedDateStr}T${selectedTime}:00`}
                placeholder="Hekim Seçiniz"
              />
              {/* Hızlı Hekim Değiştirme Hapları (Tek tıkla başka hekimin programına bakmak için) */}
              {doctors.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {doctors.map((doc: any) => {
                    const isSelected = selectedDoctorIds.includes(doc.id);
                    const hasShiftToday = (shifts || []).some(
                      (s: any) => s.userId === doc.id && s.date === formattedDateStr
                    );
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => setSelectedDoctorIds([doc.id])}
                        title={
                          hasShiftToday
                            ? `${doc.name} günlük programını görüntüle`
                            : `${doc.name} (Bu tarihte vardiyası yok)`
                        }
                        style={{
                          padding: '4px 8px',
                          borderRadius: 999,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          border: isSelected
                            ? '1px solid #1d4ed8'
                            : '1px solid var(--input-border, #cbd5e1)',
                          background: isSelected
                            ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                            : 'var(--input-bg, #ffffff)',
                          color: isSelected ? '#ffffff' : 'var(--foreground-2)',
                          opacity: hasShiftToday || isSelected ? 1 : 0.6,
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: isSelected
                              ? '#ffffff'
                              : hasShiftToday
                              ? doc.color || '#10b981'
                              : '#94a3b8',
                          }}
                        />
                        <span style={{ color: isSelected ? '#ffffff' : 'inherit' }}>{doc.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Tarih Seçimi (DayPicker) */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <label
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: 'var(--foreground-2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <CalendarIcon size={13} style={{ color: 'var(--accent, #0284c7)' }} />
                  <span>Tarih</span>
                </label>
                <span style={{ fontSize: '0.71rem', fontWeight: 700, color: 'var(--accent, #0284c7)' }}>
                  {displayDateStr}
                </span>
              </div>

              <div
                style={{
                  background: 'var(--input-bg, #ffffff)',
                  border: '1px solid var(--input-border, #cbd5e1)',
                  borderRadius: 10,
                  padding: '6px 4px',
                  display: 'flex',
                  justifyContent: 'center',
                  boxShadow: 'var(--pc-neo-inset)',
                }}
              >
                <div className="simple-picker">
                  <DayPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => {
                      if (d) {
                        setSelectedDate(d);
                        setMobileActivePane('schedule');
                      }
                    }}
                    locale={tr}
                    defaultMonth={selectedDate}
                  />
                </div>
              </div>
            </div>

            {/* 3. Seçili Randevu Özeti Kartı */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: selectedSlotInfo?.available
                  ? 'var(--btn-clinic-secondary-bg, #eff6ff)'
                  : 'var(--card-inner, #f1f5f9)',
                border: selectedSlotInfo?.available
                  ? '1px solid var(--btn-clinic-secondary-border, #93c5fd)'
                  : '1px solid var(--danger, #ef4444)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: selectedSlotInfo?.available
                    ? 'var(--btn-clinic-secondary-text, #0284c7)'
                    : 'var(--danger, #ef4444)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Clock size={12} />
                <span>
                  {selectedSlotInfo?.available ? 'Seçilen Randevu Zamanı' : 'Seçilen Saat Uygun Değil'}
                </span>
              </div>
              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--foreground)' }}>
                {displayDateStr} · {selectedTime} – {selectedEndTime}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--foreground-2)', fontWeight: 600 }}>
                {primaryDoctor ? `Hekim: ${primaryDoctor.name}` : 'Hekim seçilmedi'}
                {!selectedSlotInfo?.available && selectedSlotInfo?.reasonLabel
                  ? ` (${selectedSlotInfo.reasonLabel})`
                  : ''}
              </div>
            </div>
          </div>

          {/* SAĞ SÜTUN: Seçilen Hekimin Günlük Takvim Görünümü (Salt-Okunur Program + Boşluk Seçimi) */}
          <div className={`fs-right-pane ${mobileActivePane === 'calendar' ? 'fs-hide-mobile' : ''}`}>
            {/* Günlük Takvim Başlığı (Takvimdeki Günlük Sütun Başlığı ile Birebir Uyumlu) */}
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--card-bg, #ffffff)',
                borderBottom: `3px solid ${primaryDoctor?.color || '#2563eb'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {/* Önceki / Sonraki Gün Hızlı Geçiş Butonları */}
                <button
                  type="button"
                  onClick={() => {
                    const prev = new Date(selectedDate);
                    prev.setDate(prev.getDate() - 1);
                    setSelectedDate(prev);
                  }}
                  title="Önceki Gün"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    border: '1px solid var(--input-border, #cbd5e1)',
                    background: 'var(--input-bg, #ffffff)',
                    color: 'var(--foreground)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(selectedDate);
                    next.setDate(next.getDate() + 1);
                    setSelectedDate(next);
                  }}
                  title="Sonraki Gün"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    border: '1px solid var(--input-border, #cbd5e1)',
                    background: 'var(--input-bg, #ffffff)',
                    color: 'var(--foreground)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
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
                        fontSize: '0.73rem',
                        fontWeight: 600,
                        color: 'var(--foreground-3)',
                      }}
                    >
                      · {format(selectedDate, 'd MMM EEE', { locale: tr })}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.71rem',
                      fontWeight: 700,
                      color: primaryDocShifts.length > 0 ? '#10b981' : '#d97706',
                    }}
                  >
                    {shiftSummaryText}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    padding: '3px 9px',
                    borderRadius: 999,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: 'var(--badge-clinic-bg, #e0f2fe)',
                    border: '1px solid var(--badge-clinic-border, #bae6fd)',
                    color: 'var(--badge-clinic-text, #0369a1)',
                  }}
                >
                  {availableSlotCount} Boş Saat
                </span>
              </div>
            </div>

            {/* Bilgi Bandı */}
            <div
              style={{
                padding: '6px 14px',
                background: 'var(--card-inner, #f1f5f9)',
                borderBottom: '1px solid var(--input-border, #cbd5e1)',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'var(--foreground-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span>
                🔒 Mevcut randevular salt-okunurdur. Sadece <strong>müsait boşluklara</strong> tıklayarak
                planlama yapabilirsiniz.
              </span>
            </div>

            {/* Günlük Zaman Çizelgesi (Single-Doctor Day View Timeline) */}
            <div
              ref={timelineScrollRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                position: 'relative',
                background: 'var(--card-bg, #ffffff)',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  minHeight: timeSlots.length * ROW_HEIGHT,
                }}
              >
                {/* 30 Dakikalık Satırlar */}
                {timeSlots.map((slot) => {
                  const status = slotStatusMap[slot.time];
                  const isAvailable = Boolean(status?.available);
                  const isSelected = isAvailable && selectedTime === slot.time;
                  const isOutsideShift = status?.reason === 'outside_shift';

                  return (
                    <div
                      key={slot.time}
                      onClick={() => handleSlotClick(slot.time)}
                      className={`fs-slot-row ${isAvailable ? 'fs-slot-row-available' : ''}`}
                      style={{
                        height: ROW_HEIGHT,
                        display: 'grid',
                        gridTemplateColumns: '58px 1fr',
                        borderBottom: '1px solid var(--input-border, #cbd5e1)',
                        cursor: isAvailable ? 'pointer' : 'not-allowed',
                        background: isOutsideShift
                          ? 'repeating-linear-gradient(135deg, var(--card-inner, #f1f5f9), var(--card-inner, #f1f5f9) 8px, var(--card-bg, #ffffff) 8px, var(--card-bg, #ffffff) 16px)'
                          : 'var(--card-bg, #ffffff)',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* Sol Saat Etiketi */}
                      <div
                        style={{
                          borderRight: '1px solid var(--input-border, #cbd5e1)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'center',
                          paddingTop: 5,
                          fontSize: '0.72rem',
                          fontWeight: isSelected ? 800 : 600,
                          color: isSelected
                            ? 'var(--accent, #2563eb)'
                            : isOutsideShift
                            ? 'var(--foreground-3)'
                            : 'var(--foreground-2)',
                          background: 'var(--card-inner, #f1f5f9)',
                          userSelect: 'none',
                        }}
                      >
                        {slot.time}
                      </div>

                      {/* Sağ Hücre Alanı */}
                      <div
                        style={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0 12px',
                        }}
                      >
                        {isOutsideShift && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              color: 'var(--foreground-3)',
                            }}
                          >
                            Mesai Dışı
                          </span>
                        )}

                        {isAvailable && !isSelected && (
                          <span
                            className="fs-slot-hint"
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: 'var(--btn-clinic-secondary-text, #0284c7)',
                              opacity: status?.isCurrentTreatmentSlot ? 0.9 : 0.35,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            {status?.isCurrentTreatmentSlot
                              ? '📌 Bu tedavinin mevcut saati (Seçilebilir)'
                              : '+ Boşluk · Planlamak için tıklayın'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* İzinli / Kapalı Bloklar (Salt-Okunur) */}
                {dayLeavesForSelectedDoctors.map((l) => {
                  const lStart = l.isFullDay ? slotStartHour * 60 : parseHHMMToMinutes(l.startTime, slotStartHour * 60);
                  const lEnd = l.isFullDay ? slotEndHour * 60 : parseHHMMToMinutes(l.endTime, slotEndHour * 60);
                  const clampedStart = Math.max(slotStartHour * 60, lStart);
                  const clampedEnd = Math.min(slotEndHour * 60, Math.max(clampedStart + 30, lEnd));
                  const top = ((clampedStart - slotStartHour * 60) / 30) * ROW_HEIGHT + 2;
                  const height = Math.max(
                    ROW_HEIGHT - 4,
                    ((clampedEnd - clampedStart) / 30) * ROW_HEIGHT - 4
                  );

                  return (
                    <div
                      key={`leave-${l.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        import('react-hot-toast').then((mod) =>
                          mod.toast.error('🏖️ Hekim bu saat aralığında izinlidir. Randevu planlanamaz.')
                        );
                      }}
                      style={{
                        position: 'absolute',
                        top,
                        left: 64,
                        right: 8,
                        height,
                        borderRadius: 8,
                        background: 'var(--card-inner, #f1f5f9)',
                        border: '1.5px dashed var(--danger, #ef4444)',
                        padding: '6px 10px',
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
                        <CalendarOff size={14} style={{ color: 'var(--danger, #ef4444)', flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            color: 'var(--foreground)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          Kapalı · İzinli ({l.isFullDay ? 'Tüm Gün' : `${l.startTime} - ${l.endTime}`})
                          {l.reason ? ` — ${l.reason}` : ''}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          color: 'var(--danger, #ef4444)',
                          flexShrink: 0,
                        }}
                      >
                        İzinli
                      </span>
                    </div>
                  );
                })}

                {/* Hekimin O Günkü Mevcut Randevuları (Salt-Okunur / Değiştirilemez) */}
                {dayAppointmentsForSelectedDoctors.map((ev: any) => {
                  const clampedStart = Math.max(slotStartHour * 60, ev.startMin);
                  const clampedEnd = Math.min(slotEndHour * 60, Math.max(clampedStart + 30, ev.endMin));
                  if (clampedEnd <= slotStartHour * 60 || clampedStart >= slotEndHour * 60) return null;

                  const top = ((clampedStart - slotStartHour * 60) / 30) * ROW_HEIGHT + 2;
                  const height = Math.max(
                    ROW_HEIGHT - 4,
                    ((clampedEnd - clampedStart) / 30) * ROW_HEIGHT - 4
                  );

                  // Eğer bu randevu zaten şu an düzenlediğimiz tedavinin kendi randevusuysa ve yeni bir saat seçildiyse soluk göster
                  const isOwnCurrentAppt = Boolean(ev.isCurrentTreatmentAppt);

                  return (
                    <div
                      key={`ev-${ev.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (ev.isSamePatient) {
                          setSelectedTime(ev.startHHMM);
                        } else {
                          import('react-hot-toast').then((mod) =>
                            mod.toast.error(
                              '🔒 Bu randevu başka bir hastaya aittir ve buradan değiştirilemez. Lütfen boş bir saat seçin.'
                            )
                          );
                        }
                      }}
                      title={`${ev.startHHMM} - ${ev.endHHMM} · ${ev.title}`}
                      style={{
                        position: 'absolute',
                        top,
                        left: 64,
                        right: 8,
                        height,
                        borderRadius: 8,
                        background: isOwnCurrentAppt
                          ? 'var(--btn-clinic-secondary-bg, #eff6ff)'
                          : 'var(--card-inner, #f1f5f9)',
                        border: isOwnCurrentAppt
                          ? '1.5px dashed var(--accent, #0284c7)'
                          : '1px solid var(--input-border, #cbd5e1)',
                        borderLeft: `4px solid ${isOwnCurrentAppt ? '#0284c7' : ev.doctorColor || '#64748b'}`,
                        padding: '5px 10px',
                        boxSizing: 'border-box',
                        cursor: ev.isSamePatient ? 'pointer' : 'not-allowed',
                        zIndex: isOwnCurrentAppt ? 4 : 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'var(--foreground)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {ev.title}
                        </div>
                        <div
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: 'var(--foreground-2)',
                          }}
                        >
                          {ev.startHHMM} – {ev.endHHMM}
                          {selectedDoctorIds.length > 1 && ev.doctorName ? ` · ${ev.doctorName}` : ''}
                        </div>
                      </div>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          background: isOwnCurrentAppt
                            ? 'var(--badge-clinic-bg, #e0f2fe)'
                            : 'var(--input-bg, #ffffff)',
                          border: '1px solid var(--input-border, #cbd5e1)',
                          color: isOwnCurrentAppt
                            ? 'var(--badge-clinic-text, #0369a1)'
                            : 'var(--foreground-2)',
                        }}
                      >
                        {isOwnCurrentAppt ? (
                          <span>Mevcut Saat</span>
                        ) : (
                          <>
                            <Lock size={11} />
                            <span>Dolu</span>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}

                {/* Seçilen Yeni Randevu Bloğu (Boşluk Üzerinde Canlı Önizleme) */}
                {selectedSlotInfo?.available && (
                  <div
                    style={{
                      position: 'absolute',
                      top: ((selectedStartMin - slotStartHour * 60) / 30) * ROW_HEIGHT + 2,
                      left: 64,
                      right: 8,
                      height: ROW_HEIGHT - 4,
                      borderRadius: 8,
                      background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                      border: '1.5px solid #1d4ed8',
                      boxShadow: 'var(--pc-clay-primary)',
                      padding: '5px 12px',
                      boxSizing: 'border-box',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      pointerEvents: 'none',
                    }}
                  >
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Sparkles size={14} style={{ color: '#ffffff', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            color: '#ffffff',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {selectedTime} – {selectedEndTime} · {teethSummary ? `${teethSummary} ` : ''}
                          {primaryTreatment?.procedureName}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: '#ffffff',
                        background: '#1e40af',
                        border: '1px solid #60a5fa',
                        padding: '2px 8px',
                        borderRadius: 999,
                        flexShrink: 0,
                      }}
                    >
                      ✓ Seçilen Boşluk
                    </span>
                  </div>
                )}
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
              color: selectedSlotInfo?.available ? 'var(--foreground-2)' : 'var(--danger, #ef4444)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {selectedSlotInfo?.available ? (
              <>
                <Clock size={14} style={{ color: 'var(--accent, #0284c7)' }} />
                <span>
                  Planlanacak: <strong style={{ color: 'var(--foreground)' }}>{displayDateStr}</strong> saat{' '}
                  <strong style={{ color: 'var(--accent, #0284c7)' }}>
                    {selectedTime} – {selectedEndTime}
                  </strong>
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={14} />
                <span>Seçilen tarihte uygun boş saat seçilmedi</span>
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
              disabled={isSubmitting || !selectedSlotInfo?.available}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: '1px solid #1d4ed8',
                background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                boxShadow: 'var(--pc-clay-primary)',
                color: '#ffffff',
                cursor: isSubmitting || !selectedSlotInfo?.available ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: isSubmitting || !selectedSlotInfo?.available ? 0.55 : 1,
              }}
            >
              <Check size={15} style={{ color: '#ffffff' }} />
              <span style={{ color: '#ffffff' }}>
                {isSubmitting ? 'Planlanıyor...' : 'Oluştur ve Planla'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
