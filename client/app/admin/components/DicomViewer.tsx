'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Circle, Eraser, Hand, Layers, MoveUpRight, Pencil, RotateCcw, Ruler, SlidersHorizontal, Square, SunMedium, Triangle, ZoomIn, FileUp, FolderUp, Trash2 } from 'lucide-react'
import { readDicomMetadata, type DicomMetadata } from './dicom/dicomMetadata'
import { getCornerstoneRuntime } from './dicom/cornerstoneRuntime'
import { findLocalCbctSeries } from './dicom/localCbctSeries'
import CbctMprViewer from './CbctMprViewer'

interface DicomViewerProps {
  dcmUrl?: string | null
  file?: File | null
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
  return <button type="button" title={toolLabels[tool]} aria-label={toolLabels[tool]} onClick={onClick} style={{ ...toolButtonStyle(selected), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexDirection: presentation ? 'column' : 'row', gap: presentation ? 3 : 5, minHeight: presentation ? 52 : undefined }}><Icon size={presentation ? 17 : 15} strokeWidth={2} /><span>{toolLabels[tool]}</span></button>
}

function describeDicomError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/pixel data|image pixel/i.test(message)) return 'Bu DICOM dosyasında görüntülenebilir Pixel Data bulunamadı.'
  if (/transfer syntax|decode|codec|jpeg/i.test(message)) return 'Bu DICOM sıkıştırma biçimi tarayıcıda çözümlenemedi.'
  if (/fetch|yüklenemedi|network/i.test(message)) return 'DICOM dosyası indirilemedi veya oturum yetkisi doğrulanamadı.'
  return message || 'DICOM görüntüsü açılırken beklenmeyen bir hata oluştu.'
}

function themedViewportBackground(element: HTMLElement): [number, number, number] {
  const match = getComputedStyle(element).backgroundColor.match(/\d+/g)
  if (!match || match.length < 3) return [255, 255, 255]
  return [Number(match[0]), Number(match[1]), Number(match[2])]
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

export default function DicomViewer({ dcmUrl, file: propFile, onFileChange, onFileClear, onClose, isModal = false }: DicomViewerProps) {
  const reactId = useId().replace(/:/g, '')
  const viewportId = `dicom-2d-viewport-${reactId}`
  const renderingEngineId = `dicom-2d-engine-${reactId}`
  const toolGroupId = `dicom-2d-tools-${reactId}`
  const viewportElementRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const sessionRef = useRef<any>(null)
  const [file, setFile] = useState<File | null>(propFile ?? null)
  const [metadata, setMetadata] = useState<DicomMetadata | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('windowLevel')
  const [isActive, setIsActive] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPresentationTools, setShowPresentationTools] = useState(false)
  const [isPresentationMode, setIsPresentationMode] = useState(false)
  const [cbctFiles, setCbctFiles] = useState<File[] | null>(null)
  const [folderStatus, setFolderStatus] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (propFile !== undefined) {
      setFile(propFile)
      setError(null)
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

  useEffect(() => {
    if (!isPresentationMode) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsPresentationMode(false) }
    window.addEventListener('keydown', onKeyDown)
    const resizeTimer = window.setTimeout(() => sessionRef.current?.renderingEngine?.resize(true, true), 0)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(resizeTimer)
    }
  }, [isPresentationMode])

  useEffect(() => {
    if (!dcmUrl) return
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    fetch(dcmUrl, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Dosya yüklenemedi')
        const blob = await response.blob()
        return new File([blob], 'görüntü.dcm', { type: 'application/dicom' })
      })
      .then((nextFile) => setFile(nextFile))
      .catch((fetchError) => { if (fetchError.name !== 'AbortError') setError(describeDicomError(fetchError)) })
      .finally(() => setIsLoading(false))
    return () => controller.abort()
  }, [dcmUrl])

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
        renderingEngine.enableElement({ viewportId, type: core.Enums.ViewportType.STACK, element: viewportElementRef.current, defaultOptions: { background: themedViewportBackground(viewportElementRef.current) } })
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
        // Some panoramic devices use private calibration codes that Cornerstone
        // cannot map to a physical unit. Never expose that implementation detail
        // as "Unknown" in clinical annotations.
        toolGroup.setToolConfiguration(tools.LengthTool.toolName, { getTextLines: measurementTextLines })
        toolGroup.setToolConfiguration(tools.RectangleROITool.toolName, { getTextLines: roiTextLines })
        toolGroup.setToolConfiguration(tools.EllipticalROITool.toolName, { getTextLines: roiTextLines })
        toolGroup.setToolActive(tools.WindowLevelTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] })
        toolGroup.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] })

        const imageId = dicomImageLoader.wadouri.fileManager.add(file)
        const fileIndex = Number(imageId.replace('dicomfile:', ''))
        const viewport = renderingEngine.getViewport(viewportId)
        await viewport.setStack([imageId])
        viewport.render()

        const resizeObserver = new ResizeObserver(() => renderingEngine.resize(true, true))
        resizeObserver.observe(viewportElementRef.current)
        sessionRef.current = { renderingEngine, toolGroup, tools, dicomImageLoader, fileIndex, resizeObserver }

        // Metadata is informational: a malformed non-pixel tag must never prevent
        // Cornerstone from opening an otherwise valid image.
        void readDicomMetadata(buffer)
          .then((parsedMetadata) => {
            if (disposed) return
            // Dental panoramic files can contain private calibration metadata that
            // overrides standard Pixel Spacing as "Unknown". The standard DICOM
            // Pixel Spacing tag is the authoritative scale for linear measurements.
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
    setFile(nextFile)
    setError(null)
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
  }

  const chooseFolder = async (selectedFiles: File[]) => {
    if (!selectedFiles.length) return
    setError(null)
    setFolderStatus(`Klasörde uygun CBCT serisi aranıyor… (0/${selectedFiles.length})`)
    try {
      const series = await findLocalCbctSeries(selectedFiles, (scanned, total) => {
        setFolderStatus(`Klasörde uygun CBCT serisi aranıyor… (${scanned}/${total})`)
      })
      if (!series) {
        setError('Bu klasörde en az 16 farklı konumlu kesit ve gerekli geometri bilgilerini içeren bir CBCT serisi bulunamadı.')
        return
      }
      setFile(null)
      setCbctFiles(series.files)
    } catch (folderError) {
      const detail = folderError instanceof Error
        ? folderError.message
        : typeof folderError === 'string'
          ? folderError
          : (() => { try { return JSON.stringify(folderError) } catch { return '' } })()
      setError(detail || `Klasördeki DICOM dosyaları okunamadı (${selectedFiles.length} dosya tarandı). CBCT klasörünü seçtiğinizden emin olun.`)
    } finally { setFolderStatus(null) }
  }

  if (cbctFiles) return <CbctMprViewer files={cbctFiles} onClose={() => setCbctFiles(null)} />

  return (
    <section style={{
      position: isPresentationMode ? 'fixed' : 'relative',
      inset: isPresentationMode ? 0 : undefined,
      zIndex: isPresentationMode ? 100000 : undefined,
      display: 'grid',
      gridTemplateColumns: isPresentationMode || !metadata ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(240px, 320px)',
      gap: 12,
      padding: isPresentationMode ? 0 : isModal ? 12 : 0,
      borderRadius: isPresentationMode ? 0 : 8,
      background: isPresentationMode ? 'var(--background)' : 'transparent',
      border: isPresentationMode || !isModal ? 'none' : '1px solid var(--input-border)',
      color: 'var(--foreground)'
    }}>
      <div style={{ minWidth: 0 }}>
        <input ref={fileInputRef} type="file" accept=".dcm,application/dicom" style={{ display: 'none' }} onChange={(event) => chooseFile(event.target.files?.[0])} />
        <input ref={folderInputRef} type="file" multiple style={{ display: 'none' }} {...({ webkitdirectory: '' } as any)} onChange={(event) => { const selectedFiles = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void chooseFolder(selectedFiles) }} />

        {/* Dosya Seçildiğinde Üst Bilgi ve Araç Çubuğu */}
        {file && (
          <div style={isPresentationMode ? { position: 'absolute', top: 20, right: 20, zIndex: 2, display: 'flex', gap: 8 } : { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {!isPresentationMode && (
              <>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--badge-clinic-bg)', border: '1px solid var(--badge-clinic-border)', color: 'var(--badge-clinic-fg)', fontSize: 11, fontWeight: 600, maxWidth: 220 }}>
                  <FileUp size={13} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ ...secondaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  Değiştir
                </button>
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
                    borderColor: 'rgba(239,68,68,0.3)',
                    background: 'rgba(239,68,68,0.06)',
                  }}
                >
                  <Trash2 size={12} /> Kaldır
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => { setIsPresentationMode((active) => !active); setShowPresentationTools(true) }}
              style={{
                ...toolButtonStyle(isPresentationMode),
                marginLeft: isPresentationMode ? undefined : 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
              }}
            >
              {isPresentationMode ? 'Sunumu kapat' : '🖥️ Sunum modu'}
            </button>
            {isModal && onClose && (
              <button type="button" onClick={onClose} aria-label="Görüntüleyiciyi kapat" style={{ ...secondaryButtonStyle, marginLeft: isPresentationMode ? 0 : 4 }}>
                Kapat
              </button>
            )}
          </div>
        )}

        {/* Sunum Modu Çizim Araçları */}
        {file && !error && isPresentationMode && (
          <div style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 2, width: 188, display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--input-border)' }}>
            {isPresentationMode && <strong style={{ fontSize: 12, textAlign: 'center' }}>Çizim araçları</strong>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {primaryTools.map((tool) => <ViewerToolButton key={tool} tool={tool} selected={activeTool === tool} presentation={true} onClick={() => activateTool(tool)} />)}
              <button type="button" title="Görüntüyü sıfırla" onClick={resetViewport} style={{ ...secondaryButtonStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><RotateCcw size={15} />Sıfırla</button>
              <button type="button" title="Çizim ve ölçüm araçları" onClick={() => setShowPresentationTools((visible) => !visible)} style={{ ...toolButtonStyle(showPresentationTools), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><SlidersHorizontal size={15} />Araçlar</button>
            </div>
            {showPresentationTools && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, paddingTop: 8, borderTop: '1px solid var(--input-border)' }}>
                {presentationTools.map((tool) => <ViewerToolButton key={tool} tool={tool} selected={activeTool === tool} presentation={true} onClick={() => activateTool(tool)} />)}
                <button type="button" title="Tüm çizimleri temizle" onClick={clearAnnotations} style={{ ...secondaryButtonStyle, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Eraser size={15} />Temizle</button>
              </div>
            )}
          </div>
        )}

        {/* Dosya Yokken: Kompakt & Şık İkili Yükleme Kartı */}
        {!file && !isLoading && !error && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              const droppedFiles = Array.from(e.dataTransfer.files)
              if (droppedFiles.length === 1) {
                chooseFile(droppedFiles[0])
              } else if (droppedFiles.length > 1) {
                void chooseFolder(droppedFiles)
              }
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: isDragging ? '2px dashed var(--accent)' : '1px dashed var(--input-border)',
              background: isDragging ? 'var(--flow-info-bg, rgba(37,99,235,0.08))' : 'var(--input-bg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
              {/* 2D DICOM Seç */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--btn-clinic-blue-border)',
                  background: 'var(--btn-clinic-blue-bg)',
                  color: 'var(--btn-clinic-blue-fg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: 'var(--badge-clinic-bg)',
                  border: '1px solid var(--badge-clinic-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <FileUp size={16} color="var(--badge-clinic-fg)" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>
                    2D DICOM Seç
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--foreground-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    .dcm panoramik / periapikal
                  </div>
                </div>
              </button>

              {/* 3D CBCT Seç */}
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--input-border)',
                  background: 'var(--card-bg)',
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: 'var(--card-inner)',
                  border: '1px solid var(--input-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <FolderUp size={16} color="var(--foreground-2)" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>
                    3D CBCT Klasörü Seç
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--foreground-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Açılmış kesit klasörü
                  </div>
                </div>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 10.5, color: 'var(--foreground-3)' }}>
              <span>💡 DICOM dosyasını bu alana sürükleyip bırakabilirsiniz</span>
            </div>
          </div>
        )}

        {folderStatus && <div style={messageStyle}>{folderStatus}</div>}
        {isLoading && <div style={messageStyle}>DICOM görüntüsü hazırlanıyor…</div>}
        {error && <div style={{ ...messageStyle, color: 'var(--danger)' }}>⚠️ {error}</div>}
        <div
          ref={viewportElementRef}
          tabIndex={0}
          onFocus={() => setIsActive(true)}
          onBlur={() => setIsActive(false)}
          onPointerDown={() => setIsActive(true)}
          style={{
            display: file && !error ? 'block' : 'none',
            width: '100%',
            minHeight: isPresentationMode ? 0 : isModal ? 520 : 300,
            height: isPresentationMode ? '100vh' : isModal ? 'min(70vh, 760px)' : 340,
            outline: 'none',
            background: 'var(--background)',
            borderRadius: isPresentationMode ? 0 : 8,
            border: isPresentationMode ? 'none' : `2px solid ${isActive ? 'var(--accent)' : 'var(--input-border)'}`,
            overflow: 'hidden'
          }}
          aria-label="DICOM görüntü viewportu"
        />
      </div>
      {!isPresentationMode && metadata && (
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

const secondaryButtonStyle = { border: '1px solid var(--input-border)', borderRadius: 6, padding: '5px 9px', background: 'var(--input-bg)', color: 'var(--foreground)', cursor: 'pointer', fontSize: 11 } as const
const toolButtonStyle = (selected: boolean) => ({ ...secondaryButtonStyle, borderColor: selected ? 'var(--accent)' : 'var(--input-border)', color: selected ? 'var(--accent)' : 'var(--foreground-2)', background: selected ? 'var(--card-bg)' : 'var(--input-bg)' })
const messageStyle = { minHeight: 180, display: 'grid', placeItems: 'center', border: '1px solid var(--input-border)', borderRadius: 8, background: 'var(--input-bg)', color: 'var(--foreground-2)', fontSize: 13 } as const
