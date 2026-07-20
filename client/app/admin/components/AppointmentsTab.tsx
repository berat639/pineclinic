'use client'
import { useState, useCallback } from 'react'

interface Appointment {
  id: string; createdAt: string; customerName?: string; phone?: string
  type: string
  vehicleInfo?: string; issueOrRequest?: string; date: string; time: string
  extraFields?: Record<string, string> | null
}

const TYPE_LABEL: Record<string, string> = {}
const TYPE_ICON: Record<string, string> = {}
const TYPE_BADGE: Record<string, string> = {}

function getTypeLabel(type: string) { return TYPE_LABEL[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
function getTypeIcon(type: string) { return TYPE_ICON[type] || '📋' }

function fmtDate(d: string) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) }
  catch { return d }
}
function fmtCreated(d: string) {
  try { return new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return d }
}

export default function AppointmentsTab({ appointments, onDelete }: { appointments: Appointment[], onDelete: (id: string) => void }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const uniqueTypes = [...new Set(appointments.map(a => a.type))]

  const filtered = appointments.filter(a => {
    const matchType = filter === 'all' || a.type === filter
    const low = search.toLowerCase()
    const matchSearch = !search ||
      (a.customerName || '').toLowerCase().includes(low) ||
      (a.phone || '').includes(search) ||
      (a.vehicleInfo || '').toLowerCase().includes(low) ||
      (a.issueOrRequest || '').toLowerCase().includes(low)
    return matchType && matchSearch
  })

  const selected = selectedId ? appointments.find(a => a.id === selectedId) : null

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Bu randevuyu silmek istediğinizden emin misiniz?')) return
    setDeleting(id)
    const res = await fetch(`/api/appointments/${id}`, { method: 'DELETE' })
    if (res.ok) { onDelete(id); if (selectedId === id) setSelectedId(null) }
    setDeleting(null)
  }, [onDelete, selectedId])

  return (
    <div>
      <div className="glass-card" style={{ padding: '0.85rem 1.25rem', marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Ara..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '7px 10px 7px 30px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#f0f4ff', fontSize: '0.83rem', outline: 'none' }} />
        </div>
        {['all', ...uniqueTypes].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 12px', borderRadius: 8, border: '1px solid', fontSize: '0.77rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
            background: filter === f ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
            borderColor: filter === f ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)',
            color: filter === f ? '#60a5fa' : '#94a3b8',
          }}>
            {f === 'all' ? 'Tümü' : `${getTypeIcon(f)} ${getTypeLabel(f)}`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
          <div>Randevu bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: '1rem' }}>
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Tür', 'Müşteri', 'Telefon', 'Talep/Detay', 'Tarih & Saat', ''].map((h, i) => (
                      <th key={i} style={{ padding: '0.8rem 1rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => {
                    const extraSummary = a.extraFields ? Object.values(a.extraFields).filter(Boolean).join(', ') : ''
                    const detailText = [a.issueOrRequest, a.vehicleInfo, extraSummary].filter(Boolean).join(' • ')
                    return (
                    <tr key={a.id} onClick={() => setSelectedId(selectedId === a.id ? null : a.id)}
                      style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                    >
                      <td style={{ padding: '0.8rem 1rem', whiteSpace: 'nowrap' }}>
                        <span className={`badge ${TYPE_BADGE[a.type] || 'badge-other'}`}>{getTypeIcon(a.type)} {getTypeLabel(a.type)}</span>
                      </td>
                      <td style={{ padding: '0.8rem 1rem' }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{a.customerName || <span style={{ color: '#475569', fontStyle: 'italic' }}>—</span>}</div>
                      </td>
                      <td style={{ padding: '0.8rem 1rem', fontSize: '0.84rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{a.phone || '—'}</td>
                      <td style={{ padding: '0.8rem 1rem', fontSize: '0.78rem', color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {detailText || '—'}
                      </td>
                      <td style={{ padding: '0.8rem 1rem', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>{fmtDate(a.date)}</div>
                        {a.time && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>🕐 {a.time}</div>}
                      </td>
                      <td style={{ padding: '0.8rem 1rem' }}>
                        <button onClick={e => { e.stopPropagation(); handleDelete(a.id) }} disabled={deleting === a.id}
                          className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '0.74rem', opacity: deleting === a.id ? 0.5 : 1 }}>
                          {deleting === a.id ? '...' : '🗑'}
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '0.65rem 1rem', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: '0.73rem', color: '#475569' }}>
              {filtered.length} randevu{filter !== 'all' || search ? ` (toplam ${appointments.length})` : ''}
            </div>
          </div>

          {selected && (
            <div className="glass-card" style={{ padding: '1.5rem', height: 'fit-content' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 6 }}>Detay</h3>
                  <span className={`badge ${TYPE_BADGE[selected.type] || 'badge-other'}`}>{getTypeIcon(selected.type)} {getTypeLabel(selected.type)}</span>
                </div>
                <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {([
                  ['👤 Müşteri', selected.customerName],
                  ['📞 Telefon', selected.phone],
                  ['� Talep', selected.issueOrRequest],
                  ['📅 Tarih', fmtDate(selected.date)],
                  ['🕐 Saat', selected.time],
                  ['ℹ️ Ek Bilgi', selected.vehicleInfo],
                  ['⏱ Oluşturulma', fmtCreated(selected.createdAt)],
                ] as [string, string | undefined][]).map(([label, value], i) => value && (
                  <div key={i}>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: '0.875rem', color: '#e2e8f0' }}>{value}</div>
                  </div>
                ))}
                {/* Extra fields */}
                {selected.extraFields && Object.entries(selected.extraFields).map(([key, value]) => value && (
                  <div key={key}>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>{key.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: '0.875rem', color: '#e2e8f0' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={() => handleDelete(selected.id)} disabled={!!deleting} className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }}>
                  🗑 Randevuyu Sil
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
