import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { BriefcaseMedical, X, Pencil, Trash2, Plus } from 'lucide-react';
import { ToothChip, UPPER_TEETH, LOWER_TEETH, inputStyle } from './ToothChip';
import DicomViewer from './DicomViewer';
import ConfirmModal from './ConfirmModal';

export default function AdvancedTedaviModal({ selectedEvent, patientInfo, clinicId, doctors, shifts = [], onClose, onSaved, editingGroup }: any) {
  const [toothDrafts, setToothDrafts] = useState<Record<string, { id: string, name: string, price: number, indications: string[], doctorId: string | null, materials: any[], color?: string }[]>>({})
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([])

  const [consultations, setConsultations] = useState<any[]>([])
  const [autocomplete, setAutocomplete] = useState<{ consultationNotes: string[], diseaseNotes: string[] }>({ consultationNotes: [], diseaseNotes: [] })
  const [newConsultation, setNewConsultation] = useState('')
  const [newDisease, setNewDisease] = useState('')
  const [inventory, setInventory] = useState<any[]>([])
  const [editingConsultationId, setEditingConsultationId] = useState<string | null>(null)
  const [editingConsultationDate, setEditingConsultationDate] = useState<string>('')

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Evet, Sil',
    variant: 'danger',
    onConfirm: () => {}
  });

  React.useEffect(() => {
    fetch(`/api/dental/patients/${selectedEvent.patientId}/consultations`).then(r => r.json()).then(setConsultations).catch(() => { });
    fetch(`/api/dental/inventory`).then(r => r.json()).then(setInventory).catch(() => { });
    if (clinicId) {
      fetch(`/api/dental/clinics/${clinicId}/consultations/autocomplete`).then(r => r.json()).then(setAutocomplete).catch(() => { });
    }
  }, [selectedEvent.patientId, clinicId]);

  const [groupName, setGroupName] = useState<string>(editingGroup ? editingGroup.name : `Tedavi Planı - ${new Date().toLocaleDateString('tr-TR')}`);

  const [procTemplates, setProcTemplates] = useState<any[]>([
    { name: 'Kompozit Dolgu (Tek Yüzey)', price: 1200, color: '#3b82f6' },
    { name: 'Kanal Tedavisi (Tek Kanal)', price: 3500, color: '#ec4899' },
    { name: 'Diş Çekimi', price: 800, color: '#ef4444' },
    { name: 'İmplant (Yerli)', price: 8000, color: '#06b6d4' },
    { name: 'Zirkonyum Kuron', price: 5000, color: '#f59e0b' },
  ])

  useEffect(() => {
    if (editingGroup && editingGroup.treatments) {
      const drafts: any = {};
      const teethSet = new Set<number>();
      editingGroup.treatments.forEach((t: any) => {
        const toothStr = String(t.toothNumber || 'general');
        if (t.toothNumber) teethSet.add(Number(t.toothNumber));
        if (!drafts[toothStr]) drafts[toothStr] = [];
        const matchedProc = procTemplates.find(p => p.name === t.procedureName);
        drafts[toothStr].push({
          id: t.id || Date.now().toString(),
          name: t.procedureName,
          price: t.cost,
          indications: t.indication ? [t.indication] : [],
          doctorId: t.doctorId || null,
          materials: [],
          color: matchedProc ? matchedProc.color : undefined
        });
        if (t.dcmUrl) {
          // Can't restore File object, but we can potentially display it. 
          // For now, we will handle existing dicom by not overwriting unless a new one is selected.
        }
      });
      setToothDrafts(drafts);
      setSelectedTeeth(Array.from(teethSet));
    }
  }, [editingGroup]);
  const [indTemplates, setIndTemplates] = useState<string[]>([
    'Çürük', 'Kırık', 'Eksik Diş', 'Enfeksiyon', 'Kanal Yenileme', 'Estetik',
  ])
  const [editingTemplate, setEditingTemplate] = useState<{ type: 'procedure' | 'indication', index: number } | null>(null)
  const [newTemplateType, setNewTemplateType] = useState<'procedure' | 'indication'>('procedure')
  const [newTemplateInput, setNewTemplateInput] = useState('')
  const [newTemplatePrice, setNewTemplatePrice] = useState<number>(0)
  const [newTemplateMaterials, setNewTemplateMaterials] = useState<any[]>([])
  const [newTemplateColor, setNewTemplateColor] = useState('#3b82f6')

  const [treatmentDcmFile, setTreatmentDcmFile] = useState<File | null>(null)

  const [discount, setDiscount] = useState<number>(0)
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('percentage')

  const [isPeriodic, setIsPeriodic] = useState(false)
  const [periodDays, setPeriodDays] = useState<number>(180)
  const [notifyPatient, setNotifyPatient] = useState(false)
  const [notificationType, setNotificationType] = useState('sms')
  const [missingPhone, setMissingPhone] = useState('')
  const [missingEmail, setMissingEmail] = useState('')

  const [lastSelectedTooth, setLastSelectedTooth] = useState<number | null>(null)

  const [selectedTemplates, setSelectedTemplates] = useState<{ procedures: number[], indications: number[] }>({ procedures: [], indications: [] });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, teeth: number[] } | null>(null);

  const [selectedToothForDetails, setSelectedToothForDetails] = useState<string | null>(null);

  const [defaultDoctorId, setDefaultDoctorId] = useState<string | null>(null);
  const [activeSelectionMaterials, setActiveSelectionMaterials] = useState<any[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  const handleToothClick = (n: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedTooth !== null) {
      // Range selection
      const allTeeth = [...UPPER_TEETH, ...LOWER_TEETH]
      const startIdx = allTeeth.indexOf(lastSelectedTooth)
      const endIdx = allTeeth.indexOf(n)
      if (startIdx !== -1 && endIdx !== -1) {
        const minIdx = Math.min(startIdx, endIdx)
        const maxIdx = Math.max(startIdx, endIdx)
        const range = allTeeth.slice(minIdx, maxIdx + 1)

        setSelectedTeeth(prev => {
          const isAdding = prev.includes(lastSelectedTooth);
          if (isAdding) {
            return Array.from(new Set([...prev, ...range]));
          } else {
            return prev.filter(t => !range.includes(t));
          }
        })
      }
    } else {
      // Normal click: Toggle the tooth without clearing others (user friendly for touch/mouse)
      setSelectedTeeth(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
    }

    if (!e.shiftKey) {
      setLastSelectedTooth(n)
    }
  }

  const handlePrint = () => {
    const subtotal = Object.values(toothDrafts).reduce((sum, drafts) => sum + drafts.reduce((s, p) => s + p.price, 0), 0);
    const actualDiscount = discountType === 'percentage' ? subtotal * (Math.min(100, discount) / 100) : Math.min(discount, subtotal);
    const total = subtotal - actualDiscount;

    let rowsHtml = '';
    Object.entries(toothDrafts).forEach(([tooth, procedures]) => {
      procedures.forEach(p => {
        rowsHtml += `
          <tr>
            <td style="padding: 4px 8px; border-bottom: 1px solid #ddd; font-weight: 600; font-size: 12px;">Diş ${tooth}</td>
            <td style="padding: 4px 8px; border-bottom: 1px solid #ddd; font-size: 12px;">${p.name} ${p.indications.length > 0 ? `<br><small style="color: #666;">(${p.indications.join(', ')})</small>` : ''}</td>
            <td style="padding: 4px 8px; border-bottom: 1px solid #ddd; text-align: right; font-size: 12px;">${p.price} ₺</td>
          </tr>
        `;
      });
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Yazdırma penceresi açılamadı. Lütfen tarayıcınızın pop-up engelleyicisini kapatın.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tedavi Planı Özeti</title>
        <style>
          @media print {
            @page { margin: 1cm; size: A4 portrait; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; font-size: 12px; }
            tr, .summary-container { page-break-inside: avoid; break-inside: avoid; }
          }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #111; max-width: 800px; margin: 0 auto; line-height: 1.3; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
          h1 { color: #1e3a8a; margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px; }
          .date { color: #64748b; font-size: 12px; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          tr { page-break-inside: avoid; break-inside: avoid; }
          th { background-color: #f1f5f9; padding: 6px 8px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #334155; font-weight: 700; font-size: 12px; }
          .summary-container { display: flex; justify-content: flex-end; page-break-inside: avoid; break-inside: avoid; }
          .summary-table { width: 300px; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; overflow: hidden; }
          .summary-table td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
          .summary-table .label { color: #475569; font-weight: 500; }
          .summary-table .value { text-align: right; font-weight: 600; color: #0f172a; }
          .summary-table .discount-row td { color: #ef4444; }
          .summary-table .discount-row .value { color: #ef4444; }
          .summary-table .total-row { background-color: #3b82f6; color: white; }
          .summary-table .total-row td { border-bottom: none; }
          .summary-table .total-row .label { color: white; font-weight: 600; font-size: 14px; }
          .summary-table .total-row .value { color: white; font-weight: 700; font-size: 15px; }
          .footer { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Tedavi Planı Özeti</h1>
          <div class="date">Tarih: ${new Date().toLocaleDateString('tr-TR')}</div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="width: 15%">Diş</th>
              <th style="width: 60%">İşlem / Endikasyon</th>
              <th style="width: 25%; text-align: right;">Tutar</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="3" style="text-align:center; padding: 30px; color: #64748b;">Atanan işlem bulunmamaktadır.</td></tr>'}
          </tbody>
        </table>
        
        <div class="summary-container">
          <table class="summary-table">
            <tr>
              <td class="label">Ara Toplam:</td>
              <td class="value">${subtotal} ₺</td>
            </tr>
            ${actualDiscount > 0 ? `
            <tr class="discount-row">
              <td class="label">İskonto:</td>
              <td class="value">-${actualDiscount.toFixed(2)} ₺</td>
            </tr>
            ` : ''}
            <tr class="total-row">
              <td class="label">Genel Toplam:</td>
              <td class="value">${total.toFixed(2)} ₺</td>
            </tr>
          </table>
        </div>
        
        <div class="footer">
          Bu belge bilgilendirme amaçlıdır.
        </div>
        
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }, 300);
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const listenTimeoutRef = useRef<any>(null);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
      setIsListening(false);
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast.error("Tarayıcınız ses tanıma özelliğini desteklemiyor. Lütfen Chrome kullanın.");
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = 'tr-TR';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true; // Keep listening until stopped manually

      recognition.onstart = () => {
        setIsListening(true);
        setTranscript("Dinliyorum...");
        listenTimeoutRef.current = setTimeout(() => {
          if (recognitionRef.current) recognitionRef.current.stop();
          setIsListening(false);
          setTranscript("Zaman aşımı (20sn). Lütfen tekrar deneyin.");
          setTimeout(() => setTranscript(""), 2000);
        }, 20000);
      };

      recognition.onresult = (event: any) => {
        const currentTranscript = event.results[event.results.length - 1][0].transcript;
        setTranscript(currentTranscript);
        if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
        listenTimeoutRef.current = setTimeout(() => {
          if (recognitionRef.current) recognitionRef.current.stop();
          setIsListening(false);
        }, 20000);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
        setIsListening(false);
        setTranscript("Hata: " + event.error);
        setTimeout(() => setTranscript(""), 2000);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
        // Process final transcript if it's not just "Dinliyorum..."
        setTranscript((prev) => {
          if (prev && prev !== "Dinliyorum..." && !prev.startsWith("Hata:") && !prev.startsWith("Zaman")) {
            processAICommand(prev);
          }
          return "";
        });
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error(err);
      toast.error("Ses tanıma başlatılamadı.");
    }
  };

  const processAICommand = async (text: string) => {
    try {
      setTranscript("Analiz ediliyor...");
      const res = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          procNames: procTemplates.map(p => p.name),
          indNames: indTemplates
        })
      });
      const data = await res.json();
      if (data.result) {
        const { globalIntent, treatments } = data.result;

        if (globalIntent === 'CONFIRM') {
          handleSave();
          return;
        }

        if (treatments && treatments.length > 0) {
          setToothDrafts(prev => {
            const next = { ...prev };
            treatments.forEach((t: any) => {
              if (t.intent === 'DELETE') {
                t.toothNumbers.forEach((tn: string) => {
                  if (t.procedureName) {
                    next[tn] = next[tn]?.filter(x => x.name !== t.procedureName) || [];
                  } else {
                    next[tn] = []; // Clear all
                  }
                });
              } else if (t.intent === 'ADD') {
                t.toothNumbers.forEach((tn: string) => {
                  next[tn] = next[tn] || [];
                  if (t.procedureName) {
                    const procTemp = procTemplates.find(p => p.name.toLowerCase() === t.procedureName.toLowerCase());
                    if (procTemp) {
                      // Avoid duplicates
                      const exists = next[tn].find(x => x.name === procTemp.name);
                      if (!exists) {
                        next[tn].push({
                          id: Math.random().toString(36).substr(2, 9),
                          name: procTemp.name,
                          price: procTemp.price || 0,
                          indications: t.indication ? [indTemplates.find(i => i.toLowerCase() === t.indication?.toLowerCase())].filter(Boolean) as any[] : [],
                          doctorId: defaultDoctorId,
                          materials: procTemp.materials || []
                        });
                      }
                    }
                  } else if (t.indication) {
                    // Add indication to existing procedures
                    if (next[tn].length > 0) {
                      const indTemp = indTemplates.find(i => i.toLowerCase() === t.indication?.toLowerCase());
                      if (indTemp) {
                        next[tn][next[tn].length - 1].indications.push(indTemp);
                      }
                    }
                  }
                });
              }
            });
            return next;
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTranscript("");
    }
  };

  const handleSave = async () => {
    if (Object.keys(toothDrafts).length === 0) {
      toast.error('Lütfen önce dişlere işlem veya endikasyon atayın.');
      return;
    }

    // Vardiya Kontrolü
    if (selectedEvent?.startTime) {
      const apptDateStr = new Date(selectedEvent.startTime).toLocaleDateString('sv');
      const startMin = new Date(selectedEvent.startTime).getHours() * 60 + new Date(selectedEvent.startTime).getMinutes();
      
      for (const drafts of Object.values(toothDrafts)) {
        for (const proc of drafts) {
          const docId = proc.doctorId || defaultDoctorId || selectedEvent?.doctorId;
          if (docId) {
            const docShifts = (shifts || []).filter((s: any) => s.userId === docId && s.date === apptDateStr);
            const docObj = doctors.find((d: any) => d.id === docId);
            const docName = docObj?.name || 'Seçilen hekim';

            if (docShifts.length === 0) {
              toast.error(`⚠️ ${docName} için bu tarihte (${apptDateStr}) tanımlı vardiya bulunmuyor! Lütfen vardiyası olan bir hekim seçin.`);
              return;
            }

            const isCovered = docShifts.some((s: any) => {
              const [sH, sM] = (s.startTime || '00:00').split(':').map(Number);
              const [eH, eM] = (s.endTime || '23:59').split(':').map(Number);
              return startMin >= (sH * 60 + (sM || 0)) && startMin <= (eH * 60 + (eM || 0));
            });

            if (!isCovered) {
              const shiftRanges = docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ');
              toast.error(`⚠️ Randevu saati (${new Date(selectedEvent.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}) ${docName} vardiya saatleri (${shiftRanges}) dışındadır!`);
              return;
            }
          }
        }
      }
    }

    const hasMissingProc = Object.values(toothDrafts).some(drafts => drafts.some(p => p.name === 'Belirtilmedi'));
    if (hasMissingProc) {
      if (!confirm('Bazı dişlere sadece endikasyon atanmış (işlem adı yok). Yine de devam etmek istiyor musunuz?')) return;
    }

    const isPhoneMissing = notifyPatient && (notificationType === 'sms' || notificationType === 'whatsapp' || notificationType === 'both') && !patientInfo?.phone
    const isEmailMissing = notifyPatient && (notificationType === 'email' || notificationType === 'both') && !patientInfo?.email

    if (isPhoneMissing && !missingPhone.trim()) {
      toast.error('Lütfen eksik olan telefon numarasını giriniz.');
      return;
    }
    if (isEmailMissing && !missingEmail.trim()) {
      toast.error('Lütfen eksik olan e-posta adresini giriniz.');
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
      } catch (err) { }
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
          toast.error(`Röntgen dosyası yüklenemedi (Sunucu Hatası): ${errText}`);
          return;
        }
      } catch (e: any) {
        console.error('DCM Upload Catch Error:', e);
        toast.error(`Röntgen yüklenirken ağ hatası oluştu: ${e.message}`);
        return;
      }
    }

    try {
      const payloadTreatments = [];
      for (const [tooth, procedures] of Object.entries(toothDrafts)) {
        for (const proc of procedures) {
          const toothOriginalPrice = proc.price;
          const toothFinalPrice = Math.round(toothOriginalPrice * discountFactor);

          payloadTreatments.push({
            id: (proc.id && String(proc.id).includes('-')) ? proc.id : undefined,
            procedureName: proc.name,
            toothNumber: tooth,
            indication: proc.indications.length > 0 ? proc.indications.join(', ') : undefined,
            cost: toothFinalPrice,
            doctorId: proc.doctorId || selectedEvent.doctorId,
            status: 'planned',
            dcmUrl: uploadedDcmUrl,
            materials: proc.materials,
            isPeriodic,
            periodDays,
            notifyPatient,
            notificationType,
            nextNotificationDate,
            clinicId: clinicId || undefined
          });
        }
      }

      let res;
      if (editingGroup) {
        res = await fetch(`/api/dental/treatment-groups/${editingGroup.id}/full`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: groupName,
            patientId: selectedEvent.patientId,
            treatments: payloadTreatments,
            appointmentId: selectedEvent?.id || undefined
          })
        });
      } else {
        res = await fetch(`/api/dental/patients/${selectedEvent.patientId}/treatments/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupName: groupName,
            treatments: payloadTreatments
          })
        });
      }

      if (!res.ok) {
        console.error('Kayıt hatası:', await res.text());
        throw new Error('Kayıt başarısız');
      }

      onSaved();
    } catch (error) {
      console.error(error);
      toast.error('Kayıt sırasında bir hata oluştu.');
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--background)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, width: '95%', maxWidth: 1800, maxHeight: '98vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--foreground)' }}>Tedavi Planı Oluştur</h3>
            <style>{`
              @keyframes siriWave {
                0% { transform: scale(1); opacity: 0.8; box-shadow: 0 0 10px #ec4899, 0 0 20px #8b5cf6, 0 0 30px #3b82f6; }
                50% { transform: scale(1.03); opacity: 1; box-shadow: 0 0 20px #ec4899, 0 0 40px #8b5cf6, 0 0 60px #3b82f6; }
                100% { transform: scale(1); opacity: 0.8; box-shadow: 0 0 10px #ec4899, 0 0 20px #8b5cf6, 0 0 30px #3b82f6; }
              }
              @keyframes siriRotate {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
              }
            `}</style>

            <button
              onClick={toggleListening}
              style={{
                background: isListening ? 'linear-gradient(270deg, #ec4899, #8b5cf6, #3b82f6, #ec4899)' : 'var(--glass-bg)',
                backgroundSize: isListening ? '300% 300%' : 'auto',
                border: `1px solid ${isListening ? 'transparent' : 'var(--glass-border)'}`,
                color: isListening ? '#fff' : 'var(--foreground)',
                padding: '6px 16px',
                borderRadius: 20,
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                animation: isListening ? 'siriWave 1.5s infinite ease-in-out, siriRotate 3s infinite linear' : 'none',
                transition: 'all 0.3s ease'
              }}>
              <span style={{ fontSize: '1.1rem' }}>🎙️</span> {isListening ? 'Asistan Dinliyor...' : 'Asistanı Başlat'}
            </button>

            {transcript && (
              <div style={{
                background: 'rgba(30,41,59,0.9)',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: '0.85rem',
                backdropFilter: 'blur(8px)',
                border: '1px solid #3b82f6',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                zIndex: 100005,
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <span style={{ color: '#60a5fa', fontWeight: 'bold', fontSize: '0.7rem', letterSpacing: 1 }}>ASİSTAN DUYUYOR</span>
                <span>{transcript}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: 24, flex: 1, overflow: 'hidden' }}>

          {/* LEFT COLUMN */}
          <div style={{ flex: 2.5, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', paddingRight: 8 }}>

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
                      toast.error('Dosya boyutu 20 MB\'dan büyük olamaz');
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
                    <button onClick={() => setTreatmentDcmFile(null)} style={{ marginLeft: 'auto', background: 'var(--danger)', color: '#fff', border: 'none', width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <X size={16} strokeWidth={3} />
                    </button>
                  </>
                )}
              </div>

              {treatmentDcmFile && (
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--glass-border)', position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <DicomViewer dcmUrl={URL.createObjectURL(treatmentDcmFile)} isModal={false} />
                  </div>
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
                      colors={Array.from(new Set((toothDrafts[String(n)] || []).map((d: any) => d.color).filter(Boolean)))}
                      onClick={(e: React.MouseEvent) => handleToothClick(n, e)}
                      onContextMenu={(e: React.MouseEvent) => {
                        e.preventDefault();
                        const targets = selectedTeeth.includes(n) ? selectedTeeth : [n];
                        setContextMenu({ x: e.clientX, y: e.clientY, teeth: targets });
                      }}
                      onDragOver={(e: React.DragEvent) => e.preventDefault()}
                      onDrop={(e: React.DragEvent) => {
                        e.preventDefault();
                        const type = e.dataTransfer.getData("type");
                        const val = e.dataTransfer.getData("value");
                        if (!val) return;
                        const targets = selectedTeeth.includes(n) ? selectedTeeth : [n];

                        if (type === 'mixed') {
                          const { procedures, indications, activeMaterials } = JSON.parse(val);
                          setToothDrafts(prev => {
                            const next = { ...prev };
                            targets.forEach(t => {
                              const tk = String(t);
                              next[tk] = next[tk] ? [...next[tk]] : [];
                              if (procedures && procedures.length > 0) {
                                procedures.forEach((p: any) => {
                                  if (!next[tk].find((x: any) => x.name === p.name)) {
                                    next[tk].push({
                                      id: Math.random().toString(36).substring(7),
                                      name: p.name,
                                      price: p.price,
                                      indications: [...indications],
                                      doctorId: defaultDoctorId,
                                      materials: [...(activeMaterials || p.materials || []).map((m: any) => ({ ...m }))],
                                      color: p.color
                                    });
                                  }
                                });
                              } else if (indications && indications.length > 0) {
                                if (next[tk].length > 0) {
                                  const last = next[tk][next[tk].length - 1];
                                  indications.forEach((ind: string) => {
                                    if (!last.indications.includes(ind)) last.indications.push(ind);
                                  });
                                } else {
                                  toast.error('Endikasyon atamak için dişte en az bir işlem bulunmalıdır.');
                                }
                              }
                            });
                            setSelectedTemplates({ procedures: [], indications: [] });
                            return next;
                          });
                        }
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
                      colors={Array.from(new Set((toothDrafts[String(n)] || []).map((d: any) => d.color).filter(Boolean)))}
                      onClick={(e: React.MouseEvent) => handleToothClick(n, e)}
                      onContextMenu={(e: React.MouseEvent) => {
                        e.preventDefault();
                        const targets = selectedTeeth.includes(n) ? selectedTeeth : [n];
                        setContextMenu({ x: e.clientX, y: e.clientY, teeth: targets });
                      }}
                      onDragOver={(e: React.DragEvent) => e.preventDefault()}
                      onDrop={(e: React.DragEvent) => {
                        e.preventDefault();
                        const type = e.dataTransfer.getData("type");
                        const val = e.dataTransfer.getData("value");
                        if (!val) return;
                        const targets = selectedTeeth.includes(n) ? selectedTeeth : [n];

                        if (type === 'mixed') {
                          const { procedures, indications, activeMaterials } = JSON.parse(val);
                          setToothDrafts(prev => {
                            const next = { ...prev };
                            targets.forEach(t => {
                              const tk = String(t);
                              next[tk] = next[tk] ? [...next[tk]] : [];
                              if (procedures && procedures.length > 0) {
                                procedures.forEach((p: any) => {
                                  if (!next[tk].find((x: any) => x.name === p.name)) {
                                    next[tk].push({
                                      id: Math.random().toString(36).substring(7),
                                      name: p.name,
                                      price: p.price,
                                      indications: [...indications],
                                      doctorId: defaultDoctorId,
                                      materials: [...(activeMaterials || p.materials || []).map((m: any) => ({ ...m }))],
                                      color: p.color
                                    });
                                  }
                                });
                              } else if (indications && indications.length > 0) {
                                if (next[tk].length > 0) {
                                  const last = next[tk][next[tk].length - 1];
                                  indications.forEach((ind: string) => {
                                    if (!last.indications.includes(ind)) last.indications.push(ind);
                                  });
                                } else {
                                  toast.error('Endikasyon atamak için dişte en az bir işlem bulunmalıdır.');
                                }
                              }
                            });
                            setSelectedTemplates({ procedures: [], indications: [] });
                            return next;
                          });
                        } else if (type === 'procedure') {
                          const parsed = JSON.parse(val);
                          setToothDrafts(prev => {
                            const next = { ...prev };
                            targets.forEach(t => {
                              const tk = String(t);
                              next[tk] = next[tk] ? [...next[tk]] : [];
                              if (!next[tk].find((x: any) => x.name === parsed.name)) {
                                next[tk].push({
                                  id: Math.random().toString(36).substring(7),
                                  name: parsed.name,
                                  price: parsed.price,
                                  indications: [],
                                  doctorId: defaultDoctorId,
                                  materials: [...(parsed.materials || []).map((m: any) => ({ ...m }))]
                                });
                              }
                            });
                            return next;
                          });
                        } else if (type === 'indication') {
                          toast.error('Endikasyonları sağdaki tablodan işlem satırına sürükleyebilir veya menüden seçebilirsiniz.');
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Hızlı Atama Ayarları (Araç Kutusu) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  Hızlı Atama Ayarları <span style={{ fontSize: 10, color: 'var(--foreground-3)', fontWeight: 400 }}>(Varsayılanlar)</span>
                </div>
                <div style={{ padding: 12, background: 'var(--glass-bg)', border: '1px dashed var(--glass-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <select 
                        value={defaultDoctorId || ''} 
                        onChange={e => {
                          const chosenDocId = e.target.value;
                          if (chosenDocId && selectedEvent?.startTime) {
                            const apptDateStr = new Date(selectedEvent.startTime).toLocaleDateString('sv');
                            const docShifts = (shifts || []).filter((s: any) => s.userId === chosenDocId && s.date === apptDateStr);
                            const docObj = doctors.find((d: any) => d.id === chosenDocId);
                            const docName = docObj?.name || 'Seçilen hekim';
                            if (docShifts.length === 0) {
                              toast.error(`⚠️ ${docName} için bu tarihte (${apptDateStr}) tanımlı vardiya bulunmuyor!`);
                              return;
                            }
                          }
                          setDefaultDoctorId(chosenDocId);
                        }} 
                        style={{ ...inputStyle, width: '100%', padding: '6px', fontSize: '0.8rem' }}
                      >
                        <option value="">⚠️ Atanmadı</option>
                        {doctors?.map((d: any) => {
                          const apptDateStr = selectedEvent?.startTime ? new Date(selectedEvent.startTime).toLocaleDateString('sv') : '';
                          const docShifts = apptDateStr ? (shifts || []).filter((s: any) => s.userId === d.id && s.date === apptDateStr) : [];
                          const hasShift = docShifts.length > 0;
                          const shiftText = hasShift ? `(🟢 ${docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ')})` : (apptDateStr ? `(Vardiya Yok ⚠️)` : '');
                          return (
                            <option 
                              key={d.id} 
                              value={d.id}
                              disabled={apptDateStr ? !hasShift : false}
                              style={{ color: !hasShift && apptDateStr ? '#ef4444' : 'inherit' }}
                            >
                              {d.name} {shiftText}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
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
                  {procTemplates.map((proc, i) => {
                    const isSelected = selectedTemplates.procedures.includes(i);
                    return (
                      <div key={i} draggable
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey) {
                            setSelectedTemplates(prev => {
                              const next = { procedures: [...prev.procedures], indications: [...prev.indications] };
                              if (next.procedures.includes(i)) next.procedures = next.procedures.filter(x => x !== i);
                              else {
                                next.procedures.push(i);
                                setActiveSelectionMaterials(prevMats => [...prevMats, ...(procTemplates[i].materials || [])]);
                              }
                              return next;
                            });
                          } else {
                            setSelectedTemplates({ procedures: [i], indications: [] });
                            setActiveSelectionMaterials([...(procTemplates[i].materials || [])]);
                          }
                        }}
                        onDragStart={(e) => {
                          const payloadProcs = isSelected ? selectedTemplates.procedures.map(idx => procTemplates[idx]) : [proc];
                          const payloadInds = isSelected ? selectedTemplates.indications.map(idx => indTemplates[idx]) : [];
                          const payloadMats = isSelected ? activeSelectionMaterials : (proc.materials || []);
                          e.dataTransfer.setData("type", "mixed");
                          e.dataTransfer.setData("value", JSON.stringify({ procedures: payloadProcs, indications: payloadInds, activeMaterials: payloadMats }));
                        }}
                        style={{ padding: '6px 12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', boxShadow: isSelected ? '0 0 0 2px var(--accent)' : 'none', borderRadius: 20, fontSize: '0.8rem', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}
                      >
                        <span style={{ flex: 1, pointerEvents: 'none' }}>{proc.name}</span> <span style={{ opacity: 0.5, fontSize: '0.7rem', pointerEvents: 'none' }}>{proc.price} ₺</span>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: proc.color || '#3b82f6', marginLeft: 4 }} />
                        <button onClick={(e) => { e.stopPropagation(); setEditingTemplate({ type: 'procedure', index: i }); setNewTemplateType('procedure'); setNewTemplateInput(proc.name); setNewTemplatePrice(proc.price); setNewTemplateColor(proc.color || '#3b82f6'); setNewTemplateMaterials(proc.materials || []); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, display: 'flex' }}><Pencil size={12} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setProcTemplates(prev => prev.filter((_, idx) => idx !== i)); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
                      </div>
                    )
                  })}
                </div>

                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px dashed var(--accent)' }}>
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8, fontWeight: 600 }}>Sıradaki İşlem İçin Stok Kullanımı (Opsiyonel)</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <select onChange={e => {
                      const itemId = e.target.value;
                      if (!itemId) return;
                      const item = inventory.find(x => x.id === itemId);
                      if (!item) return;
                      if (!activeSelectionMaterials.find(x => x.inventoryItemId === item.id)) {
                        setActiveSelectionMaterials(prev => [...prev, { inventoryItemId: item.id, name: item.name, quantity: 1, unitCost: item.costPerUnit }]);
                      }
                      e.target.value = '';
                    }} style={{ ...inputStyle, flex: 1, padding: '6px', fontSize: '0.8rem' }}>
                      <option value="">+ Malzeme Ekle</option>
                      {inventory.map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
                    </select>
                  </div>
                  {activeSelectionMaterials.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {activeSelectionMaterials.map((m, mIdx) => (
                        <div key={mIdx} style={{ background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 4, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--glass-border)', color: 'var(--foreground-2)' }}>
                          {m.name}
                          <input
                            type="number"
                            min={1}
                            value={m.quantity}
                            onChange={e => {
                              const q = Number(e.target.value);
                              setActiveSelectionMaterials(prev => prev.map((item, i) => i === mIdx ? { ...item, quantity: q } : item));
                            }}
                            style={{ ...inputStyle, width: 40, padding: '2px 4px', fontSize: '0.75rem', textAlign: 'center', height: 20 }}
                          />
                          <button onClick={() => setActiveSelectionMaterials(prev => prev.filter((_, i) => i !== mIdx))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  Sık Kullanılan Endikasyonlar <span style={{ fontSize: 10, color: 'var(--foreground-3)', fontWeight: 400 }}>(Sürükle bırak)</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {indTemplates.map((ind, i) => {
                    const isSelected = selectedTemplates.indications.includes(i);
                    return (
                      <div key={i} draggable
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey) {
                            setSelectedTemplates(prev => {
                              const next = { procedures: [...prev.procedures], indications: [...prev.indications] };
                              if (next.indications.includes(i)) next.indications = next.indications.filter(x => x !== i);
                              else next.indications.push(i);
                              return next;
                            });
                          } else {
                            setSelectedTemplates(prev => ({ procedures: prev.procedures, indications: [i] }));
                          }
                        }}
                        onDragStart={(e) => {
                          const payloadProcs = isSelected ? selectedTemplates.procedures.map(idx => procTemplates[idx]) : [];
                          const payloadInds = isSelected ? selectedTemplates.indications.map(idx => indTemplates[idx]) : [ind];
                          e.dataTransfer.setData("type", "mixed");
                          e.dataTransfer.setData("value", JSON.stringify({ procedures: payloadProcs, indications: payloadInds }));
                        }}
                        style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', boxShadow: isSelected ? '0 0 0 2px #ef4444' : 'none', borderRadius: 20, fontSize: '0.8rem', color: '#ef4444', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}
                      >
                        <span style={{ pointerEvents: 'none' }}>{ind}</span>
                        <button onClick={(e) => { e.stopPropagation(); setEditingTemplate({ type: 'indication', index: i }); setNewTemplateType('indication'); setNewTemplateInput(ind); }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}><Pencil size={12} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setIndTemplates(prev => prev.filter((_, idx) => idx !== i)); }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Yeni Şablon Ekleme / Düzenleme */}
              <div style={{ padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px dashed var(--glass-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 8 }}>{editingTemplate ? 'Şablonu Düzenle' : 'Yeni Şablon Ekle'}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={newTemplateType} onChange={e => setNewTemplateType(e.target.value as 'procedure' | 'indication')} disabled={!!editingTemplate} style={{ ...inputStyle, width: 100, padding: '6px', fontSize: '0.8rem' }}>
                    <option value="procedure">İşlem</option>
                    <option value="indication">Endikasyon</option>
                  </select>
                  <input type="text" value={newTemplateInput} onChange={e => setNewTemplateInput(e.target.value)} placeholder="Şablon Adı" style={{ ...inputStyle, flex: 1, padding: '6px', fontSize: '0.8rem' }} />
                  {newTemplateType === 'procedure' && (
                    <>
                      <input type="number" value={newTemplatePrice || ''} onChange={e => setNewTemplatePrice(Number(e.target.value))} placeholder="Fiyat (₺)" style={{ ...inputStyle, width: 80, padding: '6px', fontSize: '0.8rem' }} />
                      <input type="color" value={newTemplateColor} onChange={e => setNewTemplateColor(e.target.value)} style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} title="İşlem Rengi" />
                      <select onChange={e => {
                        const itemId = e.target.value;
                        if (!itemId) return;
                        const item = inventory.find(x => x.id === itemId);
                        if (!item) return;
                        if (!newTemplateMaterials.find(x => x.inventoryItemId === item.id)) {
                          setNewTemplateMaterials(prev => [...prev, { inventoryItemId: item.id, name: item.name, quantity: 1, unitCost: item.costPerUnit }]);
                        }
                        e.target.value = '';
                      }} style={{ ...inputStyle, width: 100, padding: '6px', fontSize: '0.8rem' }}>
                        <option value="">+ Malzeme</option>
                        {inventory.map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
                      </select>
                    </>
                  )}
                  <button onClick={() => {
                    if (!newTemplateInput.trim()) return;
                    if (editingTemplate) {
                      if (editingTemplate.type === 'procedure') {
                        const arr = [...procTemplates];
                        arr[editingTemplate.index] = { name: newTemplateInput.trim(), price: newTemplatePrice, color: newTemplateColor, materials: [...newTemplateMaterials] };
                        setProcTemplates(arr);
                      } else {
                        const arr = [...indTemplates];
                        arr[editingTemplate.index] = newTemplateInput.trim();
                        setIndTemplates(arr);
                      }
                      setEditingTemplate(null);
                    } else {
                      if (newTemplateType === 'procedure') {
                        setProcTemplates(prev => [...prev, { name: newTemplateInput.trim(), price: newTemplatePrice, color: newTemplateColor, materials: [...newTemplateMaterials] }]);
                      } else {
                        setIndTemplates(prev => Array.from(new Set([...prev, newTemplateInput.trim()])));
                      }
                    }
                    setNewTemplateInput(''); setNewTemplatePrice(0); setNewTemplateMaterials([]);
                  }} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>{editingTemplate ? 'Kaydet' : 'Ekle'}</button>
                  {editingTemplate && (
                    <button onClick={() => { setEditingTemplate(null); setNewTemplateInput(''); setNewTemplatePrice(0); setNewTemplateMaterials([]); }} style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.8rem' }}>İptal</button>
                  )}
                </div>
                {newTemplateType === 'procedure' && newTemplateMaterials.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {newTemplateMaterials.map((m, mIdx) => (
                      <div key={mIdx} style={{ background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 4, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--glass-border)', color: 'var(--foreground-2)' }}>
                        {m.name}
                        <input
                          type="number"
                          min={1}
                          value={m.quantity}
                          onChange={e => {
                            const q = Number(e.target.value);
                            setNewTemplateMaterials(prev => prev.map((item, i) => i === mIdx ? { ...item, quantity: q } : item));
                          }}
                          style={{ ...inputStyle, width: 40, padding: '2px 4px', fontSize: '0.75rem', textAlign: 'center', height: 20 }}
                        />
                        <button onClick={() => setNewTemplateMaterials(prev => prev.filter((_, i) => i !== mIdx))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Consultations Block */}
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12 }}>Konsültasyon ve Hastalık Notu</div>

              <div style={{ display: 'flex', flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text"
                    value={newDisease}
                    onChange={e => setNewDisease(e.target.value)}
                    placeholder="Hastalık Notu"
                    style={{ ...inputStyle, width: '100%' }}
                  />
                  <datalist id="diseaseNotes">
                    {autocomplete.diseaseNotes.map((n, i) => <option key={i} value={n} />)}
                  </datalist>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={!newConsultation.trim() && !newDisease.trim()}
                    onClick={async () => {
                      if (editingConsultationId) {
                        const res = await fetch(`/api/dental/consultations/${editingConsultationId}`, {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ consultationNote: newConsultation.trim(), diseaseNote: newDisease.trim() })
                        });
                        if (res.ok) {
                          const updated = await fetch(`/api/dental/patients/${selectedEvent.patientId}/consultations`).then(r => r.json());
                          setConsultations(updated);
                          setEditingConsultationId(null);
                          setNewConsultation('');
                          setNewDisease('');
                        }
                      } else {
                        const res = await fetch(`/api/dental/patients/${selectedEvent.patientId}/consultations`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ clinicId: clinicId || undefined, doctorId: selectedEvent.doctorId, consultationNote: newConsultation.trim(), diseaseNote: newDisease.trim() })
                        });
                        if (res.ok) {
                          const updated = await fetch(`/api/dental/patients/${selectedEvent.patientId}/consultations`).then(r => r.json());
                          setConsultations(updated);
                          setNewConsultation('');
                          setNewDisease('');
                        }
                      }
                    }}
                    style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', borderRadius: 6, border: 'none', cursor: 'pointer', opacity: (!newConsultation.trim() && !newDisease.trim()) ? 0.5 : 1, whiteSpace: 'nowrap', height: 38 }}
                  >
                    {editingConsultationId ? 'Güncelle' : 'Kaydet'}
                  </button>
                  {editingConsultationId && (
                    <button onClick={() => { setEditingConsultationId(null); setNewConsultation(''); setNewDisease(''); }} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--foreground)', borderRadius: 6, border: '1px solid var(--glass-border)', cursor: 'pointer', height: 38, whiteSpace: 'nowrap' }}>İptal</button>
                  )}
                </div>
              </div>

              {consultations.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: 6, background: 'var(--glass-bg)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                    <thead style={{ background: 'transparent' }}>
                      <tr>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--glass-border)', color: 'var(--foreground-2)' }}>Konsültasyon</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--glass-border)', color: 'var(--foreground-2)' }}>Hastalık</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--glass-border)', width: 60, color: 'var(--foreground-2)' }}>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consultations.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                          <td style={{ padding: '6px 8px' }}>{c.consultationNote}</td>
                          <td style={{ padding: '6px 8px' }}>{c.diseaseNote || '-'}</td>
                          <td style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
                            <button onClick={() => { setEditingConsultationId(c.id); setNewConsultation(c.consultationNote || ''); setNewDisease(c.diseaseNote || ''); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}><Pencil size={14} /></button>
                            <button onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Konsültasyonu Sil',
                                message: 'Bu konsültasyon notunu silmek istediğinize emin misiniz?',
                                confirmText: 'Evet, Sil',
                                variant: 'danger',
                                onConfirm: async () => {
                                  await fetch(`/api/dental/consultations/${c.id}`, { method: 'DELETE' });
                                  const updated = await fetch(`/api/dental/patients/${selectedEvent.patientId}/consultations`).then(r => r.json());
                                  setConsultations(updated);
                                }
                              });
                            }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          {/* RIGHT COLUMN */}
          <div style={{ flex: 1, minWidth: 380, display: 'flex', flexDirection: 'column', gap: 16, borderLeft: '1px solid var(--glass-border)', paddingLeft: 24, overflowY: 'auto' }}>
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
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)', width: 80, textAlign: 'right' }}>Ücret</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)', width: 60, textAlign: 'center' }}>İşlemler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(toothDrafts).flatMap(([tooth, drafts]) => {
                          return drafts.map((draft, idx) => {
                            const isSelectedRow = selectedToothForDetails === tooth;
                            const totalMats = draft.materials ? draft.materials.length : 0;
                            return (
                              <tr
                                key={`${tooth}-${draft.id}`}
                                style={{
                                  borderBottom: '1px solid var(--glass-border)',
                                  background: isSelectedRow ? 'var(--glass-bg)' : 'transparent',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--accent)' }}>#{tooth}</td>
                                <td style={{ padding: '8px 12px', color: 'var(--foreground)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {draft.name}
                                  </div>
                                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <select
                                      value={draft.doctorId || ''}
                                      onChange={(e) => {
                                        const chosenDocId = e.target.value || null;
                                        if (chosenDocId && selectedEvent?.startTime) {
                                          const apptDateStr = new Date(selectedEvent.startTime).toLocaleDateString('sv');
                                          const docShifts = (shifts || []).filter((s: any) => s.userId === chosenDocId && s.date === apptDateStr);
                                          const docObj = doctors.find((d: any) => d.id === chosenDocId);
                                          const docName = docObj?.name || 'Seçilen hekim';
                                          if (docShifts.length === 0) {
                                            toast.error(`⚠️ ${docName} için bu tarihte (${apptDateStr}) tanımlı vardiya bulunmuyor!`);
                                            return;
                                          }
                                        }
                                        setToothDrafts(prev => {
                                          const next = { ...prev };
                                          const index = next[tooth].findIndex(d => d.id === draft.id);
                                          if (index !== -1) {
                                            next[tooth][index] = { ...next[tooth][index], doctorId: chosenDocId };
                                          }
                                          return next;
                                        });
                                      }}
                                      style={{ padding: '4px 6px', fontSize: '0.75rem', borderRadius: 4, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)', maxWidth: 180, cursor: 'pointer' }}
                                    >
                                      <option value="">-- Doktor Seç --</option>
                                      {doctors.map((d: any) => {
                                        const apptDateStr = selectedEvent?.startTime ? new Date(selectedEvent.startTime).toLocaleDateString('sv') : '';
                                        const docShifts = apptDateStr ? (shifts || []).filter((s: any) => s.userId === d.id && s.date === apptDateStr) : [];
                                        const hasShift = docShifts.length > 0;
                                        const shiftText = hasShift ? `(🟢 ${docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ')})` : (apptDateStr ? `(Vardiya Yok ⚠️)` : '');
                                        return (
                                          <option 
                                            key={d.id} 
                                            value={d.id}
                                            disabled={apptDateStr ? !hasShift : false}
                                            style={{ color: !hasShift && apptDateStr ? '#ef4444' : 'inherit' }}
                                          >
                                            {d.name} {shiftText}
                                          </option>
                                        );
                                      })}
                                    </select>
                                    {!draft.doctorId && <span style={{ color: '#f59e0b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }} title="Doktor Atanmadı">⚠️ Atanmadı</span>}
                                    {totalMats > 0 && <span title="Eklenen Malzemeler" style={{ fontSize: '0.75rem', color: 'var(--foreground-3)' }}>📦 {totalMats} mlz.</span>}
                                  </div>
                                </td>
                                <td style={{ padding: '8px 12px', color: 'var(--foreground)' }}>
                                  {draft.indications && draft.indications.length > 0 ? draft.indications.join(', ') : <span style={{ color: 'var(--foreground-3)' }}>-</span>}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>{draft.price} ₺</td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                    <button onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedToothForDetails(tooth);
                                    }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }} title="Detayları Düzenle">
                                      <Pencil size={14} />
                                    </button>
                                    <button onClick={(e) => {
                                      e.stopPropagation();
                                      setToothDrafts(prev => {
                                        const next = { ...prev };
                                        next[tooth] = next[tooth].filter(d => d.id !== draft.id);
                                        if (next[tooth].length === 0) delete next[tooth];
                                        return next;
                                      });
                                    }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }} title="İşlemi Sil">
                                      <X size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })}
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
                          <select value={discountType} onChange={e => setDiscountType(e.target.value as 'amount' | 'percentage')} style={{ ...inputStyle, padding: '4px', fontSize: '0.8rem', background: 'var(--glass-bg)', border: 'none', cursor: 'pointer' }}>
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
                        <option value="whatsapp">Sadece WhatsApp</option>
                        <option value="both">Tümü (SMS, E-posta, WhatsApp)</option>
                      </select>
                      {(!patientInfo?.phone && (notificationType === 'sms' || notificationType === 'whatsapp' || notificationType === 'both')) && (
                        <div style={{ marginTop: 8 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#ef4444', marginBottom: 4 }}>⚠️ Hastanın telefonu eksik, lütfen girin:</label>
                          <input type="tel" value={missingPhone} onChange={e => setMissingPhone(e.target.value)} placeholder="0555..." style={{ ...inputStyle, width: '100%', borderColor: '#ef4444' }} />
                        </div>
                      )}
                      {(!patientInfo?.email && (notificationType === 'email' || notificationType === 'both')) && (
                        <div style={{ marginTop: 8 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#ef4444', marginBottom: 4 }}>⚠️ Hastanın e-postası eksik, lütfen girin:</label>
                          <input type="email" value={missingEmail} onChange={e => setMissingEmail(e.target.value)} placeholder="hasta@ornek.com" style={{ ...inputStyle, width: '100%', borderColor: '#ef4444' }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button onClick={handlePrint} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--foreground)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                  Yazdır
                </button>
                <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer', fontWeight: 600 }}>İptal</button>
                <button onClick={handleSave} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Kaydet</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Procedure Details Modal */}
      {selectedToothForDetails && toothDrafts[selectedToothForDetails] && (() => {
        const tooth = selectedToothForDetails;
        const drafts = toothDrafts[tooth];

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100005 }} onClick={() => setSelectedToothForDetails(null)}>
            <div style={{ background: 'var(--background)', width: 1400, maxWidth: '98vw', height: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 16, border: '1px solid var(--glass-border)', boxShadow: '0 24px 48px rgba(0,0,0,0.4)', overflow: 'hidden', position: 'relative' }} onClick={e => e.stopPropagation()}>
              
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--glass-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--foreground)' }}>Diş #{tooth} Detayları</h3>
                  {editingGroup && editingGroup.creatorName && (
                    <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)', color: 'var(--foreground-2)' }}>
                      Oluşturan: {editingGroup.creatorName} {editingGroup.creatorRole && `(${editingGroup.creatorRole})`}
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedToothForDetails(null)} style={{ background: 'none', border: 'none', color: 'var(--foreground-2)', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
              </div>

              <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
                {drafts.map((proc, index) => (
                  <div key={proc.id} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px dashed var(--glass-border)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '1.05rem' }}>{proc.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--foreground)' }}>{proc.price} ₺</span>
                        <button onClick={() => {
                          setToothDrafts(prev => {
                            const next = { ...prev };
                            next[tooth] = next[tooth].filter(x => x.id !== proc.id);
                            if (next[tooth].length === 0) {
                              delete next[tooth];
                              setTimeout(() => setSelectedToothForDetails(null), 0);
                            }
                            return next;
                          });
                        }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }} title="İşlemi Sil"><Trash2 size={16} /></button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 24 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--foreground-2)', marginBottom: 8, fontWeight: 500 }}>Randevu Doktoru</label>
                        <select
                          value={proc.doctorId || ''}
                          onChange={e => {
                            setToothDrafts(prev => {
                              const next = { ...prev };
                              if (next[tooth]) {
                                next[tooth] = next[tooth].map(x => x.id === proc.id ? { ...x, doctorId: e.target.value } : x);
                              }
                              return next;
                            });
                          }}
                          style={{ ...inputStyle, width: '100%', padding: '10px 12px', fontSize: '0.9rem' }}
                        >
                          <option value="">⚠️ Atanmadı</option>
                          {doctors?.map((d: any) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--foreground-2)', marginBottom: 8, fontWeight: 500 }}>Malzeme Kullanımı</label>
                        <select onChange={e => {
                          const itemId = e.target.value;
                          if (!itemId) return;
                          const item = inventory.find(x => x.id === itemId);
                          if (!item) return;
                          setToothDrafts(prev => {
                            const next = { ...prev };
                            if (next[tooth]) {
                              next[tooth] = next[tooth].map(x => {
                                if (x.id === proc.id && !x.materials.find((m: any) => m.inventoryItemId === item.id)) {
                                  return { ...x, materials: [...x.materials, { inventoryItemId: item.id, name: item.name, quantity: 1, unitCost: item.costPerUnit }] };
                                }
                                return x;
                              });
                            }
                            return next;
                          });
                          e.target.value = '';
                        }} style={{ ...inputStyle, width: '100%', padding: '10px 12px', fontSize: '0.9rem', marginBottom: 12 }}>
                          <option value="">+ Malzeme Ekle...</option>
                          {inventory.map(inv => (
                            <option key={inv.id} value={inv.id}>{inv.name}</option>
                          ))}
                        </select>

                        {proc.materials.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {proc.materials.map((m: any, mIdx: number) => (
                              <div key={mIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground)', fontWeight: 500 }}>{m.name}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--foreground-3)' }}>Miktar:</span>
                                    <input type="number" min={1} value={m.quantity} onChange={e => {
                                      const q = Number(e.target.value);
                                      setToothDrafts(prev => {
                                        const next = { ...prev };
                                        if (next[tooth]) {
                                          next[tooth] = next[tooth].map(x => {
                                            if (x.id === proc.id) {
                                              const newMats = [...x.materials];
                                              newMats[mIdx] = { ...newMats[mIdx], quantity: q };
                                              return { ...x, materials: newMats };
                                            }
                                            return x;
                                          });
                                        }
                                        return next;
                                      })
                                    }} style={{ ...inputStyle, width: 60, padding: '4px 8px', fontSize: '0.9rem', textAlign: 'center' }} />
                                  </div>
                                  <button onClick={() => {
                                    setToothDrafts(prev => {
                                      const next = { ...prev };
                                      if (next[tooth]) {
                                        next[tooth] = next[tooth].map(x => {
                                          if (x.id === proc.id) {
                                            return { ...x, materials: x.materials.filter((_: any, i: number) => i !== mIdx) };
                                          }
                                          return x;
                                        });
                                      }
                                      return next;
                                    })
                                  }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={16} /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--glass-bg)' }}>
                <button onClick={() => setSelectedToothForDetails(null)} style={{ padding: '8px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>Bitti</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Context Menu Overlay */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
          <div
            style={{
              position: 'fixed', left: Math.min(contextMenu.x, window.innerWidth - 220), top: Math.min(contextMenu.y, window.innerHeight - 300),
              background: 'var(--background)', border: '1px solid var(--glass-border)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)', borderRadius: 8,
              width: 220, maxHeight: 300, display: 'flex', flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '8px 12px', background: 'var(--glass-bg)', borderBottom: '1px solid var(--glass-border)', fontSize: 11, fontWeight: 600, color: 'var(--foreground-2)' }}>
              Seçili Dişler: {contextMenu.teeth.join(', ')}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
              <div style={{ padding: '8px 12px 4px 12px', fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>İşlem Ekle</div>
              {procTemplates.map((p, i) => (
                <div
                  key={i}
                  style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => {
                    setToothDrafts(prev => {
                      const next = { ...prev };
                      contextMenu.teeth.forEach(t => {
                        const tk = String(t);
                        next[tk] = next[tk] ? [...next[tk]] : [];
                        if (!next[tk].find((x: any) => x.name === p.name)) {
                          next[tk].push({
                            id: Math.random().toString(36).substring(7),
                            name: p.name, price: p.price, indications: [], doctorId: defaultDoctorId, materials: [...(p.materials || []).map((m: any) => ({ ...m }))],
                            color: p.color
                          });
                        }
                      });
                      return next;
                    });
                    // Close menu
                    setContextMenu(null);
                  }}
                >
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{p.name}</span>
                  <span style={{ opacity: 0.5 }}>{p.price}₺</span>
                </div>
              ))}

              <div style={{ padding: '8px 12px 4px 12px', fontSize: 11, fontWeight: 600, color: '#ef4444', borderTop: '1px solid var(--glass-border)', marginTop: 8, textTransform: 'uppercase' }}>Endikasyon Ekle</div>
              {indTemplates.map((ind, i) => {
                // Check if all selected teeth have at least one procedure
                const canAddIndication = contextMenu.teeth.every(t => toothDrafts[String(t)] && toothDrafts[String(t)].length > 0);
                return (
                  <div
                    key={i}
                    style={{
                      padding: '6px 12px', fontSize: 12,
                      cursor: canAddIndication ? 'pointer' : 'not-allowed',
                      opacity: canAddIndication ? 1 : 0.4,
                      display: 'flex', justifyContent: 'space-between'
                    }}
                    onMouseEnter={e => { if (canAddIndication) e.currentTarget.style.background = 'var(--glass-bg)' }}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => {
                      if (!canAddIndication) {
                        toast.error('Endikasyon ekleyebilmek için seçili dişlerin tümünde en az bir işlem bulunmalıdır.');
                        return;
                      }
                      setToothDrafts(prev => {
                        const next = { ...prev };
                        contextMenu.teeth.forEach(t => {
                          const tk = String(t);
                          if (next[tk] && next[tk].length > 0) {
                            next[tk] = [...next[tk]];
                            const lastIdx = next[tk].length - 1;
                            const last = next[tk][lastIdx];
                            if (!last.indications.includes(ind)) {
                              next[tk][lastIdx] = { ...last, indications: [...last.indications, ind] };
                            }
                          }
                        });
                        return next;
                      });
                      // Close menu
                      setContextMenu(null);
                    }}
                  >
                    <span>{ind}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

    </div>
  );
}
