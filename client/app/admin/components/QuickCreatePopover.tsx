import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { X, Search, Plus, ArrowRight } from 'lucide-react';
import FancyHourPicker from './FancyHourPicker';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  onSave: (data: any) => void;
  defaultDate: string;
  defaultStartTime: string;
  defaultEndTime: string;
  doctorId: string | null;
  patients: any[];
  doctors: any[];
  events?: any[];
  isCentered?: boolean;
}

export default function QuickCreatePopover({ x, y, onClose, onSave, defaultDate, defaultStartTime, defaultEndTime, doctorId, patients, doctors, events = [], isCentered = false }: Props) {
  const [tab, setTab] = useState<'patient' | 'payment'>('patient');
  
  // patient selection vs creation
  const [patientMode, setPatientMode] = useState<'select' | 'create'>('select');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [patientSearchQuery, setPatientSearchQuery] = useState('');

  // form state
  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tc, setTc] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sms, setSms] = useState(true);
  const [emailOpt, setEmailOpt] = useState(true);
  const [waOpt, setWaOpt] = useState(true);

  // appointment info
  const [selectedDoctorId, setSelectedDoctorId] = useState(doctorId || '');

  // Payment Form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Nakit');
  const [paymentDate, setPaymentDate] = useState(defaultDate);
  const [paymentStatus, setPaymentStatus] = useState('completed');
  const [plannedDate, setPlannedDate] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const timeToNumber = (t: string) => {
    if (!t) return 9;
    const [h, m] = t.split(':').map(Number);
    return h + (m === 30 ? 0.5 : 0);
  };
  const formatNumberTime = (val: number) => {
    const h = Math.floor(val).toString().padStart(2, '0');
    const m = (val % 1 === 0.5) ? '30' : '00';
    return `${h}:${m}`;
  };

  const [timeRange, setTimeRange] = useState<[number, number]>([
    timeToNumber(defaultStartTime) || 9,
    timeToNumber(defaultEndTime) || 9.5
  ]);

  const finalPatientId = patientMode === 'select' ? selectedPatientId : name;

  // Auto-update title when patient changes
  useEffect(() => {
    if (patientMode === 'select' && selectedPatientId) {
      const p = patients.find(p => p.id === selectedPatientId);
      if (p) setTitle(p.name);

      // Smart doctor selection
      if (events && events.length > 0 && !doctorId) {
        const patientEvents = events.filter((e: any) => e.patientId === selectedPatientId && e.doctorId);
        if (patientEvents.length > 0) {
          // Sort descending by date
          patientEvents.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
          const lastDoctorId = patientEvents[0].doctorId;
          if (lastDoctorId) {
            setSelectedDoctorId(lastDoctorId);
          }
        }
      }
    } else if (patientMode === 'create' && name) {
      setTitle(name);
    }
  }, [patientMode, selectedPatientId, name, patients, events, doctorId]);

  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [computedLeft, setComputedLeft] = useState(x);
  const [computedTop, setComputedTop] = useState(y);

  const modalWidth = 400;
  const modalHeight = 550;

  useEffect(() => {
      if (popoverRef.current) {
        const offsetParent = popoverRef.current.offsetParent as HTMLElement;
        let cLeft = x;
        let cTop = y;
        
        if (offsetParent) {
          const parentRect = offsetParent.getBoundingClientRect();
          const scrollY = window.scrollY || 0;
          const scrollX = window.scrollX || 0;
          
          const parentPageTop = parentRect.top + scrollY;
          const parentPageLeft = parentRect.left + scrollX;
          
          cTop = y - parentPageTop;
          cLeft = x - parentPageLeft;
        }
        
        // Simple bounds check based on window dimensions
        if (typeof window !== 'undefined') {
           const screenWidth = window.innerWidth;
           const screenHeight = window.innerHeight;
           const viewportY = cTop + (offsetParent ? offsetParent.getBoundingClientRect().top : 0);
           if (viewportY + modalHeight > screenHeight) {
              cTop -= (viewportY + modalHeight - screenHeight + 20);
           }
           const viewportX = cLeft + (offsetParent ? offsetParent.getBoundingClientRect().left : 0);
           if (viewportX + modalWidth > screenWidth) {
              cLeft -= (viewportX + modalWidth - screenWidth + 20);
           }
           if (cLeft < 0) cLeft = 10;
           if (cTop < 0) cTop = 10;
        }

        setComputedLeft(cLeft);
        setComputedTop(cTop);
      }
  }, [x, y, isCentered]);

  const handleSave = () => {
    if (tab === 'patient') {
      let finalTitle = title || 'Yeni Hasta / Randevu';
      if (!selectedDoctorId && !finalTitle.includes('Kontrol Randevusu')) {
        finalTitle = `${finalTitle} - Kontrol Randevusu`;
      }
      onSave({
        type: 'patient_appointment',
        title: finalTitle,
        patientId: patientMode === 'select' ? selectedPatientId : undefined,
        doctorId: selectedDoctorId || null,
        startTime: formatNumberTime(timeRange[0]),
        endTime: formatNumberTime(timeRange[1]),
        name, phone, tc, email, gender, birthDate,
        sms, emailOpt, waOpt
      });
    } else {
      onSave({
        type: 'payment',
        title: title || 'Yeni Ödeme',
        patientId: selectedPatientId || '',
        amount: paymentAmount, paymentMethod, paymentDate, paymentStatus, plannedDate, paymentNote
      });
    }
  };

  const filteredPatients = patientSearchQuery 
    ? patients.filter(p => p.name.toLowerCase().includes(patientSearchQuery.toLowerCase()) || p.phone?.includes(patientSearchQuery))
    : patients.slice(0, 15);

  // Base input style respecting dark & light modes
  const inputBaseStyle: React.CSSProperties = {
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid var(--input-border, var(--glass-border, rgba(255,255,255,0.12)))',
    background: 'var(--input-bg, rgba(255,255,255,0.05))',
    color: 'var(--foreground, #fff)',
    fontSize: '0.85rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  };

  const optionStyle: React.CSSProperties = {
    background: 'var(--background-2, #0f172a)',
    color: 'var(--foreground, #fff)'
  };

  return (
    <>
      <div 
        style={{ position: 'fixed', inset: 0, zIndex: 100004, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }} 
        onClick={onClose} 
      />
      <div 
        ref={popoverRef}
        style={{ 
          position: isCentered ? 'fixed' : 'absolute', 
          left: isCentered ? '50%' : computedLeft, 
          top: isCentered ? '50%' : computedTop, 
          transform: isCentered ? 'translate(-50%, -50%)' : 'none',
          width: modalWidth, 
          backgroundColor: 'var(--card-bg, #0f172a)',
          background: 'var(--card-bg, #0f172a)',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
          borderRadius: 16,
          boxShadow: '0 20px 50px -10px rgba(0,0,0,0.6), 0 0 0 1px var(--glass-border, rgba(255,255,255,0.08))',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          zIndex: 100005,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.08))', background: 'transparent' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
             {title || 'Yeni Randevu'}
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'rgba(255,255,255,0.06)', 
              border: 'none', 
              borderRadius: '50%', 
              width: 28, 
              height: 28, 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: 'var(--foreground-3)' 
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.02)' }}>
          <button 
            onClick={() => setTab('patient')}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
              border: tab === 'patient' ? '1px solid var(--brand, #3b82f6)' : '1px solid transparent',
              background: tab === 'patient' ? 'var(--brand, #3b82f6)' : 'rgba(255,255,255,0.04)',
              color: tab === 'patient' ? '#fff' : 'var(--foreground-2)',
              transition: 'all 0.2s'
            }}
          >
            Hasta Randevu
          </button>
          <button 
            onClick={() => {
               if (!finalPatientId) {
                  toast.error('Lütfen önce bir hasta seçin veya ekleyin.');
                  return;
               }
               setTab('payment');
            }}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
              border: tab === 'payment' ? '1px solid var(--brand, #3b82f6)' : '1px solid transparent',
              background: tab === 'payment' ? 'var(--brand, #3b82f6)' : 'rgba(255,255,255,0.04)',
              color: tab === 'payment' ? '#fff' : 'var(--foreground-2)',
              opacity: (!selectedPatientId && patientMode !== 'create') ? 0.5 : 1,
              transition: 'all 0.2s'
            }}
          >
            Ödeme
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
          {tab === 'patient' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              
              {/* STEP 1: PATIENT SELECTION / CREATION */}
              <div style={{ background: 'rgba(59,130,246,0.06)', padding: 14, borderRadius: 10, border: '1px solid rgba(59,130,246,0.18)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand, #3b82f6)', marginBottom: 10 }}>1. Hasta Seçimi</div>
                
                {patientMode === 'select' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {!selectedPatientId ? (
                      <>
                        <div style={{ position: 'relative' }}>
                          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--foreground-3)' }} />
                          <input 
                            type="text" 
                            placeholder="Kayıtlı Hasta Ara..." 
                            value={patientSearchQuery}
                            onChange={e => setPatientSearchQuery(e.target.value)}
                            style={{ ...inputBaseStyle, paddingLeft: 34 }} 
                          />
                        </div>
                        <div style={{ maxHeight: 160, overflowY: 'auto', background: 'var(--background, #0f172a)', border: '1px solid var(--glass-border, rgba(255,255,255,0.1))', borderRadius: 8 }}>
                           {filteredPatients.map(p => (
                             <div 
                               key={p.id} 
                               onClick={() => setSelectedPatientId(p.id)}
                               style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.06))', fontSize: '0.85rem', color: 'var(--foreground)' }}
                               onMouseOver={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
                               onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                             >
                               <div style={{ fontWeight: 500 }}>{p.name}</div>
                               {p.phone && <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)' }}>{p.phone}</div>}
                             </div>
                           ))}
                           {filteredPatients.length === 0 && (
                             <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--foreground-3)' }}>Hasta bulunamadı.</div>
                           )}
                        </div>
                        <button 
                           onClick={() => setPatientMode('create')}
                           style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', background: 'var(--brand, #3b82f6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
                        >
                          <Plus size={16} /> Yeni Hasta Ekle
                        </button>
                      </>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--background, #0f172a)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--glass-border, rgba(255,255,255,0.1))' }}>
                         <div>
                           <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>{patients.find(p => p.id === selectedPatientId)?.name}</div>
                           <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3)' }}>Kayıtlı Hasta</div>
                         </div>
                         <button onClick={() => setSelectedPatientId('')} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500 }}>Değiştir</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--foreground)' }}>Yeni Hasta Bilgileri</span>
                      <button onClick={() => setPatientMode('select')} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', fontSize: '0.75rem', cursor: 'pointer' }}>Vazgeç</button>
                    </div>
                    <input type="text" placeholder="Ad Soyad (Zorunlu)" value={name} onChange={e => setName(e.target.value)} style={inputBaseStyle} />
                    <input type="text" placeholder="Telefon (İsteğe Bağlı)" value={phone} onChange={e => setPhone(e.target.value)} style={inputBaseStyle} />
                    <input type="text" placeholder="TC Kimlik No (İsteğe Bağlı)" value={tc} onChange={e => setTc(e.target.value)} style={inputBaseStyle} />
                  </div>
                )}
              </div>

               {/* STEP 2: DOCTOR SELECTION */}
              {(selectedPatientId || patientMode === 'create') && (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>2. Doktor Ataması</label>
                     {!selectedDoctorId && (
                       <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>⚠️ Doktor Seçilmedi</span>
                     )}
                   </div>
                   <select 
                     value={selectedDoctorId} 
                     onChange={e => setSelectedDoctorId(e.target.value)} 
                     style={{
                       ...inputBaseStyle,
                       border: !selectedDoctorId ? '1.5px solid #f59e0b' : inputBaseStyle.border,
                       background: !selectedDoctorId ? 'rgba(245, 158, 11, 0.08)' : inputBaseStyle.background,
                       color: !selectedDoctorId ? '#f59e0b' : 'var(--foreground)',
                       fontWeight: !selectedDoctorId ? 600 : 400
                     }}
                   >
                     <option value="" style={optionStyle}>⚠️ Doktor Seçiniz (Atama Bekliyor)</option>
                     {doctors.map(d => (
                       <option key={d.id} value={d.id} style={optionStyle}>Dr. {d.name}</option>
                     ))}
                   </select>
                   {!selectedDoctorId && (
                     <div style={{ fontSize: '0.7rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                       <span>ℹ️</span>
                       <span>Doktor seçilmezse randevu "Doktor Atanmadı" uyarısıyla açılır.</span>
                     </div>
                   )}
                 </div>
              )}

              {/* STEP 3: TIME SELECTION */}
              {(selectedPatientId || patientMode === 'create') && (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>3. Randevu Saati</label>
                     <span style={{ fontSize: '0.72rem', color: 'var(--foreground-3)' }}>Tarih: {defaultDate}</span>
                   </div>
                   <FancyHourPicker range={timeRange} onChange={setTimeRange} />
                 </div>
              )}

            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4, display: 'block' }}>Tutar (₺) *</label>
                  <input type="number" placeholder="Örn: 1500" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} style={inputBaseStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4, display: 'block' }}>Ödeme Yöntemi</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputBaseStyle}>
                    <option value="Nakit" style={optionStyle}>Nakit</option>
                    <option value="Kredi Kartı" style={optionStyle}>Kredi Kartı</option>
                    <option value="Havale/EFT" style={optionStyle}>Havale/EFT</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4, display: 'block' }}>Ödeme Tarihi *</label>
                  <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inputBaseStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4, display: 'block' }}>Durum</label>
                  <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} style={inputBaseStyle}>
                    <option value="completed" style={optionStyle}>✅ Yapıldı</option>
                    <option value="pending" style={optionStyle}>⏳ Bekliyor</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4, display: 'block' }}>Planlanan Tarih</label>
                  <input type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} style={inputBaseStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4, display: 'block' }}>Not (opsiyonel)</label>
                <input type="text" placeholder="Kısa not ekleyin" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} style={inputBaseStyle} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--glass-border, rgba(255,255,255,0.08))', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'rgba(255,255,255,0.02)' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--glass-border, rgba(255,255,255,0.15))', background: 'transparent', color: 'var(--foreground-2)', cursor: 'pointer', fontSize: '0.85rem' }}>İptal</button>
          <button 
             onClick={handleSave} 
             disabled={tab === 'patient' && (!selectedPatientId && patientMode !== 'create')}
             style={{ 
               padding: '8px 24px', 
               borderRadius: 8, 
               background: 'var(--brand, #3b82f6)', 
               color: '#fff', 
               border: 'none', 
               cursor: (tab === 'patient' && (!selectedPatientId && patientMode !== 'create')) ? 'not-allowed' : 'pointer', 
               fontWeight: 600,
               fontSize: '0.85rem',
               opacity: (tab === 'patient' && (!selectedPatientId && patientMode !== 'create')) ? 0.5 : 1
             }}
          >
            Kaydet
          </button>
        </div>
      </div>
    </>
  );
}
