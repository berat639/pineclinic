'use client'

import { useState, useEffect } from 'react'

interface PhonebookEntry {
  label: string
  number: string
}

export default function PhonebookManager() {
  const [entries, setEntries] = useState<PhonebookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newNumber, setNewNumber] = useState('')

  useEffect(() => {
    fetch('/api/admin/settings/transfer-phonebook')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setEntries(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/admin/settings/transfer-phonebook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entries)
      })
      alert('Telefon defteri kaydedildi.')
    } catch (err) {
      alert('Kaydedilirken hata oluştu.')
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = () => {
    if (!newLabel.trim() || !newNumber.trim()) return
    setEntries([...entries, { label: newLabel.trim(), number: newNumber.trim() }])
    setNewLabel('')
    setNewNumber('')
  }

  const handleRemove = (idx: number) => {
    setEntries(entries.filter((_, i) => i !== idx))
  }

  if (loading) return <div style={{ fontSize: 13, color: 'var(--foreground-3)' }}>Yükleniyor...</div>

  return (
    <div className="glass-card" style={{ padding: 24, marginTop: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 18, paddingBottom: 14,
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground-2)' }}>
          Aktarım Telefon Defteri
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {entries.map((entry, idx) => (
          <div key={idx} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>{entry.label}</div>
              <div style={{ fontSize: 11, color: 'var(--foreground-3)' }}>{entry.number}</div>
            </div>
            <button
              onClick={() => handleRemove(idx)}
              style={{
                background: 'transparent', border: 'none', color: '#ef4444',
                cursor: 'pointer', fontSize: 16, padding: '4px 8px'
              }}
              title="Sil"
            >
              ×
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--foreground-3)' }}>Henüz numara eklenmemiş.</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 16 }}>
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder="Etiket (Örn: Resepsiyon)"
          style={{
            padding: '8px 12px', fontSize: 12, background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--foreground)',
            outline: 'none', width: '100%'
          }}
        />
        <input
          value={newNumber}
          onChange={e => setNewNumber(e.target.value)}
          placeholder="Numara (Örn: +90555...)"
          style={{
            padding: '8px 12px', fontSize: 12, background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--foreground)',
            outline: 'none', width: '100%'
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            padding: '0 16px', fontSize: 12, fontWeight: 600,
            background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 6, color: '#60a5fa', cursor: 'pointer'
          }}
        >
          Ekle
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 18px', fontSize: 12, fontWeight: 600,
            background: saving ? 'rgba(255,255,255,0.05)' : 'rgba(52,211,153,0.15)',
            border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8,
            color: '#34d399', cursor: saving ? 'wait' : 'pointer'
          }}
        >
          {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </button>
      </div>
    </div>
  )
}
