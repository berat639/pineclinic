import React from 'react'

interface PatientListItemProps {
  patient: any
  isExpanded: boolean
  onClick: () => void
}

export default function PatientListItem({ patient, isExpanded, onClick }: PatientListItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: isExpanded ? 'var(--input-bg)' : 'transparent',
        borderBottom: '1px solid var(--glass-border)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        color: 'var(--foreground)'
      }}
      onMouseOver={e => !isExpanded && (e.currentTarget.style.background = 'var(--input-bg)')}
      onMouseOut={e => !isExpanded && (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--foreground-3)', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          ▶
        </span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{patient.name}</span>
        </div>
      </div>
      {patient.phone && (
        <span style={{ fontSize: '0.75rem', color: 'var(--foreground-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
          📞 {patient.phone}
        </span>
      )}
    </div>
  )
}
