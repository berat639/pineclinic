import React, { useRef, useState } from 'react'
import { CalendarDays, FileText, GripVertical, Mic, MicOff, Pencil, Plus, Printer, Save, Search, Trash2, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import PlanDialog from './PlanDialog'
import InlineCatalogForm, { type CreatedCatalogEntry, type EditingCatalogItem } from './InlineCatalogForm'
import PlanHistoryDialog from './PlanHistoryDialog'
import PlanToothTools from './PlanToothTools'
import PatientConsentPanel from './PatientConsentPanel'
import PlanMediaPanel from './PlanMediaPanel'
import { LOWER_TEETH, ToothChip, UPPER_TEETH } from './ToothChip'
import styles from './PineTreatmentPlan.module.css'

const money = (minor: number) => `${(minor / 100).toLocaleString('tr-TR', { minimumFractionDigits: minor % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })} ₺`
const targetName = (target: string) => target === 'upper' ? 'Üst çene' : target === 'lower' ? 'Alt çene' : target === 'general' ? 'Tüm ağız' : target

function IndicationIcon() {
  return <svg aria-hidden="true" className={styles.indicationIcon} viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2C3 2 2 5 2 8s1 8 2 16c.3 1.5 1 2 2.5 2s2.3-1 2.5-2.5v-4h6v4c.2 1.5 1 2.5 2.5 2.5S20 24.5 20 23c1-8 2-13 2-16 0-3-1-6-4-6-2.5 0-4 2-5 3.5C12 3 10.5 2 8 2z" /></svg>
}

// The view owns only temporary catalog selections; the parent owns the plan draft.
export default function PineTreatmentPlanView(p: any) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [procedureId, setProcedureId] = useState('')
  const [indications, setIndications] = useState<string[]>([])
  const [procedureSearch, setProcedureSearch] = useState('')
  const [indicationSearch, setIndicationSearch] = useState('')
  const [materials, setMaterials] = useState<any[]>([])
  const [materialId, setMaterialId] = useState('')
  const [indicationEditor, setIndicationEditor] = useState<string | null>(null)
  const [procedureEditor, setProcedureEditor] = useState<string | null>(null)
  const [editingIndication, setEditingIndication] = useState<EditingCatalogItem | null>(null)
  const [editingProcedure, setEditingProcedure] = useState<EditingCatalogItem | null>(null)
  const indicationListRef = useRef<HTMLDivElement>(null)
  const procedureListRef = useRef<HTMLDivElement>(null)
  const indicationAddRef = useRef<HTMLButtonElement>(null)
  const procedureAddRef = useRef<HTMLButtonElement>(null)
  const [materialRow, setMaterialRow] = useState<{ target: string; id: string } | null>(null)
  const selectedProcedure = p.procedures.find((item: any) => item.id === procedureId)
  const selectedIndicationName = indications.length === 1 ? indications[0] : null
  const selectedIndicationId = selectedIndicationName ? p.indicationIds[selectedIndicationName] : null
  const rows: { target: string; item: any }[] = Object.entries(p.drafts).flatMap(([target, items]) => (items as any[]).map(item => ({ target, item })))
  const patientName = p.patient?.name || p.event?.title?.split(' - ')[0] || 'Hasta'
  const initials = patientName.split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toLocaleUpperCase('tr-TR')
  const updateRow = (target: string, id: string, update: (item: any) => any) => p.setDrafts((previous: any) => ({ ...previous, [target]: (previous[target] || []).map((item: any) => item.id === id && !item.locked ? update(item) : item) }))
  const apply = (targets: (number | string)[], proc = selectedProcedure, inds = indications, mats = materials) => {
    if (!proc && !inds.length) { toast.error('Tedavi veya endikasyon seçin.'); return }
    let resolvedTargets: (number | string)[] = targets
    if (proc?.scope === 'mouth') {
      resolvedTargets = ['general']
    } else if (proc?.scope === 'jaw' && !resolvedTargets.length) {
      resolvedTargets = [p.jaw === 'lower' ? 'lower' : 'upper']
    }
    if (!resolvedTargets.length) { toast.error('Önce hedef diş seçin.'); return }
    p.add(resolvedTargets, { procedures: proc ? [proc] : [], indications: inds, activeMaterials: mats })
  }
  const selectProcedure = (proc: any) => {
    setProcedureId(proc.id); setMaterials((proc.materials || []).map((item: any) => ({ ...item })))
  }
  const syncProcedureMaterials = (nextMaterials: any[]) => {
    setMaterials(nextMaterials)
    if (!selectedProcedure?.id) return
    p.setProcedures((previous: any[]) => previous.map(item => item.id === selectedProcedure.id ? { ...item, materials: nextMaterials } : item))
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedProcedure.id)) {
      void fetch(`/api/dental/treatment-catalog/${selectedProcedure.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'procedure',
          name: selectedProcedure.name,
          scope: selectedProcedure.scope || 'tooth',
          priceMinor: Math.round((selectedProcedure.price || 0) * 100),
          color: selectedProcedure.color,
          materials: nextMaterials.map(m => ({
            inventoryItemId: m.inventoryItemId,
            quantity: Math.max(1, Number(m.quantity) || 1),
            unitSalePriceMinor: Math.max(0, Number(m.unitSalePriceMinor) || 0),
          })),
        }),
      }).catch(() => {})
    }
  }
  const addMaterial = () => {
    const item = p.inventory.find((entry: any) => entry.id === materialId)
    if (!selectedProcedure || !item) return
    if (!materials.some(entry => entry.inventoryItemId === item.id)) {
      syncProcedureMaterials([...materials, { inventoryItemId: item.id, name: item.name, quantity: 1, unitCost: item.costPerUnit, unitSalePriceMinor: 0 }])
    }
    setMaterialId('')
  }
  const filteredIndications = p.indications.filter((name: string) => name.toLocaleLowerCase('tr-TR').includes(indicationSearch.trim().toLocaleLowerCase('tr-TR')))
  const filteredProcedures = p.procedures.filter((item: any) => item.name.toLocaleLowerCase('tr-TR').includes(procedureSearch.trim().toLocaleLowerCase('tr-TR')))
  const closeCatalogEditor = (kind: 'procedure' | 'indication') => {
    if (kind === 'procedure') { setProcedureEditor(null); setEditingProcedure(null) }
    else { setIndicationEditor(null); setEditingIndication(null) }
    requestAnimationFrame(() => (kind === 'procedure' ? procedureAddRef : indicationAddRef).current?.focus())
  }
  const catalogCreated = (kind: 'procedure' | 'indication', result: CreatedCatalogEntry) => {
    if (kind === 'procedure') {
      const wasEditing = !!editingProcedure
      const procedure = { ...result, price: result.priceMinor / 100, materials: result.materials || editingProcedure?.defaultMaterials || [] }
      p.setProcedures((previous: any[]) => wasEditing ? previous.map(item => item.id === result.id ? procedure : item) : [procedure, ...previous.filter(item => item.id !== result.id)])
      setProcedureId(result.id); setMaterials(procedure.materials.map((item: any) => ({ ...item }))); setMaterialId(''); setProcedureSearch('')
      if (!wasEditing && procedureListRef.current) procedureListRef.current.scrollTop = 0
      closeCatalogEditor(kind)
      toast.success(wasEditing ? `${result.name} güncellendi.` : `${result.name} kataloğa eklendi ve seçildi.`)
    } else {
      const wasEditing = !!editingIndication
      const oldName = editingIndication?.name
      p.setIndications((previous: string[]) => wasEditing && oldName ? previous.map(name => name === oldName ? result.name : name) : [result.name, ...previous.filter(name => name !== result.name)])
      p.setIndicationIds((previous: any) => {
        const next = { ...previous, [result.name]: result.id }
        if (oldName && oldName !== result.name) delete next[oldName]
        return next
      })
      setIndications(previous => {
        const cleaned = oldName ? previous.filter(name => name !== oldName) : previous
        return cleaned.includes(result.name) ? cleaned : [...cleaned, result.name]
      })
      setIndicationSearch('')
      if (!wasEditing && indicationListRef.current) indicationListRef.current.scrollTop = 0
      closeCatalogEditor(kind)
      toast.success(wasEditing ? `${result.name} güncellendi.` : `${result.name} kataloğa eklendi ve seçildi.`)
    }
  }
  const archiveCatalogEntry = async (kind: 'procedure' | 'indication', id: string, name: string) => {
    try {
      const response = await fetch(`/api/dental/treatment-catalog/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Katalog kaydı kaldırılamadı.')
      }
      if (kind === 'procedure') {
        p.setProcedures((previous: any[]) => previous.filter(item => item.id !== id))
        if (procedureId === id) { setProcedureId(''); setMaterials([]) }
      } else {
        p.setIndications((previous: string[]) => previous.filter(item => item !== name))
        setIndications(previous => previous.filter(item => item !== name))
      }
      toast.success(`${name} katalogdan kaldırıldı.`)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Katalog kaydı kaldırılamadı.')
    }
  }
  const materialItem = materialRow && rows.find(row => row.target === materialRow.target && row.item.id === materialRow.id)?.item
  return <div className={styles.overlay}><div role="dialog" aria-modal="true" aria-label="Tedavi planı" className={`treatment-plan-modal ${styles.modal}`}>
    <header className={styles.header}>
      <h1>{p.identity ? 'Tedavi Planı Düzenle' : 'Tedavi Planı Oluştur'}</h1>
      <div className={styles.patient}><div className={styles.avatar}>{initials}</div><div><strong>{patientName}</strong><span>{p.patient?.patientNumber ? `#${p.patient.patientNumber}` : 'Hasta kaydı'}</span></div></div>
      <PatientConsentPanel patientId={p.event.patientId} compact selectedChannels={p.notificationChannels} onChannelsChange={p.setNotificationChannels} onContactChange={p.onContactChange} periodic={p.periodic} periodDays={p.periodDays} onOpenReminder={() => setReminderOpen(true)} />
      <span className={styles.date}><CalendarDays size={15} />{new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      <div className={styles.headerRight}>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={p.toggleVoice} disabled={p.voiceStarting} aria-pressed={p.listening}>{p.listening ? <MicOff size={15} /> : <Mic size={15} />}{p.listening ? 'Dinlemeyi Durdur' : 'Sesli Komut ile Planla'}</button>
        <button type="button" className={styles.button} aria-label="Tedavi planını kapat" onClick={p.close}><X size={16} /></button>
      </div>
      {(p.listening || p.analyzing || p.voiceError) && <div className={styles.hint} aria-live="polite">{p.voiceError || (p.analyzing ? 'Komut analiz ediliyor…' : p.transcript || 'Dinleniyor…')}</div>}
    </header>
    <main className={styles.content}>
      <PlanMediaPanel patientId={p.event.patientId} attachments={p.attachments} onChange={p.setAttachments} onUploadingChange={p.setUploading} />
      <section className={styles.section} aria-label="Odontogram">
        <div className={styles.sectionHeading}><span className={styles.step}>2</span><h2>Odontogram</h2><span className={styles.description}>{p.selected.length ? `Seçili dişler: ${p.selected.join(', ')}` : 'Diş seçin · Shift ile aralık seçin · Sağ tık ile işlemleri açın.'}</span>
          <div className={styles.chartActions}>
            <button className={`${styles.button} ${styles.small}`} type="button" onClick={() => p.setSelected([])}>Seçimi temizle</button>
            <select className={styles.select} value={p.jaw} aria-label="Çene seçimi" onChange={event => p.changeJaw(event.target.value)}><option value="all">Tüm ağız</option><option value="upper">Üst çene</option><option value="lower">Alt çene</option></select>
            <div className={styles.segment}><button type="button" className={`${styles.button} ${p.mode === '2d' ? styles.primary : ''}`} aria-pressed={p.mode === '2d'} onClick={() => p.setMode('2d')}>2B Chart</button><button type="button" className={`${styles.button} ${p.mode === '3d' ? styles.primary : ''}`} aria-pressed={p.mode === '3d'} onClick={() => p.setMode('3d')}>3B Anatomik</button></div>
          </div>
        </div>
        {p.mode === '2d' ? <div className={styles.chart}>{[UPPER_TEETH, LOWER_TEETH].map((teeth, index) => <div className={styles.teeth} key={index}>{teeth.map(tooth => <ToothChip key={tooth} number={tooth} selected={p.selected.includes(tooth)} hasDraft={!!p.drafts[tooth]?.length} colors={Array.from(new Set((p.drafts[tooth] || []).map((item: any) => item.color).filter(Boolean)))} onContextMenu={(event: React.MouseEvent) => p.onContextMenu(tooth, event)} onDoubleClick={() => p.setDetailTooth(String(tooth))} onClick={(event: React.MouseEvent) => p.clickTooth(tooth, event)} onDragOver={(event: React.DragEvent) => event.preventDefault()} onDrop={(event: React.DragEvent) => { event.preventDefault(); try { const data = JSON.parse(event.dataTransfer.getData('value') || event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain')); p.add([tooth], data) } catch { toast.error('Tedavi sürükleme verisi geçersiz.') } }} />)}</div>)}</div> : p.odontogram3d}
      </section>
      <div className={styles.bottom}>
        <section className={styles.section} aria-label="Klinik değerlendirme ve planlama"><div className={styles.sectionHeading}><span className={styles.step}>3</span><h2>Klinik Değerlendirme ve Planlama</h2><button type="button" className={`${styles.button} ${styles.pale} ${styles.small}`} style={{ marginLeft: 'auto' }} onClick={() => apply(p.selected)}><Plus size={14} /> {selectedProcedure?.scope === 'mouth' ? 'Tüm Ağza Ekle' : selectedProcedure?.scope === 'jaw' && !p.selected.length ? (p.jaw === 'lower' ? 'Alt Çeneye Ekle' : 'Üst Çeneye Ekle') : 'Seçilenleri Ekle'}</button></div>
          <div className={styles.workgrid}>
            <div className={styles.box}>
              <div className={styles.boxhead}><h3>Endikasyonlar</h3><div className={styles.wrapActions}>
                {selectedIndicationName && selectedIndicationId && <>
                  <button type="button" className={`${styles.button} ${styles.small}`} title="Seçili endikasyonu düzenle" aria-label="Seçili endikasyonu düzenle" onClick={() => { setEditingIndication({ id: selectedIndicationId, name: selectedIndicationName }); setIndicationEditor(selectedIndicationName) }}><Pencil size={12} /></button>
                  <button type="button" className={`${styles.button} ${styles.small}`} title="Seçili endikasyonu kaldır" aria-label="Seçili endikasyonu kaldır" onClick={() => void archiveCatalogEntry('indication', selectedIndicationId, selectedIndicationName)}><Trash2 size={12} /></button>
                </>}
                <button ref={indicationAddRef} className={`${styles.button} ${styles.pale} ${styles.small}`} type="button" aria-expanded={indicationEditor !== null} aria-controls="pine-create-indication" onClick={() => { setEditingIndication(null); if (indicationEditor === null) setIndicationEditor('') }}>+ Yeni</button>
              </div></div>
              <div className={styles.searchBox}><Search size={13} aria-hidden="true" /><input className={styles.search} placeholder="Endikasyon ara..." aria-label="Endikasyon ara" value={indicationSearch} onChange={event => setIndicationSearch(event.target.value)} /></div>
              {indicationEditor !== null && <InlineCatalogForm key={editingIndication?.id || 'new-indication'} kind="indication" initialName={indicationEditor} editingItem={editingIndication} onCreated={entry => catalogCreated('indication', entry)} onCancel={() => closeCatalogEditor('indication')} />}
              <div className={styles.list} ref={indicationListRef}>
                {filteredIndications.map((name: string) => <button type="button" key={p.indicationIds[name] || name} className={`${styles.listItem} ${indications.includes(name) ? styles.listItemSelected : ''}`} aria-pressed={indications.includes(name)} onClick={() => setIndications(previous => previous.includes(name) ? previous.filter(value => value !== name) : [...previous, name])}><IndicationIcon />{name}</button>)}
                {!filteredIndications.length && <div className={styles.catalogEmpty}><p className={styles.hint}>{indicationSearch.trim() ? 'Eşleşen endikasyon bulunamadı.' : 'Katalogda endikasyon bulunmuyor.'}</p>{indicationSearch.trim() && indicationEditor === null && <button type="button" className={styles.catalogCreate} onClick={() => { setEditingIndication(null); setIndicationEditor(indicationSearch.trim().slice(0, 120)) }}><Plus size={14} /><span>“{indicationSearch.trim()}” ile yeni kayıt oluştur</span></button>}</div>}
              </div>
            </div>
            <div className={styles.box}>
              <div className={styles.boxhead}><h3>Tedaviler</h3><div className={styles.wrapActions}>
                {selectedProcedure && /^[0-9a-f]{8}-/i.test(selectedProcedure.id) && <>
                  <button type="button" className={`${styles.button} ${styles.small}`} title="Seçili tedaviyi düzenle" aria-label="Seçili tedaviyi düzenle" onClick={() => { setEditingProcedure({ id: selectedProcedure.id, name: selectedProcedure.name, price: selectedProcedure.price, scope: selectedProcedure.scope || 'tooth', color: selectedProcedure.color, defaultMaterials: materials }); setProcedureEditor(selectedProcedure.name) }}><Pencil size={12} /></button>
                  <button type="button" className={`${styles.button} ${styles.small}`} title="Seçili tedaviyi kaldır" aria-label="Seçili tedaviyi kaldır" onClick={() => void archiveCatalogEntry('procedure', selectedProcedure.id, selectedProcedure.name)}><Trash2 size={12} /></button>
                </>}
                <button ref={procedureAddRef} className={`${styles.button} ${styles.pale} ${styles.small}`} type="button" aria-expanded={procedureEditor !== null} aria-controls="pine-create-procedure" onClick={() => { setEditingProcedure(null); if (procedureEditor === null) setProcedureEditor('') }}>+ Yeni tedavi</button>
              </div></div>
              <div className={styles.searchBox}><Search size={13} aria-hidden="true" /><input className={styles.search} placeholder="Tedavi ara..." aria-label="Tedavi ara" value={procedureSearch} onChange={event => setProcedureSearch(event.target.value)} /></div>
              {procedureEditor !== null && <InlineCatalogForm key={editingProcedure?.id || 'new-procedure'} kind="procedure" initialName={procedureEditor} editingItem={editingProcedure} replacingMaterials={!editingProcedure && materials.length > 0} onCreated={entry => catalogCreated('procedure', entry)} onCancel={() => closeCatalogEditor('procedure')} />}
              <div className={styles.list} ref={procedureListRef}>
                {filteredProcedures.map((item: any) => <button type="button" key={item.id} draggable className={`${styles.listItem} ${procedureId === item.id ? styles.listItemSelected : ''}`} aria-pressed={procedureId === item.id} onClick={() => selectProcedure(item)} onDoubleClick={() => apply(p.selected, item, indications, procedureId === item.id ? materials : item.materials || [])} onDragStart={event => event.dataTransfer.setData('value', JSON.stringify({ procedures: [item], indications: procedureId === item.id ? indications : [], activeMaterials: procedureId === item.id ? materials : item.materials || [] }))}><GripVertical size={14} aria-hidden="true" className={styles.listGrip} /><span style={{ flex: 1 }}>{item.name}</span><span>{money(Math.round(item.price * 100))}</span></button>)}
                {!filteredProcedures.length && <div className={styles.catalogEmpty}><p className={styles.hint}>{procedureSearch.trim() ? 'Eşleşen tedavi bulunamadı.' : 'Katalogda tedavi bulunmuyor.'}</p>{procedureSearch.trim() && procedureEditor === null && <button type="button" className={styles.catalogCreate} onClick={() => { setEditingProcedure(null); setProcedureEditor(procedureSearch.trim().slice(0, 120)) }}><Plus size={14} /><span>“{procedureSearch.trim()}” ile yeni kayıt oluştur</span></button>}</div>}
              </div>
              <div className={styles.materialBox}><h4>Malzeme <span className={styles.description}>(opsiyonel · seçili tedavi için)</span></h4><div className={styles.materialLine}><select className={styles.select} aria-label="Malzeme seç" value={materialId} onChange={event => setMaterialId(event.target.value)} disabled={!selectedProcedure}><option value="">Malzeme seç...</option>{p.inventory.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className={`${styles.button} ${styles.primary} ${styles.small}`} onClick={addMaterial} disabled={!materialId || !selectedProcedure}>+ Ekle</button></div>{materials.map((item, index) => <div className={styles.materialLine} key={item.inventoryItemId}><span>{item.name}</span><input className={styles.input} aria-label={`${item.name} miktarı`} type="number" min="1" style={{ width: 54 }} value={item.quantity} onChange={event => syncProcedureMaterials(materials.map((value, i) => i === index ? { ...value, quantity: Number(event.target.value) } : value))} /><input className={styles.input} aria-label={`${item.name} satış fiyatı`} type="number" min="0" step="0.01" style={{ width: 70 }} value={(item.unitSalePriceMinor || 0) / 100} onChange={event => syncProcedureMaterials(materials.map((value, i) => i === index ? { ...value, unitSalePriceMinor: Math.round(Number(event.target.value) * 100) } : value))} /><button type="button" className={`${styles.button} ${styles.small}`} aria-label={`${item.name} kaldır`} onClick={() => syncProcedureMaterials(materials.filter((_, i) => i !== index))}>×</button></div>)}</div>
            </div>
          </div><div className={styles.note}><div className={styles.noteHead}><strong><FileText size={15} /> Konsültasyon Notu</strong><div className={styles.wrapActions}><button type="button" className={`${styles.button} ${styles.small}`} onClick={() => setHistoryOpen(true)}>Hasta geçmişi</button><button type="button" className={`${styles.button} ${styles.pale} ${styles.small}`} disabled={p.saving} onClick={() => p.save({ closeAfter: false, allowEmpty: true })}>Notu kaydet</button></div></div><textarea className={styles.textarea} aria-label="Plan konsültasyon notu" placeholder="Konsültasyon notu ekleyin..." value={p.note} onChange={event => p.setNote(event.target.value)} /></div>
        </section>
        <section className={styles.section} aria-label="Tedavi planı"><div className={styles.sectionHeading}><span className={styles.step}>4</span><h2>Tedavi planı</h2><div className={styles.chartActions}><label className={styles.description} htmlFor="pine-doctor">Genel ilgilenen doktor</label><select id="pine-doctor" className={styles.select} value={p.defaultDoctor || ''} onChange={event => {
          const nextDoctorId = event.target.value || null
          p.setDefaultDoctor(nextDoctorId)
          p.setDrafts((previous: any) => Object.fromEntries(
            Object.entries(previous).map(([target, items]) => [
              target,
              (items as any[]).map(item => item.locked ? item : { ...item, doctorId: nextDoctorId }),
            ])
          ))
        }}><option value="">Seçiniz</option>{p.doctors.map((doctor: any) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></div></div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <colgroup><col style={{ width: '4%' }} /><col style={{ width: '21%' }} /><col style={{ width: '20%' }} /><col style={{ width: '19%' }} /><col style={{ width: '20%' }} /><col style={{ width: '12%' }} /><col style={{ width: '4%' }} /></colgroup>
              <thead><tr><th>Diş</th><th>Endikasyonlar</th><th>Tedavi</th><th>Hekim</th><th>Fiyat (₺)</th><th>Tutar (₺)</th><th aria-label="İşlemler" /></tr></thead>
              <tbody>{rows.map(({ target, item }) => <tr key={`${target}-${item.id}`}>
                <td className={styles.toothId}>{/^[1-4][1-8]$/.test(target) ? <button type="button" className={styles.toothDetailLink} onClick={() => p.setDetailTooth(target)} aria-label={`${target} diş detayları`}>{target}</button> : targetName(target)}</td>
                <td><div className={styles.indicationChips}>
                  {item.indications.map((indication: string) => <span className={styles.indicationChip} key={indication}>{indication}{!item.locked && <button type="button" aria-label={`${indication} endikasyonunu kaldır`} onClick={() => updateRow(target, item.id, row => ({ ...row, indications: row.indications.filter((value: string) => value !== indication) }))}>×</button>}</span>)}
                  {!item.locked && <select className={styles.addIndication} aria-label={`${targetName(target)} endikasyon ekle`} value="" onChange={event => { const value = event.target.value; if (value && !item.indications.includes(value)) updateRow(target, item.id, row => ({ ...row, indications: [...row.indications, value] })) }}><option value="">+</option>{p.indications.map((value: string) => <option key={p.indicationIds[value] || value} value={value}>{value}</option>)}</select>}
                </div></td>
                <td>{item.locked ? item.name : <select className={styles.cellSelect} title={item.name} aria-label={`${targetName(target)} tedavi`} value={item.procedureId || ''} onChange={event => { const replacement = p.procedures.find((value: any) => value.id === event.target.value); if (!replacement || replacement.id === item.procedureId) return; updateRow(target, item.id, row => ({ ...row, name: replacement.name, procedureId: replacement.id, scope: replacement.scope, price: replacement.price, materials: (replacement.materials || []).map((value: any) => ({ ...value })) })) }}><option value={p.procedures.some((value: any) => value.id === item.procedureId) ? '' : item.procedureId || ''}>{item.name}</option>{p.procedures.filter((value: any) => (value.scope || 'tooth') === (item.scope || 'tooth')).map((value: any) => <option key={value.id} value={value.id}>{value.name}</option>)}</select>}</td>
                <td><select className={styles.cellSelect} title={p.doctors.find((doctor: any) => doctor.id === item.doctorId)?.name || "Hekim seçin"} aria-label={`${targetName(target)} hekim`} disabled={item.locked} value={item.doctorId || ''} onChange={event => updateRow(target, item.id, row => ({ ...row, doctorId: event.target.value || null }))}><option value="">Seçiniz</option>{p.doctors.map((doctor: any) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></td>
                <td><input className={styles.moneyInput} aria-label={`${targetName(target)} işlem fiyatı`} disabled={item.locked} type="number" min="0" step="0.01" value={item.price} onChange={event => updateRow(target, item.id, row => ({ ...row, price: Number(event.target.value) }))} /><button type="button" className={styles.materialLink} disabled={item.locked && !item.materials.length} title={item.materials.map((material: any) => `${material.name} ${material.quantity} adet`).join(', ')} onClick={() => setMaterialRow({ target, id: item.id })}>{item.materials.length ? `Malzeme: ${item.materials.map((material: any) => `${material.name} ${material.quantity} adet +${money(Number(material.quantity) * Number(material.unitSalePriceMinor || 0))}`).join(', ')}` : item.locked ? 'Malzeme yok' : '+ Malzeme ekle'}</button></td>
                <td className={styles.rowTotal}>{money(Math.round(item.price * 100) + item.materials.reduce((sum: number, material: any) => sum + Number(material.quantity) * Number(material.unitSalePriceMinor || 0), 0))}</td>
                <td><button type="button" className={styles.rowDelete} disabled={item.locked} aria-label={`${targetName(target)} ${item.name} kaldır`} onClick={() => p.setDrafts((previous: any) => ({ ...previous, [target]: previous[target].filter((row: any) => row.id !== item.id) }))}><Trash2 size={15} /></button></td>
              </tr>)}</tbody>
            </table>
            {!rows.length && <div className={styles.empty}>Henüz plan öğesi eklenmedi.</div>}
          </div>
          <div className={styles.summary}><div className={styles.sumcard}><div className={styles.sumline}><span>Ara Toplam</span><strong>{p.pricing ? money(p.pricing.subtotalMinor) : '—'}</strong></div><div className={styles.sumline}><label htmlFor="pine-discount">İskonto (%)</label><span className={styles.sumValue}><input id="pine-discount" className={styles.input} type="number" min="0" max="100" step="0.01" value={p.discount} onChange={event => p.setDiscount(Number(event.target.value))} /> % <strong>{p.pricing ? `−${money(p.pricing.percentageDiscountMinor)}` : '—'}</strong></span></div><div className={styles.sumline}><label htmlFor="pine-fixed">Manuel iskonto</label><span className={styles.sumValue}><input id="pine-fixed" className={styles.input} type="number" min="0" step="0.01" value={p.discountFixed} onChange={event => p.setDiscountFixed(Number(event.target.value))} /> ₺ <strong>{p.pricing ? `−${money(p.pricing.fixedDiscountMinor)}` : '—'}</strong></span></div>{!p.pricing && <span role="alert">Fiyat veya iskonto geçersiz.</span>}</div><div className={styles.totalcard}><svg className={styles.totalWave} viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden="true"><path fill="var(--pc-total-wave-1)" d="M115 120C170 112 204 62 252 44C282 33 304 16 320 0V120H115Z" /><path fill="var(--pc-total-wave-2)" d="M176 120C216 116 242 92 276 78C296 70 310 58 320 42V120H176Z" /></svg><span>Genel Toplam</span><strong>{p.pricing ? money(p.pricing.totalMinor) : '—'}</strong></div></div>
          <div className={styles.actions}><button type="button" className={styles.button} onClick={p.print}><Printer size={15} /> Yazdır</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={p.saving} onClick={() => p.save()}><Save size={15} /> {p.saving ? 'Kaydediliyor…' : 'Planı Kaydet'}</button></div>
        </section>
      </div>
    </main>
    <PlanToothTools {...p} openMaterials={setMaterialRow} />
    {historyOpen && <PlanHistoryDialog patientId={p.event.patientId} entries={p.consultations} onChange={p.setConsultations} onClose={() => setHistoryOpen(false)} />}
    {reminderOpen && <PlanDialog title="Periyodik hatırlatma" onClose={() => setReminderOpen(false)}><p className={styles.dialogDescription}>Hatırlatmalar, hastanın izin verdiği ve bu planda seçtiğiniz kanallardan gönderilir.</p><label className={styles.inlineCheck}><input type="checkbox" checked={p.periodic} onChange={event => p.setPeriodic(event.target.checked)} />Periyodik kontrolü hatırlat</label><label htmlFor="reminder-days">Kontrol aralığı (gün)</label><input id="reminder-days" className={styles.input} type="number" min="1" max="3650" disabled={!p.periodic} value={p.periodDays} onChange={event => p.setPeriodDays(Number(event.target.value))} /><div className={styles.actions}><button type="button" className={styles.button} onClick={() => setReminderOpen(false)}>Bitti</button></div></PlanDialog>}
    {p.showClose && <div role="dialog" aria-modal="true" aria-labelledby="pine-unsaved" className={styles.dialogOverlay}><div className={styles.dialog}><h3 id="pine-unsaved">Kaydedilmemiş değişiklikler</h3><p>Planı kapatmadan önce değişikliklerinizi kaydedebilirsiniz.</p><div className={styles.actions}><button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => { p.setShowClose(false); p.save({ closeAfter: true, allowEmpty: true }) }}>Kaydet</button><button type="button" className={styles.button} onClick={p.discard}>Değişiklikleri bırak</button><button type="button" autoFocus className={styles.button} onClick={() => p.setShowClose(false)}>Devam et</button></div></div></div>}
    {materialRow && materialItem && <div role="dialog" aria-modal="true" aria-label="Satır malzemeleri" className={styles.dialogOverlay}><div className={styles.dialog}><h3>Satır malzemeleri · {materialItem.name}</h3>{materialItem.materials.map((item: any, index: number) => <div className={styles.materialLine} key={`${item.inventoryItemId}-${index}`}><span>{item.name}</span><input className={styles.input} style={{ width: 65 }} aria-label={`${item.name} miktarı`} disabled={materialItem.locked} type="number" min="1" value={item.quantity} onChange={event => updateRow(materialRow.target, materialRow.id, row => ({ ...row, materials: row.materials.map((value: any, i: number) => i === index ? { ...value, quantity: Number(event.target.value) } : value) }))} /><input className={styles.input} style={{ width: 80 }} aria-label={`${item.name} satış fiyatı`} disabled={materialItem.locked} type="number" min="0" step="0.01" value={(item.unitSalePriceMinor || 0) / 100} onChange={event => updateRow(materialRow.target, materialRow.id, row => ({ ...row, materials: row.materials.map((value: any, i: number) => i === index ? { ...value, unitSalePriceMinor: Math.round(Number(event.target.value) * 100) } : value) }))} /><button type="button" className={styles.button} disabled={materialItem.locked} onClick={() => updateRow(materialRow.target, materialRow.id, row => ({ ...row, materials: row.materials.filter((_: any, i: number) => i !== index) }))}>Kaldır</button></div>)}<label htmlFor="pine-row-material">Malzeme ekle</label><select id="pine-row-material" className={styles.select} disabled={materialItem.locked} value="" onChange={event => { const item = p.inventory.find((value: any) => value.id === event.target.value); if (item && !materialItem.materials.some((value: any) => value.inventoryItemId === item.id)) updateRow(materialRow.target, materialRow.id, row => ({ ...row, materials: [...row.materials, { inventoryItemId: item.id, name: item.name, quantity: 1, unitCost: item.costPerUnit, unitSalePriceMinor: 0 }] })) }}><option value="">Malzeme seçin</option>{p.inventory.map((item: any) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><div className={styles.actions}><button type="button" className={styles.button} onClick={() => setMaterialRow(null)}>Kapat</button></div></div></div>}
  </div></div>
}
