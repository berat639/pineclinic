import React from 'react'

export const UPPER_TEETH = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
export const LOWER_TEETH = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

export const ToothChip = ({ number, selected, multiSelected, onClick, onDoubleClick, onContextMenu, onDragOver, onDrop, hasDraft, colors = [] }: any) => {
  const isSelected = Boolean(selected || multiSelected);
  const activeColors: string[] = Array.isArray(colors) && colors.length > 0 ? colors : (hasDraft ? ['#0284c7'] : []);
  const effectiveHasDraft = Boolean(hasDraft || activeColors.length > 0);

  return (
    <button
      type="button"
      aria-label={`${number} numaralı diş`}
      aria-pressed={isSelected}
      data-has-draft={effectiveHasDraft ? 'true' : undefined}
      data-selected={isSelected ? 'true' : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={event => {
        if (onContextMenu && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onContextMenu({ preventDefault: () => {}, clientX: rect.left, clientY: rect.bottom });
        }
      }}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={`Diş ${number}`}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: isSelected
          ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)'
          : 'var(--input-bg)',
        border: isSelected
          ? '1.5px solid #1d4ed8'
          : '1px solid var(--glass-border, #334155)',
        borderRadius: 6,
        padding: '9px 3px 4px',
        cursor: 'pointer',
        color: isSelected ? '#ffffff' : 'var(--foreground)',
        minWidth: 0, flex: 1, maxWidth: 48, flexShrink: 1,
        boxShadow: isSelected
          ? (multiSelected ? '0 0 0 2px var(--accent, #3b82f6), var(--pc-clay-primary)' : 'var(--pc-clay-primary)')
          : 'none',
        transition: 'all 0.15s ease'
      }}
    >
      {activeColors.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: 3,
            right: 3,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 3,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {activeColors.slice(0, 4).map((color: string, i: number) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
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
      <svg
        style={{ width: '80%', maxWidth: 24, height: 'auto' }}
        viewBox="0 0 24 28"
        fill={isSelected ? 'var(--btn-clinic-primary-bg)' : 'var(--btn-clinic-blue-bg)'}
        stroke={isSelected ? '#ffffff' : 'var(--accent)'}
        strokeWidth="2"
      >
        <path d="M6 2C3 2 2 5 2 8s1 8 2 16c.3 1.5 1 2 2.5 2s2.3-1 2.5-2.5v-4h6v4c.2 1.5 1 2.5 2.5 2.5S20 24.5 20 23c1-8 2-13 2-16 0-3-1-6-4-6-2.5 0-4 2-5 3.5C12 3 10.5 2 8 2z"/>
      </svg>
      <span
        style={{
          fontSize: 'clamp(9px, 1.5vw, 11px)',
          fontWeight: 700,
          lineHeight: 1,
          color: isSelected ? '#ffffff' : 'var(--foreground)',
        }}
      >
        {number}
      </span>
    </button>
  )
}

export const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--foreground)',
  fontSize: '0.8rem',
  outline: 'none',
}
