import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link2, Unlink, X } from 'lucide-react'

/**
 * Key: `procedureId` (preferred) or `procedureName`
 * Value: Array of linked `indication` names
 */
export type IndicationProcedureLinks = Record<string, string[]>

export const INDICATION_LINK_MIME = 'application/x-indication-link'
export const PROCEDURE_LINK_MIME = 'application/x-procedure-link'

/**
 * Resolves the canonical key used to index a procedure in `IndicationProcedureLinks`.
 */
export function getProcedureLinkKey(
  proc: { id?: string; procedureId?: string; name?: string } | string | null | undefined
): string {
  if (!proc) return ''
  if (typeof proc === 'string') return proc.trim()
  const id = (proc.id || proc.procedureId || '').trim()
  if (id) return id
  return (proc.name || '').trim()
}

/**
 * Returns all indications linked via point-and-line to the given procedure,
 * merged and deduplicated with any manually selected indications.
 */
export function getLinkedIndicationsForProcedure(
  links: IndicationProcedureLinks | null | undefined,
  proc: { id?: string; procedureId?: string; name?: string } | string | null | undefined,
  manualIndications?: string[]
): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  const pushUnique = (list?: string[]) => {
    if (!Array.isArray(list)) return
    for (const raw of list) {
      if (typeof raw !== 'string') continue
      const trimmed = raw.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      result.push(trimmed)
    }
  }

  if (links && proc) {
    if (typeof proc === 'string') {
      pushUnique(links[proc.trim()])
    } else {
      const idKey = (proc.id || '').trim()
      const procIdKey = (proc.procedureId || '').trim()
      const nameKey = (proc.name || '').trim()
      if (idKey && links[idKey]) pushUnique(links[idKey])
      if (procIdKey && procIdKey !== idKey && links[procIdKey]) pushUnique(links[procIdKey])
      if (nameKey && links[nameKey]) pushUnique(links[nameKey])
    }
  }

  pushUnique(manualIndications)
  return result
}

/**
 * Returns how many procedures are currently linked to a given indication name.
 */
export function getLinkedProcedureCountForIndication(
  links: IndicationProcedureLinks | null | undefined,
  indicationName: string
): number {
  if (!links || !indicationName) return 0
  const target = indicationName.trim()
  if (!target) return 0
  let count = 0
  for (const key of Object.keys(links)) {
    const arr = links[key]
    if (Array.isArray(arr) && arr.includes(target)) {
      count += 1
    }
  }
  return count
}

/**
 * Returns details of all procedures linked to a given indication name.
 */
export function getLinkedProceduresForIndication(
  links: IndicationProcedureLinks | null | undefined,
  indicationName: string,
  procedures?: any[]
): Array<{ key: string; name: string; color?: string }> {
  if (!links || !indicationName) return []
  const target = indicationName.trim()
  if (!target) return []
  const matched: Array<{ key: string; name: string; color?: string }> = []
  for (const key of Object.keys(links)) {
    const arr = links[key]
    if (!Array.isArray(arr) || !arr.includes(target)) continue
    const found = Array.isArray(procedures)
      ? procedures.find((p: any) => p && (p.id === key || p.name === key))
      : undefined
    matched.push({
      key,
      name: found?.name || key,
      color: found?.color,
    })
  }
  return matched
}

/**
 * Toggles a line link between `procKey` and `indicationName`.
 */
export function toggleIndicationProcedureLink(
  links: IndicationProcedureLinks,
  procKey: string,
  indicationName: string
): IndicationProcedureLinks {
  const cleanProc = (procKey || '').trim()
  const cleanInd = (indicationName || '').trim()
  if (!cleanProc || !cleanInd) return links

  const current = Array.isArray(links[cleanProc]) ? links[cleanProc] : []
  const exists = current.includes(cleanInd)
  const nextList = exists
    ? current.filter(item => item !== cleanInd)
    : [...current, cleanInd]

  const next: IndicationProcedureLinks = { ...links }
  if (nextList.length === 0) {
    delete next[cleanProc]
  } else {
    next[cleanProc] = nextList
  }
  return next
}

/**
 * Explicitly adds a link between `procKey` and `indicationName` (idempotent).
 */
export function addIndicationProcedureLink(
  links: IndicationProcedureLinks,
  procKey: string,
  indicationName: string
): IndicationProcedureLinks {
  const cleanProc = (procKey || '').trim()
  const cleanInd = (indicationName || '').trim()
  if (!cleanProc || !cleanInd) return links

  const current = Array.isArray(links[cleanProc]) ? links[cleanProc] : []
  if (current.includes(cleanInd)) return links

  return {
    ...links,
    [cleanProc]: [...current, cleanInd],
  }
}

/**
 * Explicitly removes a link between `procKey` and `indicationName`.
 */
export function removeIndicationProcedureLink(
  links: IndicationProcedureLinks,
  procKey: string,
  indicationName: string
): IndicationProcedureLinks {
  const cleanProc = (procKey || '').trim()
  const cleanInd = (indicationName || '').trim()
  if (!cleanProc || !cleanInd || !Array.isArray(links[cleanProc])) return links

  const nextList = links[cleanProc].filter(item => item !== cleanInd)
  const next: IndicationProcedureLinks = { ...links }
  if (nextList.length === 0) {
    delete next[cleanProc]
  } else {
    next[cleanProc] = nextList
  }
  return next
}

/**
 * Removes an indication from all procedure links (e.g. when an indication is deleted/archived).
 */
export function removeIndicationFromLinks(
  links: IndicationProcedureLinks,
  indicationName: string
): IndicationProcedureLinks {
  const cleanInd = (indicationName || '').trim()
  if (!cleanInd || !links) return links

  let changed = false
  const next: IndicationProcedureLinks = {}

  for (const [procKey, list] of Object.entries(links)) {
    if (!Array.isArray(list)) continue
    const filtered = list.filter(item => item !== cleanInd)
    if (filtered.length !== list.length) {
      changed = true
    }
    if (filtered.length > 0) {
      next[procKey] = filtered
    }
  }

  return changed ? next : links
}

/**
 * Renames an indication across all procedure links (e.g. when an indication is edited in catalog).
 */
export function renameIndicationInLinks(
  links: IndicationProcedureLinks,
  oldName: string,
  newName: string
): IndicationProcedureLinks {
  const cleanOld = (oldName || '').trim()
  const cleanNew = (newName || '').trim()
  if (!cleanOld || !cleanNew || cleanOld === cleanNew || !links) return links

  let changed = false
  const next: IndicationProcedureLinks = {}

  for (const [procKey, list] of Object.entries(links)) {
    if (!Array.isArray(list)) continue
    if (!list.includes(cleanOld)) {
      if (list.length > 0) next[procKey] = list
      continue
    }
    changed = true
    const updated: string[] = []
    for (const item of list) {
      const val = item === cleanOld ? cleanNew : item
      if (!updated.includes(val)) {
        updated.push(val)
      }
    }
    if (updated.length > 0) {
      next[procKey] = updated
    }
  }

  return changed ? next : links
}

/**
 * Removes a procedure from `links` by its ID and/or name.
 */
export function removeProcedureFromLinks(
  links: IndicationProcedureLinks,
  procKey: string,
  procName?: string
): IndicationProcedureLinks {
  if (!links) return links
  const k1 = (procKey || '').trim()
  const k2 = (procName || '').trim()
  if ((!k1 || !(k1 in links)) && (!k2 || !(k2 in links))) return links
  const next: IndicationProcedureLinks = { ...links }
  if (k1) delete next[k1]
  if (k2) delete next[k2]
  return next
}

/* ============================================================================
 * 1. INDICATION PORT BUTTON (Right-side clickable & draggable connection point)
 * ========================================================================== */

export interface IndicationPortButtonProps {
  indicationName: string
  isConnectingFromThis?: boolean
  activeSourceIndication?: string | null
  linkedCount?: number
  links?: IndicationProcedureLinks
  linkedProcedureNames?: string[]
  onToggleConnectSource?: (indicationName: string) => void
  onClickPort?: (indicationName: string) => void
  onStartDragLink?: (indicationName: string) => void
  onEndDragLink?: () => void
  onDropProcedureLink?: (procKey: string, indicationName: string) => void
}

export function IndicationPortButton({
  indicationName,
  isConnectingFromThis,
  activeSourceIndication,
  linkedCount: linkedCountProp,
  links,
  linkedProcedureNames,
  onToggleConnectSource,
  onClickPort,
  onStartDragLink,
  onEndDragLink,
  onDropProcedureLink,
}: IndicationPortButtonProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const isSource =
    typeof isConnectingFromThis === 'boolean'
      ? isConnectingFromThis
      : activeSourceIndication === indicationName

  const computedLinkedCount = useMemo(() => {
    if (typeof linkedCountProp === 'number') return linkedCountProp
    return getLinkedProcedureCountForIndication(links, indicationName)
  }, [linkedCountProp, links, indicationName])

  const hasLinks = computedLinkedCount > 0

  const handleActivate = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (onToggleConnectSource) {
      onToggleConnectSource(indicationName)
    } else if (onClickPort) {
      onClickPort(indicationName)
    }
  }

  const tooltip = isSource
    ? `"${indicationName}" bağlantı modu aktif · Sağdaki bir tedavinin bağlantı noktasına tıklayın (İptal için tekrar tıklayın)`
    : hasLinks
      ? `"${indicationName}" (${computedLinkedCount} tedaviye bağlı${linkedProcedureNames?.length ? `: ${linkedProcedureNames.join(', ')}` : ''}) · Yeni tedaviye bağlamak için noktaya tıklayın veya sürükleyin`
      : `"${indicationName}" endikasyonunu bir tedaviye çizgi (line) ile bağlamak için noktaya tıklayın veya sürükleyin`

  return (
    <span
      role="button"
      tabIndex={0}
      draggable
      data-indication-port={indicationName}
      aria-label={`${indicationName} tedavi bağlantı noktası`}
      aria-pressed={isSource}
      title={tooltip}
      onClick={handleActivate}
      onDoubleClick={event => {
        event.stopPropagation()
        event.preventDefault()
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          handleActivate(event)
        }
      }}
      onDragStart={event => {
        event.stopPropagation()
        event.dataTransfer.effectAllowed = 'link'
        event.dataTransfer.setData(INDICATION_LINK_MIME, indicationName)
        event.dataTransfer.setData('text/plain', indicationName)
        onStartDragLink?.(indicationName)
      }}
      onDragEnd={event => {
        event.stopPropagation()
        onEndDragLink?.()
      }}
      onDragOver={event => {
        if (
          event.dataTransfer.types.includes(PROCEDURE_LINK_MIME) ||
          onDropProcedureLink
        ) {
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'link'
          if (!isDragOver) setIsDragOver(true)
        }
      }}
      onDragLeave={event => {
        event.stopPropagation()
        if (isDragOver) setIsDragOver(false)
      }}
      onDrop={event => {
        if (!onDropProcedureLink) return
        const procKey = event.dataTransfer.getData(PROCEDURE_LINK_MIME)
        if (procKey) {
          event.preventDefault()
          event.stopPropagation()
          setIsDragOver(false)
          onDropProcedureLink(procKey, indicationName)
        }
      }}
      style={{
        marginLeft: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
         gap: 4,
        padding: '2px 5px',
        borderRadius: 999,
        border: isSource
          ? '1.5px solid #2563eb'
          : isDragOver
            ? '1.5px dashed #0284c7'
            : hasLinks
              ? '1.5px solid var(--pc-blue, #0284c7)'
              : '1.5px solid var(--pc-border, var(--input-border, #94a3b8))',
        background: isSource
          ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
          : hasLinks
            ? 'var(--pc-tint, #e0f2fe)'
            : 'var(--card-bg, #ffffff)',
        color: isSource
          ? '#ffffff'
          : hasLinks
            ? 'var(--pc-tint-fg, #0284c7)'
            : 'var(--pc-muted, var(--foreground-2, #64748b))',
        boxShadow: isSource
          ? '0 0 0 3px rgba(37, 99, 235, 0.28), var(--pc-clay-primary)'
          : hasLinks
            ? 'var(--pc-clay-pale)'
            : 'var(--pc-clay-btn)',
        cursor: 'pointer',
        userSelect: 'none',
        flexShrink: 0,
        lineHeight: 1,
        transition: 'transform 0.12s ease, border-color 0.15s ease, background 0.15s ease',
      }}
    >
      {hasLinks && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: isSource ? '#ffffff' : 'var(--pc-tint-fg, #0284c7)',
            lineHeight: 1,
            paddingLeft: 1,
          }}
        >
          {computedLinkedCount}
        </span>
      )}
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: isSource
            ? '#ffffff'
            : hasLinks
              ? 'var(--pc-blue, #0284c7)'
              : 'transparent',
          border: isSource
            ? '2px solid #ffffff'
            : hasLinks
              ? '1.5px solid var(--card-bg, #ffffff)'
              : '2px solid currentColor',
          display: 'inline-block',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      />
    </span>
  )
}

/* ============================================================================
 * 2. PROCEDURE PORT BUTTON (Left-side target connection point + linked badge)
 * ========================================================================== */

export interface ProcedurePortButtonProps {
  procKey: string
  procedureName: string
  procedureColor?: string
  linkedIndications?: string[]
  links?: IndicationProcedureLinks
  activeSourceIndication: string | null
  onConnectOrToggle: (procKey: string, indicationName?: string) => void
  onRemoveLink: (procKey: string, indicationName: string) => void
}

export function ProcedurePortButton({
  procKey,
  procedureName,
  procedureColor,
  linkedIndications: linkedIndicationsProp,
  links,
  activeSourceIndication,
  onConnectOrToggle,
  onRemoveLink,
}: ProcedurePortButtonProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null)
  const portRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const resolvedLinked = useMemo(() => {
    if (Array.isArray(linkedIndicationsProp)) return linkedIndicationsProp
    return getLinkedIndicationsForProcedure(links, { id: procKey, name: procedureName })
  }, [linkedIndicationsProp, links, procKey, procedureName])

  const hasLinks = resolvedLinked.length > 0
  const isWaitingForTarget = Boolean(activeSourceIndication)
  const isAlreadyLinkedToActive =
    Boolean(activeSourceIndication) && resolvedLinked.includes(activeSourceIndication!)
  const accentColor = procedureColor || '#0284c7'

  useEffect(() => {
    if (!hasLinks && popoverPos) {
      setPopoverPos(null)
    }
  }, [hasLinks, popoverPos])

  useEffect(() => {
    if (!popoverPos) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setPopoverPos(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true } as any)
  }, [popoverPos])

  const openManagePopover = () => {
    if (!portRef.current) return
    const rect = portRef.current.getBoundingClientRect()
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768
    const width = 236
    const estHeight = Math.min(260, 84 + resolvedLinked.length * 32)
    const x = Math.max(10, Math.min(rect.left, vw - width - 12))
    const y = Math.max(10, Math.min(rect.bottom + 6, vh - estHeight - 12))
    setPopoverPos({ x, y })
  }

  const handlePortClick = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation()
    event.preventDefault()

    if (activeSourceIndication) {
      onConnectOrToggle(procKey, activeSourceIndication)
      return
    }

    if (hasLinks) {
      if (popoverPos) {
        setPopoverPos(null)
      } else {
        openManagePopover()
      }
      return
    }

    onConnectOrToggle(procKey)
  }

  const tooltip = activeSourceIndication
    ? isAlreadyLinkedToActive
      ? `"${activeSourceIndication}" ↔ "${procedureName}" bağlantısını kaldırmak için tıklayın`
      : `"${activeSourceIndication}" endikasyonunu "${procedureName}" tedavisine bağlamak için tıklayın`
    : hasLinks
      ? `Bağlı endikasyonlar (${resolvedLinked.length}): ${resolvedLinked.join(', ')} · Bağlantıları yönetmek veya kaldırmak için tıklayın`
      : `"${procedureName}" tedavisine endikasyon bağlamak için önce soldaki bir endikasyonun bağlantı noktasına tıklayın veya buraya sürükleyin`

  return (
    <>
      <span
        ref={portRef}
        role="button"
        tabIndex={0}
        data-procedure-port={procKey}
        data-procedure-name={procedureName}
        aria-label={`${procedureName} endikasyon bağlantı noktası`}
        title={tooltip}
        onClick={handlePortClick}
        onDoubleClick={event => {
          event.stopPropagation()
          event.preventDefault()
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            handlePortClick(event)
          }
        }}
        onDragOver={event => {
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'link'
          if (!isDragOver) setIsDragOver(true)
        }}
        onDragLeave={event => {
          event.stopPropagation()
          if (isDragOver) setIsDragOver(false)
        }}
        onDrop={event => {
          const droppedIndication =
            event.dataTransfer.getData(INDICATION_LINK_MIME) ||
            event.dataTransfer.getData('text/plain')
          if (droppedIndication && !droppedIndication.trim().startsWith('{')) {
            event.preventDefault()
            event.stopPropagation()
            setIsDragOver(false)
            onConnectOrToggle(procKey, droppedIndication.trim())
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: hasLinks ? '2px 5px 2px 4px' : '2px 4px',
          borderRadius: 999,
          border: isDragOver
            ? '1.5px solid #2563eb'
            : isWaitingForTarget
              ? isAlreadyLinkedToActive
                ? '1.5px solid var(--danger, #ef4444)'
                : '1.5px dashed #2563eb'
              : hasLinks
                ? `1.5px solid ${accentColor}`
                : '1.5px solid var(--pc-border, var(--input-border, #94a3b8))',
          background: isDragOver
            ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
            : isWaitingForTarget
              ? 'var(--pc-tint, #e0f2fe)'
              : hasLinks
                ? 'var(--pc-tint, #e0f2fe)'
                : 'var(--card-bg, #ffffff)',
          color: isDragOver
            ? '#ffffff'
            : hasLinks || isWaitingForTarget
              ? 'var(--pc-tint-fg, #0284c7)'
              : 'var(--pc-muted, var(--foreground-2, #64748b))',
          boxShadow:
            isDragOver || isWaitingForTarget
              ? '0 0 0 2px rgba(37, 99, 235, 0.2), var(--pc-clay-pale)'
              : hasLinks
                ? 'var(--pc-clay-pale)'
                : 'var(--pc-clay-btn)',
          cursor: 'pointer',
          userSelect: 'none',
          flexShrink: 0,
          lineHeight: 1,
          transition: 'transform 0.12s ease, border-color 0.15s ease, background 0.15s ease',
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: isDragOver
              ? '#ffffff'
              : hasLinks
                ? accentColor
                : isWaitingForTarget
                  ? '#2563eb'
                  : 'transparent',
            border: isDragOver
              ? '2px solid #ffffff'
              : hasLinks
                ? '1.5px solid var(--card-bg, #ffffff)'
                : isWaitingForTarget
                  ? '1.5px solid #2563eb'
                  : '2px solid currentColor',
            display: 'inline-block',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        />
        {hasLinks && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 10,
              fontWeight: 800,
              color: isDragOver ? '#ffffff' : 'var(--pc-tint-fg, #0284c7)',
              lineHeight: 1,
            }}
          >
            <Link2 size={9} style={{ flexShrink: 0 }} />
            <span>{resolvedLinked.length}</span>
          </span>
        )}
      </span>

      {popoverPos &&
        hasLinks &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100030,
              background: 'transparent',
            }}
            onClick={event => {
              event.stopPropagation()
              setPopoverPos(null)
            }}
            onContextMenu={event => {
              event.preventDefault()
              setPopoverPos(null)
            }}
          >
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={`${procedureName} bağlı endikasyonlar`}
              onClick={event => event.stopPropagation()}
              style={{
                position: 'fixed',
                left: popoverPos.x,
                top: popoverPos.y,
                width: 236,
                maxWidth: 'calc(100vw - 24px)',
                borderRadius: 11,
                border: '1.5px solid var(--input-border, #334155)',
                background: 'var(--card-bg)',
                color: 'var(--foreground)',
                boxShadow: 'var(--pc-modal-shadow, 0 18px 40px -10px rgba(15, 23, 42, 0.45))',
                overflow: 'hidden',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  padding: '8px 10px',
                  background: 'var(--card-inner, var(--pc-surface))',
                  borderBottom: '1px solid var(--input-border, #334155)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: accentColor,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 750,
                      color: 'var(--foreground)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {procedureName} · Bağlı Endikasyonlar
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Kapat"
                  onClick={() => setPopoverPos(null)}
                  style={{
                    width: 20,
                    height: 20,
                    display: 'inline-grid',
                    placeItems: 'center',
                    padding: 0,
                    borderRadius: 5,
                    border: '1px solid var(--input-border, #334155)',
                    background: 'var(--card-bg)',
                    color: 'var(--foreground-2)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <X size={11} />
                </button>
              </div>

              <div
                style={{
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  maxHeight: 190,
                  overflowY: 'auto',
                }}
              >
                {resolvedLinked.map(indName => (
                  <div
                    key={indName}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      padding: '5px 8px',
                      borderRadius: 7,
                      border: '1px solid var(--input-border, #334155)',
                      background: 'var(--card-bg)',
                      fontSize: 11.5,
                      fontWeight: 650,
                      color: 'var(--foreground)',
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}
                    >
                      {indName}
                    </span>
                    <button
                      type="button"
                      title={`"${indName}" bağlantısını kopar`}
                      aria-label={`${indName} bağlantısını kopar`}
                      onClick={() => {
                        onRemoveLink(procKey, indName)
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 6px',
                        borderRadius: 5,
                        border: '1px solid var(--danger, #ef4444)',
                        background: 'var(--card-bg)',
                        color: 'var(--danger, #ef4444)',
                        fontSize: 10.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <Unlink size={10} />
                      <span>Kopar</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

/* ============================================================================
 * 3. SVG BEZIER LINE OVERLAY (IndicationProcedureLinkOverlay)
 * ========================================================================== */

export interface IndicationProcedureLinkOverlayProps {
  workgridRef: React.RefObject<HTMLElement | null>
  indicationListRef?: React.RefObject<HTMLElement | null>
  procedureListRef?: React.RefObject<HTMLElement | null>
  links: IndicationProcedureLinks
  activeSourceIndication: string | null
  procedures: any[]
  resolveProcColor?: (proc: any) => string
  onRemoveLink: (procKey: string, indicationName: string) => void
  onCancelConnect?: () => void
}

interface ComputedLineSegment {
  id: string
  procKey: string
  indicationName: string
  x1: number
  y1: number
  x2: number
  y2: number
  mx: number
  my: number
  path: string
  color: string
}

interface PreviewSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  path: string
}

function buildCubicBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(32, Math.abs(x2 - x1) * 0.46)
  const cx1 = x1 + dx
  const cy1 = y1
  const cx2 = x2 - dx
  const cy2 = y2
  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
}

function isRectVisibleInScrollContainer(
  portRect: DOMRect,
  listEl: HTMLElement | null | undefined
): boolean {
  if (portRect.width === 0 && portRect.height === 0) return false
  if (!listEl) return true
  const listRect = listEl.getBoundingClientRect()
  const cy = portRect.top + portRect.height / 2
  return cy >= listRect.top - 4 && cy <= listRect.bottom + 4
}

export function IndicationProcedureLinkOverlay({
  workgridRef,
  indicationListRef,
  procedureListRef,
  links,
  activeSourceIndication,
  procedures,
  resolveProcColor,
  onRemoveLink,
  onCancelConnect,
}: IndicationProcedureLinkOverlayProps) {
  const svgId = useId()
  const [segments, setSegments] = useState<ComputedLineSegment[]>([])
  const [sourceAnchor, setSourceAnchor] = useState<{ x: number; y: number } | null>(null)
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null)
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null)
  const rafRef = useRef<number | null>(null)

  const getColorForProcedure = useCallback(
    (procKey: string): string => {
      const found = Array.isArray(procedures)
        ? procedures.find(
            (p: any) => p && (p.id === procKey || p.name === procKey)
          )
        : undefined
      if (found) {
        if (resolveProcColor) return resolveProcColor(found)
        if (typeof found.color === 'string' && found.color.trim()) return found.color.trim()
      }
      return '#0284c7'
    },
    [procedures, resolveProcColor]
  )

  const measurePositions = useCallback(() => {
    const workgridEl = workgridRef.current
    if (!workgridEl) {
      setSegments([])
      setSourceAnchor(null)
      return
    }

    if (typeof window !== 'undefined') {
      const computedPos = window.getComputedStyle(workgridEl).position
      if (computedPos === 'static') {
        workgridEl.style.position = 'relative'
      }
    }

    const gridRect = workgridEl.getBoundingClientRect()
    if (gridRect.width === 0 || gridRect.height === 0) {
      setSegments([])
      setSourceAnchor(null)
      return
    }

    const indicationPorts = new Map<string, HTMLElement>()
    workgridEl.querySelectorAll<HTMLElement>('[data-indication-port]').forEach(el => {
      const key = el.getAttribute('data-indication-port')
      if (key) indicationPorts.set(key, el)
    })

    const procedurePorts = new Map<string, HTMLElement>()
    workgridEl.querySelectorAll<HTMLElement>('[data-procedure-port]').forEach(el => {
      const key = el.getAttribute('data-procedure-port')
      if (key) procedurePorts.set(key, el)
      const nameAlias = el.getAttribute('data-procedure-name')
      if (nameAlias && !procedurePorts.has(nameAlias)) {
        procedurePorts.set(nameAlias, el)
      }
    })

    const nextSegments: ComputedLineSegment[] = []
    const indListEl = indicationListRef?.current
    const procListEl = procedureListRef?.current

    if (links) {
      for (const [procKey, indNames] of Object.entries(links)) {
        if (!Array.isArray(indNames) || indNames.length === 0) continue
        const procEl = procedurePorts.get(procKey)
        if (!procEl) continue
        const procRect = procEl.getBoundingClientRect()
        if (!isRectVisibleInScrollContainer(procRect, procListEl)) continue

        const x2 = procRect.left + procRect.width / 2 - gridRect.left
        const y2 = procRect.top + procRect.height / 2 - gridRect.top
        const color = getColorForProcedure(procKey)

        for (const indName of indNames) {
          const indEl = indicationPorts.get(indName)
          if (!indEl) continue
          const indRect = indEl.getBoundingClientRect()
          if (!isRectVisibleInScrollContainer(indRect, indListEl)) continue

          const x1 = indRect.left + indRect.width / 2 - gridRect.left
          const y1 = indRect.top + indRect.height / 2 - gridRect.top
          const mx = (x1 + x2) / 2
          const my = (y1 + y2) / 2

          nextSegments.push({
            id: `${procKey}::${indName}`,
            procKey,
            indicationName: indName,
            x1,
            y1,
            x2,
            y2,
            mx,
            my,
            path: buildCubicBezierPath(x1, y1, x2, y2),
            color,
          })
        }
      }
    }

    setSegments(nextSegments)

    if (activeSourceIndication) {
      const srcEl = indicationPorts.get(activeSourceIndication)
      if (srcEl) {
        const srcRect = srcEl.getBoundingClientRect()
        if (isRectVisibleInScrollContainer(srcRect, indListEl)) {
          setSourceAnchor({
            x: srcRect.left + srcRect.width / 2 - gridRect.left,
            y: srcRect.top + srcRect.height / 2 - gridRect.top,
          })
        } else {
          setSourceAnchor(null)
        }
      } else {
        setSourceAnchor(null)
      }
    } else {
      setSourceAnchor(null)
    }
  }, [workgridRef, indicationListRef, procedureListRef, links, activeSourceIndication, getColorForProcedure])

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      measurePositions()
    })
  }, [measurePositions])

  useLayoutEffect(() => {
    measurePositions()
  }, [measurePositions])

  useEffect(() => {
    const workgridEl = workgridRef.current
    const indListEl = indicationListRef?.current
    const procListEl = procedureListRef?.current

    const handleScrollOrResize = () => scheduleMeasure()

    window.addEventListener('resize', handleScrollOrResize, { passive: true })
    indListEl?.addEventListener('scroll', handleScrollOrResize, { passive: true })
    procListEl?.addEventListener('scroll', handleScrollOrResize, { passive: true })

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduleMeasure())
      if (workgridEl) resizeObserver.observe(workgridEl)
      if (indListEl) resizeObserver.observe(indListEl)
      if (procListEl) resizeObserver.observe(procListEl)
    }

    return () => {
      window.removeEventListener('resize', handleScrollOrResize)
      indListEl?.removeEventListener('scroll', handleScrollOrResize)
      procListEl?.removeEventListener('scroll', handleScrollOrResize)
      resizeObserver?.disconnect()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [workgridRef, indicationListRef, procedureListRef, scheduleMeasure])

  useEffect(() => {
    if (!activeSourceIndication) {
      setPointerPos(null)
      return
    }

    const updateMouse = (clientX: number, clientY: number) => {
      const workgridEl = workgridRef.current
      if (!workgridEl) return
      const rect = workgridEl.getBoundingClientRect()
      setPointerPos({
        x: clientX - rect.left,
        y: clientY - rect.top,
      })
    }

    const handleMouseMove = (event: MouseEvent) => {
      updateMouse(event.clientX, event.clientY)
    }

    const handleDragOver = (event: DragEvent) => {
      updateMouse(event.clientX, event.clientY)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancelConnect?.()
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('dragover', handleDragOver, { passive: true })
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeSourceIndication, workgridRef, onCancelConnect])

  const previewSegment = useMemo<PreviewSegment | null>(() => {
    if (!activeSourceIndication || !sourceAnchor || !pointerPos) return null
    const dist = Math.hypot(pointerPos.x - sourceAnchor.x, pointerPos.y - sourceAnchor.y)
    if (dist < 8) return null
    return {
      x1: sourceAnchor.x,
      y1: sourceAnchor.y,
      x2: pointerPos.x,
      y2: pointerPos.y,
      path: buildCubicBezierPath(sourceAnchor.x, sourceAnchor.y, pointerPos.x, pointerPos.y),
    }
  }, [activeSourceIndication, sourceAnchor, pointerPos])

  if (segments.length === 0 && !previewSegment) {
    return null
  }

  return (
    <div
      aria-hidden="false"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 14,
        overflow: 'visible',
      }}
    >
      <svg
        key={svgId}
        width="100%"
        height="100%"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        {segments.map(seg => {
          const isHovered = hoveredSegmentId === seg.id
          return (
            <g key={seg.id}>
              {/* Solid contrast casing so the curve stays crisp across borders */}
              <path
                d={seg.path}
                fill="none"
                stroke="var(--card-bg, #ffffff)"
                strokeWidth={isHovered ? 5.5 : 4.2}
                strokeLinecap="round"
              />
              {/* Main procedure-colored Bezier curve */}
              <path
                d={seg.path}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHovered ? 2.8 : 2.1}
                strokeLinecap="round"
              />
              {/* Start & End Anchor Dots */}
              <circle
                cx={seg.x1}
                cy={seg.y1}
                r={3.6}
                fill={seg.color}
                stroke="var(--card-bg, #ffffff)"
                strokeWidth={1.4}
              />
              <circle
                cx={seg.x2}
                cy={seg.y2}
                r={3.6}
                fill={seg.color}
                stroke="var(--card-bg, #ffffff)"
                strokeWidth={1.4}
              />
            </g>
          )
        })}

        {previewSegment && (
          <g>
            <path
              d={previewSegment.path}
              fill="none"
              stroke="var(--card-bg, #ffffff)"
              strokeWidth={4}
              strokeLinecap="round"
            />
            <path
              d={previewSegment.path}
              fill="none"
              stroke="var(--pc-blue, #0284c7)"
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
            <circle
              cx={previewSegment.x1}
              cy={previewSegment.y1}
              r={4}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={1.5}
            />
            <circle
              cx={previewSegment.x2}
              cy={previewSegment.y2}
              r={3.5}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={1.2}
            />
          </g>
        )}
      </svg>

      {/* Interactive Midpoint Unlink (×) Buttons */}
      {segments.map(seg => {
        const isHovered = hoveredSegmentId === seg.id
        return (
          <button
            key={`btn-${seg.id}`}
            type="button"
            title={`"${seg.indicationName}" bağlantısını kopar`}
            aria-label={`${seg.indicationName} bağlantısını kaldır`}
            onMouseEnter={() => setHoveredSegmentId(seg.id)}
            onMouseLeave={() => setHoveredSegmentId(prev => (prev === seg.id ? null : prev))}
            onClick={event => {
              event.stopPropagation()
              event.preventDefault()
              onRemoveLink(seg.procKey, seg.indicationName)
            }}
            style={{
              position: 'absolute',
              left: seg.mx,
              top: seg.my,
              transform: 'translate(-50%, -50%)',
              width: isHovered ? 18 : 15,
              height: isHovered ? 18 : 15,
              borderRadius: '50%',
              border: `1.5px solid ${isHovered ? 'var(--danger, #ef4444)' : seg.color}`,
              background: 'var(--card-bg, #ffffff)',
              color: isHovered ? 'var(--danger, #ef4444)' : 'var(--foreground, #0f172a)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              fontSize: 10,
              fontWeight: 800,
              lineHeight: 1,
              cursor: 'pointer',
              pointerEvents: 'auto',
              boxShadow: '0 2px 5px rgba(15, 23, 42, 0.22)',
              transition: 'width 0.12s ease, height 0.12s ease, border-color 0.12s ease, color 0.12s ease',
            }}
          >
            ×
          </button>
        )
      })}
    </div>
  )
}

export default IndicationProcedureLinkOverlay
