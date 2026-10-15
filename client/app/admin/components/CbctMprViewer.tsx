'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Activity, Crosshair, Hand, MousePointer2, Move, Rotate3D, RotateCcw, Ruler, SlidersHorizontal, Target, Triangle, X, ZoomIn } from 'lucide-react'
import styles from './CbctMprViewer.module.css'
import { getCornerstoneRuntime } from './dicom/cornerstoneRuntime'
import { dentalArchApexPosition, dentalArchFrameAt, interpolateDentalArch, resampleDentalArch, type CprProjection, type CprResult, type CprVolume } from './dicom/cprReconstruction'
import { CprWorkerClient } from './dicom/cprWorkerClient'
import { estimateDentalArch, estimateDentalArchMipSplineDetailed } from './dicom/autoDentalArch'
import { applyDentalVolumeRendering, type DentalVolumeMode } from './dicom/dentalVolumeRendering'
import { decodeLocalDicomVolume } from './dicom/localDicomVolume'
import { runDentalSegmentator } from './dicom/dentalSegmentator'

interface CbctMprViewerProps { files: File[]; onClose: () => void }
type ViewportName = 'Axial' | 'Coronal' | 'Sagittal' | '3D Hacim'
type MprTool = 'crosshair' | 'pan' | 'zoom' | 'windowLevel' | 'length' | 'angle'
type WorkspaceLayout = 'mpr' | 'cpr' | 'focus3d'
type ClinicalTool = 'crosshair' | 'pan' | 'zoom' | 'windowLevel' | 'length' | 'angle' | 'nerve' | 'implant' | 'tooth'
type ArchPoint = { x: number; y: number }
type ImplantPlan = { diameterMm: number; lengthMm: number; angleDeg: number; entryHeight: number }
type CanvasGuide = { a: ArchPoint; b: ArchPoint; centre: ArchPoint; active: boolean }
type ArchOverlayGeometry = { controlPoints: ArchPoint[]; centre: ArchPoint[]; inner: ArchPoint[]; outer: ArchPoint[]; caps: Array<{ a: ArchPoint; b: ArchPoint }>; guides: CanvasGuide[] }

const viewportNames: ViewportName[] = ['Axial', 'Coronal', 'Sagittal', '3D Hacim']

function orientDentalVolume(viewport: any, volume: any) {
  const imageData = volume?.imageData
  if (!viewport || !imageData) return
  const [width, height, depth] = volume.dimensions.map(Number)
  const centre = imageData.indexToWorld([(width - 1) / 2, (height - 1) / 2, (depth - 1) / 2])
  const origin = imageData.indexToWorld([0, 0, 0])
  const posterior = imageData.indexToWorld([0, 1, 0])
  const superior = imageData.indexToWorld([0, 0, 1])
  const normalized = (end: ArrayLike<number>) => {
    const vector = Array.from(end, (value, axis) => value - origin[axis])
    const length = Math.hypot(...vector) || 1
    return vector.map((value) => value / length)
  }
  const posteriorAxis = normalized(posterior)
  const superiorAxis = normalized(superior)
  const distance = Math.max(width * volume.spacing[0], height * volume.spacing[1], depth * volume.spacing[2]) * 2
  viewport.setCamera?.({
    focalPoint: centre,
    position: centre.map((value: number, axis: number) => value - posteriorAxis[axis] * distance),
    viewUp: superiorAxis,
  })
  viewport.render?.()
}

export default function CbctMprViewer({ files, onClose }: CbctMprViewerProps) {
  const instanceId = useId().replace(/:/g, '')
  const engineId = `cbct-mpr-engine-${instanceId}`
  const toolGroupId = `cbct-mpr-tools-${instanceId}`
  const volumeToolGroupId = `cbct-volume-tools-${instanceId}`
  const volumeId = `derived:cbct-${instanceId}`
  const viewportIds = useMemo(() => ['axial', 'coronal', 'sagittal', 'volume-3d'].map((name) => `cbct-${name}-${instanceId}`), [instanceId])
  const axialRef = useRef<HTMLDivElement>(null)
  const coronalRef = useRef<HTMLDivElement>(null)
  const sagittalRef = useRef<HTMLDivElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const panoramaRef = useRef<HTMLCanvasElement>(null)
  const crossSectionsRef = useRef<HTMLCanvasElement>(null)
  const draggingSectionGuideRef = useRef(false)
  const sessionRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('CBCT çalışma alanı hazırlanıyor…')
  const [error, setError] = useState<string | null>(null)
  const [cprError, setCprError] = useState<string | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [activeViewport, setActiveViewport] = useState(0)
  // Dental CBCT opens in its clinical CPR layout. Generic MPR remains an
  // optional inspection mode rather than the primary workspace.
  const [layout, setLayout] = useState<WorkspaceLayout>('cpr')
  const [cprResult, setCprResult] = useState<CprResult | null>(null)
  const [clinicalTool, setClinicalTool] = useState<ClinicalTool>('crosshair')
  const [archPoints, setArchPoints] = useState<ArchPoint[]>([])
  const [archOverlay, setArchOverlay] = useState<ArchOverlayGeometry | null>(null)
  const [draggedArchPoint, setDraggedArchPoint] = useState<number | null>(null)
  const [selectedPosition, setSelectedPosition] = useState(0.5)
  const [panoramaThicknessMm, setPanoramaThicknessMm] = useState(25)
  const [panoramaProjection, setPanoramaProjection] = useState<CprProjection>('MIP')
  const [sectionThicknessMm, setSectionThicknessMm] = useState(0.8)
  const [sectionStepMm, setSectionStepMm] = useState(1.5)
  const [nerveVisible, setNerveVisible] = useState(false)
  const [implantPlan, setImplantPlan] = useState<ImplantPlan | null>(null)
  const [renderMode, setRenderMode] = useState<DentalVolumeMode>('teeth')
  const [dentalSegmentatorRunning, setDentalSegmentatorRunning] = useState(false)
  const [dentalSegmentatorStatus, setDentalSegmentatorStatus] = useState<string | null>(null)
  const cprVolumeRef = useRef<CprVolume | null>(null)
  const cprWorkerRef = useRef<{ volume: CprVolume; client: CprWorkerClient } | null>(null)

  const cleanup = useCallback(() => {
    cprWorkerRef.current?.client.dispose()
    cprWorkerRef.current = null
    const session = sessionRef.current
    if (!session) return
    session.observer?.disconnect()
    try { session.toolGroup?.removeViewports?.(engineId, viewportIds) } catch { /* already removed */ }
    try { session.tools.ToolGroupManager.destroyToolGroup(toolGroupId) } catch { /* already removed */ }
    try { session.tools.ToolGroupManager.destroyToolGroup(volumeToolGroupId) } catch { /* already removed */ }
    try { session.metadataProvider && session.core.metaData.removeProvider(session.metadataProvider) } catch { /* already removed */ }
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
        setCprError(null)
        setCprResult(null)
        setLoadingMessage('DICOM motoru hazırlanıyor…')
        const { core, tools } = await getCornerstoneRuntime()
        if (disposed) return
        setLoadingMessage(`DICOM dilimleri çözülüyor (0/${files.length})…`)
        const decoded = await decodeLocalDicomVolume(files, (loaded, total) => {
          if (!disposed && (loaded === total || loaded % 8 === 0)) setLoadingMessage(`DICOM dilimleri çözülüyor (${loaded}/${total})…`)
        })
        if (disposed) return
        setLoadingMessage('MPR görünümleri kuruluyor…')
        const engine = new core.RenderingEngine(engineId)
        const orientations = [core.Enums.OrientationAxis.AXIAL, core.Enums.OrientationAxis.CORONAL, core.Enums.OrientationAxis.SAGITTAL]
        engine.setViewports([
          ...viewportIds.slice(0, 3).map((viewportId, index) => ({ viewportId, type: core.Enums.ViewportType.ORTHOGRAPHIC, element: elements[index]!, defaultOptions: { orientation: orientations[index], background: [0, 0, 0] } })),
          { viewportId: viewportIds[3], type: core.Enums.ViewportType.VOLUME_3D, element: elements[3]!, defaultOptions: { background: [0, 0, 0] } },
        ])
        const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId)
        if (!toolGroup) throw new Error('MPR araç grubu oluşturulamadı.')
        viewportIds.slice(0, 3).forEach((viewportId) => toolGroup.addViewport(viewportId, engineId))
        ;[tools.CrosshairsTool, tools.PanTool, tools.ZoomTool, tools.WindowLevelTool, tools.StackScrollTool, tools.LengthTool, tools.AngleTool].forEach((tool) => toolGroup.addTool(tool.toolName))
        toolGroup.setToolActive(tools.CrosshairsTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] })
        toolGroup.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] })
        const volumeToolGroup = tools.ToolGroupManager.createToolGroup(volumeToolGroupId)
        if (!volumeToolGroup) throw new Error('3D hacim araç grubu oluşturulamadı.')
        volumeToolGroup.addViewport(viewportIds[3], engineId)
        ;[tools.TrackballRotateTool, tools.PanTool, tools.ZoomTool, tools.WindowLevelTool].forEach((tool) => volumeToolGroup.addTool(tool.toolName))
        volumeToolGroup.setToolActive(tools.TrackballRotateTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] })
        volumeToolGroup.setToolActive(tools.ZoomTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Secondary }] })
        const sourcePrefix = `local-cbct:${instanceId}:`
        const sourceImageIds = files.map((_, index) => `${sourcePrefix}${index}`)
        const localSlicePrefix = `${volumeId}_slice_`
        const metadataProvider = (type: string, imageId: string) => {
          const indexText = imageId.startsWith(sourcePrefix)
            ? imageId.slice(sourcePrefix.length)
            : imageId.startsWith(localSlicePrefix) ? imageId.slice(localSlicePrefix.length) : ''
          const sliceIndex = Number(indexText)
          if (!Number.isInteger(sliceIndex) || sliceIndex < 0 || sliceIndex >= decoded.dimensions[2]) return undefined
          const normal = decoded.direction.slice(6, 9)
          const imagePositionPatient = decoded.origin.map((value, axis) => value + normal[axis] * decoded.spacing[2] * sliceIndex)
          if (type === 'imagePlaneModule') return {
            frameOfReferenceUID: decoded.metadata.FrameOfReferenceUID,
            rows: decoded.dimensions[1], columns: decoded.dimensions[0],
            imageOrientationPatient: decoded.direction.slice(0, 6),
            rowCosines: decoded.direction.slice(0, 3), columnCosines: decoded.direction.slice(3, 6),
            imagePositionPatient,
            pixelSpacing: [decoded.spacing[1], decoded.spacing[0]],
            rowPixelSpacing: decoded.spacing[1], columnPixelSpacing: decoded.spacing[0],
          }
          if (type === 'generalSeriesModule') return { modality: decoded.metadata.Modality, seriesInstanceUID: volumeId }
          if (type === 'generalImageModule') return { instanceNumber: sliceIndex + 1 }
          return undefined
        }
        core.metaData.addProvider(metadataProvider, 10_000)
        const volume = core.volumeLoader.createLocalVolume(volumeId, {
          metadata: decoded.metadata,
          dimensions: decoded.dimensions,
          spacing: decoded.spacing,
          origin: decoded.origin,
          direction: decoded.direction,
          scalarData: decoded.scalarData,
          referencedImageIds: sourceImageIds,
        })
        sessionRef.current = { core, tools, engine, volume, toolGroup, volumeToolGroup, metadataProvider }
        setLoadingMessage('3B hacim ve dental CPR hazırlanıyor…')
        if (disposed) return
        await core.setVolumesForViewports(engine, [{ volumeId }], viewportIds)
        engine.getViewport(viewportIds[3])?.setProperties?.({ preset: 'CT-Bone' })
        volume.invalidate?.()
        engine.renderViewports(viewportIds)
        const observer = new ResizeObserver(() => engine.resize(true, true))
        elements.forEach((element) => observer.observe(element!))
        sessionRef.current.observer = observer
        // The first usable CPR is generated locally from the loaded volume. It
        // is deliberately not derived from a coronal viewport or a screenshot.
        // The next layer replaces this initial arch with clinician-edited points.
        const scalarData: ArrayLike<number> = decoded.scalarData
        // createLocalVolume does not expose these fields consistently across
        // Cornerstone versions. Keep the decoder's exact DICOM geometry; a
        // silent 1 mm fallback changes tangent angles on anisotropic scans.
        const spacing = [decoded.spacing[0], decoded.spacing[1], decoded.spacing[2]] as const
        const origin = [decoded.origin[0], decoded.origin[1], decoded.origin[2]] as const
        const direction = [...decoded.direction]
        cprVolumeRef.current = { scalarData, dimensions: [Number(volume.dimensions[0]), Number(volume.dimensions[1]), Number(volume.dimensions[2])] as const, spacing, origin, direction }
        const axialViewport = engine.getViewport(viewportIds[0])
        const axialFocalPoint = axialViewport?.getCamera?.()?.focalPoint
        const axialIndex = axialFocalPoint ? core.utilities.transformWorldToIndex(volume.imageData, axialFocalPoint) : null
        setLoadingMessage('Diş arkı otomatik hesaplanıyor…')
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        if (disposed) return
        let detectedPoints: ArchPoint[]
        let detectedAxialSlice = axialIndex?.[2]
        try {
          const estimate = estimateDentalArchMipSplineDetailed(cprVolumeRef.current, 13, axialIndex?.[2])
          detectedPoints = estimate.points
          detectedAxialSlice = estimate.axialSlice
        } catch {
          detectedPoints = estimateDentalArch(cprVolumeRef.current, 13, axialIndex?.[2])
        }
        setArchPoints(detectedPoints)
        setSelectedPosition(dentalArchApexPosition(detectedPoints, [spacing[0], spacing[1]]))
        // The detector evaluates nearby physical levels and may find the dental
        // arch away from the volume midpoint. Display that exact DICOM plane;
        // otherwise a correct curve is projected over unrelated anatomy and its
        // perpendicular appears to have the wrong angle.
        if (Number.isFinite(detectedAxialSlice) && axialIndex && axialViewport?.getCamera?.()) {
          const camera = axialViewport.getCamera()
          const targetWorld = core.utilities.transformIndexToWorld(volume.imageData, [axialIndex[0], axialIndex[1], Number(detectedAxialSlice)])
          const delta = targetWorld.map((value: number, axis: number) => value - camera.focalPoint[axis])
          axialViewport.setCamera({
            focalPoint: targetWorld,
            position: camera.position.map((value: number, axis: number) => value + delta[axis]),
          })
          axialViewport.render?.()
        }
        const dentalViewport = engine.getViewport(viewportIds[3])
        applyDentalVolumeRendering(dentalViewport, scalarData, 'teeth')
        orientDentalVolume(dentalViewport, volume)
      } catch (openError) {
        cleanup()
        if (!disposed) setError(openError instanceof Error ? openError.message : 'CBCT hacmi oluşturulamadı.')
      } finally { if (!disposed) setLoading(false) }
    }
    void open()
    return () => { disposed = true; cleanup() }
  }, [cleanup, engineId, files, toolGroupId, viewportIds, volumeId, volumeToolGroupId])

  useEffect(() => {
    if (!cprVolumeRef.current || archPoints.length < 2) {
      setCprResult(null)
      return
    }
    setCprError(null)
    let disposed = false
    const timer = window.setTimeout(async () => {
      try {
        const volume = cprVolumeRef.current!
        if (cprWorkerRef.current?.volume !== volume) {
          cprWorkerRef.current?.client.dispose()
          cprWorkerRef.current = { volume, client: new CprWorkerClient(volume) }
        }
        const result = await cprWorkerRef.current.client.reconstruct({
          arch: archPoints,
          panoramaHeight: Math.min(520, Number(cprVolumeRef.current!.dimensions[2])),
          panoramaThicknessMm,
          panoramaProjection,
          selectedPosition,
          crossSectionCount: 5,
          crossSectionStepMm: sectionStepMm,
          crossSectionThicknessMm: sectionThicknessMm,
        })
        if (disposed) return
        setCprResult(result)
      } catch (cprGenerationError) {
        if (disposed || (cprGenerationError instanceof Error && cprGenerationError.name === 'AbortError')) return
        // Keep the MPR/3D view usable, but never leave a silent black canvas.
        // This also makes malformed or unsupported pixel buffers diagnosable.
        setCprResult(null)
        setCprError(cprGenerationError instanceof Error ? cprGenerationError.message : 'Panoramik CPR oluşturulamadı.')
      }
    }, 60)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      cprWorkerRef.current?.client.cancel()
    }
  }, [archPoints, panoramaProjection, panoramaThicknessMm, sectionStepMm, sectionThicknessMm, selectedPosition])

  useEffect(() => { window.setTimeout(() => sessionRef.current?.engine?.resize(true, true), 0) }, [layout])

  useEffect(() => {
    const element = axialRef.current
    const session = sessionRef.current
    if (!element || !session?.volume?.imageData || !archPoints.length || loading) return
    const update = () => {
      const viewport = session.engine.getViewport(viewportIds[0])
      const focalPoint = viewport?.getCamera?.()?.focalPoint
      if (!viewport?.worldToCanvas || !focalPoint) return
      const focalIndex = session.core.utilities.transformWorldToIndex(session.volume.imageData, focalPoint)
      const spacing = cprVolumeRef.current?.spacing ?? [1, 1, 1]
      const sx = Math.abs(Number(spacing[0])) || 1
      const sy = Math.abs(Number(spacing[1])) || 1
      const toCanvas = (point: ArchPoint) => {
        const world = session.core.utilities.transformIndexToWorld(session.volume.imageData, [point.x, point.y, focalIndex[2]])
        const canvas = viewport.worldToCanvas(world)
        return { x: Number(canvas[0]), y: Number(canvas[1]) }
      }
      const controlPoints = archPoints.map(toCanvas)
      const centreVoxels = interpolateDentalArch(archPoints, 10)
      const halfSlabMm = panoramaThicknessMm / 2
      const offsetCurve = (distanceMm: number) => centreVoxels.map((point, index) => {
        const before = centreVoxels[Math.max(0, index - 1)]
        const after = centreVoxels[Math.min(centreVoxels.length - 1, index + 1)]
        const dxMm = (after.x - before.x) * sx
        const dyMm = (after.y - before.y) * sy
        const lengthMm = Math.hypot(dxMm, dyMm) || 1
        const normal = { x: -dyMm / lengthMm, y: dxMm / lengthMm }
        return { x: point.x + normal.x * distanceMm / sx, y: point.y + normal.y * distanceMm / sy }
      })
      const arcEnd = dentalArchFrameAt(archPoints, 1, [sx, sy])
      const centrePositionMm = selectedPosition * arcEnd.distanceMm
      // DenCT uses a 50 mm buccolingual indicator. A fixed physical length
      // makes the perpendicular angle readable at every zoom level and keeps
      // the cut plane independent from panoramic slab thickness.
      const guideHalfLengthMm = 25
      // Meyer shows one editable cutting plane on the axial view. The five
      // serial sections are derived around this centre in physical arc-length;
      // drawing all five lines here obscures the teeth and suggests five
      // independently adjustable angles.
      const frame = dentalArchFrameAt(archPoints, centrePositionMm / Math.max(arcEnd.distanceMm, 1e-6), [sx, sy])
      const guides = [{
        a: toCanvas({ x: frame.x - frame.normal.x * guideHalfLengthMm / sx, y: frame.y - frame.normal.y * guideHalfLengthMm / sy }),
        b: toCanvas({ x: frame.x + frame.normal.x * guideHalfLengthMm / sx, y: frame.y + frame.normal.y * guideHalfLengthMm / sy }),
        centre: toCanvas(frame),
        active: true,
      }]
      const inner = offsetCurve(-halfSlabMm).map(toCanvas)
      const outer = offsetCurve(halfSlabMm).map(toCanvas)
      const next: ArchOverlayGeometry = {
        controlPoints,
        centre: centreVoxels.map(toCanvas),
        inner,
        outer,
        caps: inner.length && outer.length ? [
          { a: inner[0], b: outer[0] },
          { a: inner[inner.length - 1], b: outer[outer.length - 1] },
        ] : [],
        guides,
      }
      const allPoints = [...next.controlPoints, ...next.centre, ...next.inner, ...next.outer, ...next.caps.flatMap((cap) => [cap.a, cap.b]), ...next.guides.flatMap((guide) => [guide.a, guide.b, guide.centre])]
      if (allPoints.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) setArchOverlay(next)
    }
    const cameraEvent = session.core.Enums.Events.CAMERA_MODIFIED
    element.addEventListener(cameraEvent, update)
    const observer = new ResizeObserver(() => {
      session.engine.resize(true, true)
      window.requestAnimationFrame(update)
    })
    observer.observe(element)
    update()
    return () => {
      element.removeEventListener(cameraEvent, update)
      observer.disconnect()
    }
  }, [archPoints, loading, panoramaThicknessMm, selectedPosition, viewportIds])

  useEffect(() => {
    if (!cprResult) return
    const draw = (canvas: HTMLCanvasElement | null, image: ImageData) => {
      if (!canvas) return
      canvas.width = image.width; canvas.height = image.height
      canvas.getContext('2d')?.putImageData(image, 0, 0)
    }
    draw(panoramaRef.current, cprResult.panorama)
    if (!crossSectionsRef.current) return
    const width = cprResult.crossSections.reduce((sum, section) => sum + section.image.width, 0)
    const height = Math.max(...cprResult.crossSections.map(section => section.image.height))
    crossSectionsRef.current.width = width; crossSectionsRef.current.height = height
    const context = crossSectionsRef.current.getContext('2d')
    let x = 0
    cprResult.crossSections.forEach((section, index) => {
      context?.putImageData(section.image, x, 0)
      if (context) {
        context.save()
        context.strokeStyle = index === Math.floor(cprResult.crossSections.length / 2) ? '#38bdf8' : '#10b981'
        context.fillStyle = context.strokeStyle
        context.lineWidth = 2
        context.strokeRect(x + 1, 1, section.image.width - 2, section.image.height - 2)
        context.font = '18px system-ui, sans-serif'
        context.fillText(`${Math.round(section.positionMm / sectionStepMm)}`, x + 8, 24)
        context.restore()
      }
      x += section.image.width
    })
    if (context && implantPlan) {
      const centreIndex = Math.floor(cprResult.crossSections.length / 2)
      const section = cprResult.crossSections[centreIndex]
      const sectionX = cprResult.crossSections.slice(0, centreIndex).reduce((sum, item) => sum + item.image.width, 0)
      const xScale = section.image.width / Math.max(section.widthMm, 1)
      const yScale = section.image.height / Math.max(section.heightMm, 1)
      const implantWidth = implantPlan.diameterMm * xScale
      const implantLength = implantPlan.lengthMm * yScale
      const entryY = implantPlan.entryHeight * section.image.height
      context.save()
      context.translate(sectionX + section.image.width / 2, entryY)
      context.rotate(implantPlan.angleDeg * Math.PI / 180)
      context.strokeStyle = '#fbbf24'
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(-implantWidth / 2, 0)
      context.lineTo(-implantWidth / 2, implantLength * 0.86)
      context.lineTo(0, implantLength)
      context.lineTo(implantWidth / 2, implantLength * 0.86)
      context.lineTo(implantWidth / 2, 0)
      context.closePath()
      context.stroke()
      context.restore()
    }
  }, [cprResult, implantPlan, layout, sectionStepMm])

  const selectPanoramaPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    setSelectedPosition(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)))
  }

  const selectImplantEntry = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (clinicalTool !== 'implant' || !implantPlan) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.height <= 0) return
    const entryHeight = Math.min(0.9, Math.max(0.05, (event.clientY - rect.top) / rect.height))
    setImplantPlan((plan) => plan ? { ...plan, entryHeight } : plan)
  }

  const runFullDentalSegmentator = async () => {
    if (dentalSegmentatorRunning) return
    const session = sessionRef.current
    const volume = cprVolumeRef.current
    if (!session?.volume?.imageData || !volume) {
      setDentalSegmentatorStatus('Önce bir CBCT serisi yükleyin.')
      return
    }
    setDentalSegmentatorRunning(true)
    setDentalSegmentatorStatus('DentalSegmentator işi başlatılıyor…')
    try {
      const focalPoint = session.engine.getViewport(viewportIds[0])?.getCamera?.()?.focalPoint
      const index = focalPoint ? session.core.utilities.transformWorldToIndex(session.volume.imageData, focalPoint) : null
      const result = await runDentalSegmentator(files, Number(index?.[2] ?? Math.floor(Number(volume.dimensions[2]) / 2)), {
        onProgress: (progress) => setDentalSegmentatorStatus(`DentalSegmentator · ${progress}`),
      })
      const nextPoints = result.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      if (nextPoints.length < 4) throw new Error('DentalSegmentator geçerli dental arch üretmedi.')
      setArchPoints(nextPoints)
      setSelectedPosition(dentalArchApexPosition(nextPoints, [Number(volume.spacing?.[0]) || 1, Number(volume.spacing?.[1]) || 1]))
      // The service fits the arch on this exact DICOM slice.  Keeping the old
      // MPR focal plane made a correct result look like a misplaced axial arc.
      const axialViewport = session.engine.getViewport(viewportIds[0])
      const camera = axialViewport?.getCamera?.()
      const targetSlice = Math.min(Number(volume.dimensions[2]) - 1, Math.max(0, Math.round(Number(result.axialSlice))))
      if (camera && Number.isFinite(targetSlice)) {
        const currentIndex = session.core.utilities.transformWorldToIndex(session.volume.imageData, camera.focalPoint)
        const focalPoint = session.core.utilities.transformIndexToWorld(session.volume.imageData, [currentIndex[0], currentIndex[1], targetSlice])
        const delta = focalPoint.map((value: number, axis: number) => value - camera.focalPoint[axis])
        axialViewport.setCamera({
          focalPoint,
          position: camera.position.map((value: number, axis: number) => value + delta[axis]),
        })
        axialViewport.render?.()
      }
      setDentalSegmentatorStatus(`DentalSegmentator · ${result.jaw === 'upper' ? 'üst' : 'alt'} çene · ${(result.confidence * 100).toFixed(0)}% · ${Math.round((result.durationMs || 0) / 1000)} sn`)
      setLayout('cpr')
      restoreCprAxialOrientation()
    } catch (segmentatorError) {
      setDentalSegmentatorStatus(segmentatorError instanceof Error ? segmentatorError.message : 'DentalSegmentator başarısız; mevcut otomatik arch korunuyor.')
    } finally {
      setDentalSegmentatorRunning(false)
    }
  }

  const activateMprTool = (tool: MprTool) => {
    const session = sessionRef.current
    if (!session) return
    const { tools, toolGroup } = session
    const toolMap = { crosshair: tools.CrosshairsTool, pan: tools.PanTool, zoom: tools.ZoomTool, windowLevel: tools.WindowLevelTool, length: tools.LengthTool, angle: tools.AngleTool }
    Object.values(toolMap).forEach((entry: any) => toolGroup.setToolPassive(entry.toolName, { removeAllBindings: true }))
    toolGroup.setToolActive(toolMap[tool].toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] })
    toolGroup.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] })
    setClinicalTool(tool)
  }

  const restoreCprAxialOrientation = () => {
    // Crosshairs in MPR may leave the first viewport on an oblique plane.
    // The dental arch is defined in acquisition I/J coordinates, therefore
    // its overlay and perpendiculars are valid only after restoring the true
    // DICOM axial plane. Keep the current focal point/slice while resetting
    // the camera orientation.
    window.requestAnimationFrame(() => {
      const session = sessionRef.current
      if (!session) return
      const viewport = session.engine.getViewport(viewportIds[0])
      const focalPoint = viewport?.getCamera?.()?.focalPoint
      viewport?.setOrientation?.(session.core.Enums.OrientationAxis.AXIAL, false)
      if (focalPoint) viewport?.setCamera?.({ focalPoint })
      session.engine.resize(true, true)
      viewport?.render?.()
    })
  }

  const setClinical = (tool: ClinicalTool) => {
    setClinicalTool(tool)
    if (tool === 'nerve') setNerveVisible((value) => !value)
    if (tool === 'implant') {
      setLayout('cpr')
      restoreCprAxialOrientation()
      setImplantPlan((plan) => plan ?? { diameterMm: 4, lengthMm: 10, angleDeg: 0, entryHeight: 0.28 })
    }
    if (tool === 'tooth') setDentalPreset('teeth')
    if (tool === 'crosshair' || tool === 'pan' || tool === 'zoom' || tool === 'windowLevel' || tool === 'length' || tool === 'angle') activateMprTool(tool)
  }

  const updateArchPoint = (event: React.PointerEvent<SVGCircleElement>, index: number) => {
    const svg = event.currentTarget.ownerSVGElement
    const session = sessionRef.current
    if (!svg || !cprVolumeRef.current || !session?.volume?.imageData) return
    const rect = svg.getBoundingClientRect()
    const viewport = session.engine.getViewport(viewportIds[0])
    const world = viewport?.canvasToWorld?.([event.clientX - rect.left, event.clientY - rect.top])
    if (!world) return
    const indexPoint = session.core.utilities.transformWorldToIndex(session.volume.imageData, world)
    const [width, height] = cprVolumeRef.current.dimensions
    const x = Math.min(width - 1, Math.max(0, indexPoint[0]))
    const y = Math.min(height - 1, Math.max(0, indexPoint[1]))
    setArchPoints((points) => points.map((point, pointIndex) => pointIndex === index ? { x, y } : point))
  }

  const updateSectionGuide = (event: React.PointerEvent<SVGElement>) => {
    const svg = event.currentTarget.ownerSVGElement
    const session = sessionRef.current
    const volume = cprVolumeRef.current
    if (!svg || !volume || !session?.volume?.imageData || archPoints.length < 2) return
    const rect = svg.getBoundingClientRect()
    const viewport = session.engine.getViewport(viewportIds[0])
    const world = viewport?.canvasToWorld?.([event.clientX - rect.left, event.clientY - rect.top])
    if (!world) return
    const indexPoint = session.core.utilities.transformWorldToIndex(session.volume.imageData, world)
    const sx = Math.abs(Number(volume.spacing?.[0])) || 1
    const sy = Math.abs(Number(volume.spacing?.[1])) || 1
    const curve = resampleDentalArch(archPoints, 600, [sx, sy])
    let nearestIndex = 0
    let nearestDistance = Infinity
    curve.forEach((point, index) => {
      const distance = Math.hypot((point.x - indexPoint[0]) * sx, (point.y - indexPoint[1]) * sy)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })
    setSelectedPosition(nearestIndex / Math.max(1, curve.length - 1))
  }

  const reset = () => viewportIds.forEach((viewportId, index) => {
    const viewport = sessionRef.current?.engine?.getViewport(viewportId)
    viewport?.resetCamera()
    if (index === 3 && cprVolumeRef.current) {
      applyDentalVolumeRendering(viewport, cprVolumeRef.current.scalarData, renderMode)
      orientDentalVolume(viewport, sessionRef.current?.volume)
    } else {
      viewport?.resetProperties()
      viewport?.render()
    }
  })
  const setDentalPreset = (nextMode: DentalVolumeMode) => {
    const viewport = sessionRef.current?.engine?.getViewport(viewportIds[3])
    if (viewport && cprVolumeRef.current) applyDentalVolumeRendering(viewport, cprVolumeRef.current.scalarData, nextMode)
    setRenderMode(nextMode)
  }
  const selectModule = (tab: 'MPR' | 'Panorama3D' | 'CPR' | 'Implant') => {
    if (tab === 'MPR') setLayout('mpr')
    if (tab === 'Panorama3D') setLayout('focus3d')
    if (tab === 'CPR') {
      setLayout('cpr')
      setClinicalTool('crosshair')
      restoreCprAxialOrientation()
    }
    if (tab === 'Implant') setClinical('implant')
  }
  const activeModule = clinicalTool === 'implant' && layout === 'cpr' ? 'Implant' : layout === 'mpr' ? 'MPR' : layout === 'focus3d' ? 'Panorama3D' : 'CPR'

  if (error) return <div className={styles.message}>⚠️ {error}<button type="button" onClick={onClose} className={styles.button}>Geri dön</button></div>
  const refs = [axialRef, coronalRef, sagittalRef, volumeRef]
  return <section className={styles.workspace} aria-label="Dental CBCT çalışma alanı">
    <header className={styles.topbar}><div className={styles.headerActions}><button type="button" onClick={() => setToolsOpen((open) => !open)} className={`${styles.toolbarToggle} ${toolsOpen ? styles.toolbarToggleActive : ''}`} aria-expanded={toolsOpen} aria-controls={`cbct-tools-${instanceId}`}><SlidersHorizontal size={13} />Araçlar</button><button type="button" onClick={reset} className={styles.iconButton} title="Görünümü sıfırla"><RotateCcw size={14} /></button><button type="button" onClick={onClose} className={styles.iconButton} title="Kapat"><X size={14} /></button></div></header>
    <nav className={styles.moduleTabs} aria-label="Görüntüleme modülleri">{(['MPR', 'Panorama3D', 'CPR', 'Implant'] as const).map((tab) => <button key={tab} type="button" className={`${styles.moduleTab} ${tab === activeModule ? styles.activeTab : ''}`} onClick={() => selectModule(tab)}>{tab}</button>)}</nav>
    {loading && <div className={styles.message}>{loadingMessage}</div>}
    <div className={`${styles.content} ${loading ? styles.hidden : ''}`}><main className={`${styles.viewportGrid} ${layout === 'cpr' ? styles.cprLayout : ''} ${layout === 'focus3d' ? styles.focus3d : ''}`}>{viewportNames.map((name, index) => <section key={name} className={`${styles.viewportPanel} ${activeViewport === index ? styles.activeViewport : ''} ${index === 3 ? styles.volumePanel : ''}`}><div className={styles.viewportLabel}><span>{layout === 'cpr' && index === 1 ? 'Panoramik CPR' : layout === 'cpr' && index === 2 ? 'Dik dental kesitler' : name}</span><small>{layout === 'cpr' && index === 1 ? `${panoramaProjection} · ${panoramaThicknessMm} mm` : layout === 'cpr' && index === 2 ? `5 kesit · ${sectionStepMm} mm aralık` : index === 3 ? 'Volume rendering' : index === 0 ? 'R / L · A / P' : 'Senkron MPR'}</small></div><div ref={refs[index]} onPointerDown={() => setActiveViewport(index)} className={styles.canvas} tabIndex={0} aria-label={`${name} CBCT viewportu`} />{layout === 'cpr' && index === 0 && archOverlay && <svg className={styles.archOverlay} viewBox={`0 0 ${axialRef.current?.clientWidth ?? 1} ${axialRef.current?.clientHeight ?? 1}`} preserveAspectRatio="none"><polyline points={archOverlay.inner.map((point) => `${point.x},${point.y}`).join(' ')} className={styles.archBoundary} /><polyline points={archOverlay.outer.map((point) => `${point.x},${point.y}`).join(' ')} className={styles.archBoundary} />{archOverlay.caps.map((cap, capIndex) => <line key={`cap-${capIndex}`} x1={cap.a.x} y1={cap.a.y} x2={cap.b.x} y2={cap.b.y} className={styles.archBoundary} />)}<polyline points={archOverlay.centre.map((point) => `${point.x},${point.y}`).join(' ')} className={styles.archLine} />{archOverlay.guides.map((guide, guideIndex) => <g key={guideIndex} className={guide.active ? styles.activeGuideGroup : undefined} onPointerDown={guide.active ? (event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); draggingSectionGuideRef.current = true; updateSectionGuide(event) } : undefined} onPointerMove={guide.active ? (event) => draggingSectionGuideRef.current && updateSectionGuide(event) : undefined} onPointerUp={guide.active ? () => { draggingSectionGuideRef.current = false } : undefined} onPointerCancel={guide.active ? () => { draggingSectionGuideRef.current = false } : undefined}><line x1={guide.a.x} y1={guide.a.y} x2={guide.b.x} y2={guide.b.y} className={guide.active ? styles.activeSectionGuide : styles.sectionGuide} />{guide.active ? <circle cx={guide.centre.x} cy={guide.centre.y} r={7} className={styles.activeGuidePoint} /> : <circle cx={guide.centre.x} cy={guide.centre.y} r={2.5} className={styles.guidePoint} />}</g>)}{archOverlay.controlPoints.map((point, pointIndex) => <circle key={pointIndex} cx={point.x} cy={point.y} r={5} className={styles.archPoint} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDraggedArchPoint(pointIndex) }} onPointerMove={(event) => draggedArchPoint === pointIndex && updateArchPoint(event, pointIndex)} onPointerUp={() => setDraggedArchPoint(null)} />)}</svg>}{layout === 'cpr' && index === 1 && <><canvas ref={panoramaRef} className={styles.cprCanvas} onPointerDown={selectPanoramaPosition} />{!cprResult && <span className={styles.cprStatus}>{cprError ?? 'Panoramik CPR hazırlanıyor…'}</span>}</>}{layout === 'cpr' && index === 2 && <><canvas ref={crossSectionsRef} className={styles.cprCanvas} onPointerDown={selectImplantEntry} />{!cprResult && <span className={styles.cprStatus}>{cprError ?? 'Dik dental kesitler hazırlanıyor…'}</span>}</>}{index === 3 && <span className={styles.canvasHint}>Sol: döndür · sağ: zoom</span>}{index === 3 && implantPlan && <span className={styles.implantBadge}>İmplant {implantPlan.diameterMm.toFixed(1)} × {implantPlan.lengthMm.toFixed(1)} mm</span>}{index === 3 && nerveVisible && <span className={styles.nerveBadge}>Sinir aracı aktif</span>}</section>)}</main>
      {toolsOpen && <aside id={`cbct-tools-${instanceId}`} className={styles.toolsPanel} aria-label="CBCT araçları"><div className={styles.toolsPanelHeader}><strong>CBCT araçları</strong><button type="button" onClick={() => setToolsOpen(false)} className={styles.iconButton} title="Araçları kapat"><X size={14} /></button></div><PanelTitle icon={<MousePointer2 size={15} />} title="Function" /><div className={styles.toolGrid}><ToolButton active={clinicalTool === 'crosshair'} onClick={() => setClinical('crosshair')} icon={<Crosshair size={16} />} label="Kesit" /><ToolButton active={clinicalTool === 'pan'} onClick={() => setClinical('pan')} icon={<Hand size={16} />} label="Kaydır" /><ToolButton active={clinicalTool === 'zoom'} onClick={() => setClinical('zoom')} icon={<ZoomIn size={16} />} label="Zoom" /><ToolButton active={clinicalTool === 'windowLevel'} onClick={() => setClinical('windowLevel')} icon={<SlidersHorizontal size={16} />} label="Image" /><ToolButton active={clinicalTool === 'length'} onClick={() => setClinical('length')} icon={<Ruler size={16} />} label="Mesafe" /><ToolButton active={clinicalTool === 'angle'} onClick={() => setClinical('angle')} icon={<Triangle size={16} />} label="Açı" /><ToolButton active={clinicalTool === 'nerve'} onClick={() => setClinical('nerve')} icon={<Activity size={16} />} label="Sinir" /><ToolButton active={dentalSegmentatorRunning} onClick={() => { void runFullDentalSegmentator() }} icon={<Target size={16} />} label={dentalSegmentatorRunning ? "Segmentasyon…" : "DentalSegmentator"} /></div>{dentalSegmentatorStatus && <p className={styles.note} role="status">{dentalSegmentatorStatus}</p>}<div className={styles.divider} /><PanelTitle icon={<Rotate3D size={15} />} title="3D Rendering" /><div className={styles.stack}><button type="button" onClick={() => setDentalPreset('teeth')} className={`${styles.button} ${renderMode === 'teeth' ? styles.selected : ''}`}>Teeth</button><button type="button" onClick={() => setDentalPreset('bone')} className={`${styles.button} ${renderMode === 'bone' ? styles.selected : ''}`}>Bone</button><button type="button" onClick={() => setDentalPreset('soft')} className={`${styles.button} ${renderMode === 'soft' ? styles.selected : ''}`}>Soft tissue</button></div><label className={styles.sliderLabel}>Panorama kalınlığı · {panoramaThicknessMm} mm<input type="range" min="2" max="40" step="1" value={panoramaThicknessMm} onChange={(event) => setPanoramaThicknessMm(Number(event.target.value))} /></label><div className={styles.stack}><button type="button" className={`${styles.button} ${panoramaProjection === 'AVG' ? styles.selected : ''}`} onClick={() => setPanoramaProjection('AVG')}>AVG</button><button type="button" className={`${styles.button} ${panoramaProjection === 'MIP' ? styles.selected : ''}`} onClick={() => setPanoramaProjection('MIP')}>MIP</button></div><label className={styles.sliderLabel}>Kesit aralığı · {sectionStepMm.toFixed(1)} mm<input type="range" min="0.5" max="5" step="0.5" value={sectionStepMm} onChange={(event) => setSectionStepMm(Number(event.target.value))} /></label><label className={styles.sliderLabel}>Kesit kalınlığı · {sectionThicknessMm.toFixed(1)} mm<input type="range" min="0" max="3" step="0.2" value={sectionThicknessMm} onChange={(event) => setSectionThicknessMm(Number(event.target.value))} /></label><div className={styles.divider} /><PanelTitle icon={<Move size={15} />} title="Dental CPR" /><p className={styles.note}>Ark, görüntü yüklenirken otomatik hesaplanır. Aksiyeldeki mavi kesit doğrusunu sürükleyerek konumu düzenleyebilirsiniz; beş kesit merkez noktanın iki yanından eşit mm aralıkla üretilir.</p>{implantPlan && <><div className={styles.divider} /><PanelTitle icon={<Target size={15} />} title="İmplant planlama" /><p className={styles.note}>Panoramadan konumu, merkez dik kesitten giriş seviyesini seçin.</p><label className={styles.sliderLabel}>Çap · {implantPlan.diameterMm.toFixed(1)} mm<input type="range" min="2" max="8" step="0.1" value={implantPlan.diameterMm} onChange={(event) => setImplantPlan((plan) => plan ? { ...plan, diameterMm: Number(event.target.value) } : plan)} /></label><label className={styles.sliderLabel}>Uzunluk · {implantPlan.lengthMm.toFixed(1)} mm<input type="range" min="6" max="18" step="0.5" value={implantPlan.lengthMm} onChange={(event) => setImplantPlan((plan) => plan ? { ...plan, lengthMm: Number(event.target.value) } : plan)} /></label><label className={styles.sliderLabel}>Açı · {implantPlan.angleDeg}°<input type="range" min="-35" max="35" step="1" value={implantPlan.angleDeg} onChange={(event) => setImplantPlan((plan) => plan ? { ...plan, angleDeg: Number(event.target.value) } : plan)} /></label><button type="button" className={styles.button} onClick={() => { setImplantPlan(null); setClinicalTool('crosshair') }}>İmplantı kaldır</button></>}</aside>}</div>
    {!loading && <footer className={styles.footer}><Crosshair size={14} /> Aktif kesit konumu axial, coronal ve sagittal görünümlerde senkronize edilir.</footer>}
  </section>
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) { return <h2 className={styles.panelTitle}>{icon}{title}</h2> }
function ToolButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={`${styles.toolButton} ${active ? styles.selected : ''}`}>{icon}<span>{label}</span></button> }
