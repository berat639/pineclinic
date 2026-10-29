/**
 * 3B CBCT Hacim Veri Yapısı, Tri-lineer Örnekleme ve DICOM Meta Çözümleyici (`src/volume.ts`).
 *
 * Mimari Rolü:
 * - Yerel servisten (`/api/datasets/{id}/volume`) gelen ham `Int16` voksel akışını tarayıcıda
 *   tek bir `Float32Array` dizisine dönüştürür.
 * - Yanıt başlığındaki (`X-Dicom-Meta`) Meyer, KaVo ve NewTom uyumlu hasta/cihaz bilgilerini
 *   çözümler ve `dayjs` kütüphanesi ile kademeli tarih/saat doğrulaması yapar.
 */
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/tr';
import type { Pt } from './arch/arch';

dayjs.extend(customParseFormat);
dayjs.locale('tr');

export type Vec3 = [number, number, number];

/** Hekim ve banko (desk) için ayrıştırılmış Meyer / KaVo / NewTom uyumlu DICOM meta bilgileri. */
export interface DicomMeta {
  patientName: string;
  patientId: string;
  birthDate: string;
  sex: string;
  studyDate: string;
  device: string;
  clinic: string;
  exposure: string;
  dose: string;
  fov: string;
  resolution: string;
}

export const EMPTY_DICOM_META: DicomMeta = {
  patientName: '—',
  patientId: '—',
  birthDate: '—',
  sex: '—',
  studyDate: '—',
  device: '—',
  clinic: '—',
  exposure: '—',
  dose: '—',
  fov: '—',
  resolution: '—',
};

/**
 * `dayjs` kullanarak ham veya kısmi tarih/saat dizgelerini kademeli formata dönüştürür:
 * - Sadece yıl varsa: `YYYY`
 * - Ay ve yıl varsa: `AA.YYYY`
 * - Gün, ay ve yıl varsa: `GG.AA.YYYY`
 * - Saat + gün, ay ve yıl varsa: `SS:DD · GG.AA.YYYY`
 */
export function formatDicomDateWithDayjs(rawDate?: string, rawTime?: string): string {
  const d = (rawDate ?? '').trim();
  if (!d || d === '—') return '—';
  // Backend tarafından zaten nokta/orta nokta ile formatlanmışsa (örn. "14.05.1982 (44 yaş)" veya "14:35 · 28.10.2026") koru
  if (/^\d{2}:\d{2}\s*·\s*\d{2}\.\d{2}\.\d{4}/.test(d) || /^\d{2}\.\d{2}\.\d{4}/.test(d) || /^\d{2}\.\d{4}$/.test(d) || /^\d{4}$/.test(d)) {
    return d;
  }

  let hhmm = '';
  const tDigits = (rawTime ?? '').split('.')[0].replace(/\D/g, '');
  if (tDigits.length >= 4) {
    const parsedTime = dayjs(tDigits.slice(0, 4), 'HHmm', true);
    if (parsedTime.isValid() && !tDigits.startsWith('000000')) {
      hhmm = parsedTime.format('HH:mm');
    }
  }

  const digits = d.replace(/\D/g, '');
  if (digits.length === 8) {
    const yyyy = digits.slice(0, 4);
    const mm = digits.slice(4, 6);
    const dd = digits.slice(6, 8);
    if (mm === '00') return yyyy;
    if (dd === '00') return `${mm}.${yyyy}`;
    const parsed = dayjs(digits, 'YYYYMMDD', true);
    if (parsed.isValid()) {
      const formatted = parsed.format('DD.MM.YYYY');
      return hhmm ? `${hhmm} · ${formatted}` : formatted;
    }
  } else if (digits.length === 6) {
    const parsed = dayjs(digits, 'YYYYMM', true);
    if (parsed.isValid()) return parsed.format('MM.YYYY');
  } else if (digits.length === 4) {
    const parsed = dayjs(digits, 'YYYY', true);
    if (parsed.isValid()) return parsed.format('YYYY');
  }

  const fallback = dayjs(d, ['YYYY-MM-DD', 'YYYY.MM.DD', 'DD.MM.YYYY', 'YYYY/MM/DD'], true);
  if (fallback.isValid()) {
    const formatted = fallback.format('DD.MM.YYYY');
    return hhmm ? `${hhmm} · ${formatted}` : formatted;
  }
  return d;
}

export interface Volume {
  /** Orijinal DICOM Hounsfield Unit (HU) değerleri, x ekseni en hızlı değişir (`x + nx * (y + ny * z)`). */
  data: Float32Array;
  nx: number; ny: number; nz: number;
  /** Voksel fiziksel boyutları (mm). */
  sx: number; sy: number; sz: number;
  /** SimpleITK tarafından korunan DICOM fiziksel başlangıç noktası. */
  origin: Vec3;
  /** 3x3 yönelim kosinüs matrisi. */
  direction: [number, number, number, number, number, number, number, number, number];
  datasetId?: string;
  /** İsteğe bağlı AI segmentasyon maskesi (`0..5` etiketleri, aynı voksel ızgarasında). */
  mask?: Uint8Array;
  maskSchema?: 'mandible-v1' | 'dental-segmentator-v1';
  /** Meyer / KaVo / NewTom uyumlu hasta ve cihaz meta verileri. */
  dicomMeta?: DicomMeta;
}

export const idx = (v: Volume, x: number, y: number, z: number) => x + v.nx * (y + v.ny * z);

/** Tarayıcı belleğinde tek bir `Float32Array` hacim kopyası ayırır. */
export function allocF32(n: number): Float32Array {
  return new Float32Array(n);
}

const identityDirection = (): Volume['direction'] => [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Base64 URL-güvenli kodlanmış `X-Dicom-Meta` başlığını çözümler. */
function decodeDicomMetaHeader(headerVal: string | null, nx: number, ny: number, nz: number, sx: number, sy: number, sz: number): DicomMeta {
  const fov = `${((nx * sx) / 10).toFixed(1)} × ${((ny * sy) / 10).toFixed(1)} × ${((nz * sz) / 10).toFixed(1)} cm`;
  const resolution = Math.abs(sx - sy) < 0.01 && Math.abs(sy - sz) < 0.01
    ? `${sx.toFixed(2)} mm voksel (${nx}×${ny}×${nz})`
    : `${sx.toFixed(2)}×${sy.toFixed(2)}×${sz.toFixed(2)} mm (${nx}×${ny}×${nz})`;
  const base: DicomMeta = { ...EMPTY_DICOM_META, fov, resolution };
  if (!headerVal) return base;
  try {
    const b64 = headerVal.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const binary = atob(b64 + pad);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes)) as Partial<DicomMeta>;
    return {
      patientName: parsed.patientName || '—',
      patientId: parsed.patientId || '—',
      birthDate: formatDicomDateWithDayjs(parsed.birthDate),
      sex: parsed.sex || '—',
      studyDate: formatDicomDateWithDayjs(parsed.studyDate),
      device: parsed.device || '—',
      clinic: parsed.clinic || '—',
      exposure: parsed.exposure || '—',
      dose: parsed.dose || '—',
      fov: parsed.fov || fov,
      resolution: parsed.resolution || resolution,
    };
  } catch {
    return base;
  }
}

/** Yerel API'den dönen ham `Int16` tamponunu ve SimpleITK geometri/meta başlıklarını `Volume` nesnesine dönüştürür. */
export function volumeFromResponse(response: Response, buffer: ArrayBuffer, datasetId?: string): Volume {
  const n = (name: string) => Number(response.headers.get(name));
  const list = (name: string, count: number): number[] =>
    (response.headers.get(name) ?? '').split(',').filter(Boolean).map(Number).slice(0, count);
  const origin = list('X-Origin', 3);
  const direction = list('X-Direction', 9);
  const nx = n('X-Nx'), ny = n('X-Ny'), nz = n('X-Nz');
  const sx = n('X-Sx'), sy = n('X-Sy'), sz = n('X-Sz');
  const raw = new Int16Array(buffer);
  const data = allocF32(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw[i];
  const dicomMeta = decodeDicomMetaHeader(response.headers.get('X-Dicom-Meta'), nx, ny, nz, sx, sy, sz);
  return {
    data, nx, ny, nz, sx, sy, sz,
    origin: (origin.length === 3 ? origin : [0, 0, 0]) as Vec3,
    direction: (direction.length === 9 ? direction : identityDirection()) as Volume['direction'],
    datasetId,
    dicomMeta,
  };
}

/** Voksel koordinatlarında `(x, y, z)` tri-lineer (3B doğrusal) HU örneklemesi yapar. Hacim dışında `-1000` (hava) döndürür. */
export function sample(v: Volume, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x > v.nx - 1 || y > v.ny - 1 || z > v.nz - 1) return -1000;
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const x1 = Math.min(x0 + 1, v.nx - 1), y1 = Math.min(y0 + 1, v.ny - 1), z1 = Math.min(z0 + 1, v.nz - 1);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const d = v.data;
  const c = (a: number, b: number, e: number) => d[a + v.nx * (b + v.ny * e)];
  const c00 = c(x0, y0, z0) * (1 - fx) + c(x1, y0, z0) * fx;
  const c10 = c(x0, y1, z0) * (1 - fx) + c(x1, y1, z0) * fx;
  const c01 = c(x0, y0, z1) * (1 - fx) + c(x1, y0, z1) * fx;
  const c11 = c(x0, y1, z1) * (1 - fx) + c(x1, y1, z1) * fx;
  return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
}

/** Demo ve birim testleri için sentetik alt çene fantomu üretir. */
export function makePhantom(): Volume {
  const nx = 180, ny = 180, nz = 90;
  const sx = 0.6, sy = 0.6, sz = 0.8;
  const data = allocF32(nx * ny * nz).fill(-1000);
  const curve: Pt[] = [];
  for (let x = -40; x <= 40; x += 0.5) curve.push([x, 0.025 * x * x - 12]);
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const mx = (x - nx / 2) * sx, my = (y - ny / 2) * sy;
        const e = (mx / 48) ** 2 + (my / 46) ** 2;
        let h = e < 1 ? 40 : -1000;
        if (e < 1 && z > 20 && z < 70) {
          let dmin = 1e9;
          for (const [cx, cy] of curve) dmin = Math.min(dmin, Math.hypot(mx - cx, my - cy));
          const zc = (z - 45) * sz;
          const gap = Math.abs(mx) < 7 && my < -8;
          const isTooth = z > 45 && !gap && dmin < 3.5;
          const bone = dmin < 6 && Math.abs(zc) < 12;
          if (isTooth) h = 1800;
          else if (bone) h = 900 + 300 * Math.cos(dmin);
        }
        data[x + nx * (y + ny * z)] = h + (Math.random() - 0.5) * 30;
      }
  return {
    data, nx, ny, nz, sx, sy, sz,
    origin: [0, 0, 0],
    direction: identityDirection(),
    dicomMeta: { ...EMPTY_DICOM_META, fov: '10.8 × 10.8 × 7.2 cm', resolution: '0.60×0.60×0.80 mm (180×180×90)' },
  };
}
