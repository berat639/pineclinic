'use client'

/**
 * ============================================================================
 * DENTAL CPR VIEWER MODAL — TAM EKRAN 3D CBCT & DENTAL CPR GÖRÜNTÜLEYİCİ
 * ============================================================================
 * 4 klinik görüntüleme panelini (Aksiyel, Panoramik, Çapraz Kesitler ve 3B VR),
 * etkileşimli 17 sarı kontrol noktalı dental ark düzenleyicisini, yerel AI servisi
 * yönetimini ve vaka yaşam döngüsünü tam ekran modal içinde koordine eder.
 * ============================================================================
 */
import React, { useEffect, useRef } from 'react'
import styles from './DentalCprViewerModal.module.css'
import { splineArch, type ArchResult, type Pt } from './arch/arch'
import { searchArch } from './archDetect'
import { searchOcclusalSplineArch } from './archOcclusal'
import { panoramaOffset, panoramaPoint, trackMandible } from './panoramaTracking'
import {
  archFrameAt,
  findOcclusalSlice,
  renderCrossAt,
  renderPanorama,
  sectionNumber,
  toCanvas,
} from './cpr'
import { GpuPanoramaRenderer } from './cprGpu'
import { LoadingOverlay, type StageId } from './loading'
import {
  drawCornerText,
  drawOrientation,
  drawRulers,
  fitInto,
  prepOverlay,
  RULER_PAD,
  type Pad,
  type ViewGeom,
} from './overlay'
import { cbctFetch, getActiveApiBase, getClinicDomain, ServiceLink, type JobInfo, type ServerEventDetail } from './service'
import {
  CONN_HINT,
  createServiceUiController,
  initTooltips,
  isDemo,
  updatePatientMetaUi,
} from './serviceUi'
import { makePhantom, sample, volumeFromResponse, type DicomMeta, type Volume } from './volume'
import type { Viewer3D } from './viewer3d'

export interface DentalCprViewerModalProps {
  onClose: () => void
  initialFiles?: File[] | null
}

type Jaw = 'lower' | 'upper'
type Source = { kind: 'path'; path: string } | { kind: 'files'; files: File[] }
type Img = { data: Float32Array; w: number; h: number }
class Cancelled extends Error {}
class Restarted extends Error {}

const COLOR = { ax: '#ff5a3c', pano: '#8d96ff', cross: '#35e0a1', level: '#ff9a3c' }
const CROSS_PAD: Pad = { left: 36, right: 6, top: 20, bottom: 22 }
const WL_PRESETS: Record<string, { wc: number; ww: number }> = {
  bone: { wc: 500, ww: 2000 },
  tooth: { wc: 1200, ww: 2500 },
  soft: { wc: 40, ww: 400 },
}

export default function DentalCprViewerModal({ onClose, initialFiles }: DentalCprViewerModalProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let disposed = false
    const listenerAbort = new AbortController()
    const { signal } = listenerAbort
    const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!
    const num = (id: string) => Number($<HTMLInputElement>(id).value)

    const cvAxial = $<HTMLCanvasElement>('cv-axial')
    const ovAxial = $<HTMLCanvasElement>('ov-axial')
    const stageAxial = $<HTMLDivElement>('stage-axial')
    const cvPano = $<HTMLCanvasElement>('cv-pano')
    const cvPanoCpu = $<HTMLCanvasElement>('cv-pano-cpu')
    const ovPano = $<HTMLCanvasElement>('ov-pano')
    const panoStage = $<HTMLDivElement>('pano-stage')
    const crossStrip = $<HTMLDivElement>('cross-strip')
    const loading = new LoadingOverlay($('loading'))
    const link = new ServiceLink()

    // ---- Vaka durumu (Case State) ---------------------------------------------------------------
    let volume: Volume | null = null
    let activeDatasetId = ''
    let currentArch: ArchResult | null = null
    let controlPoints: Pt[] = []
    let initialControlPoints: Pt[] = []
    let selectedJaw: Jaw = 'lower'
    const arches = new Map<Jaw, { arch: ArchResult; controls: Pt[]; initialControls: Pt[] }>()
    let centerS = 0
    let viewer3d: Viewer3D | null = null
    let lastSource: Source | null = null
    let loadToken = 0
    let activeJob = ''
    let skipRequested = false
    let currentXhr: XMLHttpRequest | null = null
    let dragIndex = -1

    // ---- Görünüm önbellekleri (View Caches) -----------------------------------------------------
    let axialGeom: ViewGeom | null = null
    let panoGeom: ViewGeom | null = null
    const crossGeoms: ViewGeom[] = []
    const crossImgs: (Img | null)[] = []
    const crossCells: { cell: HTMLDivElement; cv: HTMLCanvasElement; ov: HTMLCanvasElement }[] = []
    let hover: { panel: 'axial' | 'pano' | number; hu: number } | null = null
    let lastAxialHu: number | null = null
    const renderer = new GpuPanoramaRenderer(cvPano)

    const jaw = (): Jaw => $<HTMLSelectElement>('in-jaw').value as Jaw
    const windowLevel = () => ({ center: num('in-wc'), width: num('in-ww') })
    const slab = () => ({
      thicknessMm: num('in-thick'),
      mode: $<HTMLInputElement>('in-max').checked ? ('max' as const) : ('mean' as const),
      trackMandible: $<HTMLInputElement>('in-tracking').checked,
    })
    const half = () => num('in-width')
    const crossThickness = () => Number($<HTMLSelectElement>('in-cross-thick')?.value || 2)

    // ---- Bildirimler ve üst bilgi (Toast & Case Info) -------------------------------------------
    let toastTimer = 0
    function toast(text: string, kind: 'info' | 'warn' | 'error' | 'ok' = 'info', ms = 7000) {
      if (disposed) return
      const el = $('toast')
      if (!el) return
      el.textContent = text
      el.className = `toast ${kind}`
      el.hidden = false
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => {
        if (!disposed && el) el.hidden = true
      }, ms)
    }
    function setCaseInfo(text: string) {
      if (disposed) return
      const el = $('case-info')
      if (!el) return
      el.textContent = text
      el.title = text
    }

    const { updateServiceUi, dispose: disposeServiceUi } = createServiceUiController(link, toast, root)
    const disposeTooltips = initTooltips(root)

    // ---- Açılır menüler (Popovers: 4 panel + Hasta Meta + Local Service) ------------------------
    let openPop: HTMLElement | null = null
    let openBtn: HTMLElement | null = null
    function closePop() {
      if (openPop) openPop.hidden = true
      openBtn?.classList.remove('open')
      openPop = openBtn = null
    }
    function closeTopPopovers() {
      const sp = $('service-popover')
      if (sp) sp.hidden = true
      const pp = $('patient-popover')
      if (pp) pp.hidden = true
      $('btn-patient-meta')?.classList.remove('open')
    }
    function togglePop(pop: HTMLElement, anchor: HTMLElement, side: 'right' | 'below') {
      const wasOpen = openPop === pop
      closePop()
      closeTopPopovers()
      if (wasOpen) return
      pop.hidden = false
      const r = anchor.getBoundingClientRect()
      if (side === 'right') {
        pop.style.left = `${r.right + 8}px`
        pop.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - pop.offsetHeight - 8))}px`
      }
      anchor.classList.add('open')
      openPop = pop
      openBtn = anchor
    }
    root.querySelectorAll<HTMLButtonElement>('[data-pop]').forEach((button) => {
      button.addEventListener(
        'click',
        (event) => {
          event.stopPropagation()
          togglePop($(button.dataset.pop!), button, 'right')
        },
        { signal }
      )
    })
    $('btn-service').addEventListener(
      'click',
      (event) => {
        event.stopPropagation()
        const pop = $('service-popover')
        const wasOpen = !pop.hidden
        closePop()
        closeTopPopovers()
        pop.hidden = wasOpen
      },
      { signal }
    )
    $('btn-patient-meta').addEventListener(
      'click',
      (event) => {
        event.stopPropagation()
        const pop = $('patient-popover')
        const btn = $('btn-patient-meta')
        const wasOpen = !pop.hidden
        closePop()
        closeTopPopovers()
        pop.hidden = wasOpen
        btn.classList.toggle('open', !wasOpen)
      },
      { signal }
    )
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (openPop && !openPop.contains(target)) closePop()
      const sp = $('service-popover')
      if (sp && !sp.hidden && !sp.contains(target)) sp.hidden = true
      const pp = $('patient-popover')
      if (pp && !pp.hidden && !pp.contains(target)) {
        pp.hidden = true
        $('btn-patient-meta')?.classList.remove('open')
      }
    }
    document.addEventListener('click', onDocClick, { signal })

    // ---- Geometri yardımcıları ------------------------------------------------------------------
    const centroid = (arch: ArchResult): Pt => {
      let x = 0,
        y = 0
      for (const p of arch.points) {
        x += p[0]
        y += p[1]
      }
      return [x / arch.points.length, y / arch.points.length]
    }
    function sideLabels(arch: ArchResult, s: number): [string, string] {
      const f = archFrameAt(arch, s),
        c = centroid(arch)
      const outward = (f.p[0] - c[0]) * f.n[0] + (f.p[1] - c[1]) * f.n[1] > 0
      return outward ? ['L', 'B'] : ['B', 'L']
    }
    function sections() {
      if (!currentArch) return []
      const spacing = num('in-spacing')
      return Array.from({ length: 5 }, (_, k) => {
        const s = Math.max(0, Math.min(currentArch!.length, centerS + (k - 2) * spacing))
        return { s, number: sectionNumber(s, spacing) }
      })
    }
    const clampCenter = () => {
      if (currentArch) centerS = Math.max(0, Math.min(currentArch.length, centerS))
    }

    // ---- 1. Panel: Aksiyel Görünüm (Axial) ------------------------------------------------------
    function drawAxial() {
      if (disposed || !volume) return
      const z = num('in-slice')
      toCanvas(
        cvAxial,
        {
          data: volume.data.subarray(z * volume.nx * volume.ny, (z + 1) * volume.nx * volume.ny),
          w: volume.nx,
          h: volume.ny,
        },
        windowLevel()
      )
      axialGeom = fitInto(cvAxial, stageAxial, volume.nx * volume.sx, volume.ny * volume.sy)
      drawAxialOverlay()
    }

    function drawAxialOverlay() {
      if (disposed) return
      const { ctx } = prepOverlay(ovAxial)
      if (!volume || !axialGeom) return
      const g = axialGeom,
        X = (mm: number) => g.left + (mm / g.widthMm) * g.width,
        Y = (mm: number) => g.top + (mm / g.heightMm) * g.height
      drawRulers(ctx, g, { color: COLOR.ax })
      const flipped = volume.direction[0] < 0
      drawOrientation(ctx, g, flipped ? 'L' : 'R', flipped ? 'R' : 'L', '#ff7a5f')
      drawCornerText(ctx, g, `${num('in-slice') + 1}/${volume.nz}`, 'rgba(255,122,95,.85)', 'tl', 12)
      if (hover?.panel === 'axial') drawCornerText(ctx, g, `${Math.round(hover.hu)} HU`, COLOR.ax, 'tr', 15)
      else if (lastAxialHu !== null) drawCornerText(ctx, g, `${Math.round(lastAxialHu)} HU`, COLOR.ax, 'tr', 15, 0.55)
      if (!currentArch) return
      const line = (pts: Pt[]) => {
        ctx.beginPath()
        pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))))
        ctx.stroke()
      }
      const tracked = slab().trackMandible && !!currentArch.panorama
      const points = currentArch.points.map((_, i) => panoramaPoint(currentArch!, i, num('in-slice'), tracked))
      const t = slab().thicknessMm / 2
      if (t > 0) {
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(53,224,161,.55)'
        for (const sign of [-1, 1]) {
          line(
            points.map(
              (p, i) =>
                [
                  p[0] + sign * t * currentArch!.normals[i][0],
                  p[1] + sign * t * currentArch!.normals[i][1],
                ] as Pt
            )
          )
        }
      }
      if (tracked) {
        ctx.setLineDash([3, 4])
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(255,211,77,.5)'
        line(currentArch.points)
        ctx.setLineDash([])
      }
      ctx.lineWidth = 2
      ctx.strokeStyle = COLOR.cross
      line(points)
      const secs = sections(),
        h = half()
      ctx.font = '600 12px Inter, sans-serif'
      ctx.textBaseline = 'middle'
      secs.forEach((sec, k) => {
        const f = archFrameAt(currentArch!, sec.s)
        const a: Pt = [f.p[0] - f.n[0] * h, f.p[1] - f.n[1] * h],
          b: Pt = [f.p[0] + f.n[0] * h, f.p[1] + f.n[1] * h]
        ctx.lineWidth = k === 2 ? 2 : 1
        ctx.strokeStyle = k === 2 ? '#7dffd0' : 'rgba(53,224,161,.8)'
        line([a, b])
        if (k === 0) {
          ctx.fillStyle = COLOR.cross
          ctx.textAlign = 'center'
          ctx.fillText(String(sec.number), X(b[0]) + f.n[0] * 12, Y(b[1]) + f.n[1] * 12)
        }
      })
      ctx.fillStyle = '#ffd34d'
      ctx.strokeStyle = '#10131a'
      ctx.lineWidth = 1.5
      for (const point of controlPoints) {
        ctx.beginPath()
        ctx.arc(X(point[0]), Y(point[1]), 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }

    // ---- 2. Panel: Panoramik Görünüm (Panorama) -------------------------------------------------
    function drawPano(interactive = false) {
      if (disposed || !volume || !currentArch) return
      const usedGpu = renderer.render(volume, currentArch, slab(), windowLevel())
      cvPano.hidden = !usedGpu
      cvPanoCpu.hidden = usedGpu
      if (!usedGpu) {
        toCanvas(cvPanoCpu, renderPanorama(volume, currentArch, slab(), interactive ? 2 : Infinity), windowLevel())
      }
      panoGeom = fitInto(usedGpu ? cvPano : cvPanoCpu, panoStage, currentArch.length, volume.nz * volume.sz)
      fitInto(usedGpu ? cvPanoCpu : cvPano, panoStage, currentArch.length, volume.nz * volume.sz)
      drawPanoOverlay()
    }

    function drawPanoOverlay() {
      if (disposed) return
      const { ctx } = prepOverlay(ovPano)
      if (!volume || !currentArch || !panoGeom) return
      const g = panoGeom
      drawRulers(ctx, g, { color: COLOR.pano })
      const y = g.top + g.height * (1 - (num('in-slice') + 0.5) / volume.nz)
      ctx.strokeStyle = COLOR.level
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(g.left, y)
      ctx.lineTo(g.left + g.width, y)
      ctx.stroke()
      sections().forEach((sec, k) => {
        const x = g.left + (sec.s / currentArch!.length) * g.width
        ctx.strokeStyle = k === 2 ? '#7dffd0' : 'rgba(53,224,161,.8)'
        ctx.lineWidth = k === 2 ? 2 : 1
        ctx.beginPath()
        ctx.moveTo(x, g.top)
        ctx.lineTo(x, g.top + g.height)
        ctx.stroke()
        if (k === 0) {
          ctx.fillStyle = COLOR.cross
          ctx.font = '600 12px Inter, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText(String(sec.number), x, g.top + 14)
        }
      })
      if (hover?.panel === 'pano') drawCornerText(ctx, g, `${Math.round(hover.hu)} HU`, 'rgba(141,150,255,.9)', 'tr', 12)
    }

    // ---- 4. Panel: Çapraz Kesitler (Cross-Sections) ---------------------------------------------
    function ensureCrossCells() {
      if (disposed) return
      if (crossCells.length === 5 && crossStrip.children.length === 5) return
      crossCells.length = 0
      crossStrip.replaceChildren()
      for (let k = 0; k < 5; k++) {
        const cell = document.createElement('div')
        cell.className = 'cross-cell'
        const cv = document.createElement('canvas'),
          ov = document.createElement('canvas')
        ov.className = 'overlay'
        cell.append(cv, ov)
        crossStrip.append(cell)
        cell.addEventListener('mousemove', (event) => crossHover(k, event), { signal })
        cell.addEventListener(
          'mouseleave',
          () => {
            if (hover?.panel === k) {
              hover = null
              drawCrossOverlay(k)
            }
          },
          { signal }
        )
        cell.addEventListener(
          'wheel',
          (event) => {
            event.preventDefault()
            stepCenter(event.deltaY > 0 ? 1 : -1)
          },
          { passive: false, signal }
        )
        crossCells.push({ cell, cv, ov })
      }
    }

    let crossRefineTimer = 0
    function drawCross(resample = true, interactive = false) {
      if (disposed) return
      ensureCrossCells()
      window.clearTimeout(crossRefineTimer)
      const secs = sections()
      const cThick = crossThickness()
      let draft = false
      crossCells.forEach((c, k) => {
        if (!volume || !currentArch) {
          prepOverlay(c.ov)
          c.cv.width = 1
          c.cv.height = 1
          return
        }
        const s = slab(),
          wl = windowLevel(),
          crossSlab = { ...s, thicknessMm: cThick }
        if (renderer.renderCross(c.cv, volume, archFrameAt(currentArch, secs[k].s), half(), crossSlab, wl)) {
          crossImgs[k] = null
        } else {
          if (resample || !crossImgs[k]) {
            crossImgs[k] = renderCrossAt(
              volume,
              currentArch,
              secs[k].s,
              half(),
              crossSlab.thicknessMm,
              s.mode,
              interactive ? 2 : Infinity
            )
            if (interactive) draft = true
          }
          toCanvas(c.cv, crossImgs[k]!, wl)
        }
        crossGeoms[k] = fitInto(c.cv, c.cell, 2 * half(), volume.nz * volume.sz, CROSS_PAD)
        drawCrossOverlay(k)
      })
      if (draft) crossRefineTimer = window.setTimeout(() => drawCross(true), 200)
    }

    function drawCrossOverlay(k: number) {
      if (disposed) return
      const c = crossCells[k]
      if (!c) return
      const { ctx } = prepOverlay(c.ov)
      const g = crossGeoms[k],
        sec = sections()[k]
      if (!volume || !currentArch || !g || !sec) return
      drawRulers(ctx, g, { color: COLOR.cross, hDivisions: 2, minorPerMajor: 4, font: '9px Inter, sans-serif' })
      const [left, right] = sideLabels(currentArch, sec.s)
      drawOrientation(ctx, g, left, right, COLOR.cross)
      drawCornerText(ctx, g, String(sec.number), COLOR.cross, 'top-center', k === 2 ? 14 : 12, k === 2 ? 1 : 0.85)
      if (slab().trackMandible && currentArch.panorama) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(g.left, g.top, g.width, g.height)
        ctx.clip()
        const column = (sec.s / currentArch.length) * (currentArch.points.length - 1),
          thickness = slab().thicknessMm
        for (const sign of [-1, 1]) {
          ctx.beginPath()
          ctx.strokeStyle = 'rgba(53,224,161,.65)'
          ctx.lineWidth = 1
          for (let z = 0; z < volume.nz; z++) {
            const offset = panoramaOffset(currentArch, column, z) + (sign * thickness) / 2
            const x = g.left + (offset / (2 * half()) + 0.5) * g.width,
              y = g.top + (1 - (z + 0.5) / volume.nz) * g.height
            if (z) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
          }
          ctx.stroke()
        }
        ctx.restore()
      }
      if (hover?.panel === k) drawCornerText(ctx, g, `${Math.round(hover.hu)} HU`, 'rgba(53,224,161,.9)', 'tr', 10)
    }

    function crossHover(k: number, event: MouseEvent) {
      if (!volume || !currentArch) return
      const r = crossCells[k].cv.getBoundingClientRect()
      const fx = (event.clientX - r.left) / r.width,
        fy = (event.clientY - r.top) / r.height
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return
      const sec = sections()[k],
        f = archFrameAt(currentArch, sec.s),
        off = -half() + fx * 2 * half()
      const hu = sample(
        volume,
        (f.p[0] + f.n[0] * off) / volume.sx,
        (f.p[1] + f.n[1] * off) / volume.sy,
        (1 - fy) * (volume.nz - 1)
      )
      hover = { panel: k, hu }
      scheduleOverlay(k)
    }

    // ---- Koordineli yenileme (Coordinated Refresh) ----------------------------------------------
    const pendingOverlays = new Set<'axial' | 'pano' | number>()
    let overlayFrame = 0
    function scheduleOverlay(which: 'axial' | 'pano' | number) {
      pendingOverlays.add(which)
      if (overlayFrame) return
      overlayFrame = requestAnimationFrame(() => {
        overlayFrame = 0
        if (disposed) return
        for (const w of pendingOverlays) {
          if (w === 'axial') drawAxialOverlay()
          else if (w === 'pano') drawPanoOverlay()
          else drawCrossOverlay(w)
        }
        pendingOverlays.clear()
      })
    }
    let guideTimer = 0
    function schedule3d() {
      window.clearTimeout(guideTimer)
      guideTimer = window.setTimeout(() => {
        if (disposed || !viewer3d || !volume) return
        viewer3d.setGuides(
          currentArch,
          num('in-slice') * volume.sz,
          sections().map((s) => ({ s: s.s, halfWidthMm: half() })),
          slab().trackMandible
        )
      }, 250)
    }
    let sectionFrame = 0
    function scheduleSections() {
      if (sectionFrame) return
      sectionFrame = requestAnimationFrame(() => {
        sectionFrame = 0
        if (disposed) return
        drawAxialOverlay()
        drawPanoOverlay()
        drawCross(true, true)
        schedule3d()
      })
    }
    function stepCenter(direction: number) {
      if (!currentArch) return
      centerS += direction * num('in-spacing')
      clampCenter()
      scheduleSections()
    }

    function adaptColumns() {
      if (disposed || !volume) return
      const grid = $('viewer'),
        cs = getComputedStyle(grid)
      const gap = parseFloat(cs.rowGap) || 0
      const rowH = (grid.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - gap) / 2
      const availH = Math.max(50, rowH - RULER_PAD.top - RULER_PAD.bottom - 2)
      const chrome = 34 + 2 + RULER_PAD.left + RULER_PAD.right
      const aAxial = (volume.nx * volume.sx) / (volume.ny * volume.sy)
      const aPano = (currentArch ? currentArch.length : 1.7 * volume.nz * volume.sz) / (volume.nz * volume.sz)
      const wA = availH * aAxial + chrome,
        wP = availH * aPano + chrome
      grid.style.gridTemplateColumns = `minmax(0, ${wA.toFixed(1)}fr) minmax(0, ${wP.toFixed(1)}fr)`
    }
    function refresh() {
      if (disposed) return
      adaptColumns()
      drawAxial()
      drawPano()
      drawCross(true)
      schedule3d()
    }
    function refreshWindow() {
      if (disposed) return
      adaptColumns()
      drawAxial()
      drawPano()
      drawCross(false)
    }

    function clearDerivedViews() {
      if (disposed) return
      for (const canvas of [cvPano, cvPanoCpu]) {
        canvas.width = 1
        canvas.height = 1
      }
      cvPano.hidden = true
      cvPanoCpu.hidden = false
      crossImgs.length = 0
      crossGeoms.length = 0
      panoGeom = null
      prepOverlay(ovPano)
      drawCross(true)
    }

    // ---- Dental Ark Yönetimi (4 Aksiyel Buton İşlevleri) ----------------------------------------
    function saveJaw(which: Jaw = selectedJaw) {
      if (currentArch) {
        arches.set(which, {
          arch: currentArch,
          controls: controlPoints.map((p) => [...p] as Pt),
          initialControls: initialControlPoints.map((p) => [...p] as Pt),
        })
      }
    }
    function loadJaw(which: Jaw = selectedJaw) {
      const saved = arches.get(which)
      currentArch = saved?.arch ?? null
      controlPoints = saved?.controls.map((p) => [...p] as Pt) ?? []
      initialControlPoints = saved?.initialControls.map((p) => [...p] as Pt) ?? []
      centerS = currentArch ? currentArch.length / 2 : 0
      crossImgs.length = 0
      $<HTMLInputElement>('in-tracking').disabled = !currentArch?.panorama
    }

    function seedControls(recordInitial = true) {
      if (!currentArch) return
      const count = 17,
        last = currentArch.points.length - 1
      controlPoints =
        currentArch.controls?.length === count
          ? currentArch.controls.map((p) => [...p] as Pt)
          : Array.from({ length: count }, (_, i) => [...currentArch!.points[Math.round((i * last) / (count - 1))]] as Pt)
      if (recordInitial || !initialControlPoints.length) {
        initialControlPoints = controlPoints.map((p) => [...p] as Pt)
      }
      const pano = currentArch.panorama
      currentArch = splineArch(controlPoints, currentArch.points.length)
      currentArch.controls = controlPoints.map((p) => [...p] as Pt)
      if (pano) currentArch.panorama = pano
    }

    function autoSlice(targetJaw: Jaw = jaw()): number {
      if (!volume) return 0
      if (volume.maskSchema === 'dental-segmentator-v1' && volume.mask) {
        const targetLabel = targetJaw === 'upper' ? 3 : 4
        const plane = volume.nx * volume.ny
        const stride = Math.max(1, Math.round(1.0 / Math.min(volume.sx, volume.sy)))
        const zCounts = new Float64Array(volume.nz)
        let total = 0
        for (let z = 0; z < volume.nz; z++) {
          const z0 = z * plane
          let count = 0
          for (let y = 0; y < volume.ny; y += stride) {
            const row = z0 + y * volume.nx
            for (let x = 0; x < volume.nx; x += stride) {
              if (volume.mask[row + x] === targetLabel) count++
            }
          }
          zCounts[z] = count
          total += count
        }
        if (total > 20) {
          let acc = 0
          for (let z = 0; z < volume.nz; z++) {
            acc += zCounts[z]
            if (acc >= total * 0.5) return z
          }
        }
      }
      const detected = findOcclusalSlice(volume, 20)
      return detected >= 0 ? detected : Math.round(volume.nz * 0.55)
    }

    let detectToken = 0

    async function detectSliceArch(): Promise<boolean> {
      const token = ++detectToken
      if (!volume) return false
      const v = volume
      const input = $<HTMLInputElement>('in-slice')
      const z = Math.max(0, Math.min(v.nz - 1, Number.isFinite(Number(input.value)) ? num('in-slice') : autoSlice()))
      const useMandibleMask = !!v.mask && jaw() === 'lower'
      let result
      toast(`Kesit ${z + 1}/${v.nz} seviyesinden ark aranıyor…`, 'info', 2500)
      try {
        result = await searchArch(v, z, num('in-arch-slab'), useMandibleMask, () => disposed || token !== detectToken || volume !== v)
      } catch (error) {
        toast(String((error as Error).message), 'error')
        return false
      }
      if (disposed || token !== detectToken || volume !== v) return false
      if (!result.anyEvidence) {
        toast(
          'Bu kesit seviyesinde güvenli bir otomatik ark için yeterli diş/kemik kanıtı yok. Aksiyel kesiti değiştirip tekrar deneyin.',
          'warn'
        )
        return false
      }
      const chosen = result.chosen
      if (!chosen) {
        const ev = result.best?.ev
        toast(
          `Bu kesit seviyesinde güvenilir eğri bulunamadı (kanıt desteği %${((ev?.supportFraction ?? 0) * 100).toFixed(0)}). Başka bir kesit seçin veya "Oklüzalden Ark Yenile" (⌁) butonunu kullanın.`,
          'warn',
          9000
        )
        return false
      }
      currentArch = chosen.arch
      if (useMandibleMask) trackMandible(v, currentArch, autoSlice())
      $<HTMLInputElement>('in-tracking').disabled = !currentArch.panorama
      seedControls(true)
      saveJaw()
      centerS = currentArch.length / 2
      crossImgs.length = 0
      refresh()
      setCaseInfo(`${caseSummary()} · Kesit ${z + 1} arkı (${num('in-arch-slab')} mm dilim)`)
      toast(`Seçili aksiyel kesitten (${z + 1}/${v.nz}) ark tespit edildi.`, 'ok', 4500)
      return true
    }

    async function detectOcclusalSplineArch(): Promise<boolean> {
      const token = ++detectToken
      if (!volume) return false
      const v = volume
      if (v.maskSchema !== 'dental-segmentator-v1' || !v.mask) {
        toast('Oklüzal B-spline yöntemi DentalSegmentator diş maskesini gerektirir.', 'warn')
        return false
      }
      toast('Oklüzal diş projeksiyonu ve B-spline hesaplanıyor…', 'info', 5000)
      const result = await searchOcclusalSplineArch(
        v,
        jaw() === 'upper' ? 3 : 4,
        () => disposed || token !== detectToken || volume !== v
      )
      if (disposed || token !== detectToken || volume !== v) return false
      if (!result.arch) {
        toast(`Oklüzal B-spline arch reddedildi: ${result.reason ?? 'yeterli kanıt yok'}.`, 'warn', 9000)
        return false
      }
      currentArch = result.arch
      if (jaw() === 'lower') trackMandible(v, currentArch, autoSlice())
      $<HTMLInputElement>('in-tracking').disabled = !currentArch.panorama
      seedControls(true)
      saveJaw()
      centerS = currentArch.length / 2
      crossImgs.length = 0
      refresh()
      setCaseInfo(`${caseSummary()} · ${jaw() === 'upper' ? 'Üst' : 'Alt'} çene arch'ı (oklüzal B-spline)`)
      toast(`Oklüzal B-spline uygulandı · kanıt %${(result.assessment!.supportFraction * 100).toFixed(0)}`, 'ok', 5000)
      return true
    }

    async function detectArch(): Promise<boolean> {
      if (!volume) return false
      if (volume.maskSchema === 'dental-segmentator-v1') return detectOcclusalSplineArch()
      return detectSliceArch()
    }

    function rebuildFromControls() {
      if (!currentArch || controlPoints.length < 3) return
      currentArch = splineArch(controlPoints, currentArch.points.length)
      if (dragIndex < 0 && volume && selectedJaw === 'lower') trackMandible(volume, currentArch, autoSlice())
      $<HTMLInputElement>('in-tracking').disabled = !currentArch.panorama
      clampCenter()
      saveJaw()
      crossImgs.length = 0
    }

    const caseSummary = () =>
      volume
        ? `${volume.nx}×${volume.ny}×${volume.nz} · ${volume.sx.toFixed(2)}×${volume.sy.toFixed(2)}×${volume.sz.toFixed(2)} mm`
        : ''

    // ---- Yerel Servis HTTP İletişimi ------------------------------------------------------------
    async function errorText(response: Response): Promise<string> {
      const raw = await response.text().catch(() => response.statusText)
      try {
        return JSON.parse(raw).detail ?? raw
      } catch {
        return raw || response.statusText
      }
    }
    async function openPath(path: string): Promise<string> {
      const response = await cbctFetch('/api/datasets/path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (!response.ok) throw new Error(await errorText(response))
      return (await response.json()).datasetId
    }
    function filterDicomFiles(rawFiles: File[]): File[] {
      const nonSystem = rawFiles.filter((f) => {
        const name = f.name.toLowerCase()
        if (!name || name === '.ds_store' || name === 'thumbs.db' || name === 'dicomdir') return false
        return true
      })
      const dcmOnly = nonSystem.filter((f) => f.name.toLowerCase().endsWith('.dcm'))
      if (dcmOnly.length > 0) return dcmOnly
      const excludedExt = /\.(exe|dll|qss|ini|xml|json|txt|pdf|png|jpg|jpeg|bmp|gif|ico|html|htm|js|css|log|bat|sh|py|zip|rar|dmg|app)$/i
      return nonSystem.filter((f) => !excludedExt.test(f.name))
    }

    function uploadFiles(rawFiles: File[], onProgress: (fraction: number) => void): Promise<string> {
      const files = filterDicomFiles(rawFiles)
      return new Promise((resolve, reject) => {
        const form = new FormData()
        files.forEach((file) => form.append('files', file, (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name))
        const xhr = (currentXhr = new XMLHttpRequest())
        xhr.open('POST', `${getActiveApiBase()}/api/datasets/upload`)
        xhr.setRequestHeader('X-Clinic-Domain', getClinicDomain())
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(event.loaded / event.total)
        }
        xhr.onload = () => {
          try {
            const body = JSON.parse(xhr.responseText)
            if (xhr.status >= 200 && xhr.status < 300) resolve(body.datasetId)
            else reject(new Error(body.detail ?? xhr.statusText))
          } catch {
            reject(new Error(xhr.statusText || 'Yükleme başarısız'))
          }
        }
        xhr.onerror = () => reject(new Error('Yerel servise ulaşılamadı'))
        xhr.onabort = () => reject(new Cancelled())
        xhr.send(form)
      })
    }
    const reopen = (source: Source) =>
      source.kind === 'path' ? openPath(source.path) : uploadFiles(source.files, () => undefined)

    async function downloadVolume(datasetId: string, onProgress: (fraction: number) => void): Promise<Volume> {
      const response = await cbctFetch(`/api/datasets/${datasetId}/volume`)
      if (!response.ok) throw new Error(await errorText(response))
      const total = Number(response.headers.get('Content-Length')) || 0
      if (!response.body || !total) {
        const buffer = await response.arrayBuffer()
        onProgress(1)
        return volumeFromResponse(response, buffer, datasetId)
      }
      const reader = response.body.getReader(),
        out = new Uint8Array(total)
      let got = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        out.set(value, got)
        got += value.length
        onProgress(got / total)
      }
      return volumeFromResponse(response, out.buffer, datasetId)
    }

    function cancelActiveJob() {
      if (!activeJob) return
      const job = activeJob
      activeJob = ''
      void cbctFetch(`/api/jobs/${job}/cancel`, { method: 'POST' }).catch(() => undefined)
    }

    async function runAi(
      datasetId: string,
      token: number
    ): Promise<{ mask: Uint8Array; schema: Volume['maskSchema'] }> {
      const start = await cbctFetch(`/api/datasets/${datasetId}/jobs/segment`, { method: 'POST' })
      if (!start.ok) throw new Error(await errorText(start))
      const jobId: string = (await start.json()).jobId
      activeJob = jobId
      await new Promise<void>((resolve, reject) => {
        let poll = 0,
          offlineTimer = 0
        const finish = (settle: () => void) => {
          unsubscribe()
          window.clearInterval(poll)
          window.clearTimeout(offlineTimer)
          link.removeEventListener('state', onState)
          link.removeEventListener('restarted', onRestart)
          settle()
        }
        const handle = (job: JobInfo) => {
          if (disposed || token !== loadToken) return finish(() => reject(new Cancelled()))
          loading.stage('ai', 'active', job.progress, job.stage || 'hazırlanıyor')
          if (job.state === 'done') finish(resolve)
          else if (job.state === 'failed' || job.state === 'cancelled') {
            finish(() => reject(new Error(job.detail || job.stage || job.state)))
          }
        }
        const onState = () => {
          if (link.state === 'online') {
            window.clearTimeout(offlineTimer)
            loading.message('')
          } else if (link.state === 'stopping') {
            finish(() => reject(new Error('Servis yönetici tarafından durduruldu')))
          } else {
            loading.message('Servis bağlantısı koptu, yeniden bağlanılıyor…')
            window.clearTimeout(offlineTimer)
            offlineTimer = window.setTimeout(
              () => finish(() => reject(new Error('Servis 30 saniye içinde geri gelmedi'))),
              30000
            )
          }
        }
        const onRestart = () => finish(() => reject(new Restarted()))
        const unsubscribe = link.onJob(jobId, handle)
        link.addEventListener('state', onState)
        link.addEventListener('restarted', onRestart)
        poll = window.setInterval(async () => {
          try {
            const reply = await cbctFetch(`/api/jobs/${jobId}`)
            if (reply.ok) handle(await reply.json())
            else if (reply.status === 404) finish(() => reject(new Restarted()))
          } catch {
            /* bağlantı durumu watchdog tarafından izlenir */
          }
        }, 2000)
      })
      activeJob = ''
      const maskResponse = await cbctFetch(`/api/jobs/${jobId}/mask`)
      if (!maskResponse.ok) throw new Error(await errorText(maskResponse))
      return {
        mask: new Uint8Array(await maskResponse.arrayBuffer()),
        schema:
          maskResponse.headers.get('X-Segmentation-Schema') === 'dental-segmentator-v1'
            ? 'dental-segmentator-v1'
            : 'mandible-v1',
      }
    }

    // ---- Vaka Yaşam Döngüsü (Case Lifecycle) ----------------------------------------------------
    function showViewer() {
      $('empty-state').hidden = true
      $('viewer').hidden = false
      $('btn-reset').hidden = false
    }
    function showEmpty() {
      $('viewer').hidden = true
      $('empty-state').hidden = false
      $('btn-reset').hidden = true
    }
    const checkToken = (token: number) => {
      if (disposed || token !== loadToken) throw new Cancelled()
    }

    async function openVolume(next: Volume, datasetId: string, prebuilt3d?: Promise<Viewer3D | null>) {
      const previousDataset = activeDatasetId
      volume = next
      activeDatasetId = datasetId
      currentArch = null
      controlPoints = []
      initialControlPoints = []
      arches.clear()
      hover = null
      lastAxialHu = null
      $<HTMLSelectElement>('in-jaw').value = 'lower'
      selectedJaw = 'lower'
      updatePatientMetaUi(next.dicomMeta, root!)
      if ((!next.dicomMeta || next.dicomMeta.patientName === '—') && datasetId) {
        void cbctFetch(`/api/datasets/${datasetId}/metadata`)
          .then((r) => (r.ok ? r.json() : null))
          .then((payload: { dicomMeta?: DicomMeta } | DicomMeta | null) => {
            const meta =
              payload && typeof payload === 'object' && 'dicomMeta' in payload && payload.dicomMeta
                ? payload.dicomMeta
                : (payload as DicomMeta | null)
            if (!disposed && meta && volume === next) {
              next.dicomMeta = { ...next.dicomMeta, ...meta }
              updatePatientMetaUi(next.dicomMeta, root!)
            }
          })
          .catch(() => undefined)
      }
      showViewer()
      const slice = $<HTMLInputElement>('in-slice')
      slice.max = String(next.nz - 1)
      slice.value = String(autoSlice())
      $('o-slice').textContent = slice.value
      setCaseInfo(caseSummary())
      clearDerivedViews()
      drawAxial()

      const [, resolved3d] = await Promise.all([
        detectArch(),
        prebuilt3d ??
          (async () => {
            try {
              viewer3d?.dispose()
              const { Viewer3D } = await import('./viewer3d')
              if (disposed) return null
              const v3d = new Viewer3D($('vtk-stage'))
              await v3d.setVolume(next)
              if (disposed) {
                v3d.dispose()
                return null
              }
              return v3d
            } catch (error) {
              console.warn('3D view unavailable', error)
              toast('3D görünüm başlatılamadı (WebGL2 gerekli). 2D görünümler kullanılabilir.', 'warn')
              return null
            }
          })(),
      ])

      if (disposed) {
        resolved3d?.dispose()
        return
      }

      viewer3d = resolved3d
      if (viewer3d) {
        viewer3d.setMask(next.mask)
        applyViewer3dOptions()
        viewer3d.resize()
        schedule3d()
      }

      if (previousDataset && previousDataset !== datasetId) {
        void cbctFetch(`/api/datasets/${previousDataset}`, { method: 'DELETE' }).catch(() => undefined)
      }
    }

    async function loadCase(source: Source) {
      const token = ++loadToken
      lastSource = source
      skipRequested = false
      let stage: StageId = 'read'
      loading.show()
      try {
        if (link.state !== 'online') {
          loading.stage('read', 'active', 0, 'Servis bekleniyor…')
          await link.waitOnline(60000)
          checkToken(token)
        }
        loading.stage('read', 'active', 0, source.kind === 'path' ? 'Seri okunuyor…' : 'Dosyalar servise aktarılıyor…')
        let datasetId =
          source.kind === 'path'
            ? await openPath(source.path)
            : await uploadFiles(source.files, (p) =>
                loading.stage('read', 'active', p, `%${Math.round(p * 100)} aktarıldı`)
              )
        checkToken(token)
        loading.stage('read', 'done')

        stage = 'transfer'
        loading.stage('transfer', 'active', 0)
        const vol = await downloadVolume(datasetId, (p) =>
          loading.stage('transfer', 'active', p, `%${Math.round(p * 100)}`)
        )
        checkToken(token)
        loading.stage('transfer', 'done')

        viewer3d?.dispose()
        viewer3d = null
        const bg3dPromise: Promise<Viewer3D | null> = (async () => {
          try {
            const { Viewer3D } = await import('./viewer3d')
            if (disposed || token !== loadToken) return null
            const v3d = new Viewer3D($('vtk-stage'))
            await v3d.setVolume(vol)
            if (disposed || token !== loadToken) {
              v3d.dispose()
              return null
            }
            return v3d
          } catch (error) {
            console.warn('3D view unavailable', error)
            return null
          }
        })()

        stage = 'ai'
        loading.stage('ai', 'active', 0, 'Kuyrukta…')
        let aiWarning = ''
        for (let attempt = 0; ; attempt++) {
          try {
            const segmentation = await runAi(datasetId, token)
            vol.mask = segmentation.mask
            vol.maskSchema = segmentation.schema
            loading.stage('ai', 'done')
            break
          } catch (error) {
            if (error instanceof Cancelled) throw error
            if (error instanceof Restarted && attempt < 1) {
              loading.message('Servis yeniden başladı, vaka yeniden kaydediliyor…')
              datasetId = await reopen(source)
              vol.datasetId = datasetId
              loading.message('')
              continue
            }
            aiWarning = skipRequested
              ? 'AI atlandı; otomatik arch kullanılıyor.'
              : `AI segmentasyonu tamamlanamadı (${(error as Error).message}); otomatik arch kullanılıyor.`
            loading.stage('ai', 'skipped', 1, skipRequested ? 'Atlandı' : 'Başarısız, otomatik arch')
            break
          }
        }
        checkToken(token)

        stage = 'build'
        loading.stage('build', 'active', 0.2, 'Arch, panorama ve 3D hazırlanıyor…')
        await openVolume(vol, datasetId, bg3dPromise)
        checkToken(token)
        loading.hide()
        if (aiWarning) toast(`${aiWarning} Kontrol noktalarını gözden geçirin.`, 'warn', 10000)
      } catch (error) {
        if (error instanceof Cancelled) return
        loading.fail(stage, (error as Error).message || 'Bilinmeyen hata')
      }
    }

    async function onLoadClick() {
      if (isDemo() && link.state !== 'online') {
        void openVolume(makePhantom(), '')
        return
      }
      if (link.state !== 'online') {
        toast(CONN_HINT[link.state], 'warn')
        return
      }
      try {
        const response = await cbctFetch('/api/pick-folder', { method: 'POST' })
        if (response.status === 409) {
          $<HTMLInputElement>('folder-dicom').click()
          return
        }
        const body = await response.json()
        if (body.path) await loadCase({ kind: 'path', path: body.path })
      } catch (error) {
        toast(`Klasör seçilemedi: ${(error as Error).message}`, 'error')
      }
    }

    async function resetCase() {
      loadToken++
      cancelActiveJob()
      currentXhr?.abort()
      const dataset = activeDatasetId
      activeDatasetId = ''
      volume = null
      currentArch = null
      controlPoints = []
      initialControlPoints = []
      arches.clear()
      hover = null
      lastAxialHu = null
      lastSource = null
      axialGeom = panoGeom = null
      crossImgs.length = 0
      crossGeoms.length = 0
      viewer3d?.dispose()
      viewer3d = null
      renderer.release()
      crossCells.length = 0
      crossStrip.replaceChildren()
      updatePatientMetaUi(undefined, root!)
      closeResetConfirm()
      closePop()
      closeTopPopovers()
      loading.hide()
      setCaseInfo('')
      showEmpty()
      if (dataset) void cbctFetch(`/api/datasets/${dataset}`, { method: 'DELETE' }).catch(() => undefined)
    }

    // ---- Canlı Servis Olayları (SSE) ------------------------------------------------------------
    link.addEventListener('state', updateServiceUi)
    link.addEventListener('event', (event) => {
      const { event: name, data } = (event as CustomEvent<ServerEventDetail>).detail
      if (name === 'clients') updateServiceUi()
      if (name === 'service.stopping' && volume && !loading.visible) {
        toast(
          'Servis durduruldu. Görüntüler ekranda kalır; AI ve yeniden yükleme için servisi başlatın.',
          'warn',
          12000
        )
      }
      if (name === 'dataset.released' && data.datasetId === activeDatasetId && data.reason !== 'viewer') {
        activeDatasetId = ''
        toast('Vaka serviste serbest bırakıldı. Görüntüler ekranda kalır.', 'warn')
      }
    })
    link.addEventListener('restarted', () => {
      updateServiceUi()
      if (!volume || loading.visible || !lastSource) return
      reopen(lastSource)
        .then((id) => {
          activeDatasetId = id
          if (volume) volume.datasetId = id
          toast('Servis yeniden bağlandı; vaka yeniden kaydedildi.', 'ok')
        })
        .catch((error) => toast(`Servis geri geldi ama vaka yeniden kaydedilemedi: ${(error as Error).message}`, 'warn'))
    })

    // ---- Arayüz Bağlantıları (UI Wiring) --------------------------------------------------------
    function closeViewerModal() {
      loadToken++
      cancelActiveJob()
      currentXhr?.abort()
      loading.hide()
      onCloseRef.current()
    }

    loading.onCancel(() => {
      loadToken++
      cancelActiveJob()
      currentXhr?.abort()
      loading.hide()
      if (!volume) {
        if (initialFiles && initialFiles.length > 0) {
          onCloseRef.current()
        } else {
          showEmpty()
        }
      }
    })
    loading.onClose(() => closeViewerModal())
    loading.onRetry(() => {
      if (lastSource) void loadCase(lastSource)
    })

    const resetModal = $('modal-reset-confirm')
    const btnCancelReset = $('btn-reset-cancel')
    const btnProceedReset = $('btn-reset-proceed')

    function openResetConfirm() {
      resetModal.hidden = false
      btnCancelReset.focus()
    }
    function closeResetConfirm() {
      resetModal.hidden = true
    }

    for (const id of ['btn-load', 'btn-load-empty']) $(id).onclick = () => void onLoadClick()
    $('btn-reset').onclick = () => openResetConfirm()
    for (const id of ['btn-close-modal', 'btn-close-empty', 'btn-close-empty-top']) {
      const el = root.querySelector<HTMLElement>(`#${id}`)
      if (el) el.onclick = () => closeViewerModal()
    }
    btnCancelReset.onclick = () => closeResetConfirm()
    btnProceedReset.onclick = () => {
      closeResetConfirm()
      void resetCase()
      toast('Vaka ve analiz verileri temizlendi. Başlangıç ekranına dönüldü.', 'info', 4000)
    }
    resetModal.addEventListener(
      'click',
      (event) => {
        if (event.target === resetModal) closeResetConfirm()
      },
      { signal }
    )
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !resetModal.hidden) {
        event.stopPropagation()
        closeResetConfirm()
      }
    }
    window.addEventListener('keydown', onWindowKeyDown, { signal })

    $<HTMLInputElement>('folder-dicom').onchange = (event) => {
      const input = event.target as HTMLInputElement,
        files = Array.from(input.files ?? [])
      input.value = ''
      if (files.length) void loadCase({ kind: 'files', files })
    }

    // Sürükle-bırak ile DICOM klasörü yükleme
    const emptyState = $('empty-state')
    emptyState.addEventListener(
      'dragover',
      (event) => {
        event.preventDefault()
        emptyState.classList.add('drag')
      },
      { signal }
    )
    emptyState.addEventListener('dragleave', () => emptyState.classList.remove('drag'), { signal })
    emptyState.addEventListener(
      'drop',
      async (event) => {
        event.preventDefault()
        emptyState.classList.remove('drag')
        const entries = Array.from(event.dataTransfer?.items ?? [])
          .map((item) => item.webkitGetAsEntry?.())
          .filter(Boolean) as FileSystemEntry[]
        const files: File[] = []
        const walk = async (entry: FileSystemEntry): Promise<void> => {
          if (entry.isFile) {
            files.push(
              await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
            )
          } else {
            const reader = (entry as FileSystemDirectoryEntry).createReader()
            for (;;) {
              const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
                reader.readEntries(resolve, reject)
              )
              if (!batch.length) break
              for (const child of batch) await walk(child)
            }
          }
        }
        for (const entry of entries) await walk(entry)
        if (!files.length) {
          const directFiles = Array.from(event.dataTransfer?.files ?? [])
          files.push(...directFiles)
        }
        if (!files.length) return
        if (link.state !== 'online') return toast(CONN_HINT[link.state], 'warn')
        void loadCase({ kind: 'files', files })
      },
      { signal }
    )

    // Kaydırıcı ve seçim kutusu bağlantıları
    const bind = (id: string, callback: () => void) =>
      $<HTMLInputElement>(id).addEventListener(
        'input',
        () => {
          if (disposed) return
          const output = root.querySelector<HTMLElement>(`#${id.replace('in-', 'o-')}`)
          if (output) output.textContent = $<HTMLInputElement>(id).value
          callback()
        },
        { signal }
      )
    const windowChanged = () => {
      $<HTMLSelectElement>('in-wlpreset').value = 'custom'
      refreshWindow()
    }
    let archSlabTimer = 0
    bind('in-slice', () => {
      drawAxial()
      drawPanoOverlay()
      schedule3d()
    })
    bind('in-thick', () => {
      drawPano()
      drawAxialOverlay()
      drawCrossOverlay(0)
      for (let k = 1; k < crossCells.length; k++) drawCrossOverlay(k)
    })
    bind('in-wc', windowChanged)
    bind('in-ww', windowChanged)
    bind('in-arch-slab', () => {
      if (!volume) return
      window.clearTimeout(archSlabTimer)
      archSlabTimer = window.setTimeout(() => {
        void detectSliceArch()
      }, 260)
    })
    $<HTMLInputElement>('in-max').addEventListener(
      'change',
      () => {
        if (disposed) return
        drawPano()
        drawCross(true)
      },
      { signal }
    )
    $<HTMLInputElement>('in-tracking').addEventListener(
      'change',
      () => {
        if (disposed) return
        drawPano()
        drawAxialOverlay()
        drawCrossOverlay(0)
        for (let k = 1; k < crossCells.length; k++) drawCrossOverlay(k)
        schedule3d()
      },
      { signal }
    )
    $<HTMLSelectElement>('in-spacing').addEventListener('change', scheduleSections, { signal })
    $<HTMLSelectElement>('in-width').addEventListener('change', scheduleSections, { signal })
    $<HTMLSelectElement>('in-cross-thick').addEventListener(
      'change',
      () => {
        if (disposed) return
        drawCross(true)
      },
      { signal }
    )
    $<HTMLSelectElement>('in-jaw').onchange = () => {
      if (disposed || !volume) return
      const next = jaw()
      saveJaw(selectedJaw)
      selectedJaw = next
      const slice = $<HTMLInputElement>('in-slice')
      slice.value = String(autoSlice(next))
      $('o-slice').textContent = slice.value
      loadJaw(next)
      if (!currentArch) {
        clearDerivedViews()
        drawAxial()
        void detectArch()
      } else refresh()
    }
    $<HTMLSelectElement>('in-wlpreset').addEventListener(
      'change',
      (event) => {
        if (disposed) return
        const preset = WL_PRESETS[(event.target as HTMLSelectElement).value]
        if (!preset) return
        $<HTMLInputElement>('in-wc').value = String(preset.wc)
        $<HTMLInputElement>('in-ww').value = String(preset.ww)
        $('o-wc').textContent = String(preset.wc)
        $('o-ww').textContent = String(preset.ww)
        refreshWindow()
      },
      { signal }
    )

    // Aksiyel sol araç çubuğundaki 3 aksiyon butonu (⟲, ⌁, ⋯)
    $('tool-redetect').onclick = () => {
      if (!volume) return
      void detectSliceArch()
    }
    $('tool-occlusal').onclick = () => {
      if (!volume) return
      void detectOcclusalSplineArch()
    }
    $('tool-reseed').onclick = () => {
      if (!currentArch) return
      if (initialControlPoints.length >= 3) {
        controlPoints = initialControlPoints.map((p) => [...p] as Pt)
      } else {
        seedControls(true)
      }
      rebuildFromControls()
      refresh()
      toast('Kontrol noktaları ilk tespit edilen orijinal konumlarına sıfırlandı.', 'ok', 4000)
    }
    $('tool-export').onclick = () => {
      const canvas = cvPano.hidden ? cvPanoCpu : cvPano
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `${jaw()}-panoramic.png`
      a.click()
    }

    // 3B VR kontrolleri
    function applyViewer3dOptions() {
      if (!viewer3d) return
      viewer3d.setPreset($<HTMLSelectElement>('in-preset').value as Parameters<Viewer3D['setPreset']>[0])
      viewer3d.setOpacity(num('in-opacity'))
      viewer3d.setBrightness(num('in-brightness'))
      viewer3d.setClip($<HTMLInputElement>('in-clip').checked)
      viewer3d.setGuideVisibility({
        arch: $<HTMLInputElement>('in-g-arch').checked,
        planes: $<HTMLInputElement>('in-g-planes').checked,
        level: $<HTMLInputElement>('in-g-level').checked,
        surface: $<HTMLInputElement>('in-g-surface').checked,
      })
    }
    $<HTMLSelectElement>('in-preset').addEventListener('change', applyViewer3dOptions, { signal })
    bind('in-opacity', () => viewer3d?.setOpacity(num('in-opacity')))
    bind('in-brightness', () => viewer3d?.setBrightness(num('in-brightness')))
    for (const id of ['in-clip', 'in-g-arch', 'in-g-planes', 'in-g-level', 'in-g-surface']) {
      $<HTMLInputElement>(id).addEventListener('change', applyViewer3dOptions, { signal })
    }
    $('tool-3d-reset').onclick = () => viewer3d?.resetCamera()
    $('tool-3d-shot').onclick = () => {
      const url = viewer3d?.screenshot()
      if (!url) return
      const a = document.createElement('a')
      a.href = url
      a.download = '3d-view.png'
      a.click()
    }
    root.querySelectorAll<HTMLButtonElement>('.tool.dir').forEach((button) => {
      button.onclick = () => viewer3d?.view(button.dataset.dir as Parameters<Viewer3D['view']>[0])
    })

    // Aksiyel fare etkileşimleri
    const axialPoint = (event: MouseEvent): Pt | null => {
      if (!volume || !axialGeom) return null
      const r = cvAxial.getBoundingClientRect()
      return [
        ((event.clientX - r.left) / r.width) * volume.nx * volume.sx,
        ((event.clientY - r.top) / r.height) * volume.ny * volume.sy,
      ]
    }
    function hitControl(event: MouseEvent): number {
      const point = axialPoint(event)
      if (!point || !volume) return -1
      const r = cvAxial.getBoundingClientRect(),
        radius = 12 * ((volume.nx * volume.sx) / r.width)
      let hit = -1,
        distance = radius
      controlPoints.forEach((c, i) => {
        const d = Math.hypot(c[0] - point[0], c[1] - point[1])
        if (d < distance) {
          hit = i
          distance = d
        }
      })
      return hit
    }
    let dragFrame = 0
    let wlDrag: { x: number; y: number; wc: number; ww: number; moved: boolean; deleteIndex: number } | null = null
    stageAxial.addEventListener('contextmenu', (event) => event.preventDefault(), { signal })
    stageAxial.addEventListener(
      'mousedown',
      (event) => {
        if (!volume) return
        if (event.button === 0 && currentArch) {
          dragIndex = hitControl(event)
          if (dragIndex >= 0) event.preventDefault()
        }
        if (event.button === 2) {
          wlDrag = {
            x: event.clientX,
            y: event.clientY,
            wc: num('in-wc'),
            ww: num('in-ww'),
            moved: false,
            deleteIndex: currentArch ? hitControl(event) : -1,
          }
          event.preventDefault()
        }
      },
      { signal }
    )
    let panoDrag = false
    const onWindowMouseMove = (event: MouseEvent) => {
      if (wlDrag) {
        const dx = event.clientX - wlDrag.x,
          dy = event.clientY - wlDrag.y
        if (Math.hypot(dx, dy) > 3) wlDrag.moved = true
        if (wlDrag.moved) {
          const ww = Math.max(50, Math.min(4000, wlDrag.ww + dx * 6)),
            wc = Math.max(-500, Math.min(2500, wlDrag.wc - dy * 6))
          $<HTMLInputElement>('in-wc').value = String(Math.round(wc))
          $<HTMLInputElement>('in-ww').value = String(Math.round(ww))
          $('o-wc').textContent = String(Math.round(wc))
          $('o-ww').textContent = String(Math.round(ww))
          $<HTMLSelectElement>('in-wlpreset').value = 'custom'
          if (!dragFrame) {
            dragFrame = requestAnimationFrame(() => {
              dragFrame = 0
              if (!disposed) refreshWindow()
            })
          }
        }
        return
      }
      if (dragIndex >= 0) {
        const point = axialPoint(event)
        if (!point) return
        controlPoints[dragIndex] = point
        if (!dragFrame) {
          dragFrame = requestAnimationFrame(() => {
            dragFrame = 0
            if (disposed) return
            rebuildFromControls()
            drawAxialOverlay()
            drawPano(true)
            drawCross(true, true)
          })
        }
      }
    }
    const onWindowMouseUp = () => {
      panoDrag = false
      if (wlDrag) {
        if (!wlDrag.moved && wlDrag.deleteIndex >= 0 && controlPoints.length > 3) {
          controlPoints.splice(wlDrag.deleteIndex, 1)
          rebuildFromControls()
          refresh()
        }
        wlDrag = null
      }
      if (dragIndex >= 0) {
        dragIndex = -1
        rebuildFromControls()
        refresh()
      }
    }
    window.addEventListener('mousemove', onWindowMouseMove, { signal })
    window.addEventListener('mouseup', onWindowMouseUp, { signal })

    stageAxial.addEventListener(
      'mousemove',
      (event) => {
        if (!volume || !axialGeom) return
        cvAxial.style.cursor = hitControl(event) >= 0 || dragIndex >= 0 ? 'grab' : 'crosshair'
        const p = axialPoint(event)
        if (!p) return
        const x = Math.round(p[0] / volume.sx),
          y = Math.round(p[1] / volume.sy)
        if (x < 0 || y < 0 || x >= volume.nx || y >= volume.ny) return
        const hu = volume.data[x + volume.nx * (y + volume.ny * num('in-slice'))]
        hover = { panel: 'axial', hu }
        lastAxialHu = hu
        scheduleOverlay('axial')
      },
      { signal }
    )
    stageAxial.addEventListener(
      'mouseleave',
      () => {
        if (hover?.panel === 'axial') {
          hover = null
          drawAxialOverlay()
        }
      },
      { signal }
    )
    stageAxial.addEventListener(
      'wheel',
      (event) => {
        if (!volume) return
        event.preventDefault()
        const slice = $<HTMLInputElement>('in-slice'),
          step = (event.shiftKey ? 5 : 1) * (event.deltaY > 0 ? 1 : -1)
        slice.value = String(Math.max(0, Math.min(volume.nz - 1, Number(slice.value) + step)))
        $('o-slice').textContent = slice.value
        drawAxial()
        drawPanoOverlay()
        schedule3d()
      },
      { passive: false, signal }
    )
    cvAxial.addEventListener(
      'dblclick',
      (event) => {
        if (!currentArch || hitControl(event) >= 0) return
        const point = axialPoint(event)
        if (!point) return
        let insert = 0,
          best = Infinity
        for (let i = 0; i < controlPoints.length - 1; i++) {
          const [a, b] = [controlPoints[i], controlPoints[i + 1]],
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            length = dx * dx + dy * dy || 1
          const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length))
          const distance = Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy))
          if (distance < best) {
            best = distance
            insert = i
          }
        }
        controlPoints.splice(insert + 1, 0, point)
        rebuildFromControls()
        refresh()
      },
      { signal }
    )

    // Panoramik etkileşim
    function setCenterFromPano(event: MouseEvent) {
      if (!currentArch || !panoGeom) return
      const r = (cvPano.hidden ? cvPanoCpu : cvPano).getBoundingClientRect()
      centerS = ((event.clientX - r.left) / r.width) * currentArch.length
      clampCenter()
      scheduleSections()
    }
    panoStage.addEventListener(
      'mousedown',
      (event) => {
        if (event.button === 0) {
          panoDrag = true
          setCenterFromPano(event)
        }
      },
      { signal }
    )
    panoStage.addEventListener(
      'mousemove',
      (event) => {
        if (panoDrag) setCenterFromPano(event)
        if (!volume || !currentArch || !panoGeom) return
        const r = (cvPano.hidden ? cvPanoCpu : cvPano).getBoundingClientRect()
        const fx = (event.clientX - r.left) / r.width,
          fy = (event.clientY - r.top) / r.height
        if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return
        const f = archFrameAt(currentArch, fx * currentArch.length)
        const z = (1 - fy) * (volume.nz - 1),
          offset = panoramaOffset(currentArch, fx * (currentArch.points.length - 1), z, slab().trackMandible)
        hover = {
          panel: 'pano',
          hu: sample(volume, (f.p[0] + f.n[0] * offset) / volume.sx, (f.p[1] + f.n[1] * offset) / volume.sy, z),
        }
        scheduleOverlay('pano')
      },
      { signal }
    )
    panoStage.addEventListener(
      'mouseleave',
      () => {
        if (hover?.panel === 'pano') {
          hover = null
          drawPanoOverlay()
        }
      },
      { signal }
    )
    panoStage.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault()
        stepCenter(event.deltaY > 0 ? 1 : -1)
      },
      { passive: false, signal }
    )

    const onWindowResize = () => {
      if (volume) {
        refresh()
        viewer3d?.resize()
      }
    }
    window.addEventListener('resize', onWindowResize, { signal })

    // ---- Başlangıç (Startup) --------------------------------------------------------------------
    $<HTMLSelectElement>('in-wlpreset').value = 'bone'
    updatePatientMetaUi(undefined, root)
    updateServiceUi()
    link.connect()
    if (initialFiles && initialFiles.length > 0) {
      void loadCase({ kind: 'files', files: initialFiles })
    } else if (isDemo()) {
      void openVolume(makePhantom(), '')
    }

    return () => {
      disposed = true
      listenerAbort.abort()
      loadToken++
      detectToken++
      cancelActiveJob()
      currentXhr?.abort()
      if (activeDatasetId) {
        const dataset = activeDatasetId
        activeDatasetId = ''
        void cbctFetch(`/api/datasets/${dataset}`, { method: 'DELETE' }).catch(() => undefined)
      }
      window.clearTimeout(toastTimer)
      window.clearTimeout(crossRefineTimer)
      window.clearTimeout(guideTimer)
      window.clearTimeout(archSlabTimer)
      if (overlayFrame) cancelAnimationFrame(overlayFrame)
      if (sectionFrame) cancelAnimationFrame(sectionFrame)
      if (dragFrame) cancelAnimationFrame(dragFrame)
      crossCells.length = 0
      crossStrip.replaceChildren()
      viewer3d?.dispose()
      viewer3d = null
      $('vtk-stage')?.replaceChildren()
      renderer.release()
      link.disconnect()
      disposeServiceUi()
      disposeTooltips()
    }
  }, [initialFiles])

  return (
    <div ref={rootRef} className={styles.cbctModalRoot} role="dialog" aria-modal="true" aria-label="3D CBCT Viewer">
      <header className="topbar">
        <h1>
          <span className="logo">◖◗</span> 3D CBCT Viewer
        </h1>
        <span id="case-info" className="case-info"></span>
        <div className="actions">
          <button
            id="btn-load"
            type="button"
            className="btn primary"
            title="Bilgisayarınızdaki bir CBCT DICOM serisi klasörünü seçerek vakayı açar."
            data-tip="Bilgisayarınızdaki bir CBCT DICOM serisi klasörünü seçerek vakayı açar."
          >
            DICOM Klasörü Yükle
          </button>
          <button
            id="btn-reset"
            type="button"
            className="btn btn-reset"
            hidden
            title="Mevcut vakayı kapatıp başlangıç ekranına döner."
            data-tip="Mevcut vakayı kapatıp başlangıç ekranına döner."
            aria-label="Vakayı Sıfırla"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <button
            id="btn-patient-meta"
            type="button"
            className="btn profile-button"
            aria-haspopup="dialog"
            aria-label="Hasta ve Çekim Bilgileri"
            title="Hastanın kimlik, çekim tarihi ve tomografi cihaz bilgilerini gösterir."
            data-tip="Hastanın kimlik, çekim tarihi ve tomografi cihaz bilgilerini gösterir."
          >
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
          <button
            id="btn-service"
            type="button"
            className="btn service-button"
            aria-haspopup="dialog"
            title="Yerel AI ve görüntü işleme servisinin bağlantı durumunu gösterir."
            data-tip="Yerel AI ve görüntü işleme servisinin bağlantı durumunu gösterir."
          >
            <span id="service-dot" className="service-dot"></span> Local Service
          </button>
          <button
            id="btn-close-modal"
            type="button"
            className="btn btn-close-modal"
            title="3D CBCT görüntüleyiciyi kapatıp tedavi planlamaya döner."
            data-tip="3D CBCT görüntüleyiciyi kapatıp tedavi planlamaya döner."
            aria-label="Görüntüleyiciyi Kapat"
          >
            ✕ Kapat
          </button>
          <input
            id="folder-dicom"
            type="file"
            // @ts-expect-error webkitdirectory is standard in modern browsers for folder selection
            webkitdirectory=""
            directory=""
            multiple
            hidden
          />
        </div>
      </header>

      <div id="patient-popover" className="service-popover patient-popover" hidden role="dialog" aria-label="Hasta ve Çekim Bilgileri">
        <strong>Hasta &amp; Çekim Bilgileri</strong>
        <dl>
          <dt data-tip="Tomografi çekimi yapılan hastanın adı ve soyadıdır." title="Tomografi çekimi yapılan hastanın adı ve soyadıdır.">
            Ad Soyad
          </dt>
          <dd id="pm-name" data-tip="Tomografi çekimi yapılan hastanın adı ve soyadıdır." title="Tomografi çekimi yapılan hastanın adı ve soyadıdır.">
            —
          </dd>

          <dt
            data-tip="Kliniğin veya görüntüleme merkezinin hastaya verdiği kayıt numarasıdır."
            title="Kliniğin veya görüntüleme merkezinin hastaya verdiği kayıt numarasıdır."
          >
            Hasta No
          </dt>
          <dd
            id="pm-id"
            data-tip="Kliniğin veya görüntüleme merkezinin hastaya verdiği kayıt numarasıdır."
            title="Kliniğin veya görüntüleme merkezinin hastaya verdiği kayıt numarasıdır."
          >
            —
          </dd>

          <dt
            data-tip="Hastanın doğum tarihi ve çekim sırasındaki yaşıdır."
            title="Hastanın doğum tarihi ve çekim sırasındaki yaşıdır."
          >
            Doğum Tarihi
          </dt>
          <dd
            id="pm-birth"
            data-tip="Hastanın doğum tarihi ve çekim sırasındaki yaşıdır."
            title="Hastanın doğum tarihi ve çekim sırasındaki yaşıdır."
          >
            —
          </dd>

          <dt data-tip="DICOM kaydında yer alan hasta cinsiyeti bilgisidir." title="DICOM kaydında yer alan hasta cinsiyeti bilgisidir.">
            Cinsiyet
          </dt>
          <dd
            id="pm-sex"
            data-tip="DICOM kaydında yer alan hasta cinsiyeti bilgisidir."
            title="DICOM kaydında yer alan hasta cinsiyeti bilgisidir."
          >
            —
          </dd>

          <dt
            data-tip="3 boyutlu diş tomografisinin çekildiği tarih ve saattir."
            title="3 boyutlu diş tomografisinin çekildiği tarih ve saattir."
          >
            Çekim Tarihi
          </dt>
          <dd
            id="pm-date"
            data-tip="3 boyutlu diş tomografisinin çekildiği tarih ve saattir."
            title="3 boyutlu diş tomografisinin çekildiği tarih ve saattir."
          >
            —
          </dd>

          <dt
            data-tip="Çekimin yapıldığı 3D dental tomografi cihazının marka ve modelidir."
            title="Çekimin yapıldığı 3D dental tomografi cihazının marka ve modelidir."
          >
            Cihaz / Model
          </dt>
          <dd
            id="pm-device"
            data-tip="Çekimin yapıldığı 3D dental tomografi cihazının marka ve modelidir."
            title="Çekimin yapıldığı 3D dental tomografi cihazının marka ve modelidir."
          >
            —
          </dd>

          <dt
            data-tip="Çekimin gerçekleştirildiği klinik ve sorumlu hekim bilgisidir."
            title="Çekimin gerçekleştirildiği klinik ve sorumlu hekim bilgisidir."
          >
            Kurum / Hekim
          </dt>
          <dd
            id="pm-clinic"
            data-tip="Çekimin gerçekleştirildiği klinik ve sorumlu hekim bilgisidir."
            title="Çekimin gerçekleştirildiği klinik ve sorumlu hekim bilgisidir."
          >
            —
          </dd>

          <dt
            data-tip="Cihazın görüntü oluştururken kullandığı tüp voltajı, akımı ve çekim süresidir."
            title="Cihazın görüntü oluştururken kullandığı tüp voltajı, akımı ve çekim süresidir."
          >
            Çekim Değerleri
          </dt>
          <dd
            id="pm-exposure"
            data-tip="Cihazın görüntü oluştururken kullandığı tüp voltajı, akımı ve çekim süresidir."
            title="Cihazın görüntü oluştururken kullandığı tüp voltajı, akımı ve çekim süresidir."
          >
            —
          </dd>

          <dt
            data-tip="Çekim sırasında cihazın kaydettiği radyasyon dozu miktarıdır."
            title="Çekim sırasında cihazın kaydettiği radyasyon dozu miktarıdır."
          >
            Radyasyon Dozu
          </dt>
          <dd
            id="pm-dose"
            data-tip="Çekim sırasında cihazın kaydettiği radyasyon dozu miktarıdır."
            title="Çekim sırasında cihazın kaydettiği radyasyon dozu miktarıdır."
          >
            —
          </dd>

          <dt
            data-tip="Tomografinin çenede görüntülediği bölgenin genişlik ve yükseklik boyutudur."
            title="Tomografinin çenede görüntülediği bölgenin genişlik ve yükseklik boyutudur."
          >
            Görüntü Alanı (FOV)
          </dt>
          <dd
            id="pm-fov"
            data-tip="Tomografinin çenede görüntülediği bölgenin genişlik ve yükseklik boyutudur."
            title="Tomografinin çenede görüntülediği bölgenin genişlik ve yükseklik boyutudur."
          >
            —
          </dd>

          <dt
            data-tip="Görüntünün milimetrik netlik derecesi (voksel boyutu) ve toplam kesit sayısıdır."
            title="Görüntünün milimetrik netlik derecesi (voksel boyutu) ve toplam kesit sayısıdır."
          >
            Voksel / Kesit
          </dt>
          <dd
            id="pm-res"
            data-tip="Görüntünün milimetrik netlik derecesi (voksel boyutu) ve toplam kesit sayısıdır."
            title="Görüntünün milimetrik netlik derecesi (voksel boyutu) ve toplam kesit sayısıdır."
          >
            —
          </dd>
        </dl>
      </div>

      <div id="service-popover" className="service-popover" hidden role="dialog" aria-label="Local service status">
        <strong id="sp-state">Offline</strong>
        <dl>
          <dt>Adres</dt>
          <dd id="sp-address">—</dd>
          <dt>Motor</dt>
          <dd id="sp-engine">—</dd>
          <dt>Başlangıç</dt>
          <dd id="sp-started">—</dd>
          <dt>Yönetici</dt>
          <dd id="sp-manager">—</dd>
        </dl>
        <div className="svc-cta" data-svc-cta hidden>
          <p data-svc="note"></p>
          <button className="btn primary" data-svc="primary" type="button"></button>
          <button className="link-btn" data-svc="alt" type="button"></button>
          <button className="mac-guide-link" data-svc="macguide" type="button">
            🍎 Mac Güvenlik Rehberi
          </button>
        </div>
      </div>

      <section id="empty-state" className="empty-state">
        <div className="empty-card">
          <button
            id="btn-close-empty-top"
            type="button"
            className="loading-close-top"
            aria-label="Görüntüleyiciyi Kapat"
            title="3D CBCT görüntüleyiciyi kapatıp tedavi planlamaya döner."
          >
            ✕
          </button>
          <div className="empty-logo" aria-hidden="true">
            ◖◗
          </div>
          <h2 id="empty-title">Başlamak için bir DICOM serisi seçin</h2>
          <p id="empty-desc">
            Seri klasörünü seçin ya da buraya sürükleyin. Panoramik, kesitler ve 3D görünüm AI segmentasyonu tamamlanınca birlikte açılır.
          </p>
          <div className="empty-actions">
            <button
              id="btn-load-empty"
              type="button"
              className="btn primary large"
              title="Bilgisayarınızdaki bir CBCT DICOM serisi klasörünü seçerek vakayı açar."
              data-tip="Bilgisayarınızdaki bir CBCT DICOM serisi klasörünü seçerek vakayı açar."
            >
              DICOM Klasörü Yükle
            </button>
            <button
              id="btn-close-empty"
              type="button"
              className="btn btn-close-modal large"
              title="3D CBCT görüntüleyiciyi kapatıp tedavi planlamaya döner."
              data-tip="3D CBCT görüntüleyiciyi kapatıp tedavi planlamaya döner."
            >
              ← Geri Dön / Kapat
            </button>
          </div>
          <div className="svc-cta" data-svc-cta hidden>
            <p data-svc="note"></p>
            <button className="btn primary large" data-svc="primary" type="button"></button>
            <button className="link-btn" data-svc="alt" type="button"></button>
            <button className="mac-guide-link" data-svc="macguide" type="button">
              🍎 Mac Güvenlik Uyarısı Rehberi (Sağ Tık &gt; Aç)
            </button>
          </div>
          <p id="empty-hint" className="empty-hint"></p>
        </div>
      </section>

      <main className="grid" id="viewer" hidden>
        <section className="panel" id="panel-axial" aria-label="Axial">
          <div className="tools" aria-label="Axial tools">
            <button
              type="button"
              className="tool"
              data-pop="pop-axial"
              title="Çene seçimi, kontrast, kesit numarası ve kesit arama kalınlığı ayarlarını açar."
              data-tip="Çene seçimi, kontrast, kesit numarası ve kesit arama kalınlığı ayarlarını açar."
            >
              ◐
            </button>
            <button
              type="button"
              className="tool"
              id="tool-redetect"
              title="Seçili aksiyel kesit seviyesinden ark eğrisi tespit eder."
              data-tip="Seçili aksiyel kesit seviyesinden ark eğrisi tespit eder."
            >
              ⟲
            </button>
            <button
              type="button"
              className="tool"
              id="tool-occlusal"
              title="AI diş kuronlarından 17 noktalı oklüzal B-spline arkını yeniden hesaplar."
              data-tip="AI diş kuronlarından 17 noktalı oklüzal B-spline arkını yeniden hesaplar."
            >
              ⌁
            </button>
            <button
              type="button"
              className="tool"
              id="tool-reseed"
              title="Sarı kontrol noktalarını ilk tespit edilen orijinal konumlarına sıfırlar."
              data-tip="Sarı kontrol noktalarını ilk tespit edilen orijinal konumlarına sıfırlar."
            >
              ⋯
            </button>
          </div>
          <div className="stage" id="stage-axial">
            <canvas id="cv-axial"></canvas>
            <canvas className="overlay" id="ov-axial"></canvas>
          </div>
        </section>

        <section className="panel" id="panel-pano" aria-label="Panoramic">
          <div className="tools" aria-label="Panoramic tools">
            <button
              type="button"
              className="tool"
              data-pop="pop-pano"
              title="Panoramik katman kalınlığı, MIP ve alt çene gövdesi takip ayarlarını açar."
              data-tip="Panoramik katman kalınlığı, MIP ve alt çene gövdesi takip ayarlarını açar."
            >
              ▤
            </button>
            <button
              type="button"
              className="tool"
              id="tool-export"
              title="Panoramik görüntüyü PNG dosyası olarak bilgisayarınıza indirir."
              data-tip="Panoramik görüntüyü PNG dosyası olarak bilgisayarınıza indirir."
            >
              ⇩
            </button>
          </div>
          <div className="stage" id="pano-stage">
            <canvas id="cv-pano"></canvas>
            <canvas id="cv-pano-cpu" hidden></canvas>
            <canvas className="overlay" id="ov-pano"></canvas>
          </div>
        </section>

        <section className="panel" id="panel-3d" aria-label="3D volume">
          <div className="tools" aria-label="3D tools">
            <button
              type="button"
              className="tool"
              data-pop="pop-3d"
              title="3D doku görünümü, opaklık, parlaklık ve kılavuz katman ayarlarını açar."
              data-tip="3D doku görünümü, opaklık, parlaklık ve kılavuz katman ayarlarını açar."
            >
              ◈
            </button>
            <button
              type="button"
              className="tool"
              id="tool-3d-reset"
              title="3D kamerayı varsayılan karşıdan (ön) bakış açısına sıfırlar."
              data-tip="3D kamerayı varsayılan karşıdan (ön) bakış açısına sıfırlar."
            >
              ⌂
            </button>
            <button
              type="button"
              className="tool"
              id="tool-3d-shot"
              title="3D hacim görüntüsünü PNG dosyası olarak bilgisayarınıza indirir."
              data-tip="3D hacim görüntüsünü PNG dosyası olarak bilgisayarınıza indirir."
            >
              ⇩
            </button>
            <span className="tool-sep"></span>
            <button type="button" className="tool dir" data-dir="A" title="3D modele önden (Anterior) bakar." data-tip="3D modele önden (Anterior) bakar.">
              A
            </button>
            <button type="button" className="tool dir" data-dir="P" title="3D modele arkadan (Posterior) bakar." data-tip="3D modele arkadan (Posterior) bakar.">
              P
            </button>
            <button
              type="button"
              className="tool dir"
              data-dir="R"
              title="3D modele hastanın sağ tarafından (Right) bakar."
              data-tip="3D modele hastanın sağ tarafından (Right) bakar."
            >
              R
            </button>
            <button
              type="button"
              className="tool dir"
              data-dir="L"
              title="3D modele hastanın sol tarafından (Left) bakar."
              data-tip="3D modele hastanın sol tarafından (Left) bakar."
            >
              L
            </button>
            <button
              type="button"
              className="tool dir"
              data-dir="H"
              title="3D modele üstten / baş yönünden (Head) bakar."
              data-tip="3D modele üstten / baş yönünden (Head) bakar."
            >
              H
            </button>
            <button
              type="button"
              className="tool dir"
              data-dir="F"
              title="3D modele alttan / çene altından (Foot) bakar."
              data-tip="3D modele alttan / çene altından (Foot) bakar."
            >
              F
            </button>
          </div>
          <div className="stage" id="vtk-stage">
            <span className="vr-badge" aria-hidden="true">
              VR
            </span>
          </div>
        </section>

        <section className="panel" id="panel-cross" aria-label="Cross-sections">
          <div className="tools" aria-label="Cross-section tools">
            <button
              type="button"
              className="tool"
              data-pop="pop-cross"
              title="Çapraz kesitlerin aralık, genişlik ve kalınlık ayarlarını açar."
              data-tip="Çapraz kesitlerin aralık, genişlik ve kalınlık ayarlarını açar."
            >
              ▥
            </button>
          </div>
          <div className="stage cross-strip" id="cross-strip"></div>
        </section>
      </main>

      <div className="popover" id="pop-axial" hidden>
        <label>
          Çene{' '}
          <select id="in-jaw" defaultValue="lower">
            <option value="lower">Alt</option>
            <option value="upper">Üst</option>
          </select>
        </label>
        <label>
          Pencere ön ayarı
          <select id="in-wlpreset" defaultValue="bone">
            <option value="bone">Kemik</option>
            <option value="tooth">Diş</option>
            <option value="soft">Yumuşak doku</option>
            <option value="custom">Özel</option>
          </select>
        </label>
        <label>
          Window center <output id="o-wc">500</output>
          <input id="in-wc" type="range" min="-500" max="2500" defaultValue="500" />
        </label>
        <label>
          Window width <output id="o-ww">2000</output>
          <input id="in-ww" type="range" min="100" max="4000" defaultValue="2000" />
        </label>
        <label>
          Aksiyel kesit <output id="o-slice">0</output>
          <input id="in-slice" type="range" min="0" max="0" defaultValue="0" />
        </label>
        <label>
          Kesit arama kalınlığı (mm) <output id="o-arch-slab">10</output>
          <input id="in-arch-slab" type="range" min="2" max="40" defaultValue="10" />
        </label>
      </div>
      <div className="popover" id="pop-pano" hidden>
        <label>
          Panorama kalınlığı (mm) <output id="o-thick">20</output>
          <input id="in-thick" type="range" min="0" max="35" defaultValue="20" step="0.5" />
        </label>
        <label className="inline">
          <input id="in-max" type="checkbox" /> MIP (ortalama yerine)
        </label>
        <label className="inline">
          <input id="in-tracking" type="checkbox" defaultChecked disabled /> Alt çene gövdesini takip et
        </label>
        <small>Yeşil bant bu kesitte örneklenen bölgedir. Sarı noktalar diş arkını düzenler.</small>
      </div>
      <div className="popover" id="pop-cross" hidden>
        <label>
          Kesit aralığı
          <select id="in-spacing" defaultValue="1">
            <option value="0.5">0.5 mm</option>
            <option value="1">1 mm</option>
            <option value="2">2 mm</option>
            <option value="3">3 mm</option>
          </select>
        </label>
        <label>
          Kesit yarı genişliği
          <select id="in-width" defaultValue="20">
            <option value="10">±10 mm</option>
            <option value="15">±15 mm</option>
            <option value="20">±20 mm</option>
            <option value="25">±25 mm</option>
          </select>
        </label>
        <label>
          Kesit kalınlığı
          <select id="in-cross-thick" defaultValue="2">
            <option value="0.5">0.5 mm</option>
            <option value="1">1 mm</option>
            <option value="2">2 mm</option>
            <option value="5">5 mm</option>
          </select>
        </label>
      </div>
      <div className="popover" id="pop-3d" hidden>
        <label>
          Görünüm
          <select id="in-preset" defaultValue="bone">
            <option value="bone">Kemik / Diş</option>
            <option value="tooth">Diş (mine)</option>
            <option value="soft">Yumuşak doku + kemik</option>
            <option value="mip">MIP</option>
            <option value="xray">X-Ray</option>
          </select>
        </label>
        <label>
          Opaklık <output id="o-opacity">1.0</output>
          <input id="in-opacity" type="range" min="0.2" max="2" step="0.1" defaultValue="1" />
        </label>
        <label>
          Parlaklık <output id="o-brightness">1.0</output>
          <input id="in-brightness" type="range" min="0.5" max="1.5" step="0.1" defaultValue="1" />
        </label>
        <label className="inline">
          <input id="in-clip" type="checkbox" /> Çene bölgesine kırp
        </label>
        <label className="inline">
          <input id="in-g-arch" type="checkbox" /> Arch eğrisi
        </label>
        <label className="inline">
          <input id="in-g-planes" type="checkbox" /> Kesit düzlemleri
        </label>
        <label className="inline">
          <input id="in-g-level" type="checkbox" /> Aksiyel düzlem
        </label>
        <label className="inline">
          <input id="in-g-surface" type="checkbox" /> AI alt çene yüzeyi
        </label>
      </div>

      <div id="modal-reset-confirm" className="confirm-modal" hidden role="dialog" aria-modal="true" aria-labelledby="confirm-reset-title">
        <div className="confirm-card">
          <div className="confirm-icon-wrap" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h3 id="confirm-reset-title">Vakayı Sıfırla</h3>
          <p>Yüklenen CBCT verisi, AI analizleri ve tüm kesit görüntüleri temizlenecektir. Başlangıç ekranına dönmek istediğinize emin misiniz?</p>
          <div className="confirm-actions">
            <button id="btn-reset-cancel" className="btn" type="button">
              Vazgeç
            </button>
            <button id="btn-reset-proceed" className="btn btn-warning-bold" type="button">
              Evet, Sıfırla
            </button>
          </div>
        </div>
      </div>

      {/* Mac Installation & Gatekeeper Guide Modal (macOS Sequoia Compatible) */}
      <div id="modal-mac-guide" className="confirm-modal" hidden>
        <div className="confirm-card mac-guide-card">
          <div className="mac-guide-header">
            <div className="confirm-icon-wrap mac-icon-wrap">🍎</div>
            <h3>Mac Güvenlik İzni Rehberi</h3>
            <p>macOS Sequoia, App Store dışı uygulamalarda ilk açılışta standart bir güvenlik onayı ister. Çözümü 30 saniyelik 2 adımdır:</p>
          </div>

          <div className="mac-steps">
            <div className="mac-step">
              <span className="step-num">1</span>
              <div className="step-content">
                <strong>DMG&apos;yi Açın &amp; Uygulamalar&apos;a Taşıyın</strong>
                <span>
                  İndirilen <code>PineClinic-Lokal-Servisler.dmg</code> dosyasını açıp uygulamayı <strong>Uygulamalar (Applications)</strong> klasörüne sürükleyin.
                </span>
              </div>
            </div>

            <div className="mac-step">
              <span className="step-num">2</span>
              <div className="step-content">
                <strong>Uygulamayı Açmayı Deneyin (&quot;Bitti&quot; Deyin)</strong>
                <span>
                  Uygulamaya çift tıklayın. <em>&quot;Apple kötü amaçlı yazılımı doğrulayamadı&quot;</em> uyarısı gelince <strong>&quot;Bitti&quot;</strong> butonuna basın.
                </span>
              </div>
            </div>

            <div className="mac-step highlight">
              <span className="step-num">3</span>
              <div className="step-content">
                <strong>Sistem Ayarları &gt; &quot;Yine de Aç&quot; (Önemli Adım)</strong>
                <span>
                  Mac&apos;inizde <strong>Sistem Ayarları &gt; Gizlilik ve Güvenlik</strong> sayfasına gidin. En alttaki <strong>&quot;Yine de Aç&quot; (Open Anyway)</strong> butonuna basıp onaylayın.
                </span>
              </div>
            </div>
          </div>

          <div className="mac-alt-tip">
            ✨ Bu izin macOS tarafından <strong>yalnızca ilk kurulumda bir defaya mahsus</strong> istenir. İzin verildikten sonra web arayüzünden <strong>&quot;Servisi Aç&quot;</strong> butonuna bastığınızda servis daima otomatik bağlanır.
          </div>

          <div className="confirm-actions">
            <button id="btn-mac-guide-close" className="btn primary" type="button">
              Anladım
            </button>
          </div>
        </div>
      </div>

      {/* Windows 10/11 Installation & SmartScreen Guide Modal */}
      <div id="modal-win-guide" className="confirm-modal" hidden>
        <div className="confirm-card mac-guide-card">
          <div className="mac-guide-header">
            <div className="confirm-icon-wrap mac-icon-wrap">🪟</div>
            <h3>Windows Kurulum &amp; GPU Rehberi</h3>
            <p>Windows 10/11 üzerinde ekran kartı (NVIDIA CUDA veya AMD/Intel DirectX 12) destekli yerel servis kurulumu 3 adımda tamamlanır:</p>
          </div>

          <div className="mac-steps">
            <div className="mac-step">
              <span className="step-num">1</span>
              <div className="step-content">
                <strong>Setup Dosyasını Çalıştırın</strong>
                <span>
                  İndirilen <code>PineClinic-Lokal-Servisler-Setup.exe</code> kurulum sihirbazını çift tıklayarak başlatın.
                </span>
              </div>
            </div>

            <div className="mac-step highlight">
              <span className="step-num">2</span>
              <div className="step-content">
                <strong>Windows SmartScreen Uyarısı (&quot;Ek Bilgi &gt; Yine de Çalıştır&quot;)</strong>
                <span>
                  <em>&quot;Windows kişisel bilgisayarınızı korudu&quot;</em> penceresi açılırsa <strong>&quot;Ek bilgi&quot; (More info)</strong> bağlantısına tıklayıp altta beliren <strong>&quot;Yine de çalıştır&quot; (Run anyway)</strong> butonuna basın.
                </span>
              </div>
            </div>

            <div className="mac-step">
              <span className="step-num">3</span>
              <div className="step-content">
                <strong>Servisi Başlatın</strong>
                <span>
                  Kurulum tamamlandığında uygulama otomatik açılır. Masaüstü penceresinden veya buradaki <strong>&quot;Servisi Aç&quot;</strong> butonuna basarak GPU hızlandırmalı AI analizini başlatabilirsiniz.
                </span>
              </div>
            </div>
          </div>

          <div className="mac-alt-tip">
            ⚡ <strong>Otomatik Ekran Kartı Desteği:</strong> Servis bilgisayarınızdaki NVIDIA (CUDA FP16), AMD Radeon veya Intel Iris Xe / Arc (DirectX 12 DirectML) ekran kartını otomatik algılar; tüm tomografi verileri yalnızca bu bilgisayarda (`127.0.0.1`) işlenir.
          </div>

          <div className="confirm-actions">
            <button id="btn-win-guide-close" className="btn primary" type="button">
              Anladım
            </button>
          </div>
        </div>
      </div>

      <div id="loading" className="loading" hidden role="dialog" aria-live="polite" aria-label="Loading case"></div>
      <div id="toast" className="toast" hidden role="status"></div>
    </div>
  )
}
