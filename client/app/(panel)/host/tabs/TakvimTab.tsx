'use client'

import { useEffect, useState } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface Doctor { id: string; name: string; specialty: string; color: string }
interface Slot { start: string; end: string }

export default function TakvimTab() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoc, setSelectedDoc] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]!)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/dental/doctors`).then(r => r.json()).then(setDoctors).catch(() => {})
  }, [])

  async function findSlots() {
    if (!selectedDoc || !date) return
    setLoading(true)
    const res = await fetch(`/api/host/available-slots?doctorId=${selectedDoc}&date=${date}&duration=30`, { credentials: 'include' })
    setSlots(await res.json())
    setLoading(false)
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--foreground)', marginBottom: 24 }}>Takvim — Slot Önerisi</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 4 }}>Doktor</div>
          <select value={selectedDoc} onChange={e => setSelectedDoc(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13, minWidth: 160 }}>
            <option value="">Seçin</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 4 }}>Tarih</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', fontSize: 13 }} />
        </div>
        <button onClick={findSlots} disabled={!selectedDoc} style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, opacity: selectedDoc ? 1 : 0.5 }}>Boş Slotları Bul</button>
      </div>

      {loading && <div style={{ color: 'var(--foreground-3)', fontSize: 13 }}>Aranıyor...</div>}

      {!loading && slots.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--foreground)', marginBottom: 12 }}>{slots.length} boş slot bulundu</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
            {slots.map(s => (
              <div key={s.start} style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>{s.start}</div>
                <div style={{ fontSize: 11, color: 'var(--foreground-3)' }}>{s.end}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && slots.length === 0 && selectedDoc && (
        <div style={{ color: 'var(--foreground-3)', fontSize: 13 }}>Bu tarih için boş slot bulunamadı. Doktorun müsaitlik ayarını kontrol edin.</div>
      )}
    </div>
  )
}
