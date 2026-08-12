'use client'

import { useEffect, useState, useCallback } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface Item { id: string; name: string; category: string; brand: string | null; quantity: number; minThreshold: number; unit: string; costPerUnit: number; expiryDate: string | null; supplierName: string | null }
interface Movement { id: string; itemId: string; type: string; quantity: number; notes: string | null; userName: string | null; createdAt: string }
interface DeviceMaintenance {
  id: string
  deviceName: string
  maintenanceType: string
  isPeriodic: boolean
  periodicDays: number | null
  scheduledDate: string
  nextMaintenanceDate: string | null
  notes: string | null
  status: string
}

const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--foreground)', fontSize: '0.78rem', outline: 'none', fontFamily: 'inherit', width: '100%' }
const btn: React.CSSProperties = { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }

const MOV_TYPES: Record<string, { label: string; color: string }> = {
  giris: { label: 'Stok Eklendi', color: 'var(--success)' },
  cikis: { label: 'Kullandım', color: 'var(--danger)' },
  fire: { label: 'Zayi / Bozuldu', color: 'var(--warning)' },
  imha: { label: 'Süresi Doldu', color: '#ef4444' },
  iade: { label: 'İade', color: '#22c55e' },
  bakim: { label: 'Bakım İşlemi', color: '#0ea5e9' },
}

function daysUntil(date: string | null) {
  if (!date) return Infinity
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
}

function getStatus(item: Item): { label: string; color: string; bg: string; priority: number } {
  const sktDays = daysUntil(item.expiryDate)
  if (sktDays < 0) return { label: '⛔ SKT Geçmiş', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', priority: 0 }
  if (sktDays <= 30) return { label: '🟠 SKT Yakın', color: 'var(--warning)', bg: 'rgba(245,158,11,0.06)', priority: 1 }
  return { label: '🟢 Normal', color: 'var(--success)', bg: 'transparent', priority: 2 }
}

export default function StokTab() {
  const [items, setItems] = useState<Item[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [deviceMaintenances, setDeviceMaintenances] = useState<DeviceMaintenance[]>([])
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'malzeme' | 'cihaz'>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [recordType, setRecordType] = useState<'malzeme' | 'cihaz'>('malzeme')
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({})
  const [amountMap, setAmountMap] = useState<Record<string, string>>({})
  const [isMobile, setIsMobile] = useState(false)

  // Malzeme formu (hekim dostu sade alanlar)
  const [materialForm, setMaterialForm] = useState({ name: '', categoryText: '', quantity: '1', hasExpiryDate: false, expiryDate: '', brand: '', unitCost: '0', isRefund: false })
  // Cihaz formu (malzeme ile aynı mantıkta sade)
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    typeText: '',
    quantity: '1',
    brand: '',
    unitCost: '0',
    hasPeriodicMaintenance: false,
    periodicDays: '30',
    firstMaintenanceDate: '',
    note: '',
  })

  const fetchData = useCallback(() => {
    fetch(`${BACKEND}/api/yonetici/inventory`, { credentials: 'include' }).then(r => r.json()).then(setItems).catch(() => {})
    fetch(`${BACKEND}/api/yonetici/inventory/movements`, { credentials: 'include' }).then(r => r.json()).then(setMovements).catch(() => {})
    fetch(`${BACKEND}/api/yonetici/device-maintenance`, { credentials: 'include' }).then(r => r.json()).then(setDeviceMaintenances).catch(() => {})
  }, [])
  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const sync = () => setIsMobile(window.innerWidth < 900)
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (recordType === 'malzeme') {
      const res = await fetch(`${BACKEND}/api/yonetici/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: materialForm.name,
          category: materialForm.categoryText || 'genel',
          quantity: +materialForm.quantity,
          unit: 'adet',
          costPerUnit: +materialForm.unitCost,
          totalCost: (+materialForm.quantity || 0) * (+materialForm.unitCost || 0),
          isRefund: false,
          brand: materialForm.brand || null,
          expiryDate: materialForm.hasExpiryDate ? materialForm.expiryDate : null,
          supplierName: null,
        }),
      })
      if (res.ok) {
        fetchData()
        setShowAdd(false)
        setMaterialForm({ name: '', categoryText: '', quantity: '1', hasExpiryDate: false, expiryDate: '', brand: '', unitCost: '0', isRefund: false })
      }
      return
    }

    const res = await fetch(`${BACKEND}/api/yonetici/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: deviceForm.name,
        category: 'cihaz',
        quantity: +deviceForm.quantity,
        minThreshold: 1,
        unit: 'adet',
        costPerUnit: +deviceForm.unitCost,
        totalCost: (+deviceForm.quantity || 0) * (+deviceForm.unitCost || 0),
        isRefund: false,
        brand: deviceForm.brand || null,
        supplierName: deviceForm.typeText || null,
        notes: deviceForm.note || undefined,
      }),
    })

    if (res.ok) {
      if (deviceForm.hasPeriodicMaintenance) {
        await fetch(`${BACKEND}/api/yonetici/device-maintenance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            deviceName: deviceForm.name,
            maintenanceType: 'periyodik',
            scheduledDate: deviceForm.firstMaintenanceDate || new Date().toISOString().slice(0, 10),
            maintenanceFirm: deviceForm.brand || undefined,
            isPeriodic: true,
            periodicDays: +deviceForm.periodicDays,
            notes: deviceForm.note || null,
          }),
        })
      }

      fetchData()
      setShowAdd(false)
      setDeviceForm({ name: '', typeText: '', quantity: '1', brand: '', unitCost: '0', hasPeriodicMaintenance: false, periodicDays: '30', firstMaintenanceDate: '', note: '' })
    }
  }

  async function applyMovement(itemId: string, type: 'giris' | 'cikis' | 'fire' | 'imha' | 'iade', quantity: number, unitCost?: number) {
    if (!quantity || quantity < 1) return
    const item = items.find(i => i.id === itemId)
    const currentQty = item?.quantity ?? 0
    const isDecreasing = ['cikis', 'fire', 'imha', 'iade'].includes(type)

    if (isDecreasing && (currentQty - quantity) < 0) {
      alert(`Yetersiz stok: ${item?.name || 'Kayıt'} için mevcut ${currentQty} adet var. -1'e düşmeden işlem durduruldu.`)
      return
    }

    const res = await fetch(`${BACKEND}/api/yonetici/inventory/movement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ itemId, type, quantity, unitCost: unitCost || 0, totalCost: (unitCost || 0) * quantity }),
    })
    if (res.ok) fetchData()
    else {
      const data = await res.json().catch(() => ({})) as { error?: string }
      alert(data.error || 'İşlem yapılamadı')
    }
  }

  const visibleItems = items.filter(i => i.quantity >= 0)

  // Filter + sort by priority
  const filtered = visibleItems
    .map(i => ({ ...i, status: getStatus(i) }))
    .filter(i => {
      if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !i.brand?.toLowerCase().includes(search.toLowerCase())) return false
      if (kindFilter === 'malzeme' && i.category === 'cihaz') return false
      if (kindFilter === 'cihaz' && i.category !== 'cihaz') return false
      if (statusFilter === 'skt' && i.status.priority !== 0 && i.status.priority !== 1) return false
      return true
    })
    .sort((a, b) => a.status.priority - b.status.priority)

  const alerts = { sktExpired: visibleItems.filter(i => daysUntil(i.expiryDate) < 0).length, sktSoon: visibleItems.filter(i => { const d = daysUntil(i.expiryDate); return d >= 0 && d <= 30 }).length }

  return (
    <div style={{ width: '100%' }}>
      {/* Alert strip */}
      {(alerts.sktExpired + alerts.sktSoon > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {alerts.sktExpired > 0 && <span className="glass-card" style={{ padding: '6px 12px', fontSize: '0.72rem', fontWeight: 600, color: '#ef4444', borderLeft: '3px solid #ef4444' }}>⛔ {alerts.sktExpired} SKT geçmiş</span>}
          {alerts.sktSoon > 0 && <span className="glass-card" style={{ padding: '6px 12px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--warning)', borderLeft: '3px solid var(--warning)' }}>🟠 {alerts.sktSoon} SKT yakın</span>}
        </div>
      )}

      {/* Toolbar */}
      <div className="glass-card" style={{ padding: '10px 14px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input placeholder="Ara..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, flex: '1 1 220px', minWidth: 140, width: 'auto' }} />
        <select value={kindFilter} onChange={e => setKindFilter(e.target.value as 'all' | 'malzeme' | 'cihaz')} style={{ ...inp, width: 'auto', minWidth: 140, flex: '1 1 140px', cursor: 'pointer' }}>
          <option value="all">Tümü</option>
          <option value="malzeme">Malzeme</option>
          <option value="cihaz">Cihaz</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 140, flex: '1 1 140px', cursor: 'pointer' }}>
          <option value="all">Tüm Durum</option>
          <option value="skt">SKT Uyarı</option>
        </select>
        <button onClick={() => setShowAdd(true)} style={{ ...btn, flex: '1 1 160px' }}>+ Yeni Kayıt</button>
      </div>

      {/* Add item form (koşullu: malzeme/cihaz) */}
      {showAdd && (
        <form onSubmit={addItem} className="glass-card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setRecordType('malzeme')
              }}
              style={{
                ...btn,
                flex: '1 1 140px',
                background: recordType === 'malzeme' ? 'var(--accent)' : 'var(--glass-bg)',
                color: recordType === 'malzeme' ? '#fff' : 'var(--foreground-2)',
                border: recordType === 'malzeme' ? 'none' : '1px solid var(--glass-border)',
              }}
            >
              Malzeme
            </button>
            <button
              type="button"
              onClick={() => {
                setRecordType('cihaz')
              }}
              style={{
                ...btn,
                flex: '1 1 140px',
                background: recordType === 'cihaz' ? 'var(--accent)' : 'var(--glass-bg)',
                color: recordType === 'cihaz' ? '#fff' : 'var(--foreground-2)',
                border: recordType === 'cihaz' ? 'none' : '1px solid var(--glass-border)',
              }}
            >
              Cihaz
            </button>
          </div>

          {recordType === 'malzeme' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Malzeme Adı *</span><input value={materialForm.name} onChange={e => setMaterialForm({ ...materialForm, name: e.target.value })} required style={inp} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Tür *</span><input value={materialForm.categoryText} onChange={e => setMaterialForm({ ...materialForm, categoryText: e.target.value })} placeholder="Örn: Sarf, Dolgu, İlaç" required style={inp} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Adet *</span><input type="number" min="1" value={materialForm.quantity} onChange={e => setMaterialForm({ ...materialForm, quantity: e.target.value })} required style={inp} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Marka (opsiyonel)</span><input value={materialForm.brand} onChange={e => setMaterialForm({ ...materialForm, brand: e.target.value })} style={inp} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Birim Tutar (₺) *</span><input type="number" min="0" value={materialForm.unitCost} onChange={e => setMaterialForm({ ...materialForm, unitCost: e.target.value })} required style={inp} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>İşlem Türü</span>
                <input value="Alım" disabled style={{ ...inp, opacity: 0.7, cursor: 'not-allowed' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Son Kullanma Bilgisi</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem', color: 'var(--foreground-2)' }}>
                  <input type="checkbox" checked={materialForm.hasExpiryDate} onChange={e => setMaterialForm({ ...materialForm, hasExpiryDate: e.target.checked, expiryDate: e.target.checked ? materialForm.expiryDate : '' })} />
                  Son kullanma tarihi var mı?
                </label>
                {materialForm.hasExpiryDate && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Son Kullanma Tarihi *</span>
                    <input type="date" value={materialForm.expiryDate} onChange={e => setMaterialForm({ ...materialForm, expiryDate: e.target.value })} required={materialForm.hasExpiryDate} style={inp} />
                  </div>
                )}
              </label>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Cihaz Adı *</span><input value={deviceForm.name} onChange={e => setDeviceForm({ ...deviceForm, name: e.target.value })} required style={inp} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Tür *</span><input value={deviceForm.typeText} onChange={e => setDeviceForm({ ...deviceForm, typeText: e.target.value })} placeholder="Örn: Röntgen, Kompresör, Tarayıcı" required style={inp} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Adet *</span><input type="number" min="1" value={deviceForm.quantity} onChange={e => setDeviceForm({ ...deviceForm, quantity: e.target.value })} required style={inp} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Marka (opsiyonel)</span><input value={deviceForm.brand} onChange={e => setDeviceForm({ ...deviceForm, brand: e.target.value })} style={inp} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Birim Tutar (₺) *</span><input type="number" min="0" value={deviceForm.unitCost} onChange={e => setDeviceForm({ ...deviceForm, unitCost: e.target.value })} required style={inp} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>İşlem Türü</span>
                <input value="Alım" disabled style={{ ...inp, opacity: 0.7, cursor: 'not-allowed' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Bakım Bilgisi</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem', color: 'var(--foreground-2)' }}>
                  <input
                    type="checkbox"
                    checked={deviceForm.hasPeriodicMaintenance}
                    onChange={e => setDeviceForm({ ...deviceForm, hasPeriodicMaintenance: e.target.checked, firstMaintenanceDate: e.target.checked ? deviceForm.firstMaintenanceDate : '' })}
                  />
                  Periyodik bakımı var
                </label>
                {deviceForm.hasPeriodicMaintenance && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Periyot (gün)</span>
                      <input type="number" min="1" value={deviceForm.periodicDays} onChange={e => setDeviceForm({ ...deviceForm, periodicDays: e.target.value })} style={inp} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>İlk Bakım Tarihi</span>
                      <input type="date" value={deviceForm.firstMaintenanceDate} onChange={e => setDeviceForm({ ...deviceForm, firstMaintenanceDate: e.target.value })} style={inp} />
                    </label>
                  </div>
                )}
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Not (opsiyonel)</span>
                <input value={deviceForm.note} onChange={e => setDeviceForm({ ...deviceForm, note: e.target.value })} placeholder="Not" style={inp} />
              </label>
            </div>
          )}

          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setShowAdd(false)} style={{ ...btn, background: 'var(--glass-bg)', color: 'var(--foreground-2)', border: '1px solid var(--glass-border)' }}>İptal</button>
            <button type="submit" style={btn}>Kaydet</button>
          </div>
        </form>
      )}

      {/* Inventory desktop table */}
      {!isMobile && (
        <div className="glass-card" style={{ padding: 0, overflow: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                {['Kayıt', 'Tür', 'Stok', 'Son Kullanma', 'Durum', 'Hızlı İşlem'].map(h => <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '0.66rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid var(--glass-border)', background: i.status.bg }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 500, color: 'var(--foreground)' }}>{i.name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--foreground-3)' }}>{i.brand ? `${i.brand}` : '—'}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--foreground-2)' }}>{i.category === 'cihaz' ? 'Cihaz' : 'Malzeme'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--foreground)' }}>{i.quantity} {i.unit}</td>
                  <td style={{ padding: '10px 12px', color: daysUntil(i.expiryDate) <= 30 ? 'var(--warning)' : 'var(--foreground-3)' }}>{i.expiryDate || '—'}</td>
                  <td style={{ padding: '10px 12px' }}><span style={{ fontSize: '0.66rem', padding: '2px 6px', borderRadius: 4, color: i.status.color }}>{i.status.label}</span></td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Adet</span>
                        <input
                          type="number"
                          min="1"
                          max={Math.max(1, i.quantity)}
                          value={qtyMap[i.id] ?? '1'}
                          onChange={e => setQtyMap(prev => ({ ...prev, [i.id]: e.target.value }))}
                          style={{ ...inp, width: 64, padding: '5px 8px', fontSize: '0.7rem' }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Tutar (₺)</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="₺"
                          value={amountMap[i.id] ?? String(i.costPerUnit || 0)}
                          onChange={e => setAmountMap(prev => ({ ...prev, [i.id]: e.target.value }))}
                          style={{ ...inp, width: 86, padding: '5px 8px', fontSize: '0.7rem' }}
                        />
                      </label>
                      <button type="button" disabled={i.quantity <= 0} onClick={() => applyMovement(i.id, 'cikis', +(qtyMap[i.id] ?? 1))} style={{ ...btn, background: 'var(--danger)', padding: '5px 8px', fontSize: '0.68rem', opacity: i.quantity <= 0 ? 0.5 : 1, cursor: i.quantity <= 0 ? 'not-allowed' : 'pointer' }}>- Kullandım</button>
                      <button type="button" disabled={i.quantity <= 0} onClick={() => applyMovement(i.id, 'fire', +(qtyMap[i.id] ?? 1))} style={{ ...btn, background: '#f59e0b', padding: '5px 8px', fontSize: '0.68rem', opacity: i.quantity <= 0 ? 0.5 : 1, cursor: i.quantity <= 0 ? 'not-allowed' : 'pointer' }}>Zayi</button>
                      <button type="button" disabled={i.quantity <= 0} onClick={() => applyMovement(i.id, 'imha', +(qtyMap[i.id] ?? 1))} style={{ ...btn, background: '#ef4444', padding: '5px 8px', fontSize: '0.68rem', opacity: i.quantity <= 0 ? 0.5 : 1, cursor: i.quantity <= 0 ? 'not-allowed' : 'pointer' }}>Süresi Doldu</button>
                      <button type="button" disabled={i.quantity <= 0} onClick={() => applyMovement(i.id, 'iade', +(qtyMap[i.id] ?? 1), +(amountMap[i.id] ?? i.costPerUnit ?? 0))} style={{ ...btn, background: '#0ea5e9', padding: '5px 8px', fontSize: '0.68rem', opacity: i.quantity <= 0 ? 0.5 : 1, cursor: i.quantity <= 0 ? 'not-allowed' : 'pointer' }}>İade</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--foreground-3)' }}>Kayıt bulunamadı</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Inventory mobile cards */}
      {isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 20 }}>
          {filtered.map(i => (
            <div key={i.id} className="glass-card" style={{ padding: 12, background: i.status.bg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>{i.name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--foreground-3)', marginTop: 2 }}>{i.category === 'cihaz' ? 'Cihaz' : 'Malzeme'}{i.brand ? ` · ${i.brand}` : ''}</div>
                </div>
                <span style={{ fontSize: '0.66rem', padding: '2px 6px', borderRadius: 4, color: i.status.color }}>{i.status.label}</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, fontSize: '0.72rem', color: 'var(--foreground-2)' }}>
                <span>Stok: <strong>{i.quantity} {i.unit}</strong></span>
                <span>Son Kullanma: <strong>{i.expiryDate || '—'}</strong></span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Adet</span>
                  <input
                    type="number"
                    min="1"
                    max={Math.max(1, i.quantity)}
                    value={qtyMap[i.id] ?? '1'}
                    onChange={e => setQtyMap(prev => ({ ...prev, [i.id]: e.target.value }))}
                    style={{ ...inp, width: 64, padding: '5px 8px', fontSize: '0.72rem' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--foreground-3)', fontWeight: 600 }}>Tutar (₺)</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="₺"
                    value={amountMap[i.id] ?? String(i.costPerUnit || 0)}
                    onChange={e => setAmountMap(prev => ({ ...prev, [i.id]: e.target.value }))}
                    style={{ ...inp, width: 86, padding: '5px 8px', fontSize: '0.72rem' }}
                  />
                </label>
                <button type="button" disabled={i.quantity <= 0} onClick={() => applyMovement(i.id, 'cikis', +(qtyMap[i.id] ?? 1))} style={{ ...btn, background: 'var(--danger)', padding: '6px 10px', fontSize: '0.68rem', opacity: i.quantity <= 0 ? 0.5 : 1, cursor: i.quantity <= 0 ? 'not-allowed' : 'pointer' }}>- Kullandım</button>
                <button type="button" disabled={i.quantity <= 0} onClick={() => applyMovement(i.id, 'fire', +(qtyMap[i.id] ?? 1))} style={{ ...btn, background: '#f59e0b', padding: '6px 10px', fontSize: '0.68rem', opacity: i.quantity <= 0 ? 0.5 : 1, cursor: i.quantity <= 0 ? 'not-allowed' : 'pointer' }}>Zayi</button>
                <button type="button" disabled={i.quantity <= 0} onClick={() => applyMovement(i.id, 'imha', +(qtyMap[i.id] ?? 1))} style={{ ...btn, background: '#ef4444', padding: '6px 10px', fontSize: '0.68rem', opacity: i.quantity <= 0 ? 0.5 : 1, cursor: i.quantity <= 0 ? 'not-allowed' : 'pointer' }}>Süresi Doldu</button>
                <button type="button" disabled={i.quantity <= 0} onClick={() => applyMovement(i.id, 'iade', +(qtyMap[i.id] ?? 1), +(amountMap[i.id] ?? i.costPerUnit ?? 0))} style={{ ...btn, background: '#0ea5e9', padding: '6px 10px', fontSize: '0.68rem', opacity: i.quantity <= 0 ? 0.5 : 1, cursor: i.quantity <= 0 ? 'not-allowed' : 'pointer' }}>İade</button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="glass-card" style={{ padding: 16, textAlign: 'center', color: 'var(--foreground-3)', fontSize: '0.75rem' }}>
              Kayıt bulunamadı
            </div>
          )}
        </div>
      )}

      {/* Recent movements */}
      {movements.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}>Son İşlemler</h3>
          <div className="glass-card" style={{ padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontSize: '0.74rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Tarih</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>İşlem</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Kayıt</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Tür</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Adet</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Not</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Kullanıcı</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 12).map(m => {
                  const mt = MOV_TYPES[m.type] || { label: m.type, color: 'var(--foreground-3)' }
                  const item = items.find(i => i.id === m.itemId)
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '9px 10px', color: 'var(--foreground-3)' }}>{new Date(m.createdAt).toLocaleString('tr-TR')}</td>
                      <td style={{ padding: '9px 10px' }}><span style={{ color: mt.color, fontWeight: 700 }}>{mt.label}</span></td>
                      <td style={{ padding: '9px 10px', color: 'var(--foreground)', fontWeight: 600 }}>{item?.name || '?'}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--foreground-2)' }}>{item?.category === 'cihaz' ? 'Cihaz' : 'Malzeme'}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--foreground-2)' }}>{m.quantity} {item?.unit || ''}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--foreground-3)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.notes || '—'}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--foreground-3)' }}>{m.userName || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deviceMaintenances.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}>Cihaz Bakım Listesi</h3>
          <div className="glass-card" style={{ padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 840, fontSize: '0.74rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Cihaz</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Bakım Türü</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Periyodik</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Periyot</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Planlanan</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Sonraki</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Not</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '0.64rem', fontWeight: 700, color: 'var(--foreground-3)', textTransform: 'uppercase' }}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {deviceMaintenances.slice(0, 20).map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '9px 10px', color: 'var(--foreground)', fontWeight: 600 }}>{m.deviceName}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--foreground-2)' }}>{m.maintenanceType}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--foreground-2)' }}>{m.isPeriodic ? 'Evet' : 'Hayır'}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--foreground-2)' }}>{m.periodicDays ? `${m.periodicDays} gün` : '—'}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--foreground-2)' }}>{m.scheduledDate}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--foreground-2)' }}>{m.nextMaintenanceDate || '—'}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--foreground-3)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.notes || '—'}</td>
                    <td style={{ padding: '9px 10px', color: m.status === 'completed' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
