'use client'

import React, { useEffect, useRef, useState } from 'react'
import InfoTooltip from '../ui/InfoTooltip'
import type { NodeSummary } from '../../../../lib/flow-path-summary'

export interface NodeInfoBadgeProps {
  nodeId: string
  summary?: NodeSummary
  /** İsteğe bağlı: yapay zekâ ile doğal anlatım. Yoksa yalnızca yerel özet gösterilir. */
  explain?: (nodeId: string) => Promise<string | null>
}

const sectionTitle: React.CSSProperties = { fontWeight: 700, color: 'var(--foreground)', marginTop: 6, fontSize: 11 }
const lineStyle: React.CSSProperties = { fontSize: 11.5, lineHeight: 1.45 }

/**
 * Her adımın sağ üst iç köşesindeki 18px ⓘ.
 * İçerik: Ne yapar · Hangi durumda gelinir · Sonra nereye gider · Uyarı.
 */
export default function NodeInfoBadge({ nodeId, summary, explain }: NodeInfoBadgeProps) {
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const requested = useRef<string>('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const summaryKey = summary ? `${summary.does}|${summary.when.join('/')}|${summary.next.join('/')}` : ''

  // Özet değişince eski yapay zekâ metni geçersiz olur.
  useEffect(() => {
    setAiText(null)
    requested.current = ''
  }, [summaryKey])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (!summary) return null

  const handleEnter = () => {
    if (!explain || requested.current === summaryKey) return
    if (timer.current) clearTimeout(timer.current)
    // Kısa süreli üzerine gelmeler istek göndermez.
    timer.current = setTimeout(async () => {
      requested.current = summaryKey
      setAiLoading(true)
      try {
        setAiText(await explain(nodeId))
      } catch {
        setAiText(null)
      }
      setAiLoading(false)
    }, 450)
  }
  const handleLeave = () => { if (timer.current) clearTimeout(timer.current) }

  return (
    <span
      className="nodrag nopan"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onMouseDown={e => e.stopPropagation()}
      style={{ position: 'absolute', top: 6, right: 8, zIndex: 5, display: 'inline-flex' }}
    >
      <InfoTooltip title="Bu adım ne yapar?" size={18} maxWidth={320}>
        <div style={lineStyle}>{summary.does}</div>
        <div style={sectionTitle}>Hangi durumda gelinir?</div>
        {summary.when.map((w, i) => <div key={i} style={lineStyle}>• {w}</div>)}
        {summary.next.length > 0 && (
          <>
            <div style={sectionTitle}>Sonra nereye gider?</div>
            {summary.next.map((n, i) => <div key={i} style={lineStyle}>• {n}</div>)}
          </>
        )}
        {summary.warnings.length > 0 && (
          <>
            <div style={{ ...sectionTitle, color: 'var(--danger)' }}>Uyarı</div>
            {summary.warnings.map((w, i) => <div key={i} style={{ ...lineStyle, color: 'var(--danger)' }}>• {w}</div>)}
          </>
        )}
        {explain && (aiLoading || aiText) && (
          <>
            <div style={sectionTitle}>Kısaca anlatım</div>
            <div style={lineStyle}>{aiLoading ? 'Hazırlanıyor…' : aiText}</div>
          </>
        )}
      </InfoTooltip>
    </span>
  )
}
