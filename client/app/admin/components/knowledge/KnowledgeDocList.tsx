'use client'
import type { KnowledgeDoc, CategoryDef } from '../KnowledgeTab'
import { CALL_DIRECTION_LABELS } from '@/lib/knowledge-input-rules'
import d from '../../../../styles/clinic-depth.module.css'
import s from './KnowledgeTab.module.css'

export type SortKey = 'title' | 'category' | 'updatedAt' | 'active'
export type SortDir = 'asc' | 'desc'
export type ViewMode = 'list' | 'cards'
export const PAGE_SIZES = [15, 30, 50] as const

export function fmtDate(value: string): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return value
  }
}

export function DocBadges({ doc, category }: { doc: KnowledgeDoc; category?: CategoryDef }) {
  const dir = doc.callDirection || 'both'
  return (
    <>
      <span className={d.badge}>
        <span className={s.dot} style={{ background: category?.color ?? '#60a5fa' }} />
        {category ? `${category.icon} ${category.label}` : doc.category}
      </span>
      {dir !== 'both' && <span className={d.badge}>{CALL_DIRECTION_LABELS[dir]}</span>}
    </>
  )
}

interface Props {
  docs: KnowledgeDoc[]
  total: number
  categories: CategoryDef[]
  view: ViewMode
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  page: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleAll: (ids: string[], on: boolean) => void
  togglingId: string | null
  onToggleActive: (id: string) => void
  onOpen: (doc: KnowledgeDoc) => void
  onEdit: (doc: KnowledgeDoc) => void
  onDelete: (doc: KnowledgeDoc) => void
}

export default function KnowledgeDocList(p: Props) {
  const pages = Math.max(1, Math.ceil(p.total / p.pageSize))
  const catOf = (slug: string) => p.categories.find(c => c.slug === slug)
  const pageIds = p.docs.map(x => x.id)
  const allOn = pageIds.length > 0 && pageIds.every(id => p.selected.has(id))
  const arrow = (key: SortKey) => (p.sortKey === key ? (p.sortDir === 'asc' ? '▲' : '▼') : '')
  const from = p.total === 0 ? 0 : (p.page - 1) * p.pageSize + 1
  const to = Math.min(p.total, p.page * p.pageSize)

  const pager = (extra: string) => (
    <div className={extra}>
      <span className={s.pageInfo}>{from}–{to} / {p.total} belge</span>
      <div className={s.row}>
        <select className={`${d.input} ${s.select}`} style={{ minWidth: 110 }} value={p.pageSize} onChange={e => p.onPageSize(Number(e.target.value))} aria-label="Sayfa başına belge sayısı">
          {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / sayfa</option>)}
        </select>
        <div className={d.pager}>
          <button type="button" className={d.btn} disabled={p.page <= 1} onClick={() => p.onPage(p.page - 1)} aria-label="Önceki sayfa">‹</button>
          <span style={{ minWidth: 54, textAlign: 'center', fontWeight: 700 }}>{p.page} / {pages}</span>
          <button type="button" className={d.btn} disabled={p.page >= pages} onClick={() => p.onPage(p.page + 1)} aria-label="Sonraki sayfa">›</button>
        </div>
      </div>
    </div>
  )

  const switchBtn = (doc: KnowledgeDoc) => (
    <button
      type="button"
      role="switch"
      aria-checked={doc.active}
      aria-label={doc.active ? 'Pasif yap' : 'Aktif yap'}
      title={doc.active ? 'Aktif — pasif yapmak için tıklayın' : 'Pasif — aktif yapmak için tıklayın'}
      className={d.switch}
      disabled={p.togglingId === doc.id}
      onClick={e => { e.stopPropagation(); p.onToggleActive(doc.id) }}
    />
  )

  if (p.view === 'cards') {
    return (
      <div className={s.stack}>
        <div className={s.cardGrid}>
          {p.docs.map(doc => (
            <div key={doc.id} className={s.docCard} onClick={() => p.onOpen(doc)}>
              <div className={s.docCardTop}>
                <div className={`${s.title} ${doc.active ? '' : s.titleInactive}`} style={{ whiteSpace: 'normal' }}>{doc.title}</div>
                {switchBtn(doc)}
              </div>
              <div className={s.row}>
                <DocBadges doc={doc} category={catOf(doc.category)} />
                {!doc.active && <span className={s.badgeOff}>Pasif</span>}
              </div>
              <p className={s.docCardBody}>{doc.content}</p>
              <div className={s.docCardFoot}>
                {doc.embeddedAt ? <span className={s.badgeOk}>İşlendi</span> : <span className={s.badgeWarn}>İşlenmedi</span>}
                <div className={s.actions} onClick={e => e.stopPropagation()}>
                  <button type="button" className={s.btnIcon} onClick={() => p.onEdit(doc)} aria-label="Düzenle" title="Düzenle">✏️</button>
                  <button type="button" className={s.btnIconDanger} onClick={() => p.onDelete(doc)} aria-label="Sil" title="Sil">🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {pager(s.pagerBarFree)}
      </div>
    )
  }

  return (
    <div className={`${d.card} ${s.list}`}>
      <div className={s.listHead}>
        <input type="checkbox" className={s.checkbox} checked={allOn} onChange={e => p.onToggleAll(pageIds, e.target.checked)} aria-label="Sayfadaki tüm belgeleri seç" />
        <button type="button" className={s.sortBtn} onClick={() => p.onSort('title')}>Başlık {arrow('title')}</button>
        <button type="button" className={`${s.sortBtn} ${s.hideNarrow}`} onClick={() => p.onSort('category')}>Kategori {arrow('category')}</button>
        <span>Kullanım yeri</span>
        <button type="button" className={s.sortBtn} onClick={() => p.onSort('active')} title="Duruma göre sırala">Durum {arrow('active')}</button>
        <button type="button" className={s.sortBtn} style={{ justifyContent: 'flex-end' }} onClick={() => p.onSort('updatedAt')}>Güncelleme {arrow('updatedAt')}</button>
      </div>
      {p.docs.map(doc => {
        const cat = catOf(doc.category)
        const dir = doc.callDirection || 'both'
        return (
          <div key={doc.id} className={`${s.listRow} ${p.selected.has(doc.id) ? s.rowSelected : ''}`} onClick={() => p.onOpen(doc)}>
            <input type="checkbox" className={s.checkbox} checked={p.selected.has(doc.id)} onClick={e => e.stopPropagation()} onChange={() => p.onToggleSelect(doc.id)} aria-label={`${doc.title} seç`} />
            <div className={s.titleCell}>
              <span className={`${s.title} ${doc.active ? '' : s.titleInactive}`} title={doc.title}>{doc.title}</span>
              <span className={s.meta}>
                {!doc.active && 'Pasif · '}
                {doc.embeddedAt ? 'Bilgi bankasında' : 'Bilgi bankasına işlenmedi'}
              </span>
            </div>
            <div className={`${s.badgeCell} ${s.hideNarrow}`}>
              <span className={d.badge}><span className={s.dot} style={{ background: cat?.color ?? '#60a5fa' }} />{cat ? `${cat.icon} ${cat.label}` : doc.category}</span>
            </div>
            <div className={s.badgeCell}>
              <span className={d.badge}>{CALL_DIRECTION_LABELS[dir]}</span>
            </div>
            <div>{switchBtn(doc)}</div>
            <div className={s.actions} onClick={e => e.stopPropagation()}>
              <button type="button" className={s.btnIcon} onClick={() => p.onEdit(doc)} aria-label="Düzenle" title="Düzenle">✏️</button>
              <button type="button" className={s.btnIconDanger} onClick={() => p.onDelete(doc)} aria-label="Sil" title="Sil">🗑</button>
            </div>
          </div>
        )
      })}
      {pager(s.pagerBar)}
    </div>
  )
}
