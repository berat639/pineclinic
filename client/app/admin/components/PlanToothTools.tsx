import React, { useEffect, useRef, useState } from 'react'
import { Check, CheckSquare, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import PlanDialog from './PlanDialog'
import { checkDoctorAvailability } from '../../../lib/doctor-availability'
import {
  ALL_TOOTH_REGION_IDS,
  formatToothRegionLabel,
  formatToothRegionShortLabel,
  parseToothRegions,
  serializeToothRegions,
  type ToothRegion,
} from './ToothAnatomy2D'
import styles from './PineTreatmentPlan.module.css'

type Menu = { x: number; y: number; teeth: number[] }

export type SurfaceCode = 'O' | 'M' | 'D' | 'B' | 'L'
export type SubLayerCode = ToothRegion

export const DENTAL_SURFACES: Array<{
  code: SurfaceCode
  label: string
  shortDesc: string
  color: string
}> = [
  { code: 'O', label: 'Okluzal (O)', shortDesc: 'Merkez çiğneme yüzeyi', color: '#06b6d4' },
  { code: 'M', label: 'Mezial (M)', shortDesc: 'Ön / orta hat arayüz', color: '#2563eb' },
  { code: 'D', label: 'Distal (D)', shortDesc: 'Arka komşu arayüz', color: '#6366f1' },
  { code: 'B', label: 'Bukkal (B)', shortDesc: 'Dış yanak yüzeyi', color: '#10b981' },
  { code: 'L', label: 'Lingual (L)', shortDesc: 'İç dil / damak yüzeyi', color: '#14b8a6' },
]

export const DENTAL_SUBLAYERS: Array<{
  id: SubLayerCode
  label: string
  shortDesc: string
  color: string
}> = [
  { id: 'enamel', label: 'Mine', shortDesc: 'Dış koruyucu mine tabakası', color: '#38bdf8' },
  { id: 'dentin', label: 'Dentin', shortDesc: 'Orta sert diş dokusu', color: '#f59e0b' },
  { id: 'pulp', label: 'Pulpa', shortDesc: 'Merkez sinir ve damar odası', color: '#e11d48' },
  { id: 'root-canal', label: 'Kök Kanalı', shortDesc: 'Kök içi kanal sistemi', color: '#8b5cf6' },
  { id: 'crown', label: 'Taç (Kuron)', shortDesc: 'Ağız içi görünür kuron', color: '#0284c7' },
  { id: 'neck', label: 'Boyun (Kole)', shortDesc: 'Servikal geçiş hattı', color: '#06b6d4' },
  { id: 'root', label: 'Kök', shortDesc: 'Diş kök gövdesi', color: '#a16207' },
  { id: 'apex', label: 'Kök Ucu', shortDesc: 'Apikal foramen bölgesi', color: '#be123c' },
  { id: 'gingiva', label: 'Diş Eti', shortDesc: 'Yumuşak diş eti dokusu', color: '#ec4899' },
  { id: 'jaw-bone', label: 'Çene Kemiği', shortDesc: 'Alveol destek kemiği', color: '#d97706' },
]

/**
 * 20x20 Özel Simetrik Diş Yüzeyi (MODBL) SVG İkonu
 * Beş bölgeli oklüzal kuron şemasında ilgili yüzey kendi klinik rengiyle vurgulanır.
 */
export function SurfaceSvgIcon({
  code,
  color,
}: {
  code: SurfaceCode
  color: string
}) {
  const baseFill = 'var(--input-bg, #f8fafc)'
  const baseStroke = 'var(--pc-muted, #64748b)'

  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {/* Dış kuron çerçevesi */}
      <rect
        x="2.2"
        y="2.2"
        width="19.6"
        height="19.6"
        rx="5.5"
        fill={baseFill}
        stroke={baseStroke}
        strokeWidth="1.2"
      />
      {/* Bukkal (B) - Üst yamuk segment */}
      <path
        d="M 5.2 3.2 Q 12 2.5 18.8 3.2 L 15.6 8.4 H 8.4 Z"
        fill={code === 'B' ? color : baseFill}
        stroke={code === 'B' ? color : baseStroke}
        strokeWidth={code === 'B' ? '1.5' : '1'}
        strokeLinejoin="round"
      />
      {/* Lingual (L) - Alt yamuk segment */}
      <path
        d="M 8.4 15.6 H 15.6 L 18.8 20.8 Q 12 21.5 5.2 20.8 Z"
        fill={code === 'L' ? color : baseFill}
        stroke={code === 'L' ? color : baseStroke}
        strokeWidth={code === 'L' ? '1.5' : '1'}
        strokeLinejoin="round"
      />
      {/* Mezial (M) - Sol yamuk segment */}
      <path
        d="M 3.2 5.2 L 8.4 8.4 V 15.6 L 3.2 18.8 Q 2.5 12 3.2 5.2 Z"
        fill={code === 'M' ? color : baseFill}
        stroke={code === 'M' ? color : baseStroke}
        strokeWidth={code === 'M' ? '1.5' : '1'}
        strokeLinejoin="round"
      />
      {/* Distal (D) - Sağ yamuk segment */}
      <path
        d="M 15.6 8.4 L 20.8 5.2 Q 21.5 12 20.8 18.8 L 15.6 15.6 Z"
        fill={code === 'D' ? color : baseFill}
        stroke={code === 'D' ? color : baseStroke}
        strokeWidth={code === 'D' ? '1.5' : '1'}
        strokeLinejoin="round"
      />
      {/* Okluzal (O) - Merkez çiğneme alanı */}
      <rect
        x="8.4"
        y="8.4"
        width="7.2"
        height="7.2"
        rx="1.6"
        fill={code === 'O' ? color : baseFill}
        stroke={code === 'O' ? color : baseStroke}
        strokeWidth={code === 'O' ? '1.5' : '1.1'}
      />
      {code === 'O' && (
        <path
          d="M 10.3 12 H 13.7 M 12 10.3 V 13.7"
          stroke="#ffffff"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

/**
 * 20x20 Özel Anatomik Diş Kesiti SVG İkonu
 * Gerçek diş kron+kök silüeti içinde ilgili alt katman kendi klinik rengiyle vurgulanır.
 */
export function AnatomyLayerSvgIcon({
  layer,
  color,
}: {
  layer: SubLayerCode
  color: string
}) {
  const baseFill = 'var(--input-bg, #f8fafc)'
  const baseStroke = 'var(--pc-muted, #64748b)'
  const toothOutline =
    'M 5.5 11.2 C 4.6 9.5 4.2 7.6 4.5 5.6 C 4.8 3.6 6.5 2.3 8.6 2.4 C 10.1 2.5 11.1 3.5 12 3.5 C 12.9 3.5 13.9 2.5 15.4 2.4 C 17.5 2.3 19.2 3.6 19.5 5.6 C 19.8 7.6 19.4 9.5 18.5 11.2 C 18.1 14.2 17.6 17.6 16.4 20.6 C 16.0 21.5 15.1 21.5 14.7 20.5 L 13.1 15.4 C 12.6 14.2 11.4 14.2 10.9 15.4 L 9.3 20.5 C 8.9 21.5 8.0 21.5 7.6 20.6 C 6.4 17.6 5.9 14.2 5.5 11.2 Z'

  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {/* Diş gövdesi ana silüet */}
      <path
        d={toothOutline}
        fill={baseFill}
        stroke={baseStroke}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />

      {/* Mine katmanı (En dış koruyucu kuron kabuğu) */}
      {layer === 'enamel' && (
        <path
          fillRule="evenodd"
          d="M 5.5 11.2 C 4.6 9.5 4.2 7.6 4.5 5.6 C 4.8 3.6 6.5 2.3 8.6 2.4 C 10.1 2.5 11.1 3.5 12 3.5 C 12.9 3.5 13.9 2.5 15.4 2.4 C 17.5 2.3 19.2 3.6 19.5 5.6 C 19.8 7.6 19.4 9.5 18.5 11.2 L 16.5 10.5 C 17.2 9.1 17.4 7.5 17.2 6.0 C 16.9 4.7 15.9 4.1 14.8 4.2 C 13.7 4.3 12.9 5.2 12 5.2 C 11.1 5.2 10.3 4.3 9.2 4.2 C 8.1 4.1 7.1 4.7 6.8 6.0 C 6.6 7.5 6.8 9.1 7.5 10.5 Z"
          fill={color}
          stroke={color}
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
      )}

      {/* Dentin katmanı (Orta sert doku) */}
      {layer === 'dentin' && (
        <path
          d="M 7.1 10.6 C 6.6 9.1 6.5 7.4 6.8 5.9 C 7.1 4.6 8.1 4.0 9.2 4.1 C 10.3 4.2 11.1 5.1 12 5.1 C 12.9 5.1 13.7 4.2 14.8 4.1 C 15.9 4.0 16.9 4.6 17.2 5.9 C 17.5 7.4 17.4 9.1 16.9 10.6 C 16.5 13.4 16.1 16.1 15.2 18.6 L 13.4 14.2 C 12.7 12.8 11.3 12.8 10.6 14.2 L 8.8 18.6 C 7.9 16.1 7.5 13.4 7.1 10.6 Z"
          fill={color}
          fillOpacity="0.85"
          stroke={color}
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
      )}

      {/* Pulpa odası (Merkez kuron içi pulpa odası) */}
      {layer === 'pulp' && (
        <>
          <path
            d="M 6.2 10.8 Q 12 11.8 17.8 10.8"
            stroke={baseStroke}
            strokeWidth="0.9"
            strokeDasharray="1.5 1.5"
          />
          <path
            d="M 8.5 7.7 C 8.5 6.3 9.5 5.9 10.4 6.7 C 11.0 7.3 11.5 7.4 12 7.4 C 12.5 7.4 13.0 7.3 13.6 6.7 C 14.5 5.9 15.5 6.3 15.5 7.7 C 15.6 9.3 14.7 10.8 13.5 11.6 L 10.5 11.6 C 9.3 10.8 8.4 9.3 8.5 7.7 Z"
            fill={color}
            stroke={color}
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </>
      )}

      {/* Kök kanalı (İki kök içi kanal hattı ve apeks uçları) */}
      {layer === 'root-canal' && (
        <>
          <path
            d="M 9.6 8.2 Q 12 9.0 14.4 8.2"
            stroke={baseStroke}
            strokeWidth="1"
            strokeLinecap="round"
          />
          <path
            d="M 10.6 10.8 C 10.4 13.2 9.5 16.2 8.4 19.6 M 13.4 10.8 C 13.6 13.2 14.5 16.2 15.6 19.6 M 10.4 10.8 H 13.6"
            stroke={color}
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="8.4" cy="20.1" r="1.45" fill={color} />
          <circle cx="15.6" cy="20.1" r="1.45" fill={color} />
        </>
      )}

      {/* Taç / Kuron (Üst kuron gövdesi) */}
      {layer === 'crown' && (
        <path
          d="M 5.5 11.2 C 4.6 9.5 4.2 7.6 4.5 5.6 C 4.8 3.6 6.5 2.3 8.6 2.4 C 10.1 2.5 11.1 3.5 12 3.5 C 12.9 3.5 13.9 2.5 15.4 2.4 C 17.5 2.3 19.2 3.6 19.5 5.6 C 19.8 7.6 19.4 9.5 18.5 11.2 Q 12 12.2 5.5 11.2 Z"
          fill={color}
          fillOpacity="0.88"
          stroke={color}
          strokeWidth="1.1"
        />
      )}

      {/* Boyun / Kole (Servikal geçiş kuşağı) */}
      {layer === 'neck' && (
        <path
          d="M 5.2 11.0 Q 12 12.4 18.8 11.0"
          stroke={color}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      )}

      {/* Kök (Alt kök çatalları) */}
      {layer === 'root' && (
        <path
          d="M 5.6 11.4 Q 12 12.2 18.4 11.4 C 18.0 14.3 17.5 17.6 16.4 20.6 C 16.0 21.5 15.1 21.5 14.7 20.5 L 13.1 15.4 C 12.6 14.2 11.4 14.2 10.9 15.4 L 9.3 20.5 C 8.9 21.5 8.0 21.5 7.6 20.6 C 6.5 17.6 6.0 14.3 5.6 11.4 Z"
          fill={color}
          fillOpacity="0.85"
          stroke={color}
          strokeWidth="1"
        />
      )}

      {/* Kök Ucu / Apeks */}
      {layer === 'apex' && (
        <>
          <circle cx="8.3" cy="20.3" r="2.3" fill={color} />
          <circle cx="15.7" cy="20.3" r="2.3" fill={color} />
        </>
      )}

      {/* Diş Eti / Gingiva */}
      {layer === 'gingiva' && (
        <path
          d="M 2.5 10.5 Q 6 9.5 9 11.2 L 15 11.2 Q 18 9.5 21.5 10.5 L 21.5 13.5 Q 17.5 12.5 14.5 13.8 L 9.5 13.8 Q 6.5 12.5 2.5 13.5 Z"
          fill={color}
          fillOpacity="0.9"
          stroke={color}
          strokeWidth="0.9"
        />
      )}

      {/* Çene Kemiği / Alveol */}
      {layer === 'jaw-bone' && (
        <path
          d="M 3 13.2 Q 12 14.4 21 13.2 L 21 21.5 Q 12 22.2 3 21.5 Z"
          fill={color}
          fillOpacity="0.78"
          stroke={color}
          strokeWidth="1"
        />
      )}
    </svg>
  )
}

export interface PlanToothContextMenuProps {
  contextMenu?: Menu | null
  setContextMenu?: (menu: Menu | null) => void
  onClose?: () => void
  drafts?: Record<string, any[]>
  setDrafts?: React.Dispatch<React.SetStateAction<any>>
  onRemoveDraft?: (teeth: number[], draftId?: string, procName?: string) => void
  onClearTeethDrafts?: (teeth: number[]) => void
  procedures?: any[]
  indications?: string[]
  add?: (teeth: number[], payload: any) => void
  onAddProcedure?: (proc: any) => void
  onAddIndication?: (indication: string) => void
  toothSurfaces?: Record<number, string[]>
  updateSurfaces?: (tooth: number, surfaces: string[]) => void
  toothSections?: Record<number, string>
  updateSection?: (tooth: number, section: string | null) => void
  selectedProcedure?: any
  selectedIndications?: string[]
  selectedMaterials?: any[]
}

export function PlanToothContextMenu(p: PlanToothContextMenuProps & Record<string, any>) {
  const menu: Menu | null =
    p.contextMenu ||
    (p.teeth && typeof p.x === 'number' && typeof p.y === 'number'
      ? { x: p.x, y: p.y, teeth: p.teeth }
      : null)
  const ref = useRef<HTMLDivElement>(null)
  const [localSurfacesMap, setLocalSurfacesMap] = useState<Record<number, string[]>>({})
  const [localSectionsMap, setLocalSectionsMap] = useState<Record<number, string | null>>({})

  useEffect(() => {
    if (p.toothSurfaces) {
      setLocalSurfacesMap(p.toothSurfaces)
    }
  }, [p.toothSurfaces])

  useEffect(() => {
    if (p.toothSections) {
      setLocalSectionsMap(p.toothSections)
    }
  }, [p.toothSections])

  const closeMenu = () => {
    if (p.onClose) p.onClose()
    if (p.setContextMenu) p.setContextMenu(null)
  }

  useEffect(() => {
    if (!menu) return
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector('button')?.focus()

    const handleWheel = (event: WheelEvent) => {
      const menuEl = ref.current
      if (!menuEl || !menuEl.contains(event.target as Node)) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      let scrollable: HTMLElement | null = event.target as HTMLElement | null
      while (scrollable && scrollable !== menuEl && scrollable.scrollHeight <= scrollable.clientHeight) {
        scrollable = scrollable.parentElement
      }
      if (!scrollable || scrollable.scrollHeight <= scrollable.clientHeight) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      const atTop = scrollable.scrollTop <= 0 && event.deltaY < 0
      const atBottom =
        scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1 && event.deltaY > 0
      if (atTop || atBottom) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    const handleTouchMove = (event: TouchEvent) => {
      const menuEl = ref.current
      if (!menuEl || !menuEl.contains(event.target as Node)) {
        event.preventDefault()
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true })
    return () => {
      window.removeEventListener('wheel', handleWheel, { capture: true } as any)
      window.removeEventListener('touchmove', handleTouchMove, { capture: true } as any)
      if (previous?.isConnected) previous.focus()
    }
  }, [menu])

  if (!menu) return null

  const drafts = p.drafts || {}
  const procedures = p.procedures || []
  const primaryTooth = Number(menu.teeth[0])

  const getProcColor = (itemOrProc: any) => {
    if (itemOrProc?.color) return itemOrProc.color
    const matched = procedures.find(
      (proc: any) =>
        (itemOrProc?.procedureId && proc.id === itemOrProc.procedureId) || proc.name === itemOrProc?.name
    )
    return matched?.color || '#0284c7'
  }

  const getToothSurfaces = (toothNum: number): string[] => {
    if (localSurfacesMap[toothNum] !== undefined) return localSurfacesMap[toothNum]
    if (p.toothSurfaces?.[toothNum] !== undefined) return p.toothSurfaces[toothNum]
    const lastDraft = (drafts[toothNum] || []).at(-1)
    if (lastDraft?.surface && typeof lastDraft.surface === 'string') {
      return lastDraft.surface.split('').filter(Boolean)
    }
    return []
  }

  const getToothSection = (toothNum: number): string | null => {
    if (localSectionsMap[toothNum] !== undefined) return localSectionsMap[toothNum]
    if (p.toothSections?.[toothNum] !== undefined) return p.toothSections[toothNum] || null
    const lastDraft = (drafts[toothNum] || []).at(-1)
    return lastDraft?.section || null
  }

  const activeSurfaces = getToothSurfaces(primaryTooth)
  const activeSection = getToothSection(primaryTooth)
  const activeSubLayers: SubLayerCode[] = parseToothRegions(activeSection)
  const allSubLayerIds: SubLayerCode[] = DENTAL_SUBLAYERS.map(l => l.id)
  const isAllSubLayersSelected =
    allSubLayerIds.length > 0 && allSubLayerIds.every(id => activeSubLayers.includes(id))

  const applySurfacesToMenuTeeth = (nextSurfaces: string[]) => {
    const nextMap = { ...localSurfacesMap }
    for (const rawTooth of menu.teeth) {
      const t = Number(rawTooth)
      nextMap[t] = nextSurfaces
      p.updateSurfaces?.(t, nextSurfaces)
    }
    setLocalSurfacesMap(nextMap)
    if (!p.updateSurfaces && p.setDrafts) {
      p.setDrafts((previous: any) => {
        const next = { ...previous }
        for (const rawTooth of menu.teeth) {
          const t = Number(rawTooth)
          if (Array.isArray(next[t])) {
            next[t] = next[t].map((item: any) => ({
              ...item,
              surface: nextSurfaces.join('') || undefined,
            }))
          }
        }
        return next
      })
    }
  }

  const toggleSurface = (code: SurfaceCode) => {
    const exists = activeSurfaces.includes(code)
    const orderedCodes: SurfaceCode[] = ['M', 'O', 'D', 'B', 'L']
    const rawNext = exists
      ? activeSurfaces.filter(s => s !== code)
      : [...activeSurfaces, code]
    const nextSurfaces = orderedCodes.filter(c => rawNext.includes(c))
    applySurfacesToMenuTeeth(nextSurfaces)
  }

  const applySubLayersToMenuTeeth = (nextLayers: SubLayerCode[]) => {
    const serialized = serializeToothRegions(nextLayers)
    const nextMap = { ...localSectionsMap }
    for (const rawTooth of menu.teeth) {
      const t = Number(rawTooth)
      nextMap[t] = serialized
      p.updateSection?.(t, serialized)
    }
    setLocalSectionsMap(nextMap)
    if (!p.updateSection && p.setDrafts) {
      p.setDrafts((previous: any) => {
        const next = { ...previous }
        for (const rawTooth of menu.teeth) {
          const t = Number(rawTooth)
          if (Array.isArray(next[t])) {
            next[t] = next[t].map((item: any) => ({
              ...item,
              section: serialized || undefined,
            }))
          }
        }
        return next
      })
    }
  }

  const toggleSubLayer = (layerId: SubLayerCode) => {
    const exists = activeSubLayers.includes(layerId)
    const nextLayers = exists
      ? activeSubLayers.filter(id => id !== layerId)
      : [...activeSubLayers, layerId]
    applySubLayersToMenuTeeth(nextLayers)
  }

  const toggleAllSubLayers = () => {
    if (isAllSubLayersSelected) {
      applySubLayersToMenuTeeth([])
    } else {
      applySubLayersToMenuTeeth(allSubLayerIds)
    }
  }

  // Collect all draft treatments across menu.teeth (including completed ones so user can delete them)
  const assignedDrafts: Array<{
    key: string
    tooth: number
    draftId?: string
    name: string
    color: string
    surface?: string
    section?: string
    wasCompleted?: boolean
  }> = []

  for (const toothNum of menu.teeth) {
    const rows = drafts[toothNum] || []
    for (const row of rows) {
      if (row) {
        assignedDrafts.push({
          key: `${toothNum}-${row.id || row.name}-${assignedDrafts.length}`,
          tooth: Number(toothNum),
          draftId: row.id,
          name: row.name,
          color: getProcColor(row),
          surface: row.surface || getToothSurfaces(Number(toothNum)).join('') || undefined,
          section: row.section || getToothSection(Number(toothNum)) || undefined,
          wasCompleted: Boolean(row.wasCompleted || row.status === 'completed' || row.locked),
        })
      }
    }
  }

  const handleRemoveDraft = (
    targetTeeth: number[],
    draftId?: string,
    procName?: string,
    wasCompleted?: boolean
  ) => {
    if (wasCompleted) {
      toast('⚠️ Tamamlanmış bir işlem kaldırıldı. Planı kaydederken onayınız istenecektir.', {
        icon: '⚠️',
        id: 'completed-edit-warn',
      })
    }
    if (p.onRemoveDraft) {
      p.onRemoveDraft(targetTeeth, draftId, procName)
    } else if (p.setDrafts) {
      p.setDrafts((previous: any) => {
        const next = { ...previous }
        for (const t of targetTeeth) {
          const rows = next[t] || []
          if (draftId) {
            next[t] = rows.filter((row: any) => row.id !== draftId)
          } else if (procName) {
            next[t] = rows.filter((row: any) => row.name !== procName)
          }
          if (next[t]?.length === 0) delete next[t]
        }
        return next
      })
    }
  }

  const safeLeft = Math.max(
    8,
    Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 276)
  )
  const safeTop = Math.max(
    8,
    Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 768) - 448)
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100019 }}
      onClick={() => closeMenu()}
      onContextMenu={event => {
        event.preventDefault()
        closeMenu()
      }}
    >
      <div
        ref={ref}
        role="menu"
        aria-label="Diş yüzey ve katman işlemleri"
        className={styles.toothMenu}
        style={{
          left: safeLeft,
          top: safeTop,
          width: 'min(268px, calc(100vw - 16px))',
          maxHeight: 'min(440px, calc(100dvh - 16px))',
          borderRadius: 12,
          border: '1.5px solid var(--input-border, var(--pc-border))',
          background: 'var(--card-bg)',
          boxShadow: 'var(--pc-modal-shadow)',
        }}
        onClick={event => event.stopPropagation()}
        onContextMenu={event => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            closeMenu()
            return
          }
          if (event.key === 'Tab') {
            closeMenu()
            return
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const buttons = Array.from(
              ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []
            )
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next]?.focus()
          }
        }}
      >
        <div
          className={styles.menuHeading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
          }}
        >
          <span>Seçili Dişler: #{menu.teeth.join(', #')}</span>
          {(activeSurfaces.length > 0 || activeSubLayers.length > 0) && (
            <span
              style={{
                padding: '2px 6px',
                borderRadius: 999,
                background: 'var(--pc-tint)',
                color: 'var(--pc-tint-fg)',
                fontSize: 10,
                fontWeight: 800,
              }}
            >
              {[activeSurfaces.join(''), formatToothRegionShortLabel(activeSubLayers)]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>

        <div className={`${styles.menuBody} contextSection`} style={{ overscrollBehavior: 'contain' }}>
          {/* Mevcut Atanan İşlemler (Sil) Bölümü */}
          {assignedDrafts.length > 0 && (
            <>
              <div
                className={styles.menuSection}
                style={{
                  color: 'var(--danger, #ef4444)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>Atanan İşlemler (Sil)</span>
                <span>{assignedDrafts.length}</span>
              </div>
              {assignedDrafts.map(entry => {
                const badgeText = [entry.surface, formatToothRegionShortLabel(entry.section)]
                  .filter(Boolean)
                  .join('·')
                return (
                  <button
                    type="button"
                    role="menuitem"
                    key={entry.key}
                    title={`#${entry.tooth} - ${entry.name} işlemini sil`}
                    onClick={() => {
                      const isLast = assignedDrafts.length <= 1
                      handleRemoveDraft([entry.tooth], entry.draftId, entry.name, entry.wasCompleted)
                      if (isLast) closeMenu()
                    }}
                  >
                    <span
                      className={styles.menuProcedureName}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        minWidth: 0,
                        maxWidth: 'none',
                        flex: 1,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: entry.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          color: 'var(--foreground-2)',
                          flexShrink: 0,
                        }}
                      >
                        #{entry.tooth}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.name}
                      </span>
                      {badgeText && (
                        <span
                          style={{
                            padding: '1px 5px',
                            borderRadius: 5,
                            background: 'var(--pc-tint)',
                            color: 'var(--pc-tint-fg)',
                            fontSize: 9.5,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {badgeText}
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        color: 'var(--danger, #ef4444)',
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={12} />
                      <span>Sil</span>
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {/* Bölüm 1: Diş Yüzeyleri (MODBL) */}
          <div
            className={styles.menuSection}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: assignedDrafts.length > 0 ? '1px solid var(--pc-border)' : undefined,
              marginTop: assignedDrafts.length > 0 ? 4 : 0,
            }}
          >
            <span>Diş Yüzeyleri (MODBL)</span>
            {activeSurfaces.length > 0 && (
              <span style={{ fontWeight: 800, color: 'var(--pc-blue, #0284c7)' }}>
                {activeSurfaces.join('')}
              </span>
            )}
          </div>

          {DENTAL_SURFACES.map(surf => {
            const isSelected = activeSurfaces.includes(surf.code)
            return (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={isSelected}
                key={surf.code}
                onClick={() => toggleSurface(surf.code)}
                style={{
                  background: isSelected ? 'var(--pc-tint)' : 'var(--card-bg)',
                  color: isSelected ? 'var(--pc-tint-fg)' : 'var(--foreground)',
                  fontWeight: isSelected ? 700 : 600,
                  padding: '6px 12px',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <SurfaceSvgIcon code={surf.code} color={surf.color} />
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: surf.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 12, lineHeight: 1.2 }}>{surf.label}</span>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--pc-muted)',
                        fontWeight: 500,
                        lineHeight: 1.2,
                      }}
                    >
                      {surf.shortDesc}
                    </span>
                  </span>
                </span>
                {isSelected && (
                  <Check size={14} style={{ color: 'var(--pc-blue, #0284c7)', flexShrink: 0 }} />
                )}
              </button>
            )
          })}

          {/* Hızlı Kombinasyon Çipleri (MO, DO, MOD, Temizle) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 12px 6px',
              flexWrap: 'wrap',
            }}
          >
            {(['MO', 'DO', 'MOD'] as const).map(preset => {
              const isPresetActive = activeSurfaces.join('') === preset
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applySurfacesToMenuTeeth(preset.split(''))}
                  style={{
                    width: 'auto',
                    minHeight: 24,
                    padding: '2px 8px',
                    borderRadius: 6,
                    border: isPresetActive
                      ? '1px solid #1d4ed8'
                      : '1px solid var(--pc-border, var(--input-border))',
                    background: isPresetActive
                      ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                      : 'var(--pc-surface, var(--input-bg))',
                    color: isPresetActive ? '#ffffff' : 'var(--pc-tint-fg)',
                    fontSize: 11,
                    fontWeight: 700,
                    boxShadow: isPresetActive ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                  }}
                >
                  {preset}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => applySurfacesToMenuTeeth([])}
              disabled={activeSurfaces.length === 0}
              style={{
                width: 'auto',
                minHeight: 24,
                padding: '2px 8px',
                marginLeft: 'auto',
                borderRadius: 6,
                border: '1px solid var(--pc-border, var(--input-border))',
                background: 'var(--card-bg)',
                color: 'var(--pc-muted)',
                fontSize: 10.5,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <RotateCcw size={10} />
              <span>Temizle</span>
            </button>
          </div>

          {/* Bölüm 2: Alt Katmanlar (Anatomik Katmanlar — Çoklu Seçim + Tümünü Seç) */}
          <div
            className={styles.menuSection}
            style={{
              borderTop: '1px solid var(--pc-border)',
              marginTop: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
            }}
          >
            <span>Alt Katmanlar (Anatomik)</span>
            {activeSubLayers.length > 0 && (
              <span
                style={{
                  fontWeight: 800,
                  color: 'var(--pc-blue, #0284c7)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 110,
                }}
                title={formatToothRegionLabel(activeSubLayers)}
              >
                {formatToothRegionShortLabel(activeSubLayers)}
              </span>
            )}
          </div>

          {/* Alt Katmanlar Hızlı Seçim Çubuğu (Tümünü Seç / Temizle) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 12px 5px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              aria-pressed={isAllSubLayersSelected}
              onClick={toggleAllSubLayers}
              style={{
                width: 'auto',
                minHeight: 24,
                padding: '2px 8px',
                borderRadius: 6,
                border: isAllSubLayersSelected
                  ? '1px solid #1d4ed8'
                  : '1px solid var(--pc-blue, #0284c7)',
                background: isAllSubLayersSelected
                  ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                  : 'var(--pc-tint)',
                color: isAllSubLayersSelected ? '#ffffff' : 'var(--pc-tint-fg)',
                fontSize: 10.5,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                boxShadow: isAllSubLayersSelected ? 'var(--pc-clay-primary)' : 'var(--pc-clay-pale)',
              }}
            >
              <CheckSquare size={11} style={{ color: isAllSubLayersSelected ? '#ffffff' : 'var(--pc-tint-fg)' }} />
              <span style={{ color: isAllSubLayersSelected ? '#ffffff' : 'var(--pc-tint-fg)' }}>
                {isAllSubLayersSelected ? 'Tümü Seçili' : 'Tümünü Seç'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => applySubLayersToMenuTeeth([])}
              disabled={activeSubLayers.length === 0}
              style={{
                width: 'auto',
                minHeight: 24,
                padding: '2px 8px',
                marginLeft: 'auto',
                borderRadius: 6,
                border: '1px solid var(--pc-border, var(--input-border))',
                background: 'var(--card-bg)',
                color: 'var(--pc-muted)',
                fontSize: 10.5,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <RotateCcw size={10} />
              <span>Temizle</span>
            </button>
          </div>

          {DENTAL_SUBLAYERS.map(layer => {
            const isSelected = activeSubLayers.includes(layer.id)
            return (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={isSelected}
                key={layer.id}
                onClick={() => toggleSubLayer(layer.id)}
                style={{
                  background: isSelected ? 'var(--pc-tint)' : 'var(--card-bg)',
                  color: isSelected ? 'var(--pc-tint-fg)' : 'var(--foreground)',
                  fontWeight: isSelected ? 700 : 600,
                  padding: '6px 12px',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <AnatomyLayerSvgIcon layer={layer.id} color={layer.color} />
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: layer.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 12, lineHeight: 1.2 }}>{layer.label}</span>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--pc-muted)',
                        fontWeight: 500,
                        lineHeight: 1.2,
                      }}
                    >
                      {layer.shortDesc}
                    </span>
                  </span>
                </span>
                {isSelected && (
                  <Check size={14} style={{ color: 'var(--pc-blue, #0284c7)', flexShrink: 0 }} />
                )}
              </button>
            )
          })}

          {/* Seçili Tedavi Varsa Bu Yüzey/Katman ile Atama Butonu */}
          {p.selectedProcedure && (
            <div style={{ padding: '8px 10px 4px', borderTop: '1px solid var(--pc-border)', marginTop: 4 }}>
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                onClick={() => {
                  const serializedSec = serializeToothRegions(activeSubLayers)
                  if (p.onAddProcedure) {
                    p.onAddProcedure(p.selectedProcedure)
                  } else if (p.add) {
                    p.add(menu.teeth, {
                      procedures: [p.selectedProcedure],
                      indications: p.selectedIndications || [],
                      activeMaterials: p.selectedMaterials || p.selectedProcedure.materials || [],
                      surface: activeSurfaces.join('') || undefined,
                      section: serializedSec || undefined,
                    })
                  }
                  closeMenu()
                }}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  borderRadius: 8,
                  padding: '7px 10px',
                  background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 11.5,
                  boxShadow: 'var(--pc-clay-primary)',
                }}
              >
                <Plus size={13} style={{ color: '#ffffff', flexShrink: 0 }} />
                <span
                  style={{
                    color: '#ffffff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Seçili Tedaviyi ({p.selectedProcedure.name}) Bu Yüzey/Katman ile Ata
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PlanToothTools(p: any) {
  const tooth = p.detailTooth
  const items = tooth ? p.drafts[tooth] || [] : []
  const currentDetailSubLayers: SubLayerCode[] = tooth
    ? parseToothRegions(p.toothSections?.[tooth])
    : []
  const isAllDetailSubLayers =
    currentDetailSubLayers.length === ALL_TOOTH_REGION_IDS.length

  const update = (id: string, values: any) => {
    const targetItem = items.find((item: any) => item.id === id)
    if (targetItem && (targetItem.wasCompleted || targetItem.status === 'completed')) {
      toast('⚠️ Tamamlanmış bir işlemde değişiklik yaptınız. Kaydederken onayınız istenecektir.', {
        icon: '⚠️',
        id: 'completed-edit-warn',
      })
    }
    p.setDrafts((previous: any) => ({
      ...previous,
      [tooth]: (previous[tooth] || []).map((item: any) =>
        item.id === id ? { ...item, ...values } : item
      ),
    }))
  }
  return (
    <>
      <PlanToothContextMenu {...p} />
      {tooth && (
        <PlanDialog title={`Diş ${tooth} detayları`} onClose={() => p.setDetailTooth(null)}>
          <fieldset className={styles.anatomy}>
            <legend>Yüzeyler</legend>
            <div className={styles.wrapActions}>
              {['M', 'O', 'D', 'B', 'L'].map(surface => (
                <button
                  type="button"
                  key={surface}
                  className={`${styles.button} ${(p.toothSurfaces[tooth] || []).includes(surface) ? styles.primary : ''}`}
                  aria-pressed={(p.toothSurfaces[tooth] || []).includes(surface)}
                  onClick={() => {
                    const current = p.toothSurfaces[tooth] || []
                    p.updateSurfaces(
                      Number(tooth),
                      current.includes(surface)
                        ? current.filter((value: string) => value !== surface)
                        : [...current, surface]
                    )
                  }}
                >
                  {surface}
                </button>
              ))}
            </div>
            <div className={styles.wrapActions}>
              {['O', 'MO', 'DO', 'MOD'].map(preset => (
                <button
                  type="button"
                  key={preset}
                  className={styles.button}
                  onClick={() => p.updateSurfaces(Number(tooth), preset.split(''))}
                >
                  {preset}
                </button>
              ))}
            </div>
            <label htmlFor="tooth-section">Alt Katmanlar (Anatomik)</label>
            <div className={styles.wrapActions} style={{ marginBottom: 6 }}>
              <button
                type="button"
                className={`${styles.button} ${isAllDetailSubLayers ? styles.primary : styles.pale}`}
                aria-pressed={isAllDetailSubLayers}
                onClick={() => {
                  const next = isAllDetailSubLayers ? null : serializeToothRegions(ALL_TOOTH_REGION_IDS)
                  p.updateSection(Number(tooth), next)
                }}
              >
                {isAllDetailSubLayers ? 'Tümü Seçili' : 'Tümünü Seç'}
              </button>
              {DENTAL_SUBLAYERS.map(layer => {
                const active = currentDetailSubLayers.includes(layer.id)
                return (
                  <button
                    type="button"
                    key={layer.id}
                    className={`${styles.button} ${active ? styles.primary : ''}`}
                    aria-pressed={active}
                    onClick={() => {
                      const nextList = active
                        ? currentDetailSubLayers.filter(id => id !== layer.id)
                        : [...currentDetailSubLayers, layer.id]
                      p.updateSection(Number(tooth), serializeToothRegions(nextList))
                    }}
                  >
                    {layer.label}
                  </button>
                )
              })}
            </div>
            <select
              id="tooth-section"
              className={styles.select}
              value={currentDetailSubLayers[0] || ''}
              onChange={event => p.updateSection(Number(tooth), event.target.value || null)}
            >
              <option value="">Seçilmedi</option>
              <option value="enamel">Mine</option>
              <option value="dentin">Dentin</option>
              <option value="pulp">Pulpa</option>
              <option value="root-canal">Kök Kanalı</option>
              <option value="crown">Taç (Kuron)</option>
              <option value="neck">Boyun (Kole)</option>
              <option value="cervical">Kole (Servikal)</option>
              <option value="root">Kök & Apeks</option>
              <option value="apex">Kök Ucu</option>
              <option value="gingiva">Diş Eti</option>
              <option value="jaw-bone">Çene Kemiği</option>
            </select>
          </fieldset>
          {!items.length && (
            <p className={styles.dialogDescription}>
              Bu dişte henüz tedavi yok. Seçtiğiniz yüzey ve bölüm yeni işleme uygulanır.
            </p>
          )}
          {items.map((item: any) => (
            <div key={item.id} className={styles.detailItem}>
              <strong>{item.name}</strong>
              {(item.wasCompleted || item.status === 'completed') && (
                <p
                  className={styles.dialogDescription}
                  style={{ color: '#d97706', fontWeight: 600 }}
                >
                  ⚠️ Tamamlanmış işlem — değişiklik yaptığınızda kaydederken onay istenecektir.
                </p>
              )}
              <label>
                Hekim
                <select
                  className={styles.select}
                  value={item.doctorId || ''}
                  onChange={event => {
                    const nextDoctorId = event.target.value || null
                    if (nextDoctorId && (item.sessionStartTime || p.event?.startTime)) {
                      const check = checkDoctorAvailability(
                        nextDoctorId,
                        p.doctors,
                        p.shifts,
                        p.doctorLeaves,
                        item.sessionStartTime || p.event?.startTime,
                        `#${tooth} (${item.name}) işlemi için`
                      )
                      if (!check.valid) {
                        toast.error(check.message, {
                          duration: 6000,
                          id: 'doctor-availability-warn',
                        })
                        return
                      }
                    }
                    update(item.id, {
                      doctorId: nextDoctorId,
                      doctorIds: nextDoctorId ? [nextDoctorId] : [],
                      doctorManuallySelected: Boolean(nextDoctorId),
                      doctorAutoFilled: false,
                    })
                  }}
                >
                  <option value="">Seçiniz</option>
                  {p.doctors.map((doctor: any) => {
                    const avail = checkDoctorAvailability(
                      doctor.id,
                      p.doctors,
                      p.shifts,
                      p.doctorLeaves,
                      item.sessionStartTime || p.event?.startTime
                    )
                    const suffix =
                      (item.sessionStartTime || p.event?.startTime) && avail.badgeText
                        ? ` (${avail.badgeText})`
                        : ''
                    return (
                      <option value={doctor.id} key={doctor.id}>
                        {doctor.name}
                        {suffix}
                      </option>
                    )
                  })}
                </select>
              </label>
              <label>
                İşlem fiyatı (₺)
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.price}
                  onChange={event => update(item.id, { price: Number(event.target.value) })}
                />
              </label>
              <p className={styles.dialogDescription}>
                {item.indications.join(', ') || 'Endikasyon eklenmedi'}
              </p>
              <div className={styles.wrapActions}>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => {
                    p.openMaterials({ target: tooth, id: item.id })
                    p.setDetailTooth(null)
                  }}
                >
                  Malzemeler ({item.materials.length})
                </button>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => {
                    if (item.wasCompleted || item.status === 'completed')
                      toast(
                        '⚠️ Tamamlanmış bir işlem kaldırıldı. Planı kaydederken onayınız istenecektir.',
                        { icon: '⚠️', id: 'completed-edit-warn' }
                      )
                    p.setDrafts((previous: any) => {
                      const next = {
                        ...previous,
                        [tooth]: previous[tooth].filter((row: any) => row.id !== item.id),
                      }
                      if (!next[tooth]?.length) delete next[tooth]
                      return next
                    })
                  }}
                >
                  İşlemi kaldır
                </button>
              </div>
            </div>
          ))}
        </PlanDialog>
      )}
    </>
  )
}
