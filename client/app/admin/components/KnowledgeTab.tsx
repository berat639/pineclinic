'use client'
import { useState, useEffect, useCallback } from 'react'
import FlowBuilder from './FlowBuilder'
import WhatsAppConversationsCard from './WhatsAppConversationsCard'
import VoiceAiSettings from './VoiceAiSettings'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'
import { PhoneMaskedInput } from '@/lib/phone-mask'

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
  onSave: (data: { category: Category; title: string; content: string; callDirection: 'inbound' | 'outbound' | 'both'; active: boolean; file?: File | null }) => Promise<void>
  saving: boolean
  categories: CategoryDef[]
}

function DocModal({ doc, onClose, onSave, saving, categories }: ModalProps) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const isEdit = !!doc?.id
  const [category, setCategory] = useState<Category>((doc?.category as Category) || 'genel')
  const [title, setTitle] = useState(doc?.title || '')
  const [content, setContent] = useState(doc?.content || '')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [callDirection, setCallDirection] = useState<'inbound' | 'outbound' | 'both'>((doc?.callDirection as 'inbound' | 'outbound' | 'both') || 'both')
  const [active, setActive] = useState(doc?.active !== false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
    if (file && !title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, ''))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedFile && !isEdit) {
      onSave({
        category,
        title: title.trim() || selectedFile.name.replace(/\.[^.]+$/, ''),
        content: content.trim(),
        callDirection,
        active,
        file: selectedFile,
      })
      return
    }
    if (!title.trim() || !content.trim()) return
    onSave({ category, title: title.trim(), content: content.trim(), callDirection, active })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15, 23, 42, 0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }} {...backdropDismiss}>
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card-bg)', border: '1.5px solid var(--input-border)',
          borderRadius: 14, width: 'calc(100vw - 24px)', maxWidth: 460, maxHeight: '90vh',
          boxShadow: 'var(--pc-modal-shadow)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header (Yeni Randevu Standardı) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#2563eb', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', boxShadow: 'var(--pc-clay-primary)', flexShrink: 0 }}>
              {isEdit ? '✏️' : '📄'}
            </div>
            <div>
              <h2 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0, color: 'var(--foreground)', lineHeight: 1.2 }}>
                {isEdit ? 'Belge Düzenle' : 'Yeni Belge Ekle'}
              </h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginTop: 2 }}>
                Bilgi bankası içeriğini kaydedin
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--pc-clay-btn)' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', flex: 1, overflowY: 'auto', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--card-inner)', padding: 14, borderRadius: 10, border: '1px solid var(--input-border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Kategori */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 6 }}>
                Kategori
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {categories.map(cat => (
                  <button key={cat.slug} type="button" onClick={() => setCategory(cat.slug)} style={{
                    padding: '5px 11px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                    background: category === cat.slug ? '#2563eb' : 'var(--card-bg)',
                    borderColor: category === cat.slug ? '#2563eb' : 'var(--input-border)',
                    color: category === cat.slug ? '#ffffff' : 'var(--foreground)',
                    boxShadow: category === cat.slug ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                  }}>
                    <span style={{ color: category === cat.slug ? '#ffffff' : 'inherit' }}>{cat.icon} {cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Başlık */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4 }}>
                Başlık
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Örn: Mayıs 2026 Kampanyası"
                required
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--foreground)',
                  fontSize: '0.85rem', outline: 'none', boxShadow: 'var(--pc-neo-inset)',
                }}
              />
            </div>

            {/* Dosya Yükleme (Yeni belgede) */}
            {!isEdit && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4 }}>
                  📎 Dosyadan Yükle <span style={{ color: 'var(--foreground-3)', fontWeight: 500 }}>(PDF, DOCX, TXT, MD, CSV, JSON)</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.json,.pdf,.docx"
                    onChange={handleFileChange}
                    style={{
                      flex: 1, fontSize: '0.78rem', color: 'var(--foreground-2)',
                      padding: '6px 10px', background: 'var(--input-bg)',
                      border: '1px dashed var(--input-border)', borderRadius: 8,
                    }}
                  />
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      style={{
                        padding: '6px 10px', borderRadius: 6, border: '1px solid var(--input-border)',
                        background: 'var(--card-bg)', color: 'var(--foreground-2)', fontSize: '0.75rem', cursor: 'pointer',
                      }}
                    >
                      Temizle
                    </button>
                  )}
                </div>
                {selectedFile && (
                  <div style={{ fontSize: '0.74rem', color: '#22c55e', marginTop: 4 }}>
                    Seçilen dosya: {selectedFile.name} ({Math.max(1, Math.round(selectedFile.size / 1024))} KB) — metin otomatik çıkarılacak
                  </div>
                )}
              </div>
            )}

            {/* İçerik */}
            {!selectedFile && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4 }}>
                  İçerik <span style={{ color: 'var(--foreground-3)', fontWeight: 500 }}>(AI bu metni okuyacak)</span>
                </label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Bilgi bankasına eklemek istediğiniz içeriği buraya yazın..."
                  required={!selectedFile}
                  rows={5}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--foreground)',
                    fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                    lineHeight: 1.5, boxShadow: 'var(--pc-neo-inset)',
                  }}
                />
              </div>
            )}

            {/* Kullanım Yeri */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4 }}>
                🔀 Kullanım Yeri
              </label>
              <select
                value={callDirection}
                onChange={e => setCallDirection(e.target.value as any)}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--foreground)',
                  fontSize: '0.85rem', outline: 'none', cursor: 'pointer', boxShadow: 'var(--pc-neo-inset)',
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
                  background: active ? '#2563eb' : 'var(--input-border)',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: active ? 23 : 3, width: 18, height: 18,
                  borderRadius: '50%', background: '#ffffff', transition: 'left 0.2s',
                }} />
              </button>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>
                {active ? 'Aktif — AI bu belgeyi kullanır' : 'Pasif — AI bu belgeyi kullanmaz'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--card-bg)', color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600, boxShadow: 'var(--pc-clay-btn)' }}>
            İptal
          </button>
          <button type="submit" disabled={saving || !title.trim() || (!content.trim() && !selectedFile)} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#ffffff', cursor: saving || !title.trim() || (!content.trim() && !selectedFile) ? 'not-allowed' : 'pointer', fontSize: '0.86rem', fontWeight: 700, boxShadow: 'var(--pc-clay-primary)', opacity: saving || !title.trim() || (!content.trim() && !selectedFile) ? 0.6 : 1 }}>
            <span style={{ color: '#ffffff' }}>{saving ? 'Kaydediliyor…' : selectedFile ? 'Yükle & Kaydet' : 'Kaydet'}</span>
          </button>
        </div>
      </form>
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
  const [needsReindexCount, setNeedsReindexCount] = useState(0)
  const [reindexProgress, setReindexProgress] = useState<{ processed: number; total: number } | null>(null)
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
  const [flowDirection, setFlowDirection] = useState<'inbound' | 'outbound' | 'whatsapp'>('inbound')

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
      setNeedsReindexCount(data.needsReindex || 0)
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
  const handleSave = async (data: { category: Category; title: string; content: string; callDirection: 'inbound' | 'outbound' | 'both'; active: boolean; file?: File | null }) => {
    setSaving(true)
    try {
      const isEdit = !!modal.doc?.id
      if (data.file && !isEdit) {
        const formData = new FormData()
        formData.append('file', data.file)
        formData.append('category', data.category)
        formData.append('title', data.title)
        formData.append('callDirection', data.callDirection)
        formData.append('active', String(data.active))
        const r = await fetch('/api/knowledge/upload', {
          method: 'POST',
          body: formData,
        })
        const resData = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(resData.error || 'Dosya yükleme başarısız')
        setModal({ open: false, doc: null })
        await load()
        showToast('✅ Dosya yüklendi ve bilgi bankasına gömüldü')
        setSaving(false)
        return
      }

      const url = isEdit ? `/api/knowledge/${modal.doc!.id}` : '/api/knowledge'
      const method = isEdit ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const resData = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(resData.error || 'Kayıt başarısız')
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
    setReindexProgress({ processed: 0, total: docs.length })
    try {
      const r = await fetch('/api/knowledge/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ async: docs.length > 8 }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.error) {
        throw new Error(data.error || `Reindex başarısız (${r.status})`)
      }
      if (data.background) {
        for (let poll = 0; poll < 120; poll++) {
          await new Promise(res => setTimeout(res, 1000))
          const sr = await fetch('/api/knowledge/reindex/status')
          if (!sr.ok) break
          const sdata = await sr.json()
          setReindexProgress({ processed: sdata.processed || 0, total: sdata.total || docs.length })
          if (sdata.status === 'completed' || sdata.status === 'failed' || sdata.status === 'idle') {
            await load()
            if (sdata.status === 'failed') {
              throw new Error(sdata.error || 'Reindex tamamlanamadı')
            }
            showToast(`✅ ${sdata.success || 0} belge yeniden indekslendi${sdata.skipped ? ` (${sdata.skipped} değişmeyen atlandı)` : ''}`)
            break
          }
        }
      } else {
        await load()
        showToast(`✅ ${data.results?.success || 0} belge yeniden indekslendi${data.results?.skipped ? ` (${data.results.skipped} değişmeyen atlandı)` : ''}`)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reindex başarısız', 'error')
    }
    setReindexing(false)
    setReindexProgress(null)
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
                <span style={{ color: totalEmbedded === docs.length && docs.length > 0 && needsReindexCount === 0 ? '#22c55e' : '#f59e0b' }}>
                  ⚡
                </span>
                {totalEmbedded}/{docs.length} embedding hazır
                {needsReindexCount > 0 && (
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                    ({needsReindexCount} yenilenmeli)
                  </span>
                )}
              </div>
            )}

            <button
              onClick={handleReindex}
              disabled={reindexing || docs.length === 0}
              className="btn btn-ghost"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              {reindexing
                ? reindexProgress
                  ? `⏳ İndeksleniyor (${reindexProgress.processed}/${reindexProgress.total})…`
                  : '⏳ İndeksleniyor…'
                : '🔄 Tümünü Yenile'}
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
                    <PhoneMaskedInput
                      value={outboundCallerId}
                      onValueChange={setOutboundCallerId}
                      placeholder="0 (850) 309 61 19"
                      style={{
                        width: '100%', padding: '8px 12px', fontSize: 13,
                        background: 'var(--input-bg, #0f172a)', border: '1px solid var(--input-border, #334155)',
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
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', background: 'var(--input-bg)', padding: 5, borderRadius: 10, border: '1px solid var(--input-border)', boxShadow: 'var(--pc-neo-inset)' }}>
            <button
              type="button"
              onClick={() => setFlowDirection('inbound')}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.18s',
                background: flowDirection === 'inbound' ? '#2563eb' : 'var(--card-bg)',
                borderColor: flowDirection === 'inbound' ? '#1d4ed8' : 'var(--input-border)',
                color: flowDirection === 'inbound' ? '#ffffff' : 'var(--foreground)',
                boxShadow: flowDirection === 'inbound' ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
              }}
            >
              <span style={{ color: flowDirection === 'inbound' ? '#ffffff' : 'inherit' }}>📥 Gelen Arama Akışı (Randevu)</span>
            </button>
            <button
              type="button"
              onClick={() => setFlowDirection('outbound')}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.18s',
                background: flowDirection === 'outbound' ? '#2563eb' : 'var(--card-bg)',
                borderColor: flowDirection === 'outbound' ? '#1d4ed8' : 'var(--input-border)',
                color: flowDirection === 'outbound' ? '#ffffff' : 'var(--foreground)',
                boxShadow: flowDirection === 'outbound' ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
              }}
            >
              <span style={{ color: flowDirection === 'outbound' ? '#ffffff' : 'inherit' }}>📤 Giden Arama Akışı (Anket & Takip)</span>
            </button>
            <button
              type="button"
              onClick={() => setFlowDirection('whatsapp')}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.18s',
                background: flowDirection === 'whatsapp' ? '#2563eb' : 'var(--card-bg)',
                borderColor: flowDirection === 'whatsapp' ? '#1d4ed8' : 'var(--input-border)',
                color: flowDirection === 'whatsapp' ? '#ffffff' : 'var(--foreground)',
                boxShadow: flowDirection === 'whatsapp' ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
              }}
            >
              <span style={{ color: flowDirection === 'whatsapp' ? '#ffffff' : 'inherit' }}>💬 WhatsApp Asistan Akışı</span>
            </button>
          </div>
        </div>

        {/* Current Flow Notice */}
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: '0.8rem',
          background: 'var(--flow-info-bg)',
          border: '1px solid var(--flow-info-border)',
          color: 'var(--flow-info-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontWeight: 600 }}>
            {flowDirection === 'inbound'
              ? '📥 Şu an Gelen Arama Akışı düzenleniyor — Kliniği arayan hastaların karşılama, sorgulama ve randevu akışıdır.'
              : flowDirection === 'outbound'
              ? '📤 Şu an Giden Arama Akışı düzenleniyor — Yapay zekanın dışarıya yaptığı memnuniyet anketi ve takip aramalarının akışıdır.'
              : '💬 Şu an WhatsApp Asistan Akışı düzenleniyor — WhatsApp üzerinden gelen hasta mesajlarında uygulanacak konuşma akışıdır.'}
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: 12, background: 'var(--card-bg)', border: '1px solid var(--flow-info-border)', color: 'var(--foreground)' }}>
            Aktif Kanal: {flowDirection === 'inbound' ? 'Gelen Arama' : flowDirection === 'outbound' ? 'Giden Arama' : 'WhatsApp'}
          </span>
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

      {/* Outbound Call Modal (Yeni Randevu 460px Standardı) */}
      {callModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }} {...callModalBackdropDismiss}>
          <form
            role="dialog"
            aria-modal="true"
            onSubmit={handleOutboundCall}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card-bg)', border: '1.5px solid var(--input-border)',
              borderRadius: 14, width: 'calc(100vw - 24px)', maxWidth: 460, maxHeight: '90vh',
              boxShadow: 'var(--pc-modal-shadow)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#2563eb', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', boxShadow: 'var(--pc-clay-primary)', flexShrink: 0 }}>
                  📞
                </div>
                <div>
                  <h2 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0, color: 'var(--foreground)', lineHeight: 1.2 }}>Yapay Zeka ile Ara</h2>
                  <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginTop: 2 }}>Giden arama akışı ile dış arama başlatın</div>
                </div>
              </div>
              <button type="button" onClick={() => setCallModalOpen(false)} aria-label="Kapat" style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--pc-clay-btn)' }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 20px', flex: 1, overflowY: 'auto', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--card-inner)', padding: 14, borderRadius: 10, border: '1px solid var(--input-border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 4 }}>
                    Hedef Telefon Numarası
                  </label>
                  <PhoneMaskedInput
                    value={callPhone}
                    onValueChange={setCallPhone}
                    placeholder="Örn: 0 (5XX) XXX XX XX"
                    required
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--foreground)',
                      fontSize: '0.85rem', outline: 'none', boxShadow: 'var(--pc-neo-inset)',
                    }}
                  />
                </div>

                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--input-border)', borderRadius: 8, padding: '10px 12px', fontSize: '0.76rem', color: 'var(--foreground-2)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>ℹ️ Arama Parametreleri:</div>
                  <div>• Çıkış Numarası: <strong>{outboundCallerId}</strong></div>
                  <div>• Akış: <strong>Giden Arama Akışı (Anket/Takip)</strong></div>
                  <div>• Açılış: <strong>Giden Karşılama Mesajı</strong></div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--input-border)', background: 'var(--card-inner)' }}>
              <button type="button" onClick={() => setCallModalOpen(false)} disabled={calling} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--card-bg)', color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600, boxShadow: 'var(--pc-clay-btn)' }}>
                İptal
              </button>
              <button type="submit" disabled={calling || !callPhone.trim()} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#ffffff', cursor: calling || !callPhone.trim() ? 'not-allowed' : 'pointer', fontSize: '0.86rem', fontWeight: 700, boxShadow: 'var(--pc-clay-primary)', opacity: calling || !callPhone.trim() ? 0.6 : 1 }}>
                <span style={{ color: '#ffffff' }}>{calling ? 'Aranıyor...' : 'Hemen Ara'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
