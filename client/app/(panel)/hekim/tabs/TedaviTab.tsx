'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../../../../lib/auth-context'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface Template { id: string; name: string; defaultDurationMin: number; defaultCost: number; category: string }

export default function TedaviTab() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [dur, setDur] = useState('30')
  const [cost, setCost] = useState('0')
  const [cat, setCat] = useState('genel')

  useEffect(() => {
    fetch(`${BACKEND}/api/hekim/templates`, { credentials: 'include' }).then(r => r.json()).then(setTemplates).catch(() => {})
  }, [])

  async function addTemplate(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`${BACKEND}/api/hekim/templates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ name, defaultDurationMin: +dur, defaultCost: +cost, category: cat }),
    })
    if (res.ok) { const t = await res.json(); setTemplates([...templates, t]); setShowForm(false); setName('') }
  }

  async function deleteTemplate(id: string) {
    await fetch(`${BACKEND}/api/hekim/templates/${id}`, { method: 'DELETE', credentials: 'include' })
    setTemplates(templates.filter(t => t.id !== id))
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--foreground)', marginBottom: 24 }}>Tedavi</h1>

      {/* Odontogram placeholder */}
      <div style={{ padding: 20, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', marginBottom: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--foreground-2)', marginBottom: 8 }}>🦷 Odontogram</div>
        <div style={{ fontSize: 12, color: 'var(--foreground-3)' }}>Hasta seçildikten sonra interaktif diş haritası burada görünecek. (react-odontogram entegrasyonu)</div>
      </div>

      {/* Templates */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--foreground)' }}>İşlem Şablonları</h2>
        <button onClick={() => setShowForm(!showForm)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer' }}>+ Ekle</button>
      </div>

      {showForm && (
        <form onSubmit={addTemplate} style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <input placeholder="Şablon adı" value={name} onChange={e => setName(e.target.value)} required style={{ flex: 1, minWidth: 120, padding: '6px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }} />
          <input type="number" placeholder="Süre (dk)" value={dur} onChange={e => setDur(e.target.value)} style={{ width: 70, padding: '6px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }} />
          <input type="number" placeholder="Ücret ₺" value={cost} onChange={e => setCost(e.target.value)} style={{ width: 80, padding: '6px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }} />
          <select value={cat} onChange={e => setCat(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }}>
            <option value="genel">Genel</option>
            <option value="cerrahi">Cerrahi</option>
            <option value="protez">Protez</option>
            <option value="ortodonti">Ortodonti</option>
            <option value="endodonti">Endodonti</option>
          </select>
          <button type="submit" style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--success)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>Kaydet</button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {templates.map(t => (
          <div key={t.id} style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>{t.name}</div>
              <button onClick={() => deleteTemplate(t.id)} style={{ fontSize: 10, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginTop: 4 }}>{t.defaultDurationMin}dk · ₺{t.defaultCost} · {t.category}</div>
          </div>
        ))}
      </div>
      {templates.length === 0 && <div style={{ color: 'var(--foreground-3)', fontSize: 13, marginTop: 8 }}>Henüz şablon yok.</div>}
    </div>
  )
}
