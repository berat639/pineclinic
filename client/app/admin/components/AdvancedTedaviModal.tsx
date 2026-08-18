import React, { useState } from 'react';
import { BriefcaseMedical, X } from 'lucide-react';
import { ToothChip, UPPER_TEETH, LOWER_TEETH, inputStyle } from './ToothChip';
import DicomViewer from './DicomViewer';

export default function AdvancedTedaviModal({ selectedEvent, patientInfo, clinicId, doctors, onClose, onSaved }: any) {
  const [toothDrafts, setToothDrafts] = useState<Record<string, { id: string, name: string, price: number, indications: string[], doctorId: string | null }[]>>({})
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([])
  
  const [consultations, setConsultations] = useState<any[]>([])
  const [autocomplete, setAutocomplete] = useState<{ consultationNotes: string[], diseaseNotes: string[] }>({ consultationNotes: [], diseaseNotes: [] })
  const [newConsultation, setNewConsultation] = useState('')
  const [newDisease, setNewDisease] = useState('')

  React.useEffect(() => {
    fetch(`/api/dental/patients/${selectedEvent.patientId}/consultations`).then(r => r.json()).then(setConsultations).catch(()=>{});
    if (clinicId) {
      fetch(`/api/dental/clinics/${clinicId}/consultations/autocomplete`).then(r => r.json()).then(setAutocomplete).catch(()=>{});
    }
  }, [selectedEvent.patientId, clinicId]);
  const [procTemplates, setProcTemplates] = useState<any[]>([
    { name: 'Kompozit Dolgu (Tek Yüzey)', price: 1200 },
    { name: 'Kanal Tedavisi (Tek Kanal)', price: 3500 },
    { name: 'Diş Çekimi', price: 800 },
    { name: 'İmplant (Yerli)', price: 8000 },
    { name: 'Zirkonyum Kuron', price: 5000 },
  ])
  const [indTemplates, setIndTemplates] = useState<string[]>([
    'Derin Çürük', 'Kırık Diş', 'Eksik Diş', 'Estetik Bozukluk', 'Kök Ucu İltihabı'
  ])
  
  const [newTemplateType, setNewTemplateType] = useState<'procedure'|'indication'>('procedure')
  const [newTemplateInput, setNewTemplateInput] = useState('')
  const [newTemplatePrice, setNewTemplatePrice] = useState<number>(0)
  
  const [treatmentDcmFile, setTreatmentDcmFile] = useState<File | null>(null)
  
  const [discount, setDiscount] = useState<number>(0)
  const [discountType, setDiscountType] = useState<'amount'|'percentage'>('percentage')
  
  const [isPeriodic, setIsPeriodic] = useState(false)
  const [periodDays, setPeriodDays] = useState<number>(180)
  const [notifyPatient, setNotifyPatient] = useState(false)
  const [notificationType, setNotificationType] = useState('sms')
  const [missingPhone, setMissingPhone] = useState('')
  const [missingEmail, setMissingEmail] = useState('')

  const handleToothClick = (n: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      setSelectedTeeth(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
    } else {
      setSelectedTeeth(prev => prev.includes(n) && prev.length === 1 ? [] : [n]);
    }
  }

  const handleSave = async () => {
    if (Object.keys(toothDrafts).length === 0) {
      alert('Lütfen önce dişlere işlem veya endikasyon atayın.');
      return;
    }

    const hasMissingProc = Object.values(toothDrafts).some(drafts => drafts.some(p => p.name === 'Belirtilmedi'));
    if (hasMissingProc) {
      if (!confirm('Bazı dişlere sadece endikasyon atanmış (işlem adı yok). Yine de devam etmek istiyor musunuz?')) return;
    }
    
    const isPhoneMissing = notifyPatient && (notificationType === 'sms' || notificationType === 'both') && !patientInfo?.phone
    const isEmailMissing = notifyPatient && (notificationType === 'email' || notificationType === 'both') && !patientInfo?.email

    if (isPhoneMissing && !missingPhone.trim()) {
      alert('Lütfen eksik olan telefon numarasını giriniz.');
      return;
    }
    if (isEmailMissing && !missingEmail.trim()) {
      alert('Lütfen eksik olan e-posta adresini giriniz.');
      return;
    }

    if (notifyPatient && (missingPhone.trim() || missingEmail.trim())) {
      try {
        await fetch(`/api/dental/patients/${selectedEvent.patientId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: missingPhone.trim() || undefined,
            email: missingEmail.trim() || undefined
          })
        })
      } catch (err) {}
    }
    
    let nextNotificationDate: string | undefined = undefined
    if (isPeriodic && notifyPatient) {
      const d = new Date()
      d.setDate(d.getDate() + periodDays)
      nextNotificationDate = d.toISOString().slice(0, 10)
    }
    
    const subtotal = Object.values(toothDrafts).reduce((sum, drafts) => sum + drafts.reduce((s, p) => s + p.price, 0), 0);
    
    let actualDiscount = 0;
    if (discountType === 'percentage') {
      actualDiscount = subtotal * (Math.min(100, discount) / 100);
    } else {
      actualDiscount = Math.min(discount, subtotal); 
    }
    
    const discountFactor = subtotal > 0 ? (subtotal - actualDiscount) / subtotal : 1;

    let uploadedDcmUrl = undefined;
    if (treatmentDcmFile) {
      const formData = new FormData();
      formData.append('file', treatmentDcmFile);
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const uploadRes = await fetch(`${baseUrl}/api/dental/upload-dcm`, {
          method: 'POST',
          body: formData
        });
        if (uploadRes.ok) {
          const upData = await uploadRes.json();
          uploadedDcmUrl = upData.url;
        } else {
          const errText = await uploadRes.text();
          console.error('DCM Upload Error:', errText);
          alert(`Röntgen dosyası yüklenemedi (Sunucu Hatası): ${errText}`);
          return;
        }
      } catch (e: any) {
        console.error('DCM Upload Catch Error:', e);
        alert(`Röntgen yüklenirken ağ hatası oluştu: ${e.message}`);
        return;
      }
    }

    try {
      for (const [tooth, procedures] of Object.entries(toothDrafts)) {
        for (const proc of procedures) {
          const toothOriginalPrice = proc.price;
          const toothFinalPrice = Math.round(toothOriginalPrice * discountFactor);
          
          const res = await fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              procedureName: proc.name, 
              toothNumber: tooth, 
              indication: proc.indications.length > 0 ? proc.indications.join(', ') : undefined, 
              cost: toothFinalPrice, 
              doctorId: proc.doctorId || selectedEvent.doctorId,
              status: 'planned',
              dcmUrl: uploadedDcmUrl,
              isPeriodic,
              periodDays,
              notifyPatient,
              notificationType,
              nextNotificationDate,
              clinicId: clinicId || undefined
            })
          });
          if (!res.ok) {
            console.error('Kayıt hatası:', await res.text());
            throw new Error('Kayıt başarısız');
          }
        }
      }
      onSaved();
    } catch (error) {
      console.error(error);
      alert('Kayıt sırasında bir hata oluştu.');
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--background)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, width: '95%', maxWidth: 1200, maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--foreground)' }}>Tedavi Planı Oluştur</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 24, flex: 1, overflow: 'hidden' }}>
          
          {/* LEFT COLUMN */}
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', paddingRight: 8 }}>
            
            {/* DICOM Viewer Upload Block */}
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12 }}>
                Genel Tedavi Röntgeni Yükle (.dcm)
              </div>
              
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                <label style={{ display: 'inline-block', cursor: 'pointer', padding: '6px 16px', background: 'var(--accent)', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
                  Dosya Seç
                  <input type="file" accept=".dcm" style={{ display: 'none' }} onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && file.size > 20 * 1024 * 1024) {
                      alert('Dosya boyutu 20 MB\'dan büyük olamaz');
                      e.target.value = '';
                      return;
                    }
                    if (file) setTreatmentDcmFile(file);
                  }} />
                </label>
                {treatmentDcmFile && (
                  <>
                    <div style={{ background: 'var(--accent)20', color: 'var(--accent)', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid var(--accent)40' }}>
                      {treatmentDcmFile.name}
                    </div>
                    <button onClick={() => setTreatmentDcmFile(null)} style={{ background: 'var(--danger)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Sil
                    </button>
                  </>
                )}
              </div>

              {treatmentDcmFile && (
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--glass-border)', position: 'relative' }}>
                  <div style={{ background: 'var(--background)', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', borderBottom: '1px solid var(--glass-border)' }}>DICOM Görüntü</div>
                  <div style={{ height: 400, position: 'relative' }}>
                    <DicomViewer dcmUrl={URL.createObjectURL(treatmentDcmFile)} isModal={false} />
                  </div>
                </div>
              )}
            </div>
            
            {/* Consultations Block */}
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12 }}>Konsültasyon ve Hastalık Notu</div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <input 
                  type="text" 
                  value={newConsultation} 
                  onChange={e => setNewConsultation(e.target.value)} 
                  placeholder="Konsültasyon Notu" 
                  list="consultationNotes"
                  style={{ ...inputStyle, width: '100%' }} 
                />
                <datalist id="consultationNotes">
                  {autocomplete.consultationNotes.map((n, i) => <option key={i} value={n} />)}
                </datalist>
                
                <input 
                  type="text" 
                  value={newDisease} 
                  onChange={e => setNewDisease(e.target.value)} 
                  placeholder="Hastalık Notu (Konsültasyon girmeden eklenemez)" 
                  list="diseaseNotes"
                  disabled={!newConsultation.trim()}
                  style={{ ...inputStyle, width: '100%', opacity: !newConsultation.trim() ? 0.5 : 1 }} 
                />
                <datalist id="diseaseNotes">
                  {autocomplete.diseaseNotes.map((n, i) => <option key={i} value={n} />)}
                </datalist>
                
                <button 
                  disabled={!newConsultation.trim()}
                  onClick={async () => {
                    const res = await fetch(`/api/dental/patients/${selectedEvent.patientId}/consultations`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ clinicId, doctorId: selectedEvent.doctorId, consultationNote: newConsultation.trim(), diseaseNote: newDisease.trim() })
                    });
                    if (res.ok) {
                      const updated = await fetch(`/api/dental/patients/${selectedEvent.patientId}/consultations`).then(r => r.json());
                      setConsultations(updated);
                      setNewConsultation('');
                      setNewDisease('');
                    }
                  }}
                  style={{ padding: '8px', background: 'var(--accent)', color: '#fff', borderRadius: 6, border: 'none', cursor: 'pointer', opacity: !newConsultation.trim() ? 0.5 : 1 }}
                >
                  Konsültasyon Ekle
                </button>
              </div>

              {consultations.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: 6, background: 'rgba(0,0,0,0.1)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                    <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <tr>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--glass-border)' }}>Tarih</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--glass-border)' }}>Konsültasyon</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--glass-border)' }}>Hastalık</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consultations.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                          <td style={{ padding: '6px 8px' }}>{new Date(c.createdAt).toLocaleDateString('tr-TR')}</td>
                          <td style={{ padding: '6px 8px' }}>{c.consultationNote}</td>
                          <td style={{ padding: '6px 8px' }}>{c.diseaseNote || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Odontogram */}
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: 12, color: 'var(--foreground-3)', marginBottom: 12, textAlign: 'center', fontWeight: 500 }}>Hedef Dişleri Seçin veya İşlemi Üzerine Sürükleyin</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                  {UPPER_TEETH.map(n => (
                    <ToothChip 
                      key={n} number={n} 
                      selected={selectedTeeth.length === 1 && selectedTeeth[0] === n} 
                      multiSelected={selectedTeeth.includes(n)}
                      hasDraft={!!toothDrafts[String(n)]}
                      onClick={(e: React.MouseEvent) => handleToothClick(n, e)}
                      onDragOver={(e: React.DragEvent) => e.preventDefault()}
                      onDrop={(e: React.DragEvent) => {
                        e.preventDefault();
                        const type = e.dataTransfer.getData("type");
                        const val = e.dataTransfer.getData("value");
                        if (!val) return;
                        const targets = selectedTeeth.includes(n) ? selectedTeeth : [n];
                        setToothDrafts(prev => {
                          const next = { ...prev };
                          targets.forEach(t => {
                            const tk = String(t);
                            if (!next[tk]) next[tk] = [];
                            if (type === 'procedure') {
                              const parsed = JSON.parse(val);
                              next[tk].push({
                                id: Math.random().toString(36).substring(7),
                                name: parsed.name,
                                price: parsed.price,
                                indications: [],
                                doctorId: selectedEvent?.doctorId || null
                              });
                            } else if (type === 'indication') {
                              if (next[tk].length === 0) {
                                next[tk].push({ id: Math.random().toString(36).substring(7), name: 'Belirtilmedi', price: 0, indications: [val], doctorId: selectedEvent?.doctorId || null });
                              } else {
                                const last = next[tk][next[tk].length - 1];
                                if (!last.indications.includes(val)) last.indications.push(val);
                              }
                            }
                          });
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
                <div style={{ height: 1, background: 'var(--glass-border)', margin: '0 4px' }} />
                <div style={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                  {LOWER_TEETH.map(n => (
                    <ToothChip 
                      key={n} number={n} 
                      selected={selectedTeeth.length === 1 && selectedTeeth[0] === n} 
                      multiSelected={selectedTeeth.includes(n)}
                      hasDraft={!!toothDrafts[String(n)]}
                      onClick={(e: React.MouseEvent) => handleToothClick(n, e)}
                      onDragOver={(e: React.DragEvent) => e.preventDefault()}
                      onDrop={(e: React.DragEvent) => {
                        e.preventDefault();
                        const type = e.dataTransfer.getData("type");
                        const val = e.dataTransfer.getData("value");
                        if (!val) return;
                        const targets = selectedTeeth.includes(n) ? selectedTeeth : [n];
                        setToothDrafts(prev => {
                          const next = { ...prev };
                          targets.forEach(t => {
                            const tk = String(t);
                            if (!next[tk]) next[tk] = [];
                            if (type === 'procedure') {
                              const parsed = JSON.parse(val);
                              next[tk].push({
                                id: Math.random().toString(36).substring(7),
                                name: parsed.name,
                                price: parsed.price,
                                indications: [],
                                doctorId: selectedEvent?.doctorId || null
                              });
                            } else if (type === 'indication') {
                              if (next[tk].length === 0) {
                                next[tk].push({ id: Math.random().toString(36).substring(7), name: 'Belirtilmedi', price: 0, indications: [val], doctorId: selectedEvent?.doctorId || null });
                              } else {
                                const last = next[tk][next[tk].length - 1];
                                if (!last.indications.includes(val)) last.indications.push(val);
                              }
                            }
                          });
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Templates Pool */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  Sık Kullanılan İşlemler <span style={{ fontSize: 10, color: 'var(--foreground-3)', fontWeight: 400 }}>(Sürükle bırak)</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {procTemplates.map((proc, i) => (
                    <div key={i} draggable onDragStart={(e) => { e.dataTransfer.setData("type", "procedure"); e.dataTransfer.setData("value", JSON.stringify(proc)); }} style={{ padding: '6px 12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, fontSize: '0.8rem', color: 'var(--foreground)', cursor: 'grab', display: 'flex', gap: 4 }}>
                      {proc.name} <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>{proc.price}₺</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  Sık Kullanılan Endikasyonlar <span style={{ fontSize: 10, color: 'var(--foreground-3)', fontWeight: 400 }}>(Sürükle bırak)</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {indTemplates.map((ind, i) => (
                    <div key={i} draggable onDragStart={(e) => { e.dataTransfer.setData("type", "indication"); e.dataTransfer.setData("value", ind); }} style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, fontSize: '0.8rem', color: '#ef4444', cursor: 'grab' }}>
                      {ind}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Yeni Şablon Ekleme */}
              <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px dashed var(--glass-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 8 }}>Yeni Şablon Ekle</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={newTemplateType} onChange={e => setNewTemplateType(e.target.value as 'procedure'|'indication')} style={{ ...inputStyle, width: 100, padding: '6px', fontSize: '0.8rem' }}>
                    <option value="procedure">İşlem</option>
                    <option value="indication">Endikasyon</option>
                  </select>
                  <input type="text" value={newTemplateInput} onChange={e => setNewTemplateInput(e.target.value)} placeholder="Şablon Adı" style={{ ...inputStyle, flex: 1, padding: '6px', fontSize: '0.8rem' }} />
                  {newTemplateType === 'procedure' && (
                    <input type="number" value={newTemplatePrice || ''} onChange={e => setNewTemplatePrice(Number(e.target.value))} placeholder="Fiyat" style={{ ...inputStyle, width: 80, padding: '6px', fontSize: '0.8rem' }} />
                  )}
                  <button onClick={() => {
                    if (!newTemplateInput.trim()) return;
                    if (newTemplateType === 'procedure') {
                      setProcTemplates(prev => [...prev, { name: newTemplateInput.trim(), price: newTemplatePrice }]);
                    } else {
                      setIndTemplates(prev => Array.from(new Set([...prev, newTemplateInput.trim()])));
                    }
                    setNewTemplateInput(''); setNewTemplatePrice(0);
                  }} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>Ekle</button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, borderLeft: '1px solid var(--glass-border)', paddingLeft: 24, overflowY: 'auto' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                🛒 Atanan İşlemler
                {Object.keys(toothDrafts).length > 0 && <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10 }}>{Object.keys(toothDrafts).length} Diş</span>}
              </div>
              
              {Object.keys(toothDrafts).length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground-3)', fontSize: '0.85rem', textAlign: 'center', padding: 20 }}>
                  <BriefcaseMedical size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                  İşlem ve endikasyon şablonlarını dişlerin üzerine sürükleyip bırakarak sepetinize ekleyin.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: 8, background: 'var(--glass-bg)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                      <thead style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--foreground-2)' }}>
                        <tr>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)' }}>Diş</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)' }}>İşlem</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)' }}>Endikasyon</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)' }}>Doktor</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)', width: 80, textAlign: 'right' }}>Ücret</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)', width: 30, textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(toothDrafts).map(([tooth, drafts]) => (
                          drafts.map((proc) => (
                            <tr key={`${tooth}-${proc.id}`} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--accent)' }}>#{tooth}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--foreground)' }}>{proc.name}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--foreground)' }}>
                                {proc.indications.length > 0 ? proc.indications.join(', ') : <span style={{ color: 'var(--foreground-3)' }}>-</span>}
                              </td>
                              <td style={{ padding: '8px 12px', color: 'var(--foreground)' }}>
                                <select 
                                  value={proc.doctorId || ''} 
                                  onChange={e => {
                                    setToothDrafts(prev => {
                                      const next = { ...prev };
                                      const tDraft = next[tooth].find(x => x.id === proc.id);
                                      if (tDraft) tDraft.doctorId = e.target.value;
                                      return next;
                                    });
                                  }}
                                  style={{ ...inputStyle, padding: '2px 4px', fontSize: '0.75rem', maxWidth: 120 }}
                                >
                                  <option value="">Randevu Doktoru</option>
                                  {doctors?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>{proc.price} ₺</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <button onClick={() => {
                                  setToothDrafts(prev => {
                                    const next = { ...prev };
                                    next[tooth] = next[tooth].filter(x => x.id !== proc.id);
                                    if (next[tooth].length === 0) delete next[tooth];
                                    return next;
                                  });
                                }} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
                              </td>
                            </tr>
                          ))
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Financial Summary */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: 250, padding: 16, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--foreground-2)' }}>
                        <span>Ara Toplam:</span>
                        <span>{Object.values(toothDrafts).reduce((sum, drafts) => sum + drafts.reduce((s, p) => s + p.price, 0), 0)} ₺</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--foreground-2)' }}>
                        <span>İskonto:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 120 }}>
                          <input type="number" value={discount || ''} onChange={e => setDiscount(Number(e.target.value))} placeholder="0" style={{ ...inputStyle, width: '100%', padding: '4px 8px', fontSize: '0.8rem', textAlign: 'right' }} />
                          <select value={discountType} onChange={e => setDiscountType(e.target.value as 'amount'|'percentage')} style={{ ...inputStyle, padding: '4px', fontSize: '0.8rem', background: 'var(--glass-bg)', border: 'none', cursor: 'pointer' }}>
                            <option value="amount">₺</option>
                            <option value="percentage">%</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ height: 1, background: 'var(--glass-border)' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                        <span>Genel Toplam:</span>
                        <span>{Math.max(0, Object.values(toothDrafts).reduce((sum, drafts) => sum + drafts.reduce((s, p) => s + p.price, 0), 0) - (discountType === 'percentage' ? (Object.values(toothDrafts).reduce((sum, drafts) => sum + drafts.reduce((s, p) => s + p.price, 0), 0) * (discount / 100)) : discount))} ₺</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--foreground-2)', cursor: 'pointer', marginBottom: isPeriodic ? 12 : 0 }}>
                <input type="checkbox" checked={isPeriodic} onChange={e => setIsPeriodic(e.target.checked)} />
                Bu periyodik bir işlem mi? (Kontrol/Tekrar)
              </label>
              
              {isPeriodic && (
                <div style={{ padding: 12, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Hatırlatma Periyodu</label>
                    <select value={periodDays} onChange={e => setPeriodDays(Number(e.target.value))} style={{ ...inputStyle, width: '100%', fontSize: '0.8rem', padding: '6px' }}>
                      <option value={30}>1 Ay Sonra</option>
                      <option value={90}>3 Ay Sonra</option>
                      <option value={180}>6 Ay Sonra</option>
                      <option value={365}>1 Yıl Sonra</option>
                    </select>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--foreground-2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={notifyPatient} onChange={e => setNotifyPatient(e.target.checked)} />
                    Zamanı gelince bildirim yapılsın
                  </label>

                  {notifyPatient && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>Bildirim Yöntemi</label>
                      <select value={notificationType} onChange={e => setNotificationType(e.target.value)} style={{ ...inputStyle, width: '100%', fontSize: '0.8rem', padding: '6px' }}>
                        <option value="sms">Sadece SMS</option>
                        <option value="email">Sadece E-posta</option>
                        <option value="both">İkisi de</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer', fontWeight: 600 }}>İptal</button>
                <button onClick={handleSave} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Kaydet</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
