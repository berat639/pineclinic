import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Plus, ArrowRight } from 'lucide-react';

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
}

export default function QuickCreatePopover({ x, y, onClose, onSave, defaultDate, defaultStartTime, defaultEndTime, doctorId, patients, doctors }: Props) {
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

  // Auto-update title when patient changes
  useEffect(() => {
    if (patientMode === 'select' && selectedPatientId) {
      const p = patients.find(p => p.id === selectedPatientId);
      if (p) setTitle(p.name);
    } else if (patientMode === 'create' && name) {
      setTitle(name);
    }
  }, [patientMode, selectedPatientId, name, patients]);

  const modalWidth = 400;
  const modalHeight = 550;
  // Use scroll/page boundaries for positioning absolute
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
  const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;

  let left = x;
  let top = y;

  if (left + modalWidth > scrollX + screenWidth) left = x - modalWidth;
  if (top + modalHeight > scrollY + screenHeight) top = scrollY + screenHeight - modalHeight - 20;
  if (top < scrollY + 20) top = scrollY + 20;

  const handleSave = () => {
    if (tab === 'patient') {
      onSave({
        type: 'patient_appointment',
        title: title || 'Yeni Hasta / Randevu',
        patientId: patientMode === 'select' ? selectedPatientId : undefined,
        doctorId: selectedDoctorId || null,
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
    : patients.slice(0, 15); // limit default list

  // Base input style mimicking tooth-input
  const inputBaseStyle = {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--glass-border, #e5e7eb)',
    background: '#f9fafb',
    color: 'var(--foreground, #111827)',
    fontSize: '0.85rem',
    outline: 'none',
    width: '100%'
  };

  return (
    <>
      <div 
        style={{ position: 'fixed', inset: 0, zIndex: 1000 }} 
        onClick={onClose} 
      />
      <div 
        style={{ 
          position: 'absolute', 
          left, top, 
          width: modalWidth, 
          backgroundColor: 'var(--card-bg, #ffffff)',
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border, #eee)', backgroundColor: 'var(--card-bg, #ffffff)' }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--foreground, #111)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
             {title || 'Yeni Randevu'}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--foreground-3, #888)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--border, #eee)' }}>
          <button 
            onClick={() => setTab('patient')}
            style={{
              padding: '6px 12px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
              border: 'none',
              background: tab === 'patient' ? 'var(--brand, #3b82f6)' : 'transparent',
              color: tab === 'patient' ? '#fff' : 'var(--foreground-2, #555)',
              transition: 'all 0.2s'
            }}
          >
            Hasta Randevu
          </button>
          <button 
            onClick={() => {
               // Only allow switching to payment if a patient is selected (step logic part 2)
               // However, since it's "quick create", the appointment isn't created yet until they hit Save.
               // We will just disable the tab visually or alert them.
               if (!selectedPatientId && patientMode !== 'create') {
                  alert('Lütfen önce bir hasta seçin veya ekleyin.');
                  return;
               }
               setTab('payment');
            }}
            style={{
              padding: '6px 12px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
              border: 'none',
              background: tab === 'payment' ? 'var(--brand, #3b82f6)' : 'transparent',
              color: tab === 'payment' ? '#fff' : 'var(--foreground-2, #555)',
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
              <div style={{ background: 'rgba(59,130,246,0.05)', padding: 12, borderRadius: 8, border: '1px solid rgba(59,130,246,0.1)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand, #3b82f6)', marginBottom: 12 }}>1. Hasta Seçimi</div>
                
                {patientMode === 'select' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {!selectedPatientId ? (
                      <>
                        <div style={{ position: 'relative' }}>
                          <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
                          <input 
                            type="text" 
                            placeholder="Kayıtlı Hasta Ara..." 
                            value={patientSearchQuery}
                            onChange={e => setPatientSearchQuery(e.target.value)}
                            style={{ ...inputBaseStyle, paddingLeft: 34 }} 
                          />
                        </div>
                        <div style={{ maxHeight: 150, overflowY: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 6 }}>
                           {filteredPatients.map(p => (
                             <div 
                               key={p.id} 
                               onClick={() => setSelectedPatientId(p.id)}
                               style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '0.85rem' }}
                               onMouseOver={e => e.currentTarget.style.background = '#f9fafb'}
                               onMouseOut={e => e.currentTarget.style.background = '#fff'}
                             >
                               <div style={{ fontWeight: 500 }}>{p.name}</div>
                               {p.phone && <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{p.phone}</div>}
                             </div>
                           ))}
                           {filteredPatients.length === 0 && (
                             <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.8rem', color: '#6b7280' }}>Hasta bulunamadı.</div>
                           )}
                        </div>
                        <button 
                           onClick={() => setPatientMode('create')}
                           style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
                        >
                          <Plus size={16} /> Yeni Hasta Ekle
                        </button>
                      </>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '10px 12px', borderRadius: 6, border: '1px solid #eee' }}>
                         <div>
                           <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{patients.find(p => p.id === selectedPatientId)?.name}</div>
                           <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Kayıtlı Hasta</div>
                         </div>
                         <button onClick={() => setSelectedPatientId('')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500 }}>Değiştir</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Yeni Hasta Bilgileri</span>
                      <button onClick={() => setPatientMode('select')} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer' }}>Vazgeç</button>
                    </div>
                    <input type="text" placeholder="Ad Soyad (Zorunlu)" value={name} onChange={e => setName(e.target.value)} style={inputBaseStyle} />
                    <input type="text" placeholder="Telefon (İsteğe Bağlı)" value={phone} onChange={e => setPhone(e.target.value)} style={inputBaseStyle} />
                    <input type="text" placeholder="TC Kimlik No (İsteğe Bağlı)" value={tc} onChange={e => setTc(e.target.value)} style={inputBaseStyle} />
                  </div>
                )}
              </div>

              {/* STEP 2: DOCTOR SELECTION */}
              {(selectedPatientId || patientMode === 'create') && (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                   <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>2. Doktor Ataması</label>
                   <select 
                     value={selectedDoctorId} 
                     onChange={e => setSelectedDoctorId(e.target.value)} 
                     style={inputBaseStyle}
                   >
                     <option value="">⚠️ Atanmamış</option>
                     {doctors.map(d => (
                       <option key={d.id} value={d.id}>{d.name}</option>
                     ))}
                   </select>
                   <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 4 }}>
                     {defaultDate} {defaultStartTime} - {defaultEndTime} arası için randevu oluşturulacak.
                   </div>
                 </div>
              )}

            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Tutar (₺) *</label>
                  <input type="number" placeholder="Örn: 1500" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} style={inputBaseStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Ödeme Yöntemi</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputBaseStyle}>
                    <option value="Nakit">Nakit</option>
                    <option value="Kredi Kartı">Kredi Kartı</option>
                    <option value="Havale/EFT">Havale/EFT</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Ödeme Tarihi *</label>
                  <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inputBaseStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Durum</label>
                  <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} style={inputBaseStyle}>
                    <option value="completed">✅ Yapıldı</option>
                    <option value="pending">⏳ Bekliyor</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Planlanan Tarih</label>
                  <input type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} style={inputBaseStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Not (opsiyonel)</label>
                <input type="text" placeholder="Kısa not ekleyin" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} style={inputBaseStyle} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border, #eee)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--bg, #f9fafb)' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }}>İptal</button>
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
