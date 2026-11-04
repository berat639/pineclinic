import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Columns3, Eye, EyeOff, Plus, RotateCcw, X } from 'lucide-react'

export type PlanTableColumnKey =
  | 'tooth'
  | 'indications'
  | 'procedure'
  | 'doctor'
  | 'price'
  | 'total'
  | 'actions'

export type HideablePlanColumnKey = 'indications' | 'doctor' | 'price' | 'total'

export interface PlanColumnDefinition {
  key: PlanTableColumnKey
  label: string
  shortLabel: string
  hideable: boolean
  baseWeight: number
  minPx: number
}

export const PLAN_TABLE_COLUMNS: readonly PlanColumnDefinition[] = [
  { key: 'tooth', label: 'Diş', shortLabel: 'Diş', hideable: false, baseWeight: 14, minPx: 92 },
  { key: 'indications', label: 'Endikasyonlar', shortLabel: 'Endikasyonlar', hideable: true, baseWeight: 21, minPx: 125 },
  { key: 'procedure', label: 'Tedavi', shortLabel: 'Tedavi', hideable: false, baseWeight: 22, minPx: 120 },
  { key: 'doctor', label: 'Hekim', shortLabel: 'Hekim', hideable: true, baseWeight: 17, minPx: 105 },
  { key: 'price', label: 'Fiyat (₺)', shortLabel: 'Fiyat', hideable: true, baseWeight: 13, minPx: 92 },
  { key: 'total', label: 'Tutar (₺)', shortLabel: 'Tutar', hideable: true, baseWeight: 9, minPx: 68 },
  { key: 'actions', label: 'İşlemler', shortLabel: 'Sil', hideable: false, baseWeight: 4, minPx: 30 },
] as const

export const HIDEABLE_PLAN_COLUMNS: readonly PlanColumnDefinition[] = PLAN_TABLE_COLUMNS.filter(
  col => col.hideable
)

/**
 * Extracts indications array from either `{ target, item }` row wrappers or direct draft items.
 */
export function extractRowIndications(row: any): string[] {
  if (!row) return []
  const raw = Array.isArray(row.indications)
    ? row.indications
    : Array.isArray(row.item?.indications)
      ? row.item.indications
      : []
  return raw.filter((val: unknown): val is string => typeof val === 'string' && val.trim().length > 0)
}

/**
 * Computes optimal percentage widths (summing to 100%) for all visible columns.
 * Hidden columns receive '0%'. Freed space is redistributed proportionally across
 * visible data columns while keeping 'actions' compact.
 */
export function getDynamicColWidths(
  visibleColumns: Record<PlanTableColumnKey, boolean>
): Record<PlanTableColumnKey, string> {
  const result: Record<PlanTableColumnKey, string> = {
    tooth: '0%',
    indications: '0%',
    procedure: '0%',
    doctor: '0%',
    price: '0%',
    total: '0%',
    actions: '0%',
  }

  const activeDataCols = PLAN_TABLE_COLUMNS.filter(
    col => col.key !== 'actions' && visibleColumns[col.key]
  )
  const actionsAllocation = visibleColumns.actions ? 4 : 0
  const availablePercent = 100 - actionsAllocation

  if (visibleColumns.actions) {
    result.actions = `${actionsAllocation}%`
  }

  if (activeDataCols.length === 0) {
    result.tooth = '50%'
    result.procedure = '46%'
    return result
  }

  const totalWeight = activeDataCols.reduce((sum, col) => sum + col.baseWeight, 0)
  let allocated = 0

  activeDataCols.forEach((col, index) => {
    if (index === activeDataCols.length - 1) {
      const remaining = Math.max(4, Math.round((availablePercent - allocated) * 10) / 10)
      result[col.key] = `${remaining}%`
    } else {
      const share = Math.round(((col.baseWeight / totalWeight) * availablePercent) * 10) / 10
      result[col.key] = `${share}%`
      allocated += share
    }
  })

  return result
}

/**
 * Computes a responsive minimum table width (px) based on currently visible columns,
 * preventing unnecessary horizontal scrollbars when columns are hidden.
 */
export function getDynamicTableMinWidth(
  visibleColumns: Record<PlanTableColumnKey, boolean>
): number {
  const totalMin = PLAN_TABLE_COLUMNS.reduce(
    (sum, col) => (visibleColumns[col.key] ? sum + col.minPx : sum),
    0
  )
  return Math.max(280, totalMin)
}

export interface UseTreatmentTableColumnsResult {
  visibleColumns: Record<PlanTableColumnKey, boolean>
  colWidths: Record<PlanTableColumnKey, string>
  tableMinWidth: number
  tableStyle: React.CSSProperties
  hasAnyIndication: boolean
  indicationCount: number
  isIndicationsAutoHidden: boolean
  indicationsOverride: 'auto' | 'shown' | 'hidden'
  hiddenColumnCount: number
  hasManualOverrides: boolean
  toggleColumn: (key: HideablePlanColumnKey) => void
  showColumn: (key: HideablePlanColumnKey) => void
  hideColumn: (key: HideablePlanColumnKey) => void
  resetColumns: () => void
}

/**
 * Manages dynamic and hideable columns for the Step 4 Treatment Plan table.
 * - Automatically hides 'indications' when no row has any defined indication (unless manually shown).
 * - Automatically reveals 'indications' as soon as an indication is added to any row.
 * - Allows manual toggling of 'indications', 'doctor', 'price', and 'total'.
 */
export function useTreatmentTableColumns(rows: any[]): UseTreatmentTableColumnsResult {
  const indicationCount = useMemo(
    () => rows.reduce((sum, row) => sum + extractRowIndications(row).length, 0),
    [rows]
  )
  const hasAnyIndication = indicationCount > 0

  const [indicationsOverride, setIndicationsOverride] = useState<'auto' | 'shown' | 'hidden'>('auto')
  const [manualVisibility, setManualVisibility] = useState<Record<Exclude<HideablePlanColumnKey, 'indications'>, boolean>>({
    doctor: true,
    price: true,
    total: true,
  })

  // When indications transition from 0 -> >0, automatically clear a stale 'hidden' override
  // so newly added indications are immediately visible to the clinician.
  const prevHasIndicationRef = useRef<boolean>(hasAnyIndication)
  useEffect(() => {
    if (!prevHasIndicationRef.current && hasAnyIndication && indicationsOverride === 'hidden') {
      setIndicationsOverride('auto')
    }
    prevHasIndicationRef.current = hasAnyIndication
  }, [hasAnyIndication, indicationsOverride])

  const isIndicationsVisible =
    indicationsOverride === 'auto'
      ? hasAnyIndication
      : indicationsOverride === 'shown'

  const isIndicationsAutoHidden = !isIndicationsVisible && !hasAnyIndication && indicationsOverride === 'auto'

  const visibleColumns = useMemo<Record<PlanTableColumnKey, boolean>>(
    () => ({
      tooth: true,
      indications: isIndicationsVisible,
      procedure: true,
      doctor: manualVisibility.doctor,
      price: manualVisibility.price,
      total: manualVisibility.total,
      actions: true,
    }),
    [isIndicationsVisible, manualVisibility]
  )

  const colWidths = useMemo(() => getDynamicColWidths(visibleColumns), [visibleColumns])
  const tableMinWidth = useMemo(() => getDynamicTableMinWidth(visibleColumns), [visibleColumns])
  const tableStyle = useMemo<React.CSSProperties>(
    () => ({ minWidth: `${tableMinWidth}px`, width: '100%', tableLayout: 'fixed' }),
    [tableMinWidth]
  )

  const toggleColumn = useCallback(
    (key: HideablePlanColumnKey) => {
      if (key === 'indications') {
        setIndicationsOverride(prev => {
          const currentlyVisible = prev === 'auto' ? hasAnyIndication : prev === 'shown'
          return currentlyVisible ? 'hidden' : 'shown'
        })
        return
      }
      setManualVisibility(prev => ({ ...prev, [key]: !prev[key] }))
    },
    [hasAnyIndication]
  )

  const showColumn = useCallback((key: HideablePlanColumnKey) => {
    if (key === 'indications') {
      setIndicationsOverride('shown')
      return
    }
    setManualVisibility(prev => ({ ...prev, [key]: true }))
  }, [])

  const hideColumn = useCallback((key: HideablePlanColumnKey) => {
    if (key === 'indications') {
      setIndicationsOverride('hidden')
      return
    }
    setManualVisibility(prev => ({ ...prev, [key]: false }))
  }, [])

  const resetColumns = useCallback(() => {
    setIndicationsOverride('auto')
    setManualVisibility({
      doctor: true,
      price: true,
      total: true,
    })
  }, [])

  const hiddenColumnCount = HIDEABLE_PLAN_COLUMNS.filter(col => !visibleColumns[col.key]).length
  const hasManualOverrides =
    indicationsOverride !== 'auto' ||
    !manualVisibility.doctor ||
    !manualVisibility.price ||
    !manualVisibility.total

  return {
    visibleColumns,
    colWidths,
    tableMinWidth,
    tableStyle,
    hasAnyIndication,
    indicationCount,
    isIndicationsAutoHidden,
    indicationsOverride,
    hiddenColumnCount,
    hasManualOverrides,
    toggleColumn,
    showColumn,
    hideColumn,
    resetColumns,
  }
}

export interface TreatmentTableColumnBarProps {
  columnManager: UseTreatmentTableColumnsResult
  className?: string
}

/**
 * Compact clinical column toggle bar for Step 4 ("Tedavi planı").
 * Shows active and hidden/auto-hidden columns as solid Neomorphic/Claymorphic pills.
 */
export function TreatmentTableColumnBar({
  columnManager,
  className,
}: TreatmentTableColumnBarProps) {
  const {
    visibleColumns,
    indicationCount,
    isIndicationsAutoHidden,
    hasManualOverrides,
    toggleColumn,
    resetColumns,
  } = columnManager

  return (
    <div
      className={className}
      role="toolbar"
      aria-label="Tablo görünür sütunları"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 7,
        padding: '5px 8px',
        borderRadius: 10,
        border: '1px solid var(--pc-border, var(--input-border, #334155))',
        background: 'var(--pc-surface, var(--card-bg))',
        boxShadow: 'var(--pc-neo-inset)',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          color: 'var(--pc-muted, var(--foreground-2))',
          fontSize: 11.5,
          fontWeight: 650,
          whiteSpace: 'nowrap',
        }}
      >
        <Columns3 size={13} style={{ color: 'var(--pc-tint-fg, #0284c7)', flexShrink: 0 }} />
        <span>Sütunlar:</span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 5,
          marginLeft: 'auto',
        }}
      >
        {HIDEABLE_PLAN_COLUMNS.map(col => {
          const key = col.key as HideablePlanColumnKey
          const isVisible = visibleColumns[key]
          const isAutoHiddenInd = key === 'indications' && isIndicationsAutoHidden

          return (
            <button
              key={key}
              type="button"
              aria-pressed={isVisible}
              onClick={() => toggleColumn(key)}
              title={
                isAutoHiddenInd
                  ? 'Endikasyon tanımlanmadığı için otomatik gizlendi. Tablodan endikasyon eklemek için tıklayın.'
                  : isVisible
                    ? `${col.label} sütununu gizle`
                    : `${col.label} sütununu göster`
              }
              style={{
                minHeight: 24,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                border: isVisible
                  ? '1px solid var(--pc-blue, #0284c7)'
                  : '1px dashed var(--pc-border, #94a3b8)',
                background: isVisible
                  ? 'var(--pc-tint, #e0f2fe)'
                  : 'var(--card-bg, #1e293b)',
                color: isVisible
                  ? 'var(--pc-tint-fg, #0284c7)'
                  : 'var(--pc-muted, var(--foreground-2))',
                font: 'inherit',
                fontSize: 11,
                fontWeight: isVisible ? 700 : 600,
                lineHeight: 1.2,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: isVisible ? 'var(--pc-clay-pale)' : 'var(--pc-clay-btn)',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
            >
              {isVisible ? (
                <Eye size={11} style={{ flexShrink: 0 }} />
              ) : (
                <Plus size={11} style={{ flexShrink: 0 }} />
              )}
              <span>{col.shortLabel}</span>
              {key === 'indications' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 15,
                    height: 15,
                    padding: '0 4px',
                    borderRadius: 999,
                    background: isVisible ? 'var(--card-bg)' : 'var(--pc-tint)',
                    color: 'var(--pc-tint-fg)',
                    fontSize: 10,
                    fontWeight: 750,
                  }}
                >
                  {indicationCount}
                </span>
              )}
            </button>
          )
        })}

        {hasManualOverrides && (
          <button
            type="button"
            onClick={resetColumns}
            title="Sütun görünürlüğünü varsayılan (otomatik) duruma sıfırla"
            style={{
              minHeight: 24,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 7px',
              borderRadius: 999,
              border: '1px solid var(--pc-border)',
              background: 'var(--card-bg)',
              color: 'var(--pc-tint-fg)',
              font: 'inherit',
              fontSize: 11,
              fontWeight: 650,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            <RotateCcw size={10} />
            <span>Otomatik</span>
          </button>
        )}
      </div>
    </div>
  )
}

export interface HideableColumnHeaderProps {
  label: string
  columnKey: HideablePlanColumnKey
  onHide: (key: HideablePlanColumnKey) => void
  badge?: React.ReactNode
}

/**
 * Header content renderer for hideable `<th>` cells in the Treatment Plan table.
 * Includes a compact quick-hide button right inside the column header.
 */
export function HideableColumnHeader({
  label,
  columnKey,
  onHide,
  badge,
}: HideableColumnHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
        minWidth: 0,
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {badge}
      <button
        type="button"
        onClick={event => {
          event.stopPropagation()
          onHide(columnKey)
        }}
        title={`${label} sütununu gizle`}
        aria-label={`${label} sütununu gizle`}
        style={{
          width: 17,
          height: 17,
          display: 'inline-grid',
          placeItems: 'center',
          flexShrink: 0,
          padding: 0,
          borderRadius: 5,
          border: '1px solid var(--pc-border)',
          background: 'var(--card-bg)',
          color: 'var(--pc-muted)',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        <EyeOff size={10} />
      </button>
    </div>
  )
}
