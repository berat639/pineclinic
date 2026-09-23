'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Crosshair, RotateCcw, X } from 'lucide-react'
import { getCornerstoneRuntime } from './dicom/cornerstoneRuntime'

interface CbctMprViewerProps { files: File[]; onClose: () => void }
type ViewportName = 'Axial' | 'Coronal' | 'Sagittal' | '3D Hacim'

export default function CbctMprViewer({ files, onClose }: CbctMprViewerProps) {
  const instanceId = useId().replace(/:/g, '')
  const engineId = `cbct-mpr-engine-${instanceId}`
  const toolGroupId = `cbct-mpr-tools-${instanceId}`
  const volumeToolGroupId = `cbct-volume-tools-${instanceId}`
  const volumeId = `cornerstoneStreamingImageVolume:cbct-${instanceId}`
  const viewportIds = useMemo(() => ['axial', 'coronal', 'sagittal', 'volume-3d'].map((name) => `cbct-${name}-${instanceId}`), [instanceId])
  const axialRef = useRef<HTMLDivElement>(null)
  const coronalRef = useRef<HTMLDivElement>(null)
  const sagittalRef = useRef<HTMLDivElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)

  const cleanup = useCallback(() => {
    const session = sessionRef.current
    if (!session) return
    session.observer?.disconnect()
    try { session.toolGroup?.removeViewports?.(engineId, viewportIds) } catch { /* already removed */ }
    try { session.tools.ToolGroupManager.destroyToolGroup(toolGroupId) } catch { /* already removed */ }
    try { session.tools.ToolGroupManager.destroyToolGroup(volumeToolGroupId) } catch { /* already removed */ }
    try { session.engine.destroy() } catch { /* already removed */ }
    try { session.core.cache.removeVolumeLoadObject(volumeId) } catch { /* already removed */ }
    session.imageIds?.forEach((imageId: string) => { try { session.loader.wadouri.fileManager.remove(Number(imageId.replace('dicomfile:', ''))) } catch { /* already removed */ } })
    sessionRef.current = null
  }, [engineId, toolGroupId, volumeId, volumeToolGroupId, viewportIds])

  useEffect(() => cleanup, [cleanup])

  useEffect(() => {
    const elements = [axialRef.current, coronalRef.current, sagittalRef.current, volumeRef.current]
    if (elements.some((element) => !element)) return
    let disposed = false
    const open = async () => {
      try {
        const { core, tools, dicomImageLoader: loader, metadata } = await getCornerstoneRuntime()
        if (disposed) return
        const imageIds = files.map((file) => loader.wadouri.fileManager.add(file))
        // Streaming volumes request imagePixelModule before they decode any
        // slice. Local dicomfile: images therefore need their Part 10 metadata
        // registered first; stack viewports lazily do this while loading.
        await Promise.all(imageIds.map((imageId, index) => metadata.utilities.addDicomPart10Instance(imageId, () => files[index].arrayBuffer())))
        const engine = new core.RenderingEngine(engineId)
        const orientations = [core.Enums.OrientationAxis.AXIAL, core.Enums.OrientationAxis.CORONAL, core.Enums.OrientationAxis.SAGITTAL]
        engine.setViewports([
          ...viewportIds.slice(0, 3).map((viewportId, index) => ({ viewportId, type: core.Enums.ViewportType.ORTHOGRAPHIC, element: elements[index]!, defaultOptions: { orientation: orientations[index], background: [0, 0, 0] } })),
          { viewportId: viewportIds[3], type: core.Enums.ViewportType.VOLUME_3D, element: elements[3]!, defaultOptions: { background: [0, 0, 0] } },
        ])
        const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId)
        if (!toolGroup) throw new Error('MPR araç grubu oluşturulamadı.')
        viewportIds.slice(0, 3).forEach((viewportId) => toolGroup.addViewport(viewportId, engineId))
        ;[tools.CrosshairsTool, tools.PanTool, tools.ZoomTool, tools.WindowLevelTool, tools.StackScrollTool].forEach((tool) => toolGroup.addTool(tool.toolName))
        toolGroup.setToolActive(tools.CrosshairsTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] })
        toolGroup.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] })
        const volumeToolGroup = tools.ToolGroupManager.createToolGroup(volumeToolGroupId)
        if (!volumeToolGroup) throw new Error('3D hacim araç grubu oluşturulamadı.')
        volumeToolGroup.addViewport(viewportIds[3], engineId)
        ;[tools.TrackballRotateTool, tools.PanTool, tools.ZoomTool, tools.WindowLevelTool].forEach((tool) => volumeToolGroup.addTool(tool.toolName))
        volumeToolGroup.setToolActive(tools.TrackballRotateTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] })
        volumeToolGroup.setToolActive(tools.ZoomTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Secondary }] })

        const volume = await core.volumeLoader.createAndCacheVolume(volumeId, { imageIds })
        await volume.load()
        if (disposed) return
        await core.setVolumesForViewports(engine, [{ volumeId }], viewportIds)
        // CT-Bone is a dependable initial transfer function for standard CT and
        // calibrated dental CBCT. Operators can restore defaults if a device
        // stores non-HU pixel values.
        engine.getViewport(viewportIds[3])?.setProperties?.({ preset: 'CT-Bone' })
        engine.renderViewports(viewportIds)
        const observer = new ResizeObserver(() => engine.resize(true, true))
        elements.forEach((element) => observer.observe(element!))
        sessionRef.current = { core, tools, loader, imageIds, engine, toolGroup, volumeToolGroup, observer }
      } catch (openError) {
        cleanup()
        if (!disposed) setError(openError instanceof Error ? openError.message : 'CBCT hacmi oluşturulamadı.')
      } finally { if (!disposed) setLoading(false) }
    }
    void open()
    return () => { disposed = true; cleanup() }
  }, [cleanup, engineId, files, toolGroupId, viewportIds, volumeId])

  const reset = () => viewportIds.forEach((viewportId) => {
    const viewport = sessionRef.current?.engine?.getViewport(viewportId)
    viewport?.resetCamera(); viewport?.resetProperties(); viewport?.render()
  })

  const setDentalPreset = (preset: 'CT-Bone' | 'CT-Bones') => {
    const viewport = sessionRef.current?.engine?.getViewport(viewportIds[3])
    viewport?.setProperties?.({ preset })
    viewport?.resetCamera?.()
    viewport?.render?.()
  }

  if (error) return <div style={messageStyle}>⚠️ {error}<button type="button" onClick={onClose} style={buttonStyle}>Geri dön</button></div>
  return <section style={{ position: 'fixed', inset: 0, zIndex: 100000, padding: 16, background: 'var(--background)', color: 'var(--foreground)', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
    <header style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 12, flexWrap: 'wrap' }}><strong>CBCT 3D MPR · {files.length} kesit</strong><span style={badgeStyle}>Yerel klasör — yükleme yapılmadı</span><button type="button" title="Dental kemik görünümü" onClick={() => setDentalPreset('CT-Bone')} style={buttonStyle}>Dental kemik</button><button type="button" title="Yüksek kontrastlı kemik görünümü" onClick={() => setDentalPreset('CT-Bones')} style={buttonStyle}>Kemik detay</button><button type="button" title="Tüm görünümleri sıfırla" onClick={reset} style={{ ...buttonStyle, marginLeft: 'auto' }}><RotateCcw size={15} /> Sıfırla</button><button type="button" title="MPR görünümünü kapat" onClick={onClose} style={buttonStyle}><X size={15} /> Kapat</button></header>
    {loading && <div style={messageStyle}>CBCT hacmi yerelde hazırlanıyor…</div>}
    <div style={{ display: loading ? 'none' : 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))', gap: 10, minHeight: 0 }}>{(['Axial', 'Coronal', 'Sagittal', '3D Hacim'] as ViewportName[]).map((name, index) => <div key={name} style={{ minWidth: 0, minHeight: 0, position: 'relative', border: `2px solid ${active === index ? 'var(--accent)' : 'var(--input-border)'}`, borderRadius: 8, overflow: 'hidden', background: 'var(--background)' }}><div style={{ position: 'absolute', zIndex: 1, top: 8, left: 8, padding: '4px 7px', borderRadius: 4, background: 'var(--card-bg)', border: '1px solid var(--input-border)', fontSize: 11 }}>{name}</div><div ref={[axialRef, coronalRef, sagittalRef, volumeRef][index]} onPointerDown={() => setActive(index)} style={{ width: '100%', height: '100%', minHeight: 280, outline: 'none' }} />{index === 3 && <span style={{ position: 'absolute', zIndex: 1, right: 8, bottom: 8, padding: '4px 7px', borderRadius: 4, background: 'var(--card-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground-2)', fontSize: 10 }}>Sol tuş: döndür · Sağ tuş: zoom</span>}</div>)}</div>
    <footer style={{ position: 'absolute', left: 24, bottom: 22, padding: '7px 10px', borderRadius: 6, background: 'var(--card-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground-2)', fontSize: 11, display: 'inline-flex', gap: 6, alignItems: 'center' }}><Crosshair size={14} /> Kesitler senkronize edilir; 3D hacim aynı yerel veriden oluşturulur.</footer>
  </section>
}

const buttonStyle = { border: '1px solid var(--input-border)', borderRadius: 6, padding: '7px 10px', background: 'var(--input-bg)', color: 'var(--foreground)', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 } as const
const badgeStyle = { border: '1px solid var(--accent)', borderRadius: 999, padding: '4px 8px', color: 'var(--accent)', fontSize: 11 } as const
const messageStyle = { minHeight: 240, display: 'grid', placeItems: 'center', gap: 10, border: '1px solid var(--input-border)', borderRadius: 8, background: 'var(--input-bg)', color: 'var(--foreground-2)' } as const
