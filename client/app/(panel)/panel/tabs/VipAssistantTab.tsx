'use client'

import { useState, useEffect, useCallback } from 'react'

interface VipAssistant {
  id: string
  phone: string
  contactName: string | null
  greeting: string
  customPrompt: string | null
  groundingEnabled: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

const DEFAULT_GREETING = "Merhaba! Ben Berat Bey'in kişisel asistanı Pine Asistan, hoş geldiniz! Nasıl yardımcı olabilirim?"

export default function VipAssistantTab() {
  const [list, setList] = useState<VipAssistant[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<VipAssistant | null>(null)

  // Form states
  const [phone, setPhone] = useState('')
  const [contactName, setContactName] = useState('')
  const [greeting, setGreeting] = useState(DEFAULT_GREETING)
  const [customPrompt, setCustomPrompt] = useState('')
  const [groundingEnabled, setGroundingEnabled] = useState(true)
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchList = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/vip-assistants')
      if (res.ok) {
        const data = await res.json()
        setList(data.list || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  function openCreateModal() {
    setEditingItem(null)
    setPhone('05056397351')
    setContactName('')
    setGreeting(DEFAULT_GREETING)
    setCustomPrompt('')
    setGroundingEnabled(true)
    setActive(true)
    setError('')
    setShowModal(true)
  }

  function openEditModal(item: VipAssistant) {
    setEditingItem(item)
    setPhone(item.phone)
    setContactName(item.contactName || '')
    setGreeting(item.greeting || DEFAULT_GREETING)
    setCustomPrompt(item.customPrompt || '')
    setGroundingEnabled(item.groundingEnabled)
    setActive(item.active)
    setError('')
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!phone.trim()) {
      setError('Telefon numarası zorunludur.')
      return
    }

    setSaving(true)
    try {
      const url = editingItem
        ? `/api/admin/vip-assistants/${editingItem.id}`
        : '/api/admin/vip-assistants'
      const method = editingItem ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          contactName: contactName.trim() || null,
          greeting: greeting.trim() || DEFAULT_GREETING,
          customPrompt: customPrompt.trim() || null,
          groundingEnabled,
          active,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Kaydedilemedi.')
        return
      }

      setShowModal(false)
      fetchList()
    } catch {
      setError('Sunucu bağlantı hatası.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, nameOrPhone: string) {
    if (!confirm(`"${nameOrPhone}" kaydını silmek istediğinize emin misiniz?`)) return
    try {
      const res = await fetch(`/api/admin/vip-assistants/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchList()
      }
    } catch {
      alert('Silinemedi.')
    }
  }

  async function toggleStatus(item: VipAssistant) {
    try {
      const res = await fetch(`/api/admin/vip-assistants/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active }),
      })
      if (res.ok) {
        fetchList()
      }
    } catch {
      // ignore
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '16px 20px',
          background: 'var(--card-bg, #1e293b)',
          border: '1px solid var(--input-border, #334155)',
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground, #ffffff)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🌟</span> Özel Kişisel Asistan (VIP Hatlar)
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--foreground-2, #94a3b8)' }}>
            Bu listedeki numaralar aradığında klinik randevu akışı devre dışı kalır. &quot;Pine Asistan&quot; olarak Berat Bey&apos;in kişisel asistanı karşılar ve Google Grounding ile canlı arama yapar.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 18px',
            borderRadius: 8,
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            fontSize: '0.84rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span>+</span> Yeni VIP Numara Ekle
        </button>
      </div>

      {/* Info Card */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--card-inner, #0f172a)',
          border: '1px solid var(--glass-border, #1e3a8a)',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: '0.82rem',
          color: 'var(--foreground-2, #cbd5e1)',
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: '#60a5fa', fontWeight: 600 }}>💡 Nasıl Çalışır:</span> Arayan numara Asterisk santralinden otomatik tespit edilir. Sistem arayan kişiden ASLA telefon veya kimlik istemez. Doğrudan belirlediğiniz özel karşılama ile başlar ve Google Grounding aktifse internetteki güncel bilgileri sorgulayıp yanıtlar.
      </div>

      {/* Table Container */}
      <div
        style={{
          background: 'var(--card-bg, #1e293b)',
          border: '1px solid var(--input-border, #334155)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--foreground-3, #94a3b8)', fontSize: '0.85rem' }}>
            VIP numaralar yükleniyor...
          </div>
        ) : list.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ color: 'var(--foreground-3, #94a3b8)', margin: '0 0 16px', fontSize: '0.9rem' }}>Henüz kayıtlı VIP numara bulunmuyor.</p>
            <button
              onClick={openCreateModal}
              className="btn-clinic-primary"
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              05056397351 Numarasını Ekle
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: 'var(--background-2, #0f172a)', borderBottom: '1px solid var(--divider, #334155)', color: 'var(--foreground-2, #94a3b8)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Numara</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Kişi / İsim</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Özel Karşılama Cümlesi</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Google Grounding</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Durum</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {list.map((item) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid #334155',
                      background: item.active ? 'transparent' : '#0f172a',
                      opacity: item.active ? 1 : 0.65,
                    }}
                  >
                    <td style={{ padding: '14px 16px', color: '#ffffff', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      📞 {item.phone}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>
                      {item.contactName || <span style={{ color: '#64748b' }}>—</span>}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#94a3b8', maxWidth: 320 }}>
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: '#e2e8f0',
                        }}
                        title={item.greeting}
                      >
                        {item.greeting}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {item.groundingEnabled ? (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: '#065f46',
                            color: '#34d399',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                          }}
                        >
                          🔍 Canlı Arama Açık
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: '#334155',
                            color: '#94a3b8',
                            fontSize: '0.74rem',
                          }}
                        >
                          Kapalı
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => toggleStatus(item)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: item.active ? '#1e3a8a' : '#334155',
                          color: item.active ? '#93c5fd' : '#94a3b8',
                          border: item.active ? '1px solid #3b82f6' : '1px solid #475569',
                          cursor: 'pointer',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                        }}
                      >
                        {item.active ? '✓ Aktif' : '✕ Pasif'}
                      </button>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => openEditModal(item)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 6,
                          background: '#334155',
                          color: '#f8fafc',
                          border: 'none',
                          fontSize: '0.76rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          marginRight: 8,
                        }}
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.contactName || item.phone)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 6,
                          background: '#7f1d1d',
                          color: '#fca5a5',
                          border: 'none',
                          fontSize: '0.76rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal - Strict Flat Architecture (No Glassmorphism) */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.75)',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 540,
              background: 'var(--card-bg, #1e293b)',
              border: '1px solid var(--input-border, #334155)',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              color: 'var(--foreground, #ffffff)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--foreground, #ffffff)' }}>
                {editingItem ? 'VIP Numarayı Düzenle' : 'Yeni VIP Numara Ekle'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  background: '#7f1d1d',
                  color: '#fca5a5',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 6, fontWeight: 500 }}>
                  Telefon Numarası *
                </label>
                <input
                  type="text"
                  placeholder="05056397351"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--input-bg, #0f172a)',
                    border: '1px solid var(--input-border, #334155)',
                    color: 'var(--foreground, #ffffff)',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 6, fontWeight: 500 }}>
                  Kişi Adı / Açıklama
                </label>
                <input
                  type="text"
                  placeholder="Örn: Berat Bey Özel Hat"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--input-bg, #0f172a)',
                    border: '1px solid var(--input-border, #334155)',
                    color: 'var(--foreground, #ffffff)',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 6, fontWeight: 500 }}>
                  İlk Karşılama Cümlesi *
                </label>
                <textarea
                  rows={2}
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--input-bg, #0f172a)',
                    border: '1px solid var(--input-border, #334155)',
                    color: 'var(--foreground, #ffffff)',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--foreground-3, #64748b)' }}>
                  Telefon açıldığında asistanın söyleyeceği ilk cümle.
                </span>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--foreground-2, #94a3b8)', marginBottom: 6, fontWeight: 500 }}>
                  Özel Kişisel Asistan Promptu (Opsiyonel)
                </label>
                <textarea
                  rows={3}
                  placeholder="Boş bırakılırsa varsayılan neşeli, kahkaha atabilen, klinikten bağımsız Berat Bey asistanı promptu kullanılır."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--input-bg, #0f172a)',
                    border: '1px solid var(--input-border, #334155)',
                    color: 'var(--foreground, #ffffff)',
                    fontSize: '0.82rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={groundingEnabled}
                    onChange={(e) => setGroundingEnabled(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#2563eb' }}
                  />
                  <span style={{ fontSize: '0.84rem', color: '#e2e8f0', fontWeight: 500 }}>
                    🔍 Google Grounding (Canlı Web Arama) Açık
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#2563eb' }}
                  />
                  <span style={{ fontSize: '0.84rem', color: '#e2e8f0' }}>
                    Bu numara için VIP Asistan Aktif
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 8,
                    background: '#334155',
                    color: '#e2e8f0',
                    border: 'none',
                    fontSize: '0.84rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 8,
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: saving ? 'wait' : 'pointer',
                  }}
                >
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
