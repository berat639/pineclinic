import React from 'react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export default function Pagination({
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange
}: PaginationProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--glass-bg)', borderTop: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--foreground-2)' }}>Sayfa başı:</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value))
            onPageChange(1) // Reset to page 1 on page size change
          }}
          style={{
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            color: 'var(--foreground)',
            borderRadius: 4,
            padding: '2px 4px',
            fontSize: '0.8rem',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="10">10</option>
          <option value="15">15</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={{
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            color: currentPage === 1 ? 'var(--foreground-3)' : 'var(--foreground)',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          ◀
        </button>
        <span style={{ color: 'var(--foreground-2)', fontWeight: 500 }}>
          {currentPage} / {Math.max(1, totalPages)}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || totalPages === 0}
          style={{
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            color: currentPage === totalPages || totalPages === 0 ? 'var(--foreground-3)' : 'var(--foreground)',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          ▶
        </button>
      </div>
    </div>
  )
}
