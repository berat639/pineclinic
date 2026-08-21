'use client'
import { useState, useEffect, useCallback } from 'react'

interface CustomField {
  name: string
  description: string
  required?: boolean
  active?: boolean
}

export default function PromptEditor() {
  const [loading, setLoading] = useState(true)
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [fieldsSaving, setFieldsSaving] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldDesc, setNewFieldDesc] = useState('')
  const [newFieldReq, setNewFieldReq] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editDesc, setEditDesc] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings/tools')
      if (res.ok) {
        const toolData = await res.json()
        const cfItem = toolData.find((t: { key: string }) => t.key === 'tools.custom_fields')
        if (cfItem?.value) {
          try { setCustomFields(JSON.parse(cfItem.value)) } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const saveCustomFields = async (fields: CustomField[]) => {
    setFieldsSaving(true)
    try {
      await fetch('/api/admin/settings/tools/tools.custom_fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(fields) }),
      })
      setCustomFields(fields)
    } catch { /* ignore */ }
    setFieldsSaving(false)
  }

  const addField = () => {
    if (!newFieldName.trim() || !newFieldDesc.trim()) return
    const fields = [...customFields, {
      name: newFieldName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      description: newFieldDesc.trim(),
      required: newFieldReq,
      active: true,
    }]
    saveCustomFields(fields)
    setNewFieldName(''); setNewFieldDesc(''); setNewFieldReq(false)
  }

  const removeField = (idx: number) => {
    if (!confirm('Bu alanı silmek istediğinizden emin misiniz?')) return
    saveCustomFields(customFields.filter((_, i) => i !== idx))
  }

  const toggleField = (idx: number) => {
    saveCustomFields(customFields.map((f, i) => i === idx ? { ...f, active: !f.active } : f))
  }

  const toggleRequired = (idx: number) => {
    saveCustomFields(customFields.map((f, i) => i === idx ? { ...f, required: !f.required } : f))
  }

  const moveField = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= customFields.length) return
    const fields = [...customFields]
    const temp = fields[idx]
    fields[idx] = fields[target]
    fields[target] = temp
    saveCustomFields(fields)
  }

  const saveEditDesc = (idx: number) => {
    if (!editDesc.trim()) return
    saveCustomFields(customFields.map((f, i) => i === idx ? { ...f, description: editDesc.trim() } : f))
    setEditingIdx(null)
  }

  const activeFields = customFields.filter(f => f.active !== false)

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: 24 }}>
        <div style={{ fontSize: 13, color: 'var(--foreground-3)' }}>Yükleniyor...</div>
      </div>
    )
  }

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>🔄 Konuşma Akışı</div>
          <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginTop: 4 }}>
            AI bu sırayla bilgi toplar → Randevu oluşturur → DB&apos;ye kaydeder
          </div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--foreground-3)', background: 'rgba(255,255,255,0.05)', padding: '3px 8px', borderRadius: 4 }}>
          {activeFields.length} aktif alan
        </span>
      </div>

      {/* Flow Diagram */}
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        {/* Vertical line */}
        <div style={{ position: 'absolute', left: 11, top: 0, bottom: 60, width: 2, background: customFields.length > 0 ? 'linear-gradient(to bottom, #22c55e, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.06)', borderRadius: 1 }} />

        {/* Start node */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, position: 'relative' }}>
          <div style={{ position: 'absolute', left: -19, width: 18, height: 18, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 700, boxShadow: '0 0 8px rgba(34,197,94,0.4)' }}>▶</div>
          <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, paddingLeft: 8 }}>Karşılama mesajı söylenir</div>
        </div>

        {/* Field nodes */}
        {customFields.map((field, idx) => {
          const isActive = field.active !== false
          const isEditing = editingIdx === idx
          return (
            <div key={idx} style={{ marginBottom: 12, position: 'relative' }}>
              {/* Node circle */}
              <div style={{ position: 'absolute', left: -19, top: 14, width: 18, height: 18, borderRadius: '50%', background: isActive ? '#3b82f6' : 'rgba(100,116,139,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, transition: 'all 0.2s', boxShadow: isActive ? '0 0 6px rgba(59,130,246,0.3)' : 'none' }}>{idx + 1}</div>

              {/* Card */}
              <div style={{ marginLeft: 8, padding: '12px 14px', borderRadius: 10, background: isActive ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.01)', border: `1px solid ${isActive ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)'}`, opacity: isActive ? 1 : 0.5, transition: 'all 0.2s' }}>
                {/* Top row: name + controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <code style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#7dd3fc' : '#475569', background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: 4 }}>{field.name}</code>
                  {field.required && (
                    <span style={{ fontSize: 9, padding: '1px 6px', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 10, color: '#fb923c', fontWeight: 600 }}>zorunlu</span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button onClick={() => moveField(idx, -1)} disabled={idx === 0 || fieldsSaving} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: 11, padding: '2px 4px', opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => moveField(idx, 1)} disabled={idx === customFields.length - 1 || fieldsSaving} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: 11, padding: '2px 4px', opacity: idx === customFields.length - 1 ? 0.3 : 1 }}>↓</button>
                  <button onClick={() => toggleRequired(idx)} disabled={fieldsSaving} title={field.required ? 'Opsiyonel yap' : 'Zorunlu yap'} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '2px 4px', color: field.required ? '#fb923c' : '#475569' }}>{field.required ? '★' : '☆'}</button>
                  <button onClick={() => toggleField(idx)} disabled={fieldsSaving} style={{ width: 30, height: 16, borderRadius: 8, border: 'none', cursor: 'pointer', background: isActive ? '#22c55e' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.2s' }}>
                    <span style={{ position: 'absolute', top: 2, width: 12, height: 12, left: isActive ? 16 : 2, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                  </button>
                  <button onClick={() => removeField(idx)} disabled={fieldsSaving} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}>✕</button>
                </div>

                {/* Description - click to edit */}
                {isEditing ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input autoFocus value={editDesc} onChange={e => setEditDesc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEditDesc(idx); if (e.key === 'Escape') setEditingIdx(null) }} style={{ flex: 1, padding: '4px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 5, color: 'var(--foreground)', fontSize: 11, outline: 'none' }} />
                    <button onClick={() => saveEditDesc(idx)} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: 11 }}>✓</button>
                    <button onClick={() => setEditingIdx(null)} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: 11 }}>✕</button>
                  </div>
                ) : (
                  <div onClick={() => { setEditingIdx(idx); setEditDesc(field.description) }} style={{ fontSize: 11, color: 'var(--foreground-3)', cursor: 'pointer', lineHeight: 1.5, padding: '2px 0' }} title="Tıklayarak düzenle">
                    💬 {field.description}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* End node */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, marginBottom: 20, position: 'relative' }}>
          <div style={{ position: 'absolute', left: -19, width: 18, height: 18, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, boxShadow: '0 0 8px rgba(139,92,246,0.3)' }}>✓</div>
          <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, paddingLeft: 8 }}>Randevu oluşturulur → DB&apos;ye kaydedilir</div>
        </div>
      </div>

      {/* Empty state */}
      {customFields.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 16px', marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 10 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-3)' }}>Henüz alan eklenmedi</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>Aşağıdan ilk alanınızı ekleyin</div>
        </div>
      )}

      {/* Add new field */}
      <div style={{ padding: 16, background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-3)', marginBottom: 12 }}>+ Yeni Alan Ekle</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 140px' }}>
            <label style={{ fontSize: 10, color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>Alan Adı</label>
            <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="telefon" onKeyDown={e => { if (e.key === 'Enter') addField() }} style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 10, color: 'var(--foreground-3)', display: 'block', marginBottom: 4 }}>AI Talimatı (nasıl soracak)</label>
            <input value={newFieldDesc} onChange={e => setNewFieldDesc(e.target.value)} placeholder="Telefon numaranızı öğrenebilir miyim?" onKeyDown={e => { if (e.key === 'Enter') addField() }} style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12, outline: 'none' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--foreground-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={newFieldReq} onChange={e => setNewFieldReq(e.target.checked)} style={{ accentColor: '#fb923c' }} />
            Zorunlu
          </label>
          <button onClick={addField} disabled={fieldsSaving || !newFieldName.trim() || !newFieldDesc.trim()} style={{ padding: '8px 20px', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', background: (!newFieldName.trim() || !newFieldDesc.trim()) ? 'rgba(255,255,255,0.04)' : 'rgba(34,197,94,0.15)', border: `1px solid ${(!newFieldName.trim() || !newFieldDesc.trim()) ? 'rgba(255,255,255,0.06)' : 'rgba(34,197,94,0.3)'}`, color: (!newFieldName.trim() || !newFieldDesc.trim()) ? '#475569' : '#22c55e' }}>
            {fieldsSaving ? '⏳' : '+ Ekle'}
          </button>
        </div>
      </div>

      {/* Info footer */}
      <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)' }}>
        <div style={{ fontSize: 10, color: 'var(--foreground-3)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--foreground-3)' }}>Nasıl çalışır:</strong> AI alanları yukarıdaki sırayla sorar. Açıklama = AI&apos;nın sorusu. ↑↓ sıra değiştir. ★ zorunlu yap. Toggle ile kapat. Tıklayarak düzenle.
        </div>
      </div>
    </div>
  )
}
