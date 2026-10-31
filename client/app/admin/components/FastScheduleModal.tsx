import React, { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { tr } from 'date-fns/locale';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Clock, X, User, Check } from 'lucide-react';
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss';
import TreatmentDoctorMultiSelect from './TreatmentDoctorMultiSelect';

interface FastScheduleModalProps {
  treatment: any;
  patientInfo: any;
  selectedEvent: any;
  doctors: any[];
  shifts?: any[];
  existingEvents?: any[];
  onClose: () => void;
  onSuccess: (newAppt?: any, targetDate?: string) => void;
}

const TIME_OPTIONS = [
  '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00',
  '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00'
];

export default function FastScheduleModal({
  treatment,
  patientInfo,
  selectedEvent,
  doctors,
  shifts = [],
  existingEvents = [],
  onClose,
  onSuccess
}: FastScheduleModalProps) {
  const backdropDismiss = useBackdropDismiss(onClose);
  const batchList: any[] = Array.isArray(treatment?.batchTreatments) && treatment.batchTreatments.length > 0
    ? treatment.batchTreatments
    : (treatment ? [treatment] : []);
  const primaryTreatment = batchList[0] || treatment;

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const sessionTime = primaryTreatment?.sessions?.[0]?.startTime;
    if (sessionTime) return new Date(sessionTime);
    if (primaryTreatment?.plannedDate) return new Date(primaryTreatment.plannedDate);
    if (selectedEvent?.startTime) return new Date(selectedEvent.startTime);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    const sessionTime = primaryTreatment?.sessions?.[0]?.startTime;
    if (sessionTime) {
      return new Date(sessionTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    if (selectedEvent?.startTime) {
      return new Date(selectedEvent.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    return '10:00';
  });
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>(() => {
    if (Array.isArray(primaryTreatment?.doctorIds) && primaryTreatment.doctorIds.length > 0) {
      return primaryTreatment.doctorIds;
    }
    const fallbackDoc = primaryTreatment?.doctorId || selectedEvent?.doctorId;
    return fallbackDoc ? [fallbackDoc] : [];
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const formattedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const displayDateStr = format(selectedDate, 'd MMMM yyyy, EEEE', { locale: tr });
  const primaryDoctorId = selectedDoctorIds[0] || '';

  const handleSave = async () => {
    if (batchList.length === 0 || !selectedEvent) return;
    setIsSubmitting(true);
    try {
      const startDt = new Date(`${formattedDateStr}T${selectedTime}:00+03:00`);
      const endDt = new Date(startDt.getTime() + 30 * 60000);
      const titleStr = `${patientInfo?.name || 'Hasta'} - ${primaryTreatment.procedureName}`;

      // Vardiya Kontrolü: Seçilen hekimlerin o gün ve saatte vardiyası var mı?
      for (const docId of selectedDoctorIds) {
        const targetDocShifts = (shifts || []).filter((s: any) => s.userId === docId && s.date === formattedDateStr);
        const docObj = doctors.find((d: any) => d.id === docId);
        const docName = docObj?.name || 'Seçilen hekim';

        if (targetDocShifts.length === 0) {
          import('react-hot-toast').then(mod => mod.toast.error(`⚠️ ${docName} için bu tarihte (${formattedDateStr}) vardiya bulunmuyor!`));
          setIsSubmitting(false);
          return;
        }

        const startMin = startDt.getHours() * 60 + startDt.getMinutes();
        const endMin = endDt.getHours() * 60 + endDt.getMinutes();
        const isCovered = targetDocShifts.some((s: any) => {
          const [sH, sM] = (s.startTime || '00:00').split(':').map(Number);
          const [eH, eM] = (s.endTime || '23:59').split(':').map(Number);
          return startMin >= (sH * 60 + (sM || 0)) && endMin <= (eH * 60 + (eM || 0));
        });

        if (!isCovered) {
          const shiftRanges = targetDocShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ');
          import('react-hot-toast').then(mod => mod.toast.error(`⚠️ Randevu saati (${selectedTime}) ${docName} vardiya saatleri (${shiftRanges}) dışındadır!`));
          setIsSubmitting(false);
          return;
        }
      }

      let targetAppt: any = null;

      // 1. Aynı gün ve saatte bu hastaya ait mevcut bir randevu var mı kontrol et
      const existingPatientAppt = existingEvents?.find((ev: any) => 
        ev.patientId === selectedEvent.patientId && 
        new Date(ev.startTime).getTime() === startDt.getTime()
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
            status: primaryDoctorId ? 'scheduled' : 'pending_assignment'
          })
        });

        if (!apptRes.ok) throw new Error('Randevu oluşturulamadı');
        targetAppt = await apptRes.json();
      }

      // 2. Gruptaki tüm işlemleri eski randevulardan çıkarıp yeni randevuya bağla ve güncelle
      for (const item of batchList) {
        if (item.sessions && Array.isArray(item.sessions)) {
          for (const oldS of item.sessions) {
            if (oldS.appointmentId && oldS.appointmentId !== targetAppt.id) {
              await fetch(`/api/dental/appointments/${oldS.appointmentId}/treatments/${item.id}`, { method: 'DELETE' }).catch(() => {});
            }
          }
        }

        await fetch(`/api/dental/appointments/${targetAppt.id}/treatments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ treatmentPlanId: item.id, sessionNumber: 1 })
        });

        await fetch(`/api/dental/treatments/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            doctorId: primaryDoctorId || null,
            doctorIds: selectedDoctorIds,
            plannedDate: startDt.toISOString()
          })
        });
      }

      import('react-hot-toast').then(mod =>
        mod.toast.success(`Randevu ${format(startDt, 'd MMMM HH:mm', { locale: tr })} tarihine planlandı!`)
      );
      onSuccess(targetAppt, formattedDateStr);
    } catch (err) {
      console.error(err);
      import('react-hot-toast').then(mod => mod.toast.error('Bir hata oluştu!'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const teethSummary = batchList
    .map(item => item.toothNumber ? `#${item.toothNumber}` : '')
    .filter(Boolean)
    .join(', ');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal-overlay, rgba(15, 23, 42, 0.65))',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      {...backdropDismiss}
    >
      <div
        style={{
          background: 'var(--card-bg, #ffffff)',
          width: '100%',
          maxWidth: '440px',
          borderRadius: '14px',
          border: '1px solid var(--input-border, #cbd5e1)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'scaleUp 0.18s ease-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--input-border, #cbd5e1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--card-inner, #f1f5f9)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'var(--badge-clinic-bg, #e0f2fe)',
                border: '1px solid var(--badge-clinic-border, #bae6fd)',
                color: 'var(--badge-clinic-text, #0369a1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CalendarIcon size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)' }}>
                {batchList.length > 1 ? `Toplu Randevu Planla (${batchList.length} İşlem)` : 'Randevu Tarihi Belirle'}
              </h3>
              <div style={{ fontSize: '0.73rem', color: 'var(--foreground-2)', fontWeight: 600 }}>
                {teethSummary ? `${teethSummary} · ` : ''}{primaryTreatment?.procedureName}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
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
              justifyContent: 'center'
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            maxHeight: 'calc(85vh - 120px)',
            overflowY: 'auto'
          }}
        >
          {/* Tarih Seçimi (DayPicker) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <CalendarIcon size={13} style={{ color: 'var(--accent, #0284c7)' }} />
                <span>Tarih</span>
              </label>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent, #0284c7)' }}>
                {displayDateStr}
              </span>
            </div>

            <div
              style={{
                background: 'var(--input-bg, #ffffff)',
                border: '1px solid var(--input-border, #cbd5e1)',
                borderRadius: 10,
                padding: '8px 4px',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <style>{`
                .simple-picker .rdp {
                  --rdp-cell-size: 36px;
                  --rdp-accent-color: #0284c7;
                  --rdp-background-color: #e0f2fe;
                  margin: 0;
                }
                .simple-picker .rdp-caption_label {
                  font-size: 0.85rem;
                  font-weight: 600;
                  color: var(--foreground);
                  text-transform: capitalize;
                }
                .simple-picker .rdp-head_cell {
                  font-size: 0.7rem;
                  font-weight: 600;
                  color: var(--foreground-3);
                  text-transform: uppercase;
                }
                .simple-picker .rdp-day {
                  font-size: 0.8rem;
                  border-radius: 6px;
                  color: var(--foreground);
                }
                .simple-picker .rdp-day_selected {
                  background-color: #0284c7 !important;
                  color: white !important;
                  font-weight: 700;
                }
                .simple-picker .rdp-day_today:not(.rdp-day_selected) {
                  border: 1px solid #0284c7;
                  color: var(--accent, #0284c7);
                }
              `}</style>
              <div className="simple-picker">
                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={d => d && setSelectedDate(d)}
                  locale={tr}
                  defaultMonth={selectedDate}
                  disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                />
              </div>
            </div>
          </div>

          {/* Saat Seçimi */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={13} style={{ color: 'var(--accent, #0284c7)' }} />
                <span>Saat</span>
              </span>
            </label>
            <select
              value={selectedTime}
              onChange={e => setSelectedTime(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--input-border, #cbd5e1)',
                background: 'var(--input-bg, #ffffff)',
                color: 'var(--foreground)',
                fontSize: '0.86rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {TIME_OPTIONS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Doktor Seçimi (Çoklu Hekim Desteği) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <User size={13} style={{ color: 'var(--accent, #0284c7)' }} />
                <span>Katılan Hekimler</span>
              </label>
              {selectedDoctorIds.length === 0 && (
                <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700 }}>⚠️ Atanmadı</span>
              )}
            </div>
            <TreatmentDoctorMultiSelect
              doctors={doctors}
              selectedDoctorIds={selectedDoctorIds}
              onChange={setSelectedDoctorIds}
              shifts={shifts}
              targetApptTime={`${formattedDateStr}T${selectedTime}:00`}
              placeholder="Hekim Seçiniz (Çoklu Seçilebilir)"
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--input-border, #cbd5e1)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            background: 'var(--card-inner, #f1f5f9)'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--btn-clinic-secondary-border, #93c5fd)',
              background: 'var(--btn-clinic-secondary-bg, #eff6ff)',
              color: 'var(--btn-clinic-secondary-text, #0284c7)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid var(--btn-clinic-primary-border, #0284c7)',
              background: 'var(--btn-clinic-primary-bg, #0284c7)',
              color: '#ffffff',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            <Check size={15} />
            <span>{isSubmitting ? 'Planlanıyor...' : 'Oluştur ve Planla'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
