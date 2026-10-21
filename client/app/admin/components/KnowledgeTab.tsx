'use client'
import { useState, useEffect, useCallback } from 'react'
import FlowBuilder from './FlowBuilder'
import WhatsAppConversationsCard from './WhatsAppConversationsCard'
import VoiceAiSettings from './VoiceAiSettings'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'

function Spinner() {
  return (
    <div style={{
      width: 16, height: 16,
      border: '2px solid rgba(255,255,255,0.08)',
      borderTopColor: '#0369A1',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeDoc {
  id: string
  category: string
  title: string
  content: string
  callDirection: 'inbound' | 'outbound' | 'both'
  active: boolean
  embeddedAt: string
  createdAt: string
  updatedAt: string
}

interface CategoryDef {
  id: string
  slug: string
  label: string
  icon: string
  color: string
  sortOrder: number
}

type Category = string

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  doc: Partial<KnowledgeDoc> | null
  onClose: () => void
  onSave: (data: { category: Category; title: string; content: string; callDirection: 'inbound' | 'outbound' | 'both'; active: boolean }) => Promise<void>
  saving: boolean
  categories: CategoryDef[]
}

function DocModal({ doc, onClose, onSave, saving, categories }: ModalProps) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const isEdit = !!doc?.id
  const [category, setCategory] = useState<Category>((doc?.category as Category) || 'genel')
  const [title, setTitle] = useState(doc?.title || '')
  const [content, setContent] = useState(doc?.content || '')
  const [callDirection, setCallDirection] = useState<'inbound' | 'outbound' | 'both'>((doc?.callDirection as 'inbound' | 'outbound' | 'both') || 'both')
  const [active, setActive] = useState(doc?.active !== false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    onSave({ category, title: title.trim(), content: content.trim(), callDirection, active })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }} {...backdropDismiss}>
      <div style={{
        background: 'var(--card-bg, #1e293b)', border: '1px solid var(--input-border, #334155)',
        borderRadius: 20, padding: '2rem', width: '100%', maxWidth: 800,
        animation: 'fadeIn 0.2s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {isEdit ? '✏️ Belge Düzenle' : '+ Yeni Belge'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Kategori */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--foreground-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
              Kategori
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {categories.map(cat => (
                <button key={cat.slug} type="button" onClick={() => setCategory(cat.slug)} style={{
                  padding: '5px 12px', borderRadius: 20, border: '1px solid', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500, transition: 'all 0.15s',
                  background: category === cat.slug ? `rgba(${hexToRgb(cat.color)}, 0.2)` : 'rgba(255,255,255,0.04)',
                  borderColor: category === cat.slug ? cat.color : 'rgba(255,255,255,0.08)',
                  color: category === cat.slug ? cat.color : '#94a3b8',
                }}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Başlık */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--foreground-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
              Başlık
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Örn: Mayıs 2026 Kampanyası"
              required
              style={{
                width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--foreground)',
                fontSize: '0.875rem', outline: 'none',
              }}
            />
          </div>

          {/* İçerik */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--foreground-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
              İçerik <span style={{ color: '#475569', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(AI bu metni okuyacak)</span>
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Bilgi bankasına eklemek istediğiniz içeriği buraya yazın..."
              required
              rows={7}
              style={{
                width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--foreground)',
                fontSize: '0.875rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.6,
              }}
            />
          </div>

          {/* Yön (Arama Yönü) Seçimi */}
          {/* Kullanım Yeri Seçimi (Gelişmiş değil, sadece sadeleştirildi) */}
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--foreground-2)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
              🔀 Kullanım Yeri
            </label>
            <select
              value={callDirection}
              onChange={e => setCallDirection(e.target.value as any)}
              style={{
                width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--foreground)',
                fontSize: '0.85rem', outline: 'none', cursor: 'pointer', appearance: 'none'
              }}
            >
              <option value="both">Tüm Aramalar (Varsayılan)</option>
              <option value="inbound">Sadece Bizi Aradıklarında (Gelen Arama)</option>
              <option value="outbound">Sadece Biz Aradığımızda (Giden Arama)</option>
            </select>
          </div>

          {/* Aktif toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setActive(!active)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                background: active ? '#22c55e' : 'rgba(255,255,255,0.1)',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: active ? 23 : 3, width: 18, height: 18,
                borderRadius: '50%', background: 'white', transition: 'left 0.2s',
              }} />
            </button>
            <span style={{ fontSize: '0.875rem', color: active ? '#22c55e' : '#64748b' }}>
              {active ? 'Aktif — AI bu belgeyi kullanır' : 'Pasif — AI bu belgeyi kullanmaz'}
            </span>
          </div>

          {/* Butonlar */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn btn-ghost" style={{ fontSize: '0.875rem' }} disabled={saving}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !title.trim() || !content.trim()} style={{ fontSize: '0.875rem', minWidth: 140 }}>
              {saving ? '⏳ Embedding…' : isEdit ? '💾 Güncelle' : '✨ Kaydet & Göm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  if (!hex || hex.length < 7) return '96, 165, 250'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

function fmtDate(d: string) {
  if (!d) return ''
  try { return new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return d }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function KnowledgeTab() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [totalEmbedded, setTotalEmbedded] = useState(0)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryDef[]>([])
  const [catFilter, setCatFilter] = useState<Category | 'all'>('all')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound' | 'both'>('all')
  const [modal, setModal] = useState<{ open: boolean; doc: Partial<KnowledgeDoc> | null }>({ open: false, doc: null })
  const [saving, setSaving] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  
  // Greeting state
  const [greetingTab, setGreetingTab] = useState<'inbound' | 'outbound' | 'callerid'>('inbound')
  const [greetingText, setGreetingText] = useState('')
  const [greetingOutboundText, setGreetingOutboundText] = useState('')
  const [outboundCallerId, setOutboundCallerId] = useState('08503096119')
  const [greetingLoading, setGreetingLoading] = useState(true)
  const [greetingSaving, setGreetingSaving] = useState(false)
  const [callerIdSaving, setCallerIdSaving] = useState(false)

  // Flow Builder Direction State
  const [flowDirection, setFlowDirection] = useState<'inbound' | 'outbound'>('inbound')

  // Outbound Call Modal state
  const [callModalOpen, setCallModalOpen] = useState(false)
  const [callPhone, setCallPhone] = useState('')
  const [calling, setCalling] = useState(false)
  const callModalBackdropDismiss = useBackdropDismiss(() => setCallModalOpen(false))

  const handleOutboundCall = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!callPhone) return
    setCalling(true)
    try {
      const res = await fetch('/api/admin/calls/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: callPhone, to: callPhone }),
      })
      if (res.ok) {
        showToast('📞 Arama başlatıldı!')
        setCallModalOpen(false)
        setCallPhone('')
      } else {
        const data = await res.json()
        showToast(data.error || 'Arama başarısız', 'error')
      }
    } catch {
      showToast('Arama başarısız', 'error')
    }
    setCalling(false)
  }

  const fetchGreeting = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings/greeting')
      if (res.ok) {
        const data = await res.json() as { greeting?: string; greetingOutbound?: string }
        if (data.greeting) setGreetingText(data.greeting)
        if (data.greetingOutbound) setGreetingOutboundText(data.greetingOutbound)
      }
      const callerRes = await fetch('/api/admin/settings/outbound-caller-id')
      if (callerRes.ok) {
        const callerData = await callerRes.json() as { callerId?: string }
        if (callerData.callerId) setOutboundCallerId(callerData.callerId)
      }
    } catch { /* ignore */ }
    setGreetingLoading(false)
  }, [])

  const handleSaveGreeting = async (type: 'inbound' | 'outbound') => {
    const textToSave = type === 'inbound' ? greetingText : greetingOutboundText
    if (!textToSave.trim() || greetingSaving) return
    setGreetingSaving(true)
    try {
      const bodyPayload = type === 'inbound' ? { greeting: greetingText.trim() } : { greetingOutbound: greetingOutboundText.trim() }
      const res = await fetch('/api/admin/settings/greeting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      })
      if (res.ok) {
        showToast(type === 'inbound' ? '✅ Gelen Karşılama Mesajı kaydedildi' : '✅ Giden Karşılama Mesajı kaydedildi')
      } else {
        showToast('Kayıt başarısız', 'error')
      }
    } catch {
      showToast('Kayıt başarısız', 'error')
    }
    setGreetingSaving(false)
  }

  const handleSaveCallerId = async () => {
    if (!outboundCallerId.trim() || callerIdSaving) return
    setCallerIdSaving(true)
    try {
      const res = await fetch('/api/admin/settings/outbound-caller-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callerId: outboundCallerId.trim() }),
      })
      if (res.ok) {
        showToast('✅ Dış Arama CallerID kaydedildi')
      } else {
        showToast('Kayıt başarısız', 'error')
      }
    } catch {
      showToast('Kayıt başarısız', 'error')
    }
    setCallerIdSaving(false)
  }

  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [catMgmtOpen, setCatMgmtOpen] = useState(false)
  const [newCatSlug, setNewCatSlug] = useState('')
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('📁')
  const [newCatColor, setNewCatColor] = useState('#60a5fa')
  const [catSaving, setCatSaving] = useState(false)

  const getCatColor = (slug: string) => categories.find(c => c.slug === slug)?.color ?? '#60a5fa'
  const getCatIcon = (slug: string) => categories.find(c => c.slug === slug)?.icon ?? '📁'
  const getCatLabel = (slug: string) => categories.find(c => c.slug === slug)?.label ?? slug

  const addCategory = async () => {
    if (!newCatSlug.trim() || !newCatLabel.trim()) return
    setCatSaving(true)
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newCatSlug.trim().toLowerCase(), label: newCatLabel.trim(), icon: newCatIcon, color: newCatColor }),
      })
      if (res.ok) {
        setNewCatSlug(''); setNewCatLabel(''); setNewCatIcon('📁'); setNewCatColor('#60a5fa')
        await load()
        showToast('✅ Kategori eklendi')
      } else {
        const data = await res.json()
        showToast(data.error || 'Hata', 'error')
      }
    } catch { showToast('Kategori eklenemedi', 'error') }
    setCatSaving(false)
  }

  const deleteCategory = async (id: string) => {
    if (!confirm('Bu kategoriyi silmek istediğinizden emin misiniz? Bağlı belgeler Genel kategorisine taşınacak.')) return
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' })
      if (res.ok) { await load(); showToast('🗑 Kategori silindi') }
      else showToast('Silinemedi', 'error')
    } catch { showToast('Hata', 'error') }
  }
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, catRes] = await Promise.all([
        fetch('/api/knowledge'),
        fetch('/api/admin/categories'),
      ])
      if (!r.ok) {
        const result = await r.json().catch(() => ({}))
        throw new Error(result.error || 'Belge kaydedilemedi')
      }
      const data = await r.json()
      setDocs(data.docs || [])
      setTotalEmbedded(data.totalEmbedded || 0)
      if (catRes.ok) {
        const cats = await catRes.json()
        setCategories(cats)
      }
    } catch {
      showToast('Bilgi bankası yüklenemedi', 'error')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    fetchGreeting()
  }, [load, fetchGreeting])

  // Filter both by category and call direction
  const filtered = docs.filter(d => {
    const matchCat = catFilter === 'all' || d.category === catFilter
    const matchDir = directionFilter === 'all' || d.callDirection === directionFilter || (directionFilter === 'both' && (!d.callDirection || d.callDirection === 'both'))
    return matchCat && matchDir
  })

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const handleSave = async (data: { category: Category; title: string; content: string; callDirection: 'inbound' | 'outbound' | 'both'; active: boolean }) => {
    setSaving(true)
    try {
      const isEdit = !!modal.doc?.id
      const url = isEdit ? `/api/knowledge/${modal.doc!.id}` : '/api/knowledge'
      const method = isEdit ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!r.ok) throw new Error()
      setModal({ open: false, doc: null })
      await load()
      showToast(isEdit ? '✅ Belge güncellendi ve yeniden gömüldü' : '✅ Belge eklendi ve gömüldü')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Kayıt başarısız', 'error')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu belgeyi silmek istediğinizden emin misiniz?')) return
    setDeletingId(id)
    try {
      const r = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      setDocs(prev => prev.filter(d => d.id !== id))
      showToast('🗑 Belge silindi')
    } catch {
      showToast('Silme başarısız', 'error')
    }
    setDeletingId(null)
  }

  const handleToggle = async (id: string) => {
    setTogglingId(id)
    try {
      const r = await fetch(`/api/knowledge/${id}/toggle`, { method: 'PATCH' })
      if (!r.ok) throw new Error()
      const data = await r.json()
      setDocs(prev => prev.map(d => d.id === id ? { ...d, active: data.doc.active } : d))
    } catch {
      showToast('Durum değiştirilemedi', 'error')
    }
    setTogglingId(null)
  }

  const handleReindex = async () => {
    if (!confirm(`${docs.length} belgenin tamamı yeniden embedding yapılacak. Devam?`)) return
    setReindexing(true)
    try {
      const r = await fetch('/api/knowledge/reindex', { method: 'PUT' })
      const data = await r.json()
      await load()
      showToast(`✅ ${data.results?.success || 0} belge yeniden indekslendi`)
    } catch {
      showToast('Reindex başarısız', 'error')
    }
    setReindexing(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, right: 24, zIndex: 2000,
          background: 'var(--card-bg, #1e293b)',
          border: `1px solid ${toast.type === 'success' ? '#22c55e' : '#ef4444'}`,
          color: toast.type === 'success' ? '#22c55e' : '#ef4444',
          borderRadius: 12, padding: '10px 18px', fontSize: '0.875rem', fontWeight: 500,
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.2s ease',
          maxWidth: 340,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header & Filter Controls */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Top bar: Action buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              🧠 Bilgi Bankası & Yapay Zeka Akışları
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--foreground-3)', margin: '2px 0 0' }}>
              Gelen ve giden aramalar için bilgi belgeleri, karşılama mesajları ve senaryolar
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {!loading && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, fontSize: '0.78rem', color: 'var(--foreground-3)',
              }}>
                <span style={{ color: totalEmbedded === docs.length && docs.length > 0 ? '#22c55e' : '#f59e0b' }}>
                  ⚡
                </span>
                {totalEmbedded}/{docs.length} embedding hazır
              </div>
            )}

            <button
              onClick={handleReindex}
              disabled={reindexing || docs.length === 0}
              className="btn btn-ghost"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              {reindexing ? '⏳ İndeksleniyor…' : '🔄 Tümünü Yenile'}
            </button>

            <button
              onClick={() => setModal({ open: true, doc: null })}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '6px 16px' }}
            >
              + Yeni Belge
            </button>
            
            <button
              onClick={() => setCallModalOpen(true)}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '6px 16px', background: '#ec4899', borderColor: '#ec4899' }}
            >
              📞 Yapay Zeka ile Ara
            </button>
          </div>
        </div>

        {/* Filter bars */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Category filters */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--foreground-3)', marginRight: 4 }}>Kategori:</span>
            {(['all', ...categories.map(c => c.slug)] as const).map(cat => (
              <button key={cat} onClick={() => setCatFilter(cat as Category | 'all')} style={{
                padding: '4px 10px', borderRadius: 8, border: '1px solid', fontSize: '0.74rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                background: catFilter === cat ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)',
                borderColor: catFilter === cat ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)',
                color: catFilter === cat ? '#60a5fa' : '#94a3b8',
              }}>
                {cat === 'all' ? 'Tümü' : `${getCatIcon(cat)} ${getCatLabel(cat)}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category Management */}
      <div className="glass-card" style={{ padding: '0.75rem 1.25rem', marginBottom: '1rem' }}>
        <button onClick={() => setCatMgmtOpen(!catMgmtOpen)} style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-3)' }}>⚙️ Kategori Yönetimi</span>
          <span style={{ fontSize: 12, color: 'var(--foreground-3)', transform: catMgmtOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
        </button>

        {catMgmtOpen && (
          <div style={{ marginTop: 12 }}>
            {/* Existing categories */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {categories.map(cat => (
                <div key={cat.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 20,
                  background: `rgba(${hexToRgb(cat.color)}, 0.15)`,
                  border: `1px solid ${cat.color}`,
                  fontSize: 12, color: cat.color,
                }}>
                  {cat.icon} {cat.label}
                  {cat.slug !== 'genel' && (
                    <button onClick={() => deleteCategory(cat.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#ef4444', fontSize: 11, padding: 0, marginLeft: 4,
                    }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* Add new category */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 100px' }}>
                <label style={{ fontSize: 10, color: 'var(--foreground-3)', display: 'block', marginBottom: 3 }}>Slug (key)</label>
                <input value={newCatSlug} onChange={e => setNewCatSlug(e.target.value)} placeholder="ornek" style={{
                  width: '100%', padding: '5px 8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, color: 'var(--foreground)', fontSize: 11, outline: 'none',
                }} />
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <label style={{ fontSize: 10, color: 'var(--foreground-3)', display: 'block', marginBottom: 3 }}>Etiket</label>
                <input value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)} placeholder="Örnek Kategori" style={{
                  width: '100%', padding: '5px 8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, color: 'var(--foreground)', fontSize: 11, outline: 'none',
                }} />
              </div>
              <div style={{ flex: '0 0 50px' }}>
                <label style={{ fontSize: 10, color: 'var(--foreground-3)', display: 'block', marginBottom: 3 }}>İkon</label>
                <input value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)} style={{
                  width: '100%', padding: '5px 8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, color: 'var(--foreground)', fontSize: 11, outline: 'none', textAlign: 'center',
                }} />
              </div>
              <div style={{ flex: '0 0 60px' }}>
                <label style={{ fontSize: 10, color: 'var(--foreground-3)', display: 'block', marginBottom: 3 }}>Renk</label>
                <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} style={{
                  width: '100%', height: 28, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent',
                }} />
              </div>
              <button onClick={addCategory} disabled={catSaving || !newCatSlug.trim() || !newCatLabel.trim()} style={{
                padding: '5px 14px', borderRadius: 6, background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: 11,
                cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
              }}>
                {catSaving ? '...' : '+ Ekle'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', gap: 16, alignItems: 'start', marginBottom: 24 }}>
        {/* Sol Kolon: Bilgi Bankası Belgeleri */}
        <div>
          {/* Loading */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--foreground-3)' }}>⏳ Yükleniyor…</div>
          ) : filtered.length === 0 ? (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--foreground-3)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🧠</div>
              <div style={{ marginBottom: '0.5rem' }}>Filtrelere uygun belge bulunamadı</div>
              <div style={{ fontSize: '0.8rem', marginBottom: '1.25rem', color: '#475569' }}>
                Yeni belge ekleyerek AI'ı bilgilendirin
              </div>
              <button onClick={() => setModal({ open: true, doc: null })} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>
                + İlk Belgeyi Ekle
              </button>
            </div>
          ) : (
            /* Doc grid */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem' }}>
              {filtered.map(doc => {
                const color = getCatColor(doc.category)
                const hasEmbedding = !!doc.embeddedAt
                const dir = doc.callDirection || 'both'

                return (
                  <div key={doc.id} className="glass-card" style={{
                    padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
                    borderLeft: `3px solid ${color}`, opacity: doc.active ? 1 : 0.55,
                    transition: 'opacity 0.2s',
                  }}>
                    {/* Top row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                            color, background: `rgba(${hexToRgb(color)}, 0.15)`,
                            padding: '2px 8px', borderRadius: 20, border: `1px solid rgba(${hexToRgb(color)}, 0.25)`,
                            flexShrink: 0,
                          }}>
                            {getCatIcon(doc.category)} {getCatLabel(doc.category)}
                          </span>

                          {/* Direction Badge (Only show if restricted) */}
                          {dir !== 'both' && (
                            <span style={{
                              fontSize: '0.68rem', fontWeight: 600,
                              padding: '2px 8px', borderRadius: 20,
                              background: dir === 'inbound' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                              border: `1px solid ${dir === 'inbound' ? 'rgba(59,130,246,0.3)' : 'rgba(16,185,129,0.3)'}`,
                              color: dir === 'inbound' ? '#60a5fa' : '#34d399',
                            }} title={dir === 'inbound' ? 'Sadece Gelen Aramalarda Kullanılır' : 'Sadece Giden Aramalarda Kullanılır'}>
                              {dir === 'inbound' ? '📥 Sadece Gelen' : '📤 Sadece Giden'}
                            </span>
                          )}
                        </div>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.3 }}>
                          {doc.title}
                        </h3>
                      </div>

                      {/* Active toggle */}
                      <button
                        onClick={() => handleToggle(doc.id)}
                        disabled={togglingId === doc.id}
                        title={doc.active ? 'Pasif yap' : 'Aktif yap'}
                        style={{
                          width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                          transition: 'all 0.2s', position: 'relative', flexShrink: 0,
                          background: doc.active ? '#22c55e' : 'rgba(255,255,255,0.12)',
                          opacity: togglingId === doc.id ? 0.5 : 1,
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 3, left: doc.active ? 19 : 3, width: 16, height: 16,
                          borderRadius: '50%', background: 'white', transition: 'left 0.2s',
                        }} />
                      </button>
                    </div>

                    {/* Content accordion */}
                    <div>
                      <p style={{
                        fontSize: '0.8rem', color: 'var(--foreground-3)', lineHeight: 1.55, margin: 0,
                        ...(expandedId === doc.id ? {} : {
                          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }),
                      }}>
                        {doc.content}
                      </p>
                      <button
                        onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 0',
                          fontSize: '0.72rem', color: '#475569', display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {expandedId === doc.id ? '▲ Küçült' : '▼ Tamamını gör'}
                      </button>
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.68rem', color: '#475569' }}>
                        {hasEmbedding ? (
                          <span style={{ color: '#22c55e' }}>✅ Embedding hazır</span>
                        ) : (
                          <span style={{ color: '#f59e0b' }}>⚠️ Embedding yok</span>
                        )}
                        {doc.embeddedAt && (
                          <span style={{ marginLeft: 6, color: '#334155' }}>
                            {fmtDate(doc.embeddedAt)}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setModal({ open: true, doc })}
                          className="btn btn-ghost"
                          style={{ padding: '4px 10px', fontSize: '0.73rem' }}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deletingId === doc.id}
                          className="btn btn-danger"
                          style={{ padding: '4px 10px', fontSize: '0.73rem', opacity: deletingId === doc.id ? 0.5 : 1 }}
                        >
                          {deletingId === doc.id ? '…' : '🗑'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sağ Kolon: Gelen & Giden Karşılama Mesajları ve Ses Ayarları */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Karşılama Mesajı kartı (Tabs: Gelen / Giden / CallerID) */}
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 14, paddingBottom: 12,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                  🗣️ Karşılama Mesajları & Hat Ayarı
                </span>
                <p style={{ fontSize: 11, color: 'var(--foreground-3)', margin: '2px 0 0' }}>
                  Gelen ve giden aramalar için ayrı açılış metinleri
                </p>
              </div>
              {greetingLoading && <Spinner />}
            </div>

            {/* Tab switchers */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 10 }}>
              <button
                type="button"
                onClick={() => setGreetingTab('inbound')}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, transition: 'all 0.2s',
                  background: greetingTab === 'inbound' ? 'rgba(59,130,246,0.25)' : 'transparent',
                  color: greetingTab === 'inbound' ? '#60a5fa' : 'var(--foreground-3)',
                }}
              >
                📥 Gelen Arama
              </button>
              <button
                type="button"
                onClick={() => setGreetingTab('outbound')}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, transition: 'all 0.2s',
                  background: greetingTab === 'outbound' ? 'rgba(16,185,129,0.25)' : 'transparent',
                  color: greetingTab === 'outbound' ? '#34d399' : 'var(--foreground-3)',
                }}
              >
                📤 Giden Arama
              </button>
              <button
                type="button"
                onClick={() => setGreetingTab('callerid')}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, transition: 'all 0.2s',
                  background: greetingTab === 'callerid' ? 'rgba(236,72,153,0.25)' : 'transparent',
                  color: greetingTab === 'callerid' ? '#f472b6' : 'var(--foreground-3)',
                }}
              >
                📞 Arayan Numara
              </button>
            </div>

            {!greetingLoading && (
              <>
                {/* 📥 Gelen Arama Karşılama */}
                {greetingTab === 'inbound' && (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 8, lineHeight: 1.5 }}>
                      Müşteri kliniği aradığında AI asistanın söyleyeceği ilk karşılama cümlesi:
                    </p>
                    <textarea
                      value={greetingText}
                      onChange={(e) => setGreetingText(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%', padding: '10px 12px', fontSize: 12, lineHeight: 1.5,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, color: 'var(--foreground)', resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                      }}
                      placeholder="Merhaba, hoş geldiniz! Ben Pine Klinik asistanınızım. Size nasıl yardımcı olabilirim?"
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => handleSaveGreeting('inbound')}
                        disabled={greetingSaving || !greetingText.trim()}
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: '6px 16px' }}
                      >
                        {greetingSaving ? 'Kaydediliyor...' : '📥 Gelen Karşılamayı Kaydet'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 📤 Giden Arama Karşılama */}
                {greetingTab === 'outbound' && (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 8, lineHeight: 1.5 }}>
                      AI asistan hastayı/müşteriyi dış aramada aradığında söyleyeceği ilk karşılama cümlesi:
                    </p>
                    <textarea
                      value={greetingOutboundText}
                      onChange={(e) => setGreetingOutboundText(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%', padding: '10px 12px', fontSize: 12, lineHeight: 1.5,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, color: 'var(--foreground)', resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                      }}
                      placeholder="Merhaba, ben Pine Klinik asistanıyım. Tedavi sonrası memnuniyet anketimiz için arıyorum..."
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => handleSaveGreeting('outbound')}
                        disabled={greetingSaving || !greetingOutboundText.trim()}
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: '6px 16px', background: '#10b981', borderColor: '#10b981' }}
                      >
                        {greetingSaving ? 'Kaydediliyor...' : '📤 Giden Karşılamayı Kaydet'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 📞 Dış Arama CallerID */}
                {greetingTab === 'callerid' && (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 8, lineHeight: 1.5 }}>
                      Robotun dış arama yaparken karşı tarafın ekranında görünecek NetGSM çıkış numarası:
                    </p>
                    <input
                      value={outboundCallerId}
                      onChange={(e) => setOutboundCallerId(e.target.value)}
                      placeholder="08503096119"
                      style={{
                        width: '100%', padding: '8px 12px', fontSize: 13,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, color: 'var(--foreground)', outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={handleSaveCallerId}
                        disabled={callerIdSaving || !outboundCallerId.trim()}
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: '6px 16px', background: '#ec4899', borderColor: '#ec4899' }}
                      >
                        {callerIdSaving ? 'Kaydediliyor...' : '📞 CallerID Kaydet'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <VoiceAiSettings onToast={showToast} />
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <WhatsAppConversationsCard />
      </div>

      {/* Alt Satır: Konuşma Akışı (Flow Builder - Gelen ve Giden Tabları) */}
      <div className="glass-card" style={{ width: '100%', padding: '1.25rem', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--flow-panel-border)', paddingBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              🔀 Konuşma Akışı Senaryoları (Flow Builder)
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--foreground-3)', margin: '4px 0 0' }}>
              Yapay zekanın görüşme esnasında soracağı soruları, kontrolleri ve randevu adımlarını görsel olarak tasarlayın
            </p>
          </div>

          {/* Flow Direction Selector Switcher */}
          <div style={{ display: 'flex', background: 'var(--flow-panel-bg)', padding: 4, borderRadius: 10, border: '1px solid var(--flow-panel-border)' }}>
            <button
              onClick={() => setFlowDirection('inbound')}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.2s',
                background: flowDirection === 'inbound' ? '#2563eb' : 'var(--flow-panel-bg)',
                color: flowDirection === 'inbound' ? '#fff' : 'var(--foreground-3)',
                boxShadow: flowDirection === 'inbound' ? '0 2px 8px rgba(59,130,246,0.4)' : 'none',
              }}
            >
              📥 Gelen Arama Akışı (Randevu)
            </button>
            <button
              onClick={() => setFlowDirection('outbound')}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.2s',
                background: flowDirection === 'outbound' ? '#047857' : 'var(--flow-panel-bg)',
                color: flowDirection === 'outbound' ? '#fff' : 'var(--foreground-3)',
                boxShadow: flowDirection === 'outbound' ? '0 2px 8px rgba(16,185,129,0.4)' : 'none',
              }}
            >
              📤 Giden Arama Akışı (Anket & Takip)
            </button>
          </div>
        </div>

        {/* Current Flow Notice */}
        <div style={{
          padding: '8px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.8rem',
          background: 'var(--flow-info-bg)',
          border: '1px solid var(--flow-info-border)',
          color: 'var(--flow-info-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>
            {flowDirection === 'inbound' 
              ? '📥 Şu an **Gelen Arama Akışı** düzenleniyor. Kliniği arayan hastaların görüşme akışıdır.' 
              : '📤 Şu an **Giden Arama Akışı** düzenleniyor. Robotun dışarıya yaptığı anket ve takip aramalarının akışıdır.'}
          </span>
          <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>Yön: {flowDirection}</span>
        </div>

        {/* FlowBuilder with dynamic direction key to force re-render/reload */}
        <FlowBuilder key={flowDirection} direction={flowDirection} />
      </div>

      {/* Modal */}
      {modal.open && (
        <DocModal
          doc={modal.doc}
          onClose={() => !saving && setModal({ open: false, doc: null })}
          onSave={handleSave}
          saving={saving}
          categories={categories}
        />
      )}

      {/* Outbound Call Modal */}
      {callModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }} {...callModalBackdropDismiss}>
          <div style={{
            background: 'var(--card-bg, #1e293b)', border: '1px solid var(--input-border, #334155)',
            borderRadius: 20, padding: '2rem', width: '100%', maxWidth: 420,
            animation: 'fadeIn 0.2s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>📞 Yapay Zeka ile Ara (Dış Arama)</h2>
              <button onClick={() => setCallModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--foreground-3)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <form onSubmit={handleOutboundCall} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--foreground-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Hedef Telefon Numarası
                </label>
                <input
                  value={callPhone}
                  onChange={e => setCallPhone(e.target.value)}
                  placeholder="Örn: 05xxxxxxxxx"
                  required
                  style={{
                    width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--foreground)',
                    fontSize: '0.875rem', outline: 'none',
                  }}
                />
              </div>

              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: '0.76rem', color: '#6ee7b7' }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>ℹ️ Arama Parametreleri:</div>
                <div>• Çıkış Numarası: <strong>{outboundCallerId}</strong></div>
                <div>• Akış: <strong>Giden Arama Akışı (Anket/Takip)</strong></div>
                <div>• Açılış: <strong>Giden Karşılama Mesajı</strong></div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setCallModalOpen(false)} className="btn btn-ghost" style={{ fontSize: '0.875rem' }} disabled={calling}>
                  İptal
                </button>
                <button type="submit" className="btn btn-primary" disabled={calling || !callPhone.trim()} style={{ fontSize: '0.875rem', minWidth: 100, background: '#ec4899', borderColor: '#ec4899' }}>
                  {calling ? '⏳ Aranıyor...' : '📞 Hemen Ara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
