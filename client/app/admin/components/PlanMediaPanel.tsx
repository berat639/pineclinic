import React, { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'react-hot-toast'
import { FolderOpen, MonitorPlay, Trash2 } from 'lucide-react'
import DicomViewer, { isValidDcmFileName } from './DicomViewer'
import { inputStyle } from './ToothChip'
import styles from './PineTreatmentPlan.module.css'

const DentalCprViewerModal = dynamic(() => import('./cbct/DentalCprViewerModal'), { ssr: false })
export type PlanAttachment = { id: string; kind: 'photo' | 'radiology' | 'cbct'; totalBytes: number }
type FileInfo = { fileIndex: number; name: string; contentType: string; sizeBytes: number; uploadedBytes: number }
type UploadJob = { kind: PlanAttachment['kind']; files: File[]; requestKey: string; id?: string; replaceIds?: string[] }
const CHUNK = 8 * 1024 * 1024
const kinds = [
  { id: 'radiology', label: '2B Radyoloji', description: 'Panoramik ve periapikal · Sadece DICOM (.dcm)', image: 'radiology.jpg', accept: '.dcm', multiple: false },
  { id: 'cbct', label: '3B CBCT / DICOM', description: 'Kesitler ve 3B görüntüleme', image: 'cbct.jpg', accept: '.dcm,.dicom', multiple: true },
  { id: 'photo', label: 'Klinik Fotoğraflar', description: 'Ağız içi, ağız dışı ve tedavi görselleri', image: 'photos.jpg', accept: '.jpg,.jpeg,.png', multiple: true },
] as const

export default function PlanMediaPanel({
  patientId,
  groupId,
  attachments,
  onChange,
  onUploadingChange,
  onAttachmentSaved,
  onEnsurePatient,
}: {
  patientId?: string | null
  groupId?: string | null
  attachments: PlanAttachment[]
  onChange: (items: PlanAttachment[]) => void
  onUploadingChange: (value: boolean) => void
  onAttachmentSaved?: (items: PlanAttachment[], uploaded?: PlanAttachment) => void
  onEnsurePatient?: () => Promise<string | null>
}) {
  const [resolvedPid, setResolvedPid] = useState<string>(patientId && patientId !== 'null' ? patientId : '')
  useEffect(() => {
    if (patientId && patientId !== 'null') setResolvedPid(patientId)
  }, [patientId])
  const [job, setJob] = useState<UploadJob | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [openPhotoAttachment, setOpenPhotoAttachment] = useState<{ attachment: PlanAttachment; files: FileInfo[]; active: number } | null>(null)
  const [activeDicom, setActiveDicom] = useState<{
    file: File | null
    dcmUrl: string | null
    fileName: string
    attachmentId?: string
    saved: boolean
  } | null>(null)
  const [cbctViewer, setCbctViewer] = useState<{ initialFiles: File[] | null } | null>(null)
  const [opening, setOpening] = useState(false)
  const uploadAbort = useRef<AbortController | null>(null)
  const uploadBusy = useRef(false)
  const mounted = useRef(true)
  const attachmentsRef = useRef<PlanAttachment[]>(attachments)
  const groupIdRef = useRef<string | null | undefined>(groupId)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    groupIdRef.current = groupId
  }, [groupId])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; uploadAbort.current?.abort() }
  }, [])

  const activePid = (patientId && patientId !== 'null' ? patientId : resolvedPid) || ''
  const baseFor = (pid: string) => `/api/dental/patients/${encodeURIComponent(pid)}/attachments`
  const base = activePid ? baseFor(activePid) : ''
  const fileUrl = (id: string, index: number, pid = activePid) => `${baseFor(pid)}/${id}/files/${index}`
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
      let targetPid = activePid
      if (!targetPid && onEnsurePatient) {
        const ensured = await onEnsurePatient()
        if (ensured && ensured !== 'null') {
          targetPid = ensured
          setResolvedPid(ensured)
        }
      }
      if (!targetPid) throw new Error('Hasta kaydı doğrulanamadı.')
      const targetBase = baseFor(targetPid)
      let state = current.id
        ? await json(await fetch(`${targetBase}/${current.id}`, { signal: controller.signal }))
        : await json(
          await fetch(targetBase, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              kind: current.kind,
              requestKey: current.requestKey,
              groupId: groupIdRef.current || undefined,
              files: current.files.map((file) => ({ name: file.name, size: file.size })),
            }),
          })
        )
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
            const response = await fetch(`${fileUrl(id, index, targetPid)}?offset=${offset}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: file.slice(offset, offset + CHUNK),
              signal: controller.signal,
            })
            const result = await json(response)
            if (!Number.isSafeInteger(result.uploadedBytes) || result.uploadedBytes <= offset || result.uploadedBytes > file.size) {
              throw new Error('Yükleme konumu doğrulanamadı.')
            }
            offset = result.uploadedBytes
            setProgress(Math.round((finishedBytes + offset) / total * 100))
          }
          finishedBytes += file.size
        }
        state = await json(
          await fetch(`${targetBase}/${id}/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: groupIdRef.current || undefined }),
            signal: controller.signal,
          })
        )
      }
      if (!mounted.current) return
      const replaceSet = new Set(current.replaceIds || [])
      if (replaceSet.size > 0) {
        for (const oldId of replaceSet) {
          if (oldId !== id) {
            void fetch(`${targetBase}/${oldId}`, { method: 'DELETE' }).catch(() => { })
          }
        }
      }
      const uploadedItem: PlanAttachment = { id, kind: current.kind, totalBytes: state.totalBytes }
      const nextAttachments = [
        ...attachmentsRef.current.filter((item) => item.id !== id && !replaceSet.has(item.id)),
        uploadedItem,
      ]
      attachmentsRef.current = nextAttachments
      onChange(nextAttachments)
      if (current.kind === 'radiology') {
        setActiveDicom((prev) =>
          prev
            ? { ...prev, attachmentId: id, saved: true }
            : { file: current.files[0] || null, dcmUrl: fileUrl(id, 0, targetPid), fileName: current.files[0]?.name || 'görüntü.dcm', attachmentId: id, saved: true }
        )
      }
      completed = true
      setJob(null)
      setProgress(100)
      setUploading(false)
      onUploadingChange(false)
      onAttachmentSaved?.(nextAttachments, uploadedItem)
      toast.success(current.kind === 'radiology' ? '2B DICOM görüntüsü yüklendi ve kaydedildi.' : 'Görüntüler yüklendi ve kaydedildi.')
    } catch (reason) {
      if (mounted.current) {
        toast.error(
          reason instanceof Error && reason.name === 'AbortError'
            ? 'Yükleme durduruldu; devam edebilirsiniz.'
            : reason instanceof Error
              ? reason.message
              : 'Yükleme tamamlanamadı.'
        )
      }
    } finally {
      uploadBusy.current = false
      uploadAbort.current = null
      if (mounted.current) {
        setUploading(false)
        onUploadingChange(!completed && Boolean(job))
      }
    }
  }

  function choose(kind: PlanAttachment['kind'], files: FileList | File[] | null) {
    const list = files ? Array.from(files) : []
    if (!list.length || uploadBusy.current) return
    if (kind === 'radiology') {
      if (list.some((file) => !isValidDcmFileName(file.name))) {
        toast.error('2B Radyoloji için yalnızca .dcm uzantılı DICOM dosyası seçebilirsiniz.')
        return
      }
      const chosenFile = list[0]
      const existingRadiologyIds = attachmentsRef.current.filter((item) => item.kind === 'radiology').map((item) => item.id)
      // Dosya seçildiği anda doğrudan Sunum Modu açılır
      setActiveDicom({
        file: chosenFile,
        dcmUrl: null,
        fileName: chosenFile.name,
        attachmentId: undefined,
        saved: false,
      })
      const next: UploadJob = {
        kind: 'radiology',
        files: [chosenFile],
        requestKey: crypto.randomUUID(),
        replaceIds: existingRadiologyIds,
      }
      setJob(next)
      setProgress(0)
      void runUpload(next)
      return
    }
    const next: UploadJob = { kind, files: list, requestKey: crypto.randomUUID() }
    setJob(next)
    setProgress(0)
    void runUpload(next)
  }

  async function removeAttachment(attachmentId: string) {
    if (uploading) return
    const nextAttachments = attachmentsRef.current.filter((item) => item.id !== attachmentId)
    attachmentsRef.current = nextAttachments
    onChange(nextAttachments)
    onAttachmentSaved?.(nextAttachments)
    if (activeDicom?.attachmentId === attachmentId) {
      setActiveDicom(null)
    }
    try {
      await fetch(`${base}/${attachmentId}`, { method: 'DELETE' })
    } catch {
      // ignore network error on cleanup
    }
  }

  async function openFile(attachment: PlanAttachment) {
    if (opening) return
    if (attachment.kind === 'radiology') {
      // 2B DICOM doğrudan Sunum Modunda açılır
      setActiveDicom({
        file: null,
        dcmUrl: fileUrl(attachment.id, 0),
        fileName: 'görüntü.dcm',
        attachmentId: attachment.id,
        saved: true,
      })
      void fetch(`${base}/${attachment.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((detail) => {
          const firstName = detail?.files?.[0]?.name
          if (firstName && mounted.current) {
            setActiveDicom((prev) => (prev && prev.attachmentId === attachment.id ? { ...prev, fileName: firstName } : prev))
          }
        })
        .catch(() => { })
      return
    }
    setOpening(true)
    try {
      const detail = await json(await fetch(`${base}/${attachment.id}`))
      const files: FileInfo[] = detail.files
      if (!files.length) throw new Error('Görüntü bulunamadı.')
      if (attachment.kind !== 'cbct') {
        if (files[0].contentType === 'application/dicom') {
          setActiveDicom({
            file: null,
            dcmUrl: fileUrl(attachment.id, files[0].fileIndex),
            fileName: files[0].name,
            attachmentId: attachment.id,
            saved: true,
          })
          return
        }
        setOpenPhotoAttachment({ attachment, files, active: 0 })
        return
      }
      const loaded: File[] = new Array(files.length)
      let next = 0
      await Promise.all(
        Array.from({ length: Math.min(4, files.length) }, async () => {
          while (next < files.length) {
            const index = next++
            const response = await fetch(fileUrl(attachment.id, files[index].fileIndex))
            if (!response.ok) throw new Error('CBCT serisindeki bir dosya yüklenemedi.')
            loaded[index] = new File([await response.blob()], files[index].name, { type: files[index].contentType })
          }
        })
      )
      setCbctViewer({ initialFiles: loaded })
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Görüntü açılamadı.')
    } finally {
      setOpening(false)
    }
  }

  const savedRadiology = attachments.find((item) => item.kind === 'radiology')

  return (
    <section className={`${styles.section} ${styles.mediaPanel}`} aria-label="Plan görüntüleri">
      <div className={styles.sectionHeading}>
        <span className={styles.step}>1</span>
        <h2>Görüntüleri yükle ve incele</h2>
        <span className={styles.description}>Radyoloji, fotoğraf ve tedavi ile ilgili tüm görselleri inceleyin.</span>
      </div>
      <div className={styles.mediaGrid}>
        {kinds.map((kind) => (
          <div key={kind.id} className={styles.mediaCard}>
            <div className={styles.mediaImage}>
              <img src={`/treatment-planning/${kind.image}`} alt="" />
            </div>
            <div className={styles.mediaInfo}>
              <strong>{kind.label}</strong>
              <p>{kind.description}</p>
              {kind.id === 'cbct' ? (
                <button
                  type="button"
                  className={`${styles.button} ${styles.pale}`}
                  aria-label="3B CBCT görüntüleyicisini aç"
                  onClick={() => setCbctViewer({ initialFiles: null })}
                >
                  <FolderOpen size={13} /> Görüntülemeye Git
                </button>
              ) : kind.id === 'radiology' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {savedRadiology && (
                    <button
                      type="button"
                      className={`${styles.button} ${styles.primary}`}
                      disabled={opening}
                      onClick={() => void openFile(savedRadiology)}
                    >
                      <MonitorPlay size={13} />
                      <span>Sunum Modunda Aç</span>
                    </button>
                  )}
                  <label className={`${styles.button} ${styles.pale}`}>
                    <FolderOpen size={13} />
                    <span>{savedRadiology ? 'Değiştir (.dcm)' : 'Dosya Seç (.dcm)'}</span>
                    <input
                      className={styles.fileInput}
                      type="file"
                      aria-label={`${kind.label} dosyası seç`}
                      accept=".dcm"
                      multiple={false}
                      disabled={uploading}
                      onChange={(event) => {
                        choose('radiology', event.target.files)
                        event.target.value = ''
                      }}
                    />
                  </label>
                </div>
              ) : (
                <label className={`${styles.button} ${styles.pale}`}>
                  <FolderOpen size={13} />
                  <span>Dosya Seç</span>
                  <input
                    className={styles.fileInput}
                    type="file"
                    aria-label={`${kind.label} dosyası seç`}
                    accept={kind.accept}
                    multiple={kind.multiple}
                    disabled={uploading}
                    onChange={(event) => {
                      choose(kind.id, event.target.files)
                      event.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        ))}
      </div>
      {job && (
        <div role="status" style={{ marginTop: 8 }}>
          Yükleme: %{progress}{' '}
          {uploading ? (
            <button type="button" onClick={() => uploadAbort.current?.abort()} style={{ ...inputStyle, marginLeft: 8 }}>
              Durdur
            </button>
          ) : (
            <>
              <button type="button" onClick={() => void runUpload(job)} style={{ ...inputStyle, marginLeft: 8 }}>
                Devam et
              </button>
              <button
                type="button"
                onClick={() => {
                  setJob(null)
                  onUploadingChange(false)
                }}
                style={{ ...inputStyle, marginLeft: 8 }}
              >
                Yüklemeyi iptal et
              </button>
            </>
          )}
        </div>
      )}
      {attachments.length > 0 && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 20 }}>
          {attachments.map((attachment) => (
            <li key={attachment.id} style={{ marginTop: 5 }}>
              {kinds.find((kind) => kind.id === attachment.kind)?.label} · {(attachment.totalBytes / 1024 / 1024).toFixed(1)} MiB{' '}
              <button
                type="button"
                disabled={opening}
                onClick={() => void openFile(attachment)}
                style={{ ...inputStyle, padding: '4px 8px' }}
              >
                {attachment.kind === 'radiology' ? 'Sunum Modunda Aç' : 'Aç'}
              </button>{' '}
              <button
                type="button"
                disabled={uploading}
                onClick={() => void removeAttachment(attachment.id)}
                style={{ ...inputStyle, padding: '4px 8px' }}
              >
                Plandan kaldır
              </button>
            </li>
          ))}
        </ul>
      )}
      {activeDicom && (
        <DicomViewer
          isModal={true}
          defaultPresentationMode={true}
          file={activeDicom.file}
          dcmUrl={activeDicom.file ? null : activeDicom.dcmUrl}
          fileName={activeDicom.fileName}
          uploading={uploading && job?.kind === 'radiology'}
          uploadProgress={progress}
          saved={activeDicom.saved}
          onFileChange={(nextFile) => {
            if (nextFile) choose('radiology', [nextFile])
          }}
          onFileClear={
            activeDicom.attachmentId
              ? () => {
                const idToRemove = activeDicom.attachmentId!
                setActiveDicom(null)
                void removeAttachment(idToRemove)
              }
              : () => setActiveDicom(null)
          }
          onClose={() => setActiveDicom(null)}
        />
      )}
      {openPhotoAttachment && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Plan görüntüsü"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100004,
            background: 'var(--background)',
            color: 'var(--foreground)',
            padding: 20,
            overflow: 'auto',
          }}
        >
          <button type="button" onClick={() => setOpenPhotoAttachment(null)} style={{ ...inputStyle, marginBottom: 10 }}>
            Kapat
          </button>
          <img
            alt={openPhotoAttachment.files[openPhotoAttachment.active].name}
            src={fileUrl(openPhotoAttachment.attachment.id, openPhotoAttachment.files[openPhotoAttachment.active].fileIndex)}
            style={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', background: 'var(--input-bg)' }}
          />
          {openPhotoAttachment.files.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                disabled={openPhotoAttachment.active === 0}
                onClick={() => setOpenPhotoAttachment({ ...openPhotoAttachment, active: openPhotoAttachment.active - 1 })}
                style={inputStyle}
              >
                Önceki
              </button>
              <span>
                {openPhotoAttachment.active + 1} / {openPhotoAttachment.files.length}
              </span>
              <button
                type="button"
                disabled={openPhotoAttachment.active === openPhotoAttachment.files.length - 1}
                onClick={() => setOpenPhotoAttachment({ ...openPhotoAttachment, active: openPhotoAttachment.active + 1 })}
                style={inputStyle}
              >
                Sonraki
              </button>
            </div>
          )}
        </div>
      )}
      {cbctViewer && <DentalCprViewerModal initialFiles={cbctViewer.initialFiles} onClose={() => setCbctViewer(null)} />}
    </section>
  )
}
