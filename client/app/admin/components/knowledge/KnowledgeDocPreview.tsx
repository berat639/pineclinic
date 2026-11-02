'use client'
import { useEffect } from 'react'
import type { KnowledgeDoc, CategoryDef } from '../KnowledgeTab'
import { DocBadges, fmtDate } from './KnowledgeDocList'
import { CALL_DIRECTION_LABELS } from '@/lib/knowledge-input-rules'
import InfoTooltip from '../ui/InfoTooltip'
import d from '../../../../styles/clinic-depth.module.css'
import s from './KnowledgeTab.module.css'

interface Props {
  doc: KnowledgeDoc
  category?: CategoryDef
  toggling: boolean
  onClose: () => void
  onEdit: (doc: KnowledgeDoc) => void
  onDelete: (doc: KnowledgeDoc) => void
  onToggleActive: (id: string) => void
}

/** Sağ çekmece önizleme: Esc ile kapanır, arka plan kaydırması kilitlidir. */
export default function KnowledgeDocPreview({ doc, category, toggling, onClose, onEdit, onDelete, onToggleActive }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className={s.drawerBackdrop} onClick={onClose}>
      <aside className={s.drawer} role="dialog" aria-modal="true" aria-label="Belge önizleme" onClick={e => e.stopPropagation()}>
        <div className={s.drawerHead}>
          <div style={{ minWidth: 0 }}>
            <h2 className={s.modalTitle} style={{ wordBreak: 'break-word' }}>{doc.title}</h2>
            <div className={s.row} style={{ marginTop: 6 }}>
              <DocBadges doc={doc} category={category} />
              {!doc.active && <span className={s.badgeOff}>Pasif</span>}
            </div>
          </div>
          <button type="button" className={d.btn} onClick={onClose} aria-label="Kapat">✕</button>
        </div>
        <div className={s.drawerBody}>
          <div className={d.subcard}>
            <div className={s.kv}>
              <span className={s.kvKey}>Kullanım yeri</span><span>{CALL_DIRECTION_LABELS[doc.callDirection || 'both']}</span>
              <span className={s.kvKey}>Bilgi bankası</span>
              <span>{doc.embeddedAt ? `İşlendi · ${fmtDate(doc.embeddedAt)}` : 'Henüz işlenmedi'}</span>
              <span className={s.kvKey}>Son güncelleme</span><span>{fmtDate(doc.updatedAt)}</span>
              <span className={s.kvKey}>Oluşturma</span><span>{fmtDate(doc.createdAt)}</span>
            </div>
          </div>
          <div className={d.subcard}>
            <div className={s.label}>
              İçerik
              <InfoTooltip title="Bu metin ne işe yarar?">
                Yapay zeka asistan, aramalarda bu metni okuyarak hastalara doğru bilgi verir. Belge pasifse asistan bu metni kullanmaz.
              </InfoTooltip>
              <span className={s.counter}>{doc.content.length.toLocaleString('tr-TR')} karakter</span>
            </div>
            <p className={s.previewText}>{doc.content}</p>
          </div>
        </div>
        <div className={s.drawerFoot}>
          <div className={s.switchRow} style={{ marginRight: 'auto' }}>
            <button type="button" role="switch" aria-checked={doc.active} className={d.switch} disabled={toggling} onClick={() => onToggleActive(doc.id)} aria-label="Aktif durumu" />
            <span>{doc.active ? 'Aktif' : 'Pasif'}</span>
          </div>
          <button type="button" className={s.btnDanger} onClick={() => onDelete(doc)}>🗑 Sil</button>
          <button type="button" className={d.btnPrimary} onClick={() => onEdit(doc)}>✏️ Düzenle</button>
        </div>
      </aside>
    </div>
  )
}
