import React, { useEffect, useRef } from 'react'
import PlanDialog from './PlanDialog'
import styles from './PineTreatmentPlan.module.css'

type Menu = { x: number; y: number; teeth: number[] }
export default function PlanToothTools(p: any) {
  const menu = p.contextMenu as Menu | null
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector('button')?.focus()
    const dismiss = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      event.preventDefault(); event.stopPropagation()
      p.setContextMenu(null)
    }
    document.addEventListener('click', dismiss, true)
    document.addEventListener('contextmenu', dismiss, true)
    return () => {
      document.removeEventListener('click', dismiss, true)
      document.removeEventListener('contextmenu', dismiss, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [menu, p.setContextMenu])
  // Match the original menu: indications belong to the last existing
  // treatment on every target. Never create a new row or edit a locked row.
  const canAddIndication = !!menu?.teeth.length && menu.teeth.every(number => {
    const rows = p.drafts[number] || []
    return rows.length > 0 && !rows[rows.length - 1].locked
  })
  const tooth = p.detailTooth
  const items = tooth ? p.drafts[tooth] || [] : []
  const update = (id: string, values: any) => p.setDrafts((previous: any) => ({ ...previous, [tooth]: previous[tooth].map((item: any) => item.id === id && !item.locked ? { ...item, ...values } : item) }))
  const anatomyLocked = items.some((item: any) => item.locked)
  return <>
    {menu && <div ref={ref} role="menu" aria-label="Diş işlemleri" className={styles.toothMenu} style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 228)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 308)) }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); p.setContextMenu(null); return }
      if (event.key === 'Tab') { p.setContextMenu(null); return }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }
    }}>
      <div className={styles.menuHeading}>Seçili Dişler: {menu.teeth.join(', ')}</div>
      <div className={styles.menuBody}>
        <div className={styles.menuSection}>İşlem Ekle</div>
        {p.procedures.map((procedure: any) => <button type="button" role="menuitem" key={procedure.id} title={procedure.name} onClick={() => {
          p.add(menu.teeth, { procedures: [procedure], indications: [], activeMaterials: procedure.materials || [] })
          p.setContextMenu(null)
        }}><span className={styles.menuProcedureName}>{procedure.name}</span><span className={styles.menuPrice}>{procedure.price.toLocaleString('tr-TR')}₺</span></button>)}
        <div className={`${styles.menuSection} ${styles.menuIndications}`}>Endikasyon Ekle</div>
        {p.indications.map((indication: string) => <button type="button" role="menuitem" key={indication} disabled={!canAddIndication} title={!canAddIndication ? 'Seçili dişlerin tümünde düzenlenebilir bir son işlem bulunmalıdır.' : indication} onClick={() => {
          if (!canAddIndication) return
          p.setDrafts((previous: any) => {
            // Recheck inside the update so the selection is applied atomically.
            if (!menu.teeth.every(number => { const last = previous[number]?.at(-1); return last && !last.locked })) return previous
            const next = { ...previous }
            for (const number of menu.teeth) {
              const rows = next[number]
              next[number] = rows.map((item: any, index: number) => index === rows.length - 1 && !item.indications.includes(indication) ? { ...item, indications: [...item.indications, indication] } : item)
            }
            return next
          })
          p.setContextMenu(null)
        }}>{indication}</button>)}
      </div>
    </div>}
    {tooth && <PlanDialog title={`Diş ${tooth} detayları`} onClose={() => p.setDetailTooth(null)}>
      <fieldset className={styles.anatomy} disabled={anatomyLocked}><legend>Yüzeyler</legend>
        <div className={styles.wrapActions}>{['M', 'O', 'D', 'B', 'L'].map(surface => <button type="button" key={surface} className={`${styles.button} ${(p.toothSurfaces[tooth] || []).includes(surface) ? styles.primary : ''}`} aria-pressed={(p.toothSurfaces[tooth] || []).includes(surface)} onClick={() => { const current = p.toothSurfaces[tooth] || []; p.updateSurfaces(Number(tooth), current.includes(surface) ? current.filter((value: string) => value !== surface) : [...current, surface]) }}>{surface}</button>)}</div>
        <div className={styles.wrapActions}>{['O', 'MO', 'DO', 'MOD'].map(preset => <button type="button" key={preset} className={styles.button} onClick={() => p.updateSurfaces(Number(tooth), preset.split(''))}>{preset}</button>)}</div>
        <label htmlFor="tooth-section">Anatomik bölüm</label><select id="tooth-section" className={styles.select} value={p.toothSections[tooth] || ''} onChange={event => p.updateSection(Number(tooth), event.target.value || null)}><option value="">Seçilmedi</option><option value="crown">Kuron</option><option value="cervical">Kole (Servikal)</option><option value="root">Kök & Apeks</option></select>
      </fieldset>
      {!items.length && <p className={styles.dialogDescription}>Bu dişte henüz tedavi yok. Seçtiğiniz yüzey ve bölüm yeni işleme uygulanır.</p>}
      {items.map((item: any) => <div key={item.id} className={styles.detailItem}><strong>{item.name}</strong>{item.locked && <p className={styles.dialogDescription}>Tamamlanmış veya ödemeye bağlı işlem.</p>}
        <label>Hekim<select className={styles.select} value={item.doctorId || ''} disabled={item.locked} onChange={event => update(item.id, { doctorId: event.target.value || null })}><option value="">Seçiniz</option>{p.doctors.map((doctor: any) => <option value={doctor.id} key={doctor.id}>{doctor.name}</option>)}</select></label>
        <label>İşlem fiyatı (₺)<input className={styles.input} type="number" min="0" step="0.01" value={item.price} disabled={item.locked} onChange={event => update(item.id, { price: Number(event.target.value) })} /></label>
        <p className={styles.dialogDescription}>{item.indications.join(', ') || 'Endikasyon eklenmedi'}</p>
        <div className={styles.wrapActions}><button type="button" className={styles.button} onClick={() => { p.openMaterials({ target: tooth, id: item.id }); p.setDetailTooth(null) }}>Malzemeler ({item.materials.length})</button><button type="button" className={styles.button} disabled={item.locked} onClick={() => p.setDrafts((previous: any) => ({ ...previous, [tooth]: previous[tooth].filter((row: any) => row.id !== item.id) }))}>İşlemi kaldır</button></div>
      </div>)}
    </PlanDialog>}
  </>
}
