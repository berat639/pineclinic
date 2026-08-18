'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
type DrawTool = 'pen' | 'line' | 'arrow' | 'circle' | 'rect' | 'text' | 'eraser' | 'pan'
type DrawSize = 'thin' | 'medium' | 'thick'

interface DrawAction {
  tool: DrawTool
  color: string
  size: DrawSize
  points?: { x: number; y: number }[]
  startX?: number
  startY?: number
  endX?: number
  endY?: number
  text?: string
}

interface DicomViewerProps {
  dcmUrl?: string | null
  onClose?: () => void
  isModal?: boolean
}

const DRAW_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff', '#000000']
const SIZE_MAP: Record<DrawSize, number> = { thin: 1, medium: 3, thick: 5 }

const TOOLS: { id: DrawTool; icon: string; label: string }[] = [
  { id: 'pan', icon: '🖐️', label: 'Kaydır' },
  { id: 'pen', icon: '✏️', label: 'Kalem' },
  { id: 'line', icon: '📏', label: 'Çizgi' },
  { id: 'arrow', icon: '➤', label: 'Ok' },
  { id: 'circle', icon: '⭕', label: 'Daire' },
  { id: 'rect', icon: '▭', label: 'Dikdörtgen' },
  { id: 'text', icon: '📝', label: 'Metin' },
  { id: 'eraser', icon: '🧹', label: 'Silgi' },
]

// ── DICOM Parser (using daikon) ────────────────────────────────────────────
async function parseDicomToImageData(arrayBuffer: ArrayBuffer): Promise<{ imageData: ImageData; width: number; height: number } | null> {
  try {
    // @ts-ignore
    const daikon = await import('daikon')
    const data = new DataView(arrayBuffer)
    const image = daikon.Series.parseImage(data)
    if (!image) return null

    const cols = image.getCols()
    const rows = image.getRows()
    const pixelData = image.getInterpretedData(false, true)

    if (!pixelData || !cols || !rows) return null

    // Daha yüksek kaliteli görünüm için DICOM metadata üzerinden Windowing hesaplaması
    let wc = image.getWindowCenter()
    let ww = image.getWindowWidth()

    // DICOM etiketleri bazen dizi (array) dönebilir
    if (Array.isArray(wc)) wc = wc[0]
    if (Array.isArray(ww)) ww = ww[0]

    let windowMin = 0
    let windowMax = 0

    if (wc !== undefined && wc !== null && ww !== undefined && ww !== null) {
      windowMin = wc - ww / 2
      windowMax = wc + ww / 2
    } else {
      // Eğer DICOM dosyasında Window Center/Width yoksa klasik min/max yöntemini kullan
      let min = Infinity, max = -Infinity
      for (let i = 0; i < pixelData.data.length; i++) {
        const v = pixelData.data[i]
        if (v < min) min = v
        if (v > max) max = v
      }
      windowMin = min
      windowMax = max
    }

    const canvas = document.createElement('canvas')
    canvas.width = cols
    canvas.height = rows
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(cols, rows)
    const range = windowMax - windowMin || 1

    for (let i = 0; i < pixelData.data.length; i++) {
      let v = pixelData.data[i]
      // Windowing sınırlarına göre piksel değerini kırp
      if (v <= windowMin) v = windowMin
      else if (v >= windowMax) v = windowMax

      const normalized = Math.round(((v - windowMin) / range) * 255)
      const idx = i * 4
      imageData.data[idx] = normalized     // R
      imageData.data[idx + 1] = normalized // G
      imageData.data[idx + 2] = normalized // B
      imageData.data[idx + 3] = 255        // A
    }

    return { imageData, width: cols, height: rows }
  } catch (err) {
    console.error('DICOM parse error:', err)
    return null
  }
}

// ── Draw Canvas Logic ──────────────────────────────────────────────────────
function drawAllActions(ctx: CanvasRenderingContext2D, actions: DrawAction[], width: number, height: number, viewZoom: number = 1) {
  ctx.clearRect(0, 0, width, height)

  for (const action of actions) {
    ctx.strokeStyle = action.color
    ctx.fillStyle = action.color
    ctx.lineWidth = SIZE_MAP[action.size] / viewZoom
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (action.tool === 'pen' && action.points) {
      ctx.beginPath()
      for (let i = 0; i < action.points.length; i++) {
        const p = action.points[i]!
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
    }

    if (action.tool === 'eraser' && action.points) {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = (SIZE_MAP[action.size] * 6) / viewZoom
      ctx.beginPath()
      for (let i = 0; i < action.points.length; i++) {
        const p = action.points[i]!
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
      ctx.restore()
    }

    if (action.tool === 'line' && action.startX !== undefined) {
      ctx.beginPath()
      ctx.moveTo(action.startX, action.startY!)
      ctx.lineTo(action.endX!, action.endY!)
      ctx.stroke()
    }

    if (action.tool === 'arrow' && action.startX !== undefined) {
      const sx = action.startX, sy = action.startY!
      const ex = action.endX!, ey = action.endY!
      const angle = Math.atan2(ey - sy, ex - sx)
      const headLen = 12

      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(ex, ey)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
    }

    if (action.tool === 'circle' && action.startX !== undefined) {
      const cx = (action.startX + action.endX!) / 2
      const cy = (action.startY! + action.endY!) / 2
      const rx = Math.abs(action.endX! - action.startX) / 2
      const ry = Math.abs(action.endY! - action.startY!) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    if (action.tool === 'rect' && action.startX !== undefined) {
      ctx.strokeRect(
        action.startX, action.startY!,
        action.endX! - action.startX, action.endY! - action.startY!
      )
    }

    if (action.tool === 'text' && action.text && action.startX !== undefined) {
      ctx.font = `${(SIZE_MAP[action.size] * 5 + 10) / viewZoom}px Inter, sans-serif`
      ctx.fillText(action.text, action.startX, action.startY!)
    }
  }
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function DicomViewer({ dcmUrl, onClose, isModal }: DicomViewerProps) {
  // DICOM state
  const [dicomImage, setDicomImage] = useState<ImageData | null>(null)
  const [dicomSize, setDicomSize] = useState({ width: 512, height: 512 })
  const [loadingDcm, setLoadingDcm] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Draw state
  const [tool, setTool] = useState<DrawTool>('pen')
  const [color, setColor] = useState('#ef4444')
  const [size, setSize] = useState<DrawSize>('medium')
  const [actions, setActions] = useState<DrawAction[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null)
  const [presentationMode, setPresentationMode] = useState(false)
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState('')

  // Gelişmiş Pan ve Zoom state'leri (Kısayol, Mobil Dokunmatik)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [initialPinchDist, setInitialPinchDist] = useState<number | null>(null)
  const [initialPinchZoom, setInitialPinchZoom] = useState<number>(1)
  const [initialPinchPan, setInitialPinchPan] = useState({ x: 0, y: 0 })
  const [initialPinchCenter, setInitialPinchCenter] = useState({ x: 0, y: 0 })

  // Boşluk tuşu (Figma tarzı geçici Pan) dinleyicisi
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Sadece input alanında değilsek çalışsın
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault()
        setIsSpacePressed(true)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // File upload
  const [localFile, setLocalFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Canvas refs
  const dicomCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null)
  const presentationContainerRef = useRef<HTMLDivElement>(null)

  // Zoom and Pan
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 })

  // Window/Level
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(100)

  // Load DICOM from URL
  useEffect(() => {
    if (!dcmUrl) return
    loadDicom(dcmUrl)
  }, [dcmUrl])

  async function loadDicom(url: string) {
    setLoadingDcm(true)
    setErrorMsg('')
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('Dosya yüklenemedi')
      const ab = await res.arrayBuffer()
      const result = await parseDicomToImageData(ab)
      if (!result) throw new Error('DICOM parse edilemedi')
      setDicomImage(result.imageData)
      setDicomSize({ width: result.width, height: result.height })
    } catch (err: any) {
      setErrorMsg(err.message || 'Hata oluştu')
    } finally {
      setLoadingDcm(false)
    }
  }

  async function handleFileUpload(file: File) {
    setLocalFile(file)
    setLoadingDcm(true)
    setErrorMsg('')
    try {
      const ab = await file.arrayBuffer()
      const result = await parseDicomToImageData(ab)
      if (!result) throw new Error('DICOM parse edilemedi')
      setDicomImage(result.imageData)
      setDicomSize({ width: result.width, height: result.height })
    } catch (err: any) {
      setErrorMsg(err.message || 'Hata oluştu')
    } finally {
      setLoadingDcm(false)
    }
  }

  // Render DICOM on canvas
  useEffect(() => {
    if (!dicomImage || !dicomCanvasRef.current) return
    const canvas = dicomCanvasRef.current
    canvas.width = dicomSize.width
    canvas.height = dicomSize.height
    const ctx = canvas.getContext('2d')!
    ctx.filter = `brightness(${100 + brightness}%) contrast(${contrast}%)`
    ctx.putImageData(dicomImage, 0, 0)
    // Re-apply filter by drawing canvas onto itself through a temp canvas
    if (brightness !== 0 || contrast !== 100) {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = dicomSize.width
      tempCanvas.height = dicomSize.height
      const tempCtx = tempCanvas.getContext('2d')!
      tempCtx.putImageData(dicomImage, 0, 0)
      ctx.clearRect(0, 0, dicomSize.width, dicomSize.height)
      ctx.filter = `brightness(${100 + brightness}%) contrast(${contrast}%)`
      ctx.drawImage(tempCanvas, 0, 0)
    }
  }, [dicomImage, dicomSize, brightness, contrast, presentationMode])

  // Render draw actions
  useEffect(() => {
    if (!drawCanvasRef.current) return
    const canvas = drawCanvasRef.current
    
    // Yüksek kalite için çözünürlüğü artır (yakınlaştırma miktarına ve ekranın pixel rasyosuna göre)
    const renderScale = Math.max(1, zoom) * (window.devicePixelRatio || 1)
    canvas.width = dicomSize.width * renderScale
    canvas.height = dicomSize.height * renderScale
    
    const ctx = canvas.getContext('2d')!
    ctx.scale(renderScale, renderScale)
    
    const allActions = currentAction ? [...actions, currentAction] : actions
    drawAllActions(ctx, allActions, dicomSize.width, dicomSize.height, zoom)
  }, [actions, currentAction, dicomSize, presentationMode, zoom])

  // Drawing handlers
  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    // Dış container (unscaled) boyutlarına göre DICOM koordinatlarına dönüştürme
    const baseScaleX = rect.width / dicomSize.width
    const baseScaleY = rect.height / dicomSize.height
    
    return {
      x: (mouseX - pan.x) / (baseScaleX * zoom),
      y: (mouseY - pan.y) / (baseScaleY * zoom),
    }
  }, [dicomSize, pan, zoom])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!presentationMode) return
    
    // El aracı seçiliyse veya Boşluk (Space) tuşuna basılı tutuluyorsa pan (kaydırma) yap
    if (tool === 'pan' || isSpacePressed) {
      setIsPanning(true)
      setLastPanPos({ x: e.clientX, y: e.clientY })
      return
    }

    const pos = getCanvasPos(e)

    if (tool === 'text') {
      setTextInput(pos)
      return
    }

    setIsDrawing(true)
    if (tool === 'pen' || tool === 'eraser') {
      setCurrentAction({ tool, color, size, points: [pos] })
    } else {
      setCurrentAction({ tool, color, size, startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y })
    }
  }, [tool, color, size, presentationMode, getCanvasPos, isSpacePressed])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!presentationMode) return
    
    // Pan yapıyorsak (araç pan ise veya space basılıysa isPanning true olur)
    if (isPanning) {
      const dx = e.clientX - lastPanPos.x
      const dy = e.clientY - lastPanPos.y
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      setLastPanPos({ x: e.clientX, y: e.clientY })
      return
    }

    if (!isDrawing || !currentAction) return
    const pos = getCanvasPos(e)

    if (currentAction.tool === 'pen' || currentAction.tool === 'eraser') {
      setCurrentAction(prev => ({
        ...prev!,
        points: [...(prev!.points || []), pos],
      }))
    } else {
      setCurrentAction(prev => ({ ...prev!, endX: pos.x, endY: pos.y }))
    }
  }, [isDrawing, currentAction, presentationMode, getCanvasPos, isPanning, lastPanPos, tool])

  const handleMouseUp = useCallback(() => {
    if (isPanning) setIsPanning(false)
    if (!isDrawing || !currentAction) return
    setIsDrawing(false)
    setActions(prev => [...prev, currentAction])
    setCurrentAction(null)
  }, [isDrawing, currentAction, isPanning])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!presentationMode) return
    
    // Trackpad Pinch veya Ctrl+Tekerlek kombinasyonu (YAKINLAŞTIRMA / ZOOM)
    if (e.ctrlKey) {
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      setZoom(prevZoom => {
        // Pinch delta değerleri daha düşüktür, yumuşak bir geçiş için 0.01 kullanıyoruz
        const zoomFactor = Math.exp(-e.deltaY * 0.01)
        let nextZoom = prevZoom * zoomFactor
        nextZoom = Math.min(Math.max(nextZoom, 0.1), 20)
        
        if (nextZoom !== prevZoom) {
          setPan(prevPan => {
            const canvasX = (mouseX - prevPan.x) / prevZoom
            const canvasY = (mouseY - prevPan.y) / prevZoom
            return {
              x: mouseX - canvasX * nextZoom,
              y: mouseY - canvasY * nextZoom
            }
          })
        }
        return nextZoom
      })
    } else {
      // Normal fare tekerleği veya Trackpad 2-parmak (KAYDIRMA / PAN)
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }))
    }
  }, [presentationMode])

  // Mobil Dokunmatik (Touch) Handlers
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (!presentationMode) return
    if (e.touches.length === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY)
      setInitialPinchDist(dist)
      setInitialPinchZoom(zoom)
      setInitialPinchPan(pan)
      
      const rect = e.currentTarget.getBoundingClientRect()
      const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left
      const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top
      setInitialPinchCenter({ x: centerX, y: centerY })
      setIsPanning(false)
      setIsDrawing(false)
      return
    }
    
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const simulatedEvent = {
        currentTarget: e.currentTarget,
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent<HTMLElement>
      handleMouseDown(simulatedEvent)
    }
  }, [presentationMode, zoom, pan, handleMouseDown])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (!presentationMode) return
    if (e.touches.length === 2 && initialPinchDist !== null) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY)
      
      const scale = dist / initialPinchDist
      let nextZoom = initialPinchZoom * scale
      nextZoom = Math.min(Math.max(nextZoom, 0.1), 20)
      
      const rect = e.currentTarget.getBoundingClientRect()
      const currentCenterX = (touch1.clientX + touch2.clientX) / 2 - rect.left
      const currentCenterY = (touch1.clientY + touch2.clientY) / 2 - rect.top
      
      setZoom(nextZoom)
      
      // Merkezi koruyarak ve parmakların hareketine göre pan yap
      const canvasX = (initialPinchCenter.x - initialPinchPan.x) / initialPinchZoom
      const canvasY = (initialPinchCenter.y - initialPinchPan.y) / initialPinchZoom
      
      setPan({
        x: currentCenterX - canvasX * nextZoom,
        y: currentCenterY - canvasY * nextZoom
      })
      return
    }
    
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const simulatedEvent = {
        currentTarget: e.currentTarget,
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent<HTMLElement>
      handleMouseMove(simulatedEvent)
    }
  }, [presentationMode, initialPinchDist, initialPinchZoom, initialPinchPan, initialPinchCenter, handleMouseMove])

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length < 2) {
      setInitialPinchDist(null)
    }
    if (e.touches.length === 0) {
      handleMouseUp()
    }
  }, [handleMouseUp])

  useEffect(() => {
    const el = presentationContainerRef.current
    if (!el || !presentationMode) return
    const preventNative = (e: WheelEvent) => {
      // Tarayıcının varsayılan pinch-to-zoom ve scroll davranışını engeller
      e.preventDefault()
    }
    // passive: false zorunludur, aksi takdirde preventDefault çalışmaz
    el.addEventListener('wheel', preventNative, { passive: false })
    return () => el.removeEventListener('wheel', preventNative)
  }, [presentationMode])

  const handleTextSubmit = useCallback(() => {
    if (textInput && textValue.trim()) {
      setActions(prev => [...prev, {
        tool: 'text',
        color,
        size,
        startX: textInput.x,
        startY: textInput.y,
        text: textValue,
      }])
    }
    setTextInput(null)
    setTextValue('')
  }, [textInput, textValue, color, size])

  const undo = () => setActions(prev => prev.slice(0, -1))
  const clearAll = () => setActions([])

  // Render height based on aspect ratio  
  const displayWidth = presentationMode ? Math.min(window.innerWidth * 0.95, window.innerWidth - 80) : 400
  const displayHeight = (displayWidth / dicomSize.width) * dicomSize.height

  // ── Presentation Mode ──────────────────────────────────────────────────
  if (presentationMode) {
    return (
      <div
        ref={presentationContainerRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={() => setPresentationMode(false)}
          title="Sunumu Kapat"
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--danger)',
            border: 'none',
            borderRadius: '50%',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 20,
            zIndex: 10001,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            transition: 'transform 0.1s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          ✕
        </button>
        <div 
          style={{ 
            position: 'relative', width: displayWidth, height: displayHeight, overflow: 'hidden',
            touchAction: 'none', // Mobil cihazlarda tarayıcı kaydırmasını engeller
            cursor: (tool === 'pan' || isSpacePressed) ? (isPanning ? 'grabbing' : 'grab') : (tool === 'text' ? 'text' : 'crosshair')
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div style={{ 
            width: '100%', height: '100%', 
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: 'none',
            pointerEvents: 'none'
          }}>
            <canvas
              ref={dicomCanvasRef}
              style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, imageRendering: zoom > 1.5 ? 'pixelated' : 'auto' }}
            />
            <canvas
              ref={drawCanvasRef}
              style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
            />
            {textInput && (
              <div style={{
                position: 'absolute',
                left: (textInput.x / dicomSize.width) * 100 + '%',
                top: (textInput.y / dicomSize.height) * 100 + '%',
                zIndex: 10,
                pointerEvents: 'auto'
              }}>
                <input
                  autoFocus
                  type="text"
                  value={textValue}
                  onChange={e => setTextValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleTextSubmit()
                    if (e.key === 'Escape') { setTextInput(null); setTextValue('') }
                  }}
                  onBlur={handleTextSubmit}
                  style={{
                    background: 'rgba(0,0,0,0.7)',
                    color: color,
                    border: `1px solid ${color}`,
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: SIZE_MAP[size] * 8,
                    outline: 'none',
                    transform: `scale(${1/zoom})`, // text input should roughly stay readable
                    transformOrigin: 'top left'
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Floating Paint Tools in Presentation Mode */}
        <div style={{
          position: 'absolute',
          left: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'var(--background-2)',
          border: '1px solid var(--glass-border)',
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: 180,
          boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
          zIndex: 10001,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4, textAlign: 'center' }}>
            🎨 Çizim Araçları
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {TOOLS.map(t => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                title={t.label}
                style={{
                  padding: '8px 4px',
                  borderRadius: 6,
                  background: tool === t.id ? 'var(--accent)' + '30' : 'var(--glass-bg)',
                  border: `1px solid ${tool === t.id ? 'var(--accent)' : 'var(--glass-border)'}`,
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span style={{ fontSize: 10 }}>{t.label}</span>
              </button>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 6 }}>Renk</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {DRAW_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: c,
                    border: color === c ? '2px solid var(--foreground)' : '1px solid var(--glass-border)',
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                    transform: color === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 6 }}>Boyut</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['thin', 'medium', 'thick'] as DrawSize[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: 4,
                    background: size === s ? 'var(--accent)' + '30' : 'var(--glass-bg)',
                    border: `1px solid ${size === s ? 'var(--accent)' : 'var(--glass-border)'}`,
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    fontSize: 10,
                  }}
                >
                  {s === 'thin' ? 'İnce' : s === 'medium' ? 'Orta' : 'Kalın'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <button
              onClick={undo}
              disabled={actions.length === 0}
              style={{
                padding: '8px 0',
                borderRadius: 6,
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                color: actions.length ? 'var(--foreground)' : 'var(--foreground-3)',
                cursor: actions.length ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
            >
              ↩️ Geri Al
            </button>
            <button
              onClick={clearAll}
              disabled={actions.length === 0}
              style={{
                padding: '8px 0',
                borderRadius: 6,
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                color: actions.length ? 'var(--danger)' : 'var(--foreground-3)',
                cursor: actions.length ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
            >
              🗑️ Temizle
            </button>
          </div>

          {/* Window/Level controls for Presentation Mode */}
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 12, marginTop: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--foreground-3)', marginBottom: 6 }}>Görüntü Ayarları</div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: 'var(--foreground)', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>☀️ Parlaklık</span>
                <span>{brightness}</span>
              </div>
              <input type="range" min={-100} max={100} value={brightness} onChange={e => setBrightness(+e.target.value)}
                style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: 'var(--foreground)', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>🔲 Kontrast</span>
                <span>{contrast}</span>
              </div>
              <input type="range" min={50} max={200} value={contrast} onChange={e => setContrast(+e.target.value)}
                style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </label>
            <button
              onClick={() => { setBrightness(0); setContrast(100) }}
              style={{ width: '100%', fontSize: 10, padding: '4px 0', borderRadius: 4, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--foreground-3)', cursor: 'pointer' }}
            >
              Ayarları Sıfırla
            </button>
          </div>
        </div>

      </div>
    )
  }

  // ── Normal Mode ────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      gap: 12,
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      borderRadius: 12,
      padding: 12,
      flexWrap: 'wrap',
      height: 'fit-content',
      alignItems: 'flex-start',
      alignSelf: 'flex-start',
    }}>
      {/* Left: DICOM Viewer */}
      <div style={{ flex: '1 1 360px', minWidth: 300 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>DICOM Görüntü</span>
          {!dicomImage && (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'var(--accent)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              📁 DCM Dosyası Yükle
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".dcm"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileUpload(f)
            }}
          />
        </div>

        {loadingDcm && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--foreground-3)', fontSize: 13 }}>
            ⏳ DICOM yükleniyor...
          </div>
        )}

        {errorMsg && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--danger)', fontSize: 12 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {dicomImage && (
          <>
            <div style={{
              position: 'relative',
              width: '100%',
              paddingTop: `${(dicomSize.height / dicomSize.width) * 100}%`,
              background: '#000',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              <canvas
                ref={dicomCanvasRef}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: zoom > 1.5 ? 'pixelated' : 'auto' }}
              />
              <canvas
                ref={drawCanvasRef}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              />
              {textInput && (
                <div style={{
                  position: 'absolute',
                  left: (textInput.x / dicomSize.width) * 100 + '%',
                  top: (textInput.y / dicomSize.height) * 100 + '%',
                  zIndex: 10,
                }}>
                  <input
                    autoFocus
                    value={textValue}
                    onChange={e => setTextValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleTextSubmit() }}
                    onBlur={handleTextSubmit}
                    style={{
                      background: 'rgba(0,0,0,0.7)',
                      border: `1px solid ${color}`,
                      color: color,
                      padding: '2px 6px',
                      fontSize: 12,
                      borderRadius: 4,
                      outline: 'none',
                      minWidth: 80,
                    }}
                    placeholder="Metin girin..."
                  />
                </div>
              )}
            </div>

          </>
        )}

        {!dicomImage && !loadingDcm && !errorMsg && (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              border: '2px dashed var(--glass-border)',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 12, color: 'var(--foreground-3)' }}>
              DCM dosyasını buraya tıklayarak yükleyin
            </div>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      {dicomImage && (
        <div style={{ flex: '0 0 180px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => setPresentationMode(true)}
              style={{
                padding: '8px 0',
                borderRadius: 6,
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              🖥️ Sunum Modu
            </button>
          </div>

          <div style={{ padding: 12, borderRadius: 8, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', color: 'var(--foreground-2)', fontSize: 11, textAlign: 'center' }}>
            Çizim araçlarını kullanmak için Sunum Moduna geçin.
          </div>

          {/* Upload new */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '6px 0',
              borderRadius: 6,
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              color: 'var(--foreground-3)',
              cursor: 'pointer',
              fontSize: 10,
              marginTop: 'auto',
            }}
          >
            📁 Farklı DCM Yükle
          </button>
        </div>
      )}

      {isModal && onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'none',
            border: 'none',
            color: 'var(--foreground-3)',
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
