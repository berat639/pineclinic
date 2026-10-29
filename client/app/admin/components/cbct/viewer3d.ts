/**
 * ============================================================================
 * 3B HACİM GÖRÜNTÜLEME PANELİ (src/viewer3d.ts — vtk.js Klinik VR)
 * ============================================================================
 * Bu modül, 4. paneldeki 3 Boyutlu Hacim Görüntüleme (Volume Rendering - VR)
 * sahnesini yönetir. 2B panellerin açılışını geciktirmemek için ~1 MB'lık vtk.js
 * WebGL yığını dinamik (lazy) olarak yüklenir.
 *
 * Klinik Standart VR Görünümü:
 * - Varsayılan 'bone' (Kemik / Diş) renk transfer fonksiyonu:
 *   Kehribar-kahve çene kemiği -> Fildişi diş kökleri/dentin -> Parlak beyaz mine.
 * - Gradient Opacity (Gradyan Opaklığı): Diş köklerini, interproksimal aralıkları
 *   ve kortikal kemik sınırlarını netleştirir; iç süngerimsi kemik bulanıklığını azaltır.
 * - Varsayılan olarak 3B kılavuz düzlemleri ve turkuaz AI poligon yüzeyi kapalıdır
 *   (flags = false), böylece dişler ve kökler perdelenmeden doğrudan görünür.
 * - Arka planda (AI segmentasyonu çalışırken) ana iş parçacığını (main thread)
 *   dondurmamak için vokseller kesit grupları halinde asenkron kopyalanır.
 * ============================================================================
 */
import type { ArchResult, Pt } from './arch/arch';
import { archFrameAt } from './cpr';
import { panoramaPoint } from './panoramaTracking';
import type { Volume } from './volume';

export type PresetName = 'bone' | 'tooth' | 'soft' | 'mip' | 'xray';
export type ViewDir = 'A' | 'P' | 'R' | 'L' | 'H' | 'F';

// vtk.js gevşek tiplerle gelir; aşağıdaki nesneler dar ve test edilmiş bir yüzey üzerinden kullanılır.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const MAX_VOXELS_3D = 160e6;
const MAX_DIM_3D = 512;

/**
 * vtk.js WebGL hacim ve geometri modüllerini ihtiyaç anında (lazy) yükler.
 */
async function loadVtk() {
  await Promise.all([import('@kitware/vtk.js/Rendering/Profiles/Volume'), import('@kitware/vtk.js/Rendering/Profiles/Geometry')]);
  const [
    GenericRenderWindow, VolumeMod, VolumeMapper, ImageData, DataArray, ColorTF, PiecewiseFunction, Plane, ImageMarchingCubes,
    PlaneSource, Actor, Mapper, PolyData, AxesActor, OrientationMarkerWidget,
  ] = await Promise.all([
    import('@kitware/vtk.js/Rendering/Misc/GenericRenderWindow'), import('@kitware/vtk.js/Rendering/Core/Volume'),
    import('@kitware/vtk.js/Rendering/Core/VolumeMapper'), import('@kitware/vtk.js/Common/DataModel/ImageData'),
    import('@kitware/vtk.js/Common/Core/DataArray'), import('@kitware/vtk.js/Rendering/Core/ColorTransferFunction'),
    import('@kitware/vtk.js/Common/DataModel/PiecewiseFunction'), import('@kitware/vtk.js/Common/DataModel/Plane'),
    import('@kitware/vtk.js/Filters/General/ImageMarchingCubes'), import('@kitware/vtk.js/Filters/Sources/PlaneSource'),
    import('@kitware/vtk.js/Rendering/Core/Actor'), import('@kitware/vtk.js/Rendering/Core/Mapper'),
    import('@kitware/vtk.js/Common/DataModel/PolyData'), import('@kitware/vtk.js/Rendering/Core/AxesActor'),
    import('@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget'),
  ]);
  const d = (m: Any) => m.default as Any;
  return {
    GenericRenderWindow: d(GenericRenderWindow), VtkVolume: d(VolumeMod), VolumeMapper: d(VolumeMapper), ImageData: d(ImageData),
    DataArray: d(DataArray), ColorTF: d(ColorTF), PiecewiseFunction: d(PiecewiseFunction), Plane: d(Plane),
    ImageMarchingCubes: d(ImageMarchingCubes), PlaneSource: d(PlaneSource), Actor: d(Actor), Mapper: d(Mapper),
    PolyData: d(PolyData), AxesActor: d(AxesActor), OrientationMarkerWidget: d(OrientationMarkerWidget),
  };
}

/**
 * CBCT yoğunluk değerleri cihaza (Meyer, KaVo, NewTom vb.) göre değiştiğinden,
 * MyDentViewer klinik VR referans eğrisi (%99.5 yoğunluk çapası = 1853.44 HU)
 * hacmin gerçek dağılımına göre ölçeklenir:
 * - soft (-512 HU): Hava / arka plan siyah eşiği
 * - t0   ( 886 HU): Süngerimsi kemik / opaklık başlangıç eşiği (op = 0.00)
 * - t1   (1853 HU): Kortikal kemik -> diş kökü (dentin) geçişi (op = 0.28, altın-okre)
 * - t2   (2893 HU): Yoğun diş minesi (saf beyaz kuron eşiği)
 * - max  (3072 HU): Maksimum referans tavanı (op = 0.50)
 */
export function intensityLevels(data: ArrayLike<number>): { soft: number; t0: number; t1: number; t2: number; max: number } {
  const stride = Math.max(1, Math.floor(data.length / 400000));
  const sample: number[] = [];
  for (let i = 0; i < data.length; i += stride) {
    sample.push(data[i]);
  }
  sample.sort((a, b) => a - b);
  const q = (p: number) => sample[Math.min(sample.length - 1, Math.floor(sample.length * p))];
  const p995 = q(0.995);
  const scale = p995 > 600 ? Math.min(1.35, Math.max(0.75, p995 / 1853.44)) : 1;
  const t0 = Math.round(885.76 * scale);
  const t1 = Math.round(1853.44 * scale);
  const t2 = Math.round(2892.80 * scale);
  const max = Math.max(Math.round(3072 * scale), t2 + 180);
  return { soft: Math.round(-512 * scale), t0, t1, t2, max };
}

export class Viewer3D {
  private vtk!: Awaited<ReturnType<typeof loadVtk>>;
  private grw: Any; private renderer: Any; private renderWindow: Any;
  private volume: Any; private mapper: Any; private property: Any;
  private maskActor: Any; private archActor: Any; private planeActors: Any[] = []; private levelActor: Any;
  private marker: Any; private resizeObserver?: ResizeObserver;
  private levels = { soft: 0, t0: 0, t1: 0, t2: 0, max: 0 };
  private bounds: [number, number, number, number, number, number] = [0, 1, 0, 1, 0, 1];
  private center: [number, number, number] = [0, 0, 0];
  private preset: PresetName = 'bone';
  private opacityScale = 1;
  private brightness = 1;
  private clip = false;
  private archPoints: Pt[] = [];
  private zMm = 0;
  // Varsayılan olarak tüm yardımcı 3B katmanlar kapalıdır; net klinik VR görünümü doğrudan açılır.
  private flags = { arch: false, planes: false, level: false, surface: false };
  private pendingMask: Uint8Array | undefined;
  private lastVolume: Volume | null = null;
  private disposed = false;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) { this.container = container; }

  /**
   * 3B hacmi GPU'ya yükler. Yükleme sırasında her 64 kesitte bir tarayıcıya nefes
   * aldırır (yield), böylece AI segmentasyonu ile paralel çalışırken arayüz donmaz.
   */
  async setVolume(v: Volume): Promise<void> {
    this.vtk ??= await loadVtk();
    if (this.disposed) return;
    const { vtk } = this;
    this.lastVolume = v;
    this.pendingMask = undefined;
    if (!this.grw) this.init();
    // 3B en fazla 160M voksel / eksen başına 512 kullanır; 2B paneller tam çözünürlüğü korur.
    const step = Math.max(1, Math.ceil(Math.max(v.nx, v.ny, v.nz) / MAX_DIM_3D), v.nx * v.ny * v.nz > MAX_VOXELS_3D ? 2 : 1);
    const nx = Math.ceil(v.nx / step), ny = Math.ceil(v.ny / step), nz = Math.ceil(v.nz / step);
    const scalars = new Int16Array(nx * ny * nz);
    for (let z = 0, o = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          scalars[o++] = v.data[x * step + v.nx * (y * step + v.ny * z * step)];
        }
      }
      if ((z & 63) === 63) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (this.disposed) return;
      }
    }
    const stepMm = Math.max(0.2, Math.min(v.sx, v.sy, v.sz) * step);
    const image = vtk.ImageData.newInstance({ spacing: [v.sx * step, v.sy * step, v.sz * step], origin: [0, 0, 0] });
    image.setDimensions(nx, ny, nz);
    image.getPointData().setScalars(vtk.DataArray.newInstance({ values: scalars, numberOfComponents: 1 }));
    this.mapper.setSampleDistance(stepMm);
    this.mapper.setMaximumSamplesPerRay(2000);
    this.mapper.setInputData(image);
    this.levels = intensityLevels(scalars);
    this.bounds = [0, (v.nx - 1) * v.sx, 0, (v.ny - 1) * v.sy, 0, (v.nz - 1) * v.sz];
    this.center = [this.bounds[1] / 2, this.bounds[3] / 2, this.bounds[5] / 2];
    this.applyPreset();
    this.applyClip();
    this.view('A');
  }

  private init(): void {
    const { vtk } = this;
    this.grw = vtk.GenericRenderWindow.newInstance({ background: [0, 0, 0] });
    this.grw.setContainer(this.container);
    if (!this.container.querySelector('.vr-badge')) {
      const badge = document.createElement('span');
      badge.className = 'vr-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = 'VR';
      this.container.appendChild(badge);
    }
    this.renderer = this.grw.getRenderer();
    this.renderWindow = this.grw.getRenderWindow();
    this.mapper = vtk.VolumeMapper.newInstance();
    this.mapper.setAutoAdjustSampleDistances(true);
    this.volume = vtk.VtkVolume.newInstance();
    this.volume.setMapper(this.mapper);
    this.property = this.volume.getProperty();
    this.property.setInterpolationTypeToLinear();
    this.property.setShade(false);
    this.property.setScalarOpacityUnitDistance?.(0, 1.8);
    this.property.setAmbient(0.35); this.property.setDiffuse(0.65); this.property.setSpecular(0.08); this.property.setSpecularPower(10);
    this.renderer.addVolume(this.volume);
    try {
      const axes = vtk.AxesActor.newInstance();
      this.marker = vtk.OrientationMarkerWidget.newInstance({ actor: axes, interactor: this.grw.getInteractor() });
      this.marker.setEnabled(true);
      this.marker.setViewportCorner(vtk.OrientationMarkerWidget.Corners?.BOTTOM_LEFT ?? 0);
      this.marker.setViewportSize(0.14);
    } catch { /* yönelim ikonu kozmetiktir */ }
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  resize(): void { if (this.grw) { this.grw.resize(); this.renderWindow.render(); } }

  setPreset(name: PresetName): void { this.preset = name; this.applyPreset(); }
  setOpacity(scale: number): void { this.opacityScale = scale; this.applyPreset(); }
  setBrightness(scale: number): void { this.brightness = scale; this.applyPreset(); }

  /**
   * Seçili renk ve opaklık transfer fonksiyonunu (Kemik/Diş, Diş Minesi, Yumuşak Doku,
   * MIP veya X-Ray) uygular. Klinik 'bone' ön ayarı MyDentViewer VR transfer eğrisini
   * birebir takip eder: yarı saydam kehribar-kahve çene kemiği içinden diş kökleri
   * altın-okre tonunda net seçilir, yoğun diş minesi (kuronlar) parlak beyaz görünür.
   */
  private applyPreset(): void {
    if (!this.grw) return;
    const { vtk, levels: L } = this;
    const ctf = vtk.ColorTF.newInstance(), otf = vtk.PiecewiseFunction.newInstance();
    const b = this.brightness, k = this.opacityScale;
    const rgb = (r: number, g: number, bl: number): [number, number, number] => [Math.min(1, r * b), Math.min(1, g * b), Math.min(1, bl * b)];
    const op = (x: number, a: number) => otf.addPoint(x, Math.min(1, a * k));
    const col = (x: number, c: [number, number, number]) => ctf.addRGBPoint(x, ...c);
    const c0 = Math.round(L.t0 * 0.757); // ~671 HU: koyu kızıl-kahve kemik başlangıcı
    const c1 = Math.round(L.t1 * 1.058); // ~1961 HU: altın-okre diş kökü / dentin
    this.mapper.setBlendModeToComposite();
    this.property.setScalarOpacityUnitDistance?.(0, 1.8);
    this.property.setUseGradientOpacity?.(0, false);
    if (this.preset === 'bone') {
      // MyDentViewer klinik VR transfer fonksiyonu:
      // -512 HU:(0,0,0) -> 671 HU:(0.60,0,0) -> 1961 HU:(0.86,0.67,0.30) -> 2893 HU:(1,1,1)
      // Opaklık: <=886 HU: 0.00 -> 1853 HU: 0.28 -> 3072 HU: 0.50
      col(L.soft, [0, 0, 0]);
      col(c0, rgb(0.60, 0.00, 0.00));
      col(c1, rgb(0.86, 0.67, 0.30));
      col(L.t2, rgb(1.00, 1.00, 1.00));
      col(L.max, rgb(1.00, 1.00, 1.00));
      op(L.soft, 0);
      op(L.t0, 0);
      op(L.t1, 0.28);
      op(L.max, 0.50);
    } else if (this.preset === 'tooth') {
      col(L.t0, [0, 0, 0]);
      col(L.t0 + 350, rgb(0.65, 0.25, 0.08));
      col(c1, rgb(0.90, 0.74, 0.42));
      col(L.t2, rgb(1.00, 1.00, 1.00));
      col(L.max, rgb(1.00, 1.00, 1.00));
      op(L.t0 + 220, 0);
      op(L.t1, 0.34);
      op(L.max, 0.72);
    } else if (this.preset === 'soft') {
      col(L.soft, [0, 0, 0]);
      col(-150, rgb(0.55, 0.28, 0.22));
      col(L.t0, rgb(0.75, 0.48, 0.32));
      col(c1, rgb(0.92, 0.80, 0.58));
      col(L.t2, rgb(1.00, 1.00, 1.00));
      op(L.soft, 0);
      op(-150, 0.015);
      op(L.t0, 0.08);
      op(L.t1, 0.32);
      op(L.max, 0.60);
    } else {
      col(L.soft, [0, 0, 0]);
      col(L.max, rgb(1, 1, 1));
      op(L.soft, 0);
      op(L.t0, 0.9);
      op(L.max, 1);
      if (this.preset === 'mip') this.mapper.setBlendModeToMaximumIntensity(); else this.mapper.setBlendModeToAverageIntensity();
    }
    this.property.setRGBTransferFunction(0, ctf);
    this.property.setScalarOpacity(0, otf);
    this.property.setShade(false);
    this.renderWindow.render();
  }

  /** Hacmi dental ark bölgesine kırpar (ark sınırlayıcı kutusu ± 15 mm düzlem içi, ± 45 mm dikey). */
  setClip(enabled: boolean): void { this.clip = enabled; this.applyClip(); }

  private applyClip(): void {
    if (!this.grw) return;
    this.mapper.removeAllClippingPlanes();
    if (this.clip && this.archPoints.length) {
      const xs = this.archPoints.map((p) => p[0]), ys = this.archPoints.map((p) => p[1]);
      const pad = 15, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
      const z0 = this.zMm - 45, z1 = this.zMm + 45;
      const planes: [number[], number[]][] = [
        [[x0, 0, 0], [1, 0, 0]], [[x1, 0, 0], [-1, 0, 0]], [[0, y0, 0], [0, 1, 0]], [[0, y1, 0], [0, -1, 0]], [[0, 0, z0], [0, 0, 1]], [[0, 0, z1], [0, 0, -1]],
      ];
      for (const [origin, normal] of planes) this.mapper.addClippingPlane(this.vtk.Plane.newInstance({ origin, normal }));
    }
    this.renderWindow.render();
  }

  /**
   * AI çene yüzeyi maskesini kaydeder. Performans için Marching Cubes poligon üretimi
   * yalnızca kullanıcı "AI çene yüzeyi" onay kutusunu açtığında (lazy) çalıştırılır.
   */
  setMask(mask: Uint8Array | undefined): void {
    this.pendingMask = mask;
    if (!this.grw) return;
    if (this.maskActor) { this.renderer.removeActor(this.maskActor); this.maskActor = undefined; }
    if (!mask || !this.lastVolume || !this.flags.surface) {
      this.renderWindow.render();
      return;
    }
    this.buildMaskSurface();
    this.renderWindow.render();
  }

  private buildMaskSurface(): void {
    const mask = this.pendingMask;
    const v = this.lastVolume;
    if (!this.grw || !mask || !v || this.maskActor) return;
    try {
      const { vtk } = this;
      const step = Math.max(2, Math.ceil(Math.max(v.nx, v.ny, v.nz) / 192));
      const nx = Math.ceil(v.nx / step), ny = Math.ceil(v.ny / step), nz = Math.ceil(v.nz / step);
      // Hacim sınırında yüzeyin kapanması için 1 voksel boşluk (padding) eklenir
      const px = nx + 2, py = ny + 2, pz = nz + 2, scalars = new Uint8Array(px * py * pz);
      for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++)
        scalars[(x + 1) + px * ((y + 1) + py * (z + 1))] = mask[x * step + v.nx * (y * step + v.ny * z * step)] ? 1 : 0;
      const image = vtk.ImageData.newInstance({ spacing: [v.sx * step, v.sy * step, v.sz * step], origin: [-v.sx * step, -v.sy * step, -v.sz * step] });
      image.setDimensions(px, py, pz);
      image.getPointData().setScalars(vtk.DataArray.newInstance({ values: scalars, numberOfComponents: 1 }));
      const marching = vtk.ImageMarchingCubes.newInstance({ contourValue: 0.5, computeNormals: true, mergePoints: true });
      marching.setInputData(image);
      const mapper = vtk.Mapper.newInstance({ scalarVisibility: false });
      mapper.setInputConnection(marching.getOutputPort());
      const actor = vtk.Actor.newInstance();
      actor.setMapper(mapper);
      actor.getProperty().setColor(0.25, 0.75, 0.85); actor.getProperty().setOpacity(0.35);
      actor.setVisibility(this.flags.surface);
      this.maskActor = actor; this.renderer.addActor(actor);
    } catch (error) { console.warn('AI surface could not be built', error); }
  }

  private linesActor(points: number[][], color: [number, number, number], width: number): Any {
    const { vtk } = this;
    const poly = vtk.PolyData.newInstance();
    poly.getPoints().setData(Float32Array.from(points.flat()), 3);
    poly.getLines().setData(Uint32Array.from([points.length, ...points.map((_, i) => i)]));
    const mapper = vtk.Mapper.newInstance(); mapper.setInputData(poly);
    const actor = vtk.Actor.newInstance(); actor.setMapper(mapper);
    actor.getProperty().setColor(...color); actor.getProperty().setLineWidth(width); actor.getProperty().setLighting(false);
    return actor;
  }

  private quadActor(origin: number[], p1: number[], p2: number[], color: [number, number, number], opacity: number): Any {
    const { vtk } = this;
    const source = vtk.PlaneSource.newInstance({ origin, point1: p1, point2: p2 });
    const mapper = vtk.Mapper.newInstance(); mapper.setInputConnection(source.getOutputPort());
    const actor = vtk.Actor.newInstance(); actor.setMapper(mapper);
    actor.getProperty().setColor(...color); actor.getProperty().setOpacity(opacity); actor.getProperty().setLighting(false);
    return actor;
  }

  /** Aksiyel seviyedeki ark eğrisini, çapraz kesit düzlemlerini ve aksiyel düzlemi günceller. */
  setGuides(arch: ArchResult | null, zMm: number, sections: { s: number; halfWidthMm: number }[], tracking = true): void {
    if (!this.grw || !this.lastVolume) return;
    const v = this.lastVolume;
    this.zMm = zMm;
    this.archPoints = arch ? arch.points.map((_, i) => panoramaPoint(arch, i, zMm / v.sz, tracking)) : [];
    for (const actor of [this.archActor, this.levelActor, ...this.planeActors]) if (actor) this.renderer.removeActor(actor);
    this.archActor = this.levelActor = undefined; this.planeActors = [];
    if (arch) {
      this.archActor = this.linesActor(this.archPoints.map((p) => [p[0], p[1], zMm]), [0.21, 0.88, 0.63], 3);
      this.archActor.setVisibility(this.flags.arch); this.renderer.addActor(this.archActor);
      const height = (v.nz - 1) * v.sz;
      for (const section of sections) {
        const f = archFrameAt(arch, section.s);
        const a = [f.p[0] - f.n[0] * section.halfWidthMm, f.p[1] - f.n[1] * section.halfWidthMm, 0];
        const b = [f.p[0] + f.n[0] * section.halfWidthMm, f.p[1] + f.n[1] * section.halfWidthMm, 0];
        const actor = this.quadActor(a, b, [a[0], a[1], height], [0.21, 0.88, 0.63], 0.3);
        actor.setVisibility(this.flags.planes); this.renderer.addActor(actor); this.planeActors.push(actor);
      }
      const level = this.quadActor([this.bounds[0], this.bounds[2], zMm], [this.bounds[1], this.bounds[2], zMm], [this.bounds[0], this.bounds[3], zMm], [1, 0.6, 0.24], 0.14);
      level.setVisibility(this.flags.level); this.renderer.addActor(level); this.levelActor = level;
    }
    this.applyClip();
  }

  /** 3B yardımcı katmanların (ark, kesit düzlemleri, aksiyel düzlem, AI yüzeyi) görünürlüğünü değiştirir. */
  setGuideVisibility(flags: Partial<typeof this.flags>): void {
    Object.assign(this.flags, flags);
    if (this.flags.surface && !this.maskActor && this.pendingMask) {
      this.buildMaskSurface();
    }
    this.archActor?.setVisibility(this.flags.arch);
    for (const actor of this.planeActors) actor.setVisibility(this.flags.planes);
    this.levelActor?.setVisibility(this.flags.level);
    this.maskActor?.setVisibility(this.flags.surface);
    this.renderWindow?.render();
  }

  /** Kamerayı altı anatomik yönden birine (A, P, R, L, H, F) hizalar ve çeneyi kadraja oturtur. */
  view(dir: ViewDir): void {
    if (!this.grw) return;
    const [cx, cy, cz] = this.center;
    const span = Math.max(this.bounds[1], this.bounds[3], this.bounds[5]) * 2.2 + 1;
    const table: Record<ViewDir, { pos: number[]; up: number[] }> = {
      A: { pos: [cx, cy - span, cz], up: [0, 0, 1] }, P: { pos: [cx, cy + span, cz], up: [0, 0, 1] },
      R: { pos: [cx - span, cy, cz], up: [0, 0, 1] }, L: { pos: [cx + span, cy, cz], up: [0, 0, 1] },
      H: { pos: [cx, cy, cz + span], up: [0, -1, 0] }, F: { pos: [cx, cy, cz - span], up: [0, -1, 0] },
    };
    const camera = this.renderer.getActiveCamera(), entry = table[dir];
    camera.setFocalPoint(cx, cy, cz); camera.setPosition(...entry.pos); camera.setViewUp(...entry.up);
    this.renderer.resetCamera();
    if (typeof camera.zoom === 'function') {
      camera.zoom(1.32);
    }
    this.renderer.resetCameraClippingRange();
    this.renderWindow.render();
  }

  resetCamera(): void { this.view('A'); }

  screenshot(): string {
    this.renderWindow.render();
    const canvas = this.container.querySelector('canvas');
    return canvas ? canvas.toDataURL('image/png') : '';
  }

  /** GPU kaynaklarını serbest bırakır (Sıfırla / yeni vaka). */
  dispose(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    try { this.marker?.setEnabled(false); this.marker?.delete(); } catch { /* ignore */ }
    this.volume?.delete(); this.mapper?.delete(); this.maskActor?.delete();
    this.archActor?.delete(); this.levelActor?.delete(); this.planeActors.forEach((a) => a.delete());
    this.grw?.delete();
    this.container.replaceChildren();
    this.grw = undefined;
  }
}
