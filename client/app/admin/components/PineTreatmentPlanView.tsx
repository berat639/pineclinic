import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Bell, CalendarDays, ChevronDown, Download, FileText, GripVertical, Mic, MicOff, Pencil, Plus, Printer, Save, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import PlanDialog from './PlanDialog'
import InlineCatalogForm, { type CreatedCatalogEntry, type EditingCatalogItem } from './InlineCatalogForm'
import PlanHistoryDialog from './PlanHistoryDialog'
import PlanToothTools from './PlanToothTools'
import PatientConsentPanel from './PatientConsentPanel'
import PlanMediaPanel from './PlanMediaPanel'
import TreatmentDoctorMultiSelect from './TreatmentDoctorMultiSelect'
import TableToothGroupCell, { formatTargetPlainName, groupTreatmentDraftRows, type GroupedToothEntry } from './TableToothGroupCell'
import { HideableColumnHeader, TreatmentTableColumnBar, useTreatmentTableColumns } from './TreatmentTableColumnManager'
import OdontogramSelectionBar from './OdontogramSelectionBar'
import ToothAnatomy2D, { formatToothRegionShortLabel, parseToothRegions, serializeToothRegions } from './ToothAnatomy2D'
import {
  IndicationPortButton,
  ProcedurePortButton,
  IndicationProcedureLinkOverlay,
  getLinkedIndicationsForProcedure,
  toggleIndicationProcedureLink,
  removeIndicationProcedureLink,
  removeIndicationFromLinks,
  renameIndicationInLinks,
  removeProcedureFromLinks,
  getProcedureLinkKey,
  type IndicationProcedureLinks,
} from './IndicationProcedureLinker'
import { LOWER_TEETH, ToothChip, UPPER_TEETH } from './ToothChip'
import { parseDraggedTreatmentPayload, resolveMultiToothDragTargets } from '../../../lib/treatment-drag-drop'
import { downloadOfficialDentalConsentPdf } from '../../../lib/official-dental-consent'
import { formatReminderLabel, getTdbReminderSuggestion, REMINDER_PRESETS } from '../../../lib/tdb-reminder-intervals'
import { checkDoctorAvailability } from '../../../lib/doctor-availability'
import {
  formatPercentDiscountDisplay,
  formatTlAmountDisplay,
  isSelectableTreatmentMaterial,
  maskAndClampPercentDiscount,
  maskAndClampTlDiscount,
} from '../../../lib/tl-price-input'
import {
  extractAllFdiTeethInOrder,
  mergeBufferedTeethWithCommand,
  normalizeDentalCommandNumbers,
  repairTurkishDentalPhonetics,
} from '../../../lib/dental-voice-parser'
import {
  isCloseVoiceCommand,
  normalizeQuadrantToothPhrases,
  parsePineVoiceCommand,
  resolveCatalogProcedure,
  safePickBestAlternative,
  type PineVoiceParseOutcome,
} from '../../../lib/pine-voice-command'
import styles from './PineTreatmentPlan.module.css'

const money = (minor: number) => `${(minor / 100).toLocaleString('tr-TR', { minimumFractionDigits: minor % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })} ₺`
const targetName = (target: string) => target === 'upper' ? 'Üst çene' : target === 'lower' ? 'Alt çene' : target === 'general' ? 'Tüm ağız' : target

function IndicationIcon() {
  return <svg aria-hidden="true" className={styles.indicationIcon} viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2C3 2 2 5 2 8s1 8 2 16c.3 1.5 1 2 2.5 2s2.3-1 2.5-2.5v-4h6v4c.2 1.5 1 2.5 2.5 2.5S20 24.5 20 23c1-8 2-13 2-16 0-3-1-6-4-6-2.5 0-4 2-5 3.5C12 3 10.5 2 8 2z" /></svg>
}

// The view owns only temporary catalog selections; the parent owns the plan draft.
export default function PineTreatmentPlanView(p: any) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [consentDropdownOpen, setConsentDropdownOpen] = useState(false)
  const [doctorWarning, setDoctorWarning] = useState<string | null>(null)
  const patientDropdownRef = useRef<HTMLDivElement>(null)
  const reminderDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reminderOpen && !consentDropdownOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest(`.${styles.dialogOverlay}`)) return
      if (consentDropdownOpen && patientDropdownRef.current && !patientDropdownRef.current.contains(target)) {
        setConsentDropdownOpen(false)
      }
      if (reminderOpen && reminderDropdownRef.current && !reminderDropdownRef.current.contains(target)) {
        setReminderOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConsentDropdownOpen(false)
        setReminderOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [reminderOpen, consentDropdownOpen])
  const [procedureId, setProcedureId] = useState('')
  const [indications, setIndications] = useState<string[]>([])
  const [procedureSearch, setProcedureSearch] = useState('')
  const [indicationSearch, setIndicationSearch] = useState('')
  const [materials, setMaterials] = useState<any[]>([])
  const [materialId, setMaterialId] = useState('')
  const [indicationEditor, setIndicationEditor] = useState<string | null>(null)
  const [procedureEditor, setProcedureEditor] = useState<string | null>(null)
  const [editingIndication, setEditingIndication] = useState<EditingCatalogItem | null>(null)
  const [editingProcedure, setEditingProcedure] = useState<EditingCatalogItem | null>(null)
  const indicationListRef = useRef<HTMLDivElement>(null)
  const procedureListRef = useRef<HTMLDivElement>(null)
  const indicationAddRef = useRef<HTMLButtonElement>(null)
  const procedureAddRef = useRef<HTMLButtonElement>(null)
  const workgridRef = useRef<HTMLDivElement>(null)
  const [activeSourceIndication, setActiveSourceIndication] = useState<string | null>(null)
  const [localIndicationLinks, setLocalIndicationLinks] = useState<IndicationProcedureLinks>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const saved = window.localStorage.getItem('voiceai_indication_procedure_links')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
  const indicationLinks: IndicationProcedureLinks = p.indicationLinks || localIndicationLinks
  const updateIndicationLinks = (updater: (prev: IndicationProcedureLinks) => IndicationProcedureLinks) => {
    if (typeof p.setIndicationLinks === 'function') {
      p.setIndicationLinks(updater)
    } else {
      setLocalIndicationLinks(prev => {
        const next = updater(prev)
        try {
          window.localStorage.setItem('voiceai_indication_procedure_links', JSON.stringify(next))
        } catch {}
        return next
      })
    }
  }
  const [materialRow, setMaterialRow] = useState<{ target: string; id: string; entries?: GroupedToothEntry[] } | null>(null)
  const selectableInventory = (p.inventory || []).filter(isSelectableTreatmentMaterial)
  const selectedProcedure = p.procedures.find((item: any) => item.id === procedureId)
  const resolveProcColor = (item: any) =>
    item?.color ||
    p.procedures?.find((t: any) => (item?.procedureId && t.id === item.procedureId) || t.name === item?.name)?.color ||
    p.procTemplates?.find((t: any) => t.name === item?.name)?.color ||
    '#0284c7'
  const selectedIndicationName = indications.length === 1 ? indications[0] : null
  const selectedIndicationId = selectedIndicationName ? p.indicationIds[selectedIndicationName] : null
  const rows: { target: string; item: any }[] = Object.entries(p.drafts).flatMap(([target, items]) => (items as any[]).map(item => ({ target, item })))
  const groupedRows = groupTreatmentDraftRows(p.drafts)
  const columnManager = useTreatmentTableColumns(rows)
  const { visibleColumns, colWidths, tableStyle } = columnManager
  const computedSubtotalMinor = rows.reduce((sum, { item }) => {
    const baseMinor = Math.max(0, Math.round((Number(item?.price) || 0) * 100))
    const matMinor = (item?.materials || []).reduce(
      (mSum: number, m: any) =>
        mSum + Math.max(1, Math.round(Number(m?.quantity) || 1)) * Math.max(0, Math.round(Number(m?.unitSalePriceMinor) || 0)),
      0
    )
    return sum + baseMinor + matMinor
  }, 0)
  const effectiveSubtotalMinor = p.pricing?.subtotalMinor ?? computedSubtotalMinor
  const clampedPercentBps = Math.max(0, Math.min(10000, Math.round((Number(p.discount) || 0) * 100)))
  const computedPercentageDiscountMinor = Math.floor((effectiveSubtotalMinor * clampedPercentBps + 5000) / 10000)
  const maxFixedDiscountMinor = Math.max(0, effectiveSubtotalMinor - computedPercentageDiscountMinor)
  const [discountText, setDiscountText] = useState(() => formatPercentDiscountDisplay(p.discount))
  const [discountFixedText, setDiscountFixedText] = useState(() => formatTlAmountDisplay(p.discountFixed))

  useEffect(() => {
    const nextNum = Number(p.discount) || 0
    const currentParsed = maskAndClampPercentDiscount(discountText)?.percent ?? 0
    if (Math.round(currentParsed * 100) !== Math.round(nextNum * 100)) {
      setDiscountText(formatPercentDiscountDisplay(nextNum))
    }
  }, [p.discount])

  useEffect(() => {
    const nextNum = Number(p.discountFixed) || 0
    const currentParsedMinor = maskAndClampTlDiscount(discountFixedText)?.amountMinor ?? 0
    if (currentParsedMinor !== Math.round(nextNum * 100)) {
      setDiscountFixedText(formatTlAmountDisplay(nextNum))
    }
  }, [p.discountFixed])

  useEffect(() => {
    const currentFixedMinor = Math.round((Number(p.discountFixed) || 0) * 100)
    if (currentFixedMinor > maxFixedDiscountMinor) {
      const clampedTl = maxFixedDiscountMinor / 100
      p.setDiscountFixed(clampedTl)
      setDiscountFixedText(formatTlAmountDisplay(clampedTl))
    }
  }, [maxFixedDiscountMinor, p.discountFixed])
  const tdbSuggestion = getTdbReminderSuggestion(rows.map(row => row.item?.name || ''))
  const [customDayDraft, setCustomDayDraft] = useState('')
  const selectedDaysList: number[] = p.periodic
    ? (Array.isArray(p.periodDaysList) && p.periodDaysList.length > 0
      ? Array.from(new Set<number>(p.periodDaysList.map(Number).filter((n: number) => Number.isFinite(n) && n >= 1))).sort((a, b) => a - b)
      : [Number(p.periodDays) || 180])
    : []
  const customSelectedDays = selectedDaysList.filter(d => !REMINDER_PRESETS.some(preset => preset.days === d))
  const applyDaysList = (rawList: number[]) => {
    const cleaned = Array.from(new Set(rawList.map(Number).filter(n => Number.isFinite(n) && n >= 1 && n <= 3650))).sort((a, b) => a - b)
    if (cleaned.length === 0) {
      p.setPeriodic(false)
      p.setPeriodDaysList?.([])
      return
    }
    p.setPeriodic(true)
    p.setPeriodDays(cleaned[0])
    p.setPeriodDaysList?.(cleaned)
  }
  const toggleReminderDay = (day: number) => {
    if (!p.periodic) {
      applyDaysList([day])
      return
    }
    if (selectedDaysList.includes(day)) {
      applyDaysList(selectedDaysList.filter(d => d !== day))
    } else {
      applyDaysList([...selectedDaysList, day])
    }
  }
  const commitCustomDayDraft = () => {
    const parsed = Number(customDayDraft.trim())
    if (!Number.isFinite(parsed) || parsed < 1) return
    const clamped = Math.max(1, Math.min(3650, Math.round(parsed)))
    applyDaysList([...selectedDaysList, clamped])
    setCustomDayDraft('')
  }
  const suggestionDays = tdbSuggestion?.daysList?.length ? tdbSuggestion.daysList : (tdbSuggestion ? [tdbSuggestion.days] : [])
  const isSuggestionAlreadyApplied = tdbSuggestion
    ? (!tdbSuggestion.periodic ? !p.periodic : (p.periodic && suggestionDays.every(d => selectedDaysList.includes(d))))
    : true
  const patientName = p.patient?.name || p.event?.title?.split(' - ')[0] || 'Hasta'
  const initials = patientName.split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toLocaleUpperCase('tr-TR')
  const updateRow = (target: string, id: string, update: (item: any) => any) => {
    const existingItem = (p.drafts?.[target] || []).find((item: any) => item.id === id)
    if (existingItem && (existingItem.wasCompleted || existingItem.status === 'completed')) {
      toast('⚠️ Tamamlanmış bir işlemde değişiklik yaptınız. Kaydederken onayınız istenecektir.', { icon: '⚠️', id: 'completed-edit-warn' })
    }
    p.setDrafts((previous: any) => ({
      ...previous,
      [target]: (previous[target] || []).map((item: any) => (item.id === id ? update(item) : item)),
    }))
  }
  const updateGroupEntries = (entries: GroupedToothEntry[], update: (item: any) => any) => {
    const idsByTarget = new Map<string, Set<string>>()
    let touchesCompleted = false
    for (const entry of entries) {
      if (entry.item?.wasCompleted || entry.item?.status === 'completed') {
        touchesCompleted = true
      }
      const set = idsByTarget.get(entry.target) || new Set<string>()
      set.add(entry.item.id)
      idsByTarget.set(entry.target, set)
    }
    if (touchesCompleted) {
      toast('⚠️ Tamamlanmış bir işlemde değişiklik yaptınız. Kaydederken onayınız istenecektir.', { icon: '⚠️', id: 'completed-edit-warn' })
    }
    p.setDrafts((previous: any) => {
      const next = { ...previous }
      for (const [target, idSet] of idsByTarget.entries()) {
        if (Array.isArray(next[target])) {
          next[target] = next[target].map((item: any) => (idSet.has(item.id) ? update(item) : item))
        }
      }
      return next
    })
  }
  const removeSingleToothEntry = (target: string, itemId: string, item?: any) => {
    if (item?.wasCompleted || item?.status === 'completed') {
      toast('⚠️ Tamamlanmış bir işlem kaldırıldı. Planı kaydederken onayınız istenecektir.', { icon: '⚠️', id: 'completed-edit-warn' })
    }
    const remaining = (p.drafts?.[target] || []).filter((row: any) => row.id !== itemId)
    p.setDrafts((previous: any) => {
      const next = { ...previous, [target]: (previous[target] || []).filter((row: any) => row.id !== itemId) }
      if (next[target]?.length === 0) delete next[target]
      return next
    })
    if (remaining.length === 0 && /^[1-4][1-8]$/.test(target)) {
      const toothNum = Number(target)
      p.updateSection?.(toothNum, null)
      p.updateSurfaces?.(toothNum, [])
    }
  }
  const removeGroupEntries = (entries: GroupedToothEntry[]) => {
    if (entries.some(e => e.item?.wasCompleted || e.item?.status === 'completed')) {
      toast('⚠️ Tamamlanmış bir işlem kaldırıldı. Planı kaydederken onayınız istenecektir.', { icon: '⚠️', id: 'completed-edit-warn' })
    }
    const emptiedNumericTeeth = new Set<number>()
    for (const entry of entries) {
      if (/^[1-4][1-8]$/.test(entry.target)) {
        const removingIds = new Set(entries.filter(e => e.target === entry.target).map(e => e.item.id))
        const left = (p.drafts?.[entry.target] || []).filter((row: any) => !removingIds.has(row.id))
        if (left.length === 0) emptiedNumericTeeth.add(Number(entry.target))
      }
    }
    p.setDrafts((previous: any) => {
      const next = { ...previous }
      for (const entry of entries) {
        if (Array.isArray(next[entry.target])) {
          next[entry.target] = next[entry.target].filter((row: any) => row.id !== entry.item.id)
          if (next[entry.target].length === 0) delete next[entry.target]
        }
      }
      return next
    })
    emptiedNumericTeeth.forEach(toothNum => {
      p.updateSection?.(toothNum, null)
      p.updateSurfaces?.(toothNum, [])
    })
  }
  const clearAllOdontogramSelections = () => {
    const candidateTeeth = new Set<number>([
      ...(Array.isArray(p.selected) ? p.selected.map(Number) : []),
      ...Object.keys(p.toothSections || {}).map(Number),
      ...Object.keys(p.toothSurfaces || {}).map(Number),
    ])
    candidateTeeth.forEach(toothNum => {
      if (!Number.isFinite(toothNum) || toothNum <= 0) return
      const hasDrafts = Array.isArray(p.drafts?.[toothNum]) && p.drafts[toothNum].length > 0
      const hasStrDrafts = Array.isArray(p.drafts?.[String(toothNum)]) && p.drafts[String(toothNum)].length > 0
      if (!hasDrafts && !hasStrDrafts) {
        p.updateSection?.(toothNum, null)
        p.updateSurfaces?.(toothNum, [])
      }
    })
    p.setSelected?.([])
  }
  const apply = (targets: (number | string)[], proc = selectedProcedure, inds = indications, mats = materials) => {
    const mergedInds = proc ? getLinkedIndicationsForProcedure(indicationLinks, proc, inds) : inds
    if (!proc && !mergedInds.length) { toast.error('Tedavi veya endikasyon seçin.'); return }
    let resolvedTargets: (number | string)[] = targets
    if (proc?.scope === 'mouth') {
      resolvedTargets = ['general']
    } else if (proc?.scope === 'jaw' && !resolvedTargets.length) {
      resolvedTargets = [p.jaw === 'lower' ? 'lower' : 'upper']
    }
    if (!resolvedTargets.length) { toast.error('Önce hedef diş seçin.'); return }
    p.add(resolvedTargets, { procedures: proc ? [proc] : [], indications: mergedInds, activeMaterials: mats })
  }
  const selectProcedure = (proc: any) => {
    setProcedureId(proc.id); setMaterials((proc.materials || []).filter(isSelectableTreatmentMaterial).map((item: any) => ({ ...item })))
  }
  const syncProcedureMaterials = (nextMaterials: any[]) => {
    const cleanedMaterials = nextMaterials.filter(isSelectableTreatmentMaterial)
    setMaterials(cleanedMaterials)
    if (!selectedProcedure?.id) return
    p.setProcedures((previous: any[]) => previous.map(item => item.id === selectedProcedure.id ? { ...item, materials: cleanedMaterials } : item))
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedProcedure.id)) {
      void fetch(`/api/dental/treatment-catalog/${selectedProcedure.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'procedure',
          name: selectedProcedure.name,
          scope: selectedProcedure.scope || 'tooth',
          priceMinor: Math.round((selectedProcedure.price || 0) * 100),
          color: selectedProcedure.color,
          materials: cleanedMaterials.map(m => ({
            inventoryItemId: m.inventoryItemId,
            quantity: Math.max(1, Number(m.quantity) || 1),
            unitSalePriceMinor: Math.max(0, Number(m.unitSalePriceMinor) || 0),
          })),
        }),
      }).catch(() => { })
    }
  }
  const addMaterial = () => {
    const item = selectableInventory.find((entry: any) => entry.id === materialId)
    if (!selectedProcedure || !item) return
    if (!materials.some(entry => entry.inventoryItemId === item.id)) {
      syncProcedureMaterials([...materials, { inventoryItemId: item.id, name: item.name, quantity: 1, unitCost: item.costPerUnit, unitSalePriceMinor: 0 }])
    }
    setMaterialId('')
  }
  const filteredIndications = p.indications.filter((name: string) => name.toLocaleLowerCase('tr-TR').includes(indicationSearch.trim().toLocaleLowerCase('tr-TR')))
  const filteredProcedures = p.procedures.filter((item: any) => item.name.toLocaleLowerCase('tr-TR').includes(procedureSearch.trim().toLocaleLowerCase('tr-TR')))
  const closeCatalogEditor = (kind: 'procedure' | 'indication') => {
    if (kind === 'procedure') { setProcedureEditor(null); setEditingProcedure(null) }
    else { setIndicationEditor(null); setEditingIndication(null) }
    requestAnimationFrame(() => (kind === 'procedure' ? procedureAddRef : indicationAddRef).current?.focus())
  }
  const catalogCreated = (kind: 'procedure' | 'indication', result: CreatedCatalogEntry) => {
    if (kind === 'procedure') {
      const wasEditing = !!editingProcedure
      const procedure = { ...result, price: result.priceMinor / 100, materials: result.materials || editingProcedure?.defaultMaterials || [] }
      p.setProcedures((previous: any[]) => wasEditing ? previous.map(item => item.id === result.id ? procedure : item) : [procedure, ...previous.filter(item => item.id !== result.id)])
      if (wasEditing) {
        p.setDrafts((previous: any) => Object.fromEntries(
          Object.entries(previous).map(([target, items]) => [
            target,
            (items as any[]).map(item => !item.locked && (item.procedureId === result.id || item.name === editingProcedure?.name) ? { ...item, name: result.name, color: result.color || item.color } : item),
          ])
        ))
      }
      setProcedureId(result.id); setMaterials(procedure.materials.map((item: any) => ({ ...item }))); setMaterialId(''); setProcedureSearch('')
      if (!wasEditing && procedureListRef.current) procedureListRef.current.scrollTop = 0
      closeCatalogEditor(kind)
      toast.success(wasEditing ? `${result.name} güncellendi.` : `${result.name} kataloğa eklendi ve seçildi.`)
    } else {
      const wasEditing = !!editingIndication
      const oldName = editingIndication?.name
      p.setIndications((previous: string[]) => wasEditing && oldName ? previous.map(name => name === oldName ? result.name : name) : [result.name, ...previous.filter(name => name !== result.name)])
      p.setIndicationIds((previous: any) => {
        const next = { ...previous, [result.name]: result.id }
        if (oldName && oldName !== result.name) delete next[oldName]
        return next
      })
      if (oldName && oldName !== result.name) {
        updateIndicationLinks(prev => renameIndicationInLinks(prev, oldName, result.name))
      }
      setIndications(previous => {
        const cleaned = oldName ? previous.filter(name => name !== oldName) : previous
        return cleaned.includes(result.name) ? cleaned : [...cleaned, result.name]
      })
      setIndicationSearch('')
      if (!wasEditing && indicationListRef.current) indicationListRef.current.scrollTop = 0
      closeCatalogEditor(kind)
      toast.success(wasEditing ? `${result.name} güncellendi.` : `${result.name} kataloğa eklendi ve seçildi.`)
    }
  }
  const archiveCatalogEntry = async (kind: 'procedure' | 'indication', id: string, name: string) => {
    try {
      const response = await fetch(`/api/dental/treatment-catalog/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Katalog kaydı kaldırılamadı.')
      }
      if (kind === 'procedure') {
        p.setProcedures((previous: any[]) => previous.filter(item => item.id !== id))
        updateIndicationLinks(prev => removeProcedureFromLinks(prev, id, name))
        if (procedureId === id) { setProcedureId(''); setMaterials([]) }
      } else {
        p.setIndications((previous: string[]) => previous.filter(item => item !== name))
        setIndications(previous => previous.filter(item => item !== name))
        updateIndicationLinks(prev => removeIndicationFromLinks(prev, name))
        if (activeSourceIndication === name) setActiveSourceIndication(null)
      }
      toast.success(`${name} katalogdan kaldırıldı.`)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Katalog kaydı kaldırılamadı.')
    }
  }
  const materialItem = materialRow && rows.find(row => row.target === materialRow.target && row.item.id === materialRow.id)?.item

  // --- SELF-CONTAINED VOICE COMMAND ENGINE (Fixes stale closures & object-array crash) ---
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceStarting, setVoiceStarting] = useState(false)
  const [voiceAnalyzing, setVoiceAnalyzing] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [manualVoiceInput, setManualVoiceInput] = useState('')

  const voiceListeningRef = useRef(false)
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bufferedVoiceTeethRef = useRef<string[]>([])
  const lastExecutedSignatureRef = useRef<{ sig: string; at: number }>({ sig: '', at: 0 })

  const latestVoiceCtxRef = useRef({
    procedures: p.procedures || [],
    indications: p.indications || [],
    inventory: selectableInventory,
    indicationLinks,
    selected: (p.selected || []) as number[],
    drafts: p.drafts || {},
    toothSurfaces: p.toothSurfaces || {},
    toothSections: p.toothSections || {},
    add: p.add,
    setDrafts: p.setDrafts,
    setSelected: p.setSelected,
    updateSurfaces: p.updateSurfaces,
    updateSection: p.updateSection,
    save: p.save,
  })
  latestVoiceCtxRef.current = {
    procedures: p.procedures || [],
    indications: p.indications || [],
    inventory: selectableInventory,
    indicationLinks,
    selected: (p.selected || []) as number[],
    drafts: p.drafts || {},
    toothSurfaces: p.toothSurfaces || {},
    toothSections: p.toothSections || {},
    add: p.add,
    setDrafts: p.setDrafts,
    setSelected: p.setSelected,
    updateSurfaces: p.updateSurfaces,
    updateSection: p.updateSection,
    save: p.save,
  }

  const stopPineVoice = () => {
    voiceListeningRef.current = false
    setVoiceListening(false)
    setVoiceStarting(false)
    setVoiceAnalyzing(false)
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    bufferedVoiceTeethRef.current = []
    if (recognitionRef.current) {
      const rec = recognitionRef.current
      recognitionRef.current = null
      try {
        rec.onend = null
        rec.onerror = null
        rec.onresult = null
        rec.stop()
      } catch {}
    }
  }

  useEffect(() => {
    return () => {
      stopPineVoice()
    }
  }, [])

  const executeVoiceOutcome = (outcome: PineVoiceParseOutcome, rawText: string): boolean => {
    const ctx = latestVoiceCtxRef.current
    if (outcome.closeRequested) {
      stopPineVoice()
      toast('🎙️ Sesli komut dinleme durduruldu.')
      return true
    }
    if (outcome.globalIntent === 'CONFIRM') {
      stopPineVoice()
      toast.success('✅ Tedavi planı kaydediliyor…')
      ctx.save?.()
      return true
    }

    let didExecute = false

    if (outcome.actions.length === 0 && outcome.selectIntent !== 'NONE') {
      switch (outcome.selectIntent) {
        case 'SELECT_MAXILLA':
          ctx.setSelected?.([...UPPER_TEETH])
          toast.success('🦷 Üst çene dişleri seçildi.')
          return true
        case 'SELECT_MANDIBLE':
          ctx.setSelected?.([...LOWER_TEETH])
          toast.success('🦷 Alt çene dişleri seçildi.')
          return true
        case 'SELECT_ALL':
          ctx.setSelected?.([...UPPER_TEETH, ...LOWER_TEETH])
          toast.success('🦷 Tüm dişler seçildi.')
          return true
        case 'CLEAR_SELECTION':
          ctx.setSelected?.([])
          bufferedVoiceTeethRef.current = []
          toast.success('✕ Diş seçimi temizlendi.')
          return true
        case 'SELECT_TEETH': {
          const validNums = outcome.targetTeeth
            .map(Number)
            .filter(n => Number.isInteger(n) && n >= 11 && n <= 48)
          if (validNums.length > 0) {
            ctx.setSelected?.(validNums)
            toast.success(`🦷 Seçilen dişler: #${validNums.join(', #')}`)
            return true
          }
          break
        }
      }
    }

    const affectedFdiTeeth: number[] = []

    for (const action of outcome.actions) {
      const validTargets = action.toothNumbers.filter(
        t => t === 'general' || t === 'upper' || t === 'lower' || /^[1-4][1-8]$/.test(String(t))
      )
      if (validTargets.length === 0) continue

      for (const t of validTargets) {
        const n = Number(t)
        if (Number.isInteger(n) && n >= 11 && n <= 48 && !affectedFdiTeeth.includes(n)) {
          affectedFdiTeeth.push(n)
        }
      }

      if (action.intent === 'DELETE') {
        ctx.setDrafts?.((prev: any) => {
          const next = { ...prev }
          for (const tk of validTargets) {
            const list = next[tk] || []
            if (action.procedureName) {
              const targetLower = action.procedureName.toLocaleLowerCase('tr-TR')
              next[tk] = list.filter(
                (row: any) => !(row.name || '').toLocaleLowerCase('tr-TR').includes(targetLower)
              )
            } else {
              next[tk] = []
            }
            if (next[tk]?.length === 0) delete next[tk]
          }
          return next
        })
        const labelStr = validTargets.map(t => (t === 'general' ? 'Tüm ağız' : t === 'upper' ? 'Üst çene' : t === 'lower' ? 'Alt çene' : `#${t}`)).join(', ')
        toast.success(`🗑️ ${labelStr} için ${action.procedureName || 'işlemler'} kaldırıldı.`)
        didExecute = true
        continue
      }

      // Sync surfaces and anatomical sub-layers on numeric teeth if spoken
      for (const tk of validTargets) {
        const toothNum = Number(tk)
        if (Number.isInteger(toothNum) && toothNum >= 11 && toothNum <= 48) {
          if (action.surfaces.length > 0 && typeof ctx.updateSurfaces === 'function') {
            const existingSurfs: string[] = ctx.toothSurfaces?.[toothNum] || []
            const mergedSurfs = Array.from(new Set([...existingSurfs, ...action.surfaces]))
            ctx.updateSurfaces(toothNum, mergedSurfs)
          }
          if (action.sections.length > 0 && typeof ctx.updateSection === 'function') {
            const existingRegs = parseToothRegions(ctx.toothSections?.[toothNum])
            const mergedRegs = Array.from(new Set([...existingRegs, ...action.sections]))
            ctx.updateSection(toothNum, serializeToothRegions(mergedRegs))
          }
        }
      }

      if (action.intent === 'UPDATE') {
        const proc = action.procedure
        const procName = proc?.name || action.procedureName || 'Kompozit Dolgu (Tek Yüzey)'
        const mergedInds = proc
          ? getLinkedIndicationsForProcedure(ctx.indicationLinks, proc, action.indications)
          : action.indications
        const mappedMats =
          action.materials.length > 0
            ? action.materials.map(m => ({
                inventoryItemId: m.inventoryItemId,
                name: m.name,
                quantity: Number(m.quantity) || 1,
                unitCost: Number(m.unitCost) || 0,
                unitSalePriceMinor: Number(m.unitSalePriceMinor) || 0,
              }))
            : (proc?.materials || []).map((m: any) => ({ ...m }))

        ctx.setDrafts?.((prev: any) => {
          const next = { ...prev }
          for (const tk of validTargets) {
            const existingRow = next[tk]?.[0]
            next[tk] = [
              {
                id: existingRow?.id || Math.random().toString(36).substring(2, 9),
                procedureId: proc?.id,
                scope: proc?.scope || (tk === 'general' ? 'mouth' : tk === 'upper' || tk === 'lower' ? 'jaw' : 'tooth'),
                name: procName,
                price: proc?.price ?? existingRow?.price ?? 0,
                indications: mergedInds,
                doctorId: existingRow?.doctorId ?? null,
                doctorIds: existingRow?.doctorIds || [],
                initialDoctorIds: existingRow?.initialDoctorIds || [],
                isFromSavedPlan: existingRow?.isFromSavedPlan || false,
                doctorManuallySelected: existingRow?.doctorManuallySelected || false,
                doctorAutoFilled: false,
                materials: mappedMats,
                color: proc?.color || existingRow?.color || '#0284c7',
                surface: action.surfaces.join('') || existingRow?.surface,
                section: action.sections.length ? serializeToothRegions(action.sections) || undefined : existingRow?.section,
              },
            ]
          }
          return next
        })
        const labelStr = validTargets.map(t => (t === 'general' ? 'Tüm ağız' : t === 'upper' ? 'Üst çene' : t === 'lower' ? 'Alt çene' : `#${t}`)).join(', ')
        toast.success(`✏️ ${labelStr} işlemi "${procName}" olarak güncellendi.`)
        didExecute = true
        continue
      }

      // ADD intent
      if (action.procedure || action.indications.length > 0) {
        const proc = action.procedure
        const mergedInds = proc
          ? getLinkedIndicationsForProcedure(ctx.indicationLinks, proc, action.indications)
          : action.indications
        const mappedMats =
          action.materials.length > 0
            ? action.materials.map(m => ({
                inventoryItemId: m.inventoryItemId,
                name: m.name,
                quantity: Number(m.quantity) || 1,
                unitCost: Number(m.unitCost) || 0,
                unitSalePriceMinor: Number(m.unitSalePriceMinor) || 0,
              }))
            : (proc?.materials || []).map((m: any) => ({ ...m }))

        const normalizedTargets: (number | string)[] = validTargets.map(t => {
          const n = Number(t)
          return Number.isInteger(n) && n >= 11 && n <= 48 ? n : String(t)
        })

        ctx.add?.(normalizedTargets, {
          procedures: proc ? [proc] : [],
          indications: mergedInds,
          activeMaterials: mappedMats,
          surface: action.surfaces.length > 0 ? action.surfaces.join('') : undefined,
          section: action.sections.length > 0 ? serializeToothRegions(action.sections) || undefined : undefined,
        })
        didExecute = true
      } else if (action.surfaces.length > 0 || action.sections.length > 0) {
        const parts: string[] = []
        if (action.surfaces.length > 0) parts.push(`Yüzey: ${action.surfaces.join(', ')}`)
        if (action.sections.length > 0) parts.push(`Katman: ${action.sections.map(formatToothRegionShortLabel).join(', ')}`)
        toast.success(`🦷 #${validTargets.join(', #')} → ${parts.join(' · ')} seçildi.`)
        didExecute = true
      }
    }

    if (affectedFdiTeeth.length > 0) {
      ctx.setSelected?.((prev: number[]) => Array.from(new Set([...(prev || []), ...affectedFdiTeeth])))
    }

    if (didExecute) {
      bufferedVoiceTeethRef.current = []
      setVoiceTranscript(`✅ Uygulandı: "${rawText}"`)
    }
    return didExecute
  }

  const processSpokenOrTypedCommand = async (rawInput: string, isFinalSpeech = true) => {
    const cleanInput = rawInput.trim()
    if (!cleanInput) return false
    const ctx = latestVoiceCtxRef.current

    const outcome = parsePineVoiceCommand(cleanInput, {
      procedures: ctx.procedures,
      indications: ctx.indications,
      inventory: ctx.inventory,
      indicationLinks: ctx.indicationLinks,
      bufferedTeeth: bufferedVoiceTeethRef.current,
      selectedTeeth: ctx.selected,
    })

    if (outcome.matched) {
      const sig = JSON.stringify({
        t: outcome.targetTeeth,
        s: outcome.selectIntent,
        g: outcome.globalIntent,
        c: outcome.closeRequested,
        a: outcome.actions.map(a => `${a.intent}:${a.toothNumbers.join(',')}:${a.procedureName || ''}:${a.indications.join(',')}:${a.surfaces.join('')}:${a.sections.join(',')}`),
      })
      const now = Date.now()
      if (lastExecutedSignatureRef.current.sig === sig && now - lastExecutedSignatureRef.current.at < 1800) {
        return true
      }
      lastExecutedSignatureRef.current = { sig, at: now }
      return executeVoiceOutcome(outcome, outcome.normalizedText || cleanInput)
    }

    // Check if the user only spoke tooth numbers so far (e.g., "36", "otuz altı", "sağ alt 6")
    const normalizedNumbers = repairTurkishDentalPhonetics(
      normalizeDentalCommandNumbers(normalizeQuadrantToothPhrases(cleanInput))
    )
    const spokenTeethOnly = extractAllFdiTeethInOrder(normalizedNumbers)
    const strippedWords = normalizedNumbers
      .replace(/\b[1-4][1-8]\b/g, '')
      .replace(/\b(numara|numarali|nolu|dis|dise|disler|ve|ile|virgul)\b/gi, '')
      .trim()

    if (spokenTeethOnly.length > 0 && strippedWords.length <= 2) {
      bufferedVoiceTeethRef.current = Array.from(new Set([...bufferedVoiceTeethRef.current, ...spokenTeethOnly]))
      const numericTeeth = bufferedVoiceTeethRef.current.map(Number).filter(n => Number.isInteger(n) && n >= 11 && n <= 48)
      if (numericTeeth.length > 0) {
        ctx.setSelected?.(numericTeeth)
      }
      setVoiceTranscript(`🦷 Diş #${bufferedVoiceTeethRef.current.join(', #')} seçildi — yapılacak işlemi söyleyin (örn: "kompozit dolgu")…`)
      return true
    }

    if (!isFinalSpeech) return false

    // Fallback to backend AI parser for complex phrasing
    try {
      setVoiceAnalyzing(true)
      const response = await fetch('/api/dental/parse-voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: normalizedNumbers || cleanInput,
          procedures: ctx.procedures.map((pr: any) => pr.name),
          indications: ctx.indications,
        }),
      })
      if (response.ok) {
        const data = await response.json()
        const aiTreatments = Array.isArray(data?.treatments) ? data.treatments : []
        if (aiTreatments.length > 0 || (data?.selectIntent && data.selectIntent !== 'NONE') || data?.globalIntent === 'CONFIRM') {
          const fallbackActions = aiTreatments.map((item: any) => {
            const { procedure, procedureName } = resolveCatalogProcedure(item.procedureName || '', ctx.procedures)
            const rawTeeth = Array.isArray(item.toothNumbers) && item.toothNumbers.length > 0
              ? item.toothNumbers.map(String)
              : ctx.selected.map(String)
            return {
              intent: item.intent === 'DELETE' ? 'DELETE' : item.intent === 'UPDATE' ? 'UPDATE' : 'ADD',
              toothNumbers: rawTeeth,
              procedure,
              procedureName: procedureName || item.procedureName || null,
              indications: Array.isArray(item.indications) ? item.indications : item.indication ? [item.indication] : [],
              surfaces: Array.isArray(item.surfaces) ? item.surfaces : [],
              sections: item.section ? parseToothRegions(item.section) : [],
              materials: [],
            }
          })
          const aiOutcome: PineVoiceParseOutcome = {
            matched: true,
            normalizedText: normalizedNumbers || cleanInput,
            closeRequested: false,
            globalIntent: data?.globalIntent === 'CONFIRM' ? 'CONFIRM' : 'NONE',
            selectIntent: data?.selectIntent || 'NONE',
            targetTeeth: Array.isArray(data?.targetTeeth) ? data.targetTeeth.map(String) : [],
            actions: fallbackActions,
          }
          const ok = executeVoiceOutcome(aiOutcome, cleanInput)
          if (ok) return true
        }
      }
    } catch {
      // Ignore network errors and show helpful feedback below
    } finally {
      setVoiceAnalyzing(false)
    }

    toast.error(`"${cleanInput}" komutunda diş veya tedavi eşleşmedi. Örn: "36 kompozit dolgu" söyleyin.`)
    return false
  }

  const togglePineVoice = () => {
    if (voiceListening || voiceListeningRef.current) {
      stopPineVoice()
      return
    }
    if (p.listening && typeof p.toggleVoice === 'function') {
      p.toggleVoice()
      return
    }
    setVoiceError(null)
    const SpeechRec =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null

    if (!SpeechRec) {
      setVoiceListening(true)
      voiceListeningRef.current = true
      setVoiceTranscript('Tarayıcı ses tanımayı desteklemiyor; aşağıdaki kutudan sesli komut metni yazıp uygulayabilirsiniz.')
      return
    }

    try {
      setVoiceStarting(true)
      const recognition = new SpeechRec()
      recognition.lang = 'tr-TR'
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 5

      recognition.onstart = () => {
        setVoiceStarting(false)
        setVoiceListening(true)
        voiceListeningRef.current = true
        setVoiceError(null)
        setVoiceTranscript('🎙️ Dinleniyor… Diş numarası ve işlemi söyleyin (Örn: "36 kompozit dolgu", "18 diş çekimi")')
      }

      recognition.onresult = (event: any) => {
        const ctx = latestVoiceCtxRef.current
        let interimCombined = ''
        let finalCombined = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i]
          const bestAlt = safePickBestAlternative(res, ctx.procedures, ctx.indications, ctx.inventory)
          const rawAlt = bestAlt || res?.[0]?.transcript || ''
          if (res.isFinal) {
            finalCombined += ' ' + rawAlt
          } else {
            interimCombined += ' ' + rawAlt
          }
        }

        const liveText = (finalCombined || interimCombined).trim()
        if (liveText) {
          const previewNorm = repairTurkishDentalPhonetics(
            normalizeDentalCommandNumbers(normalizeQuadrantToothPhrases(liveText))
          )
          setVoiceTranscript(`🗣️ "${previewNorm}"`)
        }

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }

        if (finalCombined.trim()) {
          void processSpokenOrTypedCommand(finalCombined.trim(), true)
        } else if (interimCombined.trim()) {
          const interimText = interimCombined.trim()
          silenceTimerRef.current = setTimeout(() => {
            if (!voiceListeningRef.current) return
            void processSpokenOrTypedCommand(interimText, false)
          }, 950)
        }
      }

      recognition.onerror = (event: any) => {
        setVoiceStarting(false)
        const errCode = event?.error
        if (errCode === 'no-speech' || errCode === 'aborted') {
          return
        }
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          setVoiceError('Mikrofon izni reddedildi. Komutunuzu aşağıdaki alana yazarak da uygulayabilirsiniz.')
          toast.error('Mikrofon erişim izni reddedildi.')
        } else {
          setVoiceError(`Ses tanıma uyarısı (${errCode || 'bağlantı'}). Komutu aşağıdan da girebilirsiniz.`)
        }
      }

      recognition.onend = () => {
        setVoiceStarting(false)
        if (voiceListeningRef.current) {
          try {
            recognition.start()
          } catch {
            // Keep panel open for manual/retry use if browser blocks immediate restart
          }
        }
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (err: any) {
      setVoiceStarting(false)
      setVoiceListening(true)
      voiceListeningRef.current = true
      setVoiceError('Mikrofon başlatılamadı; komutunuzu aşağıdaki kutudan girebilirsiniz.')
    }
  }

  const isVoiceActive = Boolean(voiceListening || p.listening)
  const isVoiceStarting = Boolean(voiceStarting || p.voiceStarting)
  const isVoiceAnalyzing = Boolean(voiceAnalyzing || p.analyzing)
  const activeVoiceError = voiceError || p.voiceError
  const activeVoiceTranscript = voiceTranscript || p.transcript
  return <div className={styles.overlay}><div role="dialog" aria-modal="true" aria-label="Tedavi planı" className={`treatment-plan-modal ${styles.modal}`}>
    <header className={styles.header}>
      <h1>{p.identity ? 'Tedavi Planı Düzenle' : 'Tedavi Planı Oluştur'}</h1>
      <div className={styles.patient} ref={patientDropdownRef}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.patientMeta}>
          <strong>{patientName}</strong>
          <button
            type="button"
            className={`${styles.patientBadgeBtn} ${consentDropdownOpen ? styles.patientBadgeBtnActive : ''}`}
            aria-expanded={consentDropdownOpen}
            onClick={() => {
              setConsentDropdownOpen(prev => !prev)
              setReminderOpen(false)
            }}
          >
            <ShieldCheck size={11} />
            <span>Bildirim ayarları</span>
            <ChevronDown size={11} />
          </button>
        </div>
        <div
          className={`${styles.headerDropdown} ${styles.consentDropdown} ${consentDropdownOpen ? styles.headerDropdownOpen : ''}`}
          role="region"
          aria-label="Bildirim ayarları"
        >
          <PatientConsentPanel
            patientId={p.event?.patientId || undefined}
            onEnsurePatient={p.onEnsurePatient}
            selectedChannels={p.notificationChannels}
            onChannelsChange={p.setNotificationChannels}
            onContactChange={p.onContactChange}
          />
        </div>
      </div>
      <div className={styles.reminderDropdownWrap} ref={reminderDropdownRef}>
        <button
          type="button"
          className={`${styles.button} ${p.periodic || reminderOpen ? styles.pale : ''} ${styles.reminderTriggerBtn}`}
          aria-expanded={reminderOpen}
          onClick={() => {
            setReminderOpen(prev => !prev)
            setConsentDropdownOpen(false)
          }}
          title="Tedavi hatırlatma bildirimlerini ayarla"
        >
          <Bell size={14} />
          <span>{formatReminderLabel(p.periodic, selectedDaysList.length ? selectedDaysList : p.periodDays)}</span>
          <ChevronDown size={13} />
        </button>
        {reminderOpen && (
          <div
            className={`${styles.headerDropdown} ${styles.reminderDropdown} ${styles.headerDropdownOpen}`}
            role="region"
            aria-label="Tedavi hatırlatma bildirimleri"
          >
            <div className={styles.reminderDropdownHead}>
              <div className={styles.dropdownTitleRow}>
                <strong className={styles.dropdownTitle}>Tedavi hatırlatma bildirimleri</strong>
                <span className={styles.infoTooltipWrap} tabIndex={0} role="button" aria-label="Tedavi hatırlatma bilgisi">
                  <span className={styles.infoTooltipIcon} aria-hidden="true">ⓘ</span>
                  <span className={styles.infoTooltipPopup} role="tooltip">
                    Varsayılan olarak 6 ayda bir (180 gün) kontrol seçilidir. Hazır TDB sürelerinden birden fazla seçebilir, özel gün ekleyebilir veya kapatabilirsiniz.
                  </span>
                </span>
              </div>
              <label className={styles.inlineCheck}>
                <input
                  type="checkbox"
                  checked={p.periodic}
                  onChange={event => {
                    const nextPeriodic = event.target.checked
                    if (!nextPeriodic) {
                      p.setPeriodic(false)
                    } else {
                      const fallback = selectedDaysList.length > 0 ? selectedDaysList : [p.periodDays && p.periodDays >= 1 ? p.periodDays : 180]
                      applyDaysList(fallback)
                    }
                  }}
                />
                <span>{p.periodic ? `Açık (${selectedDaysList.length} seçim)` : 'Kapalı'}</span>
              </label>
            </div>
            {tdbSuggestion && !isSuggestionAlreadyApplied && (
              <div className={styles.tdbSuggestionBox}>
                <div className={styles.tdbSuggestionTitleRow}>
                  <strong>💡 TDB Önerisi: {(tdbSuggestion as any).label || tdbSuggestion.badge}</strong>
                  {tdbSuggestion.reason && (
                    <span className={styles.infoTooltipWrap} tabIndex={0} role="button" aria-label="TDB önerisi açıklaması">
                      <span className={styles.infoTooltipIcon} aria-hidden="true">ⓘ</span>
                      <span className={styles.infoTooltipPopup} role="tooltip">
                        {tdbSuggestion.reason}
                      </span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={`${styles.button} ${styles.pale} ${styles.small}`}
                  onClick={() => {
                    if (!tdbSuggestion.periodic) {
                      p.setPeriodic(false)
                      p.setPeriodDaysList?.([])
                    } else {
                      applyDaysList([...selectedDaysList, ...suggestionDays])
                    }
                  }}
                >
                  Uygula
                </button>
              </div>
            )}
            <div className={styles.presetGrid} role="group" aria-label="Hızlı hatırlatma süreleri (Çoklu seçim)">
              <button
                type="button"
                className={`${styles.presetChip} ${!p.periodic ? styles.presetChipActive : ''}`}
                onClick={() => {
                  p.setPeriodic(false)
                  p.setPeriodDaysList?.([])
                }}
              >
                <strong>Kapalı</strong>
                <span>Hatırlatma yok</span>
              </button>
              {REMINDER_PRESETS.map(preset => {
                const active = p.periodic && selectedDaysList.includes(preset.days)
                return (
                  <button
                    type="button"
                    key={preset.days}
                    aria-pressed={active}
                    className={`${styles.presetChip} ${active ? styles.presetChipActive : ''}`}
                    onClick={() => toggleReminderDay(preset.days)}
                  >
                    <strong>{active ? `✓ ${preset.label}` : preset.label}</strong>
                    <span>{preset.sublabel}</span>
                  </button>
                )
              })}
              {customSelectedDays.map(customDay => (
                <button
                  type="button"
                  key={`custom-${customDay}`}
                  aria-pressed={true}
                  className={`${styles.presetChip} ${styles.presetChipActive}`}
                  onClick={() => toggleReminderDay(customDay)}
                  title="Kaldırmak için tıklayın"
                >
                  <strong>✓ {customDay} Gün</strong>
                  <span>Özel Kontrol (Kaldır)</span>
                </button>
              ))}
            </div>
            <div className={styles.customDaysRow}>
              <label htmlFor="reminder-days" className={styles.dropdownLabel}>
                Özel gün ekle (1 – 3650 gün)
              </label>
              <div className={styles.customDaysInputWrap}>
                <input
                  id="reminder-days"
                  className={styles.input}
                  type="number"
                  min="1"
                  max="3650"
                  placeholder="Örn: 45"
                  value={customDayDraft}
                  onChange={event => setCustomDayDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitCustomDayDraft()
                    }
                  }}
                />
                <span>gün sonra</span>
                <button
                  type="button"
                  className={`${styles.button} ${styles.pale} ${styles.small}`}
                  disabled={!customDayDraft.trim()}
                  onClick={commitCustomDayDraft}
                >
                  + Ekle
                </button>
              </div>
            </div>
            <div className={styles.dropdownActions}>
              <button
                type="button"
                className={`${styles.button} ${styles.small}`}
                onClick={() => {
                  if (customDayDraft.trim()) commitCustomDayDraft()
                  setReminderOpen(false)
                }}
              >
                Bitti
              </button>
            </div>
          </div>
        )}
      </div>
      <span className={styles.date}><CalendarDays size={15} />{new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      <div className={styles.headerRight}>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={togglePineVoice}
          disabled={isVoiceStarting}
          aria-pressed={isVoiceActive}
        >
          {isVoiceActive ? <MicOff size={15} /> : <Mic size={15} />}
          {isVoiceActive ? 'Dinlemeyi Durdur' : 'Sesli Komut ile Planla'}
        </button>
        <button type="button" className={styles.button} aria-label="Tedavi planını kapat" onClick={p.close}><X size={16} /></button>
      </div>
      {(isVoiceActive || isVoiceAnalyzing || activeVoiceError) && (
        <div
          className={styles.hint}
          aria-live="polite"
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 10,
            background: 'var(--card-inner, var(--pc-surface))',
            border: '1.5px solid var(--input-border)',
            boxShadow: 'var(--pc-neo-subcard)',
            color: 'var(--foreground)',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 9px',
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 700,
              background: activeVoiceError ? 'var(--danger, #ef4444)' : 'var(--pc-tint, #e0f2fe)',
              color: activeVoiceError ? '#ffffff' : 'var(--pc-tint-fg, #0369a1)',
              boxShadow: 'var(--pc-clay-pale)',
              flexShrink: 0,
            }}
          >
            <Mic size={12} />
            {isVoiceAnalyzing ? 'Analiz ediliyor…' : isVoiceActive ? 'Canlı Dinleme Aktif' : 'Sesli Komut'}
          </span>
          <span style={{ flex: '1 1 220px', fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' }}>
            {activeVoiceError || (isVoiceAnalyzing ? 'Komut analiz ediliyor…' : activeVoiceTranscript || 'Dinleniyor… Diş numarası ve işlemi söyleyin.')}
          </span>
          <form
            style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 280px', maxWidth: 440 }}
            onSubmit={event => {
              event.preventDefault()
              const cmd = manualVoiceInput.trim()
              if (!cmd) return
              setManualVoiceInput('')
              void processSpokenOrTypedCommand(cmd, true)
            }}
          >
            <input
              type="text"
              className={styles.input}
              style={{ flex: 1, minWidth: 160, height: 30, fontSize: 12, padding: '4px 10px' }}
              placeholder='Örn: "36 çürük kompozit dolgu" veya "sağ alt 6 kanal"'
              aria-label="Sesli komut metni"
              value={manualVoiceInput}
              onChange={event => setManualVoiceInput(event.target.value)}
            />
            <button
              type="submit"
              className={`${styles.button} ${styles.primary} ${styles.small}`}
              disabled={!manualVoiceInput.trim() || isVoiceAnalyzing}
              style={{ color: '#ffffff', flexShrink: 0 }}
            >
              Uygula
            </button>
          </form>
        </div>
      )}
    </header>
    <main className={styles.content}>
      <PlanMediaPanel patientId={p.event?.patientId} onEnsurePatient={p.onEnsurePatient} groupId={p.identity?.id} attachments={p.attachments} onChange={p.setAttachments} onUploadingChange={p.setUploading} onAttachmentSaved={p.onAttachmentSaved} />
      <section className={styles.section} aria-label="Odontogram">
        <div className={styles.sectionHeading}><span className={styles.step}>2</span><h2>Odontogram</h2><span className={styles.description}>{p.mode === '2d-anatomical' ? 'Tek diş seçin · Anatomik alt katmanları çoklu veya tümüyle seçin · Sağ tık ile yüzey/katman açın.' : 'Diş seçin · Shift ile aralık seçin · Sağ tık ile işlemleri açın.'}</span>
          <div className={styles.chartActions}>
            <button className={`${styles.button} ${styles.small}`} type="button" onClick={clearAllOdontogramSelections}>Seçimi temizle</button>
            <select className={styles.select} value={p.jaw} aria-label="Çene seçimi" onChange={event => p.changeJaw(event.target.value)}><option value="all">Tüm ağız</option><option value="upper">Üst çene</option><option value="lower">Alt çene</option></select>
            <div className={styles.segment}>
              <button type="button" className={`${styles.button} ${p.mode === '2d' ? styles.primary : ''}`} aria-pressed={p.mode === '2d'} onClick={() => p.setMode('2d')}>2B Chart</button>
              <button type="button" className={`${styles.button} ${p.mode === '2d-anatomical' ? styles.primary : ''}`} aria-pressed={p.mode === '2d-anatomical'} onClick={() => p.setMode('2d-anatomical')}>2B Anatomik</button>
              <button type="button" className={`${styles.button} ${p.mode === '3d' ? styles.primary : ''}`} aria-pressed={p.mode === '3d'} onClick={() => p.setMode('3d')}>3B Anatomik</button>
            </div>
          </div>
        </div>
        <OdontogramSelectionBar
          selected={p.selected}
          setSelected={p.setSelected}
          drafts={p.drafts}
          setDrafts={p.setDrafts}
          resolveProcColor={resolveProcColor}
          onToothClick={p.clickTooth}
          onToothContextMenu={p.onContextMenu}
          toothSections={p.toothSections}
          updateSection={p.updateSection}
          toothSurfaces={p.toothSurfaces}
          updateSurfaces={p.updateSurfaces}
          onClearAllSelections={clearAllOdontogramSelections}
        />
        {p.mode === '2d' ? (
          <div className={styles.chart}>
            {[UPPER_TEETH, LOWER_TEETH].map((teeth, index) => (
              <div className={styles.teeth} key={index}>
                {teeth.map(tooth => (
                  <ToothChip
                    key={tooth}
                    number={tooth}
                    selected={p.selected.includes(tooth)}
                    multiSelected={p.selected.length > 1 && p.selected.includes(tooth)}
                    hasDraft={!!p.drafts[tooth]?.length}
                    colors={(p.drafts[tooth] || []).map((d: any) => resolveProcColor(d)).filter(Boolean)}
                    onContextMenu={(event: React.MouseEvent) => p.onContextMenu(tooth, event)}
                    onDoubleClick={() => p.setDetailTooth(String(tooth))}
                    onClick={(event: React.MouseEvent) => p.clickTooth(tooth, event)}
                    onDragOver={(event: React.DragEvent) => event.preventDefault()}
                    onDrop={(event: React.DragEvent) => {
                      event.preventDefault()
                      const data = parseDraggedTreatmentPayload(event.dataTransfer)
                      if (!data) {
                        toast.error('Tedavi sürükleme verisi geçersiz.')
                        return
                      }
                      const dropTargets = resolveMultiToothDragTargets(tooth, p.selected)
                      p.add(dropTargets, data)
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : p.mode === '2d-anatomical' ? (
          <ToothAnatomy2D
            selected={p.selected}
            setSelected={p.setSelected}
            drafts={p.drafts}
            setDrafts={p.setDrafts}
            toothSections={p.toothSections}
            updateSection={p.updateSection}
            toothSurfaces={p.toothSurfaces}
            updateSurfaces={p.updateSurfaces}
            add={p.add}
            jaw={p.jaw}
            procedures={p.procedures}
            resolveProcColor={resolveProcColor}
            selectedProcedure={selectedProcedure}
            selectedIndications={selectedProcedure ? getLinkedIndicationsForProcedure(indicationLinks, selectedProcedure, indications) : indications}
            selectedMaterials={materials}
            onContextMenu={p.onContextMenu}
          />
        ) : (
          p.odontogram3d
        )}
      </section>
      <div className={styles.bottom}>
        <section className={styles.section} aria-label="Tedavi Tanım ve Atama"><div className={styles.sectionHeading}><span className={styles.step}>3</span><h2>Tedavi Tanım ve Atama</h2><button type="button" className={`${styles.button} ${styles.pale} ${styles.small}`} style={{ marginLeft: 'auto' }} onClick={() => apply(p.selected)}><Plus size={14} /> {selectedProcedure?.scope === 'mouth' ? 'Tüm Ağza Ekle' : selectedProcedure?.scope === 'jaw' && !p.selected.length ? (p.jaw === 'lower' ? 'Alt Çeneye Ekle' : 'Üst Çeneye Ekle') : 'Seçilenleri Ekle'}</button></div>
          <div className={styles.workgrid} ref={workgridRef}>
            <div className={styles.box}>
              <div className={styles.boxhead}><h3>Endikasyonlar</h3><div className={styles.wrapActions}>
                {selectedIndicationName && selectedIndicationId && <>
                  <button type="button" className={`${styles.button} ${styles.small}`} title="Seçili endikasyonu düzenle" aria-label="Seçili endikasyonu düzenle" onClick={() => { setEditingIndication({ id: selectedIndicationId, name: selectedIndicationName }); setIndicationEditor(selectedIndicationName) }}><Pencil size={12} /></button>
                  <button type="button" className={`${styles.button} ${styles.small}`} title="Seçili endikasyonu kaldır" aria-label="Seçili endikasyonu kaldır" onClick={() => void archiveCatalogEntry('indication', selectedIndicationId, selectedIndicationName)}><Trash2 size={12} /></button>
                </>}
                <button ref={indicationAddRef} className={`${styles.button} ${styles.pale} ${styles.small}`} type="button" aria-expanded={indicationEditor !== null} aria-controls="pine-create-indication" onClick={() => { setEditingIndication(null); if (indicationEditor === null) setIndicationEditor('') }}>+ Yeni</button>
              </div></div>
              <div className={styles.searchBox}><Search size={13} aria-hidden="true" /><input className={styles.search} placeholder="Endikasyon ara..." aria-label="Endikasyon ara" value={indicationSearch} onChange={event => setIndicationSearch(event.target.value)} /></div>
              {indicationEditor !== null && <InlineCatalogForm key={editingIndication?.id || 'new-indication'} kind="indication" initialName={indicationEditor} editingItem={editingIndication} onCreated={entry => catalogCreated('indication', entry)} onCancel={() => closeCatalogEditor('indication')} />}
              <div className={styles.list} ref={indicationListRef}>
                {filteredIndications.map((name: string) => (
                  <button
                    type="button"
                    key={p.indicationIds[name] || name}
                    className={`${styles.listItem} ${indications.includes(name) ? styles.listItemSelected : ''}`}
                    aria-pressed={indications.includes(name)}
                    onClick={() => setIndications(previous => previous.includes(name) ? previous.filter(value => value !== name) : [...previous, name])}
                  >
                    <IndicationIcon />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <IndicationPortButton
                      indicationName={name}
                      activeSourceIndication={activeSourceIndication}
                      links={indicationLinks}
                      onToggleConnectSource={indName => setActiveSourceIndication(prev => (prev === indName ? null : indName))}
                      onStartDragLink={indName => setActiveSourceIndication(indName)}
                      onEndDragLink={() => setActiveSourceIndication(null)}
                      onDropProcedureLink={(procKey, indName) => {
                        updateIndicationLinks(prev => toggleIndicationProcedureLink(prev, procKey, indName))
                        setActiveSourceIndication(null)
                      }}
                    />
                  </button>
                ))}
                {!filteredIndications.length && <div className={styles.catalogEmpty}><p className={styles.hint}>{indicationSearch.trim() ? 'Eşleşen endikasyon bulunamadı.' : 'Katalogda endikasyon bulunmuyor.'}</p>{indicationSearch.trim() && indicationEditor === null && <button type="button" className={styles.catalogCreate} onClick={() => { setEditingIndication(null); setIndicationEditor(indicationSearch.trim().slice(0, 120)) }}><Plus size={14} /><span>“{indicationSearch.trim()}” ile yeni kayıt oluştur</span></button>}</div>}
              </div>
            </div>
            <div className={styles.box}>
              <div className={styles.boxhead}><h3>Tedaviler</h3><div className={styles.wrapActions}>
                {selectedProcedure && /^[0-9a-f]{8}-/i.test(selectedProcedure.id) && <>
                  <button type="button" className={`${styles.button} ${styles.small}`} title="Seçili tedaviyi düzenle" aria-label="Seçili tedaviyi düzenle" onClick={() => { setEditingProcedure({ id: selectedProcedure.id, name: selectedProcedure.name, price: selectedProcedure.price, scope: selectedProcedure.scope || 'tooth', color: selectedProcedure.color, defaultMaterials: materials }); setProcedureEditor(selectedProcedure.name) }}><Pencil size={12} /></button>
                  <button type="button" className={`${styles.button} ${styles.small}`} title="Seçili tedaviyi kaldır" aria-label="Seçili tedaviyi kaldır" onClick={() => void archiveCatalogEntry('procedure', selectedProcedure.id, selectedProcedure.name)}><Trash2 size={12} /></button>
                </>}
                <button ref={procedureAddRef} className={`${styles.button} ${styles.pale} ${styles.small}`} type="button" aria-expanded={procedureEditor !== null} aria-controls="pine-create-procedure" onClick={() => { setEditingProcedure(null); if (procedureEditor === null) setProcedureEditor('') }}>+ Yeni tedavi</button>
              </div></div>
              <div className={styles.searchBox}><Search size={13} aria-hidden="true" /><input className={styles.search} placeholder="Tedavi ara..." aria-label="Tedavi ara" value={procedureSearch} onChange={event => setProcedureSearch(event.target.value)} /></div>
              {procedureEditor !== null && <InlineCatalogForm key={editingProcedure?.id || 'new-procedure'} kind="procedure" initialName={procedureEditor} editingItem={editingProcedure} replacingMaterials={!editingProcedure && materials.length > 0} onCreated={entry => catalogCreated('procedure', entry)} onCancel={() => closeCatalogEditor('procedure')} />}
              <div className={styles.list} ref={procedureListRef}>
                {filteredProcedures.map((item: any) => {
                  const procKey = getProcedureLinkKey(item)
                  const dragIndications = getLinkedIndicationsForProcedure(
                    indicationLinks,
                    item,
                    procedureId === item.id ? indications : []
                  )
                  return (
                    <button
                      type="button"
                      key={item.id}
                      draggable
                      className={`${styles.listItem} ${procedureId === item.id ? styles.listItemSelected : ''}`}
                      aria-pressed={procedureId === item.id}
                      onClick={() => {
                        if (activeSourceIndication) {
                          updateIndicationLinks(prev => toggleIndicationProcedureLink(prev, procKey, activeSourceIndication))
                          setActiveSourceIndication(null)
                          return
                        }
                        selectProcedure(item)
                      }}
                      onDoubleClick={() => apply(p.selected, item, dragIndications, procedureId === item.id ? materials : item.materials || [])}
                      onDragStart={event =>
                        event.dataTransfer.setData(
                          'value',
                          JSON.stringify({
                            procedures: [item],
                            indications: dragIndications,
                            activeMaterials: procedureId === item.id ? materials : item.materials || [],
                          })
                        )
                      }
                    >
                      <ProcedurePortButton
                        procKey={procKey}
                        procedureName={item.name}
                        procedureColor={resolveProcColor(item)}
                        links={indicationLinks}
                        activeSourceIndication={activeSourceIndication}
                        onConnectOrToggle={(targetProcKey, sourceInd) => {
                          const ind = sourceInd || activeSourceIndication
                          if (ind) {
                            updateIndicationLinks(prev => toggleIndicationProcedureLink(prev, targetProcKey, ind))
                            setActiveSourceIndication(null)
                          }
                        }}
                        onRemoveLink={(targetProcKey, indName) =>
                          updateIndicationLinks(prev => removeIndicationProcedureLink(prev, targetProcKey, indName))
                        }
                      />
                      <GripVertical size={14} aria-hidden="true" className={styles.listGrip} />
                      <span className={styles.procColorDot} style={{ width: 10, height: 10, borderRadius: '50%', background: resolveProcColor(item), flexShrink: 0 }} aria-hidden="true" />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                      <span>{money(Math.round(item.price * 100))}</span>
                    </button>
                  )
                })}
                {!filteredProcedures.length && <div className={styles.catalogEmpty}><p className={styles.hint}>{procedureSearch.trim() ? 'Eşleşen tedavi bulunamadı.' : 'Katalogda tedavi bulunmuyor.'}</p>{procedureSearch.trim() && procedureEditor === null && <button type="button" className={styles.catalogCreate} onClick={() => { setEditingProcedure(null); setProcedureEditor(procedureSearch.trim().slice(0, 120)) }}><Plus size={14} /><span>“{procedureSearch.trim()}” ile yeni kayıt oluştur</span></button>}</div>}
              </div>
              <div className={styles.materialBox}><h4>Malzeme <span className={styles.description}>(opsiyonel · seçili tedavi için)</span></h4><div className={styles.materialLine}><select className={styles.select} aria-label="Malzeme seç" value={materialId} onChange={event => setMaterialId(event.target.value)} disabled={!selectedProcedure}><option value="">Malzeme seç...</option>{selectableInventory.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className={`${styles.button} ${styles.primary} ${styles.small}`} onClick={addMaterial} disabled={!materialId || !selectedProcedure}>+ Ekle</button></div>{materials.map((item, index) => <div className={styles.materialLine} key={item.inventoryItemId}><span>{item.name}</span><input className={styles.input} aria-label={`${item.name} miktarı`} type="number" min="1" style={{ width: 54 }} value={item.quantity} onChange={event => syncProcedureMaterials(materials.map((value, i) => i === index ? { ...value, quantity: Number(event.target.value) } : value))} /><input className={styles.input} aria-label={`${item.name} satış fiyatı`} type="number" min="0" step="0.01" style={{ width: 70 }} value={(item.unitSalePriceMinor || 0) / 100} onChange={event => syncProcedureMaterials(materials.map((value, i) => i === index ? { ...value, unitSalePriceMinor: Math.round(Number(event.target.value) * 100) } : value))} /><button type="button" className={`${styles.button} ${styles.small}`} aria-label={`${item.name} kaldır`} onClick={() => syncProcedureMaterials(materials.filter((_, i) => i !== index))}>×</button></div>)}</div>
            </div>
            <IndicationProcedureLinkOverlay
              workgridRef={workgridRef}
              indicationListRef={indicationListRef}
              procedureListRef={procedureListRef}
              links={indicationLinks}
              activeSourceIndication={activeSourceIndication}
              procedures={p.procedures}
              resolveProcColor={resolveProcColor}
              onRemoveLink={(procKey, indName) => updateIndicationLinks(prev => removeIndicationProcedureLink(prev, procKey, indName))}
              onCancelConnect={() => setActiveSourceIndication(null)}
            />
          </div><div className={styles.note}><div className={styles.noteHead}><strong><FileText size={15} /> Konsültasyon Notu</strong><div className={styles.wrapActions}><button type="button" className={`${styles.button} ${styles.small}`} onClick={() => setHistoryOpen(true)}>Hasta geçmişi</button><button type="button" className={`${styles.button} ${styles.pale} ${styles.small}`} disabled={p.saving} onClick={() => p.save({ closeAfter: false, allowEmpty: true })}>Notu kaydet</button></div></div><textarea className={styles.textarea} aria-label="Plan konsültasyon notu" placeholder="Konsültasyon notu ekleyin..." value={p.note} onChange={event => p.setNote(event.target.value)} /></div>
        </section>
        <section className={styles.section} aria-label="Tedavi planı"><div className={styles.sectionHeading}><span className={styles.step}>4</span><h2>Tedavi planı</h2></div>
          {doctorWarning && (
            <div
              role="alert"
              style={{
                marginBottom: 8,
                padding: '9px 12px',
                borderRadius: 10,
                background: 'var(--card-inner, var(--pc-surface))',
                border: '1.5px solid var(--danger, #ef4444)',
                color: 'var(--foreground)',
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.45,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                boxShadow: 'var(--pc-neo-subcard)',
              }}
            >
              <AlertTriangle size={16} style={{ color: 'var(--danger, #ef4444)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1 }}>{doctorWarning.replace(/^⚠️\s*/, '')}</span>
              <button
                type="button"
                aria-label="Hekim uyarısını kapat"
                onClick={() => setDoctorWarning(null)}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  color: 'var(--pc-muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <TreatmentTableColumnBar columnManager={columnManager} />
          <div className={styles.tableWrap}>
            <table className={styles.table} style={tableStyle}>
              <colgroup>
                {visibleColumns.tooth && <col style={{ width: colWidths.tooth }} />}
                {visibleColumns.indications && <col style={{ width: colWidths.indications }} />}
                {visibleColumns.procedure && <col style={{ width: colWidths.procedure }} />}
                {visibleColumns.doctor && <col style={{ width: colWidths.doctor }} />}
                {visibleColumns.price && <col style={{ width: colWidths.price }} />}
                {visibleColumns.total && <col style={{ width: colWidths.total }} />}
                {visibleColumns.actions && <col style={{ width: colWidths.actions }} />}
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.tooth && <th>Diş</th>}
                  {visibleColumns.indications && (
                    <th>
                      <HideableColumnHeader label="Endikasyonlar" columnKey="indications" onHide={columnManager.hideColumn} />
                    </th>
                  )}
                  {visibleColumns.procedure && <th>Tedavi</th>}
                  {visibleColumns.doctor && (
                    <th>
                      <HideableColumnHeader label="Hekim" columnKey="doctor" onHide={columnManager.hideColumn} />
                    </th>
                  )}
                  {visibleColumns.price && (
                    <th>
                      <HideableColumnHeader label="Fiyat (₺)" columnKey="price" onHide={columnManager.hideColumn} />
                    </th>
                  )}
                  {visibleColumns.total && (
                    <th>
                      <HideableColumnHeader label="Tutar (₺)" columnKey="total" onHide={columnManager.hideColumn} />
                    </th>
                  )}
                  {visibleColumns.actions && <th aria-label="İşlemler" />}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map(group => {
                  const { groupKey, primaryTarget: target, primaryItem: item, entries } = group
                  const groupLabel = entries.length > 1
                    ? `${entries.map(e => formatTargetPlainName(e.target)).join(', ')}`
                    : formatTargetPlainName(target)
                  const unitMinor =
                    Math.round(item.price * 100) +
                    item.materials.reduce((sum: number, material: any) => sum + Number(material.quantity) * Number(material.unitSalePriceMinor || 0), 0)
                  const groupTotalMinor = unitMinor * entries.length
                  return (
                    <tr key={groupKey}>
                      {visibleColumns.tooth && (
                        <td className={styles.toothId}>
                          <TableToothGroupCell
                            entries={entries}
                            procedureName={item.name}
                            procedureColor={resolveProcColor(item)}
                            locked={item.locked}
                            onRemoveToothEntry={removeSingleToothEntry}
                            onRemoveAllEntries={() => removeGroupEntries(entries)}
                          />
                        </td>
                      )}
                      {visibleColumns.indications && (
                        <td>
                          <div className={styles.indicationChips}>
                            {item.indications.map((indication: string) => (
                              <span className={styles.indicationChip} key={indication}>
                                {indication}
                                {!item.locked && (
                                  <button
                                    type="button"
                                    aria-label={`${indication} endikasyonunu kaldır`}
                                    onClick={() =>
                                      updateGroupEntries(entries, row => ({
                                        ...row,
                                        indications: row.indications.filter((value: string) => value !== indication),
                                      }))
                                    }
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            ))}
                            {!item.locked && (
                              <select
                                className={styles.addIndication}
                                aria-label={`${groupLabel} endikasyon ekle`}
                                value=""
                                onChange={event => {
                                  const value = event.target.value
                                  if (value && !item.indications.includes(value)) {
                                    updateGroupEntries(entries, row => ({
                                      ...row,
                                      indications: row.indications.includes(value) ? row.indications : [...row.indications, value],
                                    }))
                                  }
                                }}
                              >
                                <option value="">+</option>
                                {p.indications.map((value: string) => (
                                  <option key={p.indicationIds[value] || value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.procedure && (
                        <td>
                          <div className={styles.procCellWrap}>
                            <span
                              className={styles.procColorDot}
                              style={{ width: 10, height: 10, borderRadius: '50%', background: resolveProcColor(item), flexShrink: 0 }}
                              aria-hidden="true"
                            />
                            {item.locked ? (
                              <span>{item.name}</span>
                            ) : (
                              <select
                                className={styles.cellSelect}
                                title={item.name}
                                aria-label={`${groupLabel} tedavi`}
                                value={item.procedureId || ''}
                                onChange={event => {
                                  const replacement = p.procedures.find((value: any) => value.id === event.target.value)
                                  if (!replacement || replacement.id === item.procedureId) return
                                  updateGroupEntries(entries, row => {
                                    const oldLinked = getLinkedIndicationsForProcedure(indicationLinks, {
                                      id: row.procedureId,
                                      name: row.name,
                                    })
                                    const manualRemaining = (row.indications || []).filter(
                                      (ind: string) => !oldLinked.includes(ind)
                                    )
                                    const nextIndications = getLinkedIndicationsForProcedure(
                                      indicationLinks,
                                      replacement,
                                      manualRemaining
                                    )
                                    return {
                                      ...row,
                                      name: replacement.name,
                                      procedureId: replacement.id,
                                      scope: replacement.scope,
                                      price: replacement.price,
                                      color: replacement.color || row.color,
                                      indications: nextIndications,
                                      materials: (replacement.materials || []).map((value: any) => ({ ...value })),
                                    }
                                  })
                                }}
                              >
                                <option value={p.procedures.some((value: any) => value.id === item.procedureId) ? '' : item.procedureId || ''}>
                                  {item.name}
                                </option>
                                {p.procedures
                                  .filter((value: any) => (value.scope || 'tooth') === (item.scope || 'tooth'))
                                  .map((value: any) => (
                                    <option key={value.id} value={value.id}>
                                      {value.name}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.doctor && (
                        <td>
                          <TreatmentDoctorMultiSelect
                            doctors={p.doctors}
                            selectedDoctorIds={Array.isArray(item.doctorIds) ? item.doctorIds : item.doctorId ? [item.doctorId] : []}
                            shifts={p.shifts}
                            doctorLeaves={p.doctorLeaves}
                            targetApptTime={item.sessionStartTime || p.event?.startTime}
                            enforceAvailability={false}
                            onAvailabilityWarning={setDoctorWarning}
                            contextLabel={`${/^[1-4][1-8]$/.test(target) ? `#${groupLabel}` : groupLabel} (${item.name}) işlemi için`}
                            disabled={item.locked}
                            compact
                            placeholder="Seçiniz"
                            onChange={nextDoctorIds =>
                              updateGroupEntries(entries, row => ({
                                ...row,
                                doctorId: nextDoctorIds[0] || null,
                                doctorIds: nextDoctorIds,
                                doctorManuallySelected: nextDoctorIds.length > 0,
                                doctorAutoFilled: false,
                              }))
                            }
                          />
                        </td>
                      )}
                      {visibleColumns.price && (
                        <td>
                          <input
                            className={styles.moneyInput}
                            aria-label={`${groupLabel} işlem fiyatı`}
                            disabled={item.locked}
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.price}
                            onChange={event => updateGroupEntries(entries, row => ({ ...row, price: Number(event.target.value) }))}
                          />
                          <button
                            type="button"
                            className={styles.materialLink}
                            disabled={item.locked && !item.materials.length}
                            title={item.materials.map((material: any) => `${material.name} ${material.quantity} adet`).join(', ')}
                            onClick={() => setMaterialRow({ target, id: item.id, entries })}
                          >
                            {item.materials.length
                              ? `Malzeme: ${item.materials
                                .map((material: any) => `${material.name} ${material.quantity} adet +${money(Number(material.quantity) * Number(material.unitSalePriceMinor || 0))}`)
                                .join(', ')}`
                              : item.locked
                                ? 'Malzeme yok'
                                : '+ Malzeme ekle'}
                          </button>
                        </td>
                      )}
                      {visibleColumns.total && (
                        <td className={styles.rowTotal}>
                          <div>{money(groupTotalMinor)}</div>
                          {entries.length > 1 && (
                            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--pc-muted)' }}>
                              {entries.length} diş × {money(unitMinor)}
                            </div>
                          )}
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td>
                          <button
                            type="button"
                            className={styles.rowDelete}
                            disabled={item.locked}
                            aria-label={`${groupLabel} ${item.name} kaldır`}
                            onClick={() => removeGroupEntries(entries)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!groupedRows.length && <div className={styles.empty}>Henüz plan öğesi eklenmedi.</div>}
          </div>
          <div className={styles.summary}>
            <div className={styles.sumcard}>
              <div className={styles.sumline}>
                <span>Ara Toplam</span>
                <strong>{p.pricing ? money(p.pricing.subtotalMinor) : money(effectiveSubtotalMinor)}</strong>
              </div>
              <div className={styles.sumline}>
                <label htmlFor="pine-discount">İskonto (%)</label>
                <span className={styles.sumValue}>
                  <input
                    id="pine-discount"
                    className={styles.input}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={discountText}
                    onChange={event => {
                      const masked = maskAndClampPercentDiscount(event.target.value)
                      if (!masked) return
                      setDiscountText(masked.display)
                      p.setDiscount(masked.percent)
                      const nextPercentBps = Math.max(0, Math.min(10000, Math.round(masked.percent * 100)))
                      const nextPctDiscMinor = Math.floor((effectiveSubtotalMinor * nextPercentBps + 5000) / 10000)
                      const nextMaxFixedMinor = Math.max(0, effectiveSubtotalMinor - nextPctDiscMinor)
                      if (Math.round((Number(p.discountFixed) || 0) * 100) > nextMaxFixedMinor) {
                        const clampedTl = nextMaxFixedMinor / 100
                        p.setDiscountFixed(clampedTl)
                        setDiscountFixedText(formatTlAmountDisplay(clampedTl))
                      }
                    }}
                    onBlur={() => setDiscountText(formatPercentDiscountDisplay(p.discount))}
                  /> % <strong>{p.pricing ? `−${money(p.pricing.percentageDiscountMinor)}` : `−${money(computedPercentageDiscountMinor)}`}</strong>
                </span>
              </div>
              <div className={styles.sumline}>
                <label htmlFor="pine-fixed">Manuel iskonto</label>
                <span className={styles.sumValue}>
                  <input
                    id="pine-fixed"
                    className={styles.input}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={discountFixedText}
                    onChange={event => {
                      const input = event.target
                      const masked = maskAndClampTlDiscount(input.value, maxFixedDiscountMinor)
                      if (!masked) return
                      const position = (input.value.slice(0, input.selectionStart ?? input.value.length).match(/[\d,]/g) || []).length
                      setDiscountFixedText(masked.display)
                      p.setDiscountFixed(masked.amountTl)
                      requestAnimationFrame(() => {
                        let cursor = 0
                        let count = 0
                        while (cursor < masked.display.length && count < position) {
                          if (/[\d,]/.test(masked.display[cursor])) count++
                          cursor++
                        }
                        if (document.activeElement === input) input.setSelectionRange(cursor, cursor)
                      })
                    }}
                    onBlur={() => setDiscountFixedText(formatTlAmountDisplay(p.discountFixed))}
                  /> ₺ <strong>{p.pricing ? `−${money(p.pricing.fixedDiscountMinor)}` : '—'}</strong>
                </span>
              </div>
              {!p.pricing && <span role="alert">Fiyat veya iskonto geçersiz.</span>}
            </div>
            <div className={styles.totalcard}>
              <svg className={styles.totalWave} viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden="true">
                <path fill="var(--pc-total-wave-1)" d="M115 120C170 112 204 62 252 44C282 33 304 16 320 0V120H115Z" />
                <path fill="var(--pc-total-wave-2)" d="M176 120C216 116 242 92 276 78C296 70 310 58 320 42V120H176Z" />
              </svg>
              <span>Genel Toplam</span>
              <strong>{p.pricing ? money(p.pricing.totalMinor) : '—'}</strong>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={p.print}>
              <Printer size={15} /> Yazdır
            </button>
            <button
              type="button"
              className={styles.button}
              title="T.C. Sağlık Bakanlığı Aydınlatılmış Rıza Belgesi (PDF) İndir"
              onClick={() => {
                downloadOfficialDentalConsentPdf()
                toast.success('Sağlık Bakanlığı onam formu indirildi.')
              }}
            >
              <Download size={15} /> Onam Formu İndir
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              disabled={p.saving}
              onClick={() => p.save()}
            >
              <Save size={15} /> {p.saving ? 'Kaydediliyor…' : 'Planı Kaydet'}
            </button>
          </div>
        </section>
      </div>
    </main>
    <PlanToothTools
      {...p}
      drafts={p.drafts}
      selectedProcedure={selectedProcedure}
      selectedIndications={selectedProcedure ? getLinkedIndicationsForProcedure(indicationLinks, selectedProcedure, indications) : indications}
      selectedMaterials={materials}
      toothSurfaces={p.toothSurfaces}
      updateSurfaces={p.updateSurfaces}
      toothSections={p.toothSections}
      updateSection={p.updateSection}
      openMaterials={setMaterialRow}
      onRemoveDraft={p.onRemoveDraft || ((teeth: number[], draftId?: string, procName?: string) => {
        const emptiedTeeth: number[] = []
        teeth.forEach((t: number) => {
          const tk = String(t)
          const left = (p.drafts?.[tk] || []).filter((item: any) => draftId ? item.id !== draftId : item.name !== procName)
          if (left.length === 0) emptiedTeeth.push(t)
        })
        p.setDrafts((prev: any) => {
          const next = { ...prev }
          teeth.forEach((t: number) => {
            const tk = String(t)
            if (next[tk]) {
              next[tk] = next[tk].filter((item: any) => draftId ? item.id !== draftId : item.name !== procName)
              if (next[tk].length === 0) delete next[tk]
            }
          })
          return next
        })
        emptiedTeeth.forEach(t => {
          p.updateSection?.(t, null)
          p.updateSurfaces?.(t, [])
        })
      })}
      onClearTeethDrafts={p.onClearTeethDrafts || ((teeth: number[]) => {
        p.setDrafts((prev: any) => {
          const next = { ...prev }
          teeth.forEach((t: number) => {
            const tk = String(t)
            if (next[tk]) {
              delete next[tk]
            }
          })
          return next
        })
        teeth.forEach((t: number) => {
          p.updateSection?.(t, null)
          p.updateSurfaces?.(t, [])
        })
      })}
    />
    {historyOpen && <PlanHistoryDialog patientId={p.event?.patientId} onEnsurePatient={p.onEnsurePatient} entries={p.consultations} onChange={p.setConsultations} onClose={() => setHistoryOpen(false)} />}
    {p.showClose && (
      <PlanDialog title="Kaydedilmemiş Değişiklikler" onClose={() => p.setShowClose(false)}>
        <p className={styles.dialogDescription} style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.55 }}>
          Tedavi planında kaydedilmemiş değişiklikleriniz var. Planı kapatmadan önce değişikliklerinizi kaydetmek ister misiniz?
        </p>
        <div className={styles.actions} style={{ marginTop: 6, justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            autoFocus
            className={styles.button}
            style={{ minWidth: 0, padding: '9px 14px', flex: '0 1 auto' }}
            onClick={() => p.setShowClose(false)}
          >
            Devam Et
          </button>
          <button
            type="button"
            className={styles.button}
            style={{ minWidth: 0, padding: '9px 14px', flex: '0 1 auto', color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={p.discard}
          >
            Değişiklikleri Bırak
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            style={{ minWidth: 0, padding: '9px 18px', flex: '0 1 auto' }}
            onClick={() => { p.setShowClose(false); p.save({ closeAfter: true, allowEmpty: true }) }}
          >
            Kaydet
          </button>
        </div>
      </PlanDialog>
    )}
    {materialRow && materialItem && (
      <PlanDialog title={`Satır Malzemeleri · ${materialItem.name}`} onClose={() => setMaterialRow(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {materialItem.materials.map((item: any, index: number) => (
            <div className={styles.materialLine} key={`${item.inventoryItemId}-${index}`}>
              <span>{item.name}</span>
              <input className={styles.input} style={{ width: 65 }} aria-label={`${item.name} miktarı`} disabled={materialItem.locked} type="number" min="1" value={item.quantity} onChange={event => {
                const nextQty = Number(event.target.value)
                const updater = (row: any) => ({ ...row, materials: row.materials.map((value: any, i: number) => i === index ? { ...value, quantity: nextQty } : value) })
                if (materialRow.entries?.length) updateGroupEntries(materialRow.entries, updater)
                else updateRow(materialRow.target, materialRow.id, updater)
              }} />
              <input className={styles.input} style={{ width: 80 }} aria-label={`${item.name} satış fiyatı`} disabled={materialItem.locked} type="number" min="0" step="0.01" value={(item.unitSalePriceMinor || 0) / 100} onChange={event => {
                const nextPriceMinor = Math.round(Number(event.target.value) * 100)
                const updater = (row: any) => ({ ...row, materials: row.materials.map((value: any, i: number) => i === index ? { ...value, unitSalePriceMinor: nextPriceMinor } : value) })
                if (materialRow.entries?.length) updateGroupEntries(materialRow.entries, updater)
                else updateRow(materialRow.target, materialRow.id, updater)
              }} />
              <button type="button" className={styles.button} disabled={materialItem.locked} onClick={() => {
                const updater = (row: any) => ({ ...row, materials: row.materials.filter((_: any, i: number) => i !== index) })
                if (materialRow.entries?.length) updateGroupEntries(materialRow.entries, updater)
                else updateRow(materialRow.target, materialRow.id, updater)
              }}>Kaldır</button>
            </div>
          ))}
          <label htmlFor="pine-row-material" style={{ marginTop: 6, fontWeight: 600, fontSize: 12.5 }}>Malzeme ekle</label>
          <select id="pine-row-material" className={styles.select} disabled={materialItem.locked} value="" onChange={event => {
            const item = selectableInventory.find((value: any) => value.id === event.target.value)
            if (item && !materialItem.materials.some((value: any) => value.inventoryItemId === item.id)) {
              const updater = (row: any) => ({ ...row, materials: [...row.materials, { inventoryItemId: item.id, name: item.name, quantity: 1, unitCost: item.costPerUnit, unitSalePriceMinor: 0 }] })
              if (materialRow.entries?.length) updateGroupEntries(materialRow.entries, updater)
              else updateRow(materialRow.target, materialRow.id, updater)
            }
          }}>
            <option value="">Malzeme seçin</option>
            {selectableInventory.map((item: any) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className={styles.actions} style={{ marginTop: 18 }}>
          <button type="button" className={styles.button} onClick={() => setMaterialRow(null)}>Kapat</button>
        </div>
      </PlanDialog>
    )}
  </div></div>
}
