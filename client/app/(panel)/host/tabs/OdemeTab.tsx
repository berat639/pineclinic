'use client'

import { useState, useEffect, useCallback } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  completed: { label: '✅ Yapıldı', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  pending: { label: '⏳ Bekliyor', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  cancelled: { label: '❌ İptal', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
}

interface Payment { id: string; patientId: string; patientName: string; patientPhone: string | null; date: string; amount: number; method: string; notes: string | null; status: string; dueDate: string | null }
interface Patient { id: string; name: string; phone: string | null; balance: number }

const inputStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none' }
const btnStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }
const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-3)', textTransform: 'uppercase' }
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: 'var(--foreground-2)' }
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 4px' }

export default function OdemeTab() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [formPatient, setFormPatient] = useState('')
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formAmount, setFormAmount] = useState('')
  const [formMethod, setFormMethod] = useState('Nakit')
  const [formStatus, setFormStatus] = useState('completed')
  const [formDueDate, setFormDueDate] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(() => {
    fetch(`/api/dental/payments`).then(r => r.ok ? r.json() : []).then(setPayments).catch(() => {})
    fetch(`/api/dental/patients`).then(r => r.ok ? r.json() : []).then(setPatients).catch(() => {})
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = payments.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return p.patientName.toLowerCase().includes(q) || (p.patientPhone || '').includes(search)
    }
    return true
  })

  const totals = {
    all: payments.reduce((s, p) => s + p.amount, 0),
    completed: payments.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0),
    pending: payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0),
  }

  // Group by patient
  const patientIds = [...new Set(filtered.map(p => p.patientId))]
  const groups = patientIds.map(pid => {
    const pPayments = filtered.filter(p => p.patientId === pid)
    const first = pPayments[0]!
    const pendingCount = pPayments.filter(p => p.status === 'pending').length
    const totalPaid = pPayments.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0)
    return { patientId: pid, name: first.patientName, phone: first.patientPhone, payments: pPayments, pendingCount, totalPaid }
  }).sort((a, b) => b.pendingCount - a.pendingCount || a.name.localeCompare(b.name))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formPatient || !formAmount) return
    setSaving(true)
    try {
      if (editId) {
        await fetch(`/api/dental/payments/${editId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: formDate, amount: Number(formAmount), method: formMethod, status: formStatus, dueDate: formDueDate || null, notes: formNotes || null }),
        })
      } else {
        await fetch(`/api/dental/patients/${formPatient}/payments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: formDate, amount: Number(formAmount), method: formMethod, status: formStatus, dueDate: formDueDate || null, notes: formNotes || null }),
        })
      }
      resetForm(); fetchData()
    } catch {}
    setSaving(false)
  }

  const resetForm = () => { setShowForm(false); setEditId(null); setFormPatient(''); setFormAmount(''); setFormMethod('Nakit'); setFormStatus('completed'); setFormDueDate(''); setFormNotes(''); setFormDate(new Date().toISOString().slice(0, 10)) }

  const startEdit = (p: Payment) => { setEditId(p.id); setShowForm(true); setFormPatient(p.patientId); setFormDate(p.date); setFormAmount(String(p.amount)); setFormMethod(p.method); setFormStatus(p.status); setFormDueDate(p.dueDate || ''); setFormNotes(p.notes || '') }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu ödemeyi silmek istediğinizden emin misiniz?')) return
    await fetch(`/api/dental/payments/${id}`, { method: 'DELETE' })
    fetchData()
  }

  return (
    <div style={{ maxWidth: 1200, width: '100%' }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="glass-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--foreground-3)' }}>Toplam</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--foreground)' }}>{totals.all.toLocaleString('tr-TR')} ₺</div>
        </div>
        <div className="glass-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '0.65rem', color: '#10b981' }}>Tamamlanan</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>{totals.completed.toLocaleString('tr-TR')} ₺</div>
        </div>
        <div className="glass-card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '0.65rem', color: '#f59e0b' }}>Bekleyen</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f59e0b' }}>{totals.pending.toLocaleString('tr-TR')} ₺</div>
        </div>
      </div>

      {/* Filters + Add */}
      <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="all">Tümü</option>
          <option value="completed">✅ Yapıldı</option>
          <option value="pending">⏳ Bekliyor</option>
          <option value="cancelled">❌ İptal</option>
        </select>
        <input placeholder="Hasta ara..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 150 }} />
        <button onClick={() => { resetForm(); setShowForm(!showForm) }} style={btnStyle}>
          {showForm ? 'İptal' : '+ Ödeme Ekle'}
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card" style={{ padding: 16, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <select value={formPatient} onChange={e => setFormPatient(e.target.value)} required style={inputStyle} disabled={!!editId}>
            <option value="">Hasta Seç...</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` (${p.phone})` : ''}</option>)}
          </select>
          <input type="number" placeholder="Tutar (₺)" value={formAmount} onChange={e => setFormAmount(e.target.value)} required style={inputStyle} />
          <select value={formMethod} onChange={e => setFormMethod(e.target.value)} style={inputStyle}>
            <option value="Nakit">Nakit</option><option value="Kart">Kart</option><option value="Havale">Havale</option><option value="Taksit">Taksit</option>
          </select>
          <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required style={inputStyle} />
          <select value={formStatus} onChange={e => setFormStatus(e.target.value)} style={inputStyle}>
            <option value="completed">✅ Yapıldı</option><option value="pending">⏳ Bekliyor</option><option value="cancelled">❌ İptal</option>
          </select>
          <input type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} placeholder="Planlanan Tarih" style={inputStyle} />
          <input placeholder="Not (opsiyonel)" value={formNotes} onChange={e => setFormNotes(e.target.value)} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={resetForm} style={{ ...btnStyle, background: 'var(--glass-bg)', color: 'var(--foreground-2)', border: '1px solid var(--glass-border)' }}>Vazgeç</button>
            <button type="submit" disabled={saving} style={btnStyle}>{saving ? '...' : editId ? 'Güncelle' : 'Kaydet'}</button>
          </div>
        </form>
      )}

      {/* Grouped Payments */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {groups.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--foreground-3)' }}>Ödeme bulunamadı</div>}
        {groups.map(g => {
          const isOpen = expanded === g.patientId
          return (
            <div key={g.patientId} style={{ borderBottom: '1px solid var(--glass-border)' }}>
              {/* Patient group header */}
              <div onClick={() => setExpanded(isOpen ? null : g.patientId)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', background: isOpen ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <span style={{ fontSize: 11, color: 'var(--foreground-3)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>{g.name}</span>
                    {g.phone && <span style={{ fontSize: '0.7rem', color: 'var(--foreground-3)' }}>{g.phone}</span>}
                    {g.pendingCount > 0 && <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 6, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 600 }}>⚠️ {g.pendingCount} bekleyen</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>{g.totalPaid.toLocaleString('tr-TR')} ₺</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--foreground-3)' }}>{g.payments.length} ödeme</div>
                </div>
              </div>

              {/* Expanded detail table */}
              {isOpen && (
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0 8px 8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                        <th style={thStyle}>Tarih</th>
                        <th style={thStyle}>Tutar</th>
                        <th style={thStyle}>Yöntem</th>
                        <th style={thStyle}>Durum</th>
                        <th style={thStyle}>Planlanan</th>
                        <th style={thStyle}>Not</th>
                        <th style={{ ...thStyle, width: 70 }}>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.payments.map(p => {
                        const st = STATUS_LABELS[p.status] || STATUS_LABELS.completed
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                            <td style={tdStyle}>{p.date}</td>
                            <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--foreground)' }}>{p.amount.toLocaleString('tr-TR')} ₺</td>
                            <td style={tdStyle}>{p.method}</td>
                            <td style={tdStyle}><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span></td>
                            <td style={tdStyle}>{p.dueDate || '—'}</td>
                            <td style={{ ...tdStyle, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes || '—'}</td>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => startEdit(p)} style={iconBtn}>✏️</button>
                                <button onClick={() => handleDelete(p.id)} style={iconBtn}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
