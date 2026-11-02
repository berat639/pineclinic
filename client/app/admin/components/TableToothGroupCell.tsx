import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Trash2, X } from 'lucide-react'
import styles from './PineTreatmentPlan.module.css'

export interface GroupedToothEntry {
  target: string
  item: any
}

export interface GroupedTreatmentRow {
  groupKey: string
  primaryTarget: string
  primaryItem: any
  entries: GroupedToothEntry[]
  targets: string[]
}

export interface TableToothGroupCellProps {
  entries: GroupedToothEntry[]
  procedureName: string
  procedureColor: string
  locked?: boolean
  onRemoveToothEntry: (target: string, itemId: string, item?: any) => void
  onRemoveAllEntries?: () => void
}

export function formatTargetLabel(target: string): string {
  if (target === 'upper') return 'Üst çene'
  if (target === 'lower') return 'Alt çene'
  if (target === 'general') return 'Tüm ağız'
  if (/^[1-4][1-8]$/.test(target)) return `#${target}`
  return target
}

export function formatTargetPlainName(target: string): string {
  if (target === 'upper') return 'Üst çene'
  if (target === 'lower') return 'Alt çene'
  if (target === 'general') return 'Tüm ağız'
  return target
}

function getTargetSortOrder(target: string): number {
  if (/^[1-4][1-8]$/.test(target)) {
    return Number(target)
  }
  if (target === 'upper') return 100
  if (target === 'lower') return 101
  if (target === 'general') return 102
  return 200
}

function buildRowGroupingSignature(item: any): string {
  const procIdentity = `${item?.procedureId || ''}::${(item?.name || '').trim()}`
  const scope = item?.scope || 'tooth'
  const price = Number(item?.price) || 0
  const locked = Boolean(item?.locked) ? '1' : '0'
  const indications = Array.isArray(item?.indications)
    ? item.indications.slice().sort().join('|')
    : ''
  const rawDoctors =
    Array.isArray(item?.doctorIds) && item.doctorIds.length > 0
      ? item.doctorIds
      : item?.doctorId
      ? [item.doctorId]
      : []
  const doctors = rawDoctors.filter(Boolean).slice().sort().join('|')
  const materials = Array.isArray(item?.materials)
    ? item.materials
        .map(
          (m: any) =>
            `${m?.inventoryItemId || m?.name || ''}:${Number(m?.quantity) || 1}:${Number(m?.unitSalePriceMinor) || 0}`
        )
        .sort()
        .join('|')
    : ''

  return `${procIdentity}__${scope}__${price}__${locked}__${indications}__${doctors}__${materials}`
}

/**
 * Groups identical treatment draft items across multiple teeth into single table rows
 * so multi-tooth treatments do not clutter the Treatment Plan table.
 */
export function groupTreatmentDraftRows(drafts: Record<string, any[]>): GroupedTreatmentRow[] {
  const internalGroups: Array<{
    signature: string
    entries: GroupedToothEntry[]
    targetSet: Set<string>
  }> = []

  const sortedTargets = Object.keys(drafts || {}).sort((a, b) => {
    const orderDiff = getTargetSortOrder(a) - getTargetSortOrder(b)
    return orderDiff !== 0 ? orderDiff : a.localeCompare(b, 'tr-TR')
  })

  for (const target of sortedTargets) {
    const items = drafts[target]
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!item) continue
      const signature = buildRowGroupingSignature(item)
      // Only merge into an existing group if this tooth/target isn't already in that group
      const existing = internalGroups.find(
        g => g.signature === signature && !g.targetSet.has(target)
      )
      if (existing) {
        existing.entries.push({ target, item })
        existing.targetSet.add(target)
      } else {
        internalGroups.push({
          signature,
          entries: [{ target, item }],
          targetSet: new Set([target]),
        })
      }
    }
  }

  return internalGroups.map((group, idx) => {
    const sortedEntries = group.entries.slice().sort((a, b) => {
      const orderDiff = getTargetSortOrder(a.target) - getTargetSortOrder(b.target)
      return orderDiff !== 0 ? orderDiff : a.target.localeCompare(b.target, 'tr-TR')
    })
    const primary = sortedEntries[0]
    return {
      groupKey: `${primary.target}-${primary.item?.id || idx}`,
      primaryTarget: primary.target,
      primaryItem: primary.item,
      entries: sortedEntries,
      targets: sortedEntries.map(e => e.target),
    }
  })
}

export default function TableToothGroupCell({
  entries,
  procedureName,
  procedureColor,
  locked = false,
  onRemoveToothEntry,
  onRemoveAllEntries,
}: TableToothGroupCellProps) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeMenu = () => setMenuPos(null)

  useEffect(() => {
    if (entries.length === 0 && menuPos) {
      setMenuPos(null)
    }
  }, [entries.length, menuPos])

  useEffect(() => {
    if (!menuPos) return

    const handleWheel = (event: WheelEvent) => {
      const menuEl = menuRef.current
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
      const menuEl = menuRef.current
      if (!menuEl || !menuEl.contains(event.target as Node)) {
        event.preventDefault()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeMenu()
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true })
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('wheel', handleWheel, { capture: true } as any)
      window.removeEventListener('touchmove', handleTouchMove, { capture: true } as any)
      window.removeEventListener('keydown', handleKeyDown, { capture: true } as any)
    }
  }, [menuPos])

  if (!entries.length) return null

  const openAtEvent = (clientX?: number, clientY?: number) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768
    const menuWidth = 250
    const estHeight = Math.min(340, 96 + entries.length * 36)

    let rawX = clientX ?? 0
    let rawY = clientY ?? 0

    if (!rawX && !rawY && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      rawX = rect.left
      rawY = rect.bottom + 6
    }

    const safeX = Math.max(10, Math.min(rawX, vw - menuWidth - 12))
    const safeY = Math.max(10, Math.min(rawY, vh - estHeight - 12))
    setMenuPos({ x: safeX, y: safeY })
  }

  const allLabels = entries.map(e => formatTargetLabel(e.target))
  const isMulti = entries.length > 1
  const visibleEntries = entries.slice(0, 2)
  const hiddenCount = Math.max(0, entries.length - visibleEntries.length)

  const tooltipText = isMulti
    ? `Atanan dişler (${entries.length}): ${allLabels.join(', ')} · Diş çıkarmak için tıklayın veya sağ tıklayın`
    : `${allLabels[0]} (${procedureName}) · İşlemi kaldırmak için sağ tıklayın veya tıklayın`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.pale}
        title={tooltipText}
        aria-label={
          isMulti
            ? `${entries.length} diş seçili: ${allLabels.join(', ')}`
            : `${formatTargetPlainName(entries[0].target)} diş işlemleri`
        }
        aria-haspopup="menu"
        aria-expanded={Boolean(menuPos)}
        onClick={event => {
          event.preventDefault()
          event.stopPropagation()
          const rect = triggerRef.current?.getBoundingClientRect()
          if (rect) {
            openAtEvent(rect.left, rect.bottom + 5)
          } else {
            openAtEvent(event.clientX, event.clientY)
          }
        }}
        onContextMenu={event => {
          event.preventDefault()
          event.stopPropagation()
          openAtEvent(event.clientX, event.clientY)
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          maxWidth: '100%',
          padding: isMulti ? '3px 5px' : '3px 7px',
          borderRadius: 8,
          border: `1px solid ${menuPos ? 'var(--pc-blue, #0284c7)' : 'var(--pc-border, var(--input-border, #cbd5e1))'}`,
          background: isMulti ? 'var(--pc-tint, var(--btn-clinic-blue-bg, #e0f2fe))' : 'var(--card-bg)',
          color: 'var(--pc-tint-fg, var(--btn-clinic-blue-fg, #0284c7))',
          font: 'inherit',
          fontSize: '11.5px',
          fontWeight: 700,
          lineHeight: 1.2,
          cursor: 'pointer',
          boxShadow: isMulti ? 'var(--pc-clay-pale)' : 'var(--pc-clay-btn)',
          whiteSpace: 'nowrap',
          transition: 'border-color 0.15s ease, transform 0.1s ease',
        }}
      >
        {!isMulti ? (
          <span>{formatTargetLabel(entries[0].target)}</span>
        ) : (
          <>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                minWidth: 0,
              }}
            >
              {visibleEntries.map((entry, idx) => (
                <span key={`${entry.target}-${idx}`}>
                  {formatTargetLabel(entry.target)}
                  {idx < visibleEntries.length - 1 ? ',' : ''}
                </span>
              ))}
            </span>
            {hiddenCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1px 5px',
                  borderRadius: 999,
                  border: '1px solid var(--pc-blue, #38bdf8)',
                  background: 'var(--card-bg)',
                  color: 'var(--pc-tint-fg, #0284c7)',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  lineHeight: 1.2,
                  flexShrink: 0,
                }}
              >
                +{hiddenCount}
              </span>
            )}
            <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.85 }} />
          </>
        )}
      </button>

      {menuPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100025,
              background: 'transparent',
            }}
            onClick={closeMenu}
            onContextMenu={event => {
              event.preventDefault()
              closeMenu()
            }}
          >
            <div
              ref={menuRef}
              role="menu"
              aria-label={`${procedureName} atanan dişler`}
              onClick={event => event.stopPropagation()}
              onContextMenu={event => {
                event.preventDefault()
                event.stopPropagation()
              }}
              style={{
                position: 'fixed',
                left: menuPos.x,
                top: menuPos.y,
                width: 248,
                maxWidth: 'calc(100vw - 20px)',
                maxHeight: 330,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: 11,
                border: '1.5px solid var(--input-border, #334155)',
                background: 'var(--card-bg)',
                color: 'var(--foreground)',
                boxShadow: 'var(--pc-modal-shadow, 0 18px 40px -10px rgba(15, 23, 42, 0.45))',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '9px 12px',
                  background: 'var(--card-inner, var(--background-2))',
                  borderBottom: '1px solid var(--input-border, #334155)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: procedureColor || '#0284c7',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 750,
                        color: 'var(--foreground)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {procedureName}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: 'var(--foreground-2)',
                      }}
                    >
                      Atanan Dişler ({entries.length})
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Menüyü kapat"
                  onClick={closeMenu}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    padding: 0,
                    borderRadius: 6,
                    border: '1px solid var(--input-border, #334155)',
                    background: 'var(--card-bg)',
                    color: 'var(--foreground-2)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <X size={12} />
                </button>
              </div>

              {/* Section Subtitle */}
              <div
                style={{
                  padding: '6px 12px 4px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  color: 'var(--danger, #ef4444)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{locked ? 'Kilitli İşlem' : 'Dişi Tedaviden Çıkar'}</span>
                <span>{entries.length} diş</span>
              </div>

              {/* Assigned Teeth List */}
              <div
                style={{
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  padding: '2px 6px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                {entries.map(entry => {
                  const label = formatTargetLabel(entry.target)
                  return (
                    <button
                      key={`${entry.target}-${entry.item?.id}`}
                      type="button"
                      role="menuitem"
                      disabled={locked}
                      title={locked ? 'Kilitli işlem kaldırılamaz' : `${label} dişini bu tedaviden çıkar`}
                      onClick={() => {
                        if (locked) return
                        const isLast = entries.length <= 1
                        onRemoveToothEntry(entry.target, entry.item?.id, entry.item)
                        if (isLast) closeMenu()
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        width: '100%',
                        padding: '6px 9px',
                        borderRadius: 7,
                        border: '1px solid var(--input-border, #334155)',
                        background: 'var(--card-bg)',
                        color: 'var(--foreground)',
                        fontSize: 12,
                        fontWeight: 650,
                        cursor: locked ? 'not-allowed' : 'pointer',
                        opacity: locked ? 0.6 : 1,
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 32,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: 'var(--btn-clinic-blue-bg, #e0f2fe)',
                            color: 'var(--btn-clinic-blue-fg, #0284c7)',
                            fontSize: 11.5,
                            fontWeight: 800,
                          }}
                        >
                          {label}
                        </span>
                        <span
                          style={{
                            fontSize: 11.5,
                            color: 'var(--foreground-2)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {/^[1-4][1-8]$/.test(entry.target) ? `${entry.target} Nolu Diş` : label}
                        </span>
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: 'var(--danger, #ef4444)',
                          fontSize: 11.5,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        <Trash2 size={12} />
                        <span>Çıkar</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Footer: Remove All */}
              {entries.length > 1 && onRemoveAllEntries && !locked && (
                <div
                  style={{
                    padding: '7px 8px',
                    borderTop: '1px solid var(--input-border, #334155)',
                    background: 'var(--card-inner, var(--background-2))',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveAllEntries()
                      closeMenu()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 7,
                      border: '1px solid var(--danger, #ef4444)',
                      background: 'var(--card-bg)',
                      color: 'var(--danger, #ef4444)',
                      fontSize: 11.5,
                      fontWeight: 750,
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={12} />
                    <span>Tüm Dişleri Kaldır ({entries.length})</span>
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
