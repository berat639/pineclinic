/**
 * Eğrisel Düzlemsel Rekonstrüksiyon (CPR) — CPU Panoramik ve Dik Kesit Hesaplayıcı (`src/cpr.ts`).
 *
 * Mimari Rolü:
 * - Diş arkı (`ArchResult`) boyunca her noktadaki birim normal (`n`) ve birim teğet (`t`)
 *   doğrultularında hacmi örnekleyerek panoramik (`renderPanorama`) ve 5'li dik kesit
 *   (`renderCrossAt`) görüntülerini üretir.
 * - Oklüzal düzlem yüksekliğini (`findOcclusalSlice`) ve ark eğrisinin kemik/diş kanıtıyla
 *   desteklenme oranını (`assessArchEvidence`) hesaplar.
 */
import type { ArchResult, Pt } from './arch/arch';
import { sample, type Volume } from './volume';
import { panoramaOffset } from './panoramaTracking';

/** `thicknessMm`: Panoramik focal trough veya dik kesit toplam dilim kalınlığı (mm). */
export interface Slab {
  thicknessMm: number;
  mode: 'mean' | 'max';
  trackMandible?: boolean;
}

/** Seçilen Z aralığındaki (`zMin..zMax`) kemik/maske voksellerinin 2B MIP koordinatlarını (mm) toplar. */
export function boneMipPoints(v: Volume, zMin: number, zMax: number, threshold = 500, step = 2): Pt[] {
  const pts: Pt[] = [];
  for (let y = 0; y < v.ny; y += step)
    for (let x = 0; x < v.nx; x += step) {
      let hit = false;
      for (let z = zMin; z <= zMax && !hit; z++) {
        const i = x + v.nx * (y + v.ny * z);
        hit = v.mask ? v.mask[i] > 0 : v.data[i] > threshold;
      }
      if (hit) pts.push([x * v.sx, y * v.sy]);
    }
  return pts;
}

export const TOOTH_HU = 1400;

/**
 * CBCT yoğunluk değerleri cihaza göre değişebildiği için, seçilen dilim aralığındaki
 * en yoğun %0.2'lik mine/kortikal kemik kuyruğundan dinamik diş eşiği tahmin eder.
 */
export function denseThreshold(v: Volume, zMin: number, zMax: number): number {
  const values: number[] = [];
  const stride = Math.max(1, Math.round(Math.max(v.nx, v.ny) / 180));
  for (let z = zMin; z <= zMax; z += Math.max(1, Math.round((zMax - zMin) / 10)))
    for (let y = 0; y < v.ny; y += stride)
      for (let x = 0; x < v.nx; x += stride) values.push(v.data[x + v.nx * (y + v.ny * z)]);
  if (values.length < 20) return TOOTH_HU;
  values.sort((a, b) => a - b);
  const q = values[Math.floor(values.length * 0.998)];
  return Math.max(700, q);
}

/** En fazla yoğun diş/mine vokseli içeren aksiyel Z kesitini (oklüzal düzlemi) bulur. */
export function findOcclusalSlice(v: Volume, minCount = 200): number {
  const sampleVals: number[] = [];
  const stride = Math.max(1, Math.round(Math.max(v.nx, v.ny, v.nz) / 120));
  for (let z = 0; z < v.nz; z += stride)
    for (let y = 0; y < v.ny; y += stride)
      for (let x = 0; x < v.nx; x += stride) sampleVals.push(v.data[x + v.nx * (y + v.ny * z)]);
  if (sampleVals.length < 20) return -1;
  sampleVals.sort((a, b) => a - b);
  const threshold = Math.max(700, sampleVals[Math.floor(sampleVals.length * 0.998)]);
  const per = v.nx * v.ny, cnt = new Float32Array(v.nz);
  for (let z = 0; z < v.nz; z++) {
    let c = 0;
    for (let i = z * per, e = i + per; i < e; i++) if (v.data[i] > threshold) c++;
    cnt[z] = c;
  }
  const r = Math.max(1, Math.round(2 / v.sz)); // ~2 mm dikey yumuşatma
  let best = -1, bestV = minCount;
  for (let z = 0; z < v.nz; z++) {
    let s = 0;
    for (let k = Math.max(0, z - r); k <= Math.min(v.nz - 1, z + r); k++) s += cnt[k];
    if (s > bestV) { bestV = s; best = z; }
  }
  return best;
}

/** Dilim içindeki yoğun (diş kuronu) voksellerinin 2B MIP koordinatlarını (mm) döndürür. */
export function toothMipPoints(v: Volume, zMin: number, zMax: number, step = 2, threshold = TOOTH_HU): Pt[] {
  const pts: Pt[] = [];
  for (let y = 0; y < v.ny; y += step)
    for (let x = 0; x < v.nx; x += step) {
      for (let z = zMin; z <= zMax; z++) {
        if (v.data[x + v.nx * (y + v.ny * z)] > threshold) { pts.push([x * v.sx, y * v.sy]); break; }
      }
    }
  return pts;
}

export interface ArchEvidenceAssessment {
  /** Eğri noktalarının `radiusMm` yarıçapı içinde kanıtla desteklenme oranı (`0..1`). */
  supportFraction: number;
  /** Kanıt bulunmayan en uzun kesintisiz boşluk uzunluğu (mm). */
  longestUnsupportedMm: number;
  maxDistanceMm: number;
}

/**
 * Üretilen ark eğrisinin gerçek diş/kemik kanıtlarıyla ne kadar desteklendiğini
 * 2B uzamsal ızgara (spatial hash) ile hızlıca denetler.
 */
export function assessArchEvidence(arch: ArchResult, evidence: Pt[], radiusMm = 3): ArchEvidenceAssessment {
  if (!evidence.length || arch.points.length < 2) return { supportFraction: 0, longestUnsupportedMm: Infinity, maxDistanceMm: Infinity };
  let supported = 0, run = 0, longestRun = 0, maxDistance = 0;
  const stepMm = arch.length / (arch.points.length - 1);
  const cell = Math.max(1e-6, radiusMm), grid = new Map<number, Pt[]>();
  const key = (cx: number, cy: number) => cx * 73856093 ^ cy * 19349663;
  for (const p of evidence) {
    const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell));
    const bucket = grid.get(k);
    if (bucket) bucket.push(p); else grid.set(k, [p]);
  }
  for (const curvePoint of arch.points) {
    const cx = Math.floor(curvePoint[0] / cell), cy = Math.floor(curvePoint[1] / cell);
    let nearest = Infinity;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(key(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const point of bucket) nearest = Math.min(nearest, Math.hypot(curvePoint[0] - point[0], curvePoint[1] - point[1]));
      }
    maxDistance = Math.max(maxDistance, Math.min(nearest, 2 * radiusMm));
    if (nearest <= radiusMm) { supported++; run = 0; }
    else { run++; longestRun = Math.max(longestRun, run); }
  }
  return {
    supportFraction: supported / arch.points.length,
    longestUnsupportedMm: longestRun * stepMm,
    maxDistanceMm: maxDistance,
  };
}

/**
 * Bir nokta (`p`) ve doğrultu (`n`) boyunca `slab.thicknessMm` kalınlığında ışın örneklemesi yapar.
 * `xrayWeighted = true` olduğunda panoramik focal trough içindeki hava boşluklarının (`-1000 HU`)
 * trabeküler kemiği ve diş köklerini silikleştirmesini önleyen doku-ağırlıklı X-ray ortalaması kullanılır.
 */
function slabSample(v: Volume, p: Pt, n: Pt, zVox: number, slab: Slab, offsetMm: number, maxSteps = Infinity, xrayWeighted = false): number {
  const halfMm = slab.thicknessMm / 2;
  const steps = Math.max(1, Math.min(maxSteps, Math.round(halfMm / Math.min(v.sx, v.sy))));
  let acc = slab.mode === 'max' ? -Infinity : 0, weightSum = 0;
  for (let s = -steps; s <= steps; s++) {
    const o = (s / steps) * halfMm + offsetMm;
    const val = sample(v, (p[0] + n[0] * o) / v.sx, (p[1] + n[1] * o) / v.sy, zVox);
    if (slab.mode === 'max') {
      acc = Math.max(acc, val);
    } else if (xrayWeighted) {
      const w = Math.max(0.05, Math.min(1.5, (val + 300) / 1500));
      acc += val * w;
      weightSum += w;
    } else {
      acc += val;
      weightSum += 1;
    }
  }
  return slab.mode === 'max' ? acc : acc / Math.max(weightSum, 1e-6);
}

/** CPU Panoramik Görüntü Üretici: Sütunlar = ark noktaları, Satırlar = Z yüksekliği (üst = en yüksek Z). */
export function renderPanorama(v: Volume, arch: ArchResult, slab: Slab, maxSteps = Infinity): { data: Float32Array; w: number; h: number } {
  const w = arch.points.length, h = v.nz;
  const data = new Float32Array(w * h);
  for (let i = 0; i < w; i++)
    for (let r = 0; r < h; r++)
      data[(h - 1 - r) * w + i] = slabSample(v, arch.points[i], arch.normals[i], r, slab, panoramaOffset(arch, i, r, slab.trackMandible), maxSteps, true);
  return { data, w, h };
}

export interface ArchFrame { p: Pt; n: Pt; t: Pt }

const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

/** Yay uzunluğu `sMm` konumundaki nokta (`p`), birim normal (`n`) ve birim teğet (`t`) çerçevesini döndürür. */
export function archFrameAt(arch: ArchResult, sMm: number): ArchFrame {
  const last = arch.points.length - 1;
  const f = Math.max(0, Math.min(last, (sMm / arch.length) * last));
  const i0 = Math.floor(f), i1 = Math.min(last, i0 + 1), u = f - i0;
  const mix = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  return {
    p: mix(arch.points[i0], arch.points[i1]),
    n: unit(mix(arch.normals[i0], arch.normals[i1])),
    t: unit(mix(arch.tangents[i0], arch.tangents[i1])),
  };
}

/** `i` indeksli ark noktasının başlangıçtan itibaren yay uzunluğunu (mm) döndürür. */
export const archS = (arch: ArchResult, i: number): number => (i / Math.max(1, arch.points.length - 1)) * arch.length;

/** `sMm` konumu için `spacingMm` adımlarına göre 1-tabanlı dik kesit numarasını hesaplar. */
export const sectionNumber = (sMm: number, spacingMm: number): number => Math.round(sMm / spacingMm) + 1;

function renderCrossFrame(v: Volume, frame: ArchFrame, halfWidthMm: number, thicknessMm: number, mode: 'mean' | 'max', maxSteps = Infinity): { data: Float32Array; w: number; h: number } {
  const w = Math.round((2 * halfWidthMm) / Math.min(v.sx, v.sy)), h = v.nz;
  const data = new Float32Array(w * h);
  const slab: Slab = { thicknessMm, mode };
  for (let c = 0; c < w; c++) {
    const off = -halfWidthMm + (c / (w - 1)) * 2 * halfWidthMm;
    const q: Pt = [frame.p[0] + frame.n[0] * off, frame.p[1] + frame.n[1] * off];
    for (let r = 0; r < h; r++) data[(h - 1 - r) * w + c] = slabSample(v, q, frame.t, r, slab, 0, maxSteps);
  }
  return { data, w, h };
}

/** Yay uzunluğu `sMm` konumundaki dik kesit (cross-section) görüntüsünü hesaplar. */
export function renderCrossAt(v: Volume, arch: ArchResult, sMm: number, halfWidthMm: number, thicknessMm: number, mode: 'mean' | 'max', maxSteps = Infinity): { data: Float32Array; w: number; h: number } {
  return renderCrossFrame(v, archFrameAt(arch, sMm), halfWidthMm, thicknessMm, mode, maxSteps);
}

/** `Float32Array` HU görüntüsünü seçilen pencere/seviye (`center`, `width`) ile 2B kanvasa çizer. */
export function toCanvas(canvas: HTMLCanvasElement, img: { data: Float32Array; w: number; h: number }, wl: { center: number; width: number }, yScale = 1) {
  if (canvas.width !== img.w || canvas.height !== img.h) { canvas.width = img.w; canvas.height = img.h; }
  canvas.dataset.yScale = String(yScale);
  const ctx = canvas.getContext('2d')!;
  const id = ctx.createImageData(img.w, img.h);
  const lo = wl.center - wl.width / 2, scale = 255 / wl.width;
  const px = new Uint32Array(id.data.buffer), src = img.data;
  for (let i = 0; i < src.length; i++) {
    const g = Math.max(0, Math.min(255, (src[i] - lo) * scale)) | 0;
    px[i] = 0xff000000 | (g << 16) | (g << 8) | g;
  }
  ctx.putImageData(id, 0, 0);
}
