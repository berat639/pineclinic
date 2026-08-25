import React, { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  onSave: (data: any) => void;
  defaultDate: string;
  defaultStartTime: string;
  defaultEndTime: string;
  doctorId: string | null;
}

export default function QuickCreatePopover({ x, y, onClose, onSave, defaultDate, defaultStartTime, defaultEndTime, doctorId }: Props) {
  const [tab, setTab] = useState<'patient' | 'payment'>('patient');
  const [title, setTitle] = useState('');

  // Patient / Appointment Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tc, setTc] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sms, setSms] = useState(true);
  const [emailOpt, setEmailOpt] = useState(true);
  const [waOpt, setWaOpt] = useState(true);

  // Payment Form
  const [patientId, setPatientId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Nakit');
  const [paymentDate, setPaymentDate] = useState(defaultDate);
  const [paymentStatus, setPaymentStatus] = useState('completed');
  const [plannedDate, setPlannedDate] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  // Floating UI simplified positioning to prevent overflow
  const modalWidth = 400;
  const modalHeight = 550;
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  let left = x + 20;
  let top = y - 50;

  if (left + modalWidth > screenWidth) left = x - modalWidth - 20;
  if (top + modalHeight > screenHeight) top = screenHeight - modalHeight - 20;
  if (top < 20) top = 20;

  const handleSave = () => {
    if (tab === 'patient') {
      onSave({
        type: 'patient_appointment',
        title: title || 'Yeni Hasta / Randevu',
        name, phone, tc, email, gender, birthDate,
        sms, emailOpt, waOpt
      });
    } else {
      onSave({
        type: 'payment',
        title: title || 'Yeni Ödeme',
        patientId, amount, paymentMethod, paymentDate, paymentStatus, plannedDate, paymentNote
      });
    }
  };

  return (
    <>
      <div 
        style={{ position: 'fixed', inset: 0, zIndex: 1000 }} 
        onClick={onClose} 
      />
      <div 
        style={{ 
          position: 'fixed', 
          left, top, 
          width: modalWidth, 
          background: '#ffffff', // Solid white to fix transparency
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
        className="dark:bg-slate-900"
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border, #eee)', background: '#ffffff' }} className="dark:bg-slate-900">
          <input 
            type="text"
            placeholder="Başlık ekle"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ 
              border: 'none', background: 'transparent', fontSize: '1.25rem', fontWeight: 600, 
              color: 'var(--foreground, #111)', outline: 'none', flex: 1 
            }}
            autoFocus
          />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--foreground-3, #888)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--border, #eee)', background: '#ffffff' }} className="dark:bg-slate-900">
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
            onClick={() => setTab('payment')}
            style={{
              padding: '6px 12px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
              border: 'none',
              background: tab === 'payment' ? 'var(--brand, #3b82f6)' : 'transparent',
              color: tab === 'payment' ? '#fff' : 'var(--foreground-2, #555)',
              transition: 'all 0.2s'
            }}
          >
            Ödeme
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: 20, flex: 1, overflowY: 'auto', background: '#ffffff' }} className="dark:bg-slate-900">
          {tab === 'patient' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" placeholder="Ad Soyad (Zorunlu)" value={name} onChange={e => setName(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }} />
              <input type="text" placeholder="Telefon (İsteğe Bağlı)" value={phone} onChange={e => setPhone(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }} />
              <input type="text" placeholder="TC Kimlik No (İsteğe Bağlı)" value={tc} onChange={e => setTc(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }} />
              <input type="email" placeholder="E-posta (İsteğe Bağlı)" value={email} onChange={e => setEmail(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }} />
              
              <select value={gender} onChange={e => setGender(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }}>
                <option value="">Cinsiyet (İsteğe Bağlı)</option>
                <option value="male">Erkek</option>
                <option value="female">Kadın</option>
                <option value="other">Diğer</option>
              </select>
              
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--foreground-2)', marginBottom: 4, display: 'block' }}>Doğum Tarihi (İsteğe Bağlı)</label>
                <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }} />
              </div>
              
              <div style={{ background: 'var(--input-bg, #f9fafb)', padding: 12, borderRadius: 8, marginTop: 8 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>İletişim İzinleri (KVKK)</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', marginBottom: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)} />
                  SMS ile bilgilendirilmek istiyorum
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', marginBottom: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={emailOpt} onChange={e => setEmailOpt(e.target.checked)} />
                  E-posta ile bilgilendirilmek istiyorum
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={waOpt} onChange={e => setWaOpt(e.target.checked)} />
                  WhatsApp ile bilgilendirilmek istiyorum
                </label>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Hasta *</label>
                  <select value={patientId} onChange={e => setPatientId(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }}>
                    <option value="">Hasta Seç...</option>
                    <option value="dummy">Ahmet Yılmaz</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Tutar (₺) *</label>
                  <input type="number" placeholder="Örn: 1500" value={amount} onChange={e => setAmount(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Ödeme Yöntemi</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }}>
                    <option value="Nakit">Nakit</option>
                    <option value="Kredi Kartı">Kredi Kartı</option>
                    <option value="Havale/EFT">Havale/EFT</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Ödeme Tarihi *</label>
                  <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Durum</label>
                  <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }}>
                    <option value="completed">✅ Yapıldı</option>
                    <option value="pending">⏳ Bekliyor</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Planlanan Tarih</label>
                  <input type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, display: 'block' }}>Not (opsiyonel)</label>
                <input type="text" placeholder="Kısa not ekleyin" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} className="tooth-input" style={{ background: '#ffffff' }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border, #eee)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--bg, #f9fafb)' }} className="dark:bg-slate-800">
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }}>İptal</button>
          <button onClick={handleSave} className="btn btn-primary" style={{ padding: '8px 24px', borderRadius: 8, background: 'var(--brand, #3b82f6)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Kaydet</button>
        </div>
      </div>
    </>
  );
}
