'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Circle, Eraser, Hand, Info, Layers, MoveUpRight, Pencil, RotateCcw, Ruler, SlidersHorizontal, Square, SunMedium, Triangle, ZoomIn, FileUp, Trash2, CheckCircle2, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readDicomMetadata, type DicomMetadata } from './dicom/dicomMetadata'
import { getCornerstoneRuntime } from './dicom/cornerstoneRuntime'

interface DicomViewerProps {
  dcmUrl?: string | null
  file?: File | null
  fileName?: string | null
  uploading?: boolean
  uploadProgress?: number
  saved?: boolean
  defaultPresentationMode?: boolean
  onFileChange?: (file: File | null) => void
  onFileClear?: () => void
  onClose?: () => void
  isModal?: boolean
}
type ActiveTool = 'windowLevel' | 'pan' | 'zoom' | 'scroll' | 'length' | 'arrow' | 'angle' | 'rectangle' | 'ellipse' | 'freehand' | 'erase'

const toolLabels: Record<ActiveTool, string> = {
  windowLevel: 'Pencere / Seviye', pan: 'Kaydır', zoom: 'Yakınlaştır', scroll: 'Kesit Kaydır',
  length: 'Uzunluk', arrow: 'Ok', angle: 'Açı', rectangle: 'Dikdörtgen', ellipse: 'Oval', freehand: 'Serbest çizim', erase: 'Silgi',
}
const primaryTools: ActiveTool[] = ['windowLevel', 'pan', 'zoom', 'scroll']
const presentationTools: ActiveTool[] = ['length', 'arrow', 'angle', 'rectangle', 'ellipse', 'freehand', 'erase']
const toolIcons = {
  windowLevel: SunMedium, pan: Hand, zoom: ZoomIn, scroll: Layers,
  length: Ruler, arrow: MoveUpRight, angle: Triangle, rectangle: Square,
  ellipse: Circle, freehand: Pencil, erase: Eraser,
}

function ViewerToolButton({ tool, selected, presentation, onClick }: { tool: ActiveTool; selected: boolean; presentation: boolean; onClick: () => void }) {
  const Icon = toolIcons[tool]
  return (
    <button
      type="button"
      title={toolLabels[tool]}
      aria-label={toolLabels[tool]}
      onClick={onClick}
      style={{
        ...toolButtonStyle(selected),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: presentation ? 'column' : 'row',
        gap: presentation ? 3 : 5,
        minHeight: presentation ? 52 : undefined,
      }}
    >
      <Icon size={presentation ? 17 : 15} strokeWidth={2} />
      <span>{toolLabels[tool]}</span>
    </button>
  )
}

function describeDicomError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/pixel data|image pixel/i.test(message)) return 'Bu DICOM dosyasında görüntülenebilir Pixel Data bulunamadı.'
  if (/transfer syntax|decode|codec|jpeg/i.test(message)) return 'Bu DICOM sıkıştırma biçimi tarayıcıda çözümlenemedi.'
  if (/fetch|yüklenemedi|network/i.test(message)) return 'DICOM dosyası indirilemedi veya oturum yetkisi doğrulanamadı.'
  return message || 'DICOM görüntüsü açılırken beklenmeyen bir hata oluştu.'
}

function safeUnit(unit: unknown, fallback: string) {
  return typeof unit === 'string' && unit.trim() && !/unknown/i.test(unit) ? unit : fallback
}

function measurementTextLines(data: any, targetId: string) {
  const stats = data?.cachedStats?.[targetId]
  if (!stats || !Number.isFinite(stats.length)) return []
  return [`${Math.round(stats.length * 100) / 100} ${safeUnit(stats.unit, 'px')}`]
}

function roiTextLines(data: any, target: string | string[]) {
  const targetId = Array.isArray(target) ? target[0] : target
  const stats = targetId ? data?.cachedStats?.[targetId] : undefined
  if (!stats || !Number.isFinite(stats.area)) return []
  return [`Alan: ${Math.round(stats.area * 100) / 100} ${safeUnit(stats.areaUnit, 'px²')}`]
}

export function isValidDcmFileName(name: string): boolean {
  return typeof name === 'string' && name.toLocaleLowerCase('en-US').endsWith('.dcm')
}

export default function DicomViewer({
  dcmUrl,
  file: propFile,
  fileName,
  uploading = false,
  uploadProgress = 100,
  saved = false,
  defaultPresentationMode = true,
  onFileChange,
  onFileClear,
  onClose,
  isModal = false,
}: DicomViewerProps) {
  const reactId = useId().replace(/:/g, '')
  const viewportId = `dicom-2d-viewport-${reactId}`
  const renderingEngineId = `dicom-2d-engine-${reactId}`
  const toolGroupId = `dicom-2d-tools-${reactId}`
  const viewportElementRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sessionRef = useRef<any>(null)
  const [file, setFile] = useState<File | null>(propFile ?? null)
  const [metadata, setMetadata] = useState<DicomMetadata | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('windowLevel')
  const [isActive, setIsActive] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPresentationTools, setShowPresentationTools] = useState(true)
  const [isPresentationMode, setIsPresentationMode] = useState<boolean>(defaultPresentationMode || Boolean(propFile || dcmUrl))
  const [showMetadataInPresentation, setShowMetadataInPresentation] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (propFile !== undefined) {
      setFile(propFile)
      setError(null)
      if (propFile) {
        setIsPresentationMode(true)
        setShowPresentationTools(true)
      }
    }
  }, [propFile])

  const cleanup = useCallback(() => {
    const session = sessionRef.current
    if (!session) return
    session.resizeObserver?.disconnect()
    try { session.toolGroup?.removeViewports?.(renderingEngineId, viewportId) } catch { /* already removed */ }
    try { session.tools.ToolGroupManager.destroyToolGroup(toolGroupId) } catch { /* already removed */ }
    try { session.renderingEngine.disableElement(viewportId) } catch { /* already removed */ }
    try { session.renderingEngine.destroy() } catch { /* already removed */ }
    try { session.dicomImageLoader.wadouri.fileManager.remove(session.fileIndex) } catch { /* already removed */ }
    sessionRef.current = null
  }, [renderingEngineId, toolGroupId, viewportId])

  useEffect(() => cleanup, [cleanup])

  const closePresentation = useCallback(() => {
    if (onClose) {
      onClose()
    } else {
      setIsPresentationMode(false)
    }
  }, [onClose])

  useEffect(() => {
    if (!isPresentationMode || (!file && !isLoading && !error && !dcmUrl)) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closePresentation()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    const resizeTimer = window.setTimeout(() => {
      const engine = sessionRef.current?.renderingEngine
      if (engine) {
        engine.resize(true, true)
        engine.getViewport(viewportId)?.resetCamera()
        engine.getViewport(viewportId)?.render()
      }
    }, 0)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.clearTimeout(resizeTimer)
    }
  }, [isPresentationMode, file, isLoading, error, dcmUrl, closePresentation, viewportId])

  useEffect(() => {
    if (!dcmUrl) return
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    setIsPresentationMode(true)
    setShowPresentationTools(true)
    fetch(dcmUrl, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Dosya yüklenemedi')
        const blob = await response.blob()
        const resolvedName = fileName && isValidDcmFileName(fileName) ? fileName : 'görüntü.dcm'
        return new File([blob], resolvedName, { type: 'application/dicom' })
      })
      .then((nextFile) => {
        setFile(nextFile)
        setIsPresentationMode(true)
        setShowPresentationTools(true)
      })
      .catch((fetchError) => { if (fetchError.name !== 'AbortError') setError(describeDicomError(fetchError)) })
      .finally(() => setIsLoading(false))
    return () => controller.abort()
  }, [dcmUrl, fileName])

  useEffect(() => {
    if (!file || !viewportElementRef.current) return
    let disposed = false
    setIsLoading(true)
    setError(null)
    setMetadata(null)
    cleanup()

    const open = async () => {
      try {
        const [runtime, buffer] = await Promise.all([getCornerstoneRuntime(), file.arrayBuffer()])
        if (disposed || !viewportElementRef.current) return

        const { core, tools, dicomImageLoader } = runtime
        const renderingEngine = new core.RenderingEngine(renderingEngineId)
        renderingEngine.enableElement({
          viewportId,
          type: core.Enums.ViewportType.STACK,
          element: viewportElementRef.current,
          defaultOptions: { background: [11, 19, 41] },
        })
        const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId)
        if (!toolGroup) throw new Error('Görüntü araç grubu oluşturulamadı.')
        toolGroup.addViewport(viewportId, renderingEngineId)
        toolGroup.addTool(tools.PanTool.toolName)
        toolGroup.addTool(tools.ZoomTool.toolName)
        toolGroup.addTool(tools.WindowLevelTool.toolName)
        toolGroup.addTool(tools.StackScrollTool.toolName)
        toolGroup.addTool(tools.LengthTool.toolName)
        toolGroup.addTool(tools.AngleTool.toolName)
        toolGroup.addTool(tools.ArrowAnnotateTool.toolName)
        toolGroup.addTool(tools.RectangleROITool.toolName)
        toolGroup.addTool(tools.EllipticalROITool.toolName)
        toolGroup.addTool(tools.PlanarFreehandROITool.toolName)
        toolGroup.addTool(tools.EraserTool.toolName)
        toolGroup.setToolConfiguration(tools.LengthTool.toolName, { getTextLines: measurementTextLines })
        toolGroup.setToolConfiguration(tools.RectangleROITool.toolName, { getTextLines: roiTextLines })
        toolGroup.setToolConfiguration(tools.EllipticalROITool.toolName, { getTextLines: roiTextLines })
        toolGroup.setToolActive(tools.WindowLevelTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] })
        toolGroup.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] })

        const imageId = dicomImageLoader.wadouri.fileManager.add(file)
        const fileIndex = Number(imageId.replace('dicomfile:', ''))
        const viewport = renderingEngine.getViewport(viewportId)
        await viewport.setStack([imageId])
        renderingEngine.resize(true, true)
        viewport.resetCamera()
        viewport.render()

        const resizeObserver = new ResizeObserver(() => {
          renderingEngine.resize(true, true)
          viewport.resetCamera()
          viewport.render()
        })
        resizeObserver.observe(viewportElementRef.current)
        sessionRef.current = { renderingEngine, toolGroup, tools, dicomImageLoader, fileIndex, resizeObserver }

        void readDicomMetadata(buffer)
          .then((parsedMetadata) => {
            if (disposed) return
            if (parsedMetadata.pixelSpacingValues) {
              const [rowPixelSpacing, columnPixelSpacing] = parsedMetadata.pixelSpacingValues
              tools.utilities.calibrateImageSpacing(imageId, renderingEngine, {
                type: core.Enums.CalibrationTypes.CALIBRATED,
                rowPixelSpacing,
                columnPixelSpacing,
              })
            }
            setMetadata(parsedMetadata)
          })
          .catch(() => { if (!disposed) setMetadata(null) })
      } catch (openError) {
        cleanup()
        if (!disposed) setError(describeDicomError(openError))
      } finally {
        if (!disposed) setIsLoading(false)
      }
    }
    void open()
    return () => { disposed = true; cleanup() }
  }, [cleanup, file, renderingEngineId, toolGroupId, viewportId])

  const activateTool = (tool: ActiveTool) => {
    const session = sessionRef.current
    if (!session) return
    const { tools, toolGroup } = session
      ;[
        tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.StackScrollTool,
        tools.LengthTool, tools.AngleTool, tools.ArrowAnnotateTool, tools.RectangleROITool,
        tools.EllipticalROITool, tools.PlanarFreehandROITool, tools.EraserTool,
      ].forEach((entry: any) => toolGroup.setToolPassive(entry.toolName, { removeAllBindings: true }))
    const selected = {
      windowLevel: tools.WindowLevelTool, pan: tools.PanTool, zoom: tools.ZoomTool, scroll: tools.StackScrollTool,
      length: tools.LengthTool, arrow: tools.ArrowAnnotateTool, angle: tools.AngleTool,
      rectangle: tools.RectangleROITool, ellipse: tools.EllipticalROITool,
      freehand: tools.PlanarFreehandROITool, erase: tools.EraserTool,
    }[tool]
    toolGroup.setToolActive(selected.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] })
    toolGroup.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] })
    setActiveTool(tool)
  }

  const resetViewport = () => {
    const viewport = sessionRef.current?.renderingEngine?.getViewport(viewportId)
    viewport?.resetCamera()
    viewport?.resetProperties()
    viewport?.render()
  }

  const clearAnnotations = () => {
    const session = sessionRef.current
    const element = viewportElementRef.current
    if (!session || !element) return
      ;[
        session.tools.LengthTool, session.tools.AngleTool, session.tools.ArrowAnnotateTool,
        session.tools.RectangleROITool, session.tools.EllipticalROITool, session.tools.PlanarFreehandROITool,
      ].forEach((tool: any) => session.tools.annotation.state.removeAnnotations(tool.toolName, element))
    session.renderingEngine.getViewport(viewportId)?.render()
  }

  const chooseFile = (nextFile: File | undefined | null) => {
    if (!nextFile) return
    if (!isValidDcmFileName(nextFile.name)) {
      toast.error('2B DICOM görüntüleme için yalnızca .dcm uzantılı dosya seçebilirsiniz.')
      return
    }
    setFile(nextFile)
    setError(null)
    setIsPresentationMode(true)
    setShowPresentationTools(true)
    onFileChange?.(nextFile)
  }

  const clearFile = () => {
    setFile(null)
    setError(null)
    setMetadata(null)
    cleanup()
    if (fileInputRef.current) fileInputRef.current.value = ''
    onFileClear?.()
    onFileChange?.(null)
    if (onClose) onClose()
  }

  const activePresentation = isPresentationMode && Boolean(file || isLoading || error || dcmUrl)

  return (
    <section
      role={activePresentation ? 'dialog' : undefined}
      aria-modal={activePresentation ? 'true' : undefined}
      aria-label="2B DICOM Sunum Modu"
      style={{
        position: activePresentation ? 'fixed' : 'relative',
        inset: activePresentation ? 0 : undefined,
        zIndex: activePresentation ? 100005 : undefined,
        display: 'grid',
        gridTemplateColumns: activePresentation || !metadata ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(240px, 320px)',
        gap: 12,
        padding: activePresentation ? 0 : isModal ? 12 : 0,
        borderRadius: activePresentation ? 0 : 8,
        background: activePresentation ? '#0b1329' : 'var(--card-bg)',
        border: activePresentation || !isModal ? 'none' : '1px solid var(--input-border)',
        color: 'var(--foreground)',
      }}
    >
      <div style={{ minWidth: 0, position: 'relative', width: '100%', height: activePresentation ? '100vh' : undefined }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".dcm"
          style={{ display: 'none' }}
          onChange={(event) => {
            chooseFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />

        {/* Üst Bilgi ve Araç Çubuğu */}
        {(file || activePresentation) && (
          <div
            style={
              activePresentation
                ? {
                  position: 'absolute',
                  top: 16,
                  left: 20,
                  right: 20,
                  zIndex: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                  pointerEvents: 'none',
                }
                : { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', pointerEvents: 'auto' }}>
              {file && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'var(--card-bg)',
                    border: '1.5px solid var(--input-border)',
                    color: 'var(--foreground)',
                    fontSize: 12,
                    fontWeight: 700,
                    maxWidth: 280,
                    boxShadow: 'var(--pc-neo-subcard)',
                  }}
                >
                  <FileUp size={14} color="var(--accent)" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                </div>
              )}

              {uploading && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'var(--badge-clinic-bg)',
                    border: '1px solid var(--badge-clinic-border)',
                    color: 'var(--badge-clinic-fg)',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  Kaydediliyor %{uploadProgress}
                </div>
              )}

              {!uploading && saved && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'var(--card-bg)',
                    border: '1.5px solid var(--success, #16a34a)',
                    color: 'var(--success, #16a34a)',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  <CheckCircle2 size={13} /> Kaydedildi
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto', pointerEvents: 'auto' }}>
              {onFileChange && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ ...secondaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}
                >
                  <FileUp size={13} /> Değiştir (.dcm)
                </button>
              )}
              {onFileClear && (
                <button
                  type="button"
                  onClick={clearFile}
                  title="Görüntüyü Kaldır"
                  style={{
                    ...secondaryButtonStyle,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: 'var(--danger)',
                    borderColor: 'var(--danger)',
                    fontWeight: 600,
                  }}
                >
                  <Trash2 size={13} /> Kaldır
                </button>
              )}
              {activePresentation && metadata && (
                <button
                  type="button"
                  onClick={() => setShowMetadataInPresentation((prev) => !prev)}
                  style={{
                    ...toolButtonStyle(showMetadataInPresentation),
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontWeight: 600,
                  }}
                >
                  <Info size={14} /> Hasta ve Görüntü Bilgileri
                </button>
              )}
              {!activePresentation && file && (
                <button
                  type="button"
                  onClick={() => { setIsPresentationMode(true); setShowPresentationTools(true) }}
                  style={{
                    ...primaryButtonStyle,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  🖥️ Sunum Modu
                </button>
              )}
              {activePresentation && (
                <button
                  type="button"
                  onClick={closePresentation}
                  style={{
                    ...primaryButtonStyle,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <X size={14} /> Sunumu Kapat
                </button>
              )}
              {!activePresentation && isModal && onClose && (
                <button type="button" onClick={onClose} aria-label="Görüntüleyiciyi kapat" style={secondaryButtonStyle}>
                  Kapat
                </button>
              )}
            </div>
          </div>
        )}

        {/* Sunum Modu Sağ Üst Hasta & Görüntü Bilgileri Kartı */}
        {activePresentation && showMetadataInPresentation && metadata && (
          <aside
            style={{
              position: 'absolute',
              top: 64,
              right: 20,
              zIndex: 3,
              width: 320,
              maxWidth: 'calc(100vw - 40px)',
              maxHeight: 'calc(100vh - 88px)',
              overflow: 'auto',
              border: '1.5px solid var(--input-border)',
              borderRadius: 12,
              background: 'var(--card-bg)',
              color: 'var(--foreground)',
              padding: 14,
              boxShadow: 'var(--pc-modal-shadow)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Hasta ve görüntü bilgileri</strong>
              <button
                type="button"
                onClick={() => setShowMetadataInPresentation(false)}
                aria-label="Bilgileri kapat"
                style={{ ...secondaryButtonStyle, padding: '2px 6px' }}
              >
                <X size={13} />
              </button>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, .8fr) minmax(0, 1.2fr)', gap: '8px 10px', fontSize: 12, margin: '12px 0 0' }}>
              {metadata.summary.map((item) => (
                <div key={item.label} style={{ display: 'contents' }}>
                  <dt style={{ color: 'var(--foreground-3)' }}>{item.label}</dt>
                  <dd style={{ margin: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{item.value}</dd>
                </div>
              ))}
              <div style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--foreground-3)' }}>Diş ölçüm ölçeği</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>
                  {metadata.pixelSpacing ? `${metadata.pixelSpacing} mm / piksel` : 'Dosyada ölçek bilgisi yok'}
                </dd>
              </div>
            </dl>
            <p style={{ margin: '12px 0 0', paddingTop: 10, borderTop: '1px solid var(--input-border)', fontSize: 11, lineHeight: 1.45, color: 'var(--foreground-2)' }}>
              {metadata.pixelSpacing
                ? 'Uzunluk aracı diş ölçülerini bu DICOM kalibrasyonuyla mm olarak hesaplar.'
                : 'Diş uzunluğunu mm olarak ölçmek için dosyada Pixel Spacing veya Imager Pixel Spacing bilgisi gerekir.'}
            </p>
          </aside>
        )}

        {/* Sunum Modu Çizim ve Ölçüm Araçları */}
        {file && !error && activePresentation && (
          <div
            style={{
              position: 'absolute',
              left: 20,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 3,
              width: 194,
              display: 'grid',
              gap: 10,
              padding: 12,
              borderRadius: 12,
              background: 'var(--card-bg)',
              border: '1.5px solid var(--input-border)',
              boxShadow: 'var(--pc-modal-shadow)',
            }}
          >
            <strong style={{ fontSize: 12, textAlign: 'center', color: 'var(--foreground)' }}>Sunum &amp; Çizim Araçları</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {primaryTools.map((tool) => (
                <ViewerToolButton key={tool} tool={tool} selected={activeTool === tool} presentation={true} onClick={() => activateTool(tool)} />
              ))}
              <button
                type="button"
                title="Görüntüyü sıfırla"
                onClick={resetViewport}
                style={{ ...secondaryButtonStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              >
                <RotateCcw size={15} />Sıfırla
              </button>
              <button
                type="button"
                title="Çizim ve ölçüm araçları"
                onClick={() => setShowPresentationTools((visible) => !visible)}
                style={{ ...toolButtonStyle(showPresentationTools), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              >
                <SlidersHorizontal size={15} />Araçlar
              </button>
            </div>
            {showPresentationTools && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, paddingTop: 8, borderTop: '1px solid var(--input-border)' }}>
                {presentationTools.map((tool) => (
                  <ViewerToolButton key={tool} tool={tool} selected={activeTool === tool} presentation={true} onClick={() => activateTool(tool)} />
                ))}
                <button
                  type="button"
                  title="Tüm çizimleri temizle"
                  onClick={clearAnnotations}
                  style={{ ...secondaryButtonStyle, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                >
                  <Eraser size={15} />Temizle
                </button>
              </div>
            )}
          </div>
        )}

        {/* Dosya Yokken: Sadece 2B .dcm Seçim Kartı */}
        {!file && !isLoading && !error && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              const droppedFiles = Array.from(e.dataTransfer.files)
              if (droppedFiles.length >= 1) {
                chooseFile(droppedFiles[0])
              }
            }}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: isDragging ? '2px dashed var(--accent)' : '1.5px dashed var(--input-border)',
              background: 'var(--card-bg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              transition: 'all 0.15s ease',
            }}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--btn-clinic-blue-border)',
                background: 'var(--btn-clinic-blue-bg)',
                color: 'var(--btn-clinic-blue-fg)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'var(--badge-clinic-bg)',
                  border: '1px solid var(--badge-clinic-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FileUp size={17} color="var(--badge-clinic-fg)" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--foreground)' }}>
                  2B DICOM Dosyası Seç (.dcm)
                </div>
                <div style={{ fontSize: 11, color: 'var(--foreground-2)', marginTop: 2 }}>
                  Yalnızca .dcm formatı · Yüklendiğinde doğrudan Sunum Modunda açılır ve kaydedilir
                </div>
              </div>
            </button>
          </div>
        )}

        {isLoading && (
          <div style={activePresentation ? presentationMessageStyle : messageStyle}>
            DICOM görüntüsü Sunum Modunda hazırlanıyor…
          </div>
        )}
        {error && (
          <div style={{ ...(activePresentation ? presentationMessageStyle : messageStyle), color: 'var(--danger)' }}>
            ⚠️ {error}
          </div>
        )}
        <div
          ref={viewportElementRef}
          tabIndex={0}
          onFocus={() => setIsActive(true)}
          onBlur={() => setIsActive(false)}
          onPointerDown={() => setIsActive(true)}
          style={{
            display: file && !error ? 'block' : 'none',
            width: '100%',
            minHeight: activePresentation ? '100vh' : isModal ? 520 : 340,
            height: activePresentation ? '100vh' : isModal ? 'min(70vh, 760px)' : 380,
            outline: 'none',
            background: '#0b1329',
            borderRadius: activePresentation ? 0 : 8,
            border: activePresentation ? 'none' : `2px solid ${isActive ? 'var(--accent)' : 'var(--input-border)'}`,
            overflow: 'hidden',
          }}
          aria-label="DICOM görüntü viewportu"
        />
      </div>
      {!activePresentation && metadata && (
        <aside style={{ minWidth: 0, maxHeight: isModal ? 'min(75vh, 820px)' : 520, overflow: 'auto', border: '1px solid var(--input-border)', borderRadius: 8, background: 'var(--card-bg)', padding: 12 }}>
          <strong style={{ fontSize: 13 }}>Hasta ve görüntü bilgileri</strong>
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, .8fr) minmax(0, 1.2fr)', gap: '8px 10px', fontSize: 12, margin: '12px 0 0' }}>
            {metadata.summary.map((item) => (
              <div key={item.label} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--foreground-3)' }}>{item.label}</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{item.value}</dd>
              </div>
            ))}
            <div style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--foreground-3)' }}>Diş ölçüm ölçeği</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{metadata.pixelSpacing ? `${metadata.pixelSpacing} mm / piksel` : 'Dosyada ölçek bilgisi yok'}</dd>
            </div>
          </dl>
          <p style={{ margin: '12px 0 0', paddingTop: 10, borderTop: '1px solid var(--input-border)', fontSize: 11, lineHeight: 1.45, color: 'var(--foreground-2)' }}>
            {metadata.pixelSpacing ? 'Uzunluk aracı diş ölçülerini bu DICOM kalibrasyonuyla mm olarak hesaplar.' : 'Diş uzunluğunu mm olarak ölçmek için dosyada Pixel Spacing veya Imager Pixel Spacing bilgisi gerekir.'}
          </p>
        </aside>
      )}
    </section>
  )
}

const secondaryButtonStyle = {
  border: '1.5px solid var(--input-border)',
  borderRadius: 8,
  padding: '6px 11px',
  background: 'var(--card-bg)',
  color: 'var(--foreground)',
  cursor: 'pointer',
  fontSize: 11.5,
} as const

const primaryButtonStyle = {
  border: '1.5px solid #1d4ed8',
  borderRadius: 8,
  padding: '6px 12px',
  background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  cursor: 'pointer',
  fontSize: 11.5,
  fontWeight: 700,
} as const

const toolButtonStyle = (selected: boolean) => ({
  ...secondaryButtonStyle,
  borderColor: selected ? 'var(--accent)' : 'var(--input-border)',
  color: selected ? 'var(--accent)' : 'var(--foreground-2)',
  background: selected ? 'var(--btn-clinic-blue-bg, var(--card-bg))' : 'var(--card-bg)',
  fontWeight: selected ? 700 : 500,
})

const messageStyle = {
  minHeight: 180,
  display: 'grid',
  placeItems: 'center',
  border: '1px solid var(--input-border)',
  borderRadius: 8,
  background: 'var(--input-bg)',
  color: 'var(--foreground-2)',
  fontSize: 13,
} as const

const presentationMessageStyle = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: '#0b1329',
  color: '#e2e8f0',
  fontSize: 14,
  fontWeight: 600,
} as const
