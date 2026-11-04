'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Check, RotateCcw } from 'lucide-react'
import { UPPER_TEETH, LOWER_TEETH } from './ToothChip'
import { TOOTH_NAMES } from './Odontogram3D'

export type ToothRegion =
  | 'crown'
  | 'neck'
  | 'root'
  | 'enamel'
  | 'dentin'
  | 'pulp'
  | 'root-canal'
  | 'gingiva'
  | 'jaw-bone'
  | 'apex'

export interface ToothRegionMeta {
  id: ToothRegion
  label: string
  shortLabel: string
  description: string
  color: string
}

export const TOOTH_REGION_META: Record<ToothRegion, ToothRegionMeta> = {
  enamel: {
    id: 'enamel',
    label: 'Mine',
    shortLabel: 'Mine',
    description: 'Dış koruyucu tabaka',
    color: '#38bdf8',
  },
  dentin: {
    id: 'dentin',
    label: 'Dentin',
    shortLabel: 'Dentin',
    description: 'Orta sert diş dokusu',
    color: '#f59e0b',
  },
  pulp: {
    id: 'pulp',
    label: 'Pulpa',
    shortLabel: 'Pulpa',
    description: 'Sinir ve damar odası',
    color: '#e11d48',
  },
  'root-canal': {
    id: 'root-canal',
    label: 'Kök Kanalı',
    shortLabel: 'Kanal',
    description: 'Kök içi kanal sistemi',
    color: '#8b5cf6',
  },
  crown: {
    id: 'crown',
    label: 'Taç (Kuron)',
    shortLabel: 'Taç',
    description: 'Ağız içi görünür kuron',
    color: '#0284c7',
  },
  neck: {
    id: 'neck',
    label: 'Boyun (Kole)',
    shortLabel: 'Boyun',
    description: 'Servikal geçiş hattı',
    color: '#06b6d4',
  },
  root: {
    id: 'root',
    label: 'Kök',
    shortLabel: 'Kök',
    description: 'Diş kök gövdesi',
    color: '#a16207',
  },
  apex: {
    id: 'apex',
    label: 'Kök Ucu',
    shortLabel: 'Kök Ucu',
    description: 'Apikal foramen bölgesi',
    color: '#be123c',
  },
  gingiva: {
    id: 'gingiva',
    label: 'Diş Eti',
    shortLabel: 'Diş Eti',
    description: 'Yumuşak diş eti dokusu',
    color: '#ec4899',
  },
  'jaw-bone': {
    id: 'jaw-bone',
    label: 'Çene Kemiği',
    shortLabel: 'Kemik',
    description: 'Alveol destek kemiği',
    color: '#d97706',
  },
}

export const ORDERED_TOOTH_REGIONS: ToothRegionMeta[] = [
  TOOTH_REGION_META.enamel,
  TOOTH_REGION_META.dentin,
  TOOTH_REGION_META.pulp,
  TOOTH_REGION_META['root-canal'],
  TOOTH_REGION_META.crown,
  TOOTH_REGION_META.neck,
  TOOTH_REGION_META.root,
  TOOTH_REGION_META.apex,
  TOOTH_REGION_META.gingiva,
  TOOTH_REGION_META['jaw-bone'],
]

export function formatToothRegionLabel(region?: string | null): string {
  if (!region) return ''
  if (region in TOOTH_REGION_META) {
    return TOOTH_REGION_META[region as ToothRegion].label
  }
  if (region === 'cervical') return 'Boyun (Kole)'
  return region
}

export interface ToothAnatomyProps {
  value?: ToothRegion | null
  onChange?: (region: ToothRegion) => void
  theme?: 'light' | 'dark'
  className?: string
  activeTooth?: number
  /** Her bir diş kutusunun (ToothBox) içinde kompakt kesit olarak gösterim */
  compact?: boolean
}

export function ToothAnatomy({
  value = null,
  onChange,
  theme = 'light',
  className,
  activeTooth,
  compact = true,
}: ToothAnatomyProps) {
  const select = (target: EventTarget | null, event?: React.SyntheticEvent) => {
    if (!(target instanceof Element)) return
    const region = target.closest<SVGGElement>('[data-region]')
    if (region && region.dataset.region) {
      event?.stopPropagation()
      onChange?.(region.dataset.region as ToothRegion)
    }
  }

  const clipId = `tooth-box-clip-${activeTooth ?? 'default'}`

  return (
    <svg
      viewBox={compact ? '210 145 380 560' : '0 0 800 800'}
      role="group"
      aria-label={activeTooth ? `Diş ${activeTooth} anatomisi; bir bölge seçin` : 'Diş anatomisi; bir bölge seçin'}
      className={className}
      data-theme={theme}
      data-selected={value ?? ''}
      onClick={event => select(event.target, event)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select(event.target, event)
        }
      }}
      style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={compact ? '210' : '0'}
            y={compact ? '145' : '0'}
            width={compact ? '380' : '800'}
            height={compact ? '560' : '800'}
            rx={compact ? '36' : '28'}
          />
        </clipPath>
      </defs>
      <style>{`
        svg[data-theme="dark"] .surface { fill: #101f2d; }
        svg[data-theme="dark"] .heading { fill: #e5f4f5; }
        svg[data-theme="dark"] .sub, svg[data-theme="dark"] .small { fill: #a0b8c3; }
        svg[data-theme="dark"] .label { fill: #d1e3e7; }
        svg[data-selected="crown"] [data-region="crown"],
        svg[data-selected="neck"] [data-region="neck"],
        svg[data-selected="root"] [data-region="root"],
        svg[data-selected="enamel"] [data-region="enamel"],
        svg[data-selected="dentin"] [data-region="dentin"],
        svg[data-selected="pulp"] [data-region="pulp"],
        svg[data-selected="root-canal"] [data-region="root-canal"],
        svg[data-selected="gingiva"] [data-region="gingiva"],
        svg[data-selected="jaw-bone"] [data-region="jaw-bone"],
        svg[data-selected="apex"] [data-region="apex"] {
          filter: drop-shadow(0 0 8px #00a3b6) brightness(0.93);
          stroke: #0284c7 !important;
          stroke-width: 5px !important;
        }
      `}</style>
      <style>{`
        .surface { fill: #f7fafc; }
        .heading { fill: #17324a; font: 700 24px sans-serif; }
        .sub { fill: #71869a; font: 14px sans-serif; }
        .label { fill: #29475e; font: 600 15px sans-serif; }
        .small { fill: #72899a; font: 12px sans-serif; }
        .line { fill: none; stroke: #8ba5b5; stroke-width: 1.5; }
        .layer { cursor: pointer; outline: none; transition: filter 0.12s ease; }
        .layer:hover, .layer:focus { filter: brightness(0.9); }
        .layer:focus { stroke: #007f91; stroke-width: 4; }
        .selected { stroke: #008c9b; stroke-width: 5; }
      `}</style>

      <g clipPath={`url(#${clipId})`}>
        <rect
          className="surface"
          x={compact ? '210' : '0'}
          y={compact ? '145' : '0'}
          width={compact ? '380' : '800'}
          height={compact ? '560' : '800'}
          rx={compact ? '36' : '28'}
        />

        {!compact && (
          <>
            <text x="44" y="58" className="heading">DİŞ ANATOMİSİ</text>
            <text x="44" y="82" className="sub">Kesit şeması · Tedavi bölgeleri</text>
          </>
        )}

        <g id="jaw-bone" data-region="jaw-bone" className="layer" role="button" tabIndex={0} aria-label="Alveol çene kemiği">
          <title>{activeTooth ? `Diş #${activeTooth} · Çene Kemiği` : 'Çene Kemiği'}</title>
          <path d="M110 408 Q180 393 245 412 Q400 436 555 412 Q620 393 690 408 L690 688 Q600 700 510 690 Q400 704 290 690 Q200 700 110 688 Z" fill="#e9d8bc" stroke="#c8b18f" strokeWidth="2" />
        </g>
        <g fill="none" stroke="#d1bfa4" strokeWidth="2" opacity=".6" pointerEvents="none">
          <path d="M130 455l37 20 29-17 34 20 M137 525l26-17 32 19 31-16 M140 592l35 16 34-19 M570 478l32-18 32 18 35-20 M570 541l26-16 33 17 37-18 M572 608l27-19 35 19 36-20" />
        </g>
        <g id="root" data-region="root" className="layer" role="button" tabIndex={0} aria-label="Kök">
          <title>{activeTooth ? `Diş #${activeTooth} · Kök` : 'Kök'}</title>
          <path d="M282 379 Q276 450 288 519 Q299 593 316 653 Q325 686 341 680 Q354 676 365 624 L392 510 Q399 493 407 510 L435 624 Q446 676 459 680 Q475 686 484 653 Q501 593 512 519 Q524 450 518 379 Z" fill="#c8b394" stroke="#8d7965" strokeWidth="3" />
        </g>
        <g id="gingiva" data-region="gingiva" className="layer" role="button" tabIndex={0} aria-label="Diş eti">
          <title>{activeTooth ? `Diş #${activeTooth} · Diş Eti` : 'Diş Eti'}</title>
          <path d="M110 390 Q183 380 246 394 Q271 400 287 385 Q319 409 350 405 L450 405 Q481 409 513 385 Q529 400 554 394 Q617 380 690 390 L690 436 Q617 424 555 444 Q526 454 508 428 Q489 442 460 435 L340 435 Q311 442 292 428 Q274 454 245 444 Q183 424 110 436 Z" fill="#eaa8a4" stroke="#c77d7e" strokeWidth="2.5" />
        </g>
        <g id="crown" data-region="crown" className="layer" role="button" tabIndex={0} aria-label="Taç">
          <title>{activeTooth ? `Diş #${activeTooth} · Taç (Kuron)` : 'Taç (Kuron)'}</title>
          <path d="M285 388 C271 354 253 316 253 269 C253 210 281 160 327 158 C359 157 378 180 400 183 C422 180 441 157 473 158 C519 160 547 210 547 269 C547 316 529 354 515 388 Q400 410 285 388 Z" fill="#edf5f5" stroke="#91aab0" strokeWidth="3" />
        </g>
        <g id="enamel" data-region="enamel" className="layer" role="button" tabIndex={0} aria-label="Mine">
          <title>{activeTooth ? `Diş #${activeTooth} · Mine` : 'Mine'}</title>
          <path fillRule="evenodd" d="M285 388 C271 354 253 316 253 269 C253 210 281 160 327 158 C359 157 378 180 400 183 C422 180 441 157 473 158 C519 160 547 210 547 269 C547 316 529 354 515 388 L503 382 C516 347 529 312 529 270 C529 220 508 180 473 178 C444 177 425 201 400 203 C375 201 356 177 327 178 C292 180 271 220 271 270 C271 312 284 347 297 382 Z" fill="#d9edf0" stroke="#91aab0" strokeWidth="2" />
        </g>
        <g id="dentin" data-region="dentin" className="layer" role="button" tabIndex={0} aria-label="Dentin">
          <title>{activeTooth ? `Diş #${activeTooth} · Dentin` : 'Dentin'}</title>
          <path d="M297 382 C284 347 271 312 271 270 C271 220 292 180 327 178 C356 177 375 201 400 203 C425 201 444 177 473 178 C508 180 529 220 529 270 C529 312 516 347 503 382 C500 450 498 512 470 635 Q464 658 457 654 Q448 651 439 612 L412 483 Q400 447 388 483 L361 612 Q352 651 343 654 Q336 658 330 635 C302 512 300 450 297 382 Z" fill="#f4d7a0" stroke="#d3b075" strokeWidth="2.5" />
        </g>
        <g id="pulp" data-region="pulp" className="layer" role="button" tabIndex={0} aria-label="Pulpa">
          <title>{activeTooth ? `Diş #${activeTooth} · Pulpa` : 'Pulpa'}</title>
          <path d="M349 286 Q351 263 364 259 Q371 258 379 278 Q387 293 400 290 Q413 293 421 278 Q429 258 436 259 Q449 263 451 286 Q457 307 449 326 Q440 349 423 362 Q413 370 411 397 L389 397 Q387 370 377 362 Q360 349 351 326 Q343 307 349 286 Z" fill="#dc7f77" stroke="#b45d5b" strokeWidth="2.5" />
        </g>
        <g id="root-canal" data-region="root-canal" className="layer" role="button" tabIndex={0} aria-label="Kök kanalları">
          <title>{activeTooth ? `Diş #${activeTooth} · Kök Kanalı` : 'Kök Kanalı'}</title>
          <path d="M389 389 Q391 437 379 478 Q367 523 345 629 Q343 638 347 639 Q351 640 354 630 Q384 533 400 477 Q416 533 446 630 Q449 640 453 639 Q457 638 455 629 Q433 523 421 478 Q409 437 411 389 Z" fill="#dc7f77" stroke="#b45d5b" strokeWidth="2" />
        </g>
        <g id="apex" data-region="apex" className="layer" role="button" tabIndex={0} aria-label="Kök uçları">
          <title>{activeTooth ? `Diş #${activeTooth} · Kök Ucu` : 'Kök Ucu'}</title>
          <circle cx="343" cy="667" r="11" fill="#a16b61" stroke="#fff" strokeWidth="2" />
          <circle cx="457" cy="667" r="11" fill="#a16b61" stroke="#fff" strokeWidth="2" />
        </g>
        <g id="neck" data-region="neck" className="layer" role="button" tabIndex={0} aria-label="Boyun">
          <title>{activeTooth ? `Diş #${activeTooth} · Boyun (Kole)` : 'Boyun (Kole)'}</title>
          <path d="M283 387 Q400 411 517 387" fill="none" stroke="#6f8f96" strokeWidth="5" strokeDasharray="6 5" />
        </g>
      </g>
    </svg>
  )
}

export interface ToothAnatomy2DProps {
  selected?: number[]
  setSelected?: (teeth: number[]) => void
  selectedTeeth?: number[]
  setSelectedTeeth?: (teeth: number[]) => void
  onSelectSingleTooth?: (tooth: number) => void
  onToothClick?: (tooth: number, event: React.MouseEvent) => void
  onContextMenu?: (tooth: number, event: React.MouseEvent) => void
  drafts?: Record<string, any[]>
  toothDrafts?: Record<string, any[]>
  toothSections?: Record<number, string>
  updateSection?: (tooth: number, section: string | null) => void
  onUpdateSection?: (tooth: number, section: string | null) => void
  toothSurfaces?: Record<number, string[]>
  updateSurfaces?: (tooth: number, surfaces: string[]) => void
  onUpdateSurfaces?: (tooth: number, surfaces: string[]) => void
  add?: (targets: number[], payload: any) => void
  onDropTreatment?: (targets: number[], payload: any) => void
  jaw?: 'all' | 'upper' | 'lower'
  jawFilter?: 'all' | 'upper' | 'lower'
  resolveProcColor?: (item: any) => string
  selectedProcedure?: any
  selectedIndications?: string[]
  selectedMaterials?: any[]
  theme?: 'light' | 'dark'
  value?: ToothRegion | null
  onChange?: (region: ToothRegion) => void
}

export function ToothAnatomy2D(p: ToothAnatomy2DProps & Record<string, any>) {
  const [detectedTheme, setDetectedTheme] = useState<'light' | 'dark'>('light')
  const [fallbackTooth, setFallbackTooth] = useState<number>(16)
  const [localSections, setLocalSections] = useState<Record<number, ToothRegion | null>>({})
  const [dragOverTooth, setDragOverTooth] = useState<number | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const readTheme = () => {
      const attr = document.documentElement.getAttribute('data-theme')
      setDetectedTheme(attr === 'dark' ? 'dark' : 'light')
    }
    readTheme()
    const observer = new MutationObserver(readTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    return () => observer.disconnect()
  }, [])

  const effectiveTheme: 'light' | 'dark' = p.theme || detectedTheme

  const rawSelected: number[] = Array.isArray(p.selected)
    ? p.selected
    : Array.isArray(p.selectedTeeth)
      ? p.selectedTeeth
      : []

  // Enforce single-tooth selection when in 2B Anatomik mode
  const activeTooth: number = rawSelected.length > 0 ? Number(rawSelected[0]) : fallbackTooth

  useEffect(() => {
    if (rawSelected.length > 1) {
      const single = Number(rawSelected[0])
      p.setSelected?.([single])
      p.setSelectedTeeth?.([single])
    } else if (rawSelected.length === 0) {
      p.setSelected?.([fallbackTooth])
      p.setSelectedTeeth?.([fallbackTooth])
    }
  }, [rawSelected.length])

  const selectSingleTooth = (tooth: number) => {
    setFallbackTooth(tooth)
    p.setSelected?.([tooth])
    p.setSelectedTeeth?.([tooth])
    p.onSelectSingleTooth?.(tooth)
  }

  const draftsMap: Record<string, any[]> = p.drafts || p.toothDrafts || {}
  const sectionsMap: Record<number, string> = p.toothSections || {}

  const getRegionForTooth = (toothNum: number): ToothRegion | null => {
    if (toothNum === activeTooth && p.value !== undefined) {
      return p.value
    }
    const raw =
      localSections[toothNum] !== undefined
        ? localSections[toothNum]
        : (sectionsMap[toothNum] as ToothRegion | undefined) || null
    if (raw && raw in TOOTH_REGION_META) return raw as ToothRegion
    if (raw === ('cervical' as any)) return 'neck'
    return null
  }

  const selectedRegion: ToothRegion | null = getRegionForTooth(activeTooth)

  const handleSelectToothAndRegion = (toothNum: number, region: ToothRegion) => {
    selectSingleTooth(toothNum)
    setLocalSections(prev => ({ ...prev, [toothNum]: region }))
    p.onChange?.(region)
    p.updateSection?.(toothNum, region)
    p.onUpdateSection?.(toothNum, region)
  }

  const handleClearRegion = (toothNum: number) => {
    setLocalSections(prev => ({ ...prev, [toothNum]: null }))
    p.updateSection?.(toothNum, null)
    p.onUpdateSection?.(toothNum, null)
  }

  const resolveColor = (item: any): string => {
    if (p.resolveProcColor) return p.resolveProcColor(item)
    return item?.color || '#0284c7'
  }

  const handleDropOnToothBox = (toothNum: number, event: React.DragEvent) => {
    event.preventDefault()
    setDragOverTooth(null)
    const targetEl = event.target instanceof Element ? event.target.closest('[data-region]') : null
    const droppedRegionAttr = targetEl?.getAttribute('data-region') as ToothRegion | null
    const existingRegion = getRegionForTooth(toothNum)
    const effectiveRegion: ToothRegion | null =
      droppedRegionAttr && droppedRegionAttr in TOOTH_REGION_META
        ? droppedRegionAttr
        : existingRegion

    if (effectiveRegion) {
      handleSelectToothAndRegion(toothNum, effectiveRegion)
    } else {
      selectSingleTooth(toothNum)
    }

    try {
      const rawData =
        event.dataTransfer.getData('value') ||
        event.dataTransfer.getData('application/json') ||
        event.dataTransfer.getData('text/plain')
      if (!rawData) return
      const data = JSON.parse(rawData)
      const payload = {
        ...data,
        section: effectiveRegion || data.section || undefined,
      }
      const addFn = p.add || p.onDropTreatment
      if (addFn) {
        // 2B Anatomik modda yalnızca tek diş seçilebilir
        addFn([toothNum], payload)
      }
    } catch {
      toast.error('Tedavi sürükleme verisi geçersiz.')
    }
  }

  const jawMode = p.jaw || p.jawFilter || 'all'
  const toothRows =
    jawMode === 'upper'
      ? [UPPER_TEETH]
      : jawMode === 'lower'
        ? [LOWER_TEETH]
        : [UPPER_TEETH, LOWER_TEETH]

  const activeRegionMeta = selectedRegion ? TOOTH_REGION_META[selectedRegion] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 2B Anatomik Diş Kutuları — Her bir diş kutusunda ToothAnatomy SVG yer alır ve yalnızca tek seçim yapılır */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: 8,
          borderRadius: 10,
          background: 'var(--card-inner, var(--pc-surface))',
          border: '1px solid var(--pc-border, var(--input-border))',
          boxShadow: 'var(--pc-neo-inset)',
        }}
      >
        {toothRows.map((teeth, rowIndex) => (
          <div
            key={rowIndex}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(16, minmax(0, 1fr))',
              gap: 4,
            }}
          >
            {teeth.map(toothNum => {
              const isSelected = activeTooth === toothNum
              const toothItems: any[] = draftsMap[toothNum] || draftsMap[String(toothNum)] || []
              const activeColors = toothItems.map(item => resolveColor(item)).filter(Boolean)
              const toothRegion = getRegionForTooth(toothNum)
              const toothRegionMeta = toothRegion ? TOOTH_REGION_META[toothRegion] : null
              const isDragTarget = dragOverTooth === toothNum

              return (
                <div
                  key={toothNum}
                  role="button"
                  tabIndex={0}
                  aria-label={`${toothNum} numaralı diş anatomik kutusu`}
                  aria-pressed={isSelected}
                  data-selected={isSelected ? 'true' : undefined}
                  data-has-draft={activeColors.length > 0 ? 'true' : undefined}
                  onClick={() => selectSingleTooth(toothNum)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectSingleTooth(toothNum)
                    } else if (
                      p.onContextMenu &&
                      (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
                    ) {
                      event.preventDefault()
                      const rect = event.currentTarget.getBoundingClientRect()
                      p.onContextMenu(toothNum, {
                        preventDefault: () => {},
                        clientX: rect.left,
                        clientY: rect.bottom,
                      } as any)
                    }
                  }}
                  onContextMenu={event => {
                    event.preventDefault()
                    selectSingleTooth(toothNum)
                    p.onContextMenu?.(toothNum, event)
                  }}
                  onDragOver={event => {
                    event.preventDefault()
                    if (dragOverTooth !== toothNum) setDragOverTooth(toothNum)
                  }}
                  onDragLeave={() => {
                    if (dragOverTooth === toothNum) setDragOverTooth(null)
                  }}
                  onDrop={event => handleDropOnToothBox(toothNum, event)}
                  title={`Diş #${toothNum}${toothRegionMeta ? ` · Katman: ${toothRegionMeta.label}` : ''}`}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 3,
                    padding: '11px 3px 4px',
                    borderRadius: 8,
                    background: isSelected
                      ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                      : 'var(--card-bg)',
                    border: isDragTarget
                      ? '2px dashed #0284c7'
                      : isSelected
                        ? '1.5px solid #1d4ed8'
                        : '1px solid var(--pc-border, var(--input-border))',
                    color: isSelected ? '#ffffff' : 'var(--foreground)',
                    boxShadow: isSelected ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                    cursor: 'pointer',
                    minWidth: 0,
                    transition: 'all 0.14s ease',
                  }}
                >
                  {/* Üst kısım: Atanan işlemler için yuvarlak renk noktaları (8px × 8px) */}
                  {activeColors.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: 2,
                        right: 2,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 2,
                        pointerEvents: 'none',
                        zIndex: 3,
                      }}
                    >
                      {activeColors.slice(0, 4).map((color: string, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: color,
                            border: '1.5px solid #ffffff',
                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.35)',
                            flexShrink: 0,
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Diş kutusu içindeki interaktif 2B Anatomik Kesit SVG */}
                  <div
                    style={{
                      width: '100%',
                      borderRadius: 6,
                      overflow: 'hidden',
                      border: isSelected
                        ? '1px solid #93c5fd'
                        : '1px solid var(--pc-border, var(--input-border))',
                    }}
                  >
                    <ToothAnatomy
                      value={toothRegion}
                      onChange={region => handleSelectToothAndRegion(toothNum, region)}
                      theme={effectiveTheme}
                      activeTooth={toothNum}
                      compact={true}
                    />
                  </div>

                  {/* Diş numarası ve seçili anatomik katman etiketi */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      lineHeight: 1.05,
                      gap: 1,
                      width: '100%',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'clamp(9px, 1.1vw, 11px)',
                        fontWeight: 800,
                        color: isSelected ? '#ffffff' : 'var(--foreground)',
                      }}
                    >
                      {toothNum}
                    </span>
                    {toothRegionMeta && (
                      <span
                        style={{
                          fontSize: 8.5,
                          fontWeight: 700,
                          padding: '1px 3px',
                          borderRadius: 4,
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          background: isSelected ? '#ffffff' : 'var(--pc-tint)',
                          color: isSelected ? '#1d4ed8' : 'var(--pc-tint-fg)',
                        }}
                      >
                        {toothRegionMeta.shortLabel}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Alt Kompakt Tekil Katman Seçici Çubuğu (Aktif Dişin Anatomik Katmanı) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          padding: '6px 10px',
          borderRadius: 9,
          background: 'var(--card-bg)',
          border: '1px solid var(--pc-border, var(--input-border))',
          boxShadow: 'var(--pc-neo-subcard)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--foreground)' }}>
            Seçili Diş: #{activeTooth} ({TOOTH_NAMES[activeTooth] || `Diş ${activeTooth}`})
          </span>
          {activeRegionMeta ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--pc-tint)',
                color: 'var(--pc-tint-fg)',
                border: '1px solid var(--pc-blue, #0284c7)',
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: activeRegionMeta.color,
                }}
              />
              <span>Katman: {activeRegionMeta.label}</span>
            </span>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--pc-muted, var(--foreground-2))' }}>
              · Kutudaki diş kesiti üzerinden veya sağdan katman seçin
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {ORDERED_TOOTH_REGIONS.map(region => {
            const isSelected = selectedRegion === region.id
            return (
              <button
                key={region.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleSelectToothAndRegion(activeTooth, region.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 7px',
                  borderRadius: 6,
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: isSelected
                    ? '1px solid #1d4ed8'
                    : '1px solid var(--pc-border, var(--input-border))',
                  background: isSelected
                    ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                    : 'var(--card-inner, var(--pc-surface))',
                  color: isSelected ? '#ffffff' : 'var(--foreground)',
                  boxShadow: isSelected ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: region.color,
                    border: '1px solid #ffffff',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: isSelected ? '#ffffff' : 'var(--foreground)' }}>
                  {region.shortLabel}
                </span>
                {isSelected && <Check size={10} style={{ color: '#ffffff' }} />}
              </button>
            )
          })}
          {activeRegionMeta && (
            <button
              type="button"
              onClick={() => handleClearRegion(activeTooth)}
              title="Katman seçimini kaldır"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '3px 7px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid var(--pc-border, var(--input-border))',
                background: 'var(--card-bg)',
                color: 'var(--pc-muted, var(--foreground-2))',
              }}
            >
              <RotateCcw size={10} />
              <span>Sıfırla</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ToothAnatomy2D
