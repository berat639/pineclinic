import React from 'react'
import { X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import styles from './PineTreatmentPlan.module.css'

export interface OdontogramSelectionBarProps {
  selected: number[]
  setSelected: React.Dispatch<React.SetStateAction<number[]>>
  drafts: Record<string, any[]>
  setDrafts: React.Dispatch<React.SetStateAction<any>>
  resolveProcColor: (item: any) => string
  onToothClick?: (tooth: number, event: React.MouseEvent) => void
  onToothContextMenu?: (tooth: number, event: React.MouseEvent) => void
}

const REGION_LABELS: Record<string, string> = {
  upper: 'Üst Çene',
  lower: 'Alt Çene',
  general: 'Tüm Ağız',
}

const REGION_ORDER = ['upper', 'lower', 'general']

export function OdontogramSelectionBar({
  selected,
  setSelected,
  drafts,
  setDrafts,
  resolveProcColor,
  onToothClick,
  onToothContextMenu,
}: OdontogramSelectionBarProps) {
  const safeSelected = Array.isArray(selected) ? selected : []
  const safeDrafts = drafts || {}

  // Collect all unique numeric teeth (from selection + drafts) and region keys (from drafts)
  const numericTeethSet = new Set<number>(safeSelected)
  const activeRegions: string[] = []

  for (const [key, list] of Object.entries(safeDrafts)) {
    if (!Array.isArray(list) || list.length === 0) continue
    if (/^[1-4][1-8]$/.test(key)) {
      numericTeethSet.add(Number(key))
    } else if (REGION_ORDER.includes(key)) {
      activeRegions.push(key)
    }
  }

  const sortedTeeth = Array.from(numericTeethSet).sort((a, b) => a - b)
  const sortedRegions = activeRegions.sort(
    (a, b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b)
  )

  const totalAssignedProcedures =
    sortedTeeth.reduce((sum, t) => sum + ((safeDrafts[String(t)] || []).length), 0) +
    sortedRegions.reduce((sum, r) => sum + ((safeDrafts[r] || []).length), 0)

  if (sortedTeeth.length === 0 && sortedRegions.length === 0) {
    return null
  }

  const handleToggleTooth = (tooth: number, event: React.MouseEvent) => {
    if (onToothClick) {
      onToothClick(tooth, event)
      return
    }
    setSelected(prev =>
      prev.includes(tooth) ? prev.filter(n => n !== tooth) : [...prev, tooth]
    )
  }

  const handleDeselectTooth = (tooth: number) => {
    setSelected(prev => prev.filter(n => n !== tooth))
  }

  const handleRemoveProcedure = (targetKey: string, item: any, itemIndex: number) => {
    if (item?.locked) return
    if (item?.wasCompleted || item?.status === 'completed') {
      toast(
        '⚠️ Tamamlanmış bir işlem kaldırıldı. Planı kaydederken onayınız istenecektir.',
        { icon: '⚠️', id: 'completed-edit-warn' }
      )
    }
    setDrafts((previous: Record<string, any[]>) => {
      const currentList = Array.isArray(previous?.[targetKey]) ? previous[targetKey] : []
      const nextList = item?.id
        ? currentList.filter((row: any) => row.id !== item.id)
        : currentList.filter((_: any, idx: number) => idx !== itemIndex)
      const next = { ...previous }
      if (nextList.length > 0) {
        next[targetKey] = nextList
      } else {
        delete next[targetKey]
      }
      return next
    })
  }

  return (
    <div
      role="region"
      aria-label="Seçili dişler ve atanan tedaviler özeti"
      style={{
        marginTop: 7,
        padding: '7px 10px',
        borderRadius: 11,
        border: '1px solid var(--pc-border)',
        background: 'var(--pc-surface)',
        boxShadow: 'var(--pc-neo-inset)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {/* Left clinical status badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          paddingRight: 6,
          marginRight: 2,
          borderRight: '1px solid var(--pc-border)',
          fontSize: 11.5,
          fontWeight: 700,
          color: 'var(--pc-muted)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <span>Diş &amp; İşlem:</span>
        {safeSelected.length > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '1px 6px',
              borderRadius: 999,
              background: 'var(--pc-tint)',
              border: '1px solid var(--pc-border)',
              color: 'var(--pc-tint-fg)',
              fontSize: 11,
              fontWeight: 750,
            }}
          >
            {safeSelected.length} seçili
          </span>
        )}
        {totalAssignedProcedures > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '1px 6px',
              borderRadius: 999,
              background: 'var(--card-bg)',
              border: '1px solid var(--pc-border)',
              color: 'var(--foreground)',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {totalAssignedProcedures} tedavi
          </span>
        )}
      </div>

      {/* Tooth Capsules */}
      {sortedTeeth.map(tooth => {
        const targetKey = String(tooth)
        const isSelected = safeSelected.includes(tooth)
        const items: any[] = Array.isArray(safeDrafts[targetKey]) ? safeDrafts[targetKey] : []

        return (
          <div
            key={`tooth-capsule-${tooth}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 4,
              padding: 3,
              borderRadius: 9,
              background: 'var(--card-bg)',
              border: isSelected
                ? '1.5px solid var(--pc-blue)'
                : '1px solid var(--pc-border)',
              boxShadow: 'var(--pc-clay-btn)',
              maxWidth: '100%',
            }}
          >
            {/* Tooth Number Pill */}
            <button
              type="button"
              className={isSelected ? styles.primary : styles.pale}
              aria-pressed={isSelected}
              title={
                isSelected
                  ? `Diş #${tooth} (Seçili · Tıkla: Seçimi kaldır · Sağ tık: İşlem menüsü)`
                  : `Diş #${tooth} (Tıkla: Seç · Sağ tık: İşlem menüsü)`
              }
              onClick={event => handleToggleTooth(tooth, event)}
              onContextMenu={event => {
                if (onToothContextMenu) {
                  event.preventDefault()
                  onToothContextMenu(tooth, event)
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px 7px',
                borderRadius: 6,
                border: isSelected
                  ? '1px solid var(--pc-blue)'
                  : '1px solid var(--pc-border)',
                background: isSelected ? 'var(--pc-blue)' : 'var(--pc-tint)',
                color: isSelected ? '#ffffff' : 'var(--pc-tint-fg)',
                fontSize: 11.5,
                fontWeight: 800,
                lineHeight: 1.25,
                cursor: 'pointer',
                boxShadow: isSelected ? 'var(--pc-clay-primary)' : 'none',
                flexShrink: 0,
              }}
            >
              <span style={{ color: isSelected ? '#ffffff' : 'var(--pc-tint-fg)' }}>
                #{tooth}
              </span>
            </button>

            {/* Assigned Treatment Mini-Badges */}
            {items.length > 0 ? (
              items.map((item: any, idx: number) => {
                const procColor = resolveProcColor ? resolveProcColor(item) : (item?.color || '#0284c7')
                const isCompleted = Boolean(item?.wasCompleted || item?.status === 'completed')

                return (
                  <span
                    key={`${targetKey}-${item?.id || item?.name || idx}-${idx}`}
                    title={`${tooth} numaralı diş · ${item?.name || 'İşlem'}${isCompleted ? ' (Tamamlandı)' : ''}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: 'var(--pc-surface)',
                      border: '1px solid var(--pc-border)',
                      color: 'var(--foreground)',
                      fontSize: 11.5,
                      fontWeight: 650,
                      lineHeight: 1.25,
                      maxWidth: 210,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: procColor,
                        boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.18)',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--foreground)',
                      }}
                    >
                      {item?.name}
                    </span>
                    {!item?.locked && (
                      <button
                        type="button"
                        aria-label={`#${tooth} ${item?.name} işlemini kaldır`}
                        title={`${item?.name} işlemini kaldır`}
                        onClick={event => {
                          event.stopPropagation()
                          handleRemoveProcedure(targetKey, item, idx)
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 15,
                          height: 15,
                          padding: 0,
                          marginLeft: 1,
                          borderRadius: 4,
                          border: 0,
                          background: 'var(--pc-tint)',
                          color: 'var(--danger, #ef4444)',
                          cursor: 'pointer',
                          flexShrink: 0,
                          lineHeight: 1,
                        }}
                      >
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    )}
                  </span>
                )
              })
            ) : (
              /* Selected tooth with no treatments assigned yet */
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '1px 5px 1px 4px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--pc-muted)',
                }}
              >
                <span>Seçili</span>
                <button
                  type="button"
                  aria-label={`#${tooth} seçimini kaldır`}
                  title={`#${tooth} seçimini kaldır`}
                  onClick={event => {
                    event.stopPropagation()
                    handleDeselectTooth(tooth)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 15,
                    height: 15,
                    padding: 0,
                    borderRadius: 4,
                    border: 0,
                    background: 'var(--pc-surface)',
                    color: 'var(--pc-muted)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  <X size={11} strokeWidth={2.4} />
                </button>
              </span>
            )}
          </div>
        )
      })}

      {/* Jaw / Mouth Region Capsules (when assigned) */}
      {sortedRegions.map(regionKey => {
        const items: any[] = Array.isArray(safeDrafts[regionKey]) ? safeDrafts[regionKey] : []
        const label = REGION_LABELS[regionKey] || regionKey

        return (
          <div
            key={`region-capsule-${regionKey}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 4,
              padding: 3,
              borderRadius: 9,
              background: 'var(--card-bg)',
              border: '1px solid var(--pc-border)',
              boxShadow: 'var(--pc-clay-btn)',
              maxWidth: '100%',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 7px',
                borderRadius: 6,
                border: '1px solid var(--pc-border)',
                background: 'var(--pc-tint)',
                color: 'var(--pc-tint-fg)',
                fontSize: 11.5,
                fontWeight: 800,
                lineHeight: 1.25,
                flexShrink: 0,
              }}
            >
              {label}
            </span>
            {items.map((item: any, idx: number) => {
              const procColor = resolveProcColor ? resolveProcColor(item) : (item?.color || '#0284c7')
              const isCompleted = Boolean(item?.wasCompleted || item?.status === 'completed')

          return (
            <span
              key={`${regionKey}-${item?.id || item?.name || idx}-${idx}`}
              title={`${label} · ${item?.name || 'İşlem'}${isCompleted ? ' (Tamamlandı)' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 6px',
                borderRadius: 6,
                background: 'var(--pc-surface)',
                border: '1px solid var(--pc-border)',
                color: 'var(--foreground)',
                fontSize: 11.5,
                fontWeight: 650,
                lineHeight: 1.25,
                maxWidth: 210,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: procColor,
                  boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.18)',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--foreground)',
                }}
              >
                {item?.name}
              </span>
              {!item?.locked && (
                <button
                  type="button"
                  aria-label={`${label} ${item?.name} işlemini kaldır`}
                  title={`${item?.name} işlemini kaldır`}
                  onClick={event => {
                    event.stopPropagation()
                    handleRemoveProcedure(regionKey, item, idx)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 15,
                    height: 15,
                    padding: 0,
                    marginLeft: 1,
                    borderRadius: 4,
                    border: 0,
                    background: 'var(--pc-tint)',
                    color: 'var(--danger, #ef4444)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </span>
          )
        })}
      </div>
    )
  })}

      {safeSelected.length > 0 && (
        <button
          type="button"
          onClick={() => setSelected([])}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            borderRadius: 7,
            border: '1px solid var(--pc-border)',
            background: 'var(--card-bg)',
            color: 'var(--pc-tint-fg)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: 'var(--pc-clay-btn)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <X size={11} strokeWidth={2.4} />
          <span>Seçimi Temizle</span>
        </button>
      )}
    </div>
  )
}

export default OdontogramSelectionBar
