'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Layers, Sparkles, Check, RotateCcw } from 'lucide-react'
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
    shortLabel: 'Kök Kanalı',
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
    shortLabel: 'Çene Kemiği',
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
}

export function ToothAnatomy({
  value = null,
  onChange,
  theme = 'light',
  className,
  activeTooth,
}: ToothAnatomyProps) {
  const select = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return
    const region = target.closest<SVGGElement>('[data-region]')
    if (region && region.dataset.region) {
      onChange?.(region.dataset.region as ToothRegion)
    }
  }

  const activeMeta = value ? TOOTH_REGION_META[value] : null

  return (
    <svg
      viewBox="0 0 800 800"
      role="group"
      aria-label="Diş anatomisi; bir bölge seçin"
      className={className}
      data-theme={theme}
      data-selected={value ?? ''}
      onClick={event => select(event.target)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select(event.target)
        }
      }}
      style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }}
    >
      <style>{`
        svg[data-theme="dark"] .surface { fill: #0f172a; }
        svg[data-theme="dark"] .heading { fill: #f8fafc; }
        svg[data-theme="dark"] .sub, svg[data-theme="dark"] .small { fill: #94a3b8; }
        svg[data-theme="dark"] .label { fill: #e2e8f0; }
        svg[data-theme="dark"] .line { stroke: #475569; }
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
          filter: drop-shadow(0 0 8px #0284c7) brightness(0.95);
          stroke: #0284c7 !important;
          stroke-width: 4.5px !important;
        }
      `}</style>
      <style>{`
        .surface { fill: #f4f8fe; }
        .heading { fill: #162d52; font: 800 23px Inter, -apple-system, BlinkMacSystemFont, sans-serif; }
        .sub { fill: #526e98; font: 600 13.5px Inter, -apple-system, BlinkMacSystemFont, sans-serif; }
        .label { fill: #1e3a5f; font: 700 14.5px Inter, -apple-system, BlinkMacSystemFont, sans-serif; }
        .small { fill: #526e98; font: 500 12px Inter, -apple-system, BlinkMacSystemFont, sans-serif; }
        .line { fill: none; stroke: #8ba5b5; stroke-width: 1.6; }
        .layer { cursor: pointer; outline: none; transition: filter 0.15s ease; }
        .layer:hover, .layer:focus { filter: brightness(0.92); }
        .layer:focus { stroke: #0284c7; stroke-width: 4; }
        .selected { stroke: #0284c7; stroke-width: 5; }
      `}</style>
      <rect className="surface" width="800" height="800" rx="24" />
      <text x="44" y="56" className="heading">
        {activeTooth ? `DİŞ ANATOMİSİ · #${activeTooth}` : 'DİŞ ANATOMİSİ'}
      </text>
      <text x="44" y="80" className="sub">
        2B Kesit Şeması · Tekil Anatomik Katman Seçimi
      </text>
      {activeMeta && (
        <g pointerEvents="none">
          <rect
            x="520"
            y="32"
            width="236"
            height="48"
            rx="12"
            fill={theme === 'dark' ? '#132b4b' : '#edf5ff'}
            stroke="#0284c7"
            strokeWidth="1.5"
          />
          <circle cx="542" cy="56" r="7" fill={activeMeta.color} />
          <text
            x="558"
            y="52"
            fill={theme === 'dark' ? '#f8fafc' : '#162d52'}
            style={{ font: '700 13px Inter, sans-serif' }}
          >
            Seçili: {activeMeta.label}
          </text>
          <text
            x="558"
            y="68"
            fill={theme === 'dark' ? '#93c5fd' : '#0759da'}
            style={{ font: '600 11px Inter, sans-serif' }}
          >
            {activeMeta.description}
          </text>
        </g>
      )}

      <g
        id="jaw-bone"
        data-region="jaw-bone"
        className="layer"
        role="button"
        tabIndex={0}
        aria-label="Çene Kemiği - Alveol destek kemiği"
        aria-pressed={value === 'jaw-bone'}
      >
        <path
          d="M110 408 Q180 393 245 412 Q400 436 555 412 Q620 393 690 408 L690 688 Q600 700 510 690 Q400 704 290 690 Q200 700 110 688 Z"
          fill="#e9d8bc"
          stroke="#c8b18f"
          strokeWidth="2"
        />
      </g>
      <g fill="none" stroke="#d1bfa4" strokeWidth="2" opacity=".6" pointerEvents="none">
        <path d="M130 455l37 20 29-17 34 20 M137 525l26-17 32 19 31-16 M140 592l35 16 34-19 M570 478l32-18 32 18 35-20 M570 541l26-16 33 17 37-18 M572 608l27-19 35 19 36-20" />
      </g>
      <g
        id="root"
        data-region="root"
        className="layer"
        role="button"
        tabIndex={0}
        aria-label="Kök - Diş kök gövdesi"
        aria-pressed={value === 'root'}
      >
        <path
          d="M282 379 Q276 450 288 519 Q299 593 316 653 Q325 686 341 680 Q354 676 365 624 L392 510 Q399 493 407 510 L435 624 Q446 676 459 680 Q475 686 484 653 Q501 593 512 519 Q524 450 518 379 Z"
          fill="#c8b394"
          stroke="#8d7965"
          strokeWidth="3"
        />
      </g>
      <g
        id="gingiva"
        data-region="gingiva"
        className="layer"
        role="button"
        tabIndex={0}
        aria-label="Diş Eti - Yumuşak diş eti dokusu"
        aria-pressed={value === 'gingiva'}
      >
        <path
          d="M110 390 Q183 380 246 394 Q271 400 287 385 Q319 409 350 405 L450 405 Q481 409 513 385 Q529 400 554 394 Q617 380 690 390 L690 436 Q617 424 555 444 Q526 454 508 428 Q489 442 460 435 L340 435 Q311 442 292 428 Q274 454 245 444 Q183 424 110 436 Z"
          fill="#eaa8a4"
          stroke="#c77d7e"
          strokeWidth="2.5"
        />
      </g>
      <g
        id="crown"
        data-region="crown"
        className="layer"
        role="button"
        tabIndex={0}
        aria-label="Taç (Kuron) - Ağız içi görünür kuron"
        aria-pressed={value === 'crown'}
      >
        <path
          d="M285 388 C271 354 253 316 253 269 C253 210 281 160 327 158 C359 157 378 180 400 183 C422 180 441 157 473 158 C519 160 547 210 547 269 C547 316 529 354 515 388 Q400 410 285 388 Z"
          fill="#edf5f5"
          stroke="#91aab0"
          strokeWidth="3"
        />
      </g>
      <g
        id="enamel"
        data-region="enamel"
        className="layer"
        role="button"
        tabIndex={0}
        aria-label="Mine - Dış koruyucu tabaka"
        aria-pressed={value === 'enamel'}
      >
        <path
          fillRule="evenodd"
          d="M285 388 C271 354 253 316 253 269 C253 210 281 160 327 158 C359 157 378 180 400 183 C422 180 441 157 473 158 C519 160 547 210 547 269 C547 316 529 354 515 388 L503 382 C516 347 529 312 529 270 C529 220 508 180 473 178 C444 177 425 201 400 203 C375 201 356 177 327 178 C292 180 271 220 271 270 C271 312 284 347 297 382 Z"
          fill="#d9edf0"
          stroke="#91aab0"
          strokeWidth="2"
        />
      </g>
      <g
        id="dentin"
        data-region="dentin"
        className="layer"
        role="button"
        tabIndex={0}
        aria-label="Dentin - Orta sert diş dokusu"
        aria-pressed={value === 'dentin'}
      >
        <path
          d="M297 382 C284 347 271 312 271 270 C271 220 292 180 327 178 C356 177 375 201 400 203 C425 201 444 177 473 178 C508 180 529 220 529 270 C529 312 516 347 503 382 C500 450 498 512 470 635 Q464 658 457 654 Q448 651 439 612 L412 483 Q400 447 388 483 L361 612 Q352 651 343 654 Q336 658 330 635 C302 512 300 450 297 382 Z"
          fill="#f4d7a0"
          stroke="#d3b075"
          strokeWidth="2.5"
        />
      </g>
      <g
        id="pulp"
        data-region="pulp"
        className="layer"
        role="button"
        tabIndex={0}
        aria-label="Pulpa - Sinir ve damar odası"
        aria-pressed={value === 'pulp'}
      >
        <path
          d="M349 286 Q351 263 364 259 Q371 258 379 278 Q387 293 400 290 Q413 293 421 278 Q429 258 436 259 Q449 263 451 286 Q457 307 449 326 Q440 349 423 362 Q413 370 411 397 L389 397 Q387 370 377 362 Q360 349 351 326 Q343 307 349 286 Z"
          fill="#dc7f77"
          stroke="#b45d5b"
          strokeWidth="2.5"
        />
      </g>
      <g
        id="root-canal"
        data-region="root-canal"
        className="layer"
        role="button"
        tabIndex={0}
        aria-label="Kök Kanalı - Kök içi kanal sistemi"
        aria-pressed={value === 'root-canal'}
      >
        <path
          d="M389 389 Q391 437 379 478 Q367 523 345 629 Q343 638 347 639 Q351 640 354 630 Q384 533 400 477 Q416 533 446 630 Q449 640 453 639 Q457 638 455 629 Q433 523 421 478 Q409 437 411 389 Z"
          fill="#dc7f77"
          stroke="#b45d5b"
          strokeWidth="2"
        />
      </g>
      <g
        id="apex"
        data-region="apex"
        className="layer"
        role="button"
        tabIndex={0}
        aria-label="Kök Ucu - Apikal foramen bölgesi"
        aria-pressed={value === 'apex'}
      >
        <circle cx="343" cy="667" r="11" fill="#a16b61" stroke="#fff" strokeWidth="2" />
        <circle cx="457" cy="667" r="11" fill="#a16b61" stroke="#fff" strokeWidth="2" />
      </g>
      <g
        id="neck"
        data-region="neck"
        className="layer"
        role="button"
        tabIndex={0}
        aria-label="Boyun (Kole) - Servikal geçiş hattı"
        aria-pressed={value === 'neck'}
      >
        <path
          d="M283 387 Q400 411 517 387"
          fill="none"
          stroke="#6f8f96"
          strokeWidth="5"
          strokeDasharray="6 5"
        />
      </g>

      <g pointerEvents="none">
        <path
          className="line"
          d="M288 224 H217 L202 208 H70 M309 292 H205 L190 277 H70 M350 318 H215 L200 337 H70 M143 412 H70 M462 667 H572 L586 684 H710 M489 488 H566 L581 473 H710 M454 394 H574 L588 370 H710 M520 407 H573 L587 422 H710 M548 249 H575 L590 233 H710"
        />
        <text x="70" y="200" className="label">MİNE</text>
        <text x="70" y="216" className="small">Dış koruyucu tabaka</text>

        <text x="70" y="269" className="label">DENTİN</text>
        <text x="70" y="285" className="small">Orta sert diş dokusu</text>

        <text x="70" y="329" className="label">PULPA</text>
        <text x="70" y="345" className="small">Sinir ve damar odası</text>

        <text x="70" y="403" className="label">DİŞ ETİ</text>
        <text x="70" y="419" className="small">Yumuşak diş eti dokusu</text>

        <text x="710" y="225" textAnchor="end" className="label">TAÇ (KURON)</text>
        <text x="710" y="241" textAnchor="end" className="small">Ağız içi görünür kuron</text>

        <text x="710" y="362" textAnchor="end" className="label">BOYUN (KOLE)</text>
        <text x="710" y="378" textAnchor="end" className="small">Servikal geçiş hattı</text>

        <text x="710" y="414" textAnchor="end" className="label">ÇENE KEMİĞİ</text>
        <text x="710" y="430" textAnchor="end" className="small">Alveol destek kemiği</text>

        <text x="710" y="465" textAnchor="end" className="label">KÖK KANALI</text>
        <text x="710" y="481" textAnchor="end" className="small">Kök içi kanal sistemi</text>

        <text x="710" y="676" textAnchor="end" className="label">KÖK UCU</text>
        <text x="710" y="692" textAnchor="end" className="small">Apikal foramen bölgesi</text>

        <path className="line" d="M520 512 h20 v134 h-20 M540 579 H590" />
        <text x="600" y="580" className="label">KÖK</text>
        <text x="600" y="596" className="small">Diş kök gövdesi</text>
      </g>
      <text x="44" y="757" className="small">
        Şematik gösterim · Katman üzerine tıklayarak veya tedaviyi sürükleyip bırakarak atama yapabilirsiniz
      </text>
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
  const [isDragOver, setIsDragOver] = useState(false)

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

  const rawSectionForTooth =
    p.value !== undefined
      ? p.value
      : (localSections[activeTooth] !== undefined
          ? localSections[activeTooth]
          : (sectionsMap[activeTooth] as ToothRegion | undefined)) || null

  const selectedRegion: ToothRegion | null =
    rawSectionForTooth && rawSectionForTooth in TOOTH_REGION_META
      ? (rawSectionForTooth as ToothRegion)
      : rawSectionForTooth === ('cervical' as any)
        ? 'neck'
        : null

  const handleSelectRegion = (region: ToothRegion) => {
    setLocalSections(prev => ({ ...prev, [activeTooth]: region }))
    selectSingleTooth(activeTooth)
    p.onChange?.(region)
    p.updateSection?.(activeTooth, region)
    p.onUpdateSection?.(activeTooth, region)
  }

  const handleClearRegion = () => {
    setLocalSections(prev => ({ ...prev, [activeTooth]: null }))
    p.updateSection?.(activeTooth, null)
    p.onUpdateSection?.(activeTooth, null)
  }

  const resolveColor = (item: any): string => {
    if (p.resolveProcColor) return p.resolveProcColor(item)
    return item?.color || '#0284c7'
  }

  const handleDropOnAnatomy = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
    const targetEl = event.target instanceof Element ? event.target.closest('[data-region]') : null
    const droppedRegionAttr = targetEl?.getAttribute('data-region') as ToothRegion | null
    const effectiveRegion: ToothRegion | null =
      droppedRegionAttr && droppedRegionAttr in TOOTH_REGION_META
        ? droppedRegionAttr
        : selectedRegion

    if (effectiveRegion) {
      handleSelectRegion(effectiveRegion)
    } else {
      selectSingleTooth(activeTooth)
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
        addFn([activeTooth], payload)
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

  const activeToothDrafts: any[] = draftsMap[activeTooth] || draftsMap[String(activeTooth)] || []
  const activeRegionMeta = selectedRegion ? TOOTH_REGION_META[selectedRegion] : null
  const activeSurfaces: string[] = p.toothSurfaces?.[activeTooth] || []

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 12,
        background: 'var(--card-inner, var(--pc-surface))',
        border: '1px solid var(--pc-border, var(--input-border))',
        boxShadow: 'var(--pc-neo-subcard)',
      }}
    >
      {/* Compact Single-Tooth FDI Selector Strip */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '8px 10px',
          borderRadius: 10,
          background: 'var(--card-bg)',
          border: '1px solid var(--pc-border, var(--input-border))',
          boxShadow: 'var(--pc-neo-inset)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--foreground)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Layers size={13} style={{ color: 'var(--pc-blue, #0284c7)' }} />
            <span>Tekil Diş Seçimi (2B Anatomik Kesit Modu)</span>
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--pc-muted, var(--foreground-2))' }}>
            Aktif Diş: <strong style={{ color: 'var(--pc-tint-fg, #0284c7)' }}>#{activeTooth} · {TOOTH_NAMES[activeTooth] || `Diş ${activeTooth}`}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowX: 'auto' }}>
          {toothRows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(16, minmax(34px, 1fr))',
                gap: 4,
                minWidth: 580,
              }}
            >
              {row.map(toothNum => {
                const isSelected = activeTooth === toothNum
                const toothItems: any[] = draftsMap[toothNum] || draftsMap[String(toothNum)] || []
                const dotColors = toothItems.map(item => resolveColor(item)).filter(Boolean)
                return (
                  <button
                    key={toothNum}
                    type="button"
                    aria-label={`${toothNum} numaralı diş`}
                    aria-pressed={isSelected}
                    data-selected={isSelected ? 'true' : undefined}
                    onClick={() => selectSingleTooth(toothNum)}
                    onContextMenu={event => {
                      event.preventDefault()
                      selectSingleTooth(toothNum)
                      p.onContextMenu?.(toothNum, event)
                    }}
                    style={{
                      position: 'relative',
                      height: 36,
                      padding: '10px 2px 3px',
                      borderRadius: 7,
                      border: isSelected
                        ? '1.5px solid #1d4ed8'
                        : '1px solid var(--pc-border, var(--input-border))',
                      background: isSelected
                        ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                        : 'var(--card-bg)',
                      color: isSelected ? '#ffffff' : 'var(--foreground)',
                      boxShadow: isSelected ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    {dotColors.length > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 2,
                          left: 2,
                          right: 2,
                          display: 'flex',
                          justifyContent: 'center',
                          gap: 2,
                          pointerEvents: 'none',
                        }}
                      >
                        {dotColors.slice(0, 3).map((color, idx) => (
                          <span
                            key={idx}
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: color,
                              border: '1px solid #ffffff',
                            }}
                          />
                        ))}
                      </span>
                    )}
                    <span style={{ color: isSelected ? '#ffffff' : 'var(--foreground)' }}>{toothNum}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Main 2D Anatomy Cross-Section + Clinical Inspector Side Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 440px) minmax(260px, 1fr)',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        {/* Left: Interactive 2D Tooth Anatomy Cross-Section SVG */}
        <div
          onDragOver={event => {
            event.preventDefault()
            if (!isDragOver) setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDropOnAnatomy}
          onContextMenu={event => {
            event.preventDefault()
            p.onContextMenu?.(activeTooth, event)
          }}
          style={{
            borderRadius: 14,
            border: isDragOver
              ? '2px dashed var(--pc-blue, #0284c7)'
              : '1.5px solid var(--pc-border, var(--input-border))',
            background: 'var(--card-bg)',
            boxShadow: 'var(--pc-neo-card)',
            padding: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            maxHeight: 430,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: '100%', maxWidth: 400 }}>
            <ToothAnatomy
              value={selectedRegion}
              onChange={handleSelectRegion}
              theme={effectiveTheme}
              activeTooth={activeTooth}
            />
          </div>
        </div>

        {/* Right: Single-Selection Anatomical Layer Controls & Drop Target */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 14,
            background: 'var(--card-bg)',
            border: '1px solid var(--pc-border, var(--input-border))',
            boxShadow: 'var(--pc-neo-card)',
            justifyContent: 'space-between',
          }}
        >
          {/* Active Tooth & Selected Layer Header */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                paddingBottom: 8,
                borderBottom: '1px solid var(--pc-border, var(--input-border))',
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>
                  Diş #{activeTooth}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--pc-muted, var(--foreground-2))' }}>
                  {TOOTH_NAMES[activeTooth] || `Diş ${activeTooth}`}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {activeSurfaces.length > 0 && (
                  <span
                    style={{
                      padding: '4px 9px',
                      borderRadius: 999,
                      background: 'var(--pc-tint)',
                      color: 'var(--pc-tint-fg)',
                      border: '1px solid var(--pc-border)',
                      fontSize: 11.5,
                      fontWeight: 700,
                      boxShadow: 'var(--pc-clay-pale)',
                    }}
                  >
                    Yüzey: {activeSurfaces.join('')}
                  </span>
                )}
                {activeRegionMeta ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'var(--pc-tint)',
                      color: 'var(--pc-tint-fg)',
                      border: '1.5px solid var(--pc-blue, #0284c7)',
                      fontSize: 11.5,
                      fontWeight: 800,
                      boxShadow: 'var(--pc-clay-pale)',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: activeRegionMeta.color,
                      }}
                    />
                    <span>Katman: {activeRegionMeta.label}</span>
                  </span>
                ) : (
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'var(--input-bg)',
                      color: 'var(--pc-muted, var(--foreground-2))',
                      border: '1px solid var(--pc-border, var(--input-border))',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Katman seçilmedi
                  </span>
                )}
                {activeRegionMeta && (
                  <button
                    type="button"
                    onClick={handleClearRegion}
                    title="Katman seçimini kaldır"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 8,
                      border: '1px solid var(--pc-border, var(--input-border))',
                      background: 'var(--card-bg)',
                      color: 'var(--pc-muted, var(--foreground-2))',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: 'var(--pc-clay-btn)',
                    }}
                  >
                    <RotateCcw size={11} />
                    <span>Sıfırla</span>
                  </button>
                )}
              </div>
            </div>

            {/* Single-Choice Anatomical Layer Buttons */}
            <div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--pc-muted, var(--foreground-2))',
                  marginBottom: 6,
                }}
              >
                Anatomik Katmanlar (Yalnızca Tek Bölge Seçilebilir)
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 6,
                }}
              >
                {ORDERED_TOOTH_REGIONS.map(region => {
                  const isSelected = selectedRegion === region.id
                  return (
                    <button
                      key={region.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelectRegion(region.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '7px 10px',
                        borderRadius: 9,
                        border: isSelected
                          ? '1.5px solid #1d4ed8'
                          : '1px solid var(--pc-border, var(--input-border))',
                        background: isSelected
                          ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                          : 'var(--card-inner, var(--pc-surface))',
                        color: isSelected ? '#ffffff' : 'var(--foreground)',
                        boxShadow: isSelected ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: region.color,
                            border: '1.5px solid #ffffff',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 12,
                              fontWeight: 750,
                              color: isSelected ? '#ffffff' : 'var(--foreground)',
                              lineHeight: 1.2,
                            }}
                          >
                            {region.label}
                          </span>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 10,
                              fontWeight: 500,
                              color: isSelected ? '#ffffff' : 'var(--pc-muted, var(--foreground-2))',
                              opacity: isSelected ? 0.9 : 1,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {region.description}
                          </span>
                        </span>
                      </span>
                      {isSelected && <Check size={14} style={{ color: '#ffffff', flexShrink: 0 }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Drag-and-Drop Treatment Target & Assigned Treatments Summary */}
          <div
            onDragOver={event => {
              event.preventDefault()
              if (!isDragOver) setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDropOnAnatomy}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: isDragOver
                ? '2px dashed var(--pc-blue, #0284c7)'
                : '1.5px dashed var(--pc-border, var(--input-border))',
              background: isDragOver ? 'var(--pc-tint)' : 'var(--input-bg)',
              boxShadow: 'var(--pc-neo-inset)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--pc-tint-fg, #0284c7)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Sparkles size={13} />
                <span>
                  Diş #{activeTooth}
                  {activeRegionMeta ? ` (${activeRegionMeta.label})` : ''} Tedavi Atama Alanı
                </span>
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--pc-muted)' }}>
                Tedaviyi buraya veya kesit şemasına sürükleyin
              </span>
            </div>

            {activeToothDrafts.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {activeToothDrafts.map((item: any, idx: number) => {
                  const secLabel = formatToothRegionLabel(item.section || sectionsMap[activeTooth])
                  const surfLabel = item.surface || (activeSurfaces.length ? activeSurfaces.join('') : '')
                  return (
                    <span
                      key={item.id || `${item.name}-${idx}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 8px',
                        borderRadius: 7,
                        background: 'var(--card-bg)',
                        border: '1px solid var(--pc-border)',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--foreground)',
                        boxShadow: 'var(--pc-clay-btn)',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: resolveColor(item),
                          flexShrink: 0,
                        }}
                      />
                      <span>{item.name}</span>
                      {(surfLabel || secLabel) && (
                        <span
                          style={{
                            padding: '1px 5px',
                            borderRadius: 5,
                            background: 'var(--pc-tint)',
                            color: 'var(--pc-tint-fg)',
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {[surfLabel, secLabel].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--pc-muted)' }}>
                Bu dişte henüz atanmış işlem bulunmuyor. Katman seçip aşağıdan tedavi ekleyebilir veya sürükleyip bırakabilirsiniz.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ToothAnatomy2D
