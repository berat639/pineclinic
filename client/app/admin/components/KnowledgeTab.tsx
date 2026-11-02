'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import FlowBuilder from './FlowBuilder'
import WhatsAppConversationsCard from './WhatsAppConversationsCard'
import VoiceAiSettings from './VoiceAiSettings'
import ConfirmModal from './ConfirmModal'
import InfoTooltip from './ui/InfoTooltip'
import KnowledgeDocList, { PAGE_SIZES, type SortDir, type SortKey, type ViewMode } from './knowledge/KnowledgeDocList'
import KnowledgeDocPreview from './knowledge/KnowledgeDocPreview'
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss'
import { PhoneMaskedInput, normalizeTrPhone } from '@/lib/phone-mask'
import { TERM_LABELS } from '@/lib/ui-glossary'
import {
  CALL_DIRECTION_LABELS, CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABEL_MAX, CONTENT_MAX, GREETING_MAX, TITLE_MAX,
  cleanContent, cleanTitle, isCompleteTrPhone, mapServerError, maskCategoryLabel, maskContent, maskGreeting, maskTitle,
  matchesSearch, uniqueSlug, validateContent, validateFile, validateGreeting, validateTitle,
  type CallDirection, type FieldKey,
} from '@/lib/knowledge-input-rules'
import d from '../../../styles/clinic-depth.module.css'
import s from './knowledge/KnowledgeTab.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeDoc {
  id: string
  category: string
  title: string
  content: string
  callDirection: CallDirection
  active: boolean
  embeddedAt: string
  createdAt: string
  updatedAt: string
}

export interface CategoryDef {
  id: string
  slug: string
  label: string
  icon: string
  color: string
  sortOrder: number
}

type Errors = Partial<Record<FieldKey | 'form', string>>

interface SaveData {
  category: string
  title: string
  content: string
  callDirection: CallDirection
  active: boolean
  file?: File | null
}

const DIRECTIONS: CallDirection[] = ['both', 'inbound', 'outbound']

// ── Small shared pieces ───────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  return message ? <div className={s.error} role="alert">{message}</div> : null
}

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={`${s.counter} ${value >= max ? s.counterWarn : ''}`}>{value.toLocaleString('tr-TR')}/{max.toLocaleString('tr-TR')}</span>
}

function ModalShell({ icon, title, subtitle, onClose, onSubmit, children, footer }: {
  icon: string; title: string; subtitle: string; onClose: () => void; onSubmit: (e: React.FormEvent) => void
  children: React.ReactNode; footer: React.ReactNode
}) {
  const backdropDismiss = useBackdropDismiss(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={d.backdrop} {...backdropDismiss}>
      <form role="dialog" aria-modal="true" className={`${d.modal} ${s.modalForm}`} onSubmit={onSubmit} onClick={e => e.stopPropagation()} noValidate>
        <div className={s.modalHead}>
          <div className={s.row} style={{ flexWrap: 'nowrap' }}>
            <div className={s.modalIcon}>{icon}</div>
            <div>
              <h2 className={s.modalTitle}>{title}</h2>
              <div className={s.sub}>{subtitle}</div>
            </div>
          </div>
          <button type="button" className={d.btn} onClick={onClose} aria-label="Kapat">✕</button>
        </div>
        <div className={s.modalBody}>{children}</div>
        <div className={s.modalFoot}>{footer}</div>
      </form>
    </div>
  )
}

function Segment<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className={d.segmentTrack} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" className={value === o.value ? d.segmentActive : d.segment} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Doc modal ─────────────────────────────────────────────────────────────────

interface DocModalProps {
  doc: Partial<KnowledgeDoc> | null
  onClose: () => void
  onSave: (data: SaveData) => Promise<{ field: FieldKey | 'form'; message: string } | null>
  saving: boolean
  categories: CategoryDef[]
}

function DocModal({ doc, onClose, onSave, saving, categories }: DocModalProps) {
  const isEdit = !!doc?.id
  const [category, setCategory] = useState(doc?.category || 'genel')
  const [title, setTitle] = useState(doc?.title || '')
  const [content, setContent] = useState(doc?.content || '')
  const [file, setFile] = useState<File | null>(null)
  const [callDirection, setCallDirection] = useState<CallDirection>(doc?.callDirection || 'both')
  const [active, setActive] = useState(doc?.active !== false)
  const [errors, setErrors] = useState<Errors>({})
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const contentCheck = validateContent(content)
  const titleOk = file ? true : validateTitle(title).ok
  const canSave = !saving && (file ? validateFile(file).ok : titleOk && contentCheck.ok) && (file ? true : titleOk)

  const pickFile = (picked: File | null) => {
    if (!picked) { setFile(null); return }
    const check = validateFile(picked)
    if (!check.ok) { setFile(null); setErrors(prev => ({ ...prev, file: check.error })); return }
    setErrors(prev => ({ ...prev, file: undefined }))
    setFile(picked)
    if (!cleanTitle(title)) setTitle(maskTitle(picked.name.replace(/\.[^.]+$/, '')))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Errors = {}
    if (file) {
      const f = validateFile(file); if (!f.ok) next.file = f.error
    } else {
      const t = validateTitle(title); if (!t.ok) next.title = t.error
      if (!contentCheck.ok) next.content = contentCheck.error
    }
    setErrors(next)
    if (Object.keys(next).length) return
    const result = await onSave({
      category,
      title: cleanTitle(title) || (file ? cleanTitle(file.name.replace(/\.[^.]+$/, '')) : ''),
      content: cleanContent(content),
      callDirection,
      active,
      file: file && !isEdit ? file : null,
    })
    if (result) setErrors({ [result.field]: result.message })
  }

  return (
    <ModalShell
      icon={isEdit ? '✏️' : '📄'}
      title={isEdit ? 'Belge Düzenle' : 'Yeni Belge Ekle'}
      subtitle="Bilgi bankası içeriğini kaydedin"
      onClose={onClose}
      onSubmit={submit}
      footer={(
        <>
          <button type="button" className={d.btn} onClick={onClose} disabled={saving}>İptal</button>
          <button type="submit" className={d.btnPrimary} disabled={!canSave}>
            {saving ? 'Kaydediliyor…' : file ? 'Yükle ve Kaydet' : 'Kaydet'}
          </button>
        </>
      )}
    >
      <div className={d.subcard} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className={s.label}>Kategori</div>
          <div className={s.chipRow}>
            {categories.map(cat => (
              <button key={cat.slug} type="button" className={category === cat.slug ? s.chipActive : d.chip} aria-pressed={category === cat.slug} onClick={() => setCategory(cat.slug)}>
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
        </div>

        <label className={s.field}>
          <span className={s.label}>Başlık <Counter value={title.length} max={TITLE_MAX} /></span>
          <input className={`${d.input} ${errors.title ? s.inputError : ''}`} value={title} maxLength={TITLE_MAX} placeholder="Örn: Mayıs 2026 Kampanyası"
            onChange={e => { setTitle(maskTitle(e.target.value)); setErrors(p => ({ ...p, title: undefined })) }} aria-invalid={!!errors.title} />
          <FieldError message={errors.title} />
        </label>

        {!isEdit && (
          <div>
            <div className={s.label}>
              📎 Dosyadan yükle
              <InfoTooltip title="Desteklenen dosyalar">
                TXT, MD, CSV, JSON, PDF ve DOCX dosyaları yüklenebilir. Dosya en fazla 10 MB olabilir. Metin dosyadan otomatik çıkarılır.
              </InfoTooltip>
            </div>
            <div
              className={`${s.drop} ${dragging ? s.dropActive : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0] ?? null) }}
              role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
            >
              {file ? (
                <>
                  <strong>{file.name}</strong>
                  <span className={s.muted}>{Math.max(1, Math.round(file.size / 1024))} KB</span>
                  <button type="button" className={d.btn} onClick={ev => { ev.stopPropagation(); pickFile(null); if (fileRef.current) fileRef.current.value = '' }}>Dosyayı kaldır</button>
                </>
              ) : (
                <span>Dosyayı buraya bırakın veya seçmek için tıklayın</span>
              )}
            </div>
            <input ref={fileRef} type="file" className={s.hiddenInput} accept=".txt,.md,.csv,.json,.pdf,.docx" onChange={e => pickFile(e.target.files?.[0] ?? null)} />
            <FieldError message={errors.file} />
          </div>
        )}

        {!file && (
          <label className={s.field}>
            <span className={s.label}>
              İçerik
              <InfoTooltip title="Bu metin ne işe yarar?">
                Yapay zeka asistan, aramalarda bu metni okuyarak hastalara bilgi verir. Fiyat, çalışma saati, kampanya gibi bilgileri açık ve kısa yazın.
              </InfoTooltip>
              <Counter value={content.length} max={CONTENT_MAX} />
            </span>
            <textarea className={`${d.input} ${s.textarea} ${errors.content ? s.inputError : ''}`} value={content} rows={5}
              placeholder="Bilgi bankasına eklemek istediğiniz içeriği buraya yazın…"
              onChange={e => { setContent(maskContent(e.target.value)); setErrors(p => ({ ...p, content: undefined })) }} aria-invalid={!!errors.content} />
            {!contentCheck.ok && content.length > 0 && !errors.content && <div className={s.hint}>{contentCheck.hint}</div>}
            <FieldError message={errors.content} />
          </label>
        )}

        <div>
          <div className={s.label}>
            Kullanım yeri
            <InfoTooltip title="Belge hangi aramalarda kullanılır?">
              “Gelen arama”: hasta kliniği aradığında. “Giden arama”: asistan hastayı aradığında. “Her ikisi”: her iki durumda da kullanılır.
            </InfoTooltip>
          </div>
          <Segment value={callDirection} onChange={setCallDirection} label="Kullanım yeri" options={DIRECTIONS.map(v => ({ value: v, label: CALL_DIRECTION_LABELS[v] }))} />
        </div>

        <div className={s.switchRow}>
          <button type="button" role="switch" aria-checked={active} className={d.switch} onClick={() => setActive(!active)} aria-label="Aktif durumu" />
          <span>{active ? 'Aktif — asistan bu belgeyi kullanır' : 'Pasif — asistan bu belgeyi kullanmaz'}</span>
        </div>
        <FieldError message={errors.form} />
      </div>
    </ModalShell>
  )
}

// ── Category modal ────────────────────────────────────────────────────────────

function CategoryModal({ categories, onClose, onCreated, onError }: {
  categories: CategoryDef[]; onClose: () => void; onCreated: () => Promise<void>; onError: (msg: string) => void
}) {
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState<string>(CATEGORY_ICONS[0])
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Errors>({})

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = maskCategoryLabel(label).trim()
    if (!clean) { setErrors({ label: 'Kategori adı zorunludur.' }); return }
    setSaving(true)
    try {
      // Kod (slug) kullanıcıya gösterilmez; addan üretilir, çakışmada -2, -3 eklenir.
      const slug = uniqueSlug(clean, categories.map(c => c.slug))
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, label: clean, icon, color }),
      })
      if (res.ok) { await onCreated(); onClose(); return }
      const data = await res.json().catch(() => ({})) as { error?: string }
      const mapped = mapServerError(res.status, data.error || 'Kategori eklenemedi')
      setErrors({ [mapped.field]: mapped.message })
    } catch {
      onError('Kategori eklenemedi')
    }
    setSaving(false)
  }

  return (
    <ModalShell icon="🗂️" title="Yeni Kategori" subtitle="Belgeleri gruplamak için kategori ekleyin" onClose={onClose} onSubmit={submit}
      footer={(
        <>
          <button type="button" className={d.btn} onClick={onClose} disabled={saving}>İptal</button>
          <button type="submit" className={d.btnPrimary} disabled={saving || !label.trim()}>{saving ? 'Ekleniyor…' : 'Kategori Ekle'}</button>
        </>
      )}>
      <div className={d.subcard} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className={s.field}>
          <span className={s.label}>Kategori adı <Counter value={label.length} max={CATEGORY_LABEL_MAX} /></span>
          <input className={`${d.input} ${errors.label ? s.inputError : ''}`} value={label} maxLength={CATEGORY_LABEL_MAX} placeholder="Örn: Ortodonti"
            onChange={e => { setLabel(maskCategoryLabel(e.target.value)); setErrors({}) }} aria-invalid={!!errors.label} />
          <FieldError message={errors.label} />
        </label>
        <div>
          <div className={s.label}>Simge</div>
          <div className={s.swatchGrid}>
            {CATEGORY_ICONS.map(i => (
              <button key={i} type="button" className={`${s.iconBtn} ${icon === i ? s.iconBtnOn : ''}`} aria-pressed={icon === i} onClick={() => setIcon(i)}>{i}</button>
            ))}
          </div>
        </div>
        <div>
          <div className={s.label}>Renk</div>
          <div className={s.swatchGrid}>
            {CATEGORY_COLORS.map(c => (
              <button key={c} type="button" className={`${s.swatch} ${color === c ? s.swatchOn : ''}`} style={{ background: c }} aria-pressed={color === c} aria-label={`Renk ${c}`} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <div>
          <div className={s.label}>Önizleme</div>
          <span className={d.badge}><span className={s.dot} style={{ background: color }} />{icon} {label.trim() || 'Kategori adı'}</span>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type ConfirmState =
  | { kind: 'doc'; doc: KnowledgeDoc }
  | { kind: 'bulkDelete' }
  | { kind: 'category'; cat: CategoryDef }
  | { kind: 'reindex' }

const URL_KEYS = ['kb_q', 'kb_cat', 'kb_dir', 'kb_sort', 'kb_order', 'kb_page', 'kb_size'] as const

export default function KnowledgeTab() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [totalEmbedded, setTotalEmbedded] = useState(0)
  const [needsReindexCount, setNeedsReindexCount] = useState(0)
  const [reindexProgress, setReindexProgress] = useState<{ processed: number; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [categories, setCategories] = useState<CategoryDef[]>([])
  const [modal, setModal] = useState<{ open: boolean; doc: Partial<KnowledgeDoc> | null }>({ open: false, doc: null })
  const [saving, setSaving] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<KnowledgeDoc | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [catMgmtOpen, setCatMgmtOpen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Liste durumu (URL'de saklanır)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [directionFilter, setDirectionFilter] = useState<'all' | CallDirection>('all')
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [view, setView] = useState<ViewMode>('list')
  const [urlReady, setUrlReady] = useState(false)

  // Karşılama / arayan numara
  const [greetingTab, setGreetingTab] = useState<'inbound' | 'outbound' | 'callerid'>('inbound')
  const [greetingText, setGreetingText] = useState('')
  const [greetingOutboundText, setGreetingOutboundText] = useState('')
  const [outboundCallerId, setOutboundCallerId] = useState('08503096119')
  const [greetingLoading, setGreetingLoading] = useState(true)
  const [greetingSaving, setGreetingSaving] = useState(false)
  const [callerIdSaving, setCallerIdSaving] = useState(false)
  const [greetingErrors, setGreetingErrors] = useState<Errors>({})

  const [flowDirection, setFlowDirection] = useState<'inbound' | 'outbound' | 'whatsapp'>('inbound')

  // Dış arama
  const [callModalOpen, setCallModalOpen] = useState(false)
  const [callPhone, setCallPhone] = useState('')
  const [calling, setCalling] = useState(false)
  const [callErrors, setCallErrors] = useState<Errors>({})

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // URL ve tercih okuma (yalnızca ilk açılışta)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const q = p.get('kb_q') ?? ''
    setSearchInput(q); setQuery(q)
    setCatFilter(p.get('kb_cat') || 'all')
    const dir = p.get('kb_dir')
    if (dir === 'inbound' || dir === 'outbound' || dir === 'both') setDirectionFilter(dir)
    const sort = p.get('kb_sort')
    if (sort === 'title' || sort === 'category' || sort === 'updatedAt' || sort === 'active') setSortKey(sort)
    if (p.get('kb_order') === 'asc') setSortDir('asc')
    const size = Number(p.get('kb_size'))
    if ((PAGE_SIZES as readonly number[]).includes(size)) setPageSize(size)
    setPage(Math.max(1, Number(p.get('kb_page')) || 1))
    try {
      const stored = window.localStorage.getItem('kb_view')
      if (stored === 'cards' || stored === 'list') setView(stored)
    } catch { /* tercih okunamadı */ }
    setUrlReady(true)
  }, [])

  // URL yazma
  useEffect(() => {
    if (!urlReady) return
    const p = new URLSearchParams(window.location.search)
    URL_KEYS.forEach(k => p.delete(k))
    if (query) p.set('kb_q', query)
    if (catFilter !== 'all') p.set('kb_cat', catFilter)
    if (directionFilter !== 'all') p.set('kb_dir', directionFilter)
    if (sortKey !== 'updatedAt') p.set('kb_sort', sortKey)
    if (sortDir !== 'desc') p.set('kb_order', sortDir)
    if (page > 1) p.set('kb_page', String(page))
    if (pageSize !== PAGE_SIZES[0]) p.set('kb_size', String(pageSize))
    const qs = p.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
  }, [urlReady, query, catFilter, directionFilter, sortKey, sortDir, page, pageSize])

  // Arama gecikmesi (300 ms)
  useEffect(() => {
    const t = setTimeout(() => { setQuery(prev => { if (prev !== searchInput.trim()) setPage(1); return searchInput.trim() }) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const changeView = (v: ViewMode) => {
    setView(v)
    try { window.localStorage.setItem('kb_view', v) } catch { /* yok say */ }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [r, catRes] = await Promise.all([fetch('/api/knowledge'), fetch('/api/admin/categories')])
      if (!r.ok) {
        const result = await r.json().catch(() => ({})) as { error?: string }
        throw new Error(result.error || 'Bilgi bankası yüklenemedi')
      }
      const data = await r.json()
      setDocs(data.docs || [])
      setTotalEmbedded(data.totalEmbedded || 0)
      setNeedsReindexCount(data.needsReindex || 0)
      if (catRes.ok) setCategories(await catRes.json())
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Bilgi bankası yüklenemedi')
    }
    setLoading(false)
  }, [])

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
        if (callerData.callerId) setOutboundCallerId(normalizeTrPhone(callerData.callerId))
      }
    } catch { /* varsayılanlar kalır */ }
    setGreetingLoading(false)
  }, [])

  useEffect(() => { load(); fetchGreeting() }, [load, fetchGreeting])

  const getCat = (slug: string) => categories.find(c => c.slug === slug)

  // Süz → sırala → sayfala
  const filtered = useMemo(() => {
    const rows = docs.filter(doc => {
      const matchCat = catFilter === 'all' || doc.category === catFilter
      const dir = doc.callDirection || 'both'
      const matchDir = directionFilter === 'all' || dir === directionFilter
      const matchQ = !query || matchesSearch(`${doc.title} ${doc.content}`, query)
      return matchCat && matchDir && matchQ
    })
    const mul = sortDir === 'asc' ? 1 : -1
    const collator = new Intl.Collator('tr-TR')
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'title': return collator.compare(a.title, b.title) * mul
        case 'category': return collator.compare(getCat(a.category)?.label ?? a.category, getCat(b.category)?.label ?? b.category) * mul
        case 'active': return (Number(a.active) - Number(b.active)) * mul
        default: return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * mul
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, catFilter, directionFilter, query, sortKey, sortDir, categories])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageDocs = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  useEffect(() => { if (!loading && page !== currentPage) setPage(currentPage) }, [loading, page, currentPage])

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'updatedAt' ? 'desc' : 'asc') }
    setPage(1)
  }

  const hasFilters = !!query || catFilter !== 'all' || directionFilter !== 'all'
  const clearFilters = () => { setSearchInput(''); setQuery(''); setCatFilter('all'); setDirectionFilter('all'); setPage(1) }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleSave = async (data: SaveData): Promise<{ field: FieldKey | 'form'; message: string } | null> => {
    setSaving(true)
    try {
      const isEdit = !!modal.doc?.id
      let r: Response
      if (data.file && !isEdit) {
        const formData = new FormData()
        formData.append('file', data.file)
        formData.append('category', data.category)
        formData.append('title', data.title)
        formData.append('callDirection', data.callDirection)
        formData.append('active', String(data.active))
        r = await fetch('/api/knowledge/upload', { method: 'POST', body: formData })
      } else {
        const { file: _unused, ...payload } = data
        r = await fetch(isEdit ? `/api/knowledge/${modal.doc!.id}` : '/api/knowledge', {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      const resData = await r.json().catch(() => ({})) as { error?: string }
      if (!r.ok) {
        setSaving(false)
        return mapServerError(r.status, resData.error || 'Kayıt başarısız')
      }
      setModal({ open: false, doc: null })
      setPreview(null)
      await load()
      showToast(isEdit ? '✅ Belge güncellendi ve bilgi bankasına yeniden işlendi' : data.file ? '✅ Dosya yüklendi ve bilgi bankasına işlendi' : '✅ Belge eklendi ve bilgi bankasına işlendi')
    } catch {
      setSaving(false)
      return { field: 'form', message: 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.' }
    }
    setSaving(false)
    return null
  }

  const removeDocs = async (ids: string[]) => {
    const results = await Promise.allSettled(ids.map(id => fetch(`/api/knowledge/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error() })))
    const okIds = ids.filter((_, i) => results[i].status === 'fulfilled')
    setDocs(prev => prev.filter(x => !okIds.includes(x.id)))
    setSelected(prev => { const n = new Set(prev); okIds.forEach(id => n.delete(id)); return n })
    setPreview(prev => (prev && okIds.includes(prev.id) ? null : prev))
    if (okIds.length === ids.length) showToast(`🗑 ${okIds.length} belge silindi`)
    else showToast(`${ids.length - okIds.length} belge silinemedi`, 'error')
  }

  const handleToggle = async (id: string) => {
    setTogglingId(id)
    try {
      const r = await fetch(`/api/knowledge/${id}/toggle`, { method: 'PATCH' })
      if (!r.ok) throw new Error()
      const data = await r.json()
      setDocs(prev => prev.map(x => (x.id === id ? { ...x, active: data.doc.active } : x)))
      setPreview(prev => (prev && prev.id === id ? { ...prev, active: data.doc.active } : prev))
    } catch {
      showToast('Durum değiştirilemedi', 'error')
    }
    setTogglingId(null)
  }

  const bulkSetActive = async (target: boolean) => {
    const ids = docs.filter(x => selected.has(x.id) && x.active !== target).map(x => x.id)
    if (ids.length === 0) { showToast(target ? 'Seçili belgeler zaten aktif' : 'Seçili belgeler zaten pasif'); return }
    const results = await Promise.allSettled(ids.map(id => fetch(`/api/knowledge/${id}/toggle`, { method: 'PATCH' }).then(r => { if (!r.ok) throw new Error() })))
    const failed = results.filter(r => r.status === 'rejected').length
    await load()
    if (failed === 0) showToast(`✅ ${ids.length} belge ${target ? 'aktif' : 'pasif'} yapıldı`)
    else showToast(`${failed} belgenin durumu değiştirilemedi`, 'error')
  }

  const handleReindex = async () => {
    setReindexing(true)
    setReindexProgress({ processed: 0, total: docs.length })
    try {
      const r = await fetch('/api/knowledge/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ async: docs.length > 8 }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.error) throw new Error(data.error || `Yeniden işleme başarısız (${r.status})`)
      if (data.background) {
        for (let poll = 0; poll < 120; poll++) {
          await new Promise(res => setTimeout(res, 1000))
          const sr = await fetch('/api/knowledge/reindex/status')
          if (!sr.ok) break
          const sdata = await sr.json()
          setReindexProgress({ processed: sdata.processed || 0, total: sdata.total || docs.length })
          if (sdata.status === 'completed' || sdata.status === 'failed' || sdata.status === 'idle') {
            await load()
            if (sdata.status === 'failed') throw new Error(sdata.error || 'Yeniden işleme tamamlanamadı')
            showToast(`✅ ${sdata.success || 0} belge yeniden işlendi${sdata.skipped ? ` (${sdata.skipped} değişmeyen atlandı)` : ''}`)
            break
          }
        }
      } else {
        await load()
        showToast(`✅ ${data.results?.success || 0} belge yeniden işlendi${data.results?.skipped ? ` (${data.results.skipped} değişmeyen atlandı)` : ''}`)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Yeniden işleme başarısız', 'error')
    }
    setReindexing(false)
    setReindexProgress(null)
  }

  const deleteCategory = async (cat: CategoryDef) => {
    try {
      const res = await fetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' })
      if (res.ok) { if (catFilter === cat.slug) setCatFilter('all'); await load(); showToast('🗑 Kategori silindi') }
      else showToast('Kategori silinemedi', 'error')
    } catch { showToast('Kategori silinemedi', 'error') }
  }

  // ── Karşılama / arayan numara / dış arama ──────────────────────────────────
  const handleSaveGreeting = async (type: 'inbound' | 'outbound') => {
    const text = type === 'inbound' ? greetingText : greetingOutboundText
    const check = validateGreeting(text)
    if (!check.ok) { setGreetingErrors({ greeting: check.error }); return }
    if (greetingSaving) return
    setGreetingSaving(true)
    setGreetingErrors({})
    try {
      const res = await fetch('/api/admin/settings/greeting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(type === 'inbound' ? { greeting: text.trim() } : { greetingOutbound: text.trim() }),
      })
      if (res.ok) showToast(type === 'inbound' ? '✅ Gelen arama karşılama mesajı kaydedildi' : '✅ Giden arama karşılama mesajı kaydedildi')
      else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        const mapped = mapServerError(res.status, data.error || 'Kayıt başarısız')
        setGreetingErrors({ [mapped.field === 'form' ? 'greeting' : mapped.field]: mapped.message })
      }
    } catch { setGreetingErrors({ greeting: 'Sunucuya ulaşılamadı. Tekrar deneyin.' }) }
    setGreetingSaving(false)
  }

  const handleSaveCallerId = async () => {
    if (callerIdSaving) return
    if (!isCompleteTrPhone(outboundCallerId)) { setGreetingErrors({ callerId: 'Numarayı 11 hane olacak şekilde tam girin.' }); return }
    setCallerIdSaving(true)
    setGreetingErrors({})
    try {
      const res = await fetch('/api/admin/settings/outbound-caller-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callerId: outboundCallerId }),
      })
      if (res.ok) showToast('✅ Arayan numara kaydedildi')
      else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setGreetingErrors({ callerId: data.error || 'Kayıt başarısız' })
      }
    } catch { setGreetingErrors({ callerId: 'Sunucuya ulaşılamadı. Tekrar deneyin.' }) }
    setCallerIdSaving(false)
  }

  const handleOutboundCall = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isCompleteTrPhone(callPhone)) { setCallErrors({ phone: 'Telefon numarasını 11 hane olacak şekilde tam girin.' }); return }
    setCalling(true)
    setCallErrors({})
    try {
      const res = await fetch('/api/admin/calls/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: callPhone, to: callPhone }),
      })
      if (res.ok) {
        showToast('📞 Arama başlatıldı')
        setCallModalOpen(false)
        setCallPhone('')
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setCallErrors({ phone: data.error || 'Arama başlatılamadı' })
      }
    } catch { setCallErrors({ phone: 'Sunucuya ulaşılamadı. Tekrar deneyin.' }) }
    setCalling(false)
  }

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = (ids: string[], on: boolean) => setSelected(prev => { const n = new Set(prev); ids.forEach(id => (on ? n.add(id) : n.delete(id))); return n })

  const greetingValue = greetingTab === 'inbound' ? greetingText : greetingOutboundText
  const processedLabel = `${totalEmbedded}/${docs.length}`

  const confirmProps = (() => {
    if (!confirm) return null
    switch (confirm.kind) {
      case 'doc': return { title: 'Belgeyi sil', message: `“${confirm.doc.title}” belgesi kalıcı olarak silinecek. Devam edilsin mi?`, variant: 'danger' as const, confirmText: 'Evet, sil', run: () => removeDocs([confirm.doc.id]) }
      case 'bulkDelete': return { title: 'Seçili belgeleri sil', message: `${selected.size} belge kalıcı olarak silinecek. Devam edilsin mi?`, variant: 'danger' as const, confirmText: 'Evet, sil', run: () => removeDocs([...selected]) }
      case 'category': return { title: 'Kategoriyi sil', message: `“${confirm.cat.label}” kategorisi silinecek. Bağlı belgeler “Genel” kategorisine taşınır.`, variant: 'danger' as const, confirmText: 'Evet, sil', run: () => deleteCategory(confirm.cat) }
      case 'reindex': return { title: 'Belgeleri yeniden işle', message: `${docs.length} belgenin tamamı bilgi bankasına yeniden işlenecek. Değişmeyen belgeler atlanır. Devam edilsin mi?`, variant: 'primary' as const, confirmText: 'Yeniden işle', run: handleReindex }
    }
  })()

  // ── Render ─────────────────────────────────────────────────────────────────
  const flowOptions = [
    { value: 'inbound' as const, label: `📥 ${TERM_LABELS.inbound} Akışı (Randevu)` },
    { value: 'outbound' as const, label: `📤 ${TERM_LABELS.outbound} Akışı (Anket ve Takip)` },
    { value: 'whatsapp' as const, label: '💬 WhatsApp Asistan Akışı' },
  ]

  return (
    <div className={s.root}>
      {toast && <div className={`${s.toast} ${toast.type === 'success' ? s.toastOk : s.toastErr}`} role="status">{toast.msg}</div>}

      {/* Başlık ve araç çubuğu */}
      <div className={`${d.card} ${s.stack}`}>
        <div className={s.spread}>
          <div>
            <h2 className={s.h2}>🧠 Bilgi Bankası ve Yapay Zeka Akışları</h2>
            <p className={s.sub}>Gelen ve giden aramalar için bilgi belgeleri, karşılama mesajları ve senaryolar</p>
          </div>
          <div className={s.row}>
            {!loading && !loadError && (
              <span className={s.total}>
                <span className={s.totalNum}>{processedLabel}</span> işlendi
                {needsReindexCount > 0 && <span>· {needsReindexCount} bekliyor</span>}
              </span>
            )}
            <button type="button" className={d.btnMint} onClick={() => setConfirm({ kind: 'reindex' })} disabled={reindexing || docs.length === 0}>
              {reindexing ? (reindexProgress ? `⏳ İşleniyor (${reindexProgress.processed}/${reindexProgress.total})…` : '⏳ İşleniyor…') : '🔄 Tümünü yeniden işle'}
            </button>
            <InfoTooltip title="Yeniden işleme nedir?">
              Belgeler yapay zekanın arayabileceği biçime dönüştürülerek bilgi bankasına işlenir. Yapay zeka ayarı değiştiyse veya “bekliyor” görünen belge varsa yeniden işleyin; değişmeyen belgeler atlanır.
            </InfoTooltip>
            <button type="button" className={d.btnPrimary} onClick={() => setModal({ open: true, doc: null })}>+ Yeni Belge</button>
            <button type="button" className={d.btnPale} onClick={() => { setCallErrors({}); setCallModalOpen(true) }}>📞 Yapay Zeka ile Ara</button>
          </div>
        </div>

        <div className={s.row} style={{ paddingTop: 10, borderTop: '1px solid var(--pc-border)' }}>
          <div className={s.searchWrap}>
            <span className={s.searchIcon}>🔍</span>
            <input className={`${d.input} ${s.searchInput}`} value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Belge başlığı veya içeriğinde ara…" aria-label="Belge ara" />
          </div>
          <Segment value={directionFilter} onChange={v => { setDirectionFilter(v); setPage(1) }} label="Kullanım yeri süzgeci"
            options={[{ value: 'all', label: 'Tümü' }, ...DIRECTIONS.map(v => ({ value: v, label: CALL_DIRECTION_LABELS[v] }))]} />
          <div style={{ marginLeft: 'auto' }}>
            <Segment value={view} onChange={changeView} label="Görünüm" options={[{ value: 'list', label: '☰ Liste' }, { value: 'cards', label: '▦ Kart' }]} />
          </div>
        </div>
        <div className={s.chipRow}>
          <span className={s.muted} style={{ fontWeight: 700, fontSize: 12 }}>Kategori:</span>
          {[{ slug: 'all', label: 'Tümü', icon: '', color: '' }, ...categories].map(cat => (
            <button key={cat.slug} type="button" className={catFilter === cat.slug ? s.chipActive : d.chip} aria-pressed={catFilter === cat.slug} onClick={() => { setCatFilter(cat.slug); setPage(1) }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kategori yönetimi */}
      <div className={d.card}>
        <button type="button" className={s.accordion} onClick={() => setCatMgmtOpen(!catMgmtOpen)} aria-expanded={catMgmtOpen}>
          <span>⚙️ Kategori Yönetimi</span>
          <span style={{ transform: catMgmtOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
        </button>
        {catMgmtOpen && (
          <div className={s.row} style={{ marginTop: 12 }}>
            {categories.map(cat => (
              <span key={cat.id} className={s.catPill}>
                <span className={s.dot} style={{ background: cat.color }} />{cat.icon} {cat.label}
                {cat.slug !== 'genel' && <button type="button" className={s.catRemove} onClick={() => setConfirm({ kind: 'category', cat })} aria-label={`${cat.label} kategorisini sil`}>✕</button>}
              </span>
            ))}
            <button type="button" className={d.btnMint} onClick={() => setCatModalOpen(true)}>+ Kategori Ekle</button>
          </div>
        )}
      </div>

      <div className={s.cols}>
        {/* Sol: belgeler */}
        <div className={s.stack}>
          {selected.size > 0 && (
            <div className={s.bulkBar}>
              <span>{selected.size} belge seçili</span>
              <button type="button" className={d.btnMint} onClick={() => bulkSetActive(true)}>Aktif yap</button>
              <button type="button" className={d.btn} onClick={() => bulkSetActive(false)}>Pasif yap</button>
              <button type="button" className={s.btnDanger} onClick={() => setConfirm({ kind: 'bulkDelete' })}>🗑 Sil</button>
              <button type="button" className={d.btn} style={{ marginLeft: 'auto' }} onClick={() => setSelected(new Set())}>Seçimi temizle</button>
            </div>
          )}

          {loading ? (
            <div className={`${d.card} ${s.list}`} aria-busy="true" aria-label="Belgeler yükleniyor">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className={s.skeleton} />)}
            </div>
          ) : loadError ? (
            <div className={`${d.card} ${s.state} ${s.stateError}`} role="alert">
              <div style={{ fontSize: 32 }}>⚠️</div>
              <div className={s.stateTitle}>Belgeler yüklenemedi</div>
              <div>{loadError}</div>
              <button type="button" className={d.btnPrimary} onClick={load}>Tekrar dene</button>
            </div>
          ) : docs.length === 0 ? (
            <div className={`${d.card} ${s.state}`}>
              <div style={{ fontSize: 36 }}>🧠</div>
              <div className={s.stateTitle}>Bilgi bankanız henüz boş</div>
              <div>Yapay zeka asistanın hastalara doğru bilgi verebilmesi için ilk belgeyi ekleyin.</div>
              <button type="button" className={d.btnPrimary} onClick={() => setModal({ open: true, doc: null })}>+ İlk Belgeyi Ekle</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className={`${d.card} ${s.state}`}>
              <div style={{ fontSize: 32 }}>🔍</div>
              <div className={s.stateTitle}>Filtrelere uygun belge bulunamadı</div>
              {hasFilters && <button type="button" className={d.btn} onClick={clearFilters}>Filtreleri temizle</button>}
            </div>
          ) : (
            <KnowledgeDocList
              docs={pageDocs} total={filtered.length} categories={categories} view={view}
              sortKey={sortKey} sortDir={sortDir} onSort={onSort}
              page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={n => { setPageSize(n); setPage(1) }}
              selected={selected} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
              togglingId={togglingId} onToggleActive={handleToggle}
              onOpen={setPreview} onEdit={doc => setModal({ open: true, doc })} onDelete={doc => setConfirm({ kind: 'doc', doc })}
            />
          )}
        </div>

        {/* Sağ: karşılama ve ses ayarları */}
        <div className={s.stack}>
          <div className={d.card}>
            <div className={s.spread} style={{ marginBottom: 12 }}>
              <div>
                <h3 className={s.h3}>
                  🗣️ Karşılama Mesajları ve Hat Ayarı
                  <InfoTooltip title="Karşılama mesajı">
                    Arama açıldığında asistanın söylediği ilk cümledir. Gelen ve giden aramalar için ayrı mesaj yazabilirsiniz. En az 3, en fazla {GREETING_MAX} karakter olmalıdır.
                  </InfoTooltip>
                </h3>
                <p className={s.sub}>Gelen ve giden aramalar için ayrı açılış metinleri</p>
              </div>
              {greetingLoading && <div className={s.spinner} />}
            </div>

            <div className={d.segmentTrack} style={{ display: 'flex', marginBottom: 12 }} role="group" aria-label="Karşılama türü">
              {([['inbound', `📥 ${TERM_LABELS.inbound}`], ['outbound', `📤 ${TERM_LABELS.outbound}`], ['callerid', '📞 Arayan Numara']] as const).map(([key, text]) => (
                <button key={key} type="button" className={greetingTab === key ? d.segmentActive : d.segment} style={{ flex: 1 }} aria-pressed={greetingTab === key}
                  onClick={() => { setGreetingTab(key); setGreetingErrors({}) }}>{text}</button>
              ))}
            </div>

            {!greetingLoading && greetingTab !== 'callerid' && (
              <div>
                <label className={s.label} htmlFor="kb-greeting">
                  {greetingTab === 'inbound' ? 'Hasta kliniği aradığında söylenecek ilk cümle' : 'Asistan hastayı aradığında söylenecek ilk cümle'}
                  <Counter value={greetingValue.length} max={GREETING_MAX} />
                </label>
                <textarea id="kb-greeting" className={`${d.input} ${s.textarea} ${greetingErrors.greeting ? s.inputError : ''}`} rows={3} value={greetingValue}
                  onChange={e => {
                    const v = maskGreeting(e.target.value)
                    if (greetingTab === 'inbound') setGreetingText(v); else setGreetingOutboundText(v)
                    setGreetingErrors({})
                  }}
                  placeholder={greetingTab === 'inbound' ? 'Merhaba, hoş geldiniz! Size nasıl yardımcı olabilirim?' : 'Merhaba, kliniğimizden arıyorum. Tedavi sonrası memnuniyet anketimiz için uygun musunuz?'} />
                <FieldError message={greetingErrors.greeting} />
                <div className={s.row} style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" className={d.btnPrimary} disabled={greetingSaving || !validateGreeting(greetingValue).ok} onClick={() => handleSaveGreeting(greetingTab as 'inbound' | 'outbound')}>
                    {greetingSaving ? 'Kaydediliyor…' : greetingTab === 'inbound' ? 'Gelen karşılamayı kaydet' : 'Giden karşılamayı kaydet'}
                  </button>
                </div>
              </div>
            )}

            {!greetingLoading && greetingTab === 'callerid' && (
              <div>
                <div className={s.label}>
                  Arayan numara
                  <InfoTooltip title="Arayan numara nedir?">
                    Asistan dışarı arama yaparken karşı tarafın ekranında görünecek telefon hattı numarasıdır. 11 hane olarak, 0 ile başlayarak girin.
                  </InfoTooltip>
                </div>
                <PhoneMaskedInput value={outboundCallerId} onValueChange={v => { setOutboundCallerId(v); setGreetingErrors({}) }} placeholder="0 (850) 309 61 19"
                  className={`${d.input} ${greetingErrors.callerId ? s.inputError : ''}`} />
                <FieldError message={greetingErrors.callerId} />
                <div className={s.row} style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" className={d.btnPrimary} disabled={callerIdSaving || !isCompleteTrPhone(outboundCallerId)} onClick={handleSaveCallerId}>
                    {callerIdSaving ? 'Kaydediliyor…' : 'Arayan numarayı kaydet'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <VoiceAiSettings onToast={showToast} />
        </div>
      </div>

      <WhatsAppConversationsCard />

      {/* Konuşma akışı */}
      <div className={`${d.card} ${s.stack}`}>
        <div className={s.spread}>
          <div>
            <h3 className={s.h3}>🔀 Konuşma Akışı Senaryoları</h3>
            <p className={s.sub}>Yapay zekanın görüşme esnasında soracağı soruları, kontrolleri ve randevu adımlarını görsel olarak tasarlayın</p>
          </div>
          <Segment value={flowDirection} onChange={setFlowDirection} label="Akış türü" options={flowOptions} />
        </div>
        <div className={s.flowNotice}>
          {flowDirection === 'inbound'
            ? '📥 Şu an gelen arama akışı düzenleniyor — kliniği arayan hastaların karşılama, sorgulama ve randevu akışı.'
            : flowDirection === 'outbound'
            ? '📤 Şu an giden arama akışı düzenleniyor — asistanın yaptığı memnuniyet anketi ve takip aramalarının akışı.'
            : '💬 Şu an WhatsApp asistan akışı düzenleniyor — WhatsApp üzerinden gelen hasta mesajlarında uygulanacak konuşma akışı.'}
        </div>
        <FlowBuilder key={flowDirection} direction={flowDirection} />
      </div>

      {/* Önizleme çekmecesi */}
      {preview && (
        <KnowledgeDocPreview
          doc={preview} category={getCat(preview.category)} toggling={togglingId === preview.id}
          onClose={() => setPreview(null)}
          onEdit={doc => { setPreview(null); setModal({ open: true, doc }) }}
          onDelete={doc => setConfirm({ kind: 'doc', doc })}
          onToggleActive={handleToggle}
        />
      )}

      {modal.open && (
        <DocModal doc={modal.doc} onClose={() => { if (!saving) setModal({ open: false, doc: null }) }} onSave={handleSave} saving={saving} categories={categories} />
      )}

      {catModalOpen && (
        <CategoryModal categories={categories} onClose={() => setCatModalOpen(false)} onCreated={async () => { await load(); showToast('✅ Kategori eklendi') }} onError={m => showToast(m, 'error')} />
      )}

      {callModalOpen && (
        <ModalShell icon="📞" title="Yapay Zeka ile Ara" subtitle="Giden arama akışı ile dış arama başlatın" onClose={() => setCallModalOpen(false)} onSubmit={handleOutboundCall}
          footer={(
            <>
              <button type="button" className={d.btn} onClick={() => setCallModalOpen(false)} disabled={calling}>İptal</button>
              <button type="submit" className={d.btnPrimary} disabled={calling || !isCompleteTrPhone(callPhone)}>{calling ? 'Aranıyor…' : 'Arama başlat'}</button>
            </>
          )}>
          <div className={d.subcard}>
            <div className={s.label}>
              Hedef telefon numarası
              <InfoTooltip title="Arama bilgileri">
                Arama şu ayarlarla başlar: çıkış numarası {outboundCallerId ? `0 (${outboundCallerId.slice(1, 4)}) ${outboundCallerId.slice(4, 7)} ${outboundCallerId.slice(7, 9)} ${outboundCallerId.slice(9, 11)}` : '—'}, akış “giden arama akışı (anket ve takip)”, açılış cümlesi “giden arama karşılama mesajı”. Hastanın asistan arama izni olması gerekir.
              </InfoTooltip>
            </div>
            <PhoneMaskedInput value={callPhone} onValueChange={v => { setCallPhone(v); setCallErrors({}) }} placeholder="0 (5XX) XXX XX XX" className={`${d.input} ${callErrors.phone ? s.inputError : ''}`} />
            <FieldError message={callErrors.phone} />
          </div>
        </ModalShell>
      )}

      {confirmProps && (
        <ConfirmModal isOpen title={confirmProps.title} message={confirmProps.message} variant={confirmProps.variant} confirmText={confirmProps.confirmText}
          onClose={() => setConfirm(null)} onConfirm={() => { const run = confirmProps.run; setConfirm(null); void run() }} />
      )}
    </div>
  )
}
