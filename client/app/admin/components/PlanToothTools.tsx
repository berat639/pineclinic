import React, { useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import PlanDialog from './PlanDialog'
import { checkDoctorAvailability } from '../../../lib/doctor-availability'
import styles from './PineTreatmentPlan.module.css'

type Menu = { x: number; y: number; teeth: number[] }

export interface PlanToothContextMenuProps {
  contextMenu?: Menu | null
  setContextMenu?: (menu: Menu | null) => void
  onClose?: () => void
  drafts?: Record<string, any[]>
  setDrafts?: React.Dispatch<React.SetStateAction<any>>
  onRemoveDraft?: (teeth: number[], draftId?: string, procName?: string) => void
  onClearTeethDrafts?: (teeth: number[]) => void
  procedures?: any[]
  indications?: string[]
  add?: (teeth: number[], payload: any) => void
  onAddProcedure?: (proc: any) => void
  onAddIndication?: (indication: string) => void
}

export function PlanToothContextMenu(p: PlanToothContextMenuProps & Record<string, any>) {
  const menu: Menu | null = p.contextMenu || (p.teeth && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y, teeth: p.teeth } : null)
  const ref = useRef<HTMLDivElement>(null)

  const closeMenu = () => {
    if (p.onClose) p.onClose()
    if (p.setContextMenu) p.setContextMenu(null)
  }

  useEffect(() => {
    if (!menu) return
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector('button')?.focus()

    const handleWheel = (event: WheelEvent) => {
      const menuEl = ref.current
      if (!menuEl || !menuEl.contains(event.target as Node)) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      let scrollable: HTMLElement | null = event.target as HTMLElement | null
      while (scrollable && scrollable !== menuEl && scrollable.scrollHeight <= scrollable.clientHeight) {
        scrollable = scrollable.parentElement
      }
      if (!scrollable || scrollable.scrollHeight <= scrollable.clientHeight) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      const atTop = scrollable.scrollTop <= 0 && event.deltaY < 0
      const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1 && event.deltaY > 0
      if (atTop || atBottom) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    const handleTouchMove = (event: TouchEvent) => {
      const menuEl = ref.current
      if (!menuEl || !menuEl.contains(event.target as Node)) {
        event.preventDefault()
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true })
    return () => {
      window.removeEventListener('wheel', handleWheel, { capture: true } as any)
      window.removeEventListener('touchmove', handleTouchMove, { capture: true } as any)
      if (previous?.isConnected) previous.focus()
    }
  }, [menu])

  if (!menu) return null

  const drafts = p.drafts || {}
  const procedures = p.procedures || []
  const indications = p.indications || []

  const getProcColor = (itemOrProc: any) => {
    if (itemOrProc?.color) return itemOrProc.color
    const matched = procedures.find(
      (proc: any) => (itemOrProc?.procedureId && proc.id === itemOrProc.procedureId) || proc.name === itemOrProc?.name
    )
    return matched?.color || '#0284c7'
  }

  // Collect all draft treatments across menu.teeth (including completed ones so user can delete them)
  const assignedDrafts: Array<{
    key: string
    tooth: number
    draftId?: string
    name: string
    color: string
    wasCompleted?: boolean
  }> = []

  for (const toothNum of menu.teeth) {
    const rows = drafts[toothNum] || []
    for (const row of rows) {
      if (row) {
        assignedDrafts.push({
          key: `${toothNum}-${row.id || row.name}-${assignedDrafts.length}`,
          tooth: Number(toothNum),
          draftId: row.id,
          name: row.name,
          color: getProcColor(row),
          wasCompleted: Boolean(row.wasCompleted || row.status === 'completed' || row.locked),
        })
      }
    }
  }

  const handleRemoveDraft = (targetTeeth: number[], draftId?: string, procName?: string, wasCompleted?: boolean) => {
    if (wasCompleted) {
      toast('⚠️ Tamamlanmış bir işlem kaldırıldı. Planı kaydederken onayınız istenecektir.', { icon: '⚠️', id: 'completed-edit-warn' })
    }
    if (p.onRemoveDraft) {
      p.onRemoveDraft(targetTeeth, draftId, procName)
    } else if (p.setDrafts) {
      p.setDrafts((previous: any) => {
        const next = { ...previous }
        for (const t of targetTeeth) {
          const rows = next[t] || []
          if (draftId) {
            next[t] = rows.filter((row: any) => row.id !== draftId)
          } else if (procName) {
            next[t] = rows.filter((row: any) => row.name !== procName)
          }
          if (next[t]?.length === 0) delete next[t]
        }
        return next
      })
    }
  }

  // Indications belong to the last existing treatment on every target tooth.
  const canAddIndication = !!menu.teeth.length && menu.teeth.every(number => {
    const rows = drafts[number] || []
    return rows.length > 0
  })

  const safeLeft = Math.max(8, Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 256))
  const safeTop = Math.max(8, Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 768) - 360))

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100019 }}
      onClick={() => closeMenu()}
      onContextMenu={event => {
        event.preventDefault()
        closeMenu()
      }}
    >
      <div
        ref={ref}
        role="menu"
        aria-label="Diş işlemleri"
        className={styles.toothMenu}
        style={{ left: safeLeft, top: safeTop }}
        onClick={event => event.stopPropagation()}
        onContextMenu={event => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); return }
          if (event.key === 'Tab') { closeMenu(); return }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next]?.focus()
          }
        }}
      >
        <div className={styles.menuHeading}>Seçili Dişler: {menu.teeth.join(', ')}</div>
        <div className={`${styles.menuBody} contextSection`} style={{ overscrollBehavior: 'contain' }}>
          {assignedDrafts.length > 0 && (
            <>
              <div
                className={styles.menuSection}
                style={{ color: 'var(--danger, #ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span>Atanan İşlemler (Sil)</span>
                <span>{assignedDrafts.length}</span>
              </div>
              {assignedDrafts.map(entry => (
                <button
                  type="button"
                  role="menuitem"
                  key={entry.key}
                  title={`#${entry.tooth} - ${entry.name} işlemini sil`}
                  onClick={() => {
                    const isLast = assignedDrafts.length <= 1
                    handleRemoveDraft([entry.tooth], entry.draftId, entry.name, entry.wasCompleted)
                    if (isLast) closeMenu()
                  }}
                >
                  <span
                    className={styles.menuProcedureName}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: entry.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--foreground-2)', flexShrink: 0 }}>
                      #{entry.tooth}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.name}
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      color: 'var(--danger, #ef4444)',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={12} />
                    <span>Sil</span>
                  </span>
                </button>
              ))}
            </>
          )}

          <div className={styles.menuSection}>İşlem Ekle</div>
          {procedures.map((procedure: any) => (
            <button
              type="button"
              role="menuitem"
              key={procedure.id || procedure.name}
              title={procedure.name}
              onClick={() => {
                if (p.onAddProcedure) {
                  p.onAddProcedure(procedure)
                } else if (p.add) {
                  p.add(menu.teeth, { procedures: [procedure], indications: [], activeMaterials: procedure.materials || [] })
                }
                closeMenu()
              }}
            >
              <span
                className={styles.menuProcedureName}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: procedure.color || '#0284c7',
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {procedure.name}
                </span>
              </span>
              <span className={styles.menuPrice}>{(procedure.price ?? 0).toLocaleString('tr-TR')}₺</span>
            </button>
          ))}

          <div className={`${styles.menuSection} ${styles.menuIndications}`}>Endikasyon Ekle</div>
          {indications.map((indication: string) => (
            <button
              type="button"
              role="menuitem"
              key={indication}
              disabled={!canAddIndication}
              title={!canAddIndication ? 'Seçili dişlerin tümünde en az bir işlem bulunmalıdır.' : indication}
              onClick={() => {
                if (!canAddIndication) return
                if (p.onAddIndication) {
                  p.onAddIndication(indication)
                } else if (p.setDrafts) {
                  const hasCompletedTarget = menu.teeth.some(number => {
                    const last = (drafts[number] || []).at(-1)
                    return Boolean(last && !last.indications?.includes(indication) && (last.wasCompleted || last.status === 'completed'))
                  })
                  if (hasCompletedTarget) {
                    toast('⚠️ Tamamlanmış bir işlemde değişiklik yaptınız. Kaydederken onayınız istenecektir.', { icon: '⚠️', id: 'completed-edit-warn' })
                  }
                  p.setDrafts((previous: any) => {
                    if (!menu.teeth.every(number => { const last = previous[number]?.at(-1); return !!last })) return previous
                    const next = { ...previous }
                    for (const number of menu.teeth) {
                      const rows = next[number]
                      next[number] = rows.map((item: any, index: number) => {
                        if (index === rows.length - 1 && !item.indications.includes(indication)) {
                          return { ...item, indications: [...item.indications, indication] }
                        }
                        return item
                      })
                    }
                    return next
                  })
                }
                closeMenu()
              }}
            >
              {indication}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PlanToothTools(p: any) {
  const tooth = p.detailTooth
  const items = tooth ? p.drafts[tooth] || [] : []
  const update = (id: string, values: any) => {
    const targetItem = items.find((item: any) => item.id === id)
    if (targetItem && (targetItem.wasCompleted || targetItem.status === 'completed')) {
      toast('⚠️ Tamamlanmış bir işlemde değişiklik yaptınız. Kaydederken onayınız istenecektir.', { icon: '⚠️', id: 'completed-edit-warn' })
    }
    p.setDrafts((previous: any) => ({
      ...previous,
      [tooth]: (previous[tooth] || []).map((item: any) => (item.id === id ? { ...item, ...values } : item)),
    }))
  }
  return <>
    <PlanToothContextMenu {...p} />
    {tooth && <PlanDialog title={`Diş ${tooth} detayları`} onClose={() => p.setDetailTooth(null)}>
      <fieldset className={styles.anatomy}><legend>Yüzeyler</legend>
        <div className={styles.wrapActions}>{['M', 'O', 'D', 'B', 'L'].map(surface => <button type="button" key={surface} className={`${styles.button} ${(p.toothSurfaces[tooth] || []).includes(surface) ? styles.primary : ''}`} aria-pressed={(p.toothSurfaces[tooth] || []).includes(surface)} onClick={() => { const current = p.toothSurfaces[tooth] || []; p.updateSurfaces(Number(tooth), current.includes(surface) ? current.filter((value: string) => value !== surface) : [...current, surface]) }}>{surface}</button>)}</div>
        <div className={styles.wrapActions}>{['O', 'MO', 'DO', 'MOD'].map(preset => <button type="button" key={preset} className={styles.button} onClick={() => p.updateSurfaces(Number(tooth), preset.split(''))}>{preset}</button>)}</div>
        <label htmlFor="tooth-section">Anatomik bölüm</label><select id="tooth-section" className={styles.select} value={p.toothSections[tooth] || ''} onChange={event => p.updateSection(Number(tooth), event.target.value || null)}><option value="">Seçilmedi</option><option value="crown">Kuron</option><option value="cervical">Kole (Servikal)</option><option value="root">Kök & Apeks</option></select>
      </fieldset>
      {!items.length && <p className={styles.dialogDescription}>Bu dişte henüz tedavi yok. Seçtiğiniz yüzey ve bölüm yeni işleme uygulanır.</p>}
      {items.map((item: any) => <div key={item.id} className={styles.detailItem}><strong>{item.name}</strong>{(item.wasCompleted || item.status === 'completed') && <p className={styles.dialogDescription} style={{ color: '#d97706', fontWeight: 600 }}>⚠️ Tamamlanmış işlem — değişiklik yaptığınızda kaydederken onay istenecektir.</p>}
        <label>Hekim<select className={styles.select} value={item.doctorId || ''} onChange={event => {
          const nextDoctorId = event.target.value || null
          if (nextDoctorId && (item.sessionStartTime || p.event?.startTime)) {
            const check = checkDoctorAvailability(
              nextDoctorId,
              p.doctors,
              p.shifts,
              p.doctorLeaves,
              item.sessionStartTime || p.event?.startTime,
              `#${tooth} (${item.name}) işlemi için`
            )
            if (!check.valid) {
              toast.error(check.message, { duration: 6000, id: 'doctor-availability-warn' })
              return
            }
          }
          update(item.id, {
            doctorId: nextDoctorId,
            doctorIds: nextDoctorId ? [nextDoctorId] : [],
            doctorManuallySelected: Boolean(nextDoctorId),
            doctorAutoFilled: false,
          })
        }}><option value="">Seçiniz</option>{p.doctors.map((doctor: any) => {
          const avail = checkDoctorAvailability(doctor.id, p.doctors, p.shifts, p.doctorLeaves, item.sessionStartTime || p.event?.startTime)
          const suffix = (item.sessionStartTime || p.event?.startTime) && avail.badgeText ? ` (${avail.badgeText})` : ''
          return <option value={doctor.id} key={doctor.id}>{doctor.name}{suffix}</option>
        })}</select></label>
        <label>İşlem fiyatı (₺)<input className={styles.input} type="number" min="0" step="0.01" value={item.price} onChange={event => update(item.id, { price: Number(event.target.value) })} /></label>
        <p className={styles.dialogDescription}>{item.indications.join(', ') || 'Endikasyon eklenmedi'}</p>
        <div className={styles.wrapActions}><button type="button" className={styles.button} onClick={() => { p.openMaterials({ target: tooth, id: item.id }); p.setDetailTooth(null) }}>Malzemeler ({item.materials.length})</button><button type="button" className={styles.button} onClick={() => { if (item.wasCompleted || item.status === 'completed') toast('⚠️ Tamamlanmış bir işlem kaldırıldı. Planı kaydederken onayınız istenecektir.', { icon: '⚠️', id: 'completed-edit-warn' }); p.setDrafts((previous: any) => { const next = { ...previous, [tooth]: previous[tooth].filter((row: any) => row.id !== item.id) }; if (!next[tooth]?.length) delete next[tooth]; return next }) }}>İşlemi kaldır</button></div>
      </div>)}
    </PlanDialog>}
  </>
}
