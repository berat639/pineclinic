import React, { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { tr } from 'date-fns/locale';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Clock, X, User, Check } from 'lucide-react';

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
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const sessionTime = treatment?.sessions?.[0]?.startTime;
    if (sessionTime) return new Date(sessionTime);
    if (treatment?.plannedDate) return new Date(treatment.plannedDate);
    if (selectedEvent?.startTime) return new Date(selectedEvent.startTime);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    const sessionTime = treatment?.sessions?.[0]?.startTime;
    if (sessionTime) {
      return new Date(sessionTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    if (selectedEvent?.startTime) {
      return new Date(selectedEvent.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    return '10:00';
  });
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    treatment?.doctorId || selectedEvent?.doctorId || ''
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const formattedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const displayDateStr = format(selectedDate, 'd MMMM yyyy, EEEE', { locale: tr });

  const handleSave = async () => {
    if (!treatment || !selectedEvent) return;
    setIsSubmitting(true);
    try {
      const startDt = new Date(`${formattedDateStr}T${selectedTime}:00+03:00`);
      const endDt = new Date(startDt.getTime() + 30 * 60000);
      const titleStr = `${patientInfo?.name || 'Hasta'} - ${treatment.procedureName}`;

      // Vardiya Kontrolü: Seçilen hekimin o gün ve saatte vardiyası var mı?
      if (selectedDoctorId) {
        const targetDocShifts = (shifts || []).filter((s: any) => s.userId === selectedDoctorId && s.date === formattedDateStr);
        const docObj = doctors.find((d: any) => d.id === selectedDoctorId);
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
            doctorId: selectedDoctorId || null,
            title: titleStr,
            startTime: startDt.toISOString(),
            endTime: endDt.toISOString(),
            type: 'Tedavi',
            status: selectedDoctorId ? 'scheduled' : 'pending_assignment'
          })
        });

        if (!apptRes.ok) throw new Error('Randevu oluşturulamadı');
        targetAppt = await apptRes.json();
      }

      // 2. Eski randevu seanslarından çıkar (farklı bir randevuya taşınıyorsa)
      if (treatment.sessions && Array.isArray(treatment.sessions)) {
        for (const oldS of treatment.sessions) {
          if (oldS.appointmentId && oldS.appointmentId !== targetAppt.id) {
            await fetch(`/api/dental/appointments/${oldS.appointmentId}/treatments/${treatment.id}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      }

      // 3. Tedaviyi hedef randevuya bağla
      await fetch(`/api/dental/appointments/${targetAppt.id}/treatments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ treatmentPlanId: treatment.id, sessionNumber: 1 })
      });

      // 4. Tedaviyi güncelle (plan tarihi & doktor)
      await fetch(`/api/dental/treatments/${treatment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          doctorId: selectedDoctorId || undefined,
          plannedDate: startDt.toISOString()
        })
      });

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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card-bg, #181c24)',
          width: '100%',
          maxWidth: '440px',
          borderRadius: '18px',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
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
            padding: '16px 20px',
            borderBottom: '1px solid var(--divider, rgba(255,255,255,0.08))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CalendarIcon size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)' }}>
                İleri Tarihe Randevu Ver
              </h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)' }}>
                {treatment.toothNumber ? `#${treatment.toothNumber} ` : ''}{treatment.procedureName}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              borderRadius: '50%',
              width: 30,
              height: 30,
              color: 'var(--foreground-3)',
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
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            maxHeight: 'calc(85vh - 120px)',
            overflowY: 'auto'
          }}
        >
          {/* Tarih Seçimi (DayPicker) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <CalendarIcon size={13} style={{ color: 'var(--brand)' }} />
                <span>Tarih</span>
              </label>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--brand)' }}>
                {displayDateStr}
              </span>
            </div>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
                borderRadius: 12,
                padding: '8px 4px',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <style>{`
                .simple-picker .rdp {
                  --rdp-cell-size: 36px;
                  --rdp-accent-color: #3b82f6;
                  --rdp-background-color: rgba(59, 130, 246, 0.15);
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
                  background-color: #3b82f6 !important;
                  color: white !important;
                  font-weight: 700;
                }
                .simple-picker .rdp-day_today:not(.rdp-day_selected) {
                  border: 1px solid #3b82f6;
                  color: #60a5fa;
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

          {/* Saat Seçimi (Sade & Kullanışlı: Açılır Liste + Özel Saat) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={13} style={{ color: '#3b82f6' }} />
                <span>Saat</span>
              </span>
            </label>
            <select
              value={selectedTime}
              onChange={e => setSelectedTime(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
                background: 'rgba(255, 255, 255, 0.03)',
                color: 'var(--foreground)',
                fontSize: '0.9rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {TIME_OPTIONS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Doktor Seçimi */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground-2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <User size={13} style={{ color: 'var(--brand)' }} />
                <span>Doktor</span>
              </label>
              {!selectedDoctorId && (
                <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>⚠️ Atanmadı</span>
              )}
            </div>
            <select
              value={selectedDoctorId}
              onChange={e => setSelectedDoctorId(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 10,
                border: !selectedDoctorId ? '1.5px solid #f59e0b' : '1px solid var(--glass-border, rgba(255,255,255,0.1))',
                background: !selectedDoctorId ? 'rgba(245, 158, 11, 0.06)' : 'rgba(255, 255, 255, 0.03)',
                color: !selectedDoctorId ? '#f59e0b' : 'var(--foreground)',
                fontWeight: !selectedDoctorId ? 600 : 400,
                fontSize: '0.85rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">⚠️ Doktor Seçiniz (Atama Bekliyor)</option>
              {doctors.map((d: any) => {
                const docShifts = (shifts || []).filter((s: any) => s.userId === d.id && s.date === formattedDateStr);
                const hasShift = docShifts.length > 0;
                const shiftText = hasShift ? `(🟢 ${docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ')})` : `(Vardiya Yok ⚠️)`;
                return (
                  <option 
                    key={d.id} 
                    value={d.id}
                    disabled={!hasShift}
                    style={{ color: !hasShift ? '#ef4444' : 'inherit' }}
                  >
                    Dr. {d.name} {d.specialty ? `(${d.specialty})` : ''} {shiftText}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--divider, rgba(255,255,255,0.08))',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            background: 'rgba(255,255,255,0.02)'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
              background: 'transparent',
              color: 'var(--foreground-2)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 500
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
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)',
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            <Check size={15} />
            <span>{isSubmitting ? 'Oluşturuluyor...' : 'Oluştur ve Planla'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
