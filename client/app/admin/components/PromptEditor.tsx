'use client'
import { useState, useEffect, useCallback } from 'react'

interface PromptSection {
  key: string
  label: string
  description: string
  sortOrder: number
  value: string
  isCustom: boolean
  updatedAt: string | null
}

interface ToolItem {
  key: string
  toolName: string
  label: string
  type: 'tool' | 'param'
  value: string
  isCustom: boolean
}

export default function PromptEditor() {
  const [sections, setSections] = useState<PromptSection[]>([])
  const [tools, setTools] = useState<ToolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [toolsExpanded, setToolsExpanded] = useState(false)

  const fetchSections = useCallback(async () => {
    try {
      const [res, toolRes] = await Promise.all([
        fetch('/api/admin/settings/prompts'),
        fetch('/api/admin/settings/tools'),
      ])
      if (res.ok) {
        const data = await res.json()
        setSections(data)
        const vals: Record<string, string> = {}
        for (const s of data) vals[s.key] = s.value
        if (toolRes.ok) {
          const toolData = await toolRes.json()
          setTools(toolData)
          for (const t of toolData) vals[t.key] = t.value
        }
        setEditValues(prev => ({ ...prev, ...vals }))
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSections() }, [fetchSections])

  const handleSave = async (key: string) => {
    const value = editValues[key]
    if (!value?.trim() || value.trim().length < 3) return
    setSaving(key)
    const prefix = key.startsWith('tools.') ? 'tools' : 'prompts'
    try {
      const res = await fetch(`/api/admin/settings/${prefix}/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value.trim() }),
      })
      if (!res.ok) throw new Error()
      await fetchSections()
    } catch { /* ignore */ }
    setSaving(null)
  }

  const handleReset = async (key: string) => {
    if (!confirm('Bu bölümü varsayılana sıfırlamak istediğinizden emin misiniz?')) return
    setSaving(key)
    const prefix = key.startsWith('tools.') ? 'tools' : 'prompts'
    try {
      const res = await fetch(`/api/admin/settings/${prefix}/${key}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.value) setEditValues(prev => ({ ...prev, [key]: data.value }))
      await fetchSections()
    } catch { /* ignore */ }
    setSaving(null)
  }

  const handlePreview = async () => {
    setPreviewOpen(true)
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/admin/settings/prompts/preview', { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPreviewText(data.prompt || '')
    } catch {
      setPreviewText('Önizleme yüklenemedi.')
    }
    setPreviewLoading(false)
  }

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: 24, marginTop: 12 }}>
        <div style={{ fontSize: 13, color: 'rgba(240,244,255,0.4)' }}>Prompt bölümleri yükleniyor...</div>
      </div>
    )
  }

  return (
    <>
      <div className="glass-card" style={{ padding: 24, marginTop: 12 }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16, paddingBottom: 14,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground-2)' }}>
              🧠 AI Prompt Yönetimi
            </span>
            <div style={{ fontSize: 11, color: 'rgba(240,244,255,0.35)', marginTop: 4 }}>
              Sistem prompt&apos;unu bölüm bölüm düzenleyin. Değişiklikler yeni oturumlarda geçerli olur.
            </div>
          </div>
          <button
            onClick={handlePreview}
            style={{
              padding: '6px 14px', borderRadius: 8,
              background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)',
              color: '#60a5fa', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}
          >
            👁 Önizleme
          </button>
        </div>

        {/* Sections accordion */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sections.map(section => {
            const isExpanded = expandedKey === section.key
            const hasChanges = editValues[section.key] !== section.value
            return (
              <div key={section.key} style={{
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10,
                background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                overflow: 'hidden',
              }}>
                {/* Section header */}
                <button
                  onClick={() => setExpandedKey(isExpanded ? null : section.key)}
                  style={{
                    width: '100%', padding: '12px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>
                      {section.label}
                    </span>
                    {section.isCustom && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px',
                        background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.3)',
                        borderRadius: 4, color: '#fb923c',
                      }}>
                        Özelleştirilmiş
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 14, color: '#64748b', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                    ▾
                  </span>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ fontSize: 11, color: 'rgba(240,244,255,0.35)', marginBottom: 10 }}>
                      {section.description}
                    </div>
                    <textarea
                      value={editValues[section.key] ?? ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [section.key]: e.target.value }))}
                      rows={Math.min(15, Math.max(5, (editValues[section.key] ?? '').split('\n').length + 1))}
                      style={{
                        width: '100%', padding: '10px 12px',
                        background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8, color: '#f0f4ff', fontSize: 12,
                        fontFamily: 'monospace', lineHeight: 1.6, resize: 'vertical',
                        outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                      <span style={{ fontSize: 11, color: 'rgba(240,244,255,0.25)' }}>
                        {(editValues[section.key] ?? '').length} karakter
                        {section.updatedAt && ` • Son güncelleme: ${new Date(section.updatedAt).toLocaleString('tr-TR')}`}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {section.isCustom && (
                          <button
                            onClick={() => handleReset(section.key)}
                            disabled={saving === section.key}
                            style={{
                              padding: '5px 12px', borderRadius: 6,
                              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                              color: '#ef4444', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                            }}
                          >
                            {saving === section.key ? '...' : '↺ Varsayılana Sıfırla'}
                          </button>
                        )}
                        <button
                          onClick={() => handleSave(section.key)}
                          disabled={saving === section.key || !hasChanges}
                          style={{
                            padding: '5px 14px', borderRadius: 6,
                            background: hasChanges ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${hasChanges ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                            color: hasChanges ? '#22c55e' : '#64748b',
                            fontSize: 11, fontWeight: 500, cursor: hasChanges ? 'pointer' : 'default',
                            opacity: hasChanges ? 1 : 0.5,
                          }}
                        >
                          {saving === section.key ? '⏳ Kaydediliyor...' : '💾 Kaydet'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Tool Descriptions ──────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: 24, marginTop: 12 }}>
        <button
          onClick={() => setToolsExpanded(!toolsExpanded)}
          style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            textAlign: 'left',
          }}
        >
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground-2)' }}>
              🔧 Tool Açıklamaları
            </span>
            <div style={{ fontSize: 11, color: 'rgba(240,244,255,0.35)', marginTop: 4 }}>
              Gemini&apos;nin hangi aracı ne zaman çağıracağını belirleyen açıklamalar. Sektöre göre özelleştirin.
            </div>
          </div>
          <span style={{ fontSize: 14, color: '#64748b', transition: 'transform 0.2s', transform: toolsExpanded ? 'rotate(180deg)' : 'none' }}>▾</span>
        </button>

        {toolsExpanded && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tools.filter(t => t.type === 'tool').map(tool => {
              const isExpanded = expandedKey === tool.key
              const hasChanges = editValues[tool.key] !== tool.value
              return (
                <div key={tool.key} style={{
                  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
                  background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                }}>
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : tool.key)}
                    style={{
                      width: '100%', padding: '10px 14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ fontSize: 11, color: '#7dd3fc', background: 'rgba(125,211,252,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                        {tool.toolName}
                      </code>
                      {tool.isCustom && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 4, color: '#fb923c' }}>
                          Özelleştirilmiş
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 14, color: '#64748b', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▾</span>
                  </button>

                  {isExpanded && (
                    <div style={{ padding: '0 14px 14px' }}>
                      <textarea
                        value={editValues[tool.key] ?? ''}
                        onChange={e => setEditValues(prev => ({ ...prev, [tool.key]: e.target.value }))}
                        rows={3}
                        style={{
                          width: '100%', padding: '8px 10px',
                          background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 8, color: '#f0f4ff', fontSize: 12,
                          fontFamily: 'monospace', lineHeight: 1.5, resize: 'vertical', outline: 'none',
                        }}
                      />
                      {/* Related params */}
                      {tools.filter(p => p.type === 'param' && p.toolName === tool.toolName).map(param => (
                        <div key={param.key} style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>
                            {param.label} {param.isCustom && <span style={{ color: '#fb923c' }}>●</span>}
                          </label>
                          <input
                            value={editValues[param.key] ?? ''}
                            onChange={e => setEditValues(prev => ({ ...prev, [param.key]: e.target.value }))}
                            style={{
                              width: '100%', padding: '6px 10px',
                              background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
                              borderRadius: 6, color: '#f0f4ff', fontSize: 11, fontFamily: 'monospace', outline: 'none',
                            }}
                          />
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                        {tool.isCustom && (
                          <button onClick={() => handleReset(tool.key)} disabled={saving === tool.key}
                            style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>
                            ↺ Sıfırla
                          </button>
                        )}
                        <button onClick={() => { handleSave(tool.key); tools.filter(p => p.type === 'param' && p.toolName === tool.toolName).forEach(p => { if (editValues[p.key] !== p.value) handleSave(p.key) }) }}
                          disabled={saving === tool.key || !hasChanges}
                          style={{
                            padding: '4px 12px', borderRadius: 6,
                            background: hasChanges ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${hasChanges ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                            color: hasChanges ? '#22c55e' : '#64748b', fontSize: 11, cursor: hasChanges ? 'pointer' : 'default',
                          }}>
                          💾 Kaydet
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '2rem',
        }} onClick={e => { if (e.target === e.currentTarget) setPreviewOpen(false) }}>
          <div style={{
            background: '#0d1829', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 720,
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                📋 Birleştirilmiş System Prompt Önizleme
              </span>
              <button onClick={() => setPreviewOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{
              flex: 1, overflow: 'auto', padding: '14px',
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
            }}>
              {previewLoading ? (
                <div style={{ color: 'rgba(240,244,255,0.4)', fontSize: 13 }}>Yükleniyor...</div>
              ) : (
                <pre style={{
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  fontSize: 11.5, lineHeight: 1.7, color: '#cbd5e1',
                  fontFamily: 'monospace', margin: 0,
                }}>
                  {previewText}
                </pre>
              )}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(240,244,255,0.25)', textAlign: 'right' }}>
              {previewText.length} karakter
            </div>
          </div>
        </div>
      )}
    </>
  )
}
