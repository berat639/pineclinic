import React, { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { X, Search, Plus, User, Stethoscope, Clock, Check, ChevronRight } from 'lucide-react';
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

export default function QuickCreatePopover({ 
  x, 
  y, 
  onClose, 
  onSave, 
  defaultDate, 
  defaultStartTime, 
  defaultEndTime, 
  doctorId, 
  patients, 
  doctors, 
  events = [], 
  isCentered = false 
}: Props) {
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

  // Deduplicate and filter patients
  const uniquePatients = useMemo(() => {
    const map = new Map<string, any>();
    patients.forEach(p => {
      if (!p?.name) return;
      const key = `${p.name.trim().toLowerCase()}_${(p.phone || '').trim()}`;
      if (!map.has(key)) {
        map.set(key, p);
      }
    });
    return Array.from(map.values());
  }, [patients]);

  const filteredPatients = useMemo(() => {
    const q = patientSearchQuery.trim().toLowerCase();
    if (!q) return uniquePatients.slice(0, 10);
    return uniquePatients.filter(p => 
      p.name?.toLowerCase().includes(q) || (p.phone && p.phone.includes(q))
    ).slice(0, 15);
  }, [uniquePatients, patientSearchQuery]);

  // Auto-update title when patient changes
  useEffect(() => {
    if (patientMode === 'select' && selectedPatientId) {
      const p = uniquePatients.find(p => p.id === selectedPatientId);
      if (p) setTitle(p.name);

      // Smart doctor selection
      if (events && events.length > 0 && !doctorId) {
        const patientEvents = events.filter((e: any) => e.patientId === selectedPatientId && e.doctorId);
        if (patientEvents.length > 0) {
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
  }, [patientMode, selectedPatientId, name, uniquePatients, events, doctorId]);

  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [computedLeft, setComputedLeft] = useState(x);
  const [computedTop, setComputedTop] = useState(y);

  const modalWidth = 420;
  const modalHeight = 580;

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
         if (cLeft < 10) cLeft = 10;
         if (cTop < 10) cTop = 10;
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

  const selectedPatientObj = useMemo(() => {
    return uniquePatients.find(p => p.id === selectedPatientId);
  }, [uniquePatients, selectedPatientId]);

  const inputStyle: React.CSSProperties = {
    padding: '9px 12px',
    borderRadius: '10px',
    border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
    background: 'var(--input-bg, rgba(255,255,255,0.04))',
    color: 'var(--foreground, #fff)',
    fontSize: '0.85rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  };

  const selectOptionStyle: React.CSSProperties = {
    background: 'var(--card-bg, #0f172a)',
    color: 'var(--foreground, #fff)'
  };

  return (
    <>
      <div 
        style={{ 
          position: 'fixed', 
          inset: 0, 
          zIndex: 100004, 
          background: 'rgba(0, 0, 0, 0.45)', 
          backdropFilter: 'blur(3px)' 
        }} 
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
          background: 'var(--card-bg, #0f172a)',
          border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.12))',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 100005,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '16px 20px', 
          borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.08))', 
          background: 'rgba(255,255,255,0.01)' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))',
              border: '1px solid rgba(59,130,246,0.3)',
              color: '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.9rem'
            }}>
              📅
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--foreground, #fff)', lineHeight: 1.2 }}>
                {title || 'Yeni Randevu'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3, #94a3b8)', marginTop: '2px' }}>
                Tarih: {defaultDate}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'rgba(255,255,255,0.06)', 
              border: 'none', 
              borderRadius: '50%', 
              width: '28px', 
              height: '28px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: 'var(--foreground-3, #94a3b8)',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          >
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          padding: '10px 20px', 
          borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.08))', 
          background: 'rgba(255,255,255,0.02)' 
        }}>
          <button 
            onClick={() => setTab('patient')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: tab === 'patient' ? '1px solid #3b82f6' : '1px solid transparent',
              background: tab === 'patient' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'rgba(255,255,255,0.04)',
              color: tab === 'patient' ? '#fff' : 'var(--foreground-2, #cbd5e1)',
              boxShadow: tab === 'patient' ? '0 2px 10px rgba(59,130,246,0.3)' : 'none',
              transition: 'all 0.2s ease'
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
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: tab === 'payment' ? '1px solid #3b82f6' : '1px solid transparent',
              background: tab === 'payment' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'rgba(255,255,255,0.04)',
              color: tab === 'payment' ? '#fff' : 'var(--foreground-2, #cbd5e1)',
              boxShadow: tab === 'payment' ? '0 2px 10px rgba(59,130,246,0.3)' : 'none',
              opacity: (!selectedPatientId && patientMode !== 'create') ? 0.5 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            Ödeme
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '18px 20px', flex: 1, overflowY: 'auto' }}>
          {tab === 'patient' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* STEP 1: PATIENT SELECTION / CREATION */}
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.02)', 
                padding: '14px', 
                borderRadius: '12px', 
                border: '1px solid var(--glass-border, rgba(255,255,255,0.08))' 
              }}>
                <div style={{ 
                  fontSize: '0.82rem', 
                  fontWeight: 600, 
                  color: 'var(--foreground, #fff)', 
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    color: '#fff',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700
                  }}>1</span>
                  <span>Hasta Seçimi</span>
                </div>
                
                {patientMode === 'select' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {!selectedPatientId ? (
                      <>
                        <div style={{ position: 'relative' }}>
                          <Search size={15} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--foreground-3, #94a3b8)' }} />
                          <input 
                            type="text" 
                            placeholder="Kayıtlı Hasta Ara..." 
                            value={patientSearchQuery}
                            onChange={e => setPatientSearchQuery(e.target.value)}
                            style={{ ...inputStyle, paddingLeft: '34px' }} 
                          />
                        </div>

                        {/* Search list with clean dark mode items */}
                        <div style={{ 
                          maxHeight: '160px', 
                          overflowY: 'auto', 
                          background: 'var(--card-bg, #0f172a)', 
                          border: '1px solid var(--glass-border, rgba(255,255,255,0.1))', 
                          borderRadius: '10px',
                          padding: '4px'
                        }}>
                           {filteredPatients.map((p, idx) => (
                             <div 
                               key={p.id || idx} 
                               onClick={() => setSelectedPatientId(p.id)}
                               style={{ 
                                 padding: '8px 10px', 
                                 cursor: 'pointer', 
                                 borderRadius: '8px',
                                 marginBottom: '2px',
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'space-between',
                                 transition: 'background 0.15s ease'
                               }}
                               onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.15)'}
                               onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                             >
                               <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                 <div style={{
                                   width: '24px',
                                   height: '24px',
                                   borderRadius: '50%',
                                   background: 'rgba(59,130,246,0.2)',
                                   color: '#60a5fa',
                                   fontSize: '0.72rem',
                                   fontWeight: 700,
                                   display: 'flex',
                                   alignItems: 'center',
                                   justifyContent: 'center'
                                 }}>
                                   {p.name.charAt(0).toUpperCase()}
                                 </div>
                                 <div>
                                   <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--foreground, #fff)' }}>{p.name}</div>
                                   {p.phone && <div style={{ fontSize: '0.7rem', color: 'var(--foreground-3, #94a3b8)' }}>📞 {p.phone}</div>}
                                 </div>
                               </div>
                               <ChevronRight size={14} color="var(--foreground-3, #94a3b8)" />
                             </div>
                           ))}
                           {filteredPatients.length === 0 && (
                             <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--foreground-3, #94a3b8)' }}>
                               Hasta bulunamadı.
                             </div>
                           )}
                        </div>

                        <button 
                           onClick={() => setPatientMode('create')}
                           style={{ 
                             display: 'flex', 
                             alignItems: 'center', 
                             justifyContent: 'center', 
                             gap: '6px', 
                             padding: '9px 12px', 
                             background: 'linear-gradient(135deg, #3b82f6, #2563eb)', 
                             color: '#fff', 
                             border: 'none', 
                             borderRadius: '10px', 
                             cursor: 'pointer', 
                             fontSize: '0.85rem', 
                             fontWeight: 600,
                             boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)',
                             transition: 'transform 0.1s ease'
                           }}
                        >
                          <Plus size={16} /> Yeni Hasta Ekle
                        </button>
                      </>
                    ) : (
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        background: 'rgba(59, 130, 246, 0.08)', 
                        padding: '10px 14px', 
                        borderRadius: '10px', 
                        border: '1px solid rgba(59, 130, 246, 0.25)' 
                      }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                           <div style={{
                             width: '30px',
                             height: '30px',
                             borderRadius: '50%',
                             background: '#3b82f6',
                             color: '#fff',
                             fontSize: '0.8rem',
                             fontWeight: 700,
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'center'
                           }}>
                             {selectedPatientObj?.name?.charAt(0).toUpperCase() || 'H'}
                           </div>
                           <div>
                             <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground, #fff)' }}>
                               {selectedPatientObj?.name}
                             </div>
                             <div style={{ fontSize: '0.72rem', color: 'var(--foreground-3, #94a3b8)' }}>
                               {selectedPatientObj?.phone ? `📞 ${selectedPatientObj.phone}` : 'Kayıtlı Hasta'}
                             </div>
                           </div>
                         </div>
                         <button 
                           onClick={() => setSelectedPatientId('')} 
                           style={{ 
                             background: 'rgba(239, 68, 68, 0.12)', 
                             border: '1px solid rgba(239, 68, 68, 0.25)', 
                             color: '#f87171', 
                             padding: '5px 10px', 
                             borderRadius: '8px', 
                             fontSize: '0.75rem', 
                             cursor: 'pointer', 
                             fontWeight: 600 
                           }}
                         >
                           Değiştir
                         </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground, #fff)' }}>Yeni Hasta Bilgileri</span>
                      <button 
                        onClick={() => setPatientMode('select')} 
                        style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500 }}
                      >
                        Listeden Seç
                      </button>
                    </div>
                    <input type="text" placeholder="Ad Soyad (Zorunlu)" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
                    <input type="text" placeholder="Telefon (İsteğe Bağlı)" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
                    <input type="text" placeholder="TC Kimlik No (İsteğe Bağlı)" value={tc} onChange={e => setTc(e.target.value)} style={inputStyle} />
                  </div>
                )}
              </div>

              {/* STEP 2: DOCTOR SELECTION */}
              {(selectedPatientId || patientMode === 'create') && (
                 <div style={{ 
                   background: 'rgba(255, 255, 255, 0.02)', 
                   padding: '14px', 
                   borderRadius: '12px', 
                   border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
                   display: 'flex',
                   flexDirection: 'column',
                   gap: '8px'
                 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <label style={{ 
                       fontSize: '0.82rem', 
                       fontWeight: 600, 
                       color: 'var(--foreground, #fff)',
                       display: 'flex',
                       alignItems: 'center',
                       gap: '8px'
                     }}>
                       <span style={{
                         width: '20px',
                         height: '20px',
                         borderRadius: '50%',
                         background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                         color: '#fff',
                         fontSize: '0.72rem',
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                         fontWeight: 700
                       }}>2</span>
                       <span>Doktor Ataması</span>
                     </label>
                     {!selectedDoctorId && (
                       <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>⚠️ Atanmadı</span>
                     )}
                   </div>
                   <select 
                     value={selectedDoctorId} 
                     onChange={e => setSelectedDoctorId(e.target.value)} 
                     style={{
                       ...inputStyle,
                       border: !selectedDoctorId ? '1.5px solid #f59e0b' : inputStyle.border,
                       background: !selectedDoctorId ? 'rgba(245, 158, 11, 0.08)' : inputStyle.background,
                       color: !selectedDoctorId ? '#f59e0b' : 'var(--foreground, #fff)',
                       fontWeight: !selectedDoctorId ? 600 : 400
                     }}
                   >
                     <option value="" style={selectOptionStyle}>⚠️ Doktor Seçiniz (Atama Bekliyor)</option>
                     {doctors.map(d => (
                       <option key={d.id} value={d.id} style={selectOptionStyle}>Dr. {d.name}</option>
                     ))}
                   </select>
                   {!selectedDoctorId && (
                     <div style={{ fontSize: '0.7rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                       <span>ℹ️ Doktor seçilmezse randevu "Doktor Atanmadı" uyarısıyla açılır.</span>
                     </div>
                   )}
                 </div>
              )}

              {/* STEP 3: TIME SELECTION */}
              {(selectedPatientId || patientMode === 'create') && (
                 <div style={{ 
                   background: 'rgba(255, 255, 255, 0.02)', 
                   padding: '14px', 
                   borderRadius: '12px', 
                   border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
                   display: 'flex',
                   flexDirection: 'column',
                   gap: '10px'
                 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <label style={{ 
                       fontSize: '0.82rem', 
                       fontWeight: 600, 
                       color: 'var(--foreground, #fff)',
                       display: 'flex',
                       alignItems: 'center',
                       gap: '8px'
                     }}>
                       <span style={{
                         width: '20px',
                         height: '20px',
                         borderRadius: '50%',
                         background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                         color: '#fff',
                         fontSize: '0.72rem',
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                         fontWeight: 700
                       }}>3</span>
                       <span>Randevu Saati</span>
                     </label>
                     <span style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 600 }}>{defaultDate}</span>
                   </div>
                   <FancyHourPicker range={timeRange} onChange={setTimeRange} />
                 </div>
              )}

            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: '4px', display: 'block' }}>Tutar (₺) *</label>
                <input type="number" placeholder="Örn: 1500" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: '4px', display: 'block' }}>Ödeme Yöntemi</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
                    <option value="Nakit" style={selectOptionStyle}>Nakit</option>
                    <option value="Kredi Kartı" style={selectOptionStyle}>Kredi Kartı</option>
                    <option value="Havale/EFT" style={selectOptionStyle}>Havale/EFT</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: '4px', display: 'block' }}>Ödeme Tarihi *</label>
                  <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: '4px', display: 'block' }}>Durum</label>
                  <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} style={inputStyle}>
                    <option value="completed" style={selectOptionStyle}>✅ Yapıldı</option>
                    <option value="pending" style={selectOptionStyle}>⏳ Bekliyor</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: '4px', display: 'block' }}>Planlanan Tarih</label>
                  <input type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground-2, #cbd5e1)', marginBottom: '4px', display: 'block' }}>Not (opsiyonel)</label>
                <input type="text" placeholder="Kısa not ekleyin" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} style={inputStyle} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '14px 20px', 
          borderTop: '1px solid var(--glass-border, rgba(255,255,255,0.08))', 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '10px', 
          background: 'rgba(255,255,255,0.02)' 
        }}>
          <button 
            onClick={onClose} 
            style={{ 
              padding: '8px 18px', 
              borderRadius: '10px', 
              border: '1px solid var(--glass-border, rgba(255,255,255,0.15))', 
              background: 'transparent', 
              color: 'var(--foreground-2, #cbd5e1)', 
              cursor: 'pointer', 
              fontSize: '0.85rem',
              fontWeight: 500
            }}
          >
            İptal
          </button>
          <button 
             onClick={handleSave} 
             disabled={tab === 'patient' && (!selectedPatientId && patientMode !== 'create')}
             style={{ 
               padding: '8px 24px', 
               borderRadius: '10px', 
               background: 'linear-gradient(135deg, #3b82f6, #2563eb)', 
               color: '#fff', 
               border: 'none', 
               cursor: (tab === 'patient' && (!selectedPatientId && patientMode !== 'create')) ? 'not-allowed' : 'pointer', 
               fontWeight: 600,
               fontSize: '0.85rem',
               boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)',
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
