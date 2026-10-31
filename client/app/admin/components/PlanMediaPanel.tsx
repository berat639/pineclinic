import React, { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'react-hot-toast'
import { FolderOpen } from 'lucide-react'
import DicomViewer from './DicomViewer'
import { inputStyle } from './ToothChip'
import styles from './PineTreatmentPlan.module.css'

const DentalCprViewerModal = dynamic(() => import('./cbct/DentalCprViewerModal'), { ssr: false })
export type PlanAttachment = { id: string; kind: 'photo' | 'radiology' | 'cbct'; totalBytes: number }
type FileInfo = { fileIndex: number; name: string; contentType: string; sizeBytes: number; uploadedBytes: number }
type UploadJob = { kind: PlanAttachment['kind']; files: File[]; requestKey: string; id?: string }
const CHUNK = 8 * 1024 * 1024
const kinds = [{ id: 'radiology', label: '2B Radyoloji', description: 'Panoramik, periapikal, JPG / PNG / DICOM', image: 'radiology.jpg', accept: '.jpg,.jpeg,.png,.dcm,.dicom', multiple: false },
  { id: 'cbct', label: '3B CBCT / DICOM', description: 'Kesitler ve 3B görüntüleme', image: 'cbct.jpg', accept: '.dcm,.dicom', multiple: true },
  { id: 'photo', label: 'Klinik Fotoğraflar', description: 'Ağız içi, ağız dışı ve tedavi görselleri', image: 'photos.jpg', accept: '.jpg,.jpeg,.png', multiple: true }] as const

export default function PlanMediaPanel({ patientId, attachments, onChange, onUploadingChange }: {
  patientId: string; attachments: PlanAttachment[]; onChange: (items: PlanAttachment[]) => void; onUploadingChange: (value: boolean) => void
}) {
  const [job, setJob] = useState<UploadJob | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [openAttachment, setOpenAttachment] = useState<{ attachment: PlanAttachment; files: FileInfo[]; active: number } | null>(null)
  const [cbctViewer, setCbctViewer] = useState<{ initialFiles: File[] | null } | null>(null)
  const [opening, setOpening] = useState(false)
  const uploadAbort = useRef<AbortController | null>(null)
  const uploadBusy = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; uploadAbort.current?.abort() }
  }, [])

  const base = `/api/dental/patients/${encodeURIComponent(patientId)}/attachments`
  const fileUrl = (id: string, index: number) => `${base}/${id}/files/${index}`
  async function json(response: Response) {
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Dosya işlemi tamamlanamadı.')
    return result
  }

  async function runUpload(current: UploadJob) {
    if (uploadBusy.current) return
    uploadBusy.current = true; setUploading(true); onUploadingChange(true)
    const controller = new AbortController(); uploadAbort.current = controller
    let completed = false
    try {
      let state = current.id ? await json(await fetch(`${base}/${current.id}`, { signal: controller.signal })) : await json(await fetch(base, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ kind: current.kind, requestKey: current.requestKey, files: current.files.map(file => ({ name: file.name, size: file.size })) }),
      }))
      const id: string = state.id
      if (!current.id) { current = { ...current, id }; setJob(current) }
      if (state.status !== 'complete') {
        const total = current.files.reduce((sum, file) => sum + file.size, 0)
        let finishedBytes = 0
        for (let index = 0; index < current.files.length; index++) {
          const file = current.files[index]
          let offset = Number(state.files[index]?.uploadedBytes || 0)
          if (offset > file.size) throw new Error('Yükleme konumu geçersiz.')
          setProgress(Math.round((finishedBytes + offset) / total * 100))
          while (offset < file.size) {
            const response = await fetch(`${fileUrl(id, index)}?offset=${offset}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file.slice(offset, offset + CHUNK), signal: controller.signal })
            const result = await json(response)
            if (!Number.isSafeInteger(result.uploadedBytes) || result.uploadedBytes <= offset || result.uploadedBytes > file.size) throw new Error('Yükleme konumu doğrulanamadı.')
            offset = result.uploadedBytes
            setProgress(Math.round((finishedBytes + offset) / total * 100))
          }
          finishedBytes += file.size
        }
        state = await json(await fetch(`${base}/${id}/finish`, { method: 'POST', signal: controller.signal }))
      }
      if (!mounted.current) return
      onChange([...attachments.filter(item => item.id !== id), { id, kind: current.kind, totalBytes: state.totalBytes }])
      completed = true; setJob(null); setProgress(100); toast.success('Görüntüler yüklendi. Plan kaydedildiğinde plana bağlanacak.')
    } catch (reason) {
      if (mounted.current) toast.error(reason instanceof Error && reason.name === 'AbortError' ? 'Yükleme durduruldu; devam edebilirsiniz.' : reason instanceof Error ? reason.message : 'Yükleme tamamlanamadı.')
    } finally {
      uploadBusy.current = false; uploadAbort.current = null
      if (mounted.current) { setUploading(false); onUploadingChange(!completed) }
    }
  }

  function choose(kind: PlanAttachment['kind'], files: FileList | null) {
    if (!files?.length || uploadBusy.current) return
    const next = { kind, files: Array.from(files), requestKey: crypto.randomUUID() }
    setJob(next); setProgress(0); void runUpload(next)
  }

  async function openFile(attachment: PlanAttachment) {
    if (opening) return
    setOpening(true)
    try {
      const detail = await json(await fetch(`${base}/${attachment.id}`))
      const files: FileInfo[] = detail.files
      if (!files.length) throw new Error('Görüntü bulunamadı.')
      if (attachment.kind !== 'cbct') { setOpenAttachment({ attachment, files, active: 0 }); return }
      const loaded: File[] = new Array(files.length)
      let next = 0
      // A limited number of downloads prevents a large CBCT series from
      // opening thousands of simultaneous requests.
      await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
        while (next < files.length) {
          const index = next++
          const response = await fetch(fileUrl(attachment.id, files[index].fileIndex))
          if (!response.ok) throw new Error('CBCT serisindeki bir dosya yüklenemedi.')
          loaded[index] = new File([await response.blob()], files[index].name, { type: files[index].contentType })
        }
      }))
      setCbctViewer({ initialFiles: loaded })
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Görüntü açılamadı.') }
    finally { setOpening(false) }
  }

  return <section className={`${styles.section} ${styles.mediaPanel}`} aria-label="Plan görüntüleri">
    <div className={styles.sectionHeading}><span className={styles.step}>1</span><h2>Görüntüleri yükle ve incele</h2><span className={styles.description}>Radyoloji, fotoğraf ve tedavi ile ilgili tüm görselleri inceleyin.</span></div>
    <div className={styles.mediaGrid}>
      {kinds.map(kind => <div key={kind.id} className={styles.mediaCard}>
        <div className={styles.mediaImage}><img src={`/treatment-planning/${kind.image}`} alt="" /></div>
        <div className={styles.mediaInfo}><strong>{kind.label}</strong><p>{kind.description}</p>
        {kind.id === 'cbct' ? <button type="button" className={`${styles.button} ${styles.pale}`} aria-label="3B CBCT görüntüleyicisini aç" onClick={() => setCbctViewer({ initialFiles: null })}><FolderOpen size={13} /> Görüntülemeye Git</button> : <label className={`${styles.button} ${styles.pale}`}><FolderOpen size={13} /><span>Dosya Seç</span>
          <input className={styles.fileInput} type="file" aria-label={`${kind.label} dosyası seç`} accept={kind.accept} multiple={kind.multiple} disabled={uploading} onChange={event => { choose(kind.id, event.target.files); event.target.value = '' }} />
        </label>}</div>
      </div>)}
    </div>
    {job && <div role="status" style={{ marginTop: 8 }}>
      Yükleme: %{progress} {uploading ? <button type="button" onClick={() => uploadAbort.current?.abort()} style={{ ...inputStyle, marginLeft: 8 }}>Durdur</button> : <><button type="button" onClick={() => void runUpload(job)} style={{ ...inputStyle, marginLeft: 8 }}>Devam et</button><button type="button" onClick={() => { setJob(null); onUploadingChange(false) }} style={{ ...inputStyle, marginLeft: 8 }}>Yüklemeyi iptal et</button></>}
    </div>}
    {attachments.length > 0 && <ul style={{ margin: '10px 0 0', paddingLeft: 20 }}>
      {attachments.map(attachment => <li key={attachment.id} style={{ marginTop: 5 }}>
        {kinds.find(kind => kind.id === attachment.kind)?.label} · {(attachment.totalBytes / 1024 / 1024).toFixed(1)} MiB{' '}
        <button type="button" disabled={opening} onClick={() => void openFile(attachment)} style={{ ...inputStyle, padding: '4px 8px' }}>Aç</button>{' '}
        <button type="button" disabled={uploading} onClick={() => onChange(attachments.filter(item => item.id !== attachment.id))} style={{ ...inputStyle, padding: '4px 8px' }}>Plandan kaldır</button>
      </li>)}
    </ul>}
    {openAttachment && <div role="dialog" aria-modal="true" aria-label="Plan görüntüsü" style={{ position: 'fixed', inset: 0, zIndex: 100004, background: 'var(--background)', color: 'var(--foreground)', padding: 20, overflow: 'auto' }}>
      <button type="button" onClick={() => setOpenAttachment(null)} style={{ ...inputStyle, marginBottom: 10 }}>Kapat</button>
      {openAttachment.files[openAttachment.active].contentType === 'application/dicom'
        ? <DicomViewer dcmUrl={fileUrl(openAttachment.attachment.id, openAttachment.files[openAttachment.active].fileIndex)} />
        : <img alt={openAttachment.files[openAttachment.active].name} src={fileUrl(openAttachment.attachment.id, openAttachment.files[openAttachment.active].fileIndex)} style={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', background: 'var(--input-bg)' }} />}
      {openAttachment.files.length > 1 && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" disabled={openAttachment.active === 0} onClick={() => setOpenAttachment({ ...openAttachment, active: openAttachment.active - 1 })} style={inputStyle}>Önceki</button>
        <span>{openAttachment.active + 1} / {openAttachment.files.length}</span>
        <button type="button" disabled={openAttachment.active === openAttachment.files.length - 1} onClick={() => setOpenAttachment({ ...openAttachment, active: openAttachment.active + 1 })} style={inputStyle}>Sonraki</button>
      </div>}
    </div>}
    {cbctViewer && <DentalCprViewerModal initialFiles={cbctViewer.initialFiles} onClose={() => setCbctViewer(null)} />}
  </section>
}
