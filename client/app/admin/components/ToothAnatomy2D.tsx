'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Check, CheckSquare, Crosshair, Maximize2, Minimize2, Plus, RotateCcw, ZoomIn } from 'lucide-react'
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
  clinicalHint: string
  color: string
  group: 'root-endodontic' | 'crown-hard' | 'periodontal'
}

export const TOOTH_REGION_META: Record<ToothRegion, ToothRegionMeta> = {
  enamel: {
    id: 'enamel',
    label: 'Mine',
    shortLabel: 'Mine',
    description: 'Dış koruyucu tabaka',
    clinicalHint: 'Kuron dış mine dokusu · Yüzeyel çürük / restorasyon',
    color: '#38bdf8',
    group: 'crown-hard',
  },
  dentin: {
    id: 'dentin',
    label: 'Dentin',
    shortLabel: 'Dentin',
    description: 'Orta sert diş dokusu',
    clinicalHint: 'Mine altı orta sert doku · Derin dentin kavitesi',
    color: '#f59e0b',
    group: 'crown-hard',
  },
  pulp: {
    id: 'pulp',
    label: 'Pulpa',
    shortLabel: 'Pulpa',
    description: 'Sinir ve damar odası',
    clinicalHint: 'Kuron pulpa odası · Kuafaj / amputasyon / ekstirpasyon',
    color: '#e11d48',
    group: 'crown-hard',
  },
  'root-canal': {
    id: 'root-canal',
    label: 'Kök Kanalı',
    shortLabel: 'Kanal',
    description: 'Kök içi kanal sistemi',
    clinicalHint: 'Tek / Mezial / Distal / Palatinal kök kanalı · Endodonti',
    color: '#8b5cf6',
    group: 'root-endodontic',
  },
  crown: {
    id: 'crown',
    label: 'Taç (Kuron)',
    shortLabel: 'Taç',
    description: 'Ağız içi görünür kuron',
    clinicalHint: 'Klinik kuron bütünü · Kaplama / kuron restorasyonu',
    color: '#0284c7',
    group: 'crown-hard',
  },
  neck: {
    id: 'neck',
    label: 'Boyun (Kole)',
    shortLabel: 'Boyun',
    description: 'Servikal geçiş hattı',
    clinicalHint: 'Mine-sement sınırı (kole) · Servikal abrazyon / hassasiyet',
    color: '#06b6d4',
    group: 'crown-hard',
  },
  root: {
    id: 'root',
    label: 'Kök',
    shortLabel: 'Kök',
    description: 'Diş kök gövdesi',
    clinicalHint: 'Kök gövdesi, sement ve furkasyon bölgesi',
    color: '#a16207',
    group: 'root-endodontic',
  },
  apex: {
    id: 'apex',
    label: 'Kök Ucu',
    shortLabel: 'Kök Ucu',
    description: 'Apikal foramen bölgesi',
    clinicalHint: 'Apikal bölge · Periapikal lezyon / apikal rezeksiyon',
    color: '#be123c',
    group: 'root-endodontic',
  },
  gingiva: {
    id: 'gingiva',
    label: 'Diş Eti',
    shortLabel: 'Diş Eti',
    description: 'Yumuşak diş eti dokusu',
    clinicalHint: 'Marjinal ve yapışık diş eti · Küretaj / gingivektomi',
    color: '#ec4899',
    group: 'periodontal',
  },
  'jaw-bone': {
    id: 'jaw-bone',
    label: 'Çene Kemiği',
    shortLabel: 'Kemik',
    description: 'Alveol destek kemiği',
    clinicalHint: 'Alveoler kemik dokusu · Kemik grefti / cerrahi',
    color: '#d97706',
    group: 'periodontal',
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

export const ROOT_ENDODONTIC_REGIONS: ToothRegionMeta[] = [
  TOOTH_REGION_META.root,
  TOOTH_REGION_META['root-canal'],
  TOOTH_REGION_META.apex,
]

export const ALL_TOOTH_REGION_IDS: ToothRegion[] = ORDERED_TOOTH_REGIONS.map(r => r.id)

export interface ToothRootMorphology {
  kind: 'single' | 'two-root' | 'three-root'
  rootCount: 1 | 2 | 3
  morphologyLabel: string
  canalSummary: string
  apexSummary: string
  rootSummary: string
}

/**
 * FDI diş numarasına göre anatomik kök/kanal/apikal morfolojisini döndürür.
 * - Tek köklü: Kesiciler (1,2), Kaninler (3) ve tek köklü Küçük Azılar (15,25,34,35,44,45)
 * - İki köklü (Bifurkasyon): Üst 1. Küçük Azılar (14,24) ve Alt Büyük Azılar (36,37,38,46,47,48)
 * - Üç köklü (Trifurkasyon): Üst Büyük Azılar (16,17,18,26,27,28)
 */
export function getToothRootMorphology(toothNum?: number): ToothRootMorphology {
  if (!toothNum || !Number.isFinite(toothNum)) {
    return {
      kind: 'two-root',
      rootCount: 2,
      morphologyLabel: 'İki Köklü (Bifurkasyon)',
      rootSummary: 'Mezial ve Distal kök gövdeleri',
      canalSummary: 'Mezial ve Distal kök kanalları',
      apexSummary: '2 Apikal Foramen (Mezial & Distal Kök Ucu)',
    }
  }
  const quadrant = Math.floor(toothNum / 10)
  const unit = toothNum % 10

  // Üst molarlar (16-18, 26-28): 3 kök (MB, DB, Palatinal)
  if ((quadrant === 1 || quadrant === 2) && unit >= 6 && unit <= 8) {
    return {
      kind: 'three-root',
      rootCount: 3,
      morphologyLabel: 'Üç Köklü (Trifurkasyon)',
      rootSummary: 'Meziobukkal, Distobukkal ve Palatinal 3 kök gövdesi',
      canalSummary: 'MB, DB ve Palatinal kök kanalları',
      apexSummary: '3 Apikal Foramen (MB, DB ve Palatinal Kök Ucu)',
    }
  }

  // Üst 1. premolar (14, 24): Bukkal ve Palatinal 2 kök
  if ((quadrant === 1 || quadrant === 2) && unit === 4) {
    return {
      kind: 'two-root',
      rootCount: 2,
      morphologyLabel: 'İki Köklü (Bukkal & Palatinal)',
      rootSummary: 'Bukkal ve Palatinal çatallı kök gövdeleri',
      canalSummary: 'Bukkal ve Palatinal 2 kök kanalı',
      apexSummary: '2 Apikal Foramen (Bukkal & Palatinal Kök Ucu)',
    }
  }

  // Alt molarlar (36-38, 46-48): Mezial ve Distal 2 kök
  if ((quadrant === 3 || quadrant === 4) && unit >= 6 && unit <= 8) {
    return {
      kind: 'two-root',
      rootCount: 2,
      morphologyLabel: 'İki Köklü (Bifurkasyon)',
      rootSummary: 'Mezial ve Distal kök gövdeleri (Furkasyonlu)',
      canalSummary: 'Mezial ve Distal kök kanalları',
      apexSummary: '2 Apikal Foramen (Mezial & Distal Kök Ucu)',
    }
  }

  // Kesiciler, kaninler ve diğer premolarlar: Tek kök
  return {
    kind: 'single',
    rootCount: 1,
    morphologyLabel: 'Tek Köklü (Konik Kök)',
    rootSummary: 'Tek ana kök gövdesi ve sement yüzeyi',
    canalSummary: 'Tek merkez kök kanalı (Ana pulpa kanalı)',
    apexSummary: 'Tek Apikal Foramen ve Periapikal Bölge',
  }
}

export function normalizeSingleToothRegion(raw?: string | null): ToothRegion | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed === 'cervical') return 'neck'
  if (trimmed === 'canal') return 'root-canal'
  if (trimmed === 'apical') return 'apex'
  if (trimmed in TOOTH_REGION_META) return trimmed as ToothRegion
  return null
}

/**
 * Tekil veya virgülle ayrılmış çoklu katman dizgesini ('enamel,pulp,root-canal')
 * standart sıralı ToothRegion[] dizisine dönüştürür.
 */
export function parseToothRegions(raw?: string | string[] | null): ToothRegion[] {
  if (!raw) return []
  const tokens = Array.isArray(raw)
    ? raw.flatMap(item => String(item || '').split(/[,|;]+/))
    : String(raw).split(/[,|;]+/)
  const set = new Set<ToothRegion>()
  for (const tok of tokens) {
    const norm = normalizeSingleToothRegion(tok)
    if (norm) set.add(norm)
  }
  return ALL_TOOTH_REGION_IDS.filter(id => set.has(id))
}

/**
 * Seçili ToothRegion[] dizisini virgülle ayrılmış standart dizgeye ('enamel,dentin') dönüştürür.
 */
export function serializeToothRegions(regions: ToothRegion[]): string | null {
  const set = new Set<ToothRegion>(regions)
  const ordered = ALL_TOOTH_REGION_IDS.filter(id => set.has(id))
  return ordered.length > 0 ? ordered.join(',') : null
}

export function formatToothRegionLabel(region?: string | string[] | null): string {
  if (!region) return ''
  const parsed = parseToothRegions(region)
  if (parsed.length > 0) {
    return parsed.map(r => TOOTH_REGION_META[r].label).join(', ')
  }
  if (typeof region === 'string') {
    if (region === 'cervical') return 'Boyun (Kole)'
    if (region === 'canal') return 'Kök Kanalı'
    if (region === 'apical') return 'Kök Ucu'
    return region
  }
  return ''
}

export function formatToothRegionShortLabel(region?: string | string[] | null): string {
  const parsed = parseToothRegions(region)
  if (parsed.length === 0) return ''
  if (parsed.length === ALL_TOOTH_REGION_IDS.length) return `Tümü (${parsed.length})`
  if (parsed.length <= 2) {
    return parsed.map(r => TOOTH_REGION_META[r].shortLabel).join(', ')
  }
  return `${TOOTH_REGION_META[parsed[0]].shortLabel} +${parsed.length - 1}`
}

export interface ToothAnatomyProps {
  value?: ToothRegion | string | null
  selectedRegions?: ToothRegion[]
  onChange?: (region: ToothRegion) => void
  theme?: 'light' | 'dark'
  className?: string
  activeTooth?: number
  /** Her bir diş kutusunun (ToothBox) içinde kompakt kesit olarak gösterim */
  compact?: boolean
  /** Büyüteç görünümünde tam kesit veya kök/apikal odak modu */
  zoomMode?: 'full' | 'root-focus'
  hoveredRegion?: ToothRegion | null
  onHoverRegion?: (region: ToothRegion | null) => void
}

export function ToothAnatomy({
  value = null,
  selectedRegions,
  onChange,
  theme = 'light',
  className,
  activeTooth,
  compact = true,
  zoomMode = 'full',
  hoveredRegion = null,
  onHoverRegion,
}: ToothAnatomyProps) {
  const activeList: ToothRegion[] =
    Array.isArray(selectedRegions) ? selectedRegions : parseToothRegions(value)
  const activeSet = new Set<ToothRegion>(activeList)
  const primarySelected = activeList[0] ?? ''
  const morphology = getToothRootMorphology(activeTooth)

  const select = (target: EventTarget | null, event?: React.SyntheticEvent) => {
    if (!(target instanceof Element)) return
    const region = target.closest<SVGGElement>('[data-region]')
    if (region && region.dataset.region) {
      event?.stopPropagation()
      onChange?.(region.dataset.region as ToothRegion)
    }
  }

  const handlePointerOver = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!onHoverRegion) return
    const target = event.target instanceof Element ? event.target.closest<SVGGElement>('[data-region]') : null
    const reg = (target?.dataset.region as ToothRegion | undefined) ?? null
    onHoverRegion(reg)
  }

  const clipId = `tooth-box-clip-${activeTooth ?? 'default'}-${compact ? 'c' : zoomMode}`

  const resolvedViewBox = compact
    ? '215 140 370 580'
    : zoomMode === 'root-focus'
      ? '155 345 490 385'
      : '0 0 800 760'

  const clipRect = compact
    ? { x: 215, y: 140, width: 370, height: 580, rx: 26 }
    : zoomMode === 'root-focus'
      ? { x: 155, y: 345, width: 490, height: 385, rx: 22 }
      : { x: 0, y: 0, width: 800, height: 760, rx: 24 }

  const isRegionHighlighted = (region: ToothRegion) =>
    activeSet.has(region) || hoveredRegion === region

  const apexPoints: Array<{ cx: number; cy: number; label: string }> =
    morphology.kind === 'single'
      ? [{ cx: 400, cy: 668, label: 'Apikal Foramen' }]
      : morphology.kind === 'three-root'
        ? [
            { cx: 326, cy: 664, label: 'MB Kök Ucu' },
            { cx: 400, cy: 676, label: 'P Kök Ucu' },
            { cx: 474, cy: 664, label: 'DB Kök Ucu' },
          ]
        : [
            { cx: 343, cy: 668, label: 'Mezial Kök Ucu' },
            { cx: 457, cy: 668, label: 'Distal Kök Ucu' },
          ]

  return (
    <svg
      viewBox={resolvedViewBox}
      role="group"
      aria-label={activeTooth ? `Diş ${activeTooth} anatomisi; alt katman seçin` : 'Diş anatomisi; alt katman seçin'}
      className={className}
      data-theme={theme}
      data-selected={primarySelected}
      data-selected-all={activeList.join(',')}
      data-morphology={morphology.kind}
      onClick={event => select(event.target, event)}
      onPointerOver={handlePointerOver}
      onPointerLeave={() => onHoverRegion?.(null)}
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
            x={clipRect.x}
            y={clipRect.y}
            width={clipRect.width}
            height={clipRect.height}
            rx={clipRect.rx}
          />
        </clipPath>
      </defs>
      <style>{`
        svg[data-theme="dark"] .surface { fill: #0f172a; }
        svg[data-theme="dark"] .heading { fill: #e2e8f0; }
        svg[data-theme="dark"] .sub, svg[data-theme="dark"] .small { fill: #94a3b8; }
        svg[data-theme="dark"] .label { fill: #e2e8f0; }
        svg[data-theme="dark"] .callout-box { fill: #1e293b; stroke: #334155; }
        svg [data-region][data-active="true"],
        svg [data-region][data-hovered="true"],
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
        }
        svg [data-region][data-active="true"] .region-visual {
          stroke: #0284c7 !important;
          stroke-width: 4.5px !important;
        }
      `}</style>
      <style>{`
        .surface { fill: #f8fafc; }
        .heading { fill: #0f172a; font: 800 22px sans-serif; }
        .sub { fill: #475569; font: 600 13px sans-serif; }
        .label { fill: #0f172a; font: 700 13px sans-serif; }
        .small { fill: #64748b; font: 600 11px sans-serif; }
        .callout-box { fill: #ffffff; stroke: #cbd5e1; stroke-width: 1.5; }
        .callout-active { fill: #2563eb !important; stroke: #1d4ed8 !important; }
        .callout-active-text { fill: #ffffff !important; }
        .layer { cursor: pointer; outline: none; transition: filter 0.12s ease; }
        .layer:hover, .layer:focus { filter: brightness(0.93) drop-shadow(0 0 6px #0284c7); }
        .layer:focus { stroke: #0284c7; stroke-width: 3.5; }
      `}</style>

      <g clipPath={`url(#${clipId})`}>
        <rect
          className="surface"
          x={clipRect.x}
          y={clipRect.y}
          width={clipRect.width}
          height={clipRect.height}
          rx={clipRect.rx}
        />

        {!compact && zoomMode === 'full' && (
          <>
            <text x="32" y="42" className="heading">
              {activeTooth ? `DİŞ #${activeTooth} ANATOMİK KESİT` : 'DİŞ ANATOMİSİ'}
            </text>
            <text x="32" y="62" className="sub">
              {morphology.morphologyLabel} · Katmana veya etikete tıklayarak seçin
            </text>
          </>
        )}

        {!compact && zoomMode === 'root-focus' && (
          <>
            <text x="172" y="370" className="sub" style={{ fontWeight: 800 }}>
              🔍 KÖK, KANAL VE KÖK UCU (APİKAL) YAKINLAŞTIRILMIŞ KESİT
            </text>
          </>
        )}

        {/* 1. Alveol Çene Kemiği (jaw-bone) */}
        <g
          id="jaw-bone"
          data-region="jaw-bone"
          data-active={activeSet.has('jaw-bone') ? 'true' : undefined}
          data-hovered={hoveredRegion === 'jaw-bone' ? 'true' : undefined}
          aria-pressed={activeSet.has('jaw-bone')}
          className="layer"
          role="button"
          tabIndex={0}
          aria-label="Alveol çene kemiği"
        >
          <title>{activeTooth ? `Diş #${activeTooth} · Çene Kemiği (Alveol Destek Kemiği)` : 'Çene Kemiği'}</title>
          <path
            className="region-visual"
            d="M110 412 Q180 398 245 415 Q400 438 555 415 Q620 398 690 412 L690 704 Q600 714 510 706 Q400 716 290 706 Q200 714 110 704 Z"
            fill={activeSet.has('jaw-bone') ? '#f59e0b' : '#ead9be'}
            stroke={activeSet.has('jaw-bone') ? '#0284c7' : '#c6ae8b'}
            strokeWidth="2.2"
          />
        </g>

        {/* Kemik trabekül dokusu süslemesi */}
        <g fill="none" stroke="#cfbda0" strokeWidth="2" opacity=".65" pointerEvents="none">
          <path d="M130 462l35 18 28-15 32 18 M136 532l25-15 30 17 29-14 M140 598l33 14 32-17 M575 480l30-16 30 16 33-18 M575 545l25-14 31 15 35-16 M576 610l26-17 33 17 34-18" />
        </g>

        {/* 2. Diş Eti (gingiva) */}
        <g
          id="gingiva"
          data-region="gingiva"
          data-active={activeSet.has('gingiva') ? 'true' : undefined}
          data-hovered={hoveredRegion === 'gingiva' ? 'true' : undefined}
          aria-pressed={activeSet.has('gingiva')}
          className="layer"
          role="button"
          tabIndex={0}
          aria-label="Diş eti"
        >
          <title>{activeTooth ? `Diş #${activeTooth} · Diş Eti (Gingiva)` : 'Diş Eti'}</title>
          <path
            className="region-visual"
            d="M110 388 Q183 378 246 392 Q271 398 287 385 Q319 407 350 404 L450 404 Q481 407 513 385 Q529 398 554 392 Q617 378 690 388 L690 434 Q617 422 555 440 Q526 448 508 426 Q489 438 460 432 L340 432 Q311 438 292 426 Q274 448 245 440 Q183 422 110 434 Z"
            fill={activeSet.has('gingiva') ? '#f472b6' : '#eba7a3'}
            stroke={activeSet.has('gingiva') ? '#0284c7' : '#c67879'}
            strokeWidth="2.5"
          />
        </g>

        {/* 3. Kök Gövdesi (root) — Dentin katmanının altında ezilmez, tüm kök gövdesi doğrudan tıklanabilir */}
        <g
          id="root"
          data-region="root"
          data-active={activeSet.has('root') ? 'true' : undefined}
          data-hovered={hoveredRegion === 'root' ? 'true' : undefined}
          aria-pressed={activeSet.has('root')}
          className="layer"
          role="button"
          tabIndex={0}
          aria-label="Kök"
        >
          <title>{activeTooth ? `Diş #${activeTooth} · Kök Gövdesi (${morphology.rootSummary})` : 'Kök Gövdesi'}</title>
          {morphology.kind === 'single' ? (
            <>
              {/* Geniş görünmez tıklama alanı */}
              <path
                d="M298 386 C304 468 322 566 356 650 Q400 684 444 650 C478 566 496 468 502 386 Z"
                fill="transparent"
                stroke="transparent"
                strokeWidth="26"
                pointerEvents="all"
              />
              {/* Tek Kök Sement & Kök Dentini Gövdesi */}
              <path
                className="region-visual"
                d="M298 386 C304 468 322 566 356 650 Q400 684 444 650 C478 566 496 468 502 386 Q400 404 298 386 Z"
                fill={isRegionHighlighted('root') ? '#d97706' : '#cfb893'}
                stroke={isRegionHighlighted('root') ? '#0284c7' : '#856d52'}
                strokeWidth="3.5"
              />
              {/* İç Kök Dentin Dokusu Konturu */}
              <path
                d="M316 396 C322 468 338 556 368 634 Q400 660 432 634 C462 556 478 468 484 396 Q400 410 316 396 Z"
                fill={isRegionHighlighted('root') ? '#f59e0b' : '#e6cfa3'}
                stroke="#a68b67"
                strokeWidth="1.5"
                pointerEvents="none"
              />
            </>
          ) : morphology.kind === 'three-root' ? (
            <>
              {/* Geniş görünmez tıklama alanı */}
              <path
                d="M276 384 Q266 456 280 530 Q294 598 310 650 Q324 676 340 666 L368 525 L382 656 Q400 682 418 656 L432 525 L460 666 Q476 676 490 650 Q506 598 520 530 Q534 456 524 384 Z"
                fill="transparent"
                stroke="transparent"
                strokeWidth="24"
                pointerEvents="all"
              />
              {/* Merkez Palatinal Kök */}
              <path
                className="region-visual"
                d="M362 406 L378 652 Q400 684 422 652 L438 406 Z"
                fill={isRegionHighlighted('root') ? '#b45309' : '#bfa580'}
                stroke={isRegionHighlighted('root') ? '#0284c7' : '#786147'}
                strokeWidth="3"
              />
              {/* Meziobukkal ve Distobukkal Kökler */}
              <path
                className="region-visual"
                d="M278 384 Q268 456 282 530 Q294 598 310 650 Q322 676 338 666 Q352 658 362 602 L380 492 Q400 472 420 492 L438 602 Q448 658 462 666 Q478 676 490 650 Q506 598 518 530 Q532 456 522 384 Q400 404 278 384 Z"
                fill={isRegionHighlighted('root') ? '#d97706' : '#cfb893'}
                stroke={isRegionHighlighted('root') ? '#0284c7' : '#856d52'}
                strokeWidth="3.2"
              />
              {/* İç Kök Dentin Konturu */}
              <path
                d="M294 394 Q286 456 298 524 Q308 584 322 634 Q330 650 340 644 L368 484 Q400 452 432 484 L460 644 Q470 650 478 634 Q492 584 502 524 Q514 456 506 394 Z"
                fill={isRegionHighlighted('root') ? '#f59e0b' : '#e6cfa3'}
                stroke="#a68b67"
                strokeWidth="1.4"
                pointerEvents="none"
              />
            </>
          ) : (
            <>
              {/* Geniş görünmez tıklama alanı */}
              <path
                d="M282 384 Q276 452 288 522 Q299 595 316 654 Q326 684 344 678 Q358 672 368 620 L392 504 Q400 484 408 504 L432 620 Q442 672 456 678 Q474 684 484 654 Q501 595 512 522 Q524 452 518 384 Z"
                fill="transparent"
                stroke="transparent"
                strokeWidth="26"
                pointerEvents="all"
              />
              {/* İki Köklü (Mezial & Distal) Kök Gövdesi */}
              <path
                className="region-visual"
                d="M282 384 Q276 452 288 522 Q299 595 316 654 Q326 684 344 678 Q358 672 368 620 L392 504 Q400 484 408 504 L432 620 Q442 672 456 678 Q474 684 484 654 Q501 595 512 522 Q524 452 518 384 Q400 404 282 384 Z"
                fill={isRegionHighlighted('root') ? '#d97706' : '#cfb893'}
                stroke={isRegionHighlighted('root') ? '#0284c7' : '#856d52'}
                strokeWidth="3.5"
              />
              {/* İç Kök Dentin Konturu & Furkasyon Kemeri */}
              <path
                d="M298 394 Q294 452 304 518 Q314 584 328 638 Q336 656 346 650 Q354 644 362 604 L388 480 Q400 448 412 480 L438 604 Q446 644 454 650 Q464 656 472 638 Q486 584 496 518 Q506 452 502 394 Q400 410 298 394 Z"
                fill={isRegionHighlighted('root') ? '#f59e0b' : '#e6cfa3'}
                stroke="#a68b67"
                strokeWidth="1.5"
                pointerEvents="none"
              />
            </>
          )}
        </g>

        {/* 4. Mine (enamel) */}
        <g
          id="enamel"
          data-region="enamel"
          data-active={activeSet.has('enamel') ? 'true' : undefined}
          data-hovered={hoveredRegion === 'enamel' ? 'true' : undefined}
          aria-pressed={activeSet.has('enamel')}
          className="layer"
          role="button"
          tabIndex={0}
          aria-label="Mine"
        >
          <title>{activeTooth ? `Diş #${activeTooth} · Mine (Dış Koruyucu Tabaka)` : 'Mine'}</title>
          <path
            className="region-visual"
            fillRule="evenodd"
            d="M285 388 C271 354 253 316 253 269 C253 210 281 160 327 158 C359 157 378 180 400 183 C422 180 441 157 473 158 C519 160 547 210 547 269 C547 316 529 354 515 388 L501 384 C515 348 528 312 528 270 C528 220 507 180 473 178 C444 177 425 201 400 203 C375 201 356 177 327 178 C293 180 272 220 272 270 C272 312 285 348 299 384 Z"
            fill={isRegionHighlighted('enamel') ? '#7dd3fc' : '#d9edf0'}
            stroke={isRegionHighlighted('enamel') ? '#0284c7' : '#8ea8ae'}
            strokeWidth="2.2"
          />
        </g>

        {/* 5. Dentin (dentin) — Yalnızca kuron/kole bölgesinde yer alır, kök gövdesini kapatmaz */}
        <g
          id="dentin"
          data-region="dentin"
          data-active={activeSet.has('dentin') ? 'true' : undefined}
          data-hovered={hoveredRegion === 'dentin' ? 'true' : undefined}
          aria-pressed={activeSet.has('dentin')}
          className="layer"
          role="button"
          tabIndex={0}
          aria-label="Dentin"
        >
          <title>{activeTooth ? `Diş #${activeTooth} · Dentin (Orta Sert Diş Dokusu)` : 'Dentin'}</title>
          <path
            className="region-visual"
            d="M298 386 C285 350 272 312 272 270 C272 220 293 180 327 178 C356 177 375 201 400 203 C425 201 444 177 473 178 C507 180 528 220 528 270 C528 312 515 350 502 386 Q400 404 298 386 Z"
            fill={isRegionHighlighted('dentin') ? '#fbbf24' : '#f4d7a0'}
            stroke={isRegionHighlighted('dentin') ? '#0284c7' : '#d3b075'}
            strokeWidth="2.5"
          />
        </g>

        {/* 6. Taç / Kuron Çevresi (crown) */}
        <g
          id="crown"
          data-region="crown"
          data-active={activeSet.has('crown') ? 'true' : undefined}
          data-hovered={hoveredRegion === 'crown' ? 'true' : undefined}
          aria-pressed={activeSet.has('crown')}
          className="layer"
          role="button"
          tabIndex={0}
          aria-label="Taç"
        >
          <title>{activeTooth ? `Diş #${activeTooth} · Taç (Kuron)` : 'Taç (Kuron)'}</title>
          <path
            d="M285 388 C271 354 253 316 253 269 C253 210 281 160 327 158 C359 157 378 180 400 183 C422 180 441 157 473 158 C519 160 547 210 547 269 C547 316 529 354 515 388"
            fill="none"
            stroke="transparent"
            strokeWidth="18"
            pointerEvents="stroke"
          />
          <path
            className="region-visual"
            d="M285 388 C271 354 253 316 253 269 C253 210 281 160 327 158 C359 157 378 180 400 183 C422 180 441 157 473 158 C519 160 547 210 547 269 C547 316 529 354 515 388"
            fill="none"
            stroke={isRegionHighlighted('crown') ? '#0284c7' : '#91aab0'}
            strokeWidth={isRegionHighlighted('crown') ? '7' : '3.5'}
            pointerEvents="stroke"
          />
        </g>

        {/* 7. Kuron Pulpası (pulp) */}
        <g
          id="pulp"
          data-region="pulp"
          data-active={activeSet.has('pulp') ? 'true' : undefined}
          data-hovered={hoveredRegion === 'pulp' ? 'true' : undefined}
          aria-pressed={activeSet.has('pulp')}
          className="layer"
          role="button"
          tabIndex={0}
          aria-label="Pulpa"
        >
          <title>{activeTooth ? `Diş #${activeTooth} · Kuron Pulpası (Sinir ve Damar Odası)` : 'Pulpa'}</title>
          <path
            className="region-visual"
            d="M346 286 Q348 258 364 254 Q373 253 381 275 Q389 290 400 288 Q411 290 419 275 Q427 253 436 254 Q452 258 454 286 Q460 310 450 332 Q440 355 424 368 Q416 376 414 396 L386 396 Q384 376 376 368 Q360 355 350 332 Q340 310 346 286 Z"
            fill={isRegionHighlighted('pulp') ? '#f43f5e' : '#e07a72'}
            stroke={isRegionHighlighted('pulp') ? '#0284c7' : '#b45351'}
            strokeWidth="2.8"
          />
        </g>

        {/* 8. Kök Kanalı (root-canal) — Çok geniş görünmez tıklama koridoru + belirgin kanal lümeni */}
        <g
          id="root-canal"
          data-region="root-canal"
          data-active={activeSet.has('root-canal') ? 'true' : undefined}
          data-hovered={hoveredRegion === 'root-canal' ? 'true' : undefined}
          aria-pressed={activeSet.has('root-canal')}
          className="layer"
          role="button"
          tabIndex={0}
          aria-label="Kök kanalları"
        >
          <title>{activeTooth ? `Diş #${activeTooth} · Kök Kanalı (${morphology.canalSummary})` : 'Kök Kanalı'}</title>
          {morphology.kind === 'single' ? (
            <>
              {/* Geniş görünmez tıklama alanı (44px koridor) */}
              <path
                d="M400 392 L400 644"
                fill="none"
                stroke="transparent"
                strokeWidth="44"
                strokeLinecap="round"
                pointerEvents="stroke"
              />
              {/* Görünür Tek Ana Kök Kanalı */}
              <path
                className="region-visual"
                d="M382 392 C384 472 389 564 393 642 Q400 652 407 642 C411 564 416 472 418 392 Z"
                fill={isRegionHighlighted('root-canal') ? '#8b5cf6' : '#c0566b'}
                stroke={isRegionHighlighted('root-canal') ? '#0284c7' : '#7e22ce'}
                strokeWidth="2.6"
              />
              <path
                d="M400 400 L400 638"
                stroke="#ffffff"
                strokeWidth="2"
                strokeDasharray="6 4"
                pointerEvents="none"
              />
            </>
          ) : morphology.kind === 'three-root' ? (
            <>
              {/* Geniş görünmez tıklama alanı */}
              <path
                d="M388 394 Q362 508 328 644 M400 394 L400 652 M412 394 Q438 508 472 644 M380 402 H420"
                fill="none"
                stroke="transparent"
                strokeWidth="36"
                strokeLinecap="round"
                pointerEvents="stroke"
              />
              {/* Görünür 3 Kök Kanalı (MB, Palatinal, DB) */}
              <path
                className="region-visual"
                d="M382 392 Q360 494 322 640 Q327 650 335 642 Q370 506 392 426 L394 648 Q400 656 406 648 L408 426 Q430 506 465 642 Q473 650 478 640 Q440 494 418 392 Z"
                fill={isRegionHighlighted('root-canal') ? '#8b5cf6' : '#c0566b'}
                stroke={isRegionHighlighted('root-canal') ? '#0284c7' : '#7e22ce'}
                strokeWidth="2.4"
              />
              <path
                d="M386 404 Q360 510 329 638 M400 404 L400 644 M414 404 Q440 510 471 638"
                stroke="#ffffff"
                strokeWidth="1.6"
                strokeDasharray="5 3"
                fill="none"
                pointerEvents="none"
              />
            </>
          ) : (
            <>
              {/* Geniş görünmez tıklama alanı (40px koridor) */}
              <path
                d="M390 392 Q370 506 343 644 M410 392 Q430 506 457 644 M382 404 H418"
                fill="none"
                stroke="transparent"
                strokeWidth="40"
                strokeLinecap="round"
                pointerEvents="stroke"
              />
              {/* Görünür İki Kök Kanalı (Mezial & Distal) */}
              <path
                className="region-visual"
                d="M384 390 Q380 442 366 496 Q352 554 335 642 Q343 652 352 642 Q374 554 392 486 Q400 462 408 486 Q426 554 448 642 Q457 652 465 642 Q448 554 434 496 Q420 442 416 390 Z"
                fill={isRegionHighlighted('root-canal') ? '#8b5cf6' : '#c0566b'}
                stroke={isRegionHighlighted('root-canal') ? '#0284c7' : '#7e22ce'}
                strokeWidth="2.5"
              />
              <path
                d="M390 402 Q370 512 344 638 M410 402 Q430 512 456 638"
                stroke="#ffffff"
                strokeWidth="1.8"
                strokeDasharray="5 3"
                fill="none"
                pointerEvents="none"
              />
            </>
          )}
        </g>

        {/* 9. Boyun / Kole (neck) */}
        <g
          id="neck"
          data-region="neck"
          data-active={activeSet.has('neck') ? 'true' : undefined}
          data-hovered={hoveredRegion === 'neck' ? 'true' : undefined}
          aria-pressed={activeSet.has('neck')}
          className="layer"
          role="button"
          tabIndex={0}
          aria-label="Boyun"
        >
          <title>{activeTooth ? `Diş #${activeTooth} · Boyun (Kole / Servikal Geçiş Hattı)` : 'Boyun (Kole)'}</title>
          <path d="M283 387 Q400 409 517 387" fill="none" stroke="transparent" strokeWidth="22" />
          <path
            className="region-visual"
            d="M283 387 Q400 409 517 387"
            fill="none"
            stroke={isRegionHighlighted('neck') ? '#06b6d4' : '#5b7f87'}
            strokeWidth={isRegionHighlighted('neck') ? '6.5' : '4.5'}
            strokeDasharray="7 5"
          />
        </g>

        {/* 10. Kök Ucu / Apikal Bölge (apex) — En üst katmanda, geniş hedef halkalı ve çok kolay seçilebilir */}
        <g
          id="apex"
          data-region="apex"
          data-active={activeSet.has('apex') ? 'true' : undefined}
          data-hovered={hoveredRegion === 'apex' ? 'true' : undefined}
          aria-pressed={activeSet.has('apex')}
          className="layer"
          role="button"
          tabIndex={0}
          aria-label="Kök uçları"
        >
          <title>{activeTooth ? `Diş #${activeTooth} · Kök Ucu / Apikal Bölge (${morphology.apexSummary})` : 'Kök Ucu (Apikal)'}</title>
          {apexPoints.map((pt, idx) => {
            const outerR = morphology.kind === 'single' ? 27 : morphology.kind === 'three-root' ? 21 : 24
            const innerR = morphology.kind === 'single' ? 15 : morphology.kind === 'three-root' ? 12 : 14
            const hitR = morphology.kind === 'single' ? 46 : morphology.kind === 'three-root' ? 34 : 40
            return (
              <g key={idx}>
                {/* Geniş görünmez yakalayıcı daire — imleç kök ucuna yaklaştığında bile kolayca seçer */}
                <circle
                  cx={pt.cx}
                  cy={pt.cy}
                  r={hitR}
                  fill="transparent"
                  pointerEvents="all"
                />
                {/* Periapikal Hedef Halkası (Apikal Lezyon / Rezeksiyon Bölgesi) */}
                <circle
                  className="region-visual"
                  cx={pt.cx}
                  cy={pt.cy}
                  r={outerR}
                  fill={isRegionHighlighted('apex') ? '#fecdd3' : '#ffe4e6'}
                  stroke={isRegionHighlighted('apex') ? '#0284c7' : '#be123c'}
                  strokeWidth={isRegionHighlighted('apex') ? '3.5' : '2.6'}
                  strokeDasharray="4 2.5"
                />
                {/* Apikal Foramen Ana Çekirdeği */}
                <circle
                  cx={pt.cx}
                  cy={pt.cy}
                  r={innerR}
                  fill={isRegionHighlighted('apex') ? '#e11d48' : '#be123c'}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />
                {/* Merkez Apikal Nokta */}
                <circle cx={pt.cx} cy={pt.cy} r={4} fill="#ffffff" />
              </g>
            )
          })}
        </g>

        {/* Büyüteç Görünümünde (compact === false) Doğrudan Tıklanabilir Anatomik Etiketler */}
        {!compact && zoomMode === 'full' && (
          <g>
            {/* Sol Etiketler */}
            {[
              { id: 'enamel' as ToothRegion, label: 'Mine', boxY: 205, targetX: 268, targetY: 250 },
              { id: 'dentin' as ToothRegion, label: 'Dentin', boxY: 268, targetX: 315, targetY: 295 },
              { id: 'neck' as ToothRegion, label: 'Boyun (Kole)', boxY: 368, targetX: 286, targetY: 388 },
              { id: 'root' as ToothRegion, label: 'Kök Gövdesi', boxY: 505, targetX: 302, targetY: 530 },
              { id: 'apex' as ToothRegion, label: 'Kök Ucu (Apikal)', boxY: 644, targetX: apexPoints[0].cx - 18, targetY: apexPoints[0].cy },
            ].map(item => {
              const active = activeSet.has(item.id)
              return (
                <g
                  key={item.id}
                  data-region={item.id}
                  className="layer"
                  role="button"
                  tabIndex={-1}
                >
                  <line
                    x1={182}
                    y1={item.boxY + 16}
                    x2={item.targetX}
                    y2={item.targetY}
                    stroke={active ? '#2563eb' : '#64748b'}
                    strokeWidth={active ? '2.5' : '1.6'}
                    strokeDasharray={active ? undefined : '3 3'}
                  />
                  <circle cx={item.targetX} cy={item.targetY} r="4" fill={TOOTH_REGION_META[item.id].color} />
                  <rect
                    x="22"
                    y={item.boxY}
                    width="160"
                    height="32"
                    rx="8"
                    className={`callout-box ${active ? 'callout-active' : ''}`}
                  />
                  <circle cx="38" cy={item.boxY + 16} r="5.5" fill={TOOTH_REGION_META[item.id].color} stroke="#ffffff" strokeWidth="1.2" />
                  <text
                    x="50"
                    y={item.boxY + 20}
                    className={`label ${active ? 'callout-active-text' : ''}`}
                  >
                    {item.label}
                  </text>
                </g>
              )
            })}

            {/* Sağ Etiketler */}
            {[
              { id: 'crown' as ToothRegion, label: 'Taç (Kuron)', boxY: 205, targetX: 535, targetY: 245 },
              { id: 'pulp' as ToothRegion, label: 'Kuron Pulpası', boxY: 295, targetX: 444, targetY: 318 },
              { id: 'gingiva' as ToothRegion, label: 'Diş Eti', boxY: 392, targetX: 575, targetY: 412 },
              {
                id: 'root-canal' as ToothRegion,
                label: 'Kök Kanalı',
                boxY: 505,
                targetX: morphology.kind === 'single' ? 408 : 434,
                targetY: 535,
              },
              { id: 'jaw-bone' as ToothRegion, label: 'Çene Kemiği', boxY: 605, targetX: 585, targetY: 620 },
            ].map(item => {
              const active = activeSet.has(item.id)
              return (
                <g
                  key={item.id}
                  data-region={item.id}
                  className="layer"
                  role="button"
                  tabIndex={-1}
                >
                  <line
                    x1={618}
                    y1={item.boxY + 16}
                    x2={item.targetX}
                    y2={item.targetY}
                    stroke={active ? '#2563eb' : '#64748b'}
                    strokeWidth={active ? '2.5' : '1.6'}
                    strokeDasharray={active ? undefined : '3 3'}
                  />
                  <circle cx={item.targetX} cy={item.targetY} r="4" fill={TOOTH_REGION_META[item.id].color} />
                  <rect
                    x="618"
                    y={item.boxY}
                    width="160"
                    height="32"
                    rx="8"
                    className={`callout-box ${active ? 'callout-active' : ''}`}
                  />
                  <circle cx="634" cy={item.boxY + 16} r="5.5" fill={TOOTH_REGION_META[item.id].color} stroke="#ffffff" strokeWidth="1.2" />
                  <text
                    x="646"
                    y={item.boxY + 20}
                    className={`label ${active ? 'callout-active-text' : ''}`}
                  >
                    {item.label}
                  </text>
                </g>
              )
            })}
          </g>
        )}

        {/* Kök & Apikal Odak Modunda (zoomMode === 'root-focus') Doğrudan Kök Üstü Etiketler */}
        {!compact && zoomMode === 'root-focus' && (
          <g>
            {[
              { id: 'root' as ToothRegion, label: 'Kök Gövdesi', x: 168, y: 492, targetX: 300, targetY: 515 },
              {
                id: 'root-canal' as ToothRegion,
                label: 'Kök Kanalı',
                x: 492,
                y: 492,
                targetX: morphology.kind === 'single' ? 406 : 432,
                targetY: 525,
              },
              {
                id: 'apex' as ToothRegion,
                label: 'Kök Ucu (Apikal)',
                x: 168,
                y: 650,
                targetX: apexPoints[0].cx - 16,
                targetY: apexPoints[0].cy,
              },
            ].map(item => {
              const active = activeSet.has(item.id)
              return (
                <g
                  key={item.id}
                  data-region={item.id}
                  className="layer"
                  role="button"
                  tabIndex={-1}
                >
                  <line
                    x1={item.x < 400 ? item.x + 136 : item.x}
                    y1={item.y + 15}
                    x2={item.targetX}
                    y2={item.targetY}
                    stroke={active ? '#2563eb' : '#475569'}
                    strokeWidth="2.2"
                  />
                  <rect
                    x={item.x}
                    y={item.y}
                    width="136"
                    height="30"
                    rx="7"
                    className={`callout-box ${active ? 'callout-active' : ''}`}
                  />
                  <circle cx={item.x + 14} cy={item.y + 15} r="5" fill={TOOTH_REGION_META[item.id].color} stroke="#ffffff" strokeWidth="1" />
                  <text
                    x={item.x + 24}
                    y={item.y + 19}
                    className={`label ${active ? 'callout-active-text' : ''}`}
                    style={{ fontSize: '12px' }}
                  >
                    {item.label}
                  </text>
                </g>
              )
            })}
          </g>
        )}
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
  value?: ToothRegion | string | null
  onChange?: (region: ToothRegion) => void
}

export function ToothAnatomy2D(p: ToothAnatomy2DProps & Record<string, any>) {
  const [detectedTheme, setDetectedTheme] = useState<'light' | 'dark'>('light')
  const [fallbackTooth, setFallbackTooth] = useState<number>(16)
  const [localSectionsMap, setLocalSectionsMap] = useState<Record<number, ToothRegion[]>>({})
  const [dragOverTooth, setDragOverTooth] = useState<number | null>(null)
  const [zoomMode, setZoomMode] = useState<'full' | 'root-focus'>('full')
  const [hoveredRegion, setHoveredRegion] = useState<ToothRegion | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true)

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

  useEffect(() => {
    if (!p.toothSections) return
    const synced: Record<number, ToothRegion[]> = {}
    for (const [k, val] of Object.entries(p.toothSections)) {
      const num = Number(k)
      if (num) synced[num] = parseToothRegions(val as string)
    }
    setLocalSectionsMap(synced)
  }, [p.toothSections])

  const effectiveTheme: 'light' | 'dark' = p.theme || detectedTheme

  const rawSelected: number[] = Array.isArray(p.selected)
    ? p.selected
    : Array.isArray(p.selectedTeeth)
      ? p.selectedTeeth
      : []

  // Enforce single-tooth selection when in 2B Anatomik mode
  const activeTooth: number = rawSelected.length > 0 ? Number(rawSelected[0]) : fallbackTooth
  const activeMorphology = getToothRootMorphology(activeTooth)

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

  const getRegionsForTooth = (toothNum: number): ToothRegion[] => {
    if (toothNum === activeTooth && p.value !== undefined) {
      return parseToothRegions(p.value)
    }
    if (localSectionsMap[toothNum] !== undefined) {
      return localSectionsMap[toothNum]
    }
    return parseToothRegions(sectionsMap[toothNum])
  }

  const selectedRegions: ToothRegion[] = getRegionsForTooth(activeTooth)
  const isAllRegionsSelected = selectedRegions.length === ALL_TOOTH_REGION_IDS.length
  const isEndoTriadSelected =
    selectedRegions.includes('root') &&
    selectedRegions.includes('root-canal') &&
    selectedRegions.includes('apex')
  const isApicalCanalSelected =
    selectedRegions.includes('root-canal') && selectedRegions.includes('apex')

  const applyRegionsToTooth = (toothNum: number, nextRegions: ToothRegion[]) => {
    const ordered = ALL_TOOTH_REGION_IDS.filter(id => nextRegions.includes(id))
    const serialized = serializeToothRegions(ordered)
    setLocalSectionsMap(prev => ({ ...prev, [toothNum]: ordered }))
    if (ordered.length > 0) {
      p.onChange?.(ordered[ordered.length - 1])
    }
    p.updateSection?.(toothNum, serialized)
    p.onUpdateSection?.(toothNum, serialized)
  }

  const handleToggleToothRegion = (toothNum: number, region: ToothRegion) => {
    const isSwitchingTooth = toothNum !== activeTooth
    selectSingleTooth(toothNum)
    const current = getRegionsForTooth(toothNum)
    if (isSwitchingTooth && !current.includes(region)) {
      applyRegionsToTooth(toothNum, [...current, region])
      return
    }
    const next = current.includes(region)
      ? current.filter(r => r !== region)
      : [...current, region]
    applyRegionsToTooth(toothNum, next)
  }

  const handleToggleRegionPreset = (toothNum: number, presetRegions: ToothRegion[]) => {
    selectSingleTooth(toothNum)
    const current = getRegionsForTooth(toothNum)
    const allPresent = presetRegions.every(r => current.includes(r))
    if (allPresent) {
      applyRegionsToTooth(
        toothNum,
        current.filter(r => !presetRegions.includes(r))
      )
    } else {
      applyRegionsToTooth(toothNum, Array.from(new Set([...current, ...presetRegions])))
    }
  }

  const handleSelectAllRegions = (toothNum: number) => {
    selectSingleTooth(toothNum)
    const current = getRegionsForTooth(toothNum)
    if (current.length === ALL_TOOTH_REGION_IDS.length) {
      applyRegionsToTooth(toothNum, [])
    } else {
      applyRegionsToTooth(toothNum, [...ALL_TOOTH_REGION_IDS])
    }
  }

  const handleClearRegions = (toothNum: number) => {
    applyRegionsToTooth(toothNum, [])
  }

  const handleApplyActiveTreatmentToRegions = () => {
    const addFn = p.add || p.onDropTreatment
    if (!addFn) return
    const hasProc = Boolean(p.selectedProcedure)
    const inds = Array.isArray(p.selectedIndications) ? p.selectedIndications : []
    if (!hasProc && inds.length === 0) {
      toast.error('Önce katalogdan bir tedavi veya endikasyon seçin.')
      return
    }
    const serializedSection = serializeToothRegions(selectedRegions)
    addFn([activeTooth], {
      procedures: hasProc ? [p.selectedProcedure] : [],
      indications: inds,
      activeMaterials: p.selectedMaterials || p.selectedProcedure?.materials || [],
      section: serializedSection || undefined,
    })
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
    const existingRegions = getRegionsForTooth(toothNum)
    const nextRegions: ToothRegion[] =
      droppedRegionAttr && droppedRegionAttr in TOOTH_REGION_META
        ? Array.from(new Set([...existingRegions, droppedRegionAttr]))
        : existingRegions

    if (nextRegions.length > 0) {
      selectSingleTooth(toothNum)
      applyRegionsToTooth(toothNum, nextRegions)
    } else {
      selectSingleTooth(toothNum)
    }

    const serializedSection = serializeToothRegions(nextRegions)

    try {
      const rawData =
        event.dataTransfer.getData('value') ||
        event.dataTransfer.getData('application/json') ||
        event.dataTransfer.getData('text/plain')
      if (!rawData) return
      const data = JSON.parse(rawData)
      const payload = {
        ...data,
        section: serializedSection || data.section || undefined,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 2B Anatomik Diş Kutuları — Her bir diş kutusunda ToothAnatomy SVG yer alır ve yalnızca tek diş seçimi yapılır */}
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
              const toothRegions = getRegionsForTooth(toothNum)
              const shortBadgeLabel = formatToothRegionShortLabel(toothRegions)
              const fullRegionLabel = formatToothRegionLabel(toothRegions)
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
                  title={`Diş #${toothNum}${fullRegionLabel ? ` · Katmanlar: ${fullRegionLabel}` : ''}`}
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
                      selectedRegions={toothRegions}
                      value={toothRegions[0] ?? null}
                      onChange={region => handleToggleToothRegion(toothNum, region)}
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
                    {shortBadgeLabel && (
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
                        {shortBadgeLabel}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Detaylı Kök & Katman Seçici (Büyüteç Kesit Görünümü + Hızlı Anatomik Bölge Çubuğu) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 10,
          background: 'var(--card-bg)',
          border: '1px solid var(--pc-border, var(--input-border))',
          boxShadow: 'var(--pc-neo-subcard)',
        }}
      >
        {/* Üst Başlık ve Hızlı Endodontik / Katman Kontrol Barı */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--foreground)' }}>
              Seçili Diş: #{activeTooth} ({TOOTH_NAMES[activeTooth] || `Diş ${activeTooth}`})
            </span>
            <span
              style={{
                padding: '2px 7px',
                borderRadius: 6,
                background: 'var(--card-inner, var(--pc-surface))',
                border: '1px solid var(--pc-border, var(--input-border))',
                color: 'var(--foreground-2)',
                fontSize: 10.5,
                fontWeight: 700,
              }}
            >
              {activeMorphology.morphologyLabel}
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                color: 'var(--pc-blue, #0284c7)',
              }}
            >
              · Alt Katmanlar (Anatomik)
            </span>
            {selectedRegions.length > 0 ? (
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
                <span>
                  {isAllRegionsSelected
                    ? `Tüm Katmanlar Seçili (${selectedRegions.length})`
                    : `Seçili (${selectedRegions.length}): ${formatToothRegionLabel(selectedRegions)}`}
                </span>
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--pc-muted, var(--foreground-2))' }}>
                · Kök, kök kanalı ve kök ucunu büyüteç kesitinden veya büyük klinik kartlardan kolayca seçin
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {/* Hızlı Kök + Kanal + Kök Ucu (Endodontik Üçlü) Seçim Butonu */}
            <button
              type="button"
              aria-pressed={isEndoTriadSelected}
              onClick={() => handleToggleRegionPreset(activeTooth, ['root', 'root-canal', 'apex'])}
              title="Kök gövdesi, kök kanalı ve kök ucu (apikal) bölgelerini birlikte seç"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 800,
                cursor: 'pointer',
                border: isEndoTriadSelected
                  ? '1px solid #1d4ed8'
                  : '1px solid var(--pc-border, var(--input-border))',
                background: isEndoTriadSelected
                  ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                  : 'var(--card-inner, var(--pc-surface))',
                color: isEndoTriadSelected ? '#ffffff' : 'var(--foreground)',
                boxShadow: isEndoTriadSelected ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
              }}
            >
              <Crosshair size={11} style={{ color: isEndoTriadSelected ? '#ffffff' : '#be123c' }} />
              <span style={{ color: isEndoTriadSelected ? '#ffffff' : 'var(--foreground)' }}>
                Kök + Kanal + Kök Ucu
              </span>
            </button>

            {/* Hızlı Kanal + Kök Ucu Seçim Butonu */}
            <button
              type="button"
              aria-pressed={isApicalCanalSelected}
              onClick={() => handleToggleRegionPreset(activeTooth, ['root-canal', 'apex'])}
              title="Kök kanalı ve kök ucu (apikal) bölgelerini birlikte seç"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 800,
                cursor: 'pointer',
                border: isApicalCanalSelected
                  ? '1px solid #1d4ed8'
                  : '1px solid var(--pc-border, var(--input-border))',
                background: isApicalCanalSelected
                  ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                  : 'var(--card-inner, var(--pc-surface))',
                color: isApicalCanalSelected ? '#ffffff' : 'var(--foreground)',
                boxShadow: isApicalCanalSelected ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#8b5cf6',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: isApicalCanalSelected ? '#ffffff' : 'var(--foreground)' }}>
                Kanal + Kök Ucu
              </span>
            </button>

            <button
              type="button"
              aria-pressed={isAllRegionsSelected}
              onClick={() => handleSelectAllRegions(activeTooth)}
              title="Tüm anatomik alt katmanları seç veya seçimi kaldır"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 800,
                cursor: 'pointer',
                border: isAllRegionsSelected
                  ? '1px solid #1d4ed8'
                  : '1px solid var(--pc-blue, #0284c7)',
                background: isAllRegionsSelected
                  ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                  : 'var(--pc-tint)',
                color: isAllRegionsSelected ? '#ffffff' : 'var(--pc-tint-fg)',
                boxShadow: isAllRegionsSelected ? 'var(--pc-clay-primary)' : 'var(--pc-clay-pale)',
              }}
            >
              <CheckSquare size={11} style={{ color: isAllRegionsSelected ? '#ffffff' : 'var(--pc-tint-fg)' }} />
              <span style={{ color: isAllRegionsSelected ? '#ffffff' : 'var(--pc-tint-fg)' }}>
                {isAllRegionsSelected ? 'Tümü Seçili' : 'Tümünü Seç'}
              </span>
            </button>

            {selectedRegions.length > 0 && (
              <button
                type="button"
                onClick={() => handleClearRegions(activeTooth)}
                title="Katman seçimlerini sıfırla"
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

            <button
              type="button"
              onClick={() => setInspectorOpen(prev => !prev)}
              title={inspectorOpen ? 'Detaylı büyüteç görünümünü daralt' : 'Detaylı büyüteç görünümünü aç'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid var(--pc-border, var(--input-border))',
                background: 'var(--card-inner, var(--pc-surface))',
                color: 'var(--foreground)',
                boxShadow: 'var(--pc-clay-btn)',
              }}
            >
              {inspectorOpen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              <span>{inspectorOpen ? 'Büyüteci Gizle' : 'Detaylı Büyüteç'}</span>
            </button>
          </div>
        </div>

        {/* Ana Büyüteç + Büyük Klinik Kök / Apikal Seçim Kartları */}
        {inspectorOpen && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(250px, 320px) minmax(0, 1fr)',
              gap: 10,
              alignItems: 'stretch',
            }}
          >
            {/* Sol: Büyütülmüş İnteraktif Diş Kesiti ve Kök Yakınlaştırma (Büyüteç) */}
            <div
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDropOnToothBox(activeTooth, event)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: 8,
                borderRadius: 9,
                background: 'var(--card-inner, var(--pc-surface))',
                border: '1px solid var(--pc-border, var(--input-border))',
                boxShadow: 'var(--pc-neo-inset)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 4,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--foreground)' }}>
                  Büyüteç Kesit (#{activeTooth})
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <button
                    type="button"
                    aria-pressed={zoomMode === 'full'}
                    onClick={() => setZoomMode('full')}
                    style={{
                      padding: '2px 7px',
                      borderRadius: 5,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: zoomMode === 'full' ? '1px solid #1d4ed8' : '1px solid var(--pc-border, var(--input-border))',
                      background: zoomMode === 'full'
                        ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                        : 'var(--card-bg)',
                      color: zoomMode === 'full' ? '#ffffff' : 'var(--foreground)',
                    }}
                  >
                    Tam Kesit
                  </button>
                  <button
                    type="button"
                    aria-pressed={zoomMode === 'root-focus'}
                    onClick={() => setZoomMode('root-focus')}
                    title="Kök gövdesi, kök kanalı ve kök ucunu (apikal bölgeyi) 2 kat yakınlaştır"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 7px',
                      borderRadius: 5,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: zoomMode === 'root-focus' ? '1px solid #1d4ed8' : '1px solid var(--pc-border, var(--input-border))',
                      background: zoomMode === 'root-focus'
                        ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                        : 'var(--card-bg)',
                      color: zoomMode === 'root-focus' ? '#ffffff' : 'var(--foreground)',
                    }}
                  >
                    <ZoomIn size={10} style={{ color: zoomMode === 'root-focus' ? '#ffffff' : 'var(--pc-blue, #0284c7)' }} />
                    <span style={{ color: zoomMode === 'root-focus' ? '#ffffff' : 'var(--foreground)' }}>
                      Kök & Apikal Yakınlaştır
                    </span>
                  </button>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid var(--pc-border, var(--input-border))',
                  background: 'var(--card-bg)',
                  maxHeight: 215,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ToothAnatomy
                  selectedRegions={selectedRegions}
                  value={selectedRegions[0] ?? null}
                  onChange={region => handleToggleToothRegion(activeTooth, region)}
                  theme={effectiveTheme}
                  activeTooth={activeTooth}
                  compact={false}
                  zoomMode={zoomMode}
                  hoveredRegion={hoveredRegion}
                  onHoverRegion={setHoveredRegion}
                />
              </div>

              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--foreground-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                }}
              >
                <span>
                  {hoveredRegion
                    ? `Hedef: ${TOOTH_REGION_META[hoveredRegion].label} — ${TOOTH_REGION_META[hoveredRegion].clinicalHint}`
                    : 'Şema üzerindeki katmanlara veya etiketlere tıklayarak doğrudan seçin'}
                </span>
              </div>
            </div>

            {/* Sağ: Detaylı Kök / Kanal / Kök Ucu (Apikal) Kartları + Tüm Anatomik Bölgeler */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'space-between' }}>
              {/* Öncelikli Bölüm: Kök, Kök Kanalı ve Kök Ucu (Apikal Bölge) Büyük Seçim Kartları */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: 'var(--pc-blue, #0284c7)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                    }}
                  >
                    🎯 Hassas Kök, Kanal & Kök Ucu (Apikal) Seçici
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--foreground-2)' }}>
                    {activeMorphology.rootCount} Kök · {activeMorphology.canalSummary}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 6,
                  }}
                >
                  {[
                    {
                      id: 'root' as ToothRegion,
                      title: 'Kök Gövdesi (Kök)',
                      subtitle: activeMorphology.rootSummary,
                      badge: 'Sement & Furkasyon',
                      color: TOOTH_REGION_META.root.color,
                    },
                    {
                      id: 'root-canal' as ToothRegion,
                      title: 'Kök Kanalı (Kanal)',
                      subtitle: activeMorphology.canalSummary,
                      badge: 'Endodontik Kanal',
                      color: TOOTH_REGION_META['root-canal'].color,
                    },
                    {
                      id: 'apex' as ToothRegion,
                      title: 'Kök Ucu (Apikal)',
                      subtitle: activeMorphology.apexSummary,
                      badge: 'Periapikal / Rezeksiyon',
                      color: TOOTH_REGION_META.apex.color,
                    },
                  ].map(card => {
                    const isSelected = selectedRegions.includes(card.id)
                    return (
                      <button
                        key={card.id}
                        type="button"
                        aria-pressed={isSelected}
                        onMouseEnter={() => setHoveredRegion(card.id)}
                        onMouseLeave={() => setHoveredRegion(null)}
                        onClick={() => handleToggleToothRegion(activeTooth, card.id)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 4,
                          padding: '8px 10px',
                          borderRadius: 8,
                          textAlign: 'left',
                          cursor: 'pointer',
                          border: isSelected
                            ? '1.5px solid #1d4ed8'
                            : '1.5px solid var(--pc-border, var(--input-border))',
                          background: isSelected
                            ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
                            : 'var(--card-inner, var(--pc-surface))',
                          color: isSelected ? '#ffffff' : 'var(--foreground)',
                          boxShadow: isSelected ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                          transition: 'all 0.14s ease',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 12,
                              fontWeight: 800,
                              color: isSelected ? '#ffffff' : 'var(--foreground)',
                            }}
                          >
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: card.color,
                                border: '1.5px solid #ffffff',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: isSelected ? '#ffffff' : 'var(--foreground)' }}>
                              {card.title}
                            </span>
                          </span>
                          {isSelected && <Check size={14} style={{ color: '#ffffff', flexShrink: 0 }} />}
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            lineHeight: 1.25,
                            color: isSelected ? '#ffffff' : 'var(--foreground-2)',
                          }}
                        >
                          {card.subtitle}
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 5,
                            background: isSelected ? '#ffffff' : 'var(--pc-tint)',
                            color: isSelected ? '#1d4ed8' : 'var(--pc-tint-fg)',
                          }}
                        >
                          {card.badge}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Kuron, Boyun ve Çevre Destek Dokular + Tüm Anatomik Katman Butonları */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: 'var(--foreground-2)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                  }}
                >
                  Tüm Anatomik Katmanlar (Kuron, Pulpa, Kök ve Çevre Dokular)
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  {ORDERED_TOOTH_REGIONS.map(region => {
                    const isSelected = selectedRegions.includes(region.id)
                    return (
                      <button
                        key={region.id}
                        type="button"
                        aria-pressed={isSelected}
                        onMouseEnter={() => setHoveredRegion(region.id)}
                        onMouseLeave={() => setHoveredRegion(null)}
                        onClick={() => handleToggleToothRegion(activeTooth, region.id)}
                        title={`${region.label} — ${region.clinicalHint}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '5px 9px',
                          borderRadius: 7,
                          fontSize: 11,
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
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: region.color,
                            border: '1px solid #ffffff',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ color: isSelected ? '#ffffff' : 'var(--foreground)' }}>
                          {region.shortLabel}
                        </span>
                        {isSelected && <Check size={11} style={{ color: '#ffffff' }} />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Seçili Tedavi / Endikasyon Varsa Hızlı Uygulama Çubuğu */}
              {(p.selectedProcedure || (Array.isArray(p.selectedIndications) && p.selectedIndications.length > 0)) && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: 'var(--card-inner, var(--pc-surface))',
                    border: '1px solid var(--pc-border, var(--input-border))',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>
                    Aktif Seçim:{' '}
                    <strong>
                      {p.selectedProcedure?.name || p.selectedIndications?.join(', ')}
                    </strong>
                    {selectedRegions.length > 0 && ` · Katman: ${formatToothRegionLabel(selectedRegions)}`}
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyActiveTreatmentToRegions}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '5px 11px',
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                      border: '1px solid #1d4ed8',
                      background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#ffffff',
                      boxShadow: 'var(--pc-clay-primary)',
                    }}
                  >
                    <Plus size={12} style={{ color: '#ffffff' }} />
                    <span style={{ color: '#ffffff' }}>
                      #{activeTooth} Seçili Katmana Ekle
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ToothAnatomy2D
