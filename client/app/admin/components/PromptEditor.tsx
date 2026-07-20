'use client'
import { useState, useEffect, useCallback } from 'react'

interface ToolItem {
  key: string
  toolName: string
  label: string
  type: 'tool' | 'param'
  value: string
  isCustom: boolean
}

interface CustomField {
  name: string
  description: string
  required?: boolean
  active?: boolean
}

export default function PromptEditor() {
  const [tools, setTools] = useState<ToolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [fieldsExpanded, setFieldsExpanded] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldDesc, setNewFieldDesc] = useState('')
  const [newFieldReq, setNewFieldReq] = useState(false)
  const [fieldsSaving, setFieldsSaving] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings/tools')
      if (res.ok) {
        const toolData = await res.json()
        setTools(toolData)
        const vals: Record<string, string> = {}
        for (const t of toolData) vals[t.key] = t.value
        setEditValues(vals)
        const cfItem = toolData.find((t: ToolItem) => t.key === 'tools.custom_fields')
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

  const addCustomField = () => {
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

  const removeCustomField = (idx: number) => {
    if (!confirm('Bu alanı silmek istediğinizden emin misiniz?')) return
    const fields = customFields.filter((_, i) => i !== idx)
    saveCustomFields(fields)
  }

  const toggleCustomField = (idx: number) => {
    const fields = customFields.map((f, i) => i === idx ? { ...f, active: !f.active } : f)
    saveCustomFields(fields)
  }

  const handleSaveParam = async (key: string) => {
    const value = editValues[key]
    if (!value?.trim() || value.trim().length < 3) return
    setSaving(key)
    try {
      await fetch(`/api/admin/settings/tools/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value.trim() }),
      })
      await fetchData()
    } catch { /* ignore */ }
    setSaving(null)
  }

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: 24, marginTop: 12 }}>
        <div style={{ fontSize: 13, color: 'rgba(240,244,255,0.4)' }}>Yükleniyor...</div>
      </div>
    )
  }

  return (
    <div className="glass-card" style={{ padding: 24, marginTop: 12 }}>
      <button
        onClick={() => setFieldsExpanded(!fieldsExpanded)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
        }}
      >
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground-2)' }}>
            📋 Özel Alanlar
          </span>
          <div style={{ fontSize: 11, color: 'rgba(240,244,255,0.35)', marginTop: 4 }}>
            Randevu oluştururken AI&apos;nın müşteriden isteyeceği alanlar. Aktif/pasif yapın, yeni alan ekleyin/çıkarın.
          </div>
        </div>
        <span style={{ fontSize: 14, color: '#64748b', transition: 'transform 0.2s', transform: fieldsExpanded ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {fieldsExpanded && (
        <div style={{ marginTop: 16 }}>
          {/* Tüm alanlar (aktif/pasif toggle ile) */}
          {customFields.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {customFields.map((f, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8, opacity: f.active !== false ? 1 : 0.5,
                  }}>
                    <button
                      onClick={() => toggleCustomField(idx)}
                      disabled={fieldsSaving}
                      style={{
                        width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer',
                        background: f.active !== false ? '#22c55e' : 'rgba(255,255,255,0.1)',
                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2, width: 14, height: 14,
                        left: f.active !== false ? 16 : 2,
                        borderRadius: '50%', background: 'white', transition: 'left 0.2s',
                      }} />
                    </button>
                    <code style={{ fontSize: 11, color: '#7dd3fc', flex: '0 0 auto' }}>{f.name}</code>
                    <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>{f.description}</span>
                    {f.required && (
                      <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 4, color: '#fb923c' }}>Zorunlu</span>
                    )}
                    <button onClick={() => removeCustomField(idx)} disabled={fieldsSaving} style={{
                      background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, padding: '2px 6px',
                    }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Yeni alan ekle */}
          <div style={{ padding: '12px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 10 }}>+ Yeni Alan Ekle</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 100px' }}>
                <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>Alan Adı (key)</label>
                <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="tc_kimlik" style={{
                  width: '100%', padding: '6px 8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, color: '#f0f4ff', fontSize: 11, fontFamily: 'monospace', outline: 'none',
                }} />
              </div>
              <div style={{ flex: '2 1 180px' }}>
                <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 3 }}>Açıklama (AI bunu görür)</label>
                <input value={newFieldDesc} onChange={e => setNewFieldDesc(e.target.value)} placeholder="Hastanın TC kimlik numarası" style={{
                  width: '100%', padding: '6px 8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, color: '#f0f4ff', fontSize: 11, outline: 'none',
                }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={newFieldReq} onChange={e => setNewFieldReq(e.target.checked)} />
                Zorunlu
              </label>
              <button onClick={addCustomField} disabled={fieldsSaving || !newFieldName.trim() || !newFieldDesc.trim()} style={{
                padding: '6px 14px', borderRadius: 6, background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: 11,
                cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
              }}>
                {fieldsSaving ? '...' : '+ Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
