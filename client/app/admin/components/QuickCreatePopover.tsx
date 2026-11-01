import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { X, Search, Plus, ChevronRight } from 'lucide-react';
import FancyHourPicker from './FancyHourPicker';
import PatientConsentPanel from './PatientConsentPanel';
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss';
import { PhoneMaskedInput, matchesPhoneSearch } from '@/lib/phone-mask';

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
  isCentered = false,
}: Props) {
  const backdropDismiss = useBackdropDismiss(onClose);

  // Top tab mode: 'select' (Hasta Randevu) | 'create' (Yeni Hasta Ekle)
  const [patientMode, setPatientMode] = useState<'select' | 'create'>('select');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [createdPatientId, setCreatedPatientId] = useState<string>('');
  const [patientSearchQuery, setPatientSearchQuery] = useState('');

  // New patient full form state
  const [title, setTitle] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [tc, setTc] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sms, setSms] = useState(true);
  const [emailOpt, setEmailOpt] = useState(true);
  const [waOpt, setWaOpt] = useState(true);

  const fullName = useMemo(() => {
    return `${firstName.trim()} ${lastName.trim()}`.trim();
  }, [firstName, lastName]);

  // Appointment info
  const [selectedDoctorId, setSelectedDoctorId] = useState(doctorId || '');

  const timeToNumber = (t: string) => {
    if (!t) return 9;
    const [h, m] = t.split(':').map(Number);
    return h + (m === 30 ? 0.5 : 0);
  };
  const formatNumberTime = (val: number) => {
    const h = Math.floor(val).toString().padStart(2, '0');
    const m = val % 1 === 0.5 ? '30' : '00';
    return `${h}:${m}`;
  };

  const [timeRange, setTimeRange] = useState<[number, number]>([
    timeToNumber(defaultStartTime) || 9,
    timeToNumber(defaultEndTime) || 9.5,
  ]);

  // Deduplicate and filter patients
  const uniquePatients = useMemo(() => {
    const map = new Map<string, any>();
    patients.forEach((p) => {
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
    return uniquePatients
      .filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          matchesPhoneSearch(p.phone, patientSearchQuery)
      )
      .slice(0, 15);
  }, [uniquePatients, patientSearchQuery]);

  // Auto-update title when patient changes
  useEffect(() => {
    if (patientMode === 'select' && selectedPatientId) {
      const p = uniquePatients.find((item) => item.id === selectedPatientId);
      if (p) setTitle(p.name);

      // Smart doctor selection
      if (events && events.length > 0 && !doctorId) {
        const patientEvents = events.filter(
          (e: any) => e.patientId === selectedPatientId && e.doctorId
        );
        if (patientEvents.length > 0) {
          patientEvents.sort(
            (a, b) =>
              new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
          );
          const lastDoctorId = patientEvents[0].doctorId;
          if (lastDoctorId) {
            setSelectedDoctorId(lastDoctorId);
          }
        }
      }
    } else if (patientMode === 'create') {
      setTitle(fullName || '');
    } else if (patientMode === 'select' && !selectedPatientId) {
      setTitle('');
    }
  }, [patientMode, selectedPatientId, fullName, uniquePatients, events, doctorId]);

  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [computedLeft, setComputedLeft] = useState(x);
  const [computedTop, setComputedTop] = useState(y);

  const modalWidth = 460;
  const modalHeight = 620;

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
        const viewportY =
          cTop + (offsetParent ? offsetParent.getBoundingClientRect().top : 0);
        if (viewportY + modalHeight > screenHeight) {
          cTop -= viewportY + modalHeight - screenHeight + 20;
        }
        const viewportX =
          cLeft +
          (offsetParent ? offsetParent.getBoundingClientRect().left : 0);
        if (viewportX + modalWidth > screenWidth) {
          cLeft -= viewportX + modalWidth - screenWidth + 20;
        }
        if (cLeft < 10) cLeft = 10;
        if (cTop < 10) cTop = 10;
      }

      setComputedLeft(cLeft);
      setComputedTop(cTop);
    }
  }, [x, y, isCentered]);

  const selectedPatientObj = useMemo(() => {
    return uniquePatients.find((p) => p.id === selectedPatientId);
  }, [uniquePatients, selectedPatientId]);

  const ensureCreatedPatient = async (): Promise<string | null> => {
    if (!firstName.trim()) {
      toast.error('Onam formu göndermek için önce hastanın adını girin.');
      return null;
    }
    if (createdPatientId) {
      await fetch(`/api/dental/patients/${createdPatientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          name: fullName,
          phone,
          tcIdentity: tc,
          email,
          gender,
          birthDate,
        }),
      }).catch(() => {});
      return createdPatientId;
    }
    const res = await fetch('/api/dental/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        phone,
        tcIdentity: tc,
        email,
        gender,
        birthDate,
        smsOptOut: !sms,
        emailOptOut: !emailOpt,
        whatsappOptOut: !waOpt,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Hasta oluşturulamadı');
      return null;
    }
    const pt = await res.json();
    setCreatedPatientId(pt.id);
    return pt.id;
  };

  const handleSave = () => {
    if (patientMode === 'select' && !selectedPatientId) {
      toast.error('Lütfen listeden bir hasta seçin veya Yeni Hasta Ekle sekmesine geçin.');
      return;
    }
    if (patientMode === 'create' && !firstName.trim()) {
      toast.error('Lütfen hastanın adını girin.');
      return;
    }

    let finalTitle =
      title ||
      (patientMode === 'select' ? selectedPatientObj?.name : fullName) ||
      'Yeni Randevu';
    if (!selectedDoctorId && !finalTitle.includes('Kontrol Randevusu')) {
      finalTitle = `${finalTitle} - Kontrol Randevusu`;
    }

    onSave({
      type: 'patient_appointment',
      title: finalTitle,
      patientId: patientMode === 'select' ? selectedPatientId : (createdPatientId || undefined),
      doctorId: selectedDoctorId || null,
      startTime: formatNumberTime(timeRange[0]),
      endTime: formatNumberTime(timeRange[1]),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name: fullName,
      phone,
      tc,
      tcIdentity: tc,
      email,
      gender,
      birthDate,
      sms,
      emailOpt,
      waOpt,
      smsOptOut: !sms,
      emailOptOut: !emailOpt,
      whatsappOptOut: !waOpt,
    });
  };

  // Solid Theme Tokens
  const cardBg = 'var(--card-bg)';
  const subCardBg = 'var(--card-inner, var(--background-2))';
  const borderCol = 'var(--input-border)';
  const inputBorder = 'var(--input-border)';
  const textCol = 'var(--foreground)';
  const labelCol = 'var(--foreground-2)';
  const mutedCol = 'var(--foreground-3)';
  const inputBg = 'var(--input-bg)';
  const brandBlue = '#2563eb';

  const inputStyle: React.CSSProperties = {
    padding: '9px 12px',
    borderRadius: '8px',
    border: `1px solid ${inputBorder}`,
    background: inputBg,
    color: textCol,
    fontSize: '0.85rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: 'var(--pc-neo-inset)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: labelCol,
    marginBottom: 4,
    display: 'block',
    fontWeight: 600,
  };

  const [isMobileScreen, setIsMobileScreen] = useState(false);

  useEffect(() => {
    const checkScreen = () => {
      setIsMobileScreen(typeof window !== 'undefined' && window.innerWidth < 640);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  const selectOptionStyle: React.CSSProperties = {
    background: cardBg,
    color: textCol,
  };

  const isSaveDisabled =
    patientMode === 'select' ? !selectedPatientId : !firstName.trim();

  const effectiveCentered = isCentered || isMobileScreen;
  const effectiveWidth = isMobileScreen ? 'calc(100vw - 24px)' : modalWidth;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100004,
          background: 'rgba(15, 23, 42, 0.6)',
        }}
        {...backdropDismiss}
      />
      <div
        ref={popoverRef}
        style={{
          position: effectiveCentered ? 'fixed' : 'absolute',
          left: effectiveCentered ? '50%' : computedLeft,
          top: effectiveCentered ? '50%' : computedTop,
          transform: effectiveCentered ? 'translate(-50%, -50%)' : 'none',
          width: effectiveWidth,
          maxWidth: '460px',
          background: cardBg,
          border: `1.5px solid ${borderCol}`,
          borderRadius: '14px',
          boxShadow: 'var(--pc-modal-shadow)',
          zIndex: 100005,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '15px 20px',
            borderBottom: `1px solid ${borderCol}`,
            background: subCardBg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: brandBlue,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                boxShadow: 'var(--pc-clay-primary)',
              }}
            >
              📅
            </div>
            <div>
              <div
                style={{
                  fontSize: '1.02rem',
                  fontWeight: 700,
                  color: textCol,
                  lineHeight: 1.2,
                }}
              >
                {title || 'Yeni Randevu'}
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: mutedCol,
                  marginTop: '2px',
                }}
              >
                Tarih: {defaultDate}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: inputBg,
              border: `1px solid ${borderCol}`,
              borderRadius: '6px',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: textCol,
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Top Mode Tabs: Hasta Randevu | Yeni Hasta Ekle */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 20px',
            borderBottom: `1px solid ${borderCol}`,
            background: subCardBg,
          }}
        >
          <button
            type="button"
            onClick={() => setPatientMode('select')}
            style={{
              flex: 1,
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              border:
                patientMode === 'select'
                  ? `1px solid ${brandBlue}`
                  : `1px solid ${borderCol}`,
              background: patientMode === 'select' ? brandBlue : cardBg,
              color: patientMode === 'select' ? '#ffffff' : textCol,
              boxShadow: patientMode === 'select' ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
              transition: 'all 0.15s ease',
            }}
          >
            Hasta Randevu
          </button>
          <button
            type="button"
            onClick={() => setPatientMode('create')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              border:
                patientMode === 'create'
                  ? `1px solid ${brandBlue}`
                  : `1px solid ${borderCol}`,
              background: patientMode === 'create' ? brandBlue : cardBg,
              color: patientMode === 'create' ? '#ffffff' : textCol,
              boxShadow: patientMode === 'create' ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus
              size={15}
              color={patientMode === 'create' ? '#ffffff' : 'currentColor'}
            />
            <span>Yeni Hasta Ekle</span>
          </button>
        </div>

        {/* Form Body */}
        <div
          style={{
            padding: '18px 20px',
            flex: 1,
            overflowY: 'auto',
            background: cardBg,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* PATIENT SELECTION OR FULL NEW PATIENT FORM */}
            <div
              style={{
                background: subCardBg,
                padding: '14px',
                borderRadius: '10px',
                border: `1px solid ${borderCol}`,
                boxShadow: 'var(--pc-neo-subcard)',
              }}
            >
              {patientMode === 'select' ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      color: textCol,
                      marginBottom: '2px',
                    }}
                  >
                    Hasta Seçimi
                  </div>

                  {!selectedPatientId ? (
                    <>
                      <div style={{ position: 'relative' }}>
                        <Search
                          size={16}
                          style={{
                            position: 'absolute',
                            left: 12,
                            top: 11,
                            color: mutedCol,
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Kayıtlı Hasta Ara (Ad veya Telefon)..."
                          value={patientSearchQuery}
                          onChange={(e) => setPatientSearchQuery(e.target.value)}
                          style={{ ...inputStyle, paddingLeft: '36px' }}
                        />
                      </div>

                      {/* Search list */}
                      <div
                        style={{
                          maxHeight: '180px',
                          overflowY: 'auto',
                          background: cardBg,
                          border: `1px solid ${borderCol}`,
                          borderRadius: '8px',
                          padding: '4px',
                        }}
                      >
                        {filteredPatients.map((p, idx) => (
                          <div
                            key={p.id || idx}
                            onClick={() => setSelectedPatientId(p.id)}
                            style={{
                              padding: '9px 12px',
                              cursor: 'pointer',
                              borderRadius: '6px',
                              marginBottom: '3px',
                              background: inputBg,
                              border: `1px solid ${borderCol}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = brandBlue;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = borderCol;
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                              }}
                            >
                              <div
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  background: brandBlue,
                                  color: '#ffffff',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {p.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: '0.86rem',
                                    color: textCol,
                                  }}
                                >
                                  {p.name}
                                </div>
                                {p.phone && (
                                  <div
                                    style={{
                                      fontSize: '0.74rem',
                                      color: mutedCol,
                                    }}
                                  >
                                    📞 {p.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                            <ChevronRight size={16} color={mutedCol} />
                          </div>
                        ))}
                        {filteredPatients.length === 0 && (
                          <div
                            style={{
                              padding: '14px',
                              textAlign: 'center',
                              fontSize: '0.84rem',
                              color: mutedCol,
                            }}
                          >
                            Eşleşen hasta bulunamadı. Üstteki &ldquo;Yeni Hasta Ekle&rdquo; sekmesinden yeni kayıt açabilirsiniz.
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: inputBg,
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: `1.5px solid ${brandBlue}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: brandBlue,
                            color: '#ffffff',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {selectedPatientObj?.name?.charAt(0).toUpperCase() || 'H'}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              color: textCol,
                            }}
                          >
                            {selectedPatientObj?.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: mutedCol }}>
                            {selectedPatientObj?.phone
                              ? `📞 ${selectedPatientObj.phone}`
                              : 'Kayıtlı Hasta'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedPatientId('')}
                        style={{
                          background: cardBg,
                          border: '1px solid var(--danger, #ef4444)',
                          color: 'var(--danger, #ef4444)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Değiştir
                      </button>
                    </div>
                  )}
                  {selectedPatientId && (
                    <div style={{ marginTop: 4 }}>
                      <PatientConsentPanel patientId={selectedPatientId} />
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '2px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        color: textCol,
                      }}
                    >
                      Yeni Hasta Bilgileri
                    </span>
                  </div>

                  {/* Ad & Soyad */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <label style={labelStyle}>
                        Ad <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Örn: Ahmet"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        style={inputStyle}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>
                        Soyad <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Örn: Yılmaz"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Telefon & TC Kimlik No */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Telefon</label>
                      <PhoneMaskedInput
                        placeholder="0 (5XX) XXX XX XX"
                        value={phone}
                        onValueChange={setPhone}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>TC Kimlik No</label>
                      <input
                        type="text"
                        maxLength={11}
                        placeholder="TC Kimlik No"
                        value={tc}
                        onChange={(e) => setTc(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* E-posta */}
                  <div>
                    <label style={labelStyle}>E-posta</label>
                    <input
                      type="email"
                      placeholder="ornek@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  {/* Cinsiyet & Doğum Tarihi */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Cinsiyet</label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="" style={selectOptionStyle}>
                          Seçiniz (İsteğe Bağlı)
                        </option>
                        <option value="Kadın" style={selectOptionStyle}>
                          Kadın
                        </option>
                        <option value="Erkek" style={selectOptionStyle}>
                          Erkek
                        </option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Doğum Tarihi</label>
                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Bildirim Onamı (KVKK) */}
                  <div style={{ marginTop: '2px' }}>
                    <PatientConsentPanel
                      patientId={createdPatientId || undefined}
                      onEnsurePatient={ensureCreatedPatient}
                      unsavedContact={{
                        phone,
                        email,
                        smsOptOut: !sms,
                        emailOptOut: !emailOpt,
                        whatsappOptOut: !waOpt,
                      }}
                      onContactChange={(contact) => {
                        if (contact.phone !== undefined && contact.phone !== null) setPhone(contact.phone);
                        if (contact.email !== undefined && contact.email !== null) setEmail(contact.email);
                      }}
                      onConsentChange={(nextOptOuts) => {
                        setSms(!nextOptOuts.smsOptOut);
                        setEmailOpt(!nextOptOuts.emailOptOut);
                        setWaOpt(!nextOptOuts.whatsappOptOut);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* DOCTOR SELECTION */}
            {(selectedPatientId || patientMode === 'create') && (
              <div
                style={{
                  background: subCardBg,
                  padding: '14px',
                  borderRadius: '10px',
                  border: `1px solid ${borderCol}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <label
                    style={{
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      color: textCol,
                    }}
                  >
                    Doktor Ataması
                  </label>
                  {!selectedDoctorId && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: '#f59e0b',
                        fontWeight: 700,
                      }}
                    >
                      ⚠️ Atanmadı
                    </span>
                  )}
                </div>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  style={{
                    ...inputStyle,
                    border: !selectedDoctorId
                      ? '1.5px solid #f59e0b'
                      : `1px solid ${inputBorder}`,
                    color: !selectedDoctorId ? '#f59e0b' : textCol,
                    fontWeight: !selectedDoctorId ? 600 : 400,
                  }}
                >
                  <option value="" style={selectOptionStyle}>
                    ⚠️ Doktor Seçiniz (Atama Bekliyor)
                  </option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id} style={selectOptionStyle}>
                      Dr. {d.name}
                    </option>
                  ))}
                </select>
                {!selectedDoctorId && (
                  <div
                    style={{
                      fontSize: '0.74rem',
                      color: '#f59e0b',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>
                      ℹ️ Doktor seçilmezse randevu &ldquo;Doktor Atanmadı&rdquo; uyarısıyla açılır.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* TIME SELECTION */}
            {(selectedPatientId || patientMode === 'create') && (
              <div
                style={{
                  background: subCardBg,
                  padding: '14px',
                  borderRadius: '10px',
                  border: `1px solid ${borderCol}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <label
                    style={{
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      color: textCol,
                    }}
                  >
                    Randevu Saati
                  </label>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: brandBlue,
                      fontWeight: 700,
                    }}
                  >
                    {defaultDate}
                  </span>
                </div>
                <FancyHourPicker range={timeRange} onChange={setTimeRange} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${borderCol}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            background: subCardBg,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: `1px solid ${borderCol}`,
              background: cardBg,
              color: textCol,
              cursor: 'pointer',
              fontSize: '0.86rem',
              fontWeight: 600,
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaveDisabled}
            style={{
              padding: '9px 24px',
              borderRadius: '8px',
              background: brandBlue,
              color: '#ffffff',
              border: 'none',
              cursor: isSaveDisabled ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '0.86rem',
              opacity: isSaveDisabled ? 0.5 : 1,
              boxShadow: isSaveDisabled ? 'none' : 'var(--pc-clay-primary)',
              transition: 'all 0.15s ease',
            }}
          >
            Kaydet
          </button>
        </div>
      </div>
    </>
  );
}
