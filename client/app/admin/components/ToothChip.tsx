import React from 'react'

export const UPPER_TEETH = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
export const LOWER_TEETH = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

export const ToothChip = ({ number, selected, multiSelected, onClick, onDragOver, onDrop, hasDraft }: any) => {
  const isSelected = selected || multiSelected;
  return (
    <button
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={`Diş ${number}`}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: isSelected ? 'var(--accent)' : 'transparent',
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--glass-border)'}`,
        borderRadius: 6, padding: '3px 2px', cursor: 'pointer',
        color: isSelected ? '#fff' : 'var(--foreground-2)',
        minWidth: 22, width: 22, flexShrink: 0,
        boxShadow: multiSelected ? '0 0 8px var(--accent)' : 'none',
        transition: 'all 0.15s'
      }}
    >
      {hasDraft && <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#ef4444', border: '1px solid var(--background)' }} />}
      <svg width="12" height="14" viewBox="0 0 24 28" fill={isSelected ? 'rgba(255,255,255,0.6)' : 'rgba(100,120,180,0.3)'} stroke={isSelected ? '#fff' : '#6b7fc4'} strokeWidth="2">
        <path d="M6 2C3 2 2 5 2 8s1 8 2 16c.3 1.5 1 2 2.5 2s2.3-1 2.5-2.5v-4h6v4c.2 1.5 1 2.5 2.5 2.5S20 24.5 20 23c1-8 2-13 2-16 0-3-1-6-4-6-2.5 0-4 2-5 3.5C12 3 10.5 2 8 2z"/>
      </svg>
      <span style={{ fontSize: 8, fontWeight: 700, lineHeight: 1 }}>{number}</span>
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
