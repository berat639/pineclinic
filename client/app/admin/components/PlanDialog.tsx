import React, { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import styles from './PineTreatmentPlan.module.css'

export default function PlanDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  return <div className={styles.dialogOverlay} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current() }
    if (event.key !== 'Tab') return
    const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(item => item.getClientRects().length)
    const first = elements[0], last = elements[elements.length - 1]
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus() }
  }}>
    <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
      <div className={styles.dialogHead}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#2563eb', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', boxShadow: 'var(--pc-clay-primary)', flexShrink: 0 }}>🦷</div>
          <h3 id={titleId} style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: 'var(--foreground)' }}>{title}</h3>
        </div>
        <button type="button" aria-label={`${title} kapat`} onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'var(--pc-clay-btn)' }}><X size={16} /></button>
      </div>
      <div style={{ padding: '18px 20px', flex: 1, overflowY: 'auto', background: 'var(--card-bg)' }}>
        {children}
      </div>
    </div>
  </div>
}
