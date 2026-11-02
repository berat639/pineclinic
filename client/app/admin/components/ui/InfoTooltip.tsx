'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from '../../../../styles/clinic-depth.module.css'

export interface InfoTooltipProps {
  title?: string
  children: React.ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  maxWidth?: number
  size?: 16 | 18
}

type Side = 'top' | 'bottom' | 'left' | 'right'
const GAP = 8
const EDGE = 8

export default function InfoTooltip({ title, children, placement = 'auto', maxWidth = 300, size = 16 }: InfoTooltipProps) {
  const id = useId()
  const triggerRef = useRef<HTMLSpanElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const reposition = useCallback(() => {
    const t = triggerRef.current
    const p = popupRef.current
    if (!t || !p) return
    const r = t.getBoundingClientRect()
    const w = p.offsetWidth
    const h = p.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let side: Side
    if (placement === 'auto') {
      side = r.bottom + GAP + h + EDGE <= vh ? 'bottom' : r.top - GAP - h >= EDGE ? 'top' : r.right + GAP + w + EDGE <= vw ? 'right' : 'left'
    } else side = placement
    let top = 0
    let left = 0
    if (side === 'bottom' || side === 'top') {
      top = side === 'bottom' ? r.bottom + GAP : r.top - GAP - h
      left = r.left + r.width / 2 - w / 2
    } else {
      left = side === 'right' ? r.right + GAP : r.left - GAP - w
      top = r.top + r.height / 2 - h / 2
    }
    left = Math.max(EDGE, Math.min(left, vw - w - EDGE))
    top = Math.max(EDGE, Math.min(top, vh - h - EDGE))
    setPos({ top, left })
  }, [placement])

  useEffect(() => {
    if (!open) { setPos(null); return }
    reposition()
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node
      if (!triggerRef.current?.contains(n) && !popupRef.current?.contains(n)) close()
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open, reposition])

  const dim = size
  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={title || 'Bilgi'}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          width: dim, height: dim, border: `1px solid ${open ? 'var(--pc-blue)' : 'var(--pc-border)'}`,
          borderRadius: '50%', background: open ? 'var(--pc-tint)' : 'var(--pc-surface)', color: 'var(--pc-tint-fg)',
          fontSize: dim - 5, fontWeight: 700, lineHeight: 1, cursor: 'help', userSelect: 'none', outline: 'none',
          boxShadow: 'var(--pc-clay-btn)',
        }}
      >
        <span aria-hidden="true">ⓘ</span>
      </span>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          id={id}
          role="tooltip"
          className={styles.tooltip}
          style={{
            position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, zIndex: 2147483000,
            width: 'max-content', maxWidth: Math.min(maxWidth, 360, typeof window !== 'undefined' ? window.innerWidth - 16 : maxWidth),
            visibility: pos ? 'visible' : 'hidden', pointerEvents: 'none', whiteSpace: 'normal', textAlign: 'left',
          }}
        >
          {title && <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--foreground)' }}>{title}</div>}
          <div style={{ color: 'var(--foreground-2)' }}>{children}</div>
        </div>,
        document.body,
      )}
    </>
  )
}
