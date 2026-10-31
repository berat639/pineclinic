import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { BriefcaseMedical, X, Pencil, Trash2, Plus, Mic, MicOff, Check, RotateCcw, Send, ChevronDown, ChevronUp, Bot, Sparkles, Box } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ToothChip, UPPER_TEETH, LOWER_TEETH, inputStyle } from './ToothChip';
import DicomViewer from './DicomViewer';
import PatientConsentPanel from './PatientConsentPanel';
import PlanMediaPanel, { type PlanAttachment } from './PlanMediaPanel';
import { notificationChannels, type NotificationChannel } from '../../../lib/notification-channels';
import PineTreatmentPlanView from './PineTreatmentPlanView';
import ConfirmModal from './ConfirmModal';
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss';
import type { DefectMarker } from './Odontogram3D';
import { calculateTreatmentPrices } from '../../../lib/treatment-pricing';
import { treatmentTargets, type TreatmentScope } from '../../../lib/treatment-targets';

const Odontogram3D = dynamic(() => import('./Odontogram3D'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', borderRadius: 8, color: 'var(--foreground-2)', fontSize: 13, border: '1px solid var(--input-border)', gap: 10 }}>
      <span style={{ fontSize: 28 }}>🦷</span>
      <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>3D Anatomik Odontogram Yükleniyor...</span>
    </div>
  ),
});

interface AssistantCommand {
  id: string;
  timestamp: string;
  rawText: string;
  parsedResult: any;
  status: 'preview' | 'applied' | 'rejected';
  treatments: any[];
}

type DraftItem = { id: string; name: string; price: number; indications: string[]; doctorId: string | null; materials: any[]; color?: string; surface?: string; section?: string; status?: string; locked?: boolean; dcmUrl?: string | null; procedureId?: string; scope?: 'tooth' | 'jaw' | 'mouth'; originalIndication?: string | null }
const targetLabel = (target: string) => target === 'upper' ? 'Üst çene' : target === 'lower' ? 'Alt çene' : target === 'general' ? 'Tüm ağız' : `Diş ${target}`;
const normalizeSection = (value?: string) => value === 'Kuron' ? 'crown' : value === 'Kole (Servikal)' ? 'cervical' : value === 'Kök & Apeks' ? 'root' : value;

export default function AdvancedTedaviModal({ selectedEvent, patientInfo, clinicId, doctors, shifts = [], onClose, onSaved, editingGroup }: any) {
  const toothDetailsBackdropDismiss = useBackdropDismiss(() => setSelectedToothForDetails(null));
  const contextMenuBackdropDismiss = useBackdropDismiss(() => setContextMenu(null));
  const [toothDrafts, setToothDrafts] = useState<Record<string, DraftItem[]>>({})
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([])
  const [selectionMode, setSelectionMode] = useState<'inspect' | 'batch'>('batch');
  const [isQuickSelectOpen, setIsQuickSelectOpen] = useState(false);
  const [odontogramMode, setOdontogramMode] = useState<'2d' | '3d'>('2d');
  const [jawSelection, setJawSelection] = useState<'all' | 'upper' | 'lower'>('all');
  const [toothSurfaces, setToothSurfaces] = useState<Record<number, string[]>>({});
  const [toothSections, setToothSections] = useState<Record<number, string>>({});
  const [defectMarkers, setDefectMarkers] = useState<DefectMarker[]>([]);

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

  const [groupName, setGroupName] = useState<string>(editingGroup ? editingGroup.name : `Tedavi Planı - ${new Date().toLocaleDateString('tr-TR')}`);
  const [planIdentity, setPlanIdentity] = useState<{ id: string; version: number } | null>(null);
  const [planLoading, setPlanLoading] = useState(!!editingGroup);
  const [planLoadError, setPlanLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [baseDataLoading, setBaseDataLoading] = useState(true);
  const [baseDataError, setBaseDataError] = useState<string | null>(null);
  const [planNote, setPlanNote] = useState('');
  const [savedDcmUrl, setSavedDcmUrl] = useState<string | null>(null);
  const [planAttachments, setPlanAttachments] = useState<PlanAttachment[]>([]);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [advancedView, setAdvancedView] = useState(false);
  const [contactOverride, setContactOverride] = useState<{ phone: string | null; email: string | null } | null>(null);
  const [notificationChanged, setNotificationChanged] = useState(false);
  const savingRef = useRef(false);
  const idempotencyKey = useRef<string | null>(null);
  const initialSnapshot = useRef<string | null>(null);
  const updateSnapshotAfterSave = useRef(false);
  const [, setSnapshotRevision] = useState(0);

  const [procTemplates, setProcTemplates] = useState<any[]>([])
  const [indicationIds, setIndicationIds] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    setBaseDataLoading(true); setBaseDataError(null);
    const read = async (url: string) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Veriler yüklenemedi');
      return response.json();
    };
    Promise.all([
      read(`/api/dental/patients/${selectedEvent.patientId}/consultations`),
      read('/api/dental/inventory'), read('/api/dental/treatment-catalog'),
      clinicId ? read(`/api/dental/clinics/${clinicId}/consultations/autocomplete`) : Promise.resolve({ consultationNotes: [], diseaseNotes: [] }),
    ]).then(([notes, stock, catalog, completion]) => {
      if (!Array.isArray(notes) || !Array.isArray(stock) || !Array.isArray(catalog)) throw new Error('Veriler geçersiz');
      setConsultations(notes); setInventory(stock); setAutocomplete(completion);
      setProcTemplates(catalog.filter((entry: any) => entry.kind === 'procedure').map((entry: any) => ({
        id: entry.id, name: entry.name, scope: entry.scope, price: entry.priceMinor / 100, color: entry.color, materials: entry.materials,
      })));
      const indications = catalog.filter((entry: any) => entry.kind === 'indication');
      setIndTemplates(indications.map((entry: any) => entry.name));
      setIndicationIds(Object.fromEntries(indications.map((entry: any) => [entry.name, entry.id])));
      setBaseDataLoading(false);
    }).catch(error => {
      if (error.name !== 'AbortError') { setBaseDataError('Hasta, stok veya katalog verileri yüklenemedi.'); setBaseDataLoading(false); }
    });
    return () => controller.abort();
  }, [selectedEvent.patientId, clinicId, loadAttempt]);

  useEffect(() => {
    if (!editingGroup?.id) return;
    const controller = new AbortController();
    setPlanLoading(true);
    setPlanLoadError(null);
    initialSnapshot.current = null;
    fetch(`/api/dental/treatment-groups/${editingGroup.id}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Plan yüklenemedi');
        return response.json();
      })
      .then(plan => {
        const drafts: Record<string, DraftItem[]> = {};
        const surfaces: Record<number, string[]> = {};
        const sections: Record<number, string> = {};
        for (const t of plan.treatments || []) {
          const tooth = String(t.toothNumber || 'general');
          const number = Number(t.toothNumber);
          let indication = t.indication || '';
          let surface: string | undefined;
          let section: string | undefined;
          const match = indication.match(/\[([^\]]*(?:Yüzey|Bölüm)[^\]]*)\]/i);
          if (match) {
            for (const part of match[1].split('|').map((value: string) => value.trim())) {
              if (part.toLocaleLowerCase('tr').startsWith('yüzey:')) surface = part.split(':')[1]?.trim();
              if (part.toLocaleLowerCase('tr').startsWith('bölüm:')) section = part.split(':')[1]?.trim();
            }
            indication = indication.replace(match[0], '').trim();
          }
          section = normalizeSection(section);
          if (number && surface) surfaces[number] = surface.split('');
          if (number && section) sections[number] = section;
          (drafts[tooth] ||= []).push({
            id: t.id, name: t.procedureName, price: t.basePriceMinor / 100,
            indications: indication ? indication.split(',').map((value: string) => value.trim()).filter(Boolean) : [],
            doctorId: t.doctorId || null, materials: Array.isArray(t.materials) ? t.materials : [],
            surface, section, status: t.status, locked: t.locked, dcmUrl: t.dcmUrl, originalIndication: t.indication,
            procedureId: t.metadata?.procedureId, scope: t.metadata?.scope || 'tooth', color: t.metadata?.color,
          });
        }
        setToothDrafts(drafts);
        setSelectedTeeth([]);
        setToothSurfaces(plan.metadata?.toothSurfaces || surfaces);
        const savedSections = plan.metadata?.toothSections || sections;
        setToothSections(Object.fromEntries(Object.entries(savedSections).map(([key, value]) => [key, normalizeSection(String(value)) || ''])));
        setDefectMarkers(Array.isArray(plan.metadata?.defectMarkers) ? plan.metadata.defectMarkers : []);
        setGroupName(plan.name);
        setPlanIdentity({ id: plan.id, version: plan.version });
        setPlanNote(plan.consultationNote || '');
        setDiscount(plan.discountPercentBps / 100 || 0);
        setDiscountFixed(plan.discountFixedMinor / 100 || 0);
        setDefaultDoctorId(plan.metadata?.defaultDoctorId || null);
        const firstItem = (plan.treatments || [])[0];
        setIsPeriodic(firstItem !== undefined ? !!firstItem.isPeriodic : !!plan.metadata?.isPeriodic);
        setPeriodDays(firstItem?.periodDays || Number(plan.metadata?.periodDays) || 180);
        const channels = Array.isArray(plan.metadata?.notificationChannels) ? plan.metadata.notificationChannels : firstItem?.notifyPatient ? notificationChannels(firstItem.notificationType) : [];
        setNotifyPatient(channels.length > 0);
        setNotificationType(channels.join(','));
        setNotificationChanged(false);
        setSavedDcmUrl((plan.treatments || []).find((item: any) => item.dcmUrl)?.dcmUrl || null);
        setPlanAttachments(Array.isArray(plan.attachments) ? plan.attachments : []);
        setPlanLoading(false);
      })
      .catch(error => {
        if (error.name !== 'AbortError') { setPlanLoadError('Plan yüklenemedi. Yeniden deneyin.'); setPlanLoading(false); }
      });
    return () => controller.abort();
  }, [editingGroup?.id, loadAttempt]);
  const [indTemplates, setIndTemplates] = useState<string[]>([])
  const [editingTemplate, setEditingTemplate] = useState<{ type: 'procedure' | 'indication', index: number } | null>(null)
  const [newTemplateType, setNewTemplateType] = useState<'procedure' | 'indication'>('procedure')
  const [newTemplateInput, setNewTemplateInput] = useState('')
  const [newTemplatePrice, setNewTemplatePrice] = useState<number>(0)
  const [newTemplateMaterials, setNewTemplateMaterials] = useState<any[]>([])
  const [newTemplateColor, setNewTemplateColor] = useState('#3b82f6')
  const [newTemplateScope, setNewTemplateScope] = useState<'tooth' | 'jaw' | 'mouth'>('tooth');
  const [catalogSaving, setCatalogSaving] = useState(false);

  const saveCatalogTemplate = async () => {
    if (catalogSaving || !newTemplateInput.trim()) return;
    const id = editingTemplate?.type === 'procedure' ? procTemplates[editingTemplate.index]?.id
      : editingTemplate ? indicationIds[indTemplates[editingTemplate.index]] : undefined;
    setCatalogSaving(true);
    try {
      const response = await fetch(id ? `/api/dental/treatment-catalog/${id}` : '/api/dental/treatment-catalog', {
        method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: newTemplateType, name: newTemplateInput.trim(), scope: newTemplateScope,
          priceMinor: Math.round(newTemplatePrice * 100), color: newTemplateColor, materials: newTemplateMaterials }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Katalog kaydedilemedi.');
      if (newTemplateType === 'procedure') {
        const item = { id: result.id, name: result.name, scope: result.scope, price: result.priceMinor / 100, color: result.color, materials: result.materials };
        setProcTemplates(previous => id ? previous.map(entry => entry.id === id ? item : entry) : [...previous, item]);
      } else {
        const previousName = editingTemplate ? indTemplates[editingTemplate.index] : undefined;
        setIndTemplates(previous => previousName ? previous.map(name => name === previousName ? result.name : name) : [...previous, result.name]);
        setIndicationIds(previous => { const next = { ...previous }; if (previousName) delete next[previousName]; next[result.name] = result.id; return next; });
      }
      setSelectedTemplates({ procedures: [], indications: [] }); setActiveSelectionMaterials([]);
      setEditingTemplate(null); setNewTemplateInput(''); setNewTemplatePrice(0); setNewTemplateMaterials([]); setNewTemplateScope('tooth');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Katalog kaydedilemedi.'); }
    finally { setCatalogSaving(false); }
  };

  const archiveCatalogTemplate = async (id: string | undefined, kind: 'procedure' | 'indication', name: string) => {
    if (!id || catalogSaving) return;
    setCatalogSaving(true);
    try {
      const response = await fetch(`/api/dental/treatment-catalog/${id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Katalog kaydı kaldırılamadı.');
      if (kind === 'procedure') setProcTemplates(previous => previous.filter(entry => entry.id !== id));
      else { setIndTemplates(previous => previous.filter(entry => entry !== name)); setIndicationIds(previous => { const next = { ...previous }; delete next[name]; return next; }); }
      setSelectedTemplates({ procedures: [], indications: [] }); setActiveSelectionMaterials([]);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Katalog kaydı kaldırılamadı.'); }
    finally { setCatalogSaving(false); }
  };

  const [treatmentDcmFile, setTreatmentDcmFile] = useState<File | null>(null)
  const [isDicomSectionOpen, setIsDicomSectionOpen] = useState(false)
  const [isNotesSectionOpen, setIsNotesSectionOpen] = useState(false)

  const [discount, setDiscount] = useState<number>(0)
  const [discountFixed, setDiscountFixed] = useState<number>(0)

  const [isPeriodic, setIsPeriodic] = useState(false)
  const [periodDays, setPeriodDays] = useState<number>(180)
  const [notifyPatient, setNotifyPatient] = useState(false)
  const [notificationType, setNotificationType] = useState('')
  const [missingPhone, setMissingPhone] = useState('')
  const [missingEmail, setMissingEmail] = useState('')

  const [lastSelectedTooth, setLastSelectedTooth] = useState<number | null>(null)

  const [selectedTemplates, setSelectedTemplates] = useState<{ procedures: number[], indications: number[] }>({ procedures: [], indications: [] });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, teeth: number[] } | null>(null);

  const [selectedToothForDetails, setSelectedToothForDetails] = useState<string | null>(null);

  const [defaultDoctorId, setDefaultDoctorId] = useState<string | null>(null);
  const [activeSelectionMaterials, setActiveSelectionMaterials] = useState<any[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceStarting, setIsVoiceStarting] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  // Kept only until the legacy panel markup is removed; there is no UI route to open it.
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(false);
  const [commandHistory, setCommandHistory] = useState<AssistantCommand[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [editingCommandText, setEditingCommandText] = useState('');
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const isVoiceStartingRef = useRef(false);
  const hasVoiceFatalErrorRef = useRef(false);
  const isAnalyzingRef = useRef(false);
  const triggerDebounceRef = useRef<any>(null);
  const silenceDebounceRef = useRef<any>(null);
  const recognitionRestartRef = useRef<any>(null);
  const lastProcessedTextRef = useRef<string>('');
  const processedResultIndexRef = useRef<number>(0);
  const pendingDentalPrefixRef = useRef<{ text: string; updatedAt: number }>({ text: '', updatedAt: 0 });
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioMonitorIntervalRef = useRef<any>(null);
  const noiseFloorRmsRef = useRef<number>(0.008);
  const lastNearFieldSpeechAtRef = useRef<number>(0);
  const peakUtteranceRmsRef = useRef<number>(0);

  const snapshot = JSON.stringify({ groupName, toothDrafts, toothSurfaces, toothSections, defectMarkers,
    planNote, discount, discountFixed, defaultDoctorId, isPeriodic, periodDays, notifyPatient, notificationType, savedDcmUrl,
    attachments: planAttachments.map(item => item.id),
    selectedFile: treatmentDcmFile ? `${treatmentDcmFile.name}:${treatmentDcmFile.size}:${treatmentDcmFile.lastModified}` : null });
  useEffect(() => {
    if (!planLoading && !planLoadError && (initialSnapshot.current === null || updateSnapshotAfterSave.current)) {
      initialSnapshot.current = snapshot;
      updateSnapshotAfterSave.current = false;
      setSnapshotRevision(value => value + 1);
    }
  }, [snapshot, planLoading, planLoadError]);
  const hasUnsavedChanges = initialSnapshot.current !== null && initialSnapshot.current !== snapshot;
  let pricing: ReturnType<typeof calculateTreatmentPrices> | null = null;
  try {
    pricing = calculateTreatmentPrices(Object.values(toothDrafts).flat().map(item => ({
      basePriceMinor: Math.round(item.price * 100),
      materials: item.materials.map(material => ({ quantity: Number(material.quantity), unitSalePriceMinor: Number(material.unitSalePriceMinor || 0) })),
    })), Math.round(discount * 100), Math.round(discountFixed * 100));
  } catch { /* Invalid inputs are reported when saving. */ }

  // Anatomik Diş Grupları ve Kadranlar
  const QUADRANT_1 = [18, 17, 16, 15, 14, 13, 12, 11];
  const QUADRANT_2 = [21, 22, 23, 24, 25, 26, 27, 28];
  const QUADRANT_3 = [31, 32, 33, 34, 35, 36, 37, 38];
  const QUADRANT_4 = [48, 47, 46, 45, 44, 43, 42, 41];
  const ANTERIOR_TEETH = [13, 12, 11, 21, 22, 23, 43, 42, 41, 31, 32, 33];
  const POSTERIOR_TEETH = [18, 17, 16, 15, 14, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 34, 35, 36, 37, 38];
  const ALL_TEETH_LIST = [...UPPER_TEETH, ...LOWER_TEETH];

  const getTeethForQuickSelect = (type: string): number[] => {
    switch (type) {
      case 'all':
      case 'SELECT_ALL':
        return ALL_TEETH_LIST;
      case 'upper':
      case 'SELECT_MAXILLA':
        return UPPER_TEETH;
      case 'lower':
      case 'SELECT_MANDIBLE':
        return LOWER_TEETH;
      case 'q1':
      case 'SELECT_Q1':
        return QUADRANT_1;
      case 'q2':
      case 'SELECT_Q2':
        return QUADRANT_2;
      case 'q3':
      case 'SELECT_Q3':
        return QUADRANT_3;
      case 'q4':
      case 'SELECT_Q4':
        return QUADRANT_4;
      case 'anterior':
      case 'SELECT_ANTERIOR':
        return ANTERIOR_TEETH;
      case 'posterior':
      case 'SELECT_POSTERIOR':
        return POSTERIOR_TEETH;
      case 'clear':
      case 'CLEAR_SELECTION':
        return [];
      default:
        return [];
    }
  };

  const handleQuickSelect = (type: 'all' | 'upper' | 'lower' | 'q1' | 'q2' | 'q3' | 'q4' | 'anterior' | 'posterior' | 'clear') => {
    if (type === 'all' || type === 'upper' || type === 'lower') setJawSelection(type);
    const teeth = getTeethForQuickSelect(type);
    setSelectedTeeth(teeth);
    if (teeth.length > 0) {
      setLastSelectedTooth(teeth[0]);
    } else {
      setLastSelectedTooth(null);
    }
  };

  const handleToothClick = (n: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedTooth !== null) {
      // Anatomik aralık seçimi (Shift + Click)
      const allTeeth = [...UPPER_TEETH, ...LOWER_TEETH];
      const startIdx = allTeeth.indexOf(lastSelectedTooth);
      const endIdx = allTeeth.indexOf(n);
      if (startIdx !== -1 && endIdx !== -1) {
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        const range = allTeeth.slice(minIdx, maxIdx + 1);

        setSelectedTeeth(prev => prev.includes(n)
          ? prev.filter(t => !range.includes(t))
          : Array.from(new Set([...prev, ...range]))
        );
      }
    } else {
      if (selectionMode === 'inspect') {
        // Tekli İnceleme Modu: Sadece tıklanan dişi seç
        setSelectedTeeth(prev => (prev.length === 1 && prev[0] === n) ? [] : [n]);
      } else {
        // Çoklu / Toplu Seçim Modu: Tıklanan dişi ekle / çıkar
        setSelectedTeeth(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
      }
    }

    if (!e.shiftKey) {
      setLastSelectedTooth(n);
    }
  };

  // 2D ve 3D Odontogram için ortak sürükle-bırak tedavi atama yöneticisi
  const handleDropTreatment = (targets: Array<number | string>, treatmentData: any) => {
    if (!targets || targets.length === 0 || !treatmentData) return;

    const effectiveTargets = targets;

    // treatmentData JSON string veya iç içe nesne olarak geldiyse güvenle çöz
    let resolved = { ...treatmentData };
    if (typeof resolved.value === 'string') {
      try {
        const p = JSON.parse(resolved.value);
        resolved = { ...resolved, ...p };
      } catch (err) {
        console.error('handleDropTreatment JSON parse error:', err);
      }
    } else if (typeof resolved.value === 'object' && resolved.value !== null) {
      resolved = { ...resolved, ...resolved.value };
    }

    const { type, procedures, indications, activeMaterials, name, price, color, materials } = resolved;

    let procsToAdd: any[] = [];
    if (procedures && Array.isArray(procedures) && procedures.length > 0) {
      procsToAdd = procedures;
    } else if (name) {
      procsToAdd = [{ name, price: price || 0, color: color || '#3b82f6', materials: materials || [] }];
    }

    const indsToAdd: string[] = indications && Array.isArray(indications) ? indications : [];

    if (procsToAdd.length === 0 && indsToAdd.length === 0) {
      toast.error('Atanacak geçerli bir işlem veya endikasyon bulunamadı.');
      return;
    }

    const keysFor = (scope: TreatmentScope | undefined) => treatmentTargets(scope || 'tooth', effectiveTargets);

    setToothDrafts(prev => {
      const next = { ...prev };
      if (procsToAdd.length) {
        for (const proc of procsToAdd) for (const key of keysFor(proc.scope)) {
          next[key] = [...(next[key] || []), {
            id: Math.random().toString(36).substring(7), procedureId: proc.id, scope: proc.scope || 'tooth',
            name: proc.name, price: proc.price || 0, indications: [...indsToAdd], doctorId: defaultDoctorId,
            materials: [...((procsToAdd.length === 1 ? activeMaterials : undefined) || proc.materials || []).map((material: any) => ({ ...material }))],
            color: proc.color || '#3b82f6', surface: resolved.surface || toothSurfaces[Number(key)]?.join(''), section: resolved.section || toothSections[Number(key)],
          }];
        }
      } else for (const tooth of effectiveTargets) {
        const key = String(tooth);
        next[key] = [...(next[key] || [])];
        next[key].push({ id: Math.random().toString(36).substring(7), name: 'Belirtilmedi', price: 0,
          indications: [...indsToAdd], doctorId: defaultDoctorId, materials: [] });
      }
      return next;
    });

    const procNamesStr = procsToAdd.map(p => p.name).join(', ') || indsToAdd.join(', ');
    const teethStr = effectiveTargets.map(t => targetLabel(String(t))).join(', ');
    toast.success(`🎯 ${teethStr} için "${procNamesStr}" atandı.`);
  };

  const handlePrint = () => {
    if (!pricing) {
      toast.error('Fiyat veya iskonto geçersiz.');
      return;
    }
    const subtotal = pricing.subtotalMinor / 100;
    const actualDiscount = (pricing.percentageDiscountMinor + pricing.fixedDiscountMinor) / 100;
    const total = pricing.totalMinor / 100;
    const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));

    let rowsHtml = '';
    Object.entries(toothDrafts).forEach(([tooth, procedures]) => {
      const toothNum = Number(tooth);
      const surf = toothSurfaces[toothNum]?.length ? toothSurfaces[toothNum].join('') : '';
      const sec = toothSections[toothNum] || '';
      procedures.forEach(p => {
        const itemSurf = p.surface || surf;
        const itemSec = p.section || sec;
        const metaStr = [itemSurf ? `Yüzey: ${itemSurf}` : '', itemSec ? `Bölüm: ${itemSec}` : ''].filter(Boolean).join(' | ');
        const matSaleMinor = p.materials.reduce((sum, material) => sum + Number(material.quantity || 0) * Number(material.unitSalePriceMinor || 0), 0);
        const lineGross = (Math.round(p.price * 100) + matSaleMinor) / 100;
        rowsHtml += `
          <tr>
            <td style="padding: 4px 8px; border-bottom: 1px solid #ddd; font-weight: 600; font-size: 12px;">${escape(targetLabel(tooth))}</td>
            <td style="padding: 4px 8px; border-bottom: 1px solid #ddd; font-size: 12px;">
              ${escape(p.name)} ${metaStr ? `<b>[${escape(metaStr)}]</b>` : ''}
              ${p.indications.length > 0 ? `<br><small style="color: #666;">(${escape(p.indications.join(', '))})</small>` : ''}
              <br><small>Hekim: ${escape(doctors.find((doctor: any) => doctor.id === p.doctorId)?.name || 'Belirtilmedi')}</small>
              ${p.materials.length ? `<br><small>Malzemeler: ${escape(p.materials.map(material => `${material.name} × ${material.quantity}`).join(', '))}</small>` : ''}
            </td>
            <td style="padding: 4px 8px; border-bottom: 1px solid #ddd; text-align: right; font-size: 12px;">${lineGross.toLocaleString('tr-TR', { minimumFractionDigits: lineGross % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })} ₺</td>
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
          <div>Hasta: ${escape(patientInfo?.name || selectedEvent?.title || '')}</div>
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
        
        <div>Konsültasyon notu: ${escape(planNote)}</div>
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

  const executeTreatmentCommand = (treatments: any[]) => {
    if (!treatments || treatments.length === 0) return;

    // Yüzey ve Anatomik Bölüm güncellemelerini uygula
    treatments.forEach((t: any) => {
      const teeth = t.toothNumbers && t.toothNumbers.length > 0 ? t.toothNumbers : [];
      if (t.surfaces && Array.isArray(t.surfaces) && t.surfaces.length > 0) {
        teeth.forEach((tn: string) => {
          const num = Number(tn);
          if (num) setToothSurfaces(prev => ({ ...prev, [num]: t.surfaces }));
        });
      }
      if (t.section) {
        teeth.forEach((tn: string) => {
          const num = Number(tn);
          if (num) setToothSections(prev => ({ ...prev, [num]: t.section }));
        });
      }
    });

    setToothDrafts(prev => {
      const next = { ...prev };
      treatments.forEach((t: any) => {
        const teeth = t.toothNumbers && t.toothNumbers.length > 0 ? t.toothNumbers : ['general'];
        const surfStr = (t.surfaces && Array.isArray(t.surfaces) && t.surfaces.length > 0) ? t.surfaces.join('') : (t.surface || undefined);
        const secStr = t.section || undefined;
        
        if (t.intent === 'DELETE') {
          teeth.forEach((tn: string) => {
            if (t.procedureName) {
              const target = t.procedureName.toLowerCase();
              next[tn] = next[tn]?.filter(x => {
                const pName = x.name.toLowerCase();
                return !pName.includes(target) && !target.includes(pName);
              }) || [];
            } else {
              next[tn] = []; // Clear all procedures on this tooth
            }
            if (next[tn] && next[tn].length === 0) {
              delete next[tn];
            }
          });
        } else if (t.intent === 'UPDATE' || t.intent === 'EDIT') {
          teeth.forEach((tn: string) => {
            const procTemp = procTemplates.find(p => {
              const pName = p.name.toLowerCase();
              const targetName = (t.procedureName || '').toLowerCase();
              return pName === targetName || pName.includes(targetName) || targetName.includes(pName);
            });
            const procName = procTemp ? procTemp.name : (t.procedureName || 'Kompozit Dolgu (Tek Yüzey)');
            const procPrice = procTemp ? procTemp.price : (t.cost || 0);
            const procColor = procTemp ? procTemp.color : '#3b82f6';
            const procMaterials = procTemp ? procTemp.materials : [];
            const matchedIndication = t.indication 
              ? [indTemplates.find(i => i.toLowerCase() === t.indication?.toLowerCase()) || t.indication].filter(Boolean) as string[]
              : [];

            next[tn] = [{
              id: Math.random().toString(36).substring(2, 9),
              procedureId: procTemp?.id,
              scope: procTemp?.scope || (tn === 'general' ? 'mouth' : tn === 'upper' || tn === 'lower' ? 'jaw' : 'tooth'),
              name: procName,
              price: procPrice,
              indications: matchedIndication,
              doctorId: defaultDoctorId,
              materials: [...(procMaterials || []).map((m: any) => ({ ...m }))],
              color: procColor,
              surface: surfStr,
              section: secStr
            }];
          });
        } else {
          // ADD
          teeth.forEach((tn: string) => {
            next[tn] = next[tn] ? [...next[tn]] : [];
            if (t.procedureName) {
              const procTemp = procTemplates.find(p => {
                const pName = p.name.toLowerCase();
                const targetName = t.procedureName.toLowerCase();
                return pName === targetName || pName.includes(targetName) || targetName.includes(pName);
              });
              const procName = procTemp ? procTemp.name : t.procedureName;
              const procPrice = procTemp ? procTemp.price : (t.cost || 0);
              const procColor = procTemp ? procTemp.color : '#3b82f6';
              const procMaterials = procTemp ? procTemp.materials : [];

              const exists = next[tn].find(x => {
                const pName = x.name.toLowerCase();
                const targetName = procName.toLowerCase();
                return pName === targetName || pName.includes(targetName) || targetName.includes(pName);
              });

              if (!exists) {
                const matchedIndication = t.indication 
                  ? [indTemplates.find(i => i.toLowerCase() === t.indication?.toLowerCase()) || t.indication].filter(Boolean) as string[]
                  : [];
                next[tn].push({
                  id: Math.random().toString(36).substring(2, 9),
                  procedureId: procTemp?.id,
                  scope: procTemp?.scope || (tn === 'general' ? 'mouth' : tn === 'upper' || tn === 'lower' ? 'jaw' : 'tooth'),
                  name: procName,
                  price: procPrice,
                  indications: matchedIndication,
                  doctorId: defaultDoctorId,
                  materials: [...(procMaterials || []).map((m: any) => ({ ...m }))],
                  color: procColor,
                  surface: surfStr,
                  section: secStr
                });
              }
            } else if (t.indication) {
              if (next[tn].length > 0) {
                const indTemp = indTemplates.find(i => i.toLowerCase() === t.indication?.toLowerCase()) || t.indication;
                const lastProc = { ...next[tn][next[tn].length - 1] };
                if (indTemp && !lastProc.indications.includes(indTemp)) {
                  lastProc.indications = [...lastProc.indications, indTemp];
                  next[tn][next[tn].length - 1] = lastProc;
                }
              }
            }
          });
        }
      });
      return next;
    });
  };

  const undoTreatmentCommand = (treatments: any[]) => {
    if (!treatments || treatments.length === 0) return;
    setToothDrafts(prev => {
      const next = { ...prev };
      treatments.forEach((t: any) => {
        const teeth = t.toothNumbers && t.toothNumbers.length > 0 ? t.toothNumbers : ['general'];
        if (t.intent === 'ADD' || !t.intent) {
          teeth.forEach((tn: string) => {
            if (t.procedureName && next[tn]) {
              const target = t.procedureName.toLowerCase();
              next[tn] = next[tn].filter(x => {
                const pName = x.name.toLowerCase();
                return !pName.includes(target) && !target.includes(pName);
              });
              if (next[tn].length === 0) delete next[tn];
            }
          });
        }
      });
      return next;
    });
  };

  const cleanupAudioMonitor = () => {
    if (audioMonitorIntervalRef.current) {
      clearInterval(audioMonitorIntervalRef.current);
      audioMonitorIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      } catch {}
      micStreamRef.current = null;
    }
  };

  const stopListening = () => {
    isListeningRef.current = false;
    isVoiceStartingRef.current = false;
    hasVoiceFatalErrorRef.current = false;
    setIsListening(false);
    setIsVoiceStarting(false);
    if (triggerDebounceRef.current) clearTimeout(triggerDebounceRef.current);
    if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);
    triggerDebounceRef.current = null;
    silenceDebounceRef.current = null;
    if (recognitionRestartRef.current) clearTimeout(recognitionRestartRef.current);
    recognitionRestartRef.current = null;
    processedResultIndexRef.current = 0;
    pendingDentalPrefixRef.current = { text: '', updatedAt: 0 };
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    cleanupAudioMonitor();
    setTranscript('');
  };

  const handleModalClose = () => {
    if (saving) return;
    if (mediaUploading) { toast.error('Kapatmadan önce görüntü yüklemesini tamamlayın veya iptal edin.'); return; }
    if (hasUnsavedChanges) { setShowCloseDialog(true); return; }
    stopListening();
    onClose();
  };

  const processAICommand = async (text: string, fromVoice = false) => {
    if (!text || !text.trim() || isAnalyzingRef.current) return;
    const cleanText = normalizeDentalCommandNumbers(text).trim();
    if (!cleanText) return;
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    setTranscript(`⚙️ "${cleanText}" analiz ediliyor...`);

    try {
      const res = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          procNames: procTemplates.map(p => p.name),
          indNames: indTemplates
        })
      });
      const data = await res.json();
      if (data.result) {
        const { globalIntent, selectIntent, targetTeeth, treatments } = data.result;

        if (globalIntent === 'CONFIRM') {
          toast('Planı kaydetmek için Kaydet düğmesini kullanın.');
          return;
        }

        let executedAny = false;

        // 1. Seçim Komutları (Çene, Kadran veya Tüm Ağız)
        if (selectIntent && selectIntent !== 'NONE') {
          switch (selectIntent) {
            case 'SELECT_ALL':
              handleQuickSelect('all');
              toast.success('🦷 Tüm ağız (32 diş) seçildi.');
              executedAny = true;
              break;
            case 'SELECT_MAXILLA':
              handleQuickSelect('upper');
              toast.success('🦷 Üst çene (Maksilla) seçildi.');
              executedAny = true;
              break;
            case 'SELECT_MANDIBLE':
              handleQuickSelect('lower');
              toast.success('🦷 Alt çene (Mandibula) seçildi.');
              executedAny = true;
              break;
            case 'SELECT_Q1':
              handleQuickSelect('q1');
              toast.success('🦷 1. Kadran (Üst Sağ) seçildi.');
              executedAny = true;
              break;
            case 'SELECT_Q2':
              handleQuickSelect('q2');
              toast.success('🦷 2. Kadran (Üst Sol) seçildi.');
              executedAny = true;
              break;
            case 'SELECT_Q3':
              handleQuickSelect('q3');
              toast.success('🦷 3. Kadran (Alt Sol) seçildi.');
              executedAny = true;
              break;
            case 'SELECT_Q4':
              handleQuickSelect('q4');
              toast.success('🦷 4. Kadran (Alt Sağ) seçildi.');
              executedAny = true;
              break;
            case 'SELECT_ANTERIOR':
              handleQuickSelect('anterior');
              toast.success('🦷 Ön dişler (Anterior) seçildi.');
              executedAny = true;
              break;
            case 'SELECT_POSTERIOR':
              handleQuickSelect('posterior');
              toast.success('🦷 Arka dişler (Posterior) seçildi.');
              executedAny = true;
              break;
            case 'CLEAR_SELECTION':
              handleQuickSelect('clear');
              toast.success('✕ Tüm seçimler temizlendi.');
              executedAny = true;
              break;
            case 'SELECT_TEETH':
              const selectedByCommand = targetTeeth?.length
                ? targetTeeth
                : (treatments || []).flatMap((t: any) => t.toothNumbers || []);
              if (selectedByCommand.length > 0) {
                setSelectedTeeth(selectedByCommand.map(Number));
                toast.success(`🦷 Dişler seçildi: ${selectedByCommand.join(', ')}`);
                executedAny = true;
              }
              break;
          }
        }

        // Sesli komutla belirtilen tedavileri uygula.
        if (treatments && treatments.length > 0) {
          const validTargets = new Set([...UPPER_TEETH, ...LOWER_TEETH, 'general', 'upper', 'lower'].map(String));
          const valid = Array.isArray(treatments) && treatments.every((item: any) =>
            (!item.intent || ['ADD', 'UPDATE', 'EDIT', 'DELETE'].includes(item.intent)) &&
            Array.isArray(item.toothNumbers) && item.toothNumbers.length > 0 &&
            item.toothNumbers.every((number: unknown) => validTargets.has(String(number))));
          if (!valid) {
            toast.error('Komut güvenli şekilde eşleştirilemedi. İşlemi elle düzenleyin.');
            stopListening();
            return;
          }
          stopListening();
          const hasDeleteOrUpdate = treatments.some((item: any) => item.intent === 'DELETE' || item.intent === 'UPDATE' || item.intent === 'EDIT');
          if (hasDeleteOrUpdate) {
            executeTreatmentCommand(treatments);
          } else {
            for (const item of treatments) {
              const normTarget = (item.procedureName || '').toLocaleLowerCase('tr-TR').trim();
              const procedure = procTemplates.find(proc => {
                const pName = proc.name.toLocaleLowerCase('tr-TR').trim();
                return pName === normTarget || pName.includes(normTarget) || (normTarget && normTarget.includes(pName));
              });
              const resolvedProcedure = procedure || (item.procedureName ? {
                id: undefined,
                name: item.procedureName,
                price: item.cost || 0,
                scope: item.toothNumbers.includes('general') ? 'mouth' : (item.toothNumbers.includes('upper') || item.toothNumbers.includes('lower')) ? 'jaw' : 'tooth',
                color: '#0284c7',
                materials: [],
              } : null);
              const normalizedTargets = item.toothNumbers.map((tn: any) => {
                const n = Number(tn);
                return Number.isInteger(n) && n >= 11 && n <= 48 ? n : String(tn);
              });
              handleDropTreatment(normalizedTargets, {
                procedures: resolvedProcedure ? [resolvedProcedure] : [],
                indications: item.indication ? [item.indication] : [],
                surface: Array.isArray(item.surfaces) ? item.surfaces.join('') : undefined,
                section: item.section,
              });
            }
          }
          const affectedTeeth = treatments.flatMap((t: any) => (t.toothNumbers || []).map(Number)).filter((n: number) => Number.isInteger(n) && n >= 11 && n <= 48);
          if (affectedTeeth.length > 0) {
            setSelectedTeeth(prev => Array.from(new Set([...prev, ...affectedTeeth])));
          }

          toast.success(`✅ Komut uygulandı: "${cleanText}"`);
          executedAny = true;
        }

        if (!executedAny) {
          if (!fromVoice) {
            toast.error(`"${cleanText}" için işlem veya diş tespit edilemedi.`);
          }
        } else if (treatments && treatments.length > 0) {
          stopListening();
          toast.success('Taslak güncellendi, dinleme kapatıldı.');
        }
      } else if (!fromVoice) {
        toast.error("Komut çözümlenemedi.");
      }
    } catch (err) {
      console.error("processAICommand error:", err);
      if (!fromVoice) {
        toast.error("Asistan yanıtı alınırken bir hata oluştu.");
      }
    } finally {
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
      pendingDentalPrefixRef.current = { text: '', updatedAt: 0 };
      if (isListeningRef.current) {
        setTranscript("🎙️ Dinleniyor... Yeni komut söyleyebilirsiniz.");
      } else {
        setTranscript("");
      }
    }
  };

  // Türkçe yazıyla söylenen diş numaralarını ("on altı" -> "16"), bitişik FDI sayılarını ("1617 18" -> "16 17 18")
  // ve ilk hecesi yutulmuş ardışık diş serilerini ("6 17 18" -> "16 17 18") normalize eder.
  const normalizeDentalCommandNumbers = (rawText: string): string => {
    if (!rawText) return '';
    let text = rawText;

    const tensMap: Record<string, number> = {
      'on': 10,
      'yirmi': 20,
      'otuz': 30,
      'kırk': 40,
      'kirk': 40,
    };
    const onesMap: Record<string, number> = {
      'bir': 1,
      'iki': 2,
      'üç': 3,
      'uc': 3,
      'dört': 4,
      'dort': 4,
      'beş': 5,
      'bes': 5,
      'altı': 6,
      'alti': 6,
      'yedi': 7,
      'sekiz': 8,
    };

    for (const [tenWord, tenVal] of Object.entries(tensMap)) {
      for (const [oneWord, oneVal] of Object.entries(onesMap)) {
        const fdi = String(tenVal + oneVal);
        const pattern = new RegExp(`(?<=^|[\\s,.;:!?()\\-])${tenWord}\\s*${oneWord}(?=$|[\\s,.;:!?()\\-])`, 'gi');
        text = text.replace(pattern, fdi);
      }
    }

    // Ardışık FDI diş numarasından hemen önce tek başına yazıyla kalmış rakam ("altı 17 18" -> "6 17 18")
    for (const [oneWord, oneVal] of Object.entries(onesMap)) {
      const singleBeforeFdi = new RegExp(`(?<=^|[\\s,.;:!?()\\-])${oneWord}(?=\\s+[1-4][1-8](?=$|[\\s,.;:!?()\\-]))`, 'gi');
      text = text.replace(singleBeforeFdi, String(oneVal));
    }

    // Bitişik yazılmış FDI diş numaralarını ayır ("1617 18" -> "16 17 18", "161718" -> "16 17 18")
    text = text.replace(/\b((?:[1-4][1-8]){2,8})\b/g, (match) => {
      const pairs: string[] = [];
      for (let i = 0; i < match.length; i += 2) {
        pairs.push(match.slice(i, i + 2));
      }
      return pairs.join(' ');
    });

    // Başlangıçta onlar basamağı yutulmuş ardışık diş serisini tamamla ("6 17 18" -> "16 17 18")
    text = text.replace(/\b([1-8])\s+(([1-4])([1-8]))\b/g, (full, firstDigitStr, secondFdi, quadrantStr, secondUnitStr) => {
      const firstDigit = Number(firstDigitStr);
      const secondUnit = Number(secondUnitStr);
      if (Math.abs(firstDigit - secondUnit) === 1) {
        return `${quadrantStr}${firstDigit} ${secondFdi}`;
      }
      return full;
    });

    // İlk FDI dişten sonra birler basamağı olarak devam eden ardışık seriyi tamamla ("16 7 8" -> "16 17 18")
    for (let pass = 0; pass < 3; pass++) {
      text = text.replace(/\b(([1-4])([1-8]))\s+([1-8])\b(?!\s*(?:tl|lira|₺|bin|yüz|kanal|yüzey))/gi, (full, firstFdi, quadrantStr, firstUnitStr, nextDigitStr) => {
        const firstUnit = Number(firstUnitStr);
        const nextDigit = Number(nextDigitStr);
        if (Math.abs(nextDigit - firstUnit) === 1) {
          return `${firstFdi} ${quadrantStr}${nextDigit}`;
        }
        return full;
      });
    }

    return text.replace(/\s+/g, ' ').trim();
  };

  // Ses Metnini Temizleme & Normalize Etme (Türkçe kesme işaretleri ' ve noktalama temizliği)
  const normalizeSpeechText = (text: string) => {
    if (!text) return '';
    return normalizeDentalCommandNumbers(
      text
        .toLocaleLowerCase('tr-TR')
        .replace(/['’`´]/g, '') // Kesme işaretlerini kaldır: asistan'ı -> asistanı
        .replace(/[-_.,!?:;]/g, ' ') // Noktalamaları boşluğa çevir
    )
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Kapatma/Durdurma eylemleri: "asistanı kapat", "asistan'ı kapat", "dinlemeyi kapat", "mikrofonu kapat" vb.
  const CLOSE_PATTERNS = [
    'asistanı kapat', 'asistani kapat', 'asistan kapat',
    'asistanı durdur', 'asistani durdur', 'asistan durdur',
    'dinlemeyi kapat', 'dinleme kapat', 'dinlemeyi durdur', 'dinleme durdur', 'dinlemeyi bitir', 'dinleme bitir',
    'mikrofonu kapat', 'mikrofon kapat', 'mikrofonu durdur', 'mikrofon durdur',
    'sesi kapat', 'ses kapat', 'kapat asistanı', 'kapat asistan', 'kapat dinlemeyi', 'dinleme dur',
    'asistanı sonlandır', 'dinlemeyi sonlandır'
  ];

  const checkCloseTrigger = (text: string) => {
    if (!text) return false;
    const norm = normalizeSpeechText(text);
    if (!norm) return false;

    // Tek başına "kapat" veya "durdur" dendiğinde
    if (norm === 'kapat' || norm === 'durdur') {
      return true;
    }

    // Kalıp eşleşmesi
    if (CLOSE_PATTERNS.some(p => norm.includes(p))) {
      return true;
    }

    // (asistan / dinleme / mikrofon / ses) + (kapat / durdur / bitir / sonlandır) ikilisi
    const hasSubject = /(?:^|\s)(asistan|asistanı|asistani|dinleme|dinlemeyi|mikrofon|mikrofonu|ses|sesi)(?=$|\s)/i.test(norm);
    const hasCloseVerb = /(?:^|\s)(kapat|kapatılsın|durdur|durdurulsun|bitir|bitirilsin|sonlandır)(?=$|\s)/i.test(norm);
    return Boolean(hasSubject && hasCloseVerb);
  };

  // Doğrudan dental komut eylemleri (Günlük sohbette geçen "olsun", "yapalım", "koy", "yaz", "bitir" gibi kelimeler çıkarıldı)
  const ACTION_KEYWORDS = [
    'ekle', 'eklensin', 'ekleyelim', 'ekler misin', 'uygula', 'uygulansın',
    'sil', 'silinsin', 'silelim', 'kaldır', 'kaldırılsın', 'çıkar', 'çıkart', 'iptal et', 'seçimi temizle', 'seçimleri temizle', 'seçimleri kaldır',
    'düzenle', 'düzenlensin', 'güncelle', 'güncellensin', 'değiştir', 'değiştirilsin',
    'seç', 'seçilsin', 'işaretle',
    'planı kaydet', 'tedaviyi kaydet', 'işlemleri kaydet', 'planı onayla', 'işlemleri onayla', 'kaydet', 'onayla'
  ];

  // Dental domain sözlüğü: ortam konuşmasını gerçek dental komuttan ayırmak için kullanılır
  const DENTAL_DOMAIN_TERMS = [
    'dolgu', 'kompozit', 'amalgam', 'kanal', 'endodonti', 'çekim', 'çek', 'implant', 'zirkonyum',
    'kuron', 'kron', 'kaplama', 'köprü', 'protez', 'detertraj', 'tartır', 'diş taşı', 'temizlik', 'temizliği',
    'inley', 'onlay', 'overlay', 'veneer', 'lamina', 'porselen', 'beyazlatma', 'bleaching', 'rezeksiyon',
    'apeksifikasyon', 'kistektomi', 'alveoloplasti', 'gingival', 'periodontoloji', 'ortodonti', 'flor',
    'oklüzal', 'mezyal', 'distal', 'bukkal', 'vestibüler', 'lingual', 'palatinal', 'mod', 'kole', 'servikal', 'kök',
    'çürük', 'kırık', 'lezyon', 'apikal', 'pulpitis', 'abse', 'enfeksiyon', 'eksik diş', 'estetik',
    'üst çene', 'alt çene', 'tüm ağız', 'tüm dişler', 'bütün dişler', 'maksilla', 'mandibula',
    'kadran', 'anterior', 'posterior', 'ön dişler', 'arka dişler', 'azı dişleri', 'kesici dişler',
    'seçimi temizle', 'seçimleri temizle', 'seçimleri kaldır', 'seçimleri sıfırla',
    'diyabet', 'hipertansiyon', 'astım', 'alerji', 'konsültasyon', 'kardiyoloji',
    'planı kaydet', 'tedaviyi kaydet', 'işlemleri kaydet', 'planı onayla', 'işlemleri onayla'
  ];

  // Bir metin parçasında FDI diş numarası (11-48) olup olmadığını kontrol eder
  const hasFdiToothNumber = (text: string): boolean => {
    const norm = normalizeSpeechText(text);
    return /\b[1-4][1-8]\b/.test(norm);
  };

  // Bir metin parçasında bilinen işlem, endikasyon, yüzey veya çene/bölge terimi olup olmadığını kontrol eder
  const hasDentalTerm = (text: string): boolean => {
    const norm = normalizeSpeechText(text);
    if (!norm) return false;
    if (DENTAL_DOMAIN_TERMS.some(term => norm.includes(term))) return true;
    const dynamicProcs = procTemplates.map(p => normalizeSpeechText(p.name)).filter(Boolean);
    if (dynamicProcs.some(p => norm.includes(p))) return true;
    const dynamicInds = indTemplates.map(i => normalizeSpeechText(i)).filter(Boolean);
    if (dynamicInds.some(i => norm.includes(i))) return true;
    return false;
  };

  // Segmentin dental bir komut parçası (diş no, işlem, seçim veya kontrol komutu) olup olmadığını belirler
  const hasDentalDomainSignal = (text: string): boolean => {
    if (!text) return false;
    const norm = normalizeSpeechText(text);
    if (!norm) return false;
    if (checkCloseTrigger(norm)) return true;
    if (hasFdiToothNumber(norm) || hasDentalTerm(norm)) return true;
    if (norm === 'kaydet' || norm === 'onayla') return true;
    return false;
  };

  // Cümle başında hasta-hekim sohbeti varsa ("ağzınızı açın bakalım 16 17 18 kompozit dolgu ekle"),
  // ilk dental çapa kelimesinden ("16", "tüm", "üst", "alt", "sağ", "sol", işlem adı vb.) öncesini kırpar.
  const extractDentalCommandClause = (text: string): string => {
    const normalized = normalizeDentalCommandNumbers(text);
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length <= 3) return normalized;

    const anchorPrefixes = new Set([
      'tüm', 'tum', 'bütün', 'butun', 'üst', 'ust', 'alt', 'sağ', 'sag', 'sol',
      'birinci', 'ikinci', 'üçüncü', 'ucuncu', 'dördüncü', 'dorduncu', '1', '2', '3', '4',
      'ön', 'on', 'arka', 'diş', 'dis', 'seçimi', 'secimi', 'seçimleri', 'secimleri',
      'planı', 'plani', 'tedaviyi', 'işlemleri', 'islemleri', 'asistan', 'asistanı', 'dinlemeyi', 'mikrofonu'
    ]);

    for (let i = 0; i < words.length; i++) {
      const cleanW = words[i].toLocaleLowerCase('tr-TR').replace(/['’`´.,!?:;-]/g, '');
      // FDI diş numarası (11-48)
      if (/^[1-4][1-8]$/.test(cleanW)) {
        // Hemen öncesinde "sağ üst", "diş", "numara" gibi niteleyici varsa onu da koru
        let startIdx = i;
        while (startIdx > 0) {
          const prevW = words[startIdx - 1].toLocaleLowerCase('tr-TR').replace(/['’`´.,!?:;-]/g, '');
          if (anchorPrefixes.has(prevW) || /^[1-4][1-8]$/.test(prevW) || prevW === 've' || prevW === 'ile') {
            startIdx--;
          } else {
            break;
          }
        }
        return words.slice(startIdx).join(' ');
      }
      // Bilinen dental çapa veya terimle başlıyorsa
      if (anchorPrefixes.has(cleanW) || hasDentalTerm(cleanW)) {
        return words.slice(i).join(' ');
      }
    }

    return normalized;
  };

  // Yalnızca geçerli bir dental varlık (diş no / işlem / bölge) + açık komut eylemi varsa tetikleyici döndürür.
  // Böylece sessiz veya gürültülü mekandaki günlük konuşmalar ("şöyle yapalım", "geçmiş olsun" vb.) asla komut olarak eklenmez.
  const checkActionTrigger = (text: string) => {
    if (!text) return null;
    const norm = normalizeSpeechText(text);
    if (!norm) return null;

    // Tek başına veya açık kalıpla kaydet/onayla/temizle
    if (
      /(?:^|\s)(planı kaydet|tedaviyi kaydet|işlemleri kaydet|planı onayla|işlemleri onayla|seçimi temizle|seçimleri temizle|seçimleri kaldır)(?=$|\s)/i.test(norm) ||
      ((norm === 'kaydet' || norm === 'onayla') && norm.split(' ').length <= 2)
    ) {
      return 'kaydet';
    }

    // Diğer tüm eylemler için metinde en az bir FDI diş numarası VEYA dental terim bulunması zorunludur
    if (!hasFdiToothNumber(norm) && !hasDentalTerm(norm)) {
      return null;
    }

    for (const kw of ACTION_KEYWORDS) {
      const regex = new RegExp(`(^|\\s)${kw}($|\\s)`, 'i');
      if (regex.test(norm)) {
        return kw;
      }
    }

    // Diş numarası + bilinen işlem birlikte söylenmişse ve sonunda "yap" / "yaz" dendiyse kabul et
    if (hasFdiToothNumber(norm) && hasDentalTerm(norm) && /(?:^|\s)(yap|yapılsın|yaz|yazılsın)(?=$|\s)/i.test(norm)) {
      return 'ekle';
    }

    return null;
  };

  const getVoiceErrorMessage = (error: string) => {
    const messages: Record<string, string> = {
      'not-allowed': 'Mikrofon izni reddedildi. Tarayıcının adres çubuğundan bu site için mikrofonu izinli yapın ve işletim sistemi mikrofon ayarlarını kontrol edin.',
      'audio-capture': 'Kullanılabilir bir mikrofon bulunamadı. Mikrofonun bağlı ve başka bir uygulama tarafından kullanılmıyor olduğundan emin olun.',
      'service-not-allowed': 'Tarayıcının konuşma tanıma servisine erişimine izin verilmiyor. Chrome veya Edge ayarlarını kontrol edip yeniden deneyin.',
      'network': 'Konuşma tanıma servisine ulaşılamadı. Ağ bağlantısını kontrol edip yeniden deneyin.',
    };
    return messages[error] || 'Sesli komut başlatılamadı. Lütfen yeniden deneyin.';
  };

  const toggleListening = async () => {
    if (isListeningRef.current) {
      stopListening();
      return;
    }
    if (isVoiceStartingRef.current) return;

    try {
      isVoiceStartingRef.current = true;
      setIsVoiceStarting(true);
      setVoiceError(null);
      if (!window.isSecureContext) {
        const message = 'Sesli komut güvenli bir bağlantıda çalışır. Localhost veya HTTPS üzerinden yeniden deneyin.';
        setVoiceError(message);
        toast.error(message);
        isVoiceStartingRef.current = false;
        setIsVoiceStarting(false);
        return;
      }
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        const message = 'Tarayıcınız ses tanımayı desteklemiyor. Chrome veya Edge kullanın.';
        setVoiceError(message);
        toast.error(message);
        isVoiceStartingRef.current = false;
        setIsVoiceStarting(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        const message = 'Tarayıcı mikrofon erişimini desteklemiyor.';
        setVoiceError(message);
        toast.error(message);
        isVoiceStartingRef.current = false;
        setIsVoiceStarting(false);
        return;
      }

      // Mikrofonu gürültü/eko engelleme ile aç ve dinleme boyunca sıcak (warm) tut.
      // (Açıp hemen kapatmak işletim sistemi ses sürücüsünde 300-500ms cold-start kaybına yol açıp ilk "16" sayısını yutuyordu.)
      cleanupAudioMonitor();
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        }
      });
      micStreamRef.current = micStream;

      // Web Audio API ile insan sesi bandında (85Hz - 3400Hz) yakın-alan (near-field) SNR / enerji takibi
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(micStream);

          const highpass = audioCtx.createBiquadFilter();
          highpass.type = 'highpass';
          highpass.frequency.value = 85;

          const lowpass = audioCtx.createBiquadFilter();
          lowpass.type = 'lowpass';
          lowpass.frequency.value = 3400;

          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.3;

          source.connect(highpass);
          highpass.connect(lowpass);
          lowpass.connect(analyser);

          const timeData = new Float32Array(analyser.fftSize);
          noiseFloorRmsRef.current = 0.008;
          lastNearFieldSpeechAtRef.current = Date.now();
          peakUtteranceRmsRef.current = 0;

          audioMonitorIntervalRef.current = setInterval(() => {
            if (!isListeningRef.current) return;
            analyser.getFloatTimeDomainData(timeData);
            let sumSq = 0;
            for (let i = 0; i < timeData.length; i++) {
              sumSq += timeData[i] * timeData[i];
            }
            const rms = Math.sqrt(sumSq / timeData.length);
            const floor = noiseFloorRmsRef.current;

            // Ortam gürültü tabanını yavaşça adapte et
            if (rms < floor * 1.5) {
              noiseFloorRmsRef.current = Math.max(0.002, Math.min(0.06, floor * 0.94 + rms * 0.06));
            } else {
              noiseFloorRmsRef.current = Math.max(0.002, Math.min(0.06, floor * 0.992 + rms * 0.008));
            }

            // Mikrofona yakın konuşma enerjisi (ortam gürültüsünün en az 1.8 katı ve minimum eşik üstü)
            if (rms > Math.max(0.011, noiseFloorRmsRef.current * 1.8)) {
              lastNearFieldSpeechAtRef.current = Date.now();
              if (rms > peakUtteranceRmsRef.current) {
                peakUtteranceRmsRef.current = rms;
              }
            }
          }, 60);
        }
      } catch (audioErr) {
        console.warn('Web Audio near-field monitor init skipped:', audioErr);
      }

      hasVoiceFatalErrorRef.current = false;
      processedResultIndexRef.current = 0;
      pendingDentalPrefixRef.current = { text: '', updatedAt: 0 };

      const recognition = new SpeechRecognition();
      recognition.lang = 'tr-TR';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
        isVoiceStartingRef.current = false;
        setIsVoiceStarting(false);
        setVoiceError(null);
        processedResultIndexRef.current = 0;
        setTranscript("🎙️ Dinleniyor... (Örn: '16 17 18 kompozit dolgu ekle', 'asistanı kapat')");
      };

      recognition.onresult = (event: any) => {
        const now = Date.now();
        // Gürültülü ortamda uzaktan gelen çok düşük güvenli (confidence) ve düşük enerjili arka plan seslerini ele
        const latestRes = event.results[event.results.length - 1];
        const latestConfidence = latestRes?.[0]?.confidence ?? 1;
        const hasRecentNearFieldVoice = (now - lastNearFieldSpeechAtRef.current) < 4500;
        if (latestRes?.isFinal && latestConfidence > 0 && latestConfidence < 0.38 && !hasRecentNearFieldVoice) {
          processedResultIndexRef.current = event.results.length;
          return;
        }

        // ÖNEMLİ: event.resultIndex'ten değil, son işlenen/temizlenen indeksten (processedResultIndexRef) başla!
        // Böylece "16" (results[0], isFinal=true) söylendikten sonra "17 18 kompozit dolgu ekle" (results[1], resultIndex=1)
        // geldiğinde baştaki "16" ASLA kaybolmaz.
        let startIdx = Math.min(processedResultIndexRef.current, event.results.length);
        const keptParts: string[] = [];
        let interimText = '';

        for (let i = startIdx; i < event.results.length; i++) {
          const res = event.results[i];
          const segText = (res[0]?.transcript || '').trim();
          if (!segText) continue;

          // Herhangi bir segmentte kapatma komutu varsa anında kapat
          if (checkCloseTrigger(segText)) {
            stopListening();
            toast('🛑 Sesli asistan dinlemeyi kapattı.', { icon: '🎙️' });
            return;
          }

          if (res.isFinal) {
            // Eğer bu tamamlanmış cümle hiçbir diş numarası veya dental terim içermiyorsa (günlük sohbet / ortam konuşması)
            // ve henüz başlamış bir dental komut önekimiz yoksa, bu sohbeti anında atla.
            if (keptParts.length === 0 && !pendingDentalPrefixRef.current.text && !hasDentalDomainSignal(segText)) {
              processedResultIndexRef.current = i + 1;
              continue;
            }
            keptParts.push(segText);
          } else {
            interimText += segText + ' ';
          }
        }

        // Eğer önceki oturumdan (anlık restart öncesi) kalan taze (12 sn içinde) bir diş/komut öneki varsa (örn. "16") birleştir
        const prefixAlive =
          pendingDentalPrefixRef.current.text &&
          now - pendingDentalPrefixRef.current.updatedAt < 12000;

        const combinedRaw = [
          prefixAlive ? pendingDentalPrefixRef.current.text : '',
          ...keptParts,
          interimText.trim()
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (!combinedRaw) return;

        // 1. Kullanıcı "asistanı kapat" / "dinlemeyi kapat" dediyse anında dinlemeyi sonlandır
        if (checkCloseTrigger(combinedRaw)) {
          stopListening();
          toast('🛑 Sesli asistan dinlemeyi kapattı.', { icon: '🎙️' });
          return;
        }

        // Halihazırda bir komut AI tarafından işleniyorsa, o komuta ait artçı onresult/isFinal event'lerini tüket ve çık
        if (isAnalyzingRef.current) {
          processedResultIndexRef.current = event.results.length;
          pendingDentalPrefixRef.current = { text: '', updatedAt: 0 };
          return;
        }

        const normalizedCombined = normalizeDentalCommandNumbers(combinedRaw);

        // Eğer şu ana kadar söylenen metinde hiçbir dental sinyal (diş no, işlem, çene, kaydet vb.) yoksa
        // ortam sohbetini ekrana veya AI'ya taşıma
        if (!hasDentalDomainSignal(normalizedCombined)) {
          return;
        }

        // Başında sohbet kalıntısı varsa sadece dental komut kısmını ayıkla
        const commandText = extractDentalCommandClause(normalizedCombined);
        setTranscript(commandText);

        // Eğer yalnızca diş numaraları veya başlangıç parçası söylendiyse (örn. "16" veya "16 17")
        // olası bir duraksama/restartta kaybolmaması için önekte sakla
        if (keptParts.length > 0 && !interimText.trim()) {
          pendingDentalPrefixRef.current = {
            text: commandText,
            updatedAt: now
          };
          processedResultIndexRef.current = event.results.length;
        }

        if (commandText === lastProcessedTextRef.current) return;

        if (triggerDebounceRef.current) clearTimeout(triggerDebounceRef.current);
        if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);

        const matchedKeyword = checkActionTrigger(commandText);
        const isLastSegmentFinal = Boolean(latestRes?.isFinal);

        if (matchedKeyword) {
          // Tetikleyici kelime ("ekle", "sil", "düzenle", "seç", "kaydet" vb.) + dental varlık doğrulandı.
          // Son segment henüz interim (geçici) ise cümlenin kesilmemesi için 450ms, final ise 140ms bekle.
          const delay = isLastSegmentFinal ? 140 : 450;
          triggerDebounceRef.current = setTimeout(() => {
            if (!isAnalyzingRef.current && commandText && commandText !== lastProcessedTextRef.current) {
              lastProcessedTextRef.current = commandText;
              processedResultIndexRef.current = event.results.length;
              pendingDentalPrefixRef.current = { text: '', updatedAt: 0 };
              processAICommand(commandText, true);
            }
          }, delay);
        } else if (
          (hasFdiToothNumber(commandText) && hasDentalTerm(commandText)) ||
          /(?:^|\s)(tüm ağız|tüm dişler|bütün dişler|tüm üst|üst çene|tüm alt|alt çene|birinci kadran|ikinci kadran|üçüncü kadran|dördüncü kadran|sağ üst kadran|sol üst kadran|sol alt kadran|sağ alt kadran|ön dişler|arka dişler)(?=$|\s)/i.test(normalizeSpeechText(commandText))
        ) {
          // Kullanıcı sonunda "ekle" demeden "16 17 18 kompozit dolgu" veya "21 zirkonyum kuron" dediyse
          // 1.35 sn doğal sessizlik sonrasında komutu işle.
          silenceDebounceRef.current = setTimeout(() => {
            if (!isAnalyzingRef.current && commandText && commandText !== lastProcessedTextRef.current) {
              lastProcessedTextRef.current = commandText;
              processedResultIndexRef.current = event.results.length;
              pendingDentalPrefixRef.current = { text: '', updatedAt: 0 };
              processAICommand(commandText, true);
            }
          }, 1350);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          return;
        }
        console.error("Speech recognition error", event.error);
        const isFatal = ['not-allowed', 'audio-capture', 'service-not-allowed'].includes(event.error);
        const message = getVoiceErrorMessage(event.error);
        isVoiceStartingRef.current = false;
        setIsVoiceStarting(false);
        setVoiceError(message);
        if (isFatal) {
          hasVoiceFatalErrorRef.current = true;
          isListeningRef.current = false;
          setIsListening(false);
          cleanupAudioMonitor();
          toast.error(message, { duration: 7000 });
        }
      };

      recognition.onend = () => {
        if (isListeningRef.current && !hasVoiceFatalErrorRef.current) {
          recognitionRestartRef.current = setTimeout(() => {
            if (!isListeningRef.current || hasVoiceFatalErrorRef.current) return;
            processedResultIndexRef.current = 0;
            try { recognition.start(); } catch (err) { console.warn('Speech recognition restart failed', err); }
          }, 180);
        } else {
          setIsListening(false);
          setTranscript("");
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error(err);
      const errorName = err?.name === 'NotFoundError' ? 'audio-capture' : err?.name === 'NotAllowedError' ? 'not-allowed' : 'unknown';
      const message = getVoiceErrorMessage(errorName);
      hasVoiceFatalErrorRef.current = true;
      isListeningRef.current = false;
      isVoiceStartingRef.current = false;
      setIsListening(false);
      setIsVoiceStarting(false);
      setVoiceError(message);
      cleanupAudioMonitor();
      toast.error(message, { duration: 7000 });
    }
  };

  useEffect(() => () => {
    isListeningRef.current = false;
    isVoiceStartingRef.current = false;
    if (triggerDebounceRef.current) clearTimeout(triggerDebounceRef.current);
    if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);
    if (recognitionRestartRef.current) clearTimeout(recognitionRestartRef.current);
    try { recognitionRef.current?.abort(); } catch {}
    cleanupAudioMonitor();
  }, []);

  // The historical command panel is no longer reachable from the UI. These
  // handlers remain during the transition because the legacy panel markup is
  // retained below the header and TypeScript still validates it.
  const applyCommand = (commandId: string) => {
    const command = commandHistory.find(item => item.id === commandId);
    if (!command) return;
    executeTreatmentCommand(command.treatments);
    setCommandHistory(previous => previous.map(item => item.id === commandId ? { ...item, status: 'applied' } : item));
  };

  const undoCommand = (commandId: string) => {
    const command = commandHistory.find(item => item.id === commandId);
    if (!command) return;
    undoTreatmentCommand(command.treatments);
    setCommandHistory(previous => previous.map(item => item.id === commandId ? { ...item, status: 'rejected' } : item));
  };

  const deleteCommand = (commandId: string) => {
    setCommandHistory(previous => previous.filter(item => item.id !== commandId));
  };

  const handleSaveEditCommand = async (commandId: string) => {
    if (!editingCommandText.trim()) return;
    const command = commandHistory.find(item => item.id === commandId);
    if (command) undoTreatmentCommand(command.treatments);
    const text = editingCommandText.trim();
    setEditingCommandId(null);
    setEditingCommandText('');
    setCommandHistory(previous => previous.filter(item => item.id !== commandId));
    await processAICommand(text);
  };

  const handleSave = async ({ closeAfter = true, allowEmpty = false }: { closeAfter?: boolean; allowEmpty?: boolean } = {}) => {
    if (savingRef.current || planLoading || planLoadError || baseDataLoading || baseDataError) return;
    if (mediaUploading) { toast.error('Planı kaydetmeden önce görüntü yüklemesini tamamlayın veya iptal edin.'); return; }
    if (!groupName.trim()) { toast.error('Plan adı gereklidir.'); return; }
    if (!allowEmpty && Object.values(toothDrafts).every(items => !items.length)) {
      toast.error('Önce işlem veya endikasyon ekleyin.'); return;
    }
    if (!pricing) { toast.error('Fiyat, malzeme miktarı veya iskonto geçersiz.'); return; }
    if (selectedEvent?.startTime) {
      const date = new Date(selectedEvent.startTime).toLocaleDateString('sv');
      const minutes = new Date(selectedEvent.startTime).getHours() * 60 + new Date(selectedEvent.startTime).getMinutes();
      for (const proc of Object.values(toothDrafts).flat()) {
        if (proc.locked) continue;
        const doctorId = proc.doctorId || defaultDoctorId || selectedEvent.doctorId;
        if (!doctorId) continue;
        const matching = (shifts || []).filter((shift: any) => shift.userId === doctorId && shift.date === date);
        if (matching.length > 0) {
          const covered = matching.some((shift: any) => {
            const [startHour, startMinute] = (shift.startTime || '00:00').split(':').map(Number);
            const [endHour, endMinute] = (shift.endTime || '23:59').split(':').map(Number);
            return minutes >= startHour * 60 + startMinute && minutes <= endHour * 60 + endMinute;
          });
          if (!covered) {
            const name = doctors.find((doctor: any) => doctor.id === doctorId)?.name || 'Seçilen hekim';
            toast.error(`${name} için bu randevu saatinde vardiya bulunmuyor.`); return;
          }
        }
      }
    }
    const phoneMissing = notifyPatient && notificationChannels(notificationType).some(channel => channel !== 'email') && !(contactOverride || patientInfo)?.phone;
    const emailMissing = notifyPatient && notificationChannels(notificationType).includes('email') && !(contactOverride || patientInfo)?.email;
    if (phoneMissing && !missingPhone.trim()) { toast.error('Telefon numarası gereklidir.'); return; }
    if (emailMissing && !missingEmail.trim()) { toast.error('E-posta adresi gereklidir.'); return; }

    savingRef.current = true;
    setSaving(true);
    try {
      if (notifyPatient && (missingPhone.trim() || missingEmail.trim())) {
        const response = await fetch(`/api/dental/patients/${selectedEvent.patientId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: missingPhone.trim() || undefined, email: missingEmail.trim() || undefined }),
        });
        if (!response.ok) throw new Error('Hasta iletişim bilgileri kaydedilemedi.');
      }
      let dcmUrl = savedDcmUrl;
      if (treatmentDcmFile) {
        const formData = new FormData();
        formData.append('file', treatmentDcmFile);
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/dental/upload-dcm`, { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Radyoloji dosyası yüklenemedi.');
        dcmUrl = (await response.json()).url;
      }
      const date = new Date();
      date.setDate(date.getDate() + periodDays);
      const treatments = Object.entries(toothDrafts).flatMap(([tooth, procedures]) => procedures.map(proc => {
        const number = Number(tooth);
        const surface = proc.surface || toothSurfaces[number]?.join('') || '';
        const section = proc.section || toothSections[number] || '';
        const tags = [surface && `Yüzey: ${surface}`, section && `Bölüm: ${section}`].filter(Boolean);
        const indication = [proc.indications.join(', '), tags.length ? `[${tags.join(' | ')}]` : ''].filter(Boolean).join(' ');
        const existing = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(proc.id);
        return {
          id: existing ? proc.id : undefined,
          procedureName: proc.name, toothNumber: tooth, indication: proc.locked ? (proc.originalIndication || undefined) : (indication || undefined),
          basePriceMinor: Math.round(proc.price * 100),
          doctorId: existing ? proc.doctorId : (proc.doctorId || defaultDoctorId || selectedEvent.doctorId || null),
          dcmUrl: proc.locked ? (proc.dcmUrl ?? null) : dcmUrl,
          materials: proc.materials,
          ...(!existing || notificationChanged ? { isPeriodic, periodDays, notifyPatient, notificationType,
            nextNotificationDate: isPeriodic && notifyPatient ? date.toISOString().slice(0, 10) : undefined } : {}),
          metadata: { clientKey: proc.id, procedureId: proc.procedureId, color: proc.color, scope: proc.scope || 'tooth', indicationIds: proc.indications.map(indication => indicationIds[indication]).filter(Boolean) },
        };
      }));
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const payload = {
        name: groupName, patientId: selectedEvent.patientId, appointmentId: selectedEvent.id || undefined,
        expectedVersion: planIdentity?.version, idempotencyKey: idempotencyKey.current,
        consultationNote: planNote, discountPercentBps: Math.round(discount * 100),
        discountFixedMinor: Math.round(discountFixed * 100),
        metadata: { toothSurfaces, toothSections, defectMarkers, defaultDoctorId, isPeriodic, periodDays, notificationChannels: notifyPatient ? notificationChannels(notificationType) : [] }, attachmentIds: planAttachments.map(item => item.id), treatments,
      };
      const response = await fetch(planIdentity ? `/api/dental/treatment-groups/${planIdentity.id}/full` : `/api/dental/patients/${selectedEvent.patientId}/treatments/bulk`, {
        method: planIdentity ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Plan kaydedilemedi.');
      const plan = planIdentity ? result : result.plan;
      if (!plan?.id) throw new Error('Kaydedilen plan doğrulanamadı.');
      setPlanIdentity({ id: plan.id, version: plan.version });
      setSavedDcmUrl(dcmUrl);
      setTreatmentDcmFile(null);
      initialSnapshot.current = snapshot;
      updateSnapshotAfterSave.current = true;
      setToothDrafts(previous => {
        const next: Record<string, DraftItem[]> = {};
        for (const [tooth, items] of Object.entries(previous)) next[tooth] = items.map(item => {
          const saved = plan.treatments.find((row: any) => row.id === item.id || row.metadata?.clientKey === item.id);
          return saved ? { ...item, id: saved.id, status: saved.status, locked: saved.locked, materials: saved.materials, dcmUrl: saved.dcmUrl } : item;
        });
        return next;
      });
      if (closeAfter) { stopListening(); onSaved(); }
      else toast.success('Plan taslağı kaydedildi.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Plan kaydedilemedi.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (planLoading || planLoadError || baseDataLoading || baseDataError) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Tedavi planı" style={{ position: 'fixed', inset: 0, background: 'var(--modal-overlay)', display: 'grid', placeItems: 'center', zIndex: 100000 }}>
        <div style={{ background: 'var(--card-bg)', color: 'var(--foreground)', border: '1px solid var(--input-border)', padding: 24, borderRadius: 12 }}>
          <p role="status">{planLoading || baseDataLoading ? 'Tedavi planı ve katalog yükleniyor…' : planLoadError || baseDataError}</p>
          {(planLoadError || baseDataError) && <button type="button" onClick={() => setLoadAttempt(value => value + 1)} style={{ ...inputStyle, cursor: 'pointer' }}>Yeniden dene</button>}
          <button type="button" onClick={onClose} style={{ ...inputStyle, marginLeft: 8, cursor: 'pointer' }}>Kapat</button>
        </div>
      </div>
    );
  }

  const openToothContext = (tooth: number, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, teeth: selectedTeeth.includes(tooth) ? selectedTeeth : [tooth] });
  };
  const updateSurfaces = (tooth: number, surfaces: string[]) => {
    if ((toothDrafts[tooth] || []).some(item => item.locked)) return;
    setToothSurfaces(previous => ({ ...previous, [tooth]: surfaces }));
    setToothDrafts(previous => ({ ...previous, [tooth]: (previous[tooth] || []).map(item => ({ ...item, surface: surfaces.join('') || undefined })) }));
  };
  const updateSection = (tooth: number, section: string | null) => {
    if ((toothDrafts[tooth] || []).some(item => item.locked)) return;
    setToothSections(previous => { const next = { ...previous }; if (section) next[tooth] = section; else delete next[tooth]; return next; });
    setToothDrafts(previous => ({ ...previous, [tooth]: (previous[tooth] || []).map(item => ({ ...item, section: section || undefined })) }));
  };

  if (!advancedView) {
    return <PineTreatmentPlanView
      identity={planIdentity} patient={{ ...patientInfo, ...contactOverride }} event={selectedEvent} doctors={doctors}
      attachments={planAttachments} setAttachments={setPlanAttachments} setUploading={setMediaUploading}
      drafts={toothDrafts} setDrafts={setToothDrafts} selected={selectedTeeth} setSelected={setSelectedTeeth}
      procedures={procTemplates} setProcedures={setProcTemplates} indications={indTemplates} setIndications={setIndTemplates} indicationIds={indicationIds} setIndicationIds={setIndicationIds} inventory={inventory}
      add={handleDropTreatment} clickTooth={handleToothClick} jaw={jawSelection} mode={odontogramMode} setMode={setOdontogramMode}
      onContextMenu={openToothContext} contextMenu={contextMenu} setContextMenu={setContextMenu}
      detailTooth={selectedToothForDetails} setDetailTooth={setSelectedToothForDetails}
      toothSurfaces={toothSurfaces} toothSections={toothSections} updateSurfaces={updateSurfaces} updateSection={updateSection}
      selectionMode={selectionMode} setSelectionMode={setSelectionMode} quickSelect={handleQuickSelect}
      notificationChannels={notifyPatient ? notificationChannels(notificationType) : []}
      setNotificationChannels={(channels: NotificationChannel[]) => { setNotificationType(channels.join(',')); setNotifyPatient(channels.length > 0); setNotificationChanged(true); }}
      onContactChange={setContactOverride} periodic={isPeriodic} periodDays={periodDays}
      setPeriodic={(value: boolean) => { setIsPeriodic(value); setNotificationChanged(true); }}
      setPeriodDays={(value: number) => { setPeriodDays(value); setNotificationChanged(true); }}
      consultations={consultations} setConsultations={setConsultations}

      changeJaw={handleQuickSelect}
      odontogram3d={<Odontogram3D jawFilter="all" selectedTeeth={selectedTeeth} toothDrafts={toothDrafts} onToothClick={handleToothClick} onDropTreatment={handleDropTreatment} onContextMenu={openToothContext}
        toothSurfaces={toothSurfaces} onUpdateSurfaces={updateSurfaces} toothSections={toothSections} onUpdateSection={updateSection}
        defectMarkers={defectMarkers} onAddDefectMarker={marker => setDefectMarkers(previous => [...previous, marker])} onRemoveDefectMarker={id => setDefectMarkers(previous => previous.filter(marker => marker.id !== id))} onClearAllSelections={() => setSelectedTeeth([])} height={440} />}
      defaultDoctor={defaultDoctorId} setDefaultDoctor={setDefaultDoctorId} pricing={pricing} discount={discount} setDiscount={setDiscount} discountFixed={discountFixed} setDiscountFixed={setDiscountFixed}
      note={planNote} setNote={setPlanNote} saving={saving} save={handleSave} print={handlePrint} close={handleModalClose}
      showClose={showCloseDialog} setShowClose={setShowCloseDialog} discard={() => { stopListening(); onClose(); }}
      toggleVoice={toggleListening} listening={isListening} voiceStarting={isVoiceStarting} analyzing={isAnalyzing} voiceError={voiceError} transcript={transcript}
    />;
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }}>
      <div className="treatment-plan-modal" style={{ background: 'var(--background)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, width: '95%', maxWidth: 1800, maxHeight: '98vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', position: 'relative' }}>
        {showCloseDialog && (
          <div role="dialog" aria-modal="true" aria-labelledby="unsaved-plan-title" onKeyDown={event => { if (event.key === 'Escape') setShowCloseDialog(false); }} style={{ position: 'fixed', inset: 0, background: 'var(--modal-overlay)', display: 'grid', placeItems: 'center', zIndex: 100002 }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', borderRadius: 12, padding: 24, maxWidth: 460 }}>
              <h3 id="unsaved-plan-title">Kaydedilmemiş değişiklikler</h3>
              <p>Planı kapatmadan önce değişikliklerinizi kaydedebilirsiniz.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => { setShowCloseDialog(false); void handleSave({ closeAfter: true, allowEmpty: true }); }} style={{ ...inputStyle, background: 'var(--btn-clinic-primary-bg)', color: 'var(--btn-clinic-primary-fg)', cursor: 'pointer' }}>Kaydet</button>
                <button type="button" onClick={() => { stopListening(); onClose(); }} style={{ ...inputStyle, cursor: 'pointer' }}>Değişiklikleri bırak</button>
                <button type="button" autoFocus onClick={() => setShowCloseDialog(false)} style={{ ...inputStyle, cursor: 'pointer' }}>Devam et</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, position: 'relative', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
            <button type="button" onClick={() => { if (mediaUploading) { toast.error('Görünüm değiştirmeden önce yüklemeyi tamamlayın veya iptal edin.'); return; } setAdvancedView(false); }} style={{ ...inputStyle, cursor: 'pointer' }}>Plan görünümüne dön</button>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--foreground)' }}>
              {planIdentity ? 'Tedavi Planı Düzenle' : 'Tedavi Planı Oluştur'}
            </h3>
            <span style={{ color: 'var(--foreground-2)', fontWeight: 600 }}>{patientInfo?.name || selectedEvent?.title || 'Hasta'}</span>

            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              aria-label="Tedavi planı adı"
              style={{ ...inputStyle, minWidth: 220, maxWidth: 360, padding: '8px 10px', fontWeight: 600 }}
            />
            <button
              onClick={toggleListening}
              disabled={isVoiceStarting}
              aria-pressed={isListening}
              aria-label={isListening ? 'Sesli komut dinlemeyi durdur' : 'Sesli komut dinlemeyi başlat'}
              style={{
                background: isListening ? 'var(--danger)' : 'var(--btn-clinic-primary-bg)',
                border: `1px solid ${isListening ? 'var(--danger)' : 'var(--btn-clinic-primary-bg)'}`,
                color: 'var(--btn-clinic-primary-fg)',
                padding: '8px 14px',
                borderRadius: 8,
                cursor: isVoiceStarting ? 'wait' : 'pointer',
                opacity: isVoiceStarting ? 0.75 : 1,
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 40,
                transition: 'background 0.2s ease, border-color 0.2s ease'
              }}
              title={isListening ? "Dinlemeyi durdur" : "Sesli komut ile diş ve tedavi eklemek için tıklayın"}
            >
              {isListening ? <MicOff size={17} /> : <Mic size={17} />}
              <span>{isVoiceStarting ? 'Mikrofon hazırlanıyor' : isListening ? 'Dinlemeyi Durdur' : 'Sesli Komut'}</span>
            </button>

            {(isListening || isAnalyzing || voiceError) && (
              <div aria-live="polite" style={{ maxWidth: 500, color: voiceError ? 'var(--danger)' : 'var(--foreground-2)', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {voiceError || (isAnalyzing ? 'Komut analiz ediliyor…' : transcript || 'Dinleniyor; örn. “18 numaraya dolgu ekle”.')}
              </div>
            )}
          </div>
          <button onClick={handleModalClose} aria-label="Tedavi planını kapat" style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>

          {/* Expanded Assistant Panel */}
          {assistantPanelOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              right: 0,
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
              zIndex: 100010,
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              maxHeight: '75vh',
              overflowY: 'auto'
            }}>
              {/* Panel Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: 'var(--brand, #2563eb)', padding: '6px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bot size={20} color="#ffffff" />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)' }}>AI Tedavi Asistanı & Sesli Komut Merkezi</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--foreground-3)' }}>
                      Sesli komut verin veya yazın; işlemler anında tedavi planına eklenir, düzenlenir veya silinir.
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setAssistantPanelOpen(false)}
                    style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground-2)', cursor: 'pointer', padding: '5px 10px', borderRadius: 6, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <X size={14} /> Kapat
                  </button>
                </div>
              </div>

              {/* Voice & Manual Input Section */}
              <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  {/* Voice Button */}
                  <button
                    onClick={toggleListening}
                    disabled={isAnalyzing}
                    style={{
                      background: isListening ? '#dc2626' : '#2563eb',
                      border: `1px solid ${isListening ? '#ef4444' : '#3b82f6'}`,
                      color: '#ffffff',
                      padding: '8px 16px',
                      borderRadius: 8,
                      cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      boxShadow: isListening ? '0 0 14px rgba(220, 38, 38, 0.7)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                    {isListening ? 'Dinlemeyi Durdur & İşle' : '🎙️ Sesle Komut Ver'}
                  </button>

                  {/* Manual Text Input */}
                  <div style={{ flex: 1, minWidth: 260, display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={manualInput}
                      onChange={e => setManualInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && manualInput.trim() && !isAnalyzing) {
                          const txt = manualInput.trim();
                          setManualInput('');
                          processAICommand(txt);
                        }
                      }}
                      placeholder="Örn: 18 ve 28 numaraya kompozit dolgu ekle, 36 nolu dişi sil..."
                      disabled={isAnalyzing}
                      style={{
                        flex: 1,
                        background: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        fontSize: '0.85rem',
                        color: 'var(--foreground)',
                        outline: 'none'
                      }}
                    />
                    <button
                      onClick={() => {
                        if (!manualInput.trim() || isAnalyzing) return;
                        const txt = manualInput.trim();
                        setManualInput('');
                        processAICommand(txt);
                      }}
                      disabled={!manualInput.trim() || isAnalyzing}
                      style={{
                        background: manualInput.trim() && !isAnalyzing ? 'var(--brand, #2563eb)' : 'var(--border)',
                        color: manualInput.trim() && !isAnalyzing ? '#ffffff' : 'var(--foreground-3)',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 14px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: manualInput.trim() && !isAnalyzing ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <Send size={14} /> Gönder
                    </button>
                  </div>
                </div>

                {/* Quick Trigger Keyword Badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: '0.73rem', color: 'var(--foreground-3)', paddingTop: 2 }}>
                  <span style={{ fontWeight: 600, color: 'var(--foreground-2)' }}>⚡ Otomatik Tetikleyiciler:</span>
                  <span style={{ background: 'var(--background)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 4, color: '#38bdf8', fontWeight: 500 }}>➕ "ekle" / "yap" / "yaz"</span>
                  <span style={{ background: 'var(--background)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 4, color: '#f87171', fontWeight: 500 }}>🗑️ "sil" / "kaldır" / "iptal"</span>
                  <span style={{ background: 'var(--background)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 4, color: '#fbbf24', fontWeight: 500 }}>✏️ "düzenle" / "güncelle" / "değiştir"</span>
                  <span style={{ background: 'var(--background)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 4, color: '#4ade80', fontWeight: 500 }}>💾 "kaydet" / "onayla"</span>
                </div>

                {/* Real-time speech transcript or AI analyzing indicator */}
                {isListening && (
                  <div style={{
                    background: 'var(--background)',
                    border: `1px solid ${checkActionTrigger(transcript) ? '#22c55e' : '#ef4444'}`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    transition: 'border-color 0.2s'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: checkActionTrigger(transcript) ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                      <span style={{ color: checkActionTrigger(transcript) ? '#4ade80' : '#ef4444', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        {checkActionTrigger(transcript) ? '⚡ TETİKLENİYOR:' : 'DİNLENİYOR:'}
                      </span>
                      <span style={{ color: 'var(--foreground)', fontSize: '0.85rem', fontWeight: 500 }}>{transcript || 'Konuşmanız bekleniyor...'}</span>
                    </div>
                    {checkActionTrigger(transcript) && (
                      <span style={{ background: '#16a34a', color: '#ffffff', fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                        {checkActionTrigger(transcript)?.toUpperCase()} ALGILANDI
                      </span>
                    )}
                  </div>
                )}

                {isAnalyzing && (
                  <div style={{ background: 'var(--background)', border: '1px solid var(--badge-clinic-border)', borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: 600 }}>⚙️ AI komutu analiz ediyor ve tedaviye uyguluyor...</span>
                  </div>
                )}
              </div>

              {/* Command History & CRUD Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--foreground)' }}>
                    📋 Uygulanan Komut Geçmişi ({commandHistory.length})
                  </span>
                </div>

                {commandHistory.length === 0 ? (
                  <div style={{
                    background: 'var(--glass-bg)',
                    border: '1px dashed var(--border)',
                    borderRadius: 8,
                    padding: '20px 16px',
                    textAlign: 'center',
                    color: 'var(--foreground-3)',
                    fontSize: '0.82rem'
                  }}>
                    Henüz bir komut verilmedi. Konuşmaya başlayarak veya metin kutusuna yazarak komut verebilirsiniz.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                    {commandHistory.map((cmd) => {
                      const isEditing = editingCommandId === cmd.id;
                      return (
                        <div
                          key={cmd.id}
                          draggable={cmd.status === 'applied'}
                          onDragStart={(e) => {
                            const procsPayload = (cmd.treatments || []).filter(t => t.intent !== 'DELETE').map(t => {
                              const procTemp = procTemplates.find(p => p.name.toLowerCase() === (t.procedureName || '').toLowerCase());
                              return {
                                name: t.procedureName || 'İşlem',
                                price: procTemp ? procTemp.price : 0,
                                indications: t.indication ? [t.indication] : [],
                                color: procTemp ? procTemp.color : '#3b82f6'
                              };
                            });
                            const payload = {
                              type: 'mixed',
                              procedures: procsPayload,
                              indications: []
                            };
                            e.dataTransfer.setData("type", "mixed");
                            e.dataTransfer.setData("value", JSON.stringify(payload));
                            e.dataTransfer.setData("application/json", JSON.stringify(payload));
                            e.dataTransfer.setData("text/plain", JSON.stringify(payload));
                          }}
                          style={{
                            background: 'var(--glass-bg)',
                            border: `1px solid ${cmd.status === 'applied' ? '#16a34a' : 'var(--border)'}`,
                            borderRadius: 8,
                            padding: 10,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            cursor: cmd.status === 'applied' ? 'grab' : 'default'
                          }}
                        >
                          {/* Command Top Row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {cmd.status === 'applied' && (
                                <span style={{ background: '#16a34a', color: '#ffffff', padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700 }}>
                                  ✅ Tedaviye Eklendi
                                </span>
                              )}
                              {cmd.status === 'rejected' && (
                                <span style={{ background: 'var(--border)', color: 'var(--foreground)', padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700 }}>
                                  ↩️ Geri Alındı
                                </span>
                              )}
                              {cmd.status === 'applied' && (
                                <span style={{ background: 'var(--input-bg)', color: '#60a5fa', border: '1px solid var(--input-border)', padding: '2px 7px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600 }}>
                                  🖐️ Dişe Sürükle
                                </span>
                              )}
                              <span style={{ fontSize: '0.75rem', color: 'var(--foreground-3)' }}>{cmd.timestamp}</span>
                            </div>

                            <button
                              onClick={() => deleteCommand(cmd.id)}
                              style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', padding: 2 }}
                              title="Listeden Kaldır"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          {/* Command Text / Edit Mode */}
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                type="text"
                                value={editingCommandText}
                                onChange={e => setEditingCommandText(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveEditCommand(cmd.id);
                                }}
                                style={{
                                  flex: 1,
                                  background: 'var(--background)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  padding: '6px 10px',
                                  fontSize: '0.82rem',
                                  color: 'var(--foreground)'
                                }}
                              />
                              <button
                                onClick={() => handleSaveEditCommand(cmd.id)}
                                style={{ background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Yeniden Uygula
                              </button>
                              <button
                                onClick={() => {
                                  setEditingCommandId(null);
                                  setEditingCommandText('');
                                }}
                                style={{ background: 'var(--border)', color: 'var(--foreground)', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer' }}
                              >
                                İptal
                              </button>
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.85rem', color: 'var(--foreground)', fontWeight: 500 }}>
                              "{cmd.rawText}"
                            </div>
                          )}

                          {/* Parsed Treatments Visual Chips */}
                          {cmd.treatments && cmd.treatments.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, background: 'var(--background)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                              {cmd.treatments.map((t, tIdx) => {
                                const isDelete = t.intent === 'DELETE';
                                const isUpdate = t.intent === 'UPDATE' || t.intent === 'EDIT';
                                return (
                                  <div
                                    key={tIdx}
                                    style={{
                                      background: 'var(--background)',
                                      border: `1px solid ${isDelete ? '#dc2626' : (isUpdate ? '#f59e0b' : 'var(--brand, #3b82f6)')}`,
                                      color: isDelete ? '#ef4444' : (isUpdate ? '#f59e0b' : 'var(--brand, #3b82f6)'),
                                      padding: '4px 8px',
                                      borderRadius: 4,
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6
                                    }}
                                  >
                                    <span>{isDelete ? '🗑️ SİLİNDİ' : (isUpdate ? '✏️ GÜNCELLENDİ' : '➕ EKLENDİ')}:</span>
                                    <span>{t.procedureName || 'Tüm İşlemler'}</span>
                                    <span style={{ color: 'var(--foreground)' }}>→ Diş: {(t.toothNumbers || []).join(', ') || 'Genel'}</span>
                                    {t.indication && <span style={{ color: '#f59e0b' }}>({t.indication})</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Action Buttons for Command */}
                          {!isEditing && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                              {cmd.status === 'applied' && (
                                <>
                                  <button
                                    onClick={() => undoCommand(cmd.id)}
                                    style={{
                                      background: 'var(--border)',
                                      color: 'var(--foreground)',
                                      border: 'none',
                                      borderRadius: 6,
                                      padding: '5px 12px',
                                      fontSize: '0.78rem',
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}
                                  >
                                    <RotateCcw size={12} /> Geri Al
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingCommandId(cmd.id);
                                      setEditingCommandText(cmd.rawText);
                                    }}
                                    style={{
                                      background: 'var(--border)',
                                      color: 'var(--foreground)',
                                      border: 'none',
                                      borderRadius: 6,
                                      padding: '5px 10px',
                                      fontSize: '0.78rem',
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}
                                  >
                                    <Pencil size={12} /> Düzenle
                                  </button>
                                </>
                              )}

                              {cmd.status === 'rejected' && (
                                <>
                                  <button
                                    onClick={() => applyCommand(cmd.id)}
                                    style={{
                                      background: '#2563eb',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: 6,
                                      padding: '4px 10px',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}
                                  >
                                    <RotateCcw size={12} /> Tekrar Uygula
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingCommandId(cmd.id);
                                      setEditingCommandText(cmd.rawText);
                                    }}
                                    style={{
                                      background: 'var(--border)',
                                      color: 'var(--foreground)',
                                      border: 'none',
                                      borderRadius: 6,
                                      padding: '4px 10px',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Düzenle
                                  </button>
                                </>
                              )}

                              <button
                                onClick={() => deleteCommand(cmd.id)}
                                style={{
                                  background: 'var(--card-bg)',
                                  color: '#ef4444',
                                  border: 'none',
                                  borderRadius: 6,
                                  padding: '4px 8px',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                  marginLeft: 'auto',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                <Trash2 size={12} /> Sil
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Panel Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                {commandHistory.length > 0 && (
                  <button
                    onClick={() => {
                      setCommandHistory([]);
                      toast.success('Asistan geçmişi temizlendi.');
                    }}
                    style={{ background: 'var(--glass-bg)', color: 'var(--foreground-2)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: '0.78rem', cursor: 'pointer' }}
                  >
                    Geçmişi Temizle
                  </button>
                )}
                <button
                  onClick={() => setAssistantPanelOpen(false)}
                  style={{ marginLeft: 'auto', background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)', borderRadius: 6, padding: '5px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Paneli Kapat
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 24, flex: 1, overflow: 'auto' }}>

          {/* LEFT COLUMN */}
          <div style={{ flex: '2.5 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', paddingRight: 8 }}>

            <PatientConsentPanel patientId={selectedEvent.patientId} />

            <PlanMediaPanel patientId={selectedEvent.patientId} attachments={planAttachments} onChange={setPlanAttachments} onUploadingChange={setMediaUploading} />

            {/* DICOM / Tedavi Görüntüleri Kartı (Akordeon & Kompakt Tasarım) */}
            <div style={{
              borderRadius: 8,
              background: 'var(--card-bg)',
              border: '1px solid var(--input-border)',
              overflow: 'hidden',
              transition: 'all 0.2s ease',
            }}>
              {/* Tıklanabilir Üst Çubuk */}
              <div
                style={{
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: 'pointer',
                  background: isDicomSectionOpen ? 'var(--input-bg)' : 'var(--card-bg)',
                  borderBottom: isDicomSectionOpen ? '1px solid var(--input-border)' : 'none',
                  userSelect: 'none',
                }}
                onClick={() => setIsDicomSectionOpen(prev => !prev)}
              >
                {/* Sol: İkon + Başlık + Rozet */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15 }}>📷</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                    Tedavi Görüntüleri
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--foreground-3)' }}>
                    (DICOM / 3D CBCT)
                  </span>
                  {treatmentDcmFile ? (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'var(--badge-clinic-bg)',
                      border: '1px solid var(--badge-clinic-border)',
                      color: 'var(--badge-clinic-fg)',
                      maxWidth: 180,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      📎 {treatmentDcmFile.name}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 10.5,
                      color: 'var(--foreground-3)',
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                    }}>
                      İsteğe Bağlı
                    </span>
                  )}
                </div>

                {/* Sağ: Eylemler & Aç/Kapa Butonu */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  {treatmentDcmFile && (
                    <button
                      type="button"
                      onClick={() => setTreatmentDcmFile(null)}
                      title="Görüntüyü Kaldır"
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 5,
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Trash2 size={12} /> Kaldır
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsDicomSectionOpen(prev => !prev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--btn-clinic-blue-border)',
                      background: 'var(--btn-clinic-blue-bg)',
                      color: 'var(--btn-clinic-blue-fg)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isDicomSectionOpen ? (
                      <><span>Daralt</span><ChevronUp size={13} /></>
                    ) : (
                      <><span>{treatmentDcmFile ? 'Görüntüle' : 'Görüntü Ekle'}</span><ChevronDown size={13} /></>
                    )}
                  </button>
                </div>
              </div>

              {/* Açılır Gövde */}
              {isDicomSectionOpen && (
                <div style={{ padding: 12 }}>
                  <DicomViewer
                    dcmUrl={treatmentDcmFile ? null : savedDcmUrl}
                    file={treatmentDcmFile}
                    onFileChange={(file) => {
                      setTreatmentDcmFile(file);
                      if (file) setIsDicomSectionOpen(true);
                    }}
                    onFileClear={() => { setTreatmentDcmFile(null); setSavedDcmUrl(null); }}
                    isModal={false}
                  />
                </div>
              )}
            </div>

            {/* Odontogram Container (2 Modlu: 2D Basit & 3D Anatomik) */}
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--card-bg, #1e293b)', border: '1px solid var(--glass-border, #334155)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16 }}>🦷</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground, #f8fafc)' }}>Odontogram</span>
                  <select aria-label="Çene seçimi" value={jawSelection} onChange={event => handleQuickSelect(event.target.value as 'all' | 'upper' | 'lower')} style={{ ...inputStyle, padding: '5px 8px' }}>
                    <option value="all">Tüm ağız</option><option value="upper">Üst çene</option><option value="lower">Alt çene</option>
                  </select>
                  <span style={{ fontSize: 11, color: 'var(--foreground-2, #94a3b8)' }}>
                    {selectedTeeth.length > 0 ? `(${selectedTeeth.length} diş seçili)` : 'Hedef dişleri seçin veya işlem sürükleyin'}
                  </span>
                  {selectedTeeth.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTeeth([]);
                        setLastSelectedTooth(null);
                      }}
                      title="Diş seçimini temizle; tedaviler ve yüzeyler korunur"
                      style={{
                        background: 'var(--input-bg)',
                        color: '#ef4444',
                        border: '1px solid #ef444440',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginLeft: 4,
                      }}
                    >
                      <X size={12} /> Seçimi Temizle ({selectedTeeth.length})
                    </button>
                  )}
                </div>

                {/* 2 Mod Değiştirici (Segmented Switch) */}
                <div style={{ display: 'flex', background: 'var(--background-2, #0f172a)', padding: 3, borderRadius: 6, border: '1px solid var(--glass-border, #334155)', gap: 3 }}>
                  <button
                    type="button"
                    onClick={() => setOdontogramMode('2d')}
                    style={{
                      padding: '5px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: 'none',
                      cursor: 'pointer',
                      background: odontogramMode === '2d' ? 'var(--brand, #2563eb)' : 'var(--card-bg)',
                      color: odontogramMode === '2d' ? '#ffffff' : 'var(--foreground-2, #94a3b8)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>🦷</span> 2D Basit
                  </button>
                  <button
                    type="button"
                    onClick={() => setOdontogramMode('3d')}
                    style={{
                      padding: '5px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: 'none',
                      cursor: 'pointer',
                      background: odontogramMode === '3d' ? 'var(--brand, #2563eb)' : 'var(--card-bg)',
                      color: odontogramMode === '3d' ? '#ffffff' : 'var(--foreground-2, #94a3b8)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Box size={13} /> 3D Anatomik
                  </button>
                </div>
              </div>

              {/* ── KLİNİK HIZLI DİŞ SEÇİCİ & MOD ARAÇ ÇUBUĞU (AÇILIR / KAPANIR) ── */}
              <div style={{
                background: 'var(--card-bg, #0f172a)',
                border: '1px solid var(--border, #334155)',
                borderRadius: 8,
                marginBottom: 10,
                overflow: 'hidden',
                transition: 'all 0.2s ease'
              }}>
                {/* Üst Çubuk (Her Zaman Görünür, Tıklanabilir Başlık & Seçim Modu) */}
                <div style={{
                  padding: '6px 12px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  background: isQuickSelectOpen ? 'var(--input-bg)' : 'var(--card-bg)',
                  borderBottom: isQuickSelectOpen ? '1px solid var(--border, #334155)' : 'none'
                }}>
                  {/* Sol Taraf: Aç / Kapat Butonu & Başlık */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setIsQuickSelectOpen(prev => !prev)}
                      style={{
                        background: isQuickSelectOpen ? 'var(--btn-clinic-primary-bg)' : 'var(--btn-clinic-blue-bg)',
                        border: `1px solid ${isQuickSelectOpen ? '#3b82f6' : 'var(--border, #334155)'}`,
                        color: isQuickSelectOpen ? '#ffffff' : 'var(--foreground, #f8fafc)',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s ease'
                      }}
                      title={isQuickSelectOpen ? 'Hızlı seçim butonlarını daralt' : 'Çene ve kadran hızlı seçim butonlarını aç'}
                    >
                      <span>⚡ Hızlı Seçim Butonları</span>
                      {isQuickSelectOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {!isQuickSelectOpen && (
                      <span style={{ fontSize: 11, color: 'var(--foreground-3, #94a3b8)', fontStyle: 'italic' }}>
                        (Tüm Ağız, Çeneler, Q1-Q4, Ön/Arka)
                      </span>
                    )}
                  </div>

                  {/* Sağ Taraf: İnceleme vs Çoklu Seçim Modu Değiştirici */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--foreground-3, #94a3b8)', fontWeight: 600 }}>Seçim Modu:</span>
                    <div style={{
                      display: 'inline-flex',
                      background: 'var(--background, #020617)',
                      padding: 2,
                      borderRadius: 6,
                      border: '1px solid var(--border, #334155)'
                    }}>
                      <button
                        type="button"
                        onClick={() => setSelectionMode('inspect')}
                        style={{
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 4,
                          border: 'none',
                          cursor: 'pointer',
                          background: selectionMode === 'inspect' ? '#2563eb' : 'var(--card-bg)',
                          color: selectionMode === 'inspect' ? '#ffffff' : 'var(--foreground-2, #94a3b8)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title="Tıklanan dişi tek başına seçer ve odaklar"
                      >
                        🔍 Tekli İncele
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectionMode('batch')}
                        style={{
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 4,
                          border: 'none',
                          cursor: 'pointer',
                          background: selectionMode === 'batch' ? '#2563eb' : 'var(--card-bg)',
                          color: selectionMode === 'batch' ? '#ffffff' : 'var(--foreground-2, #94a3b8)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title="Her tıklanan dişi seçime ekler veya kaldırır"
                      >
                        📋 Çoklu Seçim
                      </button>
                    </div>
                  </div>
                </div>

                {/* Açılır / Kapanır İçerik (Kadran ve Çene Seçicileri) */}
                {isQuickSelectOpen && (
                  <div style={{
                    padding: '8px 12px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    alignItems: 'center',
                    background: 'var(--card-bg, #0f172a)'
                  }}>
                    <button
                      type="button"
                      onClick={() => handleQuickSelect('all')}
                      style={{
                        padding: '4px 9px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 5,
                        border: '1px solid var(--border, #334155)',
                        background: selectedTeeth.length === 32 ? 'var(--brand, #2563eb)' : 'var(--background, #1e293b)',
                        color: selectedTeeth.length === 32 ? '#ffffff' : 'var(--foreground, #f8fafc)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Tüm 32 dişi seçer"
                    >
                      Tüm Ağız (32)
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickSelect('upper')}
                      style={{
                        padding: '4px 9px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 5,
                        border: '1px solid var(--border, #334155)',
                        background: (selectedTeeth.length === 16 && UPPER_TEETH.every(t => selectedTeeth.includes(t))) ? 'var(--brand, #2563eb)' : 'var(--background, #1e293b)',
                        color: (selectedTeeth.length === 16 && UPPER_TEETH.every(t => selectedTeeth.includes(t))) ? '#ffffff' : 'var(--foreground, #f8fafc)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Üst Çene (Maksilla: 18-28)"
                    >
                      Üst Çene
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickSelect('lower')}
                      style={{
                        padding: '4px 9px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 5,
                        border: '1px solid var(--border, #334155)',
                        background: (selectedTeeth.length === 16 && LOWER_TEETH.every(t => selectedTeeth.includes(t))) ? 'var(--brand, #2563eb)' : 'var(--background, #1e293b)',
                        color: (selectedTeeth.length === 16 && LOWER_TEETH.every(t => selectedTeeth.includes(t))) ? '#ffffff' : 'var(--foreground, #f8fafc)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Alt Çene (Mandibula: 48-38)"
                    >
                      Alt Çene
                    </button>

                    <div style={{ width: 1, height: 16, background: 'var(--border, #334155)', margin: '0 2px' }} />

                    {/* Kadran Butonları Q1 - Q4 */}
                    {[
                      { key: 'q1', label: 'Q1 (Üst Sağ)' },
                      { key: 'q2', label: 'Q2 (Üst Sol)' },
                      { key: 'q3', label: 'Q3 (Alt Sol)' },
                      { key: 'q4', label: 'Q4 (Alt Sağ)' },
                    ].map(q => {
                      const qTeeth = getTeethForQuickSelect(q.key);
                      const isQActive = qTeeth.every(t => selectedTeeth.includes(t)) && qTeeth.length > 0;
                      return (
                        <button
                          key={q.key}
                          type="button"
                          onClick={() => handleQuickSelect(q.key as any)}
                          style={{
                            padding: '4px 8px',
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: 5,
                            border: `1px solid ${isQActive ? 'var(--accent, #3b82f6)' : 'var(--border, #334155)'}`,
                            background: isQActive ? 'var(--badge-clinic-bg)' : 'var(--btn-clinic-blue-bg)',
                            color: isQActive ? 'var(--badge-clinic-fg)' : 'var(--btn-clinic-blue-fg)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {q.label}
                        </button>
                      );
                    })}

                    <div style={{ width: 1, height: 16, background: 'var(--border, #334155)', margin: '0 2px' }} />

                    <button
                      type="button"
                      onClick={() => handleQuickSelect('anterior')}
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 5,
                        border: '1px solid var(--border, #334155)',
                        background: 'var(--background, #1e293b)',
                        color: 'var(--foreground-2, #cbd5e1)',
                        cursor: 'pointer'
                      }}
                      title="Ön Dişler (Kesici ve Kaninler)"
                    >
                      Ön (Anterior)
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickSelect('posterior')}
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 5,
                        border: '1px solid var(--border, #334155)',
                        background: 'var(--background, #1e293b)',
                        color: 'var(--foreground-2, #cbd5e1)',
                        cursor: 'pointer'
                      }}
                      title="Arka Dişler (Premolar ve Molarlar)"
                    >
                      Arka (Posterior)
                    </button>
                  </div>
                )}
              </div>

              {/* ── SEÇİLİ DİŞLER ŞERİDİ (TRAY) — Yalnızca seçili diş varsa gösterilir ── */}
              {selectedTeeth.length > 0 && (
                <div style={{
                  background: 'var(--card-bg, #0f172a)',
                  border: '1px solid #2563eb',
                  borderRadius: 8,
                  padding: '6px 12px',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  minHeight: 38,
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>🎯</span> Seçili ({selectedTeeth.length}):
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 60, overflowY: 'auto', flex: 1 }}>
                      {[...selectedTeeth].sort((a, b) => a - b).map(t => (
                        <span
                          key={t}
                          style={{
                            background: 'var(--badge-clinic-bg)',
                            color: 'var(--badge-clinic-fg)',
                            border: '1px solid var(--badge-clinic-border)',
                            padding: '2px 7px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          #{t}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTeeth(prev => prev.filter(x => x !== t));
                            }}
                            style={{
                              background: 'var(--card-bg)',
                              border: 'none',
                              color: 'var(--badge-clinic-fg)',
                              cursor: 'pointer',
                              padding: 0,
                              fontSize: 12,
                              lineHeight: 1,
                              display: 'flex'
                            }}
                            title={`Diş #${t} seçimden kaldır`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleQuickSelect('clear')}
                    style={{
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: '1px solid #dc2626',
                      background: 'var(--input-bg)',
                      color: '#f87171',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3
                    }}
                    title="Tüm seçili dişleri temizle"
                  >
                    <X size={12} /> Seçimi Sıfırla
                  </button>
                </div>
              )}

              {odontogramMode === '2d' ? (
                /* ── MOD 1: MEVCUT 2D BASİT GÖRÜNÜM ── */
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
                          const rawVal = e.dataTransfer.getData("value") || e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
                          const rawType = e.dataTransfer.getData("type");
                          if (!rawVal) return;
                          const targets = [n];
                          try {
                            const parsed = JSON.parse(rawVal);
                            handleDropTreatment(targets, { type: rawType, ...parsed });
                          } catch (err) {
                            console.error("2D drop error:", err);
                          }
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ height: 1, background: 'var(--glass-border, #334155)', margin: '0 4px' }} />
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
                          const rawVal = e.dataTransfer.getData("value") || e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
                          const rawType = e.dataTransfer.getData("type");
                          if (!rawVal) return;
                          const targets = [n];
                          try {
                            const parsed = JSON.parse(rawVal);
                            handleDropTreatment(targets, { type: rawType, ...parsed });
                          } catch (err) {
                            console.error("2D drop error:", err);
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* ── MOD 2: OMFATLAS TABANLI 3D ANATOMİK GÖRÜNÜM ── */
                <Odontogram3D
                  jawFilter="all"
                  selectedTeeth={selectedTeeth}
                  toothDrafts={toothDrafts}
                  onToothClick={(fdi, e) => handleToothClick(fdi, e)}
                  onContextMenu={(fdi, e) => {
                    const targets = selectedTeeth.includes(fdi) ? selectedTeeth : [fdi];
                    setContextMenu({ x: e.clientX, y: e.clientY, teeth: targets });
                  }}
                  onDropTreatment={(targets, data) => handleDropTreatment(targets, data)}
                  toothSurfaces={toothSurfaces}
                  onUpdateSurfaces={(toothNumber, surfaces) => {
                    setToothSurfaces(prev => ({ ...prev, [toothNumber]: surfaces }));
                    setToothDrafts(prev => {
                      const tk = String(toothNumber);
                      if (!prev[tk] || prev[tk].length === 0) return prev;
                      const surfStr = surfaces.join('');
                      return {
                        ...prev,
                        [tk]: prev[tk].map(d => ({ ...d, surface: surfStr || undefined }))
                      };
                    });
                  }}
                  toothSections={toothSections}
                  onUpdateSection={(toothNumber, section) => {
                    setToothSections(prev => {
                      const next = { ...prev };
                      if (section) next[toothNumber] = section;
                      else delete next[toothNumber];
                      return next;
                    });
                    setToothDrafts(prev => {
                      const tk = String(toothNumber);
                      if (!prev[tk] || prev[tk].length === 0) return prev;
                      return {
                        ...prev,
                        [tk]: prev[tk].map(d => ({ ...d, section: section || undefined }))
                      };
                    });
                  }}
                  defectMarkers={defectMarkers}
                  onAddDefectMarker={(marker) => {
                    setDefectMarkers(prev => [...prev, marker]);
                  }}
                  onRemoveDefectMarker={(id) => {
                    setDefectMarkers(prev => prev.filter(m => m.id !== id));
                  }}
                  onClearAllSelections={() => {
                    setSelectedTeeth([]);
                    setLastSelectedTooth(null);
                  }}
                  height={440}
                />
              )}
            </div>

            {/* Hızlı Atama Ayarları (Araç Kutusu) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  Hızlı Atama Ayarları <span style={{ fontSize: 10, color: 'var(--foreground-3)', fontWeight: 400 }}>(Varsayılanlar)</span>
                </div>
                <div style={{ padding: 12, background: 'var(--glass-bg)', border: '1px dashed var(--glass-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1, display: 'flex', gap: 8 }}>
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
                        style={{ ...inputStyle, flex: 1, padding: '6px', fontSize: '0.8rem' }}
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
                      <button
                        title="Seçili doktoru bekleyen tüm işlemlere uygula"
                        onClick={() => {
                          if (!defaultDoctorId) {
                            toast.error("Önce bir doktor seçmelisiniz.");
                            return;
                          }
                          setToothDrafts(prev => {
                            const next = { ...prev };
                            let appliedCount = 0;
                            for (const tooth of Object.keys(next)) {
                              next[tooth] = next[tooth].map(item => {
                                if (!item.locked && item.doctorId !== defaultDoctorId) {
                                  appliedCount++;
                                  return { ...item, doctorId: defaultDoctorId };
                                }
                                return item;
                              });
                            }
                            if (appliedCount > 0) {
                              toast.success(`Seçilen doktor ${appliedCount} işleme başarıyla uygulandı.`);
                            } else {
                              toast("Değiştirilecek işlem bulunamadı.");
                            }
                            return next;
                          });
                        }}
                        style={{
                          background: 'var(--brand, #3b82f6)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Check size={14} /> Tümüne Uygula
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Templates Pool */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  Sık Kullanılan İşlemler <span style={{ fontSize: 10, color: 'var(--foreground-3)', fontWeight: 400 }}>(seçin veya sürükleyin)</span>
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
                        <button onClick={(e) => { e.stopPropagation(); setEditingTemplate({ type: 'procedure', index: i }); setNewTemplateType('procedure'); setNewTemplateInput(proc.name); setNewTemplatePrice(proc.price); setNewTemplateColor(proc.color || '#3b82f6'); setNewTemplateMaterials(proc.materials || []); setNewTemplateScope(proc.scope || 'tooth'); }} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, display: 'flex' }}><Pencil size={12} /></button>
                        <button onClick={(e) => { e.stopPropagation(); void archiveCatalogTemplate(proc.id, 'procedure', proc.name); }} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
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
                        <div key={mIdx} style={{ background: 'var(--input-bg)', padding: '4px 8px', borderRadius: 4, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--glass-border)', color: 'var(--foreground-2)' }}>
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
                          <label style={{ color: 'var(--foreground-2)' }}>Satış ₺ <input aria-label={`${m.name} satış bedeli`} type="number" min="0" step="0.01" value={(m.unitSalePriceMinor || 0) / 100} onChange={e => setActiveSelectionMaterials(previous => previous.map((item, i) => i === mIdx ? { ...item, unitSalePriceMinor: Math.round(Number(e.target.value) * 100) } : item))} style={{ ...inputStyle, width: 70, padding: 4 }} /></label>
                          <button onClick={() => setActiveSelectionMaterials(prev => prev.filter((_, i) => i !== mIdx))} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  Sık Kullanılan Endikasyonlar <span style={{ fontSize: 10, color: 'var(--foreground-3)', fontWeight: 400 }}>(seçin veya sürükleyin)</span>
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
                        style={{ padding: '6px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', boxShadow: isSelected ? '0 0 0 2px #ef4444' : 'none', borderRadius: 20, fontSize: '0.8rem', color: '#ef4444', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}
                      >
                        <span style={{ pointerEvents: 'none' }}>{ind}</span>
                        <button onClick={(e) => { e.stopPropagation(); setEditingTemplate({ type: 'indication', index: i }); setNewTemplateType('indication'); setNewTemplateInput(ind); }} style={{ background: 'var(--card-bg)', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}><Pencil size={12} /></button>
                        <button onClick={(e) => { e.stopPropagation(); void archiveCatalogTemplate(indicationIds[ind], 'indication', ind); }} style={{ background: 'var(--card-bg)', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8 }}>
                <span style={{ color: 'var(--foreground-2)', fontSize: '0.78rem' }}>
                  {selectedTemplates.procedures.length + selectedTemplates.indications.length > 0
                    ? `${selectedTemplates.procedures.length + selectedTemplates.indications.length} şablon seçildi`
                    : 'İşlem veya endikasyon seçin'}
                </span>
                <button
                  type="button"
                  disabled={selectedTeeth.length === 0 || (selectedTemplates.procedures.length === 0 && selectedTemplates.indications.length === 0)}
                  onClick={() => {
                    handleDropTreatment(selectedTeeth, {
                      procedures: selectedTemplates.procedures.map(index => procTemplates[index]),
                      indications: selectedTemplates.indications.map(index => indTemplates[index]),
                      activeMaterials: activeSelectionMaterials,
                    });
                  }}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--btn-clinic-primary-bg)', background: 'var(--btn-clinic-primary-bg)', color: 'var(--btn-clinic-primary-fg)', fontWeight: 700, cursor: selectedTeeth.length === 0 || (selectedTemplates.procedures.length === 0 && selectedTemplates.indications.length === 0) ? 'not-allowed' : 'pointer', opacity: selectedTeeth.length === 0 || (selectedTemplates.procedures.length === 0 && selectedTemplates.indications.length === 0) ? 0.55 : 1 }}
                >
                  Seçili Dişlere Uygula
                </button>
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
                      <select aria-label="Tedavi kapsamı" value={newTemplateScope} onChange={event => setNewTemplateScope(event.target.value as 'tooth' | 'jaw' | 'mouth')} style={{ ...inputStyle, padding: 6 }}>
                        <option value="tooth">Diş başına</option><option value="jaw">Çene başına</option><option value="mouth">Tüm ağız</option>
                      </select>
                      <input type="color" value={newTemplateColor} onChange={e => setNewTemplateColor(e.target.value)} style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'var(--card-bg)', cursor: 'pointer' }} title="İşlem Rengi" />
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
                  <button disabled={catalogSaving} onClick={() => void saveCatalogTemplate()} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>{editingTemplate ? 'Kaydet' : 'Ekle'}</button>
                  {editingTemplate && (
                    <button onClick={() => { setEditingTemplate(null); setNewTemplateInput(''); setNewTemplatePrice(0); setNewTemplateMaterials([]); }} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--card-bg)', color: 'var(--foreground)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.8rem' }}>İptal</button>
                  )}
                </div>
                {newTemplateType === 'procedure' && newTemplateMaterials.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {newTemplateMaterials.map((m, mIdx) => (
                      <div key={mIdx} style={{ background: 'var(--input-bg)', padding: '4px 8px', borderRadius: 4, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--glass-border)', color: 'var(--foreground-2)' }}>
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
                        <button onClick={() => setNewTemplateMaterials(prev => prev.filter((_, i) => i !== mIdx))} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Consultations Block */}
            <div style={{ borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--input-border)', overflow: 'hidden' }}>
              <button type="button" onClick={() => setIsNotesSectionOpen(previous => !previous)} style={{ width: '100%', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-bg)', border: 'none', color: 'var(--foreground)', cursor: 'pointer', fontSize: 13, fontWeight: 700, textAlign: 'left' }}>
                Konsültasyon ve Hastalık Notu
                {isNotesSectionOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {isNotesSectionOpen && (
              <div style={{ padding: 16, borderTop: '1px solid var(--input-border)' }}>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <label htmlFor="plan-consultation-note" style={{ color: 'var(--foreground)', fontWeight: 700 }}>Bu plana ait konsültasyon notu</label>
                <textarea id="plan-consultation-note" value={planNote} onChange={event => setPlanNote(event.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                <button type="button" disabled={saving} onClick={() => void handleSave({ closeAfter: false, allowEmpty: true })} style={{ ...inputStyle, alignSelf: 'flex-start', cursor: 'pointer' }}>Notu kaydet</button>
                <span style={{ color: 'var(--foreground-3)', fontSize: 12 }}>Aşağıdaki notlar hastanın genel geçmişine aittir.</span>
              </div>

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
                    <button onClick={() => { setEditingConsultationId(null); setNewConsultation(''); setNewDisease(''); }} style={{ padding: '8px 16px', background: 'var(--card-bg)', color: 'var(--foreground)', borderRadius: 6, border: '1px solid var(--glass-border)', cursor: 'pointer', height: 38, whiteSpace: 'nowrap' }}>İptal</button>
                  )}
                </div>
              </div>

              {consultations.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: 6, background: 'var(--glass-bg)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                    <thead style={{ background: 'var(--card-bg)' }}>
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
                            <button onClick={() => { setEditingConsultationId(c.id); setNewConsultation(c.consultationNote || ''); setNewDisease(c.diseaseNote || ''); }} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}><Pencil size={14} /></button>
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
                            }} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
              )}
            </div>
          </div>
          {/* RIGHT COLUMN */}
          <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, borderLeft: '1px solid var(--glass-border)', paddingLeft: 24, overflowY: 'auto' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                🛒 Atanan İşlemler
                {Object.keys(toothDrafts).length > 0 && <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10 }}>{Object.keys(toothDrafts).length} Diş</span>}
              </div>

              {Object.keys(toothDrafts).length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground-3)', fontSize: '0.85rem', textAlign: 'center', padding: 20 }}>
                  <BriefcaseMedical size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                  Soldan işlem veya endikasyon seçin; ardından seçili dişlere uygulayın. Sürükle-bırak da kullanılabilir.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: 8, background: 'var(--glass-bg)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                      <thead style={{ background: 'var(--input-bg)', color: 'var(--foreground-2)' }}>
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
                                  background: isSelectedRow ? 'var(--glass-bg)' : 'var(--card-bg)',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--accent)' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span>{targetLabel(tooth)}</span>
                                    {(draft.surface || (toothSurfaces[Number(tooth)] && toothSurfaces[Number(tooth)].length > 0)) && (
                                      <span
                                        title="Seçili Diş Yüzeyleri"
                                        style={{
                                          background: 'var(--badge-clinic-bg)',
                                          color: 'var(--badge-clinic-fg)',
                                          border: '1px solid var(--badge-clinic-border)',
                                          borderRadius: 4,
                                          padding: '1px 5px',
                                          fontSize: 10,
                                          fontWeight: 700,
                                          letterSpacing: 0.5,
                                          display: 'inline-block',
                                          textAlign: 'center'
                                        }}
                                      >
                                        {draft.surface || toothSurfaces[Number(tooth)].join('')}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '8px 12px', color: 'var(--foreground)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600 }}>{draft.name}</span>
                                    {(draft.section || toothSections[Number(tooth)]) && (
                                      <span
                                        title="Anatomik Bölüm"
                                        style={{
                                          background: 'var(--badge-clinic-bg)',
                                          color: '#c7d2fe',
                                          border: '1px solid #6366f1',
                                          borderRadius: 4,
                                          padding: '1px 6px',
                                          fontSize: 10,
                                          fontWeight: 600
                                        }}
                                      >
                                        {draft.section || toothSections[Number(tooth)]}
                                      </span>
                                    )}
                                    {defectMarkers.filter(m => m.fdi === Number(tooth)).length > 0 && (
                                      <span
                                        title="3D Lezyon/Çürük Noktaları"
                                        style={{
                                          background: 'var(--badge-clinic-bg)',
                                          color: 'var(--badge-clinic-fg)',
                                          border: '1px solid var(--badge-clinic-border)',
                                          borderRadius: 4,
                                          padding: '1px 5px',
                                          fontSize: 10,
                                          fontWeight: 600,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 2
                                        }}
                                      >
                                        📍 {defectMarkers.filter(m => m.fdi === Number(tooth)).length} Lezyon
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <select
                                      value={draft.doctorId || ''}
                                      disabled={draft.locked}
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
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>{(draft.price + draft.materials.reduce((sum, material) => sum + (Number(material.unitSalePriceMinor || 0) * Number(material.quantity) / 100), 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                    <button disabled={draft.locked} onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedToothForDetails(tooth);
                                    }} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }} title="Detayları Düzenle">
                                      <Pencil size={14} />
                                    </button>
                                    <button disabled={draft.locked} onClick={(e) => {
                                      e.stopPropagation();
                                      setToothDrafts(prev => {
                                        const next = { ...prev };
                                        next[tooth] = next[tooth].filter(d => d.id !== draft.id);
                                        if (next[tooth].length === 0) delete next[tooth];
                                        return next;
                                      });
                                    }} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }} title="İşlemi Sil">
                                      <X size={14} />
                                    </button>
                                    {draft.locked && <span title="Tamamlanmış veya ödemeye bağlı tedavi" style={{ color: 'var(--foreground-3)', fontSize: 11 }}>Kilitli</span>}
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
                        <span>{pricing ? (pricing.subtotalMinor / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '—'} ₺</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--foreground-2)' }}>
                        <span>İskonto (%):</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 120 }}>
                          <input aria-label="Yüzde iskonto" type="number" min="0" max="100" step="0.01" value={discount || ''} onChange={e => setDiscount(Number(e.target.value))} placeholder="0" style={{ ...inputStyle, width: '100%', padding: '4px 8px', fontSize: '0.8rem', textAlign: 'right' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--foreground-2)' }}>
                        <span>Manuel iskonto (₺):</span>
                        <input aria-label="Manuel iskonto" type="number" min="0" step="0.01" value={discountFixed || ''} onChange={e => setDiscountFixed(Number(e.target.value))} placeholder="0" style={{ ...inputStyle, width: 120, padding: '4px 8px', textAlign: 'right' }} />
                      </div>
                      {!pricing && <span role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>Fiyat veya iskonto geçersiz.</span>}
                      <div style={{ height: 1, background: 'var(--glass-border)' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                        <span>Genel Toplam:</span>
                        <span>{pricing ? (pricing.totalMinor / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '—'} ₺</span>
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
                <button onClick={handleModalClose} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--card-bg)', color: 'var(--foreground)', cursor: 'pointer', fontWeight: 600 }}>İptal</button>
                <button disabled={saving} onClick={() => void handleSave()} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontWeight: 600 }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
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
          <div style={{ position: 'fixed', inset: 0, background: 'var(--modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100005 }} {...toothDetailsBackdropDismiss}>
            <div style={{ background: 'var(--background)', width: 1400, maxWidth: '98vw', height: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 16, border: '1px solid var(--glass-border)', boxShadow: '0 24px 48px rgba(0,0,0,0.4)', overflow: 'hidden', position: 'relative' }} onClick={e => e.stopPropagation()}>
              
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--glass-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--foreground)' }}>{targetLabel(tooth)} Detayları</h3>
                  {editingGroup && editingGroup.creatorName && (
                    <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: 12, background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--foreground-2)' }}>
                      Oluşturan: {editingGroup.creatorName} {editingGroup.creatorRole && `(${editingGroup.creatorRole})`}
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedToothForDetails(null)} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--foreground-2)', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
              </div>

              <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* 3D Anatomik Yüzey ve Bölüm Hızlı Seçici */}
                <div style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📐 Diş Yüzeyleri (MODBL) & Anatomik Bölüm</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Yüzey Butonları */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--foreground-2)', fontWeight: 600 }}>Yüzeyler:</span>
                      {['M', 'O', 'D', 'B', 'L'].map(surf => {
                        const toothNum = Number(tooth);
                        const curSurfaces = toothSurfaces[toothNum] || [];
                        const isSel = curSurfaces.includes(surf);
                        return (
                          <button
                            key={surf}
                            type="button"
                            onClick={() => {
                              const nextSurfs = isSel ? curSurfaces.filter(s => s !== surf) : [...curSurfaces, surf];
                              setToothSurfaces(prev => ({ ...prev, [toothNum]: nextSurfs }));
                              setToothDrafts(prev => {
                                if (!prev[tooth]) return prev;
                                return {
                                  ...prev,
                                  [tooth]: prev[tooth].map(d => ({ ...d, surface: nextSurfs.join('') || undefined }))
                                };
                              });
                            }}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 6,
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: 'pointer',
                              border: isSel ? '2px solid #3b82f6' : '1px solid #334155',
                              background: isSel ? 'var(--btn-clinic-primary-bg)' : 'var(--btn-clinic-blue-bg)',
                              color: isSel ? 'var(--btn-clinic-primary-fg)' : 'var(--btn-clinic-blue-fg)'
                            }}
                          >
                            {surf}
                          </button>
                        );
                      })}
                      {['O', 'MO', 'DO', 'MOD'].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            const pSurfs = preset.split('');
                            const toothNum = Number(tooth);
                            setToothSurfaces(prev => ({ ...prev, [toothNum]: pSurfs }));
                            setToothDrafts(prev => {
                              if (!prev[tooth]) return prev;
                              return {
                                ...prev,
                                [tooth]: prev[tooth].map(d => ({ ...d, surface: preset }))
                              };
                            });
                          }}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: 'var(--btn-clinic-blue-bg)',
                            color: 'var(--badge-clinic-fg)',
                            border: '1px solid var(--input-border)'
                          }}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    {/* Bölüm Seçimi */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--foreground-2)', fontWeight: 600 }}>Bölüm:</span>
                      {[{ value: 'crown', label: 'Kuron' }, { value: 'cervical', label: 'Kole (Servikal)' }, { value: 'root', label: 'Kök & Apeks' }].map(({ value: sec, label }) => {
                        const toothNum = Number(tooth);
                        const curSec = toothSections[toothNum];
                        const isSel = curSec === sec;
                        return (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => {
                              const newSec = isSel ? null : sec;
                              setToothSections(prev => {
                                const next = { ...prev };
                                if (newSec) next[toothNum] = newSec;
                                else delete next[toothNum];
                                return next;
                              });
                              setToothDrafts(prev => {
                                if (!prev[tooth]) return prev;
                                return {
                                  ...prev,
                                  [tooth]: prev[tooth].map(d => ({ ...d, section: newSec || undefined }))
                                };
                              });
                            }}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: isSel ? '2px solid #6366f1' : '1px solid #334155',
                              background: isSel ? 'var(--btn-clinic-primary-bg)' : 'var(--btn-clinic-blue-bg)',
                              color: isSel ? 'var(--btn-clinic-primary-fg)' : 'var(--btn-clinic-blue-fg)'
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
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
                        }} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }} title="İşlemi Sil"><Trash2 size={16} /></button>
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
                              <div key={mIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--input-bg)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
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
                                  <label style={{ color: 'var(--foreground-2)', fontSize: 12 }}>Satış ₺
                                    <input aria-label={`${m.name} satış bedeli`} type="number" min="0" step="0.01" value={(m.unitSalePriceMinor || 0) / 100} onChange={e => {
                                      const unitSalePriceMinor = Math.round(Number(e.target.value) * 100);
                                      setToothDrafts(previous => ({ ...previous, [tooth]: previous[tooth].map(item => item.id === proc.id
                                        ? { ...item, materials: item.materials.map((material, index) => index === mIdx ? { ...material, unitSalePriceMinor } : material) } : item) }));
                                    }} style={{ ...inputStyle, width: 80, marginLeft: 5 }} />
                                  </label>
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
                                  }} style={{ background: 'var(--card-bg)', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={16} /></button>
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
          {...contextMenuBackdropDismiss}
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
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--card-bg)'}
                  onClick={() => {
                    handleDropTreatment(contextMenu.teeth, { procedures: [p], indications: [] });
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
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--card-bg)'}
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
