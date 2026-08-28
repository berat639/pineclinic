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

  // Solid, high-contrast styling tokens
  const solidCardBg = '#1e293b';       // Solid slate-800
  const solidSubCardBg = '#0f172a';    // Solid slate-900
  const solidBorder = '#334155';       // Solid slate-700
  const solidText = '#ffffff';         // Pure white
  const solidMuted = '#94a3b8';        // Slate-400
  const solidInputBg = '#0f172a';      // Solid slate-900
  const solidBrand = '#2563eb';        // Solid blue-600

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${solidBorder}`,
    background: solidInputBg,
    color: solidText,
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  };

  const selectOptionStyle: React.CSSProperties = {
    background: solidSubCardBg,
    color: solidText
  };

  return (
    <>
      <div 
        style={{ 
          position: 'fixed', 
          inset: 0, 
          zIndex: 100004, 
          background: 'rgba(0, 0, 0, 0.65)' 
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
          background: solidCardBg,
          border: `1px solid ${solidBorder}`,
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)',
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
          borderBottom: `1px solid ${solidBorder}`, 
          background: solidSubCardBg 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: solidBrand,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem'
            }}>
              📅
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: solidText, lineHeight: 1.2 }}>
                {title || 'Yeni Randevu'}
              </div>
              <div style={{ fontSize: '0.75rem', color: solidMuted, marginTop: '2px' }}>
                Tarih: {defaultDate}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: solidBorder, 
              border: 'none', 
              borderRadius: '6px', 
              width: '28px', 
              height: '28px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: solidText
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          padding: '12px 20px', 
          borderBottom: `1px solid ${solidBorder}`, 
          background: solidSubCardBg 
        }}>
          <button 
            onClick={() => setTab('patient')}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: tab === 'patient' ? `1px solid ${solidBrand}` : `1px solid ${solidBorder}`,
              background: tab === 'patient' ? solidBrand : solidCardBg,
              color: tab === 'patient' ? '#ffffff' : solidMuted
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
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: tab === 'payment' ? `1px solid ${solidBrand}` : `1px solid ${solidBorder}`,
              background: tab === 'payment' ? solidBrand : solidCardBg,
              color: tab === 'payment' ? '#ffffff' : solidMuted,
              opacity: (!selectedPatientId && patientMode !== 'create') ? 0.5 : 1
            }}
          >
            Ödeme
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto', background: solidCardBg }}>
          {tab === 'patient' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* STEP 1: PATIENT SELECTION / CREATION */}
              <div style={{ 
                background: solidSubCardBg, 
                padding: '14px', 
                borderRadius: '10px', 
                border: `1px solid ${solidBorder}` 
              }}>
                <div style={{ 
                  fontSize: '0.85rem', 
                  fontWeight: 700, 
                  color: solidText, 
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: solidBrand,
                    color: '#ffffff',
                    fontSize: '0.75rem',
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
                          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: solidMuted }} />
                          <input 
                            type="text" 
                            placeholder="Kayıtlı Hasta Ara..." 
                            value={patientSearchQuery}
                            onChange={e => setPatientSearchQuery(e.target.value)}
                            style={{ ...inputStyle, paddingLeft: '36px' }} 
                          />
                        </div>

                        {/* Search list with solid opaque items */}
                        <div style={{ 
                          maxHeight: '160px', 
                          overflowY: 'auto', 
                          background: solidSubCardBg, 
                          border: `1px solid ${solidBorder}`, 
                          borderRadius: '8px',
                          padding: '4px'
                        }}>
                           {filteredPatients.map((p, idx) => (
                             <div 
                               key={p.id || idx} 
                               onClick={() => setSelectedPatientId(p.id)}
                               style={{ 
                                 padding: '9px 12px', 
                                 cursor: 'pointer', 
                                 borderRadius: '6px',
                                 marginBottom: '2px',
                                 background: solidCardBg,
                                 border: `1px solid ${solidBorder}`,
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'space-between'
                               }}
                               onMouseEnter={e => {
                                 e.currentTarget.style.background = '#334155';
                                 e.currentTarget.style.borderColor = '#60a5fa';
                               }}
                               onMouseLeave={e => {
                                 e.currentTarget.style.background = solidCardBg;
                                 e.currentTarget.style.borderColor = solidBorder;
                               }}
                             >
                               <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                 <div style={{
                                   width: '26px',
                                   height: '26px',
                                   borderRadius: '50%',
                                   background: '#334155',
                                   color: '#60a5fa',
                                   fontSize: '0.75rem',
                                   fontWeight: 700,
                                   display: 'flex',
                                   alignItems: 'center',
                                   justifyContent: 'center'
                                 }}>
                                   {p.name.charAt(0).toUpperCase()}
                                 </div>
                                 <div>
                                   <div style={{ fontWeight: 600, fontSize: '0.875rem', color: solidText }}>{p.name}</div>
                                   {p.phone && <div style={{ fontSize: '0.75rem', color: solidMuted }}>📞 {p.phone}</div>}
                                 </div>
                               </div>
                               <ChevronRight size={16} color={solidMuted} />
                             </div>
                           ))}
                           {filteredPatients.length === 0 && (
                             <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.85rem', color: solidMuted }}>
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
                             padding: '10px 14px', 
                             background: solidBrand, 
                             color: '#ffffff', 
                             border: 'none', 
                             borderRadius: '8px', 
                             cursor: 'pointer', 
                             fontSize: '0.875rem', 
                             fontWeight: 600
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
                        background: '#1e3a8a', 
                        padding: '12px 14px', 
                        borderRadius: '8px', 
                        border: '1px solid #3b82f6' 
                      }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                           <div style={{
                             width: '32px',
                             height: '32px',
                             borderRadius: '50%',
                             background: '#3b82f6',
                             color: '#ffffff',
                             fontSize: '0.85rem',
                             fontWeight: 700,
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'center'
                           }}>
                             {selectedPatientObj?.name?.charAt(0).toUpperCase() || 'H'}
                           </div>
                           <div>
                             <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff' }}>
                               {selectedPatientObj?.name}
                             </div>
                             <div style={{ fontSize: '0.75rem', color: '#93c5fd' }}>
                               {selectedPatientObj?.phone ? `📞 ${selectedPatientObj.phone}` : 'Kayıtlı Hasta'}
                             </div>
                           </div>
                         </div>
                         <button 
                           onClick={() => setSelectedPatientId('')} 
                           style={{ 
                             background: '#7f1d1d', 
                             border: '1px solid #ef4444', 
                             color: '#fca5a5', 
                             padding: '6px 12px', 
                             borderRadius: '6px', 
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
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: solidText }}>Yeni Hasta Bilgileri</span>
                      <button 
                        onClick={() => setPatientMode('select')} 
                        style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
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
                   background: solidSubCardBg, 
                   padding: '14px', 
                   borderRadius: '10px', 
                   border: `1px solid ${solidBorder}`,
                   display: 'flex',
                   flexDirection: 'column',
                   gap: '8px'
                 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <label style={{ 
                       fontSize: '0.85rem', 
                       fontWeight: 700, 
                       color: solidText,
                       display: 'flex',
                       alignItems: 'center',
                       gap: '8px'
                     }}>
                       <span style={{
                         width: '22px',
                         height: '22px',
                         borderRadius: '50%',
                         background: solidBrand,
                         color: '#ffffff',
                         fontSize: '0.75rem',
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                         fontWeight: 700
                       }}>2</span>
                       <span>Doktor Ataması</span>
                     </label>
                     {!selectedDoctorId && (
                       <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700 }}>⚠️ Atanmadı</span>
                     )}
                   </div>
                   <select 
                     value={selectedDoctorId} 
                     onChange={e => setSelectedDoctorId(e.target.value)} 
                     style={{
                       ...inputStyle,
                       border: !selectedDoctorId ? '1.5px solid #f59e0b' : `1px solid ${solidBorder}`,
                       background: solidInputBg,
                       color: !selectedDoctorId ? '#f59e0b' : solidText,
                       fontWeight: !selectedDoctorId ? 600 : 400
                     }}
                   >
                     <option value="" style={selectOptionStyle}>⚠️ Doktor Seçiniz (Atama Bekliyor)</option>
                     {doctors.map(d => (
                       <option key={d.id} value={d.id} style={selectOptionStyle}>Dr. {d.name}</option>
                     ))}
                   </select>
                   {!selectedDoctorId && (
                     <div style={{ fontSize: '0.75rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                       <span>ℹ️ Doktor seçilmezse randevu "Doktor Atanmadı" uyarısıyla açılır.</span>
                     </div>
                   )}
                 </div>
              )}

              {/* STEP 3: TIME SELECTION */}
              {(selectedPatientId || patientMode === 'create') && (
                 <div style={{ 
                   background: solidSubCardBg, 
                   padding: '14px', 
                   borderRadius: '10px', 
                   border: `1px solid ${solidBorder}`,
                   display: 'flex',
                   flexDirection: 'column',
                   gap: '10px'
                 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <label style={{ 
                       fontSize: '0.85rem', 
                       fontWeight: 700, 
                       color: solidText,
                       display: 'flex',
                       alignItems: 'center',
                       gap: '8px'
                     }}>
                       <span style={{
                         width: '22px',
                         height: '22px',
                         borderRadius: '50%',
                         background: solidBrand,
                         color: '#ffffff',
                         fontSize: '0.75rem',
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                         fontWeight: 700
                       }}>3</span>
                       <span>Randevu Saati</span>
                     </label>
                     <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 700 }}>{defaultDate}</span>
                   </div>
                   <FancyHourPicker range={timeRange} onChange={setTimeRange} />
                 </div>
              )}

            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: solidMuted, marginBottom: '6px', display: 'block' }}>Tutar (₺) *</label>
                <input type="number" placeholder="Örn: 1500" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: solidMuted, marginBottom: '6px', display: 'block' }}>Ödeme Yöntemi</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
                    <option value="Nakit" style={selectOptionStyle}>Nakit</option>
                    <option value="Kredi Kartı" style={selectOptionStyle}>Kredi Kartı</option>
                    <option value="Havale/EFT" style={selectOptionStyle}>Havale/EFT</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: solidMuted, marginBottom: '6px', display: 'block' }}>Ödeme Tarihi *</label>
                  <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: solidMuted, marginBottom: '6px', display: 'block' }}>Durum</label>
                  <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} style={inputStyle}>
                    <option value="completed" style={selectOptionStyle}>✅ Yapıldı</option>
                    <option value="pending" style={selectOptionStyle}>⏳ Bekliyor</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: solidMuted, marginBottom: '6px', display: 'block' }}>Planlanan Tarih</label>
                  <input type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: solidMuted, marginBottom: '6px', display: 'block' }}>Not (opsiyonel)</label>
                <input type="text" placeholder="Kısa not ekleyin" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} style={inputStyle} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '16px 20px', 
          borderTop: `1px solid ${solidBorder}`, 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '10px', 
          background: solidSubCardBg 
        }}>
          <button 
            onClick={onClose} 
            style={{ 
              padding: '9px 18px', 
              borderRadius: '8px', 
              border: `1px solid ${solidBorder}`, 
              background: solidCardBg, 
              color: solidText, 
              cursor: 'pointer', 
              fontSize: '0.875rem',
              fontWeight: 600
            }}
          >
            İptal
          </button>
          <button 
             onClick={handleSave} 
             disabled={tab === 'patient' && (!selectedPatientId && patientMode !== 'create')}
             style={{ 
               padding: '9px 24px', 
               borderRadius: '8px', 
               background: solidBrand, 
               color: '#ffffff', 
               border: 'none', 
               cursor: (tab === 'patient' && (!selectedPatientId && patientMode !== 'create')) ? 'not-allowed' : 'pointer', 
               fontWeight: 700,
               fontSize: '0.875rem',
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
